import { describe, it, expect } from 'vitest';
import {
  monthRevenus, monthRevenuConfirmedEur, monthRevenuConfirmedAed,
  revenuAtRate, revenuLive, revenusMonthsLive, USD_AED_PEG,
  isFutureRevMonth, currentRevMonth,
} from '../utils';
import { mkMonth, entry } from './helpers';

describe('revenus confirmés d’un mois tracker', () => {
  it('ne compte que les entrées confirmées (ou sans statut = historiques)', () => {
    const m = mkMonth('MAI');
    const rev = {
      MAI: [
        entry({ cashed: 1000, rate: 4.1 }),
        entry({ cashed: 200, rate: 4.2, status: undefined as never }),
        entry({ cashed: 500, status: 'preview' }),
        entry({ cashed: 700, status: 'pending' }),
      ],
    };
    expect(monthRevenuConfirmedEur(m, rev)).toBe(1200);
    // AED = AED réellement crédité de CHAQUE entrée (cashed × son taux), pas EUR total × m.rate
    expect(monthRevenuConfirmedAed(m, rev, 4)).toBeCloseTo(1000 * 4.1 + 200 * 4.2, 6);
  });

  it('mois legacy : lit m.earn, jamais la table', () => {
    const m = mkMonth('JANVIER', { earn: 3000, rate: 4.3 });
    const rev = { JANVIER: [entry({ cashed: 999 })] };
    expect(monthRevenuConfirmedEur(m, rev)).toBe(3000);
    expect(monthRevenuConfirmedAed(m, rev, 4)).toBeCloseTo(12900, 6);
  });

  it('entrée sans taux : repli sur le taux fourni', () => {
    const m = mkMonth('MAI');
    expect(monthRevenuConfirmedAed(m, { MAI: [entry({ cashed: 100, rate: 0 })] }, 4.2)).toBeCloseTo(420, 6);
  });
});

describe('monthRevenus — entrées Revenus d’un mois tracker', () => {
  const rev = {
    OCTOBRE: [entry({ client: 'oct' })],
    MARS: [entry({ client: 'mars' })],
    'FÉVRIER': [entry({ client: 'fev' })],
  };

  it('clé exacte', () => {
    expect(monthRevenus(rev, 'MARS')[0].client).toBe('mars');
    expect(monthRevenus(rev, 'AVRIL')).toEqual([]);
    expect(monthRevenus(undefined, 'MARS')).toEqual([]);
  });

  it('mois suffixé dont l’homonyme est legacy → repli sur le nom de base', () => {
    expect(monthRevenus(rev, 'OCTOBRE 26')[0].client).toBe('oct');
  });

  it('mois suffixé dont l’homonyme N’EST PAS legacy → rien (sinon double comptage)', () => {
    expect(monthRevenus(rev, 'MARS 27')).toEqual([]);
  });
});

describe('revenuAtRate / revenuLive — prévisions au taux du jour', () => {
  it('EUR : l’EUR est fixe, seul le taux (donc l’AED) change', () => {
    const e = revenuAtRate(entry({ cashed: 1000, rate: 4.0 }), 4.3);
    expect(e.cashed).toBe(1000);
    expect(e.rate).toBe(4.3);
  });

  it('USD : l’AED est fixe (montant × taux de swap), l’EUR découle du taux via le peg', () => {
    const src = entry({ currency: 'USD', origAmount: 1613, origContracted: 1613, origToAed: 3.67, cashed: 1, contracted: 1, rate: 1 });
    const e = revenuAtRate(src, 4.25);
    const perEur = 4.25 / USD_AED_PEG;
    expect(e.cashed).toBeCloseTo(1613 / perEur, 2);
    expect(e.contracted).toBeCloseTo(1613 / perEur, 2);
    // cashed × rate redonne l'AED crédité exact (à l'arrondi du taux près)
    expect(e.cashed * e.rate).toBeCloseTo(1613 * 3.67, 1);
  });

  it('AED : l’AED est fixe, l’EUR en découle', () => {
    const e = revenuAtRate(entry({ currency: 'AED', origAmount: 4250, cashed: 1, rate: 1 }), 4.25);
    expect(e.cashed).toBe(1000);
    expect(e.cashed * e.rate).toBeCloseTo(4250, 2);
  });

  it('ancien format non-EUR sans montant d’origine, ou taux invalide : inchangé', () => {
    const old = entry({ currency: 'USD', cashed: 900, rate: 4.1 });
    expect(revenuAtRate(old, 4.25)).toBe(old);
    const e = entry();
    expect(revenuAtRate(e, 0)).toBe(e);
  });

  it('une entrée confirmée est figée ; prévision et en attente suivent le taux', () => {
    const confirmed = entry({ rate: 4.0 });
    expect(revenuLive(confirmed, 4.3)).toBe(confirmed);
    expect(revenuLive(entry({ rate: 4.0, status: 'preview' }), 4.3).rate).toBe(4.3);
    expect(revenuLive(entry({ rate: 4.0, status: 'pending' }), 4.3).rate).toBe(4.3);
  });

  it('revenusMonthsLive ne modifie jamais la table d’origine', () => {
    const src = { MAI: [entry({ rate: 4.0, status: 'preview' })] };
    const live = revenusMonthsLive(src, 4.3);
    expect(live.MAI[0].rate).toBe(4.3);
    expect(src.MAI[0].rate).toBe(4.0);
    expect(revenusMonthsLive(undefined, 4.3)).toEqual({});
  });
});

describe('mois calendaire courant / à venir (page Revenus)', () => {
  const sept = new Date(2026, 8, 15);
  it('atterrit sur le mois calendaire courant', () => {
    expect(currentRevMonth(sept)).toBe('SEPTEMBRE');
  });
  it('un mois postérieur au mois courant n’a pas commencé', () => {
    expect(isFutureRevMonth('OCTOBRE', sept)).toBe(true);
    expect(isFutureRevMonth('SEPTEMBRE', sept)).toBe(false);
    expect(isFutureRevMonth('JANVIER', sept)).toBe(false);
  });
});
