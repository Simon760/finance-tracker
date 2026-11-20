import { describe, it, expect } from 'vitest';
import { parseCsv, parseAmount, parseDate, detectDateOrder, guessMapping, toBankLines, trackerItems, linesInMonth, reconcile, suggestPoste, BankLine, TrackerItem } from '../bankCsv';
import { POSTES, mkMonth, tx, entry, extra } from './helpers';

describe('parseCsv', () => {
  it('virgule, guillemets, virgule et retour à la ligne entre guillemets, BOM, lignes vides', () => {
    const rows = parseCsv('﻿Date,Description,Amount\r\n05/11/2026,"CARREFOUR, MARINA",-120.50\r\n\r\n06/11/2026,"Ligne 1\nLigne 2","1,234.00"\n');
    expect(rows).toEqual([
      ['Date', 'Description', 'Amount'],
      ['05/11/2026', 'CARREFOUR, MARINA', '-120.50'],
      ['06/11/2026', 'Ligne 1\nLigne 2', '1,234.00'],
    ]);
  });
  it('détecte point-virgule et tabulation', () => {
    expect(parseCsv('Date;Libellé;Montant\n05/11/2026;Loyer;-6500,00')[1]).toEqual(['05/11/2026', 'Loyer', '-6500,00']);
    expect(parseCsv('Date\tDetails\tDebit\n2026-11-05\tUber\t34.00')[1]).toEqual(['2026-11-05', 'Uber', '34.00']);
  });
  it('guillemet doublé = guillemet littéral', () => {
    expect(parseCsv('a,b\n"dit ""bonjour""",2')[1]).toEqual(['dit "bonjour"', '2']);
  });
});

describe('parseAmount', () => {
  it.each([
    ['1,234.56', 1234.56], ['1 234,56', 1234.56], ['1.234,56', 1234.56], ['1 234,56', 1234.56],
    ['-45.00', -45], ['45.00-', -45], ['(45.00)', -45], ['+12', 12],
    ['AED 1,234.56', 1234.56], ['120.00 DR', -120], ['120.00CR', 120], ['6500', 6500],
    ['12,5', 12.5], ['1,234', 1234], ['1.234', 1234], ['0.99', 0.99], ['1,234,567.8', 1234567.8], ["1'234.50", 1234.5],
  ])('%s → %s', (raw, expected) => {
    expect(parseAmount(raw as string)).toBeCloseTo(expected as number, 6);
  });
  it('ce qui n’est pas un montant → null', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('CARREFOUR')).toBeNull();
    expect(parseAmount('05/11/2026')).toBeNull();
    expect(parseAmount('—')).toBeNull();
  });
});

describe('parseDate', () => {
  it.each([
    ['2026-11-05', '2026-11-05'], ['2026/11/05 14:32', '2026-11-05'], ['2026-11-05T10:00:00Z', '2026-11-05'],
    ['05/11/2026', '2026-11-05'], ['5-11-26', '2026-11-05'], ['05.11.2026', '2026-11-05'],
    ['05 Nov 2026', '2026-11-05'], ['5 nov. 26', '2026-11-05'], ['05-Nov-2026', '2026-11-05'],
    ['5 novembre 2026', '2026-11-05'], ['Nov 5, 2026', '2026-11-05'], ['1 août 2026', '2026-08-01'], ['12 déc 2026', '2026-12-12'],
  ])('%s → %s', (raw, expected) => {
    expect(parseDate(raw as string)).toBe(expected);
  });
  it('ordre mois/jour à la demande ; dates impossibles → null', () => {
    expect(parseDate('11/05/2026', 'MDY')).toBe('2026-11-05');
    expect(parseDate('31/02/2026')).toBeNull();
    expect(parseDate('13/13/2026')).toBeNull();
    expect(parseDate('Loyer')).toBeNull();
    expect(parseDate('')).toBeNull();
  });
  it('detectDateOrder tranche dès qu’une valeur dépasse 12', () => {
    expect(detectDateOrder(['01/02/2026', '25/02/2026'])).toBe('DMY');
    expect(detectDateOrder(['01/02/2026', '02/25/2026'])).toBe('MDY');
    expect(detectDateOrder(['01/02/2026'])).toBe('DMY');
  });
});

