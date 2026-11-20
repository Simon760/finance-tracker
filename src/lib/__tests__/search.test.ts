import { describe, it, expect } from 'vitest';
import { searchAll } from '../search';
import { POSTES, mkMonth, tx, entry, extra } from './helpers';

const state = () => ({
  postes: POSTES,
  months: [
    mkMonth('OCTOBRE 26', {
      actual: [
        { aed: 0, eur: 0, txns: [tx(1196, { label: 'Carrefour Marina', date: '2026-10-03' }), tx(45.5, { label: 'Épicerie', date: '2026-10-09' })] },
        { aed: 6500, eur: 1600 },                 // LOYER : montant saisi sans transaction
        { aed: 0, eur: null },
      ],
      extraActual: [extra('CADEAU', 400, 100, [tx(400, { label: 'Anniversaire Léa', date: '2026-10-20' })])],
    }),
    mkMonth('NOVEMBRE 26', {
      actual: [
        { aed: 0, eur: 0, txns: [tx(88, { label: 'CARREFOUR', date: '2026-11-02' }), tx(80, { label: 'Resto Paris', date: '2026-11-04', tripId: 't', tripKind: 'expense' })] },
        { aed: 0, eur: null }, { aed: 0, eur: null },
      ],
    }),
  ],
  revenus: {
    objectif: 0, categories: [],
    months: {
      OCTOBRE: [entry({ client: 'ZINRAI', cat: 'EDUCATEUR', cashed: 150, rate: 4, date: '2026-10-15' })],
      'JANVIER 27': [entry({ client: 'Zinrai', cat: 'EDUCATEUR', cashed: 200, rate: 4, date: '2027-01-08', status: 'preview' as const })],
    },
  },
});

describe('searchAll — recherche globale', () => {
  it('requête vide → rien', () => {
    expect(searchAll(state(), '   ').total).toBe(0);
  });

  it('insensible à la casse et aux accents, tous mois confondus, du plus récent au plus ancien', () => {
    const r = searchAll(state(), 'carrefour');
    expect(r.hits.map(h => [h.monthLabel, h.label])).toEqual([['NOVEMBRE 26', 'CARREFOUR'], ['OCTOBRE 26', 'Carrefour Marina']]);
    expect(r.expenses).toEqual({ count: 2, aed: 1284, eur: 321 });
    expect(searchAll(state(), 'epicerie').total).toBe(1);
    expect(searchAll(state(), 'lea').hits[0].context).toBe('CADEAU');
  });

  it('plusieurs mots : tous doivent correspondre', () => {
    expect(searchAll(state(), 'carrefour novembre').total).toBe(1);
    expect(searchAll(state(), 'carrefour loyer').total).toBe(0);
  });

  it('par poste : inclut un montant saisi sans transaction', () => {
    const r = searchAll(state(), 'loyer');
    expect(r.total).toBe(1);
    expect(r.hits[0]).toMatchObject({ context: 'LOYER', aed: 6500, eur: 1600, date: '', label: '' });
  });

  it('par montant : entier → partie entière ; décimal → exact', () => {
    expect(searchAll(state(), '1196').hits.map(h => h.label)).toEqual(['Carrefour Marina']);
    expect(searchAll(state(), '45,5').hits.map(h => h.label)).toEqual(['Épicerie']);
    expect(searchAll(state(), '45').hits.map(h => h.label)).toEqual(['Épicerie']);
    expect(searchAll(state(), '45,4').total).toBe(0);
  });

  it('revenus : par client, avec leur période et la page à ouvrir', () => {
    const r = searchAll(state(), 'zinrai');
    expect(r.revenues.count).toBe(2);
    expect(r.revenues.eur).toBe(350);
    expect(r.hits[0]).toMatchObject({ kind: 'revenue', monthLabel: 'JANVIER 2027', status: 'preview', target: { page: 'revenus', year: 2027, month: 'JANVIER' } });
    expect(r.hits[1].target).toEqual({ page: 'revenus', year: 2026, month: 'OCTOBRE' });
    expect(searchAll(state(), 'zinrai prevision').total).toBe(1);
  });

  it('une dépense de voyage est signalée ; un résultat de dépense ouvre son mois du tracker', () => {
    const h = searchAll(state(), 'resto').hits[0];
    expect(h.trip).toBe(true);
    expect(h.target).toEqual({ page: 'tracker', monthId: 'NOVEMBRE 26' });
  });

  it('liste tronquée, totaux complets', () => {
    const r = searchAll(state(), '2026', 2);
    expect(r.hits).toHaveLength(2);
    expect(r.total).toBeGreaterThan(2);
    expect(r.expenses.count + r.revenues.count).toBe(r.total);
  });
});
