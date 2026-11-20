'use client';

import { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useApp } from '@/context/AppProvider';
import { Month } from '@/lib/types';
import { f$, f0, rowEur, sumEurBudget, sumEur, sumAed, startedMonths } from '@/lib/utils';
import { applyRegul, clearRegul } from '@/lib/regul';
import { addCustomRow, CustomRowForm } from '@/lib/trackerOps';
import { useTrackerFigures } from '@/lib/useTrackerFigures';
import { chartTheme, chartTooltipStyle } from '@/lib/chartTheme';
import { CAT_LABELS, PIE_COLORS } from '@/lib/constants';
import { monthLabel } from '@/lib/labels';
import BudgetBalanceCard from '@/components/BudgetBalanceCard';
import RegulHistory from '@/components/RegulHistory';
import BottomSheet from '../BottomSheet';
import { MButton, MCard, MDivider, MField, MLabel, MPill, MRow, MSeg } from '../ui';
import AmountSheet, { parseAmount } from './AmountSheet';

// Sous 1 unité on garde les centimes : un ajustement de −0,30 s'affichait « −0 »
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n) > 0 && Math.abs(n) < 1 ? f$(Math.abs(n)) : f0(Math.abs(n))}`;

/** Comment le solde prévisionnel est obtenu, avec les montants modifiables. */
export function SoldeSheet({ open, onClose, month: m, onRegul }: { open: boolean; onClose: () => void; month: Month; onRegul: () => void }) {
  const { updateMonth, activeSpace } = useApp();
  const cur = activeSpace?.localCurrency || 'AED';
  const F = useTrackerFigures(m);
  const [edit, setEdit] = useState<'soldeStart' | 'soldeEnd' | 'earn' | null>(null);
  const num = (v: string, cls = '') => <span className={`mono-value ${cls}`}>{v}</span>;
  return (
    <>
      <BottomSheet open={open} onClose={onClose} title="Solde prévisionnel" subtitle={monthLabel(m)} footer={<MButton onClick={() => { onClose(); onRegul(); }}>Régulariser avec le solde réel</MButton>}>
        <MCard surface="sheet" className="mb-3">
          <MRow title="Solde de départ" right={num(`${f0(m.soldeStart || 0)} ${cur}`)} chevron onClick={() => setEdit('soldeStart')} />
          <MDivider />
          {F.synced
            ? <MRow title="Revenus confirmés" sub={<span className="mono-value">{f$(F.earnEur)} €</span>} right={num(`+${f0(F.earnAed)} ${cur}`, 'text-accent')} />
            : <MRow title="Revenus" sub="Mois saisi à la main, en euros" right={num(`${f$(m.earn || 0)} €`, 'text-accent')} chevron onClick={() => setEdit('earn')} />}
          <MDivider />
          <MRow title="Dépenses" sub="Hors dépenses de voyage" right={num(`−${f0(F.aABank)} ${cur}`)} />
          {F.adjustment !== 0 && (
            <>
              <MDivider />
              <MRow title="Ajustement" sub="Écart constaté lors d’une régul" right={num(`${signed(F.adjustment)} ${cur}`, F.adjustment > 0 ? 'text-accent' : 'text-warning')} />
            </>
          )}
          <MDivider />
          <MRow title={<span className="font-semibold">Prévisionnel</span>} right={num(`${f0(F.prevCompte)} ${cur}`, `font-semibold ${F.prevCompte >= 0 ? 'text-t-1' : 'text-danger'}`)} />
          {F.synced && F.previewEur > 0 && (
            <>
              <MDivider />
              <MRow title="Optimiste" sub={<span className="mono-value">si {f$(F.previewEur)} € prévus sont encaissés</span>} right={num(`${f0(F.prevOpti)} ${cur}`, 'text-info')} />
            </>
          )}
        </MCard>
        <MCard surface="sheet">
          <MRow title="Solde de fin constaté" sub="Note libre, n’entre dans aucun calcul" right={num(`${f0(m.soldeEnd || 0)} ${cur}`)} chevron onClick={() => setEdit('soldeEnd')} />
        </MCard>
      </BottomSheet>
      <AmountSheet open={edit === 'soldeStart'} onClose={() => setEdit(null)} title="Solde de départ" subtitle={monthLabel(m)} initial={m.soldeStart || 0} currencies={[cur]} onSave={v => updateMonth(m.id, 'soldeStart', v)} />
      <AmountSheet open={edit === 'soldeEnd'} onClose={() => setEdit(null)} title="Solde de fin constaté" subtitle={monthLabel(m)} initial={m.soldeEnd || 0} currencies={[cur]} onSave={v => updateMonth(m.id, 'soldeEnd', v)} />
      <AmountSheet open={edit === 'earn'} onClose={() => setEdit(null)} title="Revenus du mois" subtitle={monthLabel(m)} initial={m.earn || 0} currencies={['EUR']} onSave={v => updateMonth(m.id, 'earn', v)} />
    </>
  );
}

/** Régularisation : on saisit le solde réel du compte, l'écart devient l'ajustement du mois. */
export function RegulSheet({ open, onClose, month: m }: { open: boolean; onClose: () => void; month: Month }) {
  const { state, setState, save, logChange, activeSpace } = useApp();
  const cur = activeSpace?.localCurrency || 'AED';
  const F = useTrackerFigures(m);
  const [text, setText] = useState('');
  useEffect(() => {
    if (open) setText(F.prevCompte.toFixed(0));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const real = parseAmount(text);
  const ok = text.trim() !== '' && isFinite(real);
  const delta = real - F.prevCompte;

  const apply = () => {
    if (!ok) return;
    const next = applyRegul(m, real, F.prevSansAjust);
    setState({ ...state, months: state.months.map(mo => (mo.id === m.id ? next : mo)) });
    save();
    const adj = next.adjustment || 0;
    logChange?.('month.update', `Régul ${m.id}: balance réelle ${f0(real)} AED, ajustement ${adj >= 0 ? '+' : ''}${f0(adj)} AED`);
    onClose();
  };
  const clear = () => {
    setState({ ...state, months: state.months.map(mo => (mo.id === m.id ? clearRegul(mo) : mo)) });
    save();
    logChange?.('month.update', `Régul ${m.id}: ajustement retiré`);
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Régulariser" subtitle="Le solde réel de ton compte, là, maintenant" footer={<MButton disabled={!ok} onClick={apply}>Appliquer</MButton>}>
      <div className="flex flex-col items-center pt-2 pb-4">
        <input className="m-input m-amount mono-value text-center px-6" inputMode="decimal" autoFocus value={text} onChange={e => setText(e.target.value)} placeholder="0" aria-label="Solde réel du compte" />
        <div className="text-[13px] text-t-3 mt-1">{cur}</div>
      </div>
      <MCard surface="sheet" className="mb-3">
        <MRow className="!min-h-[48px]" title={<span className="text-[14px] text-t-2 font-normal">Prévisionnel calculé</span>} right={<span className="mono-value text-[14px]">{f0(F.prevCompte)} {cur}</span>} />
        <MDivider />
        <MRow
          className="!min-h-[48px]"
          title={<span className="text-[14px] text-t-2 font-normal">Écart à appliquer</span>}
          right={<span className={`mono-value text-[14px] ${!ok || Math.abs(delta) < 0.5 ? 'text-t-3' : delta > 0 ? 'text-accent' : 'text-warning'}`}>{ok ? `${signed(delta)} ${cur}` : '—'}</span>}
        />
        {F.adjustment !== 0 && (
          <>
            <MDivider />
            <MRow className="!min-h-[48px]" title={<span className="text-[14px] text-t-2 font-normal">Ajustement déjà en place</span>} right={<span className="mono-value text-[14px]">{signed(F.adjustment)} {cur}</span>} />
          </>
        )}
      </MCard>
      <RegulHistory month={m} currency={cur} />
      {F.adjustment !== 0 && (
        <button type="button" onClick={clear} className="w-full h-12 mt-2 text-[15px] font-medium text-warning active:opacity-60">Retirer l’ajustement</button>
      )}
    </BottomSheet>
  );
}

const CATS = ['vital', 'lifestyle', 'logement', 'finance'] as const;

/** « Ajouter un poste » : ponctuel (ce mois) ou permanent, côté budget ou côté réel. */
export function AddPosteSheet({ open, onClose, month: m }: { open: boolean; onClose: () => void; month: Month }) {
  const { state, setState, save, logChange, activeSpace } = useApp();
  const cur = activeSpace?.localCurrency || 'AED';
  const [f, setF] = useState<CustomRowForm>({ section: 'budget', name: '', cat: 'vital', aed: 0, eur: 0, scope: 'month', isAed: true });
  const [aed, setAed] = useState('');
  const [eur, setEur] = useState('');
  useEffect(() => {
    if (!open) return;
    setF({ section: 'budget', name: '', cat: 'vital', aed: 0, eur: 0, scope: 'month', isAed: true });
    setAed(''); setEur('');
  }, [open]);

  const submit = () => {
    const r = addCustomRow(state, m.id, { ...f, aed: parseAmount(aed) || 0, eur: parseAmount(eur) || 0 });
    setState(r.state);
    save();
    r.logs.forEach(l => logChange?.(l.action, l.detail));
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Ajouter un poste" footer={<MButton disabled={!f.name.trim()} onClick={submit}>Ajouter</MButton>}>
      <MSeg className="w-full mb-2" value={f.scope} options={[['month', 'Ce mois uniquement'], ['permanent', 'Tous les mois']] as const} onChange={v => setF({ ...f, scope: v })} />
      <p className="text-[12px] text-t-4 px-4 pb-3 leading-relaxed">{f.scope === 'month' ? `Apparaît uniquement dans ${monthLabel(m)}.` : 'Apparaît dans tous les mois, présents et futurs.'}</p>
      <MCard surface="sheet">
        <MField label="Nom">
          <input className="m-input text-right uppercase" value={f.name} onChange={e => setF({ ...f, name: e.target.value.toUpperCase() })} placeholder="PARFUMS" />
        </MField>
        <MDivider />
        <MField label="Catégorie">
          <select className="m-input text-right" dir="rtl" value={f.cat} onChange={e => setF({ ...f, cat: e.target.value as CustomRowForm['cat'] })}>
            {CATS.map(c => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
          </select>
        </MField>
        <MDivider />
        <MField label="Le montant est">
          <MSeg surface="page" value={f.section} options={[['budget', 'Un budget'], ['actual', 'Déjà dépensé']] as const} onChange={v => setF({ ...f, section: v })} />
        </MField>
        {f.scope === 'permanent' && (
          <>
            <MDivider />
            <MField label="Devise principale">
              <MSeg surface="page" value={f.isAed ? 'AED' : 'EUR'} options={[['AED', cur], ['EUR', 'EUR']] as const} onChange={v => setF({ ...f, isAed: v === 'AED' })} />
            </MField>
          </>
        )}
        <MDivider />
        <MField label={`Montant en ${cur}`}>
          <input className="m-input text-right mono-value" inputMode="decimal" value={aed} onChange={e => setAed(e.target.value)} placeholder="0" />
        </MField>
        <MDivider />
        <MField label="Montant en EUR">
          <input className="m-input text-right mono-value" inputMode="decimal" value={eur} onChange={e => setEur(e.target.value)} placeholder="0" />
        </MField>
      </MCard>
    </BottomSheet>
  );
}

/** Bilan du mois par rapport au budget (même carte que le desktop). */
export function BilanSheet({ open, onClose, month: m }: { open: boolean; onClose: () => void; month: Month }) {
  const { state, liveRate } = useApp();
  const F = useTrackerFigures(m);
  return (
    <BottomSheet open={open} onClose={onClose} title="Bilan du mois" subtitle={monthLabel(m)} fullHeight>
      <BudgetBalanceCard month={m} postes={state.postes} liveRate={liveRate} compact forecast={{ earnEur: F.earnEur, previewEur: F.previewEur, previewAed: F.previewAed, prevCompteAed: F.prevCompte, pocketEur: F.pocketEur }} />
    </BottomSheet>
  );
}

/** Graphiques du mois : répartition du budget, du réel, et budget face au réel par poste. */
export function ChartsSheet({ open, onClose, month: m }: { open: boolean; onClose: () => void; month: Month }) {
  const { state, liveRate, theme } = useApp();
  const ct = chartTheme(theme);
  const tip = chartTooltipStyle(theme);
  const budget = state.postes.map((p, i) => ({ name: p.name, value: rowEur(m.budget[i] || { aed: 0, eur: null }, liveRate) })).filter(d => d.value > 0);
  const actual = state.postes.map((p, i) => ({ name: p.name, value: rowEur(m.actual[i] || { aed: 0, eur: null }, m.rate) })).filter(d => d.value > 0);
  const compare = state.postes.map((p, i) => ({
    name: p.name.slice(0, 9),
    Budget: Math.round(rowEur(m.budget[i] || { aed: 0, eur: null }, liveRate)),
    Réel: Math.round(rowEur(m.actual[i] || { aed: 0, eur: null }, m.rate)),
  })).filter(d => d.Budget > 0 || d.Réel > 0);

  const pie = (title: string, data: { name: string; value: number }[]) => {
    const total = data.reduce((s, d) => s + d.value, 0);
    return (
      <div className="mb-4">
        <MLabel>{title}</MLabel>
        <MCard surface="sheet" className="p-3">
          {data.length === 0 ? <div className="text-center text-[13px] text-t-3 py-6">Rien à afficher</div> : (
            <>
              <ResponsiveContainer width="100%" height={170}>
                <PieChart>
                  <Pie data={data} dataKey="value" cx="50%" cy="50%" innerRadius={44} outerRadius={74} paddingAngle={2} stroke="none">
                    {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={v => `${f$(Number(v))} €`} contentStyle={tip} />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 px-1 pt-1">
                {[...data].map((d, i) => ({ ...d, i })).sort((a, b) => b.value - a.value).slice(0, 8).map(d => (
                  <div key={d.name} className="flex items-center gap-2 min-w-0 text-[12px]">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PIE_COLORS[d.i % PIE_COLORS.length] }} />
                    <span className="text-t-2 truncate flex-1">{d.name}</span>
                    <span className="text-t-3 mono-value shrink-0">{total > 0 ? Math.round((d.value / total) * 100) : 0} %</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </MCard>
      </div>
    );
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Graphiques" subtitle={monthLabel(m)} fullHeight>
      {pie('Répartition du réel', actual)}
      {pie('Répartition du budget', budget)}
      <MLabel>Budget face au réel (€)</MLabel>
      <MCard surface="sheet" className="p-2 mb-2">
        <ResponsiveContainer width="100%" height={Math.max(160, compare.length * 34 + 50)}>
          <BarChart data={compare} layout="vertical" margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} horizontal={false} />
            <XAxis type="number" tick={{ fill: ct.tick, fontSize: 11 }} />
            <YAxis type="category" dataKey="name" tick={{ fill: ct.tick, fontSize: 11 }} width={78} />
            <Tooltip contentStyle={tip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Budget" fill="rgba(59,130,246,0.45)" radius={4} />
            <Bar dataKey="Réel" fill="rgba(236,72,153,0.55)" radius={4} />
          </BarChart>
        </ResponsiveContainer>
      </MCard>
    </BottomSheet>
  );
}

/** Totaux sur une période de plusieurs mois (les mois pas encore commencés ne comptent pas). */
export function PeriodSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, liveRate, curYear, activeSpace } = useApp();
  const cur = activeSpace?.localCurrency || 'AED';
  const list = curYear === 'all' ? state.months : state.months.filter(m => m._year === parseInt(curYear));
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(0);
  useEffect(() => {
    if (open) { setFrom(0); setTo(Math.max(0, list.length - 1)); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, curYear]);

  const last = list.length - 1;
  const preset = (p: string) => {
    if (list.length === 0) return;
    let a = 0, b = last;
    if (p === 'T1') { a = 0; b = Math.min(2, last); }
    else if (p === 'T2') { a = Math.min(3, last); b = Math.min(5, last); }
    else if (p === 'S1') { a = 0; b = Math.min(5, last); }
    else if (p === 'S2') { a = Math.min(6, last); b = last; }
    setFrom(a); setTo(b);
  };
  const started = new Set(startedMonths(state.months).map(m => m.id));
  const sel = list.slice(Math.min(from, to), Math.max(from, to) + 1).filter(m => started.has(m.id));
  const budget = sel.reduce((s, m) => s + sumEurBudget(m, state.postes, liveRate), 0);
  const spent = sel.reduce((s, m) => s + sumEur(m, state.postes, m.extraActual), 0);
  const spentAed = sel.reduce((s, m) => s + sumAed(m, state.postes, m.extraActual), 0);
  const gap = budget - spent;
  const opt = (m: Month, i: number) => <option key={m.id} value={i}>{monthLabel(m)}</option>;

  return (
    <BottomSheet open={open} onClose={onClose} title="Totaux sur une période" subtitle={curYear === 'all' ? 'Tous les mois' : `Année ${curYear}`}>
      <MCard surface="sheet" className="mb-3">
        <MField label="Du"><select className="m-input text-right" dir="rtl" value={from} onChange={e => setFrom(parseInt(e.target.value))}>{list.map(opt)}</select></MField>
        <MDivider />
        <MField label="Au"><select className="m-input text-right" dir="rtl" value={to} onChange={e => setTo(parseInt(e.target.value))}>{list.map(opt)}</select></MField>
      </MCard>
      <div className="flex gap-2 overflow-x-auto m-noscroll -mx-4 px-4 pb-4">
        {[['T1', '1er trimestre'], ['T2', '2e trimestre'], ['S1', '1er semestre'], ['S2', '2e semestre'], ['YTD', 'Tout']].map(([k, l]) => (
          <MPill key={k} surface="sheet" onClick={() => preset(k)}>{l}</MPill>
        ))}
      </div>
      <MCard surface="sheet">
        <MRow title="Total dépensé" sub={<span className="mono-value">{f0(spentAed)} {cur}</span>} right={<span className="mono-value">{f$(spent)} €</span>} />
        <MDivider />
        <MRow title="Total budget" right={<span className="mono-value">{f$(budget)} €</span>} />
        <MDivider />
        <MRow title="Dépense moyenne par mois" sub={`${sel.length} mois commencé${sel.length > 1 ? 's' : ''}`} right={<span className="mono-value">{f$(sel.length > 0 ? spent / sel.length : 0)} €</span>} />
        <MDivider />
        <MRow title="Écart au budget" right={<span className={`mono-value ${gap >= 0 ? 'text-accent' : 'text-danger'}`}>{gap >= 0 ? '+' : ''}{f$(gap)} €</span>} />
      </MCard>
    </BottomSheet>
  );
}
