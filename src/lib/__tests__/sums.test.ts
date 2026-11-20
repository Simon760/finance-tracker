import { describe, it, expect } from 'vitest';
import {
  sumAed, sumEur, sumAedBank, sumEurBudget, sumAedBudget, rowAedSpent, rowEur,
  budgetIsEurRef, budgetEurOf, budgetAedOf, toEur, toAed, monthBankBalance,
} from '../utils';
import { POSTES, mkMonth, tx, entry, extra } from './helpers';

describe('conversions', () => {
  it('toEur / toAed, taux nul = 0 (pas de division par zéro)', () => {
    expect(toEur(400, 4)).toBe(100);
    expect(toAed(100, 4)).toBe(400);
    expect(toEur(400, 0)).toBe(0);
  });
});

describe('rowAedSpent — AED réellement sorti pour une ligne « Réel »', () => {
  it('les transactions font foi (montant saisi, jamais re-dérivé de l’EUR au taux du mois)', () => {
    // Piège connu : une tx de 1 196 AED s'affichait 1 175 en repassant par row.eur × m.rate
    const row = { aed: 1175, eur: 293.75, txns: [tx(1196)] };
    expect(rowAedSpent(row, 4, { isAed: true })).toBe(1196);
  });

  it('exclut les dépenses de voyage du solde bancaire (le swap a déjà débité)', () => {
    const row = { aed: 0, eur: 0, txns: [tx(500, { tripId: 't', tripKind: 'swap' }), tx(80, { tripId: 't', tripKind: 'expense' }), tx(20)] };
    expect(rowAedSpent(row, 4, { isAed: true })).toBe(600);
    expect(rowAedSpent(row, 4, { isAed: true, excludeTripExpense: true })).toBe(520);
  });

  it('sans transaction : poste AED → aed stocké ; poste EUR → eur × taux du mois', () => {
    expect(rowAedSpent({ aed: 663, eur: 184.32 }, 4, { isAed: true })).toBe(663);
    // DÉCEMBRE/COURSES : aed figé à un vieux taux, c'est l'EUR qui fait foi pour un poste EUR
    expect(rowAedSpent({ aed: 663, eur: 184.32 }, 4, { isAed: false })).toBeCloseTo(737.28, 6);
  });

  it('ligne extra (isAed non fourni) : aed si présent, sinon eur × taux', () => {
    expect(rowAedSpent({ aed: 300, eur: 70 }, 4)).toBe(300);
    expect(rowAedSpent({ aed: 0, eur: 70 }, 4)).toBe(280);
    expect(rowAedSpent(undefined, 4)).toBe(0);
  });

  it('rowEur : eur stocké si > 0, sinon aed ÷ taux', () => {
    expect(rowEur({ aed: 400, eur: 95 }, 4)).toBe(95);
    expect(rowEur({ aed: 400, eur: null }, 4)).toBe(100);
  });
});

