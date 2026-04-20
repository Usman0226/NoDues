import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth';
import { ROLES } from '../../utils/constants';
import {
  LayoutDashboard, Users, BookOpen, ClipboardCheck,
  Shield, History, ChevronLeft, ChevronRight,
  Building2, AlertTriangle, Layers, X, GraduationCap,Inbox
} from 'lucide-react';

const NAV_CONFIG = {
  [ROLES.ADMIN]: [
    { label: 'Dashboard', path: '/admin', icon: LayoutDashboard },
    { label: 'Departments', path: '/admin/departments', icon: Building2 },
    { label: 'Students', path: '/admin/students', icon: Users },
    { label: 'Faculty', path: '/admin/faculty', icon: Users },
    { label: 'Subjects', path: '/admin/subjects', icon: BookOpen },
    { label: 'Batches', path: '/admin/batches', icon: Layers },
    { label: 'Co-Curricular', path: '/admin/co-curricular', icon: ClipboardCheck },
    { label: 'Email Monitor', path: '/admin/email-monitor', icon: Inbox },
  ],
  [ROLES.HOD]: [
    { label: 'Dashboard', path: '/hod', icon: LayoutDashboard },
    { label: 'Approvals (Dept.)', path: '/faculty/pending', icon: ClipboardCheck },
    { label: 'Classes', path: '/hod/classes', icon: GraduationCap },
    { label: 'My Classes', path: '/hod/my-classes', icon: GraduationCap },
    { label: 'Students', path: '/hod/students', icon: Users },
    { label: 'Faculty', path: '/hod/faculty', icon: Users },
    { label: 'Subjects', path: '/hod/subjects', icon: BookOpen },
    { label: 'Batches', path: '/hod/batches', icon: Layers },
    { label: 'Co-Curricular', path: '/hod/co-curricular', icon: ClipboardCheck },
    { label: 'Dues', path: '/hod/dues', icon: AlertTriangle },
    { label: 'Overrides', path: '/hod/overrides', icon: Shield },
    { label: 'Action History', path: '/faculty/history', icon: History },
  ],
  [ROLES.FACULTY]: [
    { label: 'Pending', path: '/faculty/pending', icon: ClipboardCheck },
    { label: 'My Classes', path: '/faculty/classes', icon: GraduationCap },
    { label: 'History', path: '/faculty/history', icon: History },
  ],
};

const Sidebar = ({ mobileOpen, onMobileClose }) => {
  const [collapsed, setCollapsed] = useState(false);
  const { user } = useAuth();
  const location = useLocation();
  const navItems = React.useMemo(() => NAV_CONFIG[user?.role] || [], [user?.role]);

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
          // Explicit matching rules for HoD portal to avoid path overlap
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
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group border
                ${isActive
                  ? 'bg-white/12 border-white/20 text-white shadow-xl shadow-black/20'
                  : 'border-transparent text-indigo-100/55 hover:bg-white/7 hover:text-white hover:border-white/10'
                }`}
            >
              <Icon size={18} className={`shrink-0 ${isActive ? 'text-white' : 'text-indigo-100/55 group-hover:text-white'}`} />
              <div className={`nav-text text-[10px] truncate transition-all duration-300 overflow-hidden ${collapsed ? 'w-0 opacity-0' : 'w-full opacity-100'}`}>
                {item.label}
              </div>
            </NavLink>
          );
        })}
      </nav>

      <button
        onClick={() => setCollapsed(!collapsed)}
        className="hidden lg:flex absolute -right-3 top-24 bg-white shadow-lg rounded-full p-1.5 text-navy hover:bg-gold hover:text-white transition-colors z-50"
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      <div className={`p-6 border-t border-white/10 shrink-0 transition-all duration-300 ${collapsed ? 'opacity-0 invisible' : 'opacity-100 visible'}`}>
        <div className="rounded-xl px-4 py-3 border border-indigo-200/20 bg-gradient-to-r from-white/10 to-white/5">
          <span className="block text-[8px] text-indigo-100/45 uppercase tracking-[0.3em] font-black mb-1">Account Role</span>
          <span className="text-[10px] text-gold uppercase tracking-[0.2em] font-black">
            {user?.role}
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
      <aside className={`hidden lg:flex ${collapsed ? 'w-20' : 'w-72'} min-h-screen bg-gradient-to-b from-indigo-950 via-indigo-900 to-slate-900 flex-col transition-[width] duration-300 ease-in-out relative shrink-0 shadow-2xl shadow-indigo-900/30 overflow-hidden whitespace-nowrap will-change-[width]`}>
        {sidebarContent}
      </aside>
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
