'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useApp } from '@/context/AppProvider';
import { f$ } from '@/lib/utils';
import {
  LayoutGrid, BarChart3, DollarSign, Home, Settings, Eye, EyeOff, RefreshCw, LogOut,
} from 'lucide-react';

const navItems = [
  { href: '/tracker', label: 'Tracker', icon: LayoutGrid },
  { href: '/dashboard', label: 'Dashboard', icon: BarChart3 },
  { href: '/revenus', label: 'Revenus', icon: DollarSign },
  { href: '/setup', label: 'Setup', icon: Home },
];

const sysItems = [
  { href: '/settings', label: 'Paramètres', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { liveRate, refreshRate, syncStatus, hiddenMode, toggleHidden, logout, userId } = useApp();

  const isActive = (href: string) => pathname.includes(href);

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
      <div className="flex items-center gap-2.5 px-3 py-2.5 mb-5 bg-bg-3 border border-border rounded-sm cursor-default">
        <span className="text-xl leading-none">🇦🇪</span>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold truncate">Dubai</div>
          <div className="text-[10px] text-t-3 font-mono">AED · Actif</div>
        </div>
        <span className="text-t-3 text-[10px]">▾</span>
      </div>

      {/* Nav - Espace */}
      <div className="text-[9px] text-t-4 uppercase tracking-widest font-semibold px-3 pb-1 pt-2">Espace</div>
      <nav className="flex flex-col gap-0.5 mb-2">
        {navItems.map(({ href, label, icon: Icon }) => (
          <button
            key={href}
            onClick={() => router.push(href)}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-sm text-[13px] font-medium w-full text-left transition-all cursor-pointer ${
              isActive(href)
                ? 'text-t-1 bg-bg-3 border border-border'
                : 'text-t-2 border border-transparent hover:text-t-1 hover:bg-bg-3'
            }`}
          >
            <Icon size={16} className={isActive(href) ? 'opacity-90' : 'opacity-50'} />
            {label}
          </button>
        ))}
      </nav>

      <div className="h-px bg-border my-2" />

      {/* Nav - Système */}
      <div className="text-[9px] text-t-4 uppercase tracking-widest font-semibold px-3 pb-1 pt-2">Système</div>
      <nav className="flex flex-col gap-0.5">
        {sysItems.map(({ href, label, icon: Icon }) => (
          <button
            key={href}
            onClick={() => router.push(href)}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-sm text-[13px] font-medium w-full text-left transition-all cursor-pointer ${
              isActive(href)
                ? 'text-t-1 bg-bg-3 border border-border'
                : 'text-t-2 border border-transparent hover:text-t-1 hover:bg-bg-3'
            }`}
          >
            <Icon size={16} className={isActive(href) ? 'opacity-90' : 'opacity-50'} />
            {label}
          </button>
        ))}
        <button
          onClick={toggleHidden}
          className="flex items-center gap-2.5 px-3 py-2 rounded-sm text-[13px] font-medium w-full text-left text-t-2 border border-transparent hover:text-t-1 hover:bg-bg-3 transition-all cursor-pointer"
        >
          {hiddenMode ? <EyeOff size={16} className="opacity-50" /> : <Eye size={16} className="opacity-50" />}
          {hiddenMode ? 'Afficher' : 'Masquer'}
        </button>
      </nav>

      {/* Footer - Rate */}
      <div className="mt-auto p-3.5 bg-bg-3 border border-border rounded-sm">
        <div className="flex justify-between items-center">
          <span className="text-[9px] text-t-3 uppercase tracking-wider">EUR / AED</span>
          <button onClick={refreshRate} className="text-t-3 hover:text-t-1 transition-colors" title="Rafraîchir">
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
    </aside>
  );
}
