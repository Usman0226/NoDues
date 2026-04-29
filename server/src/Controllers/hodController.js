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
import { startSafeTransaction, commitSafeTransaction, abortSafeTransaction } from '../utils/safeTransaction.js';

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
        .select('_id classId className semester academicYear status initiatedAt')
        .populate('classId', 'name')
        .lean();

      if (!activeBatches.length) return { batches: [], insights: null };

      const batchIds = activeBatches.map((b) => b._id);

      // Aggregation 1: Student-level status
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

      // Aggregation 2: Approval-level status (the "Approvals" 142 items)
      const approvalCounts = await NodueApproval.aggregate([
        { $match: { batchId: { $in: batchIds } } },
        {
          $group: {
            _id:           '$batchId',
            totalItems:    { $sum: 1 },
            approvedItems: { $sum: { $cond: [{ $eq: ['$action', 'approved'] }, 1, 0] } }
          }
        }
      ]);

      // Aggregation 3: Due Type Breakdown (Insights 1)
      const dueBreakdown = await NodueApproval.aggregate([
        { $match: { batchId: { $in: batchIds }, action: 'due_marked' } },
        {
          $group: {
            _id: '$dueType',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ]);

      // Aggregation 4: Faculty Bottlenecks (Insights 2)
      const bottlenecks = await NodueApproval.aggregate([
        { $match: { batchId: { $in: batchIds }, action: { $in: ['pending', 'not_submitted'] } } },
        {
          $group: {
            _id: '$facultyId',
            pendingCount: { $sum: 1 }
          }
        },
        { $sort: { pendingCount: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: 'faculties',
            localField: '_id',
            foreignField: '_id',
            as: 'faculty'
          }
        },
        { $unwind: '$faculty' },
        {
          $project: {
            _id: 1,
            name: '$faculty.name',
            count: '$pendingCount'
          }
        }
      ]);

      const countMap = Object.fromEntries(statusCounts.map((s) => [s._id.toString(), s]));
      const approvalMap = Object.fromEntries(approvalCounts.map((s) => [s._id.toString(), s]));

      const batches = activeBatches.map((b) => {
        const counts = countMap[b._id.toString()] ?? { total: 0, cleared: 0, hasDues: 0, pending: 0, overridden: 0 };
        const apCounts = approvalMap[b._id.toString()] ?? { totalItems: 0, approvedItems: 0 };
        
        return {
          batchId:      b._id,
          className:    b.className || b.classId?.name || `Batch ${b._id.toString().slice(-4)}`,
          semester:     b.semester,
          academicYear: b.academicYear,
          status:       b.status,
          total:        counts.total,
          cleared:      counts.cleared,
          hasDues:      counts.hasDues,
          pending:      counts.pending,
          overridden:   counts.overridden,
          totalItems:    apCounts.totalItems,
          approvedItems: apCounts.approvedItems,
          initiatedAt:  b.initiatedAt,
        };
      });

      return {
        batches,
        insights: {
          dueBreakdown: dueBreakdown.map(d => ({ 
            name: d._id ? d._id.charAt(0).toUpperCase() + d._id.slice(1) : 'Other', 
            value: d.count 
          })),
          bottlenecks
        }
      };
    });

    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const getActivity = async (req, res, next) => {
  try {
    const deptId = hodDept(req);
    
    // 1. Get all batches for this department
    const deptBatches = await NodueBatch.find({ departmentId: deptId }, '_id').lean();
    const batchIds = deptBatches.map((b) => b._id);

    if (!batchIds.length) return res.status(200).json({ success: true, data: [] });

    // 2. Fetch last 5 approvals (actioned) and last 5 overrides
    const [approvals, overrides] = await Promise.all([
      NodueApproval.find({ 
        batchId: { $in: batchIds }, 
        action: { $in: ['approved', 'due_marked'] } 
      })
        .sort({ actionedAt: -1 })
        .limit(5)
        .populate('facultyId', 'name')
        .lean(),
      NodueRequest.find({
        batchId: { $in: batchIds },
        status: 'hod_override'
      })
        .sort({ overriddenAt: -1 })
        .limit(5)
        .lean()
    ]);

    // 3. Normalize into a single timeline feed
    const feed = [
      ...approvals.map(a => ({
        id: a._id,
        type: a.action === 'approved' ? 'CLEARANCE' : 'DUE_FLAG',
        actor: a.facultyId?.name || 'Faculty',
        student: a.studentName || a.studentRollNo,
        context: a.subjectName || a.approvalType,
        timestamp: a.actionedAt,
        remark: a.remarks
      })),
      ...overrides.map(o => ({
        id: o._id,
        type: 'HOD_OVERRIDE',
        actor: 'Department Office',
        student: o.studentSnapshot?.name || o.studentSnapshot?.rollNo,
        context: 'Manual Clearance',
        timestamp: o.overriddenAt,
        remark: o.overrideRemark
      }))
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    return res.status(200).json({ success: true, data: feed.slice(0, 10) });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/hod/dues ─────────────────────────────────────────────────────────
export const getDues = async (req, res, next) => {
  try {
    const deptId = hodDept(req);
    const { page = 1, limit = 20, status = 'has_dues', search = '' } = req.query;

    const batchFilter = { departmentId: deptId };
    if (status !== 'hod_override') batchFilter.status = 'active';

    // Get dept batch IDs — small result, indexed on departmentId
    const deptBatches  = await NodueBatch.find(batchFilter, '_id').lean();
    const batchIdSet   = deptBatches.map((b) => b._id);

    const skip = (Number(page) - 1) * Number(limit);
    const query = { batchId: { $in: batchIdSet }, status };

    if (search) {
      query.$or = [
        { 'studentSnapshot.name': { $regex: search, $options: 'i' } },
        { 'studentSnapshot.rollNo': { $regex: search, $options: 'i' } },
      ];
    }

    const [requests, total] = await Promise.all([
      NodueRequest.find(query)
        .select('_id studentId studentSnapshot batchId overriddenAt overrideRemark')
        .skip(skip)
        .limit(Number(limit))
        .populate('batchId', 'className semester academicYear')
        .lean(),
      NodueRequest.countDocuments(query),
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

    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
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
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);
    const { requestId, overrideRemark } = req.body;
    if (!requestId || !overrideRemark?.trim()) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('requestId and overrideRemark are required', 400, 'VALIDATION_ERROR'));
    }

    const request = await NodueRequest.findById(requestId).session(session);
    if (!request) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Request not found', 404, 'NOT_FOUND'));
    }

    if (request.status !== 'has_dues') {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Override is only allowed for requests with dues', 400, 'OVERRIDE_NOT_APPLICABLE'));
    }

    // Verify this request belongs to an active batch in HoD's department
    const batch = await NodueBatch.findById(request.batchId)
      .select('status departmentId')
      .session(session)
      .lean();
    if (!batch || batch.status !== 'active') {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Batch is closed', 400, 'BATCH_CLOSED'));
    }
    if (batch.departmentId?.toString() !== hodDept(req)) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    request.status         = 'hod_override';
    request.overriddenBy   = req.user.userId;
    request.overrideRemark = overrideRemark.trim();
    request.overriddenAt   = new Date();
    await request.save({ session });

    await commitSafeTransaction(session);

    // Bust the HoD overview cache so the dashboard reflects this override immediately
    invalidateKeys(`hod_overview:${batch.departmentId.toString()}`);

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
    await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
};

// ── BATCH OPERATIONS ─────────────────────────────────────────────────────────

export const bulkOverrideDues = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);
    const { requestIds, overrideRemark } = req.body;
    if (!Array.isArray(requestIds) || !requestIds.length || !overrideRemark?.trim()) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('requestIds array and overrideRemark are required', 400, 'VALIDATION_ERROR'));
    }

    const deptId = hodDept(req);
    const now = new Date();
    const remark = overrideRemark.trim();

    // 1. Fetch valid requests
    const requests = await NodueRequest.find({
      _id: { $in: requestIds },
      status: 'has_dues'
    }).session(session);

    if (!requests.length) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('No applicable requests found with dues', 404, 'NOT_FOUND'));
    }

    const batchIds = [...new Set(requests.map(r => r.batchId.toString()))];
    const activeBatches = await NodueBatch.find({
      _id: { $in: batchIds },
      departmentId: deptId,
      status: 'active'
    }).session(session).select('_id').lean();

    const activeBatchIdSet = new Set(activeBatches.map(b => b._id.toString()));
    const eligibleRequests = requests.filter(r => activeBatchIdSet.has(r.batchId.toString()));

    if (!eligibleRequests.length) {
      await abortSafeTransaction(session);
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
      },
      { session }
    );

    await commitSafeTransaction(session);

    // 3. Side effects: Notifications & Invalidation
    const studentIds = eligibleRequests.map(r => r.studentId.toString());
    const affectedBatchIds = [...new Set(eligibleRequests.map(r => r.batchId.toString()))];

    // Bust HoD overview so the dashboard reflects bulk overrides immediately
    // deptId is constant across all eligible batches since we already filtered by it
    invalidateKeys(`hod_overview:${deptId}`);

    pushEvent(studentIds, 'HOD_OVERRIDE', {
      status: 'hod_override',
      bulk: true,
      overrideRemark: remark,
      timestamp: now
    });

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
    await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
};
