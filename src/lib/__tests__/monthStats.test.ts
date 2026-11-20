import { describe, it, expect } from 'vitest';
import { computeMonthStats, groupByMerchant } from '../monthStats';
import { POSTES, mkMonth, tx } from './helpers';

describe('computeMonthStats', () => {
  it('mois sans transaction → stats vides', () => {
    const st = computeMonthStats(mkMonth('MAI'), POSTES);
    expect(st.txnCount).toBe(0);
    expect(st.biggest).toBeNull();
    expect(st.topMerchants).toEqual([]);
  });

  it('totaux, extrêmes, jour et poste les plus dépensiers', () => {
    const m = mkMonth('MAI', {
      actual: [
        { aed: 0, eur: 0, txns: [tx(100, { label: 'Carrefour', date: '2026-05-02' }), tx(60, { label: 'carrefour ', date: '2026-05-03' }), tx(0, { label: 'vide' })] },
        { aed: 0, eur: 0, txns: [tx(4000, { label: 'Loyer', date: '2026-05-01' })] },
        { aed: 0, eur: null },
      ],
    });
    const st = computeMonthStats(m, POSTES);
    expect(st.txnCount).toBe(3); // la tx à 0 est ignorée
    expect(st.totalTxnAed).toBe(4160);
    expect(st.totalTxnEur).toBe(1040);
    expect(st.biggest?.label).toBe('Loyer');
    expect(st.smallest?.amount).toBe(60);
    expect(st.biggestDay).toEqual({ date: '2026-05-01', totalAed: 4000, count: 1 });
    expect(st.topPoste).toEqual({ name: 'LOYER', totalAed: 4000, count: 1 });
  });
});

describe('groupByMerchant — regroupement approximatif des libellés', () => {
  const t = (label: string, amount: number) => ({ ...tx(amount, { label }), posteName: 'COURSES', posteIdx: 0 });

  it('fusionne casse, accents, espaces et fautes de frappe proches', () => {
    const g = groupByMerchant([t('Carrefour', 100), t('CARREFOUR', 50), t('Carefour', 25), t('Uber', 30)]);
    expect(g).toHaveLength(2);
    expect(g[0].totalAed).toBe(175);
    expect(g[0].count).toBe(3);
    expect(g[0].variants).toEqual(['Carrefour', 'CARREFOUR', 'Carefour']);
    expect(g[1].label).toBe('Uber');
  });

  it('ignore les libellés vides ou « --- »', () => {
    expect(groupByMerchant([t('', 10), t('---', 10), t('  ', 10)])).toEqual([]);
  });
});
