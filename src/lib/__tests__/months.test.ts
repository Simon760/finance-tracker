import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  detectYears, startedMonths, inferNextMonthYear, lastMonthWithBalance, bankRealDelta,
  pocketCashEur, shortMonth, sameWeekdayDatesInMonth, todayISO, localISODate,
} from '../utils';
import { Trip } from '../types';
import { POSTES, mkMonth, tx, entry, extra } from './helpers';

const ids = (...names: string[]) => names.map(n => mkMonth(n));
const years = (ms: ReturnType<typeof ids>) => ms.map(m => m._year);

afterEach(() => { vi.useRealTimers(); });

describe('detectYears — année de chaque mois', () => {
  it('un suffixe année explicite ancre toute la liste, quelle que soit la date du jour', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2031, 5, 1));
    const ms = ids('OCTOBRE', 'NOVEMBRE', 'DECEMBRE', 'JANVIER', 'SEPTEMBRE', 'OCTOBRE 26', 'NOVEMBRE 26');
    expect(detectYears(ms)).toEqual([2025, 2026]);
    expect(years(ms)).toEqual([2025, 2025, 2025, 2026, 2026, 2026, 2026]);
  });

  it('un mois non suffixé APRÈS le dernier suffixe reste daté par rapport à lui', () => {
    const ms = ids('SEPTEMBRE', 'OCTOBRE 26', 'NOVEMBRE 26', 'DÉCEMBRE', 'JANVIER 27');
    detectYears(ms);
    expect(years(ms)).toEqual([2026, 2026, 2026, 2026, 2027]);
  });

  it('sans suffixe : le dernier mois est placé au plus près d’aujourd’hui', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 4, 10)); // mai 2026
    const ms = ids('NOVEMBRE', 'DECEMBRE', 'JANVIER', 'FEVRIER', 'MARS', 'AVRIL', 'MAI');
    detectYears(ms);
    expect(years(ms)).toEqual([2025, 2025, 2026, 2026, 2026, 2026, 2026]);
  });

  it('sans suffixe : un JANVIER créé en décembre est dans l’année SUIVANTE', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 11, 20)); // décembre 2026
    const ms = ids('NOVEMBRE', 'DECEMBRE', 'JANVIER');
    detectYears(ms);
    expect(years(ms)).toEqual([2026, 2026, 2027]);
  });

  it('sans suffixe : un dernier mois très en avance appartient à l’année précédente', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 1, 10)); // février 2026
    const ms = ids('OCTOBRE', 'NOVEMBRE', 'DECEMBRE');
    detectYears(ms);
    expect(years(ms)).toEqual([2025, 2025, 2025]);
  });

  it('liste vide', () => {
    expect(detectYears([])).toEqual([]);
  });
});

describe('startedMonths — les mois de simulation futurs sont hors stats', () => {
  it('garde jusqu’au mois calendaire en cours inclus', () => {
    const ms = ids('SEPTEMBRE', 'OCTOBRE 26', 'NOVEMBRE 26', 'DÉCEMBRE');
    expect(startedMonths(ms, new Date(2026, 9, 28)).map(m => m.id)).toEqual(['SEPTEMBRE', 'OCTOBRE 26']);
    expect(startedMonths(ms, new Date(2026, 10, 1)).map(m => m.id)).toEqual(['SEPTEMBRE', 'OCTOBRE 26', 'NOVEMBRE 26']);
    expect(startedMonths(ms, new Date(2027, 0, 1))).toHaveLength(4);
  });

  it('un nom de mois non reconnu est conservé', () => {
    const ms = ids('OCTOBRE 26', 'VACANCES');
    expect(startedMonths(ms, new Date(2026, 9, 28)).map(m => m.id)).toContain('VACANCES');
  });

  it('liste vide ou absente', () => {
    expect(startedMonths([], new Date())).toEqual([]);
    expect(startedMonths(undefined as never, new Date())).toEqual([]);
  });
});

describe('inferNextMonthYear — année d’un nouveau mois en collision de nom', () => {
  it('mois postérieur dans l’année → même année ; sinon année suivante', () => {
    const ms = ids('SEPTEMBRE', 'OCTOBRE 26');
    expect(inferNextMonthYear(ms, 'NOVEMBRE')).toBe(2026);
    expect(inferNextMonthYear(ms, 'JANVIER')).toBe(2027);
    expect(inferNextMonthYear(ms, 'OCTOBRE')).toBe(2027);
  });
});

