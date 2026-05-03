'use client';

import { useState, useMemo } from 'react';
import { useApp } from '@/context/AppProvider';
import PageHeader from '@/components/layout/PageHeader';
import Modal from '@/components/ui/Modal';
import { f$ } from '@/lib/utils';
import { MOIS_LIST, REV_COLORS } from '@/lib/constants';
import { RevenuEntry } from '@/lib/types';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, ReferenceLine,
} from 'recharts';

const tooltipStyle = { background: '#1c1c23', border: '1px solid #2a2a3a', borderRadius: 8 };

/** Small KPI card with emoji icon (matches old HTML "solde-card" pattern) */
function RevKpi({
  icon, label, value, sub, valueColor, accentColor,
}: {
  icon: string; label: string; value: string; sub?: React.ReactNode;
  valueColor?: string; accentColor?: string;
}) {
  return (
    <div className="bg-bg-3 border border-border rounded-lg px-4 py-3.5 flex items-center gap-3 transition-all hover:border-border-2 shadow-inset-border relative overflow-hidden animate-fade-up">
      {accentColor && (
        <div
          className="absolute top-0 left-0 right-0 h-[2px] opacity-80"
          style={{ background: `linear-gradient(90deg, ${accentColor}, transparent)` }}
        />
      )}
      <div className="text-[20px] leading-none flex-shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[9px] text-t-3 uppercase tracking-[0.14em] font-semibold">{label}</div>
        <div
          className="hero-num text-[18px] mt-1 mono-value leading-none"
          style={{ fontWeight: 500, letterSpacing: '-0.4px', color: valueColor || '#fafafa' }}
        >{value}</div>
        {sub && <div className="text-[10px] mt-1 font-mono mono-value">{sub}</div>}
      </div>
    </div>
  );
}

/** Category pill — color cycles through REV_COLORS based on category index */
function CatPill({ cat, categories }: { cat: string; categories: string[] }) {
  if (!cat) return <span className="text-t-4 text-[11px]">—</span>;
  const idx = categories.indexOf(cat);
  const color = REV_COLORS[(idx >= 0 ? idx : 0) % REV_COLORS.length];
  return (
    <span
      className="inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full"
      style={{ background: `${color}22`, color }}
    >
      {cat}
    </span>
  );
}

/** Tiny status badge: CONFIRMÉ (green), PRÉVISION (blue), EN ATTENTE (amber) */
function StatusBadge({ status }: { status?: RevenuEntry['status'] }) {
  const s = status || 'confirmed';
  const map = {
    confirmed: { lbl: 'CONFIRMÉ', cls: 'text-accent bg-accent/10' },
    preview:   { lbl: 'PRÉVISION', cls: 'text-info bg-info/10' },
    pending:   { lbl: 'EN ATTENTE', cls: 'text-warning bg-warning/10' },
  } as const;
  const m = map[s];
  return (
    <span className={`text-[9px] font-semibold tracking-[0.05em] px-1.5 py-[2px] rounded ${m.cls}`}>
      {m.lbl}
    </span>
  );
}

const STATUS_ROW_BORDER: Record<string, string> = {
  confirmed: 'border-l-[3px] border-l-accent',
  preview: 'border-l-[3px] border-l-info opacity-70',
  pending: 'border-l-[3px] border-l-warning opacity-60 bg-warning/5',
};

