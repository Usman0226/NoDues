import Department from '../models/Department.js';
import Class from '../models/Class.js';
import NodueBatch from '../models/NodueBatch.js';
import Student from '../models/Student.js';
import Faculty from '../models/Faculty.js';
import ErrorResponse from '../utils/errorResponse.js';
import cache from '../config/cache.js';
import logger from '../utils/logger.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
const invalidateDeptCache = (id) => {
  cache.del(`dept:${id}`);
  cache.del('departments:all');
};

// ── GET /api/departments ──────────────────────────────────────────────────────
export const getDepartments = async (req, res, next) => {
  try {
    const cacheKey = 'departments:all';
    const cached   = cache.get(cacheKey);
    if (cached) return res.status(200).json({ success: true, data: cached });

    const departments = await Department.find()
      .populate('hodId', 'name email employeeId')
      .sort({ name: 1 })
      .lean();

    // Enrich with class & active-batch counts in a single aggregation each
    const deptIds = departments.map((d) => d._id);

    const [classCounts, batchCounts, facultyCounts, studentCounts] = await Promise.all([
      Class.aggregate([
        { $match: { departmentId: { $in: deptIds }, isActive: true } },
        { $group: { _id: '$departmentId', count: { $sum: 1 } } },
      ]),
      NodueBatch.aggregate([
        { $match: { departmentId: { $in: deptIds }, status: 'active' } },
        { $group: { _id: '$departmentId', count: { $sum: 1 } } },
      ]),
      Faculty.aggregate([
        { $match: { departmentId: { $in: deptIds }, isActive: true } },
        { $group: { _id: '$departmentId', count: { $sum: 1 } } },
      ]),
      Student.aggregate([
        { $match: { departmentId: { $in: deptIds }, isActive: true } },
        { $group: { _id: '$departmentId', count: { $sum: 1 } } },
      ]),
    ]);

    const classMap   = Object.fromEntries(classCounts.map((c) => [c._id.toString(), c.count]));
    const batchMap   = Object.fromEntries(batchCounts.map((b) => [b._id.toString(), b.count]));
    const facultyMap = Object.fromEntries(facultyCounts.map((f) => [f._id.toString(), f.count]));
    const studentMap = Object.fromEntries(studentCounts.map((s) => [s._id.toString(), s.count]));

    const data = departments.map((d) => ({
      _id:              d._id,
      name:             d.name,
      hod:              d.hodId
        ? { _id: d.hodId._id, name: d.hodId.name, email: d.hodId.email }
        : null,
      classCount:       classMap[d._id.toString()] ?? 0,
      activeBatchCount: batchMap[d._id.toString()] ?? 0,
      facultyCount:     facultyMap[d._id.toString()] ?? 0,
      studentCount:     studentMap[d._id.toString()] ?? 0,
      createdAt:        d.createdAt,
    }));

    cache.set(cacheKey, data, 300); // 5-min cache
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
    });

    invalidateDeptCache(dept._id.toString());

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
    });

    invalidateDeptCache(id);

    return res.status(200).json({
      success: true,
      data: { _id: dept._id, name: dept.name, hodId: dept.hodId },
    });
  } catch (err) {
    next(err);
  }
};
