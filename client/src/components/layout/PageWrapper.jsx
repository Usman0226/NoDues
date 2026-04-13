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
        <header className="mb-6 sm:mb-7 lg:mb-8">
          <p className="page-kicker mb-2">NoDues overview</p>
          <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2 sm:gap-4">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-navy tracking-tight shrink-0">
              {title}
            </h1>
            {subtitle && (
              <div className="text-xs sm:text-sm text-zinc-500 font-medium text-left sm:text-right leading-snug max-w-xl">
                {subtitle}
              </div>
            )}
          </div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
};

export default PageWrapper;
