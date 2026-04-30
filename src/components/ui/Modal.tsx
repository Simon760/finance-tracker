'use client';

import { useEffect, useRef } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: string;
}

export default function Modal({ open, onClose, title, children, width = 'w-[420px]' }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center"
      onClick={onClose}
    >
      <div
        ref={ref}
        className={`bg-bg-3 border border-border rounded-lg p-7 ${width} max-h-[85vh] overflow-y-auto shadow-lg`}
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-base font-bold mb-5 tracking-tight">{title}</h3>
        {children}
      </div>
    </div>
  );
}
