import mongoose from 'mongoose';
import Class from '../models/Class.js';
import Student from '../models/Student.js';
import Faculty from '../models/Faculty.js';
import Subject from '../models/Subject.js';
import NodueBatch from '../models/NodueBatch.js';
import NodueRequest from '../models/NodueRequest.js';
import NodueApproval from '../models/NodueApproval.js';
import ErrorResponse from '../utils/errorResponse.js';
import cache from '../config/cache.js';
import logger from '../utils/logger.js';
import { syncSubjectRemoval, syncSubjectUpdate, syncSubjectAddition } from '../utils/batchSync.js';
import { startSafeTransaction, commitSafeTransaction, abortSafeTransaction } from '../utils/safeTransaction.js';

// Cache invalidation is now handled via Mongoose hooks in the model.

// ── Scope helper — HoD auto-filters to own department ─────────────────────────
const deptScope = (req) =>
  req.user.role === 'hod' ? req.user.departmentId : null;

const ensureHodApprovalCoverage = async (batch, departmentId) => {
  if (!batch?._id || !departmentId) return;

  const hod = await Faculty.findOne({
    departmentId,
    roleTags: 'hod',
    isActive: true,
  }).select('_id name').lean();

  if (!hod) return;

  const requests = await NodueRequest.find({ batchId: batch._id })
    .select('_id studentId studentSnapshot facultySnapshot')
    .lean();

  if (!requests.length) return;

  const existing = await NodueApproval.find({
    batchId: batch._id,
    roleTag: 'hod',
  }).select('requestId').lean();

  const existingRequestIds = new Set(existing.map((row) => row.requestId?.toString()));
  const approvalDocs = [];
  const snapshotUpdates = [];

  for (const request of requests) {
    const hasSnapshotHod = Array.isArray(request.facultySnapshot)
      ? request.facultySnapshot.some((entry) => entry?.roleTag === 'hod')
      : !!request.facultySnapshot?.hod;

    if (!hasSnapshotHod) {
      snapshotUpdates.push(
        NodueRequest.updateOne(
          { _id: request._id },
          {
            $set: {
              'facultySnapshot.hod': {
                facultyId: hod._id,
                facultyName: hod.name,
                roleTag: 'hod',
                approvalType: 'hodApproval',
                subjectId: null,
                subjectName: 'Department Clearance (HoD)',
              },
            },
          }
        )
      );
    }

    if (existingRequestIds.has(request._id.toString())) continue;

    approvalDocs.push({
      requestId: request._id,
      batchId: batch._id,
      studentId: request.studentId,
      studentRollNo: request.studentSnapshot?.rollNo,
      studentName: request.studentSnapshot?.name,
      facultyId: hod._id,
      subjectId: null,
      subjectName: 'Department Clearance (HoD)',
      approvalType: 'hodApproval',
      roleTag: 'hod',
      action: 'pending',
    });
  }

  if (snapshotUpdates.length) {
    await Promise.all(snapshotUpdates);
  }

  if (approvalDocs.length) {
    await NodueApproval.insertMany(approvalDocs, { ordered: false });
  }
};

