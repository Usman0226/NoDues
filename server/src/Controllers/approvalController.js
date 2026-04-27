import mongoose from 'mongoose';
import NodueApproval from '../models/NodueApproval.js';
import NodueRequest from '../models/NodueRequest.js';
import NodueBatch from '../models/NodueBatch.js';
import Student from '../models/Student.js';
import CoCurricularType from '../models/CoCurricularType.js';
import ErrorResponse from '../utils/errorResponse.js';
import logger from '../utils/logger.js';
import { pushEvent } from './sseController.js';
import { startSafeTransaction, commitSafeTransaction, abortSafeTransaction } from '../utils/safeTransaction.js';
import { invalidateEntityCache } from '../utils/cacheHooks.js';
import { invalidateStudentStatusCache } from './studentPortalController.js';

// ── GET /api/approvals/pending ────────────────────────────────────────────────
export const getPendingApprovals = async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { page = 1, limit = 20, search = '', batchId, action } = req.query;
    
    const activeBatches = await NodueBatch.find(
      { status: 'active' },
      '_id departmentId className classId'
    ).lean();

    if (!activeBatches.length) {
      return res.status(200).json({ success: true, data: [] });
    }

    const batchIdSet = activeBatches.map((b) => b._id);
    let myDeptBatchIds = [];
    if ((req.user.role === 'hod' || req.user.role === 'ao') && req.user.departmentId) {
        myDeptBatchIds = activeBatches
           .filter(b => b.departmentId && b.departmentId.toString() === req.user.departmentId.toString())
           .map(b => b._id);
    }

    const andConditions = [];

    if (action !== 'all') {
      andConditions.push({ action: action || 'pending' });
    }

    // Batch filter: support both explicit batchId OR classId (sent from client filters)
    let targetBatchIds = batchIdSet;
    if (batchId) {
      const match = activeBatches.find(b => 
        b._id.toString() === batchId.toString() || 
        b.classId?.toString() === batchId.toString()
      );
      if (match) {
        targetBatchIds = [match._id];
      }
    }
    andConditions.push({ batchId: { $in: targetBatchIds } });

    // Faculty vs HOD-Department Filter
    if ((req.user.role === 'hod' || req.user.role === 'ao') && myDeptBatchIds.length > 0) {
        andConditions.push({
            $or: [
                { facultyId: userId },
                { 
                    batchId: { $in: myDeptBatchIds }, 
                    approvalType: { $in: ['hodApproval', 'subject', 'classTeacher', 'mentor', 'coCurricular'] }
                }
            ]
        });
    } else {
        andConditions.push({ facultyId: userId });
    }

    if (search) {
      andConditions.push({
          $or: [
            { studentName: { $regex: search, $options: 'i' } },
            { studentRollNo: { $regex: search, $options: 'i' } },
          ]
      });
    }

    const query = andConditions.length > 0 ? { $and: andConditions } : {};

    const skip = (Number(page) - 1) * Number(limit);
    const [approvals, total] = await Promise.all([
      NodueApproval.find(query)
        .select('_id batchId studentId studentRollNo studentName subjectName subjectId approvalType roleTag action createdAt itemTypeId itemTypeName itemCode facultyId')
        .populate('facultyId', 'name')
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      NodueApproval.countDocuments(query),
    ]);

    // Build className map directly from the single activeBatches query above — no second DB call needed
    // Map the nodues roleTa
    const batchMap = {};
    activeBatches.forEach((b) => { batchMap[b._id.toString()] = b.className || null; });

    // NEW: Fetch submission data for Co-Curricular items
    const ccApprovals = approvals.filter(a => a.approvalType === 'coCurricular');
    const studentIds = [...new Set(ccApprovals.map(a => a.studentId))];
    const students = studentIds.length > 0 
      ? await Student.find({ _id: { $in: studentIds } }).select('coCurricular').lean()
      : [];
    const studentMap = new Map(students.map(s => [s._id.toString(), s]));

    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    return res.status(200).json({
      success: true,
      data: approvals.map((a) => {
        const student = studentMap.get(a.studentId.toString());
        const submission = a.approvalType === 'coCurricular' 
          ? student?.coCurricular?.find(cc => cc.itemTypeId?.toString() === a.itemTypeId?.toString())
          : null;

        return {
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
          itemTypeId:    a.itemTypeId ?? null,
          itemTypeName:  a.itemTypeName ?? null,
          itemCode:      a.itemCode ?? null,
          facultyId:     a.facultyId?._id || a.facultyId,
          facultyName:   a.facultyId?.name || null,
          submission: submission ? {
            data: submission.submittedData,
            status: submission.status,
            submittedAt: submission.submittedAt
          } : null
        };
      }),
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

    let myDeptBatchIds = [];
    if ((req.user.role === 'hod' || req.user.role === 'ao') && req.user.departmentId) {
       const deptBatches = await NodueBatch.find({ departmentId: req.user.departmentId }, '_id').lean();
       myDeptBatchIds = deptBatches.map(b => b._id);
    }

    const andConditions = [
      { action: { $ne: 'pending' } }
    ];

    if ((req.user.role === 'hod' || req.user.role === 'ao') && myDeptBatchIds.length > 0) {
       andConditions.push({
           $or: [
               { facultyId: userId },
               { 
                   batchId: { $in: myDeptBatchIds }, 
                   approvalType: { $in: ['hodApproval', 'subject', 'classTeacher', 'mentor', 'coCurricular'] }
               }
           ]
       });
    } else {
       andConditions.push({ facultyId: userId });
    }

    if (search) {
      andConditions.push({
          $or: [
            { studentName: { $regex: search, $options: 'i' } },
            { studentRollNo: { $regex: search, $options: 'i' } },
          ]
      });
    }

    const query = { $and: andConditions };

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
        .select('_id batchId studentRollNo studentName subjectName approvalType roleTag action dueType remarks actionedAt itemTypeId itemTypeName itemCode facultyId')
        .populate('facultyId', 'name')
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
          facultyId:     a.facultyId?._id || a.facultyId,
          facultyName:   a.facultyId?.name || null,
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
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);
    const { approvalId } = req.body;
    if (!approvalId) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('approvalId is required', 400, 'VALIDATION_ERROR'));
    }

    const approval = await NodueApproval.findOne({ _id: approvalId }).session(session);
    if (!approval) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Approval record not found', 404, 'NOT_FOUND'));
    }

    if (approval.action !== 'pending') {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('This approval has already been actioned', 400, 'APPROVAL_ALREADY_ACTIONED'));
    }

    const batch = await NodueBatch.findById(approval.batchId).session(session).select('status departmentId').lean();
    if (!batch || batch.status !== 'active') {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Batch is closed', 400, 'BATCH_CLOSED'));
    }

    if (approval.facultyId.toString() !== req.user.userId.toString()) {
        if ((req.user.role === 'hod' || req.user.role === 'ao') && batch?.departmentId?.toString() === req.user.departmentId?.toString()) {
            if (!['hodApproval', 'subject', 'classTeacher', 'mentor', 'coCurricular'].includes(approval.approvalType)) {
                 await abortSafeTransaction(session);
                 return next(new ErrorResponse('Access denied', 403));
            }
        } else {
            await abortSafeTransaction(session);
            return next(new ErrorResponse('Access denied', 403));
        }
    }

    approval.action     = 'approved';
    approval.dueType    = null;
    approval.remarks    = null;
    approval.actionedAt = new Date();
    
    // Persist identity for departmental clearances
    if (req.user.role === 'hod' || req.user.role === 'ao') {
      approval.roleTag = req.user.role;
    }
    
    await approval.save({ session });

    // NEW: Update Student Co-Curricular status if applicable
    if (approval.approvalType === 'coCurricular') {
      await Student.updateOne(
        { _id: approval.studentId, 'coCurricular.itemTypeId': approval.itemTypeId },
        { 
          $set: { 
            'coCurricular.$.status': 'approved',
            'coCurricular.$.verifiedBy': req.user.userId,
            'coCurricular.$.verifiedAt': new Date()
          } 
        },
        { session }
      );
    }

    await recalcRequestStatus(approval.requestId, session);

    // Invalidate caches: Student dashboard + HoD Grid + Faculty pending
    invalidateEntityCache('request', approval.requestId, approval.studentId);
    invalidateEntityCache('approval', approval.facultyId, approval.batchId);

    await commitSafeTransaction(session);

    logger.audit('APPROVAL_ACTIONED', {
      actor: req.user.userId,
      role: req.user.role,
      action: 'APPROVE',
      resource_id: approvalId,
    });

    pushEvent([approval.studentId.toString(), req.user.userId.toString()], 'APPROVAL_UPDATED', {
      studentId:  approval.studentId,
      requestId:  approval.requestId,
      approvalId,
      action:     'approved',
    });

    return res.status(200).json({ success: true, data: { approvalId, action: 'approved' } });
  } catch (err) {
    if (session.inTransaction()) await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
};

