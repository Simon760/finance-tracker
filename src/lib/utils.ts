import { Month, BudgetRow, ActualRow, ExtraRow, Trip, Poste, RevenuEntry } from './types';
import { isLegacyEarnMonth } from './constants';

// Format
export function f$(n: number): string {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function f0(n: number): string {
  return Math.round(n).toLocaleString('fr-FR');
}

/**
 * Abréviation d'un nom de mois pour les axes de graphes.
 * Tronquer à 3 lettres rendait JUIN et JUILLET identiques ("JUI") → on distingue
 * explicitement ces deux-là (JUIN / JUIL), les autres restent sur 3 lettres.
 */
export function shortMonth(id: string): string {
  const n = (id || '').trim().toUpperCase();
  if (n.startsWith('JUIL')) return 'JUIL';
  if (n.startsWith('JUIN')) return 'JUIN';
  return n.slice(0, 3);
}

/**
 * Dernier mois réellement renseigné (avec un solde de départ). Les pages patrimoine
 * prenaient le DERNIER mois de la liste, souvent un mois futur encore vide → solde 0.
 */
export function lastMonthWithBalance(months: Month[]): Month | undefined {
  for (let i = (months || []).length - 1; i >= 0; i--) {
    if ((months[i].soldeStart || 0) > 0) return months[i];
  }
  return undefined;
}

/**
 * Solde bancaire d'un mois en devise locale — même formule que le « Prévisionnel
 * compte » du tracker : soldeStart + revenus confirmés − dépenses hors voyage
 * (le swap a déjà débité le compte) + ajustement manuel.
 */
export function monthBankBalance(
  m: Month,
  postes: Poste[],
  revenusMonths: Record<string, RevenuEntry[]> | undefined,
  fallbackRate: number,
): number {
  const entries = revenusMonths?.[m.id] || [];
  const earnLocal = isLegacyEarnMonth(m.id)
    ? (m.earn || 0) * m.rate
    : entries
        .filter(e => !e.status || e.status === 'confirmed')
        .reduce((sum: number, e: RevenuEntry) => sum + ((e.cashed || 0) * (e.rate || fallbackRate)), 0);
  const spentLocal = sumAedBank(m, postes, m.extraActual || []);
  return (m.soldeStart || 0) + earnLocal - spentLocal + (m.adjustment || 0);
}

/**
 * Cash restant dans les pockets des voyages EN COURS (somme des swaps − dépenses,
 * ajustement inclus, jamais négatif). Le swap a déjà débité le compte AED, donc ce
 * reliquat n'apparaît dans aucun solde bancaire : il faut l'ajouter pour obtenir le
 * patrimoine réel. Montants lus dans le champ `eur` des txns, comme partout ailleurs
 * dans le module Voyages.
 */
export function pocketCashEur(trips: Trip[], months: Month[]): number {
  return (trips || [])
    .filter(t => t.status !== 'ended')
    .reduce((sum, t) => {
      const txns = (months || []).flatMap(mo =>
        [...(mo.actual || []), ...(mo.extraActual || [])].flatMap(row =>
          (row.txns || []).filter(x => x.tripId === t.id)));
      const swapped = txns.filter(x => x.tripKind === 'swap').reduce((s, x) => s + (x.eur || 0), 0);
      const spent = txns.filter(x => x.tripKind === 'expense').reduce((s, x) => s + (x.eur || 0), 0);
      return sum + Math.max(0, swapped - spent + (t.adjustment || 0));
    }, 0);
}

/**
 * Toutes les autres dates du même jour de semaine, dans le mois calendaire de `dateStr`.
 * Ex: 2026-08-07 (vendredi) → ['2026-08-14', '2026-08-21', '2026-08-28'] (+ les vendredis
 * antérieurs du mois s'il y en a). La date de départ elle-même est exclue.
 */
export function sameWeekdayDatesInMonth(dateStr: string): string[] {
  if (!dateStr) return [];
  const base = new Date(`${dateStr}T00:00:00`);
  if (isNaN(base.getTime())) return [];
  const year = base.getFullYear();
  const month = base.getMonth();
  const out: string[] = [];
  const d = new Date(year, month, 1);
  while (d.getDay() !== base.getDay()) d.setDate(d.getDate() + 1);
  while (d.getMonth() === month) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (iso !== dateStr) out.push(iso);
    d.setDate(d.getDate() + 7);
  }
  return out;
}

