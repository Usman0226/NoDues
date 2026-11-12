import mongoose from 'mongoose';
import TimetableUpload from '../models/TimetableUpload.js';
import Class from '../models/Class.js';
import Subject from '../models/Subject.js';
import Faculty from '../models/Faculty.js';
import Department from '../models/Department.js';
import Admin from '../models/Admin.js';
import {
  parseTimetablePdf,
  parseTimetablePageFromText,
  inspectPdfPages,
  normalizeFacultyName,
  extractClassMetadataFromText,
} from '../services/timetableParser.js';
import { PDFParse } from 'pdf-parse';
import logger from '../utils/logger.js';
import { invalidateEntityCache } from '../utils/cacheHooks.js';
import {
  findActiveMatchingClass,
  withClassLock,
  buildClassLockKey,
  normalizeSectionKey,
  stripRomanPrefix,
} from '../utils/classIdentity.js';

const ROMAN_YEARS = { 1: 'I', 2: 'I', 3: 'II', 4: 'II', 5: 'III', 6: 'III', 7: 'IV', 8: 'IV' };
const getAcademicYearRoman = (sem) => ROMAN_YEARS[sem] || 'I';

const matchFacultyFromList = (allFacs, rawName, departmentId) => {
  if (!rawName || !Array.isArray(allFacs)) return null;
  const normName = normalizeFacultyName(rawName);
  if (!normName) return null;
  return (
    allFacs.find(
      (f) =>
        departmentId &&
        f.departmentId?.toString() === departmentId.toString() &&
        normalizeFacultyName(f.name) === normName
    ) ||
    allFacs.find((f) => normalizeFacultyName(f.name) === normName) ||
    null
  );
};

async function matchFacultyByName(rawName, departmentId) {
  if (!rawName) return null;
  const allFacs = await Faculty.find({ isActive: true }).select('_id name email employeeId departmentId').lean();
  return matchFacultyFromList(allFacs, rawName, departmentId);
}

async function resolveOrCreateActiveClassLocked({ name, semester, academicYear, departmentId, classTeacherId }) {
  const lockKey = buildClassLockKey({ departmentId, semester, name });
  return withClassLock(lockKey, async () => {
    let cls = await findActiveMatchingClass({ name, semester, departmentId });
    if (!cls) {
      cls = await Class.create({
        name: String(name).trim(),
        semester: Number(semester) || 1,
        academicYear: academicYear || '2026-27',
        departmentId,
        classTeacherId: classTeacherId || null,
        isActive: true,
        subjectAssignments: [],
      });
    }
    return cls;
  });
}

async function acquireSortedLocks(lockKeys, fn) {
  const sorted = Array.from(new Set(lockKeys.filter(Boolean))).sort();
  if (sorted.length === 0) return fn();
  let runner = fn;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const key = sorted[i];
    const nextRunner = runner;
    runner = () => withClassLock(key, nextRunner);
  }
  return runner();
}

/**
 * Resolves and upserts all active subjects across one or more section payloads
 * using batched lookup + single bulkWrite instead of sequential N+1 queries.
 */
async function bulkUpsertSubjects(sectionPayloads) {
  const uniqueDefs = new Map();
  for (const sec of sectionPayloads) {
    const sem = Number(sec.semester) || 1;
    for (const row of (sec.rows || []).filter((r) => r.status !== 'excluded')) {
      const upperCode = (row.subjectCode || '').toUpperCase().trim();
      if (!upperCode) continue;
      const cleanName = (row.subjectName || upperCode).replace(/^[\s\-–—:]+/, '').trim();
      const prev = uniqueDefs.get(upperCode);
      uniqueDefs.set(upperCode, {
        code: upperCode,
        name: cleanName && cleanName.toUpperCase() !== upperCode ? cleanName : prev?.name || upperCode,
        semester: prev?.semester || sem,
        isElective: Boolean(prev?.isElective || row.isElective),
      });
    }
  }

  const codes = Array.from(uniqueDefs.keys());
  if (codes.length === 0) return new Map();

  const existingSubs = await Subject.find({ code: { $in: codes } })
    .select('_id code name semester isElective isActive')
    .lean();
  const existingByCode = new Map(existingSubs.map((s) => [s.code.toUpperCase(), s]));

  const bulkOps = [];
  for (const [code, def] of uniqueDefs.entries()) {
    const existing = existingByCode.get(code);
    if (!existing) {
      bulkOps.push({
        updateOne: {
          filter: { code },
          update: {
            $setOnInsert: {
              code,
              name: def.name || code,
              semester: def.semester,
              isElective: def.isElective,
              isActive: true,
            },
          },
          upsert: true,
        },
      });
    } else {
      const updates = {};
      const storedUpper = (existing.name || '').trim().toUpperCase();
      const isTruncatedStored =
        storedUpper === code || storedUpper.startsWith(`${code} `);
      if (isTruncatedStored && def.name && def.name.toUpperCase() !== code) {
        updates.name = def.name;
      }
      if (def.isElective && !existing.isElective) {
        updates.isElective = true;
      }
      if (existing.isActive === false) {
        updates.isActive = true;
      }
      if (Object.keys(updates).length > 0) {
        bulkOps.push({
          updateOne: {
            filter: { _id: existing._id },
            update: { $set: updates },
          },
        });
      }
    }
  }

  if (bulkOps.length > 0) {
    await Subject.bulkWrite(bulkOps, { ordered: false });
    invalidateEntityCache('subject', 'all');
  }

  const finalSubs = await Subject.find({ code: { $in: codes } })
    .select('_id code name semester isElective')
    .lean();
  return new Map(finalSubs.map((s) => [s.code.toUpperCase(), s]));
}

