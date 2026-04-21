import mongoose from 'mongoose';
import Faculty from '../models/Faculty.js';
import Department from '../models/Department.js';
import Class from '../models/Class.js';
import ErrorResponse from '../utils/errorResponse.js';
import cache from '../config/cache.js';
import logger from '../utils/logger.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { sendCredentialEmail } from '../services/emailService.js';
import { startSafeTransaction, commitSafeTransaction, abortSafeTransaction } from '../utils/safeTransaction.js';

const generateTempPassword = () => crypto.randomBytes(4).toString('hex');

export const getFaculty = async (req, res, next) => {
  try {
    const { departmentId, roleTag, search, page = 1, limit = 50, includeInactive } = req.query;
    const isPrivileged = ['admin', 'hod'].includes(req.user.role);

    const query = {};
    if (includeInactive !== 'true' || !isPrivileged) {
      query.isActive = true;
    }

    if (req.user.role === 'hod') {
      query.departmentId = departmentId || req.user.departmentId;
    } else if (departmentId) {
      query.departmentId = departmentId;
    }

    if (roleTag) query.roleTags = roleTag;

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { employeeId: { $regex: search, $options: 'i' } },
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

    if (req.user.role === 'hod' && req.user.departmentId !== departmentId) {
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

    // HoD can only view faculty in own department
    if (
      req.user.role === 'hod' &&
      faculty.departmentId?._id?.toString() !== req.user.departmentId
    ) {
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

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

    cache.set(cacheKey, data, 300);
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
    const { name, email, phone, roleTags } = req.body;

    const faculty = await Faculty.findOne({ _id: id, isActive: true }).session(session);
    if (!faculty) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Faculty not found', 404, 'NOT_FOUND'));
    }

    if (
      req.user.role === 'hod' &&
      faculty.departmentId?.toString() !== req.user.departmentId
    ) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    if (name     !== undefined) faculty.name     = name;
    if (email    !== undefined) faculty.email    = email;
    if (phone    !== undefined) faculty.phone    = phone;
    if (roleTags !== undefined) faculty.roleTags = roleTags;

    await faculty.save({ session });

    await commitSafeTransaction(session);

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
      req.user.role === 'hod' &&
      faculty.departmentId?.toString() !== req.user.departmentId
    ) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    faculty.isActive = false;
    await faculty.save({ session });

    await commitSafeTransaction(session);

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
export const getFacultyClasses = async (req, res, next) => {
  try {
    const { id } = req.params;

    const faculty = await Faculty.findOne({ _id: id, isActive: true }).lean();
    if (!faculty) {
      return next(new ErrorResponse('Faculty not found', 404, 'NOT_FOUND'));
    }

    // HoD can only view classes for faculty in own department
    if (
      req.user.role === 'hod' &&
      faculty.departmentId?.toString() !== req.user.departmentId
    ) {
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    const classes = await Class.find({
      isActive: true,
      $or: [
        { classTeacherId: id },
        { 'subjectAssignments.facultyId': id },
      ],
    })
      .populate('departmentId', 'name')
      .lean();

    const data = classes.flatMap((c) => {
      const rows = [];

      // Class-teacher row
      if (c.classTeacherId?.toString() === id) {
        rows.push({
          _id:          c._id,
          name:         c.name,
          semester:     c.semester,
          academicYear: c.academicYear,
          roleTag:      'classTeacher',
          subjectTaught: null,
          subjectCode:   null,
        });
      }

      // Subject assignment rows
      for (const a of c.subjectAssignments ?? []) {
        if (a.facultyId?.toString() === id) {
          rows.push({
            _id:           c._id,
            name:          c.name,
            semester:      c.semester,
            academicYear:  c.academicYear,
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
      req.user.role === 'hod' &&
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
    if (req.user.role === 'hod') {
      query.departmentId = req.user.departmentId;
    }

    const result = await Faculty.updateMany(query, { isActive: false }, { session });

    await commitSafeTransaction(session);

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
    if (req.user.role === 'hod') {
      query.departmentId = req.user.departmentId;
    }

    const faculties = await Faculty.find(query).session(session);
    
    const emailData = [];
    const savePromises = [];

    for (const faculty of faculties) {
      const tempPassword = crypto.randomBytes(4).toString('hex');
      faculty.password = tempPassword;
      faculty.mustChangePassword = true;
      
      savePromises.push(faculty.save({ session }));
      emailData.push({ email: faculty.email, name: faculty.name, tempPassword });
    }

    await Promise.all(savePromises);
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

    if (targetRole === 'hod') {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('HoD role cannot be managed in bulk', 400));
    }

    const query = { _id: { $in: ids }, isActive: true };
    if (req.user.role === 'hod') {
      query.departmentId = req.user.departmentId;
    }

    const faculties = await Faculty.find(query).session(session);
    const targets = faculties.filter(f => !f.roleTags.includes('hod'));
    
    if (targets.length === 0) {
      await commitSafeTransaction(session);
      return res.status(200).json({
        success: true,
        message: 'No eligible faculty members found for update (HoDs skipped).',
        modifiedCount: 0
      });
    }

    const savePromises = [];
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
        savePromises.push(faculty.save({ session }));
      }
    }

    await Promise.all(savePromises);
    await commitSafeTransaction(session);

    logger.info('faculty_bulk_role_updated', {
      timestamp: new Date().toISOString(),
      actor: req.user.userId,
      action: 'BULK_ROLE_UPDATE',
      details: { 
        targetRole, 
        action, 
        affectedCount: savePromises.length,
        skippedCount: faculties.length - savePromises.length
      }
    });

    return res.status(200).json({
      success: true,
      message: `Successfully ${action === 'add' ? 'assigned' : 'revoked'} ${targetRole === 'classTeacher' ? 'Co-ordinator' : targetRole.toUpperCase()} for ${savePromises.length} selected members.`,
      details: {
        affectedCount: savePromises.length,
        skippedCount: faculties.length - savePromises.length
      }
    });
  } catch (err) {
    if (session.inTransaction()) await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
};
