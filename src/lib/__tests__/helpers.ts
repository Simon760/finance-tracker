import { Month, Poste, RevenuEntry, Transaction, ActualRow, BudgetRow, ExtraRow } from '../types';

/** Postes de test : 2 en devise locale (AED), 1 en devise base (EUR). */
export const POSTES: Poste[] = [
  { name: 'COURSES', cat: 'vital', isAed: true },
  { name: 'LOYER', cat: 'logement', isAed: true },
  { name: 'CHARGES FRANCE', cat: 'finance', isAed: false },
];

export function mkMonth(id: string, over: Partial<Month> = {}): Month {
  const empty = (): BudgetRow => ({ aed: 0, eur: null });
  return {
    id, rate: 4, earn: 0, soldeStart: 0, soldeEnd: 0,
    budget: POSTES.map(empty),
    actual: POSTES.map(empty) as ActualRow[],
    extraBudget: [], extraActual: [],
    ...over,
  };
}

export function tx(amount: number, over: Partial<Transaction> = {}): Transaction {
  return { label: 'x', amount, currency: 'AED', rate: 4, eur: amount / 4, date: '2026-05-10', ...over };
}

export function entry(over: Partial<RevenuEntry> = {}): RevenuEntry {
  return {
    date: '2026-05-10', client: 'ACME', cat: 'CONSULTING', contracted: 1000, cashed: 1000,
    comment: '', rate: 4, status: 'confirmed', ...over,
  };
}

export function extra(name: string, aed: number, eur: number, txns?: Transaction[]): ExtraRow {
  return { name, cat: 'lifestyle', aed, eur, ...(txns ? { txns } : {}) };
}
