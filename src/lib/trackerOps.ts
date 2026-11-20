import { ActualRow, AppState, ExtraRow, Month, Poste, Transaction } from './types';

/**
 * Écritures du tracker — fonctions PURES (état → nouvel état), partagées par le tracker
 * desktop et l'accueil mobile : les deux UI ne diffèrent que par le rendu. Chaque
 * fonction rend aussi les lignes à consigner dans l'historique (`logs`), que l'appelant
 * passe à `logChange`.
 *
 * Rappels (cf. CLAUDE.md) : `amount` d'une transaction est TOUJOURS en devise locale, au
 * taux du jour de la saisie (`state.rate`) ; les DEUX devises d'une ligne sont
 * recalculées depuis ses transactions ; les lignes d'un mois sont repérées par POSITION
 * (un nouveau poste s'ajoute en FIN de liste).
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface OpLog { action: string; detail: string }
export interface OpResult { state: AppState; logs: OpLog[] }

type Cat = Poste['cat'];

/** Ligne visée : poste régulier (`posteIdx`) ou poste ponctuel du mois (`isExtra` + `extraIdx`). */
export interface TxnTarget { posteIdx: number; editIdx?: number; isExtra?: boolean; extraIdx?: number }
export interface TxnForm { label: string; amount: number; currency: 'AED' | 'EUR'; date: string }
export interface NewPosteForm { name: string; cat: Cat; isAed: boolean; scope: 'permanent' | 'month' }
/**
 * Où ranger la transaction : `posteIdx` d'un poste régulier, ou -1 pour la laisser dans
 * le poste ponctuel d'origine ; `create` = créer le poste (régulier ou ponctuel) au passage.
 */
export interface TxnDest { posteIdx: number; create?: NewPosteForm | null }

const sumAedOf = (txns: Transaction[]) => r2(txns.reduce((s, t) => s + t.amount, 0));
const sumEurOf = (txns: Transaction[], rate: number) => r2(txns.reduce((s, t) => s + (t.eur || t.amount / (t.rate || rate)), 0));

/** Recalcule les deux devises d'une ligne depuis ses transactions (y compris poste EUR). */
function recalc<T extends { aed?: number; eur?: number | null; txns?: Transaction[] }>(row: T, rate: number): T {
  const txns = row.txns || [];
  row.aed = sumAedOf(txns);
  row.eur = sumEurOf(txns, rate);
  return row;
}

const emptyRow = (): ActualRow => ({ aed: 0, eur: null, txns: [] });
const mapMonth = (state: AppState, monthId: string, fn: (m: Month) => Month): Month[] =>
  state.months.map(mo => (mo.id === monthId ? fn(mo) : mo));

/**
 * Ajoute, modifie ou déplace une transaction. Rend `null` si rien n'est à faire (montant
 * nul, mois introuvable, nom de poste vide).
 */
