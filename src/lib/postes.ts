import { Month, Poste, BudgetRow, ActualRow, Transaction } from './types';

/**
 * OPÉRATIONS DE STRUCTURE SUR LES POSTES RÉGULIERS.
 *
 * Un poste régulier est une COLONNE partagée par tous les mois : `month.budget[i]` et
 * `month.actual[i]` appartiennent à `postes[i]`, les lignes ne portent pas de nom. Tout
 * ce qui retire, déplace ou fusionne un poste doit donc appliquer exactement le même
 * mouvement aux lignes de CHAQUE mois — sinon les montants glissent d'un poste à l'autre
 * sans aucune erreur visible (c'est ce qui avait décalé des mois entiers par le passé).
 *
 * Ces trois opérations sont les SEULS endroits qui ont le droit de le faire. Fonctions
 * pures (ne modifient jamais leurs arguments) et testées sur cet invariant d'alignement
 * (cf. __tests__/postes.test.ts). Réglages et l'outil d'audit passent par elles.
 */

const emptyBudget = (): BudgetRow => ({ aed: 0, eur: null });
const emptyActual = (): ActualRow => ({ aed: 0, eur: null });

/** Copie des lignes, complétée jusqu'à `len` : jamais de trou ni de ligne absente. */
function padRows<T>(rows: T[] | undefined, len: number, make: () => T): T[] {
  const out = [...(rows || [])];
  for (let i = 0; i < len; i++) if (!out[i]) out[i] = make();
  return out;
}

type Structure = { postes: Poste[]; months: Month[] };

/** Applique la même transformation aux lignes budget et réel de chaque mois. */
function mapRows(
  months: Month[], len: number,
  fn: (budget: BudgetRow[], actual: ActualRow[]) => void,
): Month[] {
  return months.map(mo => {
    const budget = padRows(mo.budget, len, emptyBudget);
    const actual = padRows(mo.actual, len, emptyActual);
    fn(budget, actual);
    return { ...mo, budget, actual };
  });
}

/** Supprime le poste `idx` et SA ligne (budget + réel) dans tous les mois. */
export function removePosteAt(postes: Poste[], months: Month[], idx: number): Structure {
  if (idx < 0 || idx >= postes.length) return { postes, months };
  return {
    postes: postes.filter((_, i) => i !== idx),
    months: mapRows(months, postes.length, (budget, actual) => {
      budget.splice(idx, 1);
      actual.splice(idx, 1);
    }),
  };
}

/** Échange deux postes, et leurs lignes dans tous les mois. */
export function swapPostes(postes: Poste[], months: Month[], i: number, j: number): Structure {
  const ok = (n: number) => n >= 0 && n < postes.length;
  if (!ok(i) || !ok(j) || i === j) return { postes, months };
  const next = [...postes];
  [next[i], next[j]] = [next[j], next[i]];
  return {
    postes: next,
    months: mapRows(months, postes.length, (budget, actual) => {
      [budget[i], budget[j]] = [budget[j], budget[i]];
      [actual[i], actual[j]] = [actual[j], actual[i]];
    }),
  };
}

/**
 * Fusionne plusieurs postes en un seul (le premier index de `idxs` est conservé) : dans
 * chaque mois, budgets et réels sont SOMMÉS, les transactions concaténées, puis les
 * autres postes et leurs lignes sont retirés.
 */
export function mergePostes(postes: Poste[], months: Month[], idxs: number[]): Structure {
  const valid = Array.from(new Set(idxs)).filter(i => i >= 0 && i < postes.length);
  if (valid.length < 2) return { postes, months };
  const keep = valid[0];
  const drop = valid.slice(1).sort((a, b) => b - a); // décroissant : splice sans décalage
  return {
    postes: postes.filter((_, i) => !drop.includes(i)),
    months: mapRows(months, postes.length, (budget, actual) => {
      const b = valid.map(i => budget[i]);
      const a = valid.map(i => actual[i]);
      const bEur = b.reduce((s, r) => s + (r.eur ?? 0), 0);
      const aEur = a.reduce((s, r) => s + (r.eur ?? 0), 0);
      const txns: Transaction[] = a.flatMap(r => r.txns || []);
      budget[keep] = { aed: b.reduce((s, r) => s + (r.aed || 0), 0), eur: bEur > 0 ? bEur : null };
      actual[keep] = { aed: a.reduce((s, r) => s + (r.aed || 0), 0), eur: aEur > 0 ? aEur : null, txns };
      drop.forEach(i => { budget.splice(i, 1); actual.splice(i, 1); });
    }),
  };
}
