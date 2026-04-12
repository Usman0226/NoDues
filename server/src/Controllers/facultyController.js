import Faculty from '../models/Faculty.js';
import Department from '../models/Department.js';
import Class from '../models/Class.js';
import ErrorResponse from '../utils/errorResponse.js';
import cache from '../config/cache.js';
import logger from '../utils/logger.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { sendCredentialEmail } from '../services/emailService.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
export const invalidateFacultyCache = (id) => {
  cache.del(`faculty:${id}`);
  cache.del('faculty:all');
};

/** Generates a temporary password: EMP<id>@Nds#<random4> */
const generateTempPassword = (empId) =>
  `${empId}@Nds#${crypto.randomInt(1000, 9999)}`;

// ── GET /api/faculty ──────────────────────────────────────────────────────────
export const getFaculty = async (req, res, next) => {
  try {
    const { departmentId, roleTag, search, page = 1, limit = 50, includeInactive } = req.query;
    const isPrivileged = ['admin', 'hod'].includes(req.user.role);

    const query = {};
    if (includeInactive !== 'true' || !isPrivileged) {
      query.isActive = true;
    }

    // HoD is automatically scoped to their own department
    if (req.user.role === 'hod') {
      query.departmentId = req.user.departmentId;
    } else if (departmentId) {
      query.departmentId = departmentId;
    }

    if (roleTag) query.roleTags = roleTag;

    if (search) {
      query.$or = [
        { name:       { $regex: search, $options: 'i' } },
        { email:      { $regex: search, $options: 'i' } },
        { employeeId: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [faculty, total] = await Promise.all([
      Faculty.find(query)
        .populate('departmentId', 'name')
        .sort({ name: 1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Faculty.countDocuments(query),
    ]);

    // Count classes per faculty in a single aggregation
    const facultyIds = faculty.map((f) => f._id);
    const classCounts = await Class.aggregate([
      {
        $match: {
          isActive: true,
          $or: [
            { 'subjectAssignments.facultyId': { $in: facultyIds } },
            { classTeacherId: { $in: facultyIds } },
          ],
        },
      },
      {
        $group: {
          _id: null,
          records: {
            $push: {
              classTeacherId: '$classTeacherId',
              facultyIds:     '$subjectAssignments.facultyId',
            },
          },
        },
      },
    ]);

    // Simple class count per faculty via separate query (M0-safe alternative)
    const classCountMap = {};
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

    return res.status(200).json({
      success: true,
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
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/faculty ─────────────────────────────────────────────────────────
export const createFaculty = async (req, res, next) => {
  try {
    const { name, email, phone, employeeId, departmentId, roleTags } = req.body;

    if (!name || !email || !employeeId || !departmentId) {
      return next(
        new ErrorResponse('name, email, employeeId, departmentId are required', 400, 'VALIDATION_ERROR')
      );
    }

    // Validate department
    const dept = await Department.findById(departmentId).lean();
    if (!dept) return next(new ErrorResponse('Department not found', 404, 'NOT_FOUND'));

    // HoD can only create faculty in own department
    if (req.user.role === 'hod' && req.user.departmentId !== departmentId) {
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    const tempPassword = generateTempPassword(employeeId);

    const faculty = await Faculty.create({
      name,
      email,
      phone,
      employeeId,
      departmentId,
      roleTags: roleTags ?? ['faculty'],
      password: tempPassword,
      mustChangePassword: true,
    });

    logger.info('faculty_created', {
      timestamp: new Date().toISOString(),
      actor: req.user.userId,
      action: 'CREATE_FACULTY',
      resource_id: faculty._id.toString(),
      details: { email: faculty.email, employeeId: faculty.employeeId }
    });

    sendCredentialEmail(email, name, email, tempPassword, 'faculty').catch(err => {
      logger.error('Background email dispatch failed for new faculty:', err);
    });

    invalidateFacultyCache(faculty._id.toString());

    return res.status(201).json({
      success: true,
      data: {
        _id:                faculty._id,
        name:               faculty.name,
        email:              faculty.email,
        employeeId:         faculty.employeeId,
        departmentId:       faculty.departmentId,
        departmentName:     dept.name,
        roleTags:           faculty.roleTags,
        mustChangePassword: true,
        credentialEmailSent: false, // true once email service is wired
        isActive:           true,
        createdAt:          faculty.createdAt,
      },
    });
  } catch (err) {
    next(err);
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
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/faculty/:id ────────────────────────────────────────────────────
export const updateFaculty = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, email, phone, roleTags } = req.body;

    const faculty = await Faculty.findOne({ _id: id, isActive: true });
    if (!faculty) {
      return next(new ErrorResponse('Faculty not found', 404, 'NOT_FOUND'));
    }

    if (
      req.user.role === 'hod' &&
      faculty.departmentId?.toString() !== req.user.departmentId
    ) {
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    if (name     !== undefined) faculty.name     = name;
    if (email    !== undefined) faculty.email    = email;
    if (phone    !== undefined) faculty.phone    = phone;
    if (roleTags !== undefined) faculty.roleTags = roleTags;

    await faculty.save();

    invalidateFacultyCache(id);
    cache.del(`user:${id}`); // clear auth/me cache too

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
    next(err);
  }
};

// ── DELETE /api/faculty/:id (soft delete) ─────────────────────────────────────
export const deleteFaculty = async (req, res, next) => {
  try {
    const { id } = req.params;

    const faculty = await Faculty.findOne({ _id: id, isActive: true });
    if (!faculty) {
      return next(new ErrorResponse('Faculty not found', 404, 'NOT_FOUND'));
    }

    if (
      req.user.role === 'hod' &&
      faculty.departmentId?.toString() !== req.user.departmentId
    ) {
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    faculty.isActive = false;
    await faculty.save();

    invalidateFacultyCache(id);

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
    next(err);
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

    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const resendCredentials = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const faculty = await Faculty.findById(id);
    if (!faculty) {
      return next(new ErrorResponse('Faculty not found', 404));
    }

    // HoD can only resend credentials for faculty in own department
    if (
      req.user.role === 'hod' &&
      faculty.departmentId?.toString() !== req.user.departmentId
    ) {
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    // Generate new temp password
    const tempPassword = crypto.randomBytes(4).toString('hex');
    faculty.password = tempPassword;
    faculty.mustChangePassword = true;
    
    await faculty.save();

    logger.info('faculty_credentials_resent', {
      timestamp: new Date().toISOString(),
      actor: req.user?.userId || 'SYSTEM',
      action: 'RESEND_CREDS',
      resource_id: faculty._id.toString(),
      details: { email: faculty.email }
    });

    sendCredentialEmail(faculty.email, faculty.name, faculty.email, tempPassword, 'faculty').catch(err => {
      logger.error('Background email dispatch failed for resending faculty creds:', err);
    });

    return res.status(200).json({
      success: true,
      message: 'Credentials regenerated and email dispatched',
    });
  } catch (err) {
    next(err);
  }
};
