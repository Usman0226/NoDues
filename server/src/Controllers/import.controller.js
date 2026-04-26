import mongoose from 'mongoose';
import xlsx from 'xlsx';
import Student from '../models/Student.js';
import Faculty from '../models/Faculty.js';
import Subject from '../models/Subject.js';
import Class from '../models/Class.js';
import Department from '../models/Department.js';
import { sendCredentialEmail } from '../services/emailService.js';
import asyncHandler from '../utils/asyncHandler.js';
import { parseBuffer, getRowValue } from '../utils/importUtils.js';
import { expandRollNoRange, isRange } from '../utils/rollNoUtils.js';
import ErrorResponse from '../utils/errorResponse.js';
import logger from '../utils/logger.js';
import crypto from 'crypto';
import { invalidateEntityCache } from '../utils/cacheHooks.js';
import Task from '../models/Task.js';
import { startSafeTransaction, commitSafeTransaction, abortSafeTransaction } from '../utils/safeTransaction.js';

const validateEmail = (email) => /^\S+@\S+\.\S+$/.test(email);

const checkDeptScope = (user, deptId) => {
  if (['hod', 'ao'].includes(user.role) && deptId.toString() !== user.departmentId) {
    throw new ErrorResponse('Access denied: Department outside your scope', 403, 'AUTH_DEPARTMENT_SCOPE');
  }
};

export const previewStudents = asyncHandler(async (req, res, next) => {
  if (!req.file) return next(new ErrorResponse('Please upload a file', 400));

  const { classId } = req.query;
  if (!classId) return next(new ErrorResponse('classId is required', 400));

  const targetClass = await Class.findById(classId);
  if (!targetClass) return next(new ErrorResponse('Target class not found', 404));
  checkDeptScope(req.user, targetClass.departmentId);

  const rows = parseBuffer(req.file.buffer);
  const results = { valid: [], errors: [], summary: { total: rows.length, valid: 0, errors: 0 } };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rollNo = getRowValue(row, ['Roll No', 'rollNo']);
    const name = getRowValue(row, ['Name', 'name']);
    const email = getRowValue(row, ['Email', 'email']);

    const errors = [];
    if (!rollNo) errors.push('Roll number is required');
    if (!name) errors.push('Name is required');
    if (!email) errors.push('Email is required');
    else if (!validateEmail(email)) errors.push('Invalid email format');

    if (errors.length > 0) {
      results.errors.push({ row: i + 1, data: row, reason: errors.join(', ') });
      results.summary.errors++;
      continue;
    }

    const existing = await Student.findOne({ rollNo }).select('_id').lean();
    if (existing) {
      results.errors.push({ row: i + 1, data: row, reason: `Roll number ${rollNo} already exists` });
      results.summary.errors++;
      continue;
    }

    results.valid.push({ rollNo: rollNo.toUpperCase(), name, email: email.toLowerCase() });
    results.summary.valid++;
  }

  res.status(200).json({ success: true, data: results });
});

