import { describe, it, expect } from 'vitest';
import { projectSimulation, defaultSimulation, monthFromSimulation, simPeriod, parseYm, toYm, averageLines, budgetLines } from '../simulation';
import { sumAedBudget, sumAed } from '../utils';
import { tx } from './helpers';
import { Simulation } from '../types';
import { POSTES, mkMonth, entry, extra } from './helpers';

const sim = (over: Partial<Simulation> = {}): Simulation => ({
  id: 's', name: 'test', createdAt: '', start: '2026-12', months: 3, startBalance: 100000,
  revenueEur: 5000, rate: 4,
  lines: [{ name: 'COURSES', amount: 3000 }, { name: 'LOYER', amount: 15000 }],
  extras: [{ label: 'Billets', amount: 4000, month: 1 }, { label: 'Remboursement', amount: -1000, month: 2 }],
  ...over,
});

describe('périodes', () => {
  it('parse / format et passage d’année', () => {
    expect(parseYm('2026-12')).toEqual({ year: 2026, idx: 11 });
    expect(parseYm('2026-13')).toBeNull();
    expect(parseYm('décembre')).toBeNull();
    expect(toYm(2027, 0)).toBe('2027-01');
    expect(simPeriod(sim(), 0).label).toBe('DÉCEMBRE 2026');
    expect(simPeriod(sim(), 1)).toMatchObject({ year: 2027, idx: 0, label: 'JANVIER 2027' });
  });
});

describe('projectSimulation', () => {
  it('fin = début + revenu − budget − ponctuels, mois après mois', () => {
    const r = projectSimulation(sim());
    expect(r.rows.map(x => [x.label, x.start, x.revenue, x.spent, x.extras, x.end])).toEqual([
      ['DÉCEMBRE 2026', 100000, 20000, 18000, 0, 102000],
      ['JANVIER 2027', 102000, 20000, 18000, 4000, 100000],
      ['FÉVRIER 2027', 100000, 20000, 18000, -1000, 103000],
    ]);
    expect(r.endBalance).toBe(103000);
    expect(r.delta).toBe(3000);
    expect(r.monthlyNet).toBe(2000);
    expect(r.lowest).toEqual({ label: 'JANVIER 2027', balance: 100000 });
  });

  it('horizon borné à 1–12 mois ; sans revenu le solde fond', () => {
    expect(projectSimulation(sim({ months: 99 })).rows).toHaveLength(12);
    expect(projectSimulation(sim({ months: 0 })).rows).toHaveLength(1);
    const r = projectSimulation(sim({ revenueEur: 0, extras: [], months: 6 }));
    expect(r.endBalance).toBe(100000 - 6 * 18000);
    expect(r.lowest?.balance).toBe(-8000);
  });
});

describe('defaultSimulation — valeurs de départ tirées du réel', () => {
  const now = new Date(2026, 10, 20);
  const months = [
    mkMonth('SEPTEMBRE', { soldeStart: 90000, actual: [{ aed: 8000, eur: 2000 }, { aed: 0, eur: null }, { aed: 0, eur: null }] }),
    mkMonth('OCTOBRE 26', { soldeStart: 95000, actual: [{ aed: 10000, eur: 2500 }, { aed: 0, eur: null }, { aed: 0, eur: null }] }),
    mkMonth('NOVEMBRE 26', {
      soldeStart: 100000,
      budget: [{ aed: 3000, eur: 700 }, { aed: 15000, eur: null }, { aed: 0, eur: 500 }],
      actual: [{ aed: 2000, eur: 500 }, { aed: 0, eur: null }, { aed: 0, eur: null }],
      extraBudget: [extra('CADEAU', 400, 0)],
      hiddenPostes: ['CHARGES FRANCE'],
    }),
    mkMonth('DÉCEMBRE', { soldeStart: 1, budget: [{ aed: 99999, eur: null }, { aed: 0, eur: null }, { aed: 0, eur: null }] }), // faux mois futur
  ];
  const rev = { SEPTEMBRE: [entry({ cashed: 4000, rate: 4 })], OCTOBRE: [entry({ cashed: 6000, rate: 4 })], NOVEMBRE: [entry({ cashed: 1000, rate: 4 })] };
  const s = defaultSimulation({ months, postes: POSTES, revenusMonths: rev, liveRate: 4, now });

  it('commence le mois calendaire suivant, sur 3 mois', () => {
    expect(s.start).toBe('2026-12');
    expect(s.months).toBe(3);
    expect(s.name).toBe('Simulation décembre 2026');
  });
  it('solde de départ = prévisionnel du mois en cours (le faux mois futur est ignoré)', () => {
    expect(s.startBalance).toBe(100000 + 4000 - 2000);
  });
  it('revenu = moyenne des mois terminés ; budget = celui du mois en cours, postes masqués exclus', () => {
    expect(s.revenueEur).toBe(5000);
    expect(s.lines).toEqual([{ name: 'COURSES', amount: 3000 }, { name: 'LOYER', amount: 15000 }, { name: 'CADEAU', amount: 400 }]);
  });
  it('sans aucune donnée : simulation vide mais valide', () => {
    const e = defaultSimulation({ months: [], postes: POSTES, revenusMonths: {}, liveRate: 4, now });
    expect(e).toMatchObject({ startBalance: 0, revenueEur: 0, lines: [], extras: [] });
    expect(projectSimulation(e).rows).toHaveLength(3);
  });
});

