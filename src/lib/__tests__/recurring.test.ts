import { describe, it, expect } from 'vitest';
import { ruleDatesInMonth, pendingExpenses, applyExpenses, pendingRevenus, applyRevenus, skipOccurrences, ruleSchedule } from '../recurring';
import { makeTxn, withTxns, addTxnsToPoste, addTxnsToExtra } from '../txns';
import { sumAed, sumAedBank } from '../utils';
import { RecurringRule } from '../types';
import { POSTES, mkMonth, tx, entry, extra } from './helpers';

const rule = (over: Partial<RecurringRule>): RecurringRule => ({
  id: 'r1', kind: 'expense', label: 'Loyer', amount: 6500, currency: 'AED', poste: 'LOYER', freq: 'monthly', day: 1, active: true, ...over,
});
const NOV = () => mkMonth('NOVEMBRE 26', { _year: 2026 });

describe('transactions (lib/txns) — mêmes règles que la saisie du tracker', () => {
  it('AED : montant tel quel, EUR dérivé du taux ; EUR : converti en AED au taux fourni', () => {
    expect(makeTxn({ label: 'x', amount: 400, currency: 'AED', date: '2026-11-01', rate: 4 }))
      .toEqual({ label: 'x', amount: 400, rate: 4, eur: 100, date: '2026-11-01', currency: 'AED', originalAmount: 400 });
    const t = makeTxn({ label: '', amount: 100, currency: 'EUR', date: '2026-11-01', rate: 4.1, recur: 'k' });
    expect(t).toMatchObject({ label: '---', amount: 410, eur: 100, originalAmount: 100, recur: 'k' });
  });

  it('withTxns recalcule les deux devises de la ligne', () => {
    expect(withTxns({ aed: 1, eur: 1 }, [tx(100), tx(60)], 4)).toMatchObject({ aed: 160, eur: 40 });
  });

  it('addTxnsToPoste : ajoute sans toucher aux autres lignes, comble les lignes manquantes', () => {
    const m = mkMonth('MAI', { actual: [{ aed: 50, eur: 12.5, txns: [tx(50)] }] });
    const out = addTxnsToPoste(m, 2, [tx(80)], 4);
    expect(out.actual).toHaveLength(3);
    expect(out.actual[0]).toBe(m.actual[0]);
    expect(out.actual[1]).toEqual({ aed: 0, eur: null });
    expect(out.actual[2]).toMatchObject({ aed: 80, eur: 20 });
    expect(m.actual).toHaveLength(1);
    expect(addTxnsToPoste(m, -1, [tx(1)], 4)).toBe(m);
  });

  it('addTxnsToExtra : réutilise le poste ponctuel du même nom, sinon le crée', () => {
    const m = mkMonth('MAI', { extraActual: [extra('Cadeau', 100, 25, [tx(100)])] });
    const a = addTxnsToExtra(m, ' cadeau ', 'lifestyle', [tx(40)], 4);
    expect(a.extraActual).toHaveLength(1);
    expect(a.extraActual[0]).toMatchObject({ aed: 140, eur: 35 });
    const b = addTxnsToExtra(m, 'Amende', 'vital', [tx(200)], 4);
    expect(b.extraActual.map(r => r.name)).toEqual(['Cadeau', 'AMENDE']);
  });
});

describe('dates d’une règle dans un mois', () => {
  it('mensuelle : le jour demandé, ramené au dernier jour d’un mois plus court', () => {
    expect(ruleDatesInMonth(rule({ day: 5 }), 2026, 10)).toEqual(['2026-11-05']);
    expect(ruleDatesInMonth(rule({ day: 31 }), 2026, 10)).toEqual(['2026-11-30']);
    expect(ruleDatesInMonth(rule({ day: 31 }), 2027, 1)).toEqual(['2027-02-28']);
  });
  it('hebdomadaire : tous les jours de semaine correspondants (vendredis de novembre 2026)', () => {
    expect(ruleDatesInMonth(rule({ freq: 'weekly', weekday: 5 }), 2026, 10)).toEqual(['2026-11-06', '2026-11-13', '2026-11-20', '2026-11-27']);
  });
  it('rien avant la date d’effet', () => {
    expect(ruleDatesInMonth(rule({ freq: 'weekly', weekday: 5, from: '2026-11-15' }), 2026, 10)).toEqual(['2026-11-20', '2026-11-27']);
    expect(ruleDatesInMonth(rule({ day: 1, from: '2026-11-15' }), 2026, 10)).toEqual([]);
  });
  it('libellé de planification', () => {
    expect(ruleSchedule(rule({ day: 5 }))).toBe('le 5 du mois');
    expect(ruleSchedule(rule({ freq: 'weekly', weekday: 5 }))).toBe('chaque vendredi');
  });
});

