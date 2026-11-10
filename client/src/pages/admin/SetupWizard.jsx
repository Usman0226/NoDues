import React, { useState, useEffect, useCallback } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useSetupWizardFlag } from '../../hooks/useFeatureFlag';
import { ROLES } from '../../utils/constants';
import { getWizardProgress, updateWizardProgress } from '../../api/wizard';
import { getClass } from '../../api/classes';
import WizardProgressHeader, { STEPS_CONFIG } from '../../components/wizard/WizardProgressHeader';
import StepContainer from '../../components/wizard/StepContainer';
import { WizardPageSkeleton } from '../../components/wizard/WizardSkeleton';
import Step1ClassInfo from '../../components/wizard/Step1ClassInfo';
import Step2Timetable from '../../components/wizard/Step2Timetable';
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
  const { isEnabled: flagEnabled, isLoading: flagLoading } = useSetupWizardFlag();

  // Wizard State
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState([]);
  const [classId, setClassId] = useState(null);
  const [selectedClass, setSelectedClass] = useState(null);
  const [stepSummaries, setStepSummaries] = useState({});
  const [isDirty, setIsDirty] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  // 1. Feature Flag Guard (FR-F4, FR-F5)
  // If flag is off: redirect to existing dashboard
  if (flagLoading) {
    return <WizardPageSkeleton />;
  }

  if (!flagEnabled) {
    const fallbackRoute = user?.role === ROLES.HOD ? '/hod' : '/admin';
    return <Navigate to={fallbackRoute} replace />;
  }

  // 2. Role Authorization (Admin and HoD only)
  const isAuthorized = user?.role === ROLES.ADMIN || user?.role === ROLES.HOD || user?.role === 'admin' || user?.role === 'hod';
  if (!isAuthorized) {
    return <Navigate to="/unauthorized" replace />;
  }

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
      // 1. Fetch class details
      const clsRes = await getClass(targetClassId);
      const classData = clsRes?.data || clsRes;
      setSelectedClass(classData);

      // 2. Fetch wizard progress
      const progressRes = await getWizardProgress(targetClassId);
      const progress = progressRes?.data || progressRes;

      if (progress?.completedSteps && Array.isArray(progress.completedSteps)) {
        setCompletedSteps(progress.completedSteps);

        // Find next step to resume from
        const nextStepId = progress.nextStep || STEP_IDS[0];
        const nextIdx = STEP_IDS.indexOf(nextStepId);
        if (nextIdx !== -1) {
          setActiveStepIndex(nextIdx);
        }
      }

      setStepSummaries((prev) => ({
        ...prev,
        class_info: `${classData.name} · Semester ${classData.semester || 1} · Batch ${classData.academicYear || 'Current'}`,
      }));
    } catch (err) {
      console.warn('Could not restore saved wizard progress:', err?.message);
    }
  }, []);

  // Announce step transitions to screen readers
  const announce = (message) => {
    setLiveAnnouncement(message);
  };

  // Step 1 Save Handler
  const handleStep1Save = async ({ classId: newClassId, classData, summary }) => {
    setClassId(newClassId);
    setSelectedClass(classData);
    setIsDirty(false);

    setStepSummaries((prev) => ({ ...prev, class_info: summary }));
    markStepComplete('class_info', 1);

    // Persist progress to backend
    try {
      await updateWizardProgress(newClassId, {
        step: 'class_info',
        markCompleted: true,
        data: { name: classData.name, semester: classData.semester },
      });
    } catch (err) {
      console.warn('Backend progress save failed:', err?.message);
    }

    announce(`Step 1 completed. Moving to Step 2: Timetable.`);
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

    // Persist progress to backend
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

  // Helper to mark step complete and advance
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

  // Edit completed step without restarting flow (DESIGN.md Part 2 §6)
  const handleEditStep = (stepIdx) => {
    setActiveStepIndex(stepIdx);
    const stepConfig = STEPS_CONFIG[stepIdx];
    announce(`Editing Step ${stepIdx + 1}: ${stepConfig?.label}.`);
  };

  // Reset wizard to setup a new class
  const handleResetWizard = () => {
    setClassId(null);
    setSelectedClass(null);
    setCompletedSteps([]);
    setStepSummaries({});
    setActiveStepIndex(0);
    setIsDirty(false);
    announce('Wizard reset. Ready to setup a new class.');
  };

  return (
    <div className="min-h-full bg-offwhite py-8 px-4 sm:px-6 lg:px-8">
      {/* Screen Reader Live Region for A11y (DESIGN.md §15) */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {liveAnnouncement}
      </div>

      <div className="max-w-5xl mx-auto space-y-8">
        {/* Progress Header & Department Scoping */}
        <WizardProgressHeader
          activeStepIndex={activeStepIndex}
          completedStepIds={completedSteps}
          onSelectStep={handleEditStep}
          selectedClass={selectedClass}
          user={user}
        />

        {/* Step Container Flow with Progressive Disclosure */}
        <div className="space-y-4">
          {/* STEP 1: CLASS INFO */}
          <StepContainer
            stepNumber={1}
            stepId="class_info"
            title="Class Information & Section Setup"
            subtitle="Select an existing section to stand up for the new semester, or configure a new persistent class document."
            summary={stepSummaries.class_info}
            isActive={activeStepIndex === 0}
            isCompleted={completedSteps.includes('class_info')}
            isLocked={false}
            onEdit={() => handleEditStep(0)}
          >
            <Step1ClassInfo
              user={user}
              initialClassId={classId}
              initialData={selectedClass}
              onSave={handleStep1Save}
              onDirtyChange={setIsDirty}
            />
          </StepContainer>

          {/* STEP 2: TIMETABLE UPLOAD & REVIEW */}
          <StepContainer
            stepNumber={2}
            stepId="timetable_subjects"
            title="Timetable Upload & Subject Parsing"
            subtitle="Upload an official timetable PDF to extract subjects and faculty via text layer, or clone assignments from another section."
            summary={stepSummaries.timetable_subjects}
            isActive={activeStepIndex === 1}
            isCompleted={completedSteps.includes('timetable_subjects')}
            isLocked={!completedSteps.includes('class_info') && activeStepIndex < 1}
            onEdit={() => handleEditStep(1)}
          >
            <Step2Timetable
              classId={classId}
              targetClass={selectedClass}
              onSave={handleStepSave}
              onBack={() => setActiveStepIndex(0)}
              onDirtyChange={setIsDirty}
            />
          </StepContainer>

          {/* STEP 3: STUDENTS */}
          <StepContainer
            stepNumber={3}
            stepId="students"
            title="Students"
            subtitle="Confirm existing students in this class or upload new student records via CSV/Excel."
            summary={stepSummaries.students}
            isActive={activeStepIndex === 2}
            isCompleted={completedSteps.includes('students')}
            isLocked={!completedSteps.includes('timetable_subjects') && activeStepIndex < 2}
            onEdit={() => handleEditStep(2)}
          >
            <Step3Students
              classId={classId}
              targetClass={selectedClass}
              onSave={handleStepSave}
              onBack={() => setActiveStepIndex(1)}
              onDirtyChange={setIsDirty}
            />
          </StepContainer>

          {/* STEP 4: MENTOR ASSIGNMENT */}
          <StepContainer
            stepNumber={4}
            stepId="mentors"
            title="Mentor Faculty Assignment"
            subtitle="Assign academic mentors to enrolled students via bulk mapping or individual faculty allocation."
            summary={stepSummaries.mentors}
            isActive={activeStepIndex === 3}
            isCompleted={completedSteps.includes('mentors')}
            isLocked={!completedSteps.includes('students') && activeStepIndex < 3}
            onEdit={() => handleEditStep(3)}
          >
            <Step4Mentors
              classId={classId}
              targetClass={selectedClass}
              onSave={handleStepSave}
              onBack={() => setActiveStepIndex(2)}
              onDirtyChange={setIsDirty}
            />
          </StepContainer>

          {/* STEP 5: ELECTIVE ASSIGNMENT (CONDITIONAL) */}
          <StepContainer
            stepNumber={5}
            stepId="electives"
            title="Elective Subject Mapping (Conditional)"
            subtitle="Map open or professional electives for applicable students (typically Semesters 5 through 8)."
            summary={stepSummaries.electives}
            isActive={activeStepIndex === 4}
            isCompleted={completedSteps.includes('electives')}
            isLocked={!completedSteps.includes('mentors') && activeStepIndex < 4}
            onEdit={() => handleEditStep(4)}
          >
            <Step5Electives
              classId={classId}
              targetClass={selectedClass}
              onSave={handleStepSave}
              onBack={() => setActiveStepIndex(3)}
              onDirtyChange={setIsDirty}
            />
          </StepContainer>

          {/* STEP 6: PRE-FLIGHT CHECKLIST */}
          <StepContainer
            stepNumber={6}
            stepId="preflight"
            title="Pre-Flight Verification Gate"
            subtitle="Real-time verification that students, active subjects, and class teacher meet all launch criteria."
            summary={stepSummaries.preflight}
            isActive={activeStepIndex === 5}
            isCompleted={completedSteps.includes('preflight')}
            isLocked={!completedSteps.includes('electives') && activeStepIndex < 5}
            onEdit={() => handleEditStep(5)}
          >
            <Step6Preflight
              classId={classId}
              targetClass={selectedClass}
              onSave={handleStepSave}
              onBack={() => setActiveStepIndex(4)}
              onNavigateToStep={(stepIdx) => setActiveStepIndex(stepIdx)}
            />
          </StepContainer>

          {/* STEP 7: INITIATION */}
          <StepContainer
            stepNumber={7}
            stepId="initiation"
            title="Launch No-Due Clearance Cycle"
            subtitle="Final confirmation to generate official student clearance requests across subjects and departments."
            summary={stepSummaries.initiation}
            isActive={activeStepIndex === 6}
            isCompleted={completedSteps.includes('initiation')}
            isLocked={!completedSteps.includes('preflight') && activeStepIndex < 6}
            onEdit={() => handleEditStep(6)}
          >
            <Step7Initiation
              classId={classId}
              targetClass={selectedClass}
              onBack={() => setActiveStepIndex(5)}
              onResetWizard={handleResetWizard}
            />
          </StepContainer>
        </div>
      </div>
    </div>
  );
};

export default SetupWizard;

