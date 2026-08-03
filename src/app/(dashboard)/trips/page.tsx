'use client';

import { useState, useMemo, useEffect } from 'react';
import { useApp } from '@/context/AppProvider';
import PageHeader from '@/components/layout/PageHeader';
import Modal from '@/components/ui/Modal';
import { f$, f0 } from '@/lib/utils';
import { MOIS_LIST } from '@/lib/constants';
import { Trip, Transaction } from '@/lib/types';
import { Plus, Plane, ArrowRight, Calendar, Trash2, ChevronLeft, ChevronRight, Pencil, SlidersHorizontal } from 'lucide-react';

const todayStr = () => new Date().toISOString().split('T')[0];
// Formate un YYYY-MM-DD en libellé lisible FR (ex: "jeudi 2 juillet")
const fmtDay = (ds: string) => new Date(ds + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

export default function TripsPage() {
  const { state, trips, createTrip, deleteTrip, addTripExpense, deleteTripExpense, updateTripExpense, addTripSwap, updateTrip, curMonth } = useApp();

  const [newOpen, setNewOpen] = useState(false);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [rForm, setRForm] = useState({ aedOut: 0, localIn: 0, date: todayStr(), monthId: curMonth || '' });
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustInput, setAdjustInput] = useState('');

  const [nForm, setNForm] = useState({
    name: '', country: 'France', currency: 'EUR',
    startDate: todayStr(), endDate: '',
    aedOut: 0, localIn: 0,
    monthId: curMonth || '',
  });
  // target encode la cible: "p:<idx>" = poste régulier, "x:<nom>" = extra (poste du mois)
  const [eForm, setEForm] = useState({
    target: 'p:0', label: '', eur: 0, date: todayStr(), monthId: curMonth || '',
  });
  const [showLabelSugg, setShowLabelSugg] = useState(false);
  // Édition d'une dépense existante : emplacement d'origine (null = mode ajout)
  const [editing, setEditing] = useState<{ monthId: string; posteIdx: number; txIdx: number; extraName?: string } | null>(null);
  // Calendrier des dépenses : jour sélectionné (filtre la liste) + mois affiché (null = auto)
  const [selDay, setSelDay] = useState<string | null>(null);
  const [calYM, setCalYM] = useState<{ y: number; m: number } | null>(null);
  // Le calendrier suit le mois sélectionné dans l'app (comme le tracker) : on relâche
  // la navigation manuelle dès que le voyage ou le mois courant change.
  useEffect(() => { setSelDay(null); setCalYM(null); }, [selectedTripId, curMonth]);

  const sortedTrips = useMemo(() => {
    return [...trips].sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
  }, [trips]);

  const today = todayStr();
  const activeTrip = trips.find(t => t.startDate <= today && (!t.endDate || t.endDate >= today) && t.status !== 'ended');

  const selectedTrip = selectedTripId ? trips.find(t => t.id === selectedTripId) : null;

  // Pour le trip sélectionné, collecte toutes les expenses (txns tagged tripId+expense)
  // — dans les postes réguliers ET les extras (postes du mois)
  type TripExp = { monthId: string; posteIdx: number; posteName: string; txIdx: number; t: Transaction; extraName?: string };
  const tripExpenses = useMemo(() => {
    if (!selectedTrip) return [] as TripExp[];
    const out: TripExp[] = [];
    state.months.forEach(mo => {
      (mo.actual || []).forEach((row, posteIdx) => {
        const posteName = state.postes[posteIdx]?.name || '—';
        (row.txns || []).forEach((t, txIdx) => {
          if (t.tripId === selectedTrip.id && t.tripKind === 'expense') {
            out.push({ monthId: mo.id, posteIdx, posteName, txIdx, t });
          }
        });
      });
      (mo.extraActual || []).forEach(row => {
        (row.txns || []).forEach((t, txIdx) => {
          if (t.tripId === selectedTrip.id && t.tripKind === 'expense') {
            out.push({ monthId: mo.id, posteIdx: -1, posteName: row.name, txIdx, t, extraName: row.name });
          }
        });
      });
    });
    return out.sort((a, b) => (b.t.date || '').localeCompare(a.t.date || ''));
  }, [selectedTrip, state.months, state.postes]);

  // Tous les swaps du voyage (initial + rechargements) — dans VOYAGES et postes réguliers
  const tripSwaps = useMemo(() => {
    if (!selectedTrip) return [] as Array<{ monthId: string; date: string; aed: number; eur: number }>;
    const out: Array<{ monthId: string; date: string; aed: number; eur: number }> = [];
    state.months.forEach(mo => {
      [...(mo.extraActual || []), ...(mo.actual || [])].forEach(row => {
        (row.txns || []).forEach(t => {
          if (t.tripId === selectedTrip.id && t.tripKind === 'swap') {
            out.push({ monthId: mo.id, date: t.date || '', aed: t.amount || 0, eur: t.eur || 0 });
          }
        });
      });
    });
    return out.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }, [selectedTrip, state.months]);

  const tripStats = useMemo(() => {
    if (!selectedTrip) return null;
    // budget = somme de TOUS les swaps (initial + rechargements)
    const budget = tripSwaps.reduce((s, sw) => s + sw.eur, 0);
    const spent = tripExpenses.reduce((s, e) => s + (e.t.eur || 0), 0);
    const adjustment = selectedTrip.adjustment || 0; // réconciliation manuelle du solde
    const remaining = budget - spent + adjustment;
    // Consommé dérivé du Restant réel (cohérent avec l'ajustement)
    const pct = budget > 0 ? ((budget - remaining) / budget) * 100 : 0;
    return { budget, spent, adjustment, remaining, pct };
  }, [selectedTrip, tripExpenses, tripSwaps]);

  // Ajuste le solde de la pocket : l'utilisateur saisit le solde RÉEL, on en dérive
  // l'ajustement (delta) à stocker. Analogue à la régularisation du tracker.
  const handleAdjust = () => {
    if (!selectedTrip || !tripStats) return;
    const real = parseFloat(adjustInput);
    if (isNaN(real)) return;
    const base = tripStats.budget - tripStats.spent; // solde calculé SANS ajustement
    const newAdj = Math.round((real - base) * 100) / 100;
    updateTrip(selectedTrip.id, { adjustment: newAdj });
    setAdjustOpen(false);
  };
  const clearAdjust = () => {
    if (!selectedTrip) return;
    updateTrip(selectedTrip.id, { adjustment: 0 });
    setAdjustOpen(false);
  };

  // Suggestions de libellés pour la CATÉGORIE cible sélectionnée : quel nom de tx
  // ressort le + souvent (comme sur l'ajout de dépense régulière). Agrège sur tous les
  // mois, exclut les swaps (transferts) et les placeholders.
  const labelSuggestions = useMemo<{ label: string; count: number; lastDate: string }[]>(() => {
    const map = new Map<string, { label: string; count: number; lastDate: string }>();
    const collect = (txns: Transaction[] | undefined) => {
      (txns || []).forEach(t => {
        if (t.tripKind === 'swap') return; // transfert, pas une dépense
        const raw = (t.label || '').trim();
        if (!raw || raw === '---' || raw === '—') return;
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
    if (eForm.target.startsWith('x:')) {
      const name = eForm.target.slice(2);
      state.months.forEach(mo => (mo.extraActual || []).forEach(r => { if (r.name === name) collect(r.txns); }));
    } else {
      const idx = parseInt(eForm.target.slice(2));
      if (idx >= 0) state.months.forEach(mo => collect(mo.actual?.[idx]?.txns));
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count || (b.lastDate || '').localeCompare(a.lastDate || ''));
  }, [eForm.target, state.months]);

  const filteredSuggestions = useMemo(() => {
    const q = (eForm.label || '').trim().toLowerCase();
    const arr = q ? labelSuggestions.filter(s => s.label.toLowerCase().includes(q) && s.label.toLowerCase() !== q) : labelSuggestions;
    return arr.slice(0, 8);
  }, [labelSuggestions, eForm.label]);

  // ── Calendrier des dépenses ──────────────────────────────────────────────
  // Agrège par jour (YYYY-MM-DD) : nb de tx + total dépensé (devise locale)
  const expensesByDay = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    tripExpenses.forEach(e => {
      const d = e.t.date || '';
      if (!d) return;
      const cur = map.get(d) || { count: 0, total: 0 };
      cur.count++;
      cur.total += e.t.eur || 0;
      map.set(d, cur);
    });
    return map;
  }, [tripExpenses]);

  // Mois affiché. Priorité : navigation manuelle (flèches) > mois sélectionné dans
  // l'app (comme le tracker) > mois de la dépense la + récente > début du voyage.
  const effCalYM = useMemo(() => {
    if (calYM) return calYM;
    const norm = (s: string) => s.trim().toUpperCase().normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '');
    const mi = curMonth ? (MOIS_LIST as readonly string[]).findIndex(m => norm(m) === norm(curMonth)) : -1;
    if (mi >= 0) {
      // Année, par ordre de fiabilité :
      // 1. celle d'une tx du voyage dans ce mois,
      // 2. celle calculée par le tracker (_year),
      // 3. l'année qui place ce mois le plus près d'aujourd'hui — évite de retomber
      //    sur la mauvaise année pour un voyage à cheval sur deux ans.
      const mm = String(mi + 1).padStart(2, '0');
      const hit = [...tripExpenses.map(e => e.t.date), ...tripSwaps.map(s => s.date)]
        .find(d => !!d && d.slice(5, 7) === mm);
      let y: number;
      if (hit) {
        y = Number(hit.slice(0, 4));
      } else {
        const trackerYear = state.months.find(m => m.id === curMonth)?._year;
        if (trackerYear) {
          y = trackerYear;
        } else {
          const now = new Date();
          const nowIdx = now.getFullYear() * 12 + now.getMonth();
          y = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]
            .reduce((best, cand) =>
              Math.abs(cand * 12 + mi - nowIdx) < Math.abs(best * 12 + mi - nowIdx) ? cand : best);
        }
      }
      return { y, m: mi };
    }
    const base = tripExpenses[0]?.t.date || selectedTrip?.startDate || todayStr();
    const [y, m] = base.split('-').map(Number);
    return { y, m: (m || 1) - 1 };
  }, [calYM, curMonth, tripExpenses, tripSwaps, selectedTrip, state.months]);

  // Grille du mois (lundi en 1re colonne), null = case de remplissage
  const calCells = useMemo(() => {
    const { y, m } = effCalYM;
    const firstWeekday = (new Date(y, m, 1).getDay() + 6) % 7; // lundi = 0
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const cells: (string | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(`${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [effCalYM]);

  // Résumé du mois affiché : nb de jours actifs + plus gros jour
  const calSummary = useMemo(() => {
    const prefix = `${effCalYM.y}-${String(effCalYM.m + 1).padStart(2, '0')}`;
    let daysActive = 0;
    let best = { day: '', total: 0 };
    expensesByDay.forEach((v, k) => {
      if (!k.startsWith(prefix)) return;
      daysActive++;
      if (v.total > best.total) best = { day: k, total: v.total };
    });
    return { daysActive, best };
  }, [expensesByDay, effCalYM]);

  // Liste affichée sous le calendrier : tout, ou filtrée sur le jour sélectionné
  const shownExpenses = useMemo(
    () => (selDay ? tripExpenses.filter(e => e.t.date === selDay) : tripExpenses),
    [selDay, tripExpenses],
  );

  const shiftMonth = (delta: number) => {
    const nm = effCalYM.m + delta;
    setCalYM({ y: effCalYM.y + Math.floor(nm / 12), m: ((nm % 12) + 12) % 12 });
    setSelDay(null);
  };

  // Mois du tracker correspondant à une date (ex: 2026-08-03 → 'AOÛT'), s'il existe.
  // Sert à recaler le champ « Mois (tracker) » quand la date change.
  const trackerMonthForDate = (d: string): string | null => {
    if (!d) return null;
    const idx = Number(d.slice(5, 7)) - 1;
    if (isNaN(idx) || idx < 0 || idx > 11) return null;
    const norm = (s: string) => s.trim().toUpperCase().normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '');
    const target = norm(MOIS_LIST[idx]);
    return state.months.find(m => norm(m.id) === target)?.id ?? null;
  };

  const handleCreate = () => {
    if (!nForm.name.trim() || nForm.aedOut <= 0 || nForm.localIn <= 0 || !nForm.monthId) return;
    const id = createTrip({
      name: nForm.name.trim(),
      country: nForm.country.trim(),
      currency: nForm.currency,
      startDate: nForm.startDate,
      endDate: nForm.endDate || null,
      aedOut: nForm.aedOut,
      localIn: nForm.localIn,
      monthId: nForm.monthId,
    });
    setSelectedTripId(id);
    setNewOpen(false);
    setNForm({ name: '', country: 'France', currency: 'EUR', startDate: todayStr(), endDate: '', aedOut: 0, localIn: 0, monthId: curMonth || '' });
  };

  const handleAddExpense = () => {
    if (!selectedTrip || eForm.eur <= 0 || !eForm.monthId) return;
    const isExtra = eForm.target.startsWith('x:');
    const common = {
      posteIdx: isExtra ? -1 : parseInt(eForm.target.slice(2)),
      extraName: isExtra ? eForm.target.slice(2) : undefined,
      monthId: eForm.monthId,
      label: eForm.label,
      eur: eForm.eur,
      date: eForm.date,
    };
    if (editing) {
      updateTripExpense({ tripId: selectedTrip.id, orig: editing, ...common });
    } else {
      addTripExpense({ tripId: selectedTrip.id, ...common });
    }
    setExpenseOpen(false);
    setEditing(null);
    setEForm({ target: eForm.target, label: '', eur: 0, date: todayStr(), monthId: eForm.monthId });
  };

  // Ouvre le modal pré-rempli pour modifier une dépense existante
  const startEdit = (e: TripExp) => {
    setEditing({ monthId: e.monthId, posteIdx: e.posteIdx, txIdx: e.txIdx, extraName: e.extraName });
    setEForm({
      target: e.extraName ? `x:${e.extraName}` : `p:${e.posteIdx}`,
      label: e.t.label === '—' ? '' : (e.t.label || ''),
      eur: e.t.eur || 0,
      date: e.t.date || todayStr(),
      monthId: e.monthId,
    });
    setShowLabelSugg(false);
    setExpenseOpen(true);
  };

  const handleRecharge = () => {
    if (!selectedTrip || rForm.aedOut <= 0 || rForm.localIn <= 0 || !rForm.monthId) return;
    addTripSwap({
      tripId: selectedTrip.id,
      monthId: rForm.monthId,
      aedOut: rForm.aedOut,
      localIn: rForm.localIn,
      date: rForm.date,
    });
    setRechargeOpen(false);
    setRForm({ aedOut: 0, localIn: 0, date: todayStr(), monthId: rForm.monthId });
  };

  return (
    <div>
      <PageHeader breadcrumb={[{ label: 'Global' }, { label: 'Voyages', current: true }]} title="Voyages" subtitle="Suivi des swaps et dépenses en devise locale">
        <button onClick={() => setNewOpen(true)} className="px-4 py-2 bg-accent text-black font-semibold text-sm rounded-full hover:opacity-90 flex items-center gap-2 cursor-pointer">
          <Plus size={14} /> Nouveau voyage
        </button>
      </PageHeader>

      {activeTrip && (
        <div className="bg-accent/10 border border-accent/30 rounded-xl p-4 mb-5 flex items-center gap-4">
          <Plane size={20} className="text-accent shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-accent font-bold">Voyage en cours</div>
            <div className="text-[15px] font-bold tracking-tight">{activeTrip.name}</div>
            <div className="text-[11px] text-t-3 mt-0.5">
              {activeTrip.country} · {activeTrip.startDate}{activeTrip.endDate ? ' → ' + activeTrip.endDate : ' (en cours)'}
            </div>
          </div>
          <button onClick={() => setSelectedTripId(activeTrip.id)} className="px-4 py-2 bg-accent text-black font-semibold text-sm rounded-full flex items-center gap-1 cursor-pointer hover:opacity-90 whitespace-nowrap">
            Ouvrir <ArrowRight size={14} />
          </button>
        </div>
      )}

      {sortedTrips.length === 0 ? (
        <div className="bg-bg-3 border border-border rounded-lg p-10 text-center">
          <Plane className="mx-auto text-t-4 mb-3" size={32} />
          <div className="text-t-2 font-semibold mb-1">Aucun voyage</div>
          <div className="text-[12px] text-t-3 mb-4">Crée un voyage pour tracker ton swap AED→devise locale et tes dépenses en France/ailleurs sans double-comptage.</div>
          <button onClick={() => setNewOpen(true)} className="px-5 py-2 bg-accent text-black font-semibold text-[13px] rounded-full">+ Nouveau voyage</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 mb-5 max-md:grid-cols-1">
          {sortedTrips.map(trip => {
            const allTxns = state.months.flatMap(mo =>
              [...(mo.actual || []), ...(mo.extraActual || [])].flatMap(row =>
                (row.txns || []).filter(t => t.tripId === trip.id)
              )
            );
            const budget = allTxns.filter(t => t.tripKind === 'swap').reduce((s, t) => s + (t.eur || 0), 0);
            const spent = allTxns.filter(t => t.tripKind === 'expense').reduce((s, t) => s + (t.eur || 0), 0);
            const remaining = budget - spent + (trip.adjustment || 0); // inclut l'ajustement manuel
            const pct = budget > 0 ? ((budget - remaining) / budget) * 100 : 0;
            const isActive = trip.id === activeTrip?.id;
            return (
              <div
                key={trip.id}
                onClick={() => setSelectedTripId(trip.id)}
                className={`bg-bg-3 border rounded-xl p-4 cursor-pointer transition-all hover:border-border-2 ${isActive ? 'border-accent' : 'border-border'} ${selectedTripId === trip.id ? 'ring-2 ring-accent/30' : ''}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[15px] font-semibold tracking-tight">{trip.name}</span>
                  {isActive && <span className="text-[9px] font-bold uppercase text-accent bg-accent/10 border border-accent/25 px-2 py-0.5 rounded-full">EN COURS</span>}
                  {trip.status === 'ended' && <span className="text-[9px] font-bold uppercase text-t-4 bg-bg-4 px-2 py-0.5 rounded-full">TERMINÉ</span>}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-t-3 mb-3">
                  <Calendar size={11} />
                  <span>{trip.startDate}{trip.endDate ? ' → ' + trip.endDate : ' (en cours)'}</span>
                  <span className="text-t-4">·</span>
                  <span>{trip.country}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <div className="bg-bg-2 rounded-md px-2 py-1.5">
                    <div className="text-t-4 text-[9px] uppercase tracking-wider">Budget</div>
                    <div className="font-bold mono-value">{f$(budget)} {trip.currency}</div>
                  </div>
                  <div className="bg-bg-2 rounded-md px-2 py-1.5">
                    <div className="text-t-4 text-[9px] uppercase tracking-wider">Dépensé</div>
                    <div className={`font-bold mono-value ${pct > 100 ? 'text-danger' : 'text-t-1'}`}>{f$(spent)} {trip.currency}</div>
                  </div>
                  <div className="bg-bg-2 rounded-md px-2 py-1.5">
                    <div className="text-t-4 text-[9px] uppercase tracking-wider">Restant</div>
                    <div className={`font-bold mono-value ${remaining < 0 ? 'text-danger' : 'text-accent'}`}>{f$(remaining)} {trip.currency}</div>
                  </div>
                </div>
                <div className="h-1 bg-bg-2 rounded-full overflow-hidden mt-2">
                  <div className={`h-full ${pct > 100 ? 'bg-danger' : pct > 80 ? 'bg-warning' : 'bg-accent'}`} style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Trip detail panel */}
      {selectedTrip && tripStats && (
        <div className="bg-bg-3 border border-border-2 rounded-xl p-5 mb-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-[18px] font-bold tracking-tight">{selectedTrip.name}</div>
              <div className="text-[12px] text-t-3 mt-0.5">
                {selectedTrip.country} · Swap {f0(selectedTrip.swap.aedOut)} AED → {f$(selectedTrip.swap.localIn)} {selectedTrip.currency} (taux {selectedTrip.swap.rate.toFixed(4)})
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setAdjustInput(tripStats.remaining.toFixed(2)); setAdjustOpen(true); }}
                className="text-[11px] text-t-2 bg-bg-2 border border-border px-2.5 py-1 rounded-md cursor-pointer hover:bg-bg-4 hover:text-t-1 flex items-center gap-1"
                title="Ajuster manuellement le solde de la pocket"
              >
                <SlidersHorizontal size={11} /> Ajuster
              </button>
              {selectedTrip.status !== 'ended' ? (
                <button
                  onClick={() => updateTrip(selectedTrip.id, { status: 'ended', endDate: selectedTrip.endDate || todayStr() })}
                  className="text-[11px] text-info bg-info/10 border border-info/25 px-2.5 py-1 rounded-md cursor-pointer hover:bg-info/20"
                >
                  Marquer terminé
                </button>
              ) : (
                <button
                  onClick={() => updateTrip(selectedTrip.id, { status: 'ongoing', endDate: null })}
                  className="text-[11px] text-accent bg-accent/10 border border-accent/25 px-2.5 py-1 rounded-md cursor-pointer hover:bg-accent/20"
                >
                  Réouvrir
                </button>
              )}
              <button onClick={() => { deleteTrip(selectedTrip.id); setSelectedTripId(null); }} className="text-[11px] text-danger bg-danger/10 border border-danger/25 px-2.5 py-1 rounded-md cursor-pointer hover:bg-danger/20 flex items-center gap-1">
                <Trash2 size={11} /> Supprimer
              </button>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3 mb-5 max-md:grid-cols-2">
            <KpiBox label="Budget" value={`${f$(tripStats.budget)} ${selectedTrip.currency}`} color="text-t-1" />
            <KpiBox label="Dépensé" value={`${f$(tripStats.spent)} ${selectedTrip.currency}`} color={tripStats.pct > 100 ? 'text-danger' : 'text-t-1'} />
            <KpiBox
              label="Restant"
              value={`${f$(tripStats.remaining)} ${selectedTrip.currency}`}
              color={tripStats.remaining < 0 ? 'text-danger' : 'text-accent'}
              sub={tripStats.adjustment !== 0
                ? <span className={`text-[10px] mono-value font-medium ${tripStats.adjustment > 0 ? 'text-accent' : 'text-warning'}`}>Ajusté {tripStats.adjustment > 0 ? '+' : ''}{f$(tripStats.adjustment)} {selectedTrip.currency}</span>
                : undefined}
            />
            <KpiBox label="Consommé" value={`${tripStats.pct.toFixed(0)}%`} color={tripStats.pct > 100 ? 'text-danger' : 'text-info'} />
          </div>

          {/* Rechargements (swaps) */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] uppercase tracking-wider text-t-3 font-semibold">Rechargements ({tripSwaps.length})</span>
            <button onClick={() => { setRForm({ aedOut: 0, localIn: 0, date: todayStr(), monthId: selectedTrip.swap.monthId || curMonth || '' }); setRechargeOpen(true); }} className="px-3 py-1.5 bg-info/15 text-info border border-info/30 rounded-full text-[11px] font-semibold cursor-pointer">+ Recharger le compte €</button>
          </div>
          <div className="space-y-1.5 mb-5">
            {tripSwaps.map((sw, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2 bg-bg-2 border border-border rounded-md text-[12px]">
                <span className="text-[10px] text-t-4 font-mono w-20 shrink-0">{sw.date || '—'}</span>
                <span className="flex-1 text-t-3">{i === 0 ? 'Swap initial' : 'Recharge'} · {sw.monthId}</span>
                <span className="font-bold mono-value text-accent shrink-0">+{f$(sw.eur)} {selectedTrip.currency}</span>
                <span className="text-[10px] text-t-4 font-mono shrink-0">−{f0(sw.aed)} AED</span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] uppercase tracking-wider text-t-3 font-semibold">Dépenses ({tripExpenses.length})</span>
            <button
              onClick={() => {
                setEditing(null);
                const date = selDay || todayStr();
                // Le mois suit la date pré-remplie (jour cliqué dans le calendrier)
                setEForm({ ...eForm, monthId: trackerMonthForDate(date) || selectedTrip.swap.monthId || curMonth || '', date, label: '', eur: 0 });
                setExpenseOpen(true);
              }}
              className="px-3 py-1.5 bg-accent/15 text-accent border border-accent/30 rounded-full text-[11px] font-semibold cursor-pointer"
            >
              + Ajouter une dépense
            </button>
          </div>

          {/* Calendrier mensuel des dépenses */}
          <div className="bg-bg-2 border border-border rounded-xl p-3 max-md:p-2">
            <div className="flex items-center justify-between mb-3 px-1">
              <button onClick={() => shiftMonth(-1)} className="p-1 rounded-md text-t-3 hover:text-t-1 hover:bg-bg-4 cursor-pointer"><ChevronLeft size={16} /></button>
              <div className="flex items-center gap-3">
                <span className="text-[13px] font-semibold tracking-tight capitalize">
                  {new Date(effCalYM.y, effCalYM.m, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                </span>
                {calSummary.daysActive > 0 && (
                  <span className="text-[10px] text-t-4 max-md:hidden">
                    {calSummary.daysActive} jour{calSummary.daysActive > 1 ? 's' : ''} · plus gros {f$(calSummary.best.total)} {selectedTrip.currency}
                  </span>
                )}
              </div>
              <button onClick={() => shiftMonth(1)} className="p-1 rounded-md text-t-3 hover:text-t-1 hover:bg-bg-4 cursor-pointer"><ChevronRight size={16} /></button>
            </div>
            <div className="grid grid-cols-7 gap-1.5 max-md:gap-1 mb-1.5">
              {['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'].map((d, i) => (
                <div key={i} className="text-center text-[9px] max-md:text-[8px] font-semibold uppercase tracking-wider text-t-4">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5 max-md:gap-1">
              {calCells.map((ds, i) => {
                if (!ds) return <div key={i} />;
                const info = expensesByDay.get(ds);
                const day = parseInt(ds.slice(8), 10);
                const isSel = selDay === ds;
                const isToday = ds === todayStr();
                if (!info) {
                  return (
                    <div key={i} className={`rounded-lg border border-border/40 bg-bg-3/30 min-h-[58px] max-md:min-h-[46px] p-1.5 ${isToday ? 'ring-1 ring-border-2' : ''}`}>
                      <div className="text-[10px] text-t-4">{day}</div>
                    </div>
                  );
                }
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelDay(isSel ? null : ds)}
                    className={`rounded-lg border text-left min-h-[58px] max-md:min-h-[46px] p-1.5 transition-all cursor-pointer bg-bg-4 ${isSel ? 'border-accent ring-1 ring-accent/50' : 'border-border-2 hover:border-border-active'}`}
                  >
                    <div className="text-[10px] text-t-3 font-medium">{day}</div>
                    <div className="text-[11px] max-md:text-[9px] font-bold mono-value text-t-1 leading-tight mt-1 truncate">{f$(info.total)}</div>
                    <div className="text-[8px] text-t-4 mt-0.5">{info.count} tx</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Liste des dépenses — récent → ancien, filtrée si un jour est sélectionné */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] uppercase tracking-wider text-t-4 font-semibold capitalize">
                {selDay ? fmtDay(selDay) : 'Toutes les dépenses'} · {shownExpenses.length}
              </span>
              {selDay && (
                <button onClick={() => setSelDay(null)} className="text-[10px] text-accent bg-accent/10 border border-accent/25 px-2 py-0.5 rounded-md cursor-pointer hover:bg-accent/20">Tout afficher</button>
              )}
            </div>
            {shownExpenses.length === 0 ? (
              <div className="text-center py-6 text-t-4 text-[12px]">{selDay ? 'Aucune dépense ce jour' : 'Aucune dépense — clique + pour en ajouter'}</div>
            ) : (
              <div className="space-y-1.5">
                {shownExpenses.map((e, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2 bg-bg-2 border border-border rounded-md">
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-semibold truncate">{e.t.label || '—'}</div>
                      <div className="text-[10px] text-t-4 mt-0.5 flex items-center gap-2">
                        <span className="uppercase tracking-wider text-t-3 truncate">{e.posteName}</span>
                        <span className="font-mono shrink-0">{e.t.date || '—'}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[12px] font-bold mono-value text-t-1">{f$(e.t.eur || 0)} {selectedTrip.currency}</div>
                      <div className="text-[10px] text-t-4 font-mono mt-0.5">{f0(e.t.amount)} AED</div>
                    </div>
                    <button onClick={() => startEdit(e)} className="text-t-3 hover:text-t-1 bg-bg-3 border border-border hover:border-border-active p-1 rounded shrink-0 cursor-pointer transition-colors" title="Modifier">
                      <Pencil size={12} />
                    </button>
                    <button onClick={() => deleteTripExpense(selectedTrip.id, e.monthId, e.posteIdx, e.txIdx, e.extraName)} className="text-[10px] text-danger bg-danger/10 border border-danger/25 px-1.5 py-0.5 rounded shrink-0 cursor-pointer" title="Supprimer">
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* New trip modal */}
      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="Nouveau voyage">
        <div className="space-y-3.5">
          <FormField label="Nom">
            <input className="fi" value={nForm.name} onChange={e => setNForm({ ...nForm, name: e.target.value })} placeholder="Ex: Paris été 2026" autoFocus />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Pays">
              <input className="fi" value={nForm.country} onChange={e => setNForm({ ...nForm, country: e.target.value })} placeholder="France" />
            </FormField>
            <FormField label="Devise locale">
              <input className="fi" value={nForm.currency} onChange={e => setNForm({ ...nForm, currency: e.target.value.toUpperCase() })} placeholder="EUR" maxLength={3} />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Date début">
              <input className="fi" type="date" value={nForm.startDate} onChange={e => setNForm({ ...nForm, startDate: e.target.value })} />
            </FormField>
            <FormField label="Date fin (opt)">
              <input className="fi" type="date" value={nForm.endDate} onChange={e => setNForm({ ...nForm, endDate: e.target.value })} />
            </FormField>
          </div>
          <div className="bg-bg-4 border border-border rounded-md p-3 space-y-3">
            <div className="text-[10px] uppercase tracking-wider text-t-3 font-bold">Swap initial (débitera ton AED bank)</div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="AED swappés">
                <input className="fi" type="number" value={nForm.aedOut || ''} onChange={e => setNForm({ ...nForm, aedOut: parseFloat(e.target.value) || 0 })} step="0.01" placeholder="1000" />
              </FormField>
              <FormField label={`${nForm.currency} reçus`}>
                <input className="fi" type="number" value={nForm.localIn || ''} onChange={e => setNForm({ ...nForm, localIn: parseFloat(e.target.value) || 0 })} step="0.01" placeholder="250" />
              </FormField>
            </div>
            {nForm.aedOut > 0 && nForm.localIn > 0 && (
              <div className="text-[11px] text-t-3">Taux dérivé : <span className="text-t-1 font-mono">{(nForm.aedOut / nForm.localIn).toFixed(4)}</span></div>
            )}
          </div>
          <FormField label="Mois de la swap-tx (tracker)">
            <select className="fi" value={nForm.monthId} onChange={e => setNForm({ ...nForm, monthId: e.target.value })}>
              <option value="">— choisir —</option>
              {state.months.map(mo => <option key={mo.id} value={mo.id}>{mo.id}</option>)}
            </select>
          </FormField>
          <div className="flex gap-2.5 mt-5">
            <button onClick={handleCreate} disabled={!nForm.name.trim() || nForm.aedOut <= 0 || nForm.localIn <= 0 || !nForm.monthId} className="px-4 py-2 bg-accent text-black font-semibold text-sm rounded-sm cursor-pointer hover:opacity-90 disabled:opacity-40">Créer</button>
            <button onClick={() => setNewOpen(false)} className="px-4 py-2 border border-border text-t-2 text-sm rounded-sm cursor-pointer hover:bg-bg-3">Annuler</button>
          </div>
        </div>
      </Modal>

      {/* Add / edit expense modal */}
      <Modal open={expenseOpen} onClose={() => { setExpenseOpen(false); setEditing(null); }} title={editing ? 'Modifier la dépense' : 'Dépense voyage'}>
        <div className="space-y-3.5">
          {selectedTrip && (
            <div className="text-[11px] text-t-3 bg-bg-4 rounded-md p-2">
              Voyage : <strong className="text-t-1">{selectedTrip.name}</strong> · taux fixe {selectedTrip.swap.rate.toFixed(4)}
            </div>
          )}
          <FormField label="Poste cible (dans tracker)">
            <select className="fi" value={eForm.target} onChange={e => setEForm({ ...eForm, target: e.target.value })}>
              {state.postes.map((p, i) => <option key={`p${i}`} value={`p:${i}`}>{p.name}</option>)}
              {(() => {
                const mo = state.months.find(x => x.id === eForm.monthId);
                const extraNames = Array.from(new Set((mo?.extraActual || []).map(r => r.name)))
                  .filter(n => n.trim().toUpperCase() !== 'VOYAGES');
                if (extraNames.length === 0) return null;
                return (
                  <optgroup label="Postes du mois">
                    {extraNames.map(n => <option key={`x${n}`} value={`x:${n}`}>{n}</option>)}
                  </optgroup>
                );
              })()}
            </select>
          </FormField>
          <FormField label="Libellé">
            <div className="relative">
              <input
                className="fi"
                value={eForm.label}
                onChange={e => { setEForm({ ...eForm, label: e.target.value }); setShowLabelSugg(true); }}
                onFocus={() => setShowLabelSugg(true)}
                onBlur={() => setTimeout(() => setShowLabelSugg(false), 150)}
                placeholder="Ex: Restaurant Le Marais"
                autoComplete="off"
              />
              {showLabelSugg && filteredSuggestions.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-bg-3 border border-border-2 rounded-md shadow-lg max-h-56 overflow-y-auto">
                  {filteredSuggestions.map(s => (
                    <button
                      key={s.label}
                      type="button"
                      onMouseDown={e => { e.preventDefault(); setEForm(f => ({ ...f, label: s.label })); setShowLabelSugg(false); }}
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
          <div className="grid grid-cols-2 gap-3">
            <FormField label={`Montant (${selectedTrip?.currency || 'EUR'})`}>
              <input className="fi" type="number" value={eForm.eur || ''} onChange={e => setEForm({ ...eForm, eur: parseFloat(e.target.value) || 0 })} step="0.01" placeholder="50" autoFocus />
            </FormField>
            <FormField label="Date">
              <input
                className="fi"
                type="date"
                value={eForm.date}
                onChange={e => {
                  // Le mois du tracker suit la date saisie (s'il existe) ; sinon on garde le choix courant
                  const date = e.target.value;
                  const mid = trackerMonthForDate(date);
                  setEForm({ ...eForm, date, ...(mid ? { monthId: mid } : {}) });
                }}
              />
            </FormField>
          </div>
          <FormField label="Mois (tracker)">
            <select className="fi" value={eForm.monthId} onChange={e => setEForm({ ...eForm, monthId: e.target.value })}>
              <option value="">— choisir —</option>
              {state.months.map(mo => <option key={mo.id} value={mo.id}>{mo.id}</option>)}
            </select>
            {eForm.date && !trackerMonthForDate(eForm.date) && (
              <div className="text-[10px] text-warning mt-1">Aucun mois « {MOIS_LIST[Number(eForm.date.slice(5, 7)) - 1]} » dans le tracker — crée-le pour l&apos;imputer au bon mois.</div>
            )}
          </FormField>
          {eForm.eur > 0 && selectedTrip && (
            <div className="text-[11px] text-t-3 bg-bg-2 rounded-md p-2.5 flex justify-between">
              <span>Équivalent AED (au taux du swap)</span>
              <span className="text-t-1 font-mono">{f0(eForm.eur * selectedTrip.swap.rate)} AED</span>
            </div>
          )}
          <div className="flex gap-2.5 mt-5">
            <button onClick={handleAddExpense} disabled={eForm.eur <= 0 || !eForm.monthId} className="px-4 py-2 bg-accent text-black font-semibold text-sm rounded-sm cursor-pointer hover:opacity-90 disabled:opacity-40">{editing ? 'Enregistrer' : 'Ajouter'}</button>
            <button onClick={() => { setExpenseOpen(false); setEditing(null); }} className="px-4 py-2 border border-border text-t-2 text-sm rounded-sm cursor-pointer hover:bg-bg-3">Annuler</button>
          </div>
        </div>
      </Modal>

      {/* Recharge (nouveau swap) modal */}
      <Modal open={rechargeOpen} onClose={() => setRechargeOpen(false)} title="Recharger le compte €">
        <div className="space-y-3.5">
          {selectedTrip && (
            <div className="text-[11px] text-t-3 bg-bg-4 rounded-md p-2">
              Voyage : <strong className="text-t-1">{selectedTrip.name}</strong> — ajoute un swap AED→{selectedTrip.currency} à l&apos;enveloppe (débite ton compte AED).
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="AED swappés">
              <input className="fi" type="number" value={rForm.aedOut || ''} onChange={e => setRForm({ ...rForm, aedOut: parseFloat(e.target.value) || 0 })} step="0.01" placeholder="3175.28" autoFocus />
            </FormField>
            <FormField label={`${selectedTrip?.currency || 'EUR'} reçus`}>
              <input className="fi" type="number" value={rForm.localIn || ''} onChange={e => setRForm({ ...rForm, localIn: parseFloat(e.target.value) || 0 })} step="0.01" placeholder="750" />
            </FormField>
          </div>
          {rForm.aedOut > 0 && rForm.localIn > 0 && (
            <div className="text-[11px] text-t-3">Taux effectif (frais inclus) : <span className="text-t-1 font-mono">{(rForm.aedOut / rForm.localIn).toFixed(4)}</span></div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Date">
              <input
                className="fi"
                type="date"
                value={rForm.date}
                onChange={e => {
                  const date = e.target.value;
                  const mid = trackerMonthForDate(date);
                  setRForm({ ...rForm, date, ...(mid ? { monthId: mid } : {}) });
                }}
              />
            </FormField>
            <FormField label="Mois (tracker)">
              <select className="fi" value={rForm.monthId} onChange={e => setRForm({ ...rForm, monthId: e.target.value })}>
                <option value="">— choisir —</option>
                {state.months.map(mo => <option key={mo.id} value={mo.id}>{mo.id}</option>)}
              </select>
            </FormField>
          </div>
          <div className="flex gap-2.5 mt-5">
            <button onClick={handleRecharge} disabled={rForm.aedOut <= 0 || rForm.localIn <= 0 || !rForm.monthId} className="px-4 py-2 bg-info text-black font-semibold text-sm rounded-sm cursor-pointer hover:opacity-90 disabled:opacity-40">Recharger</button>
            <button onClick={() => setRechargeOpen(false)} className="px-4 py-2 border border-border text-t-2 text-sm rounded-sm cursor-pointer hover:bg-bg-3">Annuler</button>
          </div>
        </div>
      </Modal>

      {/* Ajuster le solde (réconciliation manuelle) modal */}
      <Modal open={adjustOpen} onClose={() => setAdjustOpen(false)} title="Ajuster le solde de la pocket">
        {selectedTrip && tripStats && (() => {
          const base = tripStats.budget - tripStats.spent; // solde calculé sans ajustement
          const real = parseFloat(adjustInput);
          const delta = isNaN(real) ? 0 : Math.round((real - base) * 100) / 100;
          return (
            <div className="space-y-3.5">
              <div className="text-[11px] text-t-3 bg-bg-4 rounded-md p-2.5 space-y-1">
                <div className="flex justify-between"><span>Budget (swaps)</span><span className="text-t-1 mono-value">{f$(tripStats.budget)} {selectedTrip.currency}</span></div>
                <div className="flex justify-between"><span>− Dépensé</span><span className="text-t-1 mono-value">{f$(tripStats.spent)} {selectedTrip.currency}</span></div>
                <div className="flex justify-between border-t border-border pt-1 mt-1"><span>= Solde calculé</span><span className="text-t-1 mono-value font-bold">{f$(base)} {selectedTrip.currency}</span></div>
                {tripStats.adjustment !== 0 && (
                  <div className="flex justify-between"><span>Ajustement actuel</span><span className={`mono-value ${tripStats.adjustment > 0 ? 'text-accent' : 'text-warning'}`}>{tripStats.adjustment > 0 ? '+' : ''}{f$(tripStats.adjustment)} {selectedTrip.currency}</span></div>
                )}
              </div>
              <FormField label={`Solde réel de ta pocket (${selectedTrip.currency})`}>
                <input className="fi mono-value" type="number" step="0.01" value={adjustInput} onChange={e => setAdjustInput(e.target.value)} autoFocus placeholder="Ex: 300" />
              </FormField>
              {!isNaN(real) && (
                <div className="text-[11px] text-t-3 bg-bg-2 rounded-md p-2.5 flex justify-between">
                  <span>Δ ajustement à appliquer</span>
                  <span className={`mono-value font-bold ${delta > 0 ? 'text-accent' : delta < 0 ? 'text-warning' : 'text-t-1'}`}>{delta > 0 ? '+' : ''}{f$(delta)} {selectedTrip.currency}</span>
                </div>
              )}
              <div className="flex gap-2.5 mt-5">
                <button onClick={handleAdjust} disabled={isNaN(real)} className="px-4 py-2 bg-accent text-black font-semibold text-sm rounded-sm cursor-pointer hover:opacity-90 disabled:opacity-40">Appliquer</button>
                {tripStats.adjustment !== 0 && (
                  <button onClick={clearAdjust} className="px-4 py-2 border border-warning/40 text-warning text-sm rounded-sm cursor-pointer hover:bg-warning/10">Effacer l&apos;ajustement</button>
                )}
                <button onClick={() => setAdjustOpen(false)} className="px-4 py-2 border border-border text-t-2 text-sm rounded-sm cursor-pointer hover:bg-bg-3">Annuler</button>
              </div>
            </div>
          );
        })()}
      </Modal>
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

function KpiBox({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: React.ReactNode }) {
  return (
    <div className="bg-bg-2 border border-border rounded-lg p-3">
      <div className="text-[10px] text-t-3 uppercase tracking-wider font-semibold">{label}</div>
      <div className={`text-[16px] font-bold mt-1 mono-value tracking-tight ${color || 'text-t-1'}`}>{value}</div>
      {sub && <div className="mt-0.5">{sub}</div>}
    </div>
  );
}
