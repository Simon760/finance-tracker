'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppProvider';
import PageHeader from '@/components/layout/PageHeader';
import { KpiCard } from '@/components/ui/Card';
import { f$, f0, sumEur } from '@/lib/utils';
import { LEGACY_EARN_MONTHS, PIE_COLORS } from '@/lib/constants';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';

const tooltipStyle = { background: '#1c1c23', border: '1px solid #2a2a3a', borderRadius: 8 };

export default function GlobalPage() {
  const { spaces, liveRate, setActiveSpaceId } = useApp();
  const router = useRouter();

  const spaceStats = useMemo(() => {
    return spaces.map(space => {
      const totalSpent = space.months.reduce((s, m) => s + sumEur(m, m.actual, m.extraActual), 0);
      const totalRevConfirmed = Object.values(space.revenus?.months || {}).reduce((total, entries) => {
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

  // Net worth - bank balances from spaces
  const bankBalances = useMemo(() => {
    return spaces.map(s => {
      const lastMonth = s.months[s.months.length - 1];
      const balance = lastMonth?.soldeEnd || lastMonth?.soldeStart || 0;
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
    const row: Record<string, string | number> = { name: mId.slice(0, 3) };
    spaces.forEach(s => {
      const m = s.months.find(mo => mo.id === mId);
      row[s.name] = m ? sumEur(m, m.actual, m.extraActual) : 0;
    });
    return row;
  });

  const goToSpace = (id: string) => {
    setActiveSpaceId(id);
    router.push('/tracker');
  };

  return (
    <div>
      <PageHeader breadcrumb={[{ label: 'Vue Globale', current: true }]} title="Vue Globale" subtitle="Dashboard consolidé — tous les spaces" />

      {/* Grand Total KPIs */}
      <div className="grid grid-cols-4 gap-3 mb-5 max-lg:grid-cols-2 max-md:grid-cols-1">
        <KpiCard label="Total dépensé" value={`${f$(grandTotalSpent)} €`} accentColor="#ef4444" />
        <KpiCard label="Total revenus" value={`${f$(grandTotalRev)} €`} accentColor="#10b981" />
        <KpiCard label="Balance nette" value={`${grandBalance >= 0 ? '+' : ''}${f$(grandBalance)} €`} accentColor={grandBalance >= 0 ? '#10b981' : '#ef4444'} />
        <KpiCard label="Patrimoine net" value={`${f$(netWorth)} €`} sub={`Banques: ${f$(totalBankEur)} € · Actifs: ${f$(totalAssetsEur)} €`} accentColor="#8b5cf6" />
      </div>

      {/* Space cards */}
      <div className="text-[10px] text-t-3 uppercase tracking-wider font-semibold mb-2 px-1">Mes Spaces</div>
      <div className="grid grid-cols-2 gap-3 mb-5 max-md:grid-cols-1">
        {spaceStats.map(sp => (
          <div key={sp.id} onClick={() => goToSpace(sp.id)} className="bg-bg-3 border border-border rounded-md p-4 hover:border-accent/40 transition-all cursor-pointer group">
            <div className="flex items-center gap-2.5 mb-3">
              <span className="text-2xl">{sp.emoji}</span>
              <div>
                <div className="text-sm font-semibold group-hover:text-accent transition-colors">{sp.name}</div>
                <div className="text-[10px] text-t-3 font-mono">{sp.currency} · {sp.monthCount} mois</div>
              </div>
              <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full border ${sp.status === 'active' ? 'text-accent bg-accent/10 border-accent/25' : sp.status === 'archived' ? 'text-t-3 bg-bg-4 border-border' : 'text-info bg-info/10 border-info/25'}`}>
                {sp.status === 'active' ? 'Actif' : sp.status === 'archived' ? 'Archivé' : 'Brouillon'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-[9px] text-t-3 uppercase tracking-wider">Dépenses</div>
                <div className="font-mono text-sm font-semibold mt-0.5 mono-value text-danger">{f$(sp.totalSpent)} €</div>
              </div>
              <div>
                <div className="text-[9px] text-t-3 uppercase tracking-wider">Revenus</div>
                <div className="font-mono text-sm font-semibold mt-0.5 mono-value text-accent">{f$(sp.totalRevenue)} €</div>
              </div>
              <div>
                <div className="text-[9px] text-t-3 uppercase tracking-wider">Balance</div>
                <div className={`font-mono text-sm font-semibold mt-0.5 mono-value ${sp.balance >= 0 ? 'text-accent' : 'text-danger'}`}>
                  {sp.balance >= 0 ? '+' : ''}{f$(sp.balance)} €
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
            <table className="w-full border-collapse">
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
                <CartesianGrid stroke="#1e1e2a" />
                <XAxis dataKey="name" tick={{ fill: '#52525b', fontSize: 11 }} />
                <YAxis tick={{ fill: '#52525b', fontSize: 11 }} />
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
