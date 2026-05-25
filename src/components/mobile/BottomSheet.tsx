'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Si true, la sheet prend toute la hauteur visible. Sinon hauteur auto. */
  fullHeight?: boolean;
}

export default function BottomSheet({ open, onClose, title, children, fullHeight }: BottomSheetProps) {
  useEffect(() => {
    if (open) {
      const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
      window.addEventListener('keydown', handler);
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        window.removeEventListener('keydown', handler);
        document.body.style.overflow = prev;
      };
    }
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end animate-fade-in"
      onClick={onClose}
    >
      <div
        className={`w-full bg-bg-2 border-t border-border rounded-t-2xl flex flex-col animate-slide-up ${fullHeight ? 'h-[92vh]' : 'max-h-[88vh]'}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-bg-4 rounded-full mx-auto mt-2.5 mb-1 shrink-0" />
        {title && (
          <div className="flex items-center justify-between px-5 pt-2 pb-3 shrink-0">
            <h3 className="text-[15px] font-bold tracking-tight text-t-1">{title}</h3>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full active:bg-bg-4 text-t-3">
              <X size={18} />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+20px)]">
          {children}
        </div>
      </div>
    </div>
  );
}
