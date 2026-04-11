import mongoose from 'mongoose';
import NodueBatch from '../models/NodueBatch.js';
import NodueRequest from '../models/NodueRequest.js';
import NodueApproval from '../models/NodueApproval.js';
import Class from '../models/Class.js';
import Student from '../models/Student.js';
import Faculty from '../models/Faculty.js';
import ErrorResponse from '../utils/errorResponse.js';
import cache from '../config/cache.js';
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

    // Fetch active students for this class
    const students = await Student.find({ classId, isActive: true }).lean();
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

    // Build faculty snapshot from class subject assignments + classTeacher + mentors
    const buildFacultySnapshot = (student, classData) => {
      const snapshot = [];

      // Subject faculty
      for (const a of classData.subjectAssignments ?? []) {
        if (!a.facultyId) continue;
        // skip electives — handled via student.electiveSubjects
        if (!a.isElective) {
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
      }

      // Class teacher
      if (classData.classTeacherId) {
        snapshot.push({
          facultyId:    classData.classTeacherId,
          facultyName:  null, // resolved below
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

      // Elective subjects
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

    // Bulk create NodueRequests + NodueApprovals using sessions for atomicity
    const session = await mongoose.startSession();
    let requestsCreated = 0;
    let approvalsCreated = 0;

    try {
      await session.withTransaction(async () => {
        for (const student of students) {
          const facultySnapshot = buildFacultySnapshot(student, cls);

          const [request] = await NodueRequest.create(
            [
              {
                batchId: batch._id,
                studentId: student._id,
                studentSnapshot: {
                  rollNo: student.rollNo,
                  name:   student.name,
                  departmentName: cls.departmentId?.name ?? null,
                },
                facultySnapshot,
                status: 'pending',
              },
            ],
            { session }
          );

          requestsCreated++;

          // One approval record per faculty per student
          const approvalDocs = facultySnapshot
            .filter((f) => f.facultyId)
            .map((f) => ({
              requestId:    request._id,
              batchId:      batch._id,
              studentId:    student._id,
              studentRollNo: student.rollNo,
              studentName:   student.name,
              facultyId:    f.facultyId,
              subjectId:    f.subjectId ?? null,
              subjectName:  f.subjectName ?? null,
              approvalType: f.approvalType,
              roleTag:      f.roleTag,
              action:       'pending',
            }));

          if (approvalDocs.length) {
            await NodueApproval.insertMany(approvalDocs, { session });
            approvalsCreated += approvalDocs.length;
          }
        }
      });
    } finally {
      await session.endSession();
    }

    logger.info('batch_initiated', {
      timestamp: new Date().toISOString(),
      actor: req.user.userId,
      action: 'INITIATE_BATCH',
      resource_id: batch._id.toString(),
      classId, requestsCreated, approvalsCreated,
    });

    // Notify all students in the batch via SSE
    const studentIdList = students.map(s => s._id.toString());
    pushEvent(studentIdList, 'BATCH_INITIATED', {
      batchId: batch._id,
      className: cls.name,
      semester: cls.semester,
      academicYear: cls.academicYear
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

    const batch = await NodueBatch.findById(batchId).lean();
    if (!batch) return next(new ErrorResponse('Batch not found', 404, 'NOT_FOUND'));

    if (req.user.role === 'hod' && batch.departmentId?.toString() !== req.user.departmentId) {
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    // Aggregate per-student summary
    const requests = await NodueRequest.find({ batchId }).lean();

    const approvalCounts = await NodueApproval.aggregate([
      { $match: { batchId: new mongoose.Types.ObjectId(batchId) } },
      {
        $group: {
          _id:       '$studentId',
          total:     { $sum: 1 },
          cleared:   { $sum: { $cond: [{ $eq: ['$action', 'approved'] }, 1, 0] } },
          dues:      { $sum: { $cond: [{ $eq: ['$action', 'due_marked'] }, 1, 0] } },
          pending:   { $sum: { $cond: [{ $eq: ['$action', 'pending'] }, 1, 0] } },
        },
      },
    ]);

    const countMap = Object.fromEntries(
      approvalCounts.map((a) => [a._id.toString(), a])
    );

    const grid = requests.map((r) => {
      const counts = countMap[r.studentId?.toString()] ?? { total: 0, cleared: 0, dues: 0, pending: 0 };
      return {
        studentId:  r.studentId,
        rollNo:     r.studentSnapshot?.rollNo,
        name:       r.studentSnapshot?.name,
        status:     r.status,
        cleared:    counts.cleared,
        pending:    counts.pending,
        dues:       counts.dues,
        total:      counts.total,
      };
    });

    // Extract unique faculty from requests
    const facultySnapshot = requests[0]?.facultySnapshot || [];

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
        students: grid,
        faculty: facultySnapshot.map(f => ({
          _id: f.facultyId,
          name: f.facultyName,
          subjectId: f.subjectId,
          subjectName: f.subjectName,
          type: f.approvalType
        }))
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

    const [request, approvals] = await Promise.all([
      NodueRequest.findOne({ batchId, studentId }).lean(),
      NodueApproval.find({ batchId, studentId })
        .populate('facultyId', 'name employeeId')
        .lean(),
    ]);

    if (!request) return next(new ErrorResponse('Record not found', 404, 'NOT_FOUND'));

    return res.status(200).json({
      success: true,
      data: {
        studentId,
        rollNo:  request.studentSnapshot?.rollNo,
        name:    request.studentSnapshot?.name,
        status:  request.status,
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
          dueType:      a.dueType ?? null,
          remarks:      a.remarks ?? null,
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

    logger.info('batch_closed', {
      timestamp: new Date().toISOString(), actor: req.user.userId,
      action: 'CLOSE_BATCH', resource_id: batchId,
    });

    // Notify students via SSE
    const batchRequests = await NodueRequest.find({ batchId }, 'studentId').lean();
    const batchStudentIds = batchRequests.map(r => r.studentId.toString());
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

    const [batch, student, cls] = await Promise.all([
      NodueBatch.findById(batchId).lean(),
      Student.findOne({ _id: studentId, isActive: true }).lean(),
      null, // resolved after batch lookup
    ]);

    if (!batch)   return next(new ErrorResponse('Batch not found', 404, 'NOT_FOUND'));
    if (batch.status !== 'active') {
      return next(new ErrorResponse('Batch is closed', 400, 'BATCH_CLOSED'));
    }
    if (!student) return next(new ErrorResponse('Student not found', 404, 'NOT_FOUND'));

    const existing = await NodueRequest.findOne({ batchId, studentId }).lean();
    if (existing) {
      return next(new ErrorResponse('Student already in this batch', 409, 'DUPLICATE_KEY'));
    }

    const classData = await Class.findById(batch.classId).lean();

    const request = await NodueRequest.create({
      batchId,
      studentId,
      studentSnapshot: {
        rollNo: student.rollNo,
        name:   student.name,
      },
      facultySnapshot: classData?.subjectAssignments?.map((a) => ({
        facultyId: a.facultyId, facultyName: a.facultyName,
        subjectId: a.subjectId, subjectName: a.subjectName, subjectCode: a.subjectCode,
        roleTag: 'faculty', approvalType: 'subject',
      })) ?? [],
      status: 'pending',
    });

    await NodueBatch.findByIdAndUpdate(batchId, { $inc: { totalStudents: 1 } });

    logger.info('student_added_to_batch', {
      timestamp: new Date().toISOString(), actor: req.user.userId,
      action: 'ADD_STUDENT_BATCH', resource_id: batchId,
    });

    // Notify specific student via SSE
    pushEvent([studentId.toString()], 'STUDENT_ADDED_TO_BATCH', {
      batchId,
      requestId: request._id
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

    const batch = await NodueBatch.findById(batchId).lean();
    if (!batch)   return next(new ErrorResponse('Batch not found', 404, 'NOT_FOUND'));
    if (batch.status !== 'active') {
      return next(new ErrorResponse('Batch is closed', 400, 'BATCH_CLOSED'));
    }

    // Delete only PENDING approvals; preserve actioned ones (approved/due_marked)
    const result = await NodueApproval.deleteMany({
      batchId,
      facultyId,
      action: 'pending',
    });

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