// Currency
export function toEur(aed: number, rate: number): number {
  return rate > 0 ? aed / rate : 0;
}

export function toAed(eur: number, rate: number): number {
  return eur * rate;
}

/**
 * Devise de référence d'une LIGNE de budget. Le flag isAed est global au poste, or
 * les mois anciens ne stockaient qu'une seule devise : sans repli, changer la devise
 * de référence d'un poste viderait l'affichage et les totaux des mois passés.
 */
export function budgetIsEurRef(row: BudgetRow | undefined | null, isAed: boolean): boolean {
  const aed = row?.aed || 0;
  const eur = row?.eur || 0;
  if (aed > 0 && eur > 0) return !isAed; // les deux stockés → le flag du poste tranche
  return eur > 0;                        // sinon → la devise réellement saisie
}

/** Budget d'une ligne en EUR, selon sa devise de référence (l'autre suit le taux). */
export function budgetEurOf(row: BudgetRow | undefined | null, isAed: boolean, liveRate: number): number {
  return budgetIsEurRef(row, isAed) ? (row?.eur || 0) : toEur(row?.aed || 0, liveRate);
}

/** Budget d'une ligne en AED, selon sa devise de référence. */
export function budgetAedOf(row: BudgetRow | undefined | null, isAed: boolean, liveRate: number): number {
  return budgetIsEurRef(row, isAed) ? toAed(row?.eur || 0, liveRate) : (row?.aed || 0);
}

export function rowEur(row: BudgetRow | ActualRow, rate: number): number {
  if (row.eur && row.eur > 0) return row.eur;
  return toEur(row.aed || 0, rate);
}

// Helper: poste name in hidden list for ce mois
function isHidden(m: Month, name?: string): boolean {
  if (!name || !m.hiddenPostes || m.hiddenPostes.length === 0) return false;
  return m.hiddenPostes.includes(name);
}

// Helper: une row extra qui ne contient QUE des swaps (conteneur VOYAGES) est un
// TRANSFERT (AED → cash EUR), pas une consommation → exclue des totaux de dépenses.
// Le swap débite quand même le compte AED via sumAedBank (le solde reste juste).
function isSwapContainer(r: ExtraRow): boolean {
  return !!(r.txns && r.txns.length > 0 && r.txns.every(t => t.tripKind === 'swap'));
}

// Budget sums
// Modèle: pour un poste en AED, le budget est FIXE en AED, l'EUR = aed / taux live
// (varie avec le taux). On ignore le eur stocké (figé à un ancien taux). Pour un poste
// en EUR (isAed=false), l'EUR stocké est la vérité.
export function sumEurBudget(m: Month, postes: { isAed: boolean; name?: string }[], liveRate: number): number {
  let total = 0;
  postes.forEach((p, i) => {
    if (isHidden(m, p.name)) return;
    const row = m.budget[i];
    if (!row) return;
    total += budgetEurOf(row, p.isAed, liveRate);
  });
  (m.extraBudget || []).forEach(r => {
    total += r.eur > 0 ? r.eur : toEur(r.aed, liveRate);
  });
  return total;
}

export function sumAedBudget(m: Month, postes: { isAed: boolean; name?: string }[], liveRate: number): number {
  let total = 0;
  postes.forEach((p, i) => {
    if (isHidden(m, p.name)) return;
    const row = m.budget[i];
    if (!row) return;
    total += budgetAedOf(row, p.isAed, liveRate);
  });
  (m.extraBudget || []).forEach(r => {
    total += r.aed > 0 ? r.aed : toAed(r.eur || 0, liveRate);
  });
  return total;
}

