import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';

const ActionMenu = ({ actions }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, bottom: 'auto' });
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        buttonRef.current && !buttonRef.current.contains(event.target) &&
        menuRef.current && !menuRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };
    
    const handleScroll = (e) => {
      // Don't close if scrolling inside the menu itself
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      if (isOpen) setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('scroll', handleScroll, true); // Capture all scrolls
      window.addEventListener('resize', handleScroll);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
    };
  }, [isOpen]);

  const toggleMenu = (e) => {
    e.stopPropagation();
    if (!isOpen) {
      const rect = buttonRef.current.getBoundingClientRect();
      const menuWidth = 192; // 48 * 4px for w-48
      const estimatedHeight = actions.length * 40 + 16;
      
      let top = rect.bottom;
      let bottom = 'auto';
      
      // Render upwards if it would clip the bottom of the screen
      if (rect.bottom + estimatedHeight > window.innerHeight) {
        top = 'auto';
        bottom = window.innerHeight - rect.top;
      }
      
      // Calculate horizontal position ensuring it stays in view
      let left = rect.right - menuWidth;
      // Safety bounds for tight mobile screens
      if (left < 16) left = 16;
      if (left + menuWidth > window.innerWidth - 16) {
        left = window.innerWidth - menuWidth - 16;
      }

      setCoords({ top, bottom, left });
    }
    setIsOpen(!isOpen);
  };

  return (
    <div className="relative inline-block text-left">
      <button
        ref={buttonRef}
        onClick={toggleMenu}
        className={`p-1.5 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-100 ${isOpen ? 'text-indigo-600 bg-indigo-50' : 'text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50'}`}
        aria-label="Actions"
      >
        <MoreVertical size={16} />
      </button>

      {isOpen && createPortal(
        <div 
          ref={menuRef}
          style={{ 
            top: coords.top !== 'auto' ? `${coords.top + 4}px` : 'auto', 
            bottom: coords.bottom !== 'auto' ? `${coords.bottom + 4}px` : 'auto',
            left: `${coords.left}px` 
          }}
          className="fixed w-48 rounded-xl bg-white shadow-xl shadow-zinc-200/50 ring-1 ring-black/5 z-[9999] overflow-hidden sm:duration-200 animate-in fade-in"
        >
          <div className="py-1">
            {actions.map((action, idx) => {
              const ActionIcon = action.icon;
              return (
                <button
                  key={idx}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(false);
                    action.onClick();
                  }}
                  className={`w-full text-left px-4 py-2.5 text-xs font-bold transition-colors flex items-center gap-2
                    ${
                      action.variant === 'danger'
                        ? 'text-red-600 hover:bg-red-50'
                        : 'text-zinc-700 hover:bg-zinc-50 hover:text-indigo-700'
                    }
                  `}
                >
                  {ActionIcon && <ActionIcon size={14} />}
                  {action.label}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default ActionMenu;
