import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Check, Lock, Edit3, ChevronDown } from 'lucide-react';
import Button from '../ui/Button';

/**
 * StepContainer — Enforces progressive disclosure per DESIGN.md Part 2 §6.
 * - Completed steps collapse to a summary row with Edit affordance.
 * - Active step expands in a single choreographed height+opacity motion.
 * - Locked future steps remain visible but inert placeholders.
 */
const StepContainer = ({
  stepNumber,
  stepId,
  title,
  subtitle,
  summary,
  isActive,
  isCompleted,
  isLocked,
  onEdit,
  children,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const headingRef = useRef(null);

  // Focus management: when step becomes active, move focus to its heading (DESIGN.md §15)
  useEffect(() => {
    if (isActive && headingRef.current) {
      headingRef.current.focus({ preventScroll: true });
    }
  }, [isActive]);

  const motionTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.35, ease: [0.22, 1, 0.36, 1] };

  // 1. LOCKED / FUTURE STEP STATE
  if (isLocked) {
    return (
      <section
        aria-disabled="true"
        aria-label={`Step ${stepNumber} — ${title} (Locked)`}
        className="rounded-2xl border border-zinc-200/60 bg-zinc-50/50 p-4 sm:p-5 opacity-60 cursor-not-allowed select-none transition-all"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-zinc-200 flex items-center justify-center text-zinc-600 font-bold text-xs" aria-hidden="true">
              <Lock size={14} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-700 tracking-tight">
                Step {stepNumber} — {title}
              </h2>
              <p className="text-xs text-zinc-600 font-medium">Locked until previous steps are completed</p>
            </div>
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-zinc-700 px-2 py-1 rounded bg-zinc-100 border border-zinc-300">
            Locked
          </span>
        </div>
      </section>
    );
  }

  // 2. COMPLETED STEP (COLLAPSED WITH EDIT AFFORDANCE)
  if (isCompleted && !isActive) {
    return (
      <section
        aria-label={`Step ${stepNumber} — ${title} (Completed)`}
        className="rounded-2xl border border-emerald-200/80 bg-white p-4 sm:p-5 shadow-sm transition-all hover:border-emerald-300"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <div 
              className="w-8 h-8 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-700 shrink-0 mt-0.5 sm:mt-0"
              aria-hidden="true"
            >
              <Check size={16} className="stroke-[3]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Completed
                </span>
                <h2 className="text-sm font-bold text-navy tracking-tight">
                  Step {stepNumber} — {title}
                </h2>
              </div>
              {summary && (
                <div className="text-xs text-zinc-600 mt-1 font-medium">
                  {summary}
                </div>
              )}
            </div>
          </div>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onEdit}
            className="self-start sm:self-auto min-h-[44px] min-w-[70px] text-[10px] font-black tracking-wider text-indigo-700 border-indigo-200 hover:bg-indigo-50"
            aria-label={`Edit Step ${stepNumber}: ${title}`}
          >
            <Edit3 size={13} className="mr-1" aria-hidden="true" />
            Edit
          </Button>
        </div>
      </section>
    );
  }

  // 3. ACTIVE STEP (EXPANDED WITH CHOREOGRAPHED MOTION)
  return (
    <motion.section
      key={`step-card-${stepId}`}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={motionTransition}
      aria-current="step"
      className="rounded-2xl border-2 border-indigo-500/40 bg-white p-5 md:p-8 shadow-xl shadow-indigo-500/5 ring-4 ring-indigo-500/5 transition-all overflow-hidden"
    >
      {/* Active Step Heading */}
      <div className="border-b border-zinc-100 pb-5 mb-6">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="label-tech text-indigo-700 font-black">
            ACTIVE STEP {stepNumber} OF 7
          </span>
          <span className="text-zinc-400">·</span>
          <span className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider">
            In Progress
          </span>
        </div>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-xl md:text-2xl font-extrabold text-navy tracking-tight outline-none focus:ring-2 focus:ring-indigo-500/40 rounded-lg px-1 -ml-1"
        >
          {title}
        </h2>
        {subtitle && (
          <p className="text-xs md:text-sm text-zinc-600 mt-1 font-medium">
            {subtitle}
          </p>
        )}
      </div>

      {/* Step Body */}
      <div>{children}</div>
    </motion.section>
  );
};

export default StepContainer;
