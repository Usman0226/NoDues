import xlsx from 'xlsx';
import Student from '../models/Student.js';
import Faculty from '../models/Faculty.js';
import Subject from '../models/Subject.js';
import Class from '../models/Class.js';
import { sendCredentialEmail } from '../services/emailService.js';
import asyncHandler from '../utils/asyncHandler.js';
import ErrorResponse from '../utils/errorResponse.js';
import logger from '../utils/logger.js';
import crypto from 'crypto';
import { invalidateClassCache } from './classController.js';
import { invalidateStudentCache } from './studentController.js';
import { invalidateFacultyCache } from './facultyController.js';
import { invalidateDeptCache } from './departmentController.js';

/**
 * Helper: Parse Excel/CSV from Buffer
 */
const parseBuffer = (buffer) => {
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return xlsx.utils.sheet_to_json(sheet);
};

export const previewStudents = asyncHandler(async (req, res, next) => {
  if (!req.file) {
    return next(new ErrorResponse('Please upload a file', 400));
  }

  const { classId } = req.query;
  if (!classId) {
    return next(new ErrorResponse('classId query param is required', 400));
  }

  const rows = parseBuffer(req.file.buffer);
  const results = {
    valid: [],
    errors: [],
    summary: { total: rows.length, valid: 0, errors: 0 }
  };

  const targetClass = await Class.findById(classId);
  if (!targetClass) {
    return next(new ErrorResponse('Target class not found', 404));
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rollNo = (row['Roll No'] || row['rollNo'])?.toString().trim();
    const name = (row['Name'] || row['name'])?.toString().trim();
    const email = (row['Email'] || row['email'])?.toString().trim();

    const errors = [];
    if (!rollNo) errors.push('Roll number is required');
    if (!name) errors.push('Name is required');
    if (!email) errors.push('Email is required');
    else if (!/^\S+@\S+\.\S+$/.test(email)) errors.push('Invalid email format');

    if (errors.length > 0) {
      results.errors.push({ row: i + 1, data: row, reason: errors.join(', ') });
      results.summary.errors++;
      continue;
    }

    const existing = await Student.findOne({ rollNo });
    if (existing) {
      results.errors.push({ row: i + 1, data: row, reason: `Roll number ${rollNo} already exists` });
      results.summary.errors++;
      continue;
    }

    results.valid.push({ rollNo, name, email });
    results.summary.valid++;
  }

  res.status(200).json({ success: true, data: results });
});

/**
 * @desc    Commit student import
 * @route   POST /api/import/students/commit
 * @access  Admin, HoD
 */
export const commitStudents = asyncHandler(async (req, res, next) => {
  const { students, classId } = req.body;

  if (!students || !Array.isArray(students) || students.length === 0) {
    return next(new ErrorResponse('No valid student data provided', 400));
  }

  const targetClass = await Class.findById(classId);
  if (!targetClass) {
    return next(new ErrorResponse('Target class not found', 404));
  }

  const createdStudents = [];
  
  for (const stud of students) {
    const tempPassword = crypto.randomBytes(4).toString('hex');
    
    const student = await Student.create({
      ...stud,
      classId: targetClass._id,
      departmentId: targetClass.departmentId,
      semester: targetClass.semester,
      academicYear: targetClass.academicYear,
      password: tempPassword 
    });

    sendCredentialEmail(student.email, student.name, student.rollNo, tempPassword, 'student');
    createdStudents.push(student._id);
  }

  await Class.findByIdAndUpdate(classId, { $addToSet: { studentIds: { $each: createdStudents } } });

  invalidateClassCache(classId, targetClass.departmentId);

  logger.info('Student batch import completed', {
    timestamp: new Date().toISOString(),
    actor: req.user.userId,
    action: 'IMPORT_STUDENTS',
    resource_id: classId,
    meta: { count: createdStudents.length }
  });

  res.status(201).json({
    success: true,
    data: { message: `Successfully imported ${createdStudents.length} students` }
  });
});

