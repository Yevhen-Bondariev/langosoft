import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export function SidebarDrawer({ open, onClose, children }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => closeRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div aria-modal="true" role="dialog" aria-label="Navigation menu">
      {/* Backdrop */}
      <div className="sidebar-backdrop" onClick={onClose} aria-hidden="true" />

      {/* Drawer panel */}
      <div
        className="fixed top-0 left-0 h-full z-50 flex flex-col bg-slate-900 border-r border-slate-800 overflow-y-auto"
        style={{ width: '80vw', maxWidth: '20rem' }}
      >
        {/* Close button */}
        <div className="flex justify-end px-3 pt-3 shrink-0">
          <button
            ref={closeRef}
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            aria-label="Close navigation menu"
          >
            ✕
          </button>
        </div>

        {/* Sidebar content */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
