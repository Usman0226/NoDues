import mongoose from 'mongoose';
import Faculty from '../models/Faculty.js';
import Student from '../models/Student.js';
import Department from '../models/Department.js';
import Class from '../models/Class.js';
import NodueBatch from '../models/NodueBatch.js';
import NodueApproval from '../models/NodueApproval.js';
import NodueRequest from '../models/NodueRequest.js';
import ErrorResponse from '../utils/errorResponse.js';
import cache from '../config/cache.js';
import logger from '../utils/logger.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { sendCredentialEmail } from '../services/emailService.js';
import { startSafeTransaction, commitSafeTransaction, abortSafeTransaction, getSessionOptions } from '../utils/safeTransaction.js';
import { invalidateEntityCache } from '../utils/cacheHooks.js';
import { escapeRegExp } from '../utils/validation.js';

const generateTempPassword = () => crypto.randomBytes(4).toString('hex');

export const getFaculty = async (req, res, next) => {
  try {
    const { departmentId, roleTag, search, page = 1, limit = 50, includeInactive } = req.query;
    const isPrivileged = ['admin', 'hod', 'ao'].includes(req.user.role);

    const query = {};
    if (includeInactive !== 'true' || !isPrivileged) {
      query.isActive = true;
    }

    if (departmentId) {
      if (departmentId !== 'all') {
        query.departmentId = departmentId;
      }
    } else if ((req.user.role === 'hod' || req.user.role === 'ao') && !search) {
      // Default HoDs to their department only when NOT searching globally
      query.departmentId = req.user.departmentId;
    }

    if (roleTag) query.roleTags = roleTag;

    if (search && search.trim()) {
      const escaped = escapeRegExp(search.trim());
      query.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
        { employeeId: { $regex: escaped, $options: 'i' } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    // Short-lived list cache — 30s, bypassed on search queries (volatile)
    const scopeKey = departmentId || req.user.departmentId || 'all';
    const listCacheKey = !search
      ? `faculty:list:${scopeKey}:r${roleTag ?? ''}:p${page}:l${limit}:inc${includeInactive ?? 'false'}`
      : null;

    if (listCacheKey) {
      const cached = cache.get(listCacheKey);
      if (cached) {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
        return res.status(200).json({ success: true, ...cached });
      }
    }

    const [faculty, total] = await Promise.all([
      Faculty.find(query)
        .select('_id name email phone employeeId departmentId roleTags isActive lastLoginAt')
        .populate('departmentId', 'name')
        .sort({ name: 1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Faculty.countDocuments(query),
    ]);

    const facultyIds = faculty.map((f) => f._id);
    const classCountMap = {};

    if (!search && facultyIds.length > 0) {
      const [ctClasses, subjClasses] = await Promise.all([
        Class.find(
          { classTeacherId: { $in: facultyIds }, isActive: true },
          '_id classTeacherId'
        ).lean(),
        Class.find(
          { 'subjectAssignments.facultyId': { $in: facultyIds }, isActive: true },
          '_id subjectAssignments.facultyId'
        ).lean(),
      ]);

      for (const c of ctClasses) {
        const key = c.classTeacherId?.toString();
        if (key) classCountMap[key] = (classCountMap[key] ?? 0) + 1;
      }
      for (const c of subjClasses) {
        for (const a of c.subjectAssignments ?? []) {
          const key = a.facultyId?.toString();
          if (key) classCountMap[key] = (classCountMap[key] ?? 0) + 1;
        }
      }
    }

    const payload = {
      data: faculty.map((f) => ({
        _id:            f._id,
        name:           f.name,
        email:          f.email,
        phone:          f.phone,
        employeeId:     f.employeeId,
        departmentId:   f.departmentId?._id,
        departmentName: f.departmentId?.name ?? null,
        roleTags:       f.roleTags,
        classCount:     classCountMap[f._id.toString()] ?? 0,
        isActive:       f.isActive,
        lastLoginAt:    f.lastLoginAt,
      })),
      pagination: {
        page:  Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    };

    if (listCacheKey) cache.set(listCacheKey, payload, 30);

    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    return res.status(200).json({ success: true, ...payload });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/faculty ─────────────────────────────────────────────────────────
export const createFaculty = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);
    const name = req.body.name?.trim();
    const email = req.body.email?.trim().toLowerCase();
    const phone = req.body.phone?.trim();
    const employeeId = req.body.employeeId?.trim();
    const { departmentId, roleTags } = req.body;

    if (!name || !email || !employeeId || !departmentId) {
      await abortSafeTransaction(session);
      return next(
        new ErrorResponse('name, email, employeeId, departmentId are required', 400, 'VALIDATION_ERROR')
      );
    }

    const dept = await Department.findById(departmentId).session(session).lean();
    if (!dept) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Department not found', 404, 'NOT_FOUND'));
    }

    if ((req.user.role === 'hod' || req.user.role === 'ao') && req.user.departmentId !== departmentId) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    const tempPassword = generateTempPassword();

    const faculty = await Faculty.create([{
      name,
      email,
      phone,
      employeeId,
      departmentId,
      roleTags: roleTags ?? ['faculty'],
      password: tempPassword,
      mustChangePassword: true,
    }], { session });

    await commitSafeTransaction(session);

    logger.info('faculty_created', {
      timestamp: new Date().toISOString(),
      actor: req.user.userId,
      action: 'CREATE_FACULTY',
      resource_id: faculty[0]._id.toString(),
      details: { email: faculty[0].email, employeeId: faculty[0].employeeId }
    });

    const emailResult = await sendCredentialEmail(email, name, email, tempPassword, 'faculty');
    if (!emailResult) {
      logger.warn('Email dispatch failed for new faculty:', { email });
    }

    // Invalidate caches to ensure new faculty appears in dropdowns/lists immediately
    invalidateEntityCache('faculty', faculty[0]._id, departmentId);

    return res.status(201).json({
      success: true,
      data: {
        _id:                faculty[0]._id,
        name:               faculty[0].name,
        email:              faculty[0].email,
        employeeId:         faculty[0].employeeId,
        departmentId:       faculty[0].departmentId,
        departmentName:     dept.name,
        roleTags:           faculty[0].roleTags,
        mustChangePassword: true,
        credentialEmailSent: emailResult,
        isActive:           true,
        createdAt:          faculty[0].createdAt,
      },
    });
  } catch (err) {
    if (session.inTransaction()) await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
};

// ── GET /api/faculty/:id ──────────────────────────────────────────────────────
export const getFacultyById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const cacheKey = `faculty:${id}`;
    const cached   = cache.get(cacheKey);
    if (cached) return res.status(200).json({ success: true, data: cached });

    const faculty = await Faculty.findOne({ _id: id, isActive: true })
      .populate('departmentId', 'name')
      .lean();

    if (!faculty) {
      return next(new ErrorResponse('Faculty not found', 404, 'NOT_FOUND'));
    }

    // HoD visibility: Allow viewing any active faculty
    // Management/Edit remains restricted to department in updateFaculty

    const data = {
      _id:               faculty._id,
      name:              faculty.name,
      email:             faculty.email,
      phone:             faculty.phone,
      employeeId:        faculty.employeeId,
      departmentId:      faculty.departmentId?._id,
      departmentName:    faculty.departmentId?.name ?? null,
      roleTags:          faculty.roleTags,
      mustChangePassword: faculty.mustChangePassword,
      isActive:          faculty.isActive,
      lastLoginAt:       faculty.lastLoginAt,
      createdAt:         faculty.createdAt,
    };

    cache.set(cacheKey, data, 30);
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/faculty/:id ────────────────────────────────────────────────────
export const updateFaculty = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);
    const { id } = req.params;
    const { name, email, phone, roleTags, departmentId } = req.body;

    const faculty = await Faculty.findOne({ _id: id, isActive: true }).session(session);
    if (!faculty) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Faculty not found', 404, 'NOT_FOUND'));
    }

    if (
      (req.user.role === 'hod' || req.user.role === 'ao') &&
      faculty.departmentId?.toString() !== req.user.departmentId
    ) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    const oldDeptId = faculty.departmentId?.toString();
    const isDeptChanged = departmentId !== undefined && departmentId !== oldDeptId;

    if (name         !== undefined) faculty.name         = name;
    if (email        !== undefined) faculty.email        = email;
    if (phone        !== undefined) faculty.phone        = phone;
    if (roleTags     !== undefined) faculty.roleTags     = roleTags;
    if (departmentId !== undefined) faculty.departmentId = departmentId;

    await faculty.save({ session });

    await commitSafeTransaction(session);

    if (name !== undefined) {
      // 1. Update Class subject assignments
      // 2. Update Student elective subjects
      Promise.all([
        Class.updateMany(
          { 'subjectAssignments.facultyId': id },
          { $set: { 'subjectAssignments.$[elem].facultyName': name } },
          { arrayFilters: [{ 'elem.facultyId': id }] }
        ),
        Student.updateMany(
          { 'electiveSubjects.facultyId': id },
          { $set: { 'electiveSubjects.$[elem].facultyName': name } },
          { arrayFilters: [{ 'elem.facultyId': id }] }
        )
      ]).catch(err => logger.error('faculty_name_propagation_failed', { facultyId: id, error: err.message }));
    }

    // Invalidate caches using the centralized hook
    invalidateEntityCache('faculty', id, oldDeptId);
    if (isDeptChanged) {
      invalidateEntityCache('faculty', id, departmentId);
    }

    logger.info('faculty_updated', {
      timestamp: new Date().toISOString(),
      actor: req.user.userId,
      action: 'UPDATE_FACULTY',
      resource_id: id,
      details: { updatedFields: Object.keys(req.body) }
    });

    return res.status(200).json({
      success: true,
      data: { _id: faculty._id, name: faculty.name, roleTags: faculty.roleTags },
    });
  } catch (err) {
    if (session.inTransaction()) await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
};

// ── DELETE /api/faculty/:id (soft delete) ─────────────────────────────────────
export const deleteFaculty = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);
    const { id } = req.params;

    const faculty = await Faculty.findOne({ _id: id, isActive: true }).session(session);
    if (!faculty) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Faculty not found', 404, 'NOT_FOUND'));
    }

    if (
      (req.user.role === 'hod' || req.user.role === 'ao') &&
      faculty.departmentId?.toString() !== req.user.departmentId
    ) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    const deptId = faculty.departmentId?.toString();
    faculty.isActive = false;
    await faculty.save({ session });

    await commitSafeTransaction(session);

    // Invalidate caches
    invalidateEntityCache('faculty', id, deptId);

    logger.info('faculty_deactivated', {
      timestamp: new Date().toISOString(),
      actor: req.user.userId,
      action: 'DELETE_FACULTY',
      resource_id: id,
      details: { email: faculty.email }
    });

    return res.status(200).json({
      success: true,
      data: { message: 'Faculty account deactivated' },
    });
  } catch (err) {
    if (session.inTransaction()) await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
};