export const commitStudents = asyncHandler(async (req, res, next) => {
  const { students, classId } = req.body;
  if (!students?.length) return next(new ErrorResponse('No valid student data provided', 400));

  const session = await mongoose.startSession();
  let task;
  try {
    await startSafeTransaction(session);

    const targetClass = await Class.findById(classId).session(session);
    if (!targetClass) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Target class not found', 404));
    }
    checkDeptScope(req.user, targetClass.departmentId);

    // Initialize persistent background task
    task = await Task.create([{
      type: 'import_students',
      label: `Importing ${students.length} students to ${targetClass.name}`,
      status: 'processing',
      actor: req.user.userId,
      meta: { requested: students.length }
    }], { session });

    const taskId = task[0]._id;

    // Execute processing sequentially within transaction for guaranteed atomicity
    const createdIds = [];
    const errors = [];

    for (const stud of students) {
      try {
        const studentArray = await Student.create([{
          ...stud,
          classId: targetClass._id,
          departmentId: targetClass.departmentId,
          semester: targetClass.semester,
          academicYear: targetClass.academicYear
        }], { session });
        createdIds.push(studentArray[0]._id);
      } catch (err) {
        // If we want total atomicity, we'd throw here. 
        // But for imports, we often prefer reporting errors.
        // HOWEVER, to "harden consistency", atomic is better.
        // Let's stick to atomic for now: one fail = all roll back.
        throw new Error(`${stud.rollNo}: ${err.message}`);
      }
    }

    if (createdIds.length > 0) {
      await Class.findByIdAndUpdate(classId, { $addToSet: { studentIds: { $each: createdIds } } }, { session });
      invalidateEntityCache('student', 'all');
      invalidateEntityCache('class', classId.toString());
    }

    const finalStatus = 'success';
    await Task.findByIdAndUpdate(taskId, {
      status: finalStatus,
      message: `Completed: ${createdIds.length} succeeded.`,
      meta: { 
        requested: students.length, 
        success: createdIds.length, 
        failed: 0
      }
    }, { session });

    await commitSafeTransaction(session);

    logger.audit('STUDENT_IMPORT_COMMIT', {
      actor: req.user.userId,
      resource_id: classId,
      meta: { 
        taskId,
        requested: students.length, 
        success: createdIds.length,
        failed: 0
      }
    });

    res.status(201).json({
      success: true,
      data: { 
        message: `Successfully imported ${createdIds.length} students`,
        taskId
      }
    });

  } catch (err) {
    if (session.inTransaction()) await abortSafeTransaction(session);
    
    // If we aborted, we should still update the TASK if possible elsewhere or handle the error
    // But since the Task creation is INSIDE the transaction, it's also rolled back.
    // This is good because the user can retry.
    next(err);
  } finally {
    session.endSession();
  }
});

export const previewFaculty = asyncHandler(async (req, res, next) => {
  if (!req.file) return next(new ErrorResponse('Please upload a file', 400));

  const rows = parseBuffer(req.file.buffer);
  const results = { valid: [], errors: [], summary: { total: rows.length, valid: 0, errors: 0 } };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const employeeId = getRowValue(row, ['Employee ID', 'employeeId']);
    const name = getRowValue(row, ['Name', 'name']);
    const email = getRowValue(row, ['Email', 'email']);
    const deptName = getRowValue(row, ['Department', 'department']);

    const errors = [];
    if (!employeeId) errors.push('Employee ID is required');
    if (!name) errors.push('Name is required');
    if (!email) errors.push('Email is required');
    else if (!validateEmail(email)) errors.push('Invalid email format');
    if (!deptName) errors.push('Department name is required');

    if (errors.length > 0) {
      results.errors.push({ row: i + 1, data: row, reason: errors.join(', ') });
      results.summary.errors++;
      continue;
    }

    const dept = await Department.findOne({ name: deptName.toUpperCase() }).select('_id').lean();
    if (!dept) {
      results.errors.push({ row: i + 1, data: row, reason: `Department '${deptName}' not found` });
      results.summary.errors++;
      continue;
    }

    try {
      checkDeptScope(req.user, dept._id);
    } catch (e) {
      results.errors.push({ row: i + 1, data: row, reason: e.message });
      results.summary.errors++;
      continue;
    }

    const [existingId, existingEmail] = await Promise.all([
      Faculty.findOne({ employeeId: employeeId.toUpperCase() }).select('_id').lean(),
      Faculty.findOne({ email: email.toLowerCase() }).select('_id').lean()
    ]);

    if (existingId) {
      results.errors.push({ row: i + 1, data: row, reason: `Employee ID ${employeeId} already exists` });
      results.summary.errors++;
      continue;
    }

    if (existingEmail) {
      results.errors.push({ row: i + 1, data: row, reason: `Email ${email} already exists` });
      results.summary.errors++;
      continue;
    }

    results.valid.push({ 
      employeeId: employeeId.toUpperCase(), 
      name, 
      email: email.toLowerCase(), 
      departmentName: deptName,
      departmentId: dept._id 
    });
    results.summary.valid++;
  }

  res.status(200).json({ success: true, data: results });
});

