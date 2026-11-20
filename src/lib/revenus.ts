import { Month, RevenuEntry } from './types';
import { MOIS_LIST, monthIndexOf, monthYearSuffix, isLegacyEarnMonth } from './constants';

/**
 * TABLE REVENUS — indexée par PÉRIODE CALENDAIRE (année + mois), pas par id de mois tracker.
 *
 * Format de stockage (`state.revenus.months`), inchangé pour l'existant :
 *   - année de base (2026) : clé = nom du mois seul      → « OCTOBRE »
 *   - toute autre année    : clé = nom + année 2 chiffres → « JANVIER 27 »
 * Les clés historiques sans suffixe SONT donc déjà au bon format : aucune migration,
 * aucune réécriture des données. Tout passe par les helpers ci-dessous — jamais de
 * `revenus.months[nom]` en dur ailleurs, sinon 2026 et 2027 se mélangent.
 *
 * Avant : la table n'avait pas d'année (« l'année en cours » implicite). Dès janvier
 * 2027, les revenus de janvier 2026 auraient été lus comme ceux de janvier 2027 et tous
 * les mois de 2026 seraient devenus « à venir ».
 */
export const REV_BASE_YEAR = 2026;

/** Dernière période « legacy » (février 2026 inclus) : ces mois lisent `Month.earn`. */
const LEGACY_EARN_LAST = 2026 * 12 + 1;

export interface RevPeriod { year: number; idx: number }

/** Période désignée par une clé de la table ; null si le nom de mois n'est pas reconnu. */
export function revKeyPeriod(key: string): RevPeriod | null {
  const idx = monthIndexOf(key);
  if (idx < 0) return null;
  return { year: monthYearSuffix(key) ?? REV_BASE_YEAR, idx };
}

/** Clé de stockage canonique d'une période. */
export function revKey(year: number, idx: number): string {
  const name = MOIS_LIST[idx];
  return year === REV_BASE_YEAR ? name : `${name} ${String(year).slice(-2)}`;
}

function findRevKey(months: Record<string, RevenuEntry[]>, year: number, idx: number): string | undefined {
  const canonical = revKey(year, idx);
  if (months[canonical]) return canonical;
  // Tolérance : clé sans accent (« FEVRIER ») ou suffixe à 4 chiffres (« JANVIER 2027 »)
  return Object.keys(months).find(k => {
    const p = revKeyPeriod(k);
    return !!p && p.year === year && p.idx === idx;
  });
}

/**
 * Clé à utiliser pour LIRE ou ÉCRIRE une période : celle déjà présente dans la table si
 * elle existe (même sous une variante d'écriture), sinon la clé canonique.
 */
export function resolveRevKey(
  months: Record<string, RevenuEntry[]> | undefined,
  year: number,
  idx: number,
): string {
  return findRevKey(months || {}, year, idx) ?? revKey(year, idx);
}

/**
 * La table d'UNE année, indexée par nom de mois (« OCTOBRE ») — la forme que manipulent
 * les pages Revenus. Seuls les mois qui ont une clé dans la table y figurent.
 */
export function revYearView(
  months: Record<string, RevenuEntry[]> | undefined,
  year: number,
): Record<string, RevenuEntry[]> {
  const out: Record<string, RevenuEntry[]> = {};
  if (!months) return out;
  MOIS_LIST.forEach((name, idx) => {
    const key = findRevKey(months, year, idx);
    if (key) out[name] = months[key] || [];
  });
  return out;
}

/**
 * Années proposées dans la page Revenus : celles qui ont des données, l'année en cours,
 * et l'année suivante à partir d'octobre (pour saisir les prévisions de janvier).
 */
export function revYears(months: Record<string, RevenuEntry[]> | undefined, now: Date = new Date()): number[] {
  const years = new Set<number>([now.getFullYear()]);
  if (now.getMonth() >= 9) years.add(now.getFullYear() + 1);
  Object.entries(months || {}).forEach(([k, es]) => {
    const p = revKeyPeriod(k);
    if (p && (es || []).length > 0) years.add(p.year);
  });
  return Array.from(years).sort((a, b) => a - b);
}

