import React, { useState, useEffect, useMemo } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../hooks/useAuth';
import { useSetupWizardFlag } from '../../hooks/useFeatureFlag';
import { ROLES } from '../../utils/constants';
import { getWizardProgress, updateWizardProgress } from '../../api/wizard';
import { getClass } from '../../api/classes';
import { useNavigationStack } from '../../hooks/useNavigationStack';
import WizardProgressHeader from '../../components/wizard/WizardProgressHeader';
import { STEPS_CONFIG } from '../../components/wizard/wizardSteps';
import StepContainer from '../../components/wizard/StepContainer';
import { WizardPageSkeleton } from '../../components/wizard/WizardSkeleton';
import Step1ClassSubjects from '../../components/wizard/Step1ClassSubjects';
import Step3Students from '../../components/wizard/Step3Students';
import Step4Mentors from '../../components/wizard/Step4Mentors';
import Step5Electives from '../../components/wizard/Step5Electives';
import Step6Preflight from '../../components/wizard/Step6Preflight';
import Step7Initiation from '../../components/wizard/Step7Initiation';

const STEP_IDS = STEPS_CONFIG.map((s) => s.id);

const SetupWizard = () => {
  const { user } = useAuth();
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
  const [skippedSteps, setSkippedSteps] = useState([]);
  const [classId, setClassId] = useState(queryClassId || null);
  const [selectedClass, setSelectedClass] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  const isHod = user?.role === ROLES.HOD || user?.role === 'hod';
  const isAuthorized = user?.role === ROLES.ADMIN || user?.role === ROLES.HOD || user?.role === 'admin' || user?.role === 'hod';

  // Top Navigation Stack Breadcrumbs
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

  // Restore saved progress when ?classId=... is provided
  useEffect(() => {
    if (!queryClassId) return undefined;
    let active = true;

    Promise.all([getClass(queryClassId), getWizardProgress(queryClassId)])
      .then(([clsRes, progressRes]) => {
        if (!active) return;

        const classData = clsRes?.data || clsRes;
        if (classData) {
          setClassId(queryClassId);
          setSelectedClass(classData);
        }

        const progress = progressRes?.data || progressRes;
        if (progress?.completedSteps && Array.isArray(progress.completedSteps)) {
          setCompletedSteps(progress.completedSteps);

          const stepData = progress.stepData || {};
          const inferredSkipped = STEP_IDS.filter((id) => Boolean(stepData?.[id]?.skipped));
          setSkippedSteps(inferredSkipped);

          const nextStepId = progress.nextStep || STEP_IDS[0];
          const nextIdx = STEP_IDS.indexOf(nextStepId);
          if (nextIdx !== -1) {
            setActiveStepIndex(nextIdx);
          }
        }
      })
      .catch((err) => {
        if (active) {
          setClassId(null);
          setSelectedClass(null);
          if (err?.statusCode === 404) {
            toast('Requested class is unavailable or deactivated. Ready for a new setup.', { icon: 'ℹ️' });
          } else {
            console.warn('Could not restore saved wizard progress:', err?.message);
          }
        }
      });

    return () => {
      active = false;
    };
  }, [queryClassId]);

  const furthestUnlockedIndex = useMemo(() => {
    let highest = 0;
    STEP_IDS.forEach((id, idx) => {
      if (completedSteps.includes(id)) {
        highest = Math.max(highest, Math.min(STEPS_CONFIG.length - 1, idx + 1));
      }
    });
    return Math.max(highest, activeStepIndex);
  }, [completedSteps, activeStepIndex]);

  const announce = (message) => {
    setLiveAnnouncement(message);
  };

  const markStepComplete = (stepId, targetActiveIndex, { skipped = false } = {}) => {
    setCompletedSteps((prev) => {
      const set = new Set(prev);
      set.add(stepId);
      return Array.from(set);
    });

    setSkippedSteps((prev) => {
      const set = new Set(prev);
      if (skipped) set.add(stepId);
      else set.delete(stepId);
      return Array.from(set);
    });

    if (targetActiveIndex !== undefined && targetActiveIndex < STEPS_CONFIG.length) {
      setActiveStepIndex(targetActiveIndex);
    }
  };

  // Step 1 Save Handler
  const handleStep1Save = async ({ classId: newClassId, classData, completedTimetable }) => {
    setClassId(newClassId);
    setSelectedClass(classData);
    setIsDirty(false);

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

  // Generic Step Save Handler (also handles skipped optional steps gracefully)
  const handleStepSave = async ({ step, data }) => {
    setIsDirty(false);
    const isSkipped = Boolean(data?.skipped);

    const currentIdx = STEP_IDS.indexOf(step);
    const nextIdx = currentIdx + 1;

    markStepComplete(step, nextIdx, { skipped: isSkipped });

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
      announce(
        isSkipped
          ? `Step ${currentIdx + 1} skipped. Advanced to Step ${nextIdx + 1}: ${nextStepConfig.label}.`
          : `Step ${currentIdx + 1} completed. Advanced to Step ${nextIdx + 1}: ${nextStepConfig.label}.`
      );
    }
  };

  const handleSelectStep = (stepIdx) => {
    setActiveStepIndex(stepIdx);
    const stepConfig = STEPS_CONFIG[stepIdx];
    announce(`Viewing Step ${stepIdx + 1}: ${stepConfig?.label}.`);
  };

  const handleResetWizard = () => {
    setClassId(null);
    setSelectedClass(null);
    setCompletedSteps([]);
    setSkippedSteps([]);
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

  const activeConfig = STEPS_CONFIG[activeStepIndex] || STEPS_CONFIG[0];

  const renderActiveStep = () => {
    switch (activeStepIndex) {
      case 0:
        return (
          <StepContainer
            stepId="class_info"
            title="Class & Subjects Setup"
            subtitle="Drop institutional timetable PDF to auto-detect section, semester, class teacher & subjects, or configure manually."
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
        );
      case 1:
        return (
          <StepContainer
            stepId="students"
            title="Enrolled Students"
            subtitle="Import student roster via Excel/CSV, or skip this step and enroll students anytime later."
            badge="Optional Now"
          >
            <Step3Students
              classId={classId}
              targetClass={selectedClass}
              user={user}
              onSave={handleStepSave}
              onBack={() => setActiveStepIndex(0)}
              onDirtyChange={setIsDirty}
            />
          </StepContainer>
        );
      case 2:
        return (
          <StepContainer
            stepId="mentors"
            title="Mentor Faculty Allocation"
            subtitle="Assign mentors individually, auto-distribute across faculty, or skip and bulk-assign later."
            badge="Optional"
          >
            <Step4Mentors
              classId={classId}
              targetClass={selectedClass}
              user={user}
              onSave={handleStepSave}
              onBack={() => setActiveStepIndex(1)}
              onDirtyChange={setIsDirty}
            />
          </StepContainer>
        );
      case 3:
        return (
          <StepContainer
            stepId="electives"
            title="Elective Subject Mapping"
            subtitle="Map student electives from spreadsheet if applicable, or skip cleanly to review."
            badge="Optional"
          >
            <Step5Electives
              classId={classId}
              targetClass={selectedClass}
              user={user}
              onSave={handleStepSave}
              onBack={() => setActiveStepIndex(2)}
              onDirtyChange={setIsDirty}
            />
          </StepContainer>
        );
      case 4:
        return (
          <StepContainer
            stepId="preflight"
            title="Review & Pre-Flight Check"
            subtitle="Verify students, subjects, and class teacher readiness before launching clearance."
          >
            <Step6Preflight
              classId={classId}
              targetClass={selectedClass}
              user={user}
              onSave={handleStepSave}
              onBack={() => setActiveStepIndex(3)}
              onNavigateToStep={(stepIdx) => setActiveStepIndex(stepIdx)}
            />
          </StepContainer>
        );
      case 5:
        return (
          <StepContainer
            stepId="initiation"
            title="Launch Clearance Cycle"
            subtitle="Final confirmation to activate the official No-Due clearance cycle for this section."
          >
            <Step7Initiation
              classId={classId}
              targetClass={selectedClass}
              user={user}
              onBack={() => setActiveStepIndex(4)}
              onResetWizard={handleResetWizard}
            />
          </StepContainer>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-full bg-offwhite flex flex-col py-3.5 px-4 sm:px-6 lg:px-8">
      {/* Screen Reader Live Region */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {liveAnnouncement || `Viewing ${activeConfig.label}`}
      </div>

      {/* Sectioned Workspace Container fitting cleanly without clipping tables */}
      <div className="max-w-7xl w-full mx-auto flex-1 min-h-0 flex flex-col gap-3">
        <WizardProgressHeader
          activeStepIndex={activeStepIndex}
          completedStepIds={completedSteps}
          skippedStepIds={skippedSteps}
          furthestUnlockedIndex={furthestUnlockedIndex}
          onSelectStep={handleSelectStep}
          selectedClass={selectedClass}
          user={user}
          onReset={handleResetWizard}
        />

        {/* Single Active Step Panel (No redundant vertical stacked accordions) */}
        {renderActiveStep()}
      </div>
    </div>
  );
};

export default SetupWizard;
