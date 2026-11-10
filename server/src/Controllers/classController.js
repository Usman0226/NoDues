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
import { syncSubjectRemoval, syncSubjectUpdate, syncSubjectAddition, bulkSyncClassTeacherUpdate } from '../utils/batchSync.js';
import { startSafeTransaction, commitSafeTransaction, abortSafeTransaction, getSessionOptions, executeSafeTransaction } from '../utils/safeTransaction.js';
import { invalidateEntityCache } from '../utils/cacheHooks.js';

// Cache invalidation is now handled via Mongoose hooks in the model.

// ── Scope helper — HoD auto-filters to own department ─────────────────────────
const deptScope = (req) => 
  (req.user.role === 'hod' || req.user.role === 'ao') ? req.user.departmentId : null;

const ensureHodApprovalCoverage = async (batch, departmentId) => {
  if (!batch?._id || !departmentId) return;

  const hod = await Faculty.findOne({
    departmentId,
    roleTags: { $in: ['hod', 'ao'] },
    isActive: true,
  }).select('_id name roleTags').lean();

  if (!hod) return;

  const requests = await NodueRequest.find({ batchId: batch._id })
    .select('_id studentId studentSnapshot facultySnapshot')
    .lean();

  if (!requests.length) return;

  const existing = await NodueApproval.find({
    batchId: batch._id,
    approvalType: 'hodApproval'
  }).select('requestId').lean();

  const existingRequestIds = new Set(existing.map(a => a.requestId.toString()));
  const snapshotUpdates = [];
  const approvalDocs = [];

  const isAO = hod.roleTags?.includes('ao');
  const roleTag = isAO ? 'ao' : 'hod';
  const subjectName = isAO ? 'Department Clearance (AO)' : 'Department Clearance (HoD)';

  for (const request of requests) {
    const hasSnapshotHod = Array.isArray(request.facultySnapshot)
      ? request.facultySnapshot.some((entry) => entry?.roleTag === 'hod' || entry?.roleTag === 'ao')
      : (!!request.facultySnapshot?.hod || !!request.facultySnapshot?.ao);

    if (!hasSnapshotHod) {
      snapshotUpdates.push(
        NodueRequest.updateOne(
          { _id: request._id },
          {
            $set: {
              [`facultySnapshot.${roleTag}`]: {
                facultyId: hod._id,
                facultyName: hod.name,
                roleTag: roleTag,
                approvalType: 'hodApproval',
                subjectId: null,
                subjectName: subjectName,
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
      subjectName: subjectName,
      approvalType: 'hodApproval',
      roleTag: roleTag,
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
    const isPrivileged = ['admin', 'hod', 'ao'].includes(req.user.role);

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

    if ((req.user.role === 'hod' || req.user.role === 'ao') && req.user.departmentId !== departmentId) {
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
    if ((req.user.role === 'hod' || req.user.role === 'ao') && cls.departmentId?._id?.toString() !== req.user.departmentId) {
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

    if ((req.user.role === 'hod' || req.user.role === 'ao') && cls.departmentId?.toString() !== req.user.departmentId) {
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

    // ✅ Sync AFTER commit
    const updatedTeacher = classTeacherId ? await Faculty.findById(classTeacherId).select('name').lean() : null;
    await bulkSyncClassTeacherUpdate(id, classTeacherId || null, updatedTeacher?.name || null);

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

    if ((req.user.role === 'hod' || req.user.role === 'ao') && cls.departmentId?.toString() !== req.user.departmentId) {
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

export const activateClass = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);
    const { id } = req.params;
    const cls = await Class.findById(id).session(session);
    if (!cls) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Class not found', 404, 'NOT_FOUND'));
    }

    if ((req.user.role === 'hod' || req.user.role === 'ao') && cls.departmentId?.toString() !== req.user.departmentId) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    cls.isActive = true;
    await cls.save({ session });

    await commitSafeTransaction(session);

    logger.info('class_activated', {
      timestamp: new Date().toISOString(), actor: req.user.userId,
      action: 'ACTIVATE_CLASS', resource_id: id,
    });

    return res.status(200).json({ success: true, data: cls });
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

    if ((req.user.role === 'hod' || req.user.role === 'ao') && cls.departmentId?.toString() !== req.user.departmentId) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    cls.classTeacherId = classTeacherId || null;
    await cls.save({ session });

    await commitSafeTransaction(session);

    // ✅ Sync AFTER commit
    await bulkSyncClassTeacherUpdate(id, classTeacherId || null, teacher?.name || null);

    // Invalidate faculty cache so their 'class count' updates
    if (classTeacherId) invalidateEntityCache('faculty', classTeacherId);

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

    if ((req.user.role === 'hod' || req.user.role === 'ao') && cls.departmentId?.toString() !== req.user.departmentId) {
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

    await commitSafeTransaction(session);

    // ✅ Sync AFTER commit
    await syncSubjectAddition(id, {
        subjectId: assignment.subjectId,
        subjectName: assignment.subjectName,
        subjectCode: assignment.subjectCode,
        facultyId: assignment.facultyId,
        facultyName: assignment.facultyName
    });

    // Invalidate faculty cache so their 'subject assignment count' updates in faculty lists
    if (facultyId) invalidateEntityCache('faculty', facultyId);

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

    if ((req.user.role === 'hod' || req.user.role === 'ao') && cls.departmentId?.toString() !== req.user.departmentId) {
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

    await commitSafeTransaction(session);

    // ✅ Sync AFTER commit
    await syncSubjectUpdate(id, assignment.subjectId, {
      facultyId: assignment.facultyId,
      facultyName: assignment.facultyName,
      subjectCode: assignment.subjectCode
    });

    // Invalidate faculty cache for the newly assigned faculty
    if (facultyId) invalidateEntityCache('faculty', facultyId);

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

    if ((req.user.role === 'hod' || req.user.role === 'ao') && cls.departmentId?.toString() !== req.user.departmentId) {
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

    await commitSafeTransaction(session);

    // ✅ Sync AFTER commit
    await syncSubjectRemoval(id, subjectIdToSync);

    // Invalidate faculty cache if a faculty was assigned to this removed subject
    if (assignment.facultyId) {
      invalidateEntityCache('faculty', assignment.facultyId);
    }

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
    
    if (req.user.role === 'hod' || req.user.role === 'ao') {
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

// ── GET /api/classes/cohort-promotion-preview ────────────────────────────────
export const getCohortPromotionPreview = async (req, res, next) => {
  try {
    const { departmentId, semester, targetSemester } = req.query;
    const scopedDept = deptScope(req);
    let targetDeptId = scopedDept || departmentId;

    if (!semester) {
      return next(new ErrorResponse('Semester is required', 400, 'VAL_001'));
    }

    const numSemester = Number(semester);
    const numTargetSemester = targetSemester ? Number(targetSemester) : numSemester + 1;

    // If targetDeptId is not explicitly provided and user is admin, auto-resolve from active classes in this semester
    if (!targetDeptId) {
      const sampleClass = await Class.findOne({
        semester: numSemester,
        isActive: { $ne: false },
      }).select('departmentId').lean();

      if (sampleClass?.departmentId) {
        targetDeptId = (sampleClass.departmentId?._id || sampleClass.departmentId).toString();
      }
    }

    if (!targetDeptId) {
      return next(new ErrorResponse('Department ID is required', 400, 'VAL_001'));
    }

    // 1. Fetch source classes in the given semester
    const sourceClasses = await Class.find({
      departmentId: targetDeptId,
      semester: numSemester,
      isActive: { $ne: false },
    })
      .populate('departmentId', 'name')
      .sort({ name: 1 })
      .lean();

    if (!sourceClasses.length) {
      return res.status(200).json({
        success: true,
        data: {
          departmentId: targetDeptId,
          semester: numSemester,
          targetSemester: numTargetSemester,
          classes: [],
          candidateTargetClasses: [],
          missingTargetSections: [],
          message: `No active classes found in semester ${numSemester}`,
        },
      });
    }

    // 2. Fetch candidate target classes (scoped to targetSemester when specified, or strictly >= numSemester + 1)
    const sourceClassIds = sourceClasses.map(c => c._id);
    const targetQuery = {
      departmentId: targetDeptId,
      _id: { $nin: sourceClassIds },
      isActive: { $ne: false },
    };

    if (targetSemester) {
      targetQuery.semester = numTargetSemester;
    } else {
      // Default strictly to next semester or higher
      targetQuery.semester = { $gte: numSemester + 1 };
    }

    const targetClasses = await Class.find(targetQuery)
      .select('_id name semester academicYear studentIds')
      .sort({ semester: 1, name: 1 })
      .lean();

    // Compute sections missing in target semester
    const missingTargetSections = sourceClasses
      .filter((sc) => {
        const cleanSourceName = (sc.name || '').replace(/^(I|II|III|IV)\s+/i, '').trim().toLowerCase();
        return !targetClasses.some((tc) => {
          const cleanTargetName = (tc.name || '').replace(/^(I|II|III|IV)\s+/i, '').trim().toLowerCase();
          return cleanSourceName === cleanTargetName;
        });
      })
      .map((sc) => sc.name);

    // 3. For each source class, check active batch and count active students
    const activeBatches = await NodueBatch.find({
      classId: { $in: sourceClassIds },
      status: 'active',
    }).select('classId').lean();

    const activeBatchMap = new Set(activeBatches.map(b => b.classId.toString()));

    const classPreviews = await Promise.all(
      sourceClasses.map(async (cls) => {
        const studentCount = await Student.countDocuments({
          $or: [
            { classId: cls._id },
            { _id: { $in: cls.studentIds || [] } },
          ],
          isActive: { $ne: false },
        });

        // Auto-recommend target class:
        // Priority 1: Match section letter/name with higher semester (e.g. III CSD A -> IV CSD A)
        const cleanSourceName = (cls.name || '').replace(/^(I|II|III|IV)\s+/i, '').trim().toLowerCase();
        let recommendedTargetId = null;

        for (const tc of targetClasses) {
          const cleanTargetName = (tc.name || '').replace(/^(I|II|III|IV)\s+/i, '').trim().toLowerCase();
          if (cleanSourceName === cleanTargetName && tc.semester > cls.semester) {
            recommendedTargetId = tc._id;
            break;
          }
        }

        // Priority 2: Same section name/letter regardless of semester
        if (!recommendedTargetId) {
          for (const tc of targetClasses) {
            const cleanTargetName = (tc.name || '').replace(/^(I|II|III|IV)\s+/i, '').trim().toLowerCase();
            if (cleanSourceName === cleanTargetName) {
              recommendedTargetId = tc._id;
              break;
            }
          }
        }

        // Priority 3: First available higher semester class
        if (!recommendedTargetId && targetClasses.length > 0) {
          const higher = targetClasses.filter(c => c.semester > cls.semester);
          if (higher.length > 0) recommendedTargetId = higher[0]._id;
        }

        return {
          sourceClass: {
            _id: cls._id,
            name: cls.name,
            semester: cls.semester,
            academicYear: cls.academicYear,
            studentCount,
            hasActiveBatch: activeBatchMap.has(cls._id.toString()),
          },
          recommendedTargetClassId: recommendedTargetId,
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: {
        departmentId: targetDeptId,
        semester: numSemester,
        targetSemester: numTargetSemester,
        missingTargetSections,
        classes: classPreviews,
        candidateTargetClasses: targetClasses.map(tc => ({
          _id: tc._id,
          name: tc.name,
          semester: tc.semester,
          academicYear: tc.academicYear,
          currentStudentCount: tc.studentIds?.length || 0,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/classes/bulk-promote ───────────────────────────────────────────
export const bulkPromoteClasses = async (req, res, next) => {
  try {
    const { promotions, resetElectives = true, resetFaculty = true } = req.body;

    if (!Array.isArray(promotions) || promotions.length === 0) {
      return next(new ErrorResponse('Promotions list is required and cannot be empty', 400, 'VAL_001'));
    }

    const sourceClassIds = promotions.map(p => p.sourceClassId);
    const targetClassIds = promotions.map(p => p.targetClassId);

    // 1. Guard against any active batch across all source classes (outside transaction)
    const activeBatches = await NodueBatch.find({
      classId: { $in: sourceClassIds },
      status: 'active',
    }).select('classId').lean();

    if (activeBatches.length > 0) {
      return next(new ErrorResponse('Cannot promote classes while clearance batches are active. Please complete or close active batches before proceeding.', 400, 'VAL_002'));
    }

    // 2. Fetch all classes (outside transaction)
    const allClasses = await Class.find({
      _id: { $in: [...new Set([...sourceClassIds, ...targetClassIds])] },
    }).lean();

    const classMap = new Map(allClasses.map(c => [c._id.toString(), c]));

    // Check permissions and existence
    for (const p of promotions) {
      const src = classMap.get(p.sourceClassId?.toString());
      const tgt = classMap.get(p.targetClassId?.toString());

      if (!src || !tgt) {
        return next(new ErrorResponse('One or more source or target classes were not found', 404, 'NOT_FOUND'));
      }

      if (req.user.role === 'hod' || req.user.role === 'ao') {
        const userDept = req.user.departmentId?.toString();
        const srcDept = (src.departmentId?._id || src.departmentId)?.toString();
        const tgtDept = (tgt.departmentId?._id || tgt.departmentId)?.toString();
        if (srcDept !== userDept || tgtDept !== userDept) {
          return next(new ErrorResponse('Access denied for this department scope', 403, 'AUTH_DEPARTMENT_SCOPE'));
        }
      }
    }

    // 3. Pre-fetch students to move for each promotion pair
    const plannedPromotions = [];
    for (const p of promotions) {
      const src = classMap.get(p.sourceClassId.toString());
      const tgt = classMap.get(p.targetClassId.toString());

      const studentQuery = {
        $or: [
          { classId: src._id },
          { _id: { $in: src.studentIds || [] } },
        ],
        isActive: { $ne: false },
      };

      if (Array.isArray(p.studentIds) && p.studentIds.length > 0) {
        studentQuery._id = { $in: p.studentIds };
      }

      const students = await Student.find(studentQuery).select('_id').lean();
      const studentIdsToMove = students.map(s => s._id);

      plannedPromotions.push({
        src,
        tgt,
        studentIdsToMove,
      });
    }

    // 4. Execute atomic/safe writes
    let totalPromotedStudents = 0;
    const promotionResults = [];

    await executeSafeTransaction(async (session, opt) => {
      for (const item of plannedPromotions) {
        const { src, tgt, studentIdsToMove } = item;

        if (studentIdsToMove.length > 0) {
          await Class.findByIdAndUpdate(src._id, { $pullAll: { studentIds: studentIdsToMove } }, opt);
          await Class.findByIdAndUpdate(tgt._id, { $addToSet: { studentIds: { $each: studentIdsToMove } } }, opt);

          const shouldResetElectives = typeof item.resetElectives === 'boolean' ? item.resetElectives : resetElectives;
          const shouldResetFaculty = typeof item.resetFaculty === 'boolean' ? item.resetFaculty : resetFaculty;

          const updateData = {
            classId: tgt._id,
            departmentId: tgt.departmentId,
            semester: tgt.semester,
            currentSemester: tgt.semester,
            academicYear: tgt.academicYear,
            yearOfStudy: Math.ceil(tgt.semester / 2),
          };

          if (shouldResetFaculty) {
            updateData.mentorId = null;
          }

          if (shouldResetElectives) {
            updateData.electiveSubjects = [];
          }

          await Student.updateMany(
            { _id: { $in: studentIdsToMove } },
            { $set: updateData },
            opt
          );

          totalPromotedStudents += studentIdsToMove.length;
        }

        promotionResults.push({
          sourceClassId: src._id,
          sourceClassName: src.name,
          targetClassId: tgt._id,
          targetClassName: tgt.name,
          promotedCount: studentIdsToMove.length,
        });
      }
    });

    // 5. Invalidate caches
    for (const p of promotions) {
      invalidateEntityCache('class', p.sourceClassId);
      invalidateEntityCache('class', p.targetClassId);
    }
    cache.del('students:list:*');

    logger.info('bulk_classes_promoted', {
      timestamp: new Date().toISOString(),
      action: 'BULK_PROMOTE_COHORT',
      actor: req.user.userId,
      totalClasses: promotions.length,
      totalPromotedStudents,
    });

    return res.status(200).json({
      success: true,
      message: `Successfully promoted ${totalPromotedStudents} students across ${promotions.length} classes`,
      data: {
        totalClasses: promotions.length,
        totalPromotedStudents,
        results: promotionResults,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/classes/:id/promotion-candidates ─────────────────────────────────
export const getPromotionCandidates = async (req, res, next) => {
  try {
    const { id } = req.params;
    const sourceClass = await Class.findById(id)
      .populate('departmentId', 'name')
      .lean();

    if (!sourceClass) {
      return next(new ErrorResponse('Source class not found', 404, 'NOT_FOUND'));
    }

    if ((req.user.role === 'hod' || req.user.role === 'ao') && sourceClass.departmentId?._id?.toString() !== req.user.departmentId) {
      return next(new ErrorResponse('Access denied for this department', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    const deptId = sourceClass.departmentId?._id || sourceClass.departmentId;

    const [activeBatch, students, targetClasses] = await Promise.all([
      NodueBatch.findOne({ classId: id, status: 'active' }).select('_id status').lean(),
      Student.find({
        $or: [
          { classId: id },
          { _id: { $in: sourceClass.studentIds || [] } },
        ],
        isActive: { $ne: false },
      })
        .select('_id rollNo name email semester currentSemester')
        .sort({ rollNo: 1 })
        .lean(),
      Class.find({
        departmentId: deptId,
        _id: { $ne: sourceClass._id },
        isActive: { $ne: false },
      })
        .select('_id name semester academicYear studentIds')
        .sort({ semester: 1, name: 1 })
        .lean(),
    ]);

    // Recommend target class with the same section name but higher semester
    let recommendedTarget = null;
    const cleanSourceSection = (sourceClass.name || '').replace(/^(I|II|III|IV)\s+/i, '').trim().toLowerCase();
    
    for (const tc of targetClasses) {
      const cleanTargetSection = (tc.name || '').replace(/^(I|II|III|IV)\s+/i, '').trim().toLowerCase();
      if (cleanSourceSection === cleanTargetSection && tc.semester > sourceClass.semester) {
        recommendedTarget = tc._id;
        break;
      }
    }

    // Fallback recommendation: any class in same department with semester = sourceClass.semester + 2 or + 1
    if (!recommendedTarget && targetClasses.length > 0) {
      const higher = targetClasses.filter(c => c.semester > sourceClass.semester);
      if (higher.length > 0) recommendedTarget = higher[0]._id;
    }

    return res.status(200).json({
      success: true,
      data: {
        sourceClass: {
          _id: sourceClass._id,
          name: sourceClass.name,
          semester: sourceClass.semester,
          academicYear: sourceClass.academicYear,
          departmentName: sourceClass.departmentId?.name || null,
          totalStudents: students.length,
          hasActiveBatch: Boolean(activeBatch),
        },
        students: students.map(s => ({
          _id: s._id,
          rollNo: s.rollNo,
          name: s.name,
          email: s.email,
        })),
        targetClasses: targetClasses.map(tc => ({
          _id: tc._id,
          name: tc.name,
          semester: tc.semester,
          academicYear: tc.academicYear,
          currentStudentCount: tc.studentIds?.length || 0,
        })),
        recommendedTargetClassId: recommendedTarget,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/classes/:id/promote ─────────────────────────────────────────────
export const promoteStudents = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { targetClassId, studentIds, resetElectives = true, resetFaculty = true } = req.body;

    if (!targetClassId) {
      return next(new ErrorResponse('Target class ID is required', 400, 'VAL_001'));
    }

    if (id.toString() === targetClassId.toString()) {
      return next(new ErrorResponse('Source and target classes cannot be the same', 400, 'VAL_001'));
    }

    // 1. Validation reads (outside transaction, zero racing)
    const [sourceClass, targetClass, activeSourceBatch] = await Promise.all([
      Class.findById(id).lean(),
      Class.findById(targetClassId).lean(),
      NodueBatch.findOne({ classId: id, status: 'active' }).select('_id status').lean(),
    ]);

    if (!sourceClass || !sourceClass.isActive) {
      return next(new ErrorResponse('Source class not found or inactive', 404, 'NOT_FOUND'));
    }

    if (!targetClass || !targetClass.isActive) {
      return next(new ErrorResponse('Target class not found or inactive', 404, 'NOT_FOUND'));
    }

    // Role department scope
    if (req.user.role === 'hod' || req.user.role === 'ao') {
      const userDept = req.user.departmentId?.toString();
      const srcDept = (sourceClass.departmentId?._id || sourceClass.departmentId)?.toString();
      const tgtDept = (targetClass.departmentId?._id || targetClass.departmentId)?.toString();
      if (srcDept !== userDept || tgtDept !== userDept) {
        return next(new ErrorResponse('Access denied for this department scope', 403, 'AUTH_DEPARTMENT_SCOPE'));
      }
    }

    // Disturbance Prevention: Cannot promote while source class has an active in-flight batch
    if (activeSourceBatch) {
      return next(new ErrorResponse('Cannot promote students while a clearance batch is active for this class. Complete or close the active batch first.', 400, 'VAL_002'));
    }

    // Determine students to promote
    const query = {
      $or: [{ classId: id }, { _id: { $in: sourceClass.studentIds || [] } }],
      isActive: { $ne: false },
    };
    if (Array.isArray(studentIds) && studentIds.length > 0) {
      query._id = { $in: studentIds };
    }

    const studentsToPromote = await Student.find(query).select('_id').lean();
    if (!studentsToPromote.length) {
      return next(new ErrorResponse('No active students selected or eligible for promotion in this class', 400, 'VAL_002'));
    }

    const actualStudentIds = studentsToPromote.map(s => s._id);

    // 2. Execute atomic/safe writes
    await executeSafeTransaction(async (session, opt) => {
      // Step A: Remove from source class
      await Class.findByIdAndUpdate(
        id,
        { $pullAll: { studentIds: actualStudentIds } },
        opt
      );

      // Step B: Add to target class
      await Class.findByIdAndUpdate(
        targetClassId,
        { $addToSet: { studentIds: { $each: actualStudentIds } } },
        opt
      );

      // Step C: Update student records
      const studentUpdatePayload = {
        classId: targetClass._id,
        departmentId: targetClass.departmentId,
        semester: targetClass.semester,
        currentSemester: targetClass.semester,
        academicYear: targetClass.academicYear,
        yearOfStudy: Math.ceil(targetClass.semester / 2),
      };

      if (resetFaculty !== false) {
        studentUpdatePayload.mentorId = null;
      }

      if (resetElectives !== false) {
        studentUpdatePayload.electiveSubjects = [];
      }

      await Student.updateMany(
        { _id: { $in: actualStudentIds } },
        { $set: studentUpdatePayload },
        opt
      );
    });

    // 3. Invalidate caches
    invalidateEntityCache('class', id, sourceClass.departmentId);
    invalidateEntityCache('class', targetClassId, targetClass.departmentId);
    actualStudentIds.forEach(sid => invalidateEntityCache('student', sid));
    cache.del('students:list:*');

    logger.info('students_promoted', {
      timestamp: new Date().toISOString(),
      actor: req.user.userId,
      action: 'PROMOTE_STUDENTS',
      resource_id: id,
      details: {
        sourceClassId: id,
        sourceClassName: sourceClass.name,
        targetClassId,
        targetClassName: targetClass.name,
        targetSemester: targetClass.semester,
        promotedCount: actualStudentIds.length,
        resetElectives: Boolean(resetElectives),
        resetFaculty: Boolean(resetFaculty),
      },
    });

    return res.status(200).json({
      success: true,
      message: `Successfully promoted ${actualStudentIds.length} students from ${sourceClass.name} to ${targetClass.name}.`,
      data: {
        promotedCount: actualStudentIds.length,
        sourceClassId: id,
        sourceClassName: sourceClass.name,
        targetClassId,
        targetClassName: targetClass.name,
        targetSemester: targetClass.semester,
        targetAcademicYear: targetClass.academicYear,
      },
    });
  } catch (err) {
    next(err);
  }
};
