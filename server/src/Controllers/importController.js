import xlsx from 'xlsx';
import Student from '../models/Student.js';
import Faculty from '../models/Faculty.js';
import Subject from '../models/Subject.js';
import Class from '../models/Class.js';
import { sendCredentialEmail } from '../services/emailService.js';
import asyncHandler from '../middleware/asyncHandler.js';
import ErrorResponse from '../utils/errorResponse.js';
import logger from '../utils/logger.js';
import crypto from 'crypto';

/**
 * Helper: Parse Excel/CSV from Buffer
 */
const parseBuffer = (buffer) => {
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return xlsx.utils.sheet_to_json(sheet);
};

/**
 * @desc    Preview student import
 * @route   POST /api/import/students/preview
 * @access  Admin, HoD
 */
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

  // Pre-fetch class to verify existence and department (for HoD scoping)
  const targetClass = await Class.findById(classId);
  if (!targetClass) {
    return next(new ErrorResponse('Target class not found', 404));
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rollNo = row['Roll No'] || row['rollNo'];
    const name = row['Name'] || row['name'];
    const email = row['Email'] || row['email'];

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

    // Check for existing rollNo
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
      password: tempPassword // Model will hash this on save
    });

    // Send email (async, don't wait to finish entire loop)
    sendCredentialEmail(student.email, student.name, student.rollNo, tempPassword, 'student');

    createdStudents.push(student._id);
  }

  // Update class student count (atomic)
  await Class.findByIdAndUpdate(classId, { $addToSet: { studentIds: { $each: createdStudents } } });

  logger.info(`Imported ${createdStudents.length} students into class ${classId}`, {
    actor: req.user.userId,
    action: 'IMPORT_STUDENTS',
    resource_id: classId
  });

  res.status(201).json({
    success: true,
    data: { message: `Successfully imported ${createdStudents.length} students` }
  });
});

/**
 * @desc    Preview faculty import
 * @route   POST /api/import/faculty/preview
 * @access  Admin, HoD
 */
export const previewFaculty = asyncHandler(async (req, res, next) => {
  if (!req.file) return next(new ErrorResponse('Please upload a file', 400));

  const rows = parseBuffer(req.file.buffer);
  const results = { valid: [], errors: [], summary: { total: rows.length, valid: 0, errors: 0 } };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const employeeId = row['Employee ID'] || row['employeeId'];
    const name = row['Name'] || row['name'];
    const email = row['Email'] || row['email'];
    const deptName = row['Department'] || row['department'];

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

    results.valid.push({ employeeId, name, email, departmentName: deptName });
    results.summary.valid++;
  }

  res.status(200).json({ success: true, data: results });
});

/**
 * @desc    Commit faculty import
 * @route   POST /api/import/faculty/commit
 * @access  Admin, HoD
 */
export const commitFaculty = asyncHandler(async (req, res, next) => {
  const { faculty } = req.body;

  if (!faculty || !Array.isArray(faculty) || faculty.length === 0) {
    return next(new ErrorResponse('No valid faculty data provided', 400));
  }

  const createdCount = 0;
  const Department = (await import('../models/Department.js')).default;

  for (const fac of faculty) {
    // Resolve department
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
    createdCount++;
  }

  logger.info(`Imported ${createdCount} faculty members`, {
    actor: req.user.userId,
    action: 'IMPORT_FACULTY'
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
    const rollNo = row['Roll No'] || row['rollNo'];
    const subjectCode = row['Subject Code'] || row['subjectCode'];
    const empId = row['Faculty Employee ID'] || row['employeeId'];

    if (!rollNo || !subjectCode || !empId) {
      results.errors.push({ row: i + 1, data: row, reason: 'Missing required columns' });
      results.summary.errors++;
      continue;
    }

    // Validation: Check if student, subject and faculty exist
    const student = await Student.findOne({ rollNo });
    const subject = await Subject.findOne({ code: subjectCode });
    const faculty = await Faculty.findOne({ employeeId: empId });

    if (!student) {
      results.errors.push({ row: i + 1, data: row, reason: `Student ${rollNo} not found` });
    } else if (!subject) {
      results.errors.push({ row: i + 1, data: row, reason: `Subject ${subjectCode} not found` });
    } else if (!faculty) {
      results.errors.push({ row: i + 1, data: row, reason: `Faculty ${empId} not found` });
    } else {
      results.valid.push({ studentId: student._id, rollNo, subjectId: subject._id, subjectCode, facultyId: faculty._id, employeeId: empId });
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
  let updated = 0;

  for (const item of electives) {
    const student = await Student.findById(item.studentId);
    if (!student) continue;

    // Check if subscription already exists
    const exists = student.electiveSubjects.some(e => e.subjectId.toString() === item.subjectId);
    if (exists) {
      // Update faculty for existing assignment
      await Student.updateOne(
        { _id: item.studentId, 'electiveSubjects.subjectId': item.subjectId },
        { $set: { 'electiveSubjects.$.facultyId': item.facultyId } }
      );
    } else {
      // Add new elective
      student.electiveSubjects.push({
        subjectId: item.subjectId,
        facultyId: item.facultyId
      });
      await student.save();
    }
    updated++;
  }

  res.status(200).json({ success: true, data: { message: `Updated ${updated} elective assignments` } });
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
    const rollNo = row['Roll No'] || row['rollNo'];
    const empId = row['Faculty Employee ID'] || row['employeeId'];

    const student = await Student.findOne({ rollNo });
    const faculty = await Faculty.findOne({ employeeId: empId });

    if (!student || !faculty) {
      results.errors.push({ row: i + 1, data: row, reason: `Invalid rollNo or employeeId` });
      results.summary.errors++;
    } else {
      results.valid.push({ studentId: student._id, rollNo, mentorId: faculty._id, employeeId: empId });
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
  let updated = 0;
  for (const item of mentors) {
    await Student.findByIdAndUpdate(item.studentId, { mentorId: item.mentorId });
    updated++;
  }
  res.status(200).json({ success: true, data: { message: `Updated ${updated} mentor assignments` } });
});

/**
 * @desc    Download template
 */
export const getTemplate = asyncHandler(async (req, res, next) => {
  const { type } = req.params;
  let headers = [];

  switch (type) {
    case 'students':
      headers = ['Roll No', 'Name', 'Email'];
      break;
    case 'faculty':
      headers = ['Employee ID', 'Name', 'Email', 'Department', 'Phone'];
      break;
    case 'electives':
      headers = ['Roll No', 'Subject Code', 'Faculty Employee ID'];
      break;
    case 'mentors':
      headers = ['Roll No', 'Faculty Employee ID'];
      break;
    default:
      return next(new ErrorResponse('Invalid template type', 400));
  }

  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.json_to_sheet([headers.reduce((acc, h) => ({ ...acc, [h]: '' }), {})], { header: headers });
  xlsx.utils.book_append_sheet(wb, ws, 'Template');
  const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=NDS_Template_${type}.xlsx`);
  res.send(buffer);
});
