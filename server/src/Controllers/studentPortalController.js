import NodueRequest from '../models/NodueRequest.js';
import NodueApproval from '../models/NodueApproval.js';
import NodueBatch from '../models/NodueBatch.js';
import Student from '../models/Student.js';
import { withCache } from '../utils/withCache.js';

// ── GET /api/student/status ───────────────────────────────────────────────────
// Critical-path endpoint: every student hits this simultaneously at deadline.
// Target: < 5ms on cache hit | < 30ms on cache miss.
export const getStudentStatus = async (req, res, next) => {
  try {
    const { userId } = req.user;

    const data = await withCache(`student_status:${userId}`, 30, async () => {
      // Parallel fetch: student meta + most recent request
      const [student, request] = await Promise.all([
        Student.findById(userId)
          .select('rollNo name semester classId departmentId')
          .lean(),
        NodueRequest.findOne({ studentId: userId })
          .sort({ createdAt: -1 })
          .select('_id batchId status overriddenBy overrideRemark overriddenAt')
          .lean(),
      ]);

      if (!request) {
        return {
          status:   'no_batch',
          message:  'No no-due batch initiated for your class',
          approvals: [],
        };
      }

      // Parallel fetch: approvals + batch info — both hit indexes
      const [approvals, batch] = await Promise.all([
        NodueApproval.find({ requestId: request._id })
          .select('subjectName approvalType roleTag action dueType remarks actionedAt facultyName')
          .lean(),
        NodueBatch.findById(request.batchId)
          .select('semester academicYear deadline className')
          .lean(),
      ]);

      // Shape response — no internal IDs, no fields the UI doesn't render
      return {
        requestId:      request._id,
        batchId:        request.batchId,
        className:      batch?.className    ?? null,
        semester:       batch?.semester     ?? null,
        academicYear:   batch?.academicYear ?? null,
        deadline:       batch?.deadline     ?? null,
        rollNo:         student?.rollNo     ?? null,
        name:           student?.name       ?? null,
        status:         request.status,
        overrideRemark: request.overrideRemark ?? null,
        approvals: approvals.map((a) => ({
          facultyName:  a.facultyName  ?? null,
          subjectName:  a.subjectName  ?? null,
          approvalType: a.approvalType,
          roleTag:      a.roleTag,
          action:       a.action,
          dueType:      a.dueType    ?? null,
          remarks:      a.remarks    ?? null,
          actionedAt:   a.actionedAt ?? null,
        })),
      };
    });

    // No browser caching — rely on server-side cache (30s TTL)
    res.setHeader('Cache-Control', 'no-store');
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
      const b = batchMap[r.batchId?.toString()] ?? {};
      return {
        requestId:      r._id,
        batchId:        r.batchId,
        className:      b.className    ?? null,
        semester:       b.semester     ?? null,
        academicYear:   b.academicYear ?? null,
        status:         r.status,
        overrideRemark: r.overrideRemark ?? null,
        createdAt:      r.createdAt,
      };
    });

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
