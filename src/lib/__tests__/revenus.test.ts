import { describe, it, expect } from 'vitest';
import {
  monthRevenus, monthRevenuConfirmedEur, monthRevenuConfirmedAed,
  revenuAtRate, revenuLive, revenusMonthsLive, USD_AED_PEG,
  isFutureRevMonth, currentRevMonth,
  revKey, revKeyPeriod, resolveRevKey, revYearView, revYears, monthPeriod, isLegacyMonth,
  buildRevenuEntry, revenuToForm, addRevenu, removeRevenu, updateRevenu, confirmRevenu,
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

describe('table Revenus indexée par période (année + mois)', () => {
  it('clé de stockage : nom seul pour 2026, nom + année sinon', () => {
    expect(revKey(2026, 9)).toBe('OCTOBRE');
    expect(revKey(2027, 0)).toBe('JANVIER 27');
    expect(revKey(2025, 11)).toBe('DÉCEMBRE 25');
  });

  it('période d’une clé — accents et suffixe 2 ou 4 chiffres tolérés', () => {
    expect(revKeyPeriod('OCTOBRE')).toEqual({ year: 2026, idx: 9 });
    expect(revKeyPeriod('FEVRIER')).toEqual({ year: 2026, idx: 1 });
    expect(revKeyPeriod('JANVIER 27')).toEqual({ year: 2027, idx: 0 });
    expect(revKeyPeriod('JANVIER 2027')).toEqual({ year: 2027, idx: 0 });
    expect(revKeyPeriod('VACANCES')).toBeNull();
  });

  it('resolveRevKey réutilise la clé existante (même mal accentuée), sinon la canonique', () => {
    expect(resolveRevKey({ FEVRIER: [entry()] }, 2026, 1)).toBe('FEVRIER');
    expect(resolveRevKey({ 'JANVIER 2027': [entry()] }, 2027, 0)).toBe('JANVIER 2027');
    expect(resolveRevKey({}, 2026, 1)).toBe('FÉVRIER');
    expect(resolveRevKey(undefined, 2027, 2)).toBe('MARS 27');
  });

  it('revYearView : 2026 et 2027 ne se mélangent jamais', () => {
    const table = {
      JANVIER: [entry({ client: 'jan26' })],
      'JANVIER 27': [entry({ client: 'jan27' })],
      MARS: [entry({ client: 'mars26' })],
    };
    expect(Object.keys(revYearView(table, 2026))).toEqual(['JANVIER', 'MARS']);
    expect(revYearView(table, 2026).JANVIER[0].client).toBe('jan26');
    expect(revYearView(table, 2027)).toEqual({ JANVIER: [entry({ client: 'jan27' })] });
    expect(revYearView(table, 2028)).toEqual({});
    expect(revYearView(undefined, 2026)).toEqual({});
  });

  it('revYears : années avec données + année en cours (+ suivante à partir d’octobre)', () => {
    const table = { MARS: [entry()], 'JANVIER 27': [], 'MAI 25': [entry()] };
    expect(revYears(table, new Date(2026, 4, 1))).toEqual([2025, 2026]);
    expect(revYears(table, new Date(2026, 10, 20))).toEqual([2025, 2026, 2027]);
    expect(revYears(undefined, new Date(2027, 0, 5))).toEqual([2027]);
  });
});

describe('période d’un mois tracker et mois legacy', () => {
  const withYear = (id: string, year?: number) => mkMonth(id, year ? { _year: year } : {});

  it('monthPeriod : _year, à défaut le suffixe ; inconnu → null', () => {
    expect(monthPeriod(withYear('OCTOBRE', 2025))).toEqual({ year: 2025, idx: 9 });
    expect(monthPeriod(withYear('OCTOBRE 26'))).toEqual({ year: 2026, idx: 9 });
    expect(monthPeriod(withYear('OCTOBRE'))).toBeNull();
    expect(monthPeriod(withYear('VACANCES', 2026))).toBeNull();
  });

  it('legacy = octobre 2025 → février 2026, par PÉRIODE et plus par nom', () => {
    expect(isLegacyMonth(withYear('OCTOBRE', 2025))).toBe(true);
    expect(isLegacyMonth(withYear('FEVRIER', 2026))).toBe(true);
    expect(isLegacyMonth(withYear('MARS', 2026))).toBe(false);
    expect(isLegacyMonth(withYear('OCTOBRE 26', 2026))).toBe(false);
    // Le bug : « DÉCEMBRE » 2026 était pris pour le DECEMBRE 2025 (comparaison sans accent)
    expect(isLegacyMonth(withYear('DÉCEMBRE', 2026))).toBe(false);
    expect(isLegacyMonth(withYear('JANVIER 27', 2027))).toBe(false);
  });

  it('année inconnue → ancien critère par nom', () => {
    expect(isLegacyMonth(withYear('JANVIER'))).toBe(true);
    expect(isLegacyMonth(withYear('MAI'))).toBe(false);
  });
});

describe('monthRevenus — entrées Revenus d’un mois tracker', () => {
  const rev = {
    OCTOBRE: [entry({ client: 'oct26' })],
    MARS: [entry({ client: 'mars26' })],
    JANVIER: [entry({ client: 'jan26' })],
    'JANVIER 27': [entry({ client: 'jan27' })],
    'DÉCEMBRE': [entry({ client: 'dec26' })],
  };
  const m = (id: string, year: number) => mkMonth(id, { _year: year });

  it('résout par période calendaire, quel que soit l’id du mois', () => {
    expect(monthRevenus(rev, m('MARS', 2026))[0].client).toBe('mars26');
    expect(monthRevenus(rev, m('OCTOBRE 26', 2026))[0].client).toBe('oct26');
    expect(monthRevenus(rev, m('DÉCEMBRE', 2026))[0].client).toBe('dec26');
    expect(monthRevenus(rev, m('AVRIL', 2026))).toEqual([]);
    expect(monthRevenus(undefined, m('MARS', 2026))).toEqual([]);
  });

  it('janvier 2027 ne lit PAS les revenus de janvier 2026', () => {
    expect(monthRevenus(rev, m('JANVIER 27', 2027)).map(e => e.client)).toEqual(['jan27']);
    expect(monthRevenus(rev, m('MARS 27', 2027))).toEqual([]);
  });

  it('octobre 2025 ne lit pas la clé « OCTOBRE » (qui est 2026)', () => {
    expect(monthRevenus(rev, m('OCTOBRE', 2025))).toEqual([]);
  });

  it('nom libre ou année inconnue → clé exacte', () => {
    expect(monthRevenus({ VACANCES: [entry({ client: 'v' })] }, mkMonth('VACANCES'))[0].client).toBe('v');
    expect(monthRevenus(rev, mkMonth('MARS'))[0].client).toBe('mars26');
  });

  it('décembre 2026 : ses revenus confirmés viennent de la table, pas de m.earn', () => {
    const dec = mkMonth('DÉCEMBRE', { _year: 2026, earn: 0 });
    expect(monthRevenuConfirmedEur(dec, { 'DÉCEMBRE': [entry({ cashed: 1500 })] })).toBe(1500);
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
    expect(isFutureRevMonth('OCTOBRE', 2026, sept)).toBe(true);
    expect(isFutureRevMonth('SEPTEMBRE', 2026, sept)).toBe(false);
    expect(isFutureRevMonth('JANVIER', 2026, sept)).toBe(false);
  });
  it('une année passée compte en entier, une année future pas du tout', () => {
    const jan27 = new Date(2027, 0, 10);
    expect(isFutureRevMonth('DÉCEMBRE', 2026, jan27)).toBe(false);
    expect(isFutureRevMonth('JANVIER', 2027, jan27)).toBe(false);
    expect(isFutureRevMonth('FÉVRIER', 2027, jan27)).toBe(true);
    expect(isFutureRevMonth('JANVIER', 2027, sept)).toBe(true);
  });
});

describe('saisie — formulaire → entrée stockée', () => {
  const rates = { liveRate: 4.25, usdRate: 1.15 };

  it('EUR : montants inchangés, rate = taux EUR/AED du formulaire', () => {
    const e = buildRevenuEntry(entry({ currency: 'EUR', cashed: 1000, contracted: 1200, rate: 4.2 }), rates);
    expect(e.cashed).toBe(1000);
    expect(e.contracted).toBe(1200);
    expect(e.rate).toBe(4.2);
    expect(e.origAmount).toBeUndefined();
    expect(e.origRate).toBeUndefined();
  });

  it('USD : EUR = montant ÷ EUR/USD ; AED crédité = montant × taux de swap', () => {
    const e = buildRevenuEntry(entry({ currency: 'USD', cashed: 1150, contracted: 1150, origRate: 1.15, origToAed: 3.67 }), rates);
    expect(e.cashed).toBe(1000);
    expect(e.origAmount).toBe(1150);
    expect(e.origToAed).toBe(3.67);
    expect(e.cashed * e.rate).toBeCloseTo(1150 * 3.67, 2);
  });

  it('USD sans taux de swap saisi : peg officiel', () => {
    const e = buildRevenuEntry(entry({ currency: 'USD', cashed: 1150, contracted: 0 }), rates);
    expect(e.origToAed).toBe(USD_AED_PEG);
    expect(e.origRate).toBe(1.15);
  });

  it('AED : l’AED saisi est l’AED crédité', () => {
    const e = buildRevenuEntry(entry({ currency: 'AED', cashed: 4250, contracted: 4250, rate: 4.25 }), rates);
    expect(e.cashed).toBe(1000);
    expect(e.cashed * e.rate).toBeCloseTo(4250, 2);
  });

  it('éditer puis sauvegarder sans rien changer est neutre', () => {
    const stored = buildRevenuEntry(entry({ currency: 'USD', cashed: 1613, contracted: 1613, origRate: 1.14826, origToAed: 3.6725 }), rates);
    const again = buildRevenuEntry(revenuToForm(stored), rates);
    expect(again).toEqual(stored);
    const eur = buildRevenuEntry(entry({ currency: 'EUR', cashed: 933.62, rate: 4.109 }), rates);
    expect(buildRevenuEntry(revenuToForm(eur), rates)).toEqual(eur);
  });
});

describe('écritures dans la table Revenus (sans jamais modifier l’originale)', () => {
  const table = () => ({ MAI: [entry({ client: 'a', date: '2026-05-08' }), entry({ client: 'b', status: 'preview' as const, rate: 4.0 })] });

  it('addRevenu : ajoute, crée la clé au besoin', () => {
    const src = table();
    const r = addRevenu(src, 'JUIN', entry({ client: 'c' }));
    expect(r.added).toBe(1);
    expect(r.months.JUIN.map(e => e.client)).toEqual(['c']);
    expect(r.months.MAI).toBe(src.MAI);
    expect(src).toEqual(table());
  });

  it('addRevenu : récurrence hebdo, sans doublonner une entrée déjà présente', () => {
    const e = entry({ client: 'a', date: '2026-05-01' });
    const r = addRevenu(table(), 'MAI', e, ['2026-05-08', '2026-05-15']);
    // le 08/05 existe déjà pour ce client et ce montant → non recréé
    expect(r.added).toBe(2);
    expect(r.months.MAI.map(x => x.date)).toEqual(['2026-05-08', '2026-05-10', '2026-05-01', '2026-05-15']);
  });

  it('removeRevenu : retire l’entrée ; la clé disparaît quand elle est vide', () => {
    const src = table();
    expect(removeRevenu(src, 'MAI', 0).MAI.map(e => e.client)).toEqual(['b']);
    expect('MAI' in removeRevenu({ MAI: [entry()] }, 'MAI', 0)).toBe(false);
    expect(src).toEqual(table());
  });

  it('updateRevenu : remplace en place, ou déplace vers une autre période', () => {
    const src = table();
    const same = updateRevenu(src, 'MAI', 1, entry({ client: 'B2' }));
    expect(same.MAI.map(e => e.client)).toEqual(['a', 'B2']);
    const moved = updateRevenu(src, 'MAI', 1, entry({ client: 'B2' }), 'JANVIER 27');
    expect(moved.MAI.map(e => e.client)).toEqual(['a']);
    expect(moved['JANVIER 27'].map(e => e.client)).toEqual(['B2']);
    expect(src).toEqual(table());
  });

  it('confirmRevenu : fige au taux du jour et passe en confirmé', () => {
    const src = table();
    const r = confirmRevenu(src, 'MAI', 1, 4.3);
    expect(r.frozen?.status).toBe('confirmed');
    expect(r.frozen?.rate).toBe(4.3);
    expect(r.months.MAI[1].status).toBe('confirmed');
    expect(src.MAI[1].status).toBe('preview');
    expect(confirmRevenu(src, 'MAI', 9, 4.3).frozen).toBeUndefined();
  });
});