/**
 * Un mois pas encore commencé : ses entrées (saisies en prévision) restent consultables
 * dans l'onglet du mois, mais ne comptent dans AUCUNE stat annuelle (totaux, moyennes,
 * % objectif, par source, par client). En septembre, les stats vont de janvier à
 * septembre inclus ; une année passée compte en entier, une année future pas du tout.
 */
export function isFutureRevMonth(name: string, year: number, now: Date = new Date()): boolean {
  const idx = monthIndexOf(name);
  if (idx < 0) return false;
  return year * 12 + idx > now.getFullYear() * 12 + now.getMonth();
}

/** Nom du mois calendaire courant — onglet d'atterrissage de la page Revenus. */
export function currentRevMonth(now: Date = new Date()): string {
  return MOIS_LIST[now.getMonth()];
}

/**
 * Période calendaire d'un mois TRACKER. L'année vient de `_year` (calculé par
 * `detectYears`, tenu à jour par AppProvider), à défaut du suffixe de l'id. null si le
 * nom n'est pas un mois reconnu ou si l'année est inconnue.
 */
export function monthPeriod(m: Month): RevPeriod | null {
  const idx = monthIndexOf(m.id);
  const year = m._year ?? monthYearSuffix(m.id);
  if (idx < 0 || year == null) return null;
  return { year, idx };
}

/**
 * Un mois « legacy » (octobre 2025 → février 2026) lit son revenu dans `Month.earn`, PAS
 * dans la table Revenus. Critère par PÉRIODE : avant, c'était par nom (« DECEMBRE »,
 * insensible aux accents) — le « DÉCEMBRE » de 2026 était donc pris pour un mois legacy
 * et affichait 0 revenu confirmé. Année inconnue → ancien critère par nom.
 */
export function isLegacyMonth(m: Month): boolean {
  const p = monthPeriod(m);
  if (p) return p.year * 12 + p.idx <= LEGACY_EARN_LAST;
  return isLegacyEarnMonth(m.id);
}

/**
 * Entrées Revenus d'un mois TRACKER — à utiliser partout à la place de
 * `revenus.months[m.id]`. Résolution par période calendaire : « OCTOBRE 26 » (tracker)
 * lit la clé « OCTOBRE » (2026), « JANVIER 27 » lit « JANVIER 27 ». Un mois au nom libre
 * (ou sans année connue) garde l'ancien comportement : clé exacte.
 */
export function monthRevenus(
  revenusMonths: Record<string, RevenuEntry[]> | undefined,
  m: Month,
): RevenuEntry[] {
  if (!revenusMonths) return [];
  const p = monthPeriod(m);
  if (!p) return revenusMonths[m.id] || [];
  const key = findRevKey(revenusMonths, p.year, p.idx);
  return key ? revenusMonths[key] || [] : [];
}

/** Taux officiel USD→AED (peg) — défaut du taux de swap d'une entrée Revenus en USD. */
export const USD_AED_PEG = 3.6725;

export const isRevConfirmed = (e: RevenuEntry) => !e.status || e.status === 'confirmed';
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Une entrée Revenus au taux EUR/AED donné — même convention que la saisie (cf.
 * `buildRevenuEntry`) : `cashed`/`contracted` en EUR, `rate` = AED crédité ÷ EUR, pour
 * que `cashed × rate` redonne l'AED exact.
 * - EUR : l'EUR est fixe, l'AED en découle (rate = taux donné).
 * - USD : l'AED est fixe (montant × taux de swap, le dirham est peggé au dollar) ; l'EUR
 *   vaut montant ÷ EUR/USD, EUR/USD étant dérivé du taux EUR/AED via le peg — pas besoin
 *   d'un second taux live, et le tracker (qui n'a que l'EUR/AED) donne le même résultat.
 * - AED : l'AED est fixe, l'EUR en découle.
 * Entrée non-EUR sans montant d'origine (ancien format) : rien de recalculable, inchangée.
 */
