import NodueRequest from '../models/NodueRequest.js';
import NodueApproval from '../models/NodueApproval.js';
import NodueBatch from '../models/NodueBatch.js';
import Student from '../models/Student.js';
import CoCurricularType from '../models/CoCurricularType.js';
import cache from '../config/cache.js';
import { withCache } from '../utils/withCache.js';

export const invalidateStudentStatusCache = (studentId) => {
  const activeKey = `student_status:${studentId}:active`;
  cache.del(activeKey);
 };

export const getStudentStatus = async (req, res, next) => {
  const userId = req.user.userId;
  const { requestId } = req.params;

  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access restricted to student accounts only.',
          statusCode: 403
        }
      });
    }

    // 60s TTL is fine — explicit invalidation in approvalController guarantees
    // freshness after every approve/due-mark action. The TTL is just a safety net.
    const cacheKey = requestId ? `student_status:${userId}:${requestId}` : `student_status:${userId}:active`;

    // Fetch student and the targeted request (specific ID or latest)
    const [student, request] = await Promise.all([
      Student.findById(userId)
        .select('rollNo name semester classId departmentId coCurricular')
        .lean(),
      requestId 
        ? NodueRequest.findOne({ _id: requestId, studentId: userId })
            .select('_id batchId status facultySnapshot overriddenBy overrideRemark overriddenAt')
            .lean()
        : NodueRequest.findOne({ studentId: userId })
            .sort({ createdAt: -1 })
            .select('_id batchId status facultySnapshot overriddenBy overrideRemark overriddenAt')
            .lean(),
    ]);

    if (!student) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'STUDENT_NOT_FOUND',
          message: 'Student profile not found. Please contact support if this is an error.',
          statusCode: 400
        }
      });
    }

    // 2. Resolve Active Batch for Student's Class
    const getActiveBatchForClass = () => NodueBatch.findOne({ 
      status: 'active',
      classId: student.classId 
    }).lean();

    // If NO request exists (student hasn't been invited to any batch yet)
    if (!request) {
      const activeBatch = await getActiveBatchForClass();
      if (!activeBatch) return res.status(200).json({ success: true, data: { status: 'no_batch' } });
      return res.status(200).json({ success: true, data: { status: 'not_initiated', batchId: activeBatch._id } });
    }

    // 3. Request exists — fetch batch metadata + approvals in parallel
    const [batch, approvals] = await Promise.all([
      NodueBatch.findById(request.batchId)
        .select('semester academicYear deadline className status')
        .lean(),
      NodueApproval.find({ requestId: request._id }).lean(),
    ]);

    // IF viewing active status (no requestId) AND (batch is missing OR batch is closed)
    // THEN check if a NEWER active batch exists before declaring 'no_batch'
    if (!requestId && (!batch || batch.status !== 'active')) {
      const newerActiveBatch = await getActiveBatchForClass();
      if (newerActiveBatch) {
        return res.status(200).json({ 
          success: true, 
          data: { status: 'not_initiated', batchId: newerActiveBatch._id } 
        });
      }
      
      return res.status(200).json({ success: true, data: { 
        status: 'no_batch',
        message: 'Active clearance cycle has concluded.' 
      }});
    }

    // NEW: Fetch all Co-Curricular Types involved to get form fields
    const ccTypeIds = approvals
      .filter(a => a.itemTypeId)
      .map(a => a.itemTypeId)
      .filter(Boolean);
    
    const ccTypes = ccTypeIds.length > 0 
      ? await CoCurricularType.find({ _id: { $in: ccTypeIds } }).select('fields name code isOptional').lean()
      : [];
    const ccTypeMap = new Map(ccTypes.map(t => [t._id.toString(), t]));

    const statusRegistry = approvals.map(a => {
      const snapshot = (Array.isArray(request.facultySnapshot) 
        ? request.facultySnapshot.find(f => 
            (a.approvalType === 'subject' && f.subjectId?.toString() === a.subjectId?.toString()) ||
            (a.itemTypeId && f.itemTypeId?.toString() === a.itemTypeId?.toString()) ||
            (a.approvalType !== 'subject' && !a.itemTypeId && f.roleTag === a.roleTag)
          )
        : request.facultySnapshot?.[a.itemTypeId ? a.itemTypeId.toString() : (a.approvalType === 'subject' ? a.subjectId?.toString() : a.roleTag)]
      ) || {};

      let displayContext = snapshot.subjectName || a.subjectName;
      if (a.roleTag === 'hod') displayContext = 'HoD';
      if (a.roleTag === 'ao') displayContext = 'AO';
      if (a.roleTag === 'classTeacher' && !displayContext) displayContext = 'Classteacher';
      if (a.roleTag === 'mentor' && !displayContext) displayContext = 'Mentor';
      if (a.itemTypeId) displayContext = a.itemTypeName || snapshot.itemTypeName || a.subjectName;

      const submission = a.itemTypeId 
        ? student.coCurricular?.find(c => c.itemTypeId?.toString() === (a.itemTypeId?.toString() || snapshot.itemTypeId?.toString()))
        : null;

      const ccType = a.itemTypeId ? ccTypeMap.get(a.itemTypeId?.toString()) : null;

      return {
        id: a._id,
        facultyName: snapshot.facultyName || 'Department Faculty',
        itemTypeId: a.itemTypeId,
        subjectName: displayContext || 'General Appraisal',
        subjectCode: snapshot.subjectCode || null,
        action: a.action,
        dueType: a.dueType,
        remarks: a.remarks,
        approvalType: a.approvalType,
        roleTag: a.roleTag,
        actionedAt: a.actionedAt,
        isOptional: a.isOptional || ccType?.isOptional || false,
        formFields: ccType?.fields || [],
        submission: submission ? {
          data: submission.submittedData,
          status: submission.status,
          submittedAt: submission.submittedAt
        } : null
      };
    });

    const finalData = {
      status: request.status,
      requestId: request._id,
      batchId: request.batchId,
      metadata: {
        batchName:    batch?.className    || 'Legacy Cycle',
        academicYear: batch?.academicYear || 'Unknown Session',
        semester:     batch?.semester     || '?',
        deadline:     batch?.deadline     || null
      },
      rollNo: student.rollNo,
      studentName: student.name,
      overrides: request.overriddenBy ? {
        remark: request.overrideRemark,
        at: request.overriddenAt
      } : null,
      approvals: statusRegistry
    };

    return res.status(200).json({
      success: true,
      data: finalData
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/student/history ──────────────────────────────────────────────────
export const getStudentHistory = async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { page = 1, limit = 10 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    // Both queries hit the studentId index
    const [requests, total] = await Promise.all([
      NodueRequest.find({ studentId: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .select('_id batchId status overrideRemark createdAt')
        .lean(),
      NodueRequest.countDocuments({ studentId: userId }),
    ]);

    if (!requests.length) {
      return res.status(200).json({
        success: true,
        data: [],
        pagination: { page: Number(page), limit: Number(limit), total: 0, pages: 0 },
      });
    }

    // Enrich with batch metadata — single batch query for all batchIds, no N+1
    const batchIds = requests.map((r) => r.batchId);
    const batches  = await NodueBatch.find(
      { _id: { $in: batchIds } },
      'semester academicYear className'
    ).lean();
    const batchMap = Object.fromEntries(batches.map((b) => [b._id.toString(), b]));

    const data = requests.map((r) => {
      const b = batchMap[r.batchId?.toString()];
      return {
        requestId:      r._id,
        batchId:        r.batchId,
        className:      b?.className    || 'Legacy Cycle',
        semester:       b?.semester     || '?',
        academicYear:   b?.academicYear || 'Unknown Session',
        status:         r.status,
        overrideRemark: r.overrideRemark || null,
        createdAt:      r.createdAt,
      };
    });

    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    return res.status(200).json({
      success: true,
      data,
      pagination: {
        page: Number(page), limit: Number(limit), total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err) {
    next(err);
  }
};
