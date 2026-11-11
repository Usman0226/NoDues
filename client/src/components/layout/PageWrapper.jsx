import React from 'react';
import BackHeader from '../ui/BackHeader';
import { useUI } from '../../hooks/useUI';
import { CheckCircle2 } from 'lucide-react';

const PageWrapper = ({
  children,
  title,
  subtitle,
  subtitleIcon: SubtitleIcon,
  tag,
  badge,
  meta,
  backTitle,
  backFallback,
  isRefreshing,
  headerActions,
  cardHeader = false,
  stats = []
}) => {
  const { isFocusMode } = useUI();
  const showAsCard = cardHeader || stats.length > 0;

  return (
    <div className={`flex-1 min-w-0 transition-all duration-500 fade-up max-w-full overflow-x-hidden relative ${isFocusMode ? 'p-2 sm:p-4 lg:p-6' : 'p-4 sm:p-6 lg:p-8'}`}>
      {isRefreshing && (
        <div className="fixed top-0 inset-x-0 z-[100] h-0.5 pointer-events-none">
          <div className="h-full bg-gold/80 animate-progress origin-left" />
        </div>
      )}
      <div className="max-w-7xl mx-auto relative">
        {backFallback && (
          <BackHeader title={backTitle || 'Back'} fallback={backFallback} />
        )}

        {showAsCard ? (
          /* MITS IVMS Style Encapsulated Header Card */
          <header className={`bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-xs transition-all duration-300 ${isFocusMode ? 'mb-3 lg:mb-4' : 'mb-6'}`}>
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
              {/* Left Column: Metadata tag strip, Title, Subtitle with icon, Action Buttons */}
              <div className="space-y-2.5 min-w-0 flex-1">
                {/* Meta Pills Strip */}
                {(tag || meta) && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    {tag && (
                      <span className="px-2.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200/80 text-[11px] font-bold uppercase tracking-wider">
                        {tag}
                      </span>
                    )}
                    {tag && meta && <span className="text-slate-300 font-light">|</span>}
                    {meta && (
                      <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                        {meta}
                      </span>
                    )}
                  </div>
                )}

                {/* Title & Status Badge */}
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="font-black text-slate-900 tracking-tight text-xl sm:text-2xl lg:text-3xl leading-snug">
                    {title}
                  </h1>
                  {badge && (
                    <div className="inline-flex items-center">
                      {typeof badge === 'string' ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 size={13} className="text-emerald-600" /> {badge}
                        </span>
                      ) : (
                        badge
                      )}
                    </div>
                  )}
                </div>

                {/* Subtitle with Icon */}
                {subtitle && (
                  <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-500 font-medium">
                    {SubtitleIcon && <SubtitleIcon size={15} className="text-slate-400 shrink-0" />}
                    <span>{subtitle}</span>
                  </div>
                )}

                {/* Action Buttons Row */}
                {headerActions && (
                  <div className="flex flex-wrap items-center gap-2.5 pt-2">
                    {headerActions}
                  </div>
                )}
              </div>

              {/* Right Column: Quick Stats Cards */}
              {stats.length > 0 && (
                <div className="flex flex-wrap sm:flex-nowrap lg:flex-col gap-2.5 shrink-0 self-start">
                  {stats.map((s, idx) => {
                    const StatIcon = s.icon;
                    return (
                      <div 
                        key={idx} 
                        className="flex items-center gap-3 p-3 bg-slate-50/80 border border-slate-200/80 rounded-xl min-w-[150px] shadow-2xs"
                      >
                        {StatIcon && (
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${
                            s.color === 'rose'
                              ? 'bg-rose-50 text-rose-600 border-rose-100'
                              : s.color === 'emerald'
                              ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                              : s.color === 'amber'
                              ? 'bg-amber-50 text-amber-600 border-amber-100'
                              : 'bg-indigo-50 text-indigo-600 border-indigo-100'
                          }`}>
                            <StatIcon size={16} />
                          </div>
                        )}
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none">
                            {s.label}
                          </p>
                          <p className="text-base font-black text-slate-800 mt-1 leading-none">
                            {s.value}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </header>
        ) : (
          /* Standard Legacy Layout */
          <header className={`transition-all duration-500 ${isFocusMode ? 'mb-3 lg:mb-4 opacity-40 hover:opacity-100' : 'mb-5 lg:mb-6'}`}>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4">
              <div className="space-y-1 min-w-0">
                {(tag || meta) && (
                  <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-muted-foreground mb-0.5">
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
                  <h1 className={`font-black text-navy tracking-tight leading-none transition-all duration-500 ${isFocusMode ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl lg:text-4xl'}`}>
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
                    <div className="h-0.5 w-4 bg-gold rounded-full shrink-0" />
                    <div className="text-xs font-semibold text-muted-foreground tracking-wide">
                      {subtitle}
                    </div>
                  </div>
                )}
              </div>

              {headerActions && (
                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  {headerActions}
                </div>
              )}
            </div>
          </header>
        )}

        <main>{children}</main>
      </div>
    </div>
  );
};

export default PageWrapper;
