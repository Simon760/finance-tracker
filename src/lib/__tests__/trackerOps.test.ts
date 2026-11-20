import { describe, it, expect } from 'vitest';
import {
  saveTxn, removeTxn, removeTxnExtra, setBudget, setExtraBudget, setActual, hidePoste, addCustomRow, removeExtraByName,
} from '../trackerOps';
import { AppState } from '../types';
import { POSTES, mkMonth, tx, extra } from './helpers';

const base = (over: Partial<AppState> = {}): AppState => ({
  rate: 4, postes: POSTES.map(p => ({ ...p })), months: [mkMonth('MAI'), mkMonth('JUIN')],
  revenus: { objectif: 0, categories: [], months: {} }, emmenagement: [], ...over,
});
const form = (amount: number, over = {}) => ({ label: 'Carrefour', amount, currency: 'AED' as const, date: '2026-05-12', ...over });
const mai = (s: AppState) => s.months[0];

describe('saveTxn', () => {
  it('ajoute au poste régulier : montant en devise locale au taux du JOUR, deux devises recalculées', () => {
    const r = saveTxn(base(), 'MAI', { posteIdx: 0 }, form(100), { posteIdx: 0 }, '2026-05-20')!;
    const row = mai(r.state).actual[0];
    expect(row.txns).toHaveLength(1);
    expect(row.txns![0]).toMatchObject({ label: 'Carrefour', amount: 100, eur: 25, rate: 4, currency: 'AED', originalAmount: 100, date: '2026-05-12' });
    expect([row.aed, row.eur]).toEqual([100, 25]);
    expect(r.state.months[1].actual[0].txns).toBeUndefined(); // autre mois non touché
  });

  it('édition : les marqueurs voyage / récurrence de la transaction sont conservés', () => {
    const s = base({ months: [mkMonth('MAI', { actual: [{ aed: 100, eur: 25, txns: [tx(100, { tripId: 't1', tripKind: 'expense', recur: 'r1@2026-05-01' })] }, { aed: 0, eur: null }, { aed: 0, eur: null }] })] });
    const r = saveTxn(s, 'MAI', { posteIdx: 0, editIdx: 0 }, form(120), { posteIdx: 0 }, '2026-05-20')!;
    expect(mai(r.state).actual[0].txns![0]).toMatchObject({ amount: 120, tripId: 't1', tripKind: 'expense', recur: 'r1@2026-05-01' });
  });

  it('saisie en EUR : amount converti UNE fois, originalAmount garde le montant saisi', () => {
    const r = saveTxn(base(), 'MAI', { posteIdx: 2 }, form(50, { currency: 'EUR' }), { posteIdx: 2 }, '2026-05-20')!;
    const row = mai(r.state).actual[2];
    expect(row.txns![0]).toMatchObject({ amount: 200, eur: 50, originalAmount: 50, currency: 'EUR' });
    expect([row.aed, row.eur]).toEqual([200, 50]); // les deux devises, même pour un poste EUR
  });

  it('refuse un montant nul ou un mois inconnu', () => {
    expect(saveTxn(base(), 'MAI', { posteIdx: 0 }, form(0), { posteIdx: 0 }, '2026-05-20')).toBeNull();
    expect(saveTxn(base(), 'ZZZ', { posteIdx: 0 }, form(10), { posteIdx: 0 }, '2026-05-20')).toBeNull();
  });

  it('édition sur place puis déplacement vers un autre poste (journalisé)', () => {
    const s = base({ months: [mkMonth('MAI', { actual: [{ aed: 300, eur: 75, txns: [tx(100), tx(200)] }, { aed: 0, eur: null }, { aed: 0, eur: null }] })] });
    const edited = saveTxn(s, 'MAI', { posteIdx: 0, editIdx: 1 }, form(240), { posteIdx: 0 }, '2026-05-20')!;
    expect(mai(edited.state).actual[0].txns!.map(t => t.amount)).toEqual([100, 240]);
    expect(mai(edited.state).actual[0].aed).toBe(340);

    const moved = saveTxn(s, 'MAI', { posteIdx: 0, editIdx: 1 }, form(200), { posteIdx: 1 }, '2026-05-20')!;
    expect(mai(moved.state).actual[0].txns!.map(t => t.amount)).toEqual([100]);
    expect(mai(moved.state).actual[0].aed).toBe(100);
    expect(mai(moved.state).actual[1].txns!.map(t => t.amount)).toEqual([200]);
    expect(moved.logs.map(l => l.action)).toEqual(['txn.move']);
  });

  it('nouveau poste « ce mois » → poste ponctuel + ligne miroir au budget, sans doublon de nom', () => {
    const create = { name: ' cadeau ', cat: 'lifestyle' as const, isAed: true, scope: 'month' as const };
    const a = saveTxn(base(), 'MAI', { posteIdx: 0 }, form(80), { posteIdx: 0, create }, '2026-05-20')!;
    expect(a.state.postes).toHaveLength(3); // aucun poste global créé
    expect(mai(a.state).extraActual).toMatchObject([{ name: 'CADEAU', aed: 80, eur: 20 }]);
    expect(mai(a.state).extraBudget).toMatchObject([{ name: 'CADEAU', aed: 0, eur: 0 }]);
    const b = saveTxn(a.state, 'MAI', { posteIdx: 0 }, form(20), { posteIdx: 0, create: { ...create, name: 'CADEAU' } }, '2026-05-20')!;
    expect(mai(b.state).extraActual).toHaveLength(1);
    expect(mai(b.state).extraActual[0].aed).toBe(100);
    expect(mai(b.state).extraBudget).toHaveLength(1);
  });

  it('nouveau poste permanent : ajouté en FIN de liste, la transaction va sur sa ligne', () => {
    const create = { name: 'sport', cat: 'lifestyle' as const, isAed: true, scope: 'permanent' as const };
    const r = saveTxn(base(), 'MAI', { posteIdx: 0 }, form(60), { posteIdx: 0, create }, '2026-05-20')!;
    expect(r.state.postes.map(p => p.name)).toEqual(['COURSES', 'LOYER', 'CHARGES FRANCE', 'SPORT']);
    expect(mai(r.state).actual[3].aed).toBe(60);
    expect(mai(r.state).actual[0].txns).toBeUndefined();
    expect(r.logs[0].action).toBe('poste.create');
  });

  it('poste ponctuel : ajout sur place, puis déplacement vers un poste régulier', () => {
    const s = base({ months: [mkMonth('MAI', { extraActual: [extra('CADEAU', 50, 12.5, [tx(50)])] })] });
    const add = saveTxn(s, 'MAI', { posteIdx: -1, isExtra: true, extraIdx: 0 }, form(30), { posteIdx: -1 }, '2026-05-20')!;
    expect(mai(add.state).extraActual[0].aed).toBe(80);
    const move = saveTxn(s, 'MAI', { posteIdx: -1, isExtra: true, extraIdx: 0, editIdx: 0 }, form(50), { posteIdx: 1 }, '2026-05-20')!;
    expect(mai(move.state).extraActual[0].txns).toEqual([]);
    expect(mai(move.state).extraActual[0].aed).toBe(0);
    expect(mai(move.state).actual[1].aed).toBe(50);
    expect(move.logs[0].detail).toContain('CADEAU → LOYER');
  });
});

