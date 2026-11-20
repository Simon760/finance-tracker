'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useApp } from '@/context/AppProvider';
import { useDialog } from '@/components/ui/Dialog';
import { Month, Poste } from '@/lib/types';
import { f$, f0, todayISO, localISODate } from '@/lib/utils';
import { saveTxn, removeTxn, removeTxnExtra, TxnTarget, NewPosteForm } from '@/lib/trackerOps';
import { CAT_LABELS } from '@/lib/constants';
import BottomSheet from '../BottomSheet';
import { MButton, MCard, MDivider, MField, MPill, MSeg } from '../ui';
import { parseAmount } from './AmountSheet';

const CATS = ['vital', 'lifestyle', 'logement', 'finance'] as const;
const emptyPoste = (): NewPosteForm => ({ name: '', cat: 'vital', isAed: true, scope: 'month' });

/**
 * Saisie d'une dépense : montant d'abord, poste en un tap, libellé et date ensuite.
 * Sert à l'ajout, à la modification, au déplacement vers un autre poste et à la
 * suppression — pour un poste régulier comme pour un poste ponctuel du mois.
 */
export default function TxnSheet({ open, onClose, month, target }: {
  open: boolean; onClose: () => void; month: Month; target: TxnTarget | null;
}) {
  const { state, setState, save, getState, logChange, activeSpace } = useApp();
  const { confirm } = useDialog();
  const cur = activeSpace?.localCurrency || 'AED';
  const today = todayISO();
  const yesterday = (() => { const d = new Date(`${today}T12:00:00`); d.setDate(d.getDate() - 1); return localISODate(d); })();

  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'AED' | 'EUR'>('AED');
  const [label, setLabel] = useState('');
  const [date, setDate] = useState(today);
  const [dest, setDest] = useState(0);
  const [creating, setCreating] = useState(false);
  const [np, setNp] = useState<NewPosteForm>(emptyPoste);

  const isEdit = target?.editIdx !== undefined;
  const isExtraSrc = !!(target?.isExtra && target.extraIdx !== undefined);
  const extraName = isExtraSrc ? month.extraActual?.[target!.extraIdx!]?.name || 'Ponctuel' : '';

  // (Ré)initialise le formulaire à chaque ouverture
  useEffect(() => {
    if (!open || !target) return;
    const t = target.editIdx === undefined ? undefined
      : isExtraSrc ? month.extraActual?.[target.extraIdx!]?.txns?.[target.editIdx] : month.actual[target.posteIdx]?.txns?.[target.editIdx];
    const amt = t ? (t.originalAmount || t.amount || 0) : 0;
    setAmount(amt ? String(amt).replace('.', ',') : '');
    setCurrency(t?.currency || 'AED');
    setLabel(t && t.label !== '---' ? t.label || '' : '');
    setDate(t?.date || today);
    setDest(isExtraSrc ? -1 : target.posteIdx);
    setCreating(false);
    setNp(emptyPoste());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, target]);

  // Postes proposés : les plus utilisés ce mois d'abord, les masqués à la fin
  const chips = useMemo(() => {
    const hidden = month.hiddenPostes || [];
    return state.postes
      .map((p: Poste, i: number) => ({ p, i, n: (month.actual[i]?.txns || []).length, hidden: hidden.includes(p.name) }))
      .sort((a, b) => Number(a.hidden) - Number(b.hidden) || b.n - a.n || a.i - b.i);
  }, [state.postes, month]);

  // Libellés déjà utilisés ce mois pour le poste choisi
  const suggestions = useMemo(() => {
    const txns = dest === -1 && isExtraSrc ? month.extraActual?.[target!.extraIdx!]?.txns : month.actual[dest]?.txns;
    const map = new Map<string, { label: string; count: number; last: string }>();
    (txns || []).forEach(t => {
      const raw = (t.label || '').trim();
      if (!raw || raw === '---') return;
      const k = raw.toLowerCase();
      const c = map.get(k);
      if (c) { c.count++; if ((t.date || '') > c.last) c.last = t.date || ''; }
      else map.set(k, { label: raw, count: 1, last: t.date || '' });
    });
    const q = label.trim().toLowerCase();
    return Array.from(map.values())
      .filter(s => !q || (s.label.toLowerCase().includes(q) && s.label.toLowerCase() !== q))
      .sort((a, b) => b.count - a.count || b.last.localeCompare(a.last))
      .slice(0, 6);
  }, [dest, isExtraSrc, month, target, label]);

  const value = parseAmount(amount);
  const valid = value > 0 && (!creating || np.name.trim() !== '');
  const rate = state.rate;

  const submit = () => {
    if (!target || !valid) return;
    const r = saveTxn(state, month.id, target, { label: label.trim(), amount: value, currency, date }, { posteIdx: dest, create: creating ? np : null }, today);
    if (!r) return;
    setState(r.state);
    save();
    r.logs.forEach(l => logChange?.(l.action, l.detail));
    onClose();
  };

  const remove = async () => {
    if (!target || target.editIdx === undefined) return;
    if (!(await confirm('Supprimer cette dépense ?', { danger: true }))) return;
    const s = getState(); // après un await : repartir du dernier état
    setState(isExtraSrc ? removeTxnExtra(s, month.id, target.extraIdx!, target.editIdx) : removeTxn(s, month.id, target.posteIdx, target.editIdx));
    save();
    onClose();
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={isEdit ? 'Modifier la dépense' : 'Nouvelle dépense'}
      footer={<MButton disabled={!valid} onClick={submit}>{isEdit ? 'Enregistrer' : 'Ajouter'}</MButton>}
    >
      {/* Montant */}
      <div className="flex flex-col items-center pt-2 pb-4">
        <input
          className="m-input m-amount mono-value text-center px-6"
          inputMode="decimal"
          autoFocus={!isEdit}
          placeholder="0"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          aria-label="Montant"
        />
        <MSeg className="mt-2.5" value={currency} options={[['AED', cur], ['EUR', 'EUR']] as const} onChange={setCurrency} />
        <div className="text-[13px] text-t-3 mt-2 mono-value">
          {value > 0 ? (currency === 'AED' ? `≈ ${f$(value / rate)} €` : `≈ ${f0(value * rate)} ${cur}`) : 'au taux du jour'}
        </div>
      </div>

      {/* Poste */}
      {!creating ? (
        <div className="flex gap-2 overflow-x-auto m-noscroll -mx-4 px-4 pb-3">
          {isExtraSrc && <MPill surface="sheet" active={dest === -1} onClick={() => setDest(-1)}>{extraName}</MPill>}
          {chips.map(({ p, i, hidden }) => (
            <MPill key={i} surface="sheet" active={dest === i} onClick={() => setDest(i)} className={hidden && dest !== i ? 'opacity-50' : ''}>{p.name}</MPill>
          ))}
          <MPill surface="sheet" onClick={() => setCreating(true)}><Plus size={14} />Nouveau poste</MPill>
        </div>
      ) : (
        <MCard surface="sheet" className="mb-3">
          <MField label="Nouveau poste">
            <input className="m-input text-right uppercase" autoFocus placeholder="TRANSPORT" value={np.name} onChange={e => setNp({ ...np, name: e.target.value.toUpperCase() })} />
          </MField>
          <MDivider />
          <MField label="Catégorie">
            <select className="m-input text-right" dir="rtl" value={np.cat} onChange={e => setNp({ ...np, cat: e.target.value as NewPosteForm['cat'] })}>
              {CATS.map(c => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
            </select>
          </MField>
          <MDivider />
          <MField label="Durée">
            <MSeg surface="page" value={np.scope} options={[['month', 'Ce mois'], ['permanent', 'Tous les mois']] as const} onChange={v => setNp({ ...np, scope: v })} />
          </MField>
          {np.scope === 'permanent' && (
            <>
              <MDivider />
              <MField label="Budget fixé en">
                <MSeg surface="page" value={np.isAed ? 'AED' : 'EUR'} options={[['AED', cur], ['EUR', 'EUR']] as const} onChange={v => setNp({ ...np, isAed: v === 'AED' })} />
              </MField>
            </>
          )}
          <MDivider />
          <button type="button" onClick={() => setCreating(false)} className="w-full text-left px-4 py-3 text-[14px] text-t-2 active:opacity-60">Choisir un poste existant</button>
        </MCard>
      )}

      {/* Libellé et date */}
      <MCard surface="sheet">
        <MField label="Libellé">
          <input className="m-input text-right" placeholder="Carrefour, Uber…" autoComplete="off" enterKeyHint="done" value={label} onChange={e => setLabel(e.target.value)} />
        </MField>
        <MDivider />
        <MField label="Date">
          <input className="m-input text-right" type="date" value={date} onChange={e => setDate(e.target.value)} />
        </MField>
      </MCard>
      <div className="flex gap-2 pt-3">
        <MPill surface="sheet" active={date === today} onClick={() => setDate(today)}>Aujourd’hui</MPill>
        <MPill surface="sheet" active={date === yesterday} onClick={() => setDate(yesterday)}>Hier</MPill>
      </div>
      {suggestions.length > 0 && (
        <>
          <div className="text-[13px] text-t-3 px-1 pt-4 pb-2">Libellés déjà utilisés ce mois</div>
          <div className="flex gap-2 overflow-x-auto m-noscroll -mx-4 px-4">
            {suggestions.map(s => (
              <MPill key={s.label} surface="sheet" onClick={() => setLabel(s.label)}>{s.label}</MPill>
            ))}
          </div>
        </>
      )}

      {isEdit && (
        <button type="button" onClick={remove} className="w-full flex items-center justify-center gap-2 h-12 mt-4 text-[15px] font-medium text-danger active:opacity-60">
          <Trash2 size={16} />Supprimer
        </button>
      )}
    </BottomSheet>
  );
}
