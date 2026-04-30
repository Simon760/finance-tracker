'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

interface SlideOverProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export default function SlideOver({ open, onClose, title, subtitle, children }: SlideOverProps) {
  useEffect(() => {
    if (open) {
      const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }
  }, [open, onClose]);

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 bg-black/40 z-[190] transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      {/* Panel */}
      <div className={`fixed top-0 right-0 bottom-0 w-[400px] max-w-[90vw] bg-bg-2 border-l border-border z-[200] flex flex-col transition-transform duration-200 ease-out ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h3 className="text-sm font-bold">{title}</h3>
            {subtitle && <p className="text-[11px] text-t-3 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-t-3 hover:text-t-1 p-1 rounded transition-colors cursor-pointer">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {children}
        </div>
      </div>
    </>
  );
}
