'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Home, Coins, PieChart, MapPin, Menu, Eye, EyeOff, Search, ChevronLeft } from 'lucide-react';
import { useApp } from '@/context/AppProvider';
import { useKeyboardInset } from '@/lib/useOverlay';
import GlobalSearch from '@/components/GlobalSearch';
import SpaceSheet from './SpaceSheet';

/** Onglets de la barre du bas. */
const TABS = [
  { href: '/tracker', label: 'Accueil', icon: Home },
  { href: '/revenus', label: 'Revenus', icon: Coins },
  { href: '/dashboard', label: 'Stats', icon: PieChart },
  { href: '/residency', label: 'Résidence', icon: MapPin },
  { href: '/menu', label: 'Menu', icon: Menu },
] as const;

/** Pages ouvertes depuis Menu : barre du haut avec retour + titre. */
export const MENU_PAGES: Record<string, string> = {
  '/global': 'Vue globale',
  '/networth': 'Patrimoine',
  '/simulation': 'Simulateur',
  '/import': 'Relevé bancaire',
  '/trips': 'Voyages',
  '/setup': 'Setup',
  '/settings': 'Réglages',
};

export default function MobileShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { activeSpace, hiddenMode, toggleHidden, syncStatus } = useApp();
  const [spaceOpen, setSpaceOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  useKeyboardInset();

  const tab = TABS.find(t => pathname.startsWith(t.href));
  const subKey = Object.keys(MENU_PAGES).find(k => pathname.startsWith(k));
  const isHome = tab?.href === '/tracker';
  const activeHref = tab?.href || (subKey ? '/menu' : '');
  const round = 'w-10 h-10 flex items-center justify-center rounded-full text-t-2 active:bg-bg-3 transition-colors shrink-0';

  return (
    <div className="min-h-[100dvh] flex flex-col bg-bg">
      <div className="m-statusbar" />

      {/* Barre du haut */}
      <header className="sticky top-0 z-40 bg-bg/90 backdrop-blur-md pt-[env(safe-area-inset-top)]">
        <div className="h-[52px] flex items-center gap-2 px-3 w-full max-w-[600px] mx-auto">
          {subKey ? (
            <button onClick={() => router.push('/menu')} className={round} aria-label="Retour au menu">
              <ChevronLeft size={22} />
            </button>
          ) : (
            <button onClick={() => setSpaceOpen(true)} className="relative w-10 h-10 flex items-center justify-center shrink-0 active:opacity-60" aria-label={`Espace ${activeSpace?.name || ''} — changer`}>
              <span className="w-8 h-8 rounded-full bg-bg-3 flex items-center justify-center text-[14px] font-semibold text-t-1">
                {activeSpace?.emoji || (activeSpace?.name?.[0]?.toUpperCase() ?? 'F')}
              </span>
              {/* Synchro : vert = à jour, orange = envoi en cours ou hors ligne */}
              <span className={`absolute right-0.5 bottom-0.5 w-2.5 h-2.5 rounded-full border-2 border-bg ${syncStatus === 'ok' ? 'bg-accent' : 'bg-warning'}`} />
            </button>
          )}

          {isHome ? (
            <button onClick={() => setSearchOpen(true)} className="flex-1 h-9 rounded-full bg-bg-3 flex items-center gap-2 px-3.5 text-t-3 text-[14px] active:opacity-70 min-w-0">
              <Search size={16} className="shrink-0" />
              <span className="truncate">Rechercher</span>
            </button>
          ) : (
            <>
              <div className="flex-1 min-w-0 text-[17px] font-semibold tracking-tight text-t-1 truncate px-1">
                {subKey ? MENU_PAGES[subKey] : tab?.label || 'FinanceHQ'}
              </div>
              <button onClick={() => setSearchOpen(true)} className={round} aria-label="Rechercher">
                <Search size={19} />
              </button>
            </>
          )}

          <button onClick={toggleHidden} className={round} aria-label={hiddenMode ? 'Afficher les montants' : 'Masquer les montants'}>
            {hiddenMode ? <EyeOff size={19} /> : <Eye size={19} />}
          </button>
        </div>
      </header>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <SpaceSheet open={spaceOpen} onClose={() => setSpaceOpen(false)} />

      {/* Contenu */}
      <main className="flex-1 w-full max-w-[600px] mx-auto px-4 pt-1 pb-[calc(env(safe-area-inset-bottom)+84px)] overflow-x-hidden">
        {children}
      </main>

      {/* Barre du bas */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-bg/90 backdrop-blur-md border-t border-t-1/[0.06] pb-[env(safe-area-inset-bottom)]" aria-label="Navigation principale">
        <div className="flex w-full max-w-[600px] mx-auto">
          {TABS.map(t => {
            const Icon = t.icon;
            const active = activeHref === t.href;
            return (
              <button
                key={t.href}
                onClick={() => router.push(t.href)}
                aria-current={active ? 'page' : undefined}
                className={`flex-1 flex flex-col items-center justify-center gap-[3px] h-[56px] transition-colors active:opacity-60 ${active ? 'text-t-1' : 'text-t-3'}`}
              >
                <Icon size={21} strokeWidth={active ? 2.2 : 1.8} />
                <span className={`text-[11px] tracking-tight ${active ? 'font-semibold' : 'font-medium'}`}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