describe('correspondance des colonnes', () => {
  it('relevé débit / crédit avec lignes d’en-tête parasites avant', () => {
    const rows = parseCsv([
      'Account statement,,,,', 'Account no: 123456,,,,',
      'Transaction Date,Value Date,Description,Debit,Credit,Balance',
      '05/11/2026,05/11/2026,CARREFOUR MARINA,120.50,,95000.00',
      '06/11/2026,06/11/2026,SALARY ZINRAI,,602.00,95602.00',
      'Total,,,120.50,602.00,',
    ].join('\n'));
    const map = guessMapping(rows);
    expect(map).toMatchObject({ headerRow: 2, date: 0, label: 2, debit: 3, credit: 4, amount: -1, order: 'DMY' });
    const { lines, skipped } = toBankLines(rows, map);
    expect(lines.map(l => [l.date, l.label, l.amount])).toEqual([['2026-11-05', 'CARREFOUR MARINA', -120.5], ['2026-11-06', 'SALARY ZINRAI', 602]]);
    expect(skipped).toBe(1); // la ligne « Total »
  });

  it('colonne unique « Montant » signée, en-tête français, point-virgule', () => {
    const rows = parseCsv('Date;Libellé;Montant;Solde\n05/11/2026;Loyer;-6 500,00;88 500,00\n07/11/2026;Virement reçu;1 000,00;89 500,00');
    const map = guessMapping(rows);
    expect(map).toMatchObject({ headerRow: 0, date: 0, label: 1, amount: 2, debit: -1 });
    expect(toBankLines(rows, map).lines.map(l => l.amount)).toEqual([-6500, 1000]);
    // banque qui écrit les sorties en positif
    expect(toBankLines(rows, { ...map, invert: true }).lines.map(l => l.amount)).toEqual([6500, -1000]);
  });

  it('sans en-tête : devine d’après le contenu', () => {
    const rows = parseCsv('2026-11-05,UBER TRIP DUBAI,-34.00\n2026-11-06,NOON.COM ORDER 5521,-210.75\n2026-11-08,TALABAT,-58.00');
    expect(guessMapping(rows)).toMatchObject({ headerRow: -1, date: 0, label: 1, amount: 2 });
  });
});

describe('ce que le tracker fait passer par le compte', () => {
  const m = mkMonth('NOVEMBRE 26', {
    _year: 2026,
    actual: [
      { aed: 0, eur: 0, txns: [tx(120.5, { label: 'Carrefour', date: '2026-11-05' }), tx(80, { label: 'Resto Bali', date: '2026-11-06', tripId: 't', tripKind: 'expense' })] },
      { aed: 6500, eur: 1600 },
      { aed: 0, eur: null },
    ],
    extraActual: [extra('VOYAGES', 3000, 750, [tx(3000, { label: 'Swap', date: '2026-11-02', tripId: 't', tripKind: 'swap' })])],
    hiddenPostes: ['CHARGES FRANCE'],
  });
  const rev = { NOVEMBRE: [entry({ client: 'ZINRAI', cashed: 150, rate: 4, date: '2026-11-06' }), entry({ cashed: 999, status: 'preview' })] };

  it('dépenses hors voyage (le swap compte, pas la dépense payée en pocket), montants non datés, revenus confirmés', () => {
    const items = trackerItems(m, POSTES, rev, 4);
    expect(items.map(i => [i.kind, i.date, i.amount, i.label, i.where])).toEqual([
      ['expense', '2026-11-05', 120.5, 'Carrefour', 'COURSES'],
      ['expense', '', 6500, 'LOYER', 'LOYER'],
      ['expense', '2026-11-02', 3000, 'Swap', 'VOYAGES'],
      ['revenue', '2026-11-06', 600, 'ZINRAI', 'CONSULTING'],
    ]);
  });

  it('linesInMonth ne garde que les lignes datées dans le mois', () => {
    const lines: BankLine[] = [{ idx: 0, date: '2026-10-31', label: 'a', amount: -1 }, { idx: 1, date: '2026-11-01', label: 'b', amount: -2 }, { idx: 2, date: '2026-12-01', label: 'c', amount: -3 }];
    expect(linesInMonth(lines, m)).toEqual({ lines: [lines[1]], outside: 2 });
  });
});

