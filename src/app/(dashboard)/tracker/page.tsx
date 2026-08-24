'use client';

import { useState, useCallback, useMemo } from 'react';
import { useApp } from '@/context/AppProvider';
import PageHeader from '@/components/layout/PageHeader';
import MobileTracker from '@/components/mobile/MobileTracker';
import { useIsMobile } from '@/lib/useIsMobile';
// import MonthStatsCard from '@/components/MonthStatsCard'; // retiré temporairement
import { KpiCard } from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import { f$, f0, toEur, toAed, rowEur, sumEur, sumAed, sumAedBank, sumEurBudget, sumAedBudget, detectYears, shortMonth, pocketCashEur } from '@/lib/utils';
import { LEGACY_EARN_MONTHS, CAT_COLORS } from '@/lib/constants';
import { Month, Transaction, ActualRow } from '@/lib/types';
import { EyeOff } from 'lucide-react';
import BudgetBalanceCard from '@/components/BudgetBalanceCard';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import SlideOver from '@/components/ui/SlideOver';

const PIE_C = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1'];

export default function TrackerPage() {
  const isMobile = useIsMobile();
  const { state, save, curMonth, setCurMonth, curYear, setCurYear, liveRate, updateMonth, setState, activeSpace, logChange, trips } = useApp();
  const [newMonthOpen, setNewMonthOpen] = useState(false);
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [reconcileInput, setReconcileInput] = useState('');
  const [nmName, setNmName] = useState('');
  const [nmRate, setNmRate] = useState(liveRate);
  const [nmSolde, setNmSolde] = useState(0);
  const [nmFillMode, setNmFillMode] = useState<'copy' | 'avg3' | 'empty'>('copy');
  const [addRowOpen, setAddRowOpen] = useState(false);
  const [arSection, setArSection] = useState<'budget' | 'actual'>('budget');
  const [arName, setArName] = useState('');
  const [arCat, setArCat] = useState<'vital' | 'lifestyle' | 'finance' | 'logement'>('vital');
  const [arAed, setArAed] = useState(0);
  const [arEur, setArEur] = useState(0);
  const [arScope, setArScope] = useState<'permanent' | 'month'>('month');
  const [arIsAed, setArIsAed] = useState(true);

  // Slide-over
  const [slidePoste, setSlidePoste] = useState<{ name: string; idx: number; section: 'budget' | 'actual'; isExtra?: boolean } | null>(null);

  // Transaction modal
  const [txnOpen, setTxnOpen] = useState(false);
  const [txnTarget, setTxnTarget] = useState<{ posteIdx: number; editIdx?: number; isExtra?: boolean; extraIdx?: number } | null>(null);
  const [txnForm, setTxnForm] = useState({ label: '', amount: 0, currency: 'AED' as 'AED' | 'EUR', date: new Date().toISOString().split('T')[0] });
  const [showLabelSugg, setShowLabelSugg] = useState(false);
  // Pour bouger la tx vers un autre poste (ou en créer un nouveau)
  const [selectedPosteIdx, setSelectedPosteIdx] = useState<number>(0);
  const [createPosteMode, setCreatePosteMode] = useState(false);
  const [newPosteForm, setNewPosteForm] = useState<{ name: string; cat: 'vital' | 'lifestyle' | 'finance' | 'logement'; isAed: boolean; scope: 'permanent' | 'month' }>({ name: '', cat: 'vital', isAed: true, scope: 'month' });

  // Suggestions de libellés pour le poste courant : occurrences SUR LE MOIS COURANT uniquement
  const labelSuggestions = useMemo<{ label: string; count: number; lastDate: string }[]>(() => {
    if (!txnTarget) return [];
    const curM = state.months.find(mo => mo.id === curMonth);
    if (!curM) return [];
    const map = new Map<string, { label: string; count: number; lastDate: string }>();
    const collect = (txns: Transaction[] | undefined) => {
      (txns || []).forEach(t => {
        const raw = (t.label || '').trim();
        if (!raw || raw === '---') return;
        const key = raw.toLowerCase();
        const cur = map.get(key);
        if (cur) {
          cur.count++;
          if ((t.date || '') > cur.lastDate) cur.lastDate = t.date || '';
        } else {
          map.set(key, { label: raw, count: 1, lastDate: t.date || '' });
        }
      });
    };
    if (txnTarget.isExtra && txnTarget.extraIdx !== undefined) {
      const r = curM.extraActual?.[txnTarget.extraIdx];
      if (r) collect(r.txns);
    } else {
      const posteIdx = txnTarget.posteIdx;
      if (posteIdx < 0) return [];
      const row = curM.actual?.[posteIdx];
      if (row) collect(row.txns);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count || (b.lastDate || '').localeCompare(a.lastDate || ''));
  }, [txnTarget, state.months, curMonth]);

  const filteredSuggestions = useMemo(() => {
    const q = (txnForm.label || '').trim().toLowerCase();
    const arr = q ? labelSuggestions.filter(s => s.label.toLowerCase().includes(q) && s.label.toLowerCase() !== q) : labelSuggestions;
    return arr.slice(0, 8);
  }, [labelSuggestions, txnForm.label]);

  const resetPosteSelector = (posteIdx: number) => {
    setSelectedPosteIdx(posteIdx);
    setCreatePosteMode(false);
    setNewPosteForm({ name: '', cat: 'vital', isAed: true, scope: 'month' });
  };

  const openTxnAdd = (posteIdx: number) => {
    setTxnTarget({ posteIdx });
    setTxnForm({ label: '', amount: 0, currency: 'AED', date: new Date().toISOString().split('T')[0] });
    resetPosteSelector(posteIdx);
    setTxnOpen(true);
  };

  const openTxnAddExtra = (extraIdx: number) => {
    setTxnTarget({ posteIdx: -1, isExtra: true, extraIdx });
    setTxnForm({ label: '', amount: 0, currency: 'AED', date: new Date().toISOString().split('T')[0] });
    resetPosteSelector(-1); // -1 = "Garder dans l'extra"
    setTxnOpen(true);
  };

  const openTxnEdit = (posteIdx: number, editIdx: number) => {
    if (!m) return;
    const txns = m.actual[posteIdx]?.txns || [];
    const t = txns[editIdx];
    if (!t) return;
    setTxnTarget({ posteIdx, editIdx });
    setTxnForm({ label: t.label || '', amount: // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (t as any).originalAmount || t.amount || 0, currency: t.currency || 'AED', date: t.date || new Date().toISOString().split('T')[0] });
    resetPosteSelector(posteIdx);
    setTxnOpen(true);
  };

  const openTxnEditExtra = (extraIdx: number, editIdx: number) => {
    if (!m) return;
    const txns = m.extraActual?.[extraIdx]?.txns || [];
    const t = txns[editIdx];
    if (!t) return;
    setTxnTarget({ posteIdx: -1, isExtra: true, extraIdx, editIdx });
    setTxnForm({ label: t.label || '', amount: // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (t as any).originalAmount || t.amount || 0, currency: t.currency || 'AED', date: t.date || new Date().toISOString().split('T')[0] });
    resetPosteSelector(-1); // -1 = "Garder dans l'extra"
    setTxnOpen(true);
  };

  const confirmTxn = () => {
    if (!m || !txnTarget || txnForm.amount <= 0) return;
    const rate = state.rate;
    const amountAed = txnForm.currency === 'EUR' ? txnForm.amount * rate : txnForm.amount;
    const eurVal = txnForm.currency === 'EUR' ? txnForm.amount : txnForm.amount / rate;
    const txnEntry: Transaction = {
      label: txnForm.label || '---',
      amount: Math.round(amountAed * 100) / 100,
      rate,
      eur: Math.round(eurVal * 100) / 100,
      date: txnForm.date || new Date().toISOString().split('T')[0],
      currency: txnForm.currency,
    };
    // @ts-expect-error: originalAmount for edit round-trip
    txnEntry.originalAmount = Math.round(txnForm.amount * 100) / 100;

    // Helper: recalcule aed/eur d'une row à partir de ses txns
    const recalc = (row: ActualRow, isAed: boolean): ActualRow => {
      const txns = row.txns || [];
      if (isAed) {
        row.aed = Math.round(txns.reduce((s, t) => s + t.amount, 0) * 100) / 100;
        row.eur = Math.round(txns.reduce((s, t) => s + (t.eur || t.amount / (t.rate || rate)), 0) * 100) / 100;
      } else {
        row.eur = Math.round(txns.reduce((s, t) => s + (t.eur || t.amount / (t.rate || rate)), 0) * 100) / 100;
      }
      return row;
    };

    // Helper pour recalcul d'une extra row
    const recalcExtra = (r: { aed?: number; eur?: number; txns?: Transaction[] }) => {
      const txns = r.txns || [];
      r.aed = Math.round(txns.reduce((s, t) => s + t.amount, 0) * 100) / 100;
      r.eur = Math.round(txns.reduce((s, t) => s + (t.eur || t.amount / (t.rate || rate)), 0) * 100) / 100;
    };

    // CAS SPÉCIAL: création d'un poste "ce mois uniquement" → on crée un EXTRA
    // (pas un poste global). La tx atterrit dans extraActual de ce mois, et un
    // shadow apparaît dans extraBudget pour qu'il soit visible côté prévisionnel aussi.
    if (createPosteMode && newPosteForm.scope === 'month') {
      const trimmedName = newPosteForm.name.trim().toUpperCase();
      if (!trimmedName) return;
      const months = state.months.map(mo => {
        if (mo.id !== m.id) return mo;
        let actualArr = [...mo.actual];
        let extraActual = [...(mo.extraActual || [])];
        let extraBudget = [...(mo.extraBudget || [])];

        // Si on éditait une tx existante, on la retire de la source
        if (txnTarget.editIdx !== undefined) {
          if (txnTarget.isExtra && txnTarget.extraIdx !== undefined) {
            const srcRow = { ...extraActual[txnTarget.extraIdx] };
            srcRow.txns = (srcRow.txns || []).filter((_, i) => i !== txnTarget.editIdx);
            recalcExtra(srcRow);
            extraActual[txnTarget.extraIdx] = srcRow;
          } else {
            const srcRow = { ...(actualArr[txnTarget.posteIdx] || { aed: 0, eur: null, txns: [] }) } as ActualRow;
            srcRow.txns = (srcRow.txns || []).filter((_, i) => i !== txnTarget.editIdx);
            recalc(srcRow, !!state.postes[txnTarget.posteIdx]?.isAed);
            actualArr[txnTarget.posteIdx] = srcRow;
          }
        }

        // Réutilise un extra du même nom s'il existe déjà ce mois (évite les doublons) ;
        // sinon crée la nouvelle extra row avec la tx.
        const dupIdx = extraActual.findIndex(r => (r.name || '').trim().toUpperCase() === trimmedName);
        if (dupIdx >= 0) {
          const row = { ...extraActual[dupIdx] };
          row.txns = [...(row.txns || []), txnEntry];
          recalcExtra(row);
          extraActual[dupIdx] = row;
        } else {
          const newExtra = { name: trimmedName, cat: newPosteForm.cat, aed: 0, eur: 0, txns: [txnEntry] };
          recalcExtra(newExtra);
          extraActual = [...extraActual, newExtra];
        }
        // Shadow row dans extraBudget seulement s'il n'existe pas déjà
        if (!extraBudget.some(b => (b.name || '').trim().toUpperCase() === trimmedName)) {
          extraBudget = [...extraBudget, { name: trimmedName, cat: newPosteForm.cat, aed: 0, eur: 0 }];
        }

        return { ...mo, actual: actualArr, extraActual, extraBudget };
      });
      setState({ ...state, months });
      setTxnOpen(false);
      save();
      logChange?.('poste.create', `Création poste ponctuel « ${trimmedName} » (${m.id} uniquement)`);
      return;
    }

    // Détermine le poste cible (peut être un nouveau global)
    let postes = state.postes;
    let targetIdx = selectedPosteIdx; // -1 = "Garder dans extra source"
    let createdNewPoste = false;
    if (createPosteMode) {
      const trimmedName = newPosteForm.name.trim().toUpperCase();
      if (!trimmedName) return;
      const existing = postes.findIndex(p => p.name === trimmedName);
      if (existing >= 0) {
        targetIdx = existing;
      } else {
        postes = [...postes, { name: trimmedName, cat: newPosteForm.cat, isAed: newPosteForm.isAed }];
        targetIdx = postes.length - 1;
        createdNewPoste = true;
      }
    }

    const isExtraSrc = !!(txnTarget.isExtra && txnTarget.extraIdx !== undefined);
    const sourceIdx = txnTarget.posteIdx;
    // Cas où on garde dans l'extra (targetIdx === -1) — pas de déplacement
    const stayInExtra = isExtraSrc && targetIdx === -1 && !createPosteMode;
    const isMove = txnTarget.editIdx !== undefined && (
      (isExtraSrc && !stayInExtra) || // extra → poste régulier
      (!isExtraSrc && targetIdx !== sourceIdx) // poste régulier → autre régulier
    );

    const months = state.months.map(mo => {
      if (mo.id !== m.id) return mo;
      const actual = [...mo.actual];
      const extraActual = [...(mo.extraActual || [])];

      // ─── ADD ou EDIT IN PLACE dans EXTRA ───
      if (stayInExtra) {
        const r = { ...extraActual[txnTarget.extraIdx!] };
        const txns = [...(r.txns || [])];
        if (txnTarget.editIdx !== undefined) txns[txnTarget.editIdx] = txnEntry;
        else txns.push(txnEntry);
        r.txns = txns;
        recalcExtra(r);
        extraActual[txnTarget.extraIdx!] = r;
        return { ...mo, actual, extraActual };
      }

      // ─── MOVE depuis EXTRA vers POSTE REGULIER (edit) ───
      if (isMove && isExtraSrc) {
        const srcRow = { ...extraActual[txnTarget.extraIdx!] };
        srcRow.txns = (srcRow.txns || []).filter((_, i) => i !== txnTarget.editIdx);
        recalcExtra(srcRow);
        extraActual[txnTarget.extraIdx!] = srcRow;

        const tgtRow = { ...(actual[targetIdx] || { aed: 0, eur: null, txns: [] }) } as ActualRow;
        tgtRow.txns = [...(tgtRow.txns || []), txnEntry];
        recalc(tgtRow, !!postes[targetIdx]?.isAed);
        actual[targetIdx] = tgtRow;
        return { ...mo, actual, extraActual };
      }

      // ─── ADD depuis EXTRA vers POSTE REGULIER (pas d'edit, ajoute direct au régulier) ───
      if (!isMove && isExtraSrc) {
        const tgtRow = { ...(actual[targetIdx] || { aed: 0, eur: null, txns: [] }) } as ActualRow;
        tgtRow.txns = [...(tgtRow.txns || []), txnEntry];
        recalc(tgtRow, !!postes[targetIdx]?.isAed);
        actual[targetIdx] = tgtRow;
        return { ...mo, actual, extraActual };
      }

      // ─── REGULIER ↔ REGULIER ───
      if (isMove) {
        const srcRow = { ...(actual[sourceIdx] || { aed: 0, eur: null, txns: [] }) } as ActualRow;
        srcRow.txns = (srcRow.txns || []).filter((_, i) => i !== txnTarget.editIdx);
        recalc(srcRow, !!postes[sourceIdx]?.isAed);
        actual[sourceIdx] = srcRow;

        const tgtRow = { ...(actual[targetIdx] || { aed: 0, eur: null, txns: [] }) } as ActualRow;
        tgtRow.txns = [...(tgtRow.txns || []), txnEntry];
        recalc(tgtRow, !!postes[targetIdx]?.isAed);
        actual[targetIdx] = tgtRow;
      } else {
        const row = { ...(actual[targetIdx] || { aed: 0, eur: null, txns: [] }) } as ActualRow;
        const txns = [...(row.txns || [])];
        if (txnTarget.editIdx !== undefined && targetIdx === sourceIdx) txns[txnTarget.editIdx] = txnEntry;
        else txns.push(txnEntry);
        row.txns = txns;
        recalc(row, !!postes[targetIdx]?.isAed);
        actual[targetIdx] = row;
      }
      return { ...mo, actual, extraActual };
    });

    setState({ ...state, postes, months });
    setTxnOpen(false);
    save();
    if (createdNewPoste) {
      const newP = postes[targetIdx];
      logChange?.('poste.create', `Création poste « ${newP.name} » (${newP.cat}) depuis edit tx`);
    }
    if (isMove) {
      const sName = isExtraSrc
        ? state.months.find(mo => mo.id === m.id)?.extraActual?.[txnTarget.extraIdx!]?.name || '—'
        : state.postes[sourceIdx]?.name || '—';
      const tName = postes[targetIdx]?.name || '—';
      logChange?.('txn.move', `Tx « ${txnEntry.label} » déplacée de ${sName} → ${tName}`);
    }
  };

  const deleteTxn = (posteIdx: number, txnIdx: number) => {
    if (!m) return;
    const rate = state.rate;
    const months = state.months.map(mo => {
      if (mo.id !== m.id) return mo;
      const actual = [...mo.actual];
      const row = { ...actual[posteIdx] };
      const txns = (row.txns || []).filter((_, i) => i !== txnIdx);
      row.txns = txns;
      const p = state.postes[posteIdx];
      if (txns.length === 0) {
        if (p?.isAed) { row.aed = 0; row.eur = null; }
        else { row.eur = 0; }
      } else {
        if (p?.isAed) {
          row.aed = Math.round(txns.reduce((s, t) => s + t.amount, 0) * 100) / 100;
          row.eur = Math.round(txns.reduce((s, t) => s + (t.eur || t.amount / (t.rate || rate)), 0) * 100) / 100;
        } else {
          row.eur = Math.round(txns.reduce((s, t) => s + (t.eur || t.amount / (t.rate || rate)), 0) * 100) / 100;
        }
      }
      actual[posteIdx] = row;
      return { ...mo, actual };
    });
    setState({ ...state, months });
    save();
  };

  const deleteTxnExtra = (extraIdx: number, txnIdx: number) => {
    if (!m) return;
    const rate = state.rate;
    const months = state.months.map(mo => {
      if (mo.id !== m.id) return mo;
      const extraActual = [...(mo.extraActual || [])];
      const r = { ...extraActual[extraIdx] };
      const txns = (r.txns || []).filter((_, i) => i !== txnIdx);
      r.txns = txns;
      r.aed = txns.length > 0 ? Math.round(txns.reduce((s, t) => s + t.amount, 0) * 100) / 100 : 0;
      r.eur = txns.length > 0 ? Math.round(txns.reduce((s, t) => s + (t.eur || t.amount / (t.rate || rate)), 0) * 100) / 100 : 0;
      extraActual[extraIdx] = r;
      return { ...mo, extraActual };
    });
    setState({ ...state, months });
    save();
  };

  // Period filter
  const [periodMode, setPeriodMode] = useState(false);
  const [periodFrom, setPeriodFrom] = useState(0);
  const [periodTo, setPeriodTo] = useState(0);
  const [periodOpen, setPeriodOpen] = useState(false);

  const years = detectYears(state.months);
  const filtered = curYear === 'all' ? state.months : state.months.filter(m => m._year === parseInt(curYear));
  const m = state.months.find(mo => mo.id === curMonth);
  // Mois précédent (M-1) — sert pour les comparaisons inline dans le tableau

  // Revenue helpers
  const isRevSynced = (id: string) => !LEGACY_EARN_MONTHS.includes(id);
  const getMonthRevEur = (id: string) => {
    const entries = state.revenus?.months?.[id] || [];
    return entries.filter(e => !e.status || e.status === 'confirmed').reduce((s, e) => s + (e.cashed || 0), 0);
  };
  const getMonthRevAed = (id: string) => {
    const entries = state.revenus?.months?.[id] || [];
    return entries.filter(e => !e.status || e.status === 'confirmed').reduce((s, e) => s + ((e.cashed || 0) * (e.rate || state.rate)), 0);
  };

  const createMonth = () => {
    const name = nmName.trim().toUpperCase();
    if (!name || state.months.find(mo => mo.id === name)) return;
    const newMonth: Month = {
      id: name, rate: nmRate, earn: 0, soldeStart: nmSolde, soldeEnd: 0,
      budget: [], actual: [], extraBudget: [], extraActual: [],
    };
    const hasHistory = state.months.length > 0;
    if (hasHistory && nmFillMode === 'copy') {
      const last = state.months[state.months.length - 1];
      state.postes.forEach((_, i) => {
        newMonth.budget.push({ aed: last.budget[i]?.aed || 0, eur: last.budget[i]?.eur ?? null });
        newMonth.actual.push({ aed: 0, eur: null });
      });
      if (last.soldeEnd > 0) newMonth.soldeStart = last.soldeEnd;
    } else if (hasHistory && nmFillMode === 'avg3') {
      const window = state.months.slice(-3);
      const last = state.months[state.months.length - 1];
      state.postes.forEach((_, i) => {
        // Moyenne sur les ACTUALS des 3 derniers mois (réalité, pas plan)
        const aedVals = window.map(mo => mo.actual?.[i]?.aed || 0).filter(v => v > 0);
        const eurVals = window.map(mo => mo.actual?.[i]?.eur || 0).filter(v => v > 0);
        const aedAvg = aedVals.length ? aedVals.reduce((s, v) => s + v, 0) / aedVals.length : (last.budget[i]?.aed || 0);
        const eurAvg = eurVals.length ? eurVals.reduce((s, v) => s + v, 0) / eurVals.length : (last.budget[i]?.eur ?? null);
        newMonth.budget.push({ aed: Math.round(aedAvg), eur: eurAvg ? Math.round(eurAvg * 100) / 100 : null });
        newMonth.actual.push({ aed: 0, eur: null });
      });
      if (last.soldeEnd > 0) newMonth.soldeStart = last.soldeEnd;
    } else {
      state.postes.forEach(() => { newMonth.budget.push({ aed: 0, eur: null }); newMonth.actual.push({ aed: 0, eur: null }); });
    }
    const updated = { ...state, months: [...state.months, newMonth] };
    setState(updated);
    setCurMonth(name);
    setNewMonthOpen(false);
    save();
    const fillLabel = nmFillMode === 'avg3' ? 'moyenne 3 mois' : nmFillMode === 'copy' ? 'copie M-1' : 'vide';
    logChange?.('month.create', `Création du mois ${name} (${fillLabel})`);
  };

  const deleteMonth = () => {
    if (!curMonth || !confirm(`Supprimer ${curMonth} ?`)) return;
    const removed = curMonth;
    const months = state.months.filter(mo => mo.id !== curMonth);
    setState({ ...state, months });
    setCurMonth(months.length > 0 ? months[months.length - 1].id : null as unknown as string);
    save();
    logChange?.('month.delete', `Suppression du mois ${removed}`);
  };

  // Édite le budget en gardant AED et EUR synchronisés au taux live.
  // Si user édite AED → eur = aed / liveRate. Si user édite EUR → aed = eur * liveRate.
  // Les 2 valeurs restent cohérentes, donc Budget table et Réel table (rowEur) sont d'accord.
  const updateBudget = (idx: number, val: number, isEur = false) => {
    if (!m) return;
    const months = state.months.map(mo => {
      if (mo.id !== m.id) return mo;
      const budget = [...mo.budget];
      const prev = budget[idx] || { aed: 0, eur: null };
      if (isEur) {
        const eur = val;
        const aed = Math.round(eur * liveRate * 100) / 100;
        budget[idx] = { ...prev, eur, aed };
      } else {
        const aed = val;
        const eur = liveRate > 0 ? Math.round((aed / liveRate) * 100) / 100 : 0;
        budget[idx] = { ...prev, aed, eur };
      }
      return { ...mo, budget };
    });
    // La devise dans laquelle on SAISIT devient la devise de référence du poste :
    // elle reste figée, l'autre colonne suit le taux. Sans ça, saisir un objectif en
    // euros le stockait en AED et l'euro dérivait avec le taux (contre-sens).
    const target = state.postes[idx];
    const flipped = target && target.isAed === isEur;
    const postes = flipped
      ? state.postes.map((p, i) => (i === idx ? { ...p, isAed: !isEur } : p))
      : state.postes;
    setState({ ...state, postes, months });
    save();
    if (flipped) {
      logChange?.('poste.update', `« ${target.name} » : budget désormais fixé en ${isEur ? 'EUR' : 'AED'}`);
    }
  };

  const updateActual = (idx: number, val: number, isEur = false) => {
    if (!m) return;
    const months = state.months.map(mo => {
      if (mo.id !== m.id) return mo;
      const actual = [...mo.actual];
      const prev = actual[idx] || { aed: 0, eur: null };
      actual[idx] = isEur
        ? { ...prev, eur: val, aed: 0 }
        : { ...prev, aed: val, eur: null };
      return { ...mo, actual };
    });
    setState({ ...state, months });
    save();
  };

  // Régule le prévisionnel: l'user entre la balance réelle de son compte AED,
  // on calcule l'adjustment = realBalance - prevCompte(sans ajustement), on stocke ça.
  // Les futurs calculs (txns ajoutées etc.) restent corrects car l'adjustment est statique.
  const applyReconciliation = (realBalance: number) => {
    if (!m) return;
    if (!isFinite(realBalance)) return;
    const prevWithoutAdj = (m.soldeStart || 0) + earnAed - aABank;
    const newAdjustment = Math.round((realBalance - prevWithoutAdj) * 100) / 100;
    const months = state.months.map(mo =>
      mo.id === m.id ? { ...mo, adjustment: newAdjustment === 0 ? undefined : newAdjustment } : mo
    );
    setState({ ...state, months });
    save();
    logChange?.('month.update', `Régul ${m.id}: balance réelle ${f0(realBalance)} AED, ajustement ${newAdjustment >= 0 ? '+' : ''}${f0(newAdjustment)} AED`);
  };

  const clearAdjustment = () => {
    if (!m || !m.adjustment) return;
    const months = state.months.map(mo => mo.id === m.id ? { ...mo, adjustment: undefined } : mo);
    setState({ ...state, months });
    save();
  };

  // Masque un poste régulier pour ce mois (pas globalement)
  const hidePosteThisMonth = (posteName: string) => {
    if (!m) return;
    const months = state.months.map(mo => {
      if (mo.id !== m.id) return mo;
      const cur = mo.hiddenPostes || [];
      if (cur.includes(posteName)) return mo;
      return { ...mo, hiddenPostes: [...cur, posteName] };
    });
    setState({ ...state, months });
    save();
    logChange?.('poste.hide', `Masqué « ${posteName} » dans ${m.id}`);
  };

  const restoreOneHidden = (posteName: string) => {
    if (!m) return;
    const months = state.months.map(mo => {
      if (mo.id !== m.id) return mo;
      const cur = mo.hiddenPostes || [];
      return { ...mo, hiddenPostes: cur.filter(n => n !== posteName) };
    });
    setState({ ...state, months });
    save();
  };

  const restoreAllHidden = () => {
    if (!m) return;
    const months = state.months.map(mo => mo.id === m.id ? { ...mo, hiddenPostes: [] } : mo);
    setState({ ...state, months });
    save();
  };

  const addCustomRow = () => {
    if (!m) return;
    const name = arName.trim().toUpperCase() || 'AUTRE';

    // SCOPE = PERMANENT : crée un VRAI poste dans state.postes (visible dans tous les mois)
    if (arScope === 'permanent') {
      // Vérif unicité par nom — si existant, on ne re-crée pas, on update juste la valeur du mois courant
      const existingIdx = state.postes.findIndex(p => p.name === name);
      let newPostes = state.postes;
      let posteIdx = existingIdx;
      if (existingIdx < 0) {
        newPostes = [...state.postes, { name, cat: arCat, isAed: arIsAed }];
        posteIdx = newPostes.length - 1;
      }
      const months = state.months.map(mo => {
        if (mo.id !== m.id) return mo;
        const budget = [...mo.budget];
        const actual = [...mo.actual];
        if (arSection === 'budget') {
          // Set le budget du mois courant
          budget[posteIdx] = arIsAed
            ? { aed: arAed, eur: arEur > 0 ? arEur : null }
            : { aed: 0, eur: arEur > 0 ? arEur : (arAed > 0 ? arAed : null) };
          if (!actual[posteIdx]) actual[posteIdx] = { aed: 0, eur: null };
        } else {
          // section actual: set le réel du mois
          actual[posteIdx] = arIsAed
            ? { aed: arAed, eur: arEur > 0 ? arEur : null }
            : { aed: 0, eur: arEur > 0 ? arEur : (arAed > 0 ? arAed : null) };
          if (!budget[posteIdx]) budget[posteIdx] = { aed: 0, eur: null };
        }
        return { ...mo, budget, actual };
      });
      setState({ ...state, postes: newPostes, months });
      setAddRowOpen(false);
      save();
      if (existingIdx < 0) logChange?.('poste.create', `Création poste permanent « ${name} » (${arCat})`);
      return;
    }

    // SCOPE = MONTH : extras (comportement précédent)
    const row = { name, cat: arCat, aed: arAed, eur: arEur };
    const months = state.months.map(mo => {
      if (mo.id !== m.id) return mo;
      if (arSection === 'budget') {
        return { ...mo, extraBudget: [...(mo.extraBudget || []), row], extraActual: [...(mo.extraActual || []), { ...row, aed: 0, eur: 0 }] };
      }
      return { ...mo, extraActual: [...(mo.extraActual || []), row] };
    });
    setState({ ...state, months });
    setAddRowOpen(false);
    save();
  };

  // Period aggregation
  const periodMonths = periodMode ? filtered.slice(periodFrom, periodTo + 1) : [];
  const periodAgg = periodMode ? {
    totalBudgetEur: periodMonths.reduce((s, pm) => s + sumEurBudget(pm, state.postes, liveRate), 0),
    totalActualEur: periodMonths.reduce((s, pm) => s + sumEur(pm, state.postes, pm.extraActual), 0),
    totalActualAed: periodMonths.reduce((s, pm) => s + sumAed(pm, state.postes, pm.extraActual), 0),
    avgBudgetEur: 0, avgActualEur: 0,
  } : null;
  if (periodAgg && periodMonths.length > 0) {
    periodAgg.avgBudgetEur = periodAgg.totalBudgetEur / periodMonths.length;
    periodAgg.avgActualEur = periodAgg.totalActualEur / periodMonths.length;
  }

  const applyPreset = (preset: string) => {
    const ms = filtered;
    if (ms.length === 0) return;
    let from = 0, to = ms.length - 1;
    if (preset === 'Q1') { from = 0; to = Math.min(2, ms.length - 1); }
    else if (preset === 'Q2') { from = Math.min(3, ms.length - 1); to = Math.min(5, ms.length - 1); }
    else if (preset === 'S1') { from = 0; to = Math.min(5, ms.length - 1); }
    else if (preset === 'S2') { from = Math.min(6, ms.length - 1); to = ms.length - 1; }
    else if (preset === 'YTD') { from = 0; to = ms.length - 1; }
    setPeriodFrom(from);
    setPeriodTo(to);
    setPeriodMode(true);
    setPeriodOpen(false);
  };

  // Computed values
  const bE = m ? sumEurBudget(m, state.postes, liveRate) : 0;
  const bA = m ? sumAedBudget(m, state.postes, liveRate) : 0;
  const aE = m ? sumEur(m, state.postes, m.extraActual) : 0;
  const aA = m ? sumAed(m, state.postes, m.extraActual) : 0;
  // sumAedBank exclut les txns tagged comme tripKind=expense (déjà débitées via le swap)
  const aABank = m ? sumAedBank(m, state.postes, m.extraActual) : 0;

  const synced = m ? isRevSynced(m.id) : false;
  const earnEur = m ? (synced ? getMonthRevEur(m.id) : (m.earn || 0)) : 0;
  const earnAed = m ? (synced ? getMonthRevAed(m.id) : toAed(m.earn || 0, m.rate)) : 0;
  const diff = earnEur - aE;
  // Prévisionnel compte = solde + revenus - dépenses (en excluant expenses voyage)
  const adjustment = m?.adjustment || 0;
  const prevCompte = m ? ((m.soldeStart || 0) + earnAed - aABank + adjustment) : 0;

  // Prévisionnel (optimiste) — adds preview/non-confirmed revenues to confirmed forecast
  const previewEur = m && synced
    ? ((state.revenus?.months?.[m.id] || []).filter(e => e.status === 'preview').reduce((s, e) => s + (e.cashed || 0), 0))
    : 0;
  const previewAed = previewEur * (state.rate || liveRate);
  const prevOpti = prevCompte + previewAed;

  // Chart data
  const budgetPieData = m ? state.postes.map((p, i) => ({
    name: p.name, value: rowEur(m.budget[i] || { aed: 0, eur: null }, liveRate),
  })).filter(d => d.value > 0) : [];

  const actualPieData = m ? state.postes.map((p, i) => ({
    name: p.name, value: rowEur(m.actual[i] || { aed: 0, eur: null }, m.rate),
  })).filter(d => d.value > 0) : [];

  const compareData = m ? state.postes.map((p, i) => ({
    name: p.name.slice(0, 8),
    Budget: rowEur(m.budget[i] || { aed: 0, eur: null }, liveRate),
    Réel: rowEur(m.actual[i] || { aed: 0, eur: null }, m.rate),
  })).filter(d => d.Budget > 0 || d.Réel > 0) : [];

  // Mobile: dedicated UI shell (gère aussi le cas "aucun mois")
  if (isMobile === true) return <MobileTracker />;

  if (state.months.length === 0) {
    return (
      <div>
        <PageHeader breadcrumb={[{ label: activeSpace.name }, { label: 'Tracker', current: true }]} title="Tracker" subtitle="Budget prévisionnel & dépenses réelles">
          <button onClick={() => { setNmRate(liveRate); setNewMonthOpen(true); }} className="px-4 py-2 bg-accent text-black font-semibold text-sm rounded-sm hover:opacity-90 transition-all flex items-center gap-2 cursor-pointer">
            + Nouveau mois
          </button>
        </PageHeader>
        <div className="bg-bg-3 border border-border rounded-md p-6 text-center text-t-3 text-sm">
          Aucun mois. Clique &quot;Nouveau mois&quot; pour commencer.
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader breadcrumb={[{ label: activeSpace.name }, { label: 'Tracker', current: true }]} title="Tracker" subtitle="Budget prévisionnel & dépenses réelles">
        <button onClick={() => { setNmRate(liveRate); setNmName(''); setNmSolde(0); setNewMonthOpen(true); }} className="px-4 py-2 bg-accent text-black font-semibold text-sm rounded-sm hover:opacity-90 transition-all flex items-center gap-2 cursor-pointer">
          + Nouveau mois
        </button>
      </PageHeader>

      {/* Selectors (gauche) + mois courant centré */}
      {(() => {
        const idx = filtered.findIndex(mo => mo.id === curMonth);
        const hasPrev = idx > 0;
        const hasNext = idx >= 0 && idx < filtered.length - 1;
        const goPrev = () => { if (hasPrev) setCurMonth(filtered[idx - 1].id); };
        const goNext = () => { if (hasNext) setCurMonth(filtered[idx + 1].id); };
        return (
          <div className="grid grid-cols-3 items-center gap-3 mb-5 max-md:grid-cols-1">
            {/* Left: selectors */}
            <div className="flex items-center gap-2 flex-wrap justify-start">
              <label className="flex items-center gap-1.5 bg-bg-3 border border-border rounded-md pl-2.5 pr-1 py-1 cursor-pointer hover:bg-bg-4 transition-colors">
                <span className="text-[10px] uppercase tracking-wider text-t-3 font-semibold">Année</span>
                <select
                  value={curYear}
                  onChange={e => {
                    setCurYear(e.target.value);
                    const f = e.target.value === 'all' ? state.months : state.months.filter(mo => mo._year === parseInt(e.target.value));
                    if (f.length > 0 && !f.find(mo => mo.id === curMonth)) setCurMonth(f[f.length - 1].id);
                  }}
                  className="bg-transparent border-0 outline-none text-xs font-semibold text-t-1 cursor-pointer pr-1"
                >
                  <option value="all">Tous</option>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-1.5 bg-bg-3 border border-border rounded-md pl-2.5 pr-1 py-1 cursor-pointer hover:bg-bg-4 transition-colors">
                <span className="text-[10px] uppercase tracking-wider text-t-3 font-semibold">Mois</span>
                <select
                  value={curMonth || ''}
                  onChange={e => setCurMonth(e.target.value)}
                  disabled={filtered.length === 0}
                  className="bg-transparent border-0 outline-none text-xs font-semibold text-t-1 cursor-pointer pr-1 disabled:opacity-40"
                >
                  {filtered.length === 0 && <option value="">—</option>}
                  {filtered.map(mo => <option key={mo.id} value={mo.id}>{mo.id}</option>)}
                </select>
              </label>
              <button onClick={() => setPeriodOpen(true)} className={`px-2.5 py-1.5 text-[11px] rounded-md font-semibold cursor-pointer transition-all ${periodMode ? 'bg-info/20 text-info border border-info/40' : 'bg-bg-3 text-t-2 border border-border hover:bg-bg-4'}`}>
                📅 Période
              </button>
              {periodMode && (
                <button onClick={() => setPeriodMode(false)} className="px-2 py-1 text-[11px] text-t-3 hover:text-t-1 cursor-pointer">✕ Reset</button>
              )}
            </div>

            {/* Center: arrows + current month */}
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={goPrev}
                disabled={!hasPrev}
                className="w-8 h-8 flex items-center justify-center rounded-md bg-bg-3 border border-border text-t-2 hover:bg-bg-4 hover:text-t-1 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Mois précédent"
              >‹</button>
              <div className="min-w-[120px] px-4 py-1.5 text-center text-sm font-bold tracking-tight bg-bg-3 border border-border-2 rounded-md">
                {curMonth || '—'}
              </div>
              <button
                onClick={goNext}
                disabled={!hasNext}
                className="w-8 h-8 flex items-center justify-center rounded-md bg-bg-3 border border-border text-t-2 hover:bg-bg-4 hover:text-t-1 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Mois suivant"
              >›</button>
            </div>

            {/* Right: spacer to keep center centered */}
            <div />
          </div>
        );
      })()}

      {/* Period aggregation summary */}
      {periodMode && periodAgg && periodMonths.length > 0 && (
        <div className="bg-info/5 border border-info/20 rounded-md p-4 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[11px] font-semibold text-info uppercase tracking-wider">📅 Période : {periodMonths[0].id} → {periodMonths[periodMonths.length - 1].id}</span>
            <span className="text-[10px] text-t-3">({periodMonths.length} mois)</span>
          </div>
          <div className="grid grid-cols-4 gap-3 max-md:grid-cols-2">
            <div>
              <div className="text-[9px] text-t-3 uppercase tracking-wider">Total dépensé</div>
              <div className="font-mono text-lg font-semibold mono-value">{f$(periodAgg.totalActualEur)} €</div>
            </div>
            <div>
              <div className="text-[9px] text-t-3 uppercase tracking-wider">Total budget</div>
              <div className="font-mono text-lg font-semibold mono-value">{f$(periodAgg.totalBudgetEur)} €</div>
            </div>
            <div>
              <div className="text-[9px] text-t-3 uppercase tracking-wider">Moy. dépenses/mois</div>
              <div className="font-mono text-lg font-semibold mono-value">{f$(periodAgg.avgActualEur)} €</div>
            </div>
            <div>
              <div className="text-[9px] text-t-3 uppercase tracking-wider">Écart total</div>
              <div className={`font-mono text-lg font-semibold mono-value ${periodAgg.totalBudgetEur - periodAgg.totalActualEur >= 0 ? 'text-accent' : 'text-danger'}`}>
                {periodAgg.totalBudgetEur - periodAgg.totalActualEur >= 0 ? '+' : ''}{f$(periodAgg.totalBudgetEur - periodAgg.totalActualEur)} €
              </div>
            </div>
          </div>
        </div>
      )}

      {m && (
        <>
          {/* Solde cards */}
          <div className="flex gap-2.5 mb-5 flex-wrap">
            <SoldeCard icon="🏦" label="Solde début (AED)" value={m.soldeStart} onChange={v => updateMonth(m.id, 'soldeStart', v)} />
            <SoldeCard icon="🏦" label="Solde fin (AED)" value={m.soldeEnd} onChange={v => updateMonth(m.id, 'soldeEnd', v)} />
            {(() => {
              const regulButton = (
                <button
                  onClick={() => { setReconcileInput(prevCompte.toFixed(0)); setReconcileOpen(true); }}
                  className="text-[9px] text-t-3 hover:text-accent bg-bg-2/80 border border-border rounded px-1.5 py-0.5 cursor-pointer transition-colors"
                  title="Régulariser avec la balance réelle de ton compte"
                >Régul</button>
              );
              const adjSub = adjustment !== 0
                ? <span className={`text-[10px] mt-0.5 mono-value font-medium ${adjustment > 0 ? 'text-accent' : 'text-warning'}`}>Ajusté {adjustment > 0 ? '+' : ''}{f0(adjustment)} AED</span>
                : undefined;
              if (synced && previewEur > 0) {
                return (
                  <>
                    <SoldeDisplay icon="📊" label="Prévisionnel (Confirmé)" value={`${f0(prevCompte)} AED`} color={prevCompte >= 0 ? 'text-accent' : 'text-danger'} sub={adjSub} action={regulButton} />
                    <SoldeDisplay icon="🔮" label="Prévisionnel (Optimiste)" value={`${f0(prevOpti)} AED`} color="text-info" sub={`si ${f$(previewEur)} € confirmés`} tone="info" />
                  </>
                );
              }
              return (
                <SoldeDisplay icon="📊" label="Prévisionnel compte (AED)" value={`${f0(prevCompte)} AED`} color={prevCompte >= 0 ? 'text-accent' : 'text-danger'} sub={adjSub} action={regulButton} />
              );
            })()}
            {synced ? (
              <SoldeDisplay
                icon="💵"
                label="Revenus confirmés"
                value={`${f$(earnEur)} €`}
                sub={previewEur > 0 ? `+ ${f$(previewEur)} € en prévision (${f$(earnEur + previewEur)} €)` : undefined}
                color="text-t-1"
              />
            ) : (
              <SoldeCard icon="💵" label="Revenus (EUR)" value={m.earn} onChange={v => updateMonth(m.id, 'earn', v)} />
            )}
            <SoldeDisplay icon={diff >= 0 ? '✅' : '⚠️'} label="Revenus − Dépenses" value={`${diff >= 0 ? '+' : ''}${f$(diff)} €`} color={diff >= 0 ? 'text-accent' : 'text-danger'} />
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <KpiCard label="Budget" value={`${f$(bE)} €`} sub={`${f0(bA)} AED`} accentColor="#3b82f6" />
            <KpiCard label="Dépenses du mois" value={`${f$(aE)} €`} sub={`${f0(aA)} AED`} accentColor="#f59e0b" />
          </div>

          {/* Bannière postes masqués */}
          {(m.hiddenPostes || []).length > 0 && (
            <div className="flex items-start justify-between gap-3 mb-3 px-3.5 py-2.5 bg-bg-3 border border-warning/30 rounded-md text-[11px]">
              <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
                <span className="text-t-3 flex items-center gap-1.5 shrink-0">
                  <EyeOff size={12} className="text-warning" />
                  Masqué{(m.hiddenPostes || []).length > 1 ? 's' : ''} dans {m.id} :
                </span>
                {(m.hiddenPostes || []).map(name => (
                  <button
                    key={name}
                    onClick={() => restoreOneHidden(name)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-warning/10 text-warning border border-warning/30 rounded-full text-[10px] font-semibold hover:bg-accent/15 hover:text-accent hover:border-accent/30 cursor-pointer transition-colors group"
                    title={`Restaurer ${name}`}
                  >
                    {name}
                    <span className="text-[12px] leading-none opacity-60 group-hover:opacity-100">×</span>
                  </button>
                ))}
              </div>
              {(m.hiddenPostes || []).length > 1 && (
                <button onClick={restoreAllHidden} className="text-[11px] text-accent hover:underline cursor-pointer font-semibold whitespace-nowrap shrink-0">Tout restaurer</button>
              )}
            </div>
          )}

          {/* Budget Table */}
          <TableSection title="Budget Prévisionnel" subtitle="Estimations du mois · la devise que tu saisis reste figée, l’autre suit le taux">
            <thead>
              <tr className="bg-bg-2">
                <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium w-[25%]">Poste</th>
                <th className="text-right px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium w-[18%]">AED</th>
                <th className="text-right px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium w-[18%]">EUR</th>
                <th className="text-right px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium w-[14%]">% Total</th>
              </tr>
            </thead>
            <tbody>
              {state.postes.map((p, i) => {
                if ((m.hiddenPostes || []).includes(p.name)) return null;
                const row = m.budget[i] || { aed: 0, eur: null };
                // Budget EUR = AED converti au taux live pour les postes AED (ignore le eur figé)
                const eur = p.isAed ? toEur(row.aed, liveRate) : (row.eur || 0);
                const pct = bE > 0 ? ((eur / bE) * 100).toFixed(1) : '0.0';
                return (
                  <tr key={i} className="border-b border-border hover:bg-white/[.02] transition-colors group">
                    <td className="px-4 py-2.5 text-[13px] font-semibold">
                      {p.name}
                      <button
                        onClick={() => hidePosteThisMonth(p.name)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity ml-2 inline-flex items-center text-warning hover:text-danger cursor-pointer"
                        title={`Masquer « ${p.name} » dans ${m.id} (juste ce mois)`}
                      ><EyeOff size={11} /></button>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <CellInput
                        value={Math.round((p.isAed ? row.aed : toAed(row.eur ?? 0, liveRate)) * 100) / 100}
                        onChange={v => updateBudget(i, v)}
                        muted={!p.isAed}
                        title={p.isAed ? 'Objectif fixé en AED' : 'Calculé au taux live — saisis ici pour fixer l\u2019objectif en AED'}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <CellInput
                        value={Math.round((p.isAed ? eur : (row.eur ?? eur)) * 100) / 100}
                        onChange={v => updateBudget(i, v, true)}
                        muted={p.isAed}
                        title={p.isAed ? 'Calculé au taux live — saisis ici pour fixer l\u2019objectif en EUR' : 'Objectif fixé en EUR'}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="font-mono text-[11px]">{pct}%</span>
                      <div className="h-[3px] bg-border rounded mt-1 overflow-hidden">
                        <div className="h-full bg-info rounded transition-all duration-300" style={{ width: `${Math.min(parseFloat(pct), 100)}%` }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {(m.extraBudget || []).map((r, i) => {
                const eur = r.eur > 0 ? r.eur : toEur(r.aed, liveRate);
                const pct = bE > 0 ? ((eur / bE) * 100).toFixed(1) : '0.0';
                return (
                  <tr key={`eb${i}`} className="border-b border-border hover:bg-white/[.02] group">
                    <td className="px-4 py-2.5 text-[13px] font-semibold">
                      {r.name}
                      <button onClick={() => { const months = state.months.map(mo => mo.id === m.id ? { ...mo, extraBudget: mo.extraBudget.filter((_, j) => j !== i) } : mo); setState({ ...state, months }); save(); }} className="opacity-0 group-hover:opacity-100 transition-opacity ml-2 text-[10px] text-danger bg-danger/10 border border-danger/25 px-1.5 py-0.5 rounded cursor-pointer hover:bg-danger/20" title="Supprimer cet extra">✕</button>
                    </td>
                    <td className="px-4 py-2.5 text-right"><span className="font-mono text-xs mono-value pr-2 inline-block border border-transparent">{r.aed > 0 ? f0(r.aed) : (r.eur > 0 ? f0(toAed(r.eur, liveRate)) : '—')}</span></td>
                    <td className="px-4 py-2.5 text-right"><span className="font-mono text-xs text-t-3 mono-value pr-2 inline-block border border-transparent">{f$(eur)}</span></td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="font-mono text-[11px]">{pct}%</span>
                      <div className="h-[3px] bg-border rounded mt-1 overflow-hidden">
                        <div className="h-full bg-info rounded transition-all duration-300" style={{ width: `${Math.min(parseFloat(pct), 100)}%` }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td colSpan={4} className="text-center py-2">
                  <button onClick={() => { setArSection('budget'); setArName(''); setArAed(0); setArEur(0); setArScope('month'); setArIsAed(true); setAddRowOpen(true); }} className="text-xs text-t-2 border border-border px-3 py-1 rounded-sm hover:bg-bg-3 transition-all cursor-pointer">+ Ajouter un poste</button>
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="bg-bg-2">
                <td className="px-4 py-2.5 font-bold text-[13px]">TOTAL</td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-[13px] mono-value pr-6">{f0(bA)} AED</td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-[13px] mono-value pr-6">{f$(bE)} €</td>
                <td />
              </tr>
            </tfoot>
          </TableSection>

          {/* Actual Table */}
          <TableSection title="Dépenses Réelles" subtitle="Montants effectifs">
            <thead>
              <tr className="bg-bg-2">
                <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium w-[20%]">Poste</th>
                <th className="text-right px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium w-[15%]">AED</th>
                <th className="text-right px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium w-[15%]">EUR</th>
                <th className="text-right px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium w-[12%]">Ratio</th>
                <th className="text-right px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium w-[15%]">Écart EUR</th>
              </tr>
            </thead>
            <tbody>
              {state.postes.map((p, i) => {
                if ((m.hiddenPostes || []).includes(p.name)) return null;
                const row = m.actual[i] || { aed: 0, eur: null };
                const brow = m.budget[i] || { aed: 0, eur: null };
                const eur = rowEur(row, m.rate);
                // Budget EUR = AED converti au taux live (cohérent avec le total et la carte)
                const beur = p.isAed ? toEur(brow.aed, liveRate) : (brow.eur || 0);
                const ratio = beur > 0 ? eur / beur : 0;
                const ecart = beur - eur;
                const rc = ratio > 1.05 ? 'text-danger' : ratio < 0.95 && ratio > 0 ? 'text-accent' : 'text-t-3';
                // Quand l'écart est ~ 0 (objectif atteint pile), on rend le badge discret
                const ecartZero = beur > 0 && Math.abs(ecart) < 0.5;
                const ecartCls = ecartZero ? 'text-t-3 opacity-60' : ecart >= 0 ? 'text-accent' : 'text-danger';
                return (
                  <tr key={i} className="border-b border-border hover:bg-white/[.02] group">
                    <td className="px-4 py-2.5 text-[13px] font-semibold">
                      <button onClick={() => setSlidePoste({ name: p.name, idx: i, section: 'actual' })} className="hover:text-accent transition-colors cursor-pointer text-left">{p.name}</button>
                      <button onClick={() => openTxnAdd(i)} className="text-[10px] text-accent bg-accent/10 border border-accent/25 px-1.5 py-0.5 rounded cursor-pointer hover:bg-accent/20 ml-1.5 font-bold">+</button>
                      {(m.actual[i]?.txns || []).length > 0 && (
                        <button onClick={() => setSlidePoste({ name: p.name, idx: i, section: 'actual' })} className="inline-flex items-center gap-1 text-[9px] text-info bg-info/10 border border-info/25 px-1.5 py-0.5 rounded cursor-pointer hover:bg-info/20 ml-1 font-bold" title="Voir les transactions">
                          <span>👁</span>{(m.actual[i]?.txns || []).length}
                        </button>
                      )}
                      <button
                        onClick={() => hidePosteThisMonth(p.name)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity ml-1.5 inline-flex items-center text-warning hover:text-danger cursor-pointer align-middle"
                        title={`Masquer « ${p.name} » dans ${m.id} (juste ce mois)`}
                      ><EyeOff size={11} /></button>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {p.isAed
                        ? <CellInput value={row.aed} onChange={v => updateActual(i, v)} />
                        : <span className="font-mono text-xs text-t-3 mono-value pr-2 inline-block border border-transparent">{(row.eur || 0) > 0 ? f0(toAed(row.eur || 0, m.rate)) : '—'}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {!p.isAed
                        ? <CellInput value={row.eur || 0} onChange={v => updateActual(i, v, true)} />
                        : <span className="font-mono text-xs text-t-3 mono-value pr-2 inline-block border border-transparent">{f$(eur)}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`font-mono text-[11px] font-semibold ${rc}`}>{beur > 0 ? `${(ratio * 100).toFixed(0)}%` : '—'}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`font-mono text-[11px] ${ecartCls} mono-value`}>
                        {beur > 0 ? `${ecart >= 0 ? '+' : ''}${f$(ecart)} €` : '—'}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {(m.extraActual || []).map((r, i) => {
                const eur = r.eur > 0 ? r.eur : toEur(r.aed, m.rate);
                // Row de swap (VOYAGES) = transfert AED→EUR, exclue du total (pas une dépense)
                const isSwapRow = !!(r.txns && r.txns.length > 0 && r.txns.every(t => t.tripKind === 'swap'));
                // Cherche le budget correspondant dans extraBudget par nom
                const bRow = (m.extraBudget || []).find(b => b.name === r.name);
                const beur = bRow ? (bRow.eur > 0 ? bRow.eur : toEur(bRow.aed, liveRate)) : 0;
                const ratio = beur > 0 ? eur / beur : 0;
                const ecart = beur - eur;
                const rc = ratio > 1.05 ? 'text-danger' : ratio < 0.95 && ratio > 0 ? 'text-accent' : 'text-t-3';
                const ecartZero = beur > 0 && Math.abs(ecart) < 0.5;
                const ecartCls = ecartZero ? 'text-t-3 opacity-60' : ecart >= 0 ? 'text-accent' : 'text-danger';
                return (
                  <tr key={`ea${i}`} className="border-b border-border hover:bg-white/[.02] group">
                    <td className="px-4 py-2.5 text-[13px] font-semibold">
                      {r.name}
                      {isSwapRow && <span className="text-[9px] text-t-4 font-normal ml-1.5 uppercase tracking-wider">transfert · hors total</span>}
                      <button onClick={() => openTxnAddExtra(i)} className="text-[10px] text-accent bg-accent/10 border border-accent/25 px-1.5 py-0.5 rounded cursor-pointer hover:bg-accent/20 ml-1.5 font-bold">+</button>
                      {(r.txns || []).length > 0 && (
                        <button onClick={() => setSlidePoste({ name: r.name, idx: i, section: 'actual', isExtra: true })} className="inline-flex items-center gap-1 text-[9px] text-info bg-info/10 border border-info/25 px-1.5 py-0.5 rounded cursor-pointer hover:bg-info/20 ml-1 font-bold" title="Voir les transactions">
                          <span>👁</span>{(r.txns || []).length}
                        </button>
                      )}
                      <button onClick={() => { const months = state.months.map(mo => mo.id === m.id ? { ...mo, extraActual: mo.extraActual.filter((_, j) => j !== i) } : mo); setState({ ...state, months }); save(); }} className="opacity-0 group-hover:opacity-100 transition-opacity ml-1 text-[10px] text-danger bg-danger/10 border border-danger/25 px-1.5 py-0.5 rounded cursor-pointer hover:bg-danger/20" title="Supprimer cet extra">✕</button>
                    </td>
                    <td className="px-4 py-2.5 text-right"><span className="font-mono text-xs mono-value pr-2 inline-block border border-transparent">{r.aed > 0 ? f0(r.aed) : (r.eur > 0 ? f0(toAed(r.eur, m.rate)) : '—')}</span></td>
                    <td className="px-4 py-2.5 text-right"><span className="font-mono text-xs text-t-3 mono-value pr-2 inline-block border border-transparent">{f$(eur)}</span></td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`font-mono text-[11px] font-semibold ${rc}`}>{beur > 0 ? `${(ratio * 100).toFixed(0)}%` : '—'}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`font-mono text-[11px] ${ecartCls} mono-value`}>
                        {beur > 0 ? `${ecart >= 0 ? '+' : ''}${f$(ecart)} €` : '—'}
                      </span>
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td colSpan={5} className="text-center py-2">
                  <button onClick={() => { setArSection('actual'); setArName(''); setArAed(0); setArEur(0); setAddRowOpen(true); }} className="text-xs text-t-2 border border-border px-3 py-1 rounded-sm hover:bg-bg-3 transition-all cursor-pointer">+ Ajouter un poste</button>
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="bg-bg-2">
                <td className="px-4 py-2.5 font-bold text-[13px]">TOTAL</td>
                <td className="px-4 py-2.5 text-right font-mono font-bold mono-value pr-6">{f0(aA)} AED</td>
                <td className="px-4 py-2.5 text-right font-mono font-bold mono-value pr-6">{f$(aE)} €</td>
                <td className="px-4 py-2.5 text-right">
                  <span className={`font-mono text-[11px] font-semibold ${bE > 0 && aE / bE > 1.05 ? 'text-danger' : 'text-accent'}`}>
                    {bE > 0 ? `${(aE / bE * 100).toFixed(0)}%` : '—'}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  {(() => {
                    const ecartTot = bE - aE;
                    const zero = bE > 0 && Math.abs(ecartTot) < 0.5;
                    const cls = zero ? 'text-t-3 opacity-60' : ecartTot >= 0 ? 'text-accent' : 'text-danger';
                    return (
                      <span className={`font-mono text-[11px] font-semibold ${cls} mono-value`}>
                        {bE > 0 ? `${ecartTot >= 0 ? '+' : ''}${f$(ecartTot)} €` : '—'}
                      </span>
                    );
                  })()}
                </td>
              </tr>
            </tfoot>
          </TableSection>

          {/* Bilan vs prévisionnel */}
          <BudgetBalanceCard month={m} postes={state.postes} liveRate={liveRate} forecast={{ earnEur, previewEur, prevCompteAed: prevCompte, pocketEur: pocketCashEur(trips, state.months) }} />

          {/* Stats du mois — à retravailler */}
          {/* <MonthStatsCard month={m} postes={state.postes} /> */}

          {/* Charts */}
          <div className="grid grid-cols-2 gap-3 mb-5 max-lg:grid-cols-1">
            <ChartBox title="Répartition Budget">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={budgetPieData} dataKey="value" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2}>
                    {budgetPieData.map((_, i) => <Cell key={i} fill={PIE_C[i % PIE_C.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => `${f$(Number(v))} €`} contentStyle={{ background: '#1c1c23', border: '1px solid #2a2a3a', borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartBox>
            <ChartBox title="Répartition Réelle">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={actualPieData} dataKey="value" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2}>
                    {actualPieData.map((_, i) => <Cell key={i} fill={PIE_C[i % PIE_C.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => `${f$(Number(v))} €`} contentStyle={{ background: '#1c1c23', border: '1px solid #2a2a3a', borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartBox>
          </div>

          <ChartBox title="Budget vs Réel" className="mb-5">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={compareData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2a" />
                <XAxis type="number" tick={{ fill: '#52525b', fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#52525b', fontSize: 11 }} width={80} />
                <Tooltip contentStyle={{ background: '#1c1c23', border: '1px solid #2a2a3a', borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Budget" fill="rgba(59,130,246,0.3)" radius={4} />
                <Bar dataKey="Réel" fill="rgba(236,72,153,0.35)" radius={4} />
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>
        </>
      )}

      {/* New Month Modal */}
      <Modal open={newMonthOpen} onClose={() => setNewMonthOpen(false)} title="Créer un nouveau mois">
        <div className="space-y-3.5">
          <FormField label="Nom du mois">
            <input className="fi" value={nmName} onChange={e => setNmName(e.target.value)} placeholder="Ex: AVRIL" />
          </FormField>
          <FormField label="Taux EUR/AED pour ce mois">
            <input className="fi" type="number" value={nmRate} onChange={e => setNmRate(parseFloat(e.target.value) || 0)} step="0.0001" />
          </FormField>
          <FormField label="Solde début de mois (AED)">
            <input className="fi" type="number" value={nmSolde} onChange={e => setNmSolde(parseFloat(e.target.value) || 0)} step="0.01" />
          </FormField>
          {state.months.length > 0 && (
            <FormField label="Pré-remplissage du budget">
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-bg-2 border border-border rounded-md">
                {([
                  { id: 'copy', label: 'Copier M-1', sub: 'Reprend le budget précédent' },
                  { id: 'avg3', label: 'Moyenne 3 mois', sub: 'Lissé sur les 3 actuals' },
                  { id: 'empty', label: 'Vide', sub: 'Tout à zéro' },
                ] as const).map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setNmFillMode(opt.id)}
                    title={opt.sub}
                    className={`px-2 py-2 rounded text-[11px] font-semibold tracking-tight transition-all ${
                      nmFillMode === opt.id
                        ? 'bg-accent text-black shadow-glow-sm'
                        : 'text-t-2 hover:text-t-1 hover:bg-bg-3'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </FormField>
          )}
          <div className="flex gap-2.5 mt-5">
            <button onClick={createMonth} className="px-4 py-2 bg-accent text-black font-semibold text-sm rounded-sm cursor-pointer hover:opacity-90">Créer</button>
            <button onClick={() => setNewMonthOpen(false)} className="px-4 py-2 border border-border text-t-2 text-sm rounded-sm cursor-pointer hover:bg-bg-3">Annuler</button>
          </div>
        </div>
      </Modal>

      {/* Add Row Modal */}
      <Modal open={addRowOpen} onClose={() => setAddRowOpen(false)} title="Ajouter un poste">
        <div className="space-y-3.5">
          <FormField label="Portée">
            <div className="flex bg-bg-4 rounded-md p-0.5">
              {([['Ce mois uniquement', 'month'], ['Permanent', 'permanent']] as const).map(([label, val]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setArScope(val)}
                  className={`flex-1 py-1.5 text-[12px] font-semibold rounded cursor-pointer transition-all ${arScope === val ? 'bg-bg-2 text-t-1 shadow-sm' : 'text-t-3'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="text-[10px] text-t-4 mt-1">
              {arScope === 'month' ? `Apparaît uniquement dans ${m?.id || 'ce mois'}` : 'Apparaît dans tous les mois (présents et futurs)'}
            </div>
          </FormField>
          <FormField label="Section">
            <select className="fi" value={arSection} onChange={e => setArSection(e.target.value as 'budget' | 'actual')}>
              <option value="budget">Budget</option>
              <option value="actual">Réel</option>
            </select>
          </FormField>
          <FormField label="Nom">
            <input className="fi" value={arName} onChange={e => setArName(e.target.value)} placeholder="Ex: PARFUMS, TRANSPORT..." />
          </FormField>
          <FormField label="Catégorie">
            <select className="fi" value={arCat} onChange={e => setArCat(e.target.value as 'vital' | 'lifestyle' | 'finance' | 'logement')}>
              <option value="vital">Vital</option>
              <option value="lifestyle">Lifestyle</option>
              <option value="logement">Logement</option>
              <option value="finance">Finance</option>
            </select>
          </FormField>
          {arScope === 'permanent' && (
            <FormField label="Devise principale">
              <div className="flex bg-bg-4 rounded-md p-0.5">
                {([['AED', true], ['EUR', false]] as const).map(([label, val]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setArIsAed(val)}
                    className={`flex-1 py-1.5 text-[12px] font-semibold rounded cursor-pointer transition-all ${arIsAed === val ? 'bg-bg-2 text-t-1 shadow-sm' : 'text-t-3'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </FormField>
          )}
          <FormField label="Montant AED">
            <input className="fi" type="number" value={arAed} onChange={e => setArAed(parseFloat(e.target.value) || 0)} step="0.01" />
          </FormField>
          <FormField label="Montant EUR">
            <input className="fi" type="number" value={arEur} onChange={e => setArEur(parseFloat(e.target.value) || 0)} step="0.01" />
          </FormField>
          <div className="flex gap-2.5 mt-5">
            <button onClick={addCustomRow} className="px-4 py-2 bg-accent text-black font-semibold text-sm rounded-sm cursor-pointer hover:opacity-90">Ajouter</button>
            <button onClick={() => setAddRowOpen(false)} className="px-4 py-2 border border-border text-t-2 text-sm rounded-sm cursor-pointer hover:bg-bg-3">Annuler</button>
          </div>
        </div>
      </Modal>

      {/* Slide-over detail */}
      <SlideOver
        open={!!slidePoste}
        onClose={() => setSlidePoste(null)}
        title={slidePoste?.name || ''}
        subtitle={m ? `${m.id} — Détail du poste` : ''}
      >
        {slidePoste && m && (() => {
          const isExtra = !!slidePoste.isExtra;
          const row = isExtra
            ? (m.extraActual?.[slidePoste.idx] || { aed: 0, eur: 0, name: slidePoste.name, txns: [] })
            : (m.actual[slidePoste.idx] || { aed: 0, eur: null });
          const brow = isExtra ? { aed: 0, eur: 0 } : (m.budget[slidePoste.idx] || { aed: 0, eur: null });
          const p = isExtra ? null : state.postes[slidePoste.idx];
          const eur = isExtra
            ? ((row as { eur?: number }).eur && (row as { eur: number }).eur > 0 ? (row as { eur: number }).eur : toEur((row as { aed: number }).aed, m.rate))
            : rowEur(row as ActualRow, m.rate);
          const beur = isExtra ? 0 : rowEur(brow as ActualRow, liveRate);
          const txns = (row as { txns?: { amount: number; eur?: number; rate?: number; currency?: string; label?: string; date?: string }[] }).txns || [];
          // Historical data across months
          const history = isExtra
            ? state.months.map(mo => {
                const er = mo.extraActual?.find(x => x.name === slidePoste.name);
                const a = er ? (er.eur && er.eur > 0 ? er.eur : toEur(er.aed, mo.rate)) : 0;
                return { month: shortMonth(mo.id), actual: a, budget: 0 };
              })
            : state.months.map(mo => ({
                month: shortMonth(mo.id),
                actual: rowEur(mo.actual[slidePoste.idx] || { aed: 0, eur: null }, mo.rate),
                budget: rowEur(mo.budget[slidePoste.idx] || { aed: 0, eur: null }, liveRate),
              }));
          const avg = history.length > 0 ? history.reduce((s, h) => s + h.actual, 0) / history.filter(h => h.actual > 0).length || 0 : 0;

          return (
            <div className="space-y-5">
              {/* KPIs */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-bg-3 border border-border rounded-md p-3">
                  <div className="text-[9px] text-t-3 uppercase tracking-wider">Réel ce mois</div>
                  <div className="font-mono text-base font-semibold mt-1 mono-value">{f$(eur)} €</div>
                  {(isExtra || p?.isAed) && <div className="text-[10px] text-t-3 font-mono mono-value">{f0((row as { aed: number }).aed)} AED</div>}
                </div>
                <div className="bg-bg-3 border border-border rounded-md p-3">
                  <div className="text-[9px] text-t-3 uppercase tracking-wider">Budget</div>
                  <div className="font-mono text-base font-semibold mt-1 mono-value">{f$(beur)} €</div>
                </div>
              </div>

              {/* Ratio */}
              <div className="bg-bg-3 border border-border rounded-md p-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[9px] text-t-3 uppercase tracking-wider">Consommation</span>
                  <span className={`font-mono text-sm font-semibold ${beur > 0 && eur / beur > 1.05 ? 'text-danger' : 'text-accent'}`}>
                    {beur > 0 ? `${(eur / beur * 100).toFixed(0)}%` : '—'}
                  </span>
                </div>
                <div className="h-1.5 bg-border rounded overflow-hidden">
                  <div className={`h-full rounded transition-all ${beur > 0 && eur / beur > 1 ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${Math.min(beur > 0 ? (eur / beur) * 100 : 0, 100)}%` }} />
                </div>
              </div>

              {/* Average */}
              <div className="bg-bg-3 border border-border rounded-md p-3">
                <div className="text-[9px] text-t-3 uppercase tracking-wider">Moyenne mensuelle</div>
                <div className="font-mono text-base font-semibold mt-1 mono-value">{f$(avg)} €</div>
                <div className="text-[10px] text-t-3 mt-0.5">Sur {history.filter(h => h.actual > 0).length} mois avec données</div>
              </div>

              {/* Transactions */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <div className="text-[10px] text-t-3 uppercase tracking-wider font-medium">Transactions ({txns.length})</div>
                  <button onClick={() => isExtra ? openTxnAddExtra(slidePoste.idx) : openTxnAdd(slidePoste.idx)} className="text-[10px] text-accent bg-accent/10 border border-accent/25 px-2 py-0.5 rounded cursor-pointer hover:bg-accent/20 font-bold">+ Ajouter</button>
                </div>
                {txns.length > 0 ? (
                  <div className="space-y-1.5">
                    {txns.map((t, ti) => (
                      <div key={ti} className="flex justify-between items-center py-2 px-3 bg-bg-3 border border-border rounded-sm group">
                        <div>
                          <div className="text-xs font-medium">{t.label || 'Transaction'}</div>
                          <div className="flex items-center gap-2">
                            {t.date && <span className="text-[10px] text-t-3">{t.date}</span>}
                            {t.currency === 'EUR' && <span className="text-[8px] text-info bg-info/10 px-1 rounded">EUR</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <div className="font-mono text-xs font-semibold mono-value">{f$(t.eur || t.amount / (t.rate || m.rate))} €</div>
                            <div className="text-[10px] text-t-3 font-mono">{f0(t.amount)} AED</div>
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => isExtra ? openTxnEditExtra(slidePoste.idx, ti) : openTxnEdit(slidePoste.idx, ti)} className="text-[10px] text-info bg-info/10 border border-info/25 px-1.5 py-0.5 rounded cursor-pointer hover:bg-info/20">✎</button>
                            <button onClick={() => isExtra ? deleteTxnExtra(slidePoste.idx, ti) : deleteTxn(slidePoste.idx, ti)} className="text-[10px] text-danger bg-danger/10 border border-danger/25 px-1.5 py-0.5 rounded cursor-pointer hover:bg-danger/20">✕</button>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-between items-center pt-2 px-3 border-t border-border">
                      <span className="text-[10px] text-t-3 font-semibold uppercase">Total ({txns.length})</span>
                      <span className="font-mono text-xs font-bold mono-value">{f$(txns.reduce((s, t) => s + (t.eur || t.amount / (t.rate || m.rate)), 0))} €</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4 text-t-3 text-xs">
                    Aucune transaction. Cliquez + pour en ajouter.
                  </div>
                )}
              </div>

              {/* Mini history */}
              <div>
                <div className="text-[10px] text-t-3 uppercase tracking-wider font-medium mb-2">Historique</div>
                <div className="space-y-1">
                  {history.filter(h => h.actual > 0 || h.budget > 0).map((h, i) => (
                    <div key={i} className="flex justify-between items-center py-1.5 px-3 bg-bg-3 border border-border rounded-sm text-xs">
                      <span className="text-t-2 font-medium">{h.month}</span>
                      <div className="flex gap-4">
                        <span className="font-mono text-t-3 mono-value">B: {f$(h.budget)}</span>
                        <span className="font-mono font-semibold mono-value">R: {f$(h.actual)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}
      </SlideOver>

      {/* Transaction Modal */}
      <Modal open={txnOpen} onClose={() => setTxnOpen(false)} title={
        (() => {
          const posteName = txnTarget
            ? txnTarget.isExtra && txnTarget.extraIdx !== undefined
              ? m?.extraActual?.[txnTarget.extraIdx]?.name || 'Extra'
              : state.postes[txnTarget.posteIdx]?.name || 'Poste'
            : 'Poste';
          return `Transaction — ${posteName}`;
        })()
      }>
        <div className="space-y-4">
          <FormField label="Poste">
            {!createPosteMode ? (
              <div className="flex gap-2">
                <select
                  className="fi flex-1"
                  value={selectedPosteIdx}
                  onChange={e => setSelectedPosteIdx(parseInt(e.target.value))}
                >
                  {txnTarget?.isExtra && txnTarget.extraIdx !== undefined && (
                    <option value={-1}>📦 Garder dans « {m?.extraActual?.[txnTarget.extraIdx]?.name || 'Extra'} »</option>
                  )}
                  {state.postes.map((p, i) => <option key={i} value={i}>{p.name}</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => setCreatePosteMode(true)}
                  className="px-3 py-2 text-[11px] font-semibold bg-accent/10 text-accent border border-accent/25 rounded-md hover:bg-accent/20 cursor-pointer whitespace-nowrap"
                >
                  + Nouveau
                </button>
              </div>
            ) : (
                <div className="space-y-2 border border-accent/30 rounded-md p-3 bg-accent/5">
                  <input
                    className="fi"
                    value={newPosteForm.name}
                    onChange={e => setNewPosteForm({ ...newPosteForm, name: e.target.value.toUpperCase() })}
                    placeholder="Nom du poste (ex: TRANSPORT)"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <select
                      className="fi flex-1"
                      value={newPosteForm.cat}
                      onChange={e => setNewPosteForm({ ...newPosteForm, cat: e.target.value as 'vital' | 'lifestyle' | 'finance' | 'logement' })}
                    >
                      <option value="vital">Vital</option>
                      <option value="lifestyle">Lifestyle</option>
                      <option value="finance">Finance</option>
                      <option value="logement">Logement</option>
                    </select>
                    <div className="flex bg-bg-4 rounded-md p-0.5">
                      {([['AED', true], ['EUR', false]] as const).map(([label, val]) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => setNewPosteForm({ ...newPosteForm, isAed: val })}
                          className={`px-3 py-1 text-[11px] font-semibold rounded cursor-pointer transition-all ${newPosteForm.isAed === val ? 'bg-bg-2 text-t-1 shadow-sm' : 'text-t-3'}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-t-3 uppercase tracking-wider font-medium mb-1.5">Portée</div>
                    <div className="flex bg-bg-4 rounded-md p-0.5">
                      {([['Ce mois uniquement', 'month'], ['Permanent', 'permanent']] as const).map(([label, val]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setNewPosteForm({ ...newPosteForm, scope: val })}
                          className={`flex-1 py-1.5 text-[11px] font-semibold rounded cursor-pointer transition-all ${newPosteForm.scope === val ? 'bg-bg-2 text-t-1 shadow-sm' : 'text-t-3'}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="text-[10px] text-t-4 mt-1">
                      {newPosteForm.scope === 'month' ? `Apparaît seulement dans ${m?.id || 'ce mois'}` : 'Apparaît dans tous les mois (présents et futurs)'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setCreatePosteMode(false); setNewPosteForm({ name: '', cat: 'vital', isAed: true, scope: 'month' }); }}
                    className="text-[11px] text-t-3 hover:text-t-1 cursor-pointer"
                  >
                    ← Choisir un poste existant
                  </button>
                </div>
              )}
          </FormField>
          <FormField label="Libellé">
            <div className="relative">
              <input
                className="fi"
                value={txnForm.label}
                onChange={e => { setTxnForm({ ...txnForm, label: e.target.value }); setShowLabelSugg(true); }}
                onFocus={() => setShowLabelSugg(true)}
                onBlur={() => setTimeout(() => setShowLabelSugg(false), 150)}
                placeholder="Ex: Carrefour, Uber..."
                autoFocus
                autoComplete="off"
              />
              {showLabelSugg && filteredSuggestions.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-bg-3 border border-border-2 rounded-md shadow-lg max-h-56 overflow-y-auto">
                  {filteredSuggestions.map(s => (
                    <button
                      key={s.label}
                      type="button"
                      onMouseDown={e => { e.preventDefault(); setTxnForm({ ...txnForm, label: s.label }); setShowLabelSugg(false); }}
                      className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left text-[13px] text-t-1 hover:bg-bg-4 cursor-pointer transition-colors"
                    >
                      <span className="truncate">{s.label}</span>
                      <span className="text-[10px] text-t-3 shrink-0">×{s.count}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </FormField>
          <FormField label="Date">
            <input className="fi" type="date" value={txnForm.date} onChange={e => setTxnForm({ ...txnForm, date: e.target.value })} />
          </FormField>
          <FormField label="Devise">
            <div className="flex bg-bg-4 rounded-md p-0.5">
              {(['AED', 'EUR'] as const).map(c => (
                <button key={c} onClick={() => setTxnForm({ ...txnForm, currency: c })} className={`flex-1 py-1.5 text-xs font-semibold rounded cursor-pointer transition-all ${txnForm.currency === c ? 'bg-bg-2 text-t-1 shadow-sm' : 'text-t-3 hover:text-t-2'}`}>{c}</button>
              ))}
            </div>
          </FormField>
          <FormField label={`Montant (${txnForm.currency})`}>
            <input className="fi" type="number" value={txnForm.amount || ''} onChange={e => setTxnForm({ ...txnForm, amount: parseFloat(e.target.value) || 0 })} step="0.01" />
          </FormField>
          <div className="bg-bg-4 rounded-lg px-4 py-3 space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-[12px] text-t-3">Taux live</span>
              <span className="text-[13px] text-t-1 font-mono">{state.rate.toFixed(4)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[12px] text-t-3">Équivalent {txnForm.currency === 'AED' ? 'EUR' : 'AED'}</span>
              <span className="text-[13px] font-mono" style={{ color: '#10b981' }}>
                {txnForm.amount > 0
                  ? txnForm.currency === 'AED' ? f$(txnForm.amount / state.rate) : f0(txnForm.amount * state.rate)
                  : '—'}
              </span>
            </div>
          </div>
          <div className="flex gap-2.5 mt-5">
            <button onClick={confirmTxn} className="px-6 py-2 bg-accent text-black font-semibold text-sm rounded-full cursor-pointer hover:opacity-90">{txnTarget?.editIdx !== undefined ? 'Modifier' : 'Ajouter'}</button>
            <button onClick={() => setTxnOpen(false)} className="px-5 py-2 bg-bg-4 text-t-2 text-sm font-medium rounded-full cursor-pointer hover:bg-bg-3">Annuler</button>
          </div>
        </div>
      </Modal>

      {/* Period Filter Modal */}
      {/* Modal régularisation prévisionnel */}
      <Modal open={reconcileOpen} onClose={() => setReconcileOpen(false)} title="Régulariser le prévisionnel">
        <div className="space-y-3.5">
          {m && (
            <div className="bg-bg-4 rounded-md p-3 text-[12px] text-t-3 space-y-1">
              <div className="flex justify-between"><span>Solde début</span><span className="font-mono text-t-2">{f0(m.soldeStart || 0)} AED</span></div>
              <div className="flex justify-between"><span>+ Revenus confirmés</span><span className="font-mono text-accent">+{f0(earnAed)} AED</span></div>
              <div className="flex justify-between"><span>− Dépenses (hors voyage)</span><span className="font-mono text-danger">−{f0(aABank)} AED</span></div>
              {adjustment !== 0 && (
                <div className="flex justify-between border-t border-border pt-1 mt-1"><span>Ajustement actuel</span><span className={`font-mono ${adjustment > 0 ? 'text-accent' : 'text-warning'}`}>{adjustment > 0 ? '+' : ''}{f0(adjustment)} AED</span></div>
              )}
              <div className="flex justify-between border-t border-border pt-1 mt-1 font-bold"><span className="text-t-2">Prévisionnel actuel</span><span className={`font-mono mono-value ${prevCompte >= 0 ? 'text-accent' : 'text-danger'}`}>{f0(prevCompte)} AED</span></div>
            </div>
          )}
          <FormField label="Balance réelle de ton compte (AED)">
            <input
              className="fi mono-value"
              type="number"
              step="0.01"
              value={reconcileInput}
              onChange={e => setReconcileInput(e.target.value)}
              autoFocus
              placeholder="Ex: 11500"
            />
          </FormField>
          {reconcileInput && !isNaN(parseFloat(reconcileInput)) && m && (() => {
            const real = parseFloat(reconcileInput);
            const diff = real - prevCompte;
            return (
              <div className="text-[11px] bg-bg-2 rounded-md p-2.5 flex justify-between items-center">
                <span className="text-t-3">Δ ajustement à appliquer</span>
                <span className={`font-mono mono-value font-bold ${Math.abs(diff) < 0.5 ? 'text-t-3' : diff > 0 ? 'text-accent' : 'text-warning'}`}>{diff >= 0 ? '+' : ''}{f0(diff)} AED</span>
              </div>
            );
          })()}
          <div className="flex gap-2.5 mt-5">
            <button
              onClick={() => {
                const real = parseFloat(reconcileInput);
                if (isFinite(real)) {
                  applyReconciliation(real);
                  setReconcileOpen(false);
                }
              }}
              disabled={!reconcileInput || isNaN(parseFloat(reconcileInput))}
              className="px-4 py-2 bg-accent text-black font-semibold text-sm rounded-sm cursor-pointer hover:opacity-90 disabled:opacity-40"
            >Appliquer</button>
            {adjustment !== 0 && (
              <button
                onClick={() => { clearAdjustment(); setReconcileOpen(false); }}
                className="px-4 py-2 border border-warning/30 text-warning text-sm rounded-sm cursor-pointer hover:bg-warning/10"
              >Effacer l&apos;ajustement</button>
            )}
            <button onClick={() => setReconcileOpen(false)} className="px-4 py-2 border border-border text-t-2 text-sm rounded-sm cursor-pointer hover:bg-bg-3 ml-auto">Annuler</button>
          </div>
        </div>
      </Modal>

      <Modal open={periodOpen} onClose={() => setPeriodOpen(false)} title="Filtrer par période">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-t-3 uppercase tracking-wider font-medium mb-1.5">Du (index mois)</label>
              <select className="fi" value={periodFrom} onChange={e => setPeriodFrom(parseInt(e.target.value))}>
                {filtered.map((mo, i) => <option key={i} value={i}>{mo.id}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-t-3 uppercase tracking-wider font-medium mb-1.5">Au (index mois)</label>
              <select className="fi" value={periodTo} onChange={e => setPeriodTo(parseInt(e.target.value))}>
                {filtered.map((mo, i) => <option key={i} value={i}>{mo.id}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[10px] text-t-3 uppercase tracking-wider font-medium mb-2">Presets</label>
            <div className="flex gap-2 flex-wrap">
              {['Q1', 'Q2', 'S1', 'S2', 'YTD'].map(p => (
                <button key={p} onClick={() => applyPreset(p)} className="px-3 py-1.5 text-xs font-semibold bg-bg-4 border border-border rounded-md hover:bg-surface-hover hover:border-border-2 cursor-pointer transition-all">{p}</button>
              ))}
            </div>
          </div>
          <div className="flex gap-2.5 mt-5">
            <button onClick={() => { setPeriodMode(true); setPeriodOpen(false); }} className="px-4 py-2 bg-accent text-black font-semibold text-sm rounded-sm cursor-pointer hover:opacity-90">Appliquer</button>
            <button onClick={() => setPeriodOpen(false)} className="px-4 py-2 border border-border text-t-2 text-sm rounded-sm cursor-pointer hover:bg-bg-3">Annuler</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// Sub-components
function SoldeCard({ icon, label, value, onChange }: { icon: string; label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex-1 min-w-[160px] bg-bg-3 border border-border rounded-lg px-3 py-2.5 flex items-center gap-2.5 transition-all hover:border-border-2 shadow-inset-border">
      <span className="text-[17px] leading-none">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[9px] text-t-3 uppercase tracking-[0.14em] font-semibold">{label}</div>
        <input
          type="number"
          className="bg-transparent border border-transparent text-[15px] w-full max-w-[140px] outline-none hover:border-border-2 hover:bg-bg-2 focus:border-accent focus:bg-bg-2 rounded-md px-1 py-0.5 mt-0.5 transition-all mono-value"
          value={value}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          step="0.01"
        />
      </div>
    </div>
  );
}

function SoldeDisplay({
  icon, label, value, color = 'text-t-1', sub, tone, action,
}: {
  icon: string; label: string; value: string; color?: string;
  sub?: string | React.ReactNode; tone?: 'info' | 'accent' | 'warning';
  action?: React.ReactNode;
}) {
  const toneClass = tone === 'info'
    ? 'border-info/40 bg-info/5'
    : tone === 'accent'
    ? 'border-accent/40 bg-accent/5'
    : tone === 'warning'
    ? 'border-warning/40 bg-warning/5'
    : 'border-border';
  return (
    <div className={`flex-1 min-w-[160px] bg-bg-3 border ${toneClass} rounded-lg px-3 py-2.5 flex items-center gap-2.5 transition-all hover:border-border-2 shadow-inset-border relative overflow-hidden group`}>
      <span className="text-[17px] leading-none flex-shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[9px] text-t-3 uppercase tracking-[0.14em] font-semibold">{label}</div>
        <div className={`text-[15px] mt-0.5 mono-value ${color}`}>{value}</div>
        {sub && <div className="text-[10px] text-t-3 mt-0.5 mono-value font-medium">{sub}</div>}
      </div>
      {action && (
        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {action}
        </div>
      )}
    </div>
  );
}

function CellInput({ value, onChange, muted, title }: { value: number; onChange: (v: number) => void; muted?: boolean; title?: string }) {
  return (
    <input
      type="number"
      title={title}
      className={`bg-transparent border border-transparent font-mono text-xs w-full text-right outline-none px-2 py-1 rounded-md hover:border-border-2 hover:bg-bg-2 focus:border-accent focus:bg-bg-2 focus:shadow-[0_0_0_2px_rgba(16,185,129,0.1)] transition-all ${muted ? 'text-t-4' : ''}`}
      value={value || ''}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      step="0.01"
      placeholder="0"
    />
  );
}

function TableSection({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-bg-3 border border-border rounded-md overflow-hidden mb-5">
      <div className="flex justify-between items-center px-4 py-3 border-b border-border">
        <span className="text-[13px] font-semibold">{title}</span>
        {subtitle && <span className="text-[11px] text-t-3">{subtitle}</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[600px]">{children}</table>
      </div>
    </div>
  );
}

function ChartBox({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-bg-3 border border-border rounded-md p-4 ${className}`}>
      <div className="text-[13px] font-semibold text-t-2 mb-4">{title}</div>
      {children}
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] text-t-3 uppercase tracking-wider font-medium mb-1.5">{label}</label>
      {children}
    </div>
  );
}