export const previewFaculty = asyncHandler(async (req, res, next) => {
  if (!req.file) return next(new ErrorResponse('Please upload a file', 400));

  const rows = parseBuffer(req.file.buffer);
  const results = { valid: [], errors: [], summary: { total: rows.length, valid: 0, errors: 0 } };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const employeeId = (row['Employee ID'] || row['employeeId'])?.toString().trim();
    const name = (row['Name'] || row['name'])?.toString().trim();
    const email = (row['Email'] || row['email'])?.toString().trim();
    const deptName = (row['Department'] || row['department'])?.toString().trim();

    const errors = [];
    if (!employeeId) errors.push('Employee ID is required');
    if (!name) errors.push('Name is required');
    if (!email) errors.push('Email is required');
    if (!deptName) errors.push('Department name is required');

    if (errors.length > 0) {
      results.errors.push({ row: i + 1, data: row, reason: errors.join(', ') });
      results.summary.errors++;
      continue;
    }

    const existingId = await Faculty.findOne({ employeeId: employeeId.toUpperCase() });
    const existingEmail = await Faculty.findOne({ email: email.toLowerCase() });

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

    results.valid.push({ employeeId: employeeId.toUpperCase(), name, email: email.toLowerCase(), departmentName: deptName });
    results.summary.valid++;
  }

  res.status(200).json({ success: true, data: results });
});

export const commitFaculty = asyncHandler(async (req, res, next) => {
  const { faculty } = req.body;

  if (!faculty || !Array.isArray(faculty) || faculty.length === 0) {
    return next(new ErrorResponse('No valid faculty data provided', 400));
  }

  let createdCount = 0;
  const createdFaculty = [];
  const Department = (await import('../models/Department.js')).default;

  for (const fac of faculty) {
    let departmentId = fac.departmentId;
    if (!departmentId && fac.departmentName) {
      const dept = await Department.findOne({ name: fac.departmentName });
      if (dept) departmentId = dept._id;
    }

    if (!departmentId) continue;

    const tempPassword = crypto.randomBytes(4).toString('hex');
    
    const facultyMember = await Faculty.create({
      employeeId: fac.employeeId,
      name: fac.name,
      email: fac.email,
      phone: fac.phone || '',
      departmentId,
      roleTags: fac.roleTags || ['faculty'],
      password: tempPassword
    });

    sendCredentialEmail(facultyMember.email, facultyMember.name, facultyMember.email, tempPassword, 'faculty');
    createdFaculty.push(facultyMember);
    createdCount++;
  }

  invalidateFacultyCache();
  if (createdFaculty.length > 0) {
    const depts = [...new Set(createdFaculty.map(f => f.departmentId.toString()))];
    depts.forEach(d => invalidateDeptCache(d));
  }

  logger.info('Faculty batch import completed', {
    timestamp: new Date().toISOString(),
    actor: req.user.userId,
    action: 'IMPORT_FACULTY',
    meta: { count: createdCount }
  });

  res.status(201).json({
    success: true,
    data: { message: `Successfully imported ${createdCount} faculty members` }
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
    const rollNo = (row['Roll No'] || row['rollNo'])?.toString().trim();
    const subjectCode = (row['Subject Code'] || row['subjectCode'])?.toString().trim();
    const empId = (row['Faculty Employee ID'] || row['employeeId'])?.toString().trim();

    if (!rollNo || !subjectCode || !empId) {
      results.errors.push({ row: i + 1, data: row, reason: 'Missing required columns (Roll No, Subject Code, Faculty Employee ID)' });
      results.summary.errors++;
      continue;
    }

    const student = await Student.findOne({ rollNo: rollNo.toUpperCase() });
    const subject = await Subject.findOne({ code: subjectCode.toUpperCase() });
    const faculty = await Faculty.findOne({ employeeId: empId.toUpperCase() });

    if (!student) {
      results.errors.push({ row: i+1, data: row, reason: `Student ${rollNo} not found` });
    } else if (!subject) {
      results.errors.push({ row: i+1, data: row, reason: `Subject ${subjectCode} not found` });
    } else if (!faculty) {
      results.errors.push({ row: i+1, data: row, reason: `Faculty ${empId} not found` });
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
        facultyName: faculty.name
      });
      results.summary.valid++;
      continue;
    }
    results.summary.errors++;
  }
  res.status(200).json({ success: true, data: results });
});