describe('solde actuel et variation réelle du compte', () => {
  const months = () => [
    mkMonth('SEPTEMBRE', { soldeStart: 10000, actual: [{ aed: 1000, eur: 250 }, { aed: 0, eur: null }, { aed: 0, eur: null }] }),
    mkMonth('OCTOBRE 26', { soldeStart: 12000, actual: [{ aed: 500, eur: 125 }, { aed: 0, eur: null }, { aed: 0, eur: null }] }),
    // mois de simulation créé à l'avance, avec un solde de départ
    mkMonth('NOVEMBRE 26', { soldeStart: 99999 }),
  ];
  const rev = { SEPTEMBRE: [entry({ cashed: 750, rate: 4 })], OCTOBRE: [entry({ cashed: 250, rate: 4 })] };

  it('le dernier mois avec solde ignore un mois pas encore commencé', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 28));
    expect(lastMonthWithBalance(months())?.id).toBe('OCTOBRE 26');
  });

  it('bankRealDelta : solde de départ → solde du dernier mois commencé', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 28));
    const d = bankRealDelta(months(), POSTES, rev, 4);
    // dernier mois : 12000 + 250×4 − 500 = 12500 ; départ : 10000
    expect(d.delta).toBe(2500);
    expect(d.from).toBe('SEPTEMBRE');
    // flux tracés : (3000 − 1000) + (1000 − 500)
    expect(d.flows).toBe(2500);
  });

  it('avec un capital de départ connu, la mesure part de lui', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 28));
    const d = bankRealDelta(months(), POSTES, rev, 4, { aed: 8000, label: 'Installation' });
    expect(d.start).toBe(8000);
    expect(d.delta).toBe(4500);
    expect(d.from).toBe('Installation');
  });

  it('aucun mois suivi → zéro', () => {
    expect(bankRealDelta([], POSTES, {}, 4)).toEqual({ delta: 0, flows: 0, from: null, start: 0 });
  });
});

describe('pocketCashEur — cash restant des voyages en cours', () => {
  const trip = (id: string, over: Partial<Trip> = {}): Trip => ({
    id, name: id, country: 'FR', currency: 'EUR', startDate: '2026-07-01', endDate: null,
    swap: { aedOut: 3000, localIn: 750, rate: 4, date: '2026-07-01', posteIdx: -1, monthId: 'JUILLET' },
    status: 'ongoing', createdAt: '2026-07-01', ...over,
  });
  const m = mkMonth('JUILLET', {
    actual: [{ aed: 0, eur: 0, txns: [tx(400, { tripId: 'a', tripKind: 'expense', eur: 100 })] }, { aed: 0, eur: null }, { aed: 0, eur: null }],
    extraActual: [extra('VOYAGES', 3000, 750, [
      tx(3000, { tripId: 'a', tripKind: 'swap', eur: 750 }),
      tx(1000, { tripId: 'b', tripKind: 'swap', eur: 250 }),
    ])],
  });

  it('swaps − dépenses + ajustement, voyages terminés exclus', () => {
    expect(pocketCashEur([trip('a')], [m])).toBe(650);
    expect(pocketCashEur([trip('a', { adjustment: -50 })], [m])).toBe(600);
    expect(pocketCashEur([trip('a'), trip('b', { status: 'ended' })], [m])).toBe(650);
  });

  it('jamais négatif', () => {
    expect(pocketCashEur([trip('a', { adjustment: -9999 })], [m])).toBe(0);
  });
});

describe('affichage', () => {
  it('shortMonth distingue JUIN / JUILLET et garde le repère d’année', () => {
    expect(shortMonth('JUIN')).toBe('JUIN');
    expect(shortMonth('JUILLET')).toBe('JUIL');
    expect(shortMonth('OCTOBRE')).toBe('OCT');
    expect(shortMonth('OCTOBRE 26')).toBe("OCT '26");
  });

  it('sameWeekdayDatesInMonth : les autres mêmes jours de semaine du mois', () => {
    expect(sameWeekdayDatesInMonth('2026-08-07')).toEqual(['2026-08-14', '2026-08-21', '2026-08-28']);
    expect(sameWeekdayDatesInMonth('2026-08-21')).toEqual(['2026-08-07', '2026-08-14', '2026-08-28']);
    expect(sameWeekdayDatesInMonth('')).toEqual([]);
    expect(sameWeekdayDatesInMonth('pas une date')).toEqual([]);
  });
});

describe('date du jour en heure LOCALE', () => {
  it('n’utilise pas la date UTC (à Dubaï, minuit–4 h tombait la veille)', () => {
    // 1er du mois à 01:30 heure locale : toISOString() donnerait la veille en UTC+4
    const d = new Date(2026, 10, 1, 1, 30, 0);
    expect(todayISO(d)).toBe('2026-11-01');
    expect(localISODate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});
