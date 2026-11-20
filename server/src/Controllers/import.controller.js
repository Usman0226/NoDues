import mongoose from 'mongoose';
import xlsx from 'xlsx';
import Student from '../models/Student.js';
import Faculty from '../models/Faculty.js';
import Subject from '../models/Subject.js';
import Class from '../models/Class.js';
import Department from '../models/Department.js';
import { sendCredentialEmail } from '../services/emailService.js';
import asyncHandler from '../utils/asyncHandler.js';
import {
  parseBuffer,
  parseWorkbookSheets,
  scoreClassMatch,
  classifySheet,
  extractSheetCohortMetadata,
  getRowValue,
  cleanPersonName,
  isPlaceholderEmail,
  extractValidEmail,
  parseSemester,
  parseElective,
  normalizeHeader,
  generateDepartmentAcronym,
  KNOWN_DEPT_ALIASES,
  EXCEL_FORMULA_ERRORS,
} from '../utils/importUtils.js';
import { normalizeFacultyName } from '../services/timetableParser.js';
import { expandRollNoRange, isRange, unpackRollList } from '../utils/rollNoUtils.js';
import ErrorResponse from '../utils/errorResponse.js';
import logger from '../utils/logger.js';
import crypto from 'crypto';
import { invalidateEntityCache } from '../utils/cacheHooks.js';
import Task from '../models/Task.js';
import { startSafeTransaction, commitSafeTransaction, abortSafeTransaction } from '../utils/safeTransaction.js';
import {bulkSyncMentorUpdate} from "../utils/batchSync.js"

const validateEmail = (email) => /^\S+@\S+\.\S+$/.test(email);

const ROLL_KEYS = [
  'Roll No',
  'Roll Number',
  'rollNo',
  'roll_no',
  'RollNo',
  'Roll.No',
  'R.No',
  'R No',
  'HT No',
  'HT.No',
  'HTNo',
  'Hall Ticket',
  'Hall Ticket No',
  'Hall Ticket Number',
  'Reg No',
  'Reg. No',
  'Registration No',
  'Register No',
  'Registered No',
  'USN',
  'Student ID',
  'StudentID',
  'Student Id',
  'Adm No',
  'Adm. No',
  'Admission No',
  'Admission Number',
  'Candidate ID',
  'Candidate Roll No',
  'Student Roll No',
  'University Seat Number',
  'Pin No',
  'PIN',
  'Roll',
];
const NAME_KEYS = [
  'Name',
  'Student Name',
  'Candidate Name',
  'Name of the Candidate',
  'Name of the Student',
  'Name of Candidate',
  'Name of Student',
  'Full Name',
  "Student's Name",
  "Candidate's Name",
  'Name of the Pupil',
  'Student Full Name',
  'Candidate Full Name',
  'Learner Name',
  'Student',
  'Candidate',
  'name',
];
const EMAIL_KEYS = [
  'Email',
  'Email ID',
  'Email Address',
  'Institutional Email',
  'E-mail',
  'Mail ID',
  'E-Mail ID',
  'Student Email',
  'College Email',
  'Official Email',
  'emailId',
  'email_id',
  'email',
];
const SUBJECT_CODE_KEYS = [
  'Subject Code',
  'Course Code',
  'Sub Code',
  'Paper Code',
  'Subject ID',
  'Course ID',
  'Sub. Code',
  'subjectCode',
  'code',
];
const FACULTY_IDENTIFIER_KEYS = [
  'Faculty Employee ID',
  'Employee ID',
  'Faculty ID',
  'Mentor ID',
  'Emp ID',
  'Staff ID',
  'Faculty Code',
  'Teacher ID',
  'Faculty Email',
  'Mentor Email',
  'employeeId',
  'facultyEmail',
  'email',
];

const buildFacultyLookup = (facultyList) => {
  const map = new Map();
  for (const fac of facultyList) {
    if (fac.employeeId) map.set(fac.employeeId.toUpperCase(), fac);
    if (fac.email) map.set(fac.email.toLowerCase(), fac);
    if (fac.name) {
      map.set(fac.name.toUpperCase(), fac);
      map.set(cleanPersonName(fac.name).toUpperCase(), fac);
      map.set(normalizeFacultyName(fac.name), fac);
    }
  }
  return map;
};

const lookupFaculty = (facultyMap, identifier) => {
  if (!identifier) return null;
  const trimmed = identifier.toString().trim();
  return (
    facultyMap.get(trimmed.toUpperCase()) ||
    facultyMap.get(trimmed.toLowerCase()) ||
    facultyMap.get(cleanPersonName(trimmed).toUpperCase()) ||
    facultyMap.get(normalizeFacultyName(trimmed)) ||
    null
  );
};

const checkDeptScope = (user, deptId) => {
  if (['hod', 'ao'].includes(user.role) && deptId.toString() !== user.departmentId) {
    throw new ErrorResponse('Access denied: Department outside your scope', 403, 'AUTH_DEPARTMENT_SCOPE');
  }
};

