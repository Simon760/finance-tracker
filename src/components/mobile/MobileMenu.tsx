'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Globe, TrendingUp, FlaskConical, FileSpreadsheet, Plane, Home, Settings, Moon, Sun, EyeOff, RefreshCw, Monitor, LogOut, ArrowLeftRight,
} from 'lucide-react';
import { useApp } from '@/context/AppProvider';
import { setForceDesktop } from '@/lib/useIsMobile';
import BottomSheet from './BottomSheet';
import SpaceSheet from './SpaceSheet';
import { MButton, MCard, MDivider, MIcon, MLabel, MPill, MRow } from './ui';

const ANALYSE = [
  { href: '/global', label: 'Vue globale', sub: 'Tous les mois, toutes les années', icon: Globe },
  { href: '/networth', label: 'Patrimoine', sub: 'Comptes et actifs', icon: TrendingUp },
];
const OUTILS = [
  { href: '/simulation', label: 'Simulateur', sub: 'Trésorerie sur 1 à 12 mois', icon: FlaskConical },
  { href: '/import', label: 'Relevé bancaire', sub: 'Import CSV et rapprochement', icon: FileSpreadsheet },
  { href: '/trips', label: 'Voyages', sub: 'Budgets et dépenses en déplacement', icon: Plane },
  { href: '/setup', label: 'Setup', sub: 'Frais d’installation', icon: Home },
];

function Toggle({ on }: { on: boolean }) {
  return (
    <span className={`inline-flex w-[46px] h-[28px] rounded-full p-[3px] transition-colors ${on ? 'bg-accent' : 'bg-bg-4'}`}>
      <span className={`w-[22px] h-[22px] rounded-full bg-white transition-transform ${on ? 'translate-x-[18px]' : ''}`} />
    </span>
  );
}

export default function MobileMenu() {
  const router = useRouter();
  const {
    activeSpace, userId, theme, toggleTheme, hiddenMode, toggleHidden, logout,
    liveRate, refreshRate, rateRefreshing, setRateManually, lastRateFetch, state, syncStatus,
  } = useApp();
  const [spaceOpen, setSpaceOpen] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const [rateInput, setRateInput] = useState('');
  const cur = activeSpace?.localCurrency || 'AED';

  const age = (() => {
    if (lastRateFetch == null) return 'pas encore actualisé';
    const min = Math.floor((Date.now() - lastRateFetch) / 60000);
    if (min < 1) return 'à l’instant';
    if (min < 60) return `il y a ${min} min`;
    return `il y a ${Math.floor(min / 60)} h`;
  })();
  const lastUpdate = state.lastUpdate ? new Date(state.lastUpdate) : null;
  const rateValue = parseFloat(rateInput.replace(',', '.'));

  const link = (it: { href: string; label: string; sub: string; icon: typeof Globe }, i: number) => {
    const Icon = it.icon;
    return (
      <div key={it.href}>
        {i > 0 && <MDivider />}
        <MRow icon={<MIcon><Icon size={17} /></MIcon>} title={it.label} sub={it.sub} chevron onClick={() => router.push(it.href)} />
      </div>
    );
  };

  return (
    <div className="-mx-1">
      {/* Profil */}
      <div className="flex items-center gap-3 px-3 pt-2 pb-5">
        <span className="w-12 h-12 rounded-full bg-bg-3 flex items-center justify-center text-[19px] font-semibold text-t-1 shrink-0">
          {activeSpace?.emoji || (activeSpace?.name?.[0]?.toUpperCase() ?? 'F')}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[17px] font-semibold tracking-tight text-t-1 truncate">{activeSpace?.name || 'FinanceHQ'}</div>
          <div className="text-[13px] text-t-3 truncate">{userId || '—'} · {cur} vers {activeSpace?.baseCurrency || 'EUR'}</div>
        </div>
        <MPill onClick={() => setSpaceOpen(true)}><ArrowLeftRight size={14} />Changer</MPill>
      </div>

      <MLabel>Analyse</MLabel>
      <MCard className="mb-4">{ANALYSE.map(link)}</MCard>

      <MLabel>Outils</MLabel>
      <MCard className="mb-4">{OUTILS.map(link)}</MCard>

      <MLabel>Réglages</MLabel>
      <MCard className="mb-4">
        <MRow icon={<MIcon><Settings size={17} /></MIcon>} title="Réglages" sub="Postes, récurrences, données, historique" chevron onClick={() => router.push('/settings')} />
        <MDivider />
        <MRow
          icon={<MIcon>{theme === 'dark' ? <Moon size={17} /> : <Sun size={17} />}</MIcon>}
          title="Thème sombre"
          right={<Toggle on={theme === 'dark'} />}
          onClick={toggleTheme}
        />
        <MDivider />
        <MRow icon={<MIcon><EyeOff size={17} /></MIcon>} title="Masquer les montants" right={<Toggle on={hiddenMode} />} onClick={toggleHidden} />
        <MDivider />
        <MRow
          icon={<MIcon><span className="text-[12px]">€</span></MIcon>}
          title={`Taux EUR / ${cur}`}
          sub={`Actualisé ${age}`}
          right={<span className="mono-value">{liveRate ? liveRate.toFixed(4) : '—'}</span>}
          chevron
          onClick={() => { setRateInput(liveRate ? liveRate.toFixed(4) : ''); setRateOpen(true); }}
        />
      </MCard>

      <MCard className="mb-4">
        <MRow icon={<MIcon><Monitor size={17} /></MIcon>} title="Afficher la version ordinateur" sub="Revenir ici : ajouter ?desktop=0 à l’adresse" onClick={() => setForceDesktop(true)} />
        <MDivider />
        <MRow icon={<MIcon className="!text-danger"><LogOut size={17} /></MIcon>} title="Se déconnecter" tone="text-danger" onClick={logout} />
      </MCard>

      <div className="text-center text-[12px] text-t-4 px-6 pb-2 leading-relaxed">
        {syncStatus === 'ok' ? 'Synchronisé' : syncStatus === 'saving' ? 'Envoi en cours…' : 'Hors ligne — rien n’est envoyé'}
        {lastUpdate && !isNaN(lastUpdate.getTime()) && (
          <> · dernière modification le {lastUpdate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} à {lastUpdate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</>
        )}
      </div>

      <SpaceSheet open={spaceOpen} onClose={() => setSpaceOpen(false)} />

      {/* Taux de change */}
      <BottomSheet
        open={rateOpen}
        onClose={() => setRateOpen(false)}
        title={`Taux EUR / ${cur}`}
        footer={
          <MButton disabled={!(rateValue > 0)} onClick={() => { setRateManually(rateValue); setRateOpen(false); }}>Utiliser ce taux</MButton>
        }
      >
        <div className="text-center pt-2 pb-4">
          <input
            className="m-input m-amount mono-value text-center"
            inputMode="decimal"
            value={rateInput}
            onChange={e => setRateInput(e.target.value)}
            aria-label="Taux de change"
          />
          <div className="text-[13px] text-t-3 mt-1">1 € = {rateValue > 0 ? rateValue.toFixed(4) : '—'} {cur} · actualisé {age}</div>
        </div>
        <MButton variant="ghost" onClick={() => { refreshRate().then(() => setRateOpen(false)).catch(() => {}); }} disabled={rateRefreshing}>
          <RefreshCw size={16} className={rateRefreshing ? 'animate-spin' : ''} />
          Récupérer le taux du marché
        </MButton>
      </BottomSheet>
    </div>
  );
}
