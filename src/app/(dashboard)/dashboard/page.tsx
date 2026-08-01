'use client';

import { useApp } from '@/context/AppProvider';
import PageHeader from '@/components/layout/PageHeader';
import { KpiCard } from '@/components/ui/Card';
import { f$, f0, toAed, rowEur, sumEur, shortMonth } from '@/lib/utils';
import { LEGACY_EARN_MONTHS } from '@/lib/constants';
// import BankStatsCard from '@/components/BankStatsCard'; // retiré temporairement
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

/**
 * Répartition par poste — barres horizontales triées plutôt qu'un camembert :
 * au-delà de ~7 catégories les parts d'un donut deviennent illisibles (et les
 * couleurs cyclent). Une seule teinte, l'intensité porte la magnitude, le nom
 * et la valeur sont lus directement sur la ligne.
 * En HTML/CSS (pas Recharts) : responsive par construction, aucun risque de
 * troncature des libellés sur petit écran.
 */
function PosteBars({ data, fmt }: { data: { name: string; value: number }[]; fmt: (v: number) => string }) {
  if (data.length === 0) {
    return <div className="text-[12px] text-t-4 text-center py-10">Aucune donnée</div>;
  }
  const max = Math.max(...data.map(d => d.value)) || 1;
  return (
    <div className="space-y-1.5">
      {data.map(d => {
        const ratio = d.value / max;
        return (
          <div
            key={d.name}
            className="grid grid-cols-[minmax(0,6.5rem)_1fr_auto] items-center gap-2.5"
            title={`${d.name} — ${fmt(d.value)}`}
          >
            <span className="text-[11px] text-t-3 truncate">{d.name}</span>
            <div className="h-2.5 flex items-center">
              <div
                className="h-full bg-info rounded-r-[4px]"
                style={{ width: `${Math.max(ratio * 100, 1)}%`, opacity: 0.4 + 0.6 * ratio }}
              />
            </div>
            <span className="text-[11px] text-t-2 mono-value whitespace-nowrap">{fmt(d.value)}</span>
          </div>
        );
      })}
    </div>
  );
}

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

  const totalSpent = ms.reduce((s, m) => s + sumEur(m, state.postes, m.extraActual), 0);
  // Moyenne sur les mois qui ont du réel (ignore les mois de prévision vides)
  const activeMonthsCount = ms.filter(m => sumEur(m, state.postes, m.extraActual) > 0).length || ms.length;
  const avg = totalSpent / activeMonthsCount;
  const dcFmt = (v: number, rate: number) => dashCur === 'EUR' ? `${f$(v)} €` : `${f0(toAed(v, rate))} AED`;
  // Valeurs des barres : déjà converties dans la devise active → on formate seulement
  const barFmt = (v: number) => dashCur === 'EUR' ? `${f$(v)} €` : `${f0(v)} AED`;
  const avgRate = ms.reduce((s, m) => s + m.rate, 0) / ms.length;

  // Evolution data — n'inclut QUE les mois qui ont du réel (dépenses ou revenus).
  // Les mois créés pour prévision (budget seul, sans actuals) ne polluent plus le graphe.
  const evoData = ms
    .map(m => ({
      name: shortMonth(m.id),
      Dépenses: dashCur === 'EUR' ? sumEur(m, state.postes, m.extraActual) : toAed(sumEur(m, state.postes, m.extraActual), m.rate),
      Revenus: dashCur === 'EUR' ? monthEarnEur(m) : monthEarnAed(m),
    }))
    .filter(d => d.Dépenses > 0 || d.Revenus > 0);

  // Solde data — if soldeEnd is 0, carry forward previous month's soldeEnd
  const soldeMonths = ms.filter(m => m.soldeStart > 0 || m.soldeEnd > 0);
  const soldeData = soldeMonths.map((m, i) => {
    const prevEnd = i > 0 ? soldeMonths[i - 1].soldeEnd || 0 : 0;
    const debut = m.soldeStart > 0 ? m.soldeStart : prevEnd;
    const fin = m.soldeEnd > 0 ? m.soldeEnd : prevEnd;
    return { name: shortMonth(m.id), Début: debut, Fin: fin };
  });
  const soldeAllVals = soldeData.flatMap(d => [d.Début, d.Fin]).filter(v => v > 0);
  const soldeMin = soldeAllVals.length > 0 ? Math.floor(Math.min(...soldeAllVals) * 0.95 / 5000) * 5000 : 0;
  const soldeMax = soldeAllVals.length > 0 ? Math.ceil(Math.max(...soldeAllVals) * 1.05 / 5000) * 5000 : 100000;

  // Avg expense pie
  const avgExp: Record<string, number> = {};
  ms.forEach(m => {
    state.postes.forEach((p, i) => {
      const v = rowEur(m.actual[i] || { aed: 0, eur: null }, m.rate);
      avgExp[p.name] = (avgExp[p.name] || 0) + (dashCur === 'EUR' ? v : toAed(v, m.rate));
    });
  });
  const pieData = Object.entries(avgExp).filter(([, v]) => v > 10).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value: value / ms.length }));

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

      <div className="max-w-[400px] mb-6">
        <KpiCard label="Total dépensé" value={dcFmt(totalSpent, avgRate)} sub={`Moy: ${dcFmt(avg, avgRate)}/mois`} accentColor="#3b82f6" hero />
      </div>

      {/* Bank stats: ATH / ATL / Solde moyen — à retravailler */}
      {/* <BankStatsCard state={state} currency={activeSpace?.localCurrency || 'AED'} /> */}

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
              <YAxis domain={[soldeMin, soldeMax]} allowDataOverflow tick={{ fill: '#52525b', fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${f0(Number(v))} AED`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="Début" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 4 }} />
              <Line type="monotone" dataKey="Fin" stroke="#06b6d4" strokeWidth={2} dot={{ fill: '#06b6d4', r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Répartition par poste — barres horizontales triées (lisible au-delà de 7 postes) */}
      <div className="grid grid-cols-2 gap-3 mb-3.5 max-lg:grid-cols-1">
        <div className="bg-bg-3 border border-border rounded-md p-4">
          <div className="flex items-baseline justify-between gap-3 mb-4">
            <span className="text-[13px] font-semibold text-t-2">Répartition moyenne</span>
            <span className="text-[10px] text-t-4">par mois · {pieData.length} postes</span>
          </div>
          <PosteBars data={pieData} fmt={barFmt} />
        </div>
        <div className="bg-bg-3 border border-border rounded-md p-4">
          <div className="flex items-baseline justify-between gap-3 mb-4">
            <span className="text-[13px] font-semibold text-t-2">Total par poste</span>
            <span className="text-[10px] text-t-4">{ms.length} mois · {totalPieData.length} postes</span>
          </div>
          <PosteBars data={totalPieData} fmt={barFmt} />
        </div>
      </div>
    </div>
  );
}
