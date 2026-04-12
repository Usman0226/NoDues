import mongoose from 'mongoose';
import NodueBatch from '../models/NodueBatch.js';
import NodueRequest from '../models/NodueRequest.js';
import NodueApproval from '../models/NodueApproval.js';
import Student from '../models/Student.js';
import Faculty from '../models/Faculty.js';
import ErrorResponse from '../utils/errorResponse.js';
import logger from '../utils/logger.js';
import { withCache, invalidateKeys } from '../utils/withCache.js';
import { pushEvent } from './sseController.js';

// Convenience: extract HoD's departmentId from token
const hodDept = (req) => req.user.departmentId;

// ── GET /api/hod/overview ─────────────────────────────────────────────────────
// Cached 60s — HoD overview hits this on every dashboard load.
export const getOverview = async (req, res, next) => {
  try {
    const deptId   = hodDept(req);
    const cacheKey = `hod_overview:${deptId}`;

    const data = await withCache(cacheKey, 60, async () => {
      const activeBatches = await NodueBatch.find({
        departmentId: deptId,
        status: 'active',
      })
        .select('_id className semester academicYear status initiatedAt')
        .lean();

      if (!activeBatches.length) return [];

      const batchIds = activeBatches.map((b) => b._id);

      // Single aggregation — counts cleared/hasDues/pending/overridden per batch
      const statusCounts = await NodueRequest.aggregate([
        { $match: { batchId: { $in: batchIds } } },
        {
          $group: {
            _id:       '$batchId',
            total:     { $sum: 1 },
            cleared:   { $sum: { $cond: [{ $eq: ['$status', 'cleared'] },      1, 0] } },
            hasDues:   { $sum: { $cond: [{ $eq: ['$status', 'has_dues'] },     1, 0] } },
            pending:   { $sum: { $cond: [{ $eq: ['$status', 'pending'] },      1, 0] } },
            overridden:{ $sum: { $cond: [{ $eq: ['$status', 'hod_override'] }, 1, 0] } },
          },
        },
      ]);

      const countMap = Object.fromEntries(statusCounts.map((s) => [s._id.toString(), s]));

      return activeBatches.map((b) => {
        const counts = countMap[b._id.toString()] ?? { total: 0, cleared: 0, hasDues: 0, pending: 0, overridden: 0 };
        return {
          batchId:      b._id,
          className:    b.className,
          semester:     b.semester,
          academicYear: b.academicYear,
          status:       b.status,
          total:        counts.total,
          cleared:      counts.cleared,
          hasDues:      counts.hasDues,
          pending:      counts.pending,
          overridden:   counts.overridden,
          initiatedAt:  b.initiatedAt,
        };
      });
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
    const { page = 1, limit = 20, status = 'has_dues' } = req.query;

    const batchFilter = { departmentId: deptId };
    if (status !== 'hod_override') batchFilter.status = 'active';

    // Get dept batch IDs — small result, indexed on departmentId
    const deptBatches  = await NodueBatch.find(batchFilter, '_id').lean();
    const batchIdSet   = deptBatches.map((b) => b._id);

    const skip = (Number(page) - 1) * Number(limit);
    const [requests, total] = await Promise.all([
      NodueRequest.find({ batchId: { $in: batchIdSet }, status })
        .select('_id studentId studentSnapshot batchId overriddenAt overrideRemark')
        .skip(skip)
        .limit(Number(limit))
        .populate('batchId', 'className semester academicYear')
        .lean(),
      NodueRequest.countDocuments({ batchId: { $in: batchIdSet }, status }),
    ]);

    if (!requests.length) {
      return res.status(200).json({
        success: true, data: [],
        pagination: { page: Number(page), limit: Number(limit), total: 0, pages: 0 },
      });
    }

    // Get due approvals for the fetched requests — single query, not N+1
    const requestIds = requests.map((r) => r._id);
    const dueApprovals = await NodueApproval.find({
      requestId: { $in: requestIds },
      action:    'due_marked',
    })
      .select('requestId subjectName dueType remarks actionedAt facultyName')
      .populate('facultyId', 'name employeeId')
      .lean();

    // Group by requestId
    const dueMap = {};
    for (const d of dueApprovals) {
      const key = d.requestId?.toString();
      if (!dueMap[key]) dueMap[key] = [];
      dueMap[key].push({
        facultyName: d.facultyId?.name    ?? d.facultyName,
        employeeId:  d.facultyId?.employeeId ?? null,
        subjectName: d.subjectName,
        dueType:     d.dueType,
        remarks:     d.remarks,
        actionedAt:  d.actionedAt,
      });
    }

    const data = requests.map((r) => ({
      requestId:      r._id,
      studentId:      r.studentId,
      rollNo:         r.studentSnapshot?.rollNo,
      name:           r.studentSnapshot?.name,
      batchId:        r.batchId?._id ?? r.batchId,
      className:      r.batchId?.className ?? null,
      overriddenAt:   r.overriddenAt,
      overrideRemark: r.overrideRemark,
      dues:           dueMap[r._id.toString()] ?? [],
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
    const batch = await NodueBatch.findById(request.batchId)
      .select('status departmentId')
      .lean();
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

    // Surgical cache invalidation — student sees updated status, HoD overview refreshes
    invalidateKeys([
      `student_status:${request.studentId}`,
      `batch_status:${request.batchId}`,
      `hod_overview:${hodDept(req)}`,
    ]);

    logger.info('hod_override', {
      timestamp: new Date().toISOString(), actor: req.user.userId,
      action: 'HOD_OVERRIDE', resource_id: requestId,
      remark: overrideRemark.trim(),
    });

    pushEvent([request.studentId.toString()], 'HOD_OVERRIDE', {
      studentId:      request.studentId,
      requestId,
      status:         'hod_override',
      overrideRemark: request.overrideRemark,
    });

    return res.status(200).json({
      success: true,
      data: {
        requestId:      request._id,
        status:         'hod_override',
        overriddenBy:   req.user.userId,
        overrideRemark: request.overrideRemark,
        overriddenAt:   request.overriddenAt,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── BATCH OPERATIONS ─────────────────────────────────────────────────────────

export const bulkOverrideDues = async (req, res, next) => {
  try {
    const { requestIds, overrideRemark } = req.body;
    if (!Array.isArray(requestIds) || !requestIds.length || !overrideRemark?.trim()) {
      return next(new ErrorResponse('requestIds array and overrideRemark are required', 400, 'VALIDATION_ERROR'));
    }

    const deptId = hodDept(req);
    const now = new Date();
    const remark = overrideRemark.trim();

    // 1. Fetch valid requests
    const requests = await NodueRequest.find({
      _id: { $in: requestIds },
      status: 'has_dues'
    });

    if (!requests.length) {
      return next(new ErrorResponse('No applicable requests found with dues', 404, 'NOT_FOUND'));
    }

    const batchIds = [...new Set(requests.map(r => r.batchId.toString()))];
    const activeBatches = await NodueBatch.find({
      _id: { $in: batchIds },
      departmentId: deptId,
      status: 'active'
    }).select('_id').lean();

    const activeBatchIdSet = new Set(activeBatches.map(b => b._id.toString()));
    const eligibleRequests = requests.filter(r => activeBatchIdSet.has(r.batchId.toString()));

    if (!eligibleRequests.length) {
      return next(new ErrorResponse('All specified batches are closed or inaccessible', 400, 'BATCH_CLOSED'));
    }

    // 2. Perform batch update
    const finalIds = eligibleRequests.map(r => r._id);
    await NodueRequest.updateMany(
      { _id: { $in: finalIds } },
      {
        status: 'hod_override',
        overriddenBy: req.user.userId,
        overrideRemark: remark,
        overriddenAt: now,
        updatedAt: now
      }
    );

    // 3. Side effects: Notifications & Invalidation
    const studentIds = eligibleRequests.map(r => r.studentId.toString());
    const affectedBatchIds = [...new Set(eligibleRequests.map(r => r.batchId.toString()))];

    pushEvent(studentIds, 'HOD_OVERRIDE', {
      status: 'hod_override',
      bulk: true,
      overrideRemark: remark,
      timestamp: now
    });

    // Invalidate caches
    invalidateKeys([`hod_overview:${deptId}`]);
    affectedBatchIds.forEach(bid => invalidateKeys([`batch_status:${bid}`]));
    studentIds.forEach(sid => invalidateKeys([`student_status:${sid}`]));

    logger.info('hod_bulk_override', {
      timestamp: now.toISOString(),
      actor: req.user.userId,
      count: finalIds.length,
      action: 'BULK_HOD_OVERRIDE'
    });

    return res.status(200).json({
      success: true,
      data: {
        processed: finalIds.length,
        skipped: requestIds.length - finalIds.length
      }
    });
  } catch (err) {
    next(err);
  }
};
