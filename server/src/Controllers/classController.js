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
import { syncSubjectRemoval, bulkSyncSubjectRemoval, syncSubjectUpdate, syncSubjectAddition, bulkSyncClassTeacherUpdate } from '../utils/batchSync.js';
import { startSafeTransaction, commitSafeTransaction, abortSafeTransaction, getSessionOptions, executeSafeTransaction } from '../utils/safeTransaction.js';
import { invalidateEntityCache } from '../utils/cacheHooks.js';
import { findActiveMatchingClass, withClassLock, buildClassLockKey } from '../utils/classIdentity.js';

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
        isMaster:       c.isMaster || false,
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
  const { name, departmentId, semester, academicYear, classTeacherId } = req.body;
  if (!name || !departmentId || !semester || !academicYear) {
    return next(new ErrorResponse('name, departmentId, semester, academicYear required', 400, 'VALIDATION_ERROR'));
  }

  if ((req.user.role === 'hod' || req.user.role === 'ao') && req.user.departmentId !== departmentId) {
    return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
  }

  const lockKey = buildClassLockKey({ departmentId, semester, name });

  return withClassLock(lockKey, async () => {
    const session = await mongoose.startSession();
    try {
      await startSafeTransaction(session);

      const duplicate = await findActiveMatchingClass({
        name,
        semester,
        departmentId,
        session,
      });
      if (duplicate) {
        await abortSafeTransaction(session);
        return next(
          new ErrorResponse(
            `Section "${duplicate.name}" for Semester ${semester} already exists in this department.`,
            409,
            'DB_003'
          )
        );
      }

      // Auto-inherit cohort syllabus: if any peer class in the same department and semester has subjects, inherit them
      const peerWithSubjects = await Class.findOne({
        departmentId,
        semester: Number(semester),
        isActive: true,
        'subjectAssignments.0': { $exists: true },
      }).session(session).lean();

      const inheritedSubjects = (peerWithSubjects?.subjectAssignments || []).map(sa => ({
        subjectId: sa.subjectId,
        subjectName: sa.subjectName,
        subjectCode: sa.subjectCode,
        isElective: sa.isElective || false,
        facultyId: null,
        facultyName: null,
      }));

      const clsArray = await Class.create([{
        name: name.trim(), departmentId, semester: Number(semester), academicYear,
        classTeacherId: classTeacherId || null,
        subjectAssignments: inheritedSubjects,
        studentIds: [],
      }], { session });

      const cls = clsArray[0];

      await commitSafeTransaction(session);

      logger.info('class_created', {
        timestamp: new Date().toISOString(), actor: req.user.userId,
        action: 'CREATE_CLASS', resource_id: cls._id.toString(),
        inheritedSubjectCount: inheritedSubjects.length,
      });

      return res.status(201).json({
        success: true,
        data: {
          _id: cls._id, name: cls.name, departmentId: cls.departmentId,
          semester: cls.semester, academicYear: cls.academicYear,
          classTeacherId: cls.classTeacherId,
          subjectAssignments: cls.subjectAssignments || [], studentIds: [], isActive: true, createdAt: cls.createdAt,
        },
      });
    } catch (err) {
      await abortSafeTransaction(session);
      next(err);
    } finally {
      session.endSession();
    }
  });
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

    // 2.7 Auto-inherit cohort curriculum if this class has no subjects assigned yet
    if (!cls.subjectAssignments || cls.subjectAssignments.length === 0) {
      const peerWithSubjects = await Class.findOne({
        departmentId: cls.departmentId?._id || cls.departmentId,
        semester: cls.semester,
        _id: { $ne: cls._id },
        isActive: true,
        'subjectAssignments.0': { $exists: true },
      }).lean();

      if (peerWithSubjects && peerWithSubjects.subjectAssignments?.length > 0) {
        const inherited = peerWithSubjects.subjectAssignments.map(sa => ({
          subjectId: sa.subjectId,
          subjectName: sa.subjectName,
          subjectCode: sa.subjectCode,
          isElective: sa.isElective || false,
          facultyId: null,
          facultyName: null,
        }));
        await Class.findByIdAndUpdate(cls._id, { $set: { subjectAssignments: inherited } });
        cls.subjectAssignments = inherited;
        invalidateEntityCache('class', cls._id);
      }
    }

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
      isMaster:        cls.isMaster || false,
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

    if (name && name.trim() !== cls.name) {
      const duplicate = await findActiveMatchingClass({
        name: name.trim(),
        semester: cls.semester,
        departmentId: cls.departmentId,
        excludeClassId: cls._id,
        session,
      });
      if (duplicate) {
        await abortSafeTransaction(session);
        return next(
          new ErrorResponse(
            `Section "${duplicate.name}" for Semester ${cls.semester} already exists in this department.`,
            409,
            'DB_003'
          )
        );
      }
      cls.name = name.trim();
    }
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
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
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
      const facultyIdToInvalidate = assignment.facultyId;
      assignment.deleteOne();
      await cls.save({ session });

      await commitSafeTransaction(session);

      // ✅ Sync AFTER commit
      await syncSubjectRemoval(id, subjectIdToSync);

      // Invalidate faculty cache if a faculty was assigned to this removed subject
      if (facultyIdToInvalidate) {
        invalidateEntityCache('faculty', facultyIdToInvalidate);
      }
      invalidateEntityCache('class', id);

      return res.status(200).json({ success: true, data: { message: 'Subject assignment removed' } });
    } catch (err) {
      await abortSafeTransaction(session);
      const isWriteConflict =
        err.code === 112 ||
        err.codeName === 'WriteConflict' ||
        err.message?.includes('Write conflict');

      if (isWriteConflict && attempt < maxRetries) {
        logger.warn('removeSubjectAssignment: Write conflict encountered, retrying attempt', {
          attempt,
          classId: req.params.id,
          assignmentId: req.params.assignmentId,
        });
        const delay = Math.random() * 50 * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      return next(err);
    } finally {
      session.endSession();
    }
  }
};