export function saveTxn(
  state: AppState, monthId: string, target: TxnTarget, form: TxnForm, dest: TxnDest, today: string,
): OpResult | null {
  const m = state.months.find(mo => mo.id === monthId);
  if (!m || !(form.amount > 0)) return null;
  const rate = state.rate;
  const amountAed = form.currency === 'EUR' ? form.amount * rate : form.amount;
  const eurVal = form.currency === 'EUR' ? form.amount : form.amount / rate;
  const entry: Transaction = {
    label: form.label || '---',
    amount: r2(amountAed),
    rate,
    eur: r2(eurVal),
    date: form.date || today,
    currency: form.currency,
  };
  entry.originalAmount = r2(form.amount); // pour ré-éditer sans dérive
  const create = dest.create || null;
  const isExtraSrc = !!(target.isExtra && target.extraIdx !== undefined);
  // Édition : la transaction garde ses marqueurs. Sans ça, modifier une dépense de voyage
  // lui faisait perdre `tripKind` — elle se remettait à débiter le compte (le swap l'avait
  // déjà fait) et disparaissait du voyage ; une récurrence était reproposée.
  if (target.editIdx !== undefined) {
    const old = isExtraSrc ? m.extraActual?.[target.extraIdx!]?.txns?.[target.editIdx] : m.actual[target.posteIdx]?.txns?.[target.editIdx];
    if (old?.tripId) entry.tripId = old.tripId;
    if (old?.tripKind) entry.tripKind = old.tripKind;
    if (old?.recur) entry.recur = old.recur;
  }
  const logs: OpLog[] = [];

  // CAS SPÉCIAL : poste créé « ce mois uniquement » → poste PONCTUEL (extra), pas un
  // poste global. La transaction va dans extraActual, et une ligne miroir apparaît dans
  // extraBudget pour qu'il soit visible côté prévisionnel aussi.
  if (create && create.scope === 'month') {
    const name = create.name.trim().toUpperCase();
    if (!name) return null;
    const months = mapMonth(state, monthId, mo => {
      const actual = [...mo.actual];
      let extraActual = [...(mo.extraActual || [])];
      let extraBudget = [...(mo.extraBudget || [])];
      // Édition d'une transaction existante : on la retire de sa ligne d'origine
      if (target.editIdx !== undefined) {
        if (isExtraSrc) {
          const src = { ...extraActual[target.extraIdx!] };
          src.txns = (src.txns || []).filter((_, i) => i !== target.editIdx);
          extraActual[target.extraIdx!] = recalc(src, rate);
        } else {
          const src = { ...(actual[target.posteIdx] || emptyRow()) } as ActualRow;
          src.txns = (src.txns || []).filter((_, i) => i !== target.editIdx);
          actual[target.posteIdx] = recalc(src, rate);
        }
      }
      // Réutilise un ponctuel du même nom s'il existe déjà ce mois (pas de doublon)
      const dup = extraActual.findIndex(r => (r.name || '').trim().toUpperCase() === name);
      if (dup >= 0) {
        const row = { ...extraActual[dup] };
        row.txns = [...(row.txns || []), entry];
        extraActual[dup] = recalc(row, rate);
      } else {
        extraActual = [...extraActual, recalc({ name, cat: create.cat, aed: 0, eur: 0, txns: [entry] } as ExtraRow, rate)];
      }
      if (!extraBudget.some(b => (b.name || '').trim().toUpperCase() === name)) {
        extraBudget = [...extraBudget, { name, cat: create.cat, aed: 0, eur: 0 }];
      }
      return { ...mo, actual, extraActual, extraBudget };
    });
    logs.push({ action: 'poste.create', detail: `Création poste ponctuel « ${name} » (${monthId} uniquement)` });
    return { state: { ...state, months }, logs };
  }

  // Poste cible (éventuellement un nouveau poste permanent, ajouté en fin de liste)
  let postes = state.postes;
  let targetIdx = dest.posteIdx; // -1 = rester dans le ponctuel d'origine
  let created = false;
  if (create) {
    const name = create.name.trim().toUpperCase();
    if (!name) return null;
    const existing = postes.findIndex(p => p.name === name);
    if (existing >= 0) {
      targetIdx = existing;
    } else {
      postes = [...postes, { name, cat: create.cat, isAed: create.isAed }];
      targetIdx = postes.length - 1;
      created = true;
    }
  }

  const sourceIdx = target.posteIdx;
  const stayInExtra = isExtraSrc && targetIdx === -1 && !create;
  if (!stayInExtra && targetIdx < 0) return null;
  const isMove = target.editIdx !== undefined && (
    (isExtraSrc && !stayInExtra) ||          // ponctuel → poste régulier
    (!isExtraSrc && targetIdx !== sourceIdx) // régulier → autre régulier
  );

  const months = mapMonth(state, monthId, mo => {
    const actual = [...mo.actual];
    const extraActual = [...(mo.extraActual || [])];

    // Ajout ou édition SUR PLACE dans un ponctuel
    if (stayInExtra) {
      const r = { ...extraActual[target.extraIdx!] };
      const txns = [...(r.txns || [])];
      if (target.editIdx !== undefined) txns[target.editIdx] = entry;
      else txns.push(entry);
      r.txns = txns;
      extraActual[target.extraIdx!] = recalc(r, rate);
      return { ...mo, actual, extraActual };
    }

    // Depuis un ponctuel vers un poste régulier (déplacement si édition, sinon simple ajout)
    if (isExtraSrc) {
      if (isMove) {
        const src = { ...extraActual[target.extraIdx!] };
        src.txns = (src.txns || []).filter((_, i) => i !== target.editIdx);
        extraActual[target.extraIdx!] = recalc(src, rate);
      }
      const tgt = { ...(actual[targetIdx] || emptyRow()) } as ActualRow;
      tgt.txns = [...(tgt.txns || []), entry];
      actual[targetIdx] = recalc(tgt, rate);
      return { ...mo, actual, extraActual };
    }

    // Régulier ↔ régulier
    if (isMove) {
      const src = { ...(actual[sourceIdx] || emptyRow()) } as ActualRow;
      src.txns = (src.txns || []).filter((_, i) => i !== target.editIdx);
      actual[sourceIdx] = recalc(src, rate);
      const tgt = { ...(actual[targetIdx] || emptyRow()) } as ActualRow;
      tgt.txns = [...(tgt.txns || []), entry];
      actual[targetIdx] = recalc(tgt, rate);
    } else {
      const row = { ...(actual[targetIdx] || emptyRow()) } as ActualRow;
      const txns = [...(row.txns || [])];
      if (target.editIdx !== undefined && targetIdx === sourceIdx) txns[target.editIdx] = entry;
      else txns.push(entry);
      row.txns = txns;
      actual[targetIdx] = recalc(row, rate);
    }
    return { ...mo, actual, extraActual };
  });

  if (created) {
    const p = postes[targetIdx];
    logs.push({ action: 'poste.create', detail: `Création poste « ${p.name} » (${p.cat}) depuis edit tx` });
  }
  if (isMove) {
    const from = isExtraSrc ? m.extraActual?.[target.extraIdx!]?.name || '—' : state.postes[sourceIdx]?.name || '—';
    logs.push({ action: 'txn.move', detail: `Tx « ${entry.label} » déplacée de ${from} → ${postes[targetIdx]?.name || '—'}` });
  }
  return { state: { ...state, postes, months }, logs };
}

