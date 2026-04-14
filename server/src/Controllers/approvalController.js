import mongoose from 'mongoose';
import NodueApproval from '../models/NodueApproval.js';
import NodueRequest from '../models/NodueRequest.js';
import NodueBatch from '../models/NodueBatch.js';
import ErrorResponse from '../utils/errorResponse.js';
import logger from '../utils/logger.js';
import { pushEvent } from './sseController.js';
// Cache invalidation is now handled via Mongoose hooks in the model.

// ── GET /api/approvals/pending ────────────────────────────────────────────────
export const getPendingApprovals = async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { page = 1, limit = 20, search = '', batchId, action } = req.query;
    
    // Validate requested batch accessibility
    const activeBatchIds = await NodueBatch.find(
      { status: 'active' },
      '_id'
    ).lean();

    if (!activeBatchIds.length) {
      return res.status(200).json({ success: true, data: [] });
    }

    const batchIdSet = activeBatchIds.map((b) => b._id);

    const query = {
      facultyId: userId,
    };

    // Action filter: default to 'pending' unless 'all' is explicitly requested
    if (action !== 'all') {
      query.action = action || 'pending';
    }

    // Batch filter: scope to specified batch if valid active batch, otherwise all active batches
    if (batchId && batchIdSet.some(id => id.toString() === batchId.toString())) {
      query.batchId = batchId;
    } else {
      query.batchId = { $in: batchIdSet };
    }

    if (search) {
      query.$or = [
        { studentName: { $regex: search, $options: 'i' } },
        { studentRollNo: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [approvals, total] = await Promise.all([
      NodueApproval.find(query)
        .select('_id batchId studentId studentRollNo studentName subjectName subjectId approvalType roleTag action createdAt')
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      NodueApproval.countDocuments(query),
    ]);

    // Build a batch className lookup map — single query, O(1) per approval
    const batchMap = {};
    activeBatchIds.forEach((b) => { batchMap[b._id.toString()] = b.className || null; });

    // Re-fetch batch className if not available (M0-safe: batchIds already loaded)
    const batchesWithName = await NodueBatch.find(
      { _id: { $in: batchIdSet } },
      '_id className'
    ).lean();
    batchesWithName.forEach((b) => { batchMap[b._id.toString()] = b.className || null; });

    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    return res.status(200).json({
      success: true,
      data: approvals.map((a) => ({
        _id:           a._id,
        batchId:       a.batchId,
        className:     batchMap[a.batchId?.toString()] ?? null,
        studentId:     a.studentId,
        studentRollNo: a.studentRollNo,
        studentName:   a.studentName,
        subjectName:   a.subjectName,
        subjectId:     a.subjectId ?? null,
        approvalType:  a.approvalType,
        roleTag:       a.roleTag,
        action:        a.action,
      })),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/approvals/history ────────────────────────────────────────────────
export const getApprovalHistory = async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { semester, page = 1, limit = 20, search = '' } = req.query;

    const query = { facultyId: userId, action: { $ne: 'pending' } };

    if (search) {
      query.$or = [
        { studentName: { $regex: search, $options: 'i' } },
        { studentRollNo: { $regex: search, $options: 'i' } },
      ];
    }

    if (semester) {
      // Filter by semester via batch — two queries but both indexed
      const batchIds = await NodueBatch.find(
        { semester: Number(semester) },
        '_id'
      ).lean();
      query.batchId = { $in: batchIds.map((b) => b._id) };
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [approvals, total] = await Promise.all([
      NodueApproval.find(query)
        .select('_id batchId studentRollNo studentName subjectName approvalType roleTag action dueType remarks actionedAt')
        .sort({ actionedAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      NodueApproval.countDocuments(query),
    ]);

    // Fetch className for each unique batchId — single aggregation
    const batchIds = [...new Set(approvals.map((a) => a.batchId?.toString()).filter(Boolean))];
    const batches  = batchIds.length
      ? await NodueBatch.find({ _id: { $in: batchIds } }, '_id className semester academicYear').lean()
      : [];
    const batchMap = {};
    batches.forEach((b) => { batchMap[b._id.toString()] = b; });

    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    return res.status(200).json({
      success: true,
      data: approvals.map((a) => {
        const batch = batchMap[a.batchId?.toString()];
        return {
          _id:           a._id,
          batchId:       a.batchId,
          className:     batch?.className ?? null,
          semester:      batch?.semester  ?? null,
          academicYear:  batch?.academicYear ?? null,
          studentRollNo: a.studentRollNo,
          studentName:   a.studentName,
          subjectName:   a.subjectName,
          approvalType:  a.approvalType,
          roleTag:       a.roleTag,
          action:        a.action,
          dueType:       a.dueType ?? null,
          remarks:       a.remarks ?? null,
          actionedAt:    a.actionedAt,
        };
      }),
      pagination: {
        page: Number(page), limit: Number(limit), total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/approvals/approve ───────────────────────────────────────────────
export const approveRequest = async (req, res, next) => {
  try {
    const { approvalId } = req.body;
    if (!approvalId) return next(new ErrorResponse('approvalId is required', 400, 'VALIDATION_ERROR'));

    const approval = await NodueApproval.findOne({ _id: approvalId, facultyId: req.user.userId });
    if (!approval) return next(new ErrorResponse('Approval record not found', 404, 'NOT_FOUND'));

    if (approval.action !== 'pending') {
      return next(new ErrorResponse('This approval has already been actioned', 400, 'APPROVAL_ALREADY_ACTIONED'));
    }

    const batch = await NodueBatch.findById(approval.batchId).select('status').lean();
    if (!batch || batch.status !== 'active') {
      return next(new ErrorResponse('Batch is closed', 400, 'BATCH_CLOSED'));
    }

    approval.action     = 'approved';
    approval.dueType    = null;
    approval.remarks    = null;
    approval.actionedAt = new Date();
    await approval.save();

    await Promise.all([recalcRequestStatus(approval.requestId)]);

    // Invalidation handled by hooks

    logger.info('approval_actioned', {
      timestamp: new Date().toISOString(), actor: req.user.userId,
      action: 'APPROVE', resource_id: approvalId,
    });

    pushEvent([approval.studentId.toString(), req.user.userId.toString()], 'APPROVAL_UPDATED', {
      studentId:  approval.studentId,
      requestId:  approval.requestId,
      approvalId,
      action:     'approved',
    });

    return res.status(200).json({ success: true, data: { approvalId, action: 'approved' } });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/approvals/bulk-approve ──────────────────────────────────────────
export const bulkApproveRequests = async (req, res, next) => {
  try {
    const { approvalIds } = req.body;
    if (!Array.isArray(approvalIds) || !approvalIds.length) {
      return next(new ErrorResponse('approvalIds array is required', 400, 'VALIDATION_ERROR'));
    }

    const approvals = await NodueApproval.find({
      _id: { $in: approvalIds },
      facultyId: req.user.userId,
      action: 'pending'
    });

    if (!approvals.length) {
      return next(new ErrorResponse('No pending approval records found with provided IDs', 404, 'NOT_FOUND'));
    }

    const batchIds = [...new Set(approvals.map(a => a.batchId))];
    const batches = await NodueBatch.find({ _id: { $in: batchIds }, status: 'active' }).select('_id').lean();
    const activeBatchIds = new Set(batches.map(b => b._id.toString()));

    const eligibleApprovals = approvals.filter(a => activeBatchIds.has(a.batchId.toString()));
    
    if (!eligibleApprovals.length) {
      return next(new ErrorResponse('All specified batches are closed or inaccessible', 400, 'BATCH_CLOSED'));
    }

    const now = new Date();
    const results = [];
    const requestIdsToRecalc = new Set();
    const studentIdsToNotify = new Set();

    for (const approval of eligibleApprovals) {
      approval.action = 'approved';
      approval.dueType = null;
      approval.remarks = null;
      approval.actionedAt = now;
      await approval.save();

      requestIdsToRecalc.add(approval.requestId.toString());
      studentIdsToNotify.add(approval.studentId.toString());
      results.push(approval._id);

      // Invalidation handled by hooks
    }

    await Promise.all([...requestIdsToRecalc].map(id => recalcRequestStatus(id)));

    logger.info('bulk_approval_actioned', {
      timestamp: now.toISOString(),
      actor: req.user.userId,
      count: results.length,
      action: 'BULK_APPROVE'
    });

    if (studentIdsToNotify.size > 0) {
      pushEvent([...studentIdsToNotify, req.user.userId.toString()], 'APPROVAL_UPDATED', {
        action: 'approved',
        bulk: true,
        timestamp: now
      });
    }

    return res.status(200).json({
      success: true,
      data: { 
        processed: results.length, 
        ids: results,
        skipped: approvalIds.length - results.length
      }
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/approvals/mark-due ──────────────────────────────────────────────
export const markDue = async (req, res, next) => {
  try {
    const { approvalId, dueType, remarks } = req.body;
    if (!approvalId || !dueType) {
      return next(new ErrorResponse('approvalId and dueType are required', 400, 'VALIDATION_ERROR'));
    }

    const VALID_DUE_TYPES = ['library', 'lab', 'fees', 'attendance', 'other'];
    if (!VALID_DUE_TYPES.includes(dueType)) {
      return next(new ErrorResponse(`Invalid dueType. Must be one of: ${VALID_DUE_TYPES.join(', ')}`, 400, 'VALIDATION_ERROR'));
    }

    const approval = await NodueApproval.findOne({ _id: approvalId, facultyId: req.user.userId });
    if (!approval) return next(new ErrorResponse('Approval record not found', 404, 'NOT_FOUND'));

    if (approval.action !== 'pending') {
      return next(new ErrorResponse('This approval has already been actioned', 400, 'APPROVAL_ALREADY_ACTIONED'));
    }

    const batch = await NodueBatch.findById(approval.batchId).select('status').lean();
    if (!batch || batch.status !== 'active') {
      return next(new ErrorResponse('Batch is closed', 400, 'BATCH_CLOSED'));
    }

    approval.action     = 'due_marked';
    approval.dueType    = dueType;
    approval.remarks    = remarks ?? null;
    approval.actionedAt = new Date();
    await approval.save();

    await recalcRequestStatus(approval.requestId);

    // Invalidation handled by hooks

    logger.info('due_marked', {
      timestamp: new Date().toISOString(), actor: req.user.userId,
      action: 'MARK_DUE', resource_id: approvalId, dueType,
    });

    pushEvent([approval.studentId.toString(), req.user.userId.toString()], 'APPROVAL_UPDATED', {
      studentId:  approval.studentId,
      requestId:  approval.requestId,
      approvalId,
      action:     'due_marked',
      dueType,
      remarks:    approval.remarks,
    });

    return res.status(200).json({
      success: true,
      data: { approvalId, action: 'due_marked', dueType, remarks: approval.remarks },
    });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/approvals/:approvalId ─────────────────────────────────────────
export const updateApproval = async (req, res, next) => {
  try {
    const { approvalId } = req.params;
    const { action, dueType, remarks } = req.body;

    const approval = await NodueApproval.findOne({ _id: approvalId, facultyId: req.user.userId });
    if (!approval) return next(new ErrorResponse('Approval record not found', 404, 'NOT_FOUND'));

    const batch = await NodueBatch.findById(approval.batchId).select('status').lean();
    if (!batch || batch.status !== 'active') {
      return next(new ErrorResponse('Cannot update approval — batch is closed', 400, 'BATCH_CLOSED'));
    }

    const VALID_ACTIONS = ['pending', 'approved', 'due_marked'];
    if (action && !VALID_ACTIONS.includes(action)) {
      return next(new ErrorResponse(`action must be one of: ${VALID_ACTIONS.join(', ')}`, 400, 'VALIDATION_ERROR'));
    }
    if (action === 'due_marked' && !dueType) {
      return next(new ErrorResponse('dueType required when action is due_marked', 400, 'VALIDATION_ERROR'));
    }

    if (action) {
      approval.action = action;
      if (action === 'pending' || action === 'approved') {
        approval.dueType = null;
        approval.remarks = null;
      }
    }
    
    // Allow explicit overriding if provided
    if (dueType !== undefined) approval.dueType = dueType;
    if (remarks !== undefined) approval.remarks = remarks;
    approval.actionedAt = new Date();
    await approval.save();

    await recalcRequestStatus(approval.requestId);

    // Invalidation handled by hooks

    logger.info('approval_updated', {
      timestamp: new Date().toISOString(), actor: req.user.userId,
      action: 'UPDATE_APPROVAL', resource_id: approvalId,
    });

    pushEvent([approval.studentId.toString(), req.user.userId.toString()], 'APPROVAL_UPDATED', {
      studentId:  approval.studentId,
      requestId:  approval.requestId,
      approvalId,
      action:     approval.action,
      dueType:    approval.dueType,
      remarks:    approval.remarks,
    });

    return res.status(200).json({
      success: true,
      data: { approvalId, action: approval.action, dueType: approval.dueType, remarks: approval.remarks },
    });
  } catch (err) {
    next(err);
  }
};

// ── Internal helper ────────────────────────────────────────────────────────────
async function recalcRequestStatus(requestId) {
  const approvals = await NodueApproval.find(
    { requestId },
    'action'
  ).lean();

  const hasDue     = approvals.some((a) => a.action === 'due_marked');
  const allCleared = approvals.every((a) => a.action === 'approved');

  const status = hasDue ? 'has_dues' : allCleared ? 'cleared' : 'pending';

  await NodueRequest.findByIdAndUpdate(requestId, { status, updatedAt: new Date() });
  return status;
}
