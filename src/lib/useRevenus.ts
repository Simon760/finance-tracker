'use client';

import { useState, useMemo, useEffect } from 'react';
import { useApp } from '@/context/AppProvider';
import { useDialog } from '@/components/ui/Dialog';
import { RevenuEntry } from './types';
import { MOIS_LIST, monthIndexOf } from './constants';
import { f$, fetchRate, sameWeekdayDatesInMonth, todayISO } from './utils';
import { pendingRevenus, applyRevenus, skipOccurrences } from './recurring';
import {
  USD_AED_PEG, currentRevMonth, isFutureRevMonth, resolveRevKey, revYearView, revYears,
  revenuLive, revenusMonthsLive, isRevConfirmed, revFormPerEur, revFormAed,
  buildRevenuEntry, revenuToForm, addRevenu, removeRevenu, updateRevenu, confirmRevenu,
} from './revenus';

const BLANK: RevenuEntry = { date: '', client: '', cat: '', contracted: 0, cashed: 0, comment: '', rate: 0, status: 'confirmed' };

/**
 * Toute la logique de la page Revenus — période affichée (année + mois), table de
 * l'année, formulaire d'ajout / édition, écritures — partagée par l'affichage desktop
 * (`revenus/page.tsx`) et mobile (`MobileRevenus.tsx`). Les deux ne font plus que du
 * rendu : avant, chacun avait sa copie de saveEntry / confirmEntry / perEurOf… et les
 * deux divergeaient.
 *
 * Les mois sont manipulés par NOM (« OCTOBRE ») à l'intérieur de l'année affichée ; la
 * clé de stockage réelle (qui porte l'année, cf. lib/revenus) est résolue ici, à
 * l'écriture uniquement.
 */