// ── GET /api/classes ──────────────────────────────────────────────────────────
export const getClasses = async (req, res, next) => {
  try {
    const { departmentId, semester, academicYear, page = 1, limit = 50, includeInactive } = req.query;
    const isPrivileged = ['admin', 'hod'].includes(req.user.role);

    const cacheKey = `classes:list:dept_${departmentId || 'all'}:${semester || 'all'}:${academicYear || 'all'}:${page}:${limit}:${includeInactive}`;
    const cachedData = cache.get(cacheKey);
    if (cachedData) return res.status(200).json({ success: true, ...cachedData });

    const query = {};
    if (includeInactive !== 'true' || !isPrivileged) {
      query.isActive = true;
    }
    const scopedDept = deptScope(req);
    if (scopedDept)    query.departmentId = scopedDept;
    else if (departmentId) query.departmentId = departmentId;

    if (semester)     query.semester     = Number(semester);
    if (academicYear) query.academicYear = academicYear;

    const skip = (Number(page) - 1) * Number(limit);
    const [classes, total] = await Promise.all([
      Class.find(query)
        .populate('departmentId', 'name')
        .populate('classTeacherId', 'name')
        .sort({ academicYear: -1, semester: 1, name: 1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Class.countDocuments(query),
    ]);

    // Active batch lookup (bulk)
    const classIds = classes.map((c) => c._id);
    const activeBatches = await NodueBatch.find(
      { classId: { $in: classIds }, status: 'active' },
      '_id classId'
    ).lean();
    const activeBatchMap = Object.fromEntries(
      activeBatches.map((b) => [b.classId.toString(), b._id.toString()])
    );

    const responseData = {
      data: classes.map((c) => ({
        _id:            c._id,
        name:           c.name,
        departmentId:   c.departmentId?._id,
        departmentName: c.departmentId?.name ?? null,
        semester:       c.semester,
        academicYear:   c.academicYear,
        classTeacher:   c.classTeacherId
          ? { _id: c.classTeacherId._id, name: c.classTeacherId.name }
          : null,
        studentCount:   c.studentIds?.length ?? 0,
        subjectCount:   c.subjectAssignments?.length ?? 0,
        hasActiveBatch: !!activeBatchMap[c._id.toString()],
        isActive:       c.isActive,
      })),
      pagination: {
        page: Number(page), limit: Number(limit), total,
        pages: Math.ceil(total / Number(limit)),
      },
    };

    cache.set(cacheKey, responseData, 30); // 30s cache for consistency in scaled environment
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    return res.status(200).json({ success: true, ...responseData });
  } catch (err) {
    next(err);
  }
};

export const createClass = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);
    const { name, departmentId, semester, academicYear, classTeacherId } = req.body;
    if (!name || !departmentId || !semester || !academicYear) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('name, departmentId, semester, academicYear required', 400, 'VALIDATION_ERROR'));
    }

    if (req.user.role === 'hod' && req.user.departmentId !== departmentId) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    const clsArray = await Class.create([{
      name, departmentId, semester, academicYear,
      classTeacherId: classTeacherId || null,
    }], { session });

    const cls = clsArray[0];

    await commitSafeTransaction(session);

    logger.info('class_created', {
      timestamp: new Date().toISOString(), actor: req.user.userId,
      action: 'CREATE_CLASS', resource_id: cls._id.toString(),
    });

    return res.status(201).json({
      success: true,
      data: {
        _id: cls._id, name: cls.name, departmentId: cls.departmentId,
        semester: cls.semester, academicYear: cls.academicYear,
        classTeacherId: cls.classTeacherId,
        subjectAssignments: [], studentIds: [], isActive: true, createdAt: cls.createdAt,
      },
    });
  } catch (err) {
    await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
};

