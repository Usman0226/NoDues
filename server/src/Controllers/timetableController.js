import TimetableUpload from '../models/TimetableUpload.js';
import Class from '../models/Class.js';
import Subject from '../models/Subject.js';
import Faculty from '../models/Faculty.js';
import Department from '../models/Department.js';
import { parseTimetablePdf, inspectPdfPages, normalizeFacultyName } from '../services/timetableParser.js';
import logger from '../utils/logger.js';

/**
 * Inspects an uploaded timetable PDF document structure.
 * Returns page count, text layer status, detected headers, and class match recommendations.
 * TRD Reference: FR-C1, FR-C2, Setup Wizard Multi-Page Ingestion
 */
export async function inspectTimetablePdf(req, res, next) {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Please upload a PDF timetable file to inspect.',
        },
      });
    }

    const classId = req.body.classId || req.query.classId;
    let targetClass = null;
    if (classId) {
      targetClass = await Class.findById(classId).lean();
    }

    const inspection = await inspectPdfPages(req.file.buffer, {
      targetClassName: targetClass?.name,
      semester: targetClass?.semester,
      departmentId: targetClass?.departmentId,
    });

    return res.status(200).json({
      success: true,
      data: {
        fileName: req.file.originalname || 'timetable.pdf',
        fileSize: req.file.size,
        ...inspection.data,
      },
    });
  } catch (err) {
    if (err.code === 'VAL_001' || err.statusCode === 400) {
      return res.status(400).json({
        success: false,
        error: {
          code: err.code || 'VAL_001',
          message: err.message,
        },
      });
    }
    next(err);
  }
}

/**
 * Generates a preview from an uploaded timetable PDF.
 * Never auto-commits to live assignments.
 * TRD Reference: FR-C1 to FR-C8, MON-4
 */
