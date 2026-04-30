'use client';

import { useState, useCallback } from 'react';
import { useApp } from '@/context/AppProvider';
import PageHeader from '@/components/layout/PageHeader';
import { KpiCard } from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import { f$, f0, toEur, toAed, rowEur, sumEur, sumAed, sumEurBudget, sumAedBudget, detectYears } from '@/lib/utils';
import { LEGACY_EARN_MONTHS, CAT_COLORS } from '@/lib/constants';
import { Month } from '@/lib/types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';

const PIE_C = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1'];

export default function TrackerPage() {
  const { state, save, curMonth, setCurMonth, curYear, setCurYear, liveRate, updateMonth, setState } = useApp();
  const [newMonthOpen, setNewMonthOpen] = useState(false);
  const [nmName, setNmName] = useState('');
  const [nmRate, setNmRate] = useState(liveRate);
  const [nmSolde, setNmSolde] = useState(0);
  const [addRowOpen, setAddRowOpen] = useState(false);
  const [arSection, setArSection] = useState<'budget' | 'actual'>('budget');
  const [arName, setArName] = useState('');
  const [arCat, setArCat] = useState('vital');
  const [arAed, setArAed] = useState(0);
  const [arEur, setArEur] = useState(0);

  const years = detectYears(state.months);
  const filtered = curYear === 'all' ? state.months : state.months.filter(m => m._year === parseInt(curYear));
  const m = state.months.find(mo => mo.id === curMonth);

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
    if (state.months.length > 0) {
      const last = state.months[state.months.length - 1];
      state.postes.forEach((_, i) => {
        newMonth.budget.push({ aed: last.budget[i]?.aed || 0, eur: last.budget[i]?.eur || null });
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
  };

  const deleteMonth = () => {
    if (!curMonth || !confirm(`Supprimer ${curMonth} ?`)) return;
    const months = state.months.filter(mo => mo.id !== curMonth);
    setState({ ...state, months });
    setCurMonth(months.length > 0 ? months[months.length - 1].id : null as unknown as string);
    save();
  };

  const updateBudget = (idx: number, val: number, isEur = false) => {
    if (!m) return;
    const months = state.months.map(mo => {
      if (mo.id !== m.id) return mo;
      const budget = [...mo.budget];
      budget[idx] = isEur ? { ...budget[idx], eur: val } : { ...budget[idx], aed: val };
      return { ...mo, budget };
    });
    setState({ ...state, months });
    save();
  };

  const updateActual = (idx: number, val: number, isEur = false) => {
    if (!m) return;
    const months = state.months.map(mo => {
      if (mo.id !== m.id) return mo;
      const actual = [...mo.actual];
      actual[idx] = isEur ? { ...actual[idx], eur: val } : { ...actual[idx], aed: val };
      return { ...mo, actual };
    });
    setState({ ...state, months });
    save();
  };

  const addCustomRow = () => {
    if (!m) return;
    const row = { name: arName.trim().toUpperCase() || 'AUTRE', cat: arCat, aed: arAed, eur: arEur };
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

  // Computed values
  const bE = m ? sumEurBudget(m, state.postes, liveRate) : 0;
  const bA = m ? sumAedBudget(m, state.postes, liveRate) : 0;
  const aE = m ? sumEur(m, m.actual, m.extraActual) : 0;
  const aA = m ? sumAed(m, m.actual, m.extraActual) : 0;

  const synced = m ? isRevSynced(m.id) : false;
  const earnEur = m ? (synced ? getMonthRevEur(m.id) : (m.earn || 0)) : 0;
  const earnAed = m ? (synced ? getMonthRevAed(m.id) : toAed(m.earn || 0, m.rate)) : 0;
  const diff = earnEur - aE;
  const prevCompte = m ? ((m.soldeStart || 0) + earnAed - aA) : 0;

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

  if (state.months.length === 0) {
    return (
      <div>
        <PageHeader breadcrumb={[{ label: 'Dubai' }, { label: 'Tracker', current: true }]} title="Tracker" subtitle="Budget prévisionnel & dépenses réelles">
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
      <PageHeader breadcrumb={[{ label: 'Dubai' }, { label: 'Tracker', current: true }]} title="Tracker" subtitle="Budget prévisionnel & dépenses réelles">
        <button onClick={() => { setNmRate(liveRate); setNmName(''); setNmSolde(0); setNewMonthOpen(true); }} className="px-4 py-2 bg-accent text-black font-semibold text-sm rounded-sm hover:opacity-90 transition-all flex items-center gap-2 cursor-pointer">
          + Nouveau mois
        </button>
      </PageHeader>

      {/* Year filter + Month tabs */}
      <div className="flex items-center gap-2.5 mb-5 flex-wrap">
        <select
          value={curYear}
          onChange={e => {
            setCurYear(e.target.value);
            const f = e.target.value === 'all' ? state.months : state.months.filter(mo => mo._year === parseInt(e.target.value));
            if (f.length > 0 && !f.find(mo => mo.id === curMonth)) setCurMonth(f[f.length - 1].id);
          }}
          className="px-3 py-1.5 bg-bg-3 border border-border rounded-md text-xs font-semibold text-t-1 outline-none cursor-pointer"
        >
          <option value="all">Tous</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <div className="flex gap-1 flex-wrap">
          {filtered.map(mo => (
            <button
              key={mo.id}
              onClick={() => setCurMonth(mo.id)}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                mo.id === curMonth
                  ? 'bg-bg-4 text-t-1 border border-border-2'
                  : 'text-t-3 border border-transparent hover:text-t-2 hover:bg-bg-3'
              }`}
            >
              {mo.id}
            </button>
          ))}
          <button onClick={deleteMonth} className="px-2.5 py-1 text-[11px] bg-danger/10 text-danger border border-danger/25 rounded-md font-semibold ml-1.5 cursor-pointer hover:bg-danger/20 transition-all">
            Supprimer
          </button>
        </div>
      </div>

      {m && (
        <>
          {/* Solde cards */}
          <div className="flex gap-2.5 mb-5 flex-wrap">
            <SoldeCard icon="🏦" label="Solde début (AED)" value={m.soldeStart} onChange={v => updateMonth(m.id, 'soldeStart', v)} />
            <SoldeCard icon="🏦" label="Solde fin (AED)" value={m.soldeEnd} onChange={v => updateMonth(m.id, 'soldeEnd', v)} />
            <SoldeDisplay icon="📊" label="Prévisionnel (AED)" value={f0(prevCompte)} color={prevCompte >= 0 ? 'text-accent' : 'text-danger'} />
            {synced ? (
              <SoldeDisplay icon="💵" label="Revenus confirmés" value={`${f$(earnEur)} €`} sub={`${f0(earnAed)} AED`} color="text-t-1" />
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

          {/* Budget Table */}
          <TableSection title="Budget Prévisionnel" subtitle="Estimations du mois">
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
                const row = m.budget[i] || { aed: 0, eur: null };
                const eur = p.isAed ? toEur(row.aed, liveRate) : (row.eur || 0);
                const pct = bE > 0 ? ((eur / bE) * 100).toFixed(1) : '0.0';
                return (
                  <tr key={i} className="border-b border-border hover:bg-white/[.02] transition-colors">
                    <td className="px-4 py-2.5 text-[13px] font-semibold">{p.name}</td>
                    <td className="px-4 py-2.5 text-right">
                      {p.isAed ? (
                        <CellInput value={row.aed} onChange={v => updateBudget(i, v)} />
                      ) : (
                        <span className="font-mono text-xs text-t-3">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {!p.isAed ? (
                        <CellInput value={row.eur || 0} onChange={v => updateBudget(i, v, true)} />
                      ) : (
                        <span className="font-mono text-xs text-t-3 mono-value">{f$(eur)}</span>
                      )}
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
                return (
                  <tr key={`eb${i}`} className="border-b border-border hover:bg-white/[.02]">
                    <td className="px-4 py-2.5 text-[13px] font-semibold">{r.name}</td>
                    <td className="px-4 py-2.5 text-right"><span className="font-mono text-xs mono-value">{f0(r.aed)}</span></td>
                    <td className="px-4 py-2.5 text-right"><span className="font-mono text-xs text-t-3 mono-value">{f$(eur)}</span></td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => { const months = state.months.map(mo => mo.id === m.id ? { ...mo, extraBudget: mo.extraBudget.filter((_, j) => j !== i) } : mo); setState({ ...state, months }); save(); }} className="text-[11px] text-danger bg-danger/10 border border-danger/25 px-2 py-0.5 rounded cursor-pointer hover:bg-danger/20">✕</button>
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td colSpan={4} className="text-center py-2">
                  <button onClick={() => { setArSection('budget'); setArName(''); setArAed(0); setArEur(0); setAddRowOpen(true); }} className="text-xs text-t-2 border border-border px-3 py-1 rounded-sm hover:bg-bg-3 transition-all cursor-pointer">+ Ajouter un poste</button>
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="bg-bg-2">
                <td className="px-4 py-2.5 font-bold text-[13px]">TOTAL</td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-[13px] mono-value">{f0(bA)} AED</td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-[13px] mono-value">{f$(bE)} €</td>
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
                const row = m.actual[i] || { aed: 0, eur: null };
                const brow = m.budget[i] || { aed: 0, eur: null };
                const eur = rowEur(row, m.rate);
                const beur = rowEur(brow, liveRate);
                const ratio = beur > 0 ? eur / beur : 0;
                const ecart = beur - eur;
                const rc = ratio > 1.05 ? 'text-danger' : ratio < 0.95 && ratio > 0 ? 'text-accent' : 'text-t-3';
                return (
                  <tr key={i} className="border-b border-border hover:bg-white/[.02]">
                    <td className="px-4 py-2.5 text-[13px] font-semibold">{p.name}</td>
                    <td className="px-4 py-2.5 text-right">
                      {p.isAed ? <CellInput value={row.aed} onChange={v => updateActual(i, v)} /> : <span className="font-mono text-xs text-t-3">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {!p.isAed ? <CellInput value={row.eur || 0} onChange={v => updateActual(i, v, true)} /> : <span className="font-mono text-xs text-t-3 mono-value">{f$(eur)}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`font-mono text-[11px] font-semibold ${rc}`}>{beur > 0 ? `${(ratio * 100).toFixed(0)}%` : '—'}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`font-mono text-[11px] ${ecart >= 0 ? 'text-accent' : 'text-danger'} mono-value`}>
                        {beur > 0 ? `${ecart >= 0 ? '+' : ''}${f$(ecart)} €` : '—'}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {(m.extraActual || []).map((r, i) => {
                const eur = r.eur > 0 ? r.eur : toEur(r.aed, m.rate);
                return (
                  <tr key={`ea${i}`} className="border-b border-border hover:bg-white/[.02]">
                    <td className="px-4 py-2.5 text-[13px] font-semibold">{r.name}</td>
                    <td className="px-4 py-2.5 text-right"><span className="font-mono text-xs mono-value">{f0(r.aed)}</span></td>
                    <td className="px-4 py-2.5 text-right"><span className="font-mono text-xs text-t-3 mono-value">{f$(eur)}</span></td>
                    <td className="px-4 py-2.5 text-right"><span className="font-mono text-[11px] text-t-3">—</span></td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => { const months = state.months.map(mo => mo.id === m.id ? { ...mo, extraActual: mo.extraActual.filter((_, j) => j !== i) } : mo); setState({ ...state, months }); save(); }} className="text-[11px] text-danger bg-danger/10 border border-danger/25 px-2 py-0.5 rounded cursor-pointer hover:bg-danger/20">✕</button>
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
                <td className="px-4 py-2.5 text-right font-mono font-bold mono-value">{f0(aA)} AED</td>
                <td className="px-4 py-2.5 text-right font-mono font-bold mono-value">{f$(aE)} €</td>
                <td className="px-4 py-2.5 text-right">
                  <span className={`font-mono text-[11px] font-semibold ${bE > 0 && aE / bE > 1.05 ? 'text-danger' : 'text-accent'}`}>
                    {bE > 0 ? `${(aE / bE * 100).toFixed(0)}%` : '—'}
                  </span>
                </td>
                <td />
              </tr>
            </tfoot>
          </TableSection>

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
          <div className="flex gap-2.5 mt-5">
            <button onClick={createMonth} className="px-4 py-2 bg-accent text-black font-semibold text-sm rounded-sm cursor-pointer hover:opacity-90">Créer</button>
            <button onClick={() => setNewMonthOpen(false)} className="px-4 py-2 border border-border text-t-2 text-sm rounded-sm cursor-pointer hover:bg-bg-3">Annuler</button>
          </div>
        </div>
      </Modal>

      {/* Add Row Modal */}
      <Modal open={addRowOpen} onClose={() => setAddRowOpen(false)} title="Ajouter un poste">
        <div className="space-y-3.5">
          <FormField label="Section">
            <select className="fi" value={arSection} onChange={e => setArSection(e.target.value as 'budget' | 'actual')}>
              <option value="budget">Budget</option>
              <option value="actual">Réel</option>
            </select>
          </FormField>
          <FormField label="Nom">
            <input className="fi" value={arName} onChange={e => setArName(e.target.value)} placeholder="Ex: KSA, FRANCE..." />
          </FormField>
          <FormField label="Catégorie">
            <select className="fi" value={arCat} onChange={e => setArCat(e.target.value)}>
              <option value="vital">Vital</option>
              <option value="lifestyle">Lifestyle</option>
              <option value="logement">Logement</option>
              <option value="finance">Finance</option>
            </select>
          </FormField>
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
    </div>
  );
}

// Sub-components
function SoldeCard({ icon, label, value, onChange }: { icon: string; label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex-1 min-w-[170px] bg-bg-3 border border-border rounded-md px-4 py-3.5 flex items-center gap-3 transition-all hover:border-border-2">
      <span className="text-xl">{icon}</span>
      <div>
        <div className="text-[9px] text-t-3 uppercase tracking-wider font-medium">{label}</div>
        <input
          type="number"
          className="bg-transparent border border-transparent font-mono text-base font-semibold w-[130px] outline-none hover:border-border-2 hover:bg-bg-2 focus:border-accent focus:bg-bg-2 rounded-md px-1.5 py-0.5 mt-0.5 transition-all mono-value"
          value={value}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          step="0.01"
        />
      </div>
    </div>
  );
}

function SoldeDisplay({ icon, label, value, color = 'text-t-1', sub }: { icon: string; label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className="flex-1 min-w-[170px] bg-bg-3 border border-border rounded-md px-4 py-3.5 flex items-center gap-3">
      <span className="text-xl">{icon}</span>
      <div>
        <div className="text-[9px] text-t-3 uppercase tracking-wider font-medium">{label}</div>
        <div className={`font-mono text-base font-semibold mt-0.5 mono-value ${color}`}>{value}</div>
        {sub && <div className="text-[11px] text-t-3 font-mono mono-value">{sub}</div>}
      </div>
    </div>
  );
}

function CellInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      className="bg-transparent border border-transparent font-mono text-xs w-full text-right outline-none px-2 py-1 rounded-md hover:border-border-2 hover:bg-bg-2 focus:border-accent focus:bg-bg-2 focus:shadow-[0_0_0_2px_rgba(16,185,129,0.1)] transition-all"
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
      <table className="w-full border-collapse">{children}</table>
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
