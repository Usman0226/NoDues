import mongoose from 'mongoose';
import NodueBatch from '../models/NodueBatch.js';
import NodueRequest from '../models/NodueRequest.js';
import NodueApproval from '../models/NodueApproval.js';
import Class from '../models/Class.js';
import Student from '../models/Student.js';
import Faculty from '../models/Faculty.js';
import ErrorResponse from '../utils/errorResponse.js';
import cache from '../config/cache.js';
import { withCache, invalidateKeys } from '../utils/withCache.js';
import logger from '../utils/logger.js';
import { pushEvent } from './sseController.js';
import { invalidateEntityCache } from '../utils/cacheHooks.js';

// ── GET /api/batch ────────────────────────────────────────────────────────────
export const getBatches = async (req, res, next) => {
  try {
    const { classId, departmentId, semester, academicYear, status, search, page = 1, limit = 20 } = req.query;

    const query = {};
    if (req.user.role === 'hod') query.departmentId = req.user.departmentId;
    else if (departmentId)       query.departmentId = departmentId;

    if (classId)      query.classId      = classId;
    if (semester)     query.semester     = Number(semester);
    if (academicYear) query.academicYear = academicYear;
    if (status)       query.status       = status;

    if (search) {
      query.className = { $regex: search, $options: 'i' };
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [batches, total] = await Promise.all([
      NodueBatch.find(query)
        .select('_id classId className departmentId semester academicYear status totalStudents initiatedAt deadline')
        .sort({ initiatedAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      NodueBatch.countDocuments(query),
    ]);

    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    return res.status(200).json({
      success: true,
      data: batches,
      pagination: {
        page: Number(page), limit: Number(limit), total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err) {
    next(err);
  }
};


const _executeInitiation = async (cls, deadline, initiator) => {
  const classId = cls._id;

  // 1. Fetch active students 
  const students = await Student.find({ classId, isActive: true })
    .select('_id rollNo name mentorId electiveSubjects')
    .lean();
  
  if (!students.length) {
    throw new Error(`No active students found in class ${cls.name}`);
  }

  // 2. Build Batch Record
  const batch = await NodueBatch.create({
    classId,
    className:       cls.name,
    departmentId:    cls.departmentId._id || cls.departmentId,
    semester:        cls.semester,
    academicYear:    cls.academicYear,
    initiatedBy:     initiator.userId,
    initiatedByRole: initiator.role,
    deadline:        deadline ? new Date(deadline) : null,
    status:          'active',
    totalStudents:   students.length,
  });

  // 3. Fetch necessary faculty info
  const [hodAccount, ctInfo] = await Promise.all([
    Faculty.findOne({ 
      departmentId: cls.departmentId._id || cls.departmentId, 
      roleTags: 'hod', 
      isActive: true 
    }).select('name').lean(),
    cls.classTeacherId ? Faculty.findById(cls.classTeacherId).select('name').lean() : null
  ]);

  const allMentorIds = [...new Set(students.map(s => s.mentorId).filter(Boolean))];
  const mentors = await Faculty.find({ _id: { $in: allMentorIds } }).select('name').lean();
  const mentorMap = new Map(mentors.map(m => [m._id.toString(), m.name]));

  // 4. Operation Builder
  const requestOps  = [];
  const approvalOps = [];
  const now         = new Date();
  const departmentName = cls.departmentId?.name ?? null;

  for (const student of students) {
    const requestId = new mongoose.Types.ObjectId();
    
    // Build Faculty Snapshot for this student
    const snapshot = {};
    if (hodAccount) {
      snapshot['hod'] = {
        facultyId:    hodAccount._id,
        facultyName:  hodAccount.name,
        roleTag:      'hod',
        approvalType: 'office',
      };
    }

    // Regular subjects
    for (const s of cls.subjectAssignments ?? []) {
      if (!s.facultyId || s.isElective) continue;
      snapshot[s.subjectId.toString()] = {
        facultyId:    s.facultyId,
        facultyName:  s.facultyName,
        subjectId:    s.subjectId,
        subjectName:  s.subjectName,
        subjectCode:  s.subjectCode,
        roleTag:      'faculty',
        approvalType: 'subject',
      };
    }

    // Class teacher
    if (cls.classTeacherId) {
      snapshot['classTeacher'] = {
        facultyId:    cls.classTeacherId,
        facultyName:  ctInfo?.name ?? null,
        subjectId:    null,
        subjectName:  'Academic Advisor (Class Teacher)',
        subjectCode:  null,
        roleTag:      'classTeacher',
        approvalType: 'classTeacher',
      };
    }

    // Mentor
    if (student.mentorId) {
      const mentorName = mentorMap.get(student.mentorId.toString());
      snapshot['mentor'] = {
        facultyId:    student.mentorId,
        facultyName:  mentorName ?? null,
        subjectId:    null,
        subjectName:  'Institutional Mentor',
        subjectCode:  null,
        roleTag:      'mentor',
        approvalType: 'mentor',
      };
    }

    // Elective subjects (student-specific)
    for (const e of student.electiveSubjects ?? []) {
      if (!e.facultyId) continue;
      snapshot[e.subjectId.toString()] = {
        facultyId:    e.facultyId,
        facultyName:  e.facultyName,
        subjectId:    e.subjectId,
        subjectName:  e.subjectName,
        subjectCode:  e.subjectCode,
        roleTag:      'faculty',
        approvalType: 'subject',
      };
    }

    requestOps.push({
      insertOne: {
        document: {
          _id:     requestId,
          batchId: batch._id,
          studentId: student._id,
          studentSnapshot: {
            rollNo: student.rollNo,
            name:   student.name,
            departmentName,
          },
          facultySnapshot: snapshot,
          status:     'pending',
          createdAt:  now,
          updatedAt:  now,
        },
      },
    });

    for (const f of Object.values(snapshot)) {
      if (!f.facultyId) continue;
      approvalOps.push({
        insertOne: {
          document: {
            requestId,
            batchId:      batch._id,
            studentId:    student._id,
            studentRollNo: student.rollNo,
            studentName:  student.name,
            facultyId:    f.facultyId,
            subjectId:    f.subjectId    ?? null,
            subjectName:  f.subjectName  ?? null,
            approvalType: f.approvalType,
            roleTag:      f.roleTag,
            action:       'pending',
            createdAt:    now,
          },
        },
      });
    }
  }

  // 5. Execute Bulk Writes
  const [requestResult, approvalResult] = await Promise.all([
    NodueRequest.bulkWrite(requestOps,  { ordered: false }),
    NodueApproval.bulkWrite(approvalOps, { ordered: false }),
  ]);

  // 6. Cache & Logs
  cache.set(`batch_summary:${batch._id}`, {
    cleared: 0, pending: students.length, hasDues: 0, hodOverride: 0,
  }, 30);
  // Invalidating all student statuses for this class is more reliable for bulk writes
  invalidateEntityCache('student', 'all');

  logger.info('batch_initiated', {
    timestamp: new Date().toISOString(),
    actor: initiator.userId,
    action: 'INITIATE_BATCH',
    resource_id: batch._id.toString(),
    classId,
    requestsCreated: requestResult.insertedCount,
  });

  // SSE Notification
  const studentIdList = students.map((s) => s._id.toString());
  pushEvent(studentIdList, 'BATCH_INITIATED', {
    batchId:      batch._id,
    className:    cls.name,
    semester:     cls.semester,
    academicYear: cls.academicYear,
  });

  return {
    batchId: batch._id,
    className: cls.name,
    totalStudents: students.length,
    requestsCreated: requestResult.insertedCount
  };
};

// ── GET /api/batch/initiate-preview ──────────────────────────────────────────
export const getInitiationPreview = async (req, res, next) => {
  try {
    const departmentId = req.user.departmentId;
    if (!departmentId) return next(new ErrorResponse('Department context missing from session', 400));

    // 1. Fetch all active classes
    const classes = await Class.find({ departmentId, isActive: true })
      .select('name semester academicYear classTeacherId subjectAssignments')
      .lean();

    // 2. Fetch active batches to identify currently running sessions
    const activeBatches = await NodueBatch.find({ departmentId, status: 'active' })
      .select('classId initiatedAt')
      .lean();
    
    const activeBatchMap = new Map(activeBatches.map(b => [b.classId.toString(), b.initiatedAt]));

    // 3. Get student counts for all classes in one go
    const studentCounts = await Student.aggregate([
      { $match: { departmentId: new mongoose.Types.ObjectId(departmentId), isActive: true } },
      { $group: { _id: '$classId', count: { $sum: 1 } } }
    ]);
    const studentCountMap = new Map(studentCounts.map(s => [s._id.toString(), s.count]));

    // 4. Map and Analyze
    const preview = classes.map(cls => {
      const classIdStr = cls._id.toString();
      const activeSince = activeBatchMap.get(classIdStr);
      const studentCount = studentCountMap.get(classIdStr) || 0;
      const hasCT = !!cls.classTeacherId;
      const subjects = (cls.subjectAssignments || []).filter(s => !s.isElective);

      let status = 'READY';
      let reason = null;

      if (activeSince) {
        status = 'ACTIVE';
        reason = `Active session since ${new Date(activeSince).toLocaleDateString()}`;
      } else if (studentCount === 0) {
        status = 'EMPTY';
        reason = 'No active students found';
      }

      const warnings = [];
      if (!hasCT) warnings.push('No Class Teacher assigned');
      if (subjects.length === 0) warnings.push('No core subjects assigned');

      return {
        classId: cls._id,
        className: cls.name,
        semester: cls.semester,
        academicYear: cls.academicYear,
        status,
        reason,
        studentCount,
        hasCT,
        subjectCount: subjects.length,
        warnings
      };
    });

    // Sort: READY first, then warnings, then ineligibles
    preview.sort((a, b) => {
      const order = { READY: 0, ACTIVE: 1, EMPTY: 2 };
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
      return a.className.localeCompare(b.className);
    });

    res.status(200).json({
      success: true,
      data: preview
    });
  } catch (err) {
    next(err);
  }
};

export const initiateBatch = async (req, res, next) => {
  try {
    const { classId, deadline } = req.body;
    if (!classId) return next(new ErrorResponse('classId is required', 400));

    const cls = await Class.findOne({ _id: classId, isActive: true })
      .populate('departmentId', 'name')
      .lean();
    if (!cls) return next(new ErrorResponse('Class not found', 404));

    if (req.user.role === 'hod' && cls.departmentId?._id?.toString() !== req.user.departmentId) {
      return next(new ErrorResponse('Access denied', 403));
    }

    const existing = await NodueBatch.findOne({ classId, status: 'active' }).lean();
    if (existing) return next(new ErrorResponse(`Active session already exists for ${cls.name}`, 409));

    const result = await _executeInitiation(cls, deadline, { userId: req.user.userId, role: req.user.role });

    return res.status(201).json({
      success: true,
      data: { ...result, initiatedAt: new Date() },
    });
  } catch (err) {
    if (err.message.includes('No active students')) {
      return next(new ErrorResponse(err.message, 400));
    }
    next(err);
  }
};

export const initiateDepartmentWide = async (req, res, next) => {
  try {
    const { deadline } = req.body;
    const departmentId = req.user.departmentId;

    if (!departmentId) {
      return next(new ErrorResponse('Department context missing from session', 400));
    }

    // 1. Fetch all active classes for the department
    const classes = await Class.find({ departmentId, isActive: true })
      .populate('departmentId', 'name')
      .lean();

    if (!classes.length) {
      return next(new ErrorResponse('No active classes found for this department', 404));
    }

    // 2. Identify which classes already have active batches
    const activeBatches = await NodueBatch.find({
      departmentId,
      status: 'active'
    }).select('classId').lean();

    const activeClassIds = new Set(activeBatches.map(b => b.classId.toString()));
    
    // 3. Filter eligible classes
    const eligibleClasses = classes.filter(c => !activeClassIds.has(c._id.toString()));

    if (!eligibleClasses.length) {
      return res.status(200).json({
        success: true,
        message: 'All classes already have active clearance sessions',
        summary: { total: classes.length, initiated: 0, skipped: classes.length }
      });
    }

    const results = {
      initiated: [],
      failed: [],
      skippedCount: activeClassIds.size
    };

    for (const cls of eligibleClasses) {
      try {
        const res = await _executeInitiation(cls, deadline, { 
          userId: req.user.userId, 
          role: req.user.role 
        });
        results.initiated.push(res);
      } catch (err) {
        logger.error('bulk_initiate_single_failure', { 
          class: cls.name, 
          error: err.message 
        });
        results.failed.push({ 
          className: cls.name, 
          reason: err.message 
        });
      }
    }

    return res.status(201).json({
      success: true,
      data: {
        summary: {
          total: classes.length,
          initiated: results.initiated.length,
          failed: results.failed.length,
          skipped: results.skippedCount
        },
        details: results.initiated,
        errors: results.failed.length > 0 ? results.failed : undefined
      }
    });

  } catch (err) {
    next(err);
  }
};

// ── GET /api/batch/:batchId ───────────────────────────────────────────────────
export const getBatchStatus = async (req, res, next) => {
  try {
    const { batchId } = req.params;

    const batch = await NodueBatch.findById(batchId)
      .select('_id className departmentId semester academicYear status totalStudents initiatedAt deadline')
      .lean();
    if (!batch) return next(new ErrorResponse('Batch not found', 404, 'NOT_FOUND'));

    if (req.user.role === 'hod' && batch.departmentId?.toString() !== req.user.departmentId) {
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    // Cache batch grid — 60s TTL; invalidated on any approval action
    const cacheKey = `batch_status:${batchId}`;
    const cachedGrid = cache.get(cacheKey);
    if (cachedGrid) {
      return res.status(200).json({ success: true, data: { batch, ...cachedGrid } });
    }

    // Requests + approval counts in parallel — both indexed on batchId
    const [requests, approvalCounts] = await Promise.all([
      NodueRequest.find({ batchId })
        .select('studentId studentSnapshot status facultySnapshot')
        .lean(),
      NodueApproval.aggregate([
        { $match: { batchId: new mongoose.Types.ObjectId(batchId) } },
        {
          $group: {
            _id:     '$studentId',
            total:   { $sum: 1 },
            cleared: { $sum: { $cond: [{ $eq: ['$action', 'approved'] },    1, 0] } },
            dues:    { $sum: { $cond: [{ $eq: ['$action', 'due_marked'] }, 1, 0] } },
            pending: { $sum: { $cond: [{ $eq: ['$action', 'pending'] },    1, 0] } },
          },
        },
      ]),
    ]);

    const countMap = Object.fromEntries(
      approvalCounts.map((a) => [a._id.toString(), a])
    );

    const students = requests.map((r) => {
      const counts = countMap[r.studentId?.toString()] ?? { total: 0, cleared: 0, dues: 0, pending: 0 };
      return {
        studentId: r.studentId,
        rollNo:    r.studentSnapshot?.rollNo,
        name:      r.studentSnapshot?.name,
        status:    r.status,
        cleared:   counts.cleared,
        pending:   counts.pending,
        dues:      counts.dues,
        total:     counts.total,
      };
    });

    const facultySnapshot = requests[0]?.facultySnapshot ?? [];
    const faculty = facultySnapshot.map((f) => ({
      _id:         f.facultyId,
      name:        f.facultyName,
      subjectId:   f.subjectId,
      subjectName: f.subjectName,
      type:        f.approvalType,
    }));

    const gridPayload = { students, faculty };
    cache.set(cacheKey, gridPayload, 60);

    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    return res.status(200).json({
      success: true,
      data: {
        batch: {
          _id:          batch._id,
          className:    batch.className,
          semester:     batch.semester,
          academicYear: batch.academicYear,
          status:       batch.status,
          totalStudents: batch.totalStudents,
          initiatedAt:  batch.initiatedAt,
          deadline:     batch.deadline,
        },
        ...gridPayload,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/batch/:batchId/students/:studentId ───────────────────────────────
export const getBatchStudentDetail = async (req, res, next) => {
  try {
    const { batchId, studentId } = req.params;

    // Both queries hit { batchId: 1, studentId: 1 } compound index
    const [request, approvals, batch] = await Promise.all([
      NodueRequest.findOne({ batchId, studentId })
        .select('studentSnapshot status overrideRemark')
        .lean(),
      NodueApproval.find({ batchId, studentId })
        .select('_id facultyId facultyName subjectName approvalType roleTag action dueType remarks actionedAt')
        .populate('facultyId', 'name employeeId')
        .lean(),
      NodueBatch.findById(batchId).select('departmentId').lean()
    ]);

    if (!request || !batch) return next(new ErrorResponse('Record not found', 404, 'NOT_FOUND'));

    // HoD Scope Check
    if (req.user.role === 'hod' && batch.departmentId?.toString() !== req.user.departmentId) {
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    return res.status(200).json({
      success: true,
      data: {
        studentId,
        rollNo:         request.studentSnapshot?.rollNo,
        name:           request.studentSnapshot?.name,
        status:         request.status,
        overrideRemark: request.overrideRemark ?? null,
        approvals: approvals.map((a) => ({
          _id:          a._id,
          facultyId:    a.facultyId?._id,
          facultyName:  a.facultyId?.name,
          employeeId:   a.facultyId?.employeeId,
          subjectName:  a.subjectName,
          approvalType: a.approvalType,
          roleTag:      a.roleTag,
          action:       a.action,
          dueType:      a.dueType    ?? null,
          remarks:      a.remarks    ?? null,
          actionedAt:   a.actionedAt ?? null,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/batch/:batchId/close ──────────────────────────────────────────
export const closeBatch = async (req, res, next) => {
  try {
    const { batchId } = req.params;

    const batch = await NodueBatch.findById(batchId);
    if (!batch) return next(new ErrorResponse('Batch not found', 404, 'NOT_FOUND'));
    if (batch.status === 'closed') {
      return next(new ErrorResponse('Batch is already closed', 400, 'BATCH_ALREADY_CLOSED'));
    }

    if (req.user.role === 'hod' && batch.departmentId?.toString() !== req.user.departmentId) {
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    batch.status = 'closed';
    await batch.save();

    // Cache invalidated automatically by Mongoose batch save hook

    logger.info('batch_closed', {
      timestamp: new Date().toISOString(), actor: req.user.userId,
      action: 'CLOSE_BATCH', resource_id: batchId,
    });

    // Notify students via SSE
    const batchRequests = await NodueRequest.find({ batchId }, 'studentId').lean();
    const batchStudentIds = batchRequests.map((r) => r.studentId.toString());
    pushEvent(batchStudentIds, 'BATCH_CLOSED', { batchId });

    return res.status(200).json({
      success: true,
      data: { batchId: batch._id, status: 'closed' },
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/batch/:batchId/students ─────────────────────────────────────────
export const addStudentToBatch = async (req, res, next) => {
  try {
    const { batchId } = req.params;
    const { studentId } = req.body;
    if (!studentId) return next(new ErrorResponse('studentId is required', 400, 'VALIDATION_ERROR'));

    // Fetch batch and student in parallel
    const [batch, student] = await Promise.all([
      NodueBatch.findById(batchId).lean(),
      Student.findOne({ _id: studentId, isActive: true })
        .select('_id rollNo name mentorId electiveSubjects classId')
        .lean(),
    ]);

    if (!batch)   return next(new ErrorResponse('Batch not found', 404, 'NOT_FOUND'));
    if (batch.status !== 'active') {
      return next(new ErrorResponse('Batch is closed', 400, 'BATCH_CLOSED'));
    }

    // HoD Scope Check
    if (req.user.role === 'hod' && batch.departmentId?.toString() !== req.user.departmentId) {
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    if (!student) return next(new ErrorResponse('Student not found', 404, 'NOT_FOUND'));

    const existing = await NodueRequest.findOne({ batchId, studentId })
      .select('_id')
      .lean();
    if (existing) {
      return next(new ErrorResponse('Student already in this batch', 409, 'DUPLICATE_KEY'));
    }

    const classData = await Class.findById(batch.classId)
      .select('subjectAssignments classTeacherId')
      .lean();

    const request = await NodueRequest.create({
      batchId,
      studentId,
      studentSnapshot: { rollNo: student.rollNo, name: student.name },
      facultySnapshot: classData?.subjectAssignments?.map((a) => ({
        facultyId: a.facultyId, facultyName: a.facultyName,
        subjectId: a.subjectId, subjectName: a.subjectName, subjectCode: a.subjectCode,
        roleTag: 'faculty', approvalType: 'subject',
      })) ?? [],
      status: 'pending',
    });

    await NodueBatch.findByIdAndUpdate(batchId, { $inc: { totalStudents: 1 } });

    // Cache invalidated automatically by Mongoose batch hooks

    logger.info('student_added_to_batch', {
      timestamp: new Date().toISOString(), actor: req.user.userId,
      action: 'ADD_STUDENT_BATCH', resource_id: batchId,
    });

    pushEvent([studentId.toString()], 'STUDENT_ADDED_TO_BATCH', {
      batchId,
      requestId: request._id,
    });

    return res.status(201).json({
      success: true,
      data: { requestId: request._id, studentId, batchId, status: 'pending' },
    });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/batch/:batchId/faculty/:facultyId ─────────────────────────────
export const removeFacultyFromBatch = async (req, res, next) => {
  try {
    const { batchId, facultyId } = req.params;

    const batch = await NodueBatch.findById(batchId).select('status departmentId').lean();
    if (!batch)                    return next(new ErrorResponse('Batch not found', 404, 'NOT_FOUND'));
    if (batch.status !== 'active') return next(new ErrorResponse('Batch is closed', 400, 'BATCH_CLOSED'));

    // HoD Scope Check
    if (req.user.role === 'hod' && batch.departmentId?.toString() !== req.user.departmentId) {
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    // Delete only PENDING approvals; preserve actioned ones (approved/due_marked)
    const result = await NodueApproval.deleteMany({
      batchId,
      facultyId,
      action: 'pending',
    });

    // Manual invalidation redundant with batch hooks for batch_status
    // Cache invalidated automatically by Mongoose approval hooks

    logger.info('faculty_removed_from_batch', {
      timestamp: new Date().toISOString(), actor: req.user.userId,
      action: 'REMOVE_FACULTY_BATCH',
      resource_id: batchId, facultyId,
      pendingDeleted: result.deletedCount,
    });

    return res.status(200).json({
      success: true,
      data: {
        batchId, facultyId,
        pendingApprovalsRemoved: result.deletedCount,
        message: 'Pending approvals removed. Actioned approvals retained.',
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── BATCH OPERATIONS ─────────────────────────────────────────────────────────

export const bulkCloseBatches = async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) {
      return next(new ErrorResponse('IDs array is required', 400));
    }

    const query = { _id: { $in: ids }, status: 'active' };
    if (req.user.role === 'hod') {
      query.departmentId = req.user.departmentId;
    }

    const batches = await NodueBatch.find(query).select('_id').lean();
    const result = await NodueBatch.updateMany(query, { status: 'closed' });

    for (const batch of batches) {
      const bid = batch._id.toString();
      // Cache invalidated automatically by Mongoose batch hooks
      
      // Notify students of each batch
      const batchRequests = await NodueRequest.find({ batchId: bid }, 'studentId').lean();
      const studentIds = batchRequests.map(r => r.studentId.toString());
      if (studentIds.length) {
        pushEvent(studentIds, 'BATCH_CLOSED', { batchId: bid });
      }
    }

    logger.info('batches_bulk_closed', {
      timestamp: new Date().toISOString(),
      actor: req.user.userId,
      action: 'BULK_CLOSE_BATCH',
      details: { count: result.modifiedCount, requested: ids.length }
    });

    return res.status(200).json({
      success: true,
      data: { modifiedCount: result.modifiedCount }
    });
  } catch (err) {
    next(err);
  }
};
