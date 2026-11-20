import { Month, Poste } from './types';
import { monthIndexOf, monthYearSuffix } from './constants';
import { inferNextMonthYear } from './utils';

/** Pré-remplissage du budget d'un nouveau mois. */
export type MonthFill = 'copy' | 'avg3' | 'empty';

/**
 * Id à donner à un NOUVEAU mois à partir du nom saisi. Logique unique desktop + mobile.
 *
 * Un même nom revient chaque année : si le mois existe déjà, l'année (2 chiffres) est
 * suffixée automatiquement — « OCTOBRE » → « OCTOBRE 26 » — déduite du dernier mois de
 * la liste (cf. inferNextMonthYear), sans rien demander. La collision se juge sur le
 * MOIS CALENDAIRE, pas sur la chaîne exacte : avant, « DÉCEMBRE » ne collisionnait pas
 * avec « DECEMBRE » (accent) et se créait sans suffixe, d'où deux mois quasi homonymes.
 * Un nom saisi AVEC son année (« MARS 27 ») est respecté tel quel.
 */
export function newMonthId(months: Month[], rawName: string): { id: string } | { error: string } {
  const name = rawName.trim().toUpperCase();
  if (!name) return { error: 'Le nom ne peut pas être vide.' };
  const idx = monthIndexOf(name);
  const taken = (id: string) => months.some(mo => mo.id === id);
  const sameMonthExists = idx >= 0
    ? months.some(mo => monthIndexOf(mo.id) === idx)
    : taken(name);
  let id = name;
  if (sameMonthExists && monthYearSuffix(name) === null) {
    id = `${name} ${String(inferNextMonthYear(months, name)).slice(-2)}`;
  }
  if (taken(id)) return { error: `Un mois « ${id} » existe déjà. Renomme-le d'abord (crayon à côté du mois).` };
  return { id };
}

/**
 * Construit un nouveau mois (ajouté en FIN de liste). Ne modifie rien.
 * - `copy` : budget du dernier mois recopié ;
 * - `avg3` : budget = moyenne du RÉEL des 3 derniers mois (la réalité, pas le plan),
 *   à défaut le budget du dernier mois ;
 * - `empty` : budget à zéro.
 * Dans les deux premiers cas, le solde de départ reprend le solde de fin du dernier mois
 * s'il est renseigné. Les postes masqués du dernier mois le restent (un poste désactivé
 * « à partir de », cf. Réglages, ne réapparaît pas à chaque nouveau mois).
 */
export function buildNewMonth(
  months: Month[], postes: Poste[],
  opts: { id: string; rate: number; soldeStart: number; fill: MonthFill },
): Month {
  const last = months.length > 0 ? months[months.length - 1] : undefined;
  const m: Month = {
    id: opts.id, rate: opts.rate, earn: 0, soldeStart: opts.soldeStart, soldeEnd: 0,
    budget: [], actual: [], extraBudget: [], extraActual: [],
    hiddenPostes: last ? [...(last.hiddenPostes || [])] : [],
  };
  const fill: MonthFill = last ? opts.fill : 'empty';
  postes.forEach((_, i) => {
    if (fill === 'copy' && last) {
      m.budget.push({ aed: last.budget?.[i]?.aed || 0, eur: last.budget?.[i]?.eur ?? null });
    } else if (fill === 'avg3' && last) {
      const window = months.slice(-3);
      const aedVals = window.map(mo => mo.actual?.[i]?.aed || 0).filter(v => v > 0);
      const eurVals = window.map(mo => mo.actual?.[i]?.eur || 0).filter(v => v > 0);
      const aedAvg = aedVals.length ? aedVals.reduce((s, v) => s + v, 0) / aedVals.length : (last.budget?.[i]?.aed || 0);
      const eurAvg = eurVals.length ? eurVals.reduce((s, v) => s + v, 0) / eurVals.length : (last.budget?.[i]?.eur ?? null);
      m.budget.push({ aed: Math.round(aedAvg), eur: eurAvg ? Math.round(eurAvg * 100) / 100 : null });
    } else {
      m.budget.push({ aed: 0, eur: null });
    }
    m.actual.push({ aed: 0, eur: null });
  });
  if (fill !== 'empty' && last && last.soldeEnd > 0) m.soldeStart = last.soldeEnd;
  return m;
}
