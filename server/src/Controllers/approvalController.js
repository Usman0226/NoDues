import NodueApproval from '../models/NodueApproval.js';
import NodueRequest from '../models/NodueRequest.js';
import NodueBatch from '../models/NodueBatch.js';
import ErrorResponse from '../utils/errorResponse.js';
import { logger } from '../middlewares/logger.js';
import { pushEvent } from './sseController.js';

// ── GET /api/approvals/pending ────────────────────────────────────────────────
export const getPendingApprovals = async (req, res, next) => {
  try {
    const { userId } = req.user;

    // Only active batches — join via batchId
    const activeBatchIds = await NodueBatch.find({ status: 'active' }, '_id').lean();
    const batchIdSet = activeBatchIds.map((b) => b._id);

    const approvals = await NodueApproval.find({
      facultyId: userId,
      action:    'pending',
      batchId:   { $in: batchIdSet },
    })
      .sort({ createdAt: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: approvals.map((a) => ({
        _id:          a._id,
        batchId:      a.batchId,
        studentId:    a.studentId,
        studentRollNo: a.studentRollNo,
        studentName:   a.studentName,
        subjectName:   a.subjectName,
        approvalType:  a.approvalType,
        roleTag:       a.roleTag,
        action:        a.action,
      })),
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/approvals/history ────────────────────────────────────────────────
export const getApprovalHistory = async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { semester, page = 1, limit = 20 } = req.query;

    const query = { facultyId: userId, action: { $ne: 'pending' } };

    // Filter by semester via batch
    if (semester) {
      const batchIds = await NodueBatch.find({ semester: Number(semester) }, '_id').lean();
      query.batchId = { $in: batchIds.map((b) => b._id) };
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [approvals, total] = await Promise.all([
      NodueApproval.find(query)
        .sort({ actionedAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      NodueApproval.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: approvals.map((a) => ({
        _id:           a._id,
        batchId:       a.batchId,
        studentRollNo: a.studentRollNo,
        studentName:   a.studentName,
        subjectName:   a.subjectName,
        approvalType:  a.approvalType,
        roleTag:       a.roleTag,
        action:        a.action,
        dueType:       a.dueType ?? null,
        remarks:       a.remarks ?? null,
        actionedAt:    a.actionedAt,
      })),
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

    // Verify batch is still active
    const batch = await NodueBatch.findById(approval.batchId).lean();
    if (!batch || batch.status !== 'active') {
      return next(new ErrorResponse('Batch is closed', 400, 'BATCH_CLOSED'));
    }

    approval.action     = 'approved';
    approval.dueType    = null;
    approval.remarks    = null;
    approval.actionedAt = new Date();
    await approval.save();

    // Re-calculate overall request status
    await recalcRequestStatus(approval.requestId);

    logger.info('approval_actioned', {
      timestamp: new Date().toISOString(), actor: req.user.userId,
      action: 'APPROVE', resource_id: approvalId,
    });

    // Notify student via SSE
    pushEvent([approval.studentId.toString()], 'APPROVAL_UPDATED', {
      studentId: approval.studentId,
      requestId: approval.requestId,
      approvalId,
      action: 'approved'
    });

    return res.status(200).json({ success: true, data: { approvalId, action: 'approved' } });
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

    const batch = await NodueBatch.findById(approval.batchId).lean();
    if (!batch || batch.status !== 'active') {
      return next(new ErrorResponse('Batch is closed', 400, 'BATCH_CLOSED'));
    }

    approval.action     = 'due_marked';
    approval.dueType    = dueType;
    approval.remarks    = remarks ?? null;
    approval.actionedAt = new Date();
    await approval.save();

    await recalcRequestStatus(approval.requestId);

    logger.info('due_marked', {
      timestamp: new Date().toISOString(), actor: req.user.userId,
      action: 'MARK_DUE', resource_id: approvalId, dueType,
    });

    // Notify student via SSE
    pushEvent([approval.studentId.toString()], 'APPROVAL_UPDATED', {
      studentId: approval.studentId,
      requestId: approval.requestId,
      approvalId,
      action: 'due_marked',
      dueType,
      remarks: approval.remarks
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

    // Only allow update while batch is active
    const batch = await NodueBatch.findById(approval.batchId).lean();
    if (!batch || batch.status !== 'active') {
      return next(new ErrorResponse('Cannot update approval — batch is closed', 400, 'BATCH_CLOSED'));
    }

    const VALID_ACTIONS = ['approved', 'due_marked'];
    if (action && !VALID_ACTIONS.includes(action)) {
      return next(new ErrorResponse(`action must be one of: ${VALID_ACTIONS.join(', ')}`, 400, 'VALIDATION_ERROR'));
    }
    if (action === 'due_marked' && !dueType) {
      return next(new ErrorResponse('dueType required when action is due_marked', 400, 'VALIDATION_ERROR'));
    }

    if (action)   approval.action     = action;
    if (dueType)  approval.dueType    = dueType;
    if (remarks !== undefined) approval.remarks = remarks;
    approval.actionedAt = new Date();
    await approval.save();

    await recalcRequestStatus(approval.requestId);

    logger.info('approval_updated', {
      timestamp: new Date().toISOString(), actor: req.user.userId,
      action: 'UPDATE_APPROVAL', resource_id: approvalId,
    });

    // Notify student via SSE
    pushEvent([approval.studentId.toString()], 'APPROVAL_UPDATED', {
      studentId: approval.studentId,
      requestId: approval.requestId,
      approvalId,
      action: approval.action,
      dueType: approval.dueType,
      remarks: approval.remarks
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
/**
 * Recalculates and saves NodueRequest.status based on all its approvals.
 * Rules:
 *  - Any due_marked → has_dues
 *  - All approved, none pending → cleared
 *  - Otherwise → pending
 */
async function recalcRequestStatus(requestId) {
  const approvals = await NodueApproval.find({ requestId }, 'action').lean();

  const hasDue    = approvals.some((a) => a.action === 'due_marked');
  const allCleared = approvals.every((a) => a.action === 'approved');

  let status = 'pending';
  if (hasDue)       status = 'has_dues';
  else if (allCleared) status = 'cleared';

  await NodueRequest.findByIdAndUpdate(requestId, { status, updatedAt: new Date() });
}
