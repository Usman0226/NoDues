import mongoose from 'mongoose';
import Student from '../models/Student.js';
import Class from '../models/Class.js';
import Faculty from '../models/Faculty.js';
import Subject from '../models/Subject.js';
import Department from '../models/Department.js';
import NodueBatch from '../models/NodueBatch.js';
import NodueRequest from '../models/NodueRequest.js';
import NodueApproval from '../models/NodueApproval.js';
import ErrorResponse from '../utils/errorResponse.js';
import cache from '../config/cache.js';
import logger from '../utils/logger.js';
import { invalidateEntityCache } from '../utils/cacheHooks.js';
import { 
  syncMentorUpdate, 
  syncStudentUpdate,
  syncElectiveAddition, 
  syncElectiveRemoval,
  syncElectiveUpdate,
  syncStudentDeactivation,
  bulkSyncMentorUpdate,
  bulkSyncStudentDeactivation,
  syncClassChange,
  generateStudentSnapshotData
} from '../utils/batchSync.js';
import CoCurricularType from '../models/CoCurricularType.js';
import { startSafeTransaction, commitSafeTransaction, abortSafeTransaction, getSessionOptions } from '../utils/safeTransaction.js';

export const getStudents = async (req, res, next) => {
  try {
    const { classId, departmentId, semester, search, page = 1, limit = 50, includeInactive } = req.query;
    const isPrivileged = ['admin', 'hod', 'ao'].includes(req.user.role);

    const query = {};
    if (includeInactive !== 'true' || !isPrivileged) {
      query.isActive = true;
    }

    if (req.user.role === 'hod' || req.user.role === 'ao') query.departmentId = req.user.departmentId;
    else if (departmentId)       query.departmentId = departmentId;

    if (classId)   query.classId  = classId;
    if (semester)  query.semester = Number(semester);

    if (search) {
      query.$or = [
        { name:   { $regex: search, $options: 'i' } },
        { rollNo: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const scopeKey = classId || departmentId || req.user.departmentId || 'all';
    const listCacheKey = !search
      ? `students:list:${scopeKey}:p${page}:l${limit}:inc${includeInactive ?? 'false'}`
      : null;

    if (listCacheKey) {
      const cached = cache.get(listCacheKey);
      if (cached) {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
        return res.status(200).json({ success: true, ...cached });
      }
    }

    const [total, students] = await Promise.all([
      Student.countDocuments(query),
      Student.find(query)
        .select('_id rollNo name email classId departmentId semester mentorId isActive')
        .populate('classId', 'name semester')
        .populate('departmentId', 'name')
        .populate('mentorId', 'name employeeId')
        .sort({ rollNo: 1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
    ]);

    const payload = {
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
    };

    if (listCacheKey) cache.set(listCacheKey, payload, 30); 

    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    return res.status(200).json({ success: true, ...payload });
  } catch (err) {
    next(err);
  }
};

export const createStudent = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);
    const { rollNo, name, email, classId, yearOfStudy } = req.body;
    if (!rollNo || !name || !classId) {
      return next(new ErrorResponse('rollNo, name, and classId are required', 400, 'VALIDATION_ERROR'));
    }

    const cls = await Class.findOne({ _id: classId, isActive: true }).session(session).lean();
    if (!cls) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Class not found', 404, 'NOT_FOUND'));
    }

    if ((req.user.role === 'hod' || req.user.role === 'ao') && cls.departmentId?.toString() !== req.user.departmentId) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    const student = await Student.create([{
      rollNo, name, email, classId,
      departmentId: cls.departmentId,
      semester:     cls.semester,
      academicYear: cls.academicYear,
      yearOfStudy:  yearOfStudy ?? null,
    }], getSessionOptions(session));

    await Class.findByIdAndUpdate(classId, { $addToSet: { studentIds: student[0]._id } }, getSessionOptions(session));

    const activeBatch = await NodueBatch.findOne({ classId, status: 'active' }).session(session).lean();
    if (activeBatch) {
      const [hodAccount, ctInfo, coCurricularItems] = await Promise.all([
        Faculty.findOne({
          departmentId: cls.departmentId,
          roleTags: { $in: ['hod', 'ao'] },
          isActive: true
        }).select('name roleTags').session(session).lean(),
        cls.classTeacherId 
          ? Faculty.findById(cls.classTeacherId).select('name').session(session).lean() 
          : null,
        CoCurricularType.find({
          departmentId: cls.departmentId,
          isActive: true
        }).populate('coordinatorId', 'name').session(session).lean()
      ]);

      const snapshot = generateStudentSnapshotData(student[0], cls, {
        hodAccount,
        ctInfo,
        coCurricularItems
      });

      const requestId = new mongoose.Types.ObjectId();
      await NodueRequest.create([{
        _id: requestId,
        batchId: activeBatch._id,
        studentId: student[0]._id,
        studentSnapshot: {
          rollNo: student[0].rollNo,
          name: student[0].name,
          departmentName: cls.departmentId?.name ?? null,
        },
        facultySnapshot: snapshot,
        status: 'pending',
      }], getSessionOptions(session));

      const approvals = Object.values(snapshot).map((f) => ({
        requestId,
        batchId: activeBatch._id,
        studentId: student[0]._id,
        studentRollNo: student[0].rollNo,
        studentName: student[0].name,
        facultyId: f.facultyId,
        subjectId: f.subjectId ?? null,
        subjectName: f.subjectName ?? null,
        itemTypeId: f.itemTypeId ?? null,
        itemTypeName: f.itemTypeName ?? null,
        itemCode: f.itemCode ?? null,
        isOptional: f.isOptional ?? false,
        approvalType: f.approvalType,
        roleTag: f.roleTag,
        action: f.approvalType === 'coCurricular' ? 'not_submitted' : 'pending',
      }));

      if (approvals.length > 0) {
        await NodueApproval.insertMany(approvals, getSessionOptions(session));
      }

      await NodueBatch.findByIdAndUpdate(activeBatch._id, { $inc: { totalStudents: 1 } }, getSessionOptions(session));
    }
    
    await commitSafeTransaction(session);

    logger.info('student_created', {
      timestamp: new Date().toISOString(),
      actor: req.user.userId,
      action: 'CREATE_STUDENT',
      resource_id: student[0]._id.toString(),
      details: { rollNo: student[0].rollNo, classId: student[0].classId.toString() }
    });

    return res.status(201).json({
      success: true,
      data: {
        _id:          student[0]._id,
        rollNo:       student[0].rollNo,
        name:         student[0].name,
        email:        student[0].email,
        classId:      student[0].classId,
        departmentId: student[0].departmentId,
        semester:     student[0].semester,
        academicYear: student[0].academicYear,
        isActive:     true,
        createdAt:    student[0].createdAt,
      },
    });
  } catch (err) {
    await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
};

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

    if ((req.user.role === 'hod' || req.user.role === 'ao') && student.departmentId?._id?.toString() !== req.user.departmentId) {
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

export const updateStudent = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);
    const { id } = req.params;
    const { email, yearOfStudy, name, rollNo, classId } = req.body;

    const student = await Student.findOne({ _id: id, isActive: true }).session(session);
    if (!student) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Student not found', 404, 'NOT_FOUND'));
    }

    if ((req.user.role === 'hod' || req.user.role === 'ao') && student.departmentId?.toString() !== req.user.departmentId) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    if (email       !== undefined) student.email       = email;
    if (yearOfStudy !== undefined) student.yearOfStudy = yearOfStudy;
    if (name        !== undefined) student.name        = name;
    if (rollNo      !== undefined) student.rollNo      = rollNo;
    
    const oldClassId = student.classId;

    if (classId !== undefined && classId !== student.classId?.toString()) {
      const cls = await Class.findOne({ _id: classId, isActive: true }).session(session).lean();
      if (!cls) {
        await abortSafeTransaction(session);
        return next(new ErrorResponse('New Class not found', 404, 'NOT_FOUND'));
      }
      if ((req.user.role === 'hod' || req.user.role === 'ao') && cls.departmentId?.toString() !== req.user.departmentId) {
        await abortSafeTransaction(session);
        return next(new ErrorResponse('Access denied for new class department', 403, 'AUTH_DEPARTMENT_SCOPE'));
      }
      student.classId = classId;
      student.departmentId = cls.departmentId;
      student.semester = cls.semester;
      student.academicYear = cls.academicYear;
      
      await Class.findByIdAndUpdate(oldClassId, { $pull: { studentIds: student._id } }, getSessionOptions(session));
      await Class.findByIdAndUpdate(classId, { $addToSet: { studentIds: student._id } }, getSessionOptions(session));
    }

    await student.save(getSessionOptions(session));
    await commitSafeTransaction(session);

    // ✅ Sync AFTER commit to ensure database state is visible to sync functions
    const isClassChanged = classId && classId !== oldClassId?.toString();
    if (isClassChanged) {
       await syncClassChange(id, oldClassId, student.classId);
    }

    if (name !== undefined || rollNo !== undefined) {
      await syncStudentUpdate(id, { name, rollNo });
    }

    // Invalidate class cache to avoid stale student lists in Class Detail
    const oldCidStr = oldClassId ? oldClassId.toString() : null;
    const curCidStr = student.classId ? student.classId.toString() : null;
    if (oldCidStr) invalidateEntityCache('class', oldCidStr);
    if (curCidStr && curCidStr !== oldCidStr) {
      invalidateEntityCache('class', curCidStr);
    }

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
    await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
};

