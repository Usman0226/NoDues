import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { User, LogOut, Bell, Menu, ShieldCheck } from 'lucide-react';
import Inbox from './Inbox';

const Navbar = ({ onMenuToggle }) => {
  const { user, logout } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <nav className="h-16 lg:h-20 flex items-center justify-between px-4 lg:px-8 bg-white border-b border-zinc-200 shadow-sm z-40">
      <div className="flex items-center pointer-events-auto">
        <button onClick={onMenuToggle} className="lg:hidden p-2 -ml-1 text-navy hover:bg-zinc-100 rounded-full transition-colors">
          <Menu size={22} />
        </button>
      </div>

      <div className="flex items-center gap-3 lg:gap-6 pointer-events-auto">
        {user?.role !== 'student' && <Inbox />}

        <div className="h-6 w-px bg-zinc-200 hidden sm:block"></div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-black text-navy leading-none">{user?.name}</p>
            <p className="text-[10px] text-zinc-500 font-medium mt-1 capitalize">{user?.role}</p>
          </div>

          <div className="relative group">
            <button
              type="button"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className={`min-h-11 min-w-11 sm:min-h-9 sm:min-w-9 lg:h-10 lg:w-10 rounded-full bg-navy inline-flex items-center justify-center text-white ring-2 ring-offset-2 transition-all lg:group-hover:ring-indigo-200
                ${isMenuOpen ? 'ring-indigo-200' : 'ring-transparent hover:ring-indigo-100'}`}
              aria-label="Account menu"
              aria-haspopup="true"
              aria-expanded={isMenuOpen}
            >
              <User size={18} />
            </button>

            {/* Backdrop for closing menu - only active when explicitly clicked */}
            {isMenuOpen && (
              <div 
                className="fixed inset-0 z-40 cursor-default" 
                onClick={() => setIsMenuOpen(false)} 
              />
            )}
            
            <div className={`absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-2xl border border-zinc-200 transition-all duration-200 transform origin-top-right z-50 overflow-hidden
              ${isMenuOpen 
                ? 'opacity-100 visible scale-100' 
                : 'opacity-0 invisible scale-95 lg:group-hover:opacity-100 lg:group-hover:visible lg:group-hover:scale-100'
              }`}>
              <div className="p-4 border-b border-zinc-200 bg-zinc-50/70">
                <p className="text-xs font-black text-navy truncate">{user?.email}</p>
                <p className="text-[9px] text-zinc-500 uppercase tracking-[0.2em] mt-1 sm:hidden">{user?.role}</p>
              </div>
              <div className="py-1">
                <Link
                  to="/change-password"
                  onClick={() => setIsMenuOpen(false)}
                  className="w-full text-left px-4 py-3 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 flex items-center gap-2 transition-colors"
                >
                  <ShieldCheck size={16} />
                  <span>Change Password</span>
                </Link>
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    logout();
                  }}
                  className="w-full text-left px-4 py-3 text-sm font-semibold text-status-rejected hover:bg-red-50 flex items-center gap-2 transition-colors"
                >
                  <LogOut size={16} />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;