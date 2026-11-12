import React from 'react';
import { Check, Lock, Building2, RotateCcw, Clock } from 'lucide-react';
import { ROLES } from '../../utils/constants';
import { formatSectionDisplayName } from '../../utils/formatters';
import Button from '../ui/Button';
import { STEPS_CONFIG } from './wizardSteps';

const WizardProgressHeader = ({
  activeStepIndex,
  completedStepIds = [],
  skippedStepIds = [],
  furthestUnlockedIndex = 0,
  onSelectStep,
  selectedClass,
  provisionedClasses = [],
  onSwitchClass,
  user,
  onReset,
}) => {
  const currentStep = STEPS_CONFIG[activeStepIndex] || STEPS_CONFIG[0];
  const totalSteps = STEPS_CONFIG.length;
  const completedCount = STEPS_CONFIG.filter((s) => completedStepIds.includes(s.id)).length;
  const progressPercent = Math.round((completedCount / totalSteps) * 100);

  const isHod = user?.role === ROLES.HOD || user?.role === 'hod';
  const deptName = user?.departmentName || user?.department?.name || user?.department || 'Department';

  const classDisplayName = selectedClass
    ? formatSectionDisplayName(selectedClass.name, selectedClass.semester)
    : '';

  return (
    <header className="shrink-0 space-y-2.5">
      {/* Top Row: Title + Context Pills */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-black text-navy tracking-tight leading-none">
              Class Setup Wizard
            </h1>
            {isHod && (
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50 border border-indigo-200/70 text-indigo-900 text-[10px] font-black uppercase tracking-wider"
                role="status"
                aria-label="Department Scope Indicator"
              >
                <Building2 size={11} className="text-indigo-600 shrink-0" aria-hidden="true" />
                <span>{deptName}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <div className="h-0.5 w-3.5 bg-gold rounded-full shrink-0" />
            <p className="text-xs font-semibold text-muted-foreground tracking-wide">
              Step {currentStep.number} of {totalSteps}:{' '}
              <span className="text-navy font-bold">{currentStep.label}</span>
              {currentStep.optional && (
                <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wider text-indigo-600">
                  (Optional)
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Right Context: Selected Class (or Provisioned Section Switcher) + Progress + Reset */}
        <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap shrink-0">
          {provisionedClasses.length > 1 ? (
            <div className="inline-flex items-center gap-2 h-9 px-2.5 rounded-full bg-white border border-indigo-200 shadow-xs">
              <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase tracking-wider shrink-0">
                {provisionedClasses.length} Sections
              </span>
              <select
                aria-label="Switch active provisioned section"
                value={selectedClass?._id || ''}
                onChange={(e) => onSwitchClass?.(e.target.value)}
                className="bg-transparent text-xs font-black text-navy focus:outline-none cursor-pointer pr-1"
              >
                {provisionedClasses.map((sec) => {
                  const id = sec.classId || sec._id;
                  const label = formatSectionDisplayName(sec.name, sec.semester);
                  return (
                    <option key={id} value={id}>
                      {label} (Sem {sec.semester || 1})
                    </option>
                  );
                })}
              </select>
            </div>
          ) : selectedClass ? (
            <div className="h-9 inline-flex items-center gap-2 px-3 rounded-full bg-white border border-zinc-200 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" aria-hidden="true" />
              <span className="text-xs font-black text-navy leading-none">
                {classDisplayName}
              </span>
              <span className="text-[11px] font-semibold text-zinc-500 leading-none">
                Sem {selectedClass.semester || 1}
              </span>
            </div>
          ) : null}

          <span className="h-9 inline-flex items-center px-3 rounded-full bg-white border border-zinc-200/80 text-[11px] font-bold text-zinc-600 tabular-nums shadow-xs">
            {progressPercent}% ({completedCount}/{totalSteps})
          </span>

          {selectedClass && onReset && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onReset}
              className="border border-zinc-200 bg-white text-zinc-600 hover:text-navy"
              title="Start configuring a new class"
            >
              <RotateCcw size={12} />
              <span className="hidden sm:inline">New Setup</span>
            </Button>
          )}
        </div>
      </div>

      {/* Slim Accessible Progress Bar */}
      <div
        role="progressbar"
        aria-valuenow={currentStep.number}
        aria-valuemin={1}
        aria-valuemax={totalSteps}
        aria-label={`Wizard progress: step ${currentStep.number} of ${totalSteps}`}
        className="h-1 w-full bg-zinc-200/70 rounded-full overflow-hidden"
      >
        <div
          className="h-full bg-navy transition-all duration-300 ease-out rounded-full"
          style={{ width: `${Math.max(8, progressPercent)}%` }}
        />
      </div>

      {/* 6-Column Section Navigation Tabs (exact 6 cols for 6 steps) */}
      <nav aria-label="Wizard Steps" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {STEPS_CONFIG.map((step, idx) => {
          const isCompleted = completedStepIds.includes(step.id);
          const isSkipped = skippedStepIds.includes(step.id);
          const isActive = idx === activeStepIndex;
          const isUnlocked = isCompleted || isActive || idx <= furthestUnlockedIndex;

          return (
            <button
              key={step.id}
              type="button"
              onClick={() => isUnlocked && onSelectStep(idx)}
              disabled={!isUnlocked}
              aria-current={isActive ? 'step' : undefined}
              aria-label={`Step ${step.number}: ${step.label} (${isSkipped ? 'Deferred' : isCompleted ? 'Completed' : isActive ? 'Active' : 'Locked'})`}
              className={`h-9 flex items-center gap-2 px-3 rounded-xl text-left text-[11px] font-bold transition-all border leading-none
                ${isActive
                  ? 'bg-navy text-white border-navy shadow-sm font-black'
                  : isSkipped
                    ? 'bg-amber-50/90 text-amber-900 border-amber-200 hover:bg-amber-100/70 cursor-pointer'
                    : isCompleted
                      ? 'bg-emerald-50/90 text-emerald-900 border-emerald-200 hover:bg-emerald-100/70 cursor-pointer'
                      : isUnlocked
                        ? 'bg-white text-navy border-zinc-200 hover:border-indigo-300 cursor-pointer'
                        : 'bg-zinc-100/80 text-zinc-400 border-zinc-200/70 cursor-not-allowed'
                }`}
            >
              <span className="shrink-0">
                {isSkipped && !isActive ? (
                  <Clock size={12} className="text-amber-700" aria-hidden="true" />
                ) : isCompleted && !isActive ? (
                  <Check size={12} className="text-emerald-700 stroke-[3]" aria-hidden="true" />
                ) : !isUnlocked ? (
                  <Lock size={11} className="text-zinc-400" aria-hidden="true" />
                ) : (
                  <span
                    className={`w-4 h-4 inline-flex items-center justify-center rounded-full text-[9px] font-black ${
                      isActive ? 'bg-white/20 text-white' : 'bg-zinc-100 text-navy'
                    }`}
                  >
                    {step.number}
                  </span>
                )}
              </span>
              <span className="truncate">{step.short}</span>
            </button>
          );
        })}
      </nav>
    </header>
  );
};

export default WizardProgressHeader;
