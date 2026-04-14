import Student from '../models/Student.js';
import Class from '../models/Class.js';
import Faculty from '../models/Faculty.js';
import Subject from '../models/Subject.js';
import Department from '../models/Department.js';
import ErrorResponse from '../utils/errorResponse.js';
import cache from '../config/cache.js';
import logger from '../utils/logger.js';
// Cache invalidation is now handled via Mongoose hooks in the model.

// ── GET /api/students ─────────────────────────────────────────────────────────
export const getStudents = async (req, res, next) => {
  try {
    const { classId, departmentId, semester, search, page = 1, limit = 50, includeInactive } = req.query;
    const isPrivileged = ['admin', 'hod'].includes(req.user.role);

    const query = {};
    // Only exclude inactive by default unless requested by admin/hod
    if (includeInactive !== 'true' || !isPrivileged) {
      query.isActive = true;
    }

    if (req.user.role === 'hod') query.departmentId = req.user.departmentId;
    else if (departmentId)       query.departmentId = departmentId;

    if (classId)   query.classId  = classId;
    if (semester)  query.semester = Number(semester);

    if (search) {
      query.$or = [
        { name:   { $regex: search, $options: 'i' } },
        { rollNo: { $regex: search, $options: 'i' } },
      ];
    }

    const total = await Student.countDocuments(query);
    const skip  = (Number(page) - 1) * Number(limit);

    const students = await Student.find(query)
      .populate('classId', 'name semester')
      .populate('departmentId', 'name')
      .populate('mentorId', 'name employeeId')
      .sort({ rollNo: 1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    return res.status(200).json({
      success: true,
      data: students.map((s) => ({
        _id:            s._id,
        rollNo:         s.rollNo,
        name:           s.name,
        email:          s.email,
        classId:        s.classId?._id,
        className:      s.classId?.name ?? null,
        departmentName: s.departmentId?.name ?? null,
        semester:       s.classId?.semester ?? s.semester,
        mentor:         s.mentorId
          ? { _id: s.mentorId._id, name: s.mentorId.name }
          : null,
        mentorName:     s.mentorId?.name ?? null,
        isActive:       s.isActive,
      })),
      pagination: {
        page: Number(page), limit: Number(limit), total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/students ────────────────────────────────────────────────────────
export const createStudent = async (req, res, next) => {
  try {
    const { rollNo, name, email, classId, yearOfStudy } = req.body;
    if (!rollNo || !name || !classId) {
      return next(new ErrorResponse('rollNo, name, and classId are required', 400, 'VALIDATION_ERROR'));
    }

    const cls = await Class.findOne({ _id: classId, isActive: true }).lean();
    if (!cls) return next(new ErrorResponse('Class not found', 404, 'NOT_FOUND'));

    if (req.user.role === 'hod' && cls.departmentId?.toString() !== req.user.departmentId) {
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    const student = await Student.create({
      rollNo, name, email, classId,
      departmentId: cls.departmentId,
      semester:     cls.semester,
      academicYear: cls.academicYear,
      yearOfStudy:  yearOfStudy ?? null,
    });

    // Add student to class.studentIds
    await Class.findByIdAndUpdate(classId, { $addToSet: { studentIds: student._id } });
    
    // Cache invalidated automatically by Mongoose student save hook

    logger.info('student_created', {
      timestamp: new Date().toISOString(),
      actor: req.user.userId,
      action: 'CREATE_STUDENT',
      resource_id: student._id.toString(),
      details: { rollNo: student.rollNo, classId: student.classId.toString() }
    });

    return res.status(201).json({
      success: true,
      data: {
        _id:          student._id,
        rollNo:       student.rollNo,
        name:         student.name,
        email:        student.email,
        classId:      student.classId,
        departmentId: student.departmentId,
        semester:     student.semester,
        academicYear: student.academicYear,
        isActive:     true,
        createdAt:    student.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/students/:id ─────────────────────────────────────────────────────
export const getStudentById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const cacheKey = `student:${id}`;
    const cached   = cache.get(cacheKey);
    if (cached) return res.status(200).json({ success: true, data: cached });

    const student = await Student.findOne({ _id: id, isActive: true })
      .populate('classId', 'name semester academicYear')
      .populate('departmentId', 'name')
      .populate('mentorId', 'name email employeeId')
      .lean();

    if (!student) return next(new ErrorResponse('Student not found', 404, 'NOT_FOUND'));

    if (req.user.role === 'hod' && student.departmentId?._id?.toString() !== req.user.departmentId) {
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    const data = {
      _id:            student._id,
      rollNo:         student.rollNo,
      name:           student.name,
      email:          student.email,
      classId:        student.classId?._id,
      className:      student.classId?.name ?? null,
      departmentName: student.departmentId?.name ?? null,
      semester:       student.classId?.semester ?? student.semester,
      academicYear:   student.classId?.academicYear ?? student.academicYear,
      yearOfStudy:    student.yearOfStudy,
      mentor:         student.mentorId
        ? { _id: student.mentorId._id, name: student.mentorId.name, email: student.mentorId.email, employeeId: student.mentorId.employeeId }
        : null,
      electiveSubjects: student.electiveSubjects ?? [],
      isActive:       student.isActive,
      createdAt:      student.createdAt,
    };

    cache.set(cacheKey, data, 120);
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/students/:id ───────────────────────────────────────────────────
export const updateStudent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { email, yearOfStudy, name, rollNo, classId } = req.body;

    const student = await Student.findOne({ _id: id, isActive: true });
    if (!student) return next(new ErrorResponse('Student not found', 404, 'NOT_FOUND'));

    if (req.user.role === 'hod' && student.departmentId?.toString() !== req.user.departmentId) {
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    if (email       !== undefined) student.email       = email;
    if (yearOfStudy !== undefined) student.yearOfStudy = yearOfStudy;
    if (name        !== undefined) student.name        = name;
    if (rollNo      !== undefined) student.rollNo      = rollNo;
    
    // Store old classId to invalidate it later
    const oldClassId = student.classId;

    if (classId !== undefined && classId !== student.classId?.toString()) {
      const cls = await Class.findOne({ _id: classId, isActive: true }).lean();
      if (!cls) return next(new ErrorResponse('New Class not found', 404, 'NOT_FOUND'));
      if (req.user.role === 'hod' && cls.departmentId?.toString() !== req.user.departmentId) {
        return next(new ErrorResponse('Access denied for new class department', 403, 'AUTH_DEPARTMENT_SCOPE'));
      }
      student.classId = classId;
      student.departmentId = cls.departmentId;
      student.semester = cls.semester;
      student.academicYear = cls.academicYear;
      
      // Update class arrays
      await Class.findByIdAndUpdate(oldClassId, { $pull: { studentIds: student._id } });
      await Class.findByIdAndUpdate(classId, { $addToSet: { studentIds: student._id } });
    }

    await student.save();
    // Cache invalidated automatically by Mongoose student save hook

    logger.info('student_updated', {
      timestamp: new Date().toISOString(),
      actor: req.user.userId,
      action: 'UPDATE_STUDENT',
      resource_id: id,
      details: { updatedFields: Object.keys(req.body) }
    });

    return res.status(200).json({
      success: true,
      data: { _id: student._id, name: student.name, rollNo: student.rollNo, email: student.email, classId: student.classId },
    });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/students/:id ──────────────────────────────────────────────────
export const deleteStudent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const student = await Student.findOne({ _id: id, isActive: true });
    if (!student) return next(new ErrorResponse('Student not found', 404, 'NOT_FOUND'));

    if (req.user.role === 'hod' && student.departmentId?.toString() !== req.user.departmentId) {
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    student.isActive = false;
    await student.save();
    // Cache invalidated automatically by Mongoose student save hook

    logger.info('student_deactivated', {
      timestamp: new Date().toISOString(),
      actor: req.user.userId,
      action: 'DELETE_STUDENT',
      resource_id: id,
      details: { rollNo: student.rollNo }
    });

    return res.status(200).json({ success: true, data: { message: 'Student account deactivated' } });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/students/:id/mentor ────────────────────────────────────────────
export const assignMentor = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { mentorId } = req.body;
    if (!mentorId) return next(new ErrorResponse('mentorId is required', 400, 'VALIDATION_ERROR'));

    const [student, mentor] = await Promise.all([
      Student.findOne({ _id: id, isActive: true }),
      Faculty.findOne({ _id: mentorId, isActive: true }).lean(),
    ]);

    if (!student) return next(new ErrorResponse('Student not found', 404, 'NOT_FOUND'));
    if (!mentor)  return next(new ErrorResponse('Faculty not found', 404, 'NOT_FOUND'));

    // HoD Scope Check
    if (req.user.role === 'hod' && student.departmentId?.toString() !== req.user.departmentId) {
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    student.mentorId = mentor._id;
    await student.save();
    // Cache invalidated automatically by Mongoose student save hook

    logger.info('mentor_assigned', {
      timestamp: new Date().toISOString(),
      actor: req.user.userId,
      action: 'ASSIGN_MENTOR',
      resource_id: student._id.toString(),
      details: { mentorId: mentor._id.toString() }
    });

    return res.status(200).json({
      success: true,
      data: {
        studentId: student._id,
        mentor: { _id: mentor._id, name: mentor.name, employeeId: mentor.employeeId },
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/students/:id/electives ─────────────────────────────────────────
export const addElective = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { subjectId, facultyId } = req.body;
    if (!subjectId || !facultyId) {
      return next(new ErrorResponse('subjectId and facultyId are required', 400, 'VALIDATION_ERROR'));
    }

    const [student, subject, faculty] = await Promise.all([
      Student.findOne({ _id: id, isActive: true }),
      Subject.findOne({ _id: subjectId, isElective: true, isActive: true }).lean(),
      Faculty.findOne({ _id: facultyId, isActive: true }).lean(),
    ]);

    if (!student) return next(new ErrorResponse('Student not found', 404, 'NOT_FOUND'));
    if (!subject) return next(new ErrorResponse('Elective subject not found', 404, 'NOT_FOUND'));
    if (!faculty) return next(new ErrorResponse('Faculty not found', 404, 'NOT_FOUND'));

    // HoD Scope Check
    if (req.user.role === 'hod' && student.departmentId?.toString() !== req.user.departmentId) {
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    const alreadyAssigned = student.electiveSubjects.some(
      (e) => e.subjectId?.toString() === subjectId
    );
    if (alreadyAssigned) {
      return next(new ErrorResponse('Elective already assigned to this student', 409, 'DUPLICATE_KEY'));
    }

    student.electiveSubjects.push({
      subjectId: subject._id, subjectName: subject.name, subjectCode: subject.code,
      facultyId: faculty._id, facultyName: faculty.name,
    });
    await student.save();
    // Cache invalidated automatically by Mongoose student save hook

    logger.info('elective_added', {
      timestamp: new Date().toISOString(),
      actor: req.user.userId,
      action: 'ADD_ELECTIVE',
      resource_id: student._id.toString(),
      details: { subjectId: subject._id.toString(), facultyId: faculty._id.toString() }
    });

    const saved = student.electiveSubjects[student.electiveSubjects.length - 1];
    return res.status(201).json({
      success: true,
      data: {
        assignmentId: saved._id, subjectId: saved.subjectId,
        subjectName: saved.subjectName, subjectCode: saved.subjectCode,
        faculty: { _id: faculty._id, name: faculty.name },
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/students/:id/electives/:assignmentId ──────────────────────────
export const updateElective = async (req, res, next) => {
  try {
    const { id, assignmentId } = req.params;
    const { facultyId } = req.body;
    if (!facultyId) return next(new ErrorResponse('facultyId is required', 400, 'VALIDATION_ERROR'));

    const [student, faculty] = await Promise.all([
      Student.findOne({ _id: id, isActive: true }),
      Faculty.findOne({ _id: facultyId, isActive: true }).lean(),
    ]);

    if (!student) return next(new ErrorResponse('Student not found', 404, 'NOT_FOUND'));
    if (!faculty) return next(new ErrorResponse('Faculty not found', 404, 'NOT_FOUND'));

    // HoD Scope Check
    if (req.user.role === 'hod' && student.departmentId?.toString() !== req.user.departmentId) {
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    const elective = student.electiveSubjects.id(assignmentId);
    if (!elective) return next(new ErrorResponse('Elective assignment not found', 404, 'NOT_FOUND'));

    elective.facultyId   = faculty._id;
    elective.facultyName = faculty.name;
    await student.save();
    // Cache invalidated automatically by Mongoose student save hook

    logger.info('elective_updated', {
      timestamp: new Date().toISOString(),
      actor: req.user.userId,
      action: 'UPDATE_ELECTIVE',
      resource_id: student._id.toString(),
      details: { assignmentId, newFacultyId: faculty._id.toString() }
    });

    return res.status(200).json({
      success: true,
      data: {
        assignmentId: elective._id, subjectId: elective.subjectId,
        subjectName: elective.subjectName,
        faculty: { _id: faculty._id, name: faculty.name },
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/students/:id/electives/:assignmentId ─────────────────────────
export const removeElective = async (req, res, next) => {
  try {
    const { id, assignmentId } = req.params;
    const student = await Student.findOne({ _id: id, isActive: true });
    if (!student) return next(new ErrorResponse('Student not found', 404, 'NOT_FOUND'));

    const elective = student.electiveSubjects.id(assignmentId);
    if (!elective) return next(new ErrorResponse('Elective assignment not found', 404, 'NOT_FOUND'));

    // HoD Scope Check
    if (req.user.role === 'hod' && student.departmentId?.toString() !== req.user.departmentId) {
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    elective.deleteOne();
    await student.save();
    // Cache invalidated automatically by Mongoose student save hook

    logger.info('elective_removed', {
      timestamp: new Date().toISOString(),
      actor: req.user.userId,
      action: 'REMOVE_ELECTIVE',
      resource_id: student._id.toString(),
      details: { assignmentId }
    });

    return res.status(200).json({ success: true, data: { message: 'Elective removed' } });
  } catch (err) {
    next(err);
  }
};

// ── BATCH OPERATIONS ─────────────────────────────────────────────────────────

export const bulkDeactivateStudents = async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) {
      return next(new ErrorResponse('IDs array is required', 400));
    }

    const query = { _id: { $in: ids }, isActive: true };
    if (req.user.role === 'hod') {
      query.departmentId = req.user.departmentId;
    }

    const students = await Student.find(query).select('_id classId departmentId');
    const result = await Student.updateMany(query, { isActive: false });

    // Cache invalidated automatically by Mongoose student hooks

    logger.info('students_bulk_deactivated', {
      timestamp: new Date().toISOString(),
      actor: req.user.userId,
      action: 'BULK_DELETE_STUDENT',
      details: { count: result.modifiedCount, requested: ids.length }
    });

    return res.status(200).json({
      success: true,
      data: { modifiedCount: result.modifiedCount }
    });
  } catch (err) {
    next(err);
  }
};

export const bulkAssignMentor = async (req, res, next) => {
  try {
    const { ids, mentorId } = req.body;
    if (!ids || !Array.isArray(ids) || !mentorId) {
      return next(new ErrorResponse('ids array and mentorId are required', 400));
    }

    const mentor = await Faculty.findOne({ _id: mentorId, isActive: true }).lean();
    if (!mentor) return next(new ErrorResponse('Mentor not found', 404));

    const query = { _id: { $in: ids }, isActive: true };
    if (req.user.role === 'hod') {
      query.departmentId = req.user.departmentId;
    }

    const result = await Student.updateMany(query, { mentorId: mentor._id });

    // Side effects
    // Cache invalidated automatically by Mongoose student hooks

    logger.info('students_bulk_mentor_assigned', {
      timestamp: new Date().toISOString(),
      actor: req.user.userId,
      action: 'BULK_ASSIGN_MENTOR',
      details: { count: result.modifiedCount, mentorId }
    });

    return res.status(200).json({
      success: true,
      data: { modifiedCount: result.modifiedCount }
    });
  } catch (err) {
    next(err);
  }
};
