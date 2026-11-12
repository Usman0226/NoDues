/**
 * wizardService.js — Setup Wizard Logic & Verification Gate
 * TRD Reference: TRD §3.5 (FR-E1 to FR-E4), TRD §5 Phase 5 (Steps 5.1 – 5.6)
 *
 * Rules:
 *   1. Fixed step order: class_info -> timetable_subjects -> students -> mentors -> electives -> preflight -> initiation (FR-E1).
 *   2. Pre-flight checklist must pass before batch initiation is allowed (FR-E2).
 *   3. Progress persisted per class so admins can resume anytime (FR-E3).
 *   4. Standalone admin pages remain active in parallel (FR-E4).
 */

import Class from '../models/Class.js';
import Student from '../models/Student.js';
import ErrorResponse from '../utils/errorResponse.js';

export const WIZARD_STEPS = [
  'class_info',
  'timetable_subjects',
  'students',
  'mentors',
  'electives',
  'preflight',
  'initiation',
];

/**
 * Validates pre-flight checklist for a given class
 * Requirement: FR-E2 (students present, subjects present, class teacher assigned)
 *
 * @param {string} classId
 * @returns {Promise<Object>}
 */
export async function validatePreflightChecklist(classId) {
  const cls = await Class.findById(classId).lean();
  if (!cls || cls.isActive === false) {
    throw new ErrorResponse('Class not found', 404, 'NOT_FOUND');
  }

  // 1. Students present check
  const studentCount = await Student.countDocuments({
    classId: cls._id,
    isActive: { $ne: false },
  });

  // 2. Subjects present check (supports both persistent semesterSubjects and legacy subjectAssignments)
  const semesterKey = String(cls.semester || 1);
  const semEntry = cls.semesterSubjects instanceof Map
    ? cls.semesterSubjects.get(semesterKey)
    : cls.semesterSubjects?.[semesterKey];
  const newSubjectCount = (semEntry?.subjects || []).length;
  const legacySubjectCount = (cls.subjectAssignments || []).length;
  const subjectCount = newSubjectCount > 0 ? newSubjectCount : legacySubjectCount;

  // 3. Class teacher assigned check
  const hasClassTeacher = Boolean(cls.classTeacherId);

  const checks = {
    studentsPresent: {
      passed: studentCount > 0,
      count: studentCount,
      message: studentCount > 0 ? `${studentCount} students enrolled` : 'No students enrolled in this class',
    },
    subjectsPresent: {
      passed: subjectCount > 0,
      count: subjectCount,
      message: subjectCount > 0 ? `${subjectCount} subjects configured` : 'No subjects assigned for current semester',
    },
    classTeacherAssigned: {
      passed: hasClassTeacher,
      teacherId: cls.classTeacherId || null,
      message: hasClassTeacher ? 'Class teacher assigned' : 'No class teacher assigned',
    },
  };

  const readyForInitiation =
    checks.studentsPresent.passed &&
    checks.subjectsPresent.passed &&
    checks.classTeacherAssigned.passed;

  return {
    classId: cls._id,
    className: cls.name,
    semester: cls.semester,
    academicYear: cls.academicYear,
    readyForInitiation,
    checks,
  };
}

/**
 * Retrieves the persisted wizard progress for a class
 * Requirement: FR-E3
 *
 * @param {string} classId
 * @returns {Promise<Object>}
 */
export async function getWizardProgress(classId) {
  const cls = await Class.findById(classId).lean();
  if (!cls || cls.isActive === false) {
    throw new ErrorResponse('Class not found', 404, 'NOT_FOUND');
  }

  const progress = cls.wizardProgress || {
    currentStep: 'class_info',
    completedSteps: [],
    stepData: {},
    lastUpdated: cls.updatedAt || new Date(),
  };

  // Determine available next step
  const completedSet = new Set(progress.completedSteps || []);
  let nextStep = WIZARD_STEPS[0];

  for (const step of WIZARD_STEPS) {
    if (!completedSet.has(step)) {
      nextStep = step;
      break;
    }
  }

  return {
    classId: cls._id,
    className: cls.name,
    semester: cls.semester,
    currentStep: progress.currentStep || nextStep,
    nextStep,
    completedSteps: progress.completedSteps || [],
    stepData: progress.stepData || {},
    lastUpdated: progress.lastUpdated,
  };
}

/**
 * Saves and validates wizard progress for a class
 * Requirement: FR-E1 (order enforcement), FR-E3 (persistence)
 *
 * @param {string} classId
 * @param {Object} input
 * @param {string} input.step
 * @param {boolean} [input.markCompleted]
 * @param {Object} [input.data]
 * @returns {Promise<Object>}
 */
export async function saveWizardProgress(classId, { step, markCompleted = false, data = {} }) {
  if (!WIZARD_STEPS.includes(step)) {
    throw new ErrorResponse(
      `Invalid wizard step '${step}'. Must be one of: ${WIZARD_STEPS.join(', ')}`,
      400,
      'VALIDATION_ERROR'
    );
  }

  const cls = await Class.findById(classId);
  if (!cls || cls.isActive === false) {
    throw new ErrorResponse('Class not found', 404, 'NOT_FOUND');
  }

  const currentCompleted = cls.wizardProgress?.completedSteps || [];
  const completedSet = new Set(currentCompleted);
  const targetIndex = WIZARD_STEPS.indexOf(step);

  // FR-E1 Order Enforcement:
  // Cannot jump to step N unless all steps 0..(N-1) are completed (or this is class_info, step 0)
  // Exception: electives is conditional, but mentors and previous must be done
  // Unified Step 1 compatibility: timetable_subjects is satisfied if class_info is completed with subjects
  for (let i = 0; i < targetIndex; i++) {
    const requiredStep = WIZARD_STEPS[i];
    // Electives is conditional, so it can be skipped if class has no electives
    if (requiredStep === 'electives') continue;

    // In unified flow, completing class_info satisfies timetable_subjects check
    if (requiredStep === 'timetable_subjects' && completedSet.has('class_info')) continue;

    if (!completedSet.has(requiredStep) && cls.wizardProgress?.currentStep !== requiredStep) {
      throw new ErrorResponse(
        `FR-E1 Sequence Violation: Cannot proceed to '${step}' before completing preceding step '${requiredStep}'.`,
        400,
        'WIZARD_SEQUENCE_ERROR'
      );
    }
  }

  if (markCompleted && !completedSet.has(step)) {
    completedSet.add(step);
    if (step === 'class_info' && data.subjectsConfigured) {
      completedSet.add('timetable_subjects');
    }
  }

  const existingStepData = cls.wizardProgress?.stepData || {};
  const mergedStepData = {
    ...existingStepData,
    [step]: {
      ...(existingStepData[step] || {}),
      ...data,
      updatedAt: new Date(),
    },
  };

  cls.wizardProgress = {
    currentStep: step,
    completedSteps: Array.from(completedSet),
    stepData: mergedStepData,
    lastUpdated: new Date(),
  };

  await cls.save();

  return {
    classId: cls._id,
    currentStep: cls.wizardProgress.currentStep,
    completedSteps: cls.wizardProgress.completedSteps,
    stepData: cls.wizardProgress.stepData,
    lastUpdated: cls.wizardProgress.lastUpdated,
  };
}
