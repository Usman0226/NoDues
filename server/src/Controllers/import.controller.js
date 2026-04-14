import xlsx from 'xlsx';
import Student from '../models/Student.js';
import Faculty from '../models/Faculty.js';
import Subject from '../models/Subject.js';
import Class from '../models/Class.js';
import Department from '../models/Department.js';
import { sendCredentialEmail } from '../services/emailService.js';
import asyncHandler from '../utils/asyncHandler.js';
import ErrorResponse from '../utils/errorResponse.js';
import logger from '../utils/logger.js';
import crypto from 'crypto';
import { invalidateEntityCache } from '../utils/cacheHooks.js';
import Task from '../models/Task.js';

const parseBuffer = (buffer) => {
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return xlsx.utils.sheet_to_json(sheet);
};

// ── Shared Helpers for Complexity Reduction ───────────────────────────────────

const validateEmail = (email) => /^\S+@\S+\.\S+$/.test(email);

const checkDeptScope = (user, deptId) => {
  if (user.role === 'hod' && deptId.toString() !== user.departmentId) {
    throw new ErrorResponse('Access denied: Department outside your scope', 403, 'AUTH_DEPARTMENT_SCOPE');
  }
};

const getRowValue = (row, keys) => {
  for (const key of keys) {
    if (row[key] !== undefined) return row[key]?.toString().trim();
  }
  return null;
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

  const targetClass = await Class.findById(classId);
  if (!targetClass) return next(new ErrorResponse('Target class not found', 404));
  checkDeptScope(req.user, targetClass.departmentId);

  // Initialize persistent background task
  const task = await Task.create({
    type: 'import_students',
    label: `Importing ${students.length} students to ${targetClass.name}`,
    status: 'processing',
    actor: req.user.userId,
    meta: { requested: students.length }
  });

  // Execute processing
  const creationTasks = students.map(async (stud) => {
    try {
      const student = await Student.create({
        ...stud,
        classId: targetClass._id,
        departmentId: targetClass.departmentId,
        semester: targetClass.semester,
        academicYear: targetClass.academicYear
      });
      return student._id;
    } catch (err) {
      throw new Error(`${stud.rollNo}: ${err.message}`);
    }
  });

  const settleResults = await Promise.allSettled(creationTasks);
  const createdIds = settleResults
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);
  const errors = settleResults
    .filter(r => r.status === 'rejected')
    .map(r => r.reason.message);

  if (createdIds.length > 0) {
    await Class.findByIdAndUpdate(classId, { $addToSet: { studentIds: { $each: createdIds } } });
    invalidateEntityCache('student', 'all');
  }

  // Update task final status
  const finalStatus = createdIds.length === students.length ? 'success' : (createdIds.length > 0 ? 'success' : 'error');
  await Task.findByIdAndUpdate(task._id, {
    status: finalStatus,
    message: `Completed: ${createdIds.length} succeeded, ${errors.length} failed.`,
    meta: { 
      requested: students.length, 
      success: createdIds.length, 
      failed: errors.length,
      errors: errors.slice(0, 10) // Store first 10 errors for feedback
    }
  });

  logger.audit('STUDENT_IMPORT_COMMIT', {
    actor: req.user.userId,
    resource_id: classId,
    meta: { 
      taskId: task._id,
      requested: students.length, 
      success: createdIds.length,
      failed: errors.length
    }
  });

  res.status(201).json({
    success: true,
    data: { 
      message: `Successfully imported ${createdIds.length} students`,
      taskId: task._id
    }
  });
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

  // Initialize persistent background task
  const task = await Task.create({
    type: 'import_faculty',
    label: `Importing ${faculty.length} faculty members`,
    status: 'processing',
    actor: req.user.userId,
    meta: { requested: faculty.length }
  });

  const creationTasks = faculty.map(async (fac) => {
    try {
      const tempPassword = crypto.randomBytes(4).toString('hex');
      const departmentId = fac.departmentId;

      if (!departmentId) throw new Error(`Department ID missing for ${fac.employeeId}`);
      checkDeptScope(req.user, departmentId);

      const member = await Faculty.create({
        employeeId: fac.employeeId,
        name: fac.name,
        email: fac.email,
        phone: fac.phone || '',
        departmentId,
        roleTags: fac.roleTags || ['faculty'],
        password: tempPassword
      });

      // Fire-and-forget email dispatch
      sendCredentialEmail(member.email, member.name, member.email, tempPassword, 'faculty')
        .catch(err => logger.error('Credential email failed in batch import', { email: member.email, error: err.message }));

      return member._id;
    } catch (err) {
      throw new Error(`${fac.employeeId}: ${err.message}`);
    }
  });

  const settleResults = await Promise.allSettled(creationTasks);
  const createdIds = settleResults
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);
  const errors = settleResults
    .filter(r => r.status === 'rejected')
    .map(r => r.reason.message);

  if (createdIds.length > 0) {
    invalidateEntityCache('faculty', 'all');
  }

  // Update task final status
  const finalStatus = createdIds.length === faculty.length ? 'success' : (createdIds.length > 0 ? 'success' : 'error');
  await Task.findByIdAndUpdate(task._id, {
    status: finalStatus,
    message: `Completed: ${createdIds.length} succeeded, ${errors.length} failed.`,
    meta: { 
      requested: faculty.length, 
      success: createdIds.length, 
      failed: errors.length,
      errors: errors.slice(0, 10)
    }
  });

  logger.audit('FACULTY_IMPORT_COMMIT', {
    actor: req.user.userId,
    meta: { 
      taskId: task._id,
      requested: faculty.length, 
      success: createdIds.length,
      failed: errors.length
    }
  });

  res.status(201).json({
    success: true,
    data: { 
      message: `Successfully imported ${createdIds.length} faculty members`,
      taskId: task._id
    }
  });
});

