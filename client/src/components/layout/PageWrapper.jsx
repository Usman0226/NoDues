import React from 'react';
import BackHeader from '../ui/BackHeader';

/**
 * PageWrapper - Consistent layout container for all pages.
 * @param {string} title - Page title
 * @param {string} subtitle - Optional page subtitle
 * @param {string} backTitle - Label for the back button
 * @param {string} backFallback - Fallback route for the back button
 */
const PageWrapper = ({ children, title, subtitle, backTitle, backFallback }) => {
  return (
    <div className="flex-1 min-w-0 p-4 sm:p-6 lg:p-10 fade-up">
      <div className="max-w-7xl mx-auto relative">
        {backFallback && (
          <BackHeader title={backTitle || 'Back'} fallback={backFallback} />
        )}
        <header className="mb-8 lg:mb-10">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 md:gap-6">
            <div className="space-y-1">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-navy tracking-tighter leading-none">
                {title}
              </h1>
              {subtitle && (
                <div className="flex items-center gap-2">
                  <div className="h-0.5 w-6 bg-gold/40 rounded-full" />
                  <p className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.2em] text-zinc-400">
                    {subtitle}
                  </p>
                </div>
              )}
            </div>
          </div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
};

export default PageWrapper;