function buildSubjectsToCommitFromMap(rows, subjectMap) {
  const out = [];
  const seenCodes = new Set();
  for (const r of (rows || []).filter((row) => row.status !== 'excluded')) {
    const upperCode = (r.subjectCode || '').toUpperCase().trim();
    const subjectDoc = upperCode ? subjectMap.get(upperCode) : null;
    const resolvedSubjectId = r.subjectId || subjectDoc?._id;
    if (!resolvedSubjectId) continue;

    // Avoid duplicate rows for same code+faculty if somehow duplicated in input
    const dedupKey = `${upperCode || resolvedSubjectId}::${r.facultyId || ''}`;
    if (seenCodes.has(dedupKey)) continue;
    seenCodes.add(dedupKey);

    const cleanSubjectName = (r.subjectName || subjectDoc?.name || r.subjectCode || '')
      .replace(/^[\s\-–—:]+/, '')
      .trim();

    out.push({
      subjectId: resolvedSubjectId,
      subjectName: cleanSubjectName || r.subjectCode,
      subjectCode: upperCode || r.subjectCode,
      isElective: Boolean(r.isElective || subjectDoc?.isElective),
      facultyId: r.facultyId || null,
      facultyName: r.facultyName || null,
      coFacultyIds: r.coFacultyIds || [],
      source: 'timetable_parse',
    });
  }
  return out;
}

const resolveUploaderInfo = async (req) => {
  let uploaderId = req.user?._id || req.user?.userId || req.user?.id;
  if (!uploaderId) {
    const adminDoc = await Admin.findOne().select('_id').lean();
    uploaderId = adminDoc?._id;
  }
  const uploaderModel = (req.user?.role === 'admin' || req.user?.role === 'Admin') ? 'Admin' : 'Faculty';
  return { uploaderId, uploaderModel };
};