// ── GET /api/classes/:id ──────────────────────────────────────────────────────
export const getClassById = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // 1. Context-aware cache key to prevent scope leakage between Admin/HoD
    const cacheKey = `class:${id}:role_${req.user.role}:dept_${req.user.departmentId || 'all'}`;
    const cached   = cache.get(cacheKey);
    
    if (cached) {
      logger.debug('class_cache_hit', { id, cacheKey });
      return res.status(200).json({ success: true, data: cached });
    }

    const cls = await Class.findOne({ _id: id, isActive: true })
      .populate('departmentId', 'name')
      .populate('classTeacherId', 'name email employeeId')
      .lean();

    if (!cls) {
      // If not found, ensure we clear any stale positive cache (unlikely but safe)
      cache.del(cacheKey);
      return next(new ErrorResponse('Class not found', 404, 'NOT_FOUND'));
    }

    // 2. Departmental security boundary
    if (req.user.role === 'hod' && cls.departmentId?._id?.toString() !== req.user.departmentId) {
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    const activeBatch = await NodueBatch.findOne(
      { classId: id, status: 'active' }, '_id'
    ).lean();

    if (activeBatch) {
      await ensureHodApprovalCoverage(activeBatch, cls.departmentId?._id ?? cls.departmentId);
    }

    // 2.5 Fetch Students directly by classId for 100% data integrity
    const students = await Student.find({ classId: id, isActive: true })
      .populate('mentorId', 'name')
      .sort({ rollNo: 1 })
      .lean();

    // 3. Robust Data Mapping with boundary checks
    const data = {
      _id:            cls._id,
      name:           cls.name,
      departmentId:   cls.departmentId?._id,
      departmentName: cls.departmentId?.name ?? null,
      semester:       cls.semester,
      academicYear:   cls.academicYear,
      classTeacher:   cls.classTeacherId
        ? { 
            _id: cls.classTeacherId._id, 
            name: cls.classTeacherId.name, 
            email: cls.classTeacherId.email, 
            employeeId: cls.classTeacherId.employeeId 
          }
        : null,
      subjectAssignments: (cls.subjectAssignments || []).map((a) => ({
        _id:         a?._id,
        subjectId:   a?.subjectId,
        subjectName: a?.subjectName,
        subjectCode: a?.subjectCode,
        isElective:  a?.isElective,
        faculty:     a?.facultyId
          ? { _id: a.facultyId, name: a.facultyName }
          : null,
      })),
      students: students.map(s => ({
        _id: s._id,
        rollNo: s.rollNo,
        name: s.name,
        email: s.email,
        mentorId: s.mentorId?._id?.toString() || (typeof s.mentorId === 'string' ? s.mentorId : s.mentorId?.toString()) || null,
        mentorName: s.mentorId?.name || (s.mentorId ? 'Assigned (No Name)' : 'Not Assigned'),
        electiveSubjects: s.electiveSubjects || [],
        status: s.isActive ? 'active' : 'inactive'
      })),
      studentCount:    students.length,
      hasActiveBatch:  !!activeBatch,
      activeBatchId:   activeBatch?._id ?? null,
      isActive:        cls.isActive,
      createdAt:       cls.createdAt,
    };

    cache.set(cacheKey, data, 30);
    logger.debug('class_cache_miss', { id, cacheKey });
    
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/classes/:id ────────────────────────────────────────────────────
export const updateClass = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);
    const { id } = req.params;
    const { name, academicYear, classTeacherId } = req.body;

    const cls = await Class.findOne({ _id: id, isActive: true }).session(session);
    if (!cls) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Class not found', 404, 'NOT_FOUND'));
    }

    if (req.user.role === 'hod' && cls.departmentId?.toString() !== req.user.departmentId) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    if (name)         cls.name         = name;
    if (academicYear) cls.academicYear = academicYear;
    
    if (classTeacherId !== undefined) {
      if (classTeacherId) {
        const teacher = await Faculty.findOne({ _id: classTeacherId, isActive: true }).session(session).lean();
        if (!teacher) {
          await abortSafeTransaction(session);
          return next(new ErrorResponse('Faculty not found', 404, 'NOT_FOUND'));
        }
      }
      cls.classTeacherId = classTeacherId || null;
    }

    await cls.save({ session });

    await commitSafeTransaction(session);

    return res.status(200).json({
      success: true,
      data: { _id: cls._id, name: cls.name, academicYear: cls.academicYear, classTeacherId: cls.classTeacherId },
    });
  } catch (err) {
    await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
};

// ── DELETE /api/classes/:id ───────────────────────────────────────────────────
export const deleteClass = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);
    const { id } = req.params;
    const cls = await Class.findOne({ _id: id, isActive: true }).session(session);
    if (!cls) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Class not found', 404, 'NOT_FOUND'));
    }

    if (req.user.role === 'hod' && cls.departmentId?.toString() !== req.user.departmentId) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    cls.isActive = false;
    await cls.save({ session });

    const activeBatch = await NodueBatch.findOne({ classId: id, status: 'active' }).session(session);
    if (activeBatch) {
        activeBatch.status = 'closed';
        await activeBatch.save({ session });
        logger.audit('SYNC_BATCH_CLOSED_ON_CLASS_DELETE', { classId: id, batchId: activeBatch._id });
    }

    await commitSafeTransaction(session);

    logger.info('class_deleted', {
      timestamp: new Date().toISOString(), actor: req.user.userId,
      action: 'DELETE_CLASS', resource_id: id,
    });

    return res.status(200).json({ success: true, data: { message: 'Class deleted successfully' } });
  } catch (err) {
    await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
};

