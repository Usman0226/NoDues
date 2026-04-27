import React from 'react';
import BackHeader from '../ui/BackHeader';

const PageWrapper = ({ children, title, subtitle, backTitle, backFallback, isRefreshing, headerActions }) => {
  return (
    <div className="flex-1 min-w-0 p-4 sm:p-6 lg:p-10 fade-up max-w-full overflow-x-hidden relative">
      {isRefreshing && (
        <div className="fixed top-0 inset-x-0 z-[100] h-0.5 pointer-events-none">
          <div className="h-full bg-gold/80 animate-progress origin-left" />
        </div>
      )}
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
                  <div className="hidden text-[10px] sm:text-[11px] font-black uppercase tracking-[0.2em] text-zinc-400">
                    {subtitle}
                  </div>
                </div>
              )}
            </div>
            {headerActions && (
              <div className="flex items-center gap-3">
                {headerActions}
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
