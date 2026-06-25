import { Month, Poste } from './types';
import { toEur, rowEur } from './utils';

export interface PosteDelta {
  name: string;
  budgetEur: number;
  actualEur: number;
  delta: number; // budget - actual : >0 = marge, <0 = dépassement
}

export interface ExtraDelta {
  name: string;
  budgetEur: number;   // 0 si pas de ligne budget correspondante
  actualEur: number;
  delta: number;       // budget - actual
  planned: boolean;    // true si une ligne extraBudget porte le même nom
}

export interface BudgetBalance {
  // Postes prévisionnels (state.postes non masqués)
  regBudgetEur: number;
  regActualEur: number;
  regNet: number;            // regBudget - regActual : >0 = marge globale sur le prévu
  overruns: PosteDelta[];    // postes en dépassement (actual > budget), triés desc par ampleur
  margins: PosteDelta[];     // postes avec marge (actual < budget), triés desc
  overrunTotal: number;      // somme des dépassements (valeur positive)
  marginTotal: number;       // somme des marges (valeur positive)

  // Extras (postes ajoutés en cours de mois)
  extras: ExtraDelta[];      // chaque extraActual avec son éventuel budget, triés desc par actual
  extraBudgetEur: number;
  extraActualEur: number;
  extraNet: number;          // extraBudget - extraActual : <0 = coût net des extras

  // Global
  globalNet: number;         // regNet + extraNet === bE - aE (réconcilie avec la ligne TOTAL)
  hasExtras: boolean;
}

/** EUR d'une ligne budget — réplique exacte de la logique de sumEurBudget par poste. */
function budgetRowEur(row: { aed: number; eur: number | null }, isAed: boolean, liveRate: number): number {
  return isAed ? toEur(row.aed, liveRate) : (row.eur || 0);
}

export function computeBudgetBalance(m: Month, postes: Poste[], liveRate: number): BudgetBalance {
  const hidden = m.hiddenPostes || [];

  let regBudgetEur = 0;
  let regActualEur = 0;
  const overruns: PosteDelta[] = [];
  const margins: PosteDelta[] = [];

  postes.forEach((p, i) => {
    if (hidden.includes(p.name)) return;
    const brow = m.budget?.[i] || { aed: 0, eur: null };
    const arow = m.actual?.[i] || { aed: 0, eur: null };
    const budgetEur = budgetRowEur(brow, p.isAed, liveRate);
    const actualEur = rowEur(arow, m.rate);
    regBudgetEur += budgetEur;
    regActualEur += actualEur;
    const delta = budgetEur - actualEur;
    // On ne liste que les postes qui ont une activité (budget ou réel non nul)
    if (budgetEur <= 0 && actualEur <= 0) return;
    const entry: PosteDelta = { name: p.name, budgetEur, actualEur, delta };
    if (delta < -0.005) overruns.push(entry);
    else if (delta > 0.005) margins.push(entry);
  });

  overruns.sort((a, b) => a.delta - b.delta);    // plus gros dépassement d'abord (delta le plus négatif)
  margins.sort((a, b) => b.delta - a.delta);     // plus grosse marge d'abord

  const overrunTotal = overruns.reduce((s, p) => s - p.delta, 0); // -delta = montant dépassé (positif)
  const marginTotal = margins.reduce((s, p) => s + p.delta, 0);
  const regNet = Math.round((regBudgetEur - regActualEur) * 100) / 100;

  // Extras : on part de extraActual (les dépenses réelles ajoutées), et on cherche un budget par nom
  const extraBudgets = m.extraBudget || [];
  const extras: ExtraDelta[] = [];
  let extraActualEur = 0;
  (m.extraActual || []).forEach(r => {
    const actualEur = r.eur > 0 ? r.eur : toEur(r.aed, m.rate);
    const bRow = extraBudgets.find(b => b.name === r.name);
    const budgetEur = bRow ? (bRow.eur > 0 ? bRow.eur : toEur(bRow.aed, liveRate)) : 0;
    extraActualEur += actualEur;
    if (actualEur <= 0 && budgetEur <= 0) return;
    extras.push({ name: r.name, budgetEur, actualEur, delta: budgetEur - actualEur, planned: !!bRow });
  });
  // Extras budgétés mais SANS dépense réelle (présents dans extraBudget, absents d'extraActual) :
  // ils comptent dans extraNet, donc on les liste aussi pour que le compte/détail soit cohérent
  // avec le headline (sinon "+500 € · 0 poste ajouté · 0 € dépensés").
  const actualNames = new Set((m.extraActual || []).map(r => r.name));
  extraBudgets.forEach(b => {
    if (actualNames.has(b.name)) return;
    const budgetEur = b.eur > 0 ? b.eur : toEur(b.aed, liveRate);
    if (budgetEur <= 0) return;
    extras.push({ name: b.name, budgetEur, actualEur: 0, delta: budgetEur, planned: true });
  });
  // extraBudgetEur = somme de TOUS les extraBudget (réconcilie avec sumEurBudget)
  const extraBudgetEur = extraBudgets.reduce((s, b) => s + (b.eur > 0 ? b.eur : toEur(b.aed, liveRate)), 0);
  extras.sort((a, b) => b.actualEur - a.actualEur);

  const extraNet = Math.round((extraBudgetEur - extraActualEur) * 100) / 100;
  // globalNet dérivé des totaux BRUTS (pas des deux moitiés déjà arrondies) pour
  // matcher exactement round(bE - aE) affiché par la ligne TOTAL — sinon ±0.01 de divergence.
  const globalNet = Math.round(((regBudgetEur + extraBudgetEur) - (regActualEur + extraActualEur)) * 100) / 100;

  return {
    regBudgetEur, regActualEur, regNet,
    overruns, margins, overrunTotal, marginTotal,
    extras, extraBudgetEur, extraActualEur, extraNet,
    globalNet,
    hasExtras: extras.length > 0 || extraBudgetEur > 0,
  };
}

/** Phrase explicative selon la situation. */
export function budgetBalanceMessage(b: BudgetBalance): { tone: 'good' | 'warn' | 'bad'; text: string } {
  const fmt = (n: number) => `${Math.abs(n).toFixed(0)} €`;
  if (b.globalNet >= -0.5) {
    // Dans le budget global
    if (b.hasExtras && b.extraNet < -0.5) {
      return {
        tone: 'good',
        text: `Tu es dans ton budget global (+${fmt(b.globalNet)} de marge), malgré ${fmt(b.extraNet)} d'extras absorbés par tes marges sur les postes prévus.`,
      };
    }
    return { tone: 'good', text: `Tu es dans ton budget global avec +${fmt(b.globalNet)} de marge.` };
  }
  // Dépassement global
  if (b.regNet >= -0.5) {
    // Le prévu est OK, c'est les extras qui font dépasser
    return {
      tone: 'warn',
      text: `Sur tes postes prévus tu serais à +${fmt(b.regNet)}. Le dépassement de ${fmt(b.globalNet)} vient entièrement des extras (${fmt(b.extraNet)}).`,
    };
  }
  // Le prévu dépasse aussi
  if (b.extraNet >= -0.5) {
    return {
      tone: 'bad',
      text: `Tu dépasses de ${fmt(b.globalNet)}, dû à tes postes prévus (−${fmt(b.regNet)}). Les extras n'aggravent pas.`,
    };
  }
  return {
    tone: 'bad',
    text: `Tu dépasses de ${fmt(b.globalNet)} : −${fmt(b.regNet)} sur tes postes prévus ET −${fmt(b.extraNet)} d'extras non prévus.`,
  };
}