describe('reconcile — rapprochement relevé ↔ tracker', () => {
  const B = (date: string, amount: number, label = 'x', idx = 0): BankLine => ({ idx, date, label, amount });
  const T = (id: string, date: string, amount: number, kind: TrackerItem['kind'] = 'expense'): TrackerItem => ({ id, kind, date, amount, label: id, where: 'P' });

  it('même montant, dates proches → rapproché ; le reste ressort de chaque côté', () => {
    const r = reconcile(
      [B('2026-11-07', -120.5), B('2026-11-09', -58), B('2026-11-06', 602)],
      [T('a', '2026-11-05', 120.5), T('b', '2026-11-12', 300), T('r', '2026-11-06', 602, 'revenue')],
    );
    expect(r.matched.map(m => [m.item.id, m.exact, m.dayGap])).toEqual([['r', true, 0], ['a', true, 2]]);
    expect(r.bankOnly.map(b => b.amount)).toEqual([-58]);
    expect(r.trackerOnly.map(t => t.id)).toEqual(['b']);
    expect(r.totals).toEqual({ bankOut: 178.5, bankIn: 602, trackerOut: 420.5, trackerIn: 602 });
  });

  it('une sortie ne se rapproche jamais d’un revenu, même au même montant', () => {
    const r = reconcile([B('2026-11-05', -500)], [T('rev', '2026-11-05', 500, 'revenue')]);
    expect(r.matched).toEqual([]);
  });

  it('deux lignes identiques : chacune prend sa transaction, la plus proche en date d’abord', () => {
    const r = reconcile(
      [B('2026-11-03', -34, 'x', 0), B('2026-11-20', -34, 'x', 1)],
      [T('late', '2026-11-19', 34), T('early', '2026-11-03', 34)],
    );
    expect(r.matched.map(m => [m.bank.date, m.item.id])).toEqual([['2026-11-03', 'early'], ['2026-11-20', 'late']]);
  });

  it('même montant mais date très éloignée ou absente → rapproché quand même (2e passe)', () => {
    const r = reconcile([B('2026-11-25', -6500), B('2026-11-02', -77)], [T('loyer', '', 6500), T('mal-date', '2026-11-28', 77)]);
    expect(r.matched.map(m => [m.item.id, m.exact, m.dayGap])).toEqual([['mal-date', true, 26], ['loyer', true, null]]);
    expect(r.bankOnly).toEqual([]);
  });

  it('montant proche (≤ 1 ou 0,5 %) et dates proches → rapproché, marqué approximatif', () => {
    const r = reconcile([B('2026-11-05', -120.9), B('2026-11-06', -2000)], [T('a', '2026-11-05', 120.5), T('b', '2026-11-06', 2008)]);
    expect(r.matched.map(m => [m.item.id, m.exact, m.diff])).toEqual([['a', false, 0.4], ['b', false, -8]]);
  });

  it('montant trop différent → pas de rapprochement', () => {
    const r = reconcile([B('2026-11-05', -120)], [T('a', '2026-11-05', 125)]);
    expect(r.matched).toEqual([]);
    expect(r.bankOnly).toHaveLength(1);
    expect(r.trackerOnly).toHaveLength(1);
  });
});

describe('suggestPoste', () => {
  const months = [mkMonth('OCTOBRE 26', { actual: [
    { aed: 0, eur: 0, txns: [tx(10, { label: 'Carrefour' }), tx(10, { label: 'CARREFOUR CITY' }), tx(5, { label: 'Uber' })] },
    { aed: 0, eur: 0, txns: [tx(6500, { label: 'Loyer novembre' })] },
    { aed: 0, eur: null },
  ] })];
  it('le poste où des libellés ressemblants ont déjà été rangés', () => {
    expect(suggestPoste('CARREFOUR MARINA MALL DXB', months, POSTES)).toBe(0);
    expect(suggestPoste('Loyer décembre', months, POSTES)).toBe(1);
  });
  it('rien de ressemblant → -1', () => {
    expect(suggestPoste('NOON.COM', months, POSTES)).toBe(-1);
    expect(suggestPoste('ab', months, POSTES)).toBe(-1);
  });
});
