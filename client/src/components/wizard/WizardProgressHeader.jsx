import React from 'react';
import { Check, Lock, Building2, Sparkles, ChevronRight } from 'lucide-react';
import { ROLES } from '../../utils/constants';

export const STEPS_CONFIG = [
  { id: 'class_info', number: 1, label: 'Class Info', short: 'Class' },
  { id: 'timetable_subjects', number: 2, label: 'Timetable', short: 'Timetable' },
  { id: 'students', number: 3, label: 'Students', short: 'Students' },
  { id: 'mentors', number: 4, label: 'Mentors', short: 'Mentors' },
  { id: 'electives', number: 5, label: 'Electives', short: 'Electives' },
  { id: 'preflight', number: 6, label: 'Pre-flight', short: 'Pre-flight' },
  { id: 'initiation', number: 7, label: 'Initiate', short: 'Initiate' },
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

  return (
    <header className="space-y-4 pb-4 border-b border-zinc-200">
      {/* HoD Department Scope Indicator (DESIGN.md §9 & §262) */}
      {isHod && (
        <div 
          className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-indigo-50 border border-indigo-200/80 text-indigo-900 text-xs font-medium shadow-sm"
          role="status"
          aria-label="Department Scope Indicator"
        >
          <Building2 size={16} className="text-indigo-600 shrink-0" aria-hidden="true" />
          <span className="font-bold tracking-tight">Viewing as Head of Department:</span>
          <span className="font-black text-indigo-950 uppercase tracking-wide">{deptName}</span>
          <span className="text-indigo-700 hidden sm:inline font-medium">· Scoped to your department records</span>
        </div>
      )}

      {/* Main Header Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="page-kicker">ACADEMIC ONBOARDING</span>
            <span className="text-zinc-300">/</span>
            <span className="label-tech text-indigo-600">SETUP WIZARD</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-navy tracking-tight mt-1">
            Class Setup & Onboarding Wizard
          </h1>
          <p className="text-sm text-zinc-600 mt-0.5">
            Step-by-step guided setup to configure subjects, roster, mentors, and clearance pre-flight.
          </p>
        </div>

        {/* Current Class Context Card */}
        {selectedClass && (
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white border border-zinc-200 shadow-sm self-start md:self-auto">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-pulse" aria-hidden="true" />
            <div className="text-left">
              <p className="text-[10px] uppercase font-bold text-zinc-600 tracking-wider">Active Section</p>
              <p className="text-xs font-black text-navy tracking-tight">
                {selectedClass.name}
                <span className="text-zinc-600 font-medium ml-1.5">
                  (Sem {selectedClass.semester || 1})
                </span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Progress Metric & Stepper Navigation */}
      <div className="pt-2 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-extrabold uppercase tracking-wider text-navy">
              Step {currentStep.number} of {totalSteps}:
            </span>
            <span className="text-xs font-bold text-indigo-700">
              {currentStep.label}
            </span>
          </div>
          <div className="text-xs font-bold text-zinc-700 tabular-nums">
            {progressPercent}% Complete ({completedStepIds.length}/{totalSteps} steps)
          </div>
        </div>

        {/* Accessible Progress Bar */}
        <div
          role="progressbar"
          aria-valuenow={currentStep.number}
          aria-valuemin={1}
          aria-valuemax={totalSteps}
          aria-label={`Wizard progress: step ${currentStep.number} of ${totalSteps}`}
          className="h-2 w-full bg-zinc-100 rounded-full overflow-hidden border border-zinc-200/60"
        >
          <div
            className="h-full bg-indigo-600 transition-all duration-500 ease-out rounded-full"
            style={{ width: `${Math.max(10, progressPercent)}%` }}
          />
        </div>

        {/* Step Badges (Progressive Disclosure Map) */}
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
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-left text-[11px] font-bold transition-all min-h-[44px]
                  ${isActive
                    ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-600/30 font-black'
                    : isCompleted
                      ? 'bg-emerald-50 text-emerald-900 border border-emerald-300 hover:bg-emerald-100 cursor-pointer'
                      : 'bg-zinc-100 text-zinc-700 border border-zinc-300 cursor-not-allowed opacity-90'
                  }`}
              >
                <span className="shrink-0">
                  {isCompleted ? (
                    <Check size={12} className="text-emerald-800 stroke-[3]" aria-hidden="true" />
                  ) : isFuture ? (
                    <Lock size={11} className="text-zinc-600" aria-hidden="true" />
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
