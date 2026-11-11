import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PanelLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { useNavigationStack } from '../../hooks/useNavigationStack';
import { useUI } from '../../hooks/useUI';

export default function BreadcrumbNav({ onMenuToggle }) {
  const { breadcrumbs } = useNavigationStack();
  const { sidebarCollapsed, setSidebarCollapsed } = useUI();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setMobileMenuOpen(false);
      }
    };
    if (mobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [mobileMenuOpen]);

  const handleToggleSidebar = () => {
    if (window.innerWidth < 1024) {
      onMenuToggle?.();
    } else {
      setSidebarCollapsed(!sidebarCollapsed);
    }
  };

  if (!breadcrumbs || breadcrumbs.length === 0) return null;

  const rootCrumb = breadcrumbs[0];
  const currentCrumb = breadcrumbs[breadcrumbs.length - 1];
  const middleCrumbs = breadcrumbs.slice(1, -1);

  return (
    <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 max-w-full">
      {/* Sidebar / Panel Toggle Icon Button */}
      <button
        type="button"
        onClick={handleToggleSidebar}
        className="p-1.5 rounded-lg text-slate-500 hover:text-navy hover:bg-slate-100 transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        title={sidebarCollapsed ? 'Expand Navigation Sidebar' : 'Collapse Navigation Sidebar'}
        aria-label="Toggle Navigation Sidebar"
      >
        <PanelLeft size={17} className="transition-transform duration-200" />
      </button>

      {/* Subtle Divider */}
      <div className="h-4 w-px bg-slate-200 mx-0.5 sm:mx-1 shrink-0" />

      {/* Desktop Breadcrumb Navigation Stack */}
      <nav aria-label="Breadcrumbs" className="hidden sm:flex items-center gap-1.5 min-w-0">
        {breadcrumbs.map((crumb, idx) => {
          const isLast = idx === breadcrumbs.length - 1;
          const isFirst = idx === 0;

          return (
            <React.Fragment key={`${crumb.label}-${idx}`}>
              {idx > 0 && (
                <ChevronRight size={13} className="text-slate-400 shrink-0 select-none" strokeWidth={2.2} />
              )}
              {isLast ? (
                <span
                  className="text-xs font-bold text-slate-900 tracking-tight truncate max-w-[140px] md:max-w-[220px] lg:max-w-[360px]"
                  title={crumb.label}
                  aria-current="page"
                >
                  {crumb.label}
                </span>
              ) : (
                <Link
                  to={crumb.path || '#'}
                  className={`text-xs font-semibold text-slate-500 hover:text-navy hover:underline underline-offset-4 transition-colors truncate max-w-[110px] md:max-w-[180px] lg:max-w-[260px] ${
                    isFirst ? 'font-bold tracking-tight text-slate-600' : ''
                  }`}
                  title={crumb.label}
                >
                  {crumb.label}
                </Link>
              )}
            </React.Fragment>
          );
        })}
      </nav>

      {/* Mobile Responsive Breadcrumb Navigation (Collapses middle crumbs on small screens) */}
      <nav aria-label="Mobile Breadcrumbs" className="flex sm:hidden items-center gap-1 min-w-0">
        {breadcrumbs.length <= 2 ? (
          // 1 or 2 crumbs: render directly
          breadcrumbs.map((crumb, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            return (
              <React.Fragment key={`${crumb.label}-m-${idx}`}>
                {idx > 0 && <ChevronRight size={12} className="text-slate-400 shrink-0" strokeWidth={2.2} />}
                {isLast ? (
                  <span className="text-xs font-bold text-slate-900 truncate max-w-[130px]" title={crumb.label}>
                    {crumb.label}
                  </span>
                ) : (
                  <Link to={crumb.path || '#'} className="text-xs font-semibold text-slate-500 truncate max-w-[90px]">
                    {crumb.label}
                  </Link>
                )}
              </React.Fragment>
            );
          })
        ) : (
          // 3+ crumbs: Root > [...] > Current
          <>
            <Link to={rootCrumb.path || '#'} className="text-xs font-bold text-slate-600 truncate max-w-[70px]">
              {rootCrumb.label}
            </Link>
            <ChevronRight size={12} className="text-slate-400 shrink-0" strokeWidth={2.2} />

            {/* Ellipsis dropdown for intermediate levels */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-navy transition-colors flex items-center"
                title="Show navigation path"
                aria-label="Show intermediate path"
              >
                <MoreHorizontal size={14} />
              </button>

              {mobileMenuOpen && (
                <div className="absolute left-0 mt-1 w-48 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                    Navigation Stack
                  </div>
                  {middleCrumbs.map((crumb, mIdx) => (
                    <Link
                      key={`mid-${mIdx}`}
                      to={crumb.path || '#'}
                      onClick={() => setMobileMenuOpen(false)}
                      className="block px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-navy transition-colors truncate"
                    >
                      {crumb.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <ChevronRight size={12} className="text-slate-400 shrink-0" strokeWidth={2.2} />
            <span className="text-xs font-bold text-slate-900 truncate max-w-[130px]" title={currentCrumb.label}>
              {currentCrumb.label}
            </span>
          </>
        )}
      </nav>
    </div>
  );
}

