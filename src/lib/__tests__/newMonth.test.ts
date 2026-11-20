import { describe, it, expect } from 'vitest';
import { newMonthId, buildNewMonth } from '../months';
import { POSTES, mkMonth } from './helpers';

const ids = (...names: string[]) => names.map(n => mkMonth(n));

describe('newMonthId — nom saisi → id du nouveau mois', () => {
  it('nom libre de toute collision : gardé tel quel (mis en majuscules)', () => {
    expect(newMonthId(ids('JANVIER', 'FEVRIER'), ' mars ')).toEqual({ id: 'MARS' });
    expect(newMonthId([], 'octobre')).toEqual({ id: 'OCTOBRE' });
  });

  it('le mois existe déjà → suffixe année automatique', () => {
    const ms = ids('OCTOBRE', 'NOVEMBRE', 'DECEMBRE', 'JANVIER', 'SEPTEMBRE', 'OCTOBRE 26');
    expect(newMonthId(ms, 'NOVEMBRE')).toEqual({ id: 'NOVEMBRE 26' });
    expect(newMonthId(ms, 'JANVIER')).toEqual({ id: 'JANVIER 27' });
  });

  it('collision jugée sur le mois calendaire : « DÉCEMBRE » vs « DECEMBRE »', () => {
    const ms = ids('DECEMBRE', 'JANVIER', 'OCTOBRE 26', 'NOVEMBRE 26');
    expect(newMonthId(ms, 'DÉCEMBRE')).toEqual({ id: 'DÉCEMBRE 26' });
  });

  it('nom saisi avec son année : respecté ; déjà pris → erreur', () => {
    const ms = ids('MARS', 'OCTOBRE 26');
    expect(newMonthId(ms, 'MARS 27')).toEqual({ id: 'MARS 27' });
    expect(newMonthId(ms, 'OCTOBRE 26')).toHaveProperty('error');
  });

  it('nom vide → erreur', () => {
    expect(newMonthId([], '   ')).toHaveProperty('error');
  });

  it('nom libre (pas un mois) déjà pris → suffixé', () => {
    const r = newMonthId(ids('SEPTEMBRE', 'OCTOBRE 26', 'VACANCES'), 'VACANCES');
    expect(r).toHaveProperty('id');
    expect((r as { id: string }).id).toMatch(/^VACANCES \d{2}$/);
  });
});

describe('buildNewMonth', () => {
  const history = () => [
    mkMonth('AOÛT', { actual: [{ aed: 900, eur: null }, { aed: 4000, eur: null }, { aed: 0, eur: 300 }] }),
    mkMonth('SEPTEMBRE', { actual: [{ aed: 1100, eur: null }, { aed: 4000, eur: null }, { aed: 0, eur: 280 }] }),
    mkMonth('OCTOBRE 26', {
      soldeEnd: 12345, hiddenPostes: ['LOYER'],
      budget: [{ aed: 850, eur: 200 }, { aed: 4250, eur: null }, { aed: 0, eur: 310 }],
      actual: [{ aed: 0, eur: null }, { aed: 4000, eur: null }, { aed: 0, eur: 320 }],
    }),
  ];
  const opts = { id: 'NOVEMBRE 26', rate: 4.1, soldeStart: 500 };

  it('copy : budget du dernier mois, réel à zéro, solde = solde de fin, masquages hérités', () => {
    const m = buildNewMonth(history(), POSTES, { ...opts, fill: 'copy' });
    expect(m.id).toBe('NOVEMBRE 26');
    expect(m.rate).toBe(4.1);
    expect(m.budget).toEqual([{ aed: 850, eur: 200 }, { aed: 4250, eur: null }, { aed: 0, eur: 310 }]);
    expect(m.actual).toEqual([{ aed: 0, eur: null }, { aed: 0, eur: null }, { aed: 0, eur: null }]);
    expect(m.soldeStart).toBe(12345);
    expect(m.hiddenPostes).toEqual(['LOYER']);
  });

  it('avg3 : moyenne du RÉEL des 3 derniers mois (valeurs > 0), sinon budget du dernier', () => {
    const m = buildNewMonth(history(), POSTES, { ...opts, fill: 'avg3' });
    // COURSES : (900 + 1100) / 2 ; LOYER : 4000 ; CHARGES (EUR) : (300 + 280 + 320) / 3
    expect(m.budget[0]).toEqual({ aed: 1000, eur: 200 });
    expect(m.budget[1].aed).toBe(4000);
    expect(m.budget[2]).toEqual({ aed: 0, eur: 300 });
  });

  it('empty : tout à zéro, solde saisi conservé', () => {
    const m = buildNewMonth(history(), POSTES, { ...opts, fill: 'empty' });
    expect(m.budget.every(b => b.aed === 0 && b.eur === null)).toBe(true);
    expect(m.soldeStart).toBe(500);
  });

  it('premier mois (aucun historique) : vide, quel que soit le mode', () => {
    const m = buildNewMonth([], POSTES, { ...opts, fill: 'copy' });
    expect(m.budget).toHaveLength(POSTES.length);
    expect(m.soldeStart).toBe(500);
    expect(m.hiddenPostes).toEqual([]);
  });

  it('ne modifie pas le dernier mois (masquages copiés, pas partagés)', () => {
    const h = history();
    const m = buildNewMonth(h, POSTES, { ...opts, fill: 'copy' });
    m.hiddenPostes!.push('X');
    expect(h[2].hiddenPostes).toEqual(['LOYER']);
  });
});