// ── GET /api/faculty/:id/classes ──────────────────────────────────────────────
// ── Helper: Attach Clearance Batch Data to Classes ──────────────────────────
const enrichClassesWithBatchData = async (classes, facultyId) => {
  const classIds = classes.map((c) => c._id);
  const batches = classIds.length
    ? await NodueBatch.find({ classId: { $in: classIds } })
        .select('_id classId className status semester academicYear createdAt')
        .sort({ createdAt: -1 })
        .lean()
    : [];

  const batchIds = batches.map((b) => b._id);
  const counts = batchIds.length
    ? await NodueApproval.aggregate([
        { $match: { facultyId: new mongoose.Types.ObjectId(facultyId), batchId: { $in: batchIds } } },
        { $group: { _id: { batchId: '$batchId', action: '$action' }, count: { $sum: 1 } } }
      ])
    : [];

  const countMap = {};
  counts.forEach((c) => {
    const bId = c._id.batchId.toString();
    if (!countMap[bId]) countMap[bId] = { pending: 0, approved: 0, due_marked: 0 };
    if (c._id.action === 'pending' || c._id.action === 'not_submitted') countMap[bId].pending += c.count;
    else if (c._id.action === 'approved') countMap[bId].approved += c.count;
    else if (c._id.action === 'due_marked') countMap[bId].due_marked += c.count;
  });

  const classBatchesMap = {};
  batches.forEach((b) => {
    const cId = b.classId.toString();
    if (!classBatchesMap[cId]) classBatchesMap[cId] = [];
    classBatchesMap[cId].push(b);
  });

  return { classBatchesMap, countMap };
};