/**
 * @desc    Preview elective assignments
 * @route   POST /api/import/electives/preview
 * @access  Admin, HoD
 */
export const previewElectives = asyncHandler(async (req, res, next) => {
  if (!req.file) return next(new ErrorResponse('Please upload a file', 400));
  const rows = parseBuffer(req.file.buffer);
  const results = { valid: [], errors: [], summary: { total: rows.length, valid: 0, errors: 0 } };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rollNo = getRowValue(row, ['Roll No', 'rollNo']);
    const subjectCode = getRowValue(row, ['Subject Code', 'subjectCode']);
    const empId = getRowValue(row, ['Faculty Employee ID', 'employeeId']);

    if (!rollNo || !subjectCode || !empId) {
      results.errors.push({ row: i + 1, data: row, reason: 'Missing required columns (Roll No, Subject Code, Faculty Employee ID)' });
      results.summary.errors++;
      continue;
    }

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
      results.errors.push({ row: i+1, data: row, reason });
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
        studentDeptId: student.departmentId
      });
      results.summary.valid++;
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

  // Initialize persistent background task
  const task = await Task.create({
    type: 'import_electives',
    label: `Mapping ${electives.length} elective assignments`,
    status: 'processing',
    actor: req.user.userId,
    meta: { requested: electives.length }
  });

  const updateTasks = electives.map(async (item) => {
    try {
      if (item.studentDeptId) checkDeptScope(req.user, item.studentDeptId);

      const student = await Student.findById(item.studentId);
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
      
      await student.save();
      return student._id;
    } catch (err) {
      throw new Error(`${item.rollNo || item.studentId}: ${err.message}`);
    }
  });

  const settleResults = await Promise.allSettled(updateTasks);
  const updatedIds = settleResults
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);
  const errors = settleResults
    .filter(r => r.status === 'rejected')
    .map(r => r.reason.message);

  // Update task final status
  const finalStatus = updatedIds.length === electives.length ? 'success' : (updatedIds.length > 0 ? 'success' : 'error');
  await Task.findByIdAndUpdate(task._id, {
    status: finalStatus,
    message: `Completed: ${updatedIds.length} succeeded, ${errors.length} failed.`,
    meta: { 
      requested: electives.length, 
      success: updatedIds.length, 
      failed: errors.length,
      errors: errors.slice(0, 10)
    }
  });

  logger.audit('ELECTIVE_IMPORT_COMMIT', {
    actor: req.user.userId,
    meta: { 
      taskId: task._id,
      requested: electives.length, 
      success: updatedIds.length,
      failed: errors.length
    }
  });

  res.status(200).json({ 
    success: true, 
    data: { 
      message: `Successfully updated ${updatedIds.length} elective assignments`,
      taskId: task._id
    } 
  });
});

