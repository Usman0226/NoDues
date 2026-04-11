import NodueRequest from '../models/NodueRequest.js';
import NodueApproval from '../models/NodueApproval.js';
import NodueBatch from '../models/NodueBatch.js';
import ErrorResponse from '../utils/errorResponse.js';

// ── GET /api/student/status ───────────────────────────────────────────────────
export const getStudentStatus = async (req, res, next) => {
  try {
    const { userId } = req.user;

    // Find most recent active (or latest) request for this student
    const request = await NodueRequest.findOne({ studentId: userId })
      .sort({ createdAt: -1 })
      .lean();

    if (!request) {
      return res.status(200).json({
        success: true,
        data: {
          status: 'no_batch',
          message: 'No no-due batch initiated for your class',
          approvals: [],
        },
      });
    }

    const approvals = await NodueApproval.find({ requestId: request._id })
      .populate('facultyId', 'name employeeId')
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        requestId:     request._id,
        batchId:       request.batchId,
        status:        request.status,
        overrideRemark: request.overrideRemark ?? null,
        approvals: approvals.map((a) => ({
          _id:          a._id,
          facultyName:  a.facultyId?.name,
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

// ── GET /api/student/history ──────────────────────────────────────────────────
export const getStudentHistory = async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { page = 1, limit = 10 } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const [requests, total] = await Promise.all([
      NodueRequest.find({ studentId: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
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

    // Enrich with batch semester/academicYear for display
    const batchIds  = requests.map((r) => r.batchId);
    const batches   = await NodueBatch.find({ _id: { $in: batchIds } }, 'semester academicYear className').lean();
    const batchMap  = Object.fromEntries(batches.map((b) => [b._id.toString(), b]));

    const data = requests.map((r) => {
      const b = batchMap[r.batchId?.toString()] ?? {};
      return {
        requestId:    r._id,
        batchId:      r.batchId,
        className:    b.className ?? null,
        semester:     b.semester  ?? null,
        academicYear: b.academicYear ?? null,
        status:       r.status,
        overrideRemark: r.overrideRemark ?? null,
        createdAt:    r.createdAt,
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
