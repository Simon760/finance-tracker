import { Month, Poste, RevenuEntry } from './types';
import { MOIS_LIST } from './constants';
import { monthPeriod, monthRevenuConfirmedEur, monthRevenuConfirmedAed } from './revenus';
import { startedMonths, sumEur, sumAed } from './utils';

/** Revenus et dépenses d'un mois commencé, dans les deux devises. */
export interface MonthFigures {
  id: string;
  year: number;
  idx: number;
  revenueEur: number;
  spentEur: number;
  revenueLocal: number;
  spentLocal: number;
  /** Mois calendaire en cours : encore partiel, donc exclu des moyennes et comparaisons. */
  current: boolean;
}

/**
 * Chiffres mensuels de base des indicateurs de santé financière. Mêmes valeurs que le
 * tracker : revenus confirmés (`monthRevenuConfirmed*`), dépenses réelles (`sumEur` /
 * `sumAed`). Mois pas encore commencés et mois au nom non reconnu exclus.
 */
export function monthFigures(
  months: Month[], postes: Poste[],
  revenusMonths: Record<string, RevenuEntry[]> | undefined,
  fallbackRate: number, now: Date = new Date(),
): MonthFigures[] {
  const nowKey = now.getFullYear() * 12 + now.getMonth();
  const out: MonthFigures[] = [];
  startedMonths(months || [], now).forEach(m => {
    const p = monthPeriod(m);
    if (!p) return;
    out.push({
      id: m.id, year: p.year, idx: p.idx,
      revenueEur: monthRevenuConfirmedEur(m, revenusMonths),
      spentEur: sumEur(m, postes, m.extraActual || []),
      revenueLocal: monthRevenuConfirmedAed(m, revenusMonths, fallbackRate),
      spentLocal: sumAed(m, postes, m.extraActual || []),
      current: p.year * 12 + p.idx === nowKey,
    });
  });
  return out.sort((a, b) => a.year * 12 + a.idx - (b.year * 12 + b.idx));
}

/** Les `n` derniers mois TERMINÉS (le mois en cours, partiel, est écarté). */
export function lastCompleted(figs: MonthFigures[], n: number): MonthFigures[] {
  return figs.filter(f => !f.current).slice(-n);
}

/**
 * Taux d'épargne = (revenus − dépenses) ÷ revenus, sur l'ensemble des mois fournis.
 * Négatif quand on dépense plus qu'on ne gagne. null sans revenu (division impossible).
 */
export function savingsRate(figs: MonthFigures[]): number | null {
  const rev = figs.reduce((s, f) => s + f.revenueEur, 0);
  if (!(rev > 0)) return null;
  const spent = figs.reduce((s, f) => s + f.spentEur, 0);
  return (rev - spent) / rev;
}

/**
 * Mois d'autonomie : combien de mois le solde du compte tient au rythme de dépense
 * actuel (moyenne des `n` derniers mois terminés), SANS aucun revenu.
 */
export function runwayMonths(
  balanceLocal: number, figs: MonthFigures[], n = 3,
): { months: number | null; avgSpentLocal: number; basis: number } {
  const base = lastCompleted(figs, n).filter(f => f.spentLocal > 0);
  const avgSpentLocal = base.length ? base.reduce((s, f) => s + f.spentLocal, 0) / base.length : 0;
  return {
    months: avgSpentLocal > 0 && balanceLocal > 0 ? balanceLocal / avgSpentLocal : null,
    avgSpentLocal,
    basis: base.length,
  };
}

export interface YoYRow {
  /** « OCTOBRE » */
  name: string;
  prev: MonthFigures;
  cur: MonthFigures;
  /** Le mois de l'année N est encore en cours : affiché, mais hors totaux. */
  partial: boolean;
}

/**
 * Année N contre N−1 : chaque mois dont le même mois calendaire existe un an plus tôt.
 * Du plus ancien au plus récent.
 */
export function yearOverYear(figs: MonthFigures[]): YoYRow[] {
  const byKey = new Map(figs.map(f => [f.year * 12 + f.idx, f]));
  const rows: YoYRow[] = [];
  figs.forEach(cur => {
    const prev = byKey.get((cur.year - 1) * 12 + cur.idx);
    if (prev) rows.push({ name: MOIS_LIST[cur.idx], prev, cur, partial: cur.current });
  });
  return rows;
}

/** Variation relative (b vs a) ; null si la base est nulle. */
export function pctChange(a: number, b: number): number | null {
  return a > 0 ? (b - a) / a : null;
}
