import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import Admin from '../models/Admin.js';
import Faculty from '../models/Faculty.js';
import Student from '../models/Student.js';
import Department from '../models/Department.js';
import ErrorResponse from '../utils/errorResponse.js';
import cache from '../config/cache.js';
import { logger } from '../middlewares/logger.js';

// ─── Cookie options ───────────────────────────────────────────────────────────
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
  maxAge: 8 * 60 * 60 * 1000, // 8 hours in ms
};


const signAndSetCookie = (payload, res) => {
  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '8h',
  });
  res.cookie('nds_token', token, COOKIE_OPTIONS);
  return token;
};

// ─── Audit log helper ─────────────────────────────────────────────────────────
const auditLog = (action, actor, resourceId = null) => {
  logger.info('auth_event', {
    timestamp: new Date().toISOString(),
    actor,
    action,
    resource_id: resourceId,
  });
};

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * POST /api/auth/login
 * Admin and Faculty login with email + password.
 * Returns JWT in httpOnly cookie.
 */
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return next(
        new ErrorResponse('Email and password are required', 400, 'AUTH_MISSING_FIELDS')
      );
    }

    // Check admin first (faster — small collection)
    let user = await Admin.findOne({ email }).select('+password');
    let userType = 'admin';

    if (!user) {
      user = await Faculty.findOne({ email, isActive: true }).select('+password');
      userType = 'faculty';
    }

    if (!user) {
      return next(
        new ErrorResponse('Invalid email or password', 401, 'AUTH_INVALID_CREDENTIALS')
      );
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return next(
        new ErrorResponse('Invalid email or password', 401, 'AUTH_INVALID_CREDENTIALS')
      );
    }

    // Resolve role — faculty with hod roleTag → role is 'hod'
    const role = user.role || userType;

    // Build JWT payload (shape defined in API design guide §2)
    const payload = {
      userId: user._id.toString(),
      role,
      mustChangePassword: user.mustChangePassword ?? false,
    };

    if (role === 'faculty' || role === 'hod') {
      payload.roleTags    = user.roleTags ?? ['faculty'];
      payload.departmentId = user.departmentId?.toString() ?? null;
    }

    signAndSetCookie(payload, res);

    // Resolve department name for response (cache-aware)
    let departmentName = null;
    if (user.departmentId) {
      const cacheKey = `dept:${user.departmentId}`;
      departmentName = cache.get(cacheKey);
      if (!departmentName) {
        const dept = await Department.findById(user.departmentId).select('name').lean();
        departmentName = dept?.name ?? null;
        if (departmentName) cache.set(cacheKey, departmentName, 3600);
      }
    }

    if (role !== 'admin') {
      Faculty.findByIdAndUpdate(user._id, { lastLoginAt: new Date() }).catch((e) =>
        logger.error('lastLoginAt update failed', { error: e.message })
      );
    }

    auditLog('LOGIN', user._id.toString());

    return res.status(200).json({
      success: true,
      data: {
        userId:            user._id,
        name:              user.name,
        email:             user.email,
        role,
        ...(payload.roleTags    && { roleTags:       payload.roleTags    }),
        ...(payload.departmentId && { departmentId:  payload.departmentId }),
        ...(departmentName       && { departmentName }),
        mustChangePassword: user.mustChangePassword ?? false,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/student-login
 * Student login — roll number only, no password.
 * Returns JWT in httpOnly cookie.
 */
export const studentLogin = async (req, res, next) => {
  try {
    const { rollNo } = req.body;

    if (!rollNo) {
      return next(
        new ErrorResponse('Roll number is required', 400, 'AUTH_MISSING_FIELDS')
      );
    }

    const student = await Student.findOne({
      rollNo: rollNo.trim().toUpperCase(),
      isActive: true,
    })
      .populate('classId', 'name semester')
      .populate('departmentId', 'name')
      .lean();

    if (!student) {
      return next(
        new ErrorResponse(
          'No student found with this roll number',
          401,
          'AUTH_ROLL_NOT_FOUND'
        )
      );
    }

    const payload = {
      userId: student._id.toString(),
      role:   'student',
      rollNo: student.rollNo,
    };

    signAndSetCookie(payload, res);

    auditLog('STUDENT_LOGIN', student._id.toString());

    return res.status(200).json({
      success: true,
      data: {
        userId:         student._id,
        name:           student.name,
        rollNo:         student.rollNo,
        role:           'student',
        classId:        student.classId?._id,
        className:      student.classId?.name ?? null,
        departmentName: student.departmentId?.name ?? null,
        semester:       student.classId?.semester ?? student.semester,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const changePassword = async (req, res, next) => {
  try {
    const { newPassword, confirmPassword } = req.body;
    const { userId, role } = req.user;

    if (!newPassword || !confirmPassword) {
      return next(
        new ErrorResponse(
          'newPassword and confirmPassword are required',
          400,
          'AUTH_MISSING_FIELDS'
        )
      );
    }

    if (newPassword !== confirmPassword) {
      return next(
        new ErrorResponse('Passwords do not match', 400, 'AUTH_PASSWORD_MISMATCH')
      );
    }

    if (newPassword.length < 8) {
      return next(
        new ErrorResponse('Password must be at least 8 characters', 400, 'AUTH_WEAK_PASSWORD')
      );
    }

    // Determine model based on role
    const Model = role === 'admin' ? Admin : Faculty;

    const user = await Model.findById(userId).select('+password');
    if (!user) {
      return next(new ErrorResponse('User not found', 404, 'NOT_FOUND'));
    }

    // Prevent reuse of the current password
    const isSame = await bcrypt.compare(newPassword, user.password);
    if (isSame) {
      return next(
        new ErrorResponse(
          'New password must differ from the current password',
          400,
          'AUTH_PASSWORD_REUSE'
        )
      );
    }

    const salt     = await bcrypt.genSalt(12);
    user.password  = await bcrypt.hash(newPassword, salt);
    user.mustChangePassword = false;
    await user.save({ validateBeforeSave: false });

    // Refresh the JWT so the mustChangePassword flag clears immediately
    const newPayload = {
      userId: user._id.toString(),
      role,
      mustChangePassword: false,
      ...(user.roleTags    && { roleTags:       user.roleTags    }),
      ...(user.departmentId && { departmentId: user.departmentId.toString() }),
    };
    signAndSetCookie(newPayload, res);

    // Invalidate any cached user data
    cache.del(`user:${userId}`);

    auditLog('PASSWORD_CHANGE', userId);

    return res.status(200).json({
      success: true,
      data: { message: 'Password changed successfully' },
    });
  } catch (err) {
    next(err);
  }
};

export const logout = async (req, res, next) => {
  try {
    auditLog('LOGOUT', req.user?.userId ?? 'unknown');

    res.clearCookie('nds_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    });

    return res.status(200).json({
      success: true,
      data: { message: 'Logged out successfully' },
    });
  } catch (err) {
    next(err);
  }
};

export const getMe = async (req, res, next) => {
  try {
    const { userId, role } = req.user;
    const cacheKey = `user:${userId}`;

    const cached = cache.get(cacheKey);
    if (cached) {
      return res.status(200).json({ success: true, data: cached });
    }

    let profile = null;

    if (role === 'admin') {
      const admin = await Admin.findById(userId).lean();
      if (!admin) return next(new ErrorResponse('User not found', 404, 'NOT_FOUND'));

      profile = {
        userId:            admin._id,
        name:              admin.name,
        email:             admin.email,
        role:              'admin',
        mustChangePassword: admin.mustChangePassword,
      };
    } else if (role === 'student') {
      const student = await Student.findById(userId)
        .populate('classId', 'name semester')
        .populate('departmentId', 'name')
        .lean();

      if (!student) return next(new ErrorResponse('User not found', 404, 'NOT_FOUND'));

      profile = {
        userId:         student._id,
        name:           student.name,
        rollNo:         student.rollNo,
        role:           'student',
        classId:        student.classId?._id,
        className:      student.classId?.name ?? null,
        departmentName: student.departmentId?.name ?? null,
        semester:       student.classId?.semester ?? student.semester,
      };
    } else {
      const faculty = await Faculty.findById(userId)
        .populate('departmentId', 'name')
        .lean();

      if (!faculty || !faculty.isActive) {
        return next(new ErrorResponse('User not found', 404, 'NOT_FOUND'));
      }

      profile = {
        userId:            faculty._id,
        name:              faculty.name,
        email:             faculty.email,
        role:              faculty.role,
        roleTags:          faculty.roleTags,
        departmentId:      faculty.departmentId?._id,
        departmentName:    faculty.departmentId?.name ?? null,
        mustChangePassword: faculty.mustChangePassword,
        lastLoginAt:       faculty.lastLoginAt,
      };
    }

    // Cache for 15 minutes
    cache.set(cacheKey, profile, 900);

    return res.status(200).json({ success: true, data: profile });
  } catch (err) {
    next(err);
  }
};
