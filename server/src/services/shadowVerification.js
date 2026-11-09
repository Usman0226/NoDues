/**
 * shadowVerification.js — Shadow-Mode Comparison Engine
 * TRD Reference: TRD §5 Phase 4 (Steps 4.1 – 4.3), MON-2, NC-5, NC-6, NFR-5
 *
 * Rules:
 *   1. For any code path reading batch/semester/subject data, compute the old-style
 *      result alongside the new-style result.
 *   2. On mismatch, log at `warn` level with action: 'shadow_mismatch' and both values (MON-2).
 *   3. Always return the old-style result so live production output is 100% unaffected.
 *   4. Zero unhandled exceptions: shadow comparison errors must never interrupt the caller.
 */

import logger from '../utils/logger.js';

// In-memory shadow verification counters
const shadowMetrics = {
  totalComparisons: 0,
  mismatchesDetected: 0,
  mismatchesByType: {
    class_subjects: 0,
    student_semester: 0,
    faculty_snapshot: 0,
  },
  lastMismatchTimestamp: null,
};

/**
 * Returns a copy of the current shadow verification metrics
 * @returns {Object}
 */
export function getShadowMetrics() {
  return {
    ...shadowMetrics,
    mismatchesByType: { ...shadowMetrics.mismatchesByType },
  };
}

/**
 * Resets shadow metrics (used in test suites)
 */
export function resetShadowMetrics() {
  shadowMetrics.totalComparisons = 0;
  shadowMetrics.mismatchesDetected = 0;
  shadowMetrics.mismatchesByType.class_subjects = 0;
  shadowMetrics.mismatchesByType.student_semester = 0;
  shadowMetrics.mismatchesByType.faculty_snapshot = 0;
  shadowMetrics.lastMismatchTimestamp = null;
}

/**
 * Compares class subject assignments between legacy and new semesterSubjects
 * @param {Object} classDoc - Mongoose or lean Class document
 * @returns {Array} - The legacy cls.subjectAssignments unconditionally
 */
export function shadowCompareClassSubjects(classDoc) {
  if (!classDoc) return [];
  const oldSubjects = classDoc.subjectAssignments || [];

  try {
    shadowMetrics.totalComparisons++;

    // Only compare if new-style semesterSubjects exists on the document
    const semesterKey = String(classDoc.semester || 1);
    let newEntry = null;

    if (classDoc.semesterSubjects) {
      if (typeof classDoc.semesterSubjects.get === 'function') {
        newEntry = classDoc.semesterSubjects.get(semesterKey);
      } else {
        newEntry = classDoc.semesterSubjects[semesterKey];
      }
    }

    if (!newEntry || !Array.isArray(newEntry.subjects)) {
      // New structure not yet populated for this semester; not an active mismatch
      return oldSubjects;
    }

    const newSubjects = newEntry.subjects;

    // Normalization helper
    const normalize = (list) =>
      list
        .map((s) => ({
          subjectId: s.subjectId?.toString() || '',
          code: (s.subjectCode || '').trim().toUpperCase(),
          facultyId: s.facultyId?.toString() || '',
        }))
        .sort((a, b) => a.code.localeCompare(b.code) || a.subjectId.localeCompare(b.subjectId));

    const normOld = normalize(oldSubjects);
    const normNew = normalize(newSubjects);

    let mismatch = false;
    let mismatchReason = '';

    if (normOld.length !== normNew.length) {
      mismatch = true;
      mismatchReason = `Count mismatch: old=${normOld.length}, new=${normNew.length}`;
    } else {
      for (let i = 0; i < normOld.length; i++) {
        if (
          normOld[i].subjectId !== normNew[i].subjectId ||
          normOld[i].code !== normNew[i].code ||
          normOld[i].facultyId !== normNew[i].facultyId
        ) {
          mismatch = true;
          mismatchReason = `Subject mismatch at index ${i}: old=${JSON.stringify(normOld[i])}, new=${JSON.stringify(normNew[i])}`;
          break;
        }
      }
    }

    if (mismatch) {
      shadowMetrics.mismatchesDetected++;
      shadowMetrics.mismatchesByType.class_subjects++;
      shadowMetrics.lastMismatchTimestamp = new Date().toISOString();

      logger.warn('Shadow verification mismatch in class subjects', {
        action: 'shadow_mismatch',
        type: 'class_subjects',
        classId: classDoc._id?.toString(),
        className: classDoc.name,
        semester: classDoc.semester,
        mismatchReason,
        oldValue: normOld,
        newValue: normNew,
        timestamp: shadowMetrics.lastMismatchTimestamp,
      });
    }
  } catch (err) {
    // Failsafe: never interrupt live request on shadow logic failure
    logger.error('Error during shadow class subjects comparison', {
      action: 'shadow_error',
      error: err.message,
      classId: classDoc._id?.toString(),
    });
  }

  // Always return the legacy value
  return oldSubjects;
}

