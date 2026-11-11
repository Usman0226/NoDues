import React from 'react';
import BackHeader from '../ui/BackHeader';
import { useUI } from '../../hooks/useUI';

const PageWrapper = ({
  children,
  title,
  subtitle,
  tag,
  badge,
  meta,
  backTitle,
  backFallback,
  isRefreshing,
  headerActions
}) => {
  const { isFocusMode } = useUI();

  return (
    <div className={`flex-1 min-w-0 transition-all duration-500 fade-up max-w-full overflow-x-hidden relative ${isFocusMode ? 'p-2 sm:p-4 lg:p-6' : 'p-4 sm:p-6 lg:p-10'}`}>
      {isRefreshing && (
        <div className="fixed top-0 inset-x-0 z-[100] h-0.5 pointer-events-none">
          <div className="h-full bg-gold/80 animate-progress origin-left" />
        </div>
      )}
      <div className="max-w-7xl mx-auto relative">
        {backFallback && (
          <BackHeader title={backTitle || 'Back'} fallback={backFallback} />
        )}
        <header className={`transition-all duration-500 ${isFocusMode ? 'mb-4 lg:mb-6 opacity-40 hover:opacity-100' : 'mb-8 lg:mb-10'}`}>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 md:gap-6">
            <div className="space-y-1.5 min-w-0">
              {/* Optional Meta / Tag Bar (like CAI | A.Y. 2025-2026 | Date) */}
              {(tag || meta) && (
                <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-muted-foreground mb-1">
                  {tag && (
                    <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] font-black uppercase tracking-wider">
                      {tag}
                    </span>
                  )}
                  {meta && (
                    <span className="text-[11px] font-semibold text-slate-500">
                      {meta}
                    </span>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <h1 className={`font-black text-navy tracking-tighter leading-none transition-all duration-500 ${isFocusMode ? 'text-xl sm:text-2xl lg:text-3xl' : 'text-3xl sm:text-4xl lg:text-5xl'}`}>
                  {title}
                </h1>
                {badge && (
                  <div className="inline-flex items-center">
                    {typeof badge === 'string' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {badge}
                      </span>
                    ) : (
                      badge
                    )}
                  </div>
                )}
              </div>

              {subtitle && (
                <div className="flex items-center gap-2 pt-0.5">
                  <div className="h-0.5 w-5 bg-gold/50 rounded-full shrink-0" />
                  <div className="text-xs font-semibold text-muted-foreground tracking-wide">
                    {subtitle}
                  </div>
                </div>
              )}
            </div>

            {headerActions && (
              <div className="flex flex-wrap items-center gap-3 shrink-0">
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