export const previewStudents = asyncHandler(async (req, res, next) => {
  if (!req.file) return next(new ErrorResponse('Please upload a file', 400));

  let { classId, sheet } = req.query;

  // Retrieve user-scoped active classes (Curriculum Master blueprints excluded)
  const userDeptId = ['hod', 'ao'].includes(req.user?.role) ? req.user.departmentId : null;
  const classQuery = { isActive: true, isMaster: { $ne: true } };
  if (userDeptId) classQuery.departmentId = userDeptId;
  const allClasses = await Class.find(classQuery).select('_id name semester academicYear departmentId isMaster').lean();

  let explicitClass = null;
  if (classId) {
    explicitClass = await Class.findById(classId);
    if (!explicitClass) return next(new ErrorResponse('Target class not found', 404));
    checkDeptScope(req.user, explicitClass.departmentId);
  }

  // Parse all worksheets in the uploaded workbook
  const parsedSheets = parseWorkbookSheets(req.file.buffer, {
    filename: req.file.originalname,
    type: 'students',
  });

  if (!parsedSheets.length) {
    return next(new ErrorResponse('Unable to read workbook sheets. Please check the file.', 400, 'VAL_001'));
  }

  // Pre-fetch all roll numbers across all sheets for duplicate checking and roster reconciliation
  const allRolls = [];
  for (const s of parsedSheets) {
    for (const row of s.rows || []) {
      const roll = getRowValue(row, ROLL_KEYS)?.toString().replace(/\s+/g, '').toUpperCase();
      if (roll) allRolls.push(roll);
    }
  }

  const existingStudents = await Student.find({ rollNo: { $in: allRolls } })
    .select('_id rollNo name email classId')
    .lean();
  const existingStudentMap = new Map(existingStudents.map((s) => [(s.rollNo || '').toUpperCase(), s]));

  // Process and validate each sheet
  const globalSeenRolls = new Map();
  const sheetResults = [];

  for (const s of parsedSheets) {
    let sheetTargetClass = null;

    // Only active student cohort roster sheets are candidate for class binding
    if (s.sheetType === 'roster') {
      if (explicitClass) {
        const explicitScore = scoreClassMatch(explicitClass, s.meta, s.sheetName);
        if (explicitScore >= 50) {
          sheetTargetClass = explicitClass;
        }
      }

      if (!sheetTargetClass && allClasses.length > 0) {
        const scored = allClasses
          .map((c) => ({ c, score: scoreClassMatch(c, s.meta, s.sheetName) }))
          .sort((a, b) => b.score - a.score);

        if (scored.length > 0 && scored[0].score >= 50) {
          sheetTargetClass = scored[0].c;
        } else if (explicitClass) {
          // Fallback to explicitClass if no better match exists
          sheetTargetClass = explicitClass;
        } else if (allClasses.length === 1) {
          sheetTargetClass = allClasses[0];
        }
      }
    }

    const valid = [];
    const errors = [];
    const localSeenRolls = new Set();

    for (let i = 0; i < (s.rows || []).length; i++) {
      const row = s.rows[i];
      let rollNo = getRowValue(row, ROLL_KEYS);
      let name = getRowValue(row, NAME_KEYS);
      let email = getRowValue(row, EMAIL_KEYS);

      if (rollNo) rollNo = rollNo.replace(/\s+/g, '').toUpperCase();
      if (name) name = cleanPersonName(name);
      if (email) {
        if (isPlaceholderEmail(email)) {
          email = null;
        } else {
          email = extractValidEmail(email) || email.trim();
        }
      }

      const rowErrors = [];
      if (!rollNo || EXCEL_FORMULA_ERRORS?.has(rollNo)) {
        rowErrors.push('Valid roll number required (column: Roll No)');
      }
      if (!name || EXCEL_FORMULA_ERRORS?.has(name.toUpperCase())) {
        rowErrors.push('Valid student name required (column: Name)');
      }
      if (email && !validateEmail(email)) {
        rowErrors.push(`Invalid email format "${email}"`);
      }

      if (rowErrors.length > 0) {
        errors.push({ row: i + 1, data: row, reason: rowErrors.join(', ') });
        continue;
      }

      if (localSeenRolls.has(rollNo)) {
        errors.push({ row: i + 1, data: row, reason: `Duplicate roll number ${rollNo} within sheet "${s.sheetName}"` });
        continue;
      }
      localSeenRolls.add(rollNo);

      if (globalSeenRolls.has(rollNo) && globalSeenRolls.get(rollNo) !== s.sheetName) {
        errors.push({
          row: i + 1,
          data: row,
          reason: `Duplicate roll number ${rollNo} already found in sheet "${globalSeenRolls.get(rollNo)}"`,
        });
        continue;
      }
      globalSeenRolls.set(rollNo, s.sheetName);

      const existing = existingStudentMap.get(rollNo);
      const isExisting = !!existing;
      const isUpdate = isExisting && (
        existing.name !== name ||
        (email && existing.email !== email.toLowerCase()) ||
        (sheetTargetClass && existing.classId?.toString() !== sheetTargetClass._id?.toString())
      );

      valid.push({
        rollNo,
        name,
        ...(email ? { email: email.toLowerCase() } : {}),
        isExisting,
        isUpdate,
      });
    }

    sheetResults.push({
      sheetName: s.sheetName,
      originalSheetName: s.originalSheetName,
      sheetType: s.sheetType,
      meta: s.meta,
      targetClass: sheetTargetClass
        ? {
            _id: sheetTargetClass._id,
            name: sheetTargetClass.name,
            semester: sheetTargetClass.semester,
            academicYear: sheetTargetClass.academicYear,
          }
        : null,
      summary: { total: (s.rows || []).length, valid: valid.length, errors: errors.length },
      valid,
      errors,
      reason:
        s.sheetType === 'summary'
          ? 'Summary statistics table (no student roll numbers)'
          : s.sheetType === 'auxiliary'
          ? 'Administrative/mixed list (e.g. detained or dropouts)'
          : s.sheetType === 'empty'
          ? 'Empty sheet (no data rows)'
          : null,
    });
  }

  const rosterSheets = sheetResults.filter((s) => s.sheetType === 'roster' && s.summary.total > 0);

  if (rosterSheets.length === 0 && sheetResults.every((s) => s.summary.total === 0)) {
    return next(
      new ErrorResponse(
        'Uploaded spreadsheet has no data rows. Download the template to check expected columns (Roll No, Name, Email).',
        400,
        'VAL_001'
      )
    );
  }

  let activeSheetObj = null;
  if (sheet) {
    activeSheetObj = sheetResults.find((s) => s.sheetName.toLowerCase() === sheet.toLowerCase().trim());
  }
  if (!activeSheetObj) {
    activeSheetObj = rosterSheets[0] || sheetResults[0];
  }

  if (rosterSheets.length <= 1 && !activeSheetObj.targetClass && !explicitClass && allClasses.length > 1) {
    return next(
      new ErrorResponse(
        'Please select a target class/section to import students into.',
        400,
        'VAL_001'
      )
    );
  }

  const totalRosterRecords = rosterSheets.reduce((sum, s) => sum + s.summary.valid, 0);
  const totalRosterErrors = rosterSheets.reduce((sum, s) => sum + s.summary.errors, 0);
  const matchedRosterClassesCount = rosterSheets.filter((s) => s.targetClass?._id).length;

  res.status(200).json({
    success: true,
    data: {
      isMultiSheet: rosterSheets.length > 1,
      totalRosterRecords,
      totalRosterErrors,
      totalRosterClasses: matchedRosterClassesCount,
      rosterSheetsCount: rosterSheets.length,
      activeSheet: activeSheetObj.sheetName,
      sheets: sheetResults,
      sheetName: activeSheetObj.sheetName,
      availableSheets: sheetResults.map((s) => s.sheetName),
      targetClass: activeSheetObj.targetClass,
      valid: activeSheetObj.valid,
      errors: activeSheetObj.errors,
      summary: activeSheetObj.summary,
    },
  });
});

