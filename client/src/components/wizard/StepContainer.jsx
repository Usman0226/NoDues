import React, { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, Lock, Edit3 } from 'lucide-react';
import Button from '../ui/Button';

/**
 * StepContainer — Progressive disclosure container for wizard steps.
 * - Completed steps collapse to a summary row with Edit affordance.
 * - Active step expands in a clean height+opacity transition.
 * - Locked future steps remain subtle inert placeholders.
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

  useEffect(() => {
    if (isActive && headingRef.current) {
      headingRef.current.focus({ preventScroll: true });
    }
  }, [isActive]);

  const motionTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.25, ease: [0.22, 1, 0.36, 1] };

  // 1. LOCKED / FUTURE STEP STATE
  if (isLocked) {
    return (
      <section
        aria-disabled="true"
        aria-label={`Step ${stepNumber} — ${title} (Locked)`}
        className="rounded-xl border border-zinc-200/60 bg-zinc-50/60 p-3 sm:p-3.5 opacity-60 cursor-not-allowed select-none transition-all"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-full bg-zinc-200 flex items-center justify-center text-zinc-500 font-bold text-xs" aria-hidden="true">
              <Lock size={12} />
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-bold text-zinc-600">
                Step {stepNumber} — {title}
              </h2>
            </div>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 px-2 py-0.5 rounded bg-zinc-100 border border-zinc-200">
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
        className="rounded-xl border border-emerald-200 bg-white p-3 sm:p-4 shadow-xs transition-all hover:border-emerald-300"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-start sm:items-center gap-2.5">
            <div 
              className="w-7 h-7 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-800 shrink-0 mt-0.5 sm:mt-0"
              aria-hidden="true"
            >
              <Check size={14} className="stroke-[3]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                  Completed
                </span>
                <h2 className="text-xs sm:text-sm font-bold text-navy">
                  Step {stepNumber} — {title}
                </h2>
              </div>
              {summary && (
                <p className="text-xs text-zinc-600 mt-0.5 font-medium">
                  {summary}
                </p>
              )}
            </div>
          </div>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onEdit}
            className="self-start sm:self-auto min-h-[34px] min-w-[64px] text-[10px] font-bold text-navy border-zinc-200 hover:bg-zinc-50 py-1 px-3"
            aria-label={`Edit Step ${stepNumber}: ${title}`}
          >
            <Edit3 size={11} className="mr-1" aria-hidden="true" />
            Edit
          </Button>
        </div>
      </section>
    );
  }

  // 3. ACTIVE STEP (EXPANDED)
  return (
    <motion.section
      key={`step-card-${stepId}`}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={motionTransition}
      aria-current="step"
      className="rounded-2xl border-2 border-navy/20 bg-white p-4 sm:p-6 shadow-sm ring-2 ring-navy/5 transition-all overflow-hidden"
    >
      {/* Active Step Heading */}
      <div className="border-b border-zinc-100 pb-3.5 mb-4">
        <div className="flex items-center gap-1.5 mb-1 text-[11px] font-bold text-indigo-600">
          <span>STEP {stepNumber} OF 7</span>
          <span className="text-zinc-300">·</span>
          <span className="text-zinc-500 uppercase">In Progress</span>
        </div>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-lg sm:text-xl font-black text-navy tracking-tight outline-none"
        >
          {title}
        </h2>
        {subtitle && (
          <p className="text-xs text-zinc-500 mt-0.5">
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
