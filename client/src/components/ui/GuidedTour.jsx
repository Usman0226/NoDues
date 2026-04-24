import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, X, Sparkles } from 'lucide-react';

const GuidedTour = ({ steps, onComplete, onSkip, onStepChange, tourId = 'default-tour' }) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [coords, setCoords] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0, placement: 'bottom' });
  const tooltipRef = useRef(null);

  useEffect(() => {
    onStepChange?.(currentStepIndex);
  }, [currentStepIndex, onStepChange]);

  const currentStep = steps[currentStepIndex];

  const updateCoords = useCallback(() => {
    if (!currentStep?.targetId) return;

    const el = document.getElementById(currentStep.targetId);
    if (el) {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const isFixed = style.position === 'fixed' || style.position === 'sticky';

      setCoords({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });

      // Position tooltip
      const padding = 16;
      const tooltipWidth = tooltipRef.current?.offsetWidth || 380;
      const tooltipHeight = tooltipRef.current?.offsetHeight || 200;
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;

      const spaceBelow = windowHeight - rect.bottom;
      const spaceAbove = rect.top;
      
      const placement = (spaceBelow < tooltipHeight + padding && spaceAbove > spaceBelow) ? 'top' : 'bottom';

      const targetCenterX = rect.left + rect.width / 2;
      let left = targetCenterX - tooltipWidth / 2;
      left = Math.max(padding, Math.min(left, windowWidth - tooltipWidth - padding));

      let top = placement === 'bottom' ? rect.bottom + 24 : rect.top - tooltipHeight - 24;
      
      if (top < padding) top = padding;
      if (top + tooltipHeight > windowHeight - padding) {
        top = windowHeight - tooltipHeight - padding;
      }

      setTooltipPos({ top, left, placement });
      
      if (!isFixed && (rect.top < 0 || rect.bottom > windowHeight)) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } else {
      setCoords(null);
      // Fallback: Center of screen
      setTooltipPos({ 
        top: (window.innerHeight - 250) / 2, 
        left: (window.innerWidth - 380) / 2, 
        placement: 'center' 
      });
    }
  }, [currentStep]);

  useEffect(() => {
    // Small delay to allow initial rendering to settle
    const timer = setTimeout(updateCoords, 100);

    window.addEventListener('scroll', updateCoords, { passive: true });
    window.addEventListener('resize', updateCoords);

    const observer = new ResizeObserver(updateCoords);
    if (currentStep?.targetId) {
      const target = document.getElementById(currentStep.targetId);
      if (target) observer.observe(target);
    }

    return () => {
      clearTimeout(timer);
      window.removeEventListener('scroll', updateCoords);
      window.removeEventListener('resize', updateCoords);
      observer.disconnect();
    };
  }, [currentStepIndex, updateCoords, currentStep?.targetId]);

  const handleNext = () => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(prev => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1);
    }
  };

  const handleComplete = () => {
    localStorage.setItem(`tour_completed_${tourId}`, 'true');
    onComplete?.();
  };

  const handleSkip = () => {
    localStorage.setItem(`tour_completed_${tourId}`, 'true');
    onSkip?.();
  };

  return createPortal(
    <motion.div 
      key="tour-root"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, pointerEvents: 'none' }}
      className="fixed inset-0 z-[9999] select-none overflow-hidden"
    >
          {/* Background Overlay & Spotlight */}
          <div 
            className="absolute inset-0 w-full h-full pointer-events-auto bg-transparent transition-colors duration-500"
            onClick={handleSkip}
          >
            <div className="sr-only">Guided walkthrough in progress. Click overlay to skip.</div>
            {coords && (
              <motion.div
                className="absolute rounded-[24px] pointer-events-none ring-[9999px] ring-slate-950/70 shadow-[inset_0_0_120px_rgba(0,0,0,0.5)]"
                initial={false}
                animate={{
                  top: coords.top - 12,
                  left: coords.left - 12,
                  width: coords.width + 24,
                  height: coords.height + 24,
                }}
                transition={{ type: "spring", damping: 30, stiffness: 200 }}
              />
            )}
          </div>

          {/* Tooltip Content Container */}
          <div className="absolute inset-0 pointer-events-none">
            <motion.div
              ref={tooltipRef}
              key="tour-tooltip"
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ 
                opacity: 1, 
                y: 0, 
                scale: 1,
                top: tooltipPos.top,
                left: tooltipPos.left
              }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="absolute w-[calc(100vw-32px)] sm:w-[380px] pointer-events-auto z-[10000]"
            >
              <div className="bg-white rounded-[2.5rem] p-7 shadow-[0_40px_120px_rgba(0,0,0,0.4)] border border-indigo-100 relative overflow-hidden group">
                {/* Decorative background gradients */}
                <div className="absolute -top-12 -right-12 w-40 h-40 bg-indigo-50/50 rounded-full blur-3xl opacity-60 group-hover:bg-indigo-100 transition-colors" />
                <div className="absolute -bottom-12 -left-12 w-40 h-40 bg-blue-50/30 rounded-full blur-3xl opacity-40" />
                
                <AnimatePresence mode="wait">
                  <motion.div 
                    key={currentStepIndex}
                    initial={{ opacity: 0, x: 15 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -15 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    className="relative z-10 flex flex-col max-h-[70vh]"
                  >
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-indigo-50 to-white border border-indigo-100/50 flex items-center justify-center text-indigo-600 shadow-sm">
                          <Sparkles size={20} />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black uppercase tracking-[0.25em] text-indigo-600 leading-none mb-1">
                            Walkthrough
                          </span>
                          <span className="text-[11px] font-bold text-zinc-400">
                            Step {currentStepIndex + 1} / {steps.length}
                          </span>
                        </div>
                      </div>
                      <button 
                        onClick={handleSkip}
                        className="p-2.5 hover:bg-zinc-100 rounded-full transition-colors text-zinc-400 hover:text-zinc-600"
                        aria-label="Close tour"
                      >
                        <X size={20} />
                      </button>
                    </div>

                    <div className="overflow-y-auto no-scrollbar pr-1 flex-1">
                      <h3 className="text-2xl font-black text-navy mb-3 tracking-tight leading-tight">
                        {currentStep.title}
                      </h3>
                      <p className="text-zinc-500 text-sm font-medium leading-relaxed mb-8">
                        {currentStep.content}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-4 pt-5 mt-auto border-t border-zinc-50">
                      <button
                        onClick={handleSkip}
                        className="text-[10px] font-black text-zinc-400 hover:text-indigo-600 uppercase tracking-widest transition-colors px-2 py-2"
                      >
                        Skip Tour
                      </button>
                      
                      <div className="flex items-center gap-2.5">
                        {currentStepIndex > 0 && (
                          <button
                            onClick={handleBack}
                            className="p-3.5 rounded-2xl bg-zinc-50 text-zinc-600 hover:bg-zinc-100 transition-all active:scale-95 border border-zinc-200/50"
                            title="Previous step"
                          >
                            <ChevronLeft size={20} />
                          </button>
                        )}
                        <button
                          onClick={handleNext}
                          className="px-8 py-3.5 rounded-2xl bg-navy text-white font-black text-[11px] uppercase tracking-widest shadow-[0_12px_24px_rgba(2,6,23,0.2)] hover:shadow-[0_15px_30px_rgba(2,6,23,0.3)] active:scale-95 flex items-center gap-2.5 transition-all border border-white/10"
                        >
                          {currentStepIndex === steps.length - 1 ? 'Complete' : 'Continue'}
                          <ChevronRight size={18} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>

              {coords && (
                <div 
                  className={`absolute left-1/2 -translate-x-1/2 w-4 h-4 bg-white border-indigo-100 rotate-45 z-[-1] hidden sm:block ${
                    tooltipPos.placement === 'bottom' 
                      ? '-top-2 border-t border-l shadow-[-4px_-4px_10px_rgba(0,0,0,0.02)]' 
                      : '-bottom-2 border-b border-r shadow-[4px_4px_10px_rgba(0,0,0,0.02)]'
                  }`}
                />
              )}
            </motion.div>
          </div>

          {/* Highlight Outline (Static for less distraction) */}
          {coords && (
            <motion.div
              initial={false}
              animate={{
                top: coords.top - 16,
                left: coords.left - 16,
                width: coords.width + 32,
                height: coords.height + 32,
              }}
              transition={{ type: "spring", damping: 30, stiffness: 200 }}
              className="absolute border-[4px] border-indigo-500 rounded-[28px] pointer-events-none shadow-[0_0_30px_rgba(99,102,241,0.3)] opacity-60"
            />
          )}
        </motion.div>,
    document.body
  );
};

export default GuidedTour;