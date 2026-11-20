import { Month, Poste, RevenuEntry } from './types';
import { monthPeriod, monthRevenus, isRevConfirmed } from './revenus';

/**
 * IMPORT D'UN RELEVÉ BANCAIRE (CSV) ET RAPPROCHEMENT AVEC LE TRACKER.
 *
 * Tout se passe dans le navigateur : le fichier est lu localement, rien n'est envoyé ni
 * stocké. Les banques n'ayant aucun format commun, la lecture est tolérante (séparateur,
 * dates, montants) et la correspondance des colonnes est proposée puis ajustable à la
 * main. Fonctions pures, testées.
 */

// ─── Lecture du CSV ──────────────────────────────────────────────────────────────

const DELIMS = [',', ';', '\t', '|'];

function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 12);
  let best = ',';
  let bestScore = -1;
  DELIMS.forEach(d => {
    // Nombre de séparateurs hors guillemets, ligne par ligne : on veut un compte élevé ET régulier
    const counts = lines.map(l => {
      let n = 0;
      let q = false;
      for (const ch of l) { if (ch === '"') q = !q; else if (ch === d && !q) n++; }
      return n;
    });
    const freq = new Map<number, number>();
    counts.filter(c => c > 0).forEach(c => freq.set(c, (freq.get(c) || 0) + 1));
    if (freq.size === 0) return;
    // Compte le plus fréquent (à égalité, le plus grand)
    const [mode, nLines] = Array.from(freq.entries()).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    const score = nLines * 100 + mode;
    if (score > bestScore) { bestScore = score; best = d; }
  });
  return best;
}

/** Texte CSV → lignes de cellules. Gère guillemets, `""`, retours à la ligne entre guillemets, BOM. */
export function parseCsv(text: string): string[][] {
  const src = (text || '').replace(/^﻿/, '');
  const d = detectDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === d) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.map(r => r.map(c => c.trim())).filter(r => r.some(c => c !== ''));
}

/**
 * Montant écrit par une banque → nombre signé. Accepte « 1,234.56 », « 1 234,56 »,
 * « 1.234,56 », « -45.00 », « 45.00- », « (45.00) », « AED 1,234.56 », « 120.00 DR ».
 * null si ce n'est pas un montant.
 */