describe('suppression de transactions', () => {
  it('poste régulier : totaux recalculés ; ligne vidée → 0 / null (poste AED) ou 0 / 0 (poste EUR)', () => {
    const s = base({ months: [mkMonth('MAI', { actual: [{ aed: 300, eur: 75, txns: [tx(100), tx(200)] }, { aed: 0, eur: null }, { aed: 40, eur: 10, txns: [tx(40)] }] })] });
    const one = removeTxn(s, 'MAI', 0, 0);
    expect([mai(one).actual[0].aed, mai(one).actual[0].eur]).toEqual([200, 50]);
    const none = removeTxn(one, 'MAI', 0, 0);
    expect([mai(none).actual[0].aed, mai(none).actual[0].eur]).toEqual([0, null]);
    const eur = removeTxn(s, 'MAI', 2, 0);
    expect([mai(eur).actual[2].aed, mai(eur).actual[2].eur]).toEqual([0, 0]);
  });

  it('poste ponctuel', () => {
    const s = base({ months: [mkMonth('MAI', { extraActual: [extra('CADEAU', 150, 37.5, [tx(50), tx(100)])] })] });
    const r = removeTxnExtra(s, 'MAI', 0, 1);
    expect(mai(r).extraActual[0]).toMatchObject({ aed: 50, eur: 12.5 });
  });
});

