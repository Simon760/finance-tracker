'use client';

import { useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot } from 'recharts';
import { useApp } from '@/context/AppProvider';
import { dailyBalance, balanceExtremes, balanceAt } from '@/lib/balanceHistory';
import { chartTheme, chartTooltipStyle } from '@/lib/chartTheme';
import { f$, f0 } from '@/lib/utils';

type Range = '3m' | '6m' | 'all';
const RANGES: { id: Range; label: string; days: number }[] = [
  { id: '3m', label: '3 mois', days: 92 },
  { id: '6m', label: '6 mois', days: 183 },
  { id: 'all', label: 'Tout', days: Infinity },
];

/** 2026-05-15 → 15/05/2026 */
const frDate = (d: string) => (d && d.length >= 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—');

/**
 * Solde du compte jour par jour (cf. lib/balanceHistory) : courbe, plus haut / plus bas
 * avec leur date, et solde à une date choisie. Composant unique, responsive — le
 * Dashboard s'affiche avec la même UI sur desktop et mobile.
 */
export default function BalanceCard() {
  const { state, liveRate, theme, activeSpace } = useApp();
  const ct = chartTheme(theme);
  const cur = activeSpace?.localCurrency || 'AED';
  const [range, setRange] = useState<Range>('all');
  const [pick, setPick] = useState('');

  const hist = useMemo(
    () => dailyBalance(state.months, state.postes, state.revenus?.months, state.rate || liveRate),
    [state.months, state.postes, state.revenus, state.rate, liveRate],
  );
  const all = hist.points;
  if (all.length === 0) return null;

  const days = RANGES.find(r => r.id === range)!.days;
  const pts = days === Infinity ? all : all.slice(-days);
  const { high, low, avg } = balanceExtremes(pts);
  const last = all[all.length - 1];
  const vals = pts.map(p => p.balance);
  const step = 5000;
  const yMin = Math.floor((Math.min(...vals) * 0.98) / step) * step;
  const yMax = Math.ceil((Math.max(...vals) * 1.02) / step) * step;
  // Graduations régulières (multiples de 5 000), sinon Recharts ajoute la borne haute
  // juste au-dessus de sa dernière graduation « ronde » et les deux se chevauchent.
  const tickStep = Math.max(step, Math.ceil((yMax - yMin) / 5 / step) * step);
  const yTicks: number[] = [];
  for (let v = yMin; v <= yMax; v += tickStep) yTicks.push(v);
  const picked = pick ? balanceAt(all, pick) : null;

  const Tile = ({ label, value, sub, cls = 'text-t-1' }: { label: string; value: string; sub?: string; cls?: string }) => (
    <div className="bg-bg-2 border border-border rounded-md px-3 py-2.5 min-w-0">
      <div className="text-[9px] text-t-3 uppercase tracking-[0.12em] font-semibold truncate">{label}</div>
      <div className={`text-[16px] mono-value mt-1 leading-none truncate ${cls}`}>{value}</div>
      {sub && <div className="text-[10px] text-t-4 mt-1 truncate">{sub}</div>}
    </div>
  );

  return (
    <div className="bg-bg-3 border border-border rounded-md p-4 mb-3.5">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <div className="text-[13px] font-semibold text-t-2">Solde du compte — jour par jour</div>
          <div className="text-[10px] text-t-4 mt-0.5">Reconstruit depuis tes saisies, du {frDate(all[0].date)} au {frDate(last.date)} · fin de journée</div>
        </div>
        <div className="flex bg-bg-2 rounded-lg p-0.5 border border-border gap-0.5">
          {RANGES.map(r => (
            <button key={r.id} onClick={() => setRange(r.id)} className={`px-3 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer ${range === r.id ? 'bg-bg-4 text-t-1 shadow-sm' : 'text-t-3'}`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2.5 mb-4 max-md:grid-cols-2">
        <Tile label="Solde actuel" value={`${f0(last.balance)} ${cur}`} sub={liveRate > 0 ? `≈ ${f$(last.balance / liveRate)} €` : undefined} />
        <Tile label="Plus haut" value={high ? `${f0(high.balance)} ${cur}` : '—'} sub={high ? `le ${frDate(high.date)}` : undefined} cls="text-accent" />
        <Tile label="Plus bas" value={low ? `${f0(low.balance)} ${cur}` : '—'} sub={low ? `le ${frDate(low.date)}` : undefined} cls="text-warning" />
        <Tile label="Solde moyen" value={`${f0(avg)} ${cur}`} sub={`sur ${pts.length} jours`} />
      </div>

      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={pts} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="balFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={ct.grid} vertical={false} />
            <XAxis dataKey="date" tick={{ fill: ct.tick, fontSize: 10 }} tickFormatter={d => `${String(d).slice(8, 10)}/${String(d).slice(5, 7)}`} minTickGap={48} />
            <YAxis domain={[yMin, yMax]} ticks={yTicks} tick={{ fill: ct.tick, fontSize: 10 }} tickFormatter={v => `${Math.round(Number(v) / 1000)}k`} width={38} />
            <Tooltip contentStyle={chartTooltipStyle(theme)} labelFormatter={d => frDate(String(d))} formatter={v => [`${f0(Number(v))} ${cur}`, 'Solde']} />
            <Area type="monotone" dataKey="balance" stroke="#3b82f6" strokeWidth={2} fill="url(#balFill)" dot={false} isAnimationActive={false} />
            {high && <ReferenceDot x={high.date} y={high.balance} r={4} fill="#10b981" stroke={ct.tooltipBg} strokeWidth={2} />}
            {low && <ReferenceDot x={low.date} y={low.balance} r={4} fill="#f59e0b" stroke={ct.tooltipBg} strokeWidth={2} />}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border flex-wrap">
        <label htmlFor="bal-date" className="text-[11px] text-t-3 font-semibold">Solde à une date</label>
        <input
          id="bal-date" type="date" className="fi !w-auto !py-1.5 text-[12px]"
          min={all[0].date} max={last.date} value={pick} onChange={e => setPick(e.target.value)}
        />
        {pick && (
          <span className="text-[12px] text-t-2">
            {picked === null
              ? <span className="text-t-3">Pas de donnée à cette date (suivi du {frDate(all[0].date)} au {frDate(last.date)})</span>
              : <>le {frDate(pick)} au soir : <span className="mono-value text-t-1">{f0(picked)} {cur}</span>{liveRate > 0 && <span className="text-t-4"> · ≈ <span className="mono-value">{f$(picked / liveRate)} €</span> au taux du jour</span>}</>}
          </span>
        )}
      </div>
    </div>
  );
}
