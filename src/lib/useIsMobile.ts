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
    // data-ui sur <html> : même information pour le CSS (cf. globals.css et le script de
    // app/layout.tsx, qui le pose avant le premier rendu). Tenu à jour ici quand la
    // fenêtre change de taille.
    const mark = (mobile: boolean) => { if (breakpoint === 768) document.documentElement.setAttribute('data-ui', mobile ? 'mobile' : 'desktop'); };
    if (localStorage.getItem(FORCE_KEY) === '1') {
      setIsMobile(false);
      mark(false);
      return;
    }

    // Un téléphone tourné en paysage dépasse 768px de large : on le reconnaît à son écran
    // tactile peu haut, pour ne pas basculer sur la mise en page ordinateur.
    const mq = window.matchMedia(`(max-width: ${breakpoint}px), (pointer: coarse) and (max-height: 520px)`);
    const update = () => { setIsMobile(mq.matches); mark(mq.matches); };
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