/** Supprime la transaction `txIdx` d'un poste régulier. */
export function removeTxn(state: AppState, monthId: string, posteIdx: number, txIdx: number): AppState {
  const rate = state.rate;
  const p = state.postes[posteIdx];
  return {
    ...state,
    months: mapMonth(state, monthId, mo => {
      const actual = [...mo.actual];
      const row = { ...actual[posteIdx] };
      const txns = (row.txns || []).filter((_, i) => i !== txIdx);
      row.txns = txns;
      if (txns.length === 0) {
        row.aed = 0;
        row.eur = p?.isAed ? null : 0;
      } else {
        row.aed = sumAedOf(txns);
        row.eur = sumEurOf(txns, rate);
      }
      actual[posteIdx] = row;
      return { ...mo, actual };
    }),
  };
}

/** Supprime la transaction `txIdx` d'un poste ponctuel. */
export function removeTxnExtra(state: AppState, monthId: string, extraIdx: number, txIdx: number): AppState {
  const rate = state.rate;
  return {
    ...state,
    months: mapMonth(state, monthId, mo => {
      const extraActual = [...(mo.extraActual || [])];
      const r = { ...extraActual[extraIdx] };
      const txns = (r.txns || []).filter((_, i) => i !== txIdx);
      r.txns = txns;
      r.aed = txns.length > 0 ? sumAedOf(txns) : 0;
      r.eur = txns.length > 0 ? sumEurOf(txns, rate) : 0;
      extraActual[extraIdx] = r;
      return { ...mo, extraActual };
    }),
  };
}

/**
 * Budget d'un poste régulier. La devise SAISIE devient la devise de référence du poste :
 * elle reste figée, l'autre suit le taux (sinon un objectif saisi en euros était stocké
 * en AED et l'euro dérivait avec le taux).
 */
export function setBudget(state: AppState, monthId: string, idx: number, val: number, isEur: boolean, liveRate: number): OpResult {
  const months = mapMonth(state, monthId, mo => {
    const budget = [...mo.budget];
    const prev = budget[idx] || { aed: 0, eur: null };
    budget[idx] = isEur
      ? { ...prev, eur: val, aed: r2(val * liveRate) }
      : { ...prev, aed: val, eur: liveRate > 0 ? r2(val / liveRate) : 0 };
    return { ...mo, budget };
  });
  const target = state.postes[idx];
  const flipped = !!target && target.isAed === isEur;
  const postes = flipped ? state.postes.map((p, i) => (i === idx ? { ...p, isAed: !isEur } : p)) : state.postes;
  return {
    state: { ...state, postes, months },
    logs: flipped ? [{ action: 'poste.update', detail: `« ${target.name} » : budget désormais fixé en ${isEur ? 'EUR' : 'AED'}` }] : [],
  };
}

/** Budget d'un poste ponctuel : on ne stocke QUE la devise de référence, l'autre à 0. */
export function setExtraBudget(state: AppState, monthId: string, idx: number, val: number, isEur: boolean): AppState {
  return {
    ...state,
    months: mapMonth(state, monthId, mo => {
      const extraBudget = [...(mo.extraBudget || [])];
      const prev = extraBudget[idx];
      if (!prev) return mo;
      extraBudget[idx] = isEur ? { ...prev, eur: val, aed: 0 } : { ...prev, aed: val, eur: 0 };
      return { ...mo, extraBudget };
    }),
  };
}

/** Montant « Réel » saisi directement (sans transaction) sur un poste régulier. */
export function setActual(state: AppState, monthId: string, idx: number, val: number, isEur: boolean): AppState {
  return {
    ...state,
    months: mapMonth(state, monthId, mo => {
      const actual = [...mo.actual];
      const prev = actual[idx] || { aed: 0, eur: null };
      actual[idx] = isEur ? { ...prev, eur: val, aed: 0 } : { ...prev, aed: val, eur: null };
      return { ...mo, actual };
    }),
  };
}