export function useRevenus() {
  const { state, setState, save, getState, liveRate, logChange, revFocus, setRevFocus, activeSpaceId } = useApp();
  const { confirm } = useDialog();
  const rev = state.revenus || { objectif: 5000, categories: [], months: {} };
  const categories = rev.categories || [];

  // ─── Période affichée ───
  const [year, setYear] = useState<number>(() => new Date().getFullYear());
  const [curTab, setCurTab] = useState<string>('');
  // Atterrissage sur le mois CALENDAIRE courant (comme le tracker de dépenses), pas sur
  // le dernier mois qui a des données — sinon saisir des revenus en prévision pour le
  // mois suivant faisait ouvrir la page sur ce mois-là.
  const tab = curTab || currentRevMonth();

  // Ouverture ciblée depuis la recherche globale : on se place sur la période demandée
  useEffect(() => {
    if (!revFocus) return;
    setYear(revFocus.year);
    setCurTab(revFocus.month);
    setRevFocus(null);
  }, [revFocus, setRevFocus]);

  const years = useMemo(() => {
    const ys = revYears(rev.months);
    return ys.includes(year) ? ys : [...ys, year].sort((a, b) => a - b);
  }, [rev.months, year]);

  /** Table BRUTE de l'année affichée, par nom de mois (sert aux écritures / à l'édition). */
  const yearRaw = useMemo(() => revYearView(rev.months, year), [rev.months, year]);
  // Table telle qu'AFFICHÉE / sommée : prévisions et entrées en attente recalculées au
  // taux du jour (cf. revenuLive). Mêmes index d'entrées que yearRaw.
  const viewMonths = useMemo(() => revenusMonthsLive(yearRaw, liveRate), [yearRaw, liveRate]);

  const isFuture = (month: string) => isFutureRevMonth(month, year);

  /** Clé de stockage d'un mois (nom) pour une année — nom libre : la chaîne telle quelle. */
  const keyOf = (month: string, y: number = year) => {
    const idx = monthIndexOf(month);
    return idx >= 0 ? resolveRevKey(rev.months, y, idx) : month.trim().toUpperCase();
  };

  // Mois navigables de l'année (mobile) : ceux qui ont des données + le mois calendaire
  // courant, même vide, + le mois affiché.
  const orderedMonths = useMemo(() => {
    const set = new Set<string>(Object.keys(yearRaw));
    if (year === new Date().getFullYear()) set.add(currentRevMonth());
    set.add(tab);
    return (MOIS_LIST as readonly string[]).filter(m => set.has(m));
  }, [yearRaw, year, tab]);

  const hasAnyData = useMemo(
    () => Object.values(rev.months || {}).some(entries => (entries || []).length > 0),
    [rev.months],
  );

  // Clients déjà vus (toutes années), par fréquence puis date la plus récente.
  const clientSuggestions = useMemo(() => {
    const counts = new Map<string, { count: number; lastDate: string }>();
    Object.values(rev.months || {}).forEach(entries => {
      (entries || []).forEach(e => {
        const name = (e.client || '').trim();
        if (!name) return;
        const cur = counts.get(name);
        if (cur) {
          cur.count++;
          if ((e.date || '') > cur.lastDate) cur.lastDate = e.date || '';
        } else {
          counts.set(name, { count: 1, lastDate: e.date || '' });
        }
      });
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1].count - a[1].count || b[1].lastDate.localeCompare(a[1].lastDate))
      .map(([name, info]) => ({ name, count: info.count }));
  }, [rev.months]);

  // ─── Formulaire d'ajout / édition ───
  const [formOpen, setFormOpen] = useState(false);
  const [editIdx, setEditIdx] = useState<{ key: string; idx: number } | null>(null);
  const [form, setForm] = useState<RevenuEntry>({ ...BLANK, rate: liveRate });
  const [formMonth, setFormMonth] = useState('');
  const [formYear, setFormYear] = useState<number>(year);

  // Taux EUR→USD (même source que EUR/AED : TwelveData prioritaire + fallbacks)
  const [usdRate, setUsdRate] = useState(1.08);
  useEffect(() => { fetchRate('USD').then(r => { if (r > 0) setUsdRate(r); }).catch(() => {}); }, []);
  /** 1 EUR = rateFor(devise) unités de cette devise. */
  const rateFor = (c?: string) => (c === 'USD' ? usdRate : c === 'AED' ? liveRate : 1);

  // Récurrence hebdo : duplique l'entrée sur les autres mêmes jours de semaine du mois
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const repeatDates = useMemo(() => (repeatWeekly ? sameWeekdayDatesInMonth(form.date) : []), [repeatWeekly, form.date]);

  // Le champ Taux EUR/AED suit le taux live tant qu'il n'a pas été modifié à la main
  const [rateTouched, setRateTouched] = useState(false);
  useEffect(() => {
    if (formOpen && !rateTouched) setForm(f => ({ ...f, rate: liveRate }));
  }, [liveRate, formOpen, rateTouched]);

  const rates = { liveRate, usdRate };
  const perEurOf = (f: RevenuEntry) => revFormPerEur(f, rates);
  const aedOf = (f: RevenuEntry, amount: number) => revFormAed(f, amount, rates);

  const openAdd = (month?: string) => {
    setForm({ ...BLANK, date: todayISO(), cat: categories[0] || '', rate: liveRate, currency: 'EUR' });
    setFormMonth(month || tab);
    setFormYear(year);
    setEditIdx(null);
    setRateTouched(false); // le taux suit le live jusqu'à modification manuelle
    setRepeatWeekly(false);
    setFormOpen(true);
  };

  const openEdit = (month: string, idx: number) => {
    const raw = (yearRaw[month] || [])[idx];
    if (!raw) return;
    // Non confirmée : pré-remplie au taux du jour (mêmes valeurs que la liste), et le
    // taux EUR/AED continue de suivre le live — elle n'est pas encore encaissée.
    setForm(revenuToForm(revenuLive(raw, liveRate)));
    setFormMonth(month);
    setFormYear(year);
    setEditIdx({ key: keyOf(month), idx });
    // Confirmée : on garde le taux historique (bouton Live pour re-sync)
    setRateTouched(isRevConfirmed(raw));
    setRepeatWeekly(false); // la récurrence ne s'applique qu'à la création
    setFormOpen(true);
  };

  const commit = (months: Record<string, RevenuEntry[]>) => {
    setState({ ...state, revenus: { ...rev, months } });
    save();
  };

  const saveEntry = () => {
    if (!formMonth.trim()) return;
    const key = keyOf(formMonth, formYear);
    const entry = buildRevenuEntry(form, rates);
    if (editIdx) {
      commit(updateRevenu(rev.months, editIdx.key, editIdx.idx, entry, key));
      logChange?.('revenu.update', `Modif revenu ${entry.client || '—'} · ${f$(entry.cashed || 0)} € (${key})`);
    } else {
      const res = addRevenu(rev.months, key, entry, repeatDates);
      commit(res.months);
      const suffix = res.added > 1 ? ` ×${res.added} (récurrence hebdo)` : '';
      logChange?.('revenu.add', `Ajout revenu ${entry.client || '—'} · ${f$(entry.cashed || 0)} €${suffix} (${key})`);
    }
    setFormOpen(false);
  };

  const deleteEntry = async (month: string, idx: number) => {
    const key = keyOf(month);
    const removed = rev.months?.[key]?.[idx];
    if (!removed) return;
    if (!(await confirm(`Supprimer ce revenu ?\n\n${removed.client || '—'} · ${f$(removed.cashed || 0)} €`, { danger: true }))) return;
    // Après l'attente : on repart du dernier état, et on vérifie que l'entrée visée est
    // toujours la même (elle a pu bouger pendant que la fenêtre était ouverte).
    const s = getState();
    if (s.revenus?.months?.[key]?.[idx] !== removed) return;
    setState({ ...s, revenus: { ...s.revenus, months: removeRevenu(s.revenus.months, key, idx) } });
    save();
    logChange?.('revenu.delete', `Suppr revenu ${removed.client || '—'} · ${f$(removed.cashed || 0)} € (${key})`);
  };

  // ─── Revenus récurrents de la période affichée (cf. lib/recurring) ───
  const tabIdx = monthIndexOf(tab);
  const recurRules = useMemo(
    () => (state.recurring || []).filter(r => !r.spaceId || r.spaceId === activeSpaceId),
    [state.recurring, activeSpaceId],
  );
  const recurDue = tabIdx >= 0 ? pendingRevenus(recurRules, rev.months, year, tabIdx) : [];

  const addRecurring = () => {
    if (recurDue.length === 0 || tabIdx < 0) return;
    const s = getState();
    const fresh = pendingRevenus(s.recurring || [], s.revenus?.months, year, tabIdx).filter(o => recurDue.some(d => d.key === o.key));
    if (fresh.length === 0) return;
    setState({ ...s, revenus: { ...s.revenus, months: applyRevenus(s.revenus?.months, year, tabIdx, fresh, rates) } });
    save();
    logChange?.('recurring.apply', `${fresh.length} revenu(s) récurrent(s) ajouté(s) en prévision (${keyOf(tab)}) : ${Array.from(new Set(fresh.map(o => o.rule.label))).join(', ')}`);
  };

  const skipRecurring = () => {
    if (recurDue.length === 0) return;
    const s = getState();
    setState({ ...s, recurring: skipOccurrences(s.recurring, recurDue) });
    save();
  };

  const confirmEntry = (month: string, idx: number) => {
    const key = keyOf(month);
    const res = confirmRevenu(rev.months, key, idx, liveRate);
    if (!res.frozen) return;
    commit(res.months);
    logChange?.('revenu.confirm', `Confirm revenu ${res.frozen.client || '—'} · ${f$(res.frozen.cashed || 0)} € (${key})`);
  };

  return {
    rev, categories, liveRate,
    // période
    year, setYear, years, tab, setTab: setCurTab, isFuture,
    yearRaw, viewMonths, orderedMonths, hasAnyData, clientSuggestions,
    // formulaire
    formOpen, setFormOpen, isEdit: !!editIdx,
    form, setForm, formMonth, setFormMonth, formYear, setFormYear,
    rateFor, perEurOf, aedOf, usdPeg: USD_AED_PEG,
    repeatWeekly, setRepeatWeekly, rateTouched, setRateTouched,
    // actions
    openAdd, openEdit, saveEntry, deleteEntry, confirmEntry,
    // récurrences
    recurDue, addRecurring, skipRecurring,
  };
}
