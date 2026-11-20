import { Month, Poste, RevenuEntry, Simulation, SimLine } from './types';
import { MOIS_LIST } from './constants';
import { monthPeriod } from './revenus';
import { budgetAedOf, lastMonthWithBalance, monthBankBalance, startedMonths, rowAedSpent } from './utils';
import { monthFigures, lastCompleted } from './insights';
import { newMonthId, buildNewMonth } from './months';

/**
 * SIMULATEUR — un scénario de trésorerie sur N mois, stocké dans `state.simulations`, à
 * part des mois du tracker : il n'entre dans AUCUNE stat. Remplace l'habitude de créer
 * de « faux » mois à l'avance pour tester un budget. Quand le mois arrive, on peut le
 * créer dans le tracker à partir de la simulation (`monthFromSimulation`).
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

/** « 2026-12 » → { year: 2026, idx: 11 } ; null si mal formé. */
export function parseYm(ym: string): { year: number; idx: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(ym || '');
  if (!m) return null;
  const idx = parseInt(m[2], 10) - 1;
  return idx >= 0 && idx < 12 ? { year: parseInt(m[1], 10), idx } : null;
}
export const toYm = (year: number, idx: number) => `${year}-${String(idx + 1).padStart(2, '0')}`;

/** Période du n-ième mois simulé (0 = premier). */
export function simPeriod(sim: Pick<Simulation, 'start'>, n: number): { year: number; idx: number; label: string } {
  const p = parseYm(sim.start) || { year: new Date().getFullYear(), idx: new Date().getMonth() };
  const k = p.year * 12 + p.idx + n;
  const year = Math.floor(k / 12);
  const idx = k % 12;
  return { year, idx, label: `${MOIS_LIST[idx]} ${year}` };
}

export interface SimRow {
  n: number;
  label: string;
  start: number;
  /** Revenu du mois en devise locale */
  revenue: number;
  /** Budget mensuel (somme des lignes) */
  spent: number;
  /** Ponctuels du mois (positif = dépense, négatif = rentrée) */
  extras: number;
  end: number;
}

export interface SimResult {
  rows: SimRow[];
  endBalance: number;
  /** Variation totale sur l'horizon */
  delta: number;
  /** Solde de fin de mois le plus bas de l'horizon */
  lowest: { label: string; balance: number } | null;
  /** Revenu − budget d'un mois type, hors ponctuels */
  monthlyNet: number;
}

/** Déroule la simulation mois par mois : fin = début + revenu − budget − ponctuels. */
export function projectSimulation(sim: Simulation): SimResult {
  const horizon = Math.min(12, Math.max(1, Math.round(sim.months || 1)));
  const revenue = r2((sim.revenueEur || 0) * (sim.rate || 0));
  const spent = r2((sim.lines || []).reduce((s, l) => s + (l.amount || 0), 0));
  const rows: SimRow[] = [];
  let bal = sim.startBalance || 0;
  for (let n = 0; n < horizon; n++) {
    const extras = r2((sim.extras || []).filter(e => e.month === n).reduce((s, e) => s + (e.amount || 0), 0));
    const end = r2(bal + revenue - spent - extras);
    rows.push({ n, label: simPeriod(sim, n).label, start: r2(bal), revenue, spent, extras, end });
    bal = end;
  }
  const low = rows.reduce<SimRow | null>((a, r) => (a === null || r.end < a.end ? r : a), null);
  return {
    rows,
    endBalance: rows.length ? rows[rows.length - 1].end : sim.startBalance || 0,
    delta: r2((rows.length ? rows[rows.length - 1].end : sim.startBalance || 0) - (sim.startBalance || 0)),
    lowest: low ? { label: low.label, balance: low.end } : null,
    monthlyNet: r2(revenue - spent),
  };
}

/** Lignes = BUDGET d'un mois (postes non masqués + ponctuels budgétés), en devise locale. */
export function budgetLines(ref: Month | undefined, postes: Poste[], rate: number): SimLine[] {
  const lines: SimLine[] = [];
  if (!ref) return lines;
  const hidden = ref.hiddenPostes || [];
  postes.forEach((p, i) => {
    if (hidden.includes(p.name)) return;
    const amount = Math.round(budgetAedOf(ref.budget?.[i], p.isAed, rate));
    if (amount > 0) lines.push({ name: p.name, amount });
  });
  (ref.extraBudget || []).forEach(b => {
    const amount = Math.round(b.aed > 0 ? b.aed : (b.eur || 0) * rate);
    if (amount > 0) lines.push({ name: b.name, amount });
  });
  return lines;
}

/**
 * Lignes = dépense RÉELLE moyenne par poste sur les `n` derniers mois terminés (même
 * périmètre que le total « Réel » du tracker). Les postes ponctuels, différents chaque
 * mois, sont regroupés en une ligne « PONCTUELS ». Sert à projeter le solde sur ce qui
 * est vraiment dépensé, pas sur le budget — les deux peuvent être très éloignés.
 */
export function averageLines(months: Month[], postes: Poste[], n = 3, now: Date = new Date()): SimLine[] {
  const nowKey = now.getFullYear() * 12 + now.getMonth();
  const done = startedMonths(months || [], now).filter(m => {
    const p = monthPeriod(m);
    return !!p && p.year * 12 + p.idx < nowKey;
  }).slice(-n);
  if (done.length === 0) return [];
  const lines: SimLine[] = [];
  postes.forEach((p, i) => {
    const total = done.reduce((s, m) => ((m.hiddenPostes || []).includes(p.name) ? s : s + rowAedSpent(m.actual?.[i], m.rate, { isAed: p.isAed })), 0);
    const amount = Math.round(total / done.length);
    if (amount > 0) lines.push({ name: p.name, amount });
  });
  const isSwap = (r: { txns?: { tripKind?: string }[] }) => !!(r.txns && r.txns.length > 0 && r.txns.every(t => t.tripKind === 'swap'));
  const extras = done.reduce((s, m) => s + (m.extraActual || []).filter(r => !isSwap(r)).reduce((k, r) => k + rowAedSpent(r, m.rate), 0), 0);
  const extraAvg = Math.round(extras / done.length);
  if (extraAvg > 0) lines.push({ name: 'PONCTUELS', amount: extraAvg });
  return lines;
}