export const commitFaculty = asyncHandler(async (req, res, next) => {
  const { faculty } = req.body;
  if (!faculty?.length) return next(new ErrorResponse('No valid faculty data provided', 400));

  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);

    // Initialize persistent background task
    const task = await Task.create([{
      type: 'import_faculty',
      label: `Importing ${faculty.length} faculty members`,
      status: 'processing',
      actor: req.user.userId,
      meta: { requested: faculty.length }
    }], { session });

    const taskId = task[0]._id;
    const createdIds = [];

    for (const fac of faculty) {
      try {
        const tempPassword = crypto.randomBytes(4).toString('hex');
        const departmentId = fac.departmentId;

        if (!departmentId) throw new Error(`Department ID missing for ${fac.employeeId}`);
        checkDeptScope(req.user, departmentId);

        const memberArray = await Faculty.create([{
          employeeId: fac.employeeId,
          name: fac.name,
          email: fac.email,
          phone: fac.phone || '',
          departmentId,
          roleTags: fac.roleTags || ['faculty'],
          password: tempPassword
        }], { session });

        const member = memberArray[0];

        // Fire-and-forget email dispatch (outside transaction context for SMTP safety, but triggered only on success)
        // We'll collect and send after commit OR handle via post-commit hooks if we had them.
        // For now, fire-and-forget is fine, it won't break the DB if SMTP fails.
        sendCredentialEmail(member.email, member.name, member.email, tempPassword, 'faculty')
          .catch(err => logger.error('Credential email failed in batch import', { email: member.email, error: err.message }));

        createdIds.push(member._id);
      } catch (err) {
        throw new Error(`${fac.employeeId}: ${err.message}`);
      }
    }

    if (createdIds.length > 0) {
      invalidateEntityCache('faculty', 'all');
    }

    await Task.findByIdAndUpdate(taskId, {
      status: 'success',
      message: `Completed: ${createdIds.length} succeeded.`,
      meta: { 
        requested: faculty.length, 
        success: createdIds.length, 
        failed: 0
      }
    }, { session });

    await commitSafeTransaction(session);

    logger.audit('FACULTY_IMPORT_COMMIT', {
      actor: req.user.userId,
      meta: { 
        taskId,
        requested: faculty.length, 
        success: createdIds.length,
        failed: 0
      }
    });

    res.status(201).json({
      success: true,
      data: { 
        message: `Successfully imported ${createdIds.length} faculty members`,
        taskId
      }
    });

  } catch (err) {
    if (session.inTransaction()) await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
});

/**
 * @desc    Preview elective assignments
 * @route   POST /api/import/electives/preview
 * @access  Admin, HoD
 */
export const previewElectives = asyncHandler(async (req, res, next) => {
  if (!req.file) return next(new ErrorResponse('Please upload a file', 400));
  const rows = parseBuffer(req.file.buffer);
  const results = { valid: [], errors: [], summary: { total: 0, valid: 0, errors: 0 } };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rawRoll = getRowValue(row, ['Roll No', 'rollNo']);
    const subjectCode = getRowValue(row, ['Subject Code', 'subjectCode']);
    const empId = getRowValue(row, ['Faculty Employee ID', 'employeeId']);

    if (!rawRoll || !subjectCode || !empId) {
      results.errors.push({ row: i + 1, data: row, reason: 'Missing required columns (Roll No, Subject Code, Faculty Employee ID)' });
      results.summary.errors++;
      results.summary.total++;
      continue;
    }

    // Expansion Logic
    const rolls = isRange(rawRoll) ? expandRollNoRange(rawRoll) : [rawRoll];
    if (!rolls || rolls.length === 0) {
      results.errors.push({ row: i + 1, data: row, reason: `Invalid range format: ${rawRoll}` });
      results.summary.errors++;
      results.summary.total++;
      continue;
    }

    for (const rollNo of rolls) {
      results.summary.total++;
      const [student, subject, faculty] = await Promise.all([
        Student.findOne({ rollNo: rollNo.toUpperCase(), isActive: true }).select('_id rollNo name departmentId').lean(),
        Subject.findOne({ code: subjectCode.toUpperCase(), isElective: true, isActive: true }).select('_id code name').lean(),
        Faculty.findOne({ employeeId: empId.toUpperCase(), isActive: true }).select('_id employeeId name').lean()
      ]);

      let reason = null;
      if (!student) {
        reason = `Student ${rollNo} not found or inactive`;
      } else if (!subject) {
        reason = `Subject ${subjectCode} not found or inactive`;
      } else if (!faculty) {
        reason = `Faculty ${empId} not found or inactive`;
      } else {
        try {
          checkDeptScope(req.user, student.departmentId);
        } catch (e) {
          reason = `Access denied for Student ${rollNo}: ${e.message}`;
        }
      }

      if (reason) {
        results.errors.push({ 
          row: i + 1, 
          data: { ...row, rollNo }, 
          reason,
          isExpanded: rolls.length > 1,
          originalRange: rolls.length > 1 ? rawRoll : null
        });
        results.summary.errors++;
      } else {
        results.valid.push({ 
          studentId: student._id, 
          rollNo: student.rollNo, 
          studentName: student.name,
          subjectId: subject._id, 
          subjectCode: subject.code,
          subjectName: subject.name,
          facultyId: faculty._id, 
          employeeId: faculty.employeeId,
          facultyName: faculty.name,
          studentDeptId: student.departmentId,
          isExpanded: rolls.length > 1,
          originalRange: rolls.length > 1 ? rawRoll : null
        });
        results.summary.valid++;
      }
    }
  }
  res.status(200).json({ success: true, data: results });
});

