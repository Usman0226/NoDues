import mongoose from 'mongoose';
import Class from '../models/Class.js';
import Faculty from '../models/Faculty.js';
import Subject from '../models/Subject.js';
import Student from '../models/Student.js';
import NodueBatch from '../models/NodueBatch.js';
import ErrorResponse from '../utils/errorResponse.js';
import cache from '../config/cache.js';
import logger from '../utils/logger.js';

// Cache invalidation is now handled via Mongoose hooks in the model.

// ── Scope helper — HoD auto-filters to own department ─────────────────────────
const deptScope = (req) =>
  req.user.role === 'hod' ? req.user.departmentId : null;

// ── GET /api/classes ──────────────────────────────────────────────────────────
export const getClasses = async (req, res, next) => {
  try {
    const { departmentId, semester, academicYear, page = 1, limit = 50, includeInactive } = req.query;
    const isPrivileged = ['admin', 'hod'].includes(req.user.role);

    const cacheKey = `classes:list:dept_${departmentId || 'all'}:${semester || 'all'}:${academicYear || 'all'}:${page}:${limit}:${includeInactive}`;
    const cachedData = cache.get(cacheKey);
    if (cachedData) return res.status(200).json({ success: true, ...cachedData });

    const query = {};
    if (includeInactive !== 'true' || !isPrivileged) {
      query.isActive = true;
    }
    const scopedDept = deptScope(req);
    if (scopedDept)    query.departmentId = scopedDept;
    else if (departmentId) query.departmentId = departmentId;

    if (semester)     query.semester     = Number(semester);
    if (academicYear) query.academicYear = academicYear;

    const skip = (Number(page) - 1) * Number(limit);
    const [classes, total] = await Promise.all([
      Class.find(query)
        .populate('departmentId', 'name')
        .populate('classTeacherId', 'name')
        .sort({ academicYear: -1, semester: 1, name: 1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Class.countDocuments(query),
    ]);

    // Active batch lookup (bulk)
    const classIds = classes.map((c) => c._id);
    const activeBatches = await NodueBatch.find(
      { classId: { $in: classIds }, status: 'active' },
      '_id classId'
    ).lean();
    const activeBatchMap = Object.fromEntries(
      activeBatches.map((b) => [b.classId.toString(), b._id.toString()])
    );

    const responseData = {
      data: classes.map((c) => ({
        _id:            c._id,
        name:           c.name,
        departmentId:   c.departmentId?._id,
        departmentName: c.departmentId?.name ?? null,
        semester:       c.semester,
        academicYear:   c.academicYear,
        classTeacher:   c.classTeacherId
          ? { _id: c.classTeacherId._id, name: c.classTeacherId.name }
          : null,
        studentCount:   c.studentIds?.length ?? 0,
        subjectCount:   c.subjectAssignments?.length ?? 0,
        hasActiveBatch: !!activeBatchMap[c._id.toString()],
        isActive:       c.isActive,
      })),
      pagination: {
        page: Number(page), limit: Number(limit), total,
        pages: Math.ceil(total / Number(limit)),
      },
    };

    cache.set(cacheKey, responseData, 300); // 5 min cache
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    return res.status(200).json({ success: true, ...responseData });
  } catch (err) {
    next(err);
  }
};

export const createClass = async (req, res, next) => {
  try {
    const { name, departmentId, semester, academicYear, classTeacherId } = req.body;
    if (!name || !departmentId || !semester || !academicYear) {
      return next(new ErrorResponse('name, departmentId, semester, academicYear required', 400, 'VALIDATION_ERROR'));
    }

    if (req.user.role === 'hod' && req.user.departmentId !== departmentId) {
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    const cls = await Class.create({
      name, departmentId, semester, academicYear,
      classTeacherId: classTeacherId || null,
    });

    logger.info('class_created', {
      timestamp: new Date().toISOString(), actor: req.user.userId,
      action: 'CREATE_CLASS', resource_id: cls._id.toString(),
    });

    // Cache invalidated automatically by Mongoose save hook

    return res.status(201).json({
      success: true,
      data: {
        _id: cls._id, name: cls.name, departmentId: cls.departmentId,
        semester: cls.semester, academicYear: cls.academicYear,
        classTeacherId: cls.classTeacherId,
        subjectAssignments: [], studentIds: [], isActive: true, createdAt: cls.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/classes/:id ──────────────────────────────────────────────────────
export const getClassById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const cacheKey = `class:${id}`;
    const cached   = cache.get(cacheKey);
    if (cached) return res.status(200).json({ success: true, data: cached });

    const cls = await Class.findOne({ _id: id, isActive: true })
      .populate('departmentId', 'name')
      .populate('classTeacherId', 'name email employeeId')
      .populate({
        path: 'studentIds',
        match: { isActive: true },
        select: 'rollNo name email mentorId electiveSubjects isActive',
        populate: { path: 'mentorId', select: 'name' }
      })
      .lean();

    if (!cls) return next(new ErrorResponse('Class not found', 404, 'NOT_FOUND'));

    if (req.user.role === 'hod' && cls.departmentId?._id?.toString() !== req.user.departmentId) {
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    const activeBatch = await NodueBatch.findOne(
      { classId: id, status: 'active' }, '_id'
    ).lean();

    const data = {
      _id:            cls._id,
      name:           cls.name,
      departmentId:   cls.departmentId?._id,
      departmentName: cls.departmentId?.name ?? null,
      semester:       cls.semester,
      academicYear:   cls.academicYear,
      classTeacher:   cls.classTeacherId
        ? { _id: cls.classTeacherId._id, name: cls.classTeacherId.name, email: cls.classTeacherId.email, employeeId: cls.classTeacherId.employeeId }
        : null,
      subjectAssignments: cls.subjectAssignments.map((a) => ({
        _id:         a._id,
        subjectId:   a.subjectId,
        subjectName: a.subjectName,
        subjectCode: a.subjectCode,
        isElective:  a.isElective,
        faculty:     a.facultyId
          ? { _id: a.facultyId, name: a.facultyName }
          : null,
      })),
      students: (cls.studentIds || []).map(s => ({
        _id: s._id,
        rollNo: s.rollNo,
        name: s.name,
        email: s.email,
        mentorId: s.mentorId?._id || s.mentorId || null,
        mentorName: s.mentorId?.name || 'Not Assigned',
        electiveSubjects: s.electiveSubjects || [],
        status: s.isActive ? 'active' : 'inactive'
      })),
      studentCount:    cls.studentIds?.length ?? 0,
      hasActiveBatch:  !!activeBatch,
      activeBatchId:   activeBatch?._id ?? null,
      isActive:        cls.isActive,
      createdAt:       cls.createdAt,
    };

    cache.set(cacheKey, data, 60);
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/classes/:id ────────────────────────────────────────────────────
export const updateClass = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, academicYear } = req.body;

    const cls = await Class.findOne({ _id: id, isActive: true });
    if (!cls) return next(new ErrorResponse('Class not found', 404, 'NOT_FOUND'));

    if (req.user.role === 'hod' && cls.departmentId?.toString() !== req.user.departmentId) {
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    if (name)         cls.name         = name;
    if (academicYear) cls.academicYear = academicYear;
    await cls.save();

    // Invalidation handled by cls.save() -> post('save') hook

    return res.status(200).json({
      success: true,
      data: { _id: cls._id, name: cls.name, academicYear: cls.academicYear },
    });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/classes/:id ───────────────────────────────────────────────────
export const deleteClass = async (req, res, next) => {
  try {
    const { id } = req.params;
    const cls = await Class.findOne({ _id: id, isActive: true });
    if (!cls) return next(new ErrorResponse('Class not found', 404, 'NOT_FOUND'));

    if (req.user.role === 'hod' && cls.departmentId?.toString() !== req.user.departmentId) {
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    cls.isActive = false;
    await cls.save();
    // Invalidation handled by cls.save() -> post('save') hook

    logger.info('class_deleted', {
      timestamp: new Date().toISOString(), actor: req.user.userId,
      action: 'DELETE_CLASS', resource_id: id,
    });

    return res.status(200).json({ success: true, data: { message: 'Class deleted successfully' } });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/classes/:id/class-teacher ──────────────────────────────────────
export const assignClassTeacher = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { classTeacherId } = req.body;

    const [cls, teacher] = await Promise.all([
      Class.findOne({ _id: id, isActive: true }),
      classTeacherId ? Faculty.findOne({ _id: classTeacherId, isActive: true }).lean() : Promise.resolve(null),
    ]);

    if (!cls)     return next(new ErrorResponse('Class not found', 404, 'NOT_FOUND'));
    if (classTeacherId && !teacher) return next(new ErrorResponse('Faculty not found', 404, 'NOT_FOUND'));

    if (req.user.role === 'hod' && cls.departmentId?.toString() !== req.user.departmentId) {
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    cls.classTeacherId = classTeacherId || null;
    await cls.save();
    // Invalidation handled by cls.save() -> post('save') hook

    return res.status(200).json({
      success: true,
      data: {
        classId: cls._id,
        classTeacher: { _id: teacher._id, name: teacher.name, employeeId: teacher.employeeId },
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/classes/:id/subjects ────────────────────────────────────────────
export const addSubjectAssignment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { subjectId, facultyId, subjectCode } = req.body;
    if (!subjectId) {
      return next(new ErrorResponse('subjectId is required', 400, 'VALIDATION_ERROR'));
    }

    const [cls, subject, faculty] = await Promise.all([
      Class.findOne({ _id: id, isActive: true }),
      Subject.findOne({ _id: subjectId, isActive: true }).lean(),
      facultyId ? Faculty.findOne({ _id: facultyId, isActive: true }).lean() : Promise.resolve(null),
    ]);

    if (!cls)     return next(new ErrorResponse('Class not found', 404, 'NOT_FOUND'));
    if (!subject) return next(new ErrorResponse('Subject not found', 404, 'NOT_FOUND'));
    if (facultyId && !faculty) return next(new ErrorResponse('Faculty not found', 404, 'NOT_FOUND'));

    // HoD Scope Check
    if (req.user.role === 'hod' && cls.departmentId?.toString() !== req.user.departmentId) {
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    // Prevent duplicate subject in this class
    const alreadyAssigned = cls.subjectAssignments.some(
      (a) => a.subjectId?.toString() === subjectId
    );
    if (alreadyAssigned) {
      return next(new ErrorResponse('Subject already assigned to this class', 409, 'DUPLICATE_KEY'));
    }

    const assignment = {
      subjectId:   subject._id,
      subjectName: subject.name,
      subjectCode: subjectCode || subject.code,
      isElective:  subject.isElective,
      facultyId:   faculty?._id ?? null,
      facultyName: faculty?.name ?? null,
    };

    cls.subjectAssignments.push(assignment);
    await cls.save();
    // Invalidation handled by cls.save() -> post('save') hook

    const saved = cls.subjectAssignments[cls.subjectAssignments.length - 1];

    return res.status(201).json({
      success: true,
      data: {
        assignmentId: saved._id,
        subjectId:    saved.subjectId,
        subjectName:  saved.subjectName,
        subjectCode:  saved.subjectCode,
        faculty:      faculty
          ? { _id: faculty._id, name: faculty.name, employeeId: faculty.employeeId }
          : null,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/classes/:id/subjects/:assignmentId ─────────────────────────────
export const updateSubjectAssignment = async (req, res, next) => {
  try {
    const { id, assignmentId } = req.params;
    const { facultyId, subjectCode } = req.body;

    const cls = await Class.findOne({ _id: id, isActive: true });
    if (!cls) return next(new ErrorResponse('Class not found', 404, 'NOT_FOUND'));

    // HoD Scope Check
    if (req.user.role === 'hod' && cls.departmentId?.toString() !== req.user.departmentId) {
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    const assignment = cls.subjectAssignments.id(assignmentId);
    if (!assignment) return next(new ErrorResponse('Assignment not found', 404, 'NOT_FOUND'));

    if (subjectCode !== undefined) assignment.subjectCode = subjectCode;

    if (facultyId !== undefined) {
      if (facultyId) {
        const faculty = await Faculty.findOne({ _id: facultyId, isActive: true }).lean();
        if (!faculty) return next(new ErrorResponse('Faculty not found', 404, 'NOT_FOUND'));
        assignment.facultyId   = faculty._id;
        assignment.facultyName = faculty.name;
      } else {
        assignment.facultyId   = null;
        assignment.facultyName = null;
      }
    }

    await cls.save();
    // Invalidation handled by cls.save() -> post('save') hook

    const faculty = assignment.facultyId
      ? await Faculty.findById(assignment.facultyId).select('name employeeId').lean()
      : null;

    return res.status(200).json({
      success: true,
      data: {
        assignmentId:  assignment._id,
        subjectId:     assignment.subjectId,
        subjectName:   assignment.subjectName,
        subjectCode:   assignment.subjectCode,
        faculty:       faculty
          ? { _id: faculty._id, name: faculty.name, employeeId: faculty.employeeId }
          : null,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/classes/:id/subjects/:assignmentId ────────────────────────────
export const removeSubjectAssignment = async (req, res, next) => {
  try {
    const { id, assignmentId } = req.params;

    const cls = await Class.findOne({ _id: id, isActive: true });
    if (!cls) return next(new ErrorResponse('Class not found', 404, 'NOT_FOUND'));

    // HoD Scope Check
    if (req.user.role === 'hod' && cls.departmentId?.toString() !== req.user.departmentId) {
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    const assignment = cls.subjectAssignments.id(assignmentId);
    if (!assignment) return next(new ErrorResponse('Assignment not found', 404, 'NOT_FOUND'));

    assignment.deleteOne();
    await cls.save();
    // Invalidation handled by cls.save() -> post('save') hook

    return res.status(200).json({ success: true, data: { message: 'Subject assignment removed' } });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/classes/:id/clone-subjects ──────────────────────────────────────
export const cloneSubjects = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { sourceClassId } = req.body;

    if (!sourceClassId) {
      return next(new ErrorResponse('sourceClassId is required', 400, 'VALIDATION_ERROR'));
    }

    const [cls, source] = await Promise.all([
      Class.findOne({ _id: id, isActive: true }),
      Class.findOne({ _id: sourceClassId, isActive: true }).lean(),
    ]);

    if (!cls)    return next(new ErrorResponse('Target class not found', 404, 'NOT_FOUND'));
    if (!source) return next(new ErrorResponse('Source class not found', 404, 'NOT_FOUND'));
    
    // HoD Scope Check
    if (req.user.role === 'hod') {
      if (cls.departmentId?.toString() !== req.user.departmentId || source.departmentId?.toString() !== req.user.departmentId) {
         return next(new ErrorResponse('Access denied: cross-department cloning', 403, 'AUTH_DEPARTMENT_SCOPE'));
      }
    }

    if (id === sourceClassId) {
      return next(new ErrorResponse('Cannot clone from self', 400, 'VALIDATION_ERROR'));
    }

    // Copy subjectId + subjectName + subjectCode + isElective; clear faculty fields
    const cloned = source.subjectAssignments.map((a) => ({
      subjectId:   a.subjectId,
      subjectName: a.subjectName,
      subjectCode: a.subjectCode,
      isElective:  a.isElective,
      facultyId:   null,
      facultyName: null,
    }));

    cls.subjectAssignments = cloned;
    await cls.save();
    // Invalidation handled by cls.save() -> post('save') hook

    logger.info('subjects_cloned', {
      timestamp: new Date().toISOString(), actor: req.user.userId,
      action: 'CLONE_SUBJECTS',
      resource_id: id, sourceClassId,
    });

    return res.status(200).json({
      success: true,
      data: {
        classId:      cls._id,
        clonedFrom:   sourceClassId,
        subjectsCloned: cloned.length,
        message:      `${cloned.length} subjects copied. Please assign faculty for each subject.`,
        subjectAssignments: cls.subjectAssignments.map((a) => ({
          assignmentId: a._id,
          subjectId:    a.subjectId,
          subjectName:  a.subjectName,
          subjectCode:  a.subjectCode,
          faculty:      null,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
};
