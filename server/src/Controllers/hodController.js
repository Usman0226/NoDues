import mongoose from 'mongoose';
import NodueBatch from '../models/NodueBatch.js';
import NodueRequest from '../models/NodueRequest.js';
import NodueApproval from '../models/NodueApproval.js';
import Student from '../models/Student.js';
import Faculty from '../models/Faculty.js';
import ErrorResponse from '../utils/errorResponse.js';
import logger from '../utils/logger.js';
import { pushEvent } from './sseController.js';

// Convenience: extract HoD's departmentId from token
const hodDept = (req) => req.user.departmentId;

// ── GET /api/hod/overview ─────────────────────────────────────────────────────
export const getOverview = async (req, res, next) => {
  try {
    const deptId = hodDept(req);

    const activeBatches = await NodueBatch.find({
      departmentId: deptId,
      status: 'active',
    }).lean();

    if (!activeBatches.length) {
      return res.status(200).json({ success: true, data: [] });
    }

    const batchIds = activeBatches.map((b) => b._id);

    // Aggregate request status counts per batch
    const statusCounts = await NodueRequest.aggregate([
      { $match: { batchId: { $in: batchIds } } },
      {
        $group: {
          _id:      '$batchId',
          total:    { $sum: 1 },
          cleared:  { $sum: { $cond: [{ $eq: ['$status', 'cleared'] }, 1, 0] } },
          hasDues:  { $sum: { $cond: [{ $eq: ['$status', 'has_dues'] }, 1, 0] } },
          pending:  { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
          overridden: { $sum: { $cond: [{ $eq: ['$status', 'hod_override'] }, 1, 0] } },
        },
      },
    ]);

    const countMap = Object.fromEntries(statusCounts.map((s) => [s._id.toString(), s]));

    const data = activeBatches.map((b) => {
      const counts = countMap[b._id.toString()] ?? { total: 0, cleared: 0, hasDues: 0, pending: 0, overridden: 0 };
      return {
        batchId:     b._id,
        className:   b.className,
        semester:    b.semester,
        academicYear: b.academicYear,
        status:      b.status,
        total:       counts.total,
        cleared:     counts.cleared,
        hasDues:     counts.hasDues,
        pending:     counts.pending,
        overridden:  counts.overridden,
        initiatedAt: b.initiatedAt,
      };
    });

    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/hod/dues ─────────────────────────────────────────────────────────
export const getDues = async (req, res, next) => {
  try {
    const deptId = hodDept(req);
    const { page = 1, limit = 20 } = req.query;

    // Active batches in this department
    const activeBatchIds = await NodueBatch.find(
      { departmentId: deptId, status: 'active' }, '_id'
    ).lean();

    const batchIdSet = activeBatchIds.map((b) => b._id);

    const skip = (Number(page) - 1) * Number(limit);
    const [requests, total] = await Promise.all([
      NodueRequest.find({ batchId: { $in: batchIdSet }, status: 'has_dues' })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      NodueRequest.countDocuments({ batchId: { $in: batchIdSet }, status: 'has_dues' }),
    ]);

    if (!requests.length) {
      return res.status(200).json({
        success: true, data: [],
        pagination: { page: Number(page), limit: Number(limit), total: 0, pages: 0 },
      });
    }

    // Get the due details per request
    const requestIds = requests.map((r) => r._id);
    const dueApprovals = await NodueApproval.find({
      requestId: { $in: requestIds },
      action: 'due_marked',
    })
      .populate('facultyId', 'name employeeId')
      .lean();

    // Group by requestId
    const dueMap = {};
    for (const d of dueApprovals) {
      const key = d.requestId?.toString();
      if (!dueMap[key]) dueMap[key] = [];
      dueMap[key].push({
        facultyName:  d.facultyId?.name,
        employeeId:   d.facultyId?.employeeId,
        subjectName:  d.subjectName,
        dueType:      d.dueType,
        remarks:      d.remarks,
        actionedAt:   d.actionedAt,
      });
    }

    const data = requests.map((r) => ({
      requestId:   r._id,
      studentId:   r.studentId,
      rollNo:      r.studentSnapshot?.rollNo,
      name:        r.studentSnapshot?.name,
      batchId:     r.batchId,
      dues:        dueMap[r._id.toString()] ?? [],
    }));

    return res.status(200).json({
      success: true, data,
      pagination: {
        page: Number(page), limit: Number(limit), total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/hod/override ────────────────────────────────────────────────────
export const overrideDues = async (req, res, next) => {
  try {
    const { requestId, overrideRemark } = req.body;
    if (!requestId || !overrideRemark?.trim()) {
      return next(new ErrorResponse('requestId and overrideRemark are required', 400, 'VALIDATION_ERROR'));
    }

    const request = await NodueRequest.findById(requestId);
    if (!request) return next(new ErrorResponse('Request not found', 404, 'NOT_FOUND'));

    if (request.status !== 'has_dues') {
      return next(new ErrorResponse('Override is only allowed for requests with dues', 400, 'OVERRIDE_NOT_APPLICABLE'));
    }

    // Verify this request belongs to an active batch in HoD's department
    const batch = await NodueBatch.findById(request.batchId).lean();
    if (!batch || batch.status !== 'active') {
      return next(new ErrorResponse('Batch is closed', 400, 'BATCH_CLOSED'));
    }
    if (batch.departmentId?.toString() !== hodDept(req)) {
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    request.status         = 'hod_override';
    request.overriddenBy   = req.user.userId;
    request.overrideRemark = overrideRemark.trim();
    request.overriddenAt   = new Date();
    await request.save();

    logger.info('hod_override', {
      timestamp: new Date().toISOString(), actor: req.user.userId,
      action: 'HOD_OVERRIDE', resource_id: requestId,
      remark: overrideRemark.trim(),
    });

    // Notify student via SSE
    pushEvent([request.studentId.toString()], 'HOD_OVERRIDE', {
      studentId: request.studentId,
      requestId,
      status: 'hod_override',
      overrideRemark: request.overrideRemark
    });

    return res.status(200).json({
      success: true,
      data: {
        requestId: request._id,
        status:    'hod_override',
        overriddenBy:   req.user.userId,
        overrideRemark: request.overrideRemark,
        overriddenAt:   request.overriddenAt,
      },
    });
  } catch (err) {
    next(err);
  }
};