/** Masque un poste régulier pour CE mois (non destructif, cf. Month.hiddenPostes). */
export function hidePoste(state: AppState, monthId: string, name: string): OpResult {
  let changed = false;
  const months = mapMonth(state, monthId, mo => {
    const cur = mo.hiddenPostes || [];
    if (cur.includes(name)) return mo;
    changed = true;
    return { ...mo, hiddenPostes: [...cur, name] };
  });
  return { state: changed ? { ...state, months } : state, logs: changed ? [{ action: 'poste.hide', detail: `Masqué « ${name} » dans ${monthId}` }] : [] };
}

export interface CustomRowForm {
  section: 'budget' | 'actual';
  name: string;
  cat: Cat;
  aed: number;
  eur: number;
  scope: 'permanent' | 'month';
  isAed: boolean;
}

/** « Ajouter un poste » : permanent (vrai poste, tous les mois) ou ponctuel (ce mois). */
export function addCustomRow(state: AppState, monthId: string, f: CustomRowForm): OpResult {
  const name = f.name.trim().toUpperCase() || 'AUTRE';
  if (f.scope === 'permanent') {
    const existing = state.postes.findIndex(p => p.name === name);
    let postes = state.postes;
    let idx = existing;
    if (existing < 0) {
      postes = [...state.postes, { name, cat: f.cat, isAed: f.isAed }];
      idx = postes.length - 1;
    }
    const value = f.isAed
      ? { aed: f.aed, eur: f.eur > 0 ? f.eur : null }
      : { aed: 0, eur: f.eur > 0 ? f.eur : (f.aed > 0 ? f.aed : null) };
    const months = mapMonth(state, monthId, mo => {
      const budget = [...mo.budget];
      const actual = [...mo.actual];
      if (f.section === 'budget') {
        budget[idx] = value;
        if (!actual[idx]) actual[idx] = { aed: 0, eur: null };
      } else {
        actual[idx] = value;
        if (!budget[idx]) budget[idx] = { aed: 0, eur: null };
      }
      return { ...mo, budget, actual };
    });
    return {
      state: { ...state, postes, months },
      logs: existing < 0 ? [{ action: 'poste.create', detail: `Création poste permanent « ${name} » (${f.cat})` }] : [],
    };
  }
  const row: ExtraRow = { name, cat: f.cat, aed: f.aed, eur: f.eur };
  const months = mapMonth(state, monthId, mo => (
    f.section === 'budget'
      ? { ...mo, extraBudget: [...(mo.extraBudget || []), row], extraActual: [...(mo.extraActual || []), { ...row, aed: 0, eur: 0 }] }
      : { ...mo, extraActual: [...(mo.extraActual || []), row] }
  ));
  return { state: { ...state, months }, logs: [] };
}

/** Retire la ligne `idx` du budget des postes ponctuels. */
export function removeExtraBudget(state: AppState, monthId: string, idx: number): AppState {
  return { ...state, months: mapMonth(state, monthId, mo => ({ ...mo, extraBudget: (mo.extraBudget || []).filter((_, j) => j !== idx) })) };
}

/** Retire la ligne `idx` du réel des postes ponctuels (transactions comprises). */
export function removeExtraActual(state: AppState, monthId: string, idx: number): AppState {
  return { ...state, months: mapMonth(state, monthId, mo => ({ ...mo, extraActual: (mo.extraActual || []).filter((_, j) => j !== idx) })) };
}

/**
 * Supprime un poste ponctuel EN ENTIER, par son nom : sa ligne « réel » et sa ligne
 * « budget » (l'UI mobile présente un ponctuel comme une seule entité).
 */
export function removeExtraByName(state: AppState, monthId: string, name: string): AppState {
  const key = (name || '').trim().toUpperCase();
  const keep = (r: ExtraRow) => (r.name || '').trim().toUpperCase() !== key;
  return {
    ...state,
    months: mapMonth(state, monthId, mo => ({
      ...mo,
      extraActual: (mo.extraActual || []).filter(keep),
      extraBudget: (mo.extraBudget || []).filter(keep),
    })),
  };
}

/**
 * Budget d'un poste ponctuel désigné par son NOM ; la ligne de budget est créée si le
 * ponctuel n'en avait pas (ajouté côté « réel » uniquement).
 */
export function setExtraBudgetByName(state: AppState, monthId: string, name: string, cat: string, val: number, isEur: boolean): AppState {
  const m = state.months.find(mo => mo.id === monthId);
  if (!m) return state;
  const idx = (m.extraBudget || []).findIndex(b => b.name === name);
  if (idx >= 0) return setExtraBudget(state, monthId, idx, val, isEur);
  const row: ExtraRow = isEur ? { name, cat, aed: 0, eur: val } : { name, cat, aed: val, eur: 0 };
  return { ...state, months: mapMonth(state, monthId, mo => ({ ...mo, extraBudget: [...(mo.extraBudget || []), row] })) };
}
