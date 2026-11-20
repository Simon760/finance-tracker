'use client';

import { useEffect, useState } from 'react';
import { parseAmount } from '@/lib/amount';
import BottomSheet from '../BottomSheet';
import { MButton, MSeg } from '../ui';

export { parseAmount };

/**
 * Saisie d'un seul montant (budget d'un poste, solde de départ, montant réel…), avec la
 * devise au choix quand `currencies` en propose deux.
 */
export default function AmountSheet({ open, onClose, title, subtitle, initial, currencies, initialCurrency, hint, onSave, allowZero = true }: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  initial: number;
  /** [devise locale, 'EUR'] pour proposer le choix ; une seule entrée = devise fixe. */
  currencies: string[];
  initialCurrency?: string;
  hint?: (value: number, currency: string) => string;
  onSave: (value: number, currency: string) => void;
  allowZero?: boolean;
}) {
  const [text, setText] = useState('');
  const [cur, setCur] = useState(currencies[0]);

  useEffect(() => {
    if (!open) return;
    setText(initial ? String(Math.round(initial * 100) / 100).replace('.', ',') : '');
    setCur(initialCurrency && currencies.includes(initialCurrency) ? initialCurrency : currencies[0]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const value = text.trim() === '' ? 0 : parseAmount(text);
  const valid = isFinite(value) && value >= 0 && (allowZero || value > 0);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      footer={<MButton disabled={!valid} onClick={() => { onSave(value, cur); onClose(); }}>Enregistrer</MButton>}
    >
      <div className="flex flex-col items-center pt-3 pb-4">
        <div className="flex items-baseline justify-center gap-2 w-full px-6">
          <input
            className="m-input m-amount mono-value text-center"
            inputMode="decimal"
            autoFocus
            placeholder="0"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && valid) { onSave(value, cur); onClose(); } }}
            aria-label={title}
          />
        </div>
        {currencies.length > 1
          ? <MSeg className="mt-3" value={cur} options={currencies.map(c => [c, c] as const)} onChange={setCur} />
          : <div className="text-[13px] text-t-3 mt-1">{cur}</div>}
        {hint && valid && <div className="text-[13px] text-t-3 mt-3 text-center px-4">{hint(value, cur)}</div>}
      </div>
    </BottomSheet>
  );
}