const matchDeptFromCodeOrName = (departments, rawDept) => {
  if (!rawDept || !Array.isArray(departments)) return null;
  const clean = String(rawDept).trim().toUpperCase();
  return (
    departments.find((d) => (d.code || '').toUpperCase() === clean) ||
    departments.find((d) => (d.name || '').toUpperCase().includes(clean)) ||
    null
  );
};

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
      targetClass = await Class.findOne({ _id: classId, isActive: { $ne: false } }).lean();
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
    const previewOnly = req.body.previewOnly === 'true' || req.body.previewOnly === true;
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
      targetClass = await Class.findOne({ _id: classId, isActive: { $ne: false } });
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

    let resolvedSem = requestedSem || metadata.detectedSemester || 1;
    let detectedClsName = metadata.detectedClassName || req.body.className || 'Section A';
    let resolvedAcademicYear = metadata.academicYear || metadata.detectedAcademicYear || '2026-27';
    let matchedTeacher = null;

    if (!targetClass) {
      if (previewOnly) {
        // Non-mutating lookup so browsing PDF sections never pollutes live Classes DB
        targetClass = await findActiveMatchingClass({
          name: detectedClsName,
          semester: resolvedSem,
          departmentId: deptId,
        });
        if (!targetClass?.classTeacherId && metadata.classTeacher) {
          matchedTeacher = await matchFacultyByName(metadata.classTeacher, deptId);
        }
      } else {
        targetClass = await resolveOrCreateActiveClassLocked({
          name: detectedClsName,
          semester: resolvedSem,
          academicYear: resolvedAcademicYear,
          departmentId: deptId,
        });
      }
    }

    if (targetClass) {
      resolvedSem = targetClass.semester || resolvedSem;
      detectedClsName = targetClass.name || detectedClsName;
      resolvedAcademicYear = targetClass.academicYear || resolvedAcademicYear;
      deptId = targetClass.departmentId || deptId;

      if (!previewOnly && !targetClass.classTeacherId && metadata.classTeacher) {
        const matched = await matchFacultyByName(metadata.classTeacher, deptId);
        if (matched) {
          targetClass.classTeacherId = matched._id;
          await targetClass.save();
        }
      }

      if (targetClass.classTeacherId) {
        await targetClass.populate('classTeacherId', 'name email employeeId');
      }
    }

    const teacherOutput = targetClass?.classTeacherId
      ? {
          _id: targetClass.classTeacherId._id || targetClass.classTeacherId,
          name: targetClass.classTeacherId.name,
          email: targetClass.classTeacherId.email,
        }
      : matchedTeacher
      ? {
          _id: matchedTeacher._id,
          name: matchedTeacher.name,
          email: matchedTeacher.email,
        }
      : null;

    // Resolve uploader defensively
    let uploaderId = req.user?._id || req.user?.userId || req.user?.id;
    if (!uploaderId) {
      const adminDoc = await Admin.findOne().lean();
      uploaderId = adminDoc?._id;
    }
    const uploaderModel = (req.user?.role === 'admin' || req.user?.role === 'Admin') ? 'Admin' : 'Faculty';

    // Create an audit record for this upload (MON-4)
    const uploadRecord = await TimetableUpload.create({
      classId: targetClass?._id || null,
      targetSemester: resolvedSem,
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
        classId: targetClass?._id || null,
        existingClassFound: Boolean(targetClass),
        className: detectedClsName,
        targetSemester: resolvedSem,
        academicYear: resolvedAcademicYear,
        departmentId: deptId,
        classTeacher: teacherOutput,
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
    const {
      uploadId,
      classId,
      className,
      academicYear,
      departmentId,
      targetSemester,
      confirmedRows,
      classTeacherId,
    } = req.body;

    if ((!classId && !className?.trim()) || !targetSemester || !Array.isArray(confirmedRows)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'classId (or className), targetSemester, and confirmedRows array are required.',
        },
      });
    }

    const targetSem = parseInt(targetSemester, 10);
    let deptId = departmentId || req.user?.departmentId || req.user?.department?._id || req.user?.department;
    if (!deptId) {
      const anyDept = await Department.findOne({ isActive: true }).select('_id').lean();
      if (anyDept) deptId = anyDept._id;
    }

    let targetClass;
    if (classId) {
      targetClass = await Class.findById(classId);
      if (!targetClass) {
        return res.status(404).json({
          success: false,
          error: { code: 'DB_002', message: 'Class not found.' },
        });
      }
      if (className && className.trim() !== targetClass.name) {
        const collision = await findActiveMatchingClass({
          name: className.trim(),
          semester: targetSem,
          departmentId: targetClass.departmentId,
          excludeClassId: targetClass._id,
        });
        if (collision) {
          return res.status(409).json({
            success: false,
            error: {
              code: 'DB_003',
              message: `Section "${collision.name}" for Semester ${targetSem} already exists in this department.`,
            },
          });
        }
        targetClass.name = className.trim();
      }
    } else {
      targetClass = await resolveOrCreateActiveClassLocked({
        name: className.trim(),
        semester: targetSem,
        academicYear: academicYear || '2026-27',
        departmentId: deptId,
        classTeacherId: classTeacherId || null,
      });
    }

    if (targetClass.isActive === false) {
      targetClass.isActive = true;
    }
    if (academicYear) {
      targetClass.academicYear = academicYear;
    }
    if (classTeacherId !== undefined) {
      targetClass.classTeacherId = classTeacherId || null;
    }

    // Verify upload audit record if provided
    let uploadDoc = null;
    if (uploadId) {
      uploadDoc = await TimetableUpload.findById(uploadId);
    }

    // Batch-resolve all active Subject documents without N+1 queries
    const subjectMap = await bulkUpsertSubjects([{ semester: targetSem, rows: confirmedRows }]);
    const subjectsToCommit = buildSubjectsToCommitFromMap(confirmedRows, subjectMap);

    // Archive previous semester entries if present (FR-B3)
    if (!targetClass.semesterSubjects) {
      targetClass.semesterSubjects = new Map();
    }

    for (const [, semEntry] of targetClass.semesterSubjects.entries()) {
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
    targetClass.subjectAssignments = subjectsToCommit.map((s) => ({
      subjectId: s.subjectId,
      subjectName: s.subjectName,
      subjectCode: s.subjectCode,
      isElective: s.isElective,
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
    targetClass.wizardProgress.lastUpdated = new Date();

    await targetClass.save();
    if (targetClass.classTeacherId) {
      await targetClass.populate('classTeacherId', 'name email employeeId');
    }

    // Auto-propagate cohort syllabus: peer classes in the same department & semester with 0 subjects inherit the subject list
    const inheritedForPeers = subjectsToCommit.map((s) => ({
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

    // Mark upload record as committed and link to finalized classId
    if (uploadDoc) {
      uploadDoc.classId = targetClass._id;
      uploadDoc.committed = true;
      uploadDoc.committedAt = new Date();
      await uploadDoc.save();
    }

    invalidateEntityCache('class', targetClass._id.toString(), targetClass.departmentId?.toString());
    invalidateEntityCache('class', 'all', targetClass.departmentId?.toString());

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

async function resolveSectionSpecsFromInputs({
  sectionSpecs,
  pdfBuffer,
  fallbackDeptId,
  allFaculties,
  allSubjects,
  departments,
  scopedHodDeptId,
}) {
  const needsPdfParse = sectionSpecs.some((s) => !Array.isArray(s.confirmedRows) || s.confirmedRows.length === 0);
  const pageTextMap = new Map();
  let pdfTotalPages = 1;

  if (needsPdfParse) {
    if (!pdfBuffer) {
      const error = new Error('Timetable PDF buffer is required when unpreviewed pages are included.');
      error.code = 'VAL_001';
      error.statusCode = 400;
      throw error;
    }
    const parser = new PDFParse({ data: pdfBuffer });
    const textResult = await parser.getText();
    const rawPages = textResult?.pages || [];
    pdfTotalPages = textResult?.total || rawPages.length || 1;
    for (let i = 0; i < rawPages.length; i++) {
      const p = rawPages[i];
      pageTextMap.set(p.num || i + 1, (p.text || '').trim());
    }
    if (pageTextMap.size === 0 && textResult?.text) {
      pageTextMap.set(1, String(textResult.text).trim());
    }
  }

  const defaultDept = departments[0]?._id || null;
  const resolvedSections = [];
  const skippedPages = [];

  for (const spec of sectionSpecs) {
    const pageNum = spec.pageNumber ? Number(spec.pageNumber) : null;
    const hasConfirmedRows = Array.isArray(spec.confirmedRows) && spec.confirmedRows.length > 0;

    if (hasConfirmedRows) {
      const deptId = scopedHodDeptId || spec.departmentId || fallbackDeptId || defaultDept;
      const sem = Number(spec.semester || spec.targetSemester) || 1;
      const clsName = String(spec.className || '').trim() || `Section ${pageNum || resolvedSections.length + 1}`;
      resolvedSections.push({
        pageNumber: pageNum,
        classId: spec.classId || null,
        className: clsName,
        displayName: spec.displayName || `${getAcademicYearRoman(sem)} ${stripRomanPrefix(clsName)}`,
        semester: sem,
        academicYear: String(spec.academicYear || '2026-27').trim(),
        departmentId: deptId,
        classTeacherId: spec.classTeacherId || null,
        detectedTeacher: spec.detectedTeacher || null,
        uploadId: spec.uploadId || null,
        rows: spec.confirmedRows,
        parsedRowCount: spec.confirmedRows.length,
      });
      continue;
    }

    const pageText = pageTextMap.get(pageNum) || '';
    const pageMeta = extractClassMetadataFromText(pageText);
    const matchedDeptObj = matchDeptFromCodeOrName(departments, pageMeta.detectedDepartment);
    const deptId = scopedHodDeptId || spec.departmentId || matchedDeptObj?._id || fallbackDeptId || defaultDept;

    try {
      const parsed = parseTimetablePageFromText(pageText, {
        pageNumber: pageNum || 1,
        pageCount: pdfTotalPages,
        isMultiPage: pdfTotalPages > 1,
        allFaculties,
        allSubjects,
        departmentId: deptId,
      });
      const meta = parsed.metadata || {};
      const sem = Number(spec.semester || spec.targetSemester || meta.detectedSemester) || 1;
      const clsName =
        String(spec.className || meta.detectedClassName || '').trim() || `Section ${pageNum || 1}`;
      const teacherName = spec.detectedTeacher || meta.classTeacher || pageMeta.detectedTeacher || null;
      const matchedTeacher = spec.classTeacherId
        ? allFaculties.find((f) => f._id.toString() === String(spec.classTeacherId))
        : matchFacultyFromList(allFaculties, teacherName, deptId);

      resolvedSections.push({
        pageNumber: pageNum,
        classId: spec.classId || null,
        className: clsName,
        displayName: spec.displayName || meta.displayName || `${getAcademicYearRoman(sem)} ${stripRomanPrefix(clsName)}`,
        semester: sem,
        academicYear: String(spec.academicYear || meta.academicYear || '2026-27').trim(),
        departmentId: deptId,
        classTeacherId: spec.classTeacherId || matchedTeacher?._id || null,
        detectedTeacher: teacherName,
        uploadId: null,
        rows: parsed.rows,
        parsedRowCount: parsed.parsedRowCount,
      });
    } catch (pageErr) {
      skippedPages.push({
        pageNumber: pageNum,
        reason: pageErr?.message || 'No extractable timetable curriculum on page.',
      });
    }
  }

  return { resolvedSections, skippedPages };
}

function dedupeCanonicalSections(sections) {
  const byKey = new Map();
  for (const sec of sections) {
    const key = `${sec.departmentId?.toString() || 'none'}::${sec.semester}::${normalizeSectionKey(sec.className)}`;
    byKey.set(key, sec);
  }
  return Array.from(byKey.values());
}

async function executeBulkTimetableProvisioning({
  sectionSpecs,
  pdfBuffer,
  originalFileName,
  uploaderId,
  uploaderModel,
  fallbackDeptId,
  scopedHodDeptId,
}) {
  const [allFaculties, allSubjects, departments] = await Promise.all([
    Faculty.find({ isActive: true }).select('_id name email employeeId departmentId').lean(),
    Subject.find({ isActive: true }).select('_id name code semester isElective').lean(),
    Department.find({ isActive: true }).select('_id name code').lean(),
  ]);

  const { resolvedSections: rawResolved, skippedPages } = await resolveSectionSpecsFromInputs({
    sectionSpecs,
    pdfBuffer,
    fallbackDeptId,
    allFaculties,
    allSubjects,
    departments,
    scopedHodDeptId,
  });

  if (rawResolved.length === 0) {
    const error = new Error(
      skippedPages[0]?.reason || 'No valid timetable curriculum rows were extracted from the selected pages.'
    );
    error.code = 'VAL_001';
    error.statusCode = 400;
    throw error;
  }

  const dedupedSections = dedupeCanonicalSections(rawResolved);
  const lockKeys = dedupedSections.map((s) =>
    buildClassLockKey({ departmentId: s.departmentId, semester: s.semester, name: s.className })
  );

  return acquireSortedLocks(lockKeys, async () => {
    const now = new Date();
    const deptIds = Array.from(
      new Set(dedupedSections.map((s) => s.departmentId?.toString()).filter(Boolean))
    );
    const explicitClassIds = dedupedSections.map((s) => s.classId).filter(Boolean);

    const existingQuery = {
      isMaster: { $ne: true },
      $or: [
        { departmentId: { $in: deptIds }, isActive: true },
        ...(explicitClassIds.length > 0 ? [{ _id: { $in: explicitClassIds } }] : []),
      ],
    };

    const [existingClasses, subjectMap] = await Promise.all([
      Class.find(existingQuery).lean(),
      bulkUpsertSubjects(dedupedSections),
    ]);

    const existingById = new Map(existingClasses.map((c) => [c._id.toString(), c]));
    const existingByCanonical = new Map();
    for (const cls of existingClasses) {
      if (cls.isActive === false) continue;
      const key = `${cls.departmentId?.toString()}::${cls.semester}::${normalizeSectionKey(cls.name)}`;
      if (!existingByCanonical.has(key)) existingByCanonical.set(key, cls);
    }

    const facultyById = new Map(allFaculties.map((f) => [f._id.toString(), f]));
    const classBulkOps = [];
    const committedClassIds = new Set();
    const cohortMap = new Map();
    const auditDocs = [];
    const uploadIdsToCommit = [];
    const provisionedSections = [];

    for (const sec of dedupedSections) {
      const deptKey = sec.departmentId?.toString();
      const canonicalKey = `${deptKey}::${sec.semester}::${normalizeSectionKey(sec.className)}`;
      const matchedExisting =
        (sec.classId ? existingById.get(String(sec.classId)) : null) ||
        existingByCanonical.get(canonicalKey) ||
        null;

      const subjectsToCommit = buildSubjectsToCommitFromMap(sec.rows, subjectMap);
      if (subjectsToCommit.length === 0) {
        skippedPages.push({
          pageNumber: sec.pageNumber,
          reason: `No active subjects selected for ${sec.displayName}.`,
        });
        continue;
      }

      const assignments = subjectsToCommit.map((s) => ({
        subjectId: s.subjectId,
        subjectName: s.subjectName,
        subjectCode: s.subjectCode,
        isElective: s.isElective,
        facultyId: s.facultyId,
        facultyName: s.facultyName,
      }));

      const targetId = matchedExisting ? matchedExisting._id : new mongoose.Types.ObjectId();
      const finalClassTeacherId =
        sec.classTeacherId || matchedExisting?.classTeacherId || null;
      const unmatchedFacultyCount = subjectsToCommit.filter((s) => !s.facultyId).length;
      const matchedFacultyCount = subjectsToCommit.length - unmatchedFacultyCount;

      const existingCompleted = new Set(matchedExisting?.wizardProgress?.completedSteps || []);
      existingCompleted.add('class_info');
      existingCompleted.add('timetable_subjects');

      const nextStep = existingCompleted.has('initiation')
        ? 'initiation'
        : existingCompleted.has('preflight')
        ? 'preflight'
        : existingCompleted.has('electives')
        ? 'preflight'
        : existingCompleted.has('mentors')
        ? 'electives'
        : existingCompleted.has('students')
        ? 'mentors'
        : 'students';

      const prevStepData = matchedExisting?.wizardProgress?.stepData || {};
      const nextStepData = {
        ...prevStepData,
        class_info: {
          ...(prevStepData.class_info || {}),
          name: sec.className,
          semester: sec.semester,
          subjectsConfigured: true,
          detectedTeacher: sec.detectedTeacher || null,
          unmatchedFacultyCount,
          bulkProvisionedAt: now,
        },
        timetable_subjects: {
          ...(prevStepData.timetable_subjects || {}),
          subjectsConfigured: true,
          subjectCount: subjectsToCommit.length,
          updatedAt: now,
        },
      };

      const semKey = String(sec.semester);
      if (matchedExisting) {
        const updateSet = {
          name: sec.className,
          semester: sec.semester,
          academicYear: sec.academicYear,
          departmentId: sec.departmentId,
          classTeacherId: finalClassTeacherId,
          subjectAssignments: assignments,
          isActive: true,
          wizardProgress: {
            currentStep: nextStep,
            completedSteps: Array.from(existingCompleted),
            stepData: nextStepData,
            lastUpdated: now,
          },
          [`semesterSubjects.${semKey}`]: {
            subjects: subjectsToCommit,
            status: 'active',
            setAt: now,
            archivedAt: null,
          },
          updatedAt: now,
        };

        const oldSemMap = matchedExisting.semesterSubjects || {};
        const oldEntries = oldSemMap instanceof Map ? Array.from(oldSemMap.entries()) : Object.entries(oldSemMap);
        for (const [k, entry] of oldEntries) {
          if (k !== semKey && entry?.status === 'active') {
            updateSet[`semesterSubjects.${k}.status`] = 'archived';
            updateSet[`semesterSubjects.${k}.archivedAt`] = now;
          }
        }

        classBulkOps.push({
          updateOne: {
            filter: { _id: targetId },
            update: { $set: updateSet },
          },
        });
      } else {
        classBulkOps.push({
          insertOne: {
            document: {
              _id: targetId,
              name: sec.className,
              semester: sec.semester,
              academicYear: sec.academicYear,
              departmentId: sec.departmentId,
              classTeacherId: finalClassTeacherId,
              subjectAssignments: assignments,
              studentIds: [],
              isActive: true,
              isMaster: false,
              semesterSubjects: {
                [semKey]: {
                  subjects: subjectsToCommit,
                  status: 'active',
                  setAt: now,
                  archivedAt: null,
                },
              },
              wizardProgress: {
                currentStep: 'students',
                completedSteps: ['class_info', 'timetable_subjects'],
                stepData: nextStepData,
                lastUpdated: now,
              },
              createdAt: now,
              updatedAt: now,
            },
          },
        });
      }

      committedClassIds.add(targetId.toString());

      const cohortKey = `${deptKey}::${sec.semester}`;
      if (!cohortMap.has(cohortKey)) {
        cohortMap.set(cohortKey, {
          departmentId: sec.departmentId,
          semester: sec.semester,
          academicYear: sec.academicYear,
          subjects: subjectsToCommit,
        });
      } else {
        // Merge subjects across sections of same semester in cohort
        cohortMap.get(cohortKey).subjects.push(...subjectsToCommit);
      }

      if (sec.uploadId && mongoose.Types.ObjectId.isValid(sec.uploadId)) {
        uploadIdsToCommit.push({ uploadId: sec.uploadId, classId: targetId });
      } else if (uploaderId) {
        auditDocs.push({
          classId: targetId,
          targetSemester: sec.semester,
          uploadedBy: uploaderId,
          uploaderModel,
          originalFileName: originalFileName || 'timetable.pdf',
          parsedRowCount: sec.parsedRowCount || subjectsToCommit.length,
          matchedRowCount: matchedFacultyCount,
          flaggedRowCount: unmatchedFacultyCount,
          committed: true,
          committedAt: now,
          parsedData: {
            selectedPage: sec.pageNumber || 1,
            rows: subjectsToCommit,
          },
        });
      }

      const ctObj = finalClassTeacherId ? facultyById.get(finalClassTeacherId.toString()) : null;
      provisionedSections.push({
        pageNumber: sec.pageNumber,
        classId: targetId.toString(),
        _id: targetId.toString(),
        name: sec.className,
        displayName: sec.displayName,
        semester: sec.semester,
        academicYear: sec.academicYear,
        departmentId: deptKey,
        subjectCount: subjectsToCommit.length,
        matchedFacultyCount,
        unmatchedFacultyCount,
        classTeacher: ctObj
          ? { _id: ctObj._id, name: ctObj.name, email: ctObj.email }
          : null,
        detectedTeacher: sec.detectedTeacher || null,
        isNew: !matchedExisting,
      });
    }

    if (classBulkOps.length === 0) {
      const error = new Error('No sections with active subjects remained to provision.');
      error.code = 'VAL_001';
      error.statusCode = 400;
      throw error;
    }

    await Class.bulkWrite(classBulkOps, { ordered: true });

    // Peer empty class inheritance + Master Curriculum SSOT bulk hydration
    const cohortValues = Array.from(cohortMap.values());
    const cohortSemesters = Array.from(new Set(cohortValues.map((c) => c.semester)));

    const [allCohortNonMasterClasses, existingMasterClasses] = await Promise.all([
      Class.find({
        departmentId: { $in: deptIds },
        semester: { $in: cohortSemesters },
        isMaster: { $ne: true },
        isActive: true,
      })
        .select('departmentId semester subjectAssignments')
        .lean(),
      Class.find({
        departmentId: { $in: deptIds },
        semester: { $in: cohortSemesters },
        isMaster: true,
        isActive: true,
      }).lean(),
    ]);

    const masterByCohort = new Map(
      existingMasterClasses.map((m) => [`${m.departmentId?.toString()}::${m.semester}`, m])
    );
    const peerBulkOps = [];
    const masterBulkOps = [];
    const committedObjectIds = Array.from(committedClassIds).map((id) => new mongoose.Types.ObjectId(id));

    for (const cohort of cohortValues) {
      const cKey = `${cohort.departmentId?.toString()}::${cohort.semester}`;
      const uniqueSubMap = new Map();

      const registerMasterSub = (sub) => {
        const code = (sub.subjectCode || '').toUpperCase().trim();
        if (!code) return;
        const prev = uniqueSubMap.get(code);
        uniqueSubMap.set(code, {
          subjectId: sub.subjectId,
          subjectCode: sub.subjectCode || code,
          subjectName: sub.subjectName || code,
          facultyId: null,
          facultyName: null,
          isElective: Boolean(prev?.isElective || sub.isElective),
        });
      };

      const existingMaster = masterByCohort.get(cKey);
      for (const s of existingMaster?.subjectAssignments || []) registerMasterSub(s);
      for (const cls of allCohortNonMasterClasses) {
        if (cls.departmentId?.toString() === cohort.departmentId?.toString() && Number(cls.semester) === Number(cohort.semester)) {
          for (const s of cls.subjectAssignments || []) registerMasterSub(s);
        }
      }
      for (const s of cohort.subjects) registerMasterSub(s);

      const masterAssignments = Array.from(uniqueSubMap.values());
      if (masterAssignments.length > 0) {
        peerBulkOps.push({
          updateMany: {
            filter: {
              departmentId: cohort.departmentId,
              semester: cohort.semester,
              _id: { $nin: committedObjectIds },
              isMaster: { $ne: true },
              isActive: true,
              $or: [
                { subjectAssignments: { $exists: false } },
                { subjectAssignments: { $size: 0 } },
              ],
            },
            update: {
              $set: {
                subjectAssignments: masterAssignments,
                updatedAt: now,
              },
            },
          },
        });

        if (existingMaster) {
          masterBulkOps.push({
            updateOne: {
              filter: { _id: existingMaster._id },
              update: {
                $set: {
                  subjectAssignments: masterAssignments,
                  updatedAt: now,
                },
              },
            },
          });
        } else {
          masterBulkOps.push({
            insertOne: {
              document: {
                departmentId: cohort.departmentId,
                semester: cohort.semester,
                name: `Semester ${cohort.semester} Curriculum Master`,
                academicYear: cohort.academicYear || '2026-27',
                isMaster: true,
                isActive: true,
                subjectAssignments: masterAssignments,
                studentIds: [],
                createdAt: now,
                updatedAt: now,
              },
            },
          });
        }
      }
    }

    const secondaryWrites = [];
    if (peerBulkOps.length > 0) secondaryWrites.push(Class.bulkWrite(peerBulkOps, { ordered: false }));
    if (masterBulkOps.length > 0) secondaryWrites.push(Class.bulkWrite(masterBulkOps, { ordered: false }));
    if (auditDocs.length > 0) secondaryWrites.push(TimetableUpload.insertMany(auditDocs, { ordered: false }));
    if (uploadIdsToCommit.length > 0) {
      secondaryWrites.push(
        TimetableUpload.bulkWrite(
          uploadIdsToCommit.map((u) => ({
            updateOne: {
              filter: { _id: u.uploadId },
              update: { $set: { classId: u.classId, committed: true, committedAt: now } },
            },
          })),
          { ordered: false }
        )
      );
    }

    if (secondaryWrites.length > 0) {
      await Promise.all(secondaryWrites);
    }

    // Explicitly invalidate class & list caches since bulkWrite/updateMany bypass Mongoose document hooks
    for (const sec of provisionedSections) {
      invalidateEntityCache('class', sec.classId, sec.departmentId);
    }
    for (const dId of deptIds) {
      invalidateEntityCache('class', 'all', dId);
    }

    logger.info('Bulk timetable provisioning completed', {
      provisionedCount: provisionedSections.length,
      skippedCount: skippedPages.length,
      semesters: cohortSemesters,
      actor: uploaderId || null,
    });

    return {
      totalSections: sectionSpecs.length,
      provisionedCount: provisionedSections.length,
      sections: provisionedSections,
      skippedPages,
      hydratedMasterSemesters: cohortSemesters,
    };
  });
}

/**
 * Commits 1..N reviewed and/or unvisited PDF timetable sections in a single bulk pipeline.
 * Supports multipart FormData (with PDF file + JSON `sections`) or pure JSON `sections`.
 */
export async function bulkCommitTimetable(req, res, next) {
  try {
    let rawSections = req.body.sections;
    if (typeof rawSections === 'string') {
      try {
        rawSections = JSON.parse(rawSections);
      } catch {
        return res.status(400).json({
          success: false,
          error: { code: 'VAL_001', message: 'sections payload must be valid JSON.' },
        });
      }
    }

    if (!Array.isArray(rawSections) || rawSections.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VAL_001', message: 'sections array is required for bulk commit.' },
      });
    }

    const fallbackDeptId =
      req.body.defaultDepartmentId ||
      req.body.departmentId ||
      req.user?.departmentId ||
      req.user?.department?._id ||
      req.user?.department;
    const scopedHodDeptId =
      (req.user?.role === 'hod' || req.user?.role === 'ao') ? req.user?.departmentId : null;
    const { uploaderId, uploaderModel } = await resolveUploaderInfo(req);

    const result = await executeBulkTimetableProvisioning({
      sectionSpecs: rawSections,
      pdfBuffer: req.file?.buffer || null,
      originalFileName: req.file?.originalname || 'timetable.pdf',
      uploaderId,
      uploaderModel,
      fallbackDeptId,
      scopedHodDeptId,
    });

    return res.status(200).json({
      success: true,
      message: `Provisioned ${result.provisionedCount} sections with full curriculum.`,
      data: result,
    });
  } catch (err) {
    if (err.code === 'VAL_001' || err.statusCode === 400) {
      return res.status(400).json({
        success: false,
        error: { code: err.code || 'VAL_001', message: err.message },
      });
    }
    next(err);
  }
}

/**
 * Batch provisions all detected sections from a multi-page timetable PDF.
 * Delegates to executeBulkTimetableProvisioning for efficient single-pass DB bulk writes.
 */
export async function batchImportTimetable(req, res, next) {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        error: { code: 'VAL_001', message: 'Please upload a PDF timetable file.' },
      });
    }

    let overridesByPage = new Map();
    if (req.body.overrides) {
      try {
        const parsedOverrides =
          typeof req.body.overrides === 'string'
            ? JSON.parse(req.body.overrides)
            : req.body.overrides;
        if (Array.isArray(parsedOverrides)) {
          overridesByPage = new Map(
            parsedOverrides.map((ov) => [Number(ov.pageNumber), ov])
          );
        }
      } catch {
        // Ignore malformed overrides safely
      }
    }

    const fallbackDeptId =
      req.body.departmentId ||
      req.user?.departmentId ||
      req.user?.department?._id ||
      req.user?.department;
    const scopedHodDeptId =
      (req.user?.role === 'hod' || req.user?.role === 'ao') ? req.user?.departmentId : null;

    const inspection = await inspectPdfPages(req.file.buffer, {
      departmentId: scopedHodDeptId || fallbackDeptId,
    });
    const pages = inspection.data?.pages || [];
    if (pages.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VAL_001', message: 'No extractable pages found in timetable PDF.' },
      });
    }

    const sectionSpecs = pages.map((p) => {
      const ov = overridesByPage.get(Number(p.pageNumber));
      return ov ? { pageNumber: p.pageNumber, ...ov } : { pageNumber: p.pageNumber };
    });

    const { uploaderId, uploaderModel } = await resolveUploaderInfo(req);
    const result = await executeBulkTimetableProvisioning({
      sectionSpecs,
      pdfBuffer: req.file.buffer,
      originalFileName: req.file.originalname || 'timetable.pdf',
      uploaderId,
      uploaderModel,
      fallbackDeptId,
      scopedHodDeptId,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    if (err.code === 'VAL_001' || err.statusCode === 400) {
      return res.status(400).json({
        success: false,
        error: { code: err.code || 'VAL_001', message: err.message },
      });
    }
    next(err);
  }
}
