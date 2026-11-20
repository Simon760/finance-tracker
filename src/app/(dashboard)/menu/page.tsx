'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useIsMobile } from '@/lib/useIsMobile';
import MobileMenu from '@/components/mobile/MobileMenu';

/** Onglet « Menu » de l'UI mobile. Sur desktop la barre latérale joue ce rôle. */
export default function MenuPage() {
  const isMobile = useIsMobile();
  const router = useRouter();
  useEffect(() => { if (isMobile === false) router.replace('/tracker'); }, [isMobile, router]);
  return isMobile === true ? <MobileMenu /> : null;
}