export const commitStudents = asyncHandler(async (req, res, next) => {
  const { students, classId, batch } = req.body;

  // 1. One-shot multi-class batch commit
  if (Array.isArray(batch) && batch.length > 0) {
    for (const item of batch) {
      if (!item.classId) {
        return next(new ErrorResponse(`Missing target class for sheet "${item.sheetName || 'section'}"`, 400, 'VAL_001'));
      }
      if (!Array.isArray(item.students) || item.students.length === 0) {
        return next(new ErrorResponse(`No valid student data provided for sheet "${item.sheetName || 'section'}"`, 400));
      }
    }

    const session = await mongoose.startSession();
    try {
      await startSafeTransaction(session);

      const targetClasses = [];
      for (const item of batch) {
        const cls = await Class.findById(item.classId).session(session);
        if (!cls) {
          await abortSafeTransaction(session);
          return next(new ErrorResponse(`Target class not found for sheet "${item.sheetName || item.classId}"`, 404));
        }
        if (cls.isMaster) {
          await abortSafeTransaction(session);
          return next(new ErrorResponse(`Cannot import students into Curriculum Master blueprint "${cls.name}". Please select an active student section.`, 400, 'VAL_002'));
        }
        checkDeptScope(req.user, cls.departmentId);
        targetClasses.push({ cls, item });
      }

      const totalStudentsCount = batch.reduce((sum, b) => sum + b.students.length, 0);
      const classNames = targetClasses.map((tc) => tc.cls.name).join(', ');

      const task = await Task.create(
        [
          {
            type: 'import_students',
            label: `Importing ${totalStudentsCount} students across ${batch.length} classes (${classNames})`,
            status: 'processing',
            actor: req.user.userId,
            meta: { requested: totalStudentsCount, classesCount: batch.length },
          },
        ],
        { session }
      );

      const taskId = task[0]._id;
      const allProcessedIds = [];
      const oldClassesToPrune = new Map();

      // Collect all roll numbers across the batch to query existing in 1 round trip
      const allRolls = [];
      for (const { item } of targetClasses) {
        for (const s of item.students) {
          if (s.rollNo) allRolls.push(s.rollNo);
        }
      }

      const existingStudents = await Student.find({ rollNo: { $in: allRolls } })
        .select('_id rollNo name email classId departmentId semester academicYear')
        .session(session);
      const existingMap = new Map(existingStudents.map((e) => [(e.rollNo || '').toUpperCase(), e]));
      const seenInBatch = new Set();

      for (const { cls, item } of targetClasses) {
        const toInsert = [];
        const classTargetIds = [];

        for (const stud of item.students) {
          const normRoll = (stud.rollNo || '').toUpperCase();
          if (!normRoll || seenInBatch.has(normRoll)) {
            logger.warn(`Duplicate student ${stud.rollNo} skipped during batch commit`, {
              rollNo: stud.rollNo,
              classId: cls._id,
            });
            continue;
          }
          seenInBatch.add(normRoll);

          if (existingMap.has(normRoll)) {
            // Reconcile and update existing student record (Nominal roll update)
            const existing = existingMap.get(normRoll);
            let modified = false;
            const oldCid = existing.classId ? existing.classId.toString() : null;
            const newCid = cls._id.toString();

            if (stud.name && stud.name !== existing.name) {
              existing.name = stud.name;
              modified = true;
            }
            if (stud.email && stud.email !== existing.email) {
              existing.email = stud.email;
              modified = true;
            }
            if (oldCid !== newCid) {
              existing.classId = cls._id;
              existing.departmentId = cls.departmentId;
              existing.semester = cls.semester;
              existing.academicYear = cls.academicYear;
              modified = true;

              if (oldCid) {
                if (!oldClassesToPrune.has(oldCid)) oldClassesToPrune.set(oldCid, []);
                oldClassesToPrune.get(oldCid).push(existing._id);
              }
            }

            if (modified) {
              await existing.save({ session });
            }
            classTargetIds.push(existing._id);
            allProcessedIds.push(existing._id);
          } else {
            toInsert.push({
              rollNo: stud.rollNo,
              name: stud.name,
              email: stud.email || `${stud.rollNo.toLowerCase()}@mits.ac.in`,
              departmentId: cls.departmentId,
              classId: cls._id,
              semester: cls.semester,
              academicYear: cls.academicYear,
              isActive: true,
              isProfileComplete: false,
            });
          }
        }

        if (toInsert.length > 0) {
          try {
            const insertedDocs = await Student.insertMany(toInsert, { session, ordered: false });
            const insertedIds = insertedDocs.map((doc) => doc._id);
            classTargetIds.push(...insertedIds);
            allProcessedIds.push(...insertedIds);
          } catch (insertErr) {
            if (insertErr.code === 11000 || insertErr.writeErrors?.length > 0) {
              const insertedIds = (insertErr.insertedDocs || []).map((d) => d._id);
              if (insertedIds.length > 0) {
                classTargetIds.push(...insertedIds);
                allProcessedIds.push(...insertedIds);
              }
            } else {
              throw insertErr;
            }
          }
        }

        if (classTargetIds.length > 0) {
          await Class.findByIdAndUpdate(
            cls._id,
            { $addToSet: { studentIds: { $each: classTargetIds } } },
            { session }
          );
        }
      }

      // Prune students from previous classes if they were transferred to a new section
      for (const [oldCid, studentIds] of oldClassesToPrune.entries()) {
        await Class.findByIdAndUpdate(
          oldCid,
          { $pull: { studentIds: { $in: studentIds } } },
          { session }
        );
        invalidateEntityCache('class', oldCid);
      }

      await Task.findByIdAndUpdate(
        taskId,
        {
          status: 'success',
          message: `Completed: ${allProcessedIds.length} succeeded across ${batch.length} classes (${classNames}).`,
          meta: {
            requested: totalStudentsCount,
            success: allProcessedIds.length,
            classesCount: batch.length,
          },
        },
        { session }
      );

      await commitSafeTransaction(session);

      invalidateEntityCache('student', 'all');
      for (const { cls } of targetClasses) {
        invalidateEntityCache('class', cls._id.toString());
      }

      logger.audit('STUDENT_IMPORT_BATCH_COMMIT', {
        actor: req.user.userId,
        meta: {
          taskId,
          classesCount: batch.length,
          requested: totalStudentsCount,
          success: allProcessedIds.length,
          classNames,
        },
      });

      return res.status(201).json({
        success: true,
        data: {
          message: `Successfully processed ${allProcessedIds.length} students across ${batch.length} classes (${classNames}) in one shot.`,
          taskId,
          classesCount: batch.length,
          count: allProcessedIds.length,
        },
      });
    } catch (err) {
      if (session.inTransaction()) await abortSafeTransaction(session);
      logger.error({
        action: 'import_students_batch_commit',
        actor: req.user.userId,
        error_code: 'DB_001',
        message: err.message,
      });
      return next(new ErrorResponse(err.message || 'Batch student import failed', 500, 'DB_001'));
    } finally {
      session.endSession();
    }
  }

  // 2. Single-class commit
  const { students: singleStudents, classId: singleClassId } = req.body;
  if (!singleStudents?.length) return next(new ErrorResponse('No valid student data provided', 400));
  if (!singleClassId) return next(new ErrorResponse('Please select a target class/section before committing students.', 400, 'VAL_001'));

  const session = await mongoose.startSession();
  let task;
  try {
    await startSafeTransaction(session);

    const targetClass = await Class.findById(singleClassId).session(session);
    if (!targetClass) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Target class not found', 404));
    }
    if (targetClass.isMaster) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Cannot import students into Curriculum Master blueprint.', 400, 'VAL_002'));
    }
    checkDeptScope(req.user, targetClass.departmentId);

    // Initialize persistent background task
    task = await Task.create([{
      type: 'import_students',
      label: `Importing ${singleStudents.length} students to ${targetClass.name}`,
      status: 'processing',
      actor: req.user.userId,
      meta: { requested: singleStudents.length }
    }], { session });

    const taskId = task[0]._id;

    const allRolls = singleStudents.map((s) => s.rollNo).filter(Boolean);
    const existingStudents = await Student.find({ rollNo: { $in: allRolls } })
      .select('_id rollNo name email classId departmentId semester academicYear')
      .session(session);
    const existingMap = new Map(existingStudents.map((e) => [(e.rollNo || '').toUpperCase(), e]));
    const seenInBatch = new Set();
    const oldClassesToPrune = new Map();
    const classTargetIds = [];
    const allProcessedIds = [];

    const toInsert = [];
    for (const stud of singleStudents) {
      const normRoll = (stud.rollNo || '').toUpperCase();
      if (!normRoll || seenInBatch.has(normRoll)) {
        logger.warn(`Duplicate student ${stud.rollNo} skipped during single commit`, { rollNo: stud.rollNo });
        continue;
      }
      seenInBatch.add(normRoll);

      if (existingMap.has(normRoll)) {
        // Reconcile and update existing student record (Nominal roll update)
        const existing = existingMap.get(normRoll);
        let modified = false;
        const oldCid = existing.classId ? existing.classId.toString() : null;
        const newCid = targetClass._id.toString();

        if (stud.name && stud.name !== existing.name) {
          existing.name = stud.name;
          modified = true;
        }
        if (stud.email && stud.email !== existing.email) {
          existing.email = stud.email;
          modified = true;
        }
        if (oldCid !== newCid) {
          existing.classId = targetClass._id;
          existing.departmentId = targetClass.departmentId;
          existing.semester = targetClass.semester;
          existing.academicYear = targetClass.academicYear;
          modified = true;

          if (oldCid) {
            if (!oldClassesToPrune.has(oldCid)) oldClassesToPrune.set(oldCid, []);
            oldClassesToPrune.get(oldCid).push(existing._id);
          }
        }

        if (modified) {
          await existing.save({ session });
        }
        classTargetIds.push(existing._id);
        allProcessedIds.push(existing._id);
      } else {
        toInsert.push({
          ...stud,
          email: stud.email || `${stud.rollNo.toLowerCase()}@mits.ac.in`,
          classId: targetClass._id,
          departmentId: targetClass.departmentId,
          semester: targetClass.semester,
          academicYear: targetClass.academicYear,
          isActive: true,
          isProfileComplete: false,
        });
      }
    }

    if (toInsert.length > 0) {
      try {
        const insertedDocs = await Student.insertMany(toInsert, { session, ordered: false });
        const insertedIds = insertedDocs.map((d) => d._id);
        classTargetIds.push(...insertedIds);
        allProcessedIds.push(...insertedIds);
      } catch (insertErr) {
        if (insertErr.code === 11000 || insertErr.writeErrors?.length > 0) {
          const insertedIds = (insertErr.insertedDocs || []).map((d) => d._id);
          classTargetIds.push(...insertedIds);
          allProcessedIds.push(...insertedIds);
        } else {
          throw insertErr;
        }
      }
    }

    if (classTargetIds.length > 0) {
      await Class.findByIdAndUpdate(singleClassId, { $addToSet: { studentIds: { $each: classTargetIds } } }, { session });
    }

    // Prune transferred students from old classes
    for (const [oldCid, studentIds] of oldClassesToPrune.entries()) {
      await Class.findByIdAndUpdate(
        oldCid,
        { $pull: { studentIds: { $in: studentIds } } },
        { session }
      );
      invalidateEntityCache('class', oldCid);
    }

    invalidateEntityCache('student', 'all');
    invalidateEntityCache('class', singleClassId.toString());

    const finalStatus = 'success';
    await Task.findByIdAndUpdate(taskId, {
      status: finalStatus,
      message: `Completed: ${allProcessedIds.length} succeeded.`,
      meta: { 
        requested: singleStudents.length, 
        success: allProcessedIds.length, 
        failed: 0
      }
    }, { session });

    await commitSafeTransaction(session);

    logger.audit('STUDENT_IMPORT_COMMIT', {
      actor: req.user.userId,
      resource_id: singleClassId,
      meta: { 
        taskId,
        requested: singleStudents.length, 
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

  const { sheet } = req.query;
  const rows = parseBuffer(req.file.buffer, { preferredSheet: sheet, type: 'faculty' });
  const results = {
    valid: [],
    errors: [],
    summary: { total: rows.length, valid: 0, errors: 0 },
    sheetName: rows.sheetName,
    availableSheets: rows.availableSheets || [rows.sheetName].filter(Boolean),
  };

  // 1. Bulk lookup for IDs and Emails
  const empIds = rows.map(r => getRowValue(r, ['Employee ID', 'employeeId'])?.toString().toUpperCase()).filter(Boolean);
  const emails = rows.map(r => getRowValue(r, ['Email', 'email'])?.toString().toLowerCase()).filter(Boolean);
  
  const [existingFacultyIds, existingFacultyEmails, allDepts] = await Promise.all([
    Faculty.find({ employeeId: { $in: empIds } }).select('employeeId').lean(),
    Faculty.find({ email: { $in: emails } }).select('email').lean(),
    Department.find({ isActive: { $ne: false } }).select('_id name code').lean()
  ]);

  const idSet = new Set(existingFacultyIds.map(f => f.employeeId));
  const emailSet = new Set(existingFacultyEmails.map(f => f.email));
  const deptMap = new Map();
  for (const d of allDepts) {
    if (d.name) {
      const upperName = d.name.toUpperCase();
      const normName = normalizeHeader(d.name);
      deptMap.set(upperName, d._id);
      deptMap.set(normName, d._id);

      const acronym = generateDepartmentAcronym(d.name);
      if (acronym) {
        deptMap.set(acronym.toUpperCase(), d._id);
        deptMap.set(normalizeHeader(acronym), d._id);
      }

      // Map known aliases
      for (const [codeKey, aliases] of Object.entries(KNOWN_DEPT_ALIASES)) {
        if (aliases.some((a) => upperName.includes(a) || a.includes(upperName))) {
          deptMap.set(codeKey.toUpperCase(), d._id);
          deptMap.set(normalizeHeader(codeKey), d._id);
        }
      }
    }
    if (d.code) {
      deptMap.set(d.code.toUpperCase(), d._id);
      deptMap.set(normalizeHeader(d.code), d._id);
    }
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    let employeeId = getRowValue(row, ['Employee ID', 'employeeId']);
    let name = getRowValue(row, ['Name', 'name']);
    let email = getRowValue(row, ['Email', 'email']);
    const deptName = getRowValue(row, ['Department', 'department']);
    let phone = getRowValue(row, ['Phone', 'phone', 'Mobile', 'mobile']);

    if (employeeId) employeeId = employeeId.replace(/\s+/g, '').toUpperCase();
    if (name) name = cleanPersonName(name);
    if (email) email = extractValidEmail(email) || email.trim().toLowerCase();
    if (phone) phone = String(phone).replace(/[^\d+]/g, '');

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

    const deptId = deptMap.get(deptName.toUpperCase()) || deptMap.get(normalizeHeader(deptName));
    if (!deptId) {
      results.errors.push({ row: i + 1, data: row, reason: `Department '${deptName}' not found` });
      results.summary.errors++;
      continue;
    }

    try {
      checkDeptScope(req.user, deptId);
    } catch (e) {
      results.errors.push({ row: i + 1, data: row, reason: e.message });
      results.summary.errors++;
      continue;
    }

    employeeId = employeeId.toString().toUpperCase();
    email = email.toString().toLowerCase();

    if (idSet.has(employeeId)) {
      results.errors.push({ row: i + 1, data: row, reason: `Employee ID ${employeeId} already exists` });
      results.summary.errors++;
      continue;
    }

    if (emailSet.has(email)) {
      results.errors.push({ row: i + 1, data: row, reason: `Email ${email} already exists` });
      results.summary.errors++;
      continue;
    }

    results.valid.push({ 
      employeeId, 
      name, 
      email, 
      departmentName: deptName,
      departmentId: deptId 
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

export const previewElectives = asyncHandler(async (req, res, next) => {
  if (!req.file) return next(new ErrorResponse('Please upload a file', 400));
  const { sheet } = req.query;
  const rows = parseBuffer(req.file.buffer, { preferredSheet: sheet, type: 'electives' });
  if (!rows.length) {
    return next(
      new ErrorResponse(
        'Uploaded spreadsheet has no data rows. Expected columns: Roll No, Subject Code, Faculty Employee ID (or Email).',
        400,
        'VAL_001'
      )
    );
  }
  const results = {
    valid: [],
    errors: [],
    summary: { total: 0, valid: 0, errors: 0 },
    sheetName: rows.sheetName,
    availableSheets: rows.availableSheets || [rows.sheetName].filter(Boolean),
  };

  // 1. Pre-process all rows to collect IDs for bulk lookup
  const allRollNos = new Set();
  const allSubjectCodes = new Set();

  for (const row of rows) {
    const rawRoll = getRowValue(row, ROLL_KEYS);
    const subjectCode = getRowValue(row, SUBJECT_CODE_KEYS);

    if (rawRoll) {
      const rolls = unpackRollList(rawRoll);
      if (rolls) rolls.forEach((r) => allRollNos.add(r.toUpperCase()));
    }
    if (subjectCode) {
      const cleanCode = subjectCode.replace(/\s+/g, '').toUpperCase();
      allSubjectCodes.add(cleanCode);
    }
  }

  // 2. Bulk Database Queries
  const [students, subjects, faculty] = await Promise.all([
    Student.find({ rollNo: { $in: Array.from(allRollNos) }, isActive: true }).select('_id rollNo name departmentId').lean(),
    Subject.find({ code: { $in: Array.from(allSubjectCodes) }, isElective: true, isActive: true }).select('_id code name').lean(),
    Faculty.find({ isActive: true }).select('_id employeeId email name').lean(),
  ]);

  const studentMap = new Map(students.map((s) => [s.rollNo, s]));
  const subjectMap = new Map(subjects.map((s) => [s.code, s]));
  const facultyMap = buildFacultyLookup(faculty);

  // 3. Process validation in-memory
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rawRoll = getRowValue(row, ROLL_KEYS);
    const subjectCode = getRowValue(row, SUBJECT_CODE_KEYS);
    const empOrEmail = getRowValue(row, FACULTY_IDENTIFIER_KEYS);

    if (!rawRoll || !subjectCode || !empOrEmail) {
      results.errors.push({ row: i + 1, data: row, reason: 'Missing required columns (Roll No, Subject Code, Faculty Employee ID / Email)' });
      results.summary.errors++;
      results.summary.total++;
      continue;
    }

    const rolls = unpackRollList(rawRoll);
    if (!rolls || rolls.length === 0) {
      results.errors.push({ row: i + 1, data: row, reason: `Invalid roll number format: ${rawRoll}` });
      results.summary.errors++;
      results.summary.total++;
      continue;
    }

    for (const rollNo of rolls) {
      results.summary.total++;
      const upperRoll = rollNo.toUpperCase();
      const student = studentMap.get(upperRoll);
      const subject = subjectMap.get(subjectCode.toUpperCase());
      const mentor = lookupFaculty(facultyMap, empOrEmail);

      let reason = null;
      if (!student) {
        reason = `Student ${rollNo} not found or inactive`;
      } else if (!subject) {
        reason = `Elective subject ${subjectCode} not found or inactive`;
      } else if (!mentor) {
        reason = `Faculty ${empOrEmail} not found or inactive`;
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
          facultyId: mentor._id, 
          employeeId: mentor.employeeId,
          facultyName: mentor.name,
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
  const { sheet } = req.query;
  const rows = parseBuffer(req.file.buffer, { preferredSheet: sheet, type: 'mentors' });
  if (!rows.length) {
    return next(
      new ErrorResponse(
        'Uploaded spreadsheet has no data rows. Expected columns: Roll No, Faculty Employee ID (or Email).',
        400,
        'VAL_001'
      )
    );
  }
  const results = {
    valid: [],
    errors: [],
    summary: { total: 0, valid: 0, errors: 0 },
    sheetName: rows.sheetName,
    availableSheets: rows.availableSheets || [rows.sheetName].filter(Boolean),
  };

  // 1. Pre-process to collect IDs
  const allRollNos = new Set();
  const seenRolls = new Set();

  for (const row of rows) {
    const rawRoll = getRowValue(row, ROLL_KEYS);
    if (rawRoll) {
      const rolls = unpackRollList(rawRoll);
      if (rolls) rolls.forEach((r) => allRollNos.add(r.toUpperCase()));
    }
  }

  // 2. Bulk Database Queries
  const [students, faculty] = await Promise.all([
    Student.find({ rollNo: { $in: Array.from(allRollNos) }, isActive: true }).select('_id rollNo name departmentId').lean(),
    Faculty.find({ isActive: true }).select('_id employeeId email name departmentId roleTags').lean(),
  ]);

  const studentMap = new Map(students.map((s) => [s.rollNo, s]));
  const facultyMap = buildFacultyLookup(faculty);

  // 3. Process Validation
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rawRoll = getRowValue(row, ROLL_KEYS);
    const empOrEmail = getRowValue(row, FACULTY_IDENTIFIER_KEYS);

    if (!rawRoll || !empOrEmail) {
      results.errors.push({ row: i + 1, data: row, reason: 'Missing required columns (Roll No, Faculty Employee ID / Email)' });
      results.summary.errors++;
      results.summary.total++;
      continue;
    }

    const rolls = unpackRollList(rawRoll);
    if (!rolls || rolls.length === 0) {
      results.errors.push({ row: i + 1, data: row, reason: `Invalid roll number format: ${rawRoll}` });
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
          originalRange: rolls.length > 1 ? rawRoll : null,
        });
        results.summary.errors++;
        continue;
      }
      seenRolls.add(upperRoll);

      const student = studentMap.get(upperRoll);
      const mentor = lookupFaculty(facultyMap, empOrEmail);

      let reason = null;
      if (!student) {
        reason = `Student ${rollNo} not found or inactive`;
      } else if (!mentor) {
        reason = `Faculty ${empOrEmail} not found or inactive`;
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
          mentorId: mentor._id, 
          employeeId: mentor.employeeId,
          facultyName: mentor.name,
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

    // ── Post-Commit Synchronization ──
    // Group students by mentor to optimize sync calls
    const mentorGroups = mentors.reduce((acc, curr) => {
      const key = curr.mentorId.toString();
      if (!acc[key]) acc[key] = { name: curr.facultyName, ids: [] };
      acc[key].ids.push(curr.studentId);
      return acc;
    }, {});

    // Run syncs in parallel background
    Promise.all(Object.entries(mentorGroups).map(([mid, data]) => 
      bulkSyncMentorUpdate(data.ids, mid, data.name)
    )).catch(err => logger.error('bulk_mentor_sync_background_failed', { error: err.message }));

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

  const { sheet } = req.query;
  const rows = parseBuffer(req.file.buffer, { preferredSheet: sheet, type: 'subjects' });
  const results = {
    valid: [],
    errors: [],
    summary: { total: rows.length, valid: 0, errors: 0 },
    sheetName: rows.sheetName,
    availableSheets: rows.availableSheets || [rows.sheetName].filter(Boolean),
  };

  // 1. Bulk check for existing subjects
  const codes = rows
    .map((r) => {
      const c = r.code || r.subjectCode || getRowValue(r, ['Code', 'subjectCode', 'Subject Code', 'Course Code', 'code']);
      return c ? c.toString().replace(/\s+/g, '').toUpperCase() : null;
    })
    .filter(Boolean);
  const existingSubjects = await Subject.find({ code: { $in: codes } }).select('code').lean();
  const existingCodeSet = new Set(existingSubjects.map((s) => s.code));
  const seenCodes = new Set();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    let name = row.name || getRowValue(row, ['Name', 'subjectName', 'Subject Name', 'Course Title', 'Course Name', 'Paper Name', 'name']);
    let code = row.code || row.subjectCode || getRowValue(row, ['Code', 'subjectCode', 'Subject Code', 'Course Code', 'Sub Code', 'code']);
    const rawSemester = row.semester || getRowValue(row, ['Semester', 'semester', 'sem', 'Term', 'term']);
    const rawIsElective = row.isElective !== undefined ? row.isElective : getRowValue(row, ['Is Elective', 'isElective', 'elective', 'Type', 'type', 'Course Type']);

    const semester = rawSemester !== null && rawSemester !== undefined ? parseSemester(rawSemester) : undefined;
    const isElective = parseElective(rawIsElective);

    const errors = [];
    if (!name) errors.push('Subject Name is required');
    if (!code) errors.push('Subject Code is required');
    if (rawSemester !== null && rawSemester !== undefined && semester === undefined) {
      errors.push(`Invalid semester "${rawSemester}". Expected 1-8 or I-VIII.`);
    }

    if (errors.length > 0) {
      results.errors.push({ row: i + 1, data: row, reason: errors.join(', ') });
      results.summary.errors++;
      continue;
    }

    const upperCode = code.toString().replace(/\s+/g, '').toUpperCase().trim();

    if (seenCodes.has(upperCode)) {
      results.errors.push({ row: i + 1, data: row, reason: `Duplicate subject code ${upperCode} in file` });
      results.summary.errors++;
      continue;
    }
    seenCodes.add(upperCode);

    if (existingCodeSet.has(upperCode)) {
      results.errors.push({ row: i + 1, data: row, reason: `Subject code ${upperCode} already exists` });
      results.summary.errors++;
      continue;
    }

    // Clean name: strip leading code if present (e.g. "20CS501 - Operating Systems" -> "Operating Systems")
    let cleanName = cleanPersonName(name);
    if (cleanName.toUpperCase().startsWith(upperCode)) {
      cleanName = cleanName.slice(upperCode.length).replace(/^[\s\-–—/:]+/, '').trim() || cleanName;
    }

    results.valid.push({ 
      name: cleanName, 
      code: upperCode, 
      semester,
      isElective
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

