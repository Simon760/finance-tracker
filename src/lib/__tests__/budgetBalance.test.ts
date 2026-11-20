import { describe, it, expect } from 'vitest';
import { computeBudgetBalance, isPosteFixed, budgetBalanceMessage } from '../budgetBalance';
import { POSTES, mkMonth, tx, extra } from './helpers';

describe('charges fixes', () => {
  it('flag explicite, sinon défaut par nom (insensible aux accents / casse)', () => {
    expect(isPosteFixed({ name: 'Loyer', cat: 'logement', isAed: true })).toBe(true);
    expect(isPosteFixed({ name: 'COURSES', cat: 'vital', isAed: true })).toBe(false);
    expect(isPosteFixed({ name: 'LOYER', cat: 'logement', isAed: true, fixed: false })).toBe(false);
    expect(isPosteFixed({ name: 'COURSES', cat: 'vital', isAed: true, fixed: true })).toBe(true);
  });
});

describe('computeBudgetBalance — bilan vs prévisionnel', () => {
  it('exclut charges fixes et postes masqués, sépare prévu / non prévu', () => {
    const m = mkMonth('MAI', {
      rate: 4,
      budget: [{ aed: 800, eur: null }, { aed: 4000, eur: null }, { aed: 0, eur: 300 }],
      actual: [{ aed: 1000, eur: 250 }, { aed: 4000, eur: 1000 }, { aed: 0, eur: 280 }],
      extraBudget: [extra('CADEAU', 400, 0)],
      extraActual: [extra('CADEAU', 200, 50), extra('AMENDE', 120, 30)],
    });
    const b = computeBudgetBalance(m, POSTES, 4);
    expect(b.excludedFixed).toEqual(['LOYER']);
    // prévu : COURSES 200 + CHARGES 300 + CADEAU 100 = 600 ; réel : 250 + 280 + 50 = 580
    expect(b.prevuBudgetEur).toBe(600);
    expect(b.prevuActualEur).toBe(580);
    expect(b.prevuNet).toBe(20);
    expect(b.overruns.map(o => o.name)).toEqual(['COURSES']);
    expect(b.margins.map(o => o.name)).toEqual(['CADEAU', 'CHARGES FRANCE']);
    expect(b.nonPrevu).toEqual([{ name: 'AMENDE', actualEur: 30 }]);
    expect(b.nonPrevuNet).toBe(-30);
    expect(b.globalNet).toBe(-10);
    expect(budgetBalanceMessage(b).tone).toBe('warn');
  });

  it('un conteneur de swaps (VOYAGES) est un transfert : hors bilan', () => {
    const m = mkMonth('MAI', {
      extraActual: [extra('VOYAGES', 3000, 750, [tx(3000, { tripId: 't', tripKind: 'swap', eur: 750 })])],
    });
    const b = computeBudgetBalance(m, POSTES, 4);
    expect(b.nonPrevuActualEur).toBe(0);
    expect(b.globalNet).toBe(0);
  });

  it('poste masqué ignoré', () => {
    const m = mkMonth('MAI', {
      budget: [{ aed: 800, eur: null }, { aed: 0, eur: null }, { aed: 0, eur: null }],
      actual: [{ aed: 2000, eur: 500 }, { aed: 0, eur: null }, { aed: 0, eur: null }],
      hiddenPostes: ['COURSES'],
    });
    expect(computeBudgetBalance(m, POSTES, 4).globalNet).toBe(0);
  });
});
