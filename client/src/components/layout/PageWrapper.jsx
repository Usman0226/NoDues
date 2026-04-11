import React from 'react';

const PageWrapper = ({ children, title, subtitle }) => {
  return (
    <div className="flex-1 min-w-0 p-4 sm:p-6 lg:p-10 fade-up">
      <div className="max-w-7xl mx-auto relative">
        <header className="mb-8 sm:mb-10 lg:mb-12">
          <p className="label-tech mb-2">Institutional Command Center</p>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-navy tracking-tight mb-2">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs sm:text-sm text-zinc-500 font-semibold uppercase tracking-[0.12em]">
              {subtitle}
            </p>
          )}
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
};

export default PageWrapper;