// ── GET /api/faculty/me/batches ──────────────────────────────────────────────
export const getFacultyBatches = async (req, res, next) => {
  try {
    const facultyId = new mongoose.Types.ObjectId(req.user.userId);
    const [approvalBatchIds, myClasses] = await Promise.all([
      NodueApproval.distinct('batchId', { facultyId }),
      Class.find({
        $or: [{ classTeacherId: facultyId }, { 'subjectAssignments.facultyId': facultyId }]
      }, '_id').lean(),
    ]);
    const classIds = myClasses.map((c) => c._id);

    const batches = await NodueBatch.find({
      $or: [{ _id: { $in: approvalBatchIds } }, { classId: { $in: classIds } }]
    })
      .select('_id className classId semester academicYear status createdAt deadline')
      .sort({ status: 1, academicYear: -1, semester: -1, createdAt: -1 })
      .lean();

    if (!batches.length) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      return res.status(200).json({ success: true, data: [] });
    }

    const counts = await NodueApproval.aggregate([
      { $match: { facultyId, batchId: { $in: batches.map((b) => b._id) } } },
      { $group: { _id: { batchId: '$batchId', action: '$action' }, count: { $sum: 1 } } }
    ]);

    const countMap = {};
    counts.forEach((c) => {
      const bId = c._id.batchId.toString();
      if (!countMap[bId]) countMap[bId] = { pending: 0, approved: 0, due_marked: 0, total: 0 };
      countMap[bId].total += c.count;
      if (c._id.action === 'pending' || c._id.action === 'not_submitted') countMap[bId].pending += c.count;
      else if (c._id.action === 'approved') countMap[bId].approved += c.count;
      else if (c._id.action === 'due_marked') countMap[bId].due_marked += c.count;
    });

    const data = batches.map((b) => {
      const s = countMap[b._id.toString()] || { pending: 0, approved: 0, due_marked: 0, total: 0 };
      return {
        _id: b._id,
        classId: b.classId,
        name: b.className || 'Unknown Batch',
        semester: b.semester,
        academicYear: b.academicYear,
        status: b.status,
        isClosed: b.status === 'closed',
        deadline: b.deadline,
        createdAt: b.createdAt,
        pendingCount: s.pending,
        approvedCount: s.approved,
        dueCount: s.due_marked,
        totalCount: s.total,
      };
    });

    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/faculty/:id/classes ──────────────────────────────────────────────
export const getFacultyClasses = async (req, res, next) => {
  try {
    const { id } = req.params;
    const includePast = req.query.includePast === 'true';

    const faculty = await Faculty.findOne({ _id: id, isActive: true }).lean();
    if (!faculty) {
      return next(new ErrorResponse('Faculty not found', 404, 'NOT_FOUND'));
    }

    const classQuery = {
      $or: [{ classTeacherId: id }, { 'subjectAssignments.facultyId': id }]
    };
    if (!includePast) classQuery.isActive = true;

    const classes = await Class.find(classQuery)
      .populate('departmentId', 'name')
      .populate('classTeacherId', 'name employeeId')
      .sort({ academicYear: -1, semester: -1, name: 1 })
      .lean();

    const { classBatchesMap, countMap } = await enrichClassesWithBatchData(classes, id);

    const data = classes.flatMap((c) => {
      const rows = [];
      const classBatches = classBatchesMap[c._id.toString()] || [];
      const activeBatch = classBatches.find((b) => b.status === 'active');
      const latestBatch = classBatches[0];
      const targetBatch = activeBatch || latestBatch;
      const bStats = targetBatch ? (countMap[targetBatch._id.toString()] || { pending: 0, approved: 0, due_marked: 0 }) : { pending: 0, approved: 0, due_marked: 0 };
      const batchStatus = activeBatch ? 'active' : (latestBatch ? 'closed' : 'not_initiated');

      const baseInfo = {
        _id:              c._id,
        name:             c.name,
        semester:         c.semester,
        academicYear:     c.academicYear,
        isActiveClass:    c.isActive,
        departmentName:   c.departmentId?.name || null,
        classTeacherName: c.classTeacherId?.name || null,
        studentCount:     c.studentIds?.length || 0,
        batchId:          targetBatch?._id || null,
        batchStatus,
        isBatchClosed:    batchStatus === 'closed',
        pendingCount:     bStats.pending,
        approvedCount:    bStats.approved,
        dueCount:         bStats.due_marked,
      };

      if (c.classTeacherId?.toString() === id) {
        rows.push({
          ...baseInfo,
          roleTag:       'classTeacher',
          subjectTaught: null,
          subjectCode:   null,
        });
      }

      for (const a of c.subjectAssignments ?? []) {
        if (a.facultyId?.toString() === id) {
          rows.push({
            ...baseInfo,
            roleTag:       'faculty',
            subjectTaught: a.subjectName,
            subjectCode:   a.subjectCode,
          });
        }
      }

      return rows;
    });

    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const getFacultyClassStudents = async (req, res, next) => {
  try {
    const { classId } = req.params;
    const facultyId = req.user.userId;

    if (!classId || !mongoose.Types.ObjectId.isValid(classId)) {
      return next(new ErrorResponse('Invalid class ID format', 400, 'VAL_001'));
    }

    // Verify this faculty teaches this class or is privileged
    const isPrivileged = ['admin', 'hod', 'ao'].includes(req.user.role);
    if (!isPrivileged) {
      const cls = await Class.findOne({
        _id: classId,
        $or: [
          { classTeacherId: facultyId },
          { 'subjectAssignments.facultyId': facultyId }
        ]
      }).select('_id name semester academicYear departmentId').lean();

      if (!cls) {
        return next(new ErrorResponse('You do not have access to this class', 403, 'AUTH_002'));
      }
    }

    const students = await Student.find({ classId, isActive: true })
      .select('_id rollNo name email yearOfStudy')
      .sort({ rollNo: 1 })
      .lean();

    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    return res.status(200).json({ success: true, data: students });
  } catch (err) {
    next(err);
  }
};

// ── Helpers for Mentee Queries & Aggregations ───────────────────────────────
const buildMenteeQuery = (facultyId, { classId, search, includeInactive }) => {
  const query = { mentorId: facultyId };
  if (includeInactive !== 'true') query.isActive = true;
  if (classId === 'unassigned') {
    query.classId = null;
  } else if (classId && classId !== 'all') {
    if (mongoose.Types.ObjectId.isValid(classId)) {
      query.classId = new mongoose.Types.ObjectId(classId);
    } else {
      query.classId = new mongoose.Types.ObjectId(); // invalid classId matches 0 records safely
    }
  }
  if (search && search.trim()) {
    const escaped = escapeRegExp(search.trim());
    const regex = new RegExp(escaped, 'i');
    query.$or = [{ rollNo: regex }, { name: regex }, { email: regex }];
  }
  return query;
};

const fetchMenteeRequestsAndApprovals = async (studentIds) => {
  if (!studentIds.length) {
    return { latestRequestMap: new Map(), batchMap: new Map(), approvalsByRequest: new Map() };
  }

  const requests = await NodueRequest.find({ studentId: { $in: studentIds } })
    .sort({ createdAt: -1 })
    .lean();

  const latestRequestMap = new Map();
  requests.forEach((r) => {
    const sId = r.studentId.toString();
    if (!latestRequestMap.has(sId)) latestRequestMap.set(sId, r);
  });

  const requestIds = [...latestRequestMap.values()].map((r) => r._id);
  const batchIds = [...new Set([...latestRequestMap.values()].map((r) => r.batchId).filter(Boolean))];

  const [approvals, batches] = await Promise.all([
    requestIds.length > 0
      ? NodueApproval.find({ requestId: { $in: requestIds } })
          .select('_id requestId batchId studentId approvalType roleTag action dueType remarks amount facultyId subjectName createdAt actionedAt updatedAt')
          .lean()
      : [],
    batchIds.length > 0
      ? NodueBatch.find({ _id: { $in: batchIds } }).select('_id status className semester academicYear').lean()
      : [],
  ]);

  const batchMap = new Map(batches.map((b) => [b._id.toString(), b]));
  const approvalsByRequest = new Map();
  approvals.forEach((a) => {
    const rId = a.requestId.toString();
    if (!approvalsByRequest.has(rId)) approvalsByRequest.set(rId, []);
    approvalsByRequest.get(rId).push(a);
  });

  return { latestRequestMap, batchMap, approvalsByRequest };
};

const enrichMentee = (student, latestRequestMap, batchMap, approvalsByRequest, facultyId) => {
  const sId = student._id.toString();
  const request = latestRequestMap.get(sId);
  const batch = request?.batchId ? batchMap.get(request.batchId.toString()) : null;
  const approvals = request ? (approvalsByRequest.get(request._id.toString()) || []) : [];

  const mentorApproval = approvals.find((a) =>
    (a.approvalType === 'mentor' || a.roleTag === 'mentor') &&
    a.facultyId?.toString() === facultyId.toString()
  ) || approvals.find((a) => a.approvalType === 'mentor');

  const total = approvals.length;
  const approved = approvals.filter((a) => a.action === 'approved').length;
  const due = approvals.filter((a) => a.action === 'due_marked').length;
  const pending = approvals.filter((a) => a.action === 'pending' || a.action === 'not_submitted').length;

  const isFullyCleared = request?.status === 'cleared' || (total > 0 && approved === total);
  const isMyActionPending = mentorApproval && (mentorApproval.action === 'pending' || mentorApproval.action === 'not_submitted');
  const isMyDueFlagged = mentorApproval && mentorApproval.action === 'due_marked';

  const blockers = approvals
    .filter((a) => a.action === 'due_marked')
    .map((a) => ({
      _id: a._id,
      approvalType: a.approvalType,
      subjectName: a.subjectName || (a.approvalType === 'classTeacher' ? 'Class Teacher' : a.approvalType),
      remarks: a.remarks || 'Due marked',
      dueType: a.dueType || 'other',
      amount: a.amount || 0,
      isSelf: a._id?.toString() === mentorApproval?._id?.toString(),
    }));

  return {
    _id: student._id,
    rollNo: student.rollNo,
    name: student.name,
    email: student.email,
    classId: student.classId?._id,
    className: student.classId?.name || 'Unassigned',
    semester: student.semester || student.classId?.semester,
    academicYear: student.academicYear || student.classId?.academicYear,
    departmentId: student.departmentId?._id,
    departmentName: student.departmentId?.name,
    departmentCode: student.departmentId?.code,
    isActive: student.isActive,
    hasActiveBatch: !!batch && batch.status === 'active',
    batchInfo: batch ? { _id: batch._id, name: batch.className, status: batch.status, isClosed: batch.status === 'closed' } : null,
    requestId: request?._id || null,
    overallStatus: request ? (isFullyCleared ? 'cleared' : (due > 0 ? 'has_dues' : 'pending')) : 'no_request',
    stats: { total, approved, due, pending, percent: total > 0 ? Math.round((approved / total) * 100) : 0 },
    mentorApproval: mentorApproval ? {
      _id: mentorApproval._id,
      action: mentorApproval.action,
      remarks: mentorApproval.remarks,
      dueType: mentorApproval.dueType,
      amount: mentorApproval.amount,
      updatedAt: mentorApproval.updatedAt || mentorApproval.actionedAt,
      isClosed: batch?.status === 'closed',
    } : null,
    isMyActionPending,
    isMyDueFlagged,
    blockers,
  };
};

// ── GET /api/faculty/me/mentees ──────────────────────────────────────────────
export const getFacultyMentees = async (req, res, next) => {
  try {
    const facultyId = new mongoose.Types.ObjectId(req.user.userId);
    const query = buildMenteeQuery(facultyId, req.query);

    const students = await Student.find(query)
      .populate('classId', 'name semester academicYear section isActive isMaster')
      .populate('departmentId', 'name code')
      .sort({ rollNo: 1 })
      .lean();

    const { latestRequestMap, batchMap, approvalsByRequest } = await fetchMenteeRequestsAndApprovals(
      students.map((s) => s._id)
    );

    const mentees = students.map((s) =>
      enrichMentee(s, latestRequestMap, batchMap, approvalsByRequest, facultyId)
    );

    const summary = {
      total: mentees.length,
      pendingMyApproval: mentees.filter((m) => m.isMyActionPending).length,
      myDuesFlagged: mentees.filter((m) => m.isMyDueFlagged).length,
      fullyCleared: mentees.filter((m) => m.overallStatus === 'cleared').length,
      blockedElsewhere: mentees.filter((m) => m.blockers.some((b) => !b.isSelf)).length,
    };

    let filtered = mentees;
    const { status } = req.query;
    if (status === 'pending_my_approval') filtered = filtered.filter((m) => m.isMyActionPending);
    else if (status === 'my_due_marked') filtered = filtered.filter((m) => m.isMyDueFlagged);
    else if (status === 'overall_cleared') filtered = filtered.filter((m) => m.overallStatus === 'cleared');
    else if (status === 'blocked_elsewhere') filtered = filtered.filter((m) => m.blockers.some((b) => !b.isSelf));
    else if (status === 'has_dues') filtered = filtered.filter((m) => m.overallStatus === 'has_dues');
    else if (status === 'no_request') filtered = filtered.filter((m) => m.overallStatus === 'no_request');

    const classMap = new Map();
    students.forEach((s) => {
      if (s.classId?._id) {
        const id = s.classId._id.toString();
        if (!classMap.has(id)) {
          classMap.set(id, { _id: s.classId._id, name: s.classId.name, semester: s.classId.semester, academicYear: s.classId.academicYear });
        }
      }
    });

    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    return res.status(200).json({
      success: true,
      data: {
        mentees: filtered,
        summary,
        classes: Array.from(classMap.values()),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/faculty/me/mentees/:studentId/clearance ─────────────────────────
export const getMenteeClearance = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    if (!studentId || !mongoose.Types.ObjectId.isValid(studentId)) {
      return next(new ErrorResponse('Invalid student ID format', 400, 'VAL_001'));
    }
    const facultyId = req.user.userId;

    const student = await Student.findOne({ _id: studentId })
      .populate('classId', 'name semester academicYear section')
      .populate('departmentId', 'name code')
      .populate('mentorId', 'name email employeeId')
      .lean();

    if (!student) {
      return next(new ErrorResponse('Student not found', 404, 'NOT_FOUND'));
    }

    const isMentor = student.mentorId?._id?.toString() === facultyId;
    const isPrivileged = ['admin', 'hod', 'ao'].includes(req.user.role);
    if (!isMentor && !isPrivileged) {
      return next(new ErrorResponse('Access restricted to assigned mentor', 403, 'FORBIDDEN'));
    }

    const request = await NodueRequest.findOne({ studentId }).sort({ createdAt: -1 }).lean();
    if (!request) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      return res.status(200).json({
        success: true,
        data: {
          student,
          batch: null,
          request: null,
          approvals: [],
          summary: { total: 0, approved: 0, due: 0, pending: 0 },
        },
      });
    }

    const [batch, approvals] = await Promise.all([
      NodueBatch.findById(request.batchId).select('_id status className semester academicYear deadline').lean(),
      NodueApproval.find({ requestId: request._id })
        .populate('facultyId', 'name email employeeId')
        .sort({ approvalType: 1, subjectName: 1 })
        .lean(),
    ]);

    const summary = {
      total: approvals.length,
      approved: approvals.filter((a) => a.action === 'approved').length,
      due: approvals.filter((a) => a.action === 'due_marked').length,
      pending: approvals.filter((a) => a.action === 'pending' || a.action === 'not_submitted').length,
    };

    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    return res.status(200).json({
      success: true,
      data: {
        student,
        batch: batch ? {
          _id: batch._id,
          name: batch.className,
          semester: batch.semester,
          academicYear: batch.academicYear,
          status: batch.status,
          isClosed: batch.status === 'closed',
          deadline: batch.deadline,
        } : null,
        request: {
          _id: request._id,
          status: request.status,
          createdAt: request.createdAt,
          overriddenBy: request.overriddenBy,
          overrideRemark: request.overrideRemark,
        },
        approvals,
        summary,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const resendCredentials = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);
    const { id } = req.params;
    
    const faculty = await Faculty.findById(id).session(session);
    if (!faculty) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Faculty not found', 404));
    }

    if (
      (req.user.role === 'hod' || req.user.role === 'ao') &&
      faculty.departmentId?.toString() !== req.user.departmentId
    ) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    const tempPassword = crypto.randomBytes(4).toString('hex');
    faculty.password = tempPassword;
    faculty.mustChangePassword = true;
    
    await faculty.save({ session });

    await commitSafeTransaction(session);

    logger.info('faculty_credentials_resent', {
      timestamp: new Date().toISOString(),
      actor: req.user?.userId || 'SYSTEM',
      action: 'RESEND_CREDS',
      resource_id: faculty._id.toString(),
      details: { email: faculty.email }
    });

    const emailResult = await sendCredentialEmail(faculty.email, faculty.name, faculty.email, tempPassword, 'faculty');
    if (!emailResult) {
      logger.warn('Email dispatch failed for faculty credential resend:', { email: faculty.email });
    }

    return res.status(200).json({
      success: true,
      message: emailResult ? 'Credentials regenerated and email dispatched' : 'Credentials regenerated but email dispatch failed',
      credentialEmailSent: emailResult
    });
  } catch (err) {
    if (session.inTransaction()) await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
};

// ── BATCH OPERATIONS ─────────────────────────────────────────────────────────

export const bulkDeactivateFaculty = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('IDs array is required', 400));
    }

    const query = { _id: { $in: ids }, isActive: true };
    if (req.user.role === 'hod' || req.user.role === 'ao') {
      query.departmentId = req.user.departmentId;
    }

    const result = await Faculty.updateMany(query, { isActive: false }, { session });

    await commitSafeTransaction(session);

    // Invalidate caches
    ids.forEach(id => invalidateEntityCache('faculty', id));

    logger.info('faculty_bulk_deactivated', {
      timestamp: new Date().toISOString(),
      actor: req.user.userId,
      action: 'BULK_DELETE_FACULTY',
      details: { count: result.modifiedCount, requested: ids.length }
    });

    return res.status(200).json({
      success: true,
      data: { modifiedCount: result.modifiedCount }
    });
  } catch (err) {
    if (session.inTransaction()) await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
};

export const activateFaculty = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);
    const faculty = await Faculty.findById(req.params.id).session(session);

    if (!faculty) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Faculty not found', 404));
    }

    // RBAC Check for HOD/AO
    if ((req.user.role === 'hod' || req.user.role === 'ao') && 
        faculty.departmentId.toString() !== req.user.departmentId.toString()) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Unauthorized: Access denied to other department faculty', 403));
    }

    faculty.isActive = true;
    await faculty.save({ session });

    await commitSafeTransaction(session);

    invalidateEntityCache('faculty', faculty._id);

    logger.info('faculty_activated', {
      timestamp: new Date().toISOString(),
      actor: req.user.userId,
      action: 'ACTIVATE_FACULTY',
      resource_id: faculty._id
    });

    return res.status(200).json({
      success: true,
      data: faculty
    });
  } catch (err) {
    if (session.inTransaction()) await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
};

