import TimetableUpload from '../models/TimetableUpload.js';
import Class from '../models/Class.js';
import Subject from '../models/Subject.js';
import { parseTimetablePdf, inspectPdfPages } from '../services/timetableParser.js';
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
    if (!classId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VAL_001', message: 'classId is required.' },
      });
    }

    const targetSem = parseInt(targetSemester, 10);
    if (!targetSem || targetSem < 1 || targetSem > 8) {
      return res.status(400).json({
        success: false,
        error: { code: 'VAL_001', message: 'targetSemester must be an integer between 1 and 8.' },
      });
    }

    const targetClass = await Class.findById(classId).lean();
    if (!targetClass) {
      return res.status(404).json({
        success: false,
        error: { code: 'DB_002', message: 'Target class not found.' },
      });
    }

    const selectedPage = page ? parseInt(page, 10) : null;
    if (selectedPage && (isNaN(selectedPage) || selectedPage < 1)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VAL_001', message: 'Page must be a positive integer.' },
      });
    }

    // Parse the PDF text layer (targeting specific page if provided)
    const result = await parseTimetablePdf(req.file.buffer, {
      departmentId: targetClass.departmentId,
      semester: targetSem,
      page: selectedPage,
    });

    const parsedData = result.data;

    // Create an audit record for this upload (MON-4)
    const uploadRecord = await TimetableUpload.create({
      classId: targetClass._id,
      targetSemester: targetSem,
      uploadedBy: req.user._id || req.user.userId,
      uploaderModel: req.user.role === 'admin' ? 'Admin' : 'Faculty',
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
        targetSemester: targetSem,
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
    const { uploadId, classId, targetSemester, confirmedRows } = req.body;

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

    await targetClass.save();

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
      actor: req.user._id || req.user.userId,
    });

    return res.status(200).json({
      success: true,
      message: `Successfully committed ${subjectsToCommit.length} subjects for semester ${targetSem}.`,
      data: {
        classId: targetClass._id,
        className: targetClass.name,
        semester: targetSem,
        committedCount: subjectsToCommit.length,
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
