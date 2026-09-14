import { Month, BudgetRow, ActualRow, ExtraRow, Trip, Poste, RevenuEntry, Transaction } from './types';
import { isLegacyEarnMonth, monthBaseName, monthYearSuffix, monthIndexOf, MOIS_LIST } from './constants';

/**
 * Table Revenus (`state.revenus.months`) : les mois sont indexés par NOM seul
 * (« OCTOBRE »), sans année — la page Revenus est implicitement « l'année en cours ».
 * Un mois dont l'index calendaire dépasse celui d'aujourd'hui n'a donc PAS commencé :
 * ses entrées (saisies en prévision) restent consultables dans l'onglet du mois, mais
 * ne comptent dans AUCUNE stat annuelle (totaux, moyennes, % objectif, par source,
 * par client). Si on est en septembre, les stats vont de janvier à septembre inclus.
 */
export function isFutureRevMonth(name: string, now: Date = new Date()): boolean {
  const idx = monthIndexOf(name);
  return idx >= 0 && idx > now.getMonth();
}

/** Nom (clé Revenus) du mois calendaire courant — onglet d'atterrissage de la page Revenus. */
export function currentRevMonth(now: Date = new Date()): string {
  return MOIS_LIST[now.getMonth()];
}

/**
 * Entrées Revenus d'un mois TRACKER — à utiliser partout à la place de
 * `revenus.months[m.id]`. La table Revenus est indexée par NOM seul (« OCTOBRE »),
 * alors qu'un mois tracker peut porter un suffixe année (« OCTOBRE 26 », cf. Identité
 * des mois) : la clé exacte n'existe alors jamais et le tracker affichait 0 revenu.
 *
 * Résolution : clé exacte si présente ; sinon, pour un mois suffixé, repli sur le nom
 * de base — UNIQUEMENT si l'homonyme sans suffixe est un mois legacy (il lit `m.earn`
 * et ne consomme jamais la table). Sans ce garde-fou, « MARS » et « MARS 27 » liraient
 * la même clé et les mêmes revenus compteraient deux fois. Couvre donc OCTOBRE 26 →
 * FÉVRIER 27 ; à partir de MARS 27 la table Revenus devra porter l'année.
 */
export function monthRevenus(
  revenusMonths: Record<string, RevenuEntry[]> | undefined,
  monthId: string,
): RevenuEntry[] {
  if (!revenusMonths) return [];
  const exact = revenusMonths[monthId];
  if (exact) return exact;
  if (monthYearSuffix(monthId) === null) return [];
  const base = monthBaseName(monthId);
  if (!isLegacyEarnMonth(base)) return [];
  const idx = monthIndexOf(base);
  // Clés de la table avec ou sans accent (« FÉVRIER » vs « FEVRIER ») → comparaison par index
  const key = Object.keys(revenusMonths).find(k => monthYearSuffix(k) === null && monthIndexOf(k) === idx);
  return key ? revenusMonths[key] || [] : [];
}

/**
 * Revenus confirmés d'un mois tracker en EUR : `m.earn` pour un mois legacy, sinon la
 * somme des entrées confirmées de la table (résolues par `monthRevenus`). C'est LA
 * valeur « Revenus » du tracker ; les totaux (Vue Globale) la somment mois par mois
 * pour rester réconciliables avec lui.
 */
export function monthRevenuConfirmedEur(
  m: Month,
  revenusMonths: Record<string, RevenuEntry[]> | undefined,
): number {
  if (isLegacyEarnMonth(m.id)) return m.earn || 0;
  return monthRevenus(revenusMonths, m.id)
    .filter(e => !e.status || e.status === 'confirmed')
    .reduce((s, e) => s + (e.cashed || 0), 0);
}

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
 * Un id suffixé année (« OCTOBRE 26 », cf. inferNextMonthYear) ajoute un repère
 * ’26 — sinon deux Octobre de deux années différentes seraient identiques sur un
 * même graphe.
 */
export function shortMonth(id: string): string {
  const year = monthYearSuffix(id);
  const n = monthBaseName(id);
  let base: string;
  if (n.startsWith('JUIL')) base = 'JUIL';
  else if (n.startsWith('JUIN')) base = 'JUIN';
  else base = n.slice(0, 3);
  return year ? `${base} '${String(year).slice(2)}` : base;
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
  const entries = monthRevenus(revenusMonths, m.id);
  const earnLocal = isLegacyEarnMonth(m.id)
    ? (m.earn || 0) * m.rate
    : entries
        .filter(e => !e.status || e.status === 'confirmed')
        .reduce((sum: number, e: RevenuEntry) => sum + ((e.cashed || 0) * (e.rate || fallbackRate)), 0);
  const spentLocal = sumAedBank(m, postes, m.extraActual || []);
  return (m.soldeStart || 0) + earnLocal - spentLocal + (m.adjustment || 0);
}

/**
 * Variation RÉELLE du compte sur la période suivie : solde de départ → solde
 * d'aujourd'hui. Diffère de « entrées − sorties » de tous les mouvements bancaires
 * jamais saisis (l'écart se voit alors dans le sous-titre). Retourne aussi le net
 * des flux tracés sur la MÊME période, pour comparaison.
 *
 * `baseline` remplace le point de départ par un montant connu hors tracker — le
 * capital d'installation reconstitué depuis les relevés bancaires (cf.
 * INSTALL_CAPITAL). Sans lui, le départ est le soldeStart du premier mois renseigné,
 * ce qui ignore le mois d'arrivée et fait démarrer la mesure un mois trop tard.
 */
