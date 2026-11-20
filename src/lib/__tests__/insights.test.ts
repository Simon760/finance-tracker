import { describe, it, expect } from 'vitest';
import { monthFigures, lastCompleted, savingsRate, runwayMonths, yearOverYear, pctChange, MonthFigures } from '../insights';
import { POSTES, mkMonth, entry } from './helpers';

const NOW = new Date(2026, 10, 20); // novembre 2026
const spent = (aed: number) => ({ actual: [{ aed, eur: aed / 4 }, { aed: 0, eur: null }, { aed: 0, eur: null }] });

const months = () => [
  mkMonth('OCTOBRE', { earn: 2000, ...spent(4000) }),      // 2025, legacy → m.earn
  mkMonth('NOVEMBRE', { earn: 3000, ...spent(8000) }),     // 2025
  mkMonth('SEPTEMBRE', spent(6000)),                       // 2026
  mkMonth('OCTOBRE 26', spent(10000)),
  mkMonth('NOVEMBRE 26', spent(2000)),                     // mois en cours
  mkMonth('DÉCEMBRE', spent(99999)),                       // pas commencé → ignoré
];
const rev = {
  SEPTEMBRE: [entry({ cashed: 2500, rate: 4 })],
  OCTOBRE: [entry({ cashed: 4000, rate: 4 }), entry({ cashed: 900, rate: 4, status: 'preview' })],
  NOVEMBRE: [entry({ cashed: 500, rate: 4 })],
};
const figs = () => monthFigures(months(), POSTES, rev, 4, NOW);

describe('monthFigures', () => {
  it('mêmes valeurs que le tracker, mois futurs exclus, mois en cours marqué', () => {
    const f = figs();
    expect(f.map(x => x.id)).toEqual(['OCTOBRE', 'NOVEMBRE', 'SEPTEMBRE', 'OCTOBRE 26', 'NOVEMBRE 26']);
    expect(f[0]).toMatchObject({ year: 2025, idx: 9, revenueEur: 2000, spentEur: 1000, spentLocal: 4000, current: false });
    expect(f[3]).toMatchObject({ year: 2026, revenueEur: 4000, revenueLocal: 16000, spentEur: 2500 });
    expect(f[4].current).toBe(true);
  });
});

describe('taux d’épargne', () => {
  it('(revenus − dépenses) ÷ revenus sur la période', () => {
    // SEP + OCT 26 : revenus 6500, dépenses 1500 + 2500
    expect(savingsRate(lastCompleted(figs(), 2))).toBeCloseTo((6500 - 4000) / 6500, 10);
  });
  it('le mois en cours est écarté des « derniers mois terminés »', () => {
    expect(lastCompleted(figs(), 2).map(f => f.id)).toEqual(['SEPTEMBRE', 'OCTOBRE 26']);
    expect(lastCompleted(figs(), 99)).toHaveLength(4);
  });
  it('négatif si on dépense plus qu’on ne gagne ; null sans revenu', () => {
    const f = (r: number, s: number): MonthFigures => ({ id: 'x', year: 2026, idx: 0, revenueEur: r, spentEur: s, revenueLocal: 0, spentLocal: 0, current: false });
    expect(savingsRate([f(1000, 1500)])).toBe(-0.5);
    expect(savingsRate([f(0, 500)])).toBeNull();
    expect(savingsRate([])).toBeNull();
  });
});

describe('mois d’autonomie', () => {
  it('solde ÷ dépense mensuelle moyenne des 3 derniers mois terminés', () => {
    // NOV 25 (8000), SEP (6000), OCT 26 (10000) → 8000 / mois
    const r = runwayMonths(96000, figs());
    expect(r.avgSpentLocal).toBe(8000);
    expect(r.months).toBe(12);
    expect(r.basis).toBe(3);
  });
  it('null sans dépense de référence ou sans solde', () => {
    expect(runwayMonths(50000, []).months).toBeNull();
    expect(runwayMonths(0, figs()).months).toBeNull();
  });
});

describe('année N contre N−1', () => {
  it('apparie chaque mois avec le même mois un an plus tôt ; le mois en cours est « partiel »', () => {
    const rows = yearOverYear(figs());
    expect(rows.map(r => [r.name, r.prev.id, r.cur.id, r.partial])).toEqual([
      ['OCTOBRE', 'OCTOBRE', 'OCTOBRE 26', false],
      ['NOVEMBRE', 'NOVEMBRE', 'NOVEMBRE 26', true],
    ]);
  });
  it('rien à comparer tant qu’il n’y a qu’une année', () => {
    expect(yearOverYear(monthFigures([mkMonth('OCTOBRE 26')], POSTES, {}, 4, NOW))).toEqual([]);
  });
  it('pctChange', () => {
    expect(pctChange(2000, 4000)).toBe(1);
    expect(pctChange(1000, 750)).toBe(-0.25);
    expect(pctChange(0, 500)).toBeNull();
  });
});