// NOTE: aligné sur la version HTML (_old/js/services/budget.js).
// On itère state.postes (et non actual[]) pour ignorer les rows orphelines
// laissées dans m.actual après la suppression d'un poste.
// Les save handlers de transaction gardent row.aed / row.eur synchronisés
// avec la somme des txns, donc on lit directement ces champs.
export function sumEur(m: Month, postes: { isAed: boolean; name?: string }[], extra: ExtraRow[]): number {
  let total = 0;
  postes.forEach((p, i) => {
    if (isHidden(m, p.name)) return;
    const row = m.actual?.[i];
    if (!row) return;
    total += rowEur(row, m.rate);
  });
  (extra || []).forEach(r => {
    if (isSwapContainer(r)) return; // swap = transfert, pas une dépense
    total += r.eur > 0 ? r.eur : toEur(r.aed, m.rate);
  });
  return total;
}

/**
 * Comme sumAed mais EXCLUT les transactions taggées `tripKind === 'expense'`.
 * Utilisé pour calculer la balance AED du compte bancaire :
 * les expenses voyage n'impactent pas l'AED bank car le swap initial l'a déjà débité.
 */
export function sumAedBank(m: Month, postes: { isAed: boolean; name?: string }[], extra: ExtraRow[]): number {
  let total = 0;
  postes.forEach((p, i) => {
    if (isHidden(m, p.name)) return;
    const row = m.actual?.[i];
    if (!row) return;
    // Si la row a des txns, on les somme en excluant les expense-voyage
    if (row.txns && row.txns.length > 0) {
      const bankTxns = row.txns.filter(t => t.tripKind !== 'expense');
      const totalAed = bankTxns.reduce((s, t) => s + (t.amount || 0), 0);
      if (p.isAed) total += totalAed;
      else total += toAed(bankTxns.reduce((s, t) => s + (t.eur || (t.amount / (t.rate || m.rate))), 0), m.rate);
    } else {
      // Pas de txns détaillées : lit row.aed comme avant
      if (p.isAed) total += row.aed || 0;
      else total += toAed(rowEur(row, m.rate), m.rate);
    }
  });
  (extra || []).forEach(r => {
    if (r.txns && r.txns.length > 0) {
      const bankTxns = r.txns.filter(t => t.tripKind !== 'expense');
      const aed = bankTxns.reduce((s, t) => s + (t.amount || 0), 0);
      total += aed;
    } else {
      if (r.aed && r.aed > 0) total += r.aed;
      else if (r.eur && r.eur > 0) total += toAed(r.eur, m.rate);
    }
  });
  return total;
}

export function sumAed(m: Month, postes: { isAed: boolean; name?: string }[], extra: ExtraRow[]): number {
  let total = 0;
  postes.forEach((p, i) => {
    if (isHidden(m, p.name)) return;
    const row = m.actual?.[i];
    if (!row) return;
    if (p.isAed) {
      total += row.aed || 0;
    } else {
      total += toAed(rowEur(row, m.rate), m.rate);
    }
  });
  (extra || []).forEach(r => {
    if (isSwapContainer(r)) return; // swap = transfert, pas une dépense
    if (r.aed && r.aed > 0) total += r.aed;
    else if (r.eur && r.eur > 0) total += toAed(r.eur, m.rate);
  });
  return total;
}

// Live rate fetching — race plusieurs endpoints en parallèle + timeout strict.
// Le 1er qui répond gagne, on tombe sur fallback si tous échouent ou timeout.
const RATE_FALLBACK = 4.0128;
const RATE_TIMEOUT_MS = 4000;

// Chaque parseur extrait le taux EUR→target d'une réponse JSON
type RateParser = (d: unknown, target: string) => number | null;