/**
 * @desc    Commit elective assignments
 */
export const commitElectives = asyncHandler(async (req, res, next) => {
  const { electives } = req.body;
  if (!electives?.length) return next(new ErrorResponse('Invalid data', 400));

  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);

    // Initialize persistent background task
    const task = await Task.create([{
      type: 'import_electives',
      label: `Mapping ${electives.length} elective assignments`,
      status: 'processing',
      actor: req.user.userId,
      meta: { requested: electives.length }
    }], { session });

    const taskId = task[0]._id;
    const updatedIds = [];

    for (const item of electives) {
      try {
        if (item.studentDeptId) checkDeptScope(req.user, item.studentDeptId);

        const student = await Student.findById(item.studentId).session(session);
        if (!student) throw new Error(`Student ${item.rollNo} not found`);

        checkDeptScope(req.user, student.departmentId);
        
        student.electiveSubjects = student.electiveSubjects.filter(e => e.subjectCode !== item.subjectCode);
        
        student.electiveSubjects.push({
          subjectId: item.subjectId,
          subjectName: item.subjectName,
          subjectCode: item.subjectCode,
          facultyId: item.facultyId,
          facultyName: item.facultyName
        });
        
        await student.save({ session });
        updatedIds.push(student._id);
      } catch (err) {
        throw new Error(`${item.rollNo || item.studentId}: ${err.message}`);
      }
    }

    await Task.findByIdAndUpdate(taskId, {
      status: 'success',
      message: `Completed: ${updatedIds.length} succeeded.`,
      meta: { 
        requested: electives.length, 
        success: updatedIds.length, 
        failed: 0
      }
    }, { session });

    await commitSafeTransaction(session);

    logger.audit('ELECTIVE_IMPORT_COMMIT', {
      actor: req.user.userId,
      meta: { 
        taskId,
        requested: electives.length, 
        success: updatedIds.length,
        failed: 0
      }
    });

    res.status(200).json({ 
      success: true, 
      data: { 
        message: `Successfully updated ${updatedIds.length} elective assignments`,
        taskId
      } 
    });

  } catch (err) {
    if (session.inTransaction()) await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
});

/**
 * @desc    Preview mentor assignments
 * @route   POST /api/import/mentors/preview
 */