// ── POST /api/approvals/bulk-approve ──────────────────────────────────────────
export const bulkApproveRequests = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);
    const { approvalIds } = req.body;
    if (!Array.isArray(approvalIds) || !approvalIds.length) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('approvalIds array is required', 400, 'VALIDATION_ERROR'));
    }

    const approvals = await NodueApproval.find({
      _id: { $in: approvalIds },
      action: 'pending'
    }).session(session);

    if (!approvals.length) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('No pending approval records found with provided IDs', 404, 'NOT_FOUND'));
    }

    const batchIds = [...new Set(approvals.map(a => a.batchId.toString()))];
    const batches = await NodueBatch.find({ _id: { $in: batchIds }, status: 'active' }).session(session).select('_id departmentId').lean();
    const activeBatchMap = new Map(batches.map(b => [b._id.toString(), b]));

    const eligibleApprovals = approvals.filter(a => {
        const batch = activeBatchMap.get(a.batchId.toString());
        if (!batch) return false;

        if (a.facultyId.toString() !== req.user.userId.toString()) {
            if ((req.user.role === 'hod' || req.user.role === 'ao') && batch.departmentId?.toString() === req.user.departmentId?.toString()) {
                if (!['hodApproval', 'subject', 'classTeacher', 'mentor', 'coCurricular'].includes(a.approvalType)) return false;
            } else {
                return false;
            }
        }
        return true;
    });
    
    if (!eligibleApprovals.length) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('All specified approvals are invalid, closed, or unauthorized', 400, 'UNAUTHORIZED'));
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

      // Persist identity for departmental clearances
      if (req.user.role === 'hod' || req.user.role === 'ao') {
        approval.roleTag = req.user.role;
      }

      await approval.save({ session });

      // NEW: Update Student Co-Curricular status if applicable
      if (approval.approvalType === 'coCurricular') {
        await Student.updateOne(
          { _id: approval.studentId, 'coCurricular.itemTypeId': approval.itemTypeId },
          { 
            $set: { 
              'coCurricular.$.status': 'approved',
              'coCurricular.$.verifiedBy': req.user.userId,
              'coCurricular.$.verifiedAt': now
            } 
          },
          { session }
        );
      }

      requestIdsToRecalc.add(approval.requestId.toString());
      studentIdsToNotify.add(approval.studentId.toString());
      results.push(approval._id);
    }

    for (const id of requestIdsToRecalc) {
      await recalcRequestStatus(id, session);
    }
    await commitSafeTransaction(session);

    // Bulk Invalidation
    studentIdsToNotify.forEach(sId => invalidateEntityCache('student', sId));
    batchIds.forEach(bId => invalidateEntityCache('batch', bId));
    invalidateEntityCache('approval', req.user.userId, 'all'); 

    logger.audit('BULK_APPROVAL_ACTIONED', {
      actor: req.user.userId,
      role: req.user.role,
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
    if (session.inTransaction()) await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
};

// ── POST /api/approvals/mark-due ──────────────────────────────────────────────
export const markDue = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);
    const { approvalId, dueType, remarks } = req.body;
    if (!approvalId || !dueType) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('approvalId and dueType are required', 400, 'VALIDATION_ERROR'));
    }

    const VALID_DUE_TYPES = ['library', 'lab', 'fees', 'attendance', 'other'];
    if (!VALID_DUE_TYPES.includes(dueType)) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse(`Invalid dueType. Must be one of: ${VALID_DUE_TYPES.join(', ')}`, 400, 'VALIDATION_ERROR'));
    }

    const approval = await NodueApproval.findOne({ _id: approvalId }).session(session);
    if (!approval) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Approval record not found', 404, 'NOT_FOUND'));
    }

    if (approval.action !== 'pending') {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('This approval has already been actioned', 400, 'APPROVAL_ALREADY_ACTIONED'));
    }

    const batch = await NodueBatch.findById(approval.batchId).session(session).select('status departmentId').lean();
    if (!batch || batch.status !== 'active') {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Batch is closed', 400, 'BATCH_CLOSED'));
    }

    if (approval.facultyId.toString() !== req.user.userId.toString()) {
        if ((req.user.role === 'hod' || req.user.role === 'ao') && batch?.departmentId?.toString() === req.user.departmentId?.toString()) {
            if (!['hodApproval', 'subject', 'classTeacher', 'mentor', 'coCurricular'].includes(approval.approvalType)) {
                 await abortSafeTransaction(session);
                 return next(new ErrorResponse('Access denied', 403));
            }
        } else {
            await abortSafeTransaction(session);
            return next(new ErrorResponse('Access denied', 403));
        }
    }

    approval.action     = 'due_marked';
    approval.dueType    = dueType;
    approval.remarks    = remarks ?? null;
    approval.actionedAt = new Date();

    // Persist identity for departmental clearances
    if (req.user.role === 'hod' || req.user.role === 'ao') {
      approval.roleTag = req.user.role;
    }

    await approval.save({ session });

    // NEW: Update Student Co-Curricular status if applicable (mark as rejected so they can resubmit)
    if (approval.approvalType === 'coCurricular') {
      await Student.updateOne(
        { _id: approval.studentId, 'coCurricular.itemTypeId': approval.itemTypeId },
        { 
          $set: { 
            'coCurricular.$.status': 'rejected',
            'coCurricular.$.feedback': remarks || 'Documentation insufficient',
            'coCurricular.$.verifiedBy': req.user.userId,
            'coCurricular.$.verifiedAt': new Date()
          } 
        },
        { session }
      );
    }

    await recalcRequestStatus(approval.requestId, session);

    // Invalidate caches: Student dashboard + HoD Grid + Faculty pending
    invalidateEntityCache('request', approval.requestId, approval.studentId);
    invalidateEntityCache('approval', approval.facultyId, approval.batchId);

    await commitSafeTransaction(session);

    logger.audit('DUE_MARKED', {
      actor: req.user.userId,
      role: req.user.role,
      action: 'MARK_DUE',
      resource_id: approvalId,
      dueType,
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
    if (session.inTransaction()) await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
};

// ── PATCH /api/approvals/:approvalId ─────────────────────────────────────────
export const updateApproval = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);
    const { approvalId } = req.params;
    const { action, dueType, remarks } = req.body;

    const approval = await NodueApproval.findOne({ _id: approvalId }).session(session);
    if (!approval) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Approval record not found', 404, 'NOT_FOUND'));
    }

    const batch = await NodueBatch.findById(approval.batchId).session(session).select('status departmentId').lean();
    if (!batch || batch.status !== 'active') {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Cannot update approval — batch is closed', 400, 'BATCH_CLOSED'));
    }

    if (approval.facultyId.toString() !== req.user.userId.toString()) {
        if ((req.user.role === 'hod' || req.user.role === 'ao') && batch?.departmentId?.toString() === req.user.departmentId?.toString()) {
            if (!['hodApproval', 'subject', 'classTeacher', 'mentor', 'coCurricular'].includes(approval.approvalType)) {
                 await abortSafeTransaction(session);
                 return next(new ErrorResponse('Access denied', 403));
            }
        } else {
            await abortSafeTransaction(session);
            return next(new ErrorResponse('Access denied', 403));
        }
    }

    const VALID_ACTIONS = ['pending', 'approved', 'due_marked'];
    if (action && !VALID_ACTIONS.includes(action)) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse(`action must be one of: ${VALID_ACTIONS.join(', ')}`, 400, 'VALIDATION_ERROR'));
    }
    if (action === 'due_marked' && !dueType) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('dueType required when action is due_marked', 400, 'VALIDATION_ERROR'));
    }

    if (action) {
      approval.action = action;
      if (action === 'pending' || action === 'approved') {
        approval.dueType = null;
        approval.remarks = null;
      }
    }
    
    if (dueType !== undefined) approval.dueType = dueType;
    if (remarks !== undefined) approval.remarks = remarks;
    approval.actionedAt = new Date();

    // Persist identity for departmental clearances
    if (req.user.role === 'hod' || req.user.role === 'ao') {
      approval.roleTag = req.user.role;
    }

    await approval.save({ session });

    await recalcRequestStatus(approval.requestId, session);
    await commitSafeTransaction(session);

    // Invalidate caches: Student dashboard + HoD Grid + Faculty pending
    invalidateEntityCache('request', approval.requestId, approval.studentId);
    invalidateEntityCache('approval', approval.facultyId, approval.batchId);

    logger.audit('APPROVAL_UPDATED', {
      actor: req.user.userId,
      role: req.user.role,
      action: 'UPDATE_APPROVAL',
      resource_id: approvalId,
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
    if (session.inTransaction()) await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
};

// ── Internal helper ────────────────────────────────────────────────────────────
async function recalcRequestStatus(requestId, session = null) {
  const query = NodueApproval.find({ requestId }, 'action isOptional');
  if (session) query.session(session);
  const approvals = await query.lean();

  const hasDue     = approvals.some((a) => a.action === 'due_marked');
  
  // Mandatory items + Any optional items that have been actioned/rejected
  const allCleared = approvals.every((a) => {
    if (a.action === 'approved') return true;
    if (a.isOptional && a.action !== 'due_marked') return true; // Optional pending/not_submitted counts as "ok" for final status
    return false;
  });

  const status = hasDue ? 'has_dues' : allCleared ? 'cleared' : 'pending';

  const updateQuery = NodueRequest.findByIdAndUpdate(requestId, { status, updatedAt: new Date() });
  if (session) updateQuery.session(session);
  await updateQuery;
  
  return status;
}
