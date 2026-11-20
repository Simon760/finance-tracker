'use client';

import { useMemo } from 'react';
import { useApp } from '@/context/AppProvider';
import { monthFigures, lastCompleted, savingsRate, runwayMonths, yearOverYear, pctChange, MonthFigures } from '@/lib/insights';
import { f$, f0, lastMonthWithBalance, monthBankBalance } from '@/lib/utils';

const pct = (v: number | null, digits = 0) => (v === null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(digits)} %`);

/**
 * Santé financière : taux d'épargne, mois d'autonomie, et année N contre N−1 (cf.
 * lib/insights). Les mois pas commencés et le mois en cours (partiel) sont hors calcul.
 * Composant unique, responsive (le Dashboard a la même UI sur desktop et mobile).
 */
export default function HealthCard({ dashCur }: { dashCur: 'EUR' | 'AED' }) {
  const { state, liveRate, activeSpace } = useApp();
  const cur = activeSpace?.localCurrency || 'AED';
  const rate = state.rate || liveRate;

  const figs = useMemo(
    () => monthFigures(state.months, state.postes, state.revenus?.months, rate),
    [state.months, state.postes, state.revenus, rate],
  );
  if (figs.length === 0) return null;

  const done12 = lastCompleted(figs, 12);
  const done3 = lastCompleted(figs, 3);
  const sr12 = savingsRate(done12);
  const sr3 = savingsRate(done3);

  const lm = lastMonthWithBalance(state.months);
  const balance = lm ? monthBankBalance(lm, state.postes, state.revenus?.months, rate) : 0;
  const rw = runwayMonths(balance, figs);

  const rows = yearOverYear(figs);
  const full = rows.filter(r => !r.partial);
  const sum = (list: MonthFigures[], k: 'revenueEur' | 'spentEur' | 'revenueLocal' | 'spentLocal') => list.reduce((s, f) => s + f[k], 0);
  const revKey = dashCur === 'EUR' ? 'revenueEur' : 'revenueLocal';
  const spKey = dashCur === 'EUR' ? 'spentEur' : 'spentLocal';
  const revDelta = pctChange(sum(full.map(r => r.prev), 'revenueEur'), sum(full.map(r => r.cur), 'revenueEur'));
  const spDelta = pctChange(sum(full.map(r => r.prev), 'spentEur'), sum(full.map(r => r.cur), 'spentEur'));
  const money = (v: number) => (dashCur === 'EUR' ? `${f$(v)} €` : `${f0(v)} ${cur}`);

  const Tile = ({ label, value, sub, cls = 'text-t-1' }: { label: string; value: string; sub: string; cls?: string }) => (
    <div className="bg-bg-2 border border-border rounded-md px-3.5 py-3 min-w-0">
      <div className="text-[9px] text-t-3 uppercase tracking-[0.12em] font-semibold">{label}</div>
      <div className={`text-[22px] mono-value mt-1.5 leading-none ${cls}`}>{value}</div>
      <div className="text-[10px] text-t-4 mt-2 leading-relaxed">{sub}</div>
    </div>
  );
  // Revenus : la hausse est bonne ; dépenses : c'est la baisse
  const tone = (v: number | null, upIsGood: boolean) => (v === null || Math.abs(v) < 0.005 ? 'text-t-3' : (v > 0) === upIsGood ? 'text-accent' : 'text-danger');

  return (
    <div className="bg-bg-3 border border-border rounded-md p-4 mb-3.5">
      <div className="text-[13px] font-semibold text-t-2">Santé financière</div>
      <div className="text-[10px] text-t-4 mt-0.5 mb-4">Sur les mois terminés — le mois en cours, encore partiel, n&apos;entre pas dans les calculs</div>

      <div className="grid grid-cols-3 gap-2.5 mb-4 max-md:grid-cols-1">
        <Tile
          label={`Taux d'épargne · ${done12.length} dernier${done12.length > 1 ? 's' : ''} mois`}
          value={sr12 === null ? '—' : `${(sr12 * 100).toFixed(0)} %`}
          cls={sr12 === null ? 'text-t-3' : sr12 >= 0 ? 'text-accent' : 'text-danger'}
          sub={`Part des revenus non dépensée. Sur les 3 derniers mois : ${sr3 === null ? '—' : `${(sr3 * 100).toFixed(0)} %`}`}
        />
        <Tile
          label="Mois d'autonomie"
          value={rw.months === null ? '—' : `${rw.months.toFixed(1).replace('.', ',')} mois`}
          cls={rw.months === null ? 'text-t-3' : rw.months >= 6 ? 'text-accent' : rw.months >= 3 ? 'text-warning' : 'text-danger'}
          sub={rw.months === null
            ? 'Il faut un solde et au moins un mois terminé avec des dépenses'
            : `Solde ${f0(balance)} ${cur} ÷ ${f0(rw.avgSpentLocal)} ${cur} / mois (moyenne des ${rw.basis} derniers mois), sans aucun revenu`}
        />
        <Tile
          label="Vs année précédente"
          value={full.length === 0 ? '—' : `Revenus ${pct(revDelta)}`}
          cls={full.length === 0 ? 'text-t-3' : tone(revDelta, true)}
          sub={full.length === 0
            ? 'Pas encore de mois terminé comparable au même mois un an plus tôt'
            : `Dépenses ${pct(spDelta)} · sur ${full.length} mois comparable${full.length > 1 ? 's' : ''} (${full.map(r => r.name.slice(0, 3)).join(', ')})`}
        />
      </div>

      {/* Mobile : une carte par mois (pas de tableau dense) */}
      {rows.length > 0 && (
        <div className="md:hidden space-y-2">
          {rows.map(r => {
            const dRev = pctChange(r.prev.revenueEur, r.cur.revenueEur);
            const dSp = pctChange(r.prev.spentEur, r.cur.spentEur);
            const line = (label: string, a: number, b: number, d: number | null, upIsGood: boolean) => (
              <div className="flex items-baseline justify-between gap-2 text-[12px]">
                <span className="text-t-3 shrink-0">{label}</span>
                <span className="text-right min-w-0">
                  <span className="mono-value text-t-4">{money(a)}</span>
                  <span className="text-t-4"> → </span>
                  <span className="mono-value text-t-1">{money(b)}</span>
                  {!r.partial && <span className={`mono-value ml-2 ${tone(d, upIsGood)}`}>{pct(d)}</span>}
                </span>
              </div>
            );
            return (
              <div key={`m-${r.cur.year}-${r.cur.idx}`} className={`bg-bg-2 border border-border rounded-md px-3 py-2.5 space-y-1.5 ${r.partial ? 'opacity-70' : ''}`}>
                <div className="text-[12px] font-semibold text-t-2">
                  {r.name} <span className="text-t-4 font-normal">{r.prev.year} → {r.cur.year}</span>
                  {r.partial && <span className="ml-2 text-[9px] font-semibold tracking-[0.05em] px-1.5 py-[2px] rounded text-info bg-info/10">EN COURS</span>}
                </div>
                {line('Revenus', r.prev[revKey], r.cur[revKey], dRev, true)}
                {line('Dépenses', r.prev[spKey], r.cur[spKey], dSp, false)}
              </div>
            );
          })}
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto max-md:hidden">
          <table className="w-full text-[12px] min-w-[560px]">
            <thead>
              <tr className="text-[9px] text-t-3 uppercase tracking-[0.1em]">
                <th className="text-left font-semibold py-2 pr-3">Mois</th>
                <th className="text-right font-semibold py-2 px-2">Revenus N−1</th>
                <th className="text-right font-semibold py-2 px-2">Revenus N</th>
                <th className="text-right font-semibold py-2 px-2">Δ</th>
                <th className="text-right font-semibold py-2 px-2">Dépenses N−1</th>
                <th className="text-right font-semibold py-2 px-2">Dépenses N</th>
                <th className="text-right font-semibold py-2 pl-2">Δ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const dRev = pctChange(r.prev.revenueEur, r.cur.revenueEur);
                const dSp = pctChange(r.prev.spentEur, r.cur.spentEur);
                return (
                  <tr key={`${r.cur.year}-${r.cur.idx}`} className={`border-t border-border ${r.partial ? 'opacity-60' : ''}`}>
                    <td className="py-2 pr-3 font-semibold text-t-2 whitespace-nowrap">
                      {r.name} <span className="text-t-4 font-normal">{r.prev.year} → {r.cur.year}</span>
                      {r.partial && <span className="ml-2 text-[9px] font-semibold tracking-[0.05em] px-1.5 py-[2px] rounded text-info bg-info/10">EN COURS</span>}
                    </td>
                    <td className="py-2 px-2 text-right mono-value text-t-3">{money(r.prev[revKey])}</td>
                    <td className="py-2 px-2 text-right mono-value text-t-1">{money(r.cur[revKey])}</td>
                    <td className={`py-2 px-2 text-right mono-value ${r.partial ? 'text-t-4' : tone(dRev, true)}`}>{r.partial ? '—' : pct(dRev)}</td>
                    <td className="py-2 px-2 text-right mono-value text-t-3">{money(r.prev[spKey])}</td>
                    <td className="py-2 px-2 text-right mono-value text-t-1">{money(r.cur[spKey])}</td>
                    <td className={`py-2 pl-2 text-right mono-value ${r.partial ? 'text-t-4' : tone(dSp, false)}`}>{r.partial ? '—' : pct(dSp)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
