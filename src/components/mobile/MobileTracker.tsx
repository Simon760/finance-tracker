'use client';

import { useState, useMemo, useEffect } from 'react';
import { useApp } from '@/context/AppProvider';
import { f$, f0, toEur, sumEur, sumAed, sumAedBank, sumEurBudget, sumAedBudget } from '@/lib/utils';
import { LEGACY_EARN_MONTHS } from '@/lib/constants';
import { Month, Transaction, ActualRow, Poste } from '@/lib/types';
import BottomSheet from './BottomSheet';
// import MonthStatsCard from '@/components/MonthStatsCard'; // retiré temporairement
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Receipt, EyeOff } from 'lucide-react';

const todayStr = () => new Date().toISOString().split('T')[0];

export default function MobileTracker() {
  const { state, save, curMonth, setCurMonth, setState, liveRate } = useApp();
  const months = state.months;
  const idx = months.findIndex(mo => mo.id === curMonth);
  const m: Month | undefined = idx >= 0 ? months[idx] : undefined;

  // Add / edit transaction state
  const [txSheetOpen, setTxSheetOpen] = useState(false);
  const [txTarget, setTxTarget] = useState<{ posteIdx: number; editIdx?: number } | null>(null);
  const [tx, setTx] = useState({ label: '', amount: 0, currency: 'AED' as 'AED' | 'EUR', date: todayStr() });
  const [showLabelSugg, setShowLabelSugg] = useState(false);
  // Move-to / Create-poste
  const [createPosteMode, setCreatePosteMode] = useState(false);
  const [newPosteForm, setNewPosteForm] = useState<{ name: string; cat: 'vital' | 'lifestyle' | 'finance' | 'logement'; isAed: boolean; scope: 'permanent' | 'month' }>({ name: '', cat: 'vital', isAed: true, scope: 'month' });

  // Poste detail sheet
  const [detailIdx, setDetailIdx] = useState<number | null>(null);

  // Add new month sheet
  const [newMonthOpen, setNewMonthOpen] = useState(false);
  const [nmName, setNmName] = useState('');
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [reconcileInput, setReconcileInput] = useState('');
  const [nmSolde, setNmSolde] = useState(0);

  // Reset detail if month changes
  useEffect(() => { setDetailIdx(null); }, [curMonth]);

  const goPrev = () => { if (idx > 0) setCurMonth(months[idx - 1].id); };
  const goNext = () => { if (idx >= 0 && idx < months.length - 1) setCurMonth(months[idx + 1].id); };

  // Revenue helpers (sync with revenus table)
  const isSynced = m ? !LEGACY_EARN_MONTHS.includes(m.id) : false;
  const revEntries = m ? (state.revenus?.months?.[m.id] || []) : [];
  const earnEur = m
    ? (isSynced ? revEntries.filter(e => !e.status || e.status === 'confirmed').reduce((s, e) => s + (e.cashed || 0), 0) : (m.earn || 0))
    : 0;
  const previewEur = m && isSynced
    ? revEntries.filter(e => e.status === 'preview').reduce((s, e) => s + (e.cashed || 0), 0)
    : 0;

  // Aggregates
  const bA = m ? sumAedBudget(m, state.postes, liveRate) : 0;
  const bE = m ? sumEurBudget(m, state.postes, liveRate) : 0;
  const aA = m ? sumAed(m, state.postes, m.extraActual || []) : 0;
  const aE = m ? sumEur(m, state.postes, m.extraActual || []) : 0;
  const aABank = m ? sumAedBank(m, state.postes, m.extraActual || []) : 0;
  const diff = earnEur - aE;
  const earnAed = m ? earnEur * m.rate : 0;
  const adjustment = m?.adjustment || 0;
  const prevCompte = m ? (m.soldeStart || 0) + earnAed - aABank + adjustment : 0;

  // Suggestions de libellés pour le poste courant — mois courant uniquement
  const labelSuggestions = useMemo<{ label: string; count: number }[]>(() => {
    if (!txTarget || txTarget.posteIdx < 0 || !m) return [];
    const map = new Map<string, { label: string; count: number; lastDate: string }>();
    (m.actual?.[txTarget.posteIdx]?.txns || []).forEach(t => {
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
    return Array.from(map.values()).sort((a, b) => b.count - a.count || b.lastDate.localeCompare(a.lastDate));
  }, [txTarget, m]);

  const filteredSugg = useMemo(() => {
    const q = tx.label.trim().toLowerCase();
    const arr = q ? labelSuggestions.filter(s => s.label.toLowerCase().includes(q) && s.label.toLowerCase() !== q) : labelSuggestions;
    return arr.slice(0, 6);
  }, [labelSuggestions, tx.label]);

  const resetPosteCreate = () => {
    setCreatePosteMode(false);
    setNewPosteForm({ name: '', cat: 'vital', isAed: true, scope: 'month' });
  };

  const openAddTx = (posteIdx: number) => {
    setTxTarget({ posteIdx });
    setTx({ label: '', amount: 0, currency: 'AED', date: todayStr() });
    setShowLabelSugg(false);
    resetPosteCreate();
    setTxSheetOpen(true);
  };

  const openEditTx = (posteIdx: number, editIdx: number) => {
    if (!m) return;
    const t = m.actual[posteIdx]?.txns?.[editIdx];
    if (!t) return;
    setTxTarget({ posteIdx, editIdx });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setTx({ label: t.label || '', amount: (t as any).originalAmount || t.amount || 0, currency: t.currency || 'AED', date: t.date || todayStr() });
    setShowLabelSugg(false);
    resetPosteCreate();
    setTxSheetOpen(true);
  };

  const saveTx = () => {
    if (!m || !txTarget || tx.amount <= 0) return;
    const rate = state.rate;
    const amountAed = tx.currency === 'EUR' ? tx.amount * rate : tx.amount;
    const eurVal = tx.currency === 'EUR' ? tx.amount : tx.amount / rate;
    const entry: Transaction = {
      label: tx.label || '---',
      amount: Math.round(amountAed * 100) / 100,
      rate,
      eur: Math.round(eurVal * 100) / 100,
      date: tx.date || todayStr(),
      currency: tx.currency,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (entry as any).originalAmount = Math.round(tx.amount * 100) / 100;

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

    const recalcExtra = (r: { aed?: number; eur?: number; txns?: Transaction[] }) => {
      const txns = r.txns || [];
      r.aed = Math.round(txns.reduce((s, t) => s + t.amount, 0) * 100) / 100;
      r.eur = Math.round(txns.reduce((s, t) => s + (t.eur || t.amount / (t.rate || rate)), 0) * 100) / 100;
    };

    // CAS SPÉCIAL: création d'un poste "ce mois uniquement" → on crée un EXTRA
    if (createPosteMode && newPosteForm.scope === 'month') {
      const trimmed = newPosteForm.name.trim().toUpperCase();
      if (!trimmed) return;
      const updatedMonths = state.months.map(mo => {
        if (mo.id !== m.id) return mo;
        let actualArr = [...mo.actual];
        let extraActual = [...(mo.extraActual || [])];
        let extraBudget = [...(mo.extraBudget || [])];
        // Si édition: retire de la source
        if (txTarget.editIdx !== undefined) {
          const srcRow = { ...(actualArr[txTarget.posteIdx] || { aed: 0, eur: null, txns: [] }) } as ActualRow;
          srcRow.txns = (srcRow.txns || []).filter((_, i) => i !== txTarget.editIdx);
          recalc(srcRow, !!state.postes[txTarget.posteIdx]?.isAed);
          actualArr[txTarget.posteIdx] = srcRow;
        }
        const newExtra = { name: trimmed, cat: newPosteForm.cat, aed: 0, eur: 0, txns: [entry] };
        recalcExtra(newExtra);
        extraActual = [...extraActual, newExtra];
        extraBudget = [...extraBudget, { name: trimmed, cat: newPosteForm.cat, aed: 0, eur: 0 }];
        return { ...mo, actual: actualArr, extraActual, extraBudget };
      });
      setState({ ...state, months: updatedMonths });
      setTxSheetOpen(false);
      save();
      return;
    }

    // Détermine la cible (poste existant ou nouveau global)
    let postes: Poste[] = state.postes;
    let targetIdx = txTarget.posteIdx;
    if (createPosteMode) {
      const trimmed = newPosteForm.name.trim().toUpperCase();
      if (!trimmed) return;
      const existing = postes.findIndex(p => p.name === trimmed);
      if (existing >= 0) {
        targetIdx = existing;
      } else {
        postes = [...postes, { name: trimmed, cat: newPosteForm.cat, isAed: newPosteForm.isAed }];
        targetIdx = postes.length - 1;
      }
    }
    const sourceIdx = txTarget.posteIdx;
    const isMove = txTarget.editIdx !== undefined && targetIdx !== sourceIdx;

    const updatedMonths = state.months.map(mo => {
      if (mo.id !== m.id) return mo;
      const actual = [...mo.actual];
      if (isMove) {
        const sourceRow = { ...(actual[sourceIdx] || { aed: 0, eur: null, txns: [] }) } as ActualRow;
        sourceRow.txns = (sourceRow.txns || []).filter((_, i) => i !== txTarget.editIdx);
        recalc(sourceRow, !!postes[sourceIdx]?.isAed);
        actual[sourceIdx] = sourceRow;

        const targetRow = { ...(actual[targetIdx] || { aed: 0, eur: null, txns: [] }) } as ActualRow;
        targetRow.txns = [...(targetRow.txns || []), entry];
        recalc(targetRow, !!postes[targetIdx]?.isAed);
        actual[targetIdx] = targetRow;
      } else {
        const row = { ...(actual[targetIdx] || { aed: 0, eur: null, txns: [] }) } as ActualRow;
        const txns = [...(row.txns || [])];
        if (txTarget.editIdx !== undefined && targetIdx === sourceIdx) txns[txTarget.editIdx] = entry;
        else txns.push(entry);
        row.txns = txns;
        recalc(row, !!postes[targetIdx]?.isAed);
        actual[targetIdx] = row;
      }
      return { ...mo, actual };
    });
    setState({ ...state, postes, months: updatedMonths });
    setTxSheetOpen(false);
    save();
  };

  const deleteTx = (posteIdx: number, txIdx: number) => {
    if (!m) return;
    const rate = state.rate;
    const updatedMonths = state.months.map(mo => {
      if (mo.id !== m.id) return mo;
      const actual = [...mo.actual];
      const row = { ...actual[posteIdx] };
      const txns = (row.txns || []).filter((_, i) => i !== txIdx);
      row.txns = txns;
      const p = state.postes[posteIdx];
      if (p?.isAed) {
        row.aed = Math.round(txns.reduce((s, t) => s + t.amount, 0) * 100) / 100;
        row.eur = Math.round(txns.reduce((s, t) => s + (t.eur || t.amount / (t.rate || rate)), 0) * 100) / 100;
      } else {
        row.eur = Math.round(txns.reduce((s, t) => s + (t.eur || t.amount / (t.rate || rate)), 0) * 100) / 100;
      }
      actual[posteIdx] = row;
      return { ...mo, actual };
    });
    setState({ ...state, months: updatedMonths });
    save();
  };

  const createMonth = () => {
    const name = nmName.trim().toUpperCase();
    if (!name || state.months.find(mo => mo.id === name)) return;
    const newM: Month = {
      id: name, rate: liveRate, earn: 0, soldeStart: nmSolde, soldeEnd: 0,
      budget: [], actual: [], extraBudget: [], extraActual: [],
    };
    // Copie M-1 par défaut sur mobile (rapide)
    if (state.months.length > 0) {
      const last = state.months[state.months.length - 1];
      state.postes.forEach((_, i) => {
        newM.budget.push({ aed: last.budget[i]?.aed || 0, eur: last.budget[i]?.eur ?? null });
        newM.actual.push({ aed: 0, eur: null });
      });
      if (last.soldeEnd > 0) newM.soldeStart = last.soldeEnd;
    } else {
      state.postes.forEach(() => {
        newM.budget.push({ aed: 0, eur: null });
        newM.actual.push({ aed: 0, eur: null });
      });
    }
    setState({ ...state, months: [...state.months, newM] });
    setCurMonth(name);
    setNewMonthOpen(false);
    setNmName(''); setNmSolde(0);
    save();
  };

  if (!m) {
    return (
      <div className="mt-10 text-center">
        <Receipt className="mx-auto text-t-4 mb-3" size={42} />
        <div className="text-t-2 font-semibold mb-1">Aucun mois</div>
        <div className="text-[12px] text-t-3 mb-5">Crée un mois pour commencer le tracking.</div>
        <button onClick={() => setNewMonthOpen(true)} className="px-5 py-2.5 bg-accent text-black font-semibold text-[13px] rounded-full">+ Nouveau mois</button>
        <NewMonthSheet open={newMonthOpen} onClose={() => setNewMonthOpen(false)} name={nmName} setName={setNmName} solde={nmSolde} setSolde={setNmSolde} onCreate={createMonth} />
      </div>
    );
  }

  const hidden = m.hiddenPostes || [];
  const posteRows = state.postes
    .map((p, i) => {
      if (hidden.includes(p.name)) return null;
      const bRow = m.budget[i] || { aed: 0, eur: null };
      const aRow = m.actual[i] || { aed: 0, eur: null };
      const budgetEur = bRow.eur ?? (p.isAed ? toEur(bRow.aed || 0, liveRate) : 0);
      const actualEur = aRow.eur ?? (p.isAed ? toEur(aRow.aed || 0, m.rate) : 0);
      const pct = budgetEur > 0 ? actualEur / budgetEur : 0;
      const txnsCount = (aRow.txns || []).length;
      return { i, p, budgetEur, actualEur, pct, txnsCount };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const hidePosteMobile = (posteName: string) => {
    const months = state.months.map(mo => {
      if (mo.id !== m.id) return mo;
      const cur = mo.hiddenPostes || [];
      if (cur.includes(posteName)) return mo;
      return { ...mo, hiddenPostes: [...cur, posteName] };
    });
    setState({ ...state, months });
    save();
  };

  const applyReconciliationMobile = (realBalance: number) => {
    if (!m) return;
    if (!isFinite(realBalance)) return;
    const prevWithoutAdj = (m.soldeStart || 0) + earnAed - aABank;
    const newAdjustment = Math.round((realBalance - prevWithoutAdj) * 100) / 100;
    const months = state.months.map(mo =>
      mo.id === m.id ? { ...mo, adjustment: newAdjustment === 0 ? undefined : newAdjustment } : mo
    );
    setState({ ...state, months });
    save();
  };

  const clearAdjustmentMobile = () => {
    if (!m || !m.adjustment) return;
    const months = state.months.map(mo => mo.id === m.id ? { ...mo, adjustment: undefined } : mo);
    setState({ ...state, months });
    save();
  };

  const restoreOneHiddenMobile = (posteName: string) => {
    const months = state.months.map(mo => {
      if (mo.id !== m.id) return mo;
      const cur = mo.hiddenPostes || [];
      return { ...mo, hiddenPostes: cur.filter(n => n !== posteName) };
    });
    setState({ ...state, months });
    save();
  };

  const restoreAllHiddenMobile = () => {
    const months = state.months.map(mo => mo.id === m.id ? { ...mo, hiddenPostes: [] } : mo);
    setState({ ...state, months });
    save();
  };

  return (
    <div className="pb-20">
      {/* Month navigator */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={goPrev} disabled={idx <= 0} className="w-10 h-10 flex items-center justify-center rounded-full bg-bg-3 border border-border text-t-2 disabled:opacity-30 active:bg-bg-4">
          <ChevronLeft size={18} />
        </button>
        <div className="flex-1 text-center bg-bg-3 border border-border-2 rounded-xl py-2.5">
          <div className="text-[10px] uppercase tracking-wider text-t-4 font-semibold leading-none">Mois</div>
          <div className="text-[16px] font-bold tracking-tight mt-0.5">{m.id}</div>
        </div>
        <button onClick={goNext} disabled={idx >= months.length - 1} className="w-10 h-10 flex items-center justify-center rounded-full bg-bg-3 border border-border text-t-2 disabled:opacity-30 active:bg-bg-4">
          <ChevronRight size={18} />
        </button>
      </div>

      {/* KPI cards horizontal scroll */}
      <div className="grid grid-cols-3 gap-2 mb-5">
        <KpiCardMobile label="Revenus" value={`${f$(earnEur)} €`} sub={previewEur > 0 ? `+${f$(previewEur)} prév.` : undefined} color="text-accent" />
        <KpiCardMobile label="Dépenses" value={`${f$(aE)} €`} sub={`${f0(aA)} AED`} color="text-warning" />
        <KpiCardMobile label="Reste" value={`${diff >= 0 ? '+' : ''}${f$(diff)} €`} color={diff >= 0 ? 'text-accent' : 'text-danger'} />
      </div>

      {/* Solde card */}
      <button
        onClick={() => { setReconcileInput(prevCompte.toFixed(0)); setReconcileOpen(true); }}
        className="w-full bg-bg-3 border border-border rounded-xl p-4 mb-5 active:bg-bg-4 text-left"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] uppercase tracking-wider text-t-3 font-semibold">Prévisionnel (AED)</span>
          <span className={`text-[15px] font-bold mono-value ${prevCompte >= 0 ? 'text-accent' : 'text-danger'}`}>{f0(prevCompte)} AED</span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-[11px]">
          <div>
            <div className="text-t-4 mb-0.5">Solde début</div>
            <div className="text-t-2 font-mono mono-value">{f0(m.soldeStart || 0)}</div>
          </div>
          <div className="text-right">
            <div className="text-t-4 mb-0.5">Budget total</div>
            <div className="text-t-2 font-mono mono-value">{f$(bE)} €</div>
          </div>
        </div>
        {adjustment !== 0 && (
          <div className={`text-[10px] mt-2 font-mono mono-value ${adjustment > 0 ? 'text-accent' : 'text-warning'}`}>
            Ajusté {adjustment > 0 ? '+' : ''}{f0(adjustment)} AED
          </div>
        )}
        <div className="text-[10px] text-t-4 mt-1.5">Tap pour régulariser avec la balance réelle</div>
      </button>

      {/* Banner masqués */}
      {hidden.length > 0 && (
        <div className="mb-3 px-3 py-2.5 bg-bg-3 border border-warning/30 rounded-lg text-[11px]">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-t-3 flex items-center gap-1.5">
              <EyeOff size={11} className="text-warning" />
              Masqué{hidden.length > 1 ? 's' : ''} ce mois :
            </span>
            {hidden.length > 1 && (
              <button onClick={restoreAllHiddenMobile} className="text-[11px] text-accent font-semibold whitespace-nowrap active:opacity-60">Tout restaurer</button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {hidden.map(name => (
              <button
                key={name}
                onClick={() => restoreOneHiddenMobile(name)}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-warning/10 text-warning border border-warning/30 rounded-full text-[10px] font-semibold active:bg-accent/15"
              >
                {name}
                <span className="text-[12px] leading-none opacity-60">×</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Postes list */}
      <div className="flex items-center justify-between mb-2.5 px-1">
        <span className="text-[11px] uppercase tracking-wider text-t-3 font-semibold">Postes ({posteRows.length}{hidden.length > 0 && ` / ${state.postes.length}`})</span>
        <span className="text-[10px] text-t-4 font-mono">Budget · Réel</span>
      </div>
      <div className="space-y-2">
        {posteRows.map(({ i, p, budgetEur, actualEur, pct, txnsCount }) => (
          <button
            key={i}
            onClick={() => setDetailIdx(i)}
            className="w-full bg-bg-3 border border-border rounded-xl p-3.5 text-left active:bg-bg-4 transition-colors"
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold tracking-tight text-t-1 truncate">{p.name}</div>
                <div className="text-[10px] text-t-3 uppercase tracking-wider mt-0.5">{p.cat}{txnsCount > 0 && ` · ${txnsCount} tx`}</div>
              </div>
              <div className="text-right shrink-0">
                <div className={`text-[14px] font-bold mono-value ${pct > 1 ? 'text-danger' : pct > 0.85 ? 'text-warning' : 'text-t-1'}`}>{f$(actualEur)} €</div>
                <div className="text-[10px] text-t-4 mono-value">/ {f$(budgetEur)} €</div>
              </div>
            </div>
            {budgetEur > 0 && (
              <div className="h-1.5 bg-bg-2 rounded-full overflow-hidden">
                <div
                  className={`h-full ${pct > 1 ? 'bg-danger' : pct > 0.85 ? 'bg-warning' : 'bg-accent'}`}
                  style={{ width: `${Math.min(100, pct * 100)}%` }}
                />
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Stats du mois — à retravailler */}
      {/* <div className="mt-5"><MonthStatsCard month={m} postes={state.postes} compact /></div> */}

      {/* New month button */}
      <button
        onClick={() => setNewMonthOpen(true)}
        className="w-full mt-5 py-3 border border-dashed border-border-2 rounded-xl text-[13px] text-t-3 active:bg-bg-3"
      >
        + Nouveau mois
      </button>

      {/* FAB */}
      <button
        onClick={() => { setDetailIdx(null); openAddTx(0); }}
        className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+76px)] w-14 h-14 rounded-full bg-accent text-black shadow-lg flex items-center justify-center active:scale-95 transition-transform z-30"
        aria-label="Nouvelle dépense"
      >
        <Plus size={26} strokeWidth={2.4} />
      </button>

      {/* Poste detail sheet */}
      <BottomSheet
        open={detailIdx !== null}
        onClose={() => setDetailIdx(null)}
        title={detailIdx !== null ? state.postes[detailIdx]?.name : ''}
        fullHeight
      >
        {detailIdx !== null && (() => {
          const row = m.actual[detailIdx];
          const bRow = m.budget[detailIdx];
          const txns = row?.txns || [];
          const budgetEur = bRow?.eur ?? (state.postes[detailIdx].isAed ? toEur(bRow?.aed || 0, liveRate) : 0);
          const actualEur = row?.eur ?? (state.postes[detailIdx].isAed ? toEur(row?.aed || 0, m.rate) : 0);
          return (
            <div className="pt-1">
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="bg-bg-3 border border-border rounded-lg p-3">
                  <div className="text-[10px] uppercase tracking-wider text-t-3 font-semibold mb-1">Budget</div>
                  <div className="text-[15px] font-bold mono-value">{f$(budgetEur)} €</div>
                </div>
                <div className="bg-bg-3 border border-border rounded-lg p-3">
                  <div className="text-[10px] uppercase tracking-wider text-t-3 font-semibold mb-1">Réel</div>
                  <div className={`text-[15px] font-bold mono-value ${actualEur > budgetEur && budgetEur > 0 ? 'text-danger' : 'text-t-1'}`}>{f$(actualEur)} €</div>
                </div>
              </div>

              <button
                onClick={() => { hidePosteMobile(state.postes[detailIdx].name); setDetailIdx(null); }}
                className="w-full mb-3 py-2.5 text-[12px] font-semibold text-warning bg-warning/10 border border-warning/25 rounded-lg active:bg-warning/20 flex items-center justify-center gap-2"
              >
                <EyeOff size={13} /> Masquer ce poste dans {m.id}
              </button>

              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-[11px] uppercase tracking-wider text-t-3 font-semibold">Transactions ({txns.length})</span>
                <button onClick={() => openAddTx(detailIdx)} className="px-3 py-1.5 bg-accent/15 text-accent border border-accent/30 rounded-full text-[11px] font-semibold active:bg-accent/25">+ Ajouter</button>
              </div>

              {txns.length === 0 ? (
                <div className="text-center py-8 text-t-4 text-[12px]">Aucune transaction</div>
              ) : (
                <div className="space-y-1.5">
                  {txns.map((t, ti) => (
                    <div key={ti} className="bg-bg-3 border border-border rounded-lg p-3 flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold truncate">{t.label || '—'}</div>
                        <div className="text-[10px] text-t-3 mt-0.5">{t.date || '—'}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[13px] font-bold mono-value">{f0(t.amount)} {t.currency || 'AED'}</div>
                        <div className="text-[10px] text-t-4 mono-value">{f$(t.eur || 0)} €</div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => openEditTx(detailIdx, ti)} className="w-8 h-8 flex items-center justify-center rounded-full bg-info/10 text-info border border-info/25 active:bg-info/20">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => { if (confirm('Supprimer cette transaction ?')) deleteTx(detailIdx, ti); }} className="w-8 h-8 flex items-center justify-center rounded-full bg-danger/10 text-danger border border-danger/25 active:bg-danger/20">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </BottomSheet>

      {/* Add / Edit Tx sheet */}
      <BottomSheet
        open={txSheetOpen}
        onClose={() => setTxSheetOpen(false)}
        title={txTarget?.editIdx !== undefined ? 'Modifier la transaction' : 'Nouvelle dépense'}
      >
        <div className="space-y-4 pt-1">
          <div>
            <label className="block text-[10px] text-t-3 uppercase tracking-wider font-semibold mb-1.5">Poste</label>
            {!createPosteMode ? (
              <div className="flex gap-2">
                <select
                  className="fi !h-11 flex-1"
                  value={txTarget?.posteIdx ?? 0}
                  onChange={e => setTxTarget(prev => prev ? { ...prev, posteIdx: parseInt(e.target.value) } : null)}
                >
                  {state.postes.map((p, i) => <option key={i} value={i}>{p.name}</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => setCreatePosteMode(true)}
                  className="px-3 h-11 text-[11px] font-semibold bg-accent/10 text-accent border border-accent/25 rounded-md active:bg-accent/20 whitespace-nowrap"
                >
                  + Nouveau
                </button>
              </div>
            ) : (
              <div className="space-y-2 border border-accent/30 rounded-md p-3 bg-accent/5">
                <input
                  className="fi !h-11"
                  value={newPosteForm.name}
                  onChange={e => setNewPosteForm({ ...newPosteForm, name: e.target.value.toUpperCase() })}
                  placeholder="Nom (ex: TRANSPORT)"
                  autoFocus
                />
                <div className="flex gap-2">
                  <select
                    className="fi !h-11 flex-1"
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
                        className={`px-3 text-[11px] font-semibold rounded transition-all ${newPosteForm.isAed === val ? 'bg-bg-2 text-t-1' : 'text-t-3'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-t-3 uppercase tracking-wider font-semibold mb-1.5">Portée</div>
                  <div className="flex bg-bg-4 rounded-md p-0.5">
                    {([['Ce mois', 'month'], ['Permanent', 'permanent']] as const).map(([label, val]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setNewPosteForm({ ...newPosteForm, scope: val })}
                        className={`flex-1 py-1.5 text-[11px] font-semibold rounded transition-all ${newPosteForm.scope === val ? 'bg-bg-2 text-t-1' : 'text-t-3'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="text-[10px] text-t-4 mt-1">
                    {newPosteForm.scope === 'month' ? `${m.id} uniquement` : 'Tous les mois'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={resetPosteCreate}
                  className="text-[11px] text-t-3 active:text-t-1"
                >
                  ← Choisir un poste existant
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-[10px] text-t-3 uppercase tracking-wider font-semibold mb-1.5">Libellé</label>
            <div className="relative">
              <input
                className="fi !h-11"
                value={tx.label}
                onChange={e => { setTx({ ...tx, label: e.target.value }); setShowLabelSugg(true); }}
                onFocus={() => setShowLabelSugg(true)}
                onBlur={() => setTimeout(() => setShowLabelSugg(false), 150)}
                placeholder="Ex: Carrefour, Uber..."
                autoComplete="off"
              />
              {showLabelSugg && filteredSugg.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-bg-3 border border-border-2 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {filteredSugg.map(s => (
                    <button
                      key={s.label}
                      type="button"
                      onMouseDown={e => { e.preventDefault(); setTx({ ...tx, label: s.label }); setShowLabelSugg(false); }}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-[13px] text-t-1 active:bg-bg-4"
                    >
                      <span className="truncate">{s.label}</span>
                      <span className="text-[10px] text-t-3 shrink-0">×{s.count}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-[10px] text-t-3 uppercase tracking-wider font-semibold mb-1.5">Devise</label>
            <div className="flex bg-bg-4 rounded-lg p-1">
              {(['AED', 'EUR'] as const).map(c => (
                <button
                  key={c}
                  onClick={() => setTx({ ...tx, currency: c })}
                  className={`flex-1 py-2 text-[13px] font-semibold rounded-md transition-all ${tx.currency === c ? 'bg-bg-2 text-t-1 shadow-sm' : 'text-t-3'}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-t-3 uppercase tracking-wider font-semibold mb-1.5">Montant ({tx.currency})</label>
              <input
                className="fi !h-11 mono-value"
                type="number"
                inputMode="decimal"
                value={tx.amount || ''}
                onChange={e => setTx({ ...tx, amount: parseFloat(e.target.value) || 0 })}
                step="0.01"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-[10px] text-t-3 uppercase tracking-wider font-semibold mb-1.5">Date</label>
              <input
                className="fi !h-11"
                type="date"
                value={tx.date}
                onChange={e => setTx({ ...tx, date: e.target.value })}
              />
            </div>
          </div>

          <div className="bg-bg-4 rounded-lg px-3.5 py-2.5 flex items-center justify-between">
            <span className="text-[11px] text-t-3">Équivalent {tx.currency === 'AED' ? 'EUR' : 'AED'}</span>
            <span className="text-[13px] font-mono mono-value text-accent">
              {tx.amount > 0
                ? tx.currency === 'AED'
                  ? `${f$(tx.amount / state.rate)} €`
                  : `${f0(tx.amount * state.rate)} AED`
                : '—'}
            </span>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={() => setTxSheetOpen(false)}
              className="flex-1 py-3 bg-bg-4 text-t-2 text-[14px] font-semibold rounded-full active:bg-bg-3"
            >
              Annuler
            </button>
            <button
              onClick={saveTx}
              disabled={tx.amount <= 0}
              className="flex-[1.4] py-3 bg-accent text-black text-[14px] font-bold rounded-full active:opacity-80 disabled:opacity-30"
            >
              {txTarget?.editIdx !== undefined ? 'Enregistrer' : 'Ajouter'}
            </button>
          </div>
        </div>
      </BottomSheet>

      {/* New month sheet */}
      <NewMonthSheet open={newMonthOpen} onClose={() => setNewMonthOpen(false)} name={nmName} setName={setNmName} solde={nmSolde} setSolde={setNmSolde} onCreate={createMonth} />

      {/* Régul sheet */}
      <BottomSheet open={reconcileOpen} onClose={() => setReconcileOpen(false)} title="Régulariser le prévisionnel">
        <div className="space-y-3.5 pt-1">
          <div className="bg-bg-4 rounded-lg p-3 text-[12px] text-t-3 space-y-1">
            <div className="flex justify-between"><span>Solde début</span><span className="font-mono text-t-2">{f0(m.soldeStart || 0)} AED</span></div>
            <div className="flex justify-between"><span>+ Revenus</span><span className="font-mono text-accent">+{f0(earnAed)} AED</span></div>
            <div className="flex justify-between"><span>− Dépenses</span><span className="font-mono text-danger">−{f0(aABank)} AED</span></div>
            {adjustment !== 0 && (
              <div className="flex justify-between border-t border-border pt-1 mt-1"><span>Ajustement actuel</span><span className={`font-mono ${adjustment > 0 ? 'text-accent' : 'text-warning'}`}>{adjustment > 0 ? '+' : ''}{f0(adjustment)} AED</span></div>
            )}
            <div className="flex justify-between border-t border-border pt-1 mt-1 font-bold"><span className="text-t-2">Prévisionnel actuel</span><span className={`font-mono mono-value ${prevCompte >= 0 ? 'text-accent' : 'text-danger'}`}>{f0(prevCompte)} AED</span></div>
          </div>
          <div>
            <label className="block text-[10px] text-t-3 uppercase tracking-wider font-semibold mb-1.5">Balance réelle (AED)</label>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              className="fi !h-11 mono-value"
              value={reconcileInput}
              onChange={e => setReconcileInput(e.target.value)}
              autoFocus
              placeholder="Ex: 11500"
            />
          </div>
          {reconcileInput && !isNaN(parseFloat(reconcileInput)) && (() => {
            const real = parseFloat(reconcileInput);
            const diff = real - prevCompte;
            return (
              <div className="text-[11px] bg-bg-4 rounded-lg p-2.5 flex justify-between items-center">
                <span className="text-t-3">Δ ajustement</span>
                <span className={`font-mono mono-value font-bold ${Math.abs(diff) < 0.5 ? 'text-t-3' : diff > 0 ? 'text-accent' : 'text-warning'}`}>{diff >= 0 ? '+' : ''}{f0(diff)} AED</span>
              </div>
            );
          })()}
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => { const real = parseFloat(reconcileInput); if (isFinite(real)) { applyReconciliationMobile(real); setReconcileOpen(false); } }}
              disabled={!reconcileInput || isNaN(parseFloat(reconcileInput))}
              className="flex-1 py-3 bg-accent text-black text-[14px] font-bold rounded-full active:opacity-80 disabled:opacity-30"
            >Appliquer</button>
            {adjustment !== 0 && (
              <button
                onClick={() => { clearAdjustmentMobile(); setReconcileOpen(false); }}
                className="px-4 py-3 border border-warning/30 text-warning text-[12px] font-semibold rounded-full active:bg-warning/10"
              >Effacer</button>
            )}
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}

function KpiCardMobile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-bg-3 border border-border rounded-xl px-3 py-2.5">
      <div className="text-[9px] uppercase tracking-wider text-t-3 font-semibold leading-none">{label}</div>
      <div className={`text-[14px] font-bold mt-1 mono-value tracking-tight truncate ${color || 'text-t-1'}`}>{value}</div>
      {sub && <div className="text-[10px] text-t-4 mono-value mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

function NewMonthSheet({ open, onClose, name, setName, solde, setSolde, onCreate }: {
  open: boolean; onClose: () => void; name: string; setName: (v: string) => void;
  solde: number; setSolde: (v: number) => void; onCreate: () => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Nouveau mois">
      <div className="space-y-4 pt-1">
        <div>
          <label className="block text-[10px] text-t-3 uppercase tracking-wider font-semibold mb-1.5">Nom du mois</label>
          <input className="fi !h-11" value={name} onChange={e => setName(e.target.value.toUpperCase())} placeholder="Ex: JUIN" autoFocus />
        </div>
        <div>
          <label className="block text-[10px] text-t-3 uppercase tracking-wider font-semibold mb-1.5">Solde début (AED)</label>
          <input className="fi !h-11 mono-value" type="number" inputMode="decimal" value={solde || ''} onChange={e => setSolde(parseFloat(e.target.value) || 0)} placeholder="0" />
        </div>
        <p className="text-[11px] text-t-3">Le budget sera copié depuis le mois précédent.</p>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-3 bg-bg-4 text-t-2 text-[14px] font-semibold rounded-full active:bg-bg-3">Annuler</button>
          <button onClick={onCreate} disabled={!name.trim()} className="flex-[1.4] py-3 bg-accent text-black text-[14px] font-bold rounded-full active:opacity-80 disabled:opacity-30">Créer</button>
        </div>
      </div>
    </BottomSheet>
  );
}