describe('monthFromSimulation — créer le mois réel', () => {
  const tracker = () => [mkMonth('OCTOBRE 26'), mkMonth('NOVEMBRE 26', { hiddenPostes: ['LOYER', 'CHARGES FRANCE'] })];

  it('reprend solde et budget ; les lignes hors postes deviennent des ponctuels budgétés', () => {
    const res = monthFromSimulation(sim({ lines: [{ name: 'courses', amount: 3000 }, { name: 'LOYER', amount: 15000 }, { name: 'CHARGES FRANCE', amount: 2000 }, { name: 'Sport', amount: 500 }], extras: [{ label: 'Cadeaux', amount: 800, month: 0 }, { label: 'Plus tard', amount: 999, month: 1 }] }), tracker(), POSTES);
    if ('error' in res) throw new Error(res.error);
    const m = res.month;
    expect(m.id).toBe('DÉCEMBRE');
    expect(m.soldeStart).toBe(100000);
    expect(m.rate).toBe(4);
    expect(m.budget).toEqual([{ aed: 3000, eur: null }, { aed: 15000, eur: null }, { aed: 0, eur: 500 }]);
    expect(m.extraBudget.map(b => [b.name, b.aed])).toEqual([['SPORT', 500], ['CADEAUX', 800]]);
    expect(m.actual.every(a => a.aed === 0)).toBe(true);
    // les postes masqués par héritage redeviennent visibles puisqu'ils ont un budget
    expect(m.hiddenPostes).toEqual([]);
    expect(res.reactivated).toEqual(['LOYER', 'CHARGES FRANCE']);
    expect(sumAedBudget(m, POSTES, 4)).toBe(3000 + 15000 + 2000 + 500 + 800);
  });

  it('un poste désactivé SANS ligne dans la simulation le reste', () => {
    const res = monthFromSimulation(sim({ lines: [{ name: 'COURSES', amount: 3000 }] }), tracker(), POSTES);
    if ('error' in res) throw new Error(res.error);
    expect(res.month.hiddenPostes).toEqual(['LOYER', 'CHARGES FRANCE']);
    expect(res.reactivated).toEqual([]);
  });

  it('nom déjà pris par une autre année → suffixe automatique', () => {
    const res = monthFromSimulation(sim(), [mkMonth('DECEMBRE'), mkMonth('JANVIER'), mkMonth('OCTOBRE 26'), mkMonth('NOVEMBRE 26')], POSTES);
    expect('month' in res && res.month.id).toBe('DÉCEMBRE 26');
  });

  it('refusé si le mois existe déjà ou si le tracker a un mois plus récent', () => {
    expect(monthFromSimulation(sim(), [...tracker(), mkMonth('DÉCEMBRE')], POSTES)).toHaveProperty('error');
    expect(monthFromSimulation(sim({ start: '2026-10' }), tracker(), POSTES)).toHaveProperty('error');
    expect(monthFromSimulation(sim({ start: '2026-09' }), tracker(), POSTES)).toHaveProperty('error');
  });
});

describe('lignes de budget d’une simulation', () => {
  const now = new Date(2026, 10, 20);
  const months = () => [
    mkMonth('AOÛT', { actual: [{ aed: 3000, eur: 750 }, { aed: 15000, eur: 3750 }, { aed: 0, eur: 500 }], extraActual: [extra('CADEAU', 600, 150)] }),
    mkMonth('SEPTEMBRE', { actual: [{ aed: 5000, eur: 1250 }, { aed: 0, eur: null }, { aed: 0, eur: 500 }], extraActual: [extra('VOYAGES', 3000, 750, [tx(3000, { tripId: 't', tripKind: 'swap' })])] }),
    mkMonth('OCTOBRE 26', { actual: [{ aed: 4000, eur: 1000 }, { aed: 15000, eur: 3750 }, { aed: 0, eur: 500 }], hiddenPostes: ['CHARGES FRANCE'], extraActual: [extra('AMENDE', 300, 75)] }),
    mkMonth('NOVEMBRE 26', { actual: [{ aed: 99999, eur: 1 }, { aed: 0, eur: null }, { aed: 0, eur: null }] }), // mois en cours : exclu
  ];

  it('averageLines : moyenne du RÉEL des 3 derniers mois terminés, ponctuels regroupés', () => {
    const lines = averageLines(months(), POSTES, 3, now);
    expect(lines).toEqual([
      { name: 'COURSES', amount: 4000 },
      { name: 'LOYER', amount: 10000 },
      { name: 'CHARGES FRANCE', amount: 1333 },   // (2000 + 2000 + 0 masqué) / 3
      { name: 'PONCTUELS', amount: 300 },         // (600 + 0 swap exclu + 300) / 3
    ]);
  });

  it('le total des lignes = la dépense réelle mensuelle moyenne du tracker', () => {
    const ms = months();
    const avg = ms.slice(0, 3).reduce((s, m) => s + sumAed(m, POSTES, m.extraActual), 0) / 3;
    const total = averageLines(ms, POSTES, 3, now).reduce((s, l) => s + l.amount, 0);
    expect(Math.abs(total - avg)).toBeLessThan(2); // arrondis par ligne
  });

  it('aucun mois terminé → aucune ligne ; budgetLines sans mois de référence → vide', () => {
    expect(averageLines([mkMonth('NOVEMBRE 26')], POSTES, 3, now)).toEqual([]);
    expect(budgetLines(undefined, POSTES, 4)).toEqual([]);
  });
});