/**
 * Valeurs de départ d'une nouvelle simulation, tirées du réel :
 * - premier mois = le mois calendaire suivant ;
 * - solde de départ = prévisionnel actuel du compte (fin du mois en cours) ;
 * - revenu = moyenne des 3 derniers mois terminés ;
 * - budget = celui du dernier mois commencé (postes non masqués + ponctuels budgétés).
 */
export function defaultSimulation(input: {
  months: Month[]; postes: Poste[];
  revenusMonths: Record<string, RevenuEntry[]> | undefined;
  liveRate: number; spaceId?: string; now?: Date;
}): Simulation {
  const now = input.now || new Date();
  const next = now.getFullYear() * 12 + now.getMonth() + 1;
  const start = toYm(Math.floor(next / 12), next % 12);

  const lm = lastMonthWithBalance(input.months || []);
  const startBalance = lm ? Math.round(monthBankBalance(lm, input.postes, input.revenusMonths, input.liveRate)) : 0;

  const done = lastCompleted(monthFigures(input.months || [], input.postes, input.revenusMonths, input.liveRate, now), 3).filter(f => f.revenueEur > 0);
  const revenueEur = done.length ? Math.round(done.reduce((s, f) => s + f.revenueEur, 0) / done.length) : 0;

  const started = startedMonths(input.months || [], now);
  const lines = budgetLines(started[started.length - 1], input.postes, input.liveRate);

  const p = simPeriod({ start }, 0);
  return {
    id: `sim-${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
    spaceId: input.spaceId,
    name: `Simulation ${p.label.toLowerCase()}`,
    createdAt: now.toISOString(),
    start, months: 3, startBalance, revenueEur, rate: input.liveRate, lines, extras: [],
  };
}

/**
 * Crée le mois RÉEL du tracker correspondant au premier mois de la simulation : solde de
 * départ et budget repris de la simulation (les lignes dont le nom est un poste régulier
 * vont dans ce poste, les autres — et les ponctuels du premier mois — deviennent des
 * postes ponctuels budgétés). Refusé si ce mois existe déjà, ou s'il ne vient pas APRÈS
 * le dernier mois du tracker (un mois s'ajoute toujours en fin de liste).
 */
export function monthFromSimulation(
  sim: Simulation, months: Month[], postes: Poste[],
): { month: Month; /** Postes désactivés jusque-là, réactivés pour ce mois car ils ont une ligne */ reactivated: string[] } | { error: string } {
  const p = simPeriod(sim, 0);
  const key = p.year * 12 + p.idx;
  startedMonths(months || []); // tient _year à jour sur tous les mois
  const periods = (months || []).map(monthPeriod).filter(Boolean) as { year: number; idx: number }[];
  if (periods.some(x => x.year * 12 + x.idx === key)) return { error: `${p.label} existe déjà dans le tracker.` };
  if (periods.some(x => x.year * 12 + x.idx > key)) return { error: `Impossible de créer ${p.label} : le tracker contient déjà un mois plus récent.` };

  const res = newMonthId(months, MOIS_LIST[p.idx]);
  if ('error' in res) return res;
  const base = buildNewMonth(months, postes, { id: res.id, rate: sim.rate, soldeStart: sim.startBalance || 0, fill: 'empty' });

  const posteIdx = (name: string) => postes.findIndex(po => po.name.trim().toUpperCase() === name.trim().toUpperCase());
  const budget = [...base.budget];
  const extraBudget = [...base.extraBudget];
  const addExtra = (name: string, amount: number) => {
    const n = name.trim().toUpperCase();
    if (!n || !(amount > 0)) return;
    const i = extraBudget.findIndex(b => b.name === n);
    if (i >= 0) extraBudget[i] = { ...extraBudget[i], aed: r2(extraBudget[i].aed + amount) };
    else extraBudget.push({ name: n, cat: 'lifestyle', aed: r2(amount), eur: 0 });
  };
  const used = new Set<string>();
  (sim.lines || []).forEach(l => {
    const i = posteIdx(l.name);
    if (i < 0) { addExtra(l.name, l.amount); return; }
    used.add(postes[i].name);
    budget[i] = postes[i].isAed
      ? { aed: r2((budget[i]?.aed || 0) + l.amount), eur: null }
      : { aed: 0, eur: r2((budget[i]?.eur || 0) + (sim.rate > 0 ? l.amount / sim.rate : 0)) };
  });
  (sim.extras || []).filter(e => e.month === 0).forEach(e => addExtra(e.label || 'PONCTUEL', e.amount));

  // Un poste masqué par héritage (désactivé « à partir de », cf. Réglages) redevient visible
  // s'il a une ligne dans la simulation : sinon son budget serait posé sur une ligne
  // invisible et exclu des totaux. L'appelant l'annonce avant de créer le mois.
  const inherited = base.hiddenPostes || [];
  return {
    month: { ...base, budget, extraBudget, hiddenPostes: inherited.filter(n => !used.has(n)) },
    reactivated: inherited.filter(n => used.has(n)),
  };
}
