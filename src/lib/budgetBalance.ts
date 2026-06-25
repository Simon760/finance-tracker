import { Month, Poste } from './types';
import { toEur } from './utils';

export interface PosteDelta {
  name: string;
  budgetEur: number;
  actualEur: number;
  delta: number;       // budget - actual : >0 = marge, <0 = dépassement
  isExtra?: boolean;   // true si c'est un extra budgété (pas un poste régulier)
}

export interface NonPrevuItem {
  name: string;
  actualEur: number;
}

export interface BudgetBalance {
  // Prévu = postes réguliers (non masqués) + extras BUDGÉTÉS (ligne extraBudget)
  prevuBudgetEur: number;
  prevuActualEur: number;
  prevuNet: number;          // prevuBudget - prevuActual : >0 = marge sur le prévu
  overruns: PosteDelta[];    // dépassements (actual > budget), triés desc par ampleur
  margins: PosteDelta[];     // marges (actual < budget), triés desc
  overrunTotal: number;      // somme des dépassements (positif)
  marginTotal: number;       // somme des marges (positif)

  // Non prévu = extraActual SANS ligne extraBudget (ajoutés sans budget)
  nonPrevu: NonPrevuItem[];  // triés desc par montant
  nonPrevuActualEur: number;
  nonPrevuNet: number;       // = -nonPrevuActualEur (coût pur)

  // Global (hors charges fixes — donc PAS forcément === bE - aE)
  globalNet: number;         // prevuNet + nonPrevuNet sur le périmètre pilotable
  hasNonPrevu: boolean;
  excludedFixed: string[];   // noms des charges fixes exclues du bilan
}

/** Postes considérés "charges fixes" par défaut (si le flag fixed n'est pas explicite). */
const DEFAULT_FIXED = new Set(['WIFI', 'FORFAIT MOBILE', 'LOYER', 'DEWA']);
function normName(s: string): string {
  return s.trim().normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '').toUpperCase();
}
/** Un poste est "fixe" (exclu du Bilan) si fixed===true, ou par défaut selon son nom. */
export function isPosteFixed(p: Poste): boolean {
  if (typeof p.fixed === 'boolean') return p.fixed;
  return DEFAULT_FIXED.has(normName(p.name));
}

