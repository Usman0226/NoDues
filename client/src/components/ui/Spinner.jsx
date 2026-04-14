import React from 'react';
import { motion } from 'framer-motion';

const Spinner = ({ size = 'md', className = '' }) => {
  const sizes = { 
    sm: 'h-4 w-4 border-2', 
    md: 'h-8 w-8 border-[3px]', 
    lg: 'h-12 w-12 border-4' 
  };
  
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div className={`${sizes[size]} animate-spin rounded-full border-muted/30 border-t-navy shadow-sm`} />
    </div>
  );
};

export const PageSpinner = ({ message = "Syncing Academic Records..." }) => {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white/80 backdrop-blur-xl overflow-hidden">
      {/* Background Texture */}
      <div className="absolute inset-0 grid-overlay opacity-[0.25] pointer-events-none" />
      
      {/* Central Branded Element */}
      <div className="relative flex flex-col items-center">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ 
            scale: [0.98, 1.02, 0.98],
            opacity: 1
          }}
          transition={{ 
            scale: { duration: 3, repeat: Infinity, ease: "easeInOut" },
            opacity: { duration: 0.5 }
          }}
          className="mb-8"
        >
          <h2 className="text-6xl md:text-8xl font-brand text-navy tracking-tighter select-none">
            No<span className="text-gold">Dues</span>
          </h2>
        </motion.div>

        {/* Loading Indicator */}
        <div className="relative h-1 w-48 bg-zinc-100 rounded-full overflow-hidden shadow-inner">
          <motion.div
            className="absolute top-0 bottom-0 left-0 bg-gold"
            initial={{ width: "0%", left: "0%" }}
            animate={{ 
              width: ["0%", "40%", "0%"],
              left: ["0%", "30%", "100%"]
            }}
            transition={{ 
              duration: 2, 
              repeat: Infinity, 
              ease: "easeInOut" 
            }}
          />
        </div>

        {/* Message */}
        <motion.p 
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-8 text-[10px] uppercase font-black tracking-[0.4em] text-muted-foreground/50 text-center"
        >
          {message}
        </motion.p>
      </div>

      {/* Footer Branding */}
      <div className="absolute bottom-12 flex flex-col items-center opacity-30 select-none">
        <p className="text-[8px] uppercase tracking-[0.3em] font-black text-navy mb-1">Architecture by</p>
        <p className="text-[10px] font-brand text-navy flex items-center gap-1.5 font-bold">
          ARC Club <span className="h-0.5 w-0.5 rounded-full bg-gold" /> Community
        </p>
      </div>
    </div>
  );
};

export default Spinner;
