import { describe, it, expect } from 'vitest';
import { dailyBalance, balanceExtremes, balanceAt } from '../balanceHistory';
import { monthBankBalance, detectYears } from '../utils';
import { POSTES, mkMonth, tx, entry, extra } from './helpers';

const NOW = new Date(2026, 10, 20, 12); // 20 novembre 2026

const months = () => [
  mkMonth('SEPTEMBRE', {
    soldeStart: 10000,
    actual: [
      { aed: 0, eur: 0, txns: [tx(300, { date: '2026-09-05' }), tx(200, { date: '2026-09-05' }), tx(80, { date: '2026-09-10', tripId: 't', tripKind: 'expense' })] },
      { aed: 4000, eur: 1000 },                        // LOYER : montant sans transaction → au 1er
      { aed: 0, eur: null },
    ],
    extraActual: [extra('VOYAGES', 1000, 250, [tx(1000, { date: '2026-09-12', tripId: 't', tripKind: 'swap' })])],
    adjustment: 50,
  }),
  mkMonth('OCTOBRE 26', {
    soldeStart: 9000,
    actual: [{ aed: 0, eur: 0, txns: [tx(500, { date: '2026-10-31' }), tx(70, { date: '2026-11-02' }), tx(30)] }, { aed: 0, eur: null }, { aed: 0, eur: null }],
  }),
  mkMonth('NOVEMBRE 26', {
    soldeStart: 0, // pas saisi → reprend la fin calculée d'octobre
    actual: [{ aed: 0, eur: 0, txns: [tx(100, { date: '2026-11-10' }), tx(999, { date: '2026-11-25' })] }, { aed: 0, eur: null }, { aed: 0, eur: null }],
    reguls: [{ ts: new Date(2026, 10, 15, 9).toISOString(), real: 0, adjustment: -20 }],
    adjustment: -20,
  }),
  mkMonth('DÉCEMBRE', { soldeStart: 5000 }), // mois de simulation, pas commencé
];
const rev = {
  SEPTEMBRE: [entry({ cashed: 1000, rate: 4, date: '2026-09-20' }), entry({ cashed: 500, rate: 4, date: '2026-09-25', status: 'preview' })],
  OCTOBRE: [entry({ cashed: 250, rate: 4, date: '2026-10-15' })],
};
const at = (h: ReturnType<typeof dailyBalance>, d: string) => balanceAt(h.points, d);

describe('dailyBalance — solde jour par jour', () => {
  const h = dailyBalance(months(), POSTES, rev, 4, NOW);

  it('une valeur par jour, du 1er jour du premier mois jusqu’à aujourd’hui', () => {
    expect(h.from).toBe('2026-09-01');
    expect(h.points[h.points.length - 1].date).toBe('2026-11-20');
    expect(h.points).toHaveLength(30 + 31 + 20);
  });

  it('chaque mouvement à sa date ; montant sans transaction et ajustement sans journal au 1er', () => {
    expect(at(h, '2026-09-01')).toBe(10000 - 4000 + 50);
    expect(at(h, '2026-09-04')).toBe(6050);
    expect(at(h, '2026-09-05')).toBe(5550);
    expect(at(h, '2026-09-10')).toBe(5550);   // dépense de voyage : ne débite pas le compte
    expect(at(h, '2026-09-12')).toBe(4550);   // le swap, lui, le débite
    expect(at(h, '2026-09-20')).toBe(8550);   // revenu confirmé ; la prévision du 25 ne compte pas
    expect(at(h, '2026-09-30')).toBe(8550);
  });

  it('chaque mois repart de son solde de départ saisi ; date hors mois ramenée dans le mois', () => {
    expect(at(h, '2026-10-01')).toBe(9000 - 30);        // tx non datée → 1er
    expect(at(h, '2026-10-15')).toBe(9970);
    expect(at(h, '2026-10-31')).toBe(9970 - 500 - 70);  // la tx datée du 02/11 reste dans SON mois
  });

  it('sans solde de départ : reprend la fin du mois précédent ; régul appliquée à sa date', () => {
    expect(at(h, '2026-11-01')).toBe(9400);
    expect(at(h, '2026-11-10')).toBe(9300);
    expect(at(h, '2026-11-14')).toBe(9300);
    expect(at(h, '2026-11-15')).toBe(9280);
  });

  it('rien après aujourd’hui : ni point, ni mouvement à venir, ni mois pas commencé', () => {
    expect(at(h, '2026-11-20')).toBe(9280);             // la tx du 25/11 n'est pas encore arrivée
    expect(at(h, '2026-11-21')).toBeNull();
    expect(h.points.some(p => p.date >= '2026-12-01')).toBe(false);
  });

  it('le dernier jour d’un mois terminé = son solde calculé dans le tracker', () => {
    const ms = months(); detectYears(ms);
    expect(at(h, '2026-09-30')).toBe(monthBankBalance(ms[0], POSTES, rev, 4));
    expect(at(h, '2026-10-31')).toBe(monthBankBalance(ms[1], POSTES, rev, 4));
  });

  it('mois legacy exclus ; aucune donnée → série vide', () => {
    const legacy = [mkMonth('JANVIER', { soldeStart: 5000, earn: 1000 }), mkMonth('MARS', { soldeStart: 7000 })];
    const r = dailyBalance(legacy, POSTES, {}, 4, new Date(2026, 2, 10));
    expect(r.from).toBe('2026-03-01');
    expect(dailyBalance([], POSTES, {}, 4, NOW)).toEqual({ points: [], from: null });
  });

  it('revenu sans taux enregistré : taux du MOIS (stable), pas le taux du jour', () => {
    const ms = [mkMonth('OCTOBRE 26', { soldeStart: 1000, rate: 4.3 })];
    const r = { OCTOBRE: [entry({ cashed: 100, rate: 0, date: '2026-10-10' })] };
    expect(balanceAt(dailyBalance(ms, POSTES, r, 4.0, NOW).points, '2026-10-10')).toBe(1430);
    expect(balanceAt(dailyBalance(ms, POSTES, r, 3.9, NOW).points, '2026-10-10')).toBe(1430);
  });

  it('poste masqué ignoré, comme dans les sommes du tracker', () => {
    const ms = [mkMonth('OCTOBRE 26', { soldeStart: 1000, hiddenPostes: ['COURSES'], actual: [{ aed: 0, eur: 0, txns: [tx(400, { date: '2026-10-05' })] }, { aed: 0, eur: null }, { aed: 0, eur: null }] })];
    expect(balanceAt(dailyBalance(ms, POSTES, {}, 4, NOW).points, '2026-10-31')).toBe(1000);
  });
});

describe('balanceExtremes / balanceAt', () => {
  const pts = [{ date: '2026-01-01', balance: 5 }, { date: '2026-01-02', balance: 9 }, { date: '2026-01-03', balance: 2 }, { date: '2026-01-04', balance: 9 }];
  it('plus haut, plus bas (le plus ancien en cas d’égalité), moyenne', () => {
    expect(balanceExtremes(pts)).toEqual({ high: pts[1], low: pts[2], avg: 6.25 });
    expect(balanceExtremes([])).toEqual({ high: null, low: null, avg: 0 });
  });
  it('balanceAt hors série → null', () => {
    expect(balanceAt(pts, '2025-12-31')).toBeNull();
    expect(balanceAt(pts, '2026-01-05')).toBeNull();
    expect(balanceAt(pts, '2026-01-03')).toBe(2);
    expect(balanceAt([], '2026-01-01')).toBeNull();
  });
});
