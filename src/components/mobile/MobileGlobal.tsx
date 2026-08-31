'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppProvider';
import { f$, f0, sumEur, sumAed, lastMonthWithBalance, monthBankBalance, bankRealDelta } from '@/lib/utils';
import { LEGACY_EARN_MONTHS, isLegacyEarnMonth, INSTALL_CAPITAL } from '@/lib/constants';
import { ChevronRight, TrendingUp } from 'lucide-react';

export default function MobileGlobal() {
  const { spaces, liveRate, setActiveSpaceId } = useApp();
  const router = useRouter();

  const spaceStats = useMemo(() => {
    return spaces.map(space => {
      const totalSpent = space.months.reduce((s, m) => s + sumEur(m, space.postes, m.extraActual), 0);
      // Les mois legacy lisent Month.earn ci-dessous : on exclut leurs entrées de la
      // table Revenus, sinon ils sont comptés deux fois.
      const totalRevConfirmed = Object.entries(space.revenus?.months || {}).reduce((total, [monthId, entries]) => {
        if (isLegacyEarnMonth(monthId)) return total;
        return total + (entries || []).filter(e => !e.status || e.status === 'confirmed').reduce((s, e) => s + (e.cashed || 0), 0);
      }, 0);
      const legacyEarn = space.months
        .filter(m => LEGACY_EARN_MONTHS.includes(m.id))
        .reduce((s, m) => s + (m.earn || 0), 0);

      return {
        id: space.id,
        name: space.name,
        emoji: space.emoji,
        currency: space.localCurrency,
        status: space.status,
        monthCount: space.months.length,
        totalSpent,
        totalRevenue: totalRevConfirmed + legacyEarn,
        balance: totalRevConfirmed + legacyEarn - totalSpent,
      };
    });
  }, [spaces]);

  const grandTotalSpent = spaceStats.reduce((s, sp) => s + sp.totalSpent, 0);
  const grandTotalRev = spaceStats.reduce((s, sp) => s + sp.totalRevenue, 0);
  const grandBalance = grandTotalRev - grandTotalSpent;

  // Variation RÉELLE du compte (tous spaces, converti en EUR) + net des flux tracés
  // sur la même période : l'écart entre les deux = mouvements bancaires non saisis.
  // Le point de départ est le capital d'installation reconstitué depuis les relevés
  // bancaires (INSTALL_CAPITAL), pas le soldeStart du premier mois renseigné.
  const bankReality = useMemo(() => {
    return spaces.reduce((acc, s) => {
      const base = INSTALL_CAPITAL[s.id];
      const r = bankRealDelta(s.months, s.postes, s.revenus?.months, liveRate,
        base ? { aed: base.aed, label: `le ${base.date}` } : undefined);
      const toEurLocal = (v: number) => (s.localCurrency === 'EUR' ? v : v / liveRate);
      return {
        delta: acc.delta + toEurLocal(r.delta),
        flows: acc.flows + toEurLocal(r.flows),
        from: acc.from || r.from,
        startLabel: acc.startLabel || (base ? `capital ${f0(base.aed)} ${s.localCurrency}` : ''),
      };
    }, { delta: 0, flows: 0, from: null as string | null, startLabel: '' });
  }, [spaces, liveRate]);

  // Bank balances
  const bankBalances = useMemo(() => {
    return spaces.map(s => {
      // Dernier mois RENSEIGNÉ (pas le dernier de la liste, souvent un mois futur vide)
      const lastMonth = lastMonthWithBalance(s.months);
      if (!lastMonth) return null;
      const balance = monthBankBalance(lastMonth, s.postes, s.revenus?.months, liveRate);
      const eurBalance = s.localCurrency === 'EUR' ? balance : balance / liveRate;
      return { space: s.name, emoji: s.emoji, currency: s.localCurrency, balance, eurBalance };
    }).filter((b): b is { space: string; emoji: string; currency: string; balance: number; eurBalance: number } => b !== null && b.balance > 0);
  }, [spaces, liveRate]);

  const manualAssets = useMemo(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem('fhq_assets');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  }, []);

  const totalBankEur = bankBalances.reduce((s, b) => s + b.eurBalance, 0);
  const totalAssetsEur = (manualAssets as { eurValue: number }[]).reduce((s, a) => s + (a.eurValue || 0), 0);
  const netWorth = totalBankEur + totalAssetsEur;

  const goToSpace = (id: string) => {
    setActiveSpaceId(id);
    router.push('/tracker');
  };

  return (
    <div className="pb-20">
      {/* Top KPI hero card */}
      <div className="bg-gradient-to-br from-bg-3 to-bg-2 border border-border-2 rounded-2xl p-5 mb-4">
        <div className="text-[10px] uppercase tracking-wider text-t-3 font-semibold mb-1">Balance nette globale</div>
        <div className={`text-[28px] font-bold mono-value tracking-tight leading-none ${bankReality.delta >= 0 ? 'text-accent' : 'text-danger'}`}>
          {bankReality.delta >= 0 ? '+' : ''}{f$(bankReality.delta)} €
        </div>
        <div className="text-[10px] text-t-4 mt-1">
          {bankReality.from
            ? `Compte réel depuis ${bankReality.from}${bankReality.startLabel ? ` · ${bankReality.startLabel}` : ''} · entrées − sorties : ${bankReality.flows >= 0 ? '+' : ''}${f$(bankReality.flows)} €`
            : `Entrées − sorties : ${grandBalance >= 0 ? '+' : ''}${f$(grandBalance)} €`}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
          <div>
            <div className="text-t-4 mb-0.5">Revenus</div>
            <div className="text-accent font-bold mono-value text-[14px]">{f$(grandTotalRev)} €</div>
          </div>
          <div>
            <div className="text-t-4 mb-0.5">Dépenses</div>
            <div className="text-danger font-bold mono-value text-[14px]">{f$(grandTotalSpent)} €</div>
          </div>
        </div>
      </div>

      {/* Patrimoine card */}
      <div className="bg-bg-3 border border-border rounded-xl p-4 mb-5 active:bg-bg-4 cursor-pointer" onClick={() => router.push('/networth')}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-accent" />
            <span className="text-[12px] uppercase tracking-wider text-t-3 font-semibold">Patrimoine net</span>
          </div>
          <ChevronRight size={16} className="text-t-4" />
        </div>
        <div className="text-[22px] font-bold mono-value tracking-tight">{f$(netWorth)} €</div>
        <div className="text-[11px] text-t-3 mt-1">
          Banques {f$(totalBankEur)} € · Actifs {f$(totalAssetsEur)} €
        </div>
      </div>

      {/* Space list */}
      <div className="text-[11px] uppercase tracking-wider text-t-3 font-semibold mb-2.5 px-1">Mes spaces ({spaceStats.length})</div>
      <div className="space-y-2 mb-5">
        {spaceStats.map(sp => (
          <button
            key={sp.id}
            onClick={() => goToSpace(sp.id)}
            className="w-full bg-bg-3 border border-border rounded-xl p-3.5 text-left active:bg-bg-4 transition-colors"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-bg-4 flex items-center justify-center text-[18px] shrink-0">
                {sp.emoji}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold tracking-tight text-t-1 truncate">{sp.name}</div>
                <div className="text-[10px] text-t-3 font-mono mt-0.5">{sp.currency} · {sp.monthCount} mois</div>
              </div>
              <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${sp.status === 'active' ? 'text-accent bg-accent/10 border-accent/25' : sp.status === 'archived' ? 'text-t-3 bg-bg-4 border-border' : 'text-info bg-info/10 border-info/25'}`}>
                {sp.status === 'active' ? 'Actif' : sp.status === 'archived' ? 'Arch.' : 'Draft'}
              </span>
              <ChevronRight size={16} className="text-t-4 shrink-0" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-bg-2 rounded-lg px-2.5 py-2">
                <div className="text-[9px] text-t-4 uppercase tracking-wider font-semibold leading-none">Dép.</div>
                <div className="text-[12px] font-bold mono-value text-danger mt-1 truncate">{f$(sp.totalSpent)} €</div>
              </div>
              <div className="bg-bg-2 rounded-lg px-2.5 py-2">
                <div className="text-[9px] text-t-4 uppercase tracking-wider font-semibold leading-none">Rev.</div>
                <div className="text-[12px] font-bold mono-value text-accent mt-1 truncate">{f$(sp.totalRevenue)} €</div>
              </div>
              <div className="bg-bg-2 rounded-lg px-2.5 py-2">
                <div className="text-[9px] text-t-4 uppercase tracking-wider font-semibold leading-none">Bal.</div>
                <div className={`text-[12px] font-bold mono-value mt-1 truncate ${sp.balance >= 0 ? 'text-accent' : 'text-danger'}`}>
                  {sp.balance >= 0 ? '+' : ''}{f$(sp.balance)} €
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Bank balances */}
      {bankBalances.length > 0 && (
        <>
          <div className="text-[11px] uppercase tracking-wider text-t-3 font-semibold mb-2.5 px-1">Soldes bancaires</div>
          <div className="bg-bg-3 border border-border rounded-xl overflow-hidden">
            {bankBalances.map((b, i) => (
              <div key={i} className={`flex items-center justify-between gap-3 px-4 py-3 ${i < bankBalances.length - 1 ? 'border-b border-border' : ''}`}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-[16px]">{b.emoji}</span>
                  <span className="text-[13px] font-medium truncate">{b.space}</span>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[13px] font-bold mono-value text-accent">{f$(b.eurBalance)} €</div>
                  <div className="text-[10px] text-t-4 mono-value">{f0(b.balance)} {b.currency}</div>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 px-4 py-3 bg-bg-2 border-t border-border">
              <span className="text-[12px] font-bold uppercase tracking-wider">Total</span>
              <span className="text-[14px] font-bold mono-value text-accent">{f$(totalBankEur)} €</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