export async function previewTimetable(req, res, next) {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Please upload a PDF timetable file.',
        },
      });
    }

    const { classId, targetSemester, page } = req.body;
    const selectedPage = page ? parseInt(page, 10) : null;
    if (selectedPage && (isNaN(selectedPage) || selectedPage < 1)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VAL_001', message: 'Page must be a positive integer.' },
      });
    }

    // Resolve target class (either from explicit classId or auto-detected from PDF page)
    let targetClass = null;
    let deptId = req.body.departmentId || req.user?.departmentId || (req.user?.department?._id || req.user?.department);

    if (classId) {
      targetClass = await Class.findById(classId);
      if (!targetClass) {
        return res.status(404).json({
          success: false,
          error: { code: 'DB_002', message: 'Target class not found.' },
        });
      }
      deptId = targetClass.departmentId;
    }

    const parsedSem = parseInt(targetSemester, 10);
    const requestedSem = parsedSem && parsedSem >= 1 && parsedSem <= 8 ? parsedSem : (targetClass?.semester || undefined);

    // Parse the PDF text layer (targeting specific page if provided)
    const result = await parseTimetablePdf(req.file.buffer, {
      departmentId: deptId,
      semester: requestedSem,
      page: selectedPage,
    });

    const parsedData = result.data;
    const metadata = parsedData.metadata || {};

    // Auto-resolve or provision Class if classId was not provided upfront
    if (!targetClass) {
      const resolvedSem = requestedSem || metadata.detectedSemester || 1;
      const detectedClsName = metadata.detectedClassName || req.body.className || 'Section A';

      // If deptId is still unknown, attempt to resolve from detectedDepartment code
      if (!deptId && metadata.detectedDepartment) {
        const foundDept = await Department.findOne({
          $or: [
            { code: new RegExp(`^${metadata.detectedDepartment}$`, 'i') },
            { name: new RegExp(metadata.detectedDepartment, 'i') },
          ],
        });
        if (foundDept) deptId = foundDept._id;
      }
      if (!deptId) {
        // Fallback to first active department
        const anyDept = await Department.findOne({ isActive: true });
        if (anyDept) deptId = anyDept._id;
      }

      // Check if class exists
      const clsQuery = { name: detectedClsName, semester: resolvedSem };
      if (deptId) clsQuery.departmentId = deptId;
      targetClass = await Class.findOne(clsQuery);

      if (!targetClass) {
        const academicYear = metadata.academicYear || metadata.detectedAcademicYear || '2025-26';
        const startYear = parseInt(String(academicYear).split(/[-/]/)[0], 10) || new Date().getFullYear();
        const yearOffset = Math.floor((resolvedSem - 1) / 2);
        const entryYear = startYear - yearOffset;
        const batch = `${entryYear}-${String(entryYear + 4).slice(-2)}`;

        targetClass = await Class.create({
          name: detectedClsName,
          semester: resolvedSem,
          academicYear,
          batch,
          departmentId: deptId,
          isActive: true,
          subjectAssignments: [],
        });
      }
    }

    // Auto-assign class teacher if detected in PDF and not yet set on class
    if (targetClass && !targetClass.classTeacherId && metadata.classTeacher) {
      const normName = normalizeFacultyName(metadata.classTeacher);
      const faculties = await Faculty.find({ departmentId: targetClass.departmentId, isActive: true }).lean();
      const matched = faculties.find((f) => normalizeFacultyName(f.name) === normName);
      if (matched) {
        targetClass.classTeacherId = matched._id;
        await targetClass.save();
      }
    }

    // Populate classTeacher for rich client return
    if (targetClass.classTeacherId) {
      await targetClass.populate('classTeacherId', 'name email employeeId');
    }

    // Create an audit record for this upload (MON-4)
    const uploadRecord = await TimetableUpload.create({
      classId: targetClass._id,
      targetSemester: targetClass.semester,
      uploadedBy: req.user?._id || req.user?.userId || null,
      uploaderModel: req.user?.role === 'admin' ? 'Admin' : 'Faculty',
      originalFileName: req.file.originalname || 'timetable.pdf',
      parsedRowCount: parsedData.parsedRowCount,
      matchedRowCount: parsedData.matchedRowCount,
      flaggedRowCount: parsedData.flaggedRowCount,
      committed: false,
      parsedData: {
        selectedPage: parsedData.selectedPage,
        pageCount: parsedData.pageCount,
        isMultiPage: parsedData.isMultiPage,
        rows: parsedData.rows,
      },
    });

    return res.status(200).json({
      success: true,
      data: {
        uploadId: uploadRecord._id,
        classId: targetClass._id,
        className: targetClass.name,
        targetSemester: targetClass.semester,
        classTeacher: targetClass.classTeacherId ? {
          _id: targetClass.classTeacherId._id || targetClass.classTeacherId,
          name: targetClass.classTeacherId.name,
          email: targetClass.classTeacherId.email,
        } : null,
        detectedTeacher: metadata.classTeacher || null,
        selectedPage: parsedData.selectedPage,
        pageCount: parsedData.pageCount,
        isMultiPage: parsedData.isMultiPage,
        summary: {
          totalRows: parsedData.parsedRowCount,
          matchedRows: parsedData.matchedRowCount,
          flaggedRows: parsedData.flaggedRowCount,
          selectedPage: parsedData.selectedPage,
          pageCount: parsedData.pageCount,
          durationMs: parsedData.durationMs,
        },
        rows: parsedData.rows,
        metadata,
      },
    });
  } catch (err) {
    if (err.code === 'INVALID_PDF_TEXT_LAYER' || err.code === 'NO_TABLE_ROWS_FOUND' || err.code === 'VAL_001') {
      return res.status(400).json({
        success: false,
        error: {
          code: err.code,
          message: err.message,
        },
      });
    }
    next(err);
  }
}

/**
 * Commits reviewed and confirmed timetable rows to the target class.
 * Updates semesterSubjects and archives prior entries per FR-B3.
 * TRD Reference: FR-B2, FR-B3, FR-C7
 */
