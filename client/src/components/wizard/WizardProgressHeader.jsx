import React from 'react';
import { Check, Lock, Building2, Sparkles } from 'lucide-react';
import { ROLES } from '../../utils/constants';
import { formatSectionDisplayName } from '../../utils/formatters';

export const STEPS_CONFIG = [
  { id: 'class_info', number: 1, label: 'Class & Subjects', short: 'Setup' },
  { id: 'students', number: 2, label: 'Enrolled Students', short: 'Students' },
  { id: 'mentors', number: 3, label: 'Mentors Allocation', short: 'Mentors' },
  { id: 'electives', number: 4, label: 'Electives Mapping', short: 'Electives' },
  { id: 'preflight', number: 5, label: 'Review & Pre-Flight', short: 'Review' },
  { id: 'initiation', number: 6, label: 'Launch Clearance', short: 'Launch' },
];

const WizardProgressHeader = ({
  activeStepIndex,
  completedStepIds = [],
  onSelectStep,
  selectedClass,
  user,
}) => {
  const currentStep = STEPS_CONFIG[activeStepIndex] || STEPS_CONFIG[0];
  const totalSteps = STEPS_CONFIG.length;
  const progressPercent = Math.round(((completedStepIds.length) / totalSteps) * 100);

  const isHod = user?.role === ROLES.HOD || user?.role === 'hod';
  const deptName = user?.departmentName || user?.department?.name || user?.department || 'Department';

  const classDisplayName = selectedClass
    ? formatSectionDisplayName(selectedClass.name, selectedClass.semester)
    : '';

  return (
    <header className="space-y-3 pb-3 border-b border-zinc-200">
      {/* HoD Department Scope Indicator */}
      {isHod && (
        <div 
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-50/80 border border-indigo-200/60 text-indigo-900 text-xs font-medium"
          role="status"
          aria-label="Department Scope Indicator"
        >
          <Building2 size={14} className="text-indigo-600 shrink-0" aria-hidden="true" />
          <span className="font-bold">Head of Department:</span>
          <span className="font-extrabold text-indigo-950 uppercase">{deptName}</span>
          <span className="text-indigo-700 hidden sm:inline">· Department Records</span>
        </div>
      )}

      {/* Main Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-navy tracking-tight">
            Class Setup Wizard
          </h1>
          <p className="text-xs text-zinc-600 mt-0.5">
            Step-by-step setup to configure subjects, enrolled students, faculty mentors, and launch clearance.
          </p>
        </div>

        {/* Current Class Context Card */}
        {selectedClass && (
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white border border-zinc-200/90 shadow-xs self-start sm:self-auto">
            <div className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden="true" />
            <div className="text-left">
              <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider block">Selected Class</span>
              <p className="text-xs font-black text-navy leading-tight">
                {classDisplayName}
                <span className="text-zinc-600 font-semibold ml-1.5">
                  (Sem {selectedClass.semester || 1})
                </span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Progress Metric & Stepper Navigation */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-black text-navy uppercase tracking-wider text-[11px]">
              Step {currentStep.number} of {totalSteps}:
            </span>
            <span className="font-bold text-indigo-600">
              {currentStep.label}
            </span>
          </div>
          <div className="font-bold text-zinc-600 tabular-nums text-[11px]">
            {progressPercent}% completed ({completedStepIds.length}/{totalSteps})
          </div>
        </div>

        {/* Accessible Progress Bar */}
        <div
          role="progressbar"
          aria-valuenow={currentStep.number}
          aria-valuemin={1}
          aria-valuemax={totalSteps}
          aria-label={`Wizard progress: step ${currentStep.number} of ${totalSteps}`}
          className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden border border-zinc-200/60"
        >
          <div
            className="h-full bg-navy transition-all duration-300 ease-out rounded-full"
            style={{ width: `${Math.max(8, progressPercent)}%` }}
          />
        </div>

        {/* Step Badges */}
        <nav aria-label="Wizard Steps" className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-1.5 pt-1">
          {STEPS_CONFIG.map((step, idx) => {
            const isCompleted = completedStepIds.includes(step.id);
            const isActive = idx === activeStepIndex;
            const isFuture = !isCompleted && !isActive;

            return (
              <button
                key={step.id}
                type="button"
                onClick={() => isCompleted && onSelectStep(idx)}
                disabled={isFuture}
                aria-current={isActive ? 'step' : undefined}
                aria-label={`Step ${step.number}: ${step.label} (${isCompleted ? 'Completed' : isActive ? 'Active' : 'Locked'})`}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-left text-[11px] font-bold transition-all min-h-[38px]
                  ${isActive
                    ? 'bg-navy text-white shadow-xs font-black'
                    : isCompleted
                      ? 'bg-emerald-50 text-emerald-900 border border-emerald-300 hover:bg-emerald-100 cursor-pointer'
                      : 'bg-zinc-100 text-zinc-600 border border-zinc-200 cursor-not-allowed opacity-80'
                  }`}
              >
                <span className="shrink-0">
                  {isCompleted ? (
                    <Check size={12} className="text-emerald-800 stroke-[3]" aria-hidden="true" />
                  ) : isFuture ? (
                    <Lock size={11} className="text-zinc-500" aria-hidden="true" />
                  ) : (
                    <span className="w-3.5 h-3.5 flex items-center justify-center rounded-full bg-white/20 text-[9px] font-black">
                      {step.number}
                    </span>
                  )}
                </span>
                <span className="truncate">{step.short}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};

export default WizardProgressHeader;