// ── PATCH /api/classes/:id/class-teacher ──────────────────────────────────────
export const assignClassTeacher = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);
    const { id } = req.params;
    const { classTeacherId } = req.body;

    const [cls, teacher] = await Promise.all([
      Class.findOne({ _id: id, isActive: true }).session(session),
      classTeacherId ? Faculty.findOne({ _id: classTeacherId, isActive: true }).session(session).lean() : Promise.resolve(null),
    ]);

    if (!cls) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Class not found', 404, 'NOT_FOUND'));
    }
    if (classTeacherId && !teacher) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Faculty not found', 404, 'NOT_FOUND'));
    }

    if (req.user.role === 'hod' && cls.departmentId?.toString() !== req.user.departmentId) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    cls.classTeacherId = classTeacherId || null;
    await cls.save({ session });

    await commitSafeTransaction(session);

    return res.status(200).json({
      success: true,
      data: {
        classId: cls._id,
        classTeacher: teacher ? { _id: teacher._id, name: teacher.name, employeeId: teacher.employeeId } : null,
      },
    });
  } catch (err) {
    await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
};

// ── POST /api/classes/:id/subjects ────────────────────────────────────────────
export const addSubjectAssignment = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);
    const { id } = req.params;
    const { subjectId, facultyId, subjectCode } = req.body;
    if (!subjectId) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('subjectId is required', 400, 'VALIDATION_ERROR'));
    }

    const [cls, subject, faculty] = await Promise.all([
      Class.findOne({ _id: id, isActive: true }).session(session),
      Subject.findOne({ _id: subjectId, isActive: true }).session(session).lean(),
      facultyId ? Faculty.findOne({ _id: facultyId, isActive: true }).session(session).lean() : Promise.resolve(null),
    ]);

    if (!cls) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Class not found', 404, 'NOT_FOUND'));
    }
    if (!subject) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Subject not found', 404, 'NOT_FOUND'));
    }
    if (facultyId && !faculty) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Faculty not found', 404, 'NOT_FOUND'));
    }

    if (req.user.role === 'hod' && cls.departmentId?.toString() !== req.user.departmentId) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    const alreadyAssigned = cls.subjectAssignments.some(
      (a) => a.subjectId?.toString() === subjectId
    );
    if (alreadyAssigned) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Subject already assigned to this class', 409, 'DUPLICATE_KEY'));
    }

    const assignment = {
      subjectId:   subject._id,
      subjectName: subject.name,
      subjectCode: subjectCode || subject.code,
      isElective:  subject.isElective,
      facultyId:   faculty?._id ?? null,
      facultyName: faculty?.name ?? null,
    };

    cls.subjectAssignments.push(assignment);
    await cls.save({ session });

    await syncSubjectAddition(id, {
        subjectId: assignment.subjectId,
        subjectName: assignment.subjectName,
        subjectCode: assignment.subjectCode,
        facultyId: assignment.facultyId,
        facultyName: assignment.facultyName
    });

    await commitSafeTransaction(session);

    const saved = cls.subjectAssignments[cls.subjectAssignments.length - 1];

    return res.status(201).json({
      success: true,
      data: {
        assignmentId: saved._id,
        subjectId:    saved.subjectId,
        subjectName:  saved.subjectName,
        subjectCode:  saved.subjectCode,
        faculty:      faculty
          ? { _id: faculty._id, name: faculty.name, employeeId: faculty.employeeId }
          : null,
      },
    });
  } catch (err) {
    await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
};

