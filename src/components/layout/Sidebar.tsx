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
      className={`flex items-center gap-2.5 px-3 py-2 rounded-sm text-[13px] font-medium w-full text-left transition-all cursor-pointer ${
        isActive(href) ? 'text-t-1 bg-bg-3 border border-border' : 'text-t-2 border border-transparent hover:text-t-1 hover:bg-bg-3'
      }`}
    >
      <Icon size={16} className={isActive(href) ? 'opacity-90' : 'opacity-50'} />
      {label}
    </button>
  );

  return (
    <aside className="w-[260px] bg-bg-2 border-r border-border fixed top-0 left-0 bottom-0 z-50 flex flex-col p-5 px-3.5 max-md:hidden">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-2 mb-6">
        <div className="w-[30px] h-[30px] rounded-lg bg-accent flex items-center justify-center text-black text-[11px] font-extrabold shadow-glow">
          FH
        </div>
        <div>
          <div className="font-bold text-[15px] tracking-tight">FinanceHQ</div>
          <div className="text-[9px] text-t-3 uppercase tracking-wider">Cockpit</div>
        </div>
      </div>

      {/* User */}
      {userId && (
        <div className="flex items-center gap-2 px-3 py-2.5 bg-bg-3 border border-border rounded-sm mb-4">
          <span className="text-sm">👤</span>
          <span className="text-xs font-semibold flex-1 truncate">{userId}</span>
          <button onClick={logout} className="text-t-3 hover:text-danger p-1 rounded transition-colors" title="Déconnexion">
            <LogOut size={12} />
          </button>
        </div>
      )}

      {/* Space Switcher */}
      <div className="relative mb-5">
        <button
          onClick={() => setSwitcherOpen(!switcherOpen)}
          className="flex items-center gap-2.5 px-3 py-2.5 w-full bg-bg-3 border border-border rounded-sm cursor-pointer hover:border-border-2 hover:bg-surface-hover transition-all"
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
          <div className="absolute top-full left-0 right-0 mt-1 bg-bg-3 border border-border-2 rounded-sm shadow-lg z-50 overflow-hidden">
            {spaces.map(s => (
              <button
                key={s.id}
                onClick={() => switchSpace(s.id)}
                className={`flex items-center gap-2.5 px-3 py-2.5 w-full text-left transition-all cursor-pointer hover:bg-surface-hover ${s.id === activeSpaceId ? 'bg-bg-4' : ''}`}
              >
                <span className="text-lg">{s.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold truncate">{s.name}</div>
                  <div className="text-[9px] text-t-3 font-mono">{s.localCurrency}</div>
                </div>
                {s.id === activeSpaceId && <span className="text-accent text-xs">✓</span>}
              </button>
            ))}
            <div className="border-t border-border">
              <button
                onClick={() => { setSwitcherOpen(false); setNewSpaceOpen(true); }}
                className="flex items-center gap-2 px-3 py-2.5 w-full text-left text-[12px] text-t-2 hover:bg-surface-hover transition-all cursor-pointer"
              >
                <span className="text-t-3">+</span> Nouveau space
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Nav - Espace */}
      <div className="text-[9px] text-t-4 uppercase tracking-widest font-semibold px-3 pb-1 pt-1">Espace</div>
      <nav className="flex flex-col gap-0.5 mb-2">
        {spaceNavItems.map(item => <NavButton key={item.href} {...item} />)}
      </nav>

      <div className="h-px bg-border my-2" />

      {/* Nav - Global */}
      <div className="text-[9px] text-t-4 uppercase tracking-widest font-semibold px-3 pb-1 pt-1">Global</div>
      <nav className="flex flex-col gap-0.5 mb-2">
        {globalNavItems.map(item => <NavButton key={item.href} {...item} />)}
      </nav>

      {/* Footer - Rate */}
      <div className="mt-auto">
        <div className="flex justify-end gap-1.5 mb-1.5">
          <button onClick={() => router.push('/settings')} className={`w-7 h-7 flex items-center justify-center rounded-md text-sm transition-all cursor-pointer ${isActive('/settings') ? 'bg-bg-4 border border-border' : 'text-t-3 hover:bg-bg-3 hover:text-t-1'}`} title="Paramètres">
            <Settings size={14} />
          </button>
          <button onClick={toggleHidden} className="w-7 h-7 flex items-center justify-center rounded-md text-t-3 hover:bg-bg-3 hover:text-t-1 transition-all cursor-pointer" title={hiddenMode ? 'Afficher' : 'Masquer'}>
            {hiddenMode ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        <div className="p-3.5 bg-bg-3 border border-border rounded-sm">
        <div className="flex justify-between items-center">
          <span className="text-[9px] text-t-3 uppercase tracking-wider">EUR / {activeSpace.localCurrency}</span>
          <button onClick={refreshRate} className="text-t-3 hover:text-t-1 transition-colors cursor-pointer" title="Rafraîchir">
            <RefreshCw size={12} />
          </button>
        </div>
        <div className="font-mono text-lg font-semibold mt-1 mono-value">{liveRate.toFixed(4)}</div>
        <div className="text-[10px] text-t-3 mt-0.5">Taux de conversion</div>
        <div className="flex items-center gap-1 mt-1 text-[9px] text-accent font-semibold tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-slow" />
          LIVE
        </div>
        {syncStatus !== 'off' && (
          <div className={`flex items-center gap-1 mt-1 text-[9px] font-semibold tracking-wider ${syncStatus === 'ok' ? 'text-accent' : 'text-warning'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${syncStatus === 'ok' ? 'bg-accent animate-pulse-slow' : 'bg-warning animate-pulse'}`} />
            {syncStatus === 'ok' ? 'SYNCED' : 'SYNCING...'}
          </div>
        )}
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