export function computeBudgetBalance(m: Month, postes: Poste[], liveRate: number): BudgetBalance {
  const hidden = m.hiddenPostes || [];

  let prevuBudgetEur = 0;
  let prevuActualEur = 0;
  const overruns: PosteDelta[] = [];
  const margins: PosteDelta[] = [];

  const classify = (name: string, budgetEur: number, actualEur: number, isExtra: boolean) => {
    const delta = budgetEur - actualEur;
    if (budgetEur <= 0 && actualEur <= 0) return;
    const entry: PosteDelta = { name, budgetEur, actualEur, delta, isExtra };
    if (delta < -0.005) overruns.push(entry);
    else if (delta > 0.005) margins.push(entry);
  };

  // 1. Postes réguliers (non masqués, hors charges fixes)
  //    Budget ET réel convertis au taux live (postes AED) → la comparaison est en AED,
  //    l'EUR n'est qu'un affichage au taux du jour (dynamique + cohérent).
  //    Les charges fixes (loyer, abos...) sont exclues : payées quoi qu'il arrive,
  //    elles fausseraient la marge pilotable.
  const excludedFixed: string[] = [];
  postes.forEach((p, i) => {
    if (hidden.includes(p.name)) return;
    if (isPosteFixed(p)) { excludedFixed.push(p.name); return; }
    const brow = m.budget?.[i] || { aed: 0, eur: null };
    const arow = m.actual?.[i] || { aed: 0, eur: null };
    // Budget ET réel au taux live → comparaison en AED, EUR = AED/taux du jour (cohérent)
    const budgetEur = p.isAed ? toEur(brow.aed, liveRate) : (brow.eur || 0);
    const actualEur = p.isAed ? toEur(arow.aed, liveRate) : (arow.eur || 0);
    prevuBudgetEur += budgetEur;
    prevuActualEur += actualEur;
    classify(p.name, budgetEur, actualEur, false);
  });

  // 2. Extras BUDGÉTÉS (toute ligne extraBudget) → comptent dans le "prévu"
  const extraBudgets = m.extraBudget || [];
  const extraActuals = m.extraActual || [];
  const budgetedNames = new Set(extraBudgets.map(b => b.name));
  extraBudgets.forEach(b => {
    const budgetEur = b.aed > 0 ? toEur(b.aed, liveRate) : (b.eur || 0);
    const aRow = extraActuals.find(a => a.name === b.name);
    const actualEur = aRow ? (aRow.aed > 0 ? toEur(aRow.aed, liveRate) : (aRow.eur || 0)) : 0;
    prevuBudgetEur += budgetEur;
    prevuActualEur += actualEur;
    classify(b.name, budgetEur, actualEur, true);
  });

  // 3. Extras NON budgétés (extraActual sans extraBudget homonyme) → "non prévu"
  const nonPrevu: NonPrevuItem[] = [];
  let nonPrevuActualEur = 0;
  extraActuals.forEach(a => {
    if (budgetedNames.has(a.name)) return; // déjà compté dans le prévu
    const actualEur = a.aed > 0 ? toEur(a.aed, liveRate) : (a.eur || 0);
    nonPrevuActualEur += actualEur;
    if (actualEur > 0.005) nonPrevu.push({ name: a.name, actualEur });
  });

  overruns.sort((a, b) => a.delta - b.delta);   // dépassement le plus fort d'abord (delta le + négatif)
  margins.sort((a, b) => b.delta - a.delta);    // marge la plus forte d'abord
  nonPrevu.sort((a, b) => b.actualEur - a.actualEur);

  const overrunTotal = overruns.reduce((s, p) => s - p.delta, 0);
  const marginTotal = margins.reduce((s, p) => s + p.delta, 0);
  const prevuNet = Math.round((prevuBudgetEur - prevuActualEur) * 100) / 100;
  const nonPrevuNet = Math.round((-nonPrevuActualEur) * 100) / 100;
  // globalNet dérivé des totaux BRUTS pour matcher exactement round(bE - aE) de la ligne TOTAL
  const globalNet = Math.round((prevuBudgetEur - (prevuActualEur + nonPrevuActualEur)) * 100) / 100;

  return {
    prevuBudgetEur, prevuActualEur, prevuNet,
    overruns, margins, overrunTotal, marginTotal,
    nonPrevu, nonPrevuActualEur, nonPrevuNet,
    globalNet,
    hasNonPrevu: nonPrevu.length > 0,
    excludedFixed,
  };
}

/** Phrase explicative selon la situation. */
export function budgetBalanceMessage(b: BudgetBalance): { tone: 'good' | 'warn' | 'bad'; text: string } {
  const fmt = (n: number) => `${Math.abs(n).toFixed(0)} €`;
  if (b.globalNet >= -0.5) {
    if (b.hasNonPrevu) {
      return {
        tone: 'good',
        text: `Tu es dans ton budget global (+${fmt(b.globalNet)} de marge), malgré ${fmt(b.nonPrevuActualEur)} d'imprévus absorbés par tes marges sur les postes prévus.`,
      };
    }
    return { tone: 'good', text: `Tu es dans ton budget global avec +${fmt(b.globalNet)} de marge.` };
  }
  // Dépassement global
  if (b.prevuNet >= -0.5) {
    return {
      tone: 'warn',
      text: `Sur tes postes prévus tu serais à +${fmt(b.prevuNet)}. Le dépassement de ${fmt(b.globalNet)} vient entièrement des imprévus (−${fmt(b.nonPrevuActualEur)}).`,
    };
  }
  if (!b.hasNonPrevu) {
    return {
      tone: 'bad',
      text: `Tu dépasses de ${fmt(b.globalNet)}, dû à tes postes prévus eux-mêmes (−${fmt(b.prevuNet)}).`,
    };
  }
  return {
    tone: 'bad',
    text: `Tu dépasses de ${fmt(b.globalNet)} : −${fmt(b.prevuNet)} sur tes postes prévus ET −${fmt(b.nonPrevuActualEur)} d'imprévus non budgétés.`,
  };
}