export function bankRealDelta(
  months: Month[],
  postes: Poste[],
  revenusMonths: Record<string, RevenuEntry[]> | undefined,
  fallbackRate: number,
  baseline?: { aed: number; label: string },
): { delta: number; flows: number; from: string | null; start: number } {
  const all = months || [];
  const tracked = all.filter(m => (m.soldeStart || 0) > 0);
  if (tracked.length === 0) return { delta: 0, flows: 0, from: null, start: 0 };
  const last = tracked[tracked.length - 1];
  const now = monthBankBalance(last, postes, revenusMonths, fallbackRate);

  // Avec un baseline (capital d'installation), la période démarre AVANT le premier
  // mois qui a un soldeStart : on somme alors les flux de tous les mois jusqu'au
  // dernier suivi — sinon le mois d'arrivée (soldeStart 0) serait ignoré.
  const scope = baseline ? all.slice(0, all.lastIndexOf(last) + 1) : tracked;
  const flows = scope.reduce((sum, m) => {
    const bal = monthBankBalance(m, postes, revenusMonths, fallbackRate);
    return sum + (bal - (m.soldeStart || 0)); // entrées − sorties du mois
  }, 0);

  const start = baseline ? baseline.aed : (tracked[0].soldeStart || 0);
  return { delta: now - start, flows, from: baseline ? baseline.label : tracked[0].id, start };
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

/**
 * AED réellement sorti du compte pour une ligne « Réel ».
 *
 * Les transactions stockent `amount` en AED, converti au taux du JOUR de la
 * saisie, alors que le mois porte son propre `rate`. Re-dériver l'AED depuis
 * l'EUR de la ligne au taux du mois ne redonne donc PAS le montant saisi :
 * une tx de 1 196 AED s'affichait 1 175. Dès qu'il y a des transactions, elles
 * font foi.
 *
 * Sans transaction, on garde exactement l'ancien repli, qui dépend de la devise
 * de référence du poste : un poste EUR peut traîner un `aed` figé à un vieux
 * taux (DÉCEMBRE/COURSES : aed=663 pour eur=184,32), c'est l'EUR qui fait foi.
 * `isAed` non fourni = ligne extra, qui stocke les deux devises à jour.
 *
 * `excludeTripExpense` sert au solde bancaire : une dépense de voyage ne
 * redébite pas le compte, le swap initial l'a déjà fait.
 */
export function rowAedSpent(
  row: { aed?: number; eur?: number | null; txns?: Transaction[] } | undefined,
  rate: number,
  opts: { isAed?: boolean; excludeTripExpense?: boolean } = {},
): number {
  const txns = row?.txns || [];
  if (txns.length > 0) {
    const list = opts.excludeTripExpense ? txns.filter(t => t.tripKind !== 'expense') : txns;
    return list.reduce((sum, t) => sum + (t.amount || 0), 0);
  }
  if (opts.isAed === true) return row?.aed || 0;
  if (opts.isAed === false) return toAed(rowEur(row as ActualRow, rate), rate);
  return (row?.aed || 0) > 0 ? (row?.aed || 0) : toAed(row?.eur || 0, rate);
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
    total += rowAedSpent(row, m.rate, { isAed: p.isAed, excludeTripExpense: true });
  });
  (extra || []).forEach(r => {
    total += rowAedSpent(r, m.rate, { excludeTripExpense: true });
  });
  return total;
}

export function sumAed(m: Month, postes: { isAed: boolean; name?: string }[], extra: ExtraRow[]): number {
  let total = 0;
  postes.forEach((p, i) => {
    if (isHidden(m, p.name)) return;
    const row = m.actual?.[i];
    if (!row) return;
    total += rowAedSpent(row, m.rate, { isAed: p.isAed });
  });
  (extra || []).forEach(r => {
    if (isSwapContainer(r)) return; // swap = transfert, pas une dépense
    total += rowAedSpent(r, m.rate);
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
  const yearSet = new Set<number>();
  if (months.length === 0) return [];

  const lastIdx = monthIndexOf(months[months.length - 1].id);
  const nowMonth = new Date().getMonth();
  let yr = new Date().getFullYear();
  if (lastIdx > nowMonth) yr = yr;

  let prevIdx = lastIdx;
  for (let i = months.length - 1; i >= 0; i--) {
    const idx = monthIndexOf(months[i].id);
    if (idx > prevIdx) yr--;
    prevIdx = idx;
    months[i]._year = yr;
    yearSet.add(yr);
  }
  return Array.from(yearSet).sort();
}

/**
 * Année à donner à un NOUVEAU mois dont le nom entre en collision avec un mois déjà
 * enregistré (ex: on recrée « OCTOBRE » un an après). Déterministe, aucune saisie
 * demandée à l'utilisateur : compare l'index calendaire du nouveau nom à celui du
 * dernier mois de la liste (l'ajout se fait toujours en fin de liste, cf. createMonth)
 * — postérieur ou égal dans l'année → même année que ce dernier mois, sinon année
 * suivante. `months` n'est PAS encore le nouveau mois, juste l'état avant création.
 */
export function inferNextMonthYear(months: Month[], name: string): number {
  if (months.length === 0) return new Date().getFullYear();
  detectYears(months); // s'assure que _year est à jour sur le dernier mois
  const last = months[months.length - 1];
  const lastYear = last._year ?? new Date().getFullYear();
  const lastIdx = monthIndexOf(last.id);
  const targetIdx = monthIndexOf(name);
  if (lastIdx < 0 || targetIdx < 0) return lastYear + 1;
  return targetIdx > lastIdx ? lastYear : lastYear + 1;
}