/**
 * @desc    Commit elective assignments
 */
export const commitElectives = asyncHandler(async (req, res, next) => {
  const { electives } = req.body;
  if (!electives || !Array.isArray(electives)) return next(new ErrorResponse('Invalid data', 400));

  let updated = 0;
  for (const item of electives) {
    const student = await Student.findById(item.studentId);
    if (student) {
      // Remove existing assignment for this subject if any to prevent duplicates
      student.electiveSubjects = student.electiveSubjects.filter(e => e.subjectId.toString() !== item.subjectId.toString());
      
      student.electiveSubjects.push({
        subjectId: item.subjectId,
        subjectName: item.subjectName,
        subjectCode: item.subjectCode,
        facultyId: item.facultyId,
        facultyName: item.facultyName
      });
      
      await student.save();
      invalidateStudentCache(student._id);
      if (student.classId) invalidateClassCache(student.classId, student.departmentId);
      updated++;
    }
  }

  logger.info('Elective mapping import completed', {
    timestamp: new Date().toISOString(),
    actor: req.user.userId,
    action: 'IMPORT_ELECTIVES',
    meta: { count: updated }
  });

  res.status(200).json({ success: true, data: { message: `Successfully updated ${updated} elective assignments` } });
});

/**
 * @desc    Preview mentor assignments
 * @route   POST /api/import/mentors/preview
 */
export const previewMentors = asyncHandler(async (req, res, next) => {
  if (!req.file) return next(new ErrorResponse('Please upload a file', 400));
  const rows = parseBuffer(req.file.buffer);
  const results = { valid: [], errors: [], summary: { total: rows.length, valid: 0, errors: 0 } };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rollNo = (row['Roll No'] || row['rollNo'])?.toString().trim();
    const empId = (row['Faculty Employee ID'] || row['employeeId'])?.toString().trim();
    
    if (!rollNo || !empId) {
      results.errors.push({ row: i+1, data: row, reason: 'Missing required columns (Roll No, Faculty Employee ID)' });
      results.summary.errors++;
      continue;
    }

    const student = await Student.findOne({ rollNo: rollNo.toUpperCase() });
    const faculty = await Faculty.findOne({ employeeId: empId.toUpperCase() });

    if (!student || !faculty) {
      results.errors.push({ row: i+1, data: row, reason: !student ? `Student ${rollNo} not found` : `Faculty ${empId} not found` });
      results.summary.errors++;
    } else {
      results.valid.push({ 
        studentId: student._id, 
        rollNo: student.rollNo, 
        studentName: student.name,
        mentorId: faculty._id, 
        employeeId: faculty.employeeId,
        facultyName: faculty.name
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
  if (!mentors || !Array.isArray(mentors)) return next(new ErrorResponse('Invalid data', 400));

  let updated = 0;
  for (const item of mentors) {
    const student = await Student.findById(item.studentId);
    if (student) {
      student.mentorId = item.mentorId;
      await student.save();
      invalidateStudentCache(student._id);
      if (student.classId) invalidateClassCache(student.classId, student.departmentId);
      updated++;
    }
  }

  logger.info('Mentor mapping import completed', {
    timestamp: new Date().toISOString(),
    actor: req.user.userId,
    action: 'IMPORT_MENTORS',
    meta: { count: updated }
  });

  res.status(200).json({ success: true, data: { message: `Successfully updated ${updated} mentor assignments` } });
});

/**
 * @desc    Get template
 * @route   GET /api/import/template/:type
 */
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

