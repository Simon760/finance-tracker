'use client';

import { useEffect, useState } from 'react';

const FORCE_KEY = 'fdxb_force_desktop';

/**
 * Détecte si on est en viewport mobile (≤768px).
 * Renvoie null en SSR puis true/false côté client pour éviter les hydration mismatches.
 *
 * Backup : si l'URL contient ?desktop=1 OU localStorage fdxb_force_desktop=1,
 * renvoie false même sur viewport mobile (pour utiliser la UI desktop legacy).
 */
export function useIsMobile(breakpoint = 768): boolean | null {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  useEffect(() => {
    // Check force-desktop flag (URL ?desktop=1 ou localStorage)
    const url = new URL(window.location.href);
    const urlDesktop = url.searchParams.get('desktop');
    if (urlDesktop === '1') {
      localStorage.setItem(FORCE_KEY, '1');
    } else if (urlDesktop === '0') {
      localStorage.removeItem(FORCE_KEY);
    }
    if (localStorage.getItem(FORCE_KEY) === '1') {
      setIsMobile(false);
      return;
    }

    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [breakpoint]);

  return isMobile;
}

/** Toggle force-desktop on mobile (utilisé par le bouton dans le shell mobile) */
export function setForceDesktop(force: boolean) {
  if (typeof window === 'undefined') return;
  if (force) localStorage.setItem(FORCE_KEY, '1');
  else localStorage.removeItem(FORCE_KEY);
  // Reload pour appliquer
  window.location.reload();
}

export function isForceDesktop(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(FORCE_KEY) === '1';
}
