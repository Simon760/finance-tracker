'use client';

import { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { Plus, ChevronDown, ChevronLeft, ChevronRight, BarChart3, CalendarDays, Target, Tags, Check, Trash2, Coins } from 'lucide-react';
import { useApp } from '@/context/AppProvider';
import { f$, f0, sameWeekdayDatesInMonth, todayISO } from '@/lib/utils';
import { useRevenus } from '@/lib/useRevenus';
import { revAnnualStats } from '@/lib/revenusStats';
import { MOIS_LIST, REV_COLORS } from '@/lib/constants';
import { RevenuEntry } from '@/lib/types';
import { shortDay } from '@/lib/labels';
import { chartTheme, chartTooltipStyle } from '@/lib/chartTheme';
import RecurringBanner from '@/components/RecurringBanner';
import BottomSheet from './BottomSheet';
import { MAction, MBadge, MBar, MButton, MCard, MDivider, MEmpty, MField, MIcon, MLabel, MNum, MPill, MRow, MSeg, MToggle } from './ui';
import AmountSheet from './tracker/AmountSheet';

type R = ReturnType<typeof useRevenus>;
const cap = (s: string) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : s);
const isConfirmed = (e: RevenuEntry) => !e.status || e.status === 'confirmed';
const TONE = { confirmed: 'text-accent', preview: 'text-info', pending: 'text-warning' } as const;

/**
 * Revenus sur mobile : vue « Mois » (encaissé, objectif, liste) et vue « Année » (stats
 * annuelles, par mois, trimestre, catégorie, client). Toute la logique vient de
 * lib/useRevenus et lib/revenusStats, partagés avec le desktop — ici, uniquement du rendu.
 */