export const bulkActivateFaculty = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('IDs array is required', 400));
    }

    const query = { _id: { $in: ids } };
    if (req.user.role === 'hod' || req.user.role === 'ao') {
      query.departmentId = req.user.departmentId;
    }

    const result = await Faculty.updateMany(query, { isActive: true }, { session });

    await commitSafeTransaction(session);

    // Invalidate caches
    ids.forEach(id => invalidateEntityCache('faculty', id));

    logger.info('faculty_bulk_activated', {
      timestamp: new Date().toISOString(),
      actor: req.user.userId,
      action: 'BULK_ACTIVATE_FACULTY',
      details: { count: result.modifiedCount, requested: ids.length }
    });

    return res.status(200).json({
      success: true,
      data: { modifiedCount: result.modifiedCount }
    });
  } catch (err) {
    if (session.inTransaction()) await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
};


export const bulkResendCredentials = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('IDs array is required', 400));
    }

    const query = { _id: { $in: ids }, isActive: true };
    if (req.user.role === 'hod' || req.user.role === 'ao') {
      query.departmentId = req.user.departmentId;
    }

    const faculties = await Faculty.find(query).session(session);
    
    const emailData = [];
    const sessionOpt = getSessionOptions(session);

    for (const faculty of faculties) {
      const tempPassword = crypto.randomBytes(4).toString('hex');
      faculty.password = tempPassword;
      faculty.mustChangePassword = true;

      // Save sequentially to avoid concurrent writes on a single transactional session
      await faculty.save(sessionOpt);
      emailData.push({ email: faculty.email, name: faculty.name, tempPassword });
    }

    await commitSafeTransaction(session);

    // Send emails after transaction commits
    const emailPromises = emailData.map(d => sendCredentialEmail(d.email, d.name, d.email, d.tempPassword, 'faculty'));
    const emailResults = await Promise.all(emailPromises);
    
    const successCount = emailResults.filter(Boolean).length;

    logger.info('faculty_bulk_creds_resent', {
      timestamp: new Date().toISOString(),
      actor: req.user.userId,
      action: 'BULK_RESEND_CREDS',
      details: { count: faculties.length, successCount }
    });

    return res.status(200).json({
      success: true,
      message: `Emails dispatched for ${successCount}/${faculties.length} faculty members`
    });
  } catch (err) {
    if (session.inTransaction()) await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
};

