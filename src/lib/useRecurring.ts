'use client';

import { useMemo } from 'react';
import { useApp } from '@/context/AppProvider';
import { Month, RecurringRule } from './types';
import { f0, todayISO } from './utils';
import { Occurrence, pendingExpenses, applyExpenses, skipOccurrences } from './recurring';

/**
 * Règles de récurrence de l'espace actif + actions d'édition, et, pour un mois du
 * tracker, les dépenses récurrentes échues à ajouter. Partagé par Réglages et les deux
 * trackers (desktop / mobile). Le pendant « revenus » vit dans useRevenus.
 */
export function useRecurring(month?: Month) {
  const { state, setState, save, getState, activeSpaceId, logChange } = useApp();

  const rules = useMemo(
    () => (state.recurring || []).filter(r => !r.spaceId || r.spaceId === activeSpaceId),
    [state.recurring, activeSpaceId],
  );

  /** Crée ou remplace une règle (même id). */
  const saveRule = (rule: RecurringRule) => {
    const s = getState();
    const all = s.recurring || [];
    const exists = all.some(r => r.id === rule.id);
    const next = exists ? all.map(r => (r.id === rule.id ? rule : r)) : [...all, { ...rule, spaceId: rule.spaceId || activeSpaceId }];
    setState({ ...s, recurring: next });
    save();
    logChange?.(exists ? 'recurring.update' : 'recurring.create', `${exists ? 'Modif' : 'Création'} récurrence « ${rule.label} » (${rule.kind === 'expense' ? 'dépense' : 'revenu'})`);
  };

  const deleteRule = (id: string) => {
    const s = getState();
    const removed = (s.recurring || []).find(r => r.id === id);
    setState({ ...s, recurring: (s.recurring || []).filter(r => r.id !== id) });
    save();
    if (removed) logChange?.('recurring.delete', `Suppression récurrence « ${removed.label} »`);
  };

  // Dépenses échues du mois affiché (recalculées à chaque rendu : dépend d'aujourd'hui)
  const due: Occurrence[] = month ? pendingExpenses(rules, month, state.postes, todayISO()) : [];

  const addDue = () => {
    if (!month || due.length === 0) return;
    const s = getState();
    const target = s.months.find(mo => mo.id === month.id);
    if (!target) return;
    // Recalculé sur le dernier état : rien n'est ajouté deux fois
    const fresh = pendingExpenses((s.recurring || []), target, s.postes, todayISO()).filter(o => due.some(d => d.key === o.key));
    if (fresh.length === 0) return;
    const months = s.months.map(mo => (mo.id === month.id ? applyExpenses(mo, s.postes, fresh, s.rate) : mo));
    setState({ ...s, months });
    save();
    const total = fresh.reduce((sum, o) => sum + o.rule.amount, 0);
    logChange?.('recurring.apply', `${fresh.length} dépense(s) récurrente(s) ajoutée(s) à ${month.id} : ${fresh.map(o => o.rule.label).join(', ')} (${f0(total)})`);
  };

  const skipDue = () => {
    if (due.length === 0) return;
    const s = getState();
    setState({ ...s, recurring: skipOccurrences(s.recurring, due) });
    save();
  };

  return { rules, saveRule, deleteRule, due, addDue, skipDue };
}