export default function MobileRevenus() {
  const R = useRevenus();
  const { theme } = useApp();
  const { rev, categories, year, setYear, years, yearRaw, viewMonths, orderedMonths, hasAnyData } = R;
  const tab = R.tab;
  const [view, setView] = useState<'month' | 'year'>('month');
  const [sheet, setSheet] = useState<'picker' | 'objectif' | 'cats' | 'clients' | null>(null);
  const [editing, setEditing] = useState<{ month: string; idx: number } | null>(null);
  const today = todayISO();
  const obj = rev.objectif || 5000;

  const openAdd = () => { setEditing(null); R.openAdd(); };
  const openEdit = (month: string, idx: number) => { setEditing({ month, idx }); R.openEdit(month, idx); };

  // Arrivée depuis le bouton « Revenu » de l'accueil : on ouvre directement la saisie
  useEffect(() => {
    try {
      if (sessionStorage.getItem('fhq_rev_add') !== '1') return;
      sessionStorage.removeItem('fhq_rev_add');
      openAdd();
    } catch { /* stockage indisponible */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const curIdx = orderedMonths.indexOf(tab);
  const goPrev = () => { if (curIdx > 0) R.setTab(orderedMonths[curIdx - 1]); };
  const goNext = () => { if (curIdx >= 0 && curIdx < orderedMonths.length - 1) R.setTab(orderedMonths[curIdx + 1]); };

  const entries = useMemo(() => viewMonths[tab] || [], [viewMonths, tab]);
  const sorted = useMemo(() => entries.map((e, i) => ({ e, i })).sort((a, b) => (b.e.date || '').localeCompare(a.e.date || '')), [entries]);
  const cashed = entries.filter(isConfirmed).reduce((s, e) => s + (e.cashed || 0), 0);
  const contracted = entries.reduce((s, e) => s + (e.contracted || 0), 0);
  const preview = entries.filter(e => e.status === 'preview').reduce((s, e) => s + (e.cashed || 0), 0);
  const pending = entries.filter(e => e.status === 'pending').reduce((s, e) => s + (e.cashed || 0), 0);
  const delta = cashed - obj;

  const A = useMemo(() => revAnnualStats(viewMonths, R.isFuture, obj, today), [viewMonths, R.isFuture, obj, today]);
  const ct = chartTheme(theme);
  const catColor = (cat?: string) => REV_COLORS[Math.max(0, categories.indexOf(cat || '')) % REV_COLORS.length];

  const actions = (
    <div className="flex justify-around px-2 pb-6">
      <MAction icon={<Plus size={21} />} label="Ajouter" onClick={openAdd} />
      {view === 'month'
        ? <MAction icon={<BarChart3 size={20} />} label="Année" onClick={() => setView('year')} />
        : <MAction icon={<CalendarDays size={20} />} label="Mois" onClick={() => setView('month')} />}
      <MAction icon={<Target size={20} />} label="Objectif" onClick={() => setSheet('objectif')} />
      <MAction icon={<Tags size={20} />} label="Catégories" onClick={() => setSheet('cats')} />
    </div>
  );

  const hero = (label: string, value: number, target: number) => {
    const pct = target > 0 ? value / target : 0;
    return (
      <>
        <span className="text-[13px] text-t-3">{label}</span>
        <span className="flex items-baseline gap-1.5 mt-1">
          <span className="text-[36px] leading-none hero-num mono-value text-t-1">{f$(value)}</span>
          <span className="text-[16px] text-t-3 font-medium">€</span>
        </span>
        <span className="text-[13px] text-t-3 mt-1.5 mono-value m-sub">{Math.round(pct * 100)} % de l’objectif de {f0(target)} €</span>
        <div className="w-[150px] mt-3"><MBar pct={pct} tone={pct >= 1 ? 'accent' : pct >= 0.75 ? 'warning' : undefined} /></div>
      </>
    );
  };

  const sheets = (
    <>
      <RevenuSheet R={R} editing={editing} />
      <AmountSheet
        open={sheet === 'objectif'} onClose={() => setSheet(null)} title="Objectif mensuel" subtitle="Encaissé visé chaque mois"
        initial={rev.objectif || 0} currencies={['EUR']} hint={v => `Soit ${f0(v * 12)} € sur l’année`} onSave={v => R.updateObjectif(v)}
      />
      <BottomSheet open={sheet === 'cats'} onClose={() => setSheet(null)} title="Catégories" footer={<MButton variant="ghost" onClick={() => R.addCategory()}><Plus size={17} />Ajouter une catégorie</MButton>}>
        <MCard surface="sheet">
          {categories.length === 0 && <div className="px-4 py-6 text-center text-[13px] text-t-3">Aucune catégorie pour l’instant</div>}
          {categories.map((c, k) => (
            <div key={c}>
              {k > 0 && <MDivider />}
              <div className="flex items-center gap-3 pl-4 pr-2 min-h-[52px]">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: catColor(c) }} />
                <span className="flex-1 min-w-0 text-[15px] font-medium text-t-1 truncate">{c}</span>
                <button type="button" onClick={() => R.removeCategory(c)} className="w-11 h-11 flex items-center justify-center text-t-3 active:text-danger" aria-label={`Supprimer la catégorie ${c}`}><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </MCard>
      </BottomSheet>
      <BottomSheet open={sheet === 'picker'} onClose={() => setSheet(null)} title="Choisir un mois">
        {years.length > 1 && (
          <div className="flex gap-2 overflow-x-auto m-noscroll -mx-4 px-4 pb-3">
            {years.map(y => <MPill key={y} surface="sheet" active={year === y} onClick={() => setYear(y)}>{y}</MPill>)}
          </div>
        )}
        <MCard surface="sheet">
          {(MOIS_LIST as readonly string[]).map((m, k) => {
            const es = yearRaw[m] || [];
            const total = es.filter(isConfirmed).reduce((s, e) => s + (e.cashed || 0), 0);
            return (
              <div key={m}>
                {k > 0 && <MDivider />}
                <MRow
                  className="!min-h-[48px]"
                  title={cap(m)}
                  badge={R.isFuture(m) && es.length > 0 ? <MBadge tone="info">À venir</MBadge> : undefined}
                  right={m === tab ? <Check size={18} className="text-accent inline" /> : <span className={`mono-value text-[14px] ${es.length > 0 ? '' : 'text-t-4'}`}>{es.length > 0 ? `${f$(total)} €` : '—'}</span>}
                  onClick={() => { R.setTab(m); setView('month'); setSheet(null); }}
                />
              </div>
            );
          })}
        </MCard>
      </BottomSheet>
      <BottomSheet open={sheet === 'clients'} onClose={() => setSheet(null)} title="Clients" subtitle={`${year} · revenus confirmés`} fullHeight>
        <MCard surface="sheet">{A.clientStats.map((c, k) => <ClientRow key={c.client} c={c} k={k} today={today} />)}</MCard>
      </BottomSheet>
    </>
  );

  if (!hasAnyData) {
    return (
      <>
        <MEmpty icon={<Coins size={26} />} title="Ajoute ton premier revenu" text="Encaissé, prévu ou en attente : chaque entrée compte dans le mois choisi." action={<MButton onClick={openAdd}><Plus size={17} />Nouveau revenu</MButton>} />
        {sheets}
      </>
    );
  }

  return (
    <div className="-mx-1">
      {view === 'month' ? (
        <>
          <div className="flex flex-col items-center pt-3 pb-5">
            {hero(`Encaissé en ${tab.toLowerCase()}`, cashed, obj)}
            {(preview > 0 || pending > 0) && (
              <span className="text-[13px] text-info mt-2 mono-value m-sub">
                {preview > 0 && `+ ${f$(preview)} € prévus`}{preview > 0 && pending > 0 && ' · '}{pending > 0 && <span className="text-warning">{f$(pending)} € en attente</span>}
              </span>
            )}
            <div className="flex items-center gap-1 mt-3.5">
              <button type="button" onClick={goPrev} disabled={curIdx <= 0} className="w-10 h-10 flex items-center justify-center rounded-full text-t-3 disabled:opacity-25 active:bg-bg-3" aria-label="Mois précédent"><ChevronLeft size={19} /></button>
              <button type="button" onClick={() => setSheet('picker')} className="h-9 px-4 rounded-full bg-bg-3 flex items-center gap-1.5 text-[14px] font-medium text-t-1 active:opacity-70">
                {cap(tab)} {year}
                {R.isFuture(tab) && <MBadge tone="info">À venir</MBadge>}
                <ChevronDown size={15} className="text-t-3" />
              </button>
              <button type="button" onClick={goNext} disabled={curIdx >= orderedMonths.length - 1} className="w-10 h-10 flex items-center justify-center rounded-full text-t-3 disabled:opacity-25 active:bg-bg-3" aria-label="Mois suivant"><ChevronRight size={19} /></button>
            </div>
          </div>
          {actions}

          <RecurringBanner
            title={`${R.recurDue.length} revenu${R.recurDue.length > 1 ? 's' : ''} récurrent${R.recurDue.length > 1 ? 's' : ''} à prévoir en ${tab.toLowerCase()} ${year}`}
            items={R.recurDue.map(o => ({ key: o.key, label: o.rule.label, detail: `${o.date.slice(8, 10)}/${o.date.slice(5, 7)} · ${f0(o.rule.amount)} ${o.rule.currency}` }))}
            addLabel="Ajouter en prévision"
            onAdd={R.addRecurring}
            onSkip={R.skipRecurring}
          />

          <MCard className="mb-4">
            <MRow className="!min-h-[48px]" title={<span className="text-[14px] font-normal text-t-2">Contracté</span>} right={<span className="mono-value">{f$(contracted)} €</span>} />
            <MDivider />
            <MRow
              className="!min-h-[48px]"
              title={<span className="text-[14px] font-normal text-t-2">Écart à l’objectif</span>}
              right={<span className={`mono-value ${delta >= 0 ? 'text-accent' : 'text-danger'}`}>{delta >= 0 ? '+' : ''}{f$(delta)} €</span>}
            />
          </MCard>

          <MLabel>{entries.length > 0 ? `${entries.length} revenu${entries.length > 1 ? 's' : ''}` : 'Revenus'}</MLabel>
          <MCard className="mb-2">
            {entries.length === 0 && <div className="px-4 py-7 text-center text-[13px] text-t-3">Rien en {tab.toLowerCase()} pour l’instant</div>}
            {sorted.map(({ e, i }, k) => {
              const status = e.status || 'confirmed';
              return (
                <div key={i} className="flex items-stretch">
                  <div className="flex-1 min-w-0">
                    {k > 0 && <MDivider />}
                    <MRow
                      icon={<MIcon color={catColor(e.cat)}>{(e.client || '?').trim().charAt(0).toUpperCase() || '?'}</MIcon>}
                      title={e.client || 'Sans nom'}
                      badge={status === 'preview' ? <MBadge tone="info">Prévision</MBadge> : status === 'pending' ? <MBadge tone="warning">En attente</MBadge> : undefined}
                      sub={[shortDay(e.date, today), e.cat, e.comment].filter(Boolean).join(' · ')}
                      right={<span className={`mono-value ${TONE[status]}`}>+{f$(e.cashed || 0)} €</span>}
                      rightSub={
                        e.currency && e.currency !== 'EUR' && e.origAmount != null ? <span className="mono-value">{f$(e.origAmount)} {e.currency}</span>
                          : (e.contracted || 0) !== (e.cashed || 0) ? <span className="mono-value">contrat {f$(e.contracted || 0)}</span> : undefined
                      }
                      onClick={() => openEdit(tab, i)}
                    />
                  </div>
                  {status !== 'confirmed' && (
                    <button type="button" onClick={() => R.confirmEntry(tab, i)} className="w-12 shrink-0 flex items-center justify-center active:opacity-60" aria-label={`Confirmer l’encaissement de ${e.client || 'ce revenu'}`}>
                      <span className="w-9 h-9 rounded-full bg-accent/10 text-accent flex items-center justify-center"><Check size={17} /></span>
                    </button>
                  )}
                </div>
              );
            })}
          </MCard>
        </>
      ) : (
        <>
          <div className="flex flex-col items-center pt-3 pb-5">
            {hero(`Encaissé en ${year}`, A.yearCashed, A.yearObj)}
            {years.length > 1 && (
              <div className="flex gap-2 mt-3.5">
                {years.map(y => <MPill key={y} active={year === y} onClick={() => setYear(y)}>{y}</MPill>)}
              </div>
            )}
          </div>
          {actions}

          <MCard className="mb-4">
            <MRow className="!min-h-[48px]" title={<span className="text-[14px] font-normal text-t-2">Contracté</span>} right={<span className="mono-value">{f$(A.yearContracted)} €</span>} />
            <MDivider />
            <MRow className="!min-h-[48px]" title={<span className="text-[14px] font-normal text-t-2">Moyenne par mois</span>} sub={`Sur ${A.activeMonths} mois avec revenus`} right={<span className="mono-value">{f$(A.avg)} €</span>} />
            <MDivider />
            <MRow
              className="!min-h-[48px]"
              title={<span className="text-[14px] font-normal text-t-2">Écart à l’objectif annuel</span>}
              right={<span className={`mono-value ${A.yearPL >= 0 ? 'text-accent' : 'text-danger'}`}>{A.yearPL >= 0 ? '+' : ''}{f$(A.yearPL)} €</span>}
            />
          </MCard>
          {A.futureWithData.length > 0 && (
            <p className="text-[12px] text-t-4 px-4 -mt-2 mb-4 leading-relaxed">Hors totaux, pas encore commencé : {A.futureWithData.map(m => m.toLowerCase()).join(', ')}.</p>
          )}

          <MLabel>Encaissé par mois</MLabel>
          <MCard className="mb-4 px-2 pt-3 pb-1">
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={A.evoData} margin={{ left: 4, right: 4, top: 4, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fill: ct.tick, fontSize: 10 }} axisLine={false} tickLine={false} interval={0} tickFormatter={(v: string) => v.charAt(0)} />
                <Tooltip formatter={v => `${f$(Number(v))} €`} contentStyle={chartTooltipStyle(theme)} cursor={{ fill: 'transparent' }} />
                <ReferenceLine y={obj} stroke={ct.tick} strokeDasharray="3 3" strokeOpacity={0.6} />
                <Bar dataKey="Encaissé" radius={[5, 5, 0, 0]}>
                  {A.evoData.map((d, i) => <Cell key={i} fill="rgb(var(--accent))" fillOpacity={d.future ? 0.25 : 0.9} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </MCard>

          <MLabel>Par mois</MLabel>
          <MCard className="mb-4">
            {A.monthData.map((m, k) => (
              <div key={m.name} className={m.future ? 'opacity-60' : ''}>
                {k > 0 && <MDivider />}
                <MRow
                  className="!min-h-[50px]"
                  title={cap(m.name)}
                  badge={m.future && m.hasData ? <MBadge tone="info">À venir</MBadge> : undefined}
                  sub={!m.hasData ? 'Aucun revenu' : m.future ? 'Hors total' : (
                    <span className="mono-value">{Math.round(m.pct)} % de l’objectif{m.vsM1 != null && <> · <span className={m.vsM1 >= 0 ? 'text-accent' : 'text-danger'}>{m.vsM1 >= 0 ? '+' : ''}{f0(m.vsM1)}</span> vs mois d’avant</>}</span>
                  )}
                  right={<span className={`mono-value ${m.hasData ? '' : 'text-t-4'}`}>{m.hasData ? `${f$(m.cashed)} €` : '—'}</span>}
                  rightSub={m.hasData && !m.future ? <span className={`mono-value ${m.delta >= 0 ? 'text-accent' : 'text-danger'}`}>{m.delta >= 0 ? '+' : ''}{f0(m.delta)}</span> : undefined}
                  onClick={() => { R.setTab(m.name); setView('month'); window.scrollTo(0, 0); }}
                />
              </div>
            ))}
          </MCard>

          <MLabel>Par trimestre</MLabel>
          <MCard className="mb-4">
            {A.qData.map((q, k) => (
              <div key={q.name}>
                {k > 0 && <MDivider />}
                <MRow
                  className="!min-h-[50px]"
                  title={`${k + 1}${k === 0 ? 'er' : 'e'} trimestre`}
                  sub={<span className="mono-value">{A.qObj > 0 ? Math.round((q.Encaissé / A.qObj) * 100) : 0} % de {f0(A.qObj)} €</span>}
                  right={<span className="mono-value">{f$(q.Encaissé)} €</span>}
                />
              </div>
            ))}
          </MCard>

          {A.srcEntries.length > 0 && (
            <>
              <MLabel>Par catégorie</MLabel>
              <MCard className="mb-4">
                {A.srcEntries.map(([cat, total], k) => (
                  <div key={cat}>
                    {k > 0 && <MDivider />}
                    <MRow
                      className="!min-h-[50px]"
                      icon={<span className="w-2.5 h-2.5 rounded-full shrink-0 mx-1" style={{ background: catColor(cat) }} />}
                      title={cat}
                      right={<span className="mono-value">{f$(total)} €</span>}
                      rightSub={<span className="mono-value">{A.yearCashed > 0 ? Math.round((total / A.yearCashed) * 100) : 0} %</span>}
                    />
                  </div>
                ))}
              </MCard>
            </>
          )}

          {A.clientStats.length > 0 && (
            <>
              <MLabel right={A.clientStats.length > 5 ? <button type="button" onClick={() => setSheet('clients')} className="text-[13px] text-t-1 font-medium h-8 px-1">Tout voir</button> : undefined}>Clients</MLabel>
              <MCard className="mb-2">{A.clientStats.slice(0, 5).map((c, k) => <ClientRow key={c.client} c={c} k={k} today={today} />)}</MCard>
            </>
          )}
        </>
      )}
      {sheets}
    </div>
  );
}

function ClientRow({ c, k, today }: { c: ReturnType<typeof revAnnualStats>['clientStats'][number]; k: number; today: string }) {
  return (
    <div>
      {k > 0 && <MDivider />}
      <MRow
        icon={<MIcon>{c.client.charAt(0).toUpperCase()}</MIcon>}
        title={c.client}
        sub={`${c.count} paiement${c.count > 1 ? 's' : ''} · ${c.monthsActive} mois${c.lastDate ? ` · dernier ${shortDay(c.lastDate, today)}` : ''}`}
        right={<span className="mono-value">{f$(c.total)} €</span>}
        rightSub={<span className="mono-value">{Math.round(c.pctOfYear)} %</span>}
      />
    </div>
  );
}

/** Saisie / modification d'un revenu. Déclaré au niveau module (champs de saisie). */
function RevenuSheet({ R, editing }: { R: R; editing: { month: string; idx: number } | null }) {
  const { form, setForm, formMonth, setFormMonth, formYear, setFormYear, years, categories, liveRate, rateTouched, setRateTouched, repeatWeekly, setRepeatWeekly } = R;
  const isEdit = R.isEdit;
  const cur = form.currency || 'EUR';
  const close = () => R.setFormOpen(false);
  const yearOptions = years.includes(formYear) ? years : [...years, formYear].sort((a, b) => a - b);
  const q = (form.client || '').trim().toLowerCase();
  const sugg = (q ? R.clientSuggestions.filter(s => s.name.toLowerCase().includes(q) && s.name.toLowerCase() !== q) : R.clientSuggestions).slice(0, 6);
  const wd = form.date ? new Date(`${form.date}T00:00:00`) : null;
  const wdName = wd && !isNaN(wd.getTime()) ? wd.toLocaleDateString('fr-FR', { weekday: 'long' }) : '';
  const others = form.date ? sameWeekdayDatesInMonth(form.date) : [];
  const perEur = R.perEurOf(form);
  const notConfirmed = isEdit && form.status !== 'confirmed';

  return (
    <BottomSheet
      open={R.formOpen}
      onClose={close}
      title={isEdit ? 'Modifier le revenu' : 'Nouveau revenu'}
      fullHeight
      footer={<MButton disabled={!formMonth.trim()} onClick={R.saveEntry}>{isEdit ? 'Enregistrer' : 'Ajouter'}</MButton>}
    >
      {/* Montant encaissé */}
      <div className="flex flex-col items-center pt-2 pb-4">
        <span className="text-[13px] text-t-3 mb-1">Encaissé</span>
        <MNum className="m-amount text-center px-6" value={form.cashed} onChange={n => setForm({ ...form, cashed: n })} autoFocus={!isEdit} ariaLabel="Montant encaissé" />
        <MSeg
          className="mt-2.5"
          value={cur}
          options={[['EUR', 'EUR'], ['AED', 'AED'], ['USD', 'USD']] as const}
          onChange={c => setForm({ ...form, currency: c, origRate: c === 'EUR' ? undefined : R.rateFor(c), origToAed: c === 'USD' ? (form.origToAed ?? R.usdPeg) : undefined })}
        />
        <div className="text-[13px] text-t-3 mt-2 mono-value m-sub">
          {(form.cashed || 0) > 0
            ? <>{cur !== 'EUR' && <>≈ {f$((form.cashed || 0) / perEur)} € · </>}{f0(R.aedOf(form, form.cashed || 0))} AED</>
            : 'au taux du jour'}
        </div>
      </div>

      <MCard surface="sheet" className="mb-3">
        <MField label="Client">
          <input className="m-input text-right" placeholder="Nom du client" autoComplete="off" value={form.client || ''} onChange={e => setForm({ ...form, client: e.target.value })} />
        </MField>
        <MDivider />
        <MField label="Catégorie">
          <select className="m-input text-right" dir="rtl" value={form.cat || ''} onChange={e => setForm({ ...form, cat: e.target.value })}>
            <option value="">Aucune</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </MField>
        <MDivider />
        <MField label={`Contracté (${cur})`}>
          <MNum className="text-right" value={form.contracted} onChange={n => setForm({ ...form, contracted: n })} />
        </MField>
      </MCard>
      {sugg.length > 0 && (
        <div className="flex gap-2 overflow-x-auto m-noscroll -mx-4 px-4 pb-3">
          {sugg.map(s => <MPill key={s.name} surface="sheet" onClick={() => setForm({ ...form, client: s.name })}>{s.name}</MPill>)}
        </div>
      )}

      <MSeg
        className="w-full mb-3"
        value={form.status || 'confirmed'}
        options={[['confirmed', 'Encaissé'], ['preview', 'Prévision'], ['pending', 'En attente']] as const}
        onChange={s => setForm({ ...form, status: s })}
      />

      <MCard surface="sheet" className="mb-3">
        <MField label="Date">
          <input className="m-input text-right" type="date" value={form.date || ''} onChange={e => setForm({ ...form, date: e.target.value })} />
        </MField>
        <MDivider />
        <MField label="Compté en">
          <span className="flex items-center justify-end gap-3">
            <select className="m-input text-right !w-auto" dir="rtl" value={formMonth} onChange={e => setFormMonth(e.target.value)} aria-label="Mois">
              {(MOIS_LIST as readonly string[]).map(m => <option key={m} value={m}>{cap(m)}</option>)}
            </select>
            <select className="m-input text-right !w-auto" dir="rtl" value={formYear} onChange={e => setFormYear(parseInt(e.target.value, 10))} aria-label="Année">
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </span>
        </MField>
        {!isEdit && wdName && (
          <>
            <MDivider />
            <MRow
              title={<span className="text-[14px]">Répéter chaque {wdName}</span>}
              sub={others.length === 0 ? `Aucun autre ${wdName} ce mois-ci` : repeatWeekly ? `+ ${others.length} entrée${others.length > 1 ? 's' : ''} : le ${others.map(d => d.slice(8)).join(', ')}` : `${others.length} autre${others.length > 1 ? 's' : ''} ce mois-ci`}
              right={<MToggle on={repeatWeekly} />}
              onClick={() => setRepeatWeekly(!repeatWeekly)}
            />
          </>
        )}
      </MCard>

      <MCard surface="sheet" className="mb-3">
        {cur === 'USD' ? (
          <MField label="Taux USD / AED du swap">
            <MNum className="text-right" value={form.origToAed ?? R.usdPeg} onChange={n => setForm({ ...form, origToAed: n })} placeholder="3,6725" />
          </MField>
        ) : (
          <MField label="Taux EUR / AED">
            <span className="flex items-center justify-end gap-2">
              <MNum className="text-right" value={form.rate} onChange={n => { setForm({ ...form, rate: n }); setRateTouched(true); }} />
              <button type="button" onClick={() => { setForm({ ...form, rate: liveRate }); setRateTouched(false); }} className={`h-8 px-3 rounded-full text-[12px] font-medium shrink-0 ${rateTouched ? 'bg-bg-4 text-t-2' : 'bg-accent/10 text-accent'}`}>
                {rateTouched ? 'Taux du jour' : 'Du jour'}
              </button>
            </span>
          </MField>
        )}
        <MDivider />
        <MField label="Note">
          <input className="m-input text-right" placeholder="Facultatif" value={form.comment || ''} onChange={e => setForm({ ...form, comment: e.target.value })} />
        </MField>
      </MCard>

      {isEdit && editing && (
        <div className="pt-1">
          {notConfirmed && (
            <MButton variant="ghost" className="mb-1" onClick={() => { R.confirmEntry(editing.month, editing.idx); close(); }}>
              <Check size={17} />Confirmer l’encaissement
            </MButton>
          )}
          <button type="button" onClick={async () => { if (await R.deleteEntry(editing.month, editing.idx)) close(); }} className="w-full flex items-center justify-center gap-2 h-12 text-[15px] font-medium text-danger active:opacity-60">
            <Trash2 size={16} />Supprimer
          </button>
        </div>
      )}
    </BottomSheet>
  );
}
