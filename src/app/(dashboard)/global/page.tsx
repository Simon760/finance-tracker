'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppProvider';
import PageHeader from '@/components/layout/PageHeader';
import MobileGlobal from '@/components/mobile/MobileGlobal';
import { useIsMobile } from '@/lib/useIsMobile';
import { KpiCard } from '@/components/ui/Card';
import { f$, f0, sumEur, sumAed, shortMonth, lastMonthWithBalance, monthBankBalance, bankRealDelta } from '@/lib/utils';
import { LEGACY_EARN_MONTHS, PIE_COLORS, isLegacyEarnMonth, INSTALL_CAPITAL } from '@/lib/constants';
import { chartTheme, chartTooltipStyle } from '@/lib/chartTheme';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';


export default function GlobalPage() {
  const isMobile = useIsMobile();
  const { spaces, liveRate, setActiveSpaceId, theme } = useApp();
  const ct = chartTheme(theme);
  const tooltipStyle = chartTooltipStyle(theme);
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
      const totalRevenue = totalRevConfirmed + legacyEarn;

      // La balance affichée est la variation RÉELLE du compte depuis le capital
      // d'installation, pas revenus − dépenses : les deux diffèrent de tous les
      // mouvements bancaires jamais saisis. Repli sur la balance comptable pour un
      // space sans solde bancaire suivi.
      const base = INSTALL_CAPITAL[space.id];
      const real = bankRealDelta(space.months, space.postes, space.revenus?.months, liveRate,
        base ? { aed: base.aed, label: `le ${base.date}` } : undefined);
      const realBalance = real.from
        ? (space.localCurrency === 'EUR' ? real.delta : real.delta / liveRate)
        : totalRevenue - totalSpent;

      return {
        id: space.id,
        name: space.name,
        emoji: space.emoji,
        currency: space.localCurrency,
        status: space.status,
        monthCount: space.months.length,
        totalSpent,
        totalRevenue,
        balance: totalRevenue - totalSpent,
        realBalance,
      };
    });
  }, [spaces, liveRate]);

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

  // Net worth - bank balances from spaces (confirmed prévisionnel)
  const bankBalances = useMemo(() => {
    return spaces.map(s => {
      // Dernier mois RENSEIGNÉ (pas le dernier de la liste, souvent un mois futur vide)
      const lastMonth = lastMonthWithBalance(s.months);
      if (!lastMonth) return { space: s.name, emoji: s.emoji, currency: s.localCurrency, balance: 0, eurBalance: 0 };
      const balance = monthBankBalance(lastMonth, s.postes, s.revenus?.months, liveRate);
      const eurBalance = s.localCurrency === 'EUR' ? balance : balance / liveRate;
      return { space: s.name, emoji: s.emoji, currency: s.localCurrency, balance, eurBalance };
    }).filter(b => b.balance > 0);
  }, [spaces, liveRate]);

  // Manual assets from localStorage
  const manualAssets = useMemo(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem('fhq_assets');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  }, []);

  const totalBankEur = bankBalances.reduce((s, b) => s + b.eurBalance, 0);
  const totalAssetsEur = manualAssets.reduce((s: number, a: { eurValue: number }) => s + a.eurValue, 0);
  const netWorth = totalBankEur + totalAssetsEur;

  // Spending per space pie
  const spentPie = spaceStats.filter(s => s.totalSpent > 0).map(s => ({
    name: `${s.emoji} ${s.name}`, value: s.totalSpent,
  }));

  // Monthly evolution across all spaces
  const allMonthNames = new Set<string>();
  spaces.forEach(s => s.months.forEach(m => allMonthNames.add(m.id)));
  const monthList = Array.from(allMonthNames);

  const evoData = monthList.map(mId => {
    const row: Record<string, string | number> = { name: shortMonth(mId) };
    spaces.forEach(s => {
      const m = s.months.find(mo => mo.id === mId);
      row[s.name] = m ? sumEur(m, s.postes, m.extraActual) : 0;
    });
    return row;
  });

  const goToSpace = (id: string) => {
    setActiveSpaceId(id);
    router.push('/tracker');
  };

  // Mobile: dedicated UI shell
  if (isMobile === true) return <MobileGlobal />;

  return (
    <div>
      <PageHeader breadcrumb={[{ label: 'Vue Globale', current: true }]} title="Vue Globale" subtitle="Dashboard consolidé — tous les spaces" />

      {/* Grand Total KPIs */}
      <div className="grid grid-cols-4 gap-3 mb-6 max-lg:grid-cols-2 max-md:grid-cols-1">
        <KpiCard label="Total revenus" value={`${f$(grandTotalRev)} €`} accentColor="#10b981" hero />
        <KpiCard label="Total dépensé" value={`${f$(grandTotalSpent)} €`} accentColor="#ef4444" hero />
        <KpiCard
          label="Balance nette"
          value={`${bankReality.delta >= 0 ? '+' : ''}${f$(bankReality.delta)} €`}
          sub={bankReality.from
            ? `Compte réel depuis ${bankReality.from}${bankReality.startLabel ? ` · ${bankReality.startLabel}` : ''} · entrées − sorties : ${bankReality.flows >= 0 ? '+' : ''}${f$(bankReality.flows)} €`
            : `Entrées − sorties : ${grandBalance >= 0 ? '+' : ''}${f$(grandBalance)} €`}
          accentColor={bankReality.delta >= 0 ? '#10b981' : '#ef4444'}
          hero
        />
        <KpiCard label="Patrimoine net" value={`${f$(netWorth)} €`} sub={`Banques: ${f$(totalBankEur)} € · Actifs: ${f$(totalAssetsEur)} €`} accentColor="#8b5cf6" hero />
      </div>

      {/* Space cards */}
      <div className="text-[10px] text-t-3 uppercase tracking-wider font-semibold mb-2 px-1">Mes Spaces</div>
      <div className="grid grid-cols-2 gap-3 mb-5 max-md:grid-cols-1">
        {spaceStats.map(sp => (
          <div key={sp.id} onClick={() => goToSpace(sp.id)} className="bg-bg-3 border border-border rounded-lg p-5 hover:border-border-2 hover:bg-bg-3/80 transition-all cursor-pointer group shadow-inset-border animate-fade-up">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl leading-none">{sp.emoji}</span>
              <div>
                <div className="text-[14px] font-semibold tracking-tight group-hover:text-accent transition-colors">{sp.name}</div>
                <div className="text-[10px] text-t-3 font-mono mt-0.5">{sp.currency} · {sp.monthCount} mois</div>
              </div>
              <span className={`ml-auto pill ${sp.status === 'active' ? 'pill-active' : sp.status === 'archived' ? 'pill-archived' : 'pill-draft'}`}>
                {sp.status === 'active' ? 'Actif' : sp.status === 'archived' ? 'Archivé' : 'Brouillon'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-[9px] text-t-3 uppercase tracking-[0.12em] font-semibold">Revenus</div>
                <div className="hero-num text-[15px] mt-1 mono-value text-accent">{f$(sp.totalRevenue)} €</div>
              </div>
              <div>
                <div className="text-[9px] text-t-3 uppercase tracking-[0.12em] font-semibold">Dépenses</div>
                <div className="hero-num text-[15px] mt-1 mono-value text-danger">{f$(sp.totalSpent)} €</div>
              </div>
              <div>
                <div className="text-[9px] text-t-3 uppercase tracking-[0.12em] font-semibold">Balance</div>
                <div className={`hero-num text-[15px] mt-1 mono-value ${sp.realBalance >= 0 ? 'text-accent' : 'text-danger'}`}>
                  {sp.realBalance >= 0 ? '+' : ''}{f$(sp.realBalance)} €
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Net Worth summary */}
      {bankBalances.length > 0 && (
        <>
          <div className="text-[10px] text-t-3 uppercase tracking-wider font-semibold mb-2 px-1">Net Worth</div>
          <div className="bg-bg-3 border border-border rounded-md overflow-hidden mb-5">
            <div className="flex justify-between items-center px-4 py-3 border-b border-border">
              <span className="text-[13px] font-semibold">Soldes bancaires</span>
              <button onClick={() => router.push('/networth')} className="text-[11px] text-accent hover:underline cursor-pointer">Voir détail</button>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[460px]">
              <tbody>
                {bankBalances.map((b, i) => (
                  <tr key={i} className="border-b border-border last:border-0 hover:bg-white/[.02]">
                    <td className="px-4 py-2.5 text-[13px] font-medium">{b.emoji} {b.space}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs mono-value">{f0(b.balance)} {b.currency}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold text-accent mono-value">{f$(b.eurBalance)} €</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-bg-2">
                  <td className="px-4 py-2.5 font-bold text-[13px]">Total</td>
                  <td />
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-sm text-accent mono-value">{f$(totalBankEur)} €</td>
                </tr>
              </tfoot>
            </table>
            </div>
          </div>
        </>
      )}

      {/* Charts */}
      <div className="grid grid-cols-2 gap-3 mb-5 max-lg:grid-cols-1">
        {spentPie.length > 1 && (
          <div className="bg-bg-3 border border-border rounded-md p-4" style={{ height: 300 }}>
            <div className="text-[13px] font-semibold text-t-2 mb-4">Répartition dépenses par space</div>
            <ResponsiveContainer width="100%" height="85%">
              <PieChart>
                <Pie data={spentPie} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3}>
                  {spentPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${f$(Number(v))} €`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {evoData.length > 0 && (
          <div className="bg-bg-3 border border-border rounded-md p-4" style={{ height: 300 }}>
            <div className="text-[13px] font-semibold text-t-2 mb-4">Dépenses par mois</div>
            <ResponsiveContainer width="100%" height="85%">
              <BarChart data={evoData}>
                <CartesianGrid stroke={ct.grid} />
                <XAxis dataKey="name" tick={{ fill: ct.tick, fontSize: 11 }} />
                <YAxis tick={{ fill: ct.tick, fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {spaces.map((s, i) => (
                  <Bar key={s.id} dataKey={s.name} stackId="a" fill={PIE_COLORS[i % PIE_COLORS.length]} radius={i === spaces.length - 1 ? [4, 4, 0, 0] : undefined} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