export function revenuAtRate(e: RevenuEntry, eurAed: number): RevenuEntry {
  if (!(eurAed > 0)) return e;
  const cur = e.currency || 'EUR';
  if (cur === 'EUR') return { ...e, rate: eurAed };
  if (e.origAmount == null) return e;
  const perEur = cur === 'USD' ? eurAed / USD_AED_PEG : eurAed;
  const aed = cur === 'USD' ? e.origAmount * (e.origToAed || USD_AED_PEG) : e.origAmount;
  const cashed = round2(e.origAmount / perEur);
  return {
    ...e,
    cashed,
    contracted: e.origContracted != null ? round2(e.origContracted / perEur) : e.contracted,
    origRate: Math.round(perEur * 100000) / 100000,
    rate: cashed > 0 ? Math.round((aed / cashed) * 100000) / 100000 : eurAed,
  };
}

/**
 * Entrée Revenus telle qu'affichée et sommée. Confirmée → figée (valeurs stockées, taux
 * du jour de la confirmation). Prévision / en attente → recalculée au taux du jour, comme
 * le budget du tracker : sinon une prévision saisie des semaines à l'avance (récurrence
 * hebdo) gardait le taux du jour de saisie. La confirmation fige ces mêmes valeurs
 * (`revenuAtRate` au taux live, cf. `confirmRevenu`) → aucun saut au moment de confirmer.
 */
export function revenuLive(e: RevenuEntry, eurAed: number): RevenuEntry {
  return isRevConfirmed(e) ? e : revenuAtRate(e, eurAed);
}

/** `revenuLive` sur toute une table — pour la LECTURE uniquement (jamais réécrite en base). */
export function revenusMonthsLive(
  months: Record<string, RevenuEntry[]> | undefined,
  eurAed: number,
): Record<string, RevenuEntry[]> {
  const out: Record<string, RevenuEntry[]> = {};
  Object.entries(months || {}).forEach(([k, es]) => { out[k] = (es || []).map(e => revenuLive(e, eurAed)); });
  return out;
}

/**
 * Revenus confirmés d'un mois tracker en AED (devise locale) : AED réellement crédité
 * de chaque entrée (`cashed × rate`), ou `m.earn × m.rate` pour un mois legacy. Même
 * calcul que `monthBankBalance` — desktop ET mobile passent par là (le mobile faisait
 * `EUR × m.rate`, soit le taux de création du mois : −233 AED sur septembre 2026).
 */
export function monthRevenuConfirmedAed(
  m: Month,
  revenusMonths: Record<string, RevenuEntry[]> | undefined,
  fallbackRate: number,
): number {
  if (isLegacyMonth(m)) return (m.earn || 0) * m.rate;
  return monthRevenus(revenusMonths, m)
    .filter(isRevConfirmed)
    .reduce((s, e) => s + (e.cashed || 0) * (e.rate || fallbackRate), 0);
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
  if (isLegacyMonth(m)) return m.earn || 0;
  return monthRevenus(revenusMonths, m)
    .filter(isRevConfirmed)
    .reduce((s, e) => s + (e.cashed || 0), 0);
}

// ─── Saisie : formulaire → entrée stockée, et écritures dans la table ───────────────
// Fonctions pures, partagées par les pages Revenus desktop et mobile (via useRevenus) :
// une seule implémentation, donc plus d'écart de calcul entre les deux affichages.

/** Taux nécessaires à la conversion d'un formulaire : EUR/AED live et EUR/USD. */
export interface RevRates { liveRate: number; usdRate: number }

/** 1 EUR = N unités de la devise du formulaire. */
export function revFormPerEur(f: RevenuEntry, r: RevRates): number {
  const c = f.currency || 'EUR';
  if (c === 'EUR') return 1;
  if (c === 'AED') return f.rate || r.liveRate;   // le champ EUR/AED fait foi
  return f.origRate || r.usdRate;                 // USD : EUR/USD (officiel)
}

/** AED crédité au compte pour `amount` unités de la devise du formulaire. */
export function revFormAed(f: RevenuEntry, amount: number, r: RevRates): number {
  const c = f.currency || 'EUR';
  if (c === 'EUR') return amount * (f.rate || r.liveRate);
  if (c === 'AED') return amount;                 // déjà en AED
  return amount * (f.origToAed || USD_AED_PEG);   // USD : taux de swap USD→AED saisi
}

/**
 * Formulaire (montants dans `form.currency`) → entrée stockée. `cashed`/`contracted`
 * sont TOUJOURS en EUR en base ; `rate` = AED crédité ÷ EUR encaissé (dérivé), pour que
 * `cashed × rate` donne exactement l'AED voulu (USD : montant × taux de swap saisi).
 */
