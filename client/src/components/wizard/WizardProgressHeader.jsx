import React from 'react';
import { Check, Lock, Building2, RotateCcw, Clock, Layers } from 'lucide-react';
import { ROLES } from '../../utils/constants';
import { formatSectionDisplayName } from '../../utils/formatters';
import Button from '../ui/Button';
import { STEPS_CONFIG } from './wizardSteps';

export const WizardStepRail = ({
  activeStepIndex,
  completedStepIds = [],
  skippedStepIds = [],
  furthestUnlockedIndex = 0,
  onSelectStep,
  selectedClass,
  provisionedClasses = [],
}) => {
  const completedCount = STEPS_CONFIG.filter((s) => completedStepIds.includes(s.id)).length;
  const classDisplayName = selectedClass
    ? formatSectionDisplayName(selectedClass.name, selectedClass.semester)
    : '';

  return (
    <aside
      aria-label="Wizard Workflow Steps"
      className="lg:w-[252px] xl:w-[268px] shrink-0 border-b lg:border-b-0 lg:border-r border-zinc-100 bg-zinc-50/50 flex flex-col justify-between"
    >
      {/* Mobile Compact Horizontal Stepper */}
      <nav aria-label="Wizard Steps" className="lg:hidden flex items-center gap-1.5 overflow-x-auto px-3 py-2.5">
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
              className={`h-8 shrink-0 inline-flex items-center gap-1.5 px-2.5 rounded-xl text-[11px] font-bold transition-all border ${
                isActive
                  ? 'bg-navy text-white border-navy shadow-xs'
                  : isSkipped
                  ? 'bg-white text-amber-800 border-amber-200'
                  : isCompleted
                  ? 'bg-white text-emerald-800 border-emerald-200'
                  : isUnlocked
                  ? 'bg-white text-navy border-zinc-200'
                  : 'bg-zinc-100/80 text-zinc-400 border-transparent cursor-not-allowed'
              }`}
            >
              <span>{step.number}.</span>
              <span>{step.short}</span>
            </button>
          );
        })}
      </nav>

      {/* Desktop Calm Vertical Studio Step Rail */}
      <div className="hidden lg:flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
            Workflow
          </span>
          <span className="text-[11px] font-bold text-zinc-500 tabular-nums">
            {completedCount}/{STEPS_CONFIG.length}
          </span>
        </div>

        <nav aria-label="Wizard Steps" className="space-y-1">
          {STEPS_CONFIG.map((step, idx) => {
            const isCompleted = completedStepIds.includes(step.id);
            const isSkipped = skippedStepIds.includes(step.id);
            const isActive = idx === activeStepIndex;
            const isUnlocked = isCompleted || isActive || idx <= furthestUnlockedIndex;

            const statusLabel = isActive
              ? 'Active'
              : isSkipped
              ? 'Deferred'
              : isCompleted
              ? 'Completed'
              : step.optional
              ? 'Optional'
              : 'Required';

            return (
              <button
                key={step.id}
                type="button"
                onClick={() => isUnlocked && onSelectStep(idx)}
                disabled={!isUnlocked}
                aria-current={isActive ? 'step' : undefined}
                aria-label={`Step ${step.number}: ${step.label} (${statusLabel})`}
                className={`w-full group flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all border ${
                  isActive
                    ? 'bg-white border-zinc-200/90 shadow-xs text-navy'
                    : isUnlocked
                    ? 'bg-transparent border-transparent hover:bg-white/80 hover:border-zinc-200/60 text-zinc-700 cursor-pointer'
                    : 'bg-transparent border-transparent text-zinc-400 cursor-not-allowed'
                }`}
              >
                <span
                  className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-[11px] font-black transition-colors ${
                    isActive
                      ? 'bg-navy text-white'
                      : isSkipped
                      ? 'bg-amber-100/80 text-amber-700'
                      : isCompleted
                      ? 'bg-emerald-100/80 text-emerald-700'
                      : isUnlocked
                      ? 'bg-zinc-200/70 text-zinc-700'
                      : 'bg-zinc-100 text-zinc-400'
                  }`}
                >
                  {isSkipped && !isActive ? (
                    <Clock size={12} aria-hidden="true" />
                  ) : isCompleted && !isActive ? (
                    <Check size={12} className="stroke-[3]" aria-hidden="true" />
                  ) : !isUnlocked ? (
                    <Lock size={11} aria-hidden="true" />
                  ) : (
                    step.number
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <p className={`text-xs truncate leading-tight ${isActive ? 'font-black text-navy' : 'font-semibold'}`}>
                    {step.label}
                  </p>
                  <p
                    className={`text-[10px] mt-0.5 leading-none ${
                      isActive
                        ? 'text-indigo-600 font-bold'
                        : isSkipped
                        ? 'text-amber-700 font-semibold'
                        : isCompleted
                        ? 'text-emerald-700 font-semibold'
                        : 'text-zinc-400'
                    }`}
                  >
                    {statusLabel}
                  </p>
                </div>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Calm Studio Context Footer */}
      <div className="hidden lg:block p-4 border-t border-zinc-100">
        {selectedClass ? (
          <div className="p-3 rounded-xl bg-white border border-zinc-200/80 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
                Active Focus
              </span>
              {provisionedClasses.length > 1 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700">
                  <Layers size={10} /> {provisionedClasses.length} saved
                </span>
              )}
            </div>
            <p className="text-xs font-black text-navy truncate">{classDisplayName}</p>
            <p className="text-[11px] text-zinc-500">
              Semester {selectedClass.semester || 1} · {selectedClass.academicYear || '2026-27'}
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-zinc-500 leading-relaxed px-1">
            Drop an institutional timetable PDF to auto-provision every section, subject, and master syllabus in one pass.
          </p>
        )}
      </div>
    </aside>
  );
};

const WizardProgressHeader = ({
  activeStepIndex,
  completedStepIds = [],
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
      {/* Slim Single-Row Studio Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="min-w-0 flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-lg sm:text-xl font-black text-navy tracking-tight leading-none">
            Class Setup Wizard
          </h1>
          {isHod && (
            <span
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-50 border border-indigo-200/70 text-indigo-800 text-[10px] font-bold uppercase tracking-wider"
              role="status"
              aria-label="Department Scope Indicator"
            >
              <Building2 size={10} className="text-indigo-600 shrink-0" aria-hidden="true" />
              <span>{deptName}</span>
            </span>
          )}
          <span className="hidden md:inline-flex items-center gap-1.5 text-xs text-zinc-500 font-medium">
            <span className="text-zinc-300">·</span>
            <span>
              Step {currentStep.number} of {totalSteps}: <strong className="text-navy">{currentStep.label}</strong>
            </span>
          </span>
        </div>

        {/* Right Controls: Section Switcher + Progress + New Setup */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
          {provisionedClasses.length > 1 ? (
            <div className="inline-flex items-center gap-2 h-8 px-2.5 rounded-full bg-white border border-indigo-200/80 shadow-xs">
              <span className="px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase tracking-wider shrink-0">
                {provisionedClasses.length} Sections
              </span>
              <select
                aria-label="Switch active provisioned section"
                value={selectedClass?._id || ''}
                onChange={(e) => onSwitchClass?.(e.target.value)}
                className="bg-transparent text-xs font-bold text-navy focus:outline-none cursor-pointer pr-1"
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
            <div className="h-8 inline-flex items-center gap-2 px-3 rounded-full bg-white border border-zinc-200/90 shadow-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" aria-hidden="true" />
              <span className="text-xs font-bold text-navy leading-none">{classDisplayName}</span>
              <span className="text-[11px] font-medium text-zinc-500 leading-none">
                Sem {selectedClass.semester || 1}
              </span>
            </div>
          ) : null}

          <span className="h-8 inline-flex items-center px-2.5 rounded-full bg-white border border-zinc-200/80 text-[11px] font-bold text-zinc-600 tabular-nums">
            {progressPercent}%
          </span>

          {selectedClass && onReset && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={onReset}
              className="border border-zinc-200 bg-white text-zinc-600 hover:text-navy"
              title="Start configuring a new class"
            >
              <RotateCcw size={11} />
              <span className="hidden sm:inline">New Setup</span>
            </Button>
          )}
        </div>
      </div>

      {/* Hairline Continuous Progress Track */}
      <div
        role="progressbar"
        aria-valuenow={currentStep.number}
        aria-valuemin={1}
        aria-valuemax={totalSteps}
        aria-label={`Wizard progress: step ${currentStep.number} of ${totalSteps}`}
        className="h-0.5 w-full bg-zinc-200/80 rounded-full overflow-hidden"
      >
        <div
          className="h-full bg-navy transition-all duration-300 ease-out rounded-full"
          style={{ width: `${Math.max(8, progressPercent)}%` }}
        />
      </div>
    </header>
  );
};

export default WizardProgressHeader;