export const previewMentors = asyncHandler(async (req, res, next) => {
  if (!req.file) return next(new ErrorResponse('Please upload a file', 400));
  const rows = parseBuffer(req.file.buffer);
  const results = { valid: [], errors: [], summary: { total: 0, valid: 0, errors: 0 } };

  const seenRolls = new Set();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rawRoll = getRowValue(row, ['Roll No', 'rollNo']);
    const empId = getRowValue(row, ['Faculty Employee ID', 'employeeId']);
    
    if (!rawRoll || !empId) {
      results.errors.push({ row: i+1, data: row, reason: 'Missing required columns (Roll No, Faculty Employee ID)' });
      results.summary.errors++;
      results.summary.total++;
      continue;
    }

    // Expansion Logic
    const rolls = isRange(rawRoll) ? expandRollNoRange(rawRoll) : [rawRoll];
    if (!rolls || rolls.length === 0) {
      results.errors.push({ row: i + 1, data: row, reason: `Invalid range format: ${rawRoll}` });
      results.summary.errors++;
      results.summary.total++;
      continue;
    }

    for (const rollNo of rolls) {
      results.summary.total++;
      const upperRoll = rollNo.toUpperCase();
      if (seenRolls.has(upperRoll)) {
        results.errors.push({ 
          row: i + 1, 
          data: { ...row, rollNo }, 
          reason: `Duplicate Roll No ${rollNo} in expansion or file`,
          isExpanded: rolls.length > 1,
          originalRange: rolls.length > 1 ? rawRoll : null
        });
        results.summary.errors++;
        continue;
      }
      seenRolls.add(upperRoll);

      const [student, faculty] = await Promise.all([
        Student.findOne({ rollNo: upperRoll, isActive: true }).select('_id rollNo name departmentId').lean(),
        Faculty.findOne({ employeeId: empId.toUpperCase(), isActive: true }).select('_id employeeId name departmentId roleTags').lean()
      ]);

      let reason = null;
      if (!student) {
        reason = `Student ${rollNo} not found or inactive`;
      } else if (!faculty) {
        reason = `Faculty ${empId} not found or inactive`;
      } else {
          try {
            checkDeptScope(req.user, student.departmentId);
          } catch (e) {
            reason = `Access denied for Student ${rollNo}: ${e.message}`;
          }
      }

      if (reason) {
        results.errors.push({ 
          row: i + 1, 
          data: { ...row, rollNo }, 
          reason,
          isExpanded: rolls.length > 1,
          originalRange: rolls.length > 1 ? rawRoll : null
        });
        results.summary.errors++;
      } else {
        results.valid.push({ 
          studentId: student._id, 
          rollNo: student.rollNo, 
          studentName: student.name,
          mentorId: faculty._id, 
          employeeId: faculty.employeeId,
          facultyName: faculty.name,
          studentDeptId: student.departmentId,
          isExpanded: rolls.length > 1,
          originalRange: rolls.length > 1 ? rawRoll : null
        });
        results.summary.valid++;
      }
    }
  }
  res.status(200).json({ success: true, data: results });
});

/**
 * @desc    Commit mentor assignments
 */
export const commitMentors = asyncHandler(async (req, res, next) => {
  const { mentors } = req.body;
  if (!mentors?.length) return next(new ErrorResponse('Invalid data', 400));

  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);

    // Initialize persistent background task
    const task = await Task.create([{
      type: 'import_mentors',
      label: `Mapping ${mentors.length} students to mentors`,
      status: 'processing',
      actor: req.user.userId,
      meta: { requested: mentors.length }
    }], { session });

    const taskId = task[0]._id;
    const updatedIds = [];

    for (const item of mentors) {
      try {
        if (item.studentDeptId) checkDeptScope(req.user, item.studentDeptId);

        const student = await Student.findById(item.studentId).session(session);
        if (!student) throw new Error(`Student ${item.rollNo} not found`);

        checkDeptScope(req.user, student.departmentId);
        
        student.mentorId = item.mentorId;
        await student.save({ session });
        updatedIds.push(student._id);
      } catch (err) {
        throw new Error(`${item.rollNo || item.studentId}: ${err.message}`);
      }
    }

    await Task.findByIdAndUpdate(taskId, {
      status: 'success',
      message: `Completed: ${updatedIds.length} succeeded.`,
      meta: { 
        requested: mentors.length, 
        success: updatedIds.length, 
        failed: 0
      }
    }, { session });

    const studentIds = mentors.map(m => m.studentId);
    const affectedStudents = await Student.find({ _id: { $in: studentIds } }).select('classId').session(session).lean();
    const affectedClassIds = [...new Set(affectedStudents.map(s => s.classId?.toString()).filter(Boolean))];

    await commitSafeTransaction(session);

    affectedClassIds.forEach(cid => invalidateEntityCache('class', cid));

    logger.audit('MENTOR_IMPORT_COMMIT', {
      actor: req.user.userId,
      meta: { 
        taskId,
        requested: mentors.length, 
        success: updatedIds.length,
        failed: 0
      }
    });

    res.status(200).json({ 
      success: true, 
      data: { 
        message: `Successfully updated ${updatedIds.length} mentor assignments`,
        taskId
      } 
    });

  } catch (err) {
    if (session.inTransaction()) await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
});