/**
 * @desc    Preview mentor assignments
 * @route   POST /api/import/mentors/preview
 */
export const previewMentors = asyncHandler(async (req, res, next) => {
  if (!req.file) return next(new ErrorResponse('Please upload a file', 400));
  const rows = parseBuffer(req.file.buffer);
  const results = { valid: [], errors: [], summary: { total: rows.length, valid: 0, errors: 0 } };

  const seenRolls = new Set();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rollNo = getRowValue(row, ['Roll No', 'rollNo']);
    const empId = getRowValue(row, ['Faculty Employee ID', 'employeeId']);
    
    if (!rollNo || !empId) {
      results.errors.push({ row: i+1, data: row, reason: 'Missing required columns (Roll No, Faculty Employee ID)' });
      results.summary.errors++;
      continue;
    }

    const upperRoll = rollNo.toUpperCase();
    if (seenRolls.has(upperRoll)) {
      results.errors.push({ row: i+1, data: row, reason: `Duplicate Roll No ${rollNo} in file` });
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
        if (student.departmentId?.toString() !== faculty.departmentId?.toString()) {
          reason = `Cross-department mapping rejected: Student ${rollNo} belongs to ${student.departmentId} but Faculty ${empId} is in ${faculty.departmentId}`;
        }
      } catch (e) {
        reason = `Access denied for Student ${rollNo}: ${e.message}`;
      }
    }

    if (reason) {
      results.errors.push({ row: i+1, data: row, reason });
      results.summary.errors++;
    } else {
      results.valid.push({ 
        studentId: student._id, 
        rollNo: student.rollNo, 
        studentName: student.name,
        mentorId: faculty._id, 
        employeeId: faculty.employeeId,
        facultyName: faculty.name,
        studentDeptId: student.departmentId
      });
      results.summary.valid++;
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

  // Initialize persistent background task
  const task = await Task.create({
    type: 'import_mentors',
    label: `Mapping ${mentors.length} students to mentors`,
    status: 'processing',
    actor: req.user.userId,
    meta: { requested: mentors.length }
  });

  const updateTasks = mentors.map(async (item) => {
    try {
      if (item.studentDeptId) checkDeptScope(req.user, item.studentDeptId);

      const student = await Student.findById(item.studentId);
      if (!student) throw new Error(`Student ${item.rollNo} not found`);

      checkDeptScope(req.user, student.departmentId);
      
      student.mentorId = item.mentorId;
      await student.save();
      return student._id;
    } catch (err) {
      throw new Error(`${item.rollNo || item.studentId}: ${err.message}`);
    }
  });

  const settleResults = await Promise.allSettled(updateTasks);
  const updatedIds = settleResults
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);
  const errors = settleResults
    .filter(r => r.status === 'rejected')
    .map(r => r.reason.message);

  // Update task final status
  const finalStatus = updatedIds.length === mentors.length ? 'success' : (updatedIds.length > 0 ? 'success' : 'error');
  await Task.findByIdAndUpdate(task._id, {
    status: finalStatus,
    message: `Completed: ${updatedIds.length} succeeded, ${errors.length} failed.`,
    meta: { 
      requested: mentors.length, 
      success: updatedIds.length, 
      failed: errors.length,
      errors: errors.slice(0, 10)
    }
  });

  logger.audit('MENTOR_IMPORT_COMMIT', {
    actor: req.user.userId,
    meta: { 
      taskId: task._id,
      requested: mentors.length, 
      success: updatedIds.length,
      failed: errors.length
    }
  });

  res.status(200).json({ 
    success: true, 
    data: { 
      message: `Successfully updated ${updatedIds.length} mentor assignments`,
      taskId: task._id
    } 
  });
});

export const getTemplate = asyncHandler(async (req, res, next) => {
  const { type } = req.params;
  let headers = [];
  switch (type) {
    case 'students': headers = ['Roll No', 'Name', 'Email']; break;
    case 'faculty': headers = ['Employee ID', 'Name', 'Email', 'Department', 'Phone']; break;
    case 'electives': headers = ['Roll No', 'Subject Code', 'Faculty Employee ID']; break;
    case 'mentors': headers = ['Roll No', 'Faculty Employee ID']; break;
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

