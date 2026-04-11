import React from 'react';
import { motion } from 'framer-motion';

const PageWrapper = ({ children, title, subtitle }) => {
  return (
    <motion.main
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto w-full"
    >
      {(title || subtitle) && (
        <div className="mb-6 lg:mb-10">
          {title && (
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-serif text-navy mb-1 lg:mb-2 tracking-tight">
              {title}
            </h1>
          )}
          {subtitle && (
            <p className="tagline text-muted-foreground text-sm lg:text-lg italic">
              {subtitle}
            </p>
          )}
        </div>
      )}
      {children}
    </motion.main>
  );
};

export default PageWrapper;
