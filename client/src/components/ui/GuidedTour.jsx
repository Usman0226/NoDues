import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, X, Sparkles } from 'lucide-react';

const GuidedTour = ({ steps, active, onComplete, onSkip, tourId = 'default-tour' }) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [coords, setCoords] = useState(null);
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0, placement: 'bottom' });
  const tooltipRef = useRef(null);

  const currentStep = steps[currentStepIndex];

  const updateCoords = useCallback(() => {
    if (!active || !currentStep?.targetId) return;

    const el = document.getElementById(currentStep.targetId);
    if (el) {
      const rect = el.getBoundingClientRect();
      setCoords({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });

      // Position tooltip
      const padding = 20;
      const tooltipWidth = tooltipRef.current?.offsetWidth || 320;
      const tooltipHeight = tooltipRef.current?.offsetHeight || 150;
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;

      // Vertical placement logic
      const spaceBelow = windowHeight - rect.bottom;
      const spaceAbove = rect.top;
      const placement = spaceBelow < tooltipHeight + padding && spaceAbove > spaceBelow ? 'top' : 'bottom';

      // Horizontal clamping
      const targetCenterX = rect.left + rect.width / 2;
      let left = targetCenterX - tooltipWidth / 2;
      left = Math.max(16, Math.min(left, windowWidth - tooltipWidth - 16));

      let top = placement === 'bottom' ? rect.bottom + 16 : rect.top - tooltipHeight - 16;

      setTooltipPos({ top, left, placement });
      
      // Only scroll if not already in view
      if (rect.top < 0 || rect.bottom > windowHeight) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } else {
      setCoords(null);
    }
  }, [active, currentStep]);

  useEffect(() => {
    if (active) {
      // Delay visibility to allow layout to settle
      const timer = setTimeout(() => {
        setIsVisible(true);
        updateCoords();
      }, 300);

      window.addEventListener('scroll', updateCoords, true);
      window.addEventListener('resize', updateCoords);

      const observer = new ResizeObserver(updateCoords);
      if (currentStep?.targetId) {
        const target = document.getElementById(currentStep.targetId);
        if (target) observer.observe(target);
      }

      return () => {
        clearTimeout(timer);
        window.removeEventListener('scroll', updateCoords, true);
        window.removeEventListener('resize', updateCoords);
        observer.disconnect();
      };
    } else {
      setIsVisible(false);
    }
  }, [active, currentStepIndex, updateCoords, currentStep?.targetId]);

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
    setIsVisible(false);
    localStorage.setItem(`tour_completed_${tourId}`, 'true');
    onComplete?.();
  };

  const handleSkip = () => {
    setIsVisible(false);
    localStorage.setItem(`tour_completed_${tourId}`, 'true');
    onSkip?.();
  };

  if (!active || !isVisible) return null;

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none">
      {/* Spotlight Overlay */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 w-full h-full pointer-events-auto overflow-hidden"
      >
        {coords && coords.width !== undefined && (
          <motion.div
            className="absolute rounded-[16px] pointer-events-none"
            initial={{
              top: coords.top - 8,
              left: coords.left - 8,
              width: coords.width + 16,
              height: coords.height + 16,
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.75)"
            }}
            animate={{
              top: coords.top - 8,
              left: coords.left - 8,
              width: coords.width + 16,
              height: coords.height + 16,
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.75)"
            }}
            transition={{ type: "spring", damping: 30, stiffness: 200 }}
          />
        )}
      </motion.div>

      {/* Tooltip */}
      <AnimatePresence>
        {coords && (
          <motion.div
            ref={tooltipRef}
            key="tour-tooltip"
            layout
            initial={{ opacity: 0, y: tooltipPos.placement === 'bottom' ? 10 : -10, scale: 0.95 }}
            animate={{ 
              opacity: 1, 
              y: 0, 
              scale: 1,
              top: tooltipPos.top,
              left: tooltipPos.left
            }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="absolute w-[calc(100vw-32px)] sm:w-[360px] pointer-events-auto z-50"
          >
            <div className="bg-white rounded-[2rem] p-6 shadow-2xl border border-indigo-100 relative overflow-hidden group">
              {/* Decorative background */}
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-indigo-50 rounded-full blur-3xl opacity-50 group-hover:bg-indigo-100 transition-colors" />
              
              <AnimatePresence mode="wait">
                <motion.div 
                  key={currentStepIndex}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2 }}
                  className="relative z-10"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                        <Sparkles size={16} />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600/60">
                        Step {currentStepIndex + 1} of {steps.length}
                      </span>
                    </div>
                    <button 
                      onClick={handleSkip}
                      className="p-2 hover:bg-zinc-100 rounded-full transition-colors text-zinc-400 hover:text-zinc-600"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <h3 className="text-lg font-black text-navy mb-2 tracking-tight">
                    {currentStep.title}
                  </h3>
                  <p className="text-zinc-500 text-sm font-medium leading-relaxed mb-6">
                    {currentStep.content}
                  </p>

                  <div className="flex items-center justify-between gap-3">
                    <button
                      onClick={handleSkip}
                      className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest hover:text-zinc-600 transition-colors"
                    >
                      Skip Tour
                    </button>
                    
                    <div className="flex items-center gap-2">
                      {currentStepIndex > 0 && (
                        <button
                          onClick={handleBack}
                          className="p-3 rounded-2xl bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-all active:scale-95"
                        >
                          <ChevronLeft size={18} />
                        </button>
                      )}
                      <button
                        onClick={handleNext}
                        className="px-6 py-3 rounded-2xl bg-navy text-white font-black text-[10px] uppercase tracking-widest shadow-lg shadow-navy/20 hover:shadow-xl active:scale-95 flex items-center gap-2 transition-all"
                      >
                        {currentStepIndex === steps.length - 1 ? 'Finish' : 'Next'}
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Tooltip Arrow */}
            <div 
              className={`absolute left-1/2 -translate-x-1/2 w-4 h-4 bg-white border-indigo-100 rotate-45 z-[-1] ${
                tooltipPos.placement === 'bottom' 
                  ? '-top-2 border-t border-l' 
                  : '-bottom-2 border-b border-r'
              }`}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pulsing Highlight (Eye-catcher) */}
      {coords && (
        <motion.div
          animate={{
            top: coords.top - 8,
            left: coords.left - 8,
            width: coords.width + 16,
            height: coords.height + 16,
            scale: [1, 1.05, 1],
            opacity: [0.5, 0.2, 0.5]
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute border-2 border-indigo-500/30 rounded-2xl pointer-events-none"
        />
      )}
    </div>
  );
};

export default GuidedTour;