export function parseAmount(raw: string): number | null {
  let s = (raw || '').replace(/[  \s]/g, '');
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/DR$/i.test(s)) { neg = true; s = s.replace(/DR$/i, ''); }
  s = s.replace(/CR$/i, '');
  if (s.endsWith('-')) { neg = true; s = s.slice(0, -1); }
  if (s.startsWith('-')) { neg = true; s = s.slice(1); }
  if (s.startsWith('+')) s = s.slice(1);
  s = s.replace(/^[A-Za-z€$£]+|[A-Za-z€$£]+$/g, '');
  if (!/^[\d.,']+$/.test(s) || !/\d/.test(s)) return null;
  s = s.replace(/'/g, '');
  // Quel caractère est le séparateur DÉCIMAL ? Les deux présents → le dernier. Un seul
  // type : une virgule suivie de 1–2 chiffres est décimale (« 12,5 »), sinon ce sont des
  // milliers (« 1,234 ») ; un point unique est décimal sauf « 1.234 » (milliers). Plusieurs
  // virgules ou plusieurs points seuls = séparateurs de milliers.
  const commas = (s.match(/,/g) || []).length;
  const dots = (s.match(/\./g) || []).length;
  let dec = '';
  if (commas && dots) dec = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
  else if (commas === 1) dec = /,\d{1,2}$/.test(s) ? ',' : '';
  else if (dots === 1) dec = /^\d{1,3}\.\d{3}$/.test(s) ? '' : '.';
  let intPart = s;
  let frac = '';
  if (dec) {
    const i = s.lastIndexOf(dec);
    intPart = s.slice(0, i);
    frac = s.slice(i + 1);
  }
  const n = parseFloat(`${intPart.replace(/[.,]/g, '') || '0'}.${frac || '0'}`);
  if (!isFinite(n)) return null;
  return neg ? -n : n;
}

const MONTHS: Record<string, number> = {
  jan: 1, janv: 1, janvier: 1, january: 1,
  feb: 2, fev: 2, fevr: 2, fevrier: 2, february: 2,
  mar: 3, mars: 3, march: 3,
  apr: 4, avr: 4, avril: 4, april: 4,
  may: 5, mai: 5,
  jun: 6, juin: 6, june: 6,
  jul: 7, juil: 7, juillet: 7, july: 7,
  aug: 8, aou: 8, aout: 8, august: 8,
  sep: 9, sept: 9, septembre: 9, september: 9,
  oct: 10, octobre: 10, october: 10,
  nov: 11, novembre: 11, november: 11,
  dec: 12, decembre: 12, december: 12,
};
const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g');
const plain = (v: string) => v.toLowerCase().normalize('NFD').replace(DIACRITICS, '');

function ymd(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (!(y >= 1990 && y <= 2100) || !(m >= 1 && m <= 12) || !(d >= 1 && d <= 31)) return null;
  if (d > new Date(y, m, 0).getDate()) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Date d'un relevé → YYYY-MM-DD. Formats : 2026-11-05, 05/11/2026, 5-11-26, 05.11.2026
 * (ordre jour/mois selon `order`), « 05 Nov 2026 », « 5 nov. 26 », « Nov 5, 2026 », avec
 * ou sans heure derrière. null si illisible.
 */
export function parseDate(raw: string, order: 'DMY' | 'MDY' = 'DMY'): string | null {
  const s = (raw || '').trim();
  if (!s) return null;
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(s);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:\s.*)?$/.exec(s);
  if (m) return order === 'DMY' ? ymd(+m[3], +m[2], +m[1]) : ymd(+m[3], +m[1], +m[2]);
  const p = plain(s).replace(/[.,]/g, ' ');
  m = /^(\d{1,2})[\s-]+([a-z]+)[\s-]+(\d{2}|\d{4})(?:\s.*)?$/.exec(p);
  if (m && MONTHS[m[2]]) return ymd(+m[3], MONTHS[m[2]], +m[1]);
  m = /^([a-z]+)\s+(\d{1,2})\s+(\d{4})(?:\s.*)?$/.exec(p.replace(/\s+/g, ' '));
  if (m && MONTHS[m[1]]) return ymd(+m[3], MONTHS[m[1]], +m[2]);
  return null;
}

/** Jour d'abord (Europe, Émirats) ou mois d'abord (US) ? Tranché dès qu'une valeur dépasse 12. */
export function detectDateOrder(samples: string[]): 'DMY' | 'MDY' {
  for (const s of samples) {
    const m = /^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/.exec((s || '').trim());
    if (!m) continue;
    if (+m[1] > 12) return 'DMY';
    if (+m[2] > 12) return 'MDY';
  }
  return 'DMY';
}

// ─── Correspondance des colonnes ─────────────────────────────────────────────────

export interface CsvMapping {
  /** Index de la ligne d'en-tête (-1 : pas d'en-tête, les données commencent à la ligne 0). */
  headerRow: number;
  date: number;
  label: number;
  /** Colonne unique « montant » (-1 si le relevé a deux colonnes débit / crédit). */
  amount: number;
  debit: number;
  credit: number;
  order: 'DMY' | 'MDY';
  /** Colonne unique : les SORTIES y sont écrites en positif (les entrées en négatif). */
  invert: boolean;
}

const H = {
  date: /^(date|transaction date|trans date|posting date|booking date|date operation|date de l'operation|date comptable|value date|date valeur)$/,
  label: /(description|narration|narrative|details|detail|libelle|particulars|merchant|payee|beneficiary|reference|memo|transaction)/,
  debit: /(debit|withdraw|paid out|money out|sortie|depense)/,
  credit: /(credit|deposit|paid in|money in|entree|recette)/,
  amount: /(amount|montant|value|valeur)/,
  balance: /(balance|solde)/,
};

/** Devine quelle colonne est quoi à partir de l'en-tête, à défaut du contenu. */
export function guessMapping(rows: string[][]): CsvMapping {
  const map: CsvMapping = { headerRow: -1, date: -1, label: -1, amount: -1, debit: -1, credit: -1, order: 'DMY', invert: false };
  const isHeaderCell = (c: string) => { const p = plain(c); return H.date.test(p) || H.label.test(p) || H.debit.test(p) || H.credit.test(p) || H.amount.test(p) || H.balance.test(p); };
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    if (rows[i].filter(isHeaderCell).length >= 2) { map.headerRow = i; break; }
  }
  const data = rows.slice(map.headerRow + 1);
  const width = Math.max(0, ...rows.map(r => r.length));

  if (map.headerRow >= 0) {
    const head = rows[map.headerRow].map(plain);
    const find = (re: RegExp, not?: RegExp) => head.findIndex((h, i) => re.test(h) && !(not && not.test(h)) && ![map.date, map.label, map.debit, map.credit].includes(i));
    map.date = head.findIndex(h => H.date.test(h) && !/value|valeur/.test(h));
    if (map.date < 0) map.date = head.findIndex(h => /date/.test(h));
    map.debit = find(H.debit);
    map.credit = find(H.credit);
    map.label = head.findIndex((h, i) => H.label.test(h) && !/date|amount|montant/.test(h) && i !== map.date);
    if (map.debit < 0 || map.credit < 0) {
      map.debit = -1; map.credit = -1;
      map.amount = head.findIndex((h, i) => H.amount.test(h) && !H.balance.test(h) && !/date/.test(h) && i !== map.date);
    }
  }

  // Compléments par le contenu (pas d'en-tête, ou colonne non reconnue)
  const ratio = (col: number, ok: (c: string) => boolean) => {
    const cells = data.map(r => r[col] || '').filter(c => c !== '');
    return cells.length ? cells.filter(ok).length / cells.length : 0;
  };
  const cols = Array.from({ length: width }, (_, i) => i);
  if (map.date < 0) map.date = cols.find(c => ratio(c, v => parseDate(v) !== null) > 0.8) ?? -1;
  if (map.amount < 0 && (map.debit < 0 || map.credit < 0)) {
    map.amount = cols.find(c => c !== map.date && ratio(c, v => parseAmount(v) !== null && !/^\d{5,}$/.test(v)) > 0.8) ?? -1;
  }
  if (map.label < 0) {
    const taken = [map.date, map.amount, map.debit, map.credit];
    const avgLen = (c: number) => { const cells = data.map(r => r[c] || ''); return cells.reduce((s, v) => s + v.length, 0) / (cells.length || 1); };
    map.label = cols.filter(c => !taken.includes(c) && ratio(c, v => parseAmount(v) === null && parseDate(v) === null) > 0.6).sort((a, b) => avgLen(b) - avgLen(a))[0] ?? -1;
  }
  if (map.date >= 0) map.order = detectDateOrder(data.map(r => r[map.date] || ''));
  return map;
}

/** Une ligne du relevé : montant SIGNÉ, négatif = sortie d'argent. */
export interface BankLine { idx: number; date: string; label: string; amount: number }

/** Applique la correspondance : lignes exploitables + nombre de lignes écartées (illisibles). */
export function toBankLines(rows: string[][], map: CsvMapping): { lines: BankLine[]; skipped: number } {
  const lines: BankLine[] = [];
  let skipped = 0;
  rows.slice(map.headerRow + 1).forEach((r, i) => {
    const date = map.date >= 0 ? parseDate(r[map.date] || '', map.order) : null;
    let amount: number | null = null;
    if (map.debit >= 0 || map.credit >= 0) {
      const d = map.debit >= 0 ? parseAmount(r[map.debit] || '') : null;
      const c = map.credit >= 0 ? parseAmount(r[map.credit] || '') : null;
      if (d !== null && Math.abs(d) > 0) amount = -Math.abs(d);
      else if (c !== null && Math.abs(c) > 0) amount = Math.abs(c);
    } else if (map.amount >= 0) {
      amount = parseAmount(r[map.amount] || '');
      if (amount !== null && map.invert) amount = -amount;
    }
    if (!date || amount === null || amount === 0) { skipped++; return; }
    lines.push({ idx: i, date, label: (map.label >= 0 ? r[map.label] || '' : '').replace(/\s+/g, ' ').trim(), amount: Math.round(amount * 100) / 100 });
  });
  return { lines, skipped };
}

// ─── Rapprochement ───────────────────────────────────────────────────────────────

/** Un mouvement du tracker qui passe par le compte : dépense (hors voyage) ou revenu confirmé. */
export interface TrackerItem {
  id: string;
  kind: 'expense' | 'revenue';
  /** '' si non daté (montant saisi sans transaction) */
  date: string;
  /** Toujours positif, en devise locale */
  amount: number;
  label: string;
  /** Poste (dépense) ou catégorie (revenu) */
  where: string;
}

/** Tout ce qu'un mois du tracker fait passer par le compte bancaire. */
export function trackerItems(
  m: Month, postes: Poste[],
  revenusMonths: Record<string, RevenuEntry[]> | undefined, fallbackRate: number,
): TrackerItem[] {
  const out: TrackerItem[] = [];
  const hidden = m.hiddenPostes || [];
  const rows = [
    ...postes.map((p, i) => (hidden.includes(p.name) ? null : { key: `p${i}`, name: p.name, row: m.actual?.[i] })),
    ...(m.extraActual || []).map((r, i) => ({ key: `x${i}`, name: r.name, row: r })),
  ];
  rows.forEach(x => {
    if (!x || !x.row) return;
    const txns = x.row.txns || [];
    if (txns.length > 0) {
      txns.forEach((t, j) => {
        if (t.tripKind === 'expense' || !((t.amount || 0) > 0)) return; // payé depuis une pocket, pas depuis le compte
        out.push({ id: `${x.key}:${j}`, kind: 'expense', date: t.date || '', amount: t.amount, label: t.label && t.label !== '---' ? t.label : x.name, where: x.name });
      });
    } else if ((x.row.aed || 0) > 0) {
      out.push({ id: `${x.key}:row`, kind: 'expense', date: '', amount: x.row.aed as number, label: x.name, where: x.name });
    }
  });
  monthRevenus(revenusMonths, m).forEach((e, j) => {
    if (!isRevConfirmed(e)) return;
    const amount = Math.round((e.cashed || 0) * (e.rate || fallbackRate) * 100) / 100;
    if (amount > 0) out.push({ id: `rev:${j}`, kind: 'revenue', date: e.date || '', amount, label: e.client || 'Revenu', where: e.cat || 'Revenu' });
  });
  return out;
}

/** Lignes du relevé datées dans le mois calendaire du mois tracker, et nombre de lignes hors période. */
export function linesInMonth(lines: BankLine[], m: Month): { lines: BankLine[]; outside: number } {
  const p = monthPeriod(m);
  if (!p) return { lines, outside: 0 };
  const prefix = `${p.year}-${String(p.idx + 1).padStart(2, '0')}`;
  const kept = lines.filter(l => l.date.startsWith(prefix));
  return { lines: kept, outside: lines.length - kept.length };
}

export interface Match {
  bank: BankLine;
  item: TrackerItem;
  /** Montant identique au centime */
  exact: boolean;
  /** Écart en jours entre les deux dates (null si l'élément du tracker n'est pas daté) */
  dayGap: number | null;
  /** Montant relevé − montant tracker (valeurs absolues) */
  diff: number;
}

export interface Reconciliation {
  matched: Match[];
  /** Dans le relevé, introuvable dans le tracker */
  bankOnly: BankLine[];
  /** Dans le tracker, introuvable dans le relevé */
  trackerOnly: TrackerItem[];
  totals: { bankOut: number; bankIn: number; trackerOut: number; trackerIn: number };
}

const dayNum = (d: string) => Math.round(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86400000);

/**
 * Rapproche le relevé et le tracker, un pour un. Trois passes, de la plus sûre à la plus
 * souple, chaque élément n'étant apparié qu'une fois :
 *  1. même montant au centime, dates à `days` jours près (une carte est débitée plus tard) ;
 *  2. même montant, quelle que soit la date dans la période (date mal saisie, montant
 *     sans transaction donc non daté) ;
 *  3. montant proche (≤ `tolerance`, ou 0,5 %) et dates à `days` jours près — signalé
 *     comme approximatif.
 * Les sorties ne se rapprochent que des dépenses, les entrées que des revenus.
 */
export function reconcile(
  lines: BankLine[], items: TrackerItem[],
  opts: { days?: number; tolerance?: number } = {},
): Reconciliation {
  const days = opts.days ?? 5;
  const tol = opts.tolerance ?? 1;
  const usedB = new Set<number>();
  const usedT = new Set<string>();
  const matched: Match[] = [];

  const gap = (b: BankLine, t: TrackerItem) => (t.date ? Math.abs(dayNum(b.date) - dayNum(t.date)) : null);
  const kindOk = (b: BankLine, t: TrackerItem) => (b.amount < 0 ? t.kind === 'expense' : t.kind === 'revenue');

  const pass = (ok: (b: BankLine, t: TrackerItem, diff: number, g: number | null) => boolean, exact: boolean) => {
    const cands: Match[] = [];
    lines.forEach((b, bi) => {
      if (usedB.has(bi)) return;
      items.forEach(t => {
        if (usedT.has(t.id) || !kindOk(b, t)) return;
        const diff = Math.round((Math.abs(b.amount) - t.amount) * 100) / 100;
        const g = gap(b, t);
        if (ok(b, t, diff, g)) cands.push({ bank: b, item: t, exact, dayGap: g, diff });
      });
    });
    // Les plus proches d'abord : écart de montant, puis de date
    cands.sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff) || (a.dayGap ?? 999) - (b.dayGap ?? 999));
    cands.forEach(c => {
      const bi = lines.indexOf(c.bank);
      if (usedB.has(bi) || usedT.has(c.item.id)) return;
      usedB.add(bi); usedT.add(c.item.id);
      matched.push(c);
    });
  };

  pass((_b, _t, diff, g) => Math.abs(diff) <= 0.01 && g !== null && g <= days, true);
  pass((_b, _t, diff) => Math.abs(diff) <= 0.01, true);
  pass((b, _t, diff, g) => Math.abs(diff) <= Math.max(tol, Math.abs(b.amount) * 0.005) && g !== null && g <= days, false);

  const sum = (ns: number[]) => Math.round(ns.reduce((s, n) => s + n, 0) * 100) / 100;
  return {
    matched: matched.sort((a, b) => a.bank.date.localeCompare(b.bank.date)),
    bankOnly: lines.filter((_, i) => !usedB.has(i)),
    trackerOnly: items.filter(t => !usedT.has(t.id)),
    totals: {
      bankOut: sum(lines.filter(l => l.amount < 0).map(l => -l.amount)),
      bankIn: sum(lines.filter(l => l.amount > 0).map(l => l.amount)),
      trackerOut: sum(items.filter(t => t.kind === 'expense').map(t => t.amount)),
      trackerIn: sum(items.filter(t => t.kind === 'revenue').map(t => t.amount)),
    },
  };
}

/**
 * Poste le plus probable pour un libellé de relevé : celui où des transactions au libellé
 * ressemblant ont déjà été rangées (mot significatif en commun), le plus fréquent
 * l'emportant. -1 si rien ne ressemble.
 */
export function suggestPoste(label: string, months: Month[], postes: Poste[]): number {
  const words = plain(label).split(/[^a-z0-9]+/).filter(w => w.length >= 4);
  if (words.length === 0) return -1;
  const score = new Array(postes.length).fill(0);
  (months || []).forEach(m => {
    postes.forEach((_, i) => {
      (m.actual?.[i]?.txns || []).forEach(t => {
        const l = plain(t.label || '');
        if (words.some(w => l.includes(w))) score[i]++;
      });
    });
  });
  const best = Math.max(...score);
  return best > 0 ? score.indexOf(best) : -1;
}
