import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useSetupWizardFlag } from '../../hooks/useFeatureFlag';
import { ROLES } from '../../utils/constants';
import { getWizardProgress, updateWizardProgress } from '../../api/wizard';
import { getClass } from '../../api/classes';
import { formatSectionDisplayName } from '../../utils/formatters';
import { useNavigationStack } from '../../hooks/useNavigationStack';
import WizardProgressHeader, { STEPS_CONFIG } from '../../components/wizard/WizardProgressHeader';
import StepContainer from '../../components/wizard/StepContainer';
import { WizardPageSkeleton } from '../../components/wizard/WizardSkeleton';
import Step1ClassSubjects from '../../components/wizard/Step1ClassSubjects';
import Step3Students from '../../components/wizard/Step3Students';
import Step4Mentors from '../../components/wizard/Step4Mentors';
import Step5Electives from '../../components/wizard/Step5Electives';
import Step6Preflight from '../../components/wizard/Step6Preflight';
import Step7Initiation from '../../components/wizard/Step7Initiation';
import { toast } from 'react-hot-toast';

const STEP_IDS = STEPS_CONFIG.map((s) => s.id);

const SetupWizard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { setBreadcrumbs } = useNavigationStack();
  const { isEnabled: flagEnabled, isLoading: flagLoading } = useSetupWizardFlag();

  // URL query params (e.g. ?dept=... or ?classId=...)
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const queryDeptId = searchParams.get('dept');
  const queryClassId = searchParams.get('classId');

  // Wizard State
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState([]);
  const [classId, setClassId] = useState(queryClassId || null);
  const [selectedClass, setSelectedClass] = useState(null);
  const [stepSummaries, setStepSummaries] = useState({});
  const [isDirty, setIsDirty] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  const isHod = user?.role === ROLES.HOD || user?.role === 'hod';
  const isAuthorized = user?.role === ROLES.ADMIN || user?.role === ROLES.HOD || user?.role === 'admin' || user?.role === 'hod';

  // Set Top Navigation Stack Breadcrumbs
  useEffect(() => {
    const crumbs = [
      { label: 'NoDues', path: isHod ? '/hod' : '/admin' },
      ...(isHod
        ? [{ label: 'Academic Groups', path: '/hod/classes' }]
        : [{ label: 'Departments', path: '/admin/departments' }]),
      { label: 'Class Setup Wizard', isCurrent: true },
    ];
    setBreadcrumbs(crumbs);
  }, [setBreadcrumbs, isHod]);

  // Unsaved changes browser warning
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Load progress when class is selected
  const loadClassProgress = useCallback(async (targetClassId) => {
    try {
      const clsRes = await getClass(targetClassId);
      const classData = clsRes?.data || clsRes;
      setSelectedClass(classData);

      const progressRes = await getWizardProgress(targetClassId);
      const progress = progressRes?.data || progressRes;

      if (progress?.completedSteps && Array.isArray(progress.completedSteps)) {
        setCompletedSteps(progress.completedSteps);

        const nextStepId = progress.nextStep || STEP_IDS[0];
        const nextIdx = STEP_IDS.indexOf(nextStepId);
        if (nextIdx !== -1) {
          setActiveStepIndex(nextIdx);
        }
      }

      setStepSummaries((prev) => ({
        ...prev,
        class_info: `${formatSectionDisplayName(classData.name, classData.semester)} · Semester ${classData.semester || 1} · Batch ${classData.academicYear || 'Current'}`,
      }));
    } catch (err) {
      console.warn('Could not restore saved wizard progress:', err?.message);
    }
  }, []);

  const announce = (message) => {
    setLiveAnnouncement(message);
  };

  // Step 1 Save Handler
  const handleStep1Save = async ({ classId: newClassId, classData, summary, completedTimetable }) => {
    setClassId(newClassId);
    setSelectedClass(classData);
    setIsDirty(false);

    setStepSummaries((prev) => ({ ...prev, class_info: summary }));
    markStepComplete('class_info', 1);

    try {
      await updateWizardProgress(newClassId, {
        step: 'class_info',
        markCompleted: true,
        data: { name: classData.name, semester: classData.semester, subjectsConfigured: true },
      });
      if (completedTimetable) {
        await updateWizardProgress(newClassId, {
          step: 'timetable_subjects',
          markCompleted: true,
          data: { subjectsConfigured: true },
        });
      }
    } catch (err) {
      console.warn('Backend progress save failed:', err?.message);
    }

    announce('Step 1 completed. Advanced to Step 2: Enrolled Students.');
  };

  // Generic Step Save Handler
  const handleStepSave = async ({ step, summary, data }) => {
    setIsDirty(false);
    if (summary) {
      setStepSummaries((prev) => ({ ...prev, [step]: summary }));
    }

    const currentIdx = STEP_IDS.indexOf(step);
    const nextIdx = currentIdx + 1;

    markStepComplete(step, nextIdx);

    if (classId) {
      try {
        await updateWizardProgress(classId, {
          step,
          markCompleted: true,
          data: data || {},
        });
      } catch (err) {
        console.warn('Backend progress save failed:', err?.message);
      }
    }

    const nextStepConfig = STEPS_CONFIG[nextIdx];
    if (nextStepConfig) {
      announce(`Step ${currentIdx + 1} completed. Advanced to Step ${nextIdx + 1}: ${nextStepConfig.label}.`);
    }
  };

  const markStepComplete = (stepId, targetActiveIndex) => {
    setCompletedSteps((prev) => {
      const set = new Set(prev);
      set.add(stepId);
      return Array.from(set);
    });

    if (targetActiveIndex !== undefined && targetActiveIndex < STEPS_CONFIG.length) {
      setActiveStepIndex(targetActiveIndex);
    }
  };

  const handleEditStep = (stepIdx) => {
    setActiveStepIndex(stepIdx);
    const stepConfig = STEPS_CONFIG[stepIdx];
    announce(`Editing Step ${stepIdx + 1}: ${stepConfig?.label}.`);
  };

  const handleResetWizard = () => {
    setClassId(null);
    setSelectedClass(null);
    setCompletedSteps([]);
    setStepSummaries({});
    setActiveStepIndex(0);
    setIsDirty(false);
    announce('Wizard reset. Ready to configure a new class.');
  };

  if (flagLoading) {
    return <WizardPageSkeleton />;
  }

  if (!flagEnabled) {
    const fallbackRoute = isHod ? '/hod' : '/admin';
    return <Navigate to={fallbackRoute} replace />;
  }

  if (!isAuthorized) {
    return <Navigate to="/unauthorized" replace />;
  }

  return (
    <div className="min-h-full bg-offwhite py-5 px-3 sm:px-6 lg:px-8">
      {/* Screen Reader Live Region */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {liveAnnouncement}
      </div>

      <div className="max-w-5xl mx-auto space-y-5">
        {/* Progress Header */}
        <WizardProgressHeader
          activeStepIndex={activeStepIndex}
          completedStepIds={completedSteps}
          onSelectStep={handleEditStep}
          selectedClass={selectedClass}
          user={user}
        />

        {/* Step Container Flow with Progressive Disclosure */}
        <div className="space-y-3">
          {/* STEP 1: CLASS & SUBJECTS SETUP (PDF UPLOAD OR MANUAL) */}
          <StepContainer
            stepNumber={1}
            stepId="class_info"
            title="Class & Subjects Setup"
            subtitle="Drop institutional timetable PDF to auto-detect section, semester, class teacher & subjects, or configure manually."
            summary={stepSummaries.class_info}
            isActive={activeStepIndex === 0}
            isCompleted={completedSteps.includes('class_info')}
            isLocked={false}
            onEdit={() => handleEditStep(0)}
          >
            <Step1ClassSubjects
              user={user}
              initialClassId={classId}
              initialData={selectedClass}
              initialDepartmentId={queryDeptId}
              onSave={handleStep1Save}
              onDirtyChange={setIsDirty}
            />
          </StepContainer>

          {/* STEP 2: ENROLLED STUDENTS */}
          <StepContainer
            stepNumber={2}
            stepId="students"
            title="Enrolled Students"
            subtitle="Verify students currently enrolled in this section, promote prior cohort, or import CSV roster."
            summary={stepSummaries.students}
            isActive={activeStepIndex === 1}
            isCompleted={completedSteps.includes('students')}
            isLocked={!completedSteps.includes('class_info') && activeStepIndex < 1}
            onEdit={() => handleEditStep(1)}
          >
            <Step3Students
              classId={classId}
              targetClass={selectedClass}
              onSave={handleStepSave}
              onBack={() => setActiveStepIndex(0)}
              onDirtyChange={setIsDirty}
            />
          </StepContainer>

          {/* STEP 3: MENTOR ASSIGNMENT */}
          <StepContainer
            stepNumber={3}
            stepId="mentors"
            title="Mentor Faculty Allocation"
            subtitle="Assign academic mentors to enrolled students individually, in bulk, or using auto-distribution."
            summary={stepSummaries.mentors}
            isActive={activeStepIndex === 2}
            isCompleted={completedSteps.includes('mentors')}
            isLocked={!completedSteps.includes('students') && activeStepIndex < 2}
            onEdit={() => handleEditStep(2)}
          >
            <Step4Mentors
              classId={classId}
              targetClass={selectedClass}
              onSave={handleStepSave}
              onBack={() => setActiveStepIndex(1)}
              onDirtyChange={setIsDirty}
            />
          </StepContainer>

          {/* STEP 4: ELECTIVE ASSIGNMENT */}
          <StepContainer
            stepNumber={4}
            stepId="electives"
            title="Elective Subject Mapping"
            subtitle="Map open or professional electives if applicable for this semester."
            summary={stepSummaries.electives}
            isActive={activeStepIndex === 3}
            isCompleted={completedSteps.includes('electives')}
            isLocked={!completedSteps.includes('mentors') && activeStepIndex < 3}
            onEdit={() => handleEditStep(3)}
          >
            <Step5Electives
              classId={classId}
              targetClass={selectedClass}
              onSave={handleStepSave}
              onBack={() => setActiveStepIndex(2)}
              onDirtyChange={setIsDirty}
            />
          </StepContainer>

          {/* STEP 5: PRE-FLIGHT CHECK */}
          <StepContainer
            stepNumber={5}
            stepId="preflight"
            title="Review & Pre-Flight Check"
            subtitle="Verify enrolled students, active subjects, and class teacher before launching clearance."
            summary={stepSummaries.preflight}
            isActive={activeStepIndex === 4}
            isCompleted={completedSteps.includes('preflight')}
            isLocked={!completedSteps.includes('electives') && activeStepIndex < 4}
            onEdit={() => handleEditStep(4)}
          >
            <Step6Preflight
              classId={classId}
              targetClass={selectedClass}
              onSave={handleStepSave}
              onBack={() => setActiveStepIndex(3)}
              onNavigateToStep={(stepIdx) => setActiveStepIndex(stepIdx)}
            />
          </StepContainer>

          {/* STEP 6: INITIATION */}
          <StepContainer
            stepNumber={6}
            stepId="initiation"
            title="Launch Clearance Cycle"
            subtitle="Final confirmation to activate the official No-Due clearance cycle for this section."
            summary={stepSummaries.initiation}
            isActive={activeStepIndex === 5}
            isCompleted={completedSteps.includes('initiation')}
            isLocked={!completedSteps.includes('preflight') && activeStepIndex < 5}
            onEdit={() => handleEditStep(5)}
          >
            <Step7Initiation
              classId={classId}
              targetClass={selectedClass}
              onBack={() => setActiveStepIndex(4)}
              onResetWizard={handleResetWizard}
            />
          </StepContainer>
        </div>
      </div>
    </div>
  );
};

export default SetupWizard;
