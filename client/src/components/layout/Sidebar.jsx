import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth';
import { ROLES } from '../../utils/constants';
import {
  LayoutDashboard, Users, BookOpen, ClipboardCheck,
  Shield, History, ChevronLeft, ChevronRight,
  Building2, AlertTriangle, Layers, X, GraduationCap, Inbox, MessageSquarePlus
} from 'lucide-react';
import { useFeedback } from '../../hooks/useFeedback';
import FeedbackModal from '../Feedback/FeedbackModal';
import { formatRole } from '../../utils/formatters';

const NAV_CONFIG = {
  [ROLES.ADMIN]: [
    { label: 'General', icon: LayoutDashboard, items: [
      { label: 'Dashboard', path: '/admin', icon: LayoutDashboard },
      { label: 'Email Monitor', path: '/admin/email-monitor', icon: Inbox },
    ]},
    { label: 'Management', icon: Building2, items: [
      { label: 'Departments', path: '/admin/departments', icon: Building2 },
      { label: 'Faculty', path: '/admin/faculty', icon: Users },
      { label: 'Students', path: '/admin/students', icon: Users },
    ]},
    { label: 'Academic', icon: BookOpen, items: [
      { label: 'Subjects', path: '/admin/subjects', icon: BookOpen },
      { label: 'Batches', path: '/admin/batches', icon: Layers },
      { label: 'Co-Curricular', path: '/admin/co-curricular', icon: ClipboardCheck },
    ]},
  ],
  [ROLES.HOD || ROLES.AO]: [
    { label: 'Dashboard', path: '/hod', icon: LayoutDashboard },
    { label: 'My Classes', path: '/hod/my-classes', icon: GraduationCap },
    { label: 'Approvals (Dept.)', path: '/faculty/pending', icon: ClipboardCheck },
    { label: 'Academic', icon: BookOpen, items: [
      { label: 'Classes', path: '/hod/classes', icon: GraduationCap },
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

const SidebarLink = ({ item, collapsed, location, onMobileClose, isSubItem = false }) => {
  const getIsActive = () => {
    if (item.path === '/hod/classes') {
      return location.pathname.startsWith('/hod/classes') || location.pathname.includes('/hod/class/');
    }
    if (item.path === '/hod/my-classes') {
      return location.pathname.startsWith('/hod/my-classes');
    }
    return location.pathname === item.path ||
      (item.path.endsWith('/batches') && location.pathname.includes('/batch/')) ||
      (item.path !== '/' && !['/admin', '/hod', '/faculty'].includes(item.path) && location.pathname.startsWith(item.path + '/'));
  };

  const isActive = getIsActive();
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
  const getHasActiveChild = () => {
    return section.items.some(item => {
      if (item.path === '/hod/classes') {
        return location.pathname.startsWith('/hod/classes') || location.pathname.includes('/hod/class/');
      }
      // Strict matching for base routes to avoid multi-section highlights
      if (['/admin', '/hod', '/faculty'].includes(item.path)) {
        return location.pathname === item.path;
      }
      return location.pathname === item.path || location.pathname.startsWith(item.path + '/');
    });
  };

  const hasActiveChild = getHasActiveChild();

  const Icon = section.icon;

  return (
    <div className="space-y-1">
      <button
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
                isSubItem={true}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const Sidebar = ({ mobileOpen, onMobileClose }) => {
  const [collapsed, setCollapsed] = useState(false);
  const { user } = useAuth();
  const location = useLocation();
  const { isFeedbackOpen, openFeedback, closeFeedback } = useFeedback();
  const navItems = React.useMemo(() => NAV_CONFIG[user?.role] || [], [user?.role]);

  // Accordion state: only one section expanded at a time
  const [expandedSection, setExpandedSection] = useState(null);

  // Auto-expand section containing active link on location change
  useEffect(() => {
    const activeSection = navItems.find(section => 
      section.items?.some(item => {
        if (item.path === '/hod/classes') {
          return location.pathname.startsWith('/hod/classes') || location.pathname.includes('/hod/class/');
        }
        // Strict matching for base routes to avoid incorrect expansion
        if (['/admin', '/hod', '/faculty'].includes(item.path)) {
          return location.pathname === item.path;
        }
        return location.pathname === item.path || location.pathname.startsWith(item.path + '/');
      })
    );
    if (activeSection) {
      setExpandedSection(activeSection.label);
    }
  }, [location.pathname, navItems]);

  const lastPath = React.useRef(location.pathname);
  
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
        <div className={`transition-all duration-300 ${collapsed ? 'opacity-0 w-0' : 'opacity-100 w-auto'}`}>
          <h2 className="text-white font-brand text-2xl tracking-tight leading-none">
            No<span className="text-gold">Dues</span>
          </h2>
          <p className="text-[8px] uppercase tracking-[0.3em] font-black text-indigo-200/50 mt-1">Admin Portal</p>
        </div>
        <div className={`absolute inset-0 flex items-center justify-center transition-all duration-300 pointer-events-none ${collapsed ? 'opacity-100' : 'opacity-0'}`}>
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
                collapsed={collapsed}
                location={location}
                onMobileClose={onMobileClose}
                isExpanded={expandedSection === item.label}
                onToggle={() => setExpandedSection(expandedSection === item.label ? null : item.label)}
              />
            );
          }

          return (
            <SidebarLink
              key={item.path}
              item={item}
              collapsed={collapsed}
              location={location}
              onMobileClose={onMobileClose}
            />
          );
        })}

        {/* Give Feedback Item */}
        <button
          onClick={openFeedback}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group border border-transparent text-indigo-100/55 hover:bg-indigo-500/10 hover:text-white hover:border-indigo-500/20 mt-4`}
        >
          <MessageSquarePlus size={18} className="shrink-0 text-indigo-100/55 group-hover:text-white" />
          <div className={`nav-text text-[10px] text-left truncate transition-all duration-300 overflow-hidden ${collapsed ? 'w-0 opacity-0' : 'w-full opacity-100'}`}>
            Give Feedback
          </div>
        </button>
      </nav>

      <div className={`p-6 border-t border-white/10 shrink-0 transition-all duration-300 ${collapsed ? 'opacity-0 invisible' : 'opacity-100 visible'}`}>
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
      <FeedbackModal isOpen={isFeedbackOpen} onClose={closeFeedback} />
    </>
  );

  return (
  
    <>
      <div className={`hidden lg:flex flex-col relative shrink-0 transition-[width] duration-300 ease-in-out will-change-[width] min-h-screen ${collapsed ? 'w-20' : 'w-72'}`}>
        <aside className="absolute inset-y-0 left-0 w-full bg-gradient-to-b from-indigo-950 via-indigo-900 to-slate-900 flex flex-col shadow-2xl shadow-indigo-900/30 overflow-hidden whitespace-nowrap">
          {sidebarContent}
        </aside>
        
        {/* Floating Toggle Button */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-4 top-24 bg-white shadow-[0_4px_20px_rgba(0,0,0,0.15)] rounded-full p-2 text-navy hover:bg-gold hover:text-white hover:scale-110 transition-all duration-200 z-[100] flex items-center justify-center border border-indigo-100/10 group"
          title={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          <div className="transition-transform duration-300">
            {collapsed ? <ChevronRight size={10} /> : <ChevronLeft size={10} />}
          </div>
        </button>
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
    </>
  );
};

export default Sidebar;
