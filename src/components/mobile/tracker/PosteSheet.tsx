'use client';

import { useState } from 'react';
import { EyeOff, Trash2, Plus } from 'lucide-react';
import { useApp } from '@/context/AppProvider';
import { useDialog } from '@/components/ui/Dialog';
import { Month, Transaction } from '@/lib/types';
import { f$, f0, toEur, toAed, rowEur, rowAedSpent, budgetEurOf, budgetAedOf, budgetIsEurRef, shortMonth, todayISO } from '@/lib/utils';
import { setBudget, setActual, setExtraBudgetByName, hidePoste, removeExtraByName, TxnTarget } from '@/lib/trackerOps';
import { dayLabel, monthLabel } from '@/lib/labels';
import BottomSheet from '../BottomSheet';
import { MBadge, MBar, MButton, MCard, MDivider, MLabel, MRow } from '../ui';
import AmountSheet from './AmountSheet';
import PosteIcon from './PosteIcon';

export type PosteSel = { kind: 'poste'; idx: number } | { kind: 'extra'; name: string };

/** Regroupe des transactions par jour, les plus récentes d'abord (index d'origine conservé). */
export function groupByDay<T extends { t: Transaction }>(items: T[]): { day: string; items: T[]; total: number }[] {
  const sorted = items.map((it, k) => ({ it, k })).sort((a, b) => (b.it.t.date || '').localeCompare(a.it.t.date || '') || b.k - a.k);
  const groups: { day: string; items: T[]; total: number }[] = [];
  sorted.forEach(({ it }) => {
    const day = (it.t.date || '').slice(0, 10);
    const g = groups[groups.length - 1];
    if (g && g.day === day) { g.items.push(it); g.total += it.t.amount || 0; }
    else groups.push({ day, items: [it], total: it.t.amount || 0 });
  });
  return groups;
}

/**
 * Détail d'un poste (régulier ou ponctuel) pour le mois affiché : consommation du budget,
 * opérations jour par jour, historique, et réglages du poste pour ce mois.
 */