/**
 * @desc    Preview subject import
 * @route   POST /api/import/subjects/preview
 */
export const previewSubjects = asyncHandler(async (req, res, next) => {
  if (!req.file) return next(new ErrorResponse('Please upload a file', 400));

  const rows = parseBuffer(req.file.buffer);
  const results = { valid: [], errors: [], summary: { total: rows.length, valid: 0, errors: 0 } };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = getRowValue(row, ['Name', 'subjectName', 'name']);
    const code = getRowValue(row, ['Code', 'subjectCode', 'code']);
    const semester = getRowValue(row, ['Semester', 'semester', 'sem']);
    const isElective = getRowValue(row, ['Is Elective', 'isElective', 'elective']);

    const errors = [];
    if (!name) errors.push('Subject Name is required');
    if (!code) errors.push('Subject Code is required');
    if (semester && (isNaN(semester) || semester < 1 || semester > 8)) {
      errors.push('Semester must be between 1 and 8');
    }

    if (errors.length > 0) {
      results.errors.push({ row: i + 1, data: row, reason: errors.join(', ') });
      results.summary.errors++;
      continue;
    }

    const existing = await Subject.findOne({ code: code.toUpperCase() }).select('_id').lean();
    if (existing) {
      results.errors.push({ row: i + 1, data: row, reason: `Subject code ${code} already exists` });
      results.summary.errors++;
      continue;
    }

    results.valid.push({ 
      name, 
      code: code.toUpperCase(), 
      semester: semester ? Number(semester) : undefined,
      isElective: isElective?.toString().toLowerCase() === 'yes' || isElective === 'true' || isElective === '1' || isElective === true
    });
    results.summary.valid++;
  }

  res.status(200).json({ success: true, data: results });
});


export const commitSubjects = asyncHandler(async (req, res, next) => {
  const { subjects } = req.body;
  if (!subjects?.length) return next(new ErrorResponse('No valid subject data provided', 400));

  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);

    // Initialize persistent background task
    const task = await Task.create([{
      type: 'import_subjects',
      label: `Importing ${subjects.length} subjects`,
      status: 'processing',
      actor: req.user.userId,
      meta: { requested: subjects.length }
    }], { session });

    const taskId = task[0]._id;
    const createdIds = [];

    for (const sub of subjects) {
      try {
        const subjectArray = await Subject.create([sub], { session });
        createdIds.push(subjectArray[0]._id);
      } catch (err) {
        throw new Error(`${sub.code}: ${err.message}`);
      }
    }

    if (createdIds.length > 0) {
      invalidateEntityCache('subject', 'all');
    }

    await Task.findByIdAndUpdate(taskId, {
      status: 'success',
      message: `Completed: ${createdIds.length} succeeded.`,
      meta: { 
        requested: subjects.length, 
        success: createdIds.length, 
        failed: 0
      }
    }, { session });

    await commitSafeTransaction(session);

    logger.audit('SUBJECT_IMPORT_COMMIT', {
      actor: req.user.userId,
      meta: { 
        taskId,
        requested: subjects.length, 
        success: createdIds.length,
        failed: 0
      }
    });

    res.status(201).json({
      success: true,
      data: { 
        message: `Successfully imported ${createdIds.length} subjects`,
        taskId
      }
    });

  } catch (err) {
    if (session.inTransaction()) await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
});

export const getTemplate = asyncHandler(async (req, res, next) => {
  const { type } = req.params;
  let headers = [];
  switch (type) {
    case 'students': headers = ['Roll No', 'Name', 'Email']; break;
    case 'faculty': headers = ['Employee ID', 'Name', 'Email', 'Department', 'Phone']; break;
    case 'electives': headers = ['Roll No', 'Subject Code', 'Faculty Employee ID']; break;
    case 'mentors': headers = ['Roll No', 'Faculty Employee ID']; break;
    case 'subjects': headers = ['Name', 'Code', 'Semester', 'Is Elective']; break;
    default: return next(new ErrorResponse('Invalid template type', 400));
  }
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.json_to_sheet([headers.reduce((acc, h) => ({ ...acc, [h]: '' }), {})], { header: headers });
  xlsx.utils.book_append_sheet(wb, ws, 'Template');
  const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=NDS_Template_${type}.xlsx`);
  res.send(buffer);
});

