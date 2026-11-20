import { Month, Poste, RecurringRule, RevenuEntry } from './types';
import { monthPeriod, resolveRevKey, buildRevenuEntry, RevRates } from './revenus';
import { makeTxn, addTxnsToPoste } from './txns';

/**
 * RÉCURRENCES — dépenses (loyer, abonnements) et revenus (client régulier) à date fixe.
 *
 * Une règle ne modifie jamais les données d'elle-même : elle PROPOSE ses occurrences
 * (`pendingExpenses` / `pendingRevenus`), que l'utilisateur ajoute d'un clic
 * (`applyExpenses` / `applyRevenus`) ou écarte (`skipOccurrences`).
 *
 * Pourquoi pas d'ajout silencieux à l'ouverture de l'app : tant qu'un appareil peut
 * encore écraser l'état d'un autre (pas de détection de conflit), une écriture
 * déclenchée par la simple ouverture d'un onglet périmé effacerait les saisies faites
 * ailleurs. Le clic garantit qu'on écrit depuis l'appareil qu'on est en train d'utiliser.
 *
 * Chaque élément généré porte `recur = idRègle@YYYY-MM-DD` : c'est ce qui rend l'ajout
 * idempotent (une occurrence déjà présente n'est jamais reproposée).
 */

export interface Occurrence {
  rule: RecurringRule;
  /** YYYY-MM-DD */
  date: string;
  /** Clé d'idempotence : `idRègle@date` */
  key: string;
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
export const occurrenceKey = (ruleId: string, date: string) => `${ruleId}@${date}`;

/**
 * Dates d'une règle dans un mois calendaire. Mensuelle : le jour demandé, ramené au
 * dernier jour si le mois est plus court (le 31 → 30 avril, 28 février). Hebdomadaire :
 * tous les jours de semaine correspondants. Rien avant `rule.from`.
 */
export function ruleDatesInMonth(rule: RecurringRule, year: number, idx: number): string[] {
  const lastDay = new Date(year, idx + 1, 0).getDate();
  let dates: string[] = [];
  if (rule.freq === 'monthly') {
    const day = Math.min(Math.max(1, Math.round(rule.day || 1)), lastDay);
    dates = [iso(year, idx, day)];
  } else {
    const wd = ((rule.weekday ?? 1) % 7 + 7) % 7;
    for (let d = 1; d <= lastDay; d++) {
      if (new Date(year, idx, d).getDay() === wd) dates.push(iso(year, idx, d));
    }
  }
  return rule.from ? dates.filter(d => d >= rule.from!) : dates;
}

function occurrences(rule: RecurringRule, year: number, idx: number): Occurrence[] {
  const skipped = new Set(rule.skipped || []);
  return ruleDatesInMonth(rule, year, idx)
    .map(date => ({ rule, date, key: occurrenceKey(rule.id, date) }))
    .filter(o => !skipped.has(o.key));
}

/**
 * Dépenses récurrentes ÉCHUES (date ≤ aujourd'hui) pas encore saisies dans ce mois du
 * tracker. Une dépense n'est proposée qu'une fois arrivée : l'ajouter d'avance gonflerait
 * le « Réel ». Règle ignorée si elle est inactive, si son poste n'existe plus ou s'il est
 * masqué ce mois-là.
 */
export function pendingExpenses(rules: RecurringRule[] | undefined, m: Month, postes: Poste[], today: string): Occurrence[] {
  const p = monthPeriod(m);
  if (!p) return [];
  const present = new Set<string>();
  [...(m.actual || []), ...(m.extraActual || [])].forEach(row => (row?.txns || []).forEach(t => { if (t.recur) present.add(t.recur); }));
  const hidden = m.hiddenPostes || [];
  return (rules || [])
    .filter(r => r.kind === 'expense' && r.active && r.amount > 0 && !!r.poste && postes.some(po => po.name === r.poste) && !hidden.includes(r.poste))
    .flatMap(r => occurrences(r, p.year, p.idx))
    .filter(o => o.date <= today && !present.has(o.key))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Ajoute les occurrences au mois : une transaction par occurrence, dans le poste de la règle. */
export function applyExpenses(m: Month, postes: Poste[], occs: Occurrence[], rate: number): Month {
  let out = m;
  occs.forEach(o => {
    const idx = postes.findIndex(po => po.name === o.rule.poste);
    if (idx < 0) return;
    const tx = makeTxn({
      label: o.rule.label, amount: o.rule.amount,
      currency: o.rule.currency === 'EUR' ? 'EUR' : 'AED',
      date: o.date, rate, recur: o.key,
    });
    out = addTxnsToPoste(out, idx, [tx], rate);
  });
  return out;
}

/**
 * Revenus récurrents du mois (année, index) pas encore dans la table Revenus. Toutes les
 * dates du mois sont proposées d'un coup, passées comme à venir : elles sont ajoutées en
 * PRÉVISION, ce qui n'affecte aucun total tant qu'elles ne sont pas confirmées.
 */
export function pendingRevenus(
  rules: RecurringRule[] | undefined,
  revenusMonths: Record<string, RevenuEntry[]> | undefined,
  year: number, idx: number,
): Occurrence[] {
  const key = resolveRevKey(revenusMonths, year, idx);
  const present = new Set((revenusMonths?.[key] || []).map(e => e.recur).filter(Boolean) as string[]);
  return (rules || [])
    .filter(r => r.kind === 'revenue' && r.active && r.amount > 0)
    .flatMap(r => occurrences(r, year, idx))
    .filter(o => !present.has(o.key))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Ajoute les occurrences à la table Revenus, en prévision, au taux du jour. */
export function applyRevenus(
  revenusMonths: Record<string, RevenuEntry[]> | undefined,
  year: number, idx: number, occs: Occurrence[], rates: RevRates,
): Record<string, RevenuEntry[]> {
  const out = { ...(revenusMonths || {}) };
  if (occs.length === 0) return out;
  const key = resolveRevKey(revenusMonths, year, idx);
  const entries = occs.map(o => ({
    ...buildRevenuEntry({
      date: o.date, client: o.rule.label, cat: o.rule.cat || '',
      contracted: o.rule.amount, cashed: o.rule.amount, comment: '',
      rate: rates.liveRate, status: 'preview', currency: o.rule.currency,
    }, rates),
    recur: o.key,
  }));
  out[key] = [...(out[key] || []), ...entries];
  return out;
}

/** Écarte des occurrences : elles ne seront plus proposées (la règle reste active). */
export function skipOccurrences(rules: RecurringRule[] | undefined, occs: Occurrence[]): RecurringRule[] {
  const byRule = new Map<string, string[]>();
  occs.forEach(o => byRule.set(o.rule.id, [...(byRule.get(o.rule.id) || []), o.key]));
  return (rules || []).map(r => (byRule.has(r.id)
    ? { ...r, skipped: Array.from(new Set([...(r.skipped || []), ...byRule.get(r.id)!])) }
    : r));
}

const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
/** « le 5 du mois » / « chaque vendredi » */
export function ruleSchedule(rule: RecurringRule): string {
  return rule.freq === 'monthly' ? `le ${rule.day || 1} du mois` : `chaque ${WEEKDAYS[((rule.weekday ?? 1) % 7 + 7) % 7]}`;
}
