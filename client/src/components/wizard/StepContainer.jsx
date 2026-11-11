import React, { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * StepContainer — Unified single-panel section container for the active wizard step.
 * Keeps header fixed, delegates internal scroll to step content when needed, and fits within viewport.
 */
const StepContainer = ({
  stepId,
  title,
  subtitle,
  badge,
  headerRight,
  children,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const headingRef = useRef(null);

  useEffect(() => {
    if (headingRef.current) {
      headingRef.current.focus({ preventScroll: true });
    }
  }, [stepId]);

  return (
    <motion.section
      key={`step-panel-${stepId}`}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      aria-current="step"
      className="flex-1 min-h-0 flex flex-col rounded-2xl border border-zinc-200/90 bg-white shadow-sm overflow-hidden"
    >
      {/* Compact Step Section Header */}
      <div className="shrink-0 px-4 sm:px-5 py-3 border-b border-zinc-100 bg-zinc-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="text-base sm:text-lg font-black text-navy tracking-tight outline-none leading-tight"
            >
              {title}
            </h2>
            {badge && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200/70">
                {badge}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-xs text-zinc-500 mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
        {headerRight && <div className="shrink-0">{headerRight}</div>}
      </div>

      {/* Step Content (Manages own internal scroll & sticky action footer) */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{children}</div>
    </motion.section>
  );
};

export default StepContainer;
