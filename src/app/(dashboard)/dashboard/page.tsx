'use client';

import { useApp } from '@/context/AppProvider';
import PageHeader from '@/components/layout/PageHeader';
import { KpiCard } from '@/components/ui/Card';
import { f$, f0, toAed, rowEur, sumEur } from '@/lib/utils';
import { LEGACY_EARN_MONTHS, PIE_COLORS } from '@/lib/constants';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';

export default function DashboardPage() {
  const { state, dashCur, setDashCur, activeSpace } = useApp();
  const ms = state.months;

  if (ms.length === 0) {
    return (
      <div>
        <PageHeader breadcrumb={[{ label: activeSpace.name }, { label: 'Dashboard', current: true }]} title="Dashboard" subtitle="Vue d'ensemble" />
        <div className="bg-bg-3 border border-border rounded-md p-6 text-center text-t-3 text-sm">Aucune donnée</div>
      </div>
    );
  }

  const monthEarnEur = (m: typeof ms[0]) => {
    if (!LEGACY_EARN_MONTHS.includes(m.id)) {
      const entries = state.revenus?.months?.[m.id] || [];
      return entries.filter(e => !e.status || e.status === 'confirmed').reduce((s, e) => s + (e.cashed || 0), 0);
    }
    return m.earn || 0;
  };

  const monthEarnAed = (m: typeof ms[0]) => {
    if (!LEGACY_EARN_MONTHS.includes(m.id)) {
      const entries = state.revenus?.months?.[m.id] || [];
      return entries.filter(e => !e.status || e.status === 'confirmed').reduce((s, e) => s + ((e.cashed || 0) * (e.rate || state.rate)), 0);
    }
    return toAed(m.earn || 0, m.rate);
  };

  const totalSpent = ms.reduce((s, m) => s + sumEur(m, m.actual, m.extraActual), 0);
  const avg = totalSpent / ms.length;
  const dcFmt = (v: number, rate: number) => dashCur === 'EUR' ? `${f$(v)} €` : `${f0(toAed(v, rate))} AED`;
  const avgRate = ms.reduce((s, m) => s + m.rate, 0) / ms.length;

  // Evolution data
  const evoData = ms.map(m => ({
    name: m.id.slice(0, 3),
    Dépenses: dashCur === 'EUR' ? sumEur(m, m.actual, m.extraActual) : toAed(sumEur(m, m.actual, m.extraActual), m.rate),
    Revenus: dashCur === 'EUR' ? monthEarnEur(m) : monthEarnAed(m),
  }));

  // Solde data — if soldeEnd is 0, carry forward previous month's soldeEnd
  const soldeMonths = ms.filter(m => m.soldeStart > 0 || m.soldeEnd > 0);
  const soldeData = soldeMonths.map((m, i) => {
    const prevEnd = i > 0 ? soldeMonths[i - 1].soldeEnd || 0 : 0;
    const debut = m.soldeStart > 0 ? m.soldeStart : prevEnd;
    const fin = m.soldeEnd > 0 ? m.soldeEnd : prevEnd;
    return { name: m.id.slice(0, 3), Début: debut, Fin: fin };
  });

  // Avg expense pie
  const avgExp: Record<string, number> = {};
  ms.forEach(m => {
    state.postes.forEach((p, i) => {
      const v = rowEur(m.actual[i] || { aed: 0, eur: null }, m.rate);
      avgExp[p.name] = (avgExp[p.name] || 0) + (dashCur === 'EUR' ? v : toAed(v, m.rate));
    });
  });
  const pieData = Object.entries(avgExp).filter(([, v]) => v > 10).map(([name, value]) => ({ name, value: value / ms.length }));

  // Total par poste
  const posteTotals: Record<string, number> = {};
  ms.forEach(m => {
    state.postes.forEach((p, i) => {
      const v = rowEur(m.actual[i] || { aed: 0, eur: null }, m.rate);
      posteTotals[p.name] = (posteTotals[p.name] || 0) + (dashCur === 'EUR' ? v : toAed(v, m.rate));
    });
    (m.extraActual || []).forEach(r => {
      const v = r.eur > 0 ? r.eur : rowEur({ aed: r.aed, eur: 0 }, m.rate);
      posteTotals[r.name] = (posteTotals[r.name] || 0) + (dashCur === 'EUR' ? v : toAed(v, m.rate));
    });
  });
  const totalPieData = Object.entries(posteTotals).filter(([, v]) => v > 1).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));

  const tooltipStyle = { background: '#1c1c23', border: '1px solid #2a2a3a', borderRadius: 8 };

  return (
    <div>
      <PageHeader breadcrumb={[{ label: activeSpace.name }, { label: 'Dashboard', current: true }]} title="Dashboard" subtitle="Vue d'ensemble">
        <div className="flex bg-bg-2 rounded-lg p-0.5 border border-border gap-0.5">
          {(['EUR', 'AED'] as const).map(c => (
            <button key={c} onClick={() => setDashCur(c)} className={`px-3.5 py-1 font-mono text-[11px] font-semibold rounded-md transition-all cursor-pointer ${dashCur === c ? 'bg-bg-4 text-t-1 shadow-sm' : 'text-t-3'}`}>
              {c} {c === 'EUR' ? '€' : 'د.إ'}
            </button>
          ))}
        </div>
      </PageHeader>

      <div className="max-w-[400px] mb-5">
        <KpiCard label="Total dépensé" value={dcFmt(totalSpent, avgRate)} sub={`Moy: ${dcFmt(avg, avgRate)}/mois`} accentColor="#3b82f6" />
      </div>

      {/* Evo Chart */}
      <div className="bg-bg-3 border border-border rounded-md p-4 mb-3.5" style={{ height: 320 }}>
        <div className="text-[13px] font-semibold text-t-2 mb-4">Dépenses & Revenus</div>
        <ResponsiveContainer width="100%" height="85%">
          <LineChart data={evoData}>
            <CartesianGrid stroke="#1e1e2a" />
            <XAxis dataKey="name" tick={{ fill: '#52525b', fontSize: 11 }} />
            <YAxis tick={{ fill: '#52525b', fontSize: 11 }} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="Dépenses" stroke="#ef4444" strokeWidth={2} dot={{ fill: '#ef4444', r: 4 }} />
            <Line type="monotone" dataKey="Revenus" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981', r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Solde Chart */}
      {soldeData.length > 0 && (
        <div className="bg-bg-3 border border-border rounded-md p-4 mb-3.5" style={{ height: 320 }}>
          <div className="text-[13px] font-semibold text-t-2 mb-4">Solde Bancaire AED (MoM)</div>
          <ResponsiveContainer width="100%" height="85%">
            <LineChart data={soldeData}>
              <CartesianGrid stroke="#1e1e2a" />
              <XAxis dataKey="name" tick={{ fill: '#52525b', fontSize: 11 }} />
              <YAxis tick={{ fill: '#52525b', fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${f0(Number(v))} AED`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="Début" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 4 }} />
              <Line type="monotone" dataKey="Fin" stroke="#06b6d4" strokeWidth={2} dot={{ fill: '#06b6d4', r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Pie charts */}
      <div className="grid grid-cols-2 gap-3 mb-3.5 max-lg:grid-cols-1">
        <div className="bg-bg-3 border border-border rounded-md p-4">
          <div className="text-[13px] font-semibold text-t-2 mb-4">Répartition moyenne</div>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={2}>
                {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => f$(Number(v))} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-bg-3 border border-border rounded-md p-4">
          <div className="text-[13px] font-semibold text-t-2 mb-4">Total par poste</div>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={totalPieData} dataKey="value" cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={2}>
                {totalPieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => f$(Number(v))} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