export const deleteStudent = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);
    const { id } = req.params;
    const student = await Student.findOne({ _id: id, isActive: true }).session(session);
    if (!student) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Student not found', 404, 'NOT_FOUND'));
    }

    if ((req.user.role === 'hod' || req.user.role === 'ao') && student.departmentId?.toString() !== req.user.departmentId) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    student.isActive = false;
    await student.save(getSessionOptions(session));

    await commitSafeTransaction(session);

    // ✅ Sync AFTER commit
    await syncStudentDeactivation(id);

    logger.info('student_deactivated', {
      timestamp: new Date().toISOString(),
      actor: req.user.userId,
      action: 'DELETE_STUDENT',
      resource_id: id,
      details: { rollNo: student.rollNo }
    });

    return res.status(200).json({ success: true, data: { message: 'Student account deactivated' } });
  } catch (err) {
    await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
};

export const assignMentor = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);
    const { id } = req.params;
    const { mentorId } = req.body;
    if (!mentorId) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('mentorId is required', 400, 'VALIDATION_ERROR'));
    }

    const [student, mentor] = await Promise.all([
      Student.findOne({ _id: id, isActive: true }).session(session),
      Faculty.findOne({ _id: mentorId, isActive: true }).session(session).lean(),
    ]);

    if (!student) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Student not found', 404, 'NOT_FOUND'));
    }
    if (!mentor) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Faculty not found', 404, 'NOT_FOUND'));
    }

    // HoD Scope Check
    if ((req.user.role === 'hod' || req.user.role === 'ao') && student.departmentId?.toString() !== req.user.departmentId) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    student.mentorId = mentor._id;
    await student.save(getSessionOptions(session));

    // ✅ Commit FIRST so the committed student.mentorId is visible to syncMentorUpdate
    await commitSafeTransaction(session);

    // ✅ Sync runs after commit — reads the correct, committed mentorId
    await syncMentorUpdate(id, mentor._id, mentor.name);

    if (student.classId) {
      invalidateEntityCache('class', student.classId.toString());
    }

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
    await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
};

