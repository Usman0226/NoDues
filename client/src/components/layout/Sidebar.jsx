import React, { useState, useEffect, useMemo, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth';
import { useUI } from '../../hooks/useUI';
import { ROLES } from '../../utils/constants';
import {
  LayoutDashboard, Users, BookOpen, ClipboardCheck,
  Shield, History, ChevronRight,
  Building2, AlertTriangle, Layers, X, GraduationCap, Inbox, MessageSquarePlus, MessageSquare, Wand2
} from 'lucide-react';
import { useFeedback } from '../../hooks/useFeedback';
import FeedbackModal from '../Feedback/FeedbackModal';
import { formatRole } from '../../utils/formatters';
import { useSetupWizardFlag } from '../../hooks/useFeatureFlag';

const NAV_CONFIG = {
  [ROLES.ADMIN]: [
    { label: 'General', icon: LayoutDashboard, items: [
      { label: 'Dashboard', path: '/admin', icon: LayoutDashboard },
      { label: 'Email Monitor', path: '/admin/email-monitor', icon: Inbox },
      { label: 'User Feedback', path: '/admin/feedback', icon: MessageSquare },
    ]},
    { label: 'Management', icon: Building2, items: [
      { label: 'Departments', path: '/admin/departments', icon: Building2 },
      { label: 'Faculty', path: '/admin/faculty', icon: Users },
      { label: 'Students', path: '/admin/students', icon: Users },
    ]},
    { label: 'Academic', icon: BookOpen, items: [
      { label: 'Setup Wizard', path: '/admin/setup', icon: Wand2 },
      { label: 'Subjects', path: '/admin/subjects', icon: BookOpen },
      { label: 'Batches', path: '/admin/batches', icon: Layers },
      { label: 'Co-Curricular', path: '/admin/co-curricular', icon: ClipboardCheck },
    ]},
  ],
  [ROLES.HOD]: [
    { label: 'Dashboard', path: '/hod', icon: LayoutDashboard },
    { label: 'My Classes', path: '/hod/my-classes', icon: GraduationCap },
    { label: 'Approvals (Dept.)', path: '/faculty/pending', icon: ClipboardCheck },
    { label: 'Academic', icon: BookOpen, items: [
      { label: 'Classes', path: '/hod/classes', icon: GraduationCap },
      { label: 'Setup Wizard', path: '/hod/setup', icon: Wand2 },
      { label: 'Subjects', path: '/hod/subjects', icon: BookOpen },
      { label: 'Co-Curricular', path: '/hod/co-curricular', icon: ClipboardCheck },
    ]},
    { label: 'Management', icon: Users, items: [
      { label: 'Students', path: '/hod/students', icon: Users },
      { label: 'Faculty', path: '/hod/faculty', icon: Users },
    ]},
    { label: 'No Dues', icon: ClipboardCheck, items: [
      { label: 'Dues', path: '/hod/dues', icon: AlertTriangle },
      { label: 'Overrides', path: '/hod/overrides', icon: Shield },
      { label: 'Batches', path: '/hod/batches', icon: Layers },
    ]},
    {label: 'System', icon: LayoutDashboard, items: [
      { label: 'Action History', path: '/faculty/history', icon: History },
    ]},
  ],
  [ROLES.FACULTY]: [
    { label: 'Pending', path: '/faculty/pending', icon: ClipboardCheck },
    { label: 'My Classes', path: '/faculty/classes', icon: GraduationCap },
    { label: 'History', path: '/faculty/history', icon: History },
  ],
};

NAV_CONFIG[ROLES.AO] = NAV_CONFIG[ROLES.HOD];

const isNavItemActive = (itemPath, pathname) => {
  if (itemPath === '/hod/classes') {
    return pathname.startsWith('/hod/classes') || pathname.includes('/hod/class/');
  }
  if (itemPath === '/hod/my-classes') {
    return pathname.startsWith('/hod/my-classes');
  }
  if (itemPath === '/admin/setup' || itemPath === '/hod/setup') {
    return pathname.startsWith('/admin/setup') || pathname.startsWith('/hod/setup');
  }
  if (['/admin', '/hod', '/faculty'].includes(itemPath)) {
    return pathname === itemPath;
  }
  return (
    pathname === itemPath ||
    (itemPath.endsWith('/batches') && pathname.includes('/batch/')) ||
    (itemPath !== '/' && pathname.startsWith(`${itemPath}/`))
  );
};

const SidebarLink = ({ item, collapsed, location, onMobileClose }) => {
  const isActive = isNavItemActive(item.path, location.pathname);
  const Icon = item.icon;

  return (
    <NavLink
      to={item.path}
      onClick={() => onMobileClose?.()}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group border border-transparent
        ${isActive
          ? 'bg-white/4 text-white shadow-lg shadow-black/10'
          : 'text-indigo-100/55 hover:bg-white/7 hover:text-white hover:border-white/10'
        }`}
    >
      <Icon size={18} className={`shrink-0 ${isActive ? 'text-gold' : 'text-indigo-100/55 group-hover:text-white'}`} />
      <div className={`nav-text text-[10px] truncate transition-all duration-300 overflow-hidden ${collapsed ? 'w-0 opacity-0' : 'w-full opacity-100'}`}>
        {item.label}
      </div>
    </NavLink>
  );
};

const SidebarSection = ({ section, collapsed, location, onMobileClose, isExpanded, onToggle }) => {
  const hasActiveChild = section.items.some((item) => isNavItemActive(item.path, location.pathname));
  const Icon = section.icon;

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 group border
          ${hasActiveChild && !collapsed
            ? 'bg-white/10 border-white/10 text-white shadow-xl shadow-black/10'
            : 'border-transparent text-indigo-100/55 hover:bg-white/7 hover:text-white hover:border-white/10'
          }`}
      >
        <div className="flex items-center gap-3">
          <Icon size={18} className={`shrink-0 ${hasActiveChild && !collapsed ? 'text-white' : 'text-indigo-100/55 group-hover:text-white'}`} />
          <div className={`nav-text text-[10px] truncate transition-all duration-300 overflow-hidden ${collapsed ? 'w-0 opacity-0' : 'w-full opacity-100'}`}>
            {section.label}
          </div>
        </div>
        <div className={`transition-all duration-300 ${collapsed ? 'opacity-0 w-0' : 'opacity-100 w-auto'}`}>
          <ChevronRight
            size={14}
            className={`transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`}
          />
        </div>
      </button>

      <div className={`grid transition-all duration-500 ease-in-out 
        ${isExpanded && !collapsed ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
      >
        <div className="overflow-hidden">
          <div className="pl-6 space-y-1 mt-1">
            {section.items.map((item) => (
              <SidebarLink
                key={item.path}
                item={item}
                collapsed={collapsed}
                location={location}
                onMobileClose={onMobileClose}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const Sidebar = ({ mobileOpen, onMobileClose }) => {
  const { sidebarCollapsed: collapsed } = useUI();
  const { user } = useAuth();
  const location = useLocation();
  const { isFeedbackOpen, openFeedback, closeFeedback } = useFeedback();
  const { isEnabled: wizardEnabled } = useSetupWizardFlag();
  const navItems = useMemo(() => {
    const baseConfig = NAV_CONFIG[user?.role] || [];
    // If setup wizard is explicitly disabled by feature flag, filter it out
    if (wizardEnabled === false) {
      return baseConfig.map((section) =>
        section.items
          ? {
              ...section,
              items: section.items.filter((item) => item.path !== '/admin/setup' && item.path !== '/hod/setup'),
            }
          : section
      );
    }
    return baseConfig;
  }, [user?.role, wizardEnabled]);

  const activeSectionLabel = useMemo(() => {
    const activeSection = navItems.find((section) =>
      section.items?.some((item) => isNavItemActive(item.path, location.pathname))
    );
    return activeSection?.label ?? null;
  }, [location.pathname, navItems]);

  const [sectionToggle, setSectionToggle] = useState({ routeKey: null, label: null });
  const currentRouteKey = `${location.pathname}::${activeSectionLabel ?? ''}`;
  const expandedSection = sectionToggle.routeKey === currentRouteKey ? sectionToggle.label : activeSectionLabel;

  const [isHovered, setIsHovered] = useState(false);
  const displayCollapsed = collapsed && !isHovered;

  const lastPath = useRef(location.pathname);
  
  useEffect(() => {
    if (lastPath.current !== location.pathname) {
      onMobileClose?.();
      lastPath.current = location.pathname;
    }
  }, [location.pathname, onMobileClose]);

  if (user?.role === ROLES.STUDENT) return null;

  const sidebarContent = (
    <>
      <div className="h-20 flex items-center px-6 border-b border-white/10 shrink-0 bg-white/[0.02] relative">
        <div className={`transition-all duration-300 ${displayCollapsed ? 'opacity-0 w-0' : 'opacity-100 w-auto'}`}>
          <h2 className="text-white font-brand text-2xl tracking-tight leading-none">
            No<span className="text-gold">Dues</span>
          </h2>
          <p className="text-[8px] uppercase tracking-[0.3em] font-black text-indigo-200/50 mt-1">Admin Portal</p>
        </div>
        <div className={`absolute inset-0 flex items-center justify-center transition-all duration-300 pointer-events-none ${displayCollapsed ? 'opacity-100' : 'opacity-0'}`}>
          <span className="text-gold font-brand text-2xl">N</span>
        </div>
        <button
          type="button"
          onClick={onMobileClose}
          className="lg:hidden ml-auto min-h-11 min-w-11 inline-flex items-center justify-center rounded-full text-white/40 hover:text-white hover:bg-white/10 relative z-10"
          aria-label="Close menu"
        >
          <X size={20} />
        </button>
      </div>

      <nav className="flex-1 py-7 px-4 space-y-2 overflow-y-auto no-scrollbar">
        {navItems.map((item) => {
          if (item.items) {
            return (
              <SidebarSection
                key={item.label}
                section={item}
                collapsed={displayCollapsed}
                location={location}
                onMobileClose={onMobileClose}
                isExpanded={expandedSection === item.label}
                onToggle={() =>
                  setSectionToggle({
                    routeKey: currentRouteKey,
                    label: expandedSection === item.label ? null : item.label,
                  })
                }
              />
            );
          }

          return (
            <SidebarLink
              key={item.path}
              item={item}
              collapsed={displayCollapsed}
              location={location}
              onMobileClose={onMobileClose}
            />
          );
        })}

        {/* Give Feedback Item */}
        <button
          type="button"
          onClick={openFeedback}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group border border-transparent text-indigo-100/55 hover:bg-indigo-500/10 hover:text-white hover:border-indigo-500/20 mt-4`}
        >
          <MessageSquarePlus size={18} className="shrink-0 text-indigo-100/55 group-hover:text-white" />
          <div className={`nav-text text-[10px] text-left truncate transition-all duration-300 overflow-hidden ${displayCollapsed ? 'w-0 opacity-0' : 'w-full opacity-100'}`}>
            Give Feedback
          </div>
        </button>
      </nav>

      <div className={`p-6 border-t border-white/10 shrink-0 transition-all duration-300 ${displayCollapsed ? 'opacity-0 invisible' : 'opacity-100 visible'}`}>
        <div className="rounded-xl px-4 py-3 border border-indigo-200/20 bg-gradient-to-r from-white/10 to-white/5">
          <span className="block text-[8px] text-indigo-100/45 uppercase tracking-[0.3em] font-black mb-1">Account Role</span>
          <span className="text-[10px] text-gold uppercase tracking-[0.2em] font-black">
            {formatRole(user?.role)}
          </span>
        </div>
        <div className="mt-6 text-center">
          <p className="text-[8px] uppercase tracking-[0.3em] font-black text-indigo-100/20 mb-1">Built by</p>
          <p className="text-[10px] font-brand text-indigo-100/60 flex items-center justify-center gap-1.5">
            ARC Club <span className="h-0.5 w-0.5 rounded-full bg-gold/50" /> Community
          </p>
        </div>
      </div>
    </>
  );

  return (
    <>
      <div 
        className={`hidden lg:flex flex-col relative shrink-0 transition-[width] duration-300 ease-in-out will-change-[width] min-h-screen ${collapsed ? 'w-20' : 'w-72'}`}
        onMouseEnter={() => collapsed && setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <aside 
          className={`absolute inset-y-0 left-0 transition-all duration-300 ease-in-out bg-gradient-to-b from-indigo-950 via-indigo-900 to-slate-900 flex flex-col shadow-[15px_0_40px_rgba(0,0,0,0.4)] overflow-hidden whitespace-nowrap z-[110] ${displayCollapsed ? 'w-20' : 'w-72'}`}
        >
          {sidebarContent}
        </aside>
      </div>
      <AnimatePresence>
        {mobileOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <motion.div
              className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={onMobileClose}
            />
            <motion.aside
              className="relative w-72 max-w-[82vw] bg-gradient-to-b from-indigo-950 via-indigo-900 to-slate-900 flex flex-col shadow-2xl"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 350, damping: 35, mass: 0.8 }}
            >
              {sidebarContent}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
      <FeedbackModal isOpen={isFeedbackOpen} onClose={closeFeedback} />
    </>
  );
};

export default Sidebar;
