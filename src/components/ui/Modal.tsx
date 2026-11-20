'use client';

import { useEffect, useRef } from 'react';
import { useIsMobile } from '@/lib/useIsMobile';
import BottomSheet from '@/components/mobile/BottomSheet';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: string;
}

export default function Modal({ open, onClose, title, children, width = 'w-[440px]' }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    // UI mobile : c'est le volet du bas qui gère Échap, retour et défilement
    if (open && isMobile !== true) {
      const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
      window.addEventListener('keydown', handler);
      document.body.style.overflow = 'hidden';
      return () => {
        window.removeEventListener('keydown', handler);
        document.body.style.overflow = '';
      };
    }
  }, [open, onClose, isMobile]);

  // UI mobile : toute modale devient un volet du bas (glisser pour fermer, clavier géré)
  if (isMobile === true) {
    return <BottomSheet open={open} onClose={onClose} title={title}><div className="pt-1">{children}</div></BottomSheet>;
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-md z-[200] flex items-center justify-center animate-fade-in p-4"
      onClick={onClose}
    >
      <div
        ref={ref}
        className={`bg-bg-3 border border-border-2 rounded-lg p-7 max-md:p-5 ${width} max-w-full max-h-[88vh] overflow-y-auto shadow-xl animate-fade-up`}
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-[15px] font-bold mb-5 tracking-tight text-t-1">{title}</h3>
        {children}
      </div>
    </div>
  );
}
