import { Month, BudgetRow, ActualRow, ExtraRow } from './types';

// Format
export function f$(n: number): string {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function f0(n: number): string {
  return Math.round(n).toLocaleString('fr-FR');
}

// Currency
export function toEur(aed: number, rate: number): number {
  return rate > 0 ? aed / rate : 0;
}

export function toAed(eur: number, rate: number): number {
  return eur * rate;
}

export function rowEur(row: BudgetRow | ActualRow, rate: number): number {
  if (row.eur && row.eur > 0) return row.eur;
  return toEur(row.aed || 0, rate);
}

// Budget sums
export function sumEurBudget(m: Month, postes: { isAed: boolean }[], liveRate: number): number {
  let total = 0;
  postes.forEach((p, i) => {
    const row = m.budget[i];
    if (!row) return;
    total += p.isAed ? toEur(row.aed, liveRate) : (row.eur || 0);
  });
  (m.extraBudget || []).forEach(r => {
    total += r.eur > 0 ? r.eur : toEur(r.aed, liveRate);
  });
  return total;
}

export function sumAedBudget(m: Month, postes: { isAed: boolean }[], liveRate: number): number {
  let total = 0;
  postes.forEach((p, i) => {
    const row = m.budget[i];
    if (!row) return;
    total += p.isAed ? (row.aed || 0) : toAed(row.eur || 0, liveRate);
  });
  (m.extraBudget || []).forEach(r => {
    total += r.aed > 0 ? r.aed : toAed(r.eur || 0, liveRate);
  });
  return total;
}

// NOTE: aligné sur la version HTML (_old/js/services/budget.js).
// On itère state.postes (et non actual[]) pour ignorer les rows orphelines
// laissées dans m.actual après la suppression d'un poste.
// Les save handlers de transaction gardent row.aed / row.eur synchronisés
// avec la somme des txns, donc on lit directement ces champs.
export function sumEur(m: Month, postes: { isAed: boolean }[], extra: ExtraRow[]): number {
  let total = 0;
  postes.forEach((_, i) => {
    const row = m.actual?.[i];
    if (!row) return;
    total += rowEur(row, m.rate);
  });
  (extra || []).forEach(r => {
    total += r.eur > 0 ? r.eur : toEur(r.aed, m.rate);
  });
  return total;
}

export function sumAed(m: Month, postes: { isAed: boolean }[], extra: ExtraRow[]): number {
  let total = 0;
  postes.forEach((p, i) => {
    const row = m.actual?.[i];
    if (!row) return;
    if (p.isAed) {
      total += row.aed || 0;
    } else {
      total += toAed(rowEur(row, m.rate), m.rate);
    }
  });
  (extra || []).forEach(r => {
    if (r.aed && r.aed > 0) total += r.aed;
    else if (r.eur && r.eur > 0) total += toAed(r.eur, m.rate);
  });
  return total;
}

// Live rate fetching
export async function fetchRate(): Promise<number> {
  try {
    const r = await fetch('https://api.exchangerate-data.com/v4/latest/EUR');
    const d = await r.json();
    return d.rates?.AED || 4.0128;
  } catch {
    try {
      const r2 = await fetch('https://open.er-api.com/v6/latest/EUR');
      const d2 = await r2.json();
      return d2.rates?.AED || 4.0128;
    } catch {
      return 4.0128;
    }
  }
}

// Year detection
export function detectYears(months: Month[]): number[] {
  const MOIS = ['JANVIER', 'FÉVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN', 'JUILLET', 'AOÛT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DÉCEMBRE'];
  const moisIdx = (n: string) => MOIS.findIndex(m => m === n || m.replace(/[ÉÈÊË]/g, c => ({ É: 'E', È: 'E', Ê: 'E', Ë: 'E' }[c] || c)) === n || n.startsWith(m.slice(0, 3)));

  const yearSet = new Set<number>();
  if (months.length === 0) return [];

  const lastIdx = moisIdx(months[months.length - 1].id);
  const nowMonth = new Date().getMonth();
  let yr = new Date().getFullYear();
  if (lastIdx > nowMonth) yr = yr;

  let prevIdx = lastIdx;
  for (let i = months.length - 1; i >= 0; i--) {
    const idx = moisIdx(months[i].id);
    if (idx > prevIdx) yr--;
    prevIdx = idx;
    months[i]._year = yr;
    yearSet.add(yr);
  }
  return Array.from(yearSet).sort();
}
