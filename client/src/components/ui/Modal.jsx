import React from 'react';
import { X } from 'lucide-react';

const Modal = ({ isOpen, onClose, title, children, size = 'md' }) => {
  const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-zinc-950/40 backdrop-blur-md" onClick={onClose} />
      <div className={`relative w-full ${sizes[size]} overflow-hidden rounded-[2rem] border border-indigo-100 bg-white shadow-[0_24px_80px_rgba(30,41,59,0.22)] fade-up`}>
        {title && (
          <div className="flex items-center justify-between px-7 py-5 border-b border-zinc-200 bg-gradient-to-r from-white to-indigo-50/40">
            <h3 className="text-lg font-black tracking-tight text-navy">{title}</h3>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100 transition-colors text-zinc-500 hover:text-zinc-900">
              <X size={18} />
            </button>
          </div>
        )}
        <div className="p-7">{children}</div>
      </div>
    </div>
  );
};

export default Modal;
