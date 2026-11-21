'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useOverlay } from '@/lib/useOverlay';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Si true, le volet prend toute la hauteur visible. Sinon hauteur du contenu. */
  fullHeight?: boolean;
  /** Barre d'actions fixe sous le contenu (toujours visible, au-dessus du clavier). */
  footer?: React.ReactNode;
  /** Élément à droite du titre, à la place de la croix. */
  right?: React.ReactNode;
}

/**
 * Volet du bas — LA fenêtre de l'UI mobile (Modal et SlideOver s'y replient aussi).
 * Se ferme en le tirant vers le bas (poignée / titre), au fond, par Échap ou par le
 * retour du téléphone ; reste au-dessus du clavier (--kb, cf. useKeyboardInset).
 */
export default function BottomSheet({ open, onClose, title, subtitle, children, fullHeight, footer, right }: BottomSheetProps) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y0: number; t0: number; dy: number } | null>(null);
  // Dernier contenu affiché : sert pendant l'animation de fermeture (le parent a souvent
  // déjà vidé ses données, le volet se replierait à vide).
  const last = useRef({ title, subtitle, children, footer, right });
  if (open) last.current = { title, subtitle, children, footer, right };

  const mountedRef = useRef(mounted);
  mountedRef.current = mounted;

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      if (panel.current) panel.current.style.transform = '';
      return;
    }
    if (!mountedRef.current) return;
    setClosing(true);
    const t = setTimeout(() => { setMounted(false); setClosing(false); }, 210);
    return () => clearTimeout(t);
  }, [open]);

  useOverlay(open, onClose);

  // `open` compte tout de suite (sans attendre l'effet) : le champ en autoFocus doit être
  // monté dans le même geste que le tap, sinon iOS n'ouvre pas le clavier.
  if (!open && !mounted) return null;
  const c = last.current;

  const onStart = (e: React.TouchEvent) => {
    drag.current = { y0: e.touches[0].clientY, t0: Date.now(), dy: 0 };
    if (panel.current) panel.current.style.transition = 'none';
  };
  const onMove = (e: React.TouchEvent) => {
    const d = drag.current;
    if (!d || !panel.current) return;
    d.dy = Math.max(0, e.touches[0].clientY - d.y0);
    panel.current.style.transform = `translateY(${d.dy}px)`;
  };
  const onEnd = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || !panel.current) return;
    panel.current.style.transition = '';
    const speed = d.dy / Math.max(1, Date.now() - d.t0);
    if (d.dy > 110 || (speed > 0.6 && d.dy > 30)) {
      panel.current.style.transform = 'translateY(100%)';
      onClose();
    } else {
      panel.current.style.transform = '';
    }
  };

  return (
    <div
      className={`fixed inset-0 z-[210] flex items-end justify-center bg-black/60 transition-opacity duration-200 ${closing ? 'opacity-0 pointer-events-none' : 'animate-fade-in'}`}
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={c.title || 'Fenêtre'}
        className={`w-full max-w-[600px] bg-sheet rounded-t-[24px] flex flex-col transition-transform duration-200 ease-out ${closing ? 'translate-y-full' : 'animate-sheet-in'} ${fullHeight ? 'h-[calc(100dvh-var(--kb,0px)-env(safe-area-inset-top)-12px)]' : 'max-h-[calc(100dvh-var(--kb,0px)-env(safe-area-inset-top)-28px)]'}`}
        style={{ marginBottom: 'var(--kb, 0px)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="shrink-0 touch-none select-none" onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd} onTouchCancel={onEnd}>
          <div className="w-9 h-1 bg-t-4/50 rounded-full mx-auto mt-2 mb-1" />
          {(c.title || c.right) && (
            <div className="flex items-center gap-3 pl-5 pr-3 pt-1.5 pb-2 min-h-[48px]">
              <div className="min-w-0 flex-1">
                <h3 className="text-[16px] font-semibold tracking-tight text-t-1 truncate">{c.title}</h3>
                {c.subtitle && <p className="text-[12px] text-t-3 truncate">{c.subtitle}</p>}
              </div>
              {c.right ?? (
                <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full bg-cell text-t-2 active:opacity-60 shrink-0" aria-label="Fermer">
                  <X size={17} />
                </button>
              )}
            </div>
          )}
        </div>
        <div className={`flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 ${c.footer ? 'pb-3' : 'pb-[calc(env(safe-area-inset-bottom)+18px)]'}`}>
          {c.children}
        </div>
        {c.footer && (
          <div className="shrink-0 px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+12px)]">{c.footer}</div>
        )}
      </div>
    </div>
  );
}
