import Department from '../models/Department.js';
import Class from '../models/Class.js';
import NodueBatch from '../models/NodueBatch.js';
import Student from '../models/Student.js';
import Faculty from '../models/Faculty.js';
import ErrorResponse from '../utils/errorResponse.js';
import cache from '../config/cache.js';
import logger from '../utils/logger.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
// Cache invalidation is now handled via Mongoose hooks in the model.

// ── GET /api/departments ──────────────────────────────────────────────────────
export const getDepartments = async (req, res, next) => {
  try {
    const cacheKey = req.user.role === 'hod' ? `departments:hod:${req.user.departmentId}` : 'departments:all';
    const cached   = cache.get(cacheKey);
    if (cached) return res.status(200).json({ success: true, data: cached });

    const query = {};
    if (req.user.role === 'hod') {
      query._id = req.user.departmentId;
    }

    const departments = await Department.find(query)
      .populate('hodId', 'name email employeeId')
      .sort({ name: 1 })
      .lean();

    const data = await Promise.all(
      departments.map(async (d) => {
        const id = d._id;
        const [classCount, activeBatchCount, facultyCount, studentCount] = await Promise.all([
          Class.countDocuments({ departmentId: id, isActive: true }),
          NodueBatch.countDocuments({ departmentId: id, status: 'active' }),
          Faculty.countDocuments({ departmentId: id, isActive: true }),
          Student.countDocuments({ departmentId: id, isActive: true }),
        ]);
        return {
          _id:              d._id,
          name:             d.name,
          hod:              d.hodId
            ? { _id: d.hodId._id, name: d.hodId.name, email: d.hodId.email }
            : null,
          classCount,
          activeBatchCount,
          facultyCount,
          studentCount,
          createdAt: d.createdAt,
        };
      })
    );

    cache.set(cacheKey, data, 300); // 5-min cache
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/departments ─────────────────────────────────────────────────────
export const createDepartment = async (req, res, next) => {
  try {
    const { name, hodId } = req.body;
    if (!name) {
      return next(new ErrorResponse('Department name is required', 400, 'VALIDATION_ERROR'));
    }

    // Validate HoD exists if provided
    if (hodId) {
      const hod = await Faculty.findById(hodId).lean();
      if (!hod || !hod.isActive) {
        return next(new ErrorResponse('HoD faculty not found', 404, 'NOT_FOUND'));
      }
    }

    const dept = await Department.create({ name: name.toUpperCase().trim(), hodId: hodId || null });

    logger.info('department_created', {
      timestamp: new Date().toISOString(),
      actor: req.user.userId,
      action: 'CREATE_DEPARTMENT',
      resource_id: dept._id.toString(),
      details: { name: dept.name, hodId: dept.hodId }
    });

    // Cache invalidated automatically by Mongoose save hook

    return res.status(201).json({
      success: true,
      data: {
        _id:       dept._id,
        name:      dept.name,
        hodId:     dept.hodId,
        createdAt: dept.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/departments/:id ──────────────────────────────────────────────────
export const getDepartmentById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // HoD can only view their own department
    if (req.user.role === 'hod' && req.user.departmentId !== id) {
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    const cacheKey = `dept:detail:${id}`;
    const cached   = cache.get(cacheKey);
    if (cached) return res.status(200).json({ success: true, data: cached });

    const dept = await Department.findById(id)
      .populate('hodId', 'name email employeeId')
      .lean();

    if (!dept) {
      return next(new ErrorResponse('Department not found', 404, 'NOT_FOUND'));
    }

    const [classCount, activeBatchCount, facultyCount, studentCount] = await Promise.all([
      Class.countDocuments({ departmentId: id, isActive: true }),
      NodueBatch.countDocuments({ departmentId: id, status: 'active' }),
      Faculty.countDocuments({ departmentId: id, isActive: true }),
      Student.countDocuments({ departmentId: id, isActive: true }),
    ]);

    const data = {
      _id:  dept._id,
      name: dept.name,
      hod:  dept.hodId
        ? {
            _id:        dept.hodId._id,
            name:       dept.hodId.name,
            email:      dept.hodId.email,
            employeeId: dept.hodId.employeeId,
          }
        : null,
      classCount,
      activeBatchCount,
      facultyCount,
      studentCount,
      createdAt: dept.createdAt,
    };

    cache.set(cacheKey, data, 300);
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/departments/:id ────────────────────────────────────────────────
export const updateDepartment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, hodId } = req.body;

    const dept = await Department.findById(id);
    if (!dept) {
      return next(new ErrorResponse('Department not found', 404, 'NOT_FOUND'));
    }

    if (hodId !== undefined) {
      if (hodId) {
        const hod = await Faculty.findById(hodId).lean();
        if (!hod || !hod.isActive) {
          return next(new ErrorResponse('HoD faculty not found', 404, 'NOT_FOUND'));
        }
      }
      dept.hodId = hodId || null;
    }

    if (name) dept.name = name.toUpperCase().trim();

    await dept.save();

    logger.info('department_updated', {
      timestamp: new Date().toISOString(),
      actor: req.user.userId,
      action: 'UPDATE_DEPARTMENT',
      resource_id: id,
      details: { updatedFields: Object.keys(req.body) }
    });

    // Cache invalidated automatically by Mongoose save hook

    return res.status(200).json({
      success: true,
      data: { _id: dept._id, name: dept.name, hodId: dept.hodId },
    });
  } catch (err) {
    next(err);
  }
};
