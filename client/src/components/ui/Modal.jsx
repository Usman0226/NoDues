import React, { useEffect, useRef, useId, useCallback } from 'react';
import { X } from 'lucide-react';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const Modal = ({ isOpen, onClose, title, children, size = 'md' }) => {
  const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };
  const panelRef = useRef(null);
  const titleId = useId();
  const titleDomId = title ? `modal-title-${titleId}` : undefined;
  const previousActiveRef = useRef(null);

  const getFocusable = useCallback(() => {
    const root = panelRef.current;
    if (!root) return [];
    return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
      (el) => el.offsetParent !== null || el.getClientRects().length > 0
    );
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    previousActiveRef.current = document.activeElement;

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;

      const list = getFocusable();
      if (list.length === 0) return;

      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;

      if (!panelRef.current.contains(active)) {
        e.preventDefault();
        first.focus();
        return;
      }

      if (e.shiftKey) {
        if (active === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);

    const t = requestAnimationFrame(() => {
      const list = getFocusable();
      if (list.length) list[0].focus();
    });

    return () => {
      cancelAnimationFrame(t);
      document.documentElement.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKeyDown);
      const prev = previousActiveRef.current;
      if (prev && typeof prev.focus === 'function') {
        try {
          prev.focus();
        } catch {
          /* ignore */
        }
      }
    };
  }, [isOpen, onClose, getFocusable]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        className={`relative w-full ${sizes[size]} overflow-hidden rounded-xl border border-indigo-100 bg-white shadow-[0_24px_80px_rgba(30,41,59,0.22)] fade-up`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleDomId}
      >
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 bg-gradient-to-r from-white to-indigo-50/40">
            <h3 id={titleDomId} className="text-lg font-black tracking-tight text-navy">
              {title}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-full hover:bg-zinc-100 transition-colors text-zinc-500 hover:text-zinc-900 sm:min-h-0 sm:min-w-0 sm:p-2"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className="p-8 space-y-6">{children}</div>
      </div>
    </div>
  );
};

export default Modal;