describe('budget et réel saisis à la main', () => {
  it('la devise SAISIE devient la référence du poste, l’autre suit le taux', () => {
    const aed = setBudget(base(), 'MAI', 0, 800, false, 4);
    expect(mai(aed.state).budget[0]).toEqual({ aed: 800, eur: 200 });
    expect(aed.state.postes[0].isAed).toBe(true);
    expect(aed.logs).toEqual([]);
    const eur = setBudget(base(), 'MAI', 0, 150, true, 4);
    expect(mai(eur.state).budget[0]).toEqual({ aed: 600, eur: 150 });
    expect(eur.state.postes[0].isAed).toBe(false); // bascule journalisée
    expect(eur.logs[0].action).toBe('poste.update');
  });

  it('poste ponctuel : une seule devise stockée', () => {
    const s = base({ months: [mkMonth('MAI', { extraBudget: [extra('CADEAU', 0, 0)] })] });
    expect(mai(setExtraBudget(s, 'MAI', 0, 90, true)).extraBudget[0]).toMatchObject({ eur: 90, aed: 0 });
    expect(mai(setExtraBudget(s, 'MAI', 0, 400, false)).extraBudget[0]).toMatchObject({ eur: 0, aed: 400 });
  });

  it('réel sans transaction', () => {
    expect(mai(setActual(base(), 'MAI', 1, 9500, false)).actual[1]).toEqual({ aed: 9500, eur: null });
    expect(mai(setActual(base(), 'MAI', 2, 120, true)).actual[2]).toEqual({ aed: 0, eur: 120 });
  });
});

describe('postes', () => {
  it('masquer : ce mois seulement, une seule fois', () => {
    const a = hidePoste(base(), 'MAI', 'LOYER');
    expect(mai(a.state).hiddenPostes).toEqual(['LOYER']);
    expect(a.state.months[1].hiddenPostes).toBeUndefined();
    const b = hidePoste(a.state, 'MAI', 'LOYER');
    expect(b.state).toBe(a.state);
    expect(b.logs).toEqual([]);
  });

  it('ajouter un poste permanent : fin de liste, valeur du mois posée, lignes alignées', () => {
    const r = addCustomRow(base(), 'MAI', { section: 'budget', name: 'sport', cat: 'lifestyle', aed: 300, eur: 0, scope: 'permanent', isAed: true });
    expect(r.state.postes.map(p => p.name)).toEqual(['COURSES', 'LOYER', 'CHARGES FRANCE', 'SPORT']);
    expect(mai(r.state).budget[3]).toEqual({ aed: 300, eur: null });
    expect(mai(r.state).actual[3]).toEqual({ aed: 0, eur: null });
    expect(mai(r.state).budget.slice(0, 3)).toEqual(base().months[0].budget); // rien n'a glissé
  });

  it('ajouter un poste ponctuel : budget → ligne budget + ligne réel vide ; réel → ligne réel', () => {
    const b = addCustomRow(base(), 'MAI', { section: 'budget', name: 'cadeau', cat: 'lifestyle', aed: 200, eur: 50, scope: 'month', isAed: true });
    expect(mai(b.state).extraBudget).toMatchObject([{ name: 'CADEAU', aed: 200, eur: 50 }]);
    expect(mai(b.state).extraActual).toMatchObject([{ name: 'CADEAU', aed: 0, eur: 0 }]);
    const a = addCustomRow(base(), 'MAI', { section: 'actual', name: '', cat: 'vital', aed: 70, eur: 0, scope: 'month', isAed: true });
    expect(mai(a.state).extraActual).toMatchObject([{ name: 'AUTRE', aed: 70 }]);
    expect(mai(a.state).extraBudget).toEqual([]);
  });

  it('supprimer un ponctuel par nom : réel et budget, insensible à la casse', () => {
    const s = base({ months: [mkMonth('MAI', { extraActual: [extra('CADEAU', 50, 12.5), extra('TAXI', 10, 2.5)], extraBudget: [extra('Cadeau ', 0, 0)] })] });
    const r = removeExtraByName(s, 'MAI', 'cadeau');
    expect(mai(r).extraActual.map(x => x.name)).toEqual(['TAXI']);
    expect(mai(r).extraBudget).toEqual([]);
  });
});