export const addElective = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);
    const { id } = req.params;
    const { subjectId, facultyId } = req.body;
    if (!subjectId || !facultyId) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('subjectId and facultyId are required', 400, 'VALIDATION_ERROR'));
    }

    const [student, subject, faculty] = await Promise.all([
      Student.findOne({ _id: id, isActive: true }).session(session),
      Subject.findOne({ _id: subjectId, isElective: true, isActive: true }).session(session).lean(),
      Faculty.findOne({ _id: facultyId, isActive: true }).session(session).lean(),
    ]);

    if (!student) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Student not found', 404, 'NOT_FOUND'));
    }
    if (!subject) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Elective subject not found', 404, 'NOT_FOUND'));
    }
    if (!faculty) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Faculty not found', 404, 'NOT_FOUND'));
    }

    // HoD Scope Check
    if ((req.user.role === 'hod' || req.user.role === 'ao') && student.departmentId?.toString() !== req.user.departmentId) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    const alreadyAssigned = student.electiveSubjects.some(
      (e) => e.subjectId?.toString() === subjectId
    );
    if (alreadyAssigned) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Elective already assigned to this student', 409, 'DUPLICATE_KEY'));
    }

    student.electiveSubjects.push({
      subjectId: subject._id, subjectName: subject.name, subjectCode: subject.code,
      facultyId: faculty._id, facultyName: faculty.name,
    });
    await student.save(getSessionOptions(session));

    const newest = student.electiveSubjects[student.electiveSubjects.length - 1];
    
    await syncElectiveAddition(id, {
        subjectId: newest.subjectId,
        subjectName: newest.subjectName,
        subjectCode: newest.subjectCode,
        facultyId: newest.facultyId,
        facultyName: newest.facultyName
    });

    await commitSafeTransaction(session);

    logger.info('elective_added', {
      timestamp: new Date().toISOString(),
      actor: req.user.userId,
      action: 'ADD_ELECTIVE',
      resource_id: student._id.toString(),
      details: { subjectId: subject._id.toString(), facultyId: faculty._id.toString() }
    });

    return res.status(201).json({
      success: true,
      data: {
        assignmentId: newest._id, subjectId: newest.subjectId,
        subjectName: newest.subjectName, subjectCode: newest.subjectCode,
        faculty: { _id: faculty._id, name: faculty.name },
      },
    });
  } catch (err) {
    await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
};

