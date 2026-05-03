'use client';

import { useEffect, useRef } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: string;
}

export default function Modal({ open, onClose, title, children, width = 'w-[440px]' }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
      window.addEventListener('keydown', handler);
      document.body.style.overflow = 'hidden';
      return () => {
        window.removeEventListener('keydown', handler);
        document.body.style.overflow = '';
      };
    }
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-md z-[200] flex items-center justify-center animate-fade-in p-4"
      onClick={onClose}
    >
      <div
        ref={ref}
        className={`bg-bg-3 border border-border-2 rounded-lg p-7 ${width} max-h-[88vh] overflow-y-auto shadow-xl animate-fade-up`}
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-[15px] font-bold mb-5 tracking-tight text-t-1">{title}</h3>
        {children}
      </div>
    </div>
  );
}
