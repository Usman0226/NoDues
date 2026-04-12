import React from 'react';

const PageWrapper = ({ children, title, subtitle, backLink }) => {
  return (
    <div className="flex-1 min-w-0 p-4 sm:p-6 lg:p-10 fade-up">
      <div className="max-w-7xl mx-auto relative">
        {backLink && (
          <div className="mb-4">
            {backLink}
          </div>
        )}
        <header className="mb-6 sm:mb-7 lg:mb-8">
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