export const updateElective = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);
    const { id, assignmentId } = req.params;
    const { facultyId } = req.body;
    if (!facultyId) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('facultyId is required', 400, 'VALIDATION_ERROR'));
    }

    const [student, faculty] = await Promise.all([
      Student.findOne({ _id: id, isActive: true }).session(session),
      Faculty.findOne({ _id: facultyId, isActive: true }).session(session).lean(),
    ]);

    if (!student) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Student not found', 404, 'NOT_FOUND'));
    }
    if (!faculty) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Faculty not found', 404, 'NOT_FOUND'));
    }

    if ((req.user.role === 'hod' || req.user.role === 'ao') && student.departmentId?.toString() !== req.user.departmentId) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    const elective = student.electiveSubjects.id(assignmentId);
    if (!elective) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Elective assignment not found', 404, 'NOT_FOUND'));
    }

    const subjectId = elective.subjectId;
    elective.facultyId   = faculty._id;
    elective.facultyName = faculty.name;
    await student.save(getSessionOptions(session));

    // ✅ Commit before syncing so the active batch reads committed data
    await commitSafeTransaction(session);

    // ✅ Propagate faculty change to any active batch approval for this elective
    await syncElectiveUpdate(id, subjectId, { facultyId: faculty._id, facultyName: faculty.name });

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
    if (session.inTransaction()) await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
};

