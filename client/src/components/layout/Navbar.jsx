import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { User, LogOut, Bell, Menu } from 'lucide-react';

const Navbar = ({ onMenuToggle }) => {
  const { user, logout } = useAuth();

  return (
    <nav className="h-14 lg:h-20 bg-white/80 backdrop-blur-md border-b border-muted flex items-center justify-between px-4 lg:px-8 sticky top-0 z-40">
      <div className="flex items-center gap-3">
        {/* Hamburger — mobile only */}
        <button onClick={onMenuToggle} className="lg:hidden p-2 -ml-1 text-navy hover:bg-muted rounded-lg transition-colors">
          <Menu size={22} />
        </button>
        <span className="text-navy font-semibold tracking-wider text-xs lg:text-sm hidden sm:block">NODUES PLATFORM</span>
        {/* Mobile logo */}
        <span className="sm:hidden text-navy font-serif text-lg">N<span className="text-gold">D</span></span>
      </div>

      <div className="flex items-center gap-3 lg:gap-6">
        <button className="p-2 text-muted-foreground hover:text-navy transition-colors relative">
          <Bell size={18} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-status-due rounded-full border-2 border-white"></span>
        </button>
        
        <div className="h-6 w-px bg-muted hidden sm:block"></div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold text-navy leading-none">{user?.name}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">{user?.role}</p>
          </div>
          
          <div className="group relative">
            <button className="h-9 w-9 lg:h-10 lg:w-10 rounded-full bg-navy flex items-center justify-center text-white ring-2 ring-offset-2 ring-transparent group-hover:ring-gold/50 transition-all">
              <User size={18} />
            </button>
            
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-2xl border border-muted opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 transform origin-top-right scale-95 group-hover:scale-100 overflow-hidden z-50">
              <div className="p-4 border-b border-muted bg-offwhite/50">
                <p className="text-xs font-bold text-navy truncate">{user?.email}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5 sm:hidden">{user?.role}</p>
              </div>
              <button 
                onClick={logout}
                className="w-full text-left px-4 py-3 text-sm text-status-rejected hover:bg-status-rejected/5 flex items-center gap-2 transition-colors"
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
