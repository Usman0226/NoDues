import NodueRequest from '../models/NodueRequest.js';
import NodueApproval from '../models/NodueApproval.js';
import NodueBatch from '../models/NodueBatch.js';
import Student from '../models/Student.js';
import { withCache } from '../utils/withCache.js';

// ── GET /api/student/status ───────────────────────────────────────────────────
// Critical-path endpoint: every student hits this simultaneously at deadline.
// Target: < 5ms on cache hit | < 30ms on cache miss.
export const getStudentStatus = async (req, res, next) => {
  const userId = req.user.userId;
  const { requestId } = req.params; // Support path param for history detail

  try {
    // Distinct cache key for historical requests vs active status
    const cacheKey = requestId ? `student_status:${userId}:${requestId}` : `student_status:${userId}:active`;

    const data = await withCache(cacheKey, 60, async () => {
      // 1. Fetch student and the targeted request (specific ID or latest)
      const [student, request] = await Promise.all([
        Student.findById(userId)
          .select('rollNo name semester classId departmentId')
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

      if (!student) throw new Error('Student profile not found');

      // 2. If NO request exists (student hasn't been invited to any batch yet)
      if (!request) {
        const activeBatch = await NodueBatch.findOne({ 
          status: 'active',
          departmentId: student.departmentId 
        }).lean();

        if (!activeBatch) return { status: 'no_batch' };
        return { status: 'not_initiated', batchId: activeBatch._id };
      }

      // 3. Request exists — verify Parent Batch state
      const batch = await NodueBatch.findById(request.batchId)
        .select('semester academicYear deadline className status')
        .lean();

      // IF viewing active status (no requestId) AND (batch is missing OR batch is closed)
      // THEN redirect to no_batch state
      if (!requestId && (!batch || batch.status !== 'active')) {
        return { 
          status: 'no_batch',
          message: 'Active clearance cycle has concluded.' 
        };
      }

      // If viewing history BUT batch was deleted, we still show the request data 
      // with fallback metadata to prevent the "Taking to Home" (no_batch) loop.

      // 3. Fetch all granular approvals for this request
      const approvals = await NodueApproval.find({ requestId: request._id }).lean();

      // 4. Map to high-fidelity status registry
      const statusRegistry = approvals.map(a => {
        // Resolve lookup against request-time snapshot (handles role changes/deletions)
        const snapshot = (Array.isArray(request.facultySnapshot) 
          ? request.facultySnapshot.find(f => 
              (a.approvalType === 'subject' && f.subjectId?.toString() === a.subjectId?.toString()) ||
              (a.approvalType !== 'subject' && f.roleTag === a.roleTag)
            )
          : request.facultySnapshot?.[a.approvalType === 'subject' ? a.subjectId?.toString() : a.roleTag]
        ) || {};

        let displayContext = snapshot.subjectName || a.subjectName;
        if (a.roleTag === 'hod') displayContext = 'Department Clearance (HoD)';
        if (a.roleTag === 'classTeacher' && !displayContext) displayContext = 'Academic Advisor';
        if (a.roleTag === 'mentor' && !displayContext) displayContext = 'Institutional Mentor';

        return {
          id: a._id,
          facultyName: snapshot.facultyName || 'Department Station',
          subjectName: displayContext || 'General Appraisal',
          subjectCode: snapshot.subjectCode || null,
          action: a.action,
          dueType: a.dueType,
          remarks: a.remarks,
          approvalType: a.approvalType,
          roleTag: a.roleTag,
          actionedAt: a.actionedAt
        };
      });

      return {
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
    });

    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    return res.status(200).json({ success: true, data });
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
