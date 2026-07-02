'use client';

import { useState, useMemo } from 'react';
import { useApp } from '@/context/AppProvider';
import PageHeader from '@/components/layout/PageHeader';
import Modal from '@/components/ui/Modal';
import { f$, f0 } from '@/lib/utils';
import { Trip, Transaction } from '@/lib/types';
import { Plus, Plane, ArrowRight, Calendar, Trash2 } from 'lucide-react';

const todayStr = () => new Date().toISOString().split('T')[0];

export default function TripsPage() {
  const { state, trips, createTrip, deleteTrip, addTripExpense, deleteTripExpense, addTripSwap, updateTrip, curMonth } = useApp();

  const [newOpen, setNewOpen] = useState(false);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [rForm, setRForm] = useState({ aedOut: 0, localIn: 0, date: todayStr(), monthId: curMonth || '' });

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
    const remaining = budget - spent;
    const pct = budget > 0 ? (spent / budget) * 100 : 0;
    return { budget, spent, remaining, pct };
  }, [selectedTrip, tripExpenses, tripSwaps]);

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
    addTripExpense({
      tripId: selectedTrip.id,
      posteIdx: isExtra ? -1 : parseInt(eForm.target.slice(2)),
      extraName: isExtra ? eForm.target.slice(2) : undefined,
      monthId: eForm.monthId,
      label: eForm.label,
      eur: eForm.eur,
      date: eForm.date,
    });
    setExpenseOpen(false);
    setEForm({ target: eForm.target, label: '', eur: 0, date: todayStr(), monthId: eForm.monthId });
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
            const remaining = budget - spent;
            const pct = budget > 0 ? (spent / budget) * 100 : 0;
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
                    <div className={`font-bold mono-value ${pct > 100 ? 'text-danger' : 'text-warning'}`}>{f$(spent)} {trip.currency}</div>
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
            <KpiBox label="Dépensé" value={`${f$(tripStats.spent)} ${selectedTrip.currency}`} color={tripStats.pct > 100 ? 'text-danger' : 'text-warning'} />
            <KpiBox label="Restant" value={`${f$(tripStats.remaining)} ${selectedTrip.currency}`} color={tripStats.remaining < 0 ? 'text-danger' : 'text-accent'} />
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
            <button onClick={() => { setEForm({ ...eForm, monthId: selectedTrip.swap.monthId || curMonth || '', date: todayStr(), label: '', eur: 0 }); setExpenseOpen(true); }} className="px-3 py-1.5 bg-accent/15 text-accent border border-accent/30 rounded-full text-[11px] font-semibold cursor-pointer">+ Ajouter une dépense</button>
          </div>

          {tripExpenses.length === 0 ? (
            <div className="text-center py-6 text-t-4 text-[12px]">Aucune dépense — clique + pour en ajouter</div>
          ) : (
            <div className="space-y-1.5">
              {tripExpenses.map((e, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2 bg-bg-2 border border-border rounded-md">
                  <div className="text-[10px] text-t-4 font-mono w-20 shrink-0">{e.t.date || '—'}</div>
                  <div className="text-[10px] text-t-3 uppercase tracking-wider w-24 shrink-0 truncate">{e.posteName}</div>
                  <div className="text-[12px] font-semibold flex-1 min-w-0 truncate">{e.t.label || '—'}</div>
                  <div className="text-[12px] font-bold mono-value text-warning shrink-0">{f$(e.t.eur || 0)} {selectedTrip.currency}</div>
                  <div className="text-[10px] text-t-4 font-mono shrink-0">{f0(e.t.amount)} AED</div>
                  <button onClick={() => deleteTripExpense(selectedTrip.id, e.monthId, e.posteIdx, e.txIdx, e.extraName)} className="text-[10px] text-danger bg-danger/10 border border-danger/25 px-1.5 py-0.5 rounded">
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
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

      {/* Add expense modal */}
      <Modal open={expenseOpen} onClose={() => setExpenseOpen(false)} title="Dépense voyage">
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
            <input className="fi" value={eForm.label} onChange={e => setEForm({ ...eForm, label: e.target.value })} placeholder="Ex: Restaurant Le Marais" />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label={`Montant (${selectedTrip?.currency || 'EUR'})`}>
              <input className="fi" type="number" value={eForm.eur || ''} onChange={e => setEForm({ ...eForm, eur: parseFloat(e.target.value) || 0 })} step="0.01" placeholder="50" autoFocus />
            </FormField>
            <FormField label="Date">
              <input className="fi" type="date" value={eForm.date} onChange={e => setEForm({ ...eForm, date: e.target.value })} />
            </FormField>
          </div>
          <FormField label="Mois (tracker)">
            <select className="fi" value={eForm.monthId} onChange={e => setEForm({ ...eForm, monthId: e.target.value })}>
              <option value="">— choisir —</option>
              {state.months.map(mo => <option key={mo.id} value={mo.id}>{mo.id}</option>)}
            </select>
          </FormField>
          {eForm.eur > 0 && selectedTrip && (
            <div className="text-[11px] text-t-3 bg-bg-2 rounded-md p-2.5 flex justify-between">
              <span>Équivalent AED (au taux du swap)</span>
              <span className="text-t-1 font-mono">{f0(eForm.eur * selectedTrip.swap.rate)} AED</span>
            </div>
          )}
          <div className="flex gap-2.5 mt-5">
            <button onClick={handleAddExpense} disabled={eForm.eur <= 0 || !eForm.monthId} className="px-4 py-2 bg-accent text-black font-semibold text-sm rounded-sm cursor-pointer hover:opacity-90 disabled:opacity-40">Ajouter</button>
            <button onClick={() => setExpenseOpen(false)} className="px-4 py-2 border border-border text-t-2 text-sm rounded-sm cursor-pointer hover:bg-bg-3">Annuler</button>
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
              <input className="fi" type="date" value={rForm.date} onChange={e => setRForm({ ...rForm, date: e.target.value })} />
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

function KpiBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-bg-2 border border-border rounded-lg p-3">
      <div className="text-[10px] text-t-3 uppercase tracking-wider font-semibold">{label}</div>
      <div className={`text-[16px] font-bold mt-1 mono-value tracking-tight ${color || 'text-t-1'}`}>{value}</div>
    </div>
  );
}
