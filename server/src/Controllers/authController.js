import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import Admin from '../models/Admin.js';
import Faculty from '../models/Faculty.js';
import Student from '../models/Student.js';
import Department from '../models/Department.js';
import ErrorResponse from '../utils/errorResponse.js';
import cache from '../config/cache.js';
import logger from '../utils/logger.js';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 8 * 60 * 60 * 24 * 1000, 
  path: '/',
};


const signAndSetCookie = (payload, res) => {
  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '8h',
  });
  res.cookie('nds_token', token, COOKIE_OPTIONS);
  return token;
};

const auditLog = (action, actor, resourceId = null) => {
  logger.info('auth_event', {
    timestamp: new Date().toISOString(),
    actor,
    action,
    resource_id: resourceId,
  });
};


export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return next(
        new ErrorResponse('Email and password are required', 400, 'AUTH_MISSING_FIELDS')
      );
    }

    const sanitizedEmail = email.trim().toLowerCase();

    const [admin, faculty] = await Promise.all([
      Admin.findOne({ email: sanitizedEmail }).select('+password').lean(),
      Faculty.findOne({
        $or: [{ email: sanitizedEmail }, { employeeId: email.trim() }],
        isActive: true,
      })
        .select('+password departmentId roleTags name email mustChangePassword role')
        .lean(),
    ]);

    let user = admin || faculty;
    let userType = admin ? 'admin' : (faculty ? 'faculty' : null);

    if (!user) {
      logger.warn('Login failure: User not found', { email: sanitizedEmail });
      return next(
        new ErrorResponse('Invalid email or password', 401, 'AUTH_INVALID_CREDENTIALS')
      );
    }

    const [isMatch, departmentName] = await Promise.all([
      bcrypt.compare(password, user.password),
      (async () => {
        if (!user.departmentId) return null;
        const cacheKey = `dept:${user.departmentId}`;
        let name = cache.get(cacheKey);
        if (!name) {
          const dept = await mongoose.model('Department').findById(user.departmentId).select('name').lean();
          name = dept?.name ?? null;
          if (name) cache.set(cacheKey, name, 3600);
        }
        return name;
      })(),
    ]);

    if (!isMatch) {
      logger.warn('Login failure: Password mismatch', { email: sanitizedEmail });
      return next(
        new ErrorResponse('Invalid email or password', 401, 'AUTH_INVALID_CREDENTIALS')
      );
    }

    const role = user.role || userType;

    const payload = {
      userId: user._id.toString(),
      role,
      mustChangePassword: user.mustChangePassword ?? false,
    };

    if (role === 'faculty' || role === 'hod') {
      payload.roleTags    = user.roleTags ?? ['faculty'];
      payload.departmentId = user.departmentId?.toString() ?? null;
    }

    const token = signAndSetCookie(payload, res);

    if (role !== 'admin') {
      // ✅ Non-blocking update: Last login time
      mongoose.model('Faculty').findByIdAndUpdate(user._id, { 
        $set: { lastLoginAt: new Date() } 
      }).select('_id').lean().catch((e) =>
        logger.error('lastLoginAt update failed', { error: e.message })
      );
    }

    auditLog('LOGIN', user._id.toString());

    return res.status(200).json({
      success: true,
      token, // Return token specifically for mobile clients unable to use cookies
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


export const studentLogin = async (req, res, next) => {
  try {
    const { rollNo } = req.body;

    if (!rollNo) {
      return next(
        new ErrorResponse('Roll number is required', 400, 'AUTH_MISSING_FIELDS')
      );
    }

    // ✅ Optimization: Fetch student with lean and use caching for metadata to avoid heavy populates
    const student = await Student.findOne({
      rollNo: rollNo.trim().toUpperCase(),
      isActive: true,
    })
      .select('name rollNo classId departmentId semester')
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

    // ✅ Parallel Meta Data Fetch (Department & Class) from Cache/DB
    const [deptName, classMeta] = await Promise.all([
      (async () => {
        const cacheKey = `dept:${student.departmentId}`;
        let name = cache.get(cacheKey);
        if (!name) {
          const dept = await Department.findById(student.departmentId).select('name').lean();
          name = dept?.name ?? null;
          if (name) cache.set(cacheKey, name, 3600);
        }
        return name;
      })(),
      (async () => {
        const cacheKey = `class:${student.classId}`;
        let meta = cache.get(cacheKey);
        if (!meta) {
          // Use dynamic import to avoid circular dependency if any, but since it's a model it's fine
          const Class = mongoose.model('Class');
          const cls = await Class.findById(student.classId).select('name semester').lean();
          meta = cls ? { name: cls.name, semester: cls.semester } : null;
          if (meta) cache.set(cacheKey, meta, 3600);
        }
        return meta;
      })(),
    ]);

    const payload = {
      userId: student._id.toString(),
      role:   'student',
      rollNo: student.rollNo,
    };

    const token = signAndSetCookie(payload, res);

    auditLog('STUDENT_LOGIN', student._id.toString());

    return res.status(200).json({
      success: true,
      token,
      data: {
        userId:         student._id,
        name:           student.name,
        rollNo:         student.rollNo,
        role:           'student',
        classId:        student.classId,
        className:      classMeta?.name ?? null,
        departmentName: deptName ?? null,
        semester:       classMeta?.semester ?? student.semester,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const changePassword = async (req, res, next) => {
  try {
    const { oldPassword, newPassword, confirmPassword } = req.body;
    const { userId, role } = req.user;

    if (!oldPassword || !newPassword || !confirmPassword) {
      return next(
        new ErrorResponse(
          'oldPassword, newPassword and confirmPassword are required',
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

    const Model = role === 'admin' ? Admin : Faculty;

    const user = await Model.findById(userId).select('+password');
    if (!user) {
      return next(new ErrorResponse('User not found', 404, 'NOT_FOUND'));
    }

    const isOldMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isOldMatch) {
      return next(
        new ErrorResponse('Current password is incorrect', 400, 'AUTH_INVALID_CURRENT_PASSWORD')
      );
    }

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

    user.password  = newPassword;
    user.mustChangePassword = false;
    await user.save();

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
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      path: '/',
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
      const student = await Student.findById(userId).select('name rollNo classId departmentId semester').lean();
      if (!student) return next(new ErrorResponse('User not found', 404, 'NOT_FOUND'));

      const [deptName, classMeta] = await Promise.all([
        (async () => {
          const cacheKey = `dept:${student.departmentId}`;
          let name = cache.get(cacheKey);
          if (!name) {
            const dept = await Department.findById(student.departmentId).select('name').lean();
            name = dept?.name ?? null;
            if (name) cache.set(cacheKey, name, 3600);
          }
          return name;
        })(),
        (async () => {
          const cacheKey = `class:${student.classId}`;
          let meta = cache.get(cacheKey);
          if (!meta) {
            const Class = mongoose.model('Class');
            const cls = await Class.findById(student.classId).select('name semester').lean();
            meta = cls ? { name: cls.name, semester: cls.semester } : null;
            if (meta) cache.set(cacheKey, meta, 3600);
          }
          return meta;
        })(),
      ]);

      profile = {
        userId:         student._id,
        name:           student.name,
        rollNo:         student.rollNo,
        role:           'student',
        classId:        student.classId,
        className:      classMeta?.name ?? null,
        departmentName: deptName ?? null,
        semester:       classMeta?.semester ?? student.semester,
      };
    } else {
      const faculty = await Faculty.findById(userId).select('name email role roleTags departmentId mustChangePassword lastLoginAt isActive').lean();

      if (!faculty || !faculty.isActive) {
        return next(new ErrorResponse('User not found', 404, 'NOT_FOUND'));
      }

      const cacheKeyDept = `dept:${faculty.departmentId}`;
      let departmentName = cache.get(cacheKeyDept);
      if (!departmentName && faculty.departmentId) {
        const dept = await Department.findById(faculty.departmentId).select('name').lean();
        departmentName = dept?.name ?? null;
        if (departmentName) cache.set(cacheKeyDept, departmentName, 3600);
      }

      profile = {
        userId:            faculty._id,
        name:              faculty.name,
        email:             faculty.email,
        role:              faculty.role,
        roleTags:          faculty.roleTags,
        departmentId:      faculty.departmentId,
        departmentName:    departmentName ?? null,
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
