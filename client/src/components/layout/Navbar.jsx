import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { User, LogOut, Bell, Menu, Radar } from 'lucide-react';

const Navbar = ({ onMenuToggle }) => {
  const { user, logout } = useAuth();

  return (
    <nav className="h-16 lg:h-20 flex items-center justify-between px-4 lg:px-8 sticky top-0 z-40 pointer-events-none">
      <div className="flex items-center pointer-events-auto">
        <button onClick={onMenuToggle} className="lg:hidden p-2 -ml-1 text-navy hover:bg-zinc-100 rounded-full transition-colors">
          <Menu size={22} />
        </button>
        <div className="hidden sm:flex items-center gap-3">
          <span className="h-8 w-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
            <Radar size={15} />
          </span>
          <div>
            <p className="text-[9px] uppercase tracking-[0.28em] font-black text-zinc-500">Telemetry Node</p>
            <p className="text-xs lg:text-sm font-black text-navy">NoDues Operations Grid</p>
          </div>
        </div>
        <span className="sm:hidden text-navy font-brand text-xl">ND</span>
      </div>

      <div className="flex items-center gap-3 lg:gap-6">
        <button className="p-2.5 rounded-full border border-zinc-200 text-muted-foreground hover:text-navy hover:border-indigo-200 transition-colors relative bg-white">
          <Bell size={18} />
          <span className="absolute top-2 right-2 w-2 h-2 bg-status-due rounded-full border-2 border-white"></span>
        </button>

        <div className="h-6 w-px bg-zinc-200 hidden sm:block"></div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-black text-navy leading-none">{user?.name}</p>
            <p className="text-[10px] text-zinc-500 font-medium mt-1 capitalize">{user?.role}</p>
          </div>

          <div className="group relative">
            <button
              type="button"
              className="min-h-11 min-w-11 sm:min-h-9 sm:min-w-9 lg:h-10 lg:w-10 rounded-full bg-navy inline-flex items-center justify-center text-white ring-2 ring-offset-2 ring-transparent group-hover:ring-indigo-200 transition-all"
              aria-label="Account menu"
              aria-haspopup="true"
            >
              <User size={18} />
            </button>

            <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-2xl border border-zinc-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 transform origin-top-right scale-95 group-hover:scale-100 overflow-hidden z-50">
              <div className="p-4 border-b border-zinc-200 bg-zinc-50/70">
                <p className="text-xs font-black text-navy truncate">{user?.email}</p>
                <p className="text-[9px] text-zinc-500 uppercase tracking-[0.2em] mt-1 sm:hidden">{user?.role}</p>
              </div>
              <button
                onClick={logout}
                className="w-full text-left px-4 py-3 text-sm font-semibold text-status-rejected hover:bg-red-50 flex items-center gap-2 transition-colors"
              >
                <LogOut size={16} />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
