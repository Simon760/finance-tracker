'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutGrid, DollarSign, Globe, MapPin, MoreHorizontal,
  Eye, EyeOff, RefreshCw, LogOut, BarChart3, TrendingUp, Home, Settings, ChevronRight, X,
} from 'lucide-react';
import { useApp } from '@/context/AppProvider';
import { setForceDesktop } from '@/lib/useIsMobile';
import { Monitor } from 'lucide-react';

const TABS = [
  { href: '/tracker', label: 'Tracker', icon: LayoutGrid },
  { href: '/revenus', label: 'Revenus', icon: DollarSign },
  { href: '/global', label: 'Global', icon: Globe },
  { href: '/residency', label: 'Résidence', icon: MapPin },
];

const MORE_ITEMS = [
  { href: '/dashboard', label: 'Dashboard du space', icon: BarChart3 },
  { href: '/networth', label: 'Net Worth', icon: TrendingUp },
  { href: '/setup', label: 'Setup', icon: Home },
  { href: '/settings', label: 'Paramètres', icon: Settings },
];

export default function MobileShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    activeSpace, spaces, setActiveSpaceId, liveRate, refreshRate, rateRefreshing,
    hiddenMode, toggleHidden, logout, userId,
  } = useApp();

  const [moreOpen, setMoreOpen] = useState(false);
  const [spaceOpen, setSpaceOpen] = useState(false);

  useEffect(() => {
    setMoreOpen(false);
    setSpaceOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (moreOpen || spaceOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [moreOpen, spaceOpen]);

  const currentTab = TABS.find(t => pathname.includes(t.href));
  const currentMore = MORE_ITEMS.find(t => pathname.includes(t.href));
  const headerTitle = currentTab?.label || currentMore?.label || 'FinanceHQ';

  return (
    <div className="min-h-screen flex flex-col bg-bg-1">
      {/* Top app bar */}
      <header className="sticky top-0 z-40 bg-bg-2/95 backdrop-blur-md border-b border-border h-14 flex items-center px-4 gap-3">
        <button
          onClick={() => setSpaceOpen(true)}
          className="flex items-center gap-2 min-w-0 flex-1 active:opacity-60 transition-opacity"
        >
          <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-black font-bold text-[13px] shrink-0">
            {activeSpace?.emoji || (activeSpace?.name?.[0]?.toUpperCase() ?? 'F')}
          </div>
          <div className="min-w-0 text-left">
            <div className="text-[10px] uppercase tracking-wider text-t-4 font-semibold leading-none">{headerTitle}</div>
            <div className="text-[13px] font-semibold text-t-1 truncate leading-tight">{activeSpace?.name || 'Space'}</div>
          </div>
          <ChevronRight size={14} className="text-t-3 shrink-0 rotate-90" />
        </button>
        <button
          onClick={toggleHidden}
          className="w-9 h-9 flex items-center justify-center rounded-full active:bg-bg-4 transition-colors text-t-2"
          aria-label={hiddenMode ? 'Afficher montants' : 'Masquer montants'}
        >
          {hiddenMode ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </header>

      {/* Page content */}
      <main className="flex-1 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+72px)] overflow-x-hidden">
        {children}
      </main>

      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-bg-2/95 backdrop-blur-md border-t border-border pb-[env(safe-area-inset-bottom)]">
        <div className="flex">
          {TABS.map(t => {
            const Icon = t.icon;
            const active = pathname.includes(t.href);
            return (
              <button
                key={t.href}
                onClick={() => router.push(t.href)}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 h-[60px] transition-colors active:bg-bg-3 ${active ? 'text-accent' : 'text-t-3'}`}
              >
                <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
                <span className={`text-[10px] tracking-tight ${active ? 'font-semibold' : 'font-medium'}`}>{t.label}</span>
              </button>
            );
          })}
          <button
            onClick={() => setMoreOpen(true)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 h-[60px] transition-colors active:bg-bg-3 ${currentMore ? 'text-accent' : 'text-t-3'}`}
          >
            <MoreHorizontal size={20} strokeWidth={currentMore ? 2.2 : 1.8} />
            <span className={`text-[10px] tracking-tight ${currentMore ? 'font-semibold' : 'font-medium'}`}>Plus</span>
          </button>
        </div>
      </nav>

      {/* "Plus" sheet */}
      {moreOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end animate-fade-in" onClick={() => setMoreOpen(false)}>
          <div
            className="w-full bg-bg-2 border-t border-border rounded-t-2xl p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] animate-slide-up"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-bg-4 rounded-full mx-auto mb-4" />
            <div className="text-[11px] uppercase tracking-wider text-t-3 font-semibold mb-3 px-1">Autres pages</div>
            <div className="space-y-1 mb-4">
              {MORE_ITEMS.map(m => {
                const Icon = m.icon;
                const active = pathname.includes(m.href);
                return (
                  <button
                    key={m.href}
                    onClick={() => { router.push(m.href); setMoreOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors active:bg-bg-4 ${active ? 'bg-bg-3 text-t-1' : 'text-t-2'}`}
                  >
                    <Icon size={18} className={active ? 'text-accent' : ''} />
                    <span className="text-[14px] font-medium">{m.label}</span>
                    <ChevronRight size={16} className="ml-auto text-t-4" />
                  </button>
                );
              })}
            </div>
            <div className="border-t border-border pt-3 space-y-2">
              <div className="flex items-center justify-between px-1 text-[11px] text-t-3">
                <span>Taux EUR/{activeSpace?.localCurrency || '—'}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono mono-value text-t-1">{liveRate?.toFixed(4) || '—'}</span>
                  <button onClick={refreshRate} disabled={rateRefreshing} className="w-7 h-7 flex items-center justify-center rounded-full active:bg-bg-4 disabled:opacity-60">
                    <RefreshCw size={13} className={rateRefreshing ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between px-1 text-[11px] text-t-3">
                <span>Utilisateur</span>
                <span className="text-t-2 font-mono">{userId || '—'}</span>
              </div>
              <button
                onClick={() => setForceDesktop(true)}
                className="w-full flex items-center justify-center gap-2 mt-3 py-3 bg-bg-3 text-t-2 border border-border rounded-lg font-semibold text-[12px] active:bg-bg-4"
              >
                <Monitor size={14} /> Forcer la vue desktop
              </button>
              <button onClick={logout} className="w-full flex items-center justify-center gap-2 mt-1.5 py-3 bg-danger/10 text-danger border border-danger/25 rounded-lg font-semibold text-[13px] active:bg-danger/20">
                <LogOut size={16} /> Déconnexion
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Space switcher sheet */}
      {spaceOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end animate-fade-in" onClick={() => setSpaceOpen(false)}>
          <div
            className="w-full bg-bg-2 border-t border-border rounded-t-2xl p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] animate-slide-up max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-bg-4 rounded-full mx-auto mb-4" />
            <div className="flex items-center justify-between mb-3">
              <div className="text-[11px] uppercase tracking-wider text-t-3 font-semibold px-1">Spaces</div>
              <button onClick={() => setSpaceOpen(false)} className="w-7 h-7 flex items-center justify-center rounded-full active:bg-bg-4 text-t-3">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-1">
              {spaces.map(s => {
                const active = s.id === activeSpace?.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => { setActiveSpaceId(s.id); setSpaceOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors active:bg-bg-4 ${active ? 'bg-bg-3' : ''}`}
                  >
                    <div className="w-9 h-9 rounded-full bg-bg-4 flex items-center justify-center text-[15px]">
                      {s.emoji || s.name[0]}
                    </div>
                    <div className="text-left flex-1 min-w-0">
                      <div className={`text-[14px] font-semibold truncate ${active ? 'text-accent' : 'text-t-1'}`}>{s.name}</div>
                      <div className="text-[11px] text-t-3">{s.localCurrency} · {s.status === 'active' ? 'Actif' : 'Brouillon'}</div>
                    </div>
                    {active && <div className="w-2 h-2 rounded-full bg-accent shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