export default function RevenusPage() {
  const { state, setState, save, liveRate, activeSpace } = useApp();
  const rev = state.revenus || { objectif: 5000, categories: [], months: {} };

  const [page, setPage] = useState<'tracker' | 'global'>('tracker');
  const [addOpen, setAddOpen] = useState(false);
  const [editIdx, setEditIdx] = useState<{ month: string; idx: number } | null>(null);
  const [curTab, setCurTab] = useState<string>('');
  const [form, setForm] = useState<RevenuEntry>({ date: '', client: '', cat: '', contracted: 0, cashed: 0, comment: '', rate: liveRate, status: 'confirmed' });
  const [formMonth, setFormMonth] = useState('');

  const orderedMonths = useMemo(() => {
    const existing = Object.keys(rev.months || {});
    return MOIS_LIST.filter(m => existing.includes(m));
  }, [rev.months]);

  const effectiveTab = curTab || orderedMonths[orderedMonths.length - 1] || '';

  const categories = rev.categories || [];

  // Actions
  const openAdd = (month?: string) => {
    setForm({ date: '', client: '', cat: categories[0] || '', contracted: 0, cashed: 0, comment: '', rate: liveRate, status: 'confirmed' });
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
    if (!cat || categories.includes(cat.trim())) return;
    setState({ ...state, revenus: { ...rev, categories: [...categories, cat.trim()] } });
    save();
  };

  const removeCategory = (cat: string) => {
    if (!confirm(`Supprimer la catégorie "${cat}" ?`)) return;
    setState({ ...state, revenus: { ...rev, categories: categories.filter(c => c !== cat) } });
    save();
  };

  const obj = rev.objectif || 5000;

  // ─── TRACKER VIEW ───
  const renderTracker = () => {
    const curMonthName = effectiveTab;
    const curEntries = rev.months[curMonthName] || [];

    // Per-month aggregates (matches old HTML logic)
    const monthCashed = curEntries
      .filter(e => !e.status || e.status === 'confirmed')
      .reduce((s, e) => s + (e.cashed || 0), 0);
    const monthContracted = curEntries.reduce((s, e) => s + (e.contracted || 0), 0);
    const monthPreview = curEntries
      .filter(e => e.status === 'preview')
      .reduce((s, e) => s + (e.cashed || 0), 0);
    const delta = monthCashed - obj;
    const pctMonth = obj > 0 ? (monthCashed / obj) * 100 : 0;

    // Bar chart for monthly tracker view (whole year)
    const barData = MOIS_LIST.map(month => {
      const entries = rev.months[month] || [];
      const confirmed = entries.filter(e => !e.status || e.status === 'confirmed').reduce((s, e) => s + (e.cashed || 0), 0);
      const pending = entries.filter(e => e.status === 'pending').reduce((s, e) => s + (e.cashed || 0), 0);
      return { name: month.slice(0, 3), Confirmé: confirmed, 'En attente': pending };
    });

    // Cat totals for current month (inline — cheap)
    const catMap: Record<string, number> = {};
    curEntries.forEach(e => {
      if (!e.status || e.status === 'confirmed') {
        catMap[e.cat || 'Autre'] = (catMap[e.cat || 'Autre'] || 0) + (e.cashed || 0);
      }
    });
    const catTotalsMonth = Object.entries(catMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

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

        {/* KPIs — matches old HTML order: Objectif, Encaissé, Contracté, Delta, Atteinte */}
        <div className="grid grid-cols-5 gap-3 mb-5 max-lg:grid-cols-3 max-md:grid-cols-1">
          <RevKpi icon="🎯" label="Objectif" value={`${f$(obj)} €`} />
          <RevKpi
            icon="💰"
            label="Encaissé (Confirmé)"
            value={`${f$(monthCashed)} €`}
            valueColor="#10b981"
            accentColor="#10b981"
            sub={monthPreview > 0 ? <span className="text-info">+ {f$(monthPreview)} € en prévision</span> : undefined}
          />
          <RevKpi icon="📝" label="Contracté" value={`${f$(monthContracted)} €`} />
          <RevKpi
            icon={delta >= 0 ? '✅' : '⚠️'}
            label="Delta"
            value={`${delta >= 0 ? '+' : ''}${f$(delta)} €`}
            valueColor={delta >= 0 ? '#10b981' : '#ef4444'}
            accentColor={delta >= 0 ? '#10b981' : '#ef4444'}
          />
          <RevKpi
            icon="📊"
            label="Atteinte"
            value={`${pctMonth.toFixed(0)}%`}
            valueColor={pctMonth >= 100 ? '#10b981' : '#f59e0b'}
            accentColor={pctMonth >= 100 ? '#10b981' : '#f59e0b'}
          />
        </div>

        {/* Transactions table for current month */}
        {curEntries.length > 0 ? (
          <div className="bg-bg-3 border border-border rounded-lg overflow-hidden mb-4 shadow-inset-border">
            <div className="flex justify-between items-center px-4 py-3 border-b border-border">
              <span className="text-[13px] font-semibold tracking-tight">💰 Transactions du mois</span>
              <div className="flex items-center gap-3">
                <span className="hero-num text-[14px] font-mono text-accent mono-value" style={{ fontWeight: 500, letterSpacing: '-0.3px' }}>{f$(monthCashed)} €</span>
                <button onClick={() => openAdd(curMonthName)} className="btn btn-ghost !py-1 !px-2.5 !text-[11px]">+</button>
              </div>
            </div>
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-bg-2">
                  <th className="text-left px-4 py-2 text-[10px] uppercase tracking-[0.12em] text-t-3 font-semibold">Date</th>
                  <th className="text-left px-4 py-2 text-[10px] uppercase tracking-[0.12em] text-t-3 font-semibold">Client</th>
                  <th className="text-left px-4 py-2 text-[10px] uppercase tracking-[0.12em] text-t-3 font-semibold">Catégorie</th>
                  <th className="text-right px-4 py-2 text-[10px] uppercase tracking-[0.12em] text-t-3 font-semibold">€ Contracté</th>
                  <th className="text-right px-4 py-2 text-[10px] uppercase tracking-[0.12em] text-t-3 font-semibold">€ Encaissé</th>
                  <th className="text-left px-4 py-2 text-[10px] uppercase tracking-[0.12em] text-t-3 font-semibold">Commentaire</th>
                  <th className="text-right px-4 py-2 text-[10px] uppercase tracking-[0.12em] text-t-3 font-semibold w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {curEntries.map((e, i) => {
                  const status = e.status || 'confirmed';
                  const isConfirmed = status === 'confirmed';
                  const cashedColor = status === 'preview' ? 'text-info' : status === 'pending' ? 'text-warning' : 'text-accent';
                  return (
                    <tr key={i} className={`border-b border-border tr-hover transition-colors ${STATUS_ROW_BORDER[status]}`}>
                      <td className="px-4 py-2.5 text-[12px] text-t-2">{e.date || '—'}</td>
                      <td className="px-4 py-2.5 text-[13px] font-semibold tracking-tight">
                        <span>{e.client || '—'}</span>
                        <StatusBadge status={status} />
                      </td>
                      <td className="px-4 py-2.5"><CatPill cat={e.cat} categories={categories} /></td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs mono-value text-t-2">{f$(e.contracted || 0)} €</td>
                      <td className={`px-4 py-2.5 text-right font-mono text-xs font-semibold mono-value ${cashedColor}`}>{f$(e.cashed || 0)} €</td>
                      <td className="px-4 py-2.5 text-[12px] text-t-3 truncate max-w-[180px]">{e.comment || '—'}</td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex gap-1 justify-end">
                          {!isConfirmed && (
                            <button onClick={() => confirmEntry(curMonthName, i)} className="text-[11px] text-accent bg-accent/10 border border-accent/25 px-2 py-0.5 rounded cursor-pointer hover:bg-accent/20 transition-all" title="Confirmer">✓</button>
                          )}
                          <button onClick={() => openEdit(curMonthName, i)} className="text-[11px] text-info bg-info/10 border border-info/25 px-2 py-0.5 rounded cursor-pointer hover:bg-info/20 transition-all" title="Modifier">✎</button>
                          <button onClick={() => deleteEntry(curMonthName, i)} className="text-[11px] text-danger bg-danger/10 border border-danger/25 px-2 py-0.5 rounded cursor-pointer hover:bg-danger/20 transition-all" title="Supprimer">✕</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-bg-2">
                  <td colSpan={3} className="px-4 py-2.5 font-bold text-[12px] tracking-tight">TOTAL {curMonthName}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-xs mono-value">{f$(monthContracted)} €</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-xs mono-value text-accent">{f$(monthCashed)} €</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="bg-bg-3 border border-border rounded-lg p-8 text-center text-t-3 text-sm mb-4">
            Aucune transaction pour {curMonthName || 'ce mois'}. Cliquez sur «+ Nouveau revenu» pour commencer.
          </div>
        )}

        {/* Charts */}
        <div className="grid grid-cols-2 gap-3 mb-5 max-lg:grid-cols-1">
          <div className="bg-bg-3 border border-border rounded-lg p-4 shadow-inset-border" style={{ height: 300 }}>
            <div className="text-[13px] font-semibold text-t-2 mb-4 tracking-tight">Revenus par mois</div>
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
          <div className="bg-bg-3 border border-border rounded-lg p-4 shadow-inset-border" style={{ height: 300 }}>
            <div className="text-[13px] font-semibold text-t-2 mb-4 tracking-tight">Par catégorie ({curMonthName})</div>
            <ResponsiveContainer width="100%" height="85%">
              <PieChart>
                <Pie data={catTotalsMonth} dataKey="value" cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={2}>
                  {catTotalsMonth.map((entry, i) => {
                    const idx = categories.indexOf(entry.name);
                    return <Cell key={i} fill={REV_COLORS[(idx >= 0 ? idx : i) % REV_COLORS.length]} />;
                  })}
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
      const mk = me.filter(e => !e.status || e.status === 'confirmed').reduce((s, e) => s + (e.cashed || 0), 0);
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
    Object.values(rm).flat().forEach(e => {
      if (!e.status || e.status === 'confirmed') {
        srcTotals[e.cat || 'Autre'] = (srcTotals[e.cat || 'Autre'] || 0) + (e.cashed || 0);
      }
    });
    const srcEntries = Object.entries(srcTotals).sort((a, b) => b[1] - a[1]);

    // Bar chart data
    const evoData = (MOIS_LIST as readonly string[]).map(m => {
      const entries = rm[m] || [];
      return {
        name: m.slice(0, 3),
        Encaissé: entries.filter(e => !e.status || e.status === 'confirmed').reduce((s, e) => s + (e.cashed || 0), 0),
        Contracté: entries.reduce((s, e) => s + (e.contracted || 0), 0),
      };
    });

    // Quarterly
    const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
    const qData = quarters.map((q, qi) => {
      const ms = (MOIS_LIST as readonly string[]).slice(qi * 3, qi * 3 + 3);
      const total = ms.reduce((s, m) => s + (rm[m] || []).filter(e => !e.status || e.status === 'confirmed').reduce((s2, e) => s2 + (e.cashed || 0), 0), 0);
      return { name: q, Encaissé: total };
    });
    const qObj = obj * 3;

    return (
      <>
        {/* Settings + Annual Summary side by side (matches old HTML) */}
        <div className="grid grid-cols-2 gap-3 mb-5 max-lg:grid-cols-1">
          {/* Settings card */}
          <div className="bg-bg-3 border border-border rounded-lg p-5 shadow-inset-border">
            <div className="text-[13px] font-semibold tracking-tight mb-4">⚙️ Paramètres Revenus</div>
            <div className="space-y-3.5">
              <div>
                <label className="block text-[10px] text-t-3 uppercase tracking-[0.12em] font-semibold mb-1.5">Objectif mensuel (€)</label>
                <input type="number" className="fi" value={rev.objectif} onChange={e => updateObjectif(parseFloat(e.target.value) || 0)} step="100" />
              </div>
              <div>
                <label className="block text-[10px] text-t-3 uppercase tracking-[0.12em] font-semibold mb-1.5">Objectif annuel (€)</label>
                <div className="fi bg-bg-2 text-t-2 flex items-center font-mono mono-value">{f$(yearObj)} €</div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-[10px] text-t-3 uppercase tracking-[0.12em] font-semibold">Catégories</label>
                  <button onClick={addCategory} className="btn btn-ghost !py-1 !px-2 !text-[10px]">+ Ajouter</button>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {categories.length === 0 && <span className="text-[11px] text-t-4 italic">Aucune catégorie</span>}
                  {categories.map((c, i) => {
                    const color = REV_COLORS[i % REV_COLORS.length];
                    return (
                      <span
                        key={c}
                        className="group inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full cursor-default"
                        style={{ background: `${color}22`, color }}
                      >
                        {c}
                        <button onClick={() => removeCategory(c)} className="opacity-0 group-hover:opacity-100 hover:text-danger transition-all leading-none">×</button>
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Annual Summary card */}
          <div className="bg-bg-3 border border-border rounded-lg p-5 shadow-inset-border">
            <div className="text-[13px] font-semibold tracking-tight mb-4">📊 Résumé annuel {new Date().getFullYear()}</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-4">
              <div>
                <div className="text-[9px] text-t-3 uppercase tracking-[0.12em] font-semibold">Total encaissé</div>
                <div className="hero-num text-[18px] mt-1 mono-value text-accent" style={{ fontWeight: 500, letterSpacing: '-0.4px' }}>{f$(yearCashed)} €</div>
              </div>
              <div>
                <div className="text-[9px] text-t-3 uppercase tracking-[0.12em] font-semibold">Objectif annuel</div>
                <div className="hero-num text-[18px] mt-1 mono-value text-t-1" style={{ fontWeight: 500, letterSpacing: '-0.4px' }}>{f$(yearObj)} €</div>
              </div>
              <div>
                <div className="text-[9px] text-t-3 uppercase tracking-[0.12em] font-semibold">{yearPL >= 0 ? 'Surplus' : 'Reste à atteindre'}</div>
                <div className={`hero-num text-[18px] mt-1 mono-value ${yearPL >= 0 ? 'text-accent' : 'text-danger'}`} style={{ fontWeight: 500, letterSpacing: '-0.4px' }}>
                  {yearPL >= 0 ? '+' : ''}{f$(yearPL)} €
                </div>
              </div>
              <div>
                <div className="text-[9px] text-t-3 uppercase tracking-[0.12em] font-semibold">Atteinte</div>
                <div className="hero-num text-[18px] mt-1 mono-value" style={{ fontWeight: 500, letterSpacing: '-0.4px', color: yearPct >= 100 ? '#10b981' : '#f59e0b' }}>
                  {yearPct.toFixed(0)}%
                </div>
              </div>
              <div className="col-span-2">
                <div className="text-[9px] text-t-3 uppercase tracking-[0.12em] font-semibold">Moyenne / mois actif</div>
                <div className="hero-num text-[18px] mt-1 mono-value text-purple" style={{ fontWeight: 500, letterSpacing: '-0.4px' }}>{f$(avg)} €</div>
              </div>
            </div>

            {/* Source list */}
            {srcEntries.length > 0 && (
              <div className="mt-5 pt-4 border-t border-border">
                <div className="text-[9px] text-t-3 uppercase tracking-[0.12em] font-semibold mb-2.5">Par source</div>
                <div className="space-y-1.5">
                  {srcEntries.map(([cat, val]) => {
                    const idx = categories.indexOf(cat);
                    const color = REV_COLORS[(idx >= 0 ? idx : 0) % REV_COLORS.length];
                    return (
                      <div key={cat} className="flex justify-between items-center py-1">
                        <span className="flex items-center gap-2 text-[12px] text-t-1 font-medium tracking-tight">
                          <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                          {cat}
                        </span>
                        <span className="font-mono text-[12px] mono-value text-t-2">{f$(val)} €</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Annual table */}
        <div className="bg-bg-3 border border-border rounded-lg overflow-hidden mb-5 shadow-inset-border">
          <div className="px-4 py-3 border-b border-border">
            <span className="text-[13px] font-semibold tracking-tight">📅 Vue Globale — Mois par mois</span>
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-bg-2">
                <th className="text-left px-4 py-2 text-[10px] uppercase tracking-[0.12em] text-t-3 font-semibold">Mois</th>
                <th className="text-right px-4 py-2 text-[10px] uppercase tracking-[0.12em] text-t-3 font-semibold">Objectif</th>
                <th className="text-right px-4 py-2 text-[10px] uppercase tracking-[0.12em] text-t-3 font-semibold">Contracté</th>
                <th className="text-right px-4 py-2 text-[10px] uppercase tracking-[0.12em] text-t-3 font-semibold">Encaissé</th>
                <th className="text-right px-4 py-2 text-[10px] uppercase tracking-[0.12em] text-t-3 font-semibold">Delta</th>
                <th className="text-right px-4 py-2 text-[10px] uppercase tracking-[0.12em] text-t-3 font-semibold">%</th>
                <th className="text-right px-4 py-2 text-[10px] uppercase tracking-[0.12em] text-t-3 font-semibold">vs M-1</th>
              </tr>
            </thead>
            <tbody>
              {monthData.filter(m => m.hasData).map(m => (
                <tr key={m.name} className="border-b border-border tr-hover cursor-pointer transition-colors" onClick={() => { setCurTab(m.name); setPage('tracker'); }}>
                  <td className="px-4 py-2.5 text-[13px] font-semibold text-accent tracking-tight">{m.name}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs mono-value text-t-2">{f$(obj)} €</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs mono-value">{f$(m.contracted)} €</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs mono-value font-semibold">{f$(m.cashed)} €</td>
                  <td className={`px-4 py-2.5 text-right font-mono text-xs font-semibold mono-value ${m.delta >= 0 ? 'text-accent' : 'text-danger'}`}>{m.delta >= 0 ? '+' : ''}{f$(m.delta)} €</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${m.pct >= 100 ? 'text-accent bg-accent/10 border-accent/25' : 'text-warning bg-warning/10 border-warning/25'}`}>{m.pct.toFixed(0)}%</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {m.vsM1 !== null ? (
                      <span className={`font-mono text-xs font-semibold mono-value ${m.vsM1 >= 0 ? 'text-accent' : 'text-danger'}`}>{m.vsM1 >= 0 ? '+' : ''}{f$(m.vsM1)} €</span>
                    ) : <span className="text-t-4">—</span>}
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
                  <td className="px-4 py-2.5 font-bold text-[12px] tracking-tight">TOTAL {new Date().getFullYear()}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-xs mono-value">{f$(yearObj)} €</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-xs mono-value">{f$(yearContracted)} €</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-xs mono-value text-accent">{f$(yearCashed)} €</td>
                  <td className={`px-4 py-2.5 text-right font-mono font-bold text-xs mono-value ${yearPL >= 0 ? 'text-accent' : 'text-danger'}`}>{yearPL >= 0 ? '+' : ''}{f$(yearPL)} €</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${yearPct >= 100 ? 'text-accent bg-accent/10 border-accent/25' : 'text-warning bg-warning/10 border-warning/25'}`}>{yearPct.toFixed(0)}%</span>
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-2 gap-3 mb-5 max-lg:grid-cols-1">
          <div className="bg-bg-3 border border-border rounded-lg p-4 shadow-inset-border" style={{ height: 300 }}>
            <div className="text-[13px] font-semibold text-t-2 mb-4 tracking-tight">Encaissé vs Objectif</div>
            <ResponsiveContainer width="100%" height="85%">
              <BarChart data={evoData}>
                <CartesianGrid stroke="#1e1e2a" />
                <XAxis dataKey="name" tick={{ fill: '#52525b', fontSize: 11 }} />
                <YAxis tick={{ fill: '#52525b', fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <ReferenceLine y={obj} stroke="#ef4444" strokeDasharray="6 4" strokeWidth={2} />
                <Bar dataKey="Encaissé" fill="rgba(16,185,129,.6)" radius={4} />
                <Bar dataKey="Contracté" fill="rgba(59,130,246,.35)" radius={4} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-bg-3 border border-border rounded-lg p-4 shadow-inset-border" style={{ height: 300 }}>
            <div className="text-[13px] font-semibold text-t-2 mb-4 tracking-tight">Répartition annuelle par source</div>
            {srcEntries.length > 0 ? (
              <ResponsiveContainer width="100%" height="85%">
                <PieChart>
                  <Pie data={srcEntries.map(([name, value]) => ({ name, value }))} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2}>
                    {srcEntries.map(([name], i) => {
                      const idx = categories.indexOf(name);
                      return <Cell key={i} fill={REV_COLORS[(idx >= 0 ? idx : i) % REV_COLORS.length]} />;
                    })}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${f$(Number(v))} €`} />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="text-center text-t-4 text-sm pt-12">Aucune source</div>}
          </div>
        </div>

        {/* Quarterly chart */}
        <div className="bg-bg-3 border border-border rounded-lg p-4 mb-5 shadow-inset-border" style={{ height: 280 }}>
          <div className="text-[13px] font-semibold text-t-2 mb-4 tracking-tight">Évolution trimestrielle</div>
          <ResponsiveContainer width="100%" height="85%">
            <BarChart data={qData}>
              <CartesianGrid stroke="#1e1e2a" />
              <XAxis dataKey="name" tick={{ fill: '#52525b', fontSize: 11 }} />
              <YAxis tick={{ fill: '#52525b', fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <ReferenceLine y={qObj} stroke="#ef4444" strokeDasharray="6 4" strokeWidth={2} />
              <Bar dataKey="Encaissé" fill="rgba(139,92,246,.55)" radius={6} barSize={60} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </>
    );
  };

  return (
    <div>
      <PageHeader breadcrumb={[{ label: activeSpace.name }, { label: 'Revenus', current: true }]} title="Revenus" subtitle="Suivi des revenus par source">
        <div className="flex items-center gap-2">
          <div className="flex bg-bg-3 border border-border rounded-md overflow-hidden p-0.5 gap-0.5">
            <button onClick={() => setPage('tracker')} className={`px-3.5 py-1.5 text-xs font-semibold rounded transition-all cursor-pointer ${page === 'tracker' ? 'bg-bg-4 text-t-1 shadow-sm' : 'text-t-3 hover:text-t-2'}`}>Tracker</button>
            <button onClick={() => setPage('global')} className={`px-3.5 py-1.5 text-xs font-semibold rounded transition-all cursor-pointer ${page === 'global' ? 'bg-bg-4 text-t-1 shadow-sm' : 'text-t-3 hover:text-t-2'}`}>Global</button>
          </div>
          <button onClick={() => openAdd()} className="btn btn-primary">
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
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
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
            <button onClick={saveEntry} className="btn btn-primary">{editIdx ? 'Modifier' : 'Ajouter'}</button>
            <button onClick={() => setAddOpen(false)} className="btn btn-ghost">Annuler</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] text-t-3 uppercase tracking-[0.12em] font-semibold mb-1.5">{label}</label>
      {children}
    </div>
  );
}
