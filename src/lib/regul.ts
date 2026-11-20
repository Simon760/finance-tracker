import { Month, RegulEntry } from './types';

/** Nombre max de régul conservées par mois (largement au-delà d'un usage réel). */
export const REGUL_CAP = 200;

/**
 * Régularise le prévisionnel d'un mois sur le solde RÉEL du compte : l'utilisateur saisit
 * ce que sa banque affiche, on en déduit l'ajustement à ajouter au calcul.
 *
 * `computedWithoutAdj` = prévisionnel HORS ajustement, soit solde de départ + revenus
 * confirmés − dépenses hors voyage (cf. `_old/js/pages/tracker.js`). L'ajustement est
 * statique : les transactions ajoutées ensuite continuent de faire bouger le
 * prévisionnel normalement.
 *
 * Chaque régul est aussi consignée dans `month.reguls` (solde réel + date) : c'est la
 * seule trace fiable du solde bancaire à une date donnée. Logique unique pour desktop et
 * mobile — le mobile ne consignait rien du tout.
 */
export function applyRegul(m: Month, realBalance: number, computedWithoutAdj: number, now: Date = new Date()): Month {
  const adjustment = Math.round((realBalance - computedWithoutAdj) * 100) / 100;
  const entry: RegulEntry = { ts: now.toISOString(), real: realBalance, adjustment };
  return {
    ...m,
    adjustment: adjustment === 0 ? undefined : adjustment,
    reguls: [...(m.reguls || []), entry].slice(-REGUL_CAP),
  };
}

/** Retire l'ajustement du mois. Le journal des régul passées est conservé. */
export function clearRegul(m: Month): Month {
  return { ...m, adjustment: undefined };
}

/** Régul du mois, de la plus récente à la plus ancienne. */
export function regulsNewestFirst(m: Month | undefined | null): RegulEntry[] {
  return [...(m?.reguls || [])].sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
}
