import { Month, BudgetRow, ActualRow, ExtraRow } from './types';

// Format
export function f$(n: number): string {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function f0(n: number): string {
  return Math.round(n).toLocaleString('fr-FR');
}

// Currency
export function toEur(aed: number, rate: number): number {
  return rate > 0 ? aed / rate : 0;
}

export function toAed(eur: number, rate: number): number {
  return eur * rate;
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

// Budget sums
export function sumEurBudget(m: Month, postes: { isAed: boolean; name?: string }[], liveRate: number): number {
  let total = 0;
  postes.forEach((p, i) => {
    if (isHidden(m, p.name)) return;
    const row = m.budget[i];
    if (!row) return;
    total += p.isAed ? toEur(row.aed, liveRate) : (row.eur || 0);
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
    total += p.isAed ? (row.aed || 0) : toAed(row.eur || 0, liveRate);
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

export async function fetchRate(target = 'AED'): Promise<number> {
  const T = target.toUpperCase();

  // Sources racées en parallèle, du plus "live marché" au plus "interbank/ECB" :
  // - Wise: prix marché temps réel (mid-market), updates multiples/seconde — match exactement ce qu'on voit sur Google/XE
  // - Yahoo Finance: prix marché chart, temps réel pendant les heures de trading
  // - currency-api (fawazahmed0): community, multi-updates/jour, taux moyens — peut être en retard de 1-2h
  // - open-er-api: daily, mid-market
  // - frankfurter: BCE officielle, 1 update/jour vers 16h CET
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
