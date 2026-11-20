import { describe, it, expect } from 'vitest';
import { removePosteAt, swapPostes, mergePostes } from '../postes';
import { Month, Poste } from '../types';
import { mkMonth, tx } from './helpers';

const P = (name: string): Poste => ({ name, cat: 'vital', isAed: true });
const POSTES = [P('A'), P('B'), P('C'), P('D')];

// Chaque ligne porte une valeur qui identifie son poste (A=1, B=2…) et son mois (×10^n)
const month = (id: string, k: number, len = 4): Month => mkMonth(id, {
  budget: Array.from({ length: len }, (_, i) => ({ aed: (i + 1) * k, eur: null })),
  actual: Array.from({ length: len }, (_, i) => ({ aed: (i + 1) * k * 100, eur: null, txns: [tx((i + 1) * k * 100, { label: `${id}-${i}` })] })),
});
const MONTHS = () => [month('JAN', 1), month('FEV', 10)];

/** L'invariant : après l'opération, la ligne d'un poste est toujours SA ligne d'avant. */
function rowsByName(postes: Poste[], months: Month[]) {
  return months.map(m => Object.fromEntries(postes.map((p, i) => [p.name, [m.budget[i]?.aed, m.actual[i]?.aed]])));
}

describe('removePosteAt', () => {
  it('retire le poste et sa ligne dans tous les mois ; les autres gardent leurs valeurs', () => {
    const before = rowsByName(POSTES, MONTHS());
    const r = removePosteAt(POSTES, MONTHS(), 1);
    expect(r.postes.map(p => p.name)).toEqual(['A', 'C', 'D']);
    const after = rowsByName(r.postes, r.months);
    after.forEach((m, k) => {
      expect(m).toEqual({ A: before[k].A, C: before[k].C, D: before[k].D });
    });
    r.months.forEach(m => { expect(m.budget).toHaveLength(3); expect(m.actual).toHaveLength(3); });
  });

  it('mois aux lignes incomplètes : complété, jamais de trou', () => {
    const short = [month('JAN', 1, 2)]; // seulement A et B renseignés
    const r = removePosteAt(POSTES, short, 0);
    expect(r.months[0].budget.map(b => b.aed)).toEqual([2, 0, 0]);
    expect(r.months[0].actual.every(a => !!a)).toBe(true);
  });

  it('index invalide → rien ne change ; les arguments ne sont jamais modifiés', () => {
    const months = MONTHS();
    const snap = JSON.stringify(months);
    expect(removePosteAt(POSTES, months, 9)).toEqual({ postes: POSTES, months });
    removePosteAt(POSTES, months, 1);
    expect(JSON.stringify(months)).toBe(snap);
    expect(POSTES).toHaveLength(4);
  });
});

describe('swapPostes', () => {
  it('échange deux postes ET leurs lignes : chaque poste garde ses montants', () => {
    const before = rowsByName(POSTES, MONTHS());
    const r = swapPostes(POSTES, MONTHS(), 0, 1);
    expect(r.postes.map(p => p.name)).toEqual(['B', 'A', 'C', 'D']);
    expect(rowsByName(r.postes, r.months)).toEqual(before);
  });

  it('plusieurs déplacements successifs conservent l’alignement', () => {
    const before = rowsByName(POSTES, MONTHS());
    let s = { postes: POSTES, months: MONTHS() };
    [[0, 1], [1, 2], [2, 3], [3, 2], [1, 0]].forEach(([i, j]) => { s = swapPostes(s.postes, s.months, i, j); });
    expect(rowsByName(s.postes, s.months)).toEqual(before);
  });

  it('les transactions suivent leur poste', () => {
    const r = swapPostes(POSTES, MONTHS(), 0, 3);
    expect(r.months[0].actual[0].txns?.[0].label).toBe('JAN-3');
    expect(r.months[0].actual[3].txns?.[0].label).toBe('JAN-0');
  });

  it('index hors limites ou identiques → inchangé', () => {
    const months = MONTHS();
    expect(swapPostes(POSTES, months, 0, 4)).toEqual({ postes: POSTES, months });
    expect(swapPostes(POSTES, months, 2, 2)).toEqual({ postes: POSTES, months });
  });
});

describe('mergePostes', () => {
  it('somme budgets et réels dans le premier, concatène les transactions, retire les autres', () => {
    const before = rowsByName(POSTES, MONTHS());
    const r = mergePostes(POSTES, MONTHS(), [1, 3]); // B + D → B
    expect(r.postes.map(p => p.name)).toEqual(['A', 'B', 'C']);
    const after = rowsByName(r.postes, r.months);
    after.forEach((m, k) => {
      expect(m.A).toEqual(before[k].A);
      expect(m.C).toEqual(before[k].C);
      expect(m.B).toEqual([before[k].B[0]! + before[k].D[0]!, before[k].B[1]! + before[k].D[1]!]);
    });
    expect(r.months[0].actual[1].txns?.map(t => t.label)).toEqual(['JAN-1', 'JAN-3']);
  });

  it('total du mois inchangé par une fusion', () => {
    const months = MONTHS();
    const total = (ms: Month[]) => ms.map(m => m.actual.reduce((s, a) => s + (a?.aed || 0), 0));
    expect(total(mergePostes(POSTES, months, [0, 2, 3]).months)).toEqual(total(months));
  });

  it('moins de deux index valides → inchangé', () => {
    const months = MONTHS();
    expect(mergePostes(POSTES, months, [2])).toEqual({ postes: POSTES, months });
    expect(mergePostes(POSTES, months, [2, 2, 9])).toEqual({ postes: POSTES, months });
  });
});