export const removeElective = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);
    const { id, assignmentId } = req.params;
    const student = await Student.findOne({ _id: id, isActive: true }).session(session);
    if (!student) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Student not found', 404, 'NOT_FOUND'));
    }

    const elective = student.electiveSubjects.id(assignmentId);
    if (!elective) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Elective assignment not found', 404, 'NOT_FOUND'));
    }

    // HoD Scope Check
    if ((req.user.role === 'hod' || req.user.role === 'ao') && student.departmentId?.toString() !== req.user.departmentId) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    const subjectIdToSync = elective.subjectId;
    elective.deleteOne();
    await student.save(getSessionOptions(session));

    await syncElectiveRemoval(id, subjectIdToSync);

    await commitSafeTransaction(session);

    logger.info('elective_removed', {
      timestamp: new Date().toISOString(),
      actor: req.user.userId,
      action: 'REMOVE_ELECTIVE',
      resource_id: student._id.toString(),
      details: { assignmentId }
    });

    return res.status(200).json({ success: true, data: { message: 'Elective removed' } });
  } catch (err) {
    await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
};

export const activateStudent = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);
    const student = await Student.findById(req.params.id).session(session);

    if (!student) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Student not found', 404));
    }

    if ((req.user.role === 'hod' || req.user.role === 'ao') && 
        student.departmentId.toString() !== req.user.departmentId.toString()) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Unauthorized: Access denied to other department students', 403));
    }

    student.isActive = true;
    await student.save(getSessionOptions(session));

    await commitSafeTransaction(session);

    invalidateEntityCache('student', student._id);

    logger.info('student_activated', {
      timestamp: new Date().toISOString(),
      actor: req.user.userId,
      action: 'ACTIVATE_STUDENT',
      resource_id: student._id
    });

    return res.status(200).json({
      success: true,
      data: student
    });
  } catch (err) {
    if (session.inTransaction()) await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
};

export const bulkActivateStudents = async (req, res, next) => {
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

    const result = await Student.updateMany(query, { isActive: true }, getSessionOptions(session));

    await commitSafeTransaction(session);

    // Invalidate caches
    ids.forEach(id => invalidateEntityCache('student', id));

    logger.info('students_bulk_activated', {
      timestamp: new Date().toISOString(),
      actor: req.user.userId,
      action: 'BULK_ACTIVATE_STUDENT',
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

export const bulkDeactivateStudents = async (req, res, next) => {
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

    const students = await Student.find(query).session(session).select('_id');
    const studentIds = students.map(s => s._id);

    const result = await Student.updateMany(query, { isActive: false }, getSessionOptions(session));

    await bulkSyncStudentDeactivation(studentIds);

    await commitSafeTransaction(session);

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
    await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
};

export const bulkAssignMentor = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);
    const { ids, mentorId } = req.body;
    if (!ids || !Array.isArray(ids) || !mentorId) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('ids array and mentorId are required', 400));
    }

    const mentor = await Faculty.findOne({ _id: mentorId, isActive: true }).session(session).lean();
    if (!mentor) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Mentor not found', 404));
    }

    const query = { _id: { $in: ids }, isActive: true };
    if (req.user.role === 'hod' || req.user.role === 'ao') {
      query.departmentId = req.user.departmentId;
    }

    const result = await Student.updateMany(query, { mentorId: mentor._id }, getSessionOptions(session));

    // Fetch affected students to find their classIds for cache invalidation
    const updatedStudents = await Student.find(query).select('classId').session(session).lean();
    const affectedClassIds = [...new Set(updatedStudents.map(s => s.classId?.toString()).filter(Boolean))];

    // ✅ Commit FIRST — bulkSyncMentorUpdate must see the committed mentorId values
    await commitSafeTransaction(session);

    await bulkSyncMentorUpdate(ids, mentor._id, mentor.name);

    // Invalidate class caches to ensure Class Detail page reflects updates
    affectedClassIds.forEach(cid => invalidateEntityCache('class', cid));

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
    await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
};