export async function commitTimetable(req, res, next) {
  try {
    const { uploadId, classId, targetSemester, confirmedRows, classTeacherId } = req.body;

    if (!classId || !targetSemester || !Array.isArray(confirmedRows)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'classId, targetSemester, and confirmedRows array are required.',
        },
      });
    }

    const targetSem = parseInt(targetSemester, 10);
    const targetClass = await Class.findById(classId);
    if (!targetClass) {
      return res.status(404).json({
        success: false,
        error: { code: 'DB_002', message: 'Class not found.' },
      });
    }

    if (classTeacherId) {
      targetClass.classTeacherId = classTeacherId;
    }

    // Verify upload audit record if provided
    let uploadDoc = null;
    if (uploadId) {
      uploadDoc = await TimetableUpload.findById(uploadId);
    }

    // Filter out excluded rows and ensure valid Subject IDs
    const subjectsToCommit = [];
    for (const r of confirmedRows.filter((row) => row.status !== 'excluded')) {
      const cleanSubjectName = (r.subjectName || r.subjectCode || '').replace(/^[\s\-–—:]+/, '').trim();
      let resolvedSubjectId = r.subjectId;
      if (!resolvedSubjectId && r.subjectCode) {
        let sub = await Subject.findOne({ code: r.subjectCode.toUpperCase() });
        if (!sub) {
          sub = await Subject.create({
            code: r.subjectCode.toUpperCase(),
            name: cleanSubjectName,
            semester: targetSem,
            isActive: true,
          });
        }
        resolvedSubjectId = sub._id;
      }

      if (resolvedSubjectId) {
        subjectsToCommit.push({
          subjectId: resolvedSubjectId,
          subjectName: cleanSubjectName,
          subjectCode: r.subjectCode,
          facultyId: r.facultyId || null,
          facultyName: r.facultyName || null,
          coFacultyIds: r.coFacultyIds || [],
          source: 'timetable_parse',
        });
      }
    }

    // Archive previous semester entries if present (FR-B3)
    if (!targetClass.semesterSubjects) {
      targetClass.semesterSubjects = new Map();
    }

    for (const [semKey, semEntry] of targetClass.semesterSubjects.entries()) {
      if (semEntry && semEntry.status === 'active') {
        semEntry.status = 'archived';
        semEntry.archivedAt = new Date();
      }
    }

    // Set new active semester subject entry (FR-B2, FR-B3)
    targetClass.semesterSubjects.set(String(targetSem), {
      subjects: subjectsToCommit,
      status: 'active',
      setAt: new Date(),
      archivedAt: null,
    });

    // Also populate legacy subjectAssignments for backward compatibility (NC-5)
    targetClass.subjectAssignments = subjectsToCommit.map(s => ({
      subjectId: s.subjectId,
      subjectName: s.subjectName,
      subjectCode: s.subjectCode,
      facultyId: s.facultyId,
      facultyName: s.facultyName,
    }));
    targetClass.semester = targetSem;

    // Update wizard progress for class_info and timetable_subjects
    if (!targetClass.wizardProgress) {
      targetClass.wizardProgress = { completedSteps: [], stepData: {} };
    }
    const completed = new Set(targetClass.wizardProgress.completedSteps || []);
    completed.add('class_info');
    completed.add('timetable_subjects');
    targetClass.wizardProgress.completedSteps = Array.from(completed);
    targetClass.wizardProgress.currentStep = 'students';

    await targetClass.save();
    if (targetClass.classTeacherId) {
      await targetClass.populate('classTeacherId', 'name email employeeId');
    }

    // Auto-propagate cohort syllabus: peer classes in the same department & semester with 0 subjects inherit the subject list
    const inheritedForPeers = subjectsToCommit.map(s => ({
      subjectId: s.subjectId,
      subjectName: s.subjectName,
      subjectCode: s.subjectCode,
      isElective: s.isElective || false,
      facultyId: null,
      facultyName: null,
    }));

    if (inheritedForPeers.length > 0) {
      await Class.updateMany(
        {
          departmentId: targetClass.departmentId,
          semester: targetSem,
          _id: { $ne: targetClass._id },
          isActive: true,
          $or: [
            { subjectAssignments: { $exists: false } },
            { subjectAssignments: { $size: 0 } },
          ],
        },
        {
          $set: { subjectAssignments: inheritedForPeers },
        }
      );
    }

    // Mark upload record as committed
    if (uploadDoc) {
      uploadDoc.committed = true;
      uploadDoc.committedAt = new Date();
      await uploadDoc.save();
    }

    logger.info('Timetable committed to class successfully', {
      classId: targetClass._id,
      semester: targetSem,
      subjectCount: subjectsToCommit.length,
      actor: req.user?._id || req.user?.userId || null,
    });

    return res.status(200).json({
      success: true,
      message: `Successfully committed ${subjectsToCommit.length} subjects for semester ${targetSem}.`,
      data: {
        classId: targetClass._id,
        className: targetClass.name,
        semester: targetSem,
        committedCount: subjectsToCommit.length,
        classData: targetClass,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Returns the full subject history for a class across all active & archived semesters.
 * TRD Reference: FR-B5
 */
export async function getClassSubjectHistory(req, res, next) {
  try {
    const { classId } = req.params;
    const targetClass = await Class.findById(classId)
      .select('name semester academicYear semesterSubjects subjectAssignments')
      .lean();

    if (!targetClass) {
      return res.status(404).json({
        success: false,
        error: { code: 'DB_002', message: 'Class not found.' },
      });
    }

    const history = {};
    if (targetClass.semesterSubjects) {
      for (const [sem, data] of Object.entries(targetClass.semesterSubjects)) {
        history[sem] = data;
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        classId: targetClass._id,
        className: targetClass.name,
        currentSemester: targetClass.semester,
        semesterSubjects: history,
        legacySubjectAssignments: targetClass.subjectAssignments,
      },
    });
  } catch (err) {
    next(err);
  }
}
