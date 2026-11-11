import TimetableUpload from '../models/TimetableUpload.js';
import Class from '../models/Class.js';
import Subject from '../models/Subject.js';
import Faculty from '../models/Faculty.js';
import Department from '../models/Department.js';
import Admin from '../models/Admin.js';
import { parseTimetablePdf, inspectPdfPages, normalizeFacultyName, extractClassMetadataFromText } from '../services/timetableParser.js';
import { PDFParse } from 'pdf-parse';
import logger from '../utils/logger.js';

const ROMAN_YEARS = { 1: 'I', 2: 'I', 3: 'II', 4: 'II', 5: 'III', 6: 'III', 7: 'IV', 8: 'IV' };
const getAcademicYearRoman = (sem) => ROMAN_YEARS[sem] || 'I';

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

    // If deptId is still unknown, attempt to resolve from targeted page text
    if (!deptId) {
      try {
        const quickParser = new PDFParse({ data: req.file.buffer });
        const quickRes = await quickParser.getText(selectedPage ? { partial: [selectedPage] } : {});
        const quickText = quickRes.pages?.[0]?.text || quickRes.text || '';
        const quickMeta = extractClassMetadataFromText(quickText);
        if (quickMeta.detectedDepartment) {
          const foundDept = await Department.findOne({
            $or: [
              { code: new RegExp(`^${quickMeta.detectedDepartment}$`, 'i') },
              { name: new RegExp(quickMeta.detectedDepartment, 'i') },
            ],
          });
          if (foundDept) deptId = foundDept._id;
        }
      } catch (e) {
        // Fallback
      }
      if (!deptId) {
        const anyDept = await Department.findOne({ isActive: true });
        if (anyDept) deptId = anyDept._id;
      }
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

      // Check if class exists using canonical section normalization (matches e.g. CSD-A, III CSD-A, or III CSD-E)
      const cleanSection = detectedClsName.replace(/^(I|II|III|IV)[\s\-_]+/i, '').trim();
      const escapedClean = cleanSection.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const nameRegex = new RegExp(`^((I|II|III|IV)[\\s\\-_]+)?${escapedClean}$`, 'i');

      const clsQuery = { 
        name: nameRegex, 
        semester: resolvedSem,
        isMaster: { $ne: true }
      };
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
      const allFacs = await Faculty.find({ isActive: true }).lean();
      const matched = allFacs.find((f) => f.departmentId?.toString() === targetClass.departmentId?.toString() && normalizeFacultyName(f.name) === normName)
        || allFacs.find((f) => normalizeFacultyName(f.name) === normName);
      if (matched) {
        targetClass.classTeacherId = matched._id;
        await targetClass.save();
      }
    }

    // Populate classTeacher for rich client return
    if (targetClass.classTeacherId) {
      await targetClass.populate('classTeacherId', 'name email employeeId');
    }

    // Resolve uploader defensively
    let uploaderId = req.user?._id || req.user?.userId || req.user?.id;
    if (!uploaderId) {
      const adminDoc = await Admin.findOne().lean();
      uploaderId = adminDoc?._id;
    }
    const uploaderModel = (req.user?.role === 'admin' || req.user?.role === 'Admin') ? 'Admin' : 'Faculty';

    // Create an audit record for this upload (MON-4)
    const uploadRecord = await TimetableUpload.create({
      classId: targetClass._id,
      targetSemester: targetClass.semester,
      uploadedBy: uploaderId,
      uploaderModel,
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
        departmentId: targetClass.departmentId,
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
          isMaster: { $ne: true },
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

      // Also ensure Master Curriculum (SSOT) is hydrated with the master subject blueprint
      try {
        const masterClass = await Class.findOne({
          departmentId: targetClass.departmentId,
          semester: targetSem,
          isMaster: true,
          isActive: true,
        });

        if (masterClass) {
          const existingCodes = new Set((masterClass.subjectAssignments || []).map((s) => (s.subjectCode || '').toUpperCase()));
          const mergedAssignments = [...(masterClass.subjectAssignments || [])];
          for (const peerSub of inheritedForPeers) {
            if (!existingCodes.has((peerSub.subjectCode || '').toUpperCase())) {
              mergedAssignments.push(peerSub);
              existingCodes.add((peerSub.subjectCode || '').toUpperCase());
            }
          }
          masterClass.subjectAssignments = mergedAssignments;
          await masterClass.save();
        } else {
          await Class.create({
            name: `Semester ${targetSem} Curriculum Master`,
            semester: targetSem,
            academicYear: targetClass.academicYear,
            departmentId: targetClass.departmentId,
            isMaster: true,
            isActive: true,
            subjectAssignments: inheritedForPeers,
          });
        }
      } catch (masterErr) {
        logger.warn('Failed to auto-hydrate master curriculum from timetable commit', { error: masterErr?.message });
      }
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

/**
 * Batch provisions all detected sections from a multi-page timetable PDF.
 * Auto-creates/matches classes, assigns detected class teachers, updates subject curriculum,
 * and hydrates the Master Curriculum (SSOT) for all affected semesters.
 */
export async function batchImportTimetable(req, res, next) {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        error: { code: 'VAL_001', message: 'Please upload a PDF timetable file.' },
      });
    }

    let deptId = req.body.departmentId || req.user?.departmentId || (req.user?.department?._id || req.user?.department);

    // Inspect document structure
    const inspection = await inspectPdfPages(req.file.buffer, { departmentId: deptId });
    const pages = inspection.data?.pages || [];
    if (pages.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VAL_001', message: 'No extractable pages found in timetable PDF.' },
      });
    }

    // Auto-resolve deptId if not provided
    if (!deptId && pages[0]?.detectedDepartment) {
      const code = pages[0].detectedDepartment.toUpperCase();
      const foundDept = await Department.findOne({
        $or: [
          { code: new RegExp(`^${code}$`, 'i') },
          { name: new RegExp(code, 'i') },
        ],
      });
      if (foundDept) deptId = foundDept._id;
    }
    if (!deptId) {
      const anyDept = await Department.findOne({ isActive: true });
      if (anyDept) deptId = anyDept._id;
    }

    // Fetch active faculty for matching
    const allFaculty = await Faculty.find({ isActive: true }).lean();
    const deptFaculty = allFaculty.filter(f => f.departmentId?.toString() === deptId?.toString());

    const provisionedSections = [];
    const hydratedSemesters = new Set();

    for (const pageInfo of pages) {
      const pageNum = pageInfo.pageNumber;
      try {
        const parsedResult = await parseTimetablePdf(req.file.buffer, {
          departmentId: deptId,
          semester: pageInfo.detectedSemester || undefined,
          page: pageNum,
        });

        const parsedData = parsedResult.data;
        const metadata = parsedData.metadata || {};
        const resolvedSem = pageInfo.detectedSemester || metadata.detectedSemester || 1;
        const detectedClsName = pageInfo.detectedClassName || metadata.detectedClassName || `Section ${pageNum}`;

        // Canonical normalization
        const cleanSection = detectedClsName.replace(/^(I|II|III|IV)[\s\-_]+/i, '').trim();
        const escapedClean = cleanSection.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const nameRegex = new RegExp(`^((I|II|III|IV)[\\s\\-_]+)?${escapedClean}$`, 'i');

        let targetClass = await Class.findOne({
          name: nameRegex,
          semester: resolvedSem,
          isMaster: { $ne: true },
          departmentId: deptId,
        });

        const academicYear = metadata.academicYear || metadata.detectedAcademicYear || '2026-27';
        const startYear = parseInt(String(academicYear).split(/[-/]/)[0], 10) || new Date().getFullYear();
        const yearOffset = Math.floor((resolvedSem - 1) / 2);
        const entryYear = startYear - yearOffset;
        const batch = `${entryYear}-${String(entryYear + 4).slice(-2)}`;

        if (!targetClass) {
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

        // Match Class Teacher
        const teacherName = metadata.classTeacher || pageInfo.detectedTeacher;
        if (teacherName && !targetClass.classTeacherId) {
          const normTeacher = normalizeFacultyName(teacherName);
          const matchedFac = deptFaculty.find(f => normalizeFacultyName(f.name) === normTeacher)
            || allFaculty.find(f => normalizeFacultyName(f.name) === normTeacher);
          if (matchedFac) {
            targetClass.classTeacherId = matchedFac._id;
          }
        }

        // Map and resolve subjects
        const rows = parsedData.rows || [];
        const subjectsToCommit = [];
        for (const r of rows) {
          const cleanSubjectName = (r.subjectName || r.subjectCode || '').replace(/^[\s\-–—:]+/, '').trim();
          let resolvedSubjectId = r.subjectId;
          if (!resolvedSubjectId && r.subjectCode) {
            let sub = await Subject.findOne({ code: r.subjectCode.toUpperCase() });
            if (!sub) {
              sub = await Subject.create({
                code: r.subjectCode.toUpperCase(),
                name: cleanSubjectName,
                semester: resolvedSem,
                departmentId: deptId,
                isActive: true,
              });
            }
            resolvedSubjectId = sub._id;
          }

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

        targetClass.subjectAssignments = subjectsToCommit.map(s => ({
          subjectId: s.subjectId,
          subjectName: s.subjectName,
          subjectCode: s.subjectCode,
          facultyId: s.facultyId,
          facultyName: s.facultyName,
        }));
        targetClass.semester = resolvedSem;
        targetClass.academicYear = academicYear;
        await targetClass.save();

        hydratedSemesters.add(resolvedSem);

        const matchedTeacherObj = targetClass.classTeacherId
          ? allFaculty.find(f => f._id.toString() === targetClass.classTeacherId?.toString())
          : null;

        provisionedSections.push({
          pageNumber: pageNum,
          classId: targetClass._id,
          name: targetClass.name,
          displayName: pageInfo.displayName || `${getAcademicYearRoman(resolvedSem)} ${targetClass.name}`,
          semester: resolvedSem,
          academicYear: targetClass.academicYear,
          subjectCount: subjectsToCommit.length,
          classTeacher: matchedTeacherObj ? {
            _id: matchedTeacherObj._id,
            name: matchedTeacherObj.name,
            email: matchedTeacherObj.email,
          } : null,
          detectedTeacher: teacherName || null,
        });
      } catch (pageErr) {
        logger.warn(`Failed to process page ${pageNum} in batch import`, { error: pageErr?.message });
      }
    }

    // Hydrate Master Curriculum (SSOT) for all affected semesters
    for (const sem of hydratedSemesters) {
      try {
        const semesterClasses = await Class.find({
          departmentId: deptId,
          semester: sem,
          isMaster: { $ne: true },
          isActive: true,
        }).lean();

        const uniqueSubjectsMap = new Map();
        for (const cls of semesterClasses) {
          for (const sub of (cls.subjectAssignments || [])) {
            const key = (sub.subjectCode || '').toUpperCase();
            if (key && !uniqueSubjectsMap.has(key)) {
              uniqueSubjectsMap.set(key, {
                subjectId: sub.subjectId,
                subjectCode: sub.subjectCode,
                subjectName: sub.subjectName,
                facultyId: null,
                facultyName: 'Unassigned',
                hours: 3,
                isElective: false,
                source: 'master_hydrate',
              });
            }
          }
        }

        const masterAssignments = Array.from(uniqueSubjectsMap.values());
        let masterCls = await Class.findOne({
          departmentId: deptId,
          semester: sem,
          isMaster: true,
          isActive: true,
        });

        if (masterCls) {
          masterCls.subjectAssignments = masterAssignments;
          await masterCls.save();
        } else {
          await Class.create({
            name: `Semester ${sem} Curriculum Master`,
            semester: sem,
            academicYear: '2026-27',
            departmentId: deptId,
            isMaster: true,
            isActive: true,
            subjectAssignments: masterAssignments,
          });
        }
      } catch (mErr) {
        logger.warn(`Failed to hydrate Master Curriculum for semester ${sem}`, { error: mErr?.message });
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        totalSections: pages.length,
        provisionedCount: provisionedSections.length,
        sections: provisionedSections,
        hydratedMasterSemesters: Array.from(hydratedSemesters),
      },
    });
  } catch (err) {
    next(err);
  }
}
