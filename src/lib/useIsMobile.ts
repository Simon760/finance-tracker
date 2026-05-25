'use client';

import { useEffect, useState } from 'react';

/**
 * Détecte si on est en viewport mobile (≤768px).
 * Renvoie null en SSR puis true/false côté client pour éviter les hydration mismatches.
 */
export function useIsMobile(breakpoint = 768): boolean | null {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [breakpoint]);

  return isMobile;
}
