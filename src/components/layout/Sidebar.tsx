'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useApp } from '@/context/AppProvider';
import Modal from '@/components/ui/Modal';
import {
  LayoutGrid, BarChart3, DollarSign, Home, Settings, Eye, EyeOff,
  RefreshCw, LogOut, Globe, TrendingUp,
} from 'lucide-react';

const spaceNavItems = [
  { href: '/tracker', label: 'Tracker', icon: LayoutGrid },
  { href: '/dashboard', label: 'Dashboard', icon: BarChart3 },
  { href: '/revenus', label: 'Revenus', icon: DollarSign },
  { href: '/setup', label: 'Setup', icon: Home },
];

const globalNavItems = [
  { href: '/global', label: 'Vue Globale', icon: Globe },
  { href: '/networth', label: 'Net Worth', icon: TrendingUp },
];

const CURRENCY_SYMBOLS: Record<string, string> = {
  AED: 'د.إ', EUR: '€', USD: '$', GBP: '£', THB: '฿', MAD: 'DH', CHF: 'CHF', CAD: 'C$', SGD: 'S$',
};

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const {
    liveRate, refreshRate, syncStatus, hiddenMode, toggleHidden, logout, userId,
    spaces, activeSpace, activeSpaceId, setActiveSpaceId, createSpace,
  } = useApp();

  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [newSpaceOpen, setNewSpaceOpen] = useState(false);
  const [nsName, setNsName] = useState('');
  const [nsEmoji, setNsEmoji] = useState('🌍');
  const [nsCurrency, setNsCurrency] = useState('EUR');
  const [nsStatus, setNsStatus] = useState<'active' | 'draft'>('active');

  const isActive = (href: string) => pathname.includes(href);

  const handleCreateSpace = () => {
    if (!nsName.trim()) return;
    const id = nsName.trim().toLowerCase().replace(/\s+/g, '-');
    createSpace({
      id, name: nsName.trim(), emoji: nsEmoji,
      localCurrency: nsCurrency, baseCurrency: 'EUR',
      status: nsStatus, dateFrom: new Date().toISOString().slice(0, 7), dateTo: null,
    });
    setActiveSpaceId(id);
    setNewSpaceOpen(false);
    setSwitcherOpen(false);
    setNsName(''); setNsEmoji('🌍'); setNsCurrency('EUR');
    router.push('/tracker');
  };

  const switchSpace = (id: string) => {
    setActiveSpaceId(id);
    setSwitcherOpen(false);
    router.push('/tracker');
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const NavButton = ({ href, label, icon: Icon }: { href: string; label: string; icon: any }) => (
    <button
      onClick={() => router.push(href)}
      className={`group flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium w-full text-left transition-all cursor-pointer relative ${
        isActive(href)
          ? 'text-t-1 bg-bg-3 border border-border-2 shadow-inset-border'
          : 'text-t-2 border border-transparent hover:text-t-1 hover:bg-bg-3/60'
      }`}
    >
      {isActive(href) && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 bg-accent rounded-r-full shadow-glow-sm" />
      )}
      <Icon size={15} className={isActive(href) ? 'text-accent' : 'opacity-50 group-hover:opacity-80 transition-opacity'} />
      <span className="tracking-tight">{label}</span>
    </button>
  );

  return (
    <aside className="w-[260px] bg-bg-2 border-r border-border fixed top-0 left-0 bottom-0 z-50 flex flex-col p-5 px-3.5 max-md:hidden">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-2 mb-6">
        <div className="w-[32px] h-[32px] rounded-lg bg-gradient-to-br from-accent to-emerald-600 flex items-center justify-center text-black text-[11px] font-extrabold shadow-glow ring-1 ring-accent/30">
          FH
        </div>
        <div>
          <div className="font-bold text-[15px] tracking-tight leading-none">FinanceHQ</div>
          <div className="text-[9px] text-t-3 uppercase tracking-[0.18em] mt-1 font-semibold">Cockpit</div>
        </div>
      </div>

      {/* User */}
      {userId && (
        <div className="flex items-center gap-2 px-3 py-2.5 bg-bg-3 border border-border rounded-md mb-3 shadow-inset-border">
          <span className="w-6 h-6 rounded-full bg-bg-4 border border-border flex items-center justify-center text-[11px]">👤</span>
          <span className="text-[12px] font-semibold flex-1 truncate tracking-tight">{userId}</span>
          <button onClick={logout} className="text-t-3 hover:text-danger p-1 rounded transition-colors" title="Déconnexion">
            <LogOut size={12} />
          </button>
        </div>
      )}

      {/* Nav - Global (above space) */}
      <div className="text-[9px] text-t-4 uppercase tracking-[0.18em] font-semibold px-3 pb-1.5 pt-1">Global</div>
      <nav className="flex flex-col gap-0.5 mb-3">
        {globalNavItems.map(item => <NavButton key={item.href} {...item} />)}
      </nav>

      <div className="h-px bg-border my-2" />

      {/* Space Switcher */}
      <div className="relative mb-3">
        <button
          onClick={() => setSwitcherOpen(!switcherOpen)}
          className="flex items-center gap-2.5 px-3 py-2.5 w-full bg-bg-3 border border-border rounded-md cursor-pointer hover:border-border-2 hover:bg-surface-hover transition-all shadow-inset-border"
        >
          <span className="text-xl leading-none">{activeSpace.emoji}</span>
          <div className="flex-1 min-w-0 text-left">
            <div className="text-[13px] font-semibold truncate">{activeSpace.name}</div>
            <div className="text-[10px] text-t-3 font-mono">{activeSpace.localCurrency} · {activeSpace.status === 'active' ? 'Actif' : activeSpace.status === 'archived' ? 'Archivé' : 'Brouillon'}</div>
          </div>
          <span className={`text-t-3 text-[10px] transition-transform ${switcherOpen ? 'rotate-180' : ''}`}>▾</span>
        </button>

        {/* Dropdown */}
        {switcherOpen && (
          <div className="absolute top-full left-0 right-0 mt-1.5 bg-bg-3 border border-border-2 rounded-md shadow-xl z-50 overflow-hidden animate-fade-up">
            {spaces.map(s => (
              <button
                key={s.id}
                onClick={() => switchSpace(s.id)}
                className={`flex items-center gap-2.5 px-3 py-2.5 w-full text-left transition-all cursor-pointer hover:bg-surface-hover ${s.id === activeSpaceId ? 'bg-bg-4' : ''}`}
              >
                <span className="text-lg">{s.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold truncate tracking-tight">{s.name}</div>
                  <div className="text-[9px] text-t-3 font-mono">{s.localCurrency}</div>
                </div>
                {s.id === activeSpaceId && <span className="text-accent text-xs">✓</span>}
              </button>
            ))}
            <div className="border-t border-border">
              <button
                onClick={() => { setSwitcherOpen(false); setNewSpaceOpen(true); }}
                className="flex items-center gap-2 px-3 py-2.5 w-full text-left text-[12px] text-t-2 hover:bg-surface-hover hover:text-accent transition-all cursor-pointer"
              >
                <span className="text-accent text-base leading-none">+</span> Nouveau space
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Nav - Espace */}
      <div className="text-[9px] text-t-4 uppercase tracking-[0.18em] font-semibold px-3 pb-1.5 pt-1">Espace</div>
      <nav className="flex flex-col gap-0.5 mb-2">
        {spaceNavItems.map(item => <NavButton key={item.href} {...item} />)}
      </nav>

      {/* Footer - Rate */}
      <div className="mt-auto">
        <div className="flex justify-end gap-1.5 mb-2">
          <button onClick={() => router.push('/settings')} className={`w-7 h-7 flex items-center justify-center rounded-md transition-all cursor-pointer ${isActive('/settings') ? 'bg-bg-4 border border-border-2 text-t-1' : 'text-t-3 hover:bg-bg-3 hover:text-t-1'}`} title="Paramètres">
            <Settings size={13} />
          </button>
          <button onClick={toggleHidden} className="w-7 h-7 flex items-center justify-center rounded-md text-t-3 hover:bg-bg-3 hover:text-t-1 transition-all cursor-pointer" title={hiddenMode ? 'Afficher' : 'Masquer'}>
            {hiddenMode ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        </div>
        <div className="p-3.5 bg-bg-3 border border-border rounded-md shadow-inset-border relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-accent/[0.03] to-transparent pointer-events-none" />
        <div className="relative">
        <div className="flex justify-between items-center">
          <span className="text-[9px] text-t-3 uppercase tracking-[0.14em] font-semibold">EUR / {activeSpace.localCurrency}</span>
          <button onClick={refreshRate} className="text-t-3 hover:text-accent transition-colors cursor-pointer" title="Rafraîchir">
            <RefreshCw size={11} />
          </button>
        </div>
        <div className="hero-num text-[22px] mt-1 mono-value text-t-1" style={{ fontWeight: 400, letterSpacing: '-0.5px' }}>{liveRate.toFixed(4)}</div>
        <div className="text-[10px] text-t-3 mt-0.5 tracking-tight">Taux de conversion</div>
        <div className="flex items-center gap-1.5 mt-1.5 text-[9px] text-accent font-bold tracking-[0.14em]">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-slow shadow-glow-sm" />
          LIVE
        </div>
        {syncStatus !== 'off' && (
          <div className={`flex items-center gap-1.5 mt-1 text-[9px] font-bold tracking-[0.14em] ${syncStatus === 'ok' ? 'text-accent' : 'text-warning'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${syncStatus === 'ok' ? 'bg-accent animate-pulse-slow' : 'bg-warning animate-pulse'}`} />
            {syncStatus === 'ok' ? 'SYNCED' : 'SYNCING...'}
          </div>
        )}
        </div>
        </div>
      </div>

      {/* New Space Modal */}
      <Modal open={newSpaceOpen} onClose={() => setNewSpaceOpen(false)} title="Créer un nouveau space">
        <div className="space-y-3.5">
          <div>
            <label className="block text-[10px] text-t-3 uppercase tracking-wider font-medium mb-1.5">Emoji</label>
            <input className="fi text-center text-2xl" value={nsEmoji} onChange={e => setNsEmoji(e.target.value)} placeholder="🌍" />
          </div>
          <div>
            <label className="block text-[10px] text-t-3 uppercase tracking-wider font-medium mb-1.5">Nom</label>
            <input className="fi" value={nsName} onChange={e => setNsName(e.target.value)} placeholder="Ex: France, Thailand..." />
          </div>
          <div>
            <label className="block text-[10px] text-t-3 uppercase tracking-wider font-medium mb-1.5">Devise locale</label>
            <select className="fi" value={nsCurrency} onChange={e => setNsCurrency(e.target.value)}>
              {Object.entries(CURRENCY_SYMBOLS).map(([code, sym]) => (
                <option key={code} value={code}>{code} ({sym})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-t-3 uppercase tracking-wider font-medium mb-1.5">Statut</label>
            <select className="fi" value={nsStatus} onChange={e => setNsStatus(e.target.value as 'active' | 'draft')}>
              <option value="active">Actif</option>
              <option value="draft">Brouillon</option>
            </select>
          </div>
          <div className="flex gap-2.5 mt-5">
            <button onClick={handleCreateSpace} className="px-4 py-2 bg-accent text-black font-semibold text-sm rounded-sm cursor-pointer hover:opacity-90">Créer</button>
            <button onClick={() => setNewSpaceOpen(false)} className="px-4 py-2 border border-border text-t-2 text-sm rounded-sm cursor-pointer hover:bg-bg-3">Annuler</button>
          </div>
        </div>
      </Modal>
    </aside>
  );
}