describe('sommes « Réel » — itèrent les POSTES, pas actual[]', () => {
  it('ignore les lignes orphelines laissées après la suppression d’un poste', () => {
    const m = mkMonth('MAI', {
      actual: [
        { aed: 100, eur: 25 }, { aed: 200, eur: 50 }, { aed: 0, eur: 30 },
        { aed: 9999, eur: 9999 }, // orpheline : aucun poste à cet index
      ],
    });
    expect(sumAed(m, POSTES, [])).toBe(100 + 200 + 120);
    expect(sumEur(m, POSTES, [])).toBe(25 + 50 + 30);
  });

  it('ignore un poste masqué pour ce mois', () => {
    const m = mkMonth('MAI', {
      actual: [{ aed: 100, eur: 25 }, { aed: 200, eur: 50 }, { aed: 0, eur: 30 }],
      hiddenPostes: ['LOYER'],
    });
    expect(sumAed(m, POSTES, [])).toBe(220);
    expect(sumEur(m, POSTES, [])).toBe(55);
    expect(sumAedBank(m, POSTES, [])).toBe(220);
  });

  it('ajoute les extras ; un conteneur de swaps est un transfert, pas une dépense', () => {
    const swapRow = extra('VOYAGES', 3000, 750, [tx(3000, { tripId: 't', tripKind: 'swap', eur: 750 })]);
    const m = mkMonth('MAI', { actual: [{ aed: 100, eur: 25 }, { aed: 0, eur: null }, { aed: 0, eur: null }] });
    const extras = [extra('CADEAU', 400, 100), swapRow];
    expect(sumAed(m, POSTES, extras)).toBe(500);
    expect(sumEur(m, POSTES, extras)).toBe(125);
    // …mais le swap débite bien le compte
    expect(sumAedBank(m, POSTES, extras)).toBe(3500);
  });

  it('sumAedBank exclut les dépenses de voyage, sumAed les compte', () => {
    const m = mkMonth('MAI', {
      actual: [{ aed: 180, eur: 45, txns: [tx(100), tx(80, { tripId: 't', tripKind: 'expense' })] }, { aed: 0, eur: null }, { aed: 0, eur: null }],
    });
    expect(sumAed(m, POSTES, [])).toBe(180);
    expect(sumAedBank(m, POSTES, [])).toBe(100);
  });
});

describe('budget — devise de référence d’une ligne', () => {
  it('une seule devise stockée → c’est elle ; les deux → le flag du poste tranche', () => {
    expect(budgetIsEurRef({ aed: 850, eur: null }, true)).toBe(false);
    expect(budgetIsEurRef({ aed: 0, eur: 200 }, true)).toBe(true);
    expect(budgetIsEurRef({ aed: 850, eur: 200 }, true)).toBe(false);
    expect(budgetIsEurRef({ aed: 850, eur: 200 }, false)).toBe(true);
    expect(budgetIsEurRef(undefined, true)).toBe(false);
  });

  it('poste AED : l’AED est fixe, l’EUR suit le taux live (l’EUR stocké est ignoré)', () => {
    const row = { aed: 850, eur: 200.75 };
    expect(budgetAedOf(row, true, 4.25)).toBe(850);
    expect(budgetEurOf(row, true, 4.25)).toBe(200);
  });

  it('poste EUR : l’EUR est fixe, l’AED suit le taux live', () => {
    const row = { aed: 0, eur: 300 };
    expect(budgetEurOf(row, false, 4.25)).toBe(300);
    expect(budgetAedOf(row, false, 4.25)).toBe(1275);
  });

  it('totaux budget : postes non masqués + extras budgétés', () => {
    const m = mkMonth('MAI', {
      budget: [{ aed: 850, eur: 200.75 }, { aed: 4250, eur: null }, { aed: 0, eur: 300 }],
      extraBudget: [extra('CADEAU', 425, 0), extra('BILLET', 0, 50)],
      hiddenPostes: ['LOYER'],
    });
    expect(sumEurBudget(m, POSTES, 4.25)).toBe(200 + 300 + 100 + 50);
    expect(sumAedBudget(m, POSTES, 4.25)).toBe(850 + 1275 + 425 + 212.5);
  });
});

describe('solde bancaire du mois (« Prévisionnel compte »)', () => {
  it('= solde de départ + revenus confirmés − dépenses hors voyage + ajustement', () => {
    const m = mkMonth('MAI', {
      soldeStart: 10000, adjustment: -50,
      actual: [{ aed: 180, eur: 45, txns: [tx(100), tx(80, { tripId: 't', tripKind: 'expense' })] }, { aed: 2000, eur: 500 }, { aed: 0, eur: null }],
    });
    const rev = { MAI: [entry({ cashed: 1000, rate: 4.1 }), entry({ cashed: 500, rate: 4.1, status: 'preview' })] };
    // 10000 + 1000×4,1 − (100 + 2000) − 50
    expect(monthBankBalance(m, POSTES, rev, 4)).toBeCloseTo(11950, 6);
  });
});