export function buildRevenuEntry(form: RevenuEntry, r: RevRates): RevenuEntry {
  const cur = form.currency || 'EUR';
  const perEur = revFormPerEur(form, r);
  const cashedEur = round2((form.cashed || 0) / perEur);
  const aed = revFormAed(form, form.cashed || 0, r);
  return {
    ...form,
    currency: cur,
    contracted: round2((form.contracted || 0) / perEur),
    cashed: cashedEur,
    origAmount: cur !== 'EUR' ? (form.cashed || 0) : undefined,
    origContracted: cur !== 'EUR' ? (form.contracted || 0) : undefined,
    origRate: cur !== 'EUR' ? perEur : undefined,
    origToAed: cur === 'USD' ? (form.origToAed || USD_AED_PEG) : undefined,
    rate: cashedEur > 0 ? Math.round((aed / cashedEur) * 100000) / 100000 : (form.rate || r.liveRate),
  };
}

/** Entrée stockée → valeurs du formulaire d'édition (dans la devise d'origine). */
export function revenuToForm(e: RevenuEntry): RevenuEntry {
  // Pré-remplit dans la devise d'origine (orig*) pour éviter toute double conversion :
  // buildRevenuEntry reconvertira en EUR avec le même origRate → sauvegarder sans rien
  // changer est neutre.
  if (e.currency && e.currency !== 'EUR' && e.origAmount != null) {
    return { ...e, cashed: e.origAmount, contracted: e.origContracted ?? e.contracted };
  }
  return { ...e, currency: 'EUR' };
}

type RevTable = Record<string, RevenuEntry[]>;

/**
 * Ajoute une entrée (et ses copies de récurrence hebdo, une par date de `repeatDates`,
 * sauf si une entrée identique existe déjà ce jour-là). Retourne la nouvelle table et le
 * nombre d'entrées réellement ajoutées. Ne modifie jamais la table reçue.
 */
export function addRevenu(
  months: RevTable | undefined, key: string, entry: RevenuEntry, repeatDates: string[] = [],
): { months: RevTable; added: number } {
  const out = { ...(months || {}) };
  const cur = out[key] || [];
  const clones = repeatDates
    .filter(d => !cur.some(e => e.date === d && e.client === entry.client && e.cashed === entry.cashed))
    .map(d => ({ ...entry, date: d }));
  out[key] = [...cur, entry, ...clones];
  return { months: out, added: 1 + clones.length };
}

/** Retire l'entrée `idx` de la clé ; la clé disparaît si elle devient vide. */
export function removeRevenu(months: RevTable | undefined, key: string, idx: number): RevTable {
  const out = { ...(months || {}) };
  const rest = (out[key] || []).filter((_, i) => i !== idx);
  if (rest.length === 0) delete out[key];
  else out[key] = rest;
  return out;
}

/**
 * Remplace l'entrée `idx` de `fromKey`. Si `toKey` désigne une autre période (mois ou
 * année changés dans le formulaire), l'entrée y est déplacée.
 */
export function updateRevenu(
  months: RevTable | undefined, fromKey: string, idx: number, entry: RevenuEntry, toKey: string = fromKey,
): RevTable {
  if (toKey !== fromKey) return addRevenu(removeRevenu(months, fromKey, idx), toKey, entry).months;
  const out = { ...(months || {}) };
  out[fromKey] = (out[fromKey] || []).map((e, i) => (i === idx ? entry : e));
  return out;
}

/**
 * Confirme une prévision / entrée en attente en FIGEANT ses valeurs au taux du jour —
 * celles que la liste affichait déjà (cf. revenuLive). EUR : l'AED suit le live ;
 * USD/AED : l'AED crédité reste celui du montant d'origine × taux de swap.
 */
export function confirmRevenu(
  months: RevTable | undefined, key: string, idx: number, eurAed: number,
): { months: RevTable; frozen: RevenuEntry | undefined } {
  const before = months?.[key]?.[idx];
  if (!before) return { months: { ...(months || {}) }, frozen: undefined };
  const frozen: RevenuEntry = { ...revenuAtRate(before, eurAed), status: 'confirmed' };
  return { months: updateRevenu(months, key, idx, frozen), frozen };
}