export const bulkUpdateRoles = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);
    const { ids, targetRole, action } = req.body; // action: 'add' | 'remove'
    if (!ids || !Array.isArray(ids) || !targetRole || !action) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('IDs, targetRole and action are required', 400));
    }

    if (targetRole === 'hod' || targetRole === 'ao') {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('HoD and AO roles cannot be managed in bulk', 400));
    }

    const query = { _id: { $in: ids }, isActive: true };
    if (req.user.role === 'hod' || req.user.role === 'ao') {
      query.departmentId = req.user.departmentId;
    }

    const faculties = await Faculty.find(query).session(session);
    const targets = faculties.filter(f => !f.roleTags.includes('hod') && !f.roleTags.includes('ao'));
    
    if (targets.length === 0) {
      await commitSafeTransaction(session);
      return res.status(200).json({
        success: true,
        message: 'No eligible faculty members found for update (HoDs skipped).',
        modifiedCount: 0
      });
    }

    const sessionOpt = getSessionOptions(session);
    let affectedCount = 0;
    for (const faculty of targets) {
      let modified = false;
      if (action === 'add') {
        if (!faculty.roleTags.includes(targetRole)) {
          faculty.roleTags.push(targetRole);
          modified = true;
        }
      } else if (action === 'remove') {
        if (faculty.roleTags.includes(targetRole)) {
          faculty.roleTags = faculty.roleTags.filter(r => r !== targetRole);
          if (faculty.roleTags.length === 0) faculty.roleTags = ['faculty'];
          modified = true;
        }
      }

      if (modified) {
        // Save sequentially to avoid concurrent txn writes on one session
        await faculty.save(sessionOpt);
        affectedCount++;
      }
    }

    await commitSafeTransaction(session);

    // Invalidate caches
    ids.forEach(id => invalidateEntityCache('faculty', id));

    logger.info('faculty_bulk_role_updated', {
      timestamp: new Date().toISOString(),
      actor: req.user.userId,
      action: 'BULK_ROLE_UPDATE',
      details: { 
        targetRole, 
        action, 
        affectedCount,
        skippedCount: faculties.length - affectedCount
      }
    });

    return res.status(200).json({
      success: true,
      message: `Successfully ${action === 'add' ? 'assigned' : 'revoked'} ${targetRole === 'classTeacher' ? 'Co-ordinator' : targetRole.toUpperCase()} for ${affectedCount} selected members.`,
      details: {
        affectedCount,
        skippedCount: faculties.length - affectedCount
      }
    });
  } catch (err) {
    if (session.inTransaction()) await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
};