export default function PosteSheet({ open, onClose, month: m, sel, unit, onAdd, onEdit }: {
  open: boolean; onClose: () => void; month: Month; sel: PosteSel | null; unit: 'local' | 'eur';
  onAdd: (t: TxnTarget) => void; onEdit: (t: TxnTarget) => void;
}) {
  const { state, setState, save, getState, logChange, liveRate, activeSpace } = useApp();
  const { confirm } = useDialog();
  const cur = activeSpace?.localCurrency || 'AED';
  const [edit, setEdit] = useState<'budget' | 'actual' | null>(null);
  const [allHist, setAllHist] = useState(false);
  const today = todayISO();

  const isExtra = sel?.kind === 'extra';
  const idx = sel?.kind === 'poste' ? sel.idx : -1;
  const p = idx >= 0 ? state.postes[idx] : undefined;
  const ai = isExtra ? (m.extraActual || []).findIndex(r => r.name === sel.name) : -1;
  const ex = ai >= 0 ? m.extraActual[ai] : undefined;
  const exB = isExtra ? (m.extraBudget || []).find(b => b.name === sel.name) : undefined;
  const name = isExtra ? sel.name : p?.name || '';
  const cat = isExtra ? (ex?.cat || exB?.cat || '') : p?.cat || '';

  // Réel
  const aRow = isExtra ? undefined : (m.actual[idx] || { aed: 0, eur: null });
  const txns: Transaction[] = (isExtra ? ex?.txns : aRow?.txns) || [];
  const eur = isExtra ? (ex ? (ex.eur > 0 ? ex.eur : toEur(ex.aed, m.rate)) : 0) : rowEur(aRow!, m.rate);
  const aed = isExtra ? (ex ? (ex.aed > 0 ? ex.aed : toAed(ex.eur || 0, m.rate)) : 0) : rowAedSpent(aRow, m.rate, { isAed: p?.isAed });
  // Budget
  const bRow = isExtra ? undefined : (m.budget[idx] || { aed: 0, eur: null });
  const eurRef = isExtra ? (exB?.eur || 0) > 0 : budgetIsEurRef(bRow, !!p?.isAed);
  const beur = isExtra ? (exB ? (exB.eur > 0 ? exB.eur : toEur(exB.aed, liveRate)) : 0) : budgetEurOf(bRow, !!p?.isAed, liveRate);
  const baed = isExtra ? (exB ? (exB.eur > 0 ? toAed(exB.eur, liveRate) : exB.aed) : 0) : budgetAedOf(bRow, !!p?.isAed, liveRate);
  const isSwap = isExtra && txns.length > 0 && txns.every(t => t.tripKind === 'swap');

  const local = unit === 'local';
  const main = local ? f0(aed) : f$(eur);
  const left = local ? baed - aed : beur - eur;
  // Consommation dans la devise affichée (cf. accueil) ; écart < 1 unité = budget atteint
  const pct = beur <= 0 ? 0 : local ? (baed > 0 ? aed / baed : 0) : eur / beur;
  const reached = Math.abs(left) < (local ? 0.5 : 0.005);
  const isOver = beur > 0 && !reached && left < 0;
  const fmt = (v: number) => (local ? `${f0(v)} ${cur}` : `${f$(v)} €`);

  // Historique sur tous les mois (EUR, comme le desktop)
  const history = state.months.map(mo => {
    if (isExtra) {
      const er = mo.extraActual?.find(x => x.name === name);
      return { mo, actual: er ? (er.eur > 0 ? er.eur : toEur(er.aed, mo.rate)) : 0, budget: 0 };
    }
    return {
      mo,
      actual: rowEur(mo.actual[idx] || { aed: 0, eur: null }, mo.rate),
      budget: rowEur(mo.budget[idx] || { aed: 0, eur: null }, liveRate),
    };
  }).filter(h => h.actual > 0 || h.budget > 0);
  const withData = history.filter(h => h.actual > 0);
  const avg = withData.length > 0 ? withData.reduce((s, h) => s + h.actual, 0) / withData.length : 0;
  const histShown = allHist ? [...history].reverse() : [...history].reverse().slice(0, 4);

  const groups = groupByDay(txns.map((t, ti) => ({ t, ti })));
  const target = (editIdx?: number): TxnTarget => (isExtra ? { posteIdx: -1, isExtra: true, extraIdx: ai, editIdx } : { posteIdx: idx, editIdx });

  const saveBudget = (val: number, c: string) => {
    const isEur = c === 'EUR';
    if (isExtra) {
      setState(setExtraBudgetByName(state, m.id, name, cat || 'vital', val, isEur));
    } else {
      const r = setBudget(state, m.id, idx, val, isEur, liveRate);
      setState(r.state);
      r.logs.forEach(l => logChange?.(l.action, l.detail));
    }
    save();
  };

  const hide = async () => {
    if (!(await confirm(`Masquer « ${name} » dans ${monthLabel(m)} ?\n\nSes montants ne compteront plus dans ce mois. Tu peux le réafficher dans Réglages.`, { confirmLabel: 'Masquer' }))) return;
    const r = hidePoste(getState(), m.id, name);
    setState(r.state);
    save();
    r.logs.forEach(l => logChange?.(l.action, l.detail));
    onClose();
  };

  const removeExtra = async () => {
    if (!(await confirm(`Supprimer « ${name} » de ${monthLabel(m)} ?\n\n${txns.length > 0 ? `Ses ${txns.length} opération${txns.length > 1 ? 's' : ''} seront supprimées aussi. ` : ''}Cette action est définitive.`, { danger: true }))) return;
    setState(removeExtraByName(getState(), m.id, name));
    save();
    onClose();
  };

  return (
    <>
      <BottomSheet
        open={open}
        onClose={onClose}
        title={name}
        subtitle={`${monthLabel(m)}${isExtra ? ' · poste ponctuel' : ''}`}
        fullHeight
        footer={(isExtra && ai < 0) ? undefined : <MButton onClick={() => onAdd(target())}><Plus size={17} />Ajouter une dépense</MButton>}
      >
        {/* Montant du mois */}
        <div className="flex flex-col items-center pt-1 pb-5">
          <PosteIcon name={name} cat={cat} size={44} />
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className={`text-[32px] leading-none mono-value ${isOver ? 'text-danger' : 'text-t-1'}`}>{main}</span>
            <span className="text-[15px] text-t-3 font-medium">{local ? cur : '€'}</span>
          </div>
          <div className="text-[13px] text-t-3 mt-1.5 mono-value m-sub">
            {beur > 0
              ? <>sur {fmt(local ? baed : beur)} · {reached ? 'budget atteint' : left > 0 ? `reste ${fmt(left)}` : <span className="text-danger">dépassé de {fmt(-left)}</span>}</>
              : 'Sans budget ce mois'}
          </div>
          {beur > 0 && <div className="w-[150px] mt-3"><MBar pct={pct} tone={isOver ? 'danger' : pct > 0.85 ? 'warning' : 'accent'} /></div>}
          <div className="text-[13px] text-t-4 mt-2 mono-value m-sub">{local ? `≈ ${f$(eur)} €` : `${f0(aed)} ${cur}`}{isSwap && ' · transfert, hors total'}</div>
        </div>

        <MCard surface="sheet" className="mb-4">
          <MRow
            title="Budget"
            sub={beur > 0 ? <span className="mono-value">Fixé en {eurRef ? `EUR · ≈ ${f0(baed)} ${cur}` : `${cur} · ≈ ${f$(beur)} €`}</span> : 'Aucun objectif'}
            right={<span className="mono-value">{beur > 0 ? (eurRef ? `${f$(beur)} €` : `${f0(baed)} ${cur}`) : '—'}</span>}
            chevron
            onClick={() => setEdit('budget')}
          />
          {!isExtra && txns.length === 0 && (
            <>
              <MDivider />
              <MRow
                title="Montant sans opération"
                sub="Saisie directe, sans détail"
                right={<span className="mono-value">{p?.isAed ? `${f0(aRow?.aed || 0)} ${cur}` : `${f$(aRow?.eur || 0)} €`}</span>}
                chevron
                onClick={() => setEdit('actual')}
              />
            </>
          )}
          {avg > 0 && (
            <>
              <MDivider />
              <MRow title="Moyenne mensuelle" sub={`Sur ${withData.length} mois avec des dépenses`} right={<span className="mono-value">{f$(avg)} €</span>} />
            </>
          )}
        </MCard>

        {/* Opérations */}
        {groups.length === 0 ? (
          <div className="text-center text-[13px] text-t-3 py-6">Aucune opération ce mois-ci</div>
        ) : groups.map(g => (
          <div key={g.day || 'x'} className="mb-3">
            <MLabel right={<span className="text-[13px] text-t-3 mono-value">−{f0(g.total)}</span>}>{dayLabel(g.day, today)}</MLabel>
            <MCard surface="sheet">
              {g.items.map(({ t, ti }, k) => (
                <div key={ti}>
                  {k > 0 && <MDivider />}
                  <MRow
                    title={t.label && t.label !== '---' ? t.label : 'Sans libellé'}
                    badge={<>{t.currency === 'EUR' && <MBadge tone="info">EUR</MBadge>}{t.tripId && <MBadge tone="info">Voyage</MBadge>}{t.recur && <MBadge>Récurrent</MBadge>}</>}
                    sub={<span className="mono-value">≈ {f$(t.eur || t.amount / (t.rate || m.rate))} €</span>}
                    right={<span className="mono-value">−{f0(t.amount)}</span>}
                    onClick={() => onEdit(target(ti))}
                  />
                </div>
              ))}
            </MCard>
          </div>
        ))}

        {/* Historique */}
        {history.length > 0 && (
          <div className="mb-4">
            <MLabel right={history.length > 4 ? <button type="button" onClick={() => setAllHist(v => !v)} className="text-[13px] text-t-1 font-medium h-8 px-1">{allHist ? 'Réduire' : 'Tout voir'}</button> : undefined}>Historique</MLabel>
            <MCard surface="sheet">
              {histShown.map((h, k) => (
                <div key={h.mo.id}>
                  {k > 0 && <MDivider />}
                  <MRow
                    className="!min-h-[48px]"
                    title={<span className="text-[14px]">{shortMonth(h.mo.id)}</span>}
                    right={<span className="mono-value text-[14px]">{f$(h.actual)} €</span>}
                    rightSub={h.budget > 0 ? <span className="mono-value">budget {f$(h.budget)}</span> : undefined}
                  />
                </div>
              ))}
            </MCard>
          </div>
        )}

        {isExtra ? (
          <button type="button" onClick={removeExtra} className="w-full flex items-center justify-center gap-2 h-12 text-[15px] font-medium text-danger active:opacity-60">
            <Trash2 size={16} />Supprimer ce poste ponctuel
          </button>
        ) : (
          <button type="button" onClick={hide} className="w-full flex items-center justify-center gap-2 h-12 text-[15px] font-medium text-t-2 active:opacity-60">
            <EyeOff size={16} />Masquer ce poste dans {monthLabel(m)}
          </button>
        )}
      </BottomSheet>

      <AmountSheet
        open={edit === 'budget'}
        onClose={() => setEdit(null)}
        title={`Budget · ${name}`}
        subtitle={monthLabel(m)}
        initial={eurRef ? beur : baed}
        currencies={[cur, 'EUR']}
        initialCurrency={eurRef ? 'EUR' : cur}
        hint={(v, c) => (v > 0 ? (c === 'EUR' ? `≈ ${f0(v * liveRate)} ${cur} au taux du jour` : `≈ ${f$(v / liveRate)} € au taux du jour`) : 'La devise choisie reste fixe, l’autre suit le taux')}
        onSave={saveBudget}
      />
      <AmountSheet
        open={edit === 'actual'}
        onClose={() => setEdit(null)}
        title={`Montant · ${name}`}
        subtitle="Sans détail d’opérations"
        initial={p?.isAed ? (aRow?.aed || 0) : (aRow?.eur || 0)}
        currencies={[p?.isAed ? cur : 'EUR']}
        onSave={val => { setState(setActual(state, m.id, idx, val, !p?.isAed)); save(); }}
      />
    </>
  );
}
