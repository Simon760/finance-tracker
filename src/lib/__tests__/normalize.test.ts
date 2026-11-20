import { describe, it, expect } from 'vitest';
import { normalizeLoadedState, dedupEmptyExtras, looksLikeBackup } from '../normalize';
import { AppState } from '../types';
import { mkMonth, extra, tx } from './helpers';

describe('normalizeLoadedState', () => {
  it('complète les champs manquants par leurs défauts', () => {
    const s = normalizeLoadedState({ rate: 4.2 } as AppState);
    expect(s.postes.length).toBeGreaterThan(0);
    expect(s.months).toEqual([]);
    expect(s.revenus).toEqual({ objectif: 5000, categories: [], months: {} });
    expect(s.emmenagement).toEqual([]);
  });

  it('ne touche pas aux données présentes', () => {
    const months = [mkMonth('MAI', { extraActual: [extra('CADEAU', 100, 25)] })];
    const src = { rate: 4.2, postes: [], months, revenus: { objectif: 1, categories: ['A'], months: { MAI: [] } }, emmenagement: [] } as AppState;
    const snap = JSON.stringify(src);
    expect(JSON.stringify(normalizeLoadedState(src))).toBe(snap);
  });
});

describe('dedupEmptyExtras', () => {
  it('retire un doublon VIDE, garde l’original et tout ce qui porte un montant ou des transactions', () => {
    const m = mkMonth('MAI', {
      extraActual: [extra('AUTRE', 100, 25), extra('autre ', 0, 0), extra('AUTRE', 0, 0, [tx(5)]), extra('VIDE', 0, 0)],
    });
    const [out] = dedupEmptyExtras([m]);
    expect(out.extraActual.map(r => [r.name, r.aed, (r.txns || []).length])).toEqual([['AUTRE', 100, 0], ['AUTRE', 0, 1], ['VIDE', 0, 0]]);
  });

  it('rien à retirer → même tableau (pas de réécriture inutile)', () => {
    const ms = [mkMonth('MAI', { extraActual: [extra('A', 1, 1), extra('B', 0, 0)] })];
    expect(dedupEmptyExtras(ms)).toBe(ms);
  });
});

describe('looksLikeBackup — garde-fou de l’import', () => {
  it('accepte un état avec des mois ou des spaces', () => {
    expect(looksLikeBackup({ months: [] })).toBe(true);
    expect(looksLikeBackup({ spaces: [{ id: 'dubai' }] })).toBe(true);
  });
  it('refuse tout le reste (un JSON valide quelconque vidait l’app)', () => {
    expect(looksLikeBackup({})).toBe(false);
    expect(looksLikeBackup([])).toBe(false);
    expect(looksLikeBackup(null)).toBe(false);
    expect(looksLikeBackup('texte')).toBe(false);
    expect(looksLikeBackup({ spaces: [] })).toBe(false);
  });
});