describe('dépenses récurrentes', () => {
  const rules = [rule({}), rule({ id: 'r2', label: 'Netflix', amount: 12, currency: 'EUR', poste: 'COURSES', day: 25 })];

  it('ne propose que les occurrences ÉCHUES', () => {
    expect(pendingExpenses(rules, NOV(), POSTES, '2026-11-20').map(o => o.key)).toEqual(['r1@2026-11-01']);
    expect(pendingExpenses(rules, NOV(), POSTES, '2026-11-25').map(o => o.key)).toEqual(['r1@2026-11-01', 'r2@2026-11-25']);
  });

  it('appliquer crée la transaction dans le bon poste — et n’est plus reproposé (idempotent)', () => {
    const occs = pendingExpenses(rules, NOV(), POSTES, '2026-11-25');
    const m = applyExpenses(NOV(), POSTES, occs, 4);
    expect(m.actual[1].txns).toEqual([{ label: 'Loyer', amount: 6500, rate: 4, eur: 1625, date: '2026-11-01', currency: 'AED', originalAmount: 6500, recur: 'r1@2026-11-01' }]);
    expect(m.actual[0].txns?.[0]).toMatchObject({ label: 'Netflix', amount: 48, eur: 12, recur: 'r2@2026-11-25' });
    expect(sumAed(m, POSTES, [])).toBe(6548);
    expect(sumAedBank(m, POSTES, [])).toBe(6548);
    expect(pendingExpenses(rules, m, POSTES, '2026-11-25')).toEqual([]);
    // appliquer deux fois la même liste ne peut arriver que par erreur d'appelant : la
    // liste « en attente » recalculée est vide, donc rien n'est doublé
    expect(applyExpenses(m, POSTES, pendingExpenses(rules, m, POSTES, '2026-11-25'), 4)).toBe(m);
  });

  it('règle inactive, poste supprimé ou masqué ce mois-là, mois au nom libre : rien', () => {
    expect(pendingExpenses([rule({ active: false })], NOV(), POSTES, '2026-11-20')).toEqual([]);
    expect(pendingExpenses([rule({ poste: 'DISPARU' })], NOV(), POSTES, '2026-11-20')).toEqual([]);
    expect(pendingExpenses([rule({})], mkMonth('NOVEMBRE 26', { _year: 2026, hiddenPostes: ['LOYER'] }), POSTES, '2026-11-20')).toEqual([]);
    expect(pendingExpenses([rule({})], mkMonth('VACANCES'), POSTES, '2026-11-20')).toEqual([]);
  });

  it('une occurrence écartée n’est plus proposée ; la règle reste active pour les mois suivants', () => {
    const occs = pendingExpenses(rules, NOV(), POSTES, '2026-11-20');
    const next = skipOccurrences(rules, occs);
    expect(next[0].skipped).toEqual(['r1@2026-11-01']);
    expect(next[1]).toBe(rules[1]);
    expect(pendingExpenses(next, NOV(), POSTES, '2026-11-20')).toEqual([]);
    expect(pendingExpenses(next, mkMonth('DÉCEMBRE', { _year: 2026 }), POSTES, '2026-12-02').map(o => o.key)).toEqual(['r1@2026-12-01']);
  });
});

describe('revenus récurrents', () => {
  const rules = [rule({ id: 'z', kind: 'revenue', label: 'ZINRAI', cat: 'EDUCATEUR', amount: 164, currency: 'USD', freq: 'weekly', weekday: 5, poste: undefined })];
  const rates = { liveRate: 4.25, usdRate: 1.15 };

  it('propose toutes les dates du mois, y compris à venir', () => {
    expect(pendingRevenus(rules, {}, 2026, 10).map(o => o.date)).toEqual(['2026-11-06', '2026-11-13', '2026-11-20', '2026-11-27']);
  });

  it('ajoutés en PRÉVISION dans la bonne clé (année comprise), sans toucher aux entrées existantes', () => {
    const table = { NOVEMBRE: [entry({ client: 'autre' })], JANVIER: [entry({ client: 'jan26' })] };
    const nov = applyRevenus(table, 2026, 10, pendingRevenus(rules, table, 2026, 10), rates);
    expect(nov.NOVEMBRE).toHaveLength(5);
    expect(nov.NOVEMBRE[0]).toBe(table.NOVEMBRE[0]);
    expect(nov.NOVEMBRE[1]).toMatchObject({ client: 'ZINRAI', cat: 'EDUCATEUR', status: 'preview', currency: 'USD', origAmount: 164, date: '2026-11-06', recur: 'z@2026-11-06' });
    expect(nov.NOVEMBRE[1].cashed).toBeCloseTo(164 / 1.15, 2);
    const jan = applyRevenus(table, 2027, 0, pendingRevenus(rules, table, 2027, 0), rates);
    expect(jan['JANVIER 27']).toHaveLength(5); // 5 vendredis en janvier 2027
    expect(jan.JANVIER).toBe(table.JANVIER);
    expect(table.NOVEMBRE).toHaveLength(1);
  });

  it('idempotent : ce qui est déjà dans la table n’est pas reproposé, même confirmé depuis', () => {
    const once = applyRevenus({}, 2026, 10, pendingRevenus(rules, {}, 2026, 10), rates);
    once.NOVEMBRE[0] = { ...once.NOVEMBRE[0], status: 'confirmed' };
    expect(pendingRevenus(rules, once, 2026, 10)).toEqual([]);
  });

  it('une prévision supprimée à la main est reproposée ; « ignorer » l’écarte pour de bon', () => {
    const once = applyRevenus({}, 2026, 10, pendingRevenus(rules, {}, 2026, 10), rates);
    const minus = { NOVEMBRE: once.NOVEMBRE.slice(1) };
    const again = pendingRevenus(rules, minus, 2026, 10);
    expect(again.map(o => o.date)).toEqual(['2026-11-06']);
    expect(pendingRevenus(skipOccurrences(rules, again), minus, 2026, 10)).toEqual([]);
  });
});
