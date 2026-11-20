import { describe, it, expect } from 'vitest';
import { applyRegul, clearRegul, regulsNewestFirst, REGUL_CAP } from '../regul';
import { mkMonth } from './helpers';

describe('régularisation du prévisionnel', () => {
  const at = new Date('2026-11-20T08:00:00.000Z');

  it('ajustement = solde réel − prévisionnel hors ajustement, arrondi au centime', () => {
    const m = applyRegul(mkMonth('NOVEMBRE 26'), 96705.62, 96706, at);
    expect(m.adjustment).toBe(-0.38);
    expect(m.reguls).toEqual([{ ts: '2026-11-20T08:00:00.000Z', real: 96705.62, adjustment: -0.38 }]);
  });

  it('remplace l’ajustement précédent (il ne se cumule pas) et consigne chaque régul', () => {
    let m = applyRegul(mkMonth('MAI'), 1100, 1000, at);
    m = applyRegul(m, 950, 1000, new Date('2026-11-21T08:00:00.000Z'));
    expect(m.adjustment).toBe(-50);
    expect(m.reguls?.map(r => r.adjustment)).toEqual([100, -50]);
    expect(regulsNewestFirst(m).map(r => r.real)).toEqual([950, 1100]);
  });

  it('solde réel = calculé → pas d’ajustement, mais la régul est quand même consignée', () => {
    const m = applyRegul(mkMonth('MAI', { adjustment: 30 }), 1000, 1000, at);
    expect(m.adjustment).toBeUndefined();
    expect(m.reguls).toHaveLength(1);
  });

  it('ne modifie jamais le mois reçu', () => {
    const src = mkMonth('MAI', { adjustment: 12 });
    applyRegul(src, 500, 400, at);
    expect(src.adjustment).toBe(12);
    expect(src.reguls).toBeUndefined();
  });

  it('effacer l’ajustement conserve le journal', () => {
    const m = clearRegul(applyRegul(mkMonth('MAI'), 1100, 1000, at));
    expect(m.adjustment).toBeUndefined();
    expect(m.reguls).toHaveLength(1);
  });

  it('journal borné', () => {
    let m = mkMonth('MAI');
    for (let i = 0; i < REGUL_CAP + 5; i++) m = applyRegul(m, i, 0, new Date(2026, 0, 1, 0, i));
    expect(m.reguls).toHaveLength(REGUL_CAP);
    expect(m.reguls?.[m.reguls.length - 1].real).toBe(REGUL_CAP + 4);
  });

  it('regulsNewestFirst tolère un mois absent', () => {
    expect(regulsNewestFirst(undefined)).toEqual([]);
  });
});
