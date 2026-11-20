'use client';

import { useState, useMemo } from 'react';
import { useApp } from '@/context/AppProvider';
import PageHeader from '@/components/layout/PageHeader';
import MobileRevenus from '@/components/mobile/MobileRevenus';
import { useIsMobile } from '@/lib/useIsMobile';
import Modal from '@/components/ui/Modal';
import RankedBars from '@/components/ui/RankedBars';
import { f$, f0, sameWeekdayDatesInMonth, todayISO } from '@/lib/utils';
import { useRevenus } from '@/lib/useRevenus';
import RecurringBanner from '@/components/RecurringBanner';
import { useDialog } from '@/components/ui/Dialog';
import { MOIS_LIST, REV_COLORS } from '@/lib/constants';
import { RevenuEntry } from '@/lib/types';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { chartTheme, chartTooltipStyle } from '@/lib/chartTheme';


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
          className="text-[18px] mt-1 mono-value leading-none"
          style={valueColor ? { color: valueColor } : undefined}
        >{value}</div>
        {sub && <div className="text-[10px] mt-1 mono-value font-medium">{sub}</div>}
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
  const isMobile = useIsMobile();
  const { state, setState, save, getState, activeSpace, theme } = useApp();
  const { confirm, prompt } = useDialog();
  const ct = chartTheme(theme);
  const tooltipStyle = chartTooltipStyle(theme);

  // Toute la logique (période affichée, table de l'année, formulaire, écritures) est
  // partagée avec l'affichage mobile — cf. lib/useRevenus.
  const R = useRevenus();
  const {
    rev, categories, liveRate, year, setYear, years, isFuture, yearRaw, viewMonths,
    form, setForm, formMonth, setFormMonth, formYear, setFormYear,
    rateFor, perEurOf, aedOf, repeatWeekly, setRepeatWeekly, rateTouched, setRateTouched,
    openAdd, openEdit, saveEntry, deleteEntry, confirmEntry,
  } = R;
  const effectiveTab = R.tab;
  const setCurTab = R.setTab;
  const addOpen = R.formOpen;
  const setAddOpen = R.setFormOpen;
  const editIdx = R.isEdit;
  const USD_AED_PEG = R.usdPeg;
  const clientSuggestions = useMemo(() => R.clientSuggestions.map(c => c.name), [R.clientSuggestions]);

  const [page, setPage] = useState<'tracker' | 'global'>('tracker');

  const updateObjectif = (val: number) => {
    setState({ ...state, revenus: { ...rev, objectif: val } });
    save();
  };

  const addCategory = async () => {
    const cat = (await prompt('Nom de la catégorie :', { title: 'Nouvelle catégorie', confirmLabel: 'Ajouter', placeholder: 'Ex : CONSULTING' }))?.trim();
    if (!cat || categories.includes(cat)) return;
    const s = getState();
    setState({ ...s, revenus: { ...s.revenus, categories: [...categories, cat] } });
    save();
  };

  const removeCategory = async (cat: string) => {
    if (!(await confirm(`Supprimer la catégorie "${cat}" ?`, { danger: true }))) return;
    const s = getState();
    setState({ ...s, revenus: { ...s.revenus, categories: categories.filter(c => c !== cat) } });
    save();
  };

  const obj = rev.objectif || 5000;

  // ─── TRACKER VIEW ───
  const renderTracker = () => {
    const curMonthName = effectiveTab;
    const curEntries = viewMonths[curMonthName] || [];
    // Tri chronologique pour l'affichage, en gardant l'index d'origine pour edit/delete/confirm
    const sortedEntries = curEntries
      .map((e, i) => ({ e, i }))
      .sort((a, b) => (a.e.date || '').localeCompare(b.e.date || ''));

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
    // Les mois à venir (pas encore commencés) restent visibles mais estompés : ce sont des
    // prévisions, pas des encaissements.
    const barData = MOIS_LIST.map(month => {
      const entries = viewMonths[month] || [];
      const confirmed = entries.filter(e => !e.status || e.status === 'confirmed').reduce((s, e) => s + (e.cashed || 0), 0);
      const pending = entries.filter(e => e.status === 'pending').reduce((s, e) => s + (e.cashed || 0), 0);
      return { name: month.slice(0, 3), Confirmé: confirmed, 'En attente': pending, future: isFuture(month) };
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
            const hasData = (yearRaw[m] || []).length > 0;
            return (
              <button key={m} onClick={() => setCurTab(m)} className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${effectiveTab === m ? 'bg-bg-4 text-t-1 border border-border-2' : `${hasData ? 'text-t-2' : 'text-t-4'} border border-transparent hover:text-t-2`}`}>
                {m.slice(0, 3)}
              </button>
            );
          })}
        </div>

        {/* Revenus récurrents du mois affiché (n'apparaît que s'il y en a) */}
        <RecurringBanner
          title={`${R.recurDue.length} revenu${R.recurDue.length > 1 ? 's' : ''} récurrent${R.recurDue.length > 1 ? 's' : ''} à prévoir en ${effectiveTab.toLowerCase()} ${year}`}
          items={R.recurDue.map(o => ({ key: o.key, label: o.rule.label, detail: `${o.date.slice(8, 10)}/${o.date.slice(5, 7)} · ${f0(o.rule.amount)} ${o.rule.currency}` }))}
          addLabel="Ajouter en prévision"
          onAdd={R.addRecurring}
          onSkip={R.skipRecurring}
        />

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
            icon="📊"
            label="Atteinte"
            value={`${pctMonth.toFixed(0)}%`}
            valueColor={pctMonth >= 100 ? '#10b981' : '#f59e0b'}
            accentColor={pctMonth >= 100 ? '#10b981' : '#f59e0b'}
          />
          <RevKpi
            icon={delta >= 0 ? '✅' : '⚠️'}
            label="Delta"
            value={`${delta >= 0 ? '+' : ''}${f$(delta)} €`}
            valueColor={delta >= 0 ? '#10b981' : '#ef4444'}
            accentColor={delta >= 0 ? '#10b981' : '#ef4444'}
          />
        </div>

        {/* Transactions table for current month */}
        {curEntries.length > 0 ? (
          <div className="bg-bg-3 border border-border rounded-lg overflow-hidden mb-4 shadow-inset-border">
            <div className="flex justify-between items-center px-4 py-3 border-b border-border">
              <span className="text-[13px] font-semibold tracking-tight">💰 Transactions du mois</span>
              <div className="flex items-center gap-3">
                <span className="hero-num text-[14px] font-mono text-accent mono-value">{f$(monthCashed)} €</span>
                <button onClick={() => openAdd(curMonthName)} className="btn btn-ghost !py-1 !px-2.5 !text-[11px]">+</button>
              </div>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[720px]">
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
                {sortedEntries.map(({ e, i }) => {
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
                      <td className="px-4 py-2.5 text-[12px] text-t-3 truncate max-w-[180px]">
                        {e.currency && e.currency !== 'EUR' && e.origAmount != null ? (
                          <>
                            <span className="mono-value">{f$(e.origAmount)} {e.currency}</span>
                            {e.comment ? <span className="text-t-4"> · {e.comment}</span> : null}
                          </>
                        ) : (e.comment || '—')}
                      </td>
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
                <CartesianGrid stroke={ct.grid} />
                <XAxis dataKey="name" tick={{ fill: ct.tick, fontSize: 11 }} />
                <YAxis tick={{ fill: ct.tick, fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <ReferenceLine y={obj} stroke="#ef4444" strokeDasharray="6 4" strokeWidth={2} />
                <Bar dataKey="Confirmé" fill="#10b981" radius={4}>
                  {barData.map((d, i) => <Cell key={i} fillOpacity={d.future ? 0.3 : 1} />)}
                </Bar>
                <Bar dataKey="En attente" fill="#f59e0b" radius={4}>
                  {barData.map((d, i) => <Cell key={i} fillOpacity={d.future ? 0.3 : 1} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-bg-3 border border-border rounded-lg p-4 shadow-inset-border">
            <div className="flex items-baseline justify-between gap-3 mb-4">
              <span className="text-[13px] font-semibold text-t-2 tracking-tight">Par catégorie ({curMonthName})</span>
              <span className="text-[10px] text-t-4">{catTotalsMonth.length} source{catTotalsMonth.length > 1 ? 's' : ''}</span>
            </div>
            <RankedBars data={catTotalsMonth} fmt={(v) => `${f$(v)} €`} barClass="bg-accent" emptyLabel="Aucune source" />
          </div>
        </div>
      </>
    );
  };

  // ─── GLOBAL / ANNUAL VIEW ───
  const renderGlobal = () => {
    // Stats arrêtées à la DATE DU JOUR : dans les mois commencés, une entrée datée après
    // aujourd'hui ne compte pas encore. Les mois à venir gardent leurs entrées (listés
    // estompés, déjà exclus des totaux via `future` ci-dessous).
    const todayKey = todayISO();
    const rm: Record<string, RevenuEntry[]> = {};
    Object.entries(viewMonths).forEach(([k, es]) => {
      rm[k] = isFuture(k) ? es : es.filter(e => !e.date || e.date <= todayKey);
    });
    const yearObj = obj * 12;
    let yearContracted = 0, yearCashed = 0;
    let prevCashed: number | null = null;

    // Un mois pas encore commencé (revenus saisis en prévision pour le mois suivant) est
    // exclu de TOUTES les stats annuelles : si on est en septembre, tout se calcule de
    // janvier à septembre inclus. Il reste listé dans le tableau, estompé, hors total.
    const monthData = (MOIS_LIST as readonly string[]).map(m => {
      const me = rm[m] || [];
      const future = isFuture(m);
      const mc = me.reduce((s, e) => s + (e.contracted || 0), 0);
      const mk = me.filter(e => !e.status || e.status === 'confirmed').reduce((s, e) => s + (e.cashed || 0), 0);
      if (!future) {
        yearContracted += mc;
        yearCashed += mk;
      }
      const md = mk - obj;
      const mp = obj > 0 ? (mk / obj * 100) : 0;
      const vsM1 = !future && prevCashed !== null ? (mk - prevCashed) : null;
      const hasData = me.length > 0;
      if (hasData && !future) prevCashed = mk;
      return { name: m, contracted: mc, cashed: mk, delta: md, pct: mp, vsM1, hasData, future };
    });
    const futureWithData = monthData.filter(m => m.future && m.hasData).map(m => m.name);

    const yearPct = yearObj > 0 ? (yearCashed / yearObj * 100) : 0;
    const activeMonths = monthData.filter(m => m.hasData && !m.future).length;
    const avg = activeMonths > 0 ? yearCashed / activeMonths : 0;
    const yearPL = yearCashed - yearObj;

    // Source summary (mois à venir exclus)
    const srcTotals: Record<string, number> = {};
    Object.entries(rm).forEach(([monthName, entries]) => {
      if (isFuture(monthName)) return;
      (entries || []).forEach(e => {
        if (!e.status || e.status === 'confirmed') {
          srcTotals[e.cat || 'Autre'] = (srcTotals[e.cat || 'Autre'] || 0) + (e.cashed || 0);
        }
      });
    });
    const srcEntries = Object.entries(srcTotals).sort((a, b) => b[1] - a[1]);

    // Bar chart data — les mois à venir gardent leur barre, estompée (prévision)
    const evoData = (MOIS_LIST as readonly string[]).map(m => {
      const entries = rm[m] || [];
      return {
        name: m.slice(0, 3),
        Encaissé: entries.filter(e => !e.status || e.status === 'confirmed').reduce((s, e) => s + (e.cashed || 0), 0),
        Contracté: entries.reduce((s, e) => s + (e.contracted || 0), 0),
        future: isFuture(m),
      };
    });

    // Quarterly (mois à venir exclus : un trimestre entamé ne compte que ses mois commencés)
    const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
    const qData = quarters.map((q, qi) => {
      const ms = (MOIS_LIST as readonly string[]).slice(qi * 3, qi * 3 + 3).filter(m => !isFuture(m));
      const total = ms.reduce((s, m) => s + (rm[m] || []).filter(e => !e.status || e.status === 'confirmed').reduce((s2, e) => s2 + (e.cashed || 0), 0), 0);
      return { name: q, Encaissé: total };
    });
    const qObj = obj * 3;

    // ─── Vue par client ── agrégat sur tous les mois (confirmés uniquement)
    type ClientStat = {
      client: string;
      total: number;
      contracted: number;
      count: number;
      monthsActive: number;
      avgPerActiveMonth: number;
      pctOfYear: number;
      lastDate: string;
      lastMonth: string;
      topCat: string;
    };
    const clientMap = new Map<string, {
      total: number; contracted: number; count: number;
      months: Set<string>; lastDate: string; lastMonth: string;
      catCounts: Record<string, number>;
    }>();
    Object.entries(rm).forEach(([monthName, entries]) => {
      if (isFuture(monthName)) return;
      (entries || []).forEach(e => {
        const isConfirmed = !e.status || e.status === 'confirmed';
        if (!isConfirmed) return;
        const key = (e.client || '').trim() || 'Sans nom';
        let cur = clientMap.get(key);
        if (!cur) {
          cur = { total: 0, contracted: 0, count: 0, months: new Set(), lastDate: '', lastMonth: '', catCounts: {} };
          clientMap.set(key, cur);
        }
        cur.total += e.cashed || 0;
        cur.contracted += e.contracted || 0;
        cur.count += 1;
        cur.months.add(monthName);
        if (e.date && e.date > cur.lastDate) {
          cur.lastDate = e.date;
          cur.lastMonth = monthName;
        } else if (!cur.lastDate) {
          cur.lastMonth = monthName;
        }
        const cat = e.cat || 'Autre';
        cur.catCounts[cat] = (cur.catCounts[cat] || 0) + (e.cashed || 0);
      });
    });
    const clientStats: ClientStat[] = Array.from(clientMap.entries()).map(([client, c]) => {
      const topCat = Object.entries(c.catCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
      return {
        client,
        total: c.total,
        contracted: c.contracted,
        count: c.count,
        monthsActive: c.months.size,
        avgPerActiveMonth: c.months.size > 0 ? c.total / c.months.size : 0,
        pctOfYear: yearCashed > 0 ? (c.total / yearCashed) * 100 : 0,
        lastDate: c.lastDate,
        lastMonth: c.lastMonth,
        topCat,
      };
    }).sort((a, b) => b.total - a.total);
    const topClient = clientStats[0];

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
            <div className="text-[13px] font-semibold tracking-tight mb-4">
              📊 Résumé annuel {year}
              {year === new Date().getFullYear() && (
                <span className="text-[10px] text-t-4 font-medium ml-2">jusqu&apos;au {todayKey.slice(8)}/{todayKey.slice(5, 7)}</span>
              )}
            </div>
            {futureWithData.length > 0 && (
              <div className="text-[10px] text-t-4 -mt-2.5 mb-4">
                {futureWithData.join(', ')} : saisi en prévision, non compté (mois pas encore commencé)
              </div>
            )}
            <div className="grid grid-cols-2 gap-x-4 gap-y-4">
              <div>
                <div className="text-[9px] text-t-3 uppercase tracking-[0.12em] font-semibold">Total encaissé</div>
                <div className="hero-num text-[18px] mt-1 mono-value text-accent">{f$(yearCashed)} €</div>
              </div>
              <div>
                <div className="text-[9px] text-t-3 uppercase tracking-[0.12em] font-semibold">Objectif annuel</div>
                <div className="hero-num text-[18px] mt-1 mono-value text-t-1">{f$(yearObj)} €</div>
              </div>
              <div>
                <div className="text-[9px] text-t-3 uppercase tracking-[0.12em] font-semibold">{yearPL >= 0 ? 'Surplus' : 'Reste à atteindre'}</div>
                <div className={`hero-num text-[18px] mt-1 mono-value ${yearPL >= 0 ? 'text-accent' : 'text-danger'}`}>
                  {yearPL >= 0 ? '+' : ''}{f$(yearPL)} €
                </div>
              </div>
              <div>
                <div className="text-[9px] text-t-3 uppercase tracking-[0.12em] font-semibold">Atteinte</div>
                <div className="hero-num text-[18px] mt-1 mono-value" style={{ color: yearPct >= 100 ? '#10b981' : '#f59e0b' }}>
                  {yearPct.toFixed(0)}%
                </div>
              </div>
              <div className="col-span-2">
                <div className="text-[9px] text-t-3 uppercase tracking-[0.12em] font-semibold">Moyenne / mois actif</div>
                <div className="hero-num text-[18px] mt-1 mono-value text-purple">{f$(avg)} €</div>
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
          <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[700px]">
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
                <tr key={m.name} className={`border-b border-border tr-hover cursor-pointer transition-colors ${m.future ? 'opacity-50' : ''}`} onClick={() => { setCurTab(m.name); setPage('tracker'); }}>
                  <td className="px-4 py-2.5 text-[13px] font-semibold text-accent tracking-tight">
                    {m.name}
                    {m.future && <span className="ml-2 text-[9px] font-semibold tracking-[0.05em] px-1.5 py-[2px] rounded text-info bg-info/10">À VENIR</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs mono-value text-t-2">{f$(obj)} €</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs mono-value">{f$(m.contracted)} €</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs mono-value font-semibold">{f$(m.cashed)} €</td>
                  {m.future ? (
                    <>
                      <td className="px-4 py-2.5 text-right text-t-4">—</td>
                      <td className="px-4 py-2.5 text-right text-t-4">—</td>
                    </>
                  ) : (
                    <>
                      <td className={`px-4 py-2.5 text-right font-mono text-xs font-semibold mono-value ${m.delta >= 0 ? 'text-accent' : 'text-danger'}`}>{m.delta >= 0 ? '+' : ''}{f$(m.delta)} €</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${m.pct >= 100 ? 'text-accent bg-accent/10 border-accent/25' : 'text-warning bg-warning/10 border-warning/25'}`}>{m.pct.toFixed(0)}%</span>
                      </td>
                    </>
                  )}
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
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-2 gap-3 mb-5 max-lg:grid-cols-1">
          <div className="bg-bg-3 border border-border rounded-lg p-4 shadow-inset-border" style={{ height: 300 }}>
            <div className="text-[13px] font-semibold text-t-2 mb-4 tracking-tight">Encaissé vs Objectif</div>
            <ResponsiveContainer width="100%" height="85%">
              <BarChart data={evoData}>
                <CartesianGrid stroke={ct.grid} />
                <XAxis dataKey="name" tick={{ fill: ct.tick, fontSize: 11 }} />
                <YAxis tick={{ fill: ct.tick, fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <ReferenceLine y={obj} stroke="#ef4444" strokeDasharray="6 4" strokeWidth={2} />
                <Bar dataKey="Encaissé" fill="rgba(16,185,129,.6)" radius={4}>
                  {evoData.map((d, i) => <Cell key={i} fillOpacity={d.future ? 0.35 : 1} />)}
                </Bar>
                <Bar dataKey="Contracté" fill="rgba(59,130,246,.35)" radius={4}>
                  {evoData.map((d, i) => <Cell key={i} fillOpacity={d.future ? 0.35 : 1} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-bg-3 border border-border rounded-lg p-4 shadow-inset-border">
            <div className="flex items-baseline justify-between gap-3 mb-4">
              <span className="text-[13px] font-semibold text-t-2 tracking-tight">Répartition annuelle par source</span>
              <span className="text-[10px] text-t-4">{srcEntries.length} source{srcEntries.length > 1 ? 's' : ''}</span>
            </div>
            <RankedBars
              data={srcEntries.map(([name, value]) => ({ name, value }))}
              fmt={(v) => `${f$(v)} €`}
              barClass="bg-accent"
              emptyLabel="Aucune source"
            />
          </div>
        </div>

        {/* Vue par client */}
        {clientStats.length > 0 && (
          <div className="bg-bg-3 border border-border rounded-lg overflow-hidden mb-5 shadow-inset-border">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <span className="text-[13px] font-semibold tracking-tight">👥 Vue par client</span>
              <span className="text-[10px] text-t-3 font-mono mono-value">
                {clientStats.length} client{clientStats.length > 1 ? 's' : ''} · top : <span className="text-accent">{topClient?.client}</span>
              </span>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[780px]">
              <thead>
                <tr className="bg-bg-2">
                  <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-semibold">Client</th>
                  <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-semibold">Cat. princ.</th>
                  <th className="text-right px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-semibold">Total YTD</th>
                  <th className="text-right px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-semibold">% du CA</th>
                  <th className="text-right px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-semibold">Moy. / mois actif</th>
                  <th className="text-center px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-semibold">Mois actifs</th>
                  <th className="text-right px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-semibold">Dernière TX</th>
                </tr>
              </thead>
              <tbody>
                {clientStats.map((c, i) => {
                  const isTop = i === 0;
                  return (
                    <tr key={c.client} className="border-b border-border last:border-0 hover:bg-white/[.02] transition-colors">
                      <td className="px-4 py-2.5 text-[13px]">
                        <span className="font-semibold tracking-tight">{c.client}</span>
                        {isTop && <span className="ml-2 text-[9px] font-bold text-accent bg-accent/10 border border-accent/25 px-1.5 py-0.5 rounded uppercase tracking-wider">Top</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {c.topCat ? <CatPill cat={c.topCat} categories={categories} /> : <span className="text-t-4 text-[11px]">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-[12px] mono-value text-accent">{f$(c.total)} €</td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="inline-flex items-center gap-2 justify-end">
                          <div className="w-14 h-1 bg-bg-2 rounded-full overflow-hidden">
                            <div className="h-full bg-accent" style={{ width: `${Math.min(100, c.pctOfYear)}%` }} />
                          </div>
                          <span className="font-mono text-[11px] mono-value text-t-2 w-9 text-right">{c.pctOfYear.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-[12px] mono-value text-t-2">{f$(c.avgPerActiveMonth)} €</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="text-[11px] font-mono mono-value text-t-2">{c.monthsActive}</span>
                        <span className="text-[10px] text-t-4 ml-1">({c.count} tx)</span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-[11px] text-t-3">
                        {c.lastDate || c.lastMonth || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-bg-2">
                  <td className="px-4 py-2.5 font-bold text-[12px]" colSpan={2}>Total</td>
                  <td className="px-4 py-2.5 text-right font-mono text-[12px] mono-value font-bold text-accent">{f$(yearCashed)} €</td>
                  <td className="px-4 py-2.5 text-right font-mono text-[12px] mono-value font-bold text-t-2">100%</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
            </div>
          </div>
        )}

        {/* Quarterly chart */}
        <div className="bg-bg-3 border border-border rounded-lg p-4 mb-5 shadow-inset-border" style={{ height: 280 }}>
          <div className="text-[13px] font-semibold text-t-2 mb-4 tracking-tight">Évolution trimestrielle</div>
          <ResponsiveContainer width="100%" height="85%">
            <BarChart data={qData}>
              <CartesianGrid stroke={ct.grid} />
              <XAxis dataKey="name" tick={{ fill: ct.tick, fontSize: 11 }} />
              <YAxis tick={{ fill: ct.tick, fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <ReferenceLine y={qObj} stroke="#ef4444" strokeDasharray="6 4" strokeWidth={2} />
              <Bar dataKey="Encaissé" fill="rgba(139,92,246,.55)" radius={6} barSize={60} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </>
    );
  };

  // Mobile: dedicated UI shell
  if (isMobile === true) return <MobileRevenus />;

  return (
    <div>
      <PageHeader breadcrumb={[{ label: activeSpace.name }, { label: 'Revenus', current: true }]} title="Revenus" subtitle="Suivi des revenus par source">
        <div className="flex items-center gap-2">
          {years.length > 1 && (
            <div className="flex bg-bg-3 border border-border rounded-md overflow-hidden p-0.5 gap-0.5" title="Année affichée">
              {years.map(y => (
                <button key={y} onClick={() => setYear(y)} className={`px-3 py-1.5 text-xs font-semibold rounded transition-all cursor-pointer ${year === y ? 'bg-bg-4 text-t-1 shadow-sm' : 'text-t-3 hover:text-t-2'}`}>{y}</button>
              ))}
            </div>
          )}
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
            <div className="flex gap-2">
              <select className="fi flex-1" value={formMonth} onChange={e => setFormMonth(e.target.value)}>
                <option value="">---</option>
                {(MOIS_LIST as readonly string[]).map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <select className="fi !w-[92px] shrink-0" value={formYear} onChange={e => setFormYear(parseInt(e.target.value, 10))} aria-label="Année">
                {(years.includes(formYear) ? years : [...years, formYear].sort((a, b) => a - b)).map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </FormField>
          <FormField label="Date">
            <input className="fi" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          </FormField>
          {!editIdx && form.date && (() => {
            const wd = new Date(`${form.date}T00:00:00`);
            const wdName = isNaN(wd.getTime()) ? '' : wd.toLocaleDateString('fr-FR', { weekday: 'long' });
            const all = sameWeekdayDatesInMonth(form.date);
            return (
              <button
                type="button"
                onClick={() => setRepeatWeekly(r => !r)}
                className={`w-full text-left rounded-md border px-3 py-2.5 cursor-pointer transition-colors ${repeatWeekly ? 'bg-accent/10 border-accent/40' : 'bg-bg-2 border-border hover:border-border-2'}`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-3.5 h-3.5 rounded-[3px] border flex items-center justify-center text-[9px] font-bold shrink-0 ${repeatWeekly ? 'bg-accent border-accent text-black' : 'border-border-2 text-transparent'}`}>✓</span>
                  <span className={`text-[12px] font-medium ${repeatWeekly ? 'text-accent' : 'text-t-2'}`}>
                    Répéter chaque {wdName} du mois
                  </span>
                </div>
                <div className="text-[10px] text-t-4 mt-1 pl-[22px]">
                  {all.length === 0
                    ? `Aucun autre ${wdName} ce mois-ci`
                    : repeatWeekly
                      ? `+${all.length} entrée${all.length > 1 ? 's' : ''} : ${all.map(d => d.slice(8)).join(', ')} — modifiables ensuite une par une`
                      : `${all.length} autre${all.length > 1 ? 's' : ''} ${wdName}${all.length > 1 ? 's' : ''} ce mois-ci`}
                </div>
              </button>
            );
          })()}
          <FormField label="Client">
            <input
              className="fi"
              list="rv-clients"
              value={form.client}
              onChange={e => setForm({ ...form, client: e.target.value })}
              placeholder="Ex: Client A"
              autoComplete="off"
            />
            <datalist id="rv-clients">
              {clientSuggestions.map(c => <option key={c} value={c} />)}
            </datalist>
          </FormField>
          <FormField label="Catégorie">
            <select className="fi" value={form.cat} onChange={e => setForm({ ...form, cat: e.target.value })}>
              <option value="">—</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </FormField>
          <FormField label="Devise reçue">
            <select
              className="fi"
              value={form.currency || 'EUR'}
              onChange={e => {
                const c = e.target.value as 'EUR' | 'AED' | 'USD';
                // origRate = taux devise/EUR figé au moment du choix (réutilisé à la sauvegarde)
                setForm({
                  ...form,
                  currency: c,
                  origRate: c === 'EUR' ? undefined : rateFor(c),
                  origToAed: c === 'USD' ? (form.origToAed ?? USD_AED_PEG) : undefined,
                });
              }}
            >
              <option value="EUR">EUR — Euro</option>
              <option value="AED">AED — Dirham</option>
              <option value="USD">USD — Dollar</option>
            </select>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label={`Contracté (${form.currency || 'EUR'})`}>
              <input className="fi" type="number" value={form.contracted || ''} onChange={e => setForm({ ...form, contracted: parseFloat(e.target.value) || 0 })} step="0.01" />
            </FormField>
            <FormField label={`Encaissé (${form.currency || 'EUR'})`}>
              <input className="fi" type="number" value={form.cashed || ''} onChange={e => setForm({ ...form, cashed: parseFloat(e.target.value) || 0 })} step="0.01" />
            </FormField>
          </div>
          {(form.cashed || 0) > 0 && (() => {
            const cur = form.currency || 'EUR';
            const perEur = perEurOf(form);
            const eur = (form.cashed || 0) / perEur;
            const aed = aedOf(form, form.cashed || 0);
            return (
              <div className="text-[11px] text-t-3 bg-bg-2 rounded-md p-2.5 flex items-center justify-between gap-3">
                <span>Équivalent{cur !== 'EUR' ? ` · taux EUR/${cur} ${perEur.toFixed(4)}` : ''}</span>
                <span className="text-t-1 mono-value font-semibold">
                  {cur !== 'EUR' && <>{f$(eur)} € · </>}{f0(aed)} AED
                </span>
              </div>
            );
          })()}
          {(form.currency || 'EUR') === 'USD' ? (
            <FormField label="Taux USD/AED (ton taux de swap)">
              <input
                className="fi"
                type="number"
                value={form.origToAed ?? USD_AED_PEG}
                onChange={e => setForm({ ...form, origToAed: parseFloat(e.target.value) || 0 })}
                step="0.0001"
                placeholder="3.6725"
              />
            </FormField>
          ) : (
            <FormField label="Taux EUR/AED">
              <div className="flex gap-2">
                <input
                  className="fi flex-1"
                  type="number"
                  value={form.rate}
                  onChange={e => { setForm({ ...form, rate: parseFloat(e.target.value) || 0 }); setRateTouched(true); }}
                  step="0.0001"
                />
                <button
                  type="button"
                  onClick={() => { setForm({ ...form, rate: liveRate }); setRateTouched(false); }}
                  className={`text-[10px] px-2.5 rounded-md border cursor-pointer transition-colors shrink-0 ${!rateTouched ? 'text-accent bg-accent/10 border-accent/30' : 'text-t-3 bg-bg-2 border-border hover:text-t-1'}`}
                  title={`Synchroniser avec le taux live (${liveRate.toFixed(4)})`}
                >
                  {rateTouched ? '↻ Live' : '● Live'}
                </button>
              </div>
            </FormField>
          )}
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