// ── PATCH /api/classes/:id/subjects/:assignmentId ─────────────────────────────
export const updateSubjectAssignment = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);
    const { id, assignmentId } = req.params;
    const { facultyId, subjectCode } = req.body;

    const cls = await Class.findOne({ _id: id, isActive: true }).session(session);
    if (!cls) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Class not found', 404, 'NOT_FOUND'));
    }

    if (req.user.role === 'hod' && cls.departmentId?.toString() !== req.user.departmentId) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    const assignment = cls.subjectAssignments.id(assignmentId);
    if (!assignment) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Assignment not found', 404, 'NOT_FOUND'));
    }

    if (subjectCode !== undefined) assignment.subjectCode = subjectCode;

    let faculty = null;
    if (facultyId !== undefined) {
      if (facultyId) {
        faculty = await Faculty.findOne({ _id: facultyId, isActive: true }).session(session).lean();
        if (!faculty) {
          await abortSafeTransaction(session);
          return next(new ErrorResponse('Faculty not found', 404, 'NOT_FOUND'));
        }
        assignment.facultyId   = faculty._id;
        assignment.facultyName = faculty.name;
      } else {
        assignment.facultyId   = null;
        assignment.facultyName = null;
      }
    }

    await cls.save({ session });

    await syncSubjectUpdate(id, assignment.subjectId, {
      facultyId: assignment.facultyId,
      facultyName: assignment.facultyName,
      subjectCode: assignment.subjectCode
    });

    await commitSafeTransaction(session);

    return res.status(200).json({
      success: true,
      data: {
        assignmentId:  assignment._id,
        subjectId:     assignment.subjectId,
        subjectName:   assignment.subjectName,
        subjectCode:   assignment.subjectCode,
        faculty:       faculty
          ? { _id: faculty._id, name: faculty.name, employeeId: faculty.employeeId }
          : (assignment.facultyId ? { _id: assignment.facultyId, name: assignment.facultyName } : null),
      },
    });
  } catch (err) {
    await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
};

// ── DELETE /api/classes/:id/subjects/:assignmentId ────────────────────────────
export const removeSubjectAssignment = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);
    const { id, assignmentId } = req.params;

    const cls = await Class.findOne({ _id: id, isActive: true }).session(session);
    if (!cls) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Class not found', 404, 'NOT_FOUND'));
    }

    if (req.user.role === 'hod' && cls.departmentId?.toString() !== req.user.departmentId) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    const assignment = cls.subjectAssignments.id(assignmentId);
    if (!assignment) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Assignment not found', 404, 'NOT_FOUND'));
    }

    const subjectIdToSync = assignment.subjectId;
    assignment.deleteOne();
    await cls.save({ session });

    await syncSubjectRemoval(id, subjectIdToSync);

    await commitSafeTransaction(session);

    return res.status(200).json({ success: true, data: { message: 'Subject assignment removed' } });
  } catch (err) {
    await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
};

// ── POST /api/classes/:id/clone-subjects ──────────────────────────────────────
export const cloneSubjects = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);
    const { id } = req.params;
    const { sourceClassId } = req.body;

    if (!sourceClassId) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('sourceClassId is required', 400, 'VALIDATION_ERROR'));
    }

    const [cls, source] = await Promise.all([
      Class.findOne({ _id: id, isActive: true }).session(session),
      Class.findOne({ _id: sourceClassId, isActive: true }).session(session).lean(),
    ]);

    if (!cls) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Target class not found', 404, 'NOT_FOUND'));
    }
    if (!source) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Source class not found', 404, 'NOT_FOUND'));
    }
    
    if (req.user.role === 'hod') {
      if (cls.departmentId?.toString() !== req.user.departmentId || source.departmentId?.toString() !== req.user.departmentId) {
         await abortSafeTransaction(session);
         return next(new ErrorResponse('Access denied: cross-department cloning', 403, 'AUTH_DEPARTMENT_SCOPE'));
      }
    }

    if (id === sourceClassId) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Cannot clone from self', 400, 'VALIDATION_ERROR'));
    }

    const cloned = source.subjectAssignments.map((a) => ({
      subjectId:   a.subjectId,
      subjectName: a.subjectName,
      subjectCode: a.subjectCode,
      isElective:  a.isElective,
      facultyId:   null,
      facultyName: null,
    }));

    cls.subjectAssignments = cloned;
    await cls.save({ session });

    await commitSafeTransaction(session);

    logger.info('subjects_cloned', {
      timestamp: new Date().toISOString(), actor: req.user.userId,
      action: 'CLONE_SUBJECTS',
      resource_id: id, sourceClassId,
    });

    return res.status(200).json({
      success: true,
      data: {
        classId:      cls._id,
        clonedFrom:   sourceClassId,
        subjectsCloned: cloned.length,
        message:      `${cloned.length} subjects copied. Please assign faculty for each subject.`,
        subjectAssignments: cls.subjectAssignments.map((a) => ({
          assignmentId: a._id,
          subjectId:    a.subjectId,
          subjectName:  a.subjectName,
          subjectCode:  a.subjectCode,
          faculty:      null,
        })),
      },
    });
  } catch (err) {
    await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
};
