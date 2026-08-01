'use client';

import { useState, useMemo, useEffect } from 'react';
import { useApp } from '@/context/AppProvider';
import { f$, f0, fetchRate, sameWeekdayDatesInMonth } from '@/lib/utils';
import { MOIS_LIST, REV_COLORS } from '@/lib/constants';
import { RevenuEntry } from '@/lib/types';
import BottomSheet from './BottomSheet';
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Check, Receipt } from 'lucide-react';

const STATUS_COLORS = {
  confirmed: { row: 'border-l-accent', badge: 'text-accent bg-accent/10', label: 'CONFIRMÉ' },
  preview:   { row: 'border-l-info',   badge: 'text-info bg-info/10',     label: 'PRÉVISION' },
  pending:   { row: 'border-l-warning',badge: 'text-warning bg-warning/10', label: 'EN ATTENTE' },
} as const;

const todayStr = () => new Date().toISOString().split('T')[0];

export default function MobileRevenus() {
  const { state, setState, save, liveRate, logChange } = useApp();
  const rev = state.revenus || { objectif: 5000, categories: [], months: {} };
  const categories = rev.categories || [];

  const orderedMonths = useMemo(() => {
    const existing = Object.keys(rev.months || {});
    return (MOIS_LIST as readonly string[]).filter(m => existing.includes(m));
  }, [rev.months]);

  const [curTab, setCurTab] = useState<string>('');
  const effectiveTab = curTab || orderedMonths[orderedMonths.length - 1] || '';
  const curIdx = orderedMonths.indexOf(effectiveTab);

  // Suggestions clients par fréquence
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

  // Edit/Add form
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editIdx, setEditIdx] = useState<{ month: string; idx: number } | null>(null);
  const [form, setForm] = useState<RevenuEntry>({ date: '', client: '', cat: '', contracted: 0, cashed: 0, comment: '', rate: liveRate, status: 'confirmed' });
  const [formMonth, setFormMonth] = useState('');
  const [showClientSugg, setShowClientSugg] = useState(false);

  // Taux EUR→USD (même source que EUR/AED : TwelveData prioritaire + fallbacks)
  const [usdRate, setUsdRate] = useState(1.08);
  useEffect(() => { fetchRate('USD').then(r => { if (r > 0) setUsdRate(r); }).catch(() => {}); }, []);
  // 1 EUR = rateFor(devise) unités de cette devise
  const rateFor = (c?: string) => (c === 'USD' ? usdRate : c === 'AED' ? liveRate : 1);

  // Taux USD→AED officiel (peg) — défaut du champ, l'utilisateur met son taux de swap réel
  const USD_AED_PEG = 3.6725;

  // Récurrence hebdo : duplique l'entrée sur les autres mêmes jours de semaine du mois
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const repeatDates = useMemo(() => (repeatWeekly ? sameWeekdayDatesInMonth(form.date) : []), [repeatWeekly, form.date]);

  // Le champ Taux EUR/AED suit le taux live tant qu'il n'a pas été modifié à la main
  const [rateTouched, setRateTouched] = useState(false);
  useEffect(() => {
    if (sheetOpen && !rateTouched) setForm(f => ({ ...f, rate: liveRate }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveRate, sheetOpen, rateTouched]);

  // Devise du form → 1 EUR = perEurOf(f) unités ; AED crédité au compte = aedOf(f)
  const perEurOf = (f: RevenuEntry) => {
    const c = f.currency || 'EUR';
    if (c === 'EUR') return 1;
    if (c === 'AED') return f.rate || liveRate;
    return f.origRate || usdRate;
  };
  const aedOf = (f: RevenuEntry, amount: number) => {
    const c = f.currency || 'EUR';
    if (c === 'EUR') return amount * (f.rate || liveRate);
    if (c === 'AED') return amount;
    return amount * (f.origToAed || USD_AED_PEG);
  };

  // Month picker sheet
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);

  const filteredClientSugg = useMemo(() => {
    const q = (form.client || '').trim().toLowerCase();
    const arr = q ? clientSuggestions.filter(s => s.name.toLowerCase().includes(q) && s.name.toLowerCase() !== q) : clientSuggestions;
    return arr.slice(0, 6);
  }, [clientSuggestions, form.client]);

  const openAdd = () => {
    setForm({ date: todayStr(), client: '', cat: categories[0] || '', contracted: 0, cashed: 0, comment: '', rate: liveRate, status: 'confirmed', currency: 'EUR' });
    setFormMonth(effectiveTab || orderedMonths[orderedMonths.length - 1] || '');
    setEditIdx(null);
    setShowClientSugg(false);
    setRateTouched(false); // le taux suit le live jusqu'à modification manuelle
    setRepeatWeekly(false);
    setSheetOpen(true);
  };

  const openEdit = (month: string, idx: number) => {
    const e = rev.months[month][idx];
    // Pré-remplit dans la devise d'origine (orig*) — saveEntry reconvertira en EUR
    // avec le même origRate → sauvegarder sans rien changer est neutre.
    if (e.currency && e.currency !== 'EUR' && e.origAmount != null) {
      setForm({ ...e, cashed: e.origAmount, contracted: e.origContracted ?? e.contracted });
    } else {
      setForm({ ...e, currency: 'EUR' });
    }
    setFormMonth(month);
    setEditIdx({ month, idx });
    setShowClientSugg(false);
    setRateTouched(true); // édition : taux historique conservé (bouton Live pour re-sync)
    setRepeatWeekly(false); // la récurrence ne s'applique qu'à la création
    setSheetOpen(true);
  };

  const saveEntry = () => {
    const monthKey = formMonth.trim().toUpperCase();
    if (!monthKey) return;
    // Les montants du form sont dans form.currency → conversion vers l'EUR stocké.
    // rate stocké = AED crédité ÷ EUR encaissé (dérivé) — USD : montant × taux de swap.
    const cur = form.currency || 'EUR';
    const perEur = perEurOf(form);
    const cashedEur = Math.round(((form.cashed || 0) / perEur) * 100) / 100;
    const aed = aedOf(form, form.cashed || 0);
    const effRate = cashedEur > 0 ? Math.round((aed / cashedEur) * 100000) / 100000 : (form.rate || liveRate);
    const entry: RevenuEntry = {
      ...form,
      currency: cur,
      contracted: Math.round(((form.contracted || 0) / perEur) * 100) / 100,
      cashed: cashedEur,
      origAmount: cur !== 'EUR' ? (form.cashed || 0) : undefined,
      origContracted: cur !== 'EUR' ? (form.contracted || 0) : undefined,
      origRate: cur !== 'EUR' ? perEur : undefined,
      origToAed: cur === 'USD' ? (form.origToAed || USD_AED_PEG) : undefined,
      rate: effRate,
    };
    const months = { ...(rev.months || {}) };
    if (!months[monthKey]) months[monthKey] = [];
    let added = 1;
    if (editIdx) {
      months[editIdx.month] = [...months[editIdx.month]];
      months[editIdx.month][editIdx.idx] = entry;
    } else {
      // Récurrence hebdo : copies indépendantes sur les autres mêmes jours du mois
      const clones = repeatWeekly
        ? repeatDates
            .filter(d => !months[monthKey].some(e => e.date === d && e.client === entry.client && e.cashed === entry.cashed))
            .map(d => ({ ...entry, date: d }))
        : [];
      months[monthKey] = [...months[monthKey], entry, ...clones];
      added += clones.length;
    }
    setState({ ...state, revenus: { ...rev, months } });
    setSheetOpen(false);
    save();
    const action = editIdx ? 'revenu.update' : 'revenu.add';
    const verb = editIdx ? 'Modif' : 'Ajout';
    const suffix = added > 1 ? ` ×${added} (récurrence hebdo)` : '';
    logChange?.(action, `${verb} revenu ${entry.client || '—'} · ${f$(entry.cashed || 0)} €${suffix} (${editIdx ? editIdx.month : monthKey})`);
  };

  const deleteEntry = (month: string, idx: number) => {
    if (!confirm('Supprimer cette entrée ?')) return;
    const months = { ...(rev.months || {}) };
    const removed = months[month][idx];
    months[month] = months[month].filter((_, i) => i !== idx);
    if (months[month].length === 0) delete months[month];
    setState({ ...state, revenus: { ...rev, months } });
    save();
    logChange?.('revenu.delete', `Suppr revenu ${removed?.client || '—'} · ${f$(removed?.cashed || 0)} € (${month})`);
  };

  const confirmEntry = (month: string, idx: number) => {
    const months = { ...(rev.months || {}) };
    months[month] = [...months[month]];
    const before = months[month][idx];
    // Rate rafraîchi au live UNIQUEMENT pour les entrées EUR (AED/USD : rate dérivé du swap)
    const isEur = !before?.currency || before.currency === 'EUR';
    months[month][idx] = { ...months[month][idx], status: 'confirmed', rate: isEur ? liveRate : (before?.rate || liveRate) };
    setState({ ...state, revenus: { ...rev, months } });
    save();
    logChange?.('revenu.confirm', `Confirm revenu ${before?.client || '—'} · ${f$(before?.cashed || 0)} € (${month})`);
  };

  useEffect(() => { if (!curTab && orderedMonths.length) setCurTab(orderedMonths[orderedMonths.length - 1]); }, [curTab, orderedMonths]);

  const goPrev = () => { if (curIdx > 0) setCurTab(orderedMonths[curIdx - 1]); };
  const goNext = () => { if (curIdx >= 0 && curIdx < orderedMonths.length - 1) setCurTab(orderedMonths[curIdx + 1]); };

  const curEntries = rev.months[effectiveTab] || [];
  const sortedEntries = useMemo(
    () => curEntries.map((e, i) => ({ e, i })).sort((a, b) => (b.e.date || '').localeCompare(a.e.date || '')),
    [curEntries]
  );

  const monthCashed = curEntries.filter(e => !e.status || e.status === 'confirmed').reduce((s, e) => s + (e.cashed || 0), 0);
  const monthContracted = curEntries.reduce((s, e) => s + (e.contracted || 0), 0);
  const monthPreview = curEntries.filter(e => e.status === 'preview').reduce((s, e) => s + (e.cashed || 0), 0);
  const obj = rev.objectif || 5000;
  const pctAtteinte = obj > 0 ? Math.round((monthCashed / obj) * 100) : 0;
  const delta = monthCashed - obj;

  if (orderedMonths.length === 0) {
    return (
      <div className="mt-10 text-center pb-20">
        <Receipt className="mx-auto text-t-4 mb-3" size={42} />
        <div className="text-t-2 font-semibold mb-1">Aucun revenu</div>
        <div className="text-[12px] text-t-3 mb-5">Ajoute ta première entrée pour commencer.</div>
        <button onClick={openAdd} className="px-5 py-2.5 bg-accent text-black font-semibold text-[13px] rounded-full">+ Nouveau revenu</button>
        <AddEditSheet
          open={sheetOpen} onClose={() => setSheetOpen(false)}
          form={form} setForm={setForm}
          formMonth={formMonth} setFormMonth={setFormMonth}
          orderedMonths={orderedMonths} categories={categories}
          filteredClientSugg={filteredClientSugg}
          showClientSugg={showClientSugg} setShowClientSugg={setShowClientSugg}
          onSave={saveEntry} isEdit={!!editIdx}
          rateFor={rateFor} liveRate={liveRate}
          perEurOf={perEurOf} aedOf={aedOf} usdPeg={USD_AED_PEG}
          rateTouched={rateTouched} setRateTouched={setRateTouched}
          repeatWeekly={repeatWeekly} setRepeatWeekly={setRepeatWeekly}
        />
      </div>
    );
  }

  return (
    <div className="pb-20">
      {/* Month navigator */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={goPrev} disabled={curIdx <= 0} className="w-10 h-10 flex items-center justify-center rounded-full bg-bg-3 border border-border text-t-2 disabled:opacity-30 active:bg-bg-4">
          <ChevronLeft size={18} />
        </button>
        <button
          onClick={() => setMonthPickerOpen(true)}
          className="flex-1 text-center bg-bg-3 border border-border-2 rounded-xl py-2.5 active:bg-bg-4"
        >
          <div className="text-[10px] uppercase tracking-wider text-t-4 font-semibold leading-none">Mois</div>
          <div className="text-[16px] font-bold tracking-tight mt-0.5">{effectiveTab || '—'}</div>
        </button>
        <button onClick={goNext} disabled={curIdx >= orderedMonths.length - 1} className="w-10 h-10 flex items-center justify-center rounded-full bg-bg-3 border border-border text-t-2 disabled:opacity-30 active:bg-bg-4">
          <ChevronRight size={18} />
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <KpiCardMobile label="Objectif" value={`${f$(obj)} €`} color="text-t-1" />
        <KpiCardMobile label="Encaissé" value={`${f$(monthCashed)} €`} sub={monthPreview > 0 ? `+${f$(monthPreview)} prév.` : undefined} color="text-accent" />
        <KpiCardMobile label="Contracté" value={`${f$(monthContracted)} €`} color="text-info" />
        <KpiCardMobile label={delta >= 0 ? 'Atteinte' : 'Delta'} value={delta >= 0 ? `${pctAtteinte}%` : `${f$(delta)} €`} color={delta >= 0 ? 'text-accent' : 'text-danger'} />
      </div>

      {/* Progress bar */}
      <div className="bg-bg-3 border border-border rounded-xl p-3 mb-5">
        <div className="flex items-center justify-between text-[11px] mb-2">
          <span className="text-t-3 uppercase tracking-wider font-semibold">Progression {effectiveTab}</span>
          <span className="text-t-1 font-mono mono-value">{pctAtteinte}%</span>
        </div>
        <div className="h-2 bg-bg-2 rounded-full overflow-hidden">
          <div
            className={`h-full ${pctAtteinte >= 100 ? 'bg-accent' : pctAtteinte >= 75 ? 'bg-warning' : 'bg-info'}`}
            style={{ width: `${Math.min(100, pctAtteinte)}%` }}
          />
        </div>
      </div>

      {/* Transactions list */}
      <div className="flex items-center justify-between mb-2.5 px-1">
        <span className="text-[11px] uppercase tracking-wider text-t-3 font-semibold">Transactions ({curEntries.length})</span>
      </div>
      {curEntries.length === 0 ? (
        <div className="text-center py-8 text-t-4 text-[12px]">Aucune transaction ce mois</div>
      ) : (
        <div className="space-y-2">
          {sortedEntries.map(({ e, i }) => {
            const status = e.status || 'confirmed';
            const style = STATUS_COLORS[status];
            const cat = e.cat || '';
            const catIdx = categories.indexOf(cat);
            const catColor = REV_COLORS[(catIdx >= 0 ? catIdx : 0) % REV_COLORS.length];
            const isConfirmed = status === 'confirmed';
            return (
              <div key={i} className={`bg-bg-3 border border-border border-l-[3px] ${style.row} rounded-xl p-3.5 ${status !== 'confirmed' ? 'opacity-90' : ''}`}>
                <div className="flex items-start gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                      <span className="text-[14px] font-semibold tracking-tight truncate">{e.client || '—'}</span>
                      <span className={`text-[9px] font-semibold tracking-[0.05em] px-1.5 py-[2px] rounded ${style.badge}`}>{style.label}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-t-3 flex-wrap">
                      <span>{e.date || '—'}</span>
                      {cat && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: `${catColor}22`, color: catColor }}>
                          {cat}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-[15px] font-bold mono-value ${status === 'preview' ? 'text-info' : status === 'pending' ? 'text-warning' : 'text-accent'}`}>{f$(e.cashed || 0)} €</div>
                    {e.currency && e.currency !== 'EUR' && e.origAmount != null && (
                      <div className="text-[10px] text-t-4 mono-value">{f$(e.origAmount)} {e.currency}</div>
                    )}
                    {(e.contracted || 0) !== (e.cashed || 0) && (
                      <div className="text-[10px] text-t-4 mono-value">contrat. {f$(e.contracted || 0)} €</div>
                    )}
                  </div>
                </div>
                {e.comment && <div className="text-[11px] text-t-3 mb-2 break-words">{e.comment}</div>}
                <div className="flex justify-end gap-1.5">
                  {!isConfirmed && (
                    <button onClick={() => confirmEntry(effectiveTab, i)} className="w-9 h-9 flex items-center justify-center rounded-full bg-accent/10 text-accent border border-accent/25 active:bg-accent/20">
                      <Check size={15} />
                    </button>
                  )}
                  <button onClick={() => openEdit(effectiveTab, i)} className="w-9 h-9 flex items-center justify-center rounded-full bg-info/10 text-info border border-info/25 active:bg-info/20">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => deleteEntry(effectiveTab, i)} className="w-9 h-9 flex items-center justify-center rounded-full bg-danger/10 text-danger border border-danger/25 active:bg-danger/20">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* FAB */}
      <button
        onClick={openAdd}
        className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+76px)] w-14 h-14 rounded-full bg-accent text-black shadow-lg flex items-center justify-center active:scale-95 transition-transform z-30"
        aria-label="Nouveau revenu"
      >
        <Plus size={26} strokeWidth={2.4} />
      </button>

      {/* Month picker sheet */}
      <BottomSheet open={monthPickerOpen} onClose={() => setMonthPickerOpen(false)} title="Choisir un mois">
        <div className="grid grid-cols-3 gap-2 py-1">
          {orderedMonths.map(m => {
            const active = m === effectiveTab;
            const entries = rev.months[m] || [];
            const total = entries.filter(e => !e.status || e.status === 'confirmed').reduce((s, e) => s + (e.cashed || 0), 0);
            return (
              <button
                key={m}
                onClick={() => { setCurTab(m); setMonthPickerOpen(false); }}
                className={`py-3 rounded-xl border text-center transition-colors ${active ? 'bg-accent/15 border-accent text-accent' : 'bg-bg-3 border-border text-t-2 active:bg-bg-4'}`}
              >
                <div className="text-[12px] font-bold">{m}</div>
                <div className="text-[9px] mt-0.5 mono-value opacity-80">{f$(total)} €</div>
              </button>
            );
          })}
        </div>
      </BottomSheet>

      {/* Add/Edit sheet */}
      <AddEditSheet
        open={sheetOpen} onClose={() => setSheetOpen(false)}
        form={form} setForm={setForm}
        formMonth={formMonth} setFormMonth={setFormMonth}
        orderedMonths={orderedMonths} categories={categories}
        filteredClientSugg={filteredClientSugg}
        showClientSugg={showClientSugg} setShowClientSugg={setShowClientSugg}
        onSave={saveEntry} isEdit={!!editIdx}
        rateFor={rateFor} liveRate={liveRate}
        perEurOf={perEurOf} aedOf={aedOf} usdPeg={USD_AED_PEG}
        rateTouched={rateTouched} setRateTouched={setRateTouched}
        repeatWeekly={repeatWeekly} setRepeatWeekly={setRepeatWeekly}
      />
    </div>
  );
}

function KpiCardMobile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-bg-3 border border-border rounded-xl px-3 py-2.5">
      <div className="text-[9px] uppercase tracking-wider text-t-3 font-semibold leading-none">{label}</div>
      <div className={`text-[15px] font-bold mt-1 mono-value tracking-tight truncate ${color || 'text-t-1'}`}>{value}</div>
      {sub && <div className="text-[10px] text-t-4 mono-value mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

function AddEditSheet({
  open, onClose, form, setForm, formMonth, setFormMonth, orderedMonths, categories,
  filteredClientSugg, showClientSugg, setShowClientSugg, onSave, isEdit, rateFor, liveRate,
  perEurOf, aedOf, usdPeg, rateTouched, setRateTouched, repeatWeekly, setRepeatWeekly,
}: {
  open: boolean; onClose: () => void;
  form: RevenuEntry; setForm: (f: RevenuEntry) => void;
  formMonth: string; setFormMonth: (v: string) => void;
  orderedMonths: string[]; categories: string[];
  filteredClientSugg: { name: string; count: number }[];
  showClientSugg: boolean; setShowClientSugg: (v: boolean) => void;
  onSave: () => void; isEdit: boolean;
  rateFor: (c?: string) => number; liveRate: number;
  perEurOf: (f: RevenuEntry) => number; aedOf: (f: RevenuEntry, amount: number) => number;
  usdPeg: number; rateTouched: boolean; setRateTouched: (v: boolean) => void;
  repeatWeekly: boolean; setRepeatWeekly: (v: boolean) => void;
}) {
  // Allow creating a new month inline
  const allMonths = useMemo(() => {
    const set = new Set([...orderedMonths, ...MOIS_LIST]);
    return Array.from(set);
  }, [orderedMonths]);

  return (
    <BottomSheet open={open} onClose={onClose} title={isEdit ? 'Modifier le revenu' : 'Nouveau revenu'}>
      <div className="space-y-3 pt-1">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] text-t-3 uppercase tracking-wider font-semibold mb-1.5">Mois</label>
            <select className="fi !h-11" value={formMonth} onChange={e => setFormMonth(e.target.value)}>
              {allMonths.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-t-3 uppercase tracking-wider font-semibold mb-1.5">Date</label>
            <input className="fi !h-11" type="date" value={form.date || ''} onChange={e => setForm({ ...form, date: e.target.value })} />
          </div>
        </div>

        {!isEdit && form.date && (() => {
          const wd = new Date(`${form.date}T00:00:00`);
          const wdName = isNaN(wd.getTime()) ? '' : wd.toLocaleDateString('fr-FR', { weekday: 'long' });
          const all = sameWeekdayDatesInMonth(form.date);
          return (
            <button
              type="button"
              onClick={() => setRepeatWeekly(!repeatWeekly)}
              className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${repeatWeekly ? 'bg-accent/10 border-accent/40' : 'bg-bg-4 border-border'}`}
            >
              <div className="flex items-center gap-2">
                <span className={`w-4 h-4 rounded-[4px] border flex items-center justify-center text-[10px] font-bold shrink-0 ${repeatWeekly ? 'bg-accent border-accent text-black' : 'border-border-2 text-transparent'}`}>✓</span>
                <span className={`text-[12px] font-medium ${repeatWeekly ? 'text-accent' : 'text-t-2'}`}>Répéter chaque {wdName} du mois</span>
              </div>
              <div className="text-[10px] text-t-4 mt-1 pl-6">
                {all.length === 0
                  ? `Aucun autre ${wdName} ce mois-ci`
                  : repeatWeekly
                    ? `+${all.length} entrée${all.length > 1 ? 's' : ''} : ${all.map(d => d.slice(8)).join(', ')}`
                    : `${all.length} autre${all.length > 1 ? 's' : ''} ce mois-ci`}
              </div>
            </button>
          );
        })()}

        <div>
          <label className="block text-[10px] text-t-3 uppercase tracking-wider font-semibold mb-1.5">Client</label>
          <div className="relative">
            <input
              className="fi !h-11"
              value={form.client || ''}
              onChange={e => { setForm({ ...form, client: e.target.value }); setShowClientSugg(true); }}
              onFocus={() => setShowClientSugg(true)}
              onBlur={() => setTimeout(() => setShowClientSugg(false), 150)}
              placeholder="Nom du client"
              autoComplete="off"
            />
            {showClientSugg && filteredClientSugg.length > 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-bg-3 border border-border-2 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {filteredClientSugg.map(s => (
                  <button
                    key={s.name}
                    type="button"
                    onMouseDown={e => { e.preventDefault(); setForm({ ...form, client: s.name }); setShowClientSugg(false); }}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-[13px] text-t-1 active:bg-bg-4"
                  >
                    <span className="truncate">{s.name}</span>
                    <span className="text-[10px] text-t-3 shrink-0">×{s.count}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="block text-[10px] text-t-3 uppercase tracking-wider font-semibold mb-1.5">Catégorie</label>
          <select className="fi !h-11" value={form.cat || ''} onChange={e => setForm({ ...form, cat: e.target.value })}>
            <option value="">—</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-[10px] text-t-3 uppercase tracking-wider font-semibold mb-1.5">Statut</label>
          <div className="flex bg-bg-4 rounded-lg p-1">
            {(['confirmed', 'preview', 'pending'] as const).map(s => (
              <button
                key={s}
                onClick={() => setForm({ ...form, status: s })}
                className={`flex-1 py-2 text-[11px] font-semibold rounded-md transition-all ${form.status === s ? 'bg-bg-2 text-t-1 shadow-sm' : 'text-t-3'}`}
              >
                {s === 'confirmed' ? '✓ Confirmé' : s === 'preview' ? '⏳ Prév.' : '⌛ Attente'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[10px] text-t-3 uppercase tracking-wider font-semibold mb-1.5">Devise reçue</label>
          <div className="flex bg-bg-4 rounded-lg p-1">
            {(['EUR', 'AED', 'USD'] as const).map(c => (
              <button
                key={c}
                onClick={() => setForm({
                  ...form,
                  currency: c,
                  origRate: c === 'EUR' ? undefined : rateFor(c),
                  origToAed: c === 'USD' ? (form.origToAed ?? usdPeg) : undefined,
                })}
                className={`flex-1 py-2 text-[11px] font-semibold rounded-md transition-all ${(form.currency || 'EUR') === c ? 'bg-bg-2 text-t-1 shadow-sm' : 'text-t-3'}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] text-t-3 uppercase tracking-wider font-semibold mb-1.5">Contracté ({form.currency || 'EUR'})</label>
            <input className="fi !h-11 mono-value" type="number" inputMode="decimal" value={form.contracted || ''} onChange={e => setForm({ ...form, contracted: parseFloat(e.target.value) || 0 })} step="0.01" placeholder="0" />
          </div>
          <div>
            <label className="block text-[10px] text-t-3 uppercase tracking-wider font-semibold mb-1.5">Encaissé ({form.currency || 'EUR'})</label>
            <input className="fi !h-11 mono-value" type="number" inputMode="decimal" value={form.cashed || ''} onChange={e => setForm({ ...form, cashed: parseFloat(e.target.value) || 0 })} step="0.01" placeholder="0" />
          </div>
        </div>

        {(form.cashed || 0) > 0 && (() => {
          const cur = form.currency || 'EUR';
          const perEur = perEurOf(form);
          const eur = (form.cashed || 0) / perEur;
          const aed = aedOf(form, form.cashed || 0);
          return (
            <div className="text-[11px] text-t-3 bg-bg-2 rounded-lg p-2.5 flex items-center justify-between gap-3">
              <span>Équivalent{cur !== 'EUR' ? ` · EUR/${cur} ${perEur.toFixed(4)}` : ''}</span>
              <span className="text-t-1 mono-value font-semibold">
                {cur !== 'EUR' && <>{f$(eur)} € · </>}{f0(aed)} AED
              </span>
            </div>
          );
        })()}

        {(form.currency || 'EUR') === 'USD' ? (
          <div>
            <label className="block text-[10px] text-t-3 uppercase tracking-wider font-semibold mb-1.5">Taux USD/AED (ton taux de swap)</label>
            <input
              className="fi !h-11 mono-value"
              type="number"
              inputMode="decimal"
              value={form.origToAed ?? usdPeg}
              onChange={e => setForm({ ...form, origToAed: parseFloat(e.target.value) || 0 })}
              step="0.0001"
              placeholder="3.6725"
            />
          </div>
        ) : (
          <div>
            <label className="block text-[10px] text-t-3 uppercase tracking-wider font-semibold mb-1.5">Taux EUR/AED</label>
            <div className="flex gap-2">
              <input
                className="fi !h-11 mono-value flex-1"
                type="number"
                inputMode="decimal"
                value={form.rate}
                onChange={e => { setForm({ ...form, rate: parseFloat(e.target.value) || 0 }); setRateTouched(true); }}
                step="0.0001"
              />
              <button
                type="button"
                onClick={() => { setForm({ ...form, rate: liveRate }); setRateTouched(false); }}
                className={`text-[10px] px-3 rounded-lg border shrink-0 ${!rateTouched ? 'text-accent bg-accent/10 border-accent/30' : 'text-t-3 bg-bg-2 border-border active:text-t-1'}`}
              >
                {rateTouched ? '↻ Live' : '● Live'}
              </button>
            </div>
          </div>
        )}

        <div>
          <label className="block text-[10px] text-t-3 uppercase tracking-wider font-semibold mb-1.5">Commentaire (optionnel)</label>
          <input className="fi !h-11" value={form.comment || ''} onChange={e => setForm({ ...form, comment: e.target.value })} placeholder="Détails..." />
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 py-3 bg-bg-4 text-t-2 text-[14px] font-semibold rounded-full active:bg-bg-3">Annuler</button>
          <button onClick={onSave} disabled={!form.client?.trim()} className="flex-[1.4] py-3 bg-accent text-black text-[14px] font-bold rounded-full active:opacity-80 disabled:opacity-30">
            {isEdit ? 'Enregistrer' : 'Ajouter'}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