// ── POST /api/classes/:id/subjects/bulk-remove ────────────────────────
export const bulkRemoveSubjectAssignments = async (req, res, next) => {
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const session = await mongoose.startSession();
    try {
      await startSafeTransaction(session);
      const { id } = req.params;
      const { assignmentIds } = req.body;

      if (!Array.isArray(assignmentIds) || assignmentIds.length === 0) {
        await abortSafeTransaction(session);
        return next(new ErrorResponse('Please provide an array of assignmentIds', 400, 'VAL_001'));
      }

      const cls = await Class.findOne({ _id: id, isActive: true }).session(session);
      if (!cls) {
        await abortSafeTransaction(session);
        return next(new ErrorResponse('Class not found', 404, 'NOT_FOUND'));
      }

      if ((req.user.role === 'hod' || req.user.role === 'ao') && cls.departmentId?.toString() !== req.user.departmentId) {
        await abortSafeTransaction(session);
        return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
      }

      const targetSet = new Set(assignmentIds.map((aId) => String(aId)));
      const removedSubjectIds = [];
      const removedFacultyIds = [];

      const remaining = [];
      for (const a of cls.subjectAssignments) {
        if (targetSet.has(String(a._id))) {
          if (a.subjectId) removedSubjectIds.push(a.subjectId.toString());
          if (a.facultyId) removedFacultyIds.push(a.facultyId.toString());
        } else {
          remaining.push(a);
        }
      }

      const removedCount = cls.subjectAssignments.length - remaining.length;
      cls.subjectAssignments = remaining;
      await cls.save({ session });

      await commitSafeTransaction(session);

      // Batch sync active batch requests & approvals
      if (removedSubjectIds.length > 0) {
        await bulkSyncSubjectRemoval(id, removedSubjectIds);
      }

      for (const fid of removedFacultyIds) {
        invalidateEntityCache('faculty', fid);
      }
      invalidateEntityCache('class', id);

      return res.status(200).json({
        success: true,
        data: {
          removedCount,
          message: `${removedCount} subject mappings removed successfully`,
        },
      });
    } catch (err) {
      await abortSafeTransaction(session);
      const isWriteConflict =
        err.code === 112 ||
        err.codeName === 'WriteConflict' ||
        err.message?.includes('Write conflict');

      if (isWriteConflict && attempt < maxRetries) {
        logger.warn('bulkRemoveSubjectAssignments: Write conflict encountered, retrying attempt', {
          attempt,
          classId: req.params.id,
        });
        const delay = Math.random() * 50 * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      return next(err);
    } finally {
      session.endSession();
    }
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

        // Never blindly fallback to arbitrary classes. If no matching section exists, leave recommendedTargetId as null.

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

      if (src._id.toString() === tgt._id.toString()) {
        return next(new ErrorResponse(`Source and destination class cannot be the same (${src.name})`, 400, 'VAL_002'));
      }

      if (tgt.semester <= src.semester && !req.body.allowSameSemesterMove) {
        return next(new ErrorResponse(`Destination class (${tgt.name} Sem ${tgt.semester}) must have a higher semester than source class (${src.name} Sem ${src.semester})`, 400, 'VAL_002'));
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

    // Check for accidental duplicate destination mappings (prevent unintended section mergers)
    const targetUsage = new Map();
    for (const p of promotions) {
      const tid = p.targetClassId?.toString();
      targetUsage.set(tid, (targetUsage.get(tid) || 0) + 1);
    }
    const duplicateTargets = [...targetUsage.entries()].filter(([_, count]) => count > 1);
    if (duplicateTargets.length > 0 && !req.body.allowConsolidation) {
      const dupNames = duplicateTargets.map(([id]) => classMap.get(id)?.name || id).join(', ');
      return next(new ErrorResponse(
        `Multiple source sections are mapped to the same destination section (${dupNames}). Section consolidation requires explicit confirmation.`,
        400,
        'VAL_002'
      ));
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

// ── POST /api/classes/auto-create-target-sections ─────────────────────────────
export const autoCreateTargetSections = async (req, res, next) => {
  try {
    const { departmentId, sourceSemester, targetSemester, sectionNames } = req.body;

    if (!departmentId || !targetSemester || !Array.isArray(sectionNames) || sectionNames.length === 0) {
      return next(new ErrorResponse('departmentId, targetSemester, and sectionNames are required', 400, 'VAL_001'));
    }

    if ((req.user.role === 'hod' || req.user.role === 'ao') && req.user.departmentId?.toString() !== departmentId.toString()) {
      return next(new ErrorResponse('Access denied for this department scope', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    // Find source classes to inherit academicYear if applicable
    const sourceClasses = await Class.find({
      departmentId,
      semester: Number(sourceSemester) || (Number(targetSemester) - 1),
      isActive: true,
    }).lean();

    const academicYear = sourceClasses[0]?.academicYear || `${new Date().getFullYear()}-${new Date().getFullYear() + 4}`;

    // Check if any peer class in the same department and target semester already has subjects to inherit
    const peerWithSubjects = await Class.findOne({
      departmentId,
      semester: Number(targetSemester),
      isActive: true,
      'subjectAssignments.0': { $exists: true },
    }).lean();

    const inheritedSubjects = (peerWithSubjects?.subjectAssignments || []).map(sa => ({
      subjectId: sa.subjectId,
      subjectName: sa.subjectName,
      subjectCode: sa.subjectCode,
      isElective: sa.isElective || false,
      facultyId: null,
      facultyName: null,
    }));

    const createdClasses = [];
    for (const name of sectionNames) {
      const cleanName = (name || '').trim();
      if (!cleanName) continue;

      const existing = await Class.findOne({
        departmentId,
        semester: Number(targetSemester),
        name: { $regex: new RegExp(`^${cleanName}$`, 'i') },
      });

      if (!existing) {
        const [newClass] = await Class.create([{
          name: cleanName,
          departmentId,
          semester: Number(targetSemester),
          academicYear,
          studentIds: [],
          subjectAssignments: inheritedSubjects,
          isActive: true,
        }]);
        createdClasses.push(newClass);
      }
    }

    // Auto-update any existing sections in this target semester that currently have 0 subjects
    if (inheritedSubjects.length > 0) {
      await Class.updateMany(
        {
          departmentId,
          semester: Number(targetSemester),
          isActive: true,
          $or: [
            { subjectAssignments: { $exists: false } },
            { subjectAssignments: { $size: 0 } },
          ],
        },
        {
          $set: { subjectAssignments: inheritedSubjects },
        }
      );
    }

    // Invalidate classes caches
    invalidateEntityCache('class', 'bulk_create');

    logger.info('cohort_target_sections_auto_created', {
      timestamp: new Date().toISOString(),
      actor: req.user.userId,
      departmentId,
      targetSemester,
      createdCount: createdClasses.length,
    });

    return res.status(201).json({
      success: true,
      message: `Successfully provisioned ${createdClasses.length} section(s) in Semester ${targetSemester}`,
      data: createdClasses,
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/classes/:id/propagate-cohort-subjects ───────────────────────────
export const propagateCohortSubjects = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { overwrite = false, syncFaculty = false } = req.body;

    const sourceClass = await Class.findById(id).lean();
    if (!sourceClass) {
      return next(new ErrorResponse('Source class not found', 404, 'NOT_FOUND'));
    }

    if ((req.user.role === 'hod' || req.user.role === 'ao') && sourceClass.departmentId?.toString() !== req.user.departmentId?.toString()) {
      return next(new ErrorResponse('Access denied for this department scope', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    if (!sourceClass.subjectAssignments || sourceClass.subjectAssignments.length === 0) {
      return next(new ErrorResponse('Source class has no subjects to propagate', 400, 'VAL_002'));
    }

    const propagatedSubjects = sourceClass.subjectAssignments.map(sa => ({
      subjectId: sa.subjectId,
      subjectName: sa.subjectName,
      subjectCode: sa.subjectCode,
      isElective: sa.isElective || false,
      facultyId: syncFaculty ? sa.facultyId : null,
      facultyName: syncFaculty ? sa.facultyName : null,
    }));

    const filter = {
      departmentId: sourceClass.departmentId,
      semester: sourceClass.semester,
      _id: { $ne: sourceClass._id },
      isActive: true,
      isMaster: { $ne: true },
    };

    if (!overwrite && !sourceClass.isMaster) {
      filter.$or = [
        { subjectAssignments: { $exists: false } },
        { subjectAssignments: { $size: 0 } },
      ];
    }

    const targetSections = await Class.find(filter);
    let updatedCount = 0;

    for (const section of targetSections) {
      const existingFacultyMap = new Map();
      for (const sa of (section.subjectAssignments || [])) {
        const key = (sa.subjectCode || sa.subjectId?.toString() || '').trim().toUpperCase();
        if (key && sa.facultyId) {
          existingFacultyMap.set(key, {
            facultyId: sa.facultyId,
            facultyName: sa.facultyName,
          });
        }
      }

      const mergedAssignments = sourceClass.subjectAssignments.map((sa) => {
        const key = (sa.subjectCode || sa.subjectId?.toString() || '').trim().toUpperCase();
        const existing = existingFacultyMap.get(key);

        return {
          subjectId: sa.subjectId,
          subjectName: sa.subjectName,
          subjectCode: sa.subjectCode,
          isElective: sa.isElective || false,
          facultyId: syncFaculty ? sa.facultyId : (existing?.facultyId || null),
          facultyName: syncFaculty ? sa.facultyName : (existing?.facultyName || null),
        };
      });

      section.subjectAssignments = mergedAssignments;
      await section.save();
      invalidateEntityCache('class', section._id, sourceClass.departmentId);
      updatedCount++;
    }

    invalidateEntityCache('class', 'bulk_update');

    logger.info('cohort_subjects_propagated', {
      timestamp: new Date().toISOString(),
      actor: req.user.userId,
      sourceClassId: sourceClass._id,
      departmentId: sourceClass.departmentId,
      semester: sourceClass.semester,
      updatedSections: updatedCount,
    });

    return res.status(200).json({
      success: true,
      message: `Successfully synchronized ${sourceClass.subjectAssignments.length} subjects across ${updatedCount} peer section(s) in Semester ${sourceClass.semester}`,
      data: {
        sourceClassId: sourceClass._id,
        departmentId: sourceClass.departmentId,
        semester: sourceClass.semester,
        updatedSections: updatedCount,
        subjectCount: sourceClass.subjectAssignments.length,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/classes/master-curriculum ─────────────────────────────────────────
export const getMasterCurriculum = async (req, res, next) => {
  try {
    const { departmentId, semester } = req.query;
    if (!departmentId || !semester) {
      return next(new ErrorResponse('departmentId and semester are required', 400, 'VAL_001'));
    }

    if ((req.user.role === 'hod' || req.user.role === 'ao') && req.user.departmentId?.toString() !== departmentId.toString()) {
      return next(new ErrorResponse('Access denied for this department scope', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    const numSemester = Number(semester);

    let master = await Class.findOne({
      departmentId,
      semester: numSemester,
      isMaster: true,
      isActive: true,
    }).lean();

    if (!master) {
      // Find peer with subjects if any exists
      const peerWithSubjects = await Class.findOne({
        departmentId,
        semester: numSemester,
        isActive: true,
        'subjectAssignments.0': { $exists: true },
      }).lean();

      const academicYear = peerWithSubjects?.academicYear || `${new Date().getFullYear()}-${new Date().getFullYear() + 4}`;
      const inheritedSubjects = (peerWithSubjects?.subjectAssignments || []).map((sa) => ({
        subjectId: sa.subjectId,
        subjectName: sa.subjectName,
        subjectCode: sa.subjectCode,
        isElective: sa.isElective || false,
        facultyId: null,
        facultyName: null,
      }));

      const created = await Class.create({
        name: `Semester ${numSemester} Curriculum Master`,
        departmentId,
        semester: numSemester,
        academicYear,
        isMaster: true,
        isActive: true,
        studentIds: [],
        subjectAssignments: inheritedSubjects,
      });

      master = created.toObject();
    }

    return res.status(200).json({
      success: true,
      data: master,
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/classes/master-curriculum/sync ──────────────────────────────────
export const syncMasterCurriculum = async (req, res, next) => {
  try {
    const { departmentId, semester, syncFaculty = false } = req.body;
    if (!departmentId || !semester) {
      return next(new ErrorResponse('departmentId and semester are required', 400, 'VAL_001'));
    }

    if ((req.user.role === 'hod' || req.user.role === 'ao') && req.user.departmentId?.toString() !== departmentId.toString()) {
      return next(new ErrorResponse('Access denied for this department scope', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    const numSemester = Number(semester);

    const master = await Class.findOne({
      departmentId,
      semester: numSemester,
      isMaster: true,
      isActive: true,
    }).lean();

    if (!master || !master.subjectAssignments?.length) {
      return next(new ErrorResponse('Master class has no subjects to synchronize. Please add subjects to the master class first.', 400, 'VAL_002'));
    }

    const targetSections = await Class.find({
      departmentId,
      semester: numSemester,
      isMaster: { $ne: true },
      isActive: true,
    });

    let updatedCount = 0;
    for (const section of targetSections) {
      const existingFacultyMap = new Map();
      for (const sa of (section.subjectAssignments || [])) {
        const key = (sa.subjectCode || sa.subjectId?.toString() || '').trim().toUpperCase();
        if (key && sa.facultyId) {
          existingFacultyMap.set(key, {
            facultyId: sa.facultyId,
            facultyName: sa.facultyName,
          });
        }
      }

      const mergedAssignments = master.subjectAssignments.map((ms) => {
        const key = (ms.subjectCode || ms.subjectId?.toString() || '').trim().toUpperCase();
        const existing = existingFacultyMap.get(key);

        return {
          subjectId: ms.subjectId,
          subjectName: ms.subjectName,
          subjectCode: ms.subjectCode,
          isElective: ms.isElective || false,
          facultyId: syncFaculty ? ms.facultyId : (existing?.facultyId || null),
          facultyName: syncFaculty ? ms.facultyName : (existing?.facultyName || null),
        };
      });

      section.subjectAssignments = mergedAssignments;
      await section.save();
      invalidateEntityCache('class', section._id, departmentId);
      updatedCount++;
    }

    logger.info('master_curriculum_synced', {
      timestamp: new Date().toISOString(),
      actor: req.user.userId,
      departmentId,
      semester: numSemester,
      subjectCount: master.subjectAssignments.length,
      updatedSections: updatedCount,
    });

    return res.status(200).json({
      success: true,
      message: `Synchronized ${master.subjectAssignments.length} subjects to ${updatedCount} section(s) in Semester ${numSemester}.`,
      data: {
        departmentId,
        semester: numSemester,
        subjectCount: master.subjectAssignments.length,
        updatedSectionsCount: updatedCount,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/classes/department-rollover-preview ──────────────────────────────
export const getDepartmentRolloverPreview = async (req, res, next) => {
  try {
    const { departmentId } = req.query;
    if (!departmentId) {
      return next(new ErrorResponse('departmentId is required', 400, 'VAL_001'));
    }

    if ((req.user.role === 'hod' || req.user.role === 'ao') && req.user.departmentId?.toString() !== departmentId.toString()) {
      return next(new ErrorResponse('Access denied for this department scope', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    // 1. Fetch all active operational sections
    const allClasses = await Class.find({
      departmentId,
      isActive: true,
      isMaster: { $ne: true },
    }).sort({ semester: 1, name: 1 }).lean();

    const classIds = allClasses.map((c) => c._id);

    // 2. Check for active clearance batches across all classes
    const activeBatches = await NodueBatch.find({
      classId: { $in: classIds },
      status: 'active',
    }).select('classId').lean();

    const activeBatchMap = new Set(activeBatches.map((b) => b.classId.toString()));

    // 3. Count active students per class
    const studentCountMap = new Map();
    await Promise.all(
      allClasses.map(async (cls) => {
        const count = await Student.countDocuments({
          $or: [
            { classId: cls._id },
            { _id: { $in: cls.studentIds || [] } },
          ],
          isActive: { $ne: false },
        });
        studentCountMap.set(cls._id.toString(), count);
      })
    );

    // Group classes by semester
    const semMap = new Map();
    for (const cls of allClasses) {
      const s = cls.semester;
      if (!semMap.has(s)) semMap.set(s, []);
      semMap.get(s).push({
        _id: cls._id,
        name: cls.name,
        semester: cls.semester,
        academicYear: cls.academicYear,
        studentCount: studentCountMap.get(cls._id.toString()) || 0,
        hasActiveBatch: activeBatchMap.has(cls._id.toString()),
      });
    }

    const availableSemesters = [...semMap.keys()].sort((a, b) => b - a); // Descending (8 down to 1)

    // Analyze transitions
    const semesterTransitions = [];
    let totalMissingSections = 0;
    let totalStudentsPromoting = 0;
    let totalGraduatingStudents = 0;
    let totalBlockedSections = 0;

    for (const sourceSem of availableSemesters) {
      const sourceSections = semMap.get(sourceSem) || [];
      const isGraduating = sourceSem >= 8;
      const targetSem = isGraduating ? null : sourceSem + 1;
      const targetSections = !isGraduating ? (semMap.get(targetSem) || []) : [];

      const semStudents = sourceSections.reduce((sum, sec) => sum + sec.studentCount, 0);
      if (isGraduating) {
        totalGraduatingStudents += semStudents;
      } else {
        totalStudentsPromoting += semStudents;
      }

      // Compute missing sections in target semester
      const missingInTarget = [];
      if (!isGraduating) {
        for (const src of sourceSections) {
          const cleanSrc = (src.name || '').replace(/^(I|II|III|IV)\s+/i, '').trim().toLowerCase();
          const match = targetSections.some((tgt) => {
            const cleanTgt = (tgt.name || '').replace(/^(I|II|III|IV)\s+/i, '').trim().toLowerCase();
            return cleanSrc === cleanTgt;
          });
          if (!match && !missingInTarget.includes(src.name)) {
            missingInTarget.push(src.name);
          }
        }
      }

      totalMissingSections += missingInTarget.length;
      const semHasActiveBatch = sourceSections.some((s) => s.hasActiveBatch);
      if (semHasActiveBatch) totalBlockedSections++;

      semesterTransitions.push({
        sourceSemester: sourceSem,
        targetSemester: targetSem,
        isGraduating,
        sourceSections,
        targetSections,
        missingSections: missingInTarget,
        totalStudents: semStudents,
        hasActiveBatch: semHasActiveBatch,
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        departmentId,
        totalSemesters: availableSemesters.length,
        totalSections: allClasses.length,
        totalStudents: totalStudentsPromoting + totalGraduatingStudents,
        advancingStudents: totalStudentsPromoting,
        graduatingStudents: totalGraduatingStudents,
        missingSectionsCount: totalMissingSections,
        blockedByActiveBatchCount: totalBlockedSections,
        transitions: semesterTransitions,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/classes/department-rollover ─────────────────────────────────────
export const executeDepartmentRollover = async (req, res, next) => {
  try {
    const {
      departmentId,
      autoCreateMissingSections = true,
      resetElectives = true,
      resetFaculty = true,
      excludedStudentIds = [],
    } = req.body;

    if (!departmentId) {
      return next(new ErrorResponse('departmentId is required', 400, 'VAL_001'));
    }

    if ((req.user.role === 'hod' || req.user.role === 'ao') && req.user.departmentId?.toString() !== departmentId.toString()) {
      return next(new ErrorResponse('Access denied for this department scope', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    const excludedSet = new Set((excludedStudentIds || []).map((id) => id.toString()));

    // 1. Guard against active clearance batches in the department
    const activeBatches = await NodueBatch.find({
      departmentId,
      status: 'active',
    }).select('_id name classId').lean();

    if (activeBatches.length > 0) {
      return next(new ErrorResponse(
        'Cannot execute Department Rollover while clearance batches are active. Please complete or close active batches before proceeding.',
        400,
        'VAL_002'
      ));
    }

    // 2. Fetch existing classes
    let allClasses = await Class.find({
      departmentId,
      isActive: true,
      isMaster: { $ne: true },
    }).lean();

    // 3. Pre-provision missing target sections if autoCreateMissingSections is true
    if (autoCreateMissingSections) {
      const semMap = new Map();
      for (const cls of allClasses) {
        if (!semMap.has(cls.semester)) semMap.set(cls.semester, []);
        semMap.get(cls.semester).push(cls);
      }

      const availableSemesters = [...semMap.keys()].filter((s) => s < 8).sort((a, b) => b - a);

      for (const sourceSem of availableSemesters) {
        const sourceSections = semMap.get(sourceSem) || [];
        const targetSem = sourceSem + 1;
        const targetSections = semMap.get(targetSem) || [];

        const missingNames = [];
        for (const src of sourceSections) {
          const cleanSrc = (src.name || '').replace(/^(I|II|III|IV)\s+/i, '').trim().toLowerCase();
          const match = targetSections.some((tgt) => {
            const cleanTgt = (tgt.name || '').replace(/^(I|II|III|IV)\s+/i, '').trim().toLowerCase();
            return cleanSrc === cleanTgt;
          });
          if (!match && !missingNames.includes(src.name)) {
            missingNames.push(src.name);
          }
        }

        if (missingNames.length > 0) {
          // Look up Master Class or peer with subjects in targetSem
          let masterOrPeer = await Class.findOne({
            departmentId,
            semester: targetSem,
            isMaster: true,
            isActive: true,
            'subjectAssignments.0': { $exists: true },
          }).lean();

          if (!masterOrPeer) {
            masterOrPeer = await Class.findOne({
              departmentId,
              semester: targetSem,
              isActive: true,
              'subjectAssignments.0': { $exists: true },
            }).lean();
          }

          const inheritedSubjects = (masterOrPeer?.subjectAssignments || []).map((sa) => ({
            subjectId: sa.subjectId,
            subjectName: sa.subjectName,
            subjectCode: sa.subjectCode,
            isElective: sa.isElective || false,
            facultyId: null,
            facultyName: null,
          }));

          const academicYear = sourceSections[0]?.academicYear || `${new Date().getFullYear()}-${new Date().getFullYear() + 4}`;

          for (const name of missingNames) {
            const created = await Class.create({
              name,
              departmentId,
              semester: targetSem,
              academicYear,
              studentIds: [],
              subjectAssignments: inheritedSubjects,
              isActive: true,
            });
            if (!semMap.has(targetSem)) semMap.set(targetSem, []);
            semMap.get(targetSem).push(created.toObject());
          }
        }
      }

      // Refresh allClasses
      allClasses = await Class.find({
        departmentId,
        isActive: true,
        isMaster: { $ne: true },
      }).lean();
    }

    // 4. Group by semester descending (Waterfall execution)
    const semGrouped = new Map();
    for (const cls of allClasses) {
      if (!semGrouped.has(cls.semester)) semGrouped.set(cls.semester, []);
      semGrouped.get(cls.semester).push(cls);
    }

    const descendingSemesters = [...semGrouped.keys()].sort((a, b) => b - a);

    let totalGraduated = 0;
    let totalAdvancing = 0;
    const executionResults = [];
    const affectedClassIds = new Set();
    const affectedStudentIds = new Set();

    // 5. Execute Top-Down Waterfall in Safe Transaction
    await executeSafeTransaction(async (session, opt) => {
      for (const sem of descendingSemesters) {
        const sections = semGrouped.get(sem) || [];

        // Final Year Graduation (Semester 8)
        if (sem >= 8) {
          for (const sec of sections) {
            affectedClassIds.add(sec._id.toString());
            const students = await Student.find({
              $or: [{ classId: sec._id }, { _id: { $in: sec.studentIds || [] } }],
              isActive: { $ne: false },
            }).select('_id').lean();

            const eligibleIds = students.map((s) => s._id).filter((id) => !excludedSet.has(id.toString()));

            if (eligibleIds.length > 0) {
              await Class.findByIdAndUpdate(sec._id, { $pullAll: { studentIds: eligibleIds } }, opt);
              
              const priorHistoryEntry = {
                classId: sec._id,
                className: sec.name,
                semester: sec.semester,
                academicYear: sec.academicYear,
                promotedAt: new Date(),
              };

              await Student.updateMany(
                { _id: { $in: eligibleIds } },
                {
                  $set: {
                    isActive: false,
                    isGraduated: true,
                    graduationYear: new Date().getFullYear().toString(),
                  },
                  $push: { classHistory: priorHistoryEntry },
                },
                opt
              );

              eligibleIds.forEach((id) => affectedStudentIds.add(id.toString()));
              totalGraduated += eligibleIds.length;
            }

            executionResults.push({
              sourceSemester: sem,
              sourceClass: sec.name,
              action: 'GRADUATED',
              count: eligibleIds.length,
            });
          }
        } else {
          // Standard Advancement (Sem -> Sem + 1)
          const targetSem = sem + 1;
          const targetSections = semGrouped.get(targetSem) || [];

          for (const sec of sections) {
            affectedClassIds.add(sec._id.toString());
            const cleanSrc = (sec.name || '').replace(/^(I|II|III|IV)\s+/i, '').trim().toLowerCase();

            // Match target section
            const targetSec = targetSections.find((tgt) => {
              const cleanTgt = (tgt.name || '').replace(/^(I|II|III|IV)\s+/i, '').trim().toLowerCase();
              return cleanSrc === cleanTgt;
            });

            if (!targetSec) {
              executionResults.push({
                sourceSemester: sem,
                sourceClass: sec.name,
                action: 'SKIPPED_NO_TARGET_SECTION',
                count: 0,
              });
              continue;
            }

            affectedClassIds.add(targetSec._id.toString());

            const students = await Student.find({
              $or: [{ classId: sec._id }, { _id: { $in: sec.studentIds || [] } }],
              isActive: { $ne: false },
            }).select('_id').lean();

            const eligibleIds = students.map((s) => s._id).filter((id) => !excludedSet.has(id.toString()));

            if (eligibleIds.length > 0) {
              await Class.findByIdAndUpdate(sec._id, { $pullAll: { studentIds: eligibleIds } }, opt);
              await Class.findByIdAndUpdate(targetSec._id, { $addToSet: { studentIds: { $each: eligibleIds } } }, opt);

              const studentUpdatePayload = {
                classId: targetSec._id,
                departmentId: targetSec.departmentId,
                semester: targetSec.semester,
                currentSemester: targetSec.semester,
                academicYear: targetSec.academicYear,
                yearOfStudy: Math.ceil(targetSec.semester / 2),
              };

              if (resetFaculty) studentUpdatePayload.mentorId = null;
              if (resetElectives) studentUpdatePayload.electiveSubjects = [];

              const priorHistoryEntry = {
                classId: sec._id,
                className: sec.name,
                semester: sec.semester,
                academicYear: sec.academicYear,
                promotedAt: new Date(),
              };

              await Student.updateMany(
                { _id: { $in: eligibleIds } },
                { 
                  $set: studentUpdatePayload,
                  $push: { classHistory: priorHistoryEntry },
                },
                opt
              );

              eligibleIds.forEach((id) => affectedStudentIds.add(id.toString()));
              totalAdvancing += eligibleIds.length;
            }

            executionResults.push({
              sourceSemester: sem,
              sourceClass: sec.name,
              targetSemester: targetSem,
              targetClass: targetSec.name,
              action: 'PROMOTED',
              count: eligibleIds.length,
            });
          }
        }
      }
    });

    // 6. Invalidate caches
    invalidateEntityCache('department', departmentId);
    affectedClassIds.forEach((cid) => invalidateEntityCache('class', cid, departmentId));
    affectedStudentIds.forEach((sid) => invalidateEntityCache('student', sid));
    cache.del('students:list:*');
    cache.del(`classes:list:dept_${departmentId}:*`);

    logger.info('department_academic_rollover_completed', {
      timestamp: new Date().toISOString(),
      actor: req.user.userId,
      departmentId,
      totalGraduated,
      totalAdvancing,
      totalAffectedStudents: totalGraduated + totalAdvancing,
    });

    return res.status(200).json({
      success: true,
      message: `Department Academic Rollover completed: ${totalAdvancing} students advanced, ${totalGraduated} students graduated.`,
      data: {
        departmentId,
        totalGraduated,
        totalAdvancing,
        totalAffectedStudents: totalGraduated + totalAdvancing,
        results: executionResults,
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

      const priorHistoryEntry = {
        classId: sourceClass._id,
        className: sourceClass.name,
        semester: sourceClass.semester,
        academicYear: sourceClass.academicYear,
        promotedAt: new Date(),
      };

      await Student.updateMany(
        { _id: { $in: actualStudentIds } },
        { 
          $set: studentUpdatePayload,
          $push: { classHistory: priorHistoryEntry },
        },
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
