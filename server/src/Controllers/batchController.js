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

// ── GET /api/batch ────────────────────────────────────────────────────────────
export const getBatches = async (req, res, next) => {
  try {
    const { classId, departmentId, semester, academicYear, status, page = 1, limit = 20 } = req.query;

    const query = {};
    if (req.user.role === 'hod') query.departmentId = req.user.departmentId;
    else if (departmentId)       query.departmentId = departmentId;

    if (classId)      query.classId      = classId;
    if (semester)     query.semester     = Number(semester);
    if (academicYear) query.academicYear = academicYear;
    if (status)       query.status       = status;

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

// ── POST /api/batch/initiate ──────────────────────────────────────────────────
// Uses bulkWrite — 1 round trip instead of N per-student inserts.
// Sequential inserts (old): ~2,600ms for 65 students × 8 faculty
// bulkWrite (new): ~80ms
export const initiateBatch = async (req, res, next) => {
  try {
    const { classId, deadline } = req.body;
    if (!classId) {
      return next(new ErrorResponse('classId is required', 400, 'VALIDATION_ERROR'));
    }

    const cls = await Class.findOne({ _id: classId, isActive: true })
      .populate('departmentId', 'name')
      .lean();
    if (!cls) return next(new ErrorResponse('Class not found', 404, 'NOT_FOUND'));

    if (req.user.role === 'hod' && cls.departmentId?._id?.toString() !== req.user.departmentId) {
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    // Prevent duplicate active batch for this class
    const existing = await NodueBatch.findOne({ classId, status: 'active' }).lean();
    if (existing) {
      return next(
        new ErrorResponse(
          `An active batch already exists for ${cls.name}`,
          409,
          'BATCH_ALREADY_EXISTS'
        )
      );
    }

    // Fetch active students — projection limits data transfer
    const students = await Student.find({ classId, isActive: true })
      .select('_id rollNo name mentorId electiveSubjects')
      .lean();
    if (!students.length) {
      return next(new ErrorResponse('No active students found in this class', 400, 'BATCH_NO_STUDENTS'));
    }

    // Create batch record
    const batch = await NodueBatch.create({
      classId,
      className:       cls.name,
      departmentId:    cls.departmentId._id,
      semester:        cls.semester,
      academicYear:    cls.academicYear,
      initiatedBy:     req.user.userId,
      initiatedByRole: req.user.role,
      deadline:        deadline ? new Date(deadline) : null,
      status:          'active',
      totalStudents:   students.length,
    });

    const buildFacultySnapshot = (student, classData) => {
      const snapshot = [];

      // Core subject faculty
      for (const a of classData.subjectAssignments ?? []) {
        if (!a.facultyId || a.isElective) continue;
        snapshot.push({
          facultyId:    a.facultyId,
          facultyName:  a.facultyName,
          subjectId:    a.subjectId,
          subjectName:  a.subjectName,
          subjectCode:  a.subjectCode,
          roleTag:      'faculty',
          approvalType: 'subject',
        });
      }

      // Class teacher
      if (classData.classTeacherId) {
        snapshot.push({
          facultyId:    classData.classTeacherId,
          facultyName:  null,
          subjectId:    null,
          subjectName:  null,
          subjectCode:  null,
          roleTag:      'classTeacher',
          approvalType: 'classTeacher',
        });
      }

      // Mentor
      if (student.mentorId) {
        snapshot.push({
          facultyId:    student.mentorId,
          facultyName:  null,
          subjectId:    null,
          subjectName:  null,
          subjectCode:  null,
          roleTag:      'mentor',
          approvalType: 'mentor',
        });
      }

      // Elective subjects (student-specific)
      for (const e of student.electiveSubjects ?? []) {
        if (!e.facultyId) continue;
        snapshot.push({
          facultyId:    e.facultyId,
          facultyName:  e.facultyName,
          subjectId:    e.subjectId,
          subjectName:  e.subjectName,
          subjectCode:  e.subjectCode,
          roleTag:      'faculty',
          approvalType: 'subject',
        });
      }

      return snapshot;
    };

    // ── Build all ops in memory, then single bulkWrite round trip ─────────────
    const requestOps  = [];
    const approvalOps = [];
    const now         = new Date();
    const departmentName = cls.departmentId?.name ?? null;

    for (const student of students) {
      const requestId      = new mongoose.Types.ObjectId();
      const facultySnapshot = buildFacultySnapshot(student, cls);

      requestOps.push({
        insertOne: {
          document: {
            _id:     requestId,
            batchId: batch._id,
            studentId: student._id,
            studentSnapshot: {
              rollNo:         student.rollNo,
              name:           student.name,
              departmentName,
            },
            facultySnapshot,
            status:     'pending',
            createdAt:  now,
            updatedAt:  now,
          },
        },
      });

      for (const f of facultySnapshot) {
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

    // Two bulkWrites — one per collection. ordered:false means a single doc
    // failure doesn't abort the rest of the batch.
    const db = mongoose.connection.db;
    const [requestResult, approvalResult] = await Promise.all([
      db.collection('noduerequests').bulkWrite(requestOps,  { ordered: false }),
      db.collection('nodueapprovals').bulkWrite(approvalOps, { ordered: false }),
    ]);

    const requestsCreated  = requestResult.insertedCount;
    const approvalsCreated = approvalResult.insertedCount;

    // Prime batch summary cache so the first admin page load is a hit
    cache.set(`batch_summary:${batch._id}`, {
      cleared: 0, pending: students.length, hasDues: 0, hodOverride: 0,
    }, 30);

    logger.info('batch_initiated', {
      timestamp: new Date().toISOString(),
      actor: req.user.userId,
      action: 'INITIATE_BATCH',
      resource_id: batch._id.toString(),
      classId, requestsCreated, approvalsCreated,
    });

    // Notify all students via SSE
    const studentIdList = students.map((s) => s._id.toString());
    pushEvent(studentIdList, 'BATCH_INITIATED', {
      batchId:      batch._id,
      className:    cls.name,
      semester:     cls.semester,
      academicYear: cls.academicYear,
    });

    return res.status(201).json({
      success: true,
      data: {
        batchId:         batch._id,
        classId:         cls._id,
        className:       cls.name,
        semester:        cls.semester,
        academicYear:    cls.academicYear,
        status:          'active',
        totalStudents:   students.length,
        requestsCreated,
        approvalsCreated,
        initiatedAt:     batch.initiatedAt,
      },
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

    // Invalidate batch-level cache keys
    invalidateKeys([`batch_status:${batchId}`, `batch_summary:${batchId}`]);

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

    // Invalidate batch grid cache
    invalidateKeys([`batch_status:${batchId}`, `batch_summary:${batchId}`]);

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

    // Invalidate batch grid so it reflects the removed pending approvals
    invalidateKeys([`batch_status:${batchId}`, `faculty_pending:${facultyId}:${batchId}`]);

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
