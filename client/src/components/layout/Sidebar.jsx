import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ROLES } from '../../utils/constants';
import {
  LayoutDashboard, Users, BookOpen, ClipboardCheck,
  Shield, History, ChevronLeft, ChevronRight,
  Building2, AlertTriangle, Layers, X
} from 'lucide-react';

const NAV_CONFIG = {
  [ROLES.ADMIN]: [
    { label: 'Dashboard', path: '/admin', icon: LayoutDashboard },
    { label: 'Departments', path: '/admin/departments', icon: Building2 },
    { label: 'Faculty', path: '/admin/faculty', icon: Users },
    { label: 'Subjects', path: '/admin/subjects', icon: BookOpen },
    { label: 'Batches', path: '/admin/batches', icon: Layers },
  ],
  [ROLES.HOD]: [
    { label: 'Dashboard', path: '/hod', icon: LayoutDashboard },
    { label: 'Faculty', path: '/hod/faculty', icon: Users },
    { label: 'Subjects', path: '/hod/subjects', icon: BookOpen },
    { label: 'Batches', path: '/hod/batches', icon: Layers },
    { label: 'Dues', path: '/hod/dues', icon: AlertTriangle },
    { label: 'Overrides', path: '/hod/overrides', icon: Shield },
  ],
  [ROLES.FACULTY]: [
    { label: 'Dashboard', path: '/faculty', icon: LayoutDashboard },
    { label: 'Pending', path: '/faculty/pending', icon: ClipboardCheck },
    { label: 'History', path: '/faculty/history', icon: History },
  ],
};

const Sidebar = ({ mobileOpen, onMobileClose }) => {
  const [collapsed, setCollapsed] = useState(false);
  const { user } = useAuth();
  const location = useLocation();
  const navItems = NAV_CONFIG[user?.role] || [];

  useEffect(() => {
    onMobileClose?.();
  }, [location.pathname, onMobileClose]);

  if (user?.role === ROLES.STUDENT) return null;

  const sidebarContent = (
    <>
      <div className="h-20 flex items-center px-6 border-b border-white/10 shrink-0 bg-white/[0.02]">
        {!collapsed && (
          <div>
            <h2 className="text-white font-brand text-2xl tracking-tight leading-none">
              No<span className="text-gold">Dues</span>
            </h2>
            <p className="text-[8px] uppercase tracking-[0.3em] font-black text-indigo-200/50 mt-1">Ops Console</p>
          </div>
        )}
        {collapsed && <span className="text-gold font-brand text-2xl mx-auto">N</span>}
        <button onClick={onMobileClose} className="lg:hidden ml-auto p-1 text-white/40 hover:text-white">
          <X size={20} />
        </button>
      </div>

      <nav className="flex-1 py-7 px-4 space-y-2 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path ||
            (item.path !== '/' && !['/admin', '/hod', '/faculty'].includes(item.path) && location.pathname.startsWith(item.path + '/')) ||
            (item.path === '/admin' && location.pathname === '/admin') ||
            (item.path === '/hod' && location.pathname === '/hod') ||
            (item.path === '/faculty' && location.pathname === '/faculty');
          const Icon = item.icon;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200 group border
                ${isActive
                  ? 'bg-white/12 border-white/20 text-white shadow-xl shadow-black/20'
                  : 'border-transparent text-indigo-100/55 hover:bg-white/7 hover:text-white hover:border-white/10'
                }`}
            >
              <Icon size={18} className={isActive ? 'text-white' : 'text-indigo-100/55 group-hover:text-white'} />
              {!collapsed && (
                <span className="nav-text text-[10px] truncate">
                  {item.label}
                </span>
              )}
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

      <div className="p-6 border-t border-white/10 shrink-0">
        {!collapsed && (
          <div className="rounded-2xl px-4 py-3 border border-indigo-200/20 bg-gradient-to-r from-white/10 to-white/5">
            <span className="block text-[8px] text-indigo-100/45 uppercase tracking-[0.3em] font-black mb-1">Access Layer</span>
            <span className="text-[10px] text-gold uppercase tracking-[0.2em] font-black">
              {user?.role}
            </span>
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
      <aside className={`hidden lg:flex ${collapsed ? 'w-20' : 'w-72'} min-h-screen bg-gradient-to-b from-indigo-950 via-indigo-900 to-slate-900 flex-col transition-all duration-300 ease-in-out relative shrink-0 shadow-2xl shadow-indigo-900/30`}>
        {sidebarContent}
      </aside>
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={onMobileClose} />
          <aside className="relative w-72 max-w-[82vw] bg-gradient-to-b from-indigo-950 via-indigo-900 to-slate-900 flex flex-col animate-in slide-in-from-left duration-300 shadow-2xl">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
};

export default Sidebar;
