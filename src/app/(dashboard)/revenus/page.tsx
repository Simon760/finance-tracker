'use client';

import { useState, useMemo } from 'react';
import { useApp } from '@/context/AppProvider';
import PageHeader from '@/components/layout/PageHeader';
import { KpiCard } from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import { f$, f0, toAed } from '@/lib/utils';
import { MOIS_LIST, REV_COLORS } from '@/lib/constants';
import { RevenuEntry } from '@/lib/types';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, ReferenceLine,
} from 'recharts';

const STATUS_LABELS: Record<string, string> = { confirmed: 'Confirmé', pending: 'En attente', preview: 'Prévision' };
const STATUS_COLORS: Record<string, string> = { confirmed: 'text-accent bg-accent/10 border-accent/25', pending: 'text-warning bg-warning/10 border-warning/25', preview: 'text-info bg-info/10 border-info/25' };

const tooltipStyle = { background: '#1c1c23', border: '1px solid #2a2a3a', borderRadius: 8 };

export default function RevenusPage() {
  const { state, setState, save, liveRate, activeSpace } = useApp();
  const rev = state.revenus || { objectif: 5000, categories: [], months: {} };

  const [page, setPage] = useState<'tracker' | 'global'>('tracker');
  const [addOpen, setAddOpen] = useState(false);
  const [editIdx, setEditIdx] = useState<{ month: string; idx: number } | null>(null);
  const [curTab, setCurTab] = useState<string>('');
  const [form, setForm] = useState<RevenuEntry>({ date: '', client: '', cat: '', contracted: 0, cashed: 0, comment: '', rate: liveRate, status: 'confirmed' });
  const [formMonth, setFormMonth] = useState('');

  // Order months by MOIS_LIST
  const orderedMonths = useMemo(() => {
    const existing = Object.keys(rev.months || {});
    return MOIS_LIST.filter(m => existing.includes(m));
  }, [rev.months]);

  const effectiveTab = curTab || orderedMonths[orderedMonths.length - 1] || '';
  const visibleMonths = effectiveTab ? [effectiveTab] : [];

  // KPI totals
  const totalConfirmed = useMemo(() => {
    let t = 0;
    Object.values(rev.months || {}).forEach(entries => {
      (entries || []).forEach(e => { if (!e.status || e.status === 'confirmed') t += e.cashed || 0; });
    });
    return t;
  }, [rev.months]);

  const totalPending = useMemo(() => {
    let t = 0;
    Object.values(rev.months || {}).forEach(entries => {
      (entries || []).forEach(e => { if (e.status === 'pending') t += e.cashed || 0; });
    });
    return t;
  }, [rev.months]);

  const totalPreview = useMemo(() => {
    let t = 0;
    Object.values(rev.months || {}).forEach(entries => {
      (entries || []).forEach(e => { if (e.status === 'preview') t += e.contracted || 0; });
    });
    return t;
  }, [rev.months]);

  const catTotals = useMemo(() => {
    const map: Record<string, number> = {};
    Object.values(rev.months || {}).forEach(entries => {
      (entries || []).forEach(e => {
        if (!e.status || e.status === 'confirmed') {
          map[e.cat || 'Autre'] = (map[e.cat || 'Autre'] || 0) + (e.cashed || 0);
        }
      });
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [rev.months]);

  // Actions
  const openAdd = (month?: string) => {
    setForm({ date: '', client: '', cat: rev.categories?.[0] || '', contracted: 0, cashed: 0, comment: '', rate: liveRate, status: 'confirmed' });
    setFormMonth(month || orderedMonths[orderedMonths.length - 1] || '');
    setEditIdx(null);
    setAddOpen(true);
  };

  const openEdit = (month: string, idx: number) => {
    const e = rev.months[month][idx];
    setForm({ ...e });
    setFormMonth(month);
    setEditIdx({ month, idx });
    setAddOpen(true);
  };

  const saveEntry = () => {
    const monthKey = formMonth.trim().toUpperCase();
    if (!monthKey) return;
    const months = { ...(rev.months || {}) };
    if (!months[monthKey]) months[monthKey] = [];

    if (editIdx) {
      months[editIdx.month] = [...months[editIdx.month]];
      months[editIdx.month][editIdx.idx] = { ...form };
    } else {
      months[monthKey] = [...months[monthKey], { ...form }];
    }

    setState({ ...state, revenus: { ...rev, months } });
    setAddOpen(false);
    save();
  };

  const deleteEntry = (month: string, idx: number) => {
    if (!confirm('Supprimer cette entrée ?')) return;
    const months = { ...(rev.months || {}) };
    months[month] = months[month].filter((_, i) => i !== idx);
    if (months[month].length === 0) delete months[month];
    setState({ ...state, revenus: { ...rev, months } });
    save();
  };

  const confirmEntry = (month: string, idx: number) => {
    const months = { ...(rev.months || {}) };
    months[month] = [...months[month]];
    months[month][idx] = { ...months[month][idx], status: 'confirmed', rate: liveRate };
    setState({ ...state, revenus: { ...rev, months } });
    save();
  };

  const updateObjectif = (val: number) => {
    setState({ ...state, revenus: { ...rev, objectif: val } });
    save();
  };

  const addCategory = () => {
    const cat = prompt('Nom de la catégorie :');
    if (!cat || (rev.categories || []).includes(cat.trim())) return;
    setState({ ...state, revenus: { ...rev, categories: [...(rev.categories || []), cat.trim()] } });
    save();
  };

  const obj = rev.objectif || 5000;

  // ─── TRACKER VIEW ───
  const renderTracker = () => {
    const curMonthName = effectiveTab;
    const curEntries = rev.months[curMonthName] || [];
    const monthCashed = curEntries.filter(e => !e.status || e.status === 'confirmed').reduce((s, e) => s + (e.cashed || 0), 0);
    const monthPreview = curEntries.filter(e => e.status === 'preview').reduce((s, e) => s + (e.cashed || 0), 0);
    const pctMonth = obj > 0 ? (monthCashed / obj) * 100 : 0;
    const delta = monthCashed - obj;

    // Bar chart for monthly tracker view
    const barData = MOIS_LIST.map(month => {
      const entries = rev.months[month] || [];
      const confirmed = entries.filter(e => !e.status || e.status === 'confirmed').reduce((s, e) => s + (e.cashed || 0), 0);
      const pending = entries.filter(e => e.status === 'pending').reduce((s, e) => s + (e.cashed || 0), 0);
      return { name: month.slice(0, 3), Confirmé: confirmed, 'En attente': pending };
    });

    return (
      <>
        {/* Month tabs */}
        <div className="flex gap-1 flex-wrap mb-5">
          {(MOIS_LIST as readonly string[]).map(m => {
            const hasData = rev.months[m] && rev.months[m].length > 0;
            return (
              <button key={m} onClick={() => setCurTab(m)} className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${effectiveTab === m ? 'bg-bg-4 text-t-1 border border-border-2' : `${hasData ? 'text-t-2' : 'text-t-4'} border border-transparent hover:text-t-2`}`}>
                {m.slice(0, 3)}
              </button>
            );
          })}
        </div>

        {/* KPIs for current month */}
        <div className="grid grid-cols-5 gap-3 mb-5 max-lg:grid-cols-3 max-md:grid-cols-1">
          <KpiCard label="Objectif" value={`${f$(obj)} €`} accentColor="#ef4444" />
          <KpiCard label="Encaissé (confirmé)" value={`${f$(totalConfirmed)} €`} sub={monthPreview > 0 ? `+ ${f$(monthPreview)} € en prévision` : undefined} accentColor="#10b981" />
          <KpiCard label="En attente" value={`${f$(totalPending)} €`} accentColor="#f59e0b" />
          <KpiCard label="Prévisions" value={`${f$(totalPreview)} €`} accentColor="#3b82f6" />
          <div className="bg-bg-3 border border-border rounded-md p-4 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: pctMonth >= 100 ? '#10b981' : '#f59e0b' }} />
            <div className="text-[10px] text-t-3 uppercase tracking-wider font-medium mb-2">Atteinte</div>
            <div className="font-mono text-[22px] font-bold tracking-tight" style={{ color: pctMonth >= 100 ? '#10b981' : '#f59e0b' }}>{pctMonth.toFixed(0)}%</div>
            <div className={`text-[11px] font-mono mt-1 ${delta >= 0 ? 'text-accent' : 'text-danger'}`}>{delta >= 0 ? '+' : ''}{f$(delta)} €</div>
          </div>
        </div>

        {/* Revenue tables by month */}
        {visibleMonths.map(month => {
          const entries = rev.months[month] || [];
          if (entries.length === 0) return null;
          const monthTotal = entries.filter(e => !e.status || e.status === 'confirmed').reduce((s, e) => s + (e.cashed || 0), 0);
          return (
            <div key={month} className="bg-bg-3 border border-border rounded-md overflow-hidden mb-4">
              <div className="flex justify-between items-center px-4 py-3 border-b border-border">
                <span className="text-[13px] font-semibold">{month}</span>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-semibold text-accent mono-value">{f$(monthTotal)} €</span>
                  <button onClick={() => openAdd(month)} className="text-xs text-t-2 border border-border px-2.5 py-1 rounded-sm hover:bg-bg-4 transition-all cursor-pointer">+</button>
                </div>
              </div>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-bg-2">
                    <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium">Date</th>
                    <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium">Client</th>
                    <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium">Catégorie</th>
                    <th className="text-right px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium">Contracté</th>
                    <th className="text-right px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium">Encaissé</th>
                    <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium">Statut</th>
                    <th className="text-right px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium w-24">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => {
                    const isConfirmed = !e.status || e.status === 'confirmed';
                    return (
                      <tr key={i} className="border-b border-border hover:bg-white/[.02] transition-colors">
                        <td className="px-4 py-2.5 text-[13px]">{e.date || '—'}</td>
                        <td className="px-4 py-2.5 text-[13px] font-medium">{e.client || '—'}</td>
                        <td className="px-4 py-2.5"><span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-bg-4 text-t-2">{e.cat || '—'}</span></td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs mono-value">{f$(e.contracted || 0)} €</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold mono-value">{f$(e.cashed || 0)} €</td>
                        <td className="px-4 py-2.5">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLORS[e.status || 'confirmed']}`}>
                            {STATUS_LABELS[e.status || 'confirmed']}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex gap-1 justify-end">
                            {!isConfirmed && (
                              <button onClick={() => confirmEntry(month, i)} className="text-[11px] text-accent bg-accent/10 border border-accent/25 px-2 py-0.5 rounded cursor-pointer hover:bg-accent/20">✓</button>
                            )}
                            <button onClick={() => openEdit(month, i)} className="text-[11px] text-info bg-info/10 border border-info/25 px-2 py-0.5 rounded cursor-pointer hover:bg-info/20">Edit</button>
                            <button onClick={() => deleteEntry(month, i)} className="text-[11px] text-danger bg-danger/10 border border-danger/25 px-2 py-0.5 rounded cursor-pointer hover:bg-danger/20">✕</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-bg-2">
                    <td colSpan={3} className="px-4 py-2 font-bold text-[13px]">TOTAL {month}</td>
                    <td className="px-4 py-2 text-right font-mono font-bold text-xs mono-value">{f$(entries.reduce((s, e) => s + (e.contracted || 0), 0))} €</td>
                    <td className="px-4 py-2 text-right font-mono font-bold text-xs mono-value">{f$(monthTotal)} €</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          );
        })}

        {/* Charts */}
        <div className="grid grid-cols-2 gap-3 mb-5 max-lg:grid-cols-1">
          <div className="bg-bg-3 border border-border rounded-md p-4" style={{ height: 300 }}>
            <div className="text-[13px] font-semibold text-t-2 mb-4">Revenus par mois</div>
            <ResponsiveContainer width="100%" height="85%">
              <BarChart data={barData}>
                <CartesianGrid stroke="#1e1e2a" />
                <XAxis dataKey="name" tick={{ fill: '#52525b', fontSize: 11 }} />
                <YAxis tick={{ fill: '#52525b', fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <ReferenceLine y={obj} stroke="#ef4444" strokeDasharray="6 4" strokeWidth={2} />
                <Bar dataKey="Confirmé" fill="#10b981" radius={4} />
                <Bar dataKey="En attente" fill="#f59e0b" radius={4} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-bg-3 border border-border rounded-md p-4" style={{ height: 300 }}>
            <div className="text-[13px] font-semibold text-t-2 mb-4">Par catégorie</div>
            <ResponsiveContainer width="100%" height="85%">
              <PieChart>
                <Pie data={catTotals} dataKey="value" cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={2}>
                  {catTotals.map((_, i) => <Cell key={i} fill={REV_COLORS[i % REV_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${f$(Number(v))} €`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </>
    );
  };

  // ─── GLOBAL / ANNUAL VIEW ───
  const renderGlobal = () => {
    const rm = rev.months || {};
    const yearObj = obj * 12;
    let yearContracted = 0, yearCashed = 0;
    let prevCashed: number | null = null;

    const monthData = (MOIS_LIST as readonly string[]).map(m => {
      const me = rm[m] || [];
      const mc = me.reduce((s, e) => s + (e.contracted || 0), 0);
      const mk = me.reduce((s, e) => s + (e.cashed || 0), 0);
      yearContracted += mc;
      yearCashed += mk;
      const md = mk - obj;
      const mp = obj > 0 ? (mk / obj * 100) : 0;
      const vsM1 = prevCashed !== null ? (mk - prevCashed) : null;
      const hasData = me.length > 0;
      if (hasData) prevCashed = mk;
      return { name: m, contracted: mc, cashed: mk, delta: md, pct: mp, vsM1, hasData };
    });

    const yearPct = yearObj > 0 ? (yearCashed / yearObj * 100) : 0;
    const activeMonths = monthData.filter(m => m.hasData).length;
    const avg = activeMonths > 0 ? yearCashed / activeMonths : 0;
    const yearPL = yearCashed - yearObj;

    // Source summary
    const srcTotals: Record<string, number> = {};
    Object.values(rm).flat().forEach(e => { srcTotals[e.cat || 'Autre'] = (srcTotals[e.cat || 'Autre'] || 0) + (e.cashed || 0); });
    const srcEntries = Object.entries(srcTotals).sort((a, b) => b[1] - a[1]);

    // Bar chart data
    const evoData = (MOIS_LIST as readonly string[]).map(m => {
      const entries = rm[m] || [];
      return {
        name: m.slice(0, 3),
        Encaissé: entries.reduce((s, e) => s + (e.cashed || 0), 0),
        Contracté: entries.reduce((s, e) => s + (e.contracted || 0), 0),
      };
    });

    // Quarterly
    const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
    const qData = quarters.map((q, qi) => {
      const ms = (MOIS_LIST as readonly string[]).slice(qi * 3, qi * 3 + 3);
      const total = ms.reduce((s, m) => s + (rm[m] || []).reduce((s2, e) => s2 + (e.cashed || 0), 0), 0);
      return { name: q, Encaissé: total };
    });
    const qObj = obj * 3;

    return (
      <>
        {/* Grand KPIs */}
        <div className="grid grid-cols-5 gap-3 mb-5 max-lg:grid-cols-3 max-md:grid-cols-1">
          <KpiCard label="Total encaissé" value={`${f$(yearCashed)} €`} accentColor="#10b981" />
          <KpiCard label="Objectif annuel" value={`${f$(yearObj)} €`} accentColor="#3b82f6" />
          <KpiCard label={yearPL >= 0 ? 'Surplus' : 'Reste à atteindre'} value={`${yearPL >= 0 ? '+' : ''}${f$(yearPL)} €`} accentColor={yearPL >= 0 ? '#10b981' : '#ef4444'} />
          <KpiCard label="Atteinte" value={`${yearPct.toFixed(0)}%`} accentColor={yearPct >= 100 ? '#10b981' : '#f59e0b'} />
          <KpiCard label="Moyenne/mois" value={`${f$(avg)} €`} accentColor="#8b5cf6" />
        </div>

        {/* Objectif inputs */}
        <div className="grid grid-cols-2 gap-3 mb-5 max-md:grid-cols-1">
          <div className="bg-bg-3 border border-border rounded-md p-4">
            <label className="block text-[10px] text-t-3 uppercase tracking-wider font-medium mb-1.5">Objectif mensuel (€)</label>
            <input type="number" className="fi" value={rev.objectif} onChange={e => updateObjectif(parseFloat(e.target.value) || 0)} step="100" />
          </div>
          <div className="bg-bg-3 border border-border rounded-md p-4">
            <label className="block text-[10px] text-t-3 uppercase tracking-wider font-medium mb-1.5">Objectif annuel (€)</label>
            <div className="fi bg-bg-2 text-t-2 flex items-center font-mono">{f$(yearObj)} €</div>
          </div>
        </div>

        {/* Source summary */}
        {srcEntries.length > 0 && (
          <div className="bg-bg-3 border border-border rounded-md p-4 mb-5">
            <div className="text-[10px] text-t-3 uppercase tracking-wider font-medium mb-3">Par source</div>
            {srcEntries.map(([cat, val]) => (
              <div key={cat} className="flex justify-between items-center py-2 border-b border-border last:border-0">
                <span className="text-xs text-t-1 font-medium">{cat}</span>
                <span className="font-mono text-[13px] mono-value">{f$(val)} €</span>
              </div>
            ))}
          </div>
        )}

        {/* Annual table */}
        <div className="bg-bg-3 border border-border rounded-md overflow-hidden mb-5">
          <div className="px-4 py-3 border-b border-border">
            <span className="text-[13px] font-semibold">Récap annuel</span>
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-bg-2">
                <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium">Mois</th>
                <th className="text-right px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium">Objectif</th>
                <th className="text-right px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium">Contracté</th>
                <th className="text-right px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium">Encaissé</th>
                <th className="text-right px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium">Delta</th>
                <th className="text-right px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium">%</th>
                <th className="text-right px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium">vs M-1</th>
              </tr>
            </thead>
            <tbody>
              {monthData.filter(m => m.hasData).map(m => (
                <tr key={m.name} className="border-b border-border hover:bg-white/[.02] cursor-pointer" onClick={() => { setCurTab(m.name); setPage('tracker'); }}>
                  <td className="px-4 py-2.5 text-[13px] font-semibold text-accent">{m.name}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs mono-value">{f$(obj)} €</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs mono-value">{f$(m.contracted)} €</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs mono-value">{f$(m.cashed)} €</td>
                  <td className={`px-4 py-2.5 text-right font-mono text-xs font-semibold mono-value ${m.delta >= 0 ? 'text-accent' : 'text-danger'}`}>{m.delta >= 0 ? '+' : ''}{f$(m.delta)} €</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${m.pct >= 100 ? 'text-accent bg-accent/10 border-accent/25' : 'text-danger bg-danger/10 border-danger/25'}`}>{m.pct.toFixed(0)}%</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {m.vsM1 !== null ? (
                      <span className={`font-mono text-xs font-semibold mono-value ${m.vsM1 >= 0 ? 'text-accent' : 'text-danger'}`}>{m.vsM1 >= 0 ? '+' : ''}{f$(m.vsM1)} €</span>
                    ) : '—'}
                  </td>
                </tr>
              ))}
              {monthData.filter(m => m.hasData).length === 0 && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-t-3 text-sm">Pas encore de données</td></tr>
              )}
            </tbody>
            {yearCashed > 0 && (
              <tfoot>
                <tr className="bg-bg-2">
                  <td className="px-4 py-2.5 font-bold text-[13px]">TOTAL ANNUEL</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-xs mono-value">{f$(yearObj)} €</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-xs mono-value">{f$(yearContracted)} €</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-xs mono-value">{f$(yearCashed)} €</td>
                  <td className={`px-4 py-2.5 text-right font-mono font-bold text-xs mono-value ${yearPL >= 0 ? 'text-accent' : 'text-danger'}`}>{yearPL >= 0 ? '+' : ''}{f$(yearPL)} €</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${yearPct >= 100 ? 'text-accent bg-accent/10 border-accent/25' : 'text-danger bg-danger/10 border-danger/25'}`}>{yearPct.toFixed(0)}%</span>
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-2 gap-3 mb-5 max-lg:grid-cols-1">
          <div className="bg-bg-3 border border-border rounded-md p-4" style={{ height: 300 }}>
            <div className="text-[13px] font-semibold text-t-2 mb-4">Évolution mensuelle</div>
            <ResponsiveContainer width="100%" height="85%">
              <BarChart data={evoData}>
                <CartesianGrid stroke="#1e1e2a" />
                <XAxis dataKey="name" tick={{ fill: '#52525b', fontSize: 11 }} />
                <YAxis tick={{ fill: '#52525b', fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <ReferenceLine y={obj} stroke="#ef4444" strokeDasharray="6 4" strokeWidth={2} />
                <Bar dataKey="Encaissé" fill="rgba(16,185,129,.5)" radius={4} />
                <Bar dataKey="Contracté" fill="rgba(59,130,246,.3)" radius={4} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-bg-3 border border-border rounded-md p-4" style={{ height: 300 }}>
            <div className="text-[13px] font-semibold text-t-2 mb-4">Par trimestre</div>
            <ResponsiveContainer width="100%" height="85%">
              <BarChart data={qData}>
                <CartesianGrid stroke="#1e1e2a" />
                <XAxis dataKey="name" tick={{ fill: '#52525b', fontSize: 11 }} />
                <YAxis tick={{ fill: '#52525b', fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <ReferenceLine y={qObj} stroke="#ef4444" strokeDasharray="6 4" strokeWidth={2} />
                <Bar dataKey="Encaissé" fill="rgba(139,92,246,.5)" radius={6} barSize={50} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {srcEntries.length > 0 && (
          <div className="bg-bg-3 border border-border rounded-md p-4 mb-5" style={{ height: 280 }}>
            <div className="text-[13px] font-semibold text-t-2 mb-4">Répartition annuelle par source</div>
            <ResponsiveContainer width="100%" height="85%">
              <PieChart>
                <Pie data={srcEntries.map(([name, value]) => ({ name, value }))} dataKey="value" cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={2}>
                  {srcEntries.map((_, i) => <Cell key={i} fill={REV_COLORS[i % REV_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${f$(Number(v))} €`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Categories management */}
        <div className="bg-bg-3 border border-border rounded-md p-4 mb-5">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[13px] font-semibold">Catégories</span>
            <button onClick={addCategory} className="text-xs text-t-2 border border-border px-2.5 py-1 rounded-sm hover:bg-bg-4 transition-all cursor-pointer">+ Ajouter</button>
          </div>
          <div className="flex gap-2 flex-wrap">
            {(rev.categories || []).map((c, i) => (
              <span key={i} className="text-[11px] font-semibold px-3 py-1 rounded-full bg-bg-4 text-t-2 border border-border">{c}</span>
            ))}
          </div>
        </div>
      </>
    );
  };

  return (
    <div>
      <PageHeader breadcrumb={[{ label: activeSpace.name }, { label: 'Revenus', current: true }]} title="Revenus" subtitle="Suivi des revenus par mois">
        <div className="flex items-center gap-2">
          <div className="flex bg-bg-3 border border-border rounded-md overflow-hidden">
            <button onClick={() => setPage('tracker')} className={`px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${page === 'tracker' ? 'bg-bg-4 text-t-1' : 'text-t-3 hover:text-t-2'}`}>Tracker</button>
            <button onClick={() => setPage('global')} className={`px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${page === 'global' ? 'bg-bg-4 text-t-1' : 'text-t-3 hover:text-t-2'}`}>Global</button>
          </div>
          <button onClick={() => openAdd()} className="px-4 py-2 bg-accent text-black font-semibold text-sm rounded-sm hover:opacity-90 transition-all flex items-center gap-2 cursor-pointer">
            + Nouveau revenu
          </button>
        </div>
      </PageHeader>

      {page === 'tracker' ? renderTracker() : renderGlobal()}

      {/* Add/Edit Modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={editIdx ? 'Modifier un revenu' : 'Ajouter un revenu'}>
        <div className="space-y-3.5">
          <FormField label="Mois">
            <select className="fi" value={formMonth} onChange={e => setFormMonth(e.target.value)}>
              <option value="">---</option>
              {(MOIS_LIST as readonly string[]).map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </FormField>
          <FormField label="Date">
            <input className="fi" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          </FormField>
          <FormField label="Client">
            <input className="fi" value={form.client} onChange={e => setForm({ ...form, client: e.target.value })} placeholder="Ex: Client A" />
          </FormField>
          <FormField label="Catégorie">
            <select className="fi" value={form.cat} onChange={e => setForm({ ...form, cat: e.target.value })}>
              <option value="">—</option>
              {(rev.categories || []).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Contracté (EUR)">
              <input className="fi" type="number" value={form.contracted || ''} onChange={e => setForm({ ...form, contracted: parseFloat(e.target.value) || 0 })} step="0.01" />
            </FormField>
            <FormField label="Encaissé (EUR)">
              <input className="fi" type="number" value={form.cashed || ''} onChange={e => setForm({ ...form, cashed: parseFloat(e.target.value) || 0 })} step="0.01" />
            </FormField>
          </div>
          <FormField label="Taux EUR/AED">
            <input className="fi" type="number" value={form.rate} onChange={e => setForm({ ...form, rate: parseFloat(e.target.value) || 0 })} step="0.0001" />
          </FormField>
          <FormField label="Statut">
            <select className="fi" value={form.status} onChange={e => setForm({ ...form, status: e.target.value as RevenuEntry['status'] })}>
              <option value="confirmed">Confirmé</option>
              <option value="pending">En attente</option>
              <option value="preview">Prévision</option>
            </select>
          </FormField>
          <FormField label="Commentaire">
            <input className="fi" value={form.comment} onChange={e => setForm({ ...form, comment: e.target.value })} placeholder="Optionnel" />
          </FormField>
          <div className="flex gap-2.5 mt-5">
            <button onClick={saveEntry} className="px-4 py-2 bg-accent text-black font-semibold text-sm rounded-sm cursor-pointer hover:opacity-90">{editIdx ? 'Modifier' : 'Ajouter'}</button>
            <button onClick={() => setAddOpen(false)} className="px-4 py-2 border border-border text-t-2 text-sm rounded-sm cursor-pointer hover:bg-bg-3">Annuler</button>
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