async function tryRateEndpoint(url: string, target: string, parse: RateParser): Promise<number> {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), RATE_TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    const rate = parse(d, target);
    if (typeof rate !== 'number' || !isFinite(rate) || rate <= 0) throw new Error('invalid rate');
    return rate;
  } finally {
    clearTimeout(tid);
  }
}

// TwelveData API key — gratuit (800 req/jour). À remplacer plus tard via env var ou state.
const TWELVEDATA_KEY = process.env.NEXT_PUBLIC_TWELVEDATA_KEY || '5b11afcc9b3047c0ba34864f1c88fd37';

export async function fetchRate(target = 'AED'): Promise<number> {
  const T = target.toUpperCase();

  // Stratégie : TwelveData EN PRIORITÉ ABSOLUE (séquentiel, timeout court).
  // Si TwelveData répond avec un taux valide, on retourne directement — pas de race
  // qui pourrait être gagnée par un CDN plus rapide mais moins frais.
  // Si TwelveData fail/timeout → fallback sur Promise.any des autres sources.
  try {
    const tdRate = await tryRateEndpoint(
      `https://api.twelvedata.com/exchange_rate?symbol=EUR/${T}&apikey=${TWELVEDATA_KEY}`,
      target,
      d => (d as { rate?: number; code?: number })?.rate ?? null,
    );
    if (tdRate > 0) return tdRate;
  } catch {
    // TwelveData KO → on tombe sur le fallback parallèle ci-dessous
  }

  // Fallback en parallèle (CDN ou autres APIs)
  const endpoints: { url: string; parse: RateParser }[] = [
    {
      url: `https://wise.com/rates/live?source=EUR&target=${T}`,
      parse: d => (d as { value?: number })?.value ?? null,
    },
    {
      url: `https://query1.finance.yahoo.com/v8/finance/chart/EUR${T}=X?interval=1m`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      parse: d => (d as any)?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null,
    },
    {
      url: `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/eur.json`,
      parse: (d, tg) => (d as { eur?: Record<string, number> })?.eur?.[tg.toLowerCase()] ?? null,
    },
    {
      url: `https://latest.currency-api.pages.dev/v1/currencies/eur.json`,
      parse: (d, tg) => (d as { eur?: Record<string, number> })?.eur?.[tg.toLowerCase()] ?? null,
    },
    {
      url: `https://open.er-api.com/v6/latest/EUR`,
      parse: (d, tg) => (d as { rates?: Record<string, number> })?.rates?.[tg.toUpperCase()] ?? null,
    },
    {
      url: `https://api.frankfurter.app/latest?from=EUR&to=${T}`,
      parse: (d, tg) => (d as { rates?: Record<string, number> })?.rates?.[tg.toUpperCase()] ?? null,
    },
  ];
  try {
    return await Promise.any(endpoints.map(e => tryRateEndpoint(e.url, target, e.parse)));
  } catch {
    return RATE_FALLBACK;
  }
}

// Year detection
export function detectYears(months: Month[]): number[] {
  const MOIS = ['JANVIER', 'FÉVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN', 'JUILLET', 'AOÛT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DÉCEMBRE'];
  const moisIdx = (n: string) => MOIS.findIndex(m => m === n || m.replace(/[ÉÈÊË]/g, c => ({ É: 'E', È: 'E', Ê: 'E', Ë: 'E' }[c] || c)) === n || n.startsWith(m.slice(0, 3)));

  const yearSet = new Set<number>();
  if (months.length === 0) return [];

  const lastIdx = moisIdx(months[months.length - 1].id);
  const nowMonth = new Date().getMonth();
  let yr = new Date().getFullYear();
  if (lastIdx > nowMonth) yr = yr;

  let prevIdx = lastIdx;
  for (let i = months.length - 1; i >= 0; i--) {
    const idx = moisIdx(months[i].id);
    if (idx > prevIdx) yr--;
    prevIdx = idx;
    months[i]._year = yr;
    yearSet.add(yr);
  }
  return Array.from(yearSet).sort();
}
