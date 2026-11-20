import { describe, it, expect } from 'vitest';
import { revAnnualStats } from '../revenusStats';
import { entry } from './helpers';

const today = '2026-09-15';
const isFuture = (m: string) => ['OCTOBRE', 'NOVEMBRE', 'DÉCEMBRE'].includes(m);
const view = {
  JANVIER: [entry({ date: '2026-01-10', cashed: 1000, contracted: 1200, client: 'ACME', cat: 'CONSULTING' })],
  MARS: [entry({ date: '2026-03-05', cashed: 3000, contracted: 3000, client: 'ACME' }), entry({ date: '2026-03-20', cashed: 500, client: 'BETA', cat: 'AFFI' })],
  SEPTEMBRE: [
    entry({ date: '2026-09-10', cashed: 2000, client: 'BETA', cat: 'AFFI' }),
    entry({ date: '2026-09-25', cashed: 900, client: 'ACME' }),               // daté après aujourd'hui
    entry({ date: '2026-09-12', cashed: 700, status: 'preview', client: 'ACME' }), // prévision
  ],
  OCTOBRE: [entry({ date: '2026-10-03', cashed: 5000, client: 'GAMMA' })],    // mois pas commencé
};

describe('revAnnualStats', () => {
  const A = revAnnualStats(view, isFuture, 2000, today);

  it('totaux : confirmés seulement, arrêtés à aujourd’hui, mois à venir exclus', () => {
    expect(A.yearCashed).toBe(1000 + 3500 + 2000);
    expect(A.yearObj).toBe(24000);
    expect(A.activeMonths).toBe(3);
    expect(A.avg).toBeCloseTo(6500 / 3);
    expect(A.yearPL).toBe(6500 - 24000);
    expect(A.futureWithData).toEqual(['OCTOBRE']);
  });

  it('par mois : écart à l’objectif et variation contre le dernier mois AVEC données', () => {
    const by = Object.fromEntries(A.monthData.map(m => [m.name, m]));
    expect(by.JANVIER).toMatchObject({ cashed: 1000, delta: -1000, vsM1: null, hasData: true, future: false });
    expect(by['FÉVRIER']).toMatchObject({ cashed: 0, hasData: false });
    expect(by.MARS.vsM1).toBe(2500);       // contre janvier (février est vide)
    expect(by.SEPTEMBRE.cashed).toBe(2000); // ni l'entrée du 25, ni la prévision
    expect(by.OCTOBRE).toMatchObject({ future: true, hasData: true, vsM1: null });
  });

  it('trimestres, catégories et clients', () => {
    expect(A.qData.map(q => q.Encaissé)).toEqual([4500, 0, 2000, 0]);
    expect(A.qObj).toBe(6000);
    expect(A.srcEntries).toEqual([['CONSULTING', 4000], ['AFFI', 2500]]);
    expect(A.clientStats.map(c => [c.client, c.total, c.count, c.monthsActive])).toEqual([['ACME', 4000, 2, 2], ['BETA', 2500, 2, 2]]);
    expect(A.topClient.client).toBe('ACME');
    expect(A.clientStats[0].pctOfYear).toBeCloseTo((4000 / 6500) * 100);
  });
});
