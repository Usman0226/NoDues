import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ROLES } from '../../utils/constants';
import {
  LayoutDashboard, Users, BookOpen, GraduationCap, ClipboardCheck,
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
    { label: 'Departments', path: '/hod/departments', icon: Building2 },
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
  }, [location.pathname]);

  // Students have no sidebar
  if (user?.role === ROLES.STUDENT) return null;

  const sidebarContent = (
    <>
      <div className="h-16 lg:h-20 flex items-center justify-between px-5 lg:px-6 border-b border-white/10 shrink-0">
        {!collapsed && (
          <h2 className="text-white font-serif text-xl tracking-tight">
            No<span className="text-gold">Dues</span>
          </h2>
        )}
        {collapsed && <span className="text-gold font-serif text-2xl mx-auto">N</span>}
        <button onClick={onMobileClose} className="lg:hidden p-1 text-white/60 hover:text-white">
          <X size={20} />
        </button>
      </div>

      <nav className="flex-1 py-4 lg:py-6 px-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path ||
            (item.path !== '/' && item.path !== '/admin' && item.path !== '/hod' && item.path !== '/faculty' && location.pathname.startsWith(item.path + '/')) ||
            (item.path === '/admin' && location.pathname === '/admin') ||
            (item.path === '/hod' && location.pathname === '/hod') ||
            (item.path === '/faculty' && location.pathname === '/faculty');
          const Icon = item.icon;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-all duration-200 group
                ${isActive
                  ? 'bg-white/15 text-white shadow-lg shadow-black/10'
                  : 'text-white/60 hover:bg-white/5 hover:text-white'
                }`}
            >
              <Icon size={20} className={isActive ? 'text-gold' : 'text-white/50 group-hover:text-white/80'} />
              {!collapsed && (
                <span className="nav-text text-xs font-medium tracking-widest">
                  {item.label}
                </span>
              )}
              {isActive && !collapsed && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-gold"></span>
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

      <div className="p-4 border-t border-white/10 shrink-0">
        {!collapsed && (
          <div className="bg-white/5 rounded-xl px-3 py-2 text-center">
            <span className="text-[10px] text-gold uppercase tracking-[0.2em] font-semibold">
              {user?.role}
            </span>
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
      <aside className={`hidden lg:flex ${collapsed ? 'w-20' : 'w-64'} min-h-screen bg-navy flex-col transition-all duration-300 ease-in-out relative shrink-0`}>
        {sidebarContent}
      </aside>
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onMobileClose} />
          <aside className="relative w-72 max-w-[80vw] bg-navy flex flex-col animate-in slide-in-from-left duration-300">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
};

export default Sidebar;