/**
 * Compares student semester between legacy student.semester and new student.currentSemester
 * @param {Object} studentDoc - Mongoose or lean Student document
 * @returns {number} - The legacy student.semester unconditionally
 */
export function shadowCompareStudentSemester(studentDoc) {
  if (!studentDoc) return null;
  const oldSemester = studentDoc.semester;

  try {
    shadowMetrics.totalComparisons++;

    // Only compare if currentSemester is defined on the student
    if (studentDoc.currentSemester !== undefined && studentDoc.currentSemester !== null) {
      const newSemester = studentDoc.currentSemester;

      if (oldSemester !== newSemester) {
        shadowMetrics.mismatchesDetected++;
        shadowMetrics.mismatchesByType.student_semester++;
        shadowMetrics.lastMismatchTimestamp = new Date().toISOString();

        logger.warn('Shadow verification mismatch in student semester', {
          action: 'shadow_mismatch',
          type: 'student_semester',
          studentId: studentDoc._id?.toString(),
          rollNo: studentDoc.rollNo,
          oldValue: oldSemester,
          newValue: newSemester,
          timestamp: shadowMetrics.lastMismatchTimestamp,
        });
      }
    }
  } catch (err) {
    logger.error('Error during shadow student semester comparison', {
      action: 'shadow_error',
      error: err.message,
      studentId: studentDoc._id?.toString(),
    });
  }

  return oldSemester;
}

/**
 * Compares faculty snapshot generated from old-style vs new-style class subjects
 * @param {Object} cls - Class document
 * @param {Array} oldSnapshot - Computed faculty snapshot using old data
 * @param {Array} newSnapshot - Computed faculty snapshot using new data
 * @returns {Array} - The oldSnapshot unconditionally
 */
export function shadowCompareFacultySnapshot(cls, oldSnapshot = [], newSnapshot = []) {
  try {
    shadowMetrics.totalComparisons++;

    const normalize = (list) =>
      list
        .map((f) => ({
          facultyId: f.facultyId?.toString() || '',
          subjectId: f.subjectId?.toString() || '',
          type: f.type || 'subject',
        }))
        .sort((a, b) => a.facultyId.localeCompare(b.facultyId) || a.subjectId.localeCompare(b.subjectId));

    const normOld = normalize(oldSnapshot);
    const normNew = normalize(newSnapshot);

    let mismatch = false;
    let mismatchReason = '';

    if (normOld.length !== normNew.length) {
      mismatch = true;
      mismatchReason = `Snapshot count mismatch: old=${normOld.length}, new=${normNew.length}`;
    } else {
      for (let i = 0; i < normOld.length; i++) {
        if (
          normOld[i].facultyId !== normNew[i].facultyId ||
          normOld[i].subjectId !== normNew[i].subjectId ||
          normOld[i].type !== normNew[i].type
        ) {
          mismatch = true;
          mismatchReason = `Faculty snapshot entry mismatch at ${i}: old=${JSON.stringify(normOld[i])}, new=${JSON.stringify(normNew[i])}`;
          break;
        }
      }
    }

    if (mismatch) {
      shadowMetrics.mismatchesDetected++;
      shadowMetrics.mismatchesByType.faculty_snapshot++;
      shadowMetrics.lastMismatchTimestamp = new Date().toISOString();

      logger.warn('Shadow verification mismatch in faculty snapshot', {
        action: 'shadow_mismatch',
        type: 'faculty_snapshot',
        classId: cls._id?.toString(),
        className: cls.name,
        mismatchReason,
        oldValue: normOld,
        newValue: normNew,
        timestamp: shadowMetrics.lastMismatchTimestamp,
      });
    }
  } catch (err) {
    logger.error('Error during shadow faculty snapshot comparison', {
      action: 'shadow_error',
      error: err.message,
      classId: cls?._id?.toString(),
    });
  }

  return oldSnapshot;
}
