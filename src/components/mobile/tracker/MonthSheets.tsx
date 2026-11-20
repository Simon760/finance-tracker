'use client';

import { useEffect, useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { useApp } from '@/context/AppProvider';
import { MOIS_LIST, monthIndexOf } from '@/lib/constants';
import { detectYears, startedMonths } from '@/lib/utils';
import { newMonthId, buildNewMonth, MonthFill } from '@/lib/months';
import { monthLabel } from '@/lib/labels';
import BottomSheet from '../BottomSheet';
import { MBadge, MButton, MCard, MDivider, MField, MPill, MRow, MSeg } from '../ui';
import { parseAmount } from './AmountSheet';

/** Choix du mois affiché, avec filtre par année (partagé avec le desktop : curYear). */
export function MonthPickerSheet({ open, onClose, onNew }: { open: boolean; onClose: () => void; onNew: () => void }) {
  const { state, curMonth, setCurMonth, curYear, setCurYear } = useApp();
  const years = detectYears(state.months);
  const started = new Set(startedMonths(state.months).map(m => m.id));
  const list = (curYear === 'all' ? state.months : state.months.filter(m => m._year === parseInt(curYear))).slice().reverse();
  return (
    <BottomSheet open={open} onClose={onClose} title="Choisir un mois" footer={<MButton variant="ghost" onClick={() => { onClose(); onNew(); }}><Plus size={17} />Nouveau mois</MButton>}>
      {years.length > 1 && (
        <div className="flex gap-2 overflow-x-auto m-noscroll -mx-4 px-4 pb-3">
          <MPill surface="sheet" active={curYear === 'all'} onClick={() => setCurYear('all')}>Toutes</MPill>
          {years.map(y => <MPill key={y} surface="sheet" active={curYear === String(y)} onClick={() => setCurYear(String(y))}>{y}</MPill>)}
        </div>
      )}
      <MCard surface="sheet">
        {list.length === 0 && <div className="px-4 py-6 text-center text-[13px] text-t-3">Aucun mois pour cette année</div>}
        {list.map((m, k) => (
          <div key={m.id}>
            {k > 0 && <MDivider />}
            <MRow
              className="!min-h-[50px]"
              title={monthLabel(m)}
              badge={!started.has(m.id) ? <MBadge tone="info">À venir</MBadge> : undefined}
              right={m.id === curMonth ? <Check size={18} className="text-accent inline" /> : undefined}
              onClick={() => { setCurMonth(m.id); onClose(); }}
            />
          </div>
        ))}
      </MCard>
    </BottomSheet>
  );
}

/** Création d'un mois — même logique que le desktop (lib/months) : nom, solde, taux, budget. */
export function NewMonthSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, setState, save, setCurMonth, liveRate, logChange, activeSpace } = useApp();
  const cur = activeSpace?.localCurrency || 'AED';
  const [name, setName] = useState('');
  const [solde, setSolde] = useState('');
  const [rate, setRate] = useState('');
  const [fill, setFill] = useState<MonthFill>('copy');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    // Propose le mois qui suit le dernier créé
    const last = state.months[state.months.length - 1];
    const li = last ? monthIndexOf(last.id) : -1;
    setName(MOIS_LIST[li >= 0 ? (li + 1) % 12 : new Date().getMonth()]);
    setSolde('');
    setRate(liveRate ? liveRate.toFixed(4) : '');
    setFill('copy');
    setError('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const rateVal = parseAmount(rate);
  const create = () => {
    const res = newMonthId(state.months, name);
    if ('error' in res) { setError(res.error); return; }
    const m = buildNewMonth(state.months, state.postes, { id: res.id, rate: rateVal > 0 ? rateVal : liveRate, soldeStart: parseAmount(solde) || 0, fill });
    setState({ ...state, months: [...state.months, m] });
    setCurMonth(res.id);
    save();
    const label = state.months.length === 0 || fill === 'empty' ? 'vide' : fill === 'avg3' ? 'moyenne 3 mois' : 'copie M-1';
    logChange?.('month.create', `Création du mois ${res.id} (${label})`);
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Nouveau mois" footer={<MButton disabled={!name.trim()} onClick={create}>Créer le mois</MButton>}>
      <MCard surface="sheet">
        <MField label="Nom">
          <input className="m-input text-right uppercase" value={name} onChange={e => { setName(e.target.value.toUpperCase()); setError(''); }} placeholder="JUIN" />
        </MField>
        <MDivider />
        <MField label={`Solde de départ (${cur})`}>
          <input className="m-input text-right mono-value" inputMode="decimal" value={solde} onChange={e => setSolde(e.target.value)} placeholder="0" />
        </MField>
        <MDivider />
        <MField label={`Taux EUR / ${cur}`}>
          <input className="m-input text-right mono-value" inputMode="decimal" value={rate} onChange={e => setRate(e.target.value)} />
        </MField>
      </MCard>
      {error && <p className="text-[13px] text-danger px-4 pt-2">{error}</p>}
      <p className="text-[12px] text-t-4 px-4 pt-2 leading-relaxed">Si ce nom existe déjà pour une autre année, l’année est ajoutée automatiquement (ex. OCTOBRE 26).</p>
      {state.months.length > 0 && (
        <>
          <div className="text-[13px] text-t-3 px-4 pt-4 pb-2">Budget de départ</div>
          <MSeg className="w-full" value={fill} options={[['copy', 'Mois précédent'], ['avg3', 'Moyenne 3 mois'], ['empty', 'Vide']] as const} onChange={setFill} />
          <p className="text-[12px] text-t-4 px-4 pt-2 leading-relaxed">
            {fill === 'copy' ? 'Reprend le budget du mois précédent.' : fill === 'avg3' ? 'Moyenne de ce que tu as réellement dépensé sur les 3 derniers mois.' : 'Tous les budgets à zéro.'}
          </p>
        </>
      )}
    </BottomSheet>
  );
}

/** Renommer le mois affiché (un homonyme sans année est poussé vers son suffixe année). */
export function RenameMonthSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { curMonth, renameMonth, logChange } = useApp();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { if (open) { setValue(curMonth || ''); setError(''); } }, [open, curMonth]);

  const submit = () => {
    if (!curMonth) return;
    const oldId = curMonth;
    const trimmed = value.trim().toUpperCase();
    const res = renameMonth(oldId, value);
    if (res.error) { setError(res.error); return; }
    onClose();
    if (trimmed === oldId) return;
    let detail = `« ${oldId} » renommé en « ${trimmed} »`;
    if (res.swapped) detail += ` (« ${res.swapped.fromId} » renommé en « ${res.swapped.toId} » pour libérer le nom)`;
    logChange?.('month.rename', detail);
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Renommer ce mois" footer={<MButton disabled={!value.trim()} onClick={submit}>Renommer</MButton>}>
      <MCard surface="sheet">
        <MField label="Nom">
          <input className="m-input text-right uppercase" autoFocus value={value} onChange={e => { setValue(e.target.value.toUpperCase()); setError(''); }} placeholder="OCTOBRE 26" onKeyDown={e => e.key === 'Enter' && submit()} />
        </MField>
      </MCard>
      {error && <p className="text-[13px] text-danger px-4 pt-2">{error}</p>}
      <p className="text-[12px] text-t-4 px-4 pt-2 leading-relaxed">Si ce nom est déjà pris par un autre mois, celui-ci est renommé avec son année pour te le libérer.</p>
    </BottomSheet>
  );
}
