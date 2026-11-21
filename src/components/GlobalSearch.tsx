'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { useApp } from '@/context/AppProvider';
import { searchAll, SearchHit } from '@/lib/search';
import { f$, f0 } from '@/lib/utils';

const STATUS_LABEL: Record<string, string> = { preview: 'PRÉVISION', pending: 'EN ATTENTE' };

/** 2026-10-03 → 03/10/26 */
const shortDate = (d: string) => (d && d.length >= 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}` : '—');

/**
 * Recherche globale : toutes les dépenses et tous les revenus, tous mois confondus.
 * Un seul composant pour desktop (fenêtre centrée, ⌘K) et mobile (plein écran) — ouvert
 * depuis la barre latérale ou la barre du haut. La logique est dans lib/search.
 */
export default function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, setCurMonth, setRevFocus, activeSpace } = useApp();
  const router = useRouter();
  const [q, setQ] = useState('');
  const deferred = useDeferredValue(q);
  const inputRef = useRef<HTMLInputElement>(null);
  const cur = activeSpace?.localCurrency || 'AED';

  const res = useMemo(() => searchAll(state, deferred), [state, deferred]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const go = (h: SearchHit) => {
    if (h.target.page === 'tracker') {
      setCurMonth(h.target.monthId);
      router.push('/tracker');
    } else {
      setRevFocus({ year: h.target.year, month: h.target.month });
      router.push('/revenus');
    }
    onClose();
  };

  const hasQuery = deferred.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-md animate-fade-in flex justify-center items-start md:pt-[9vh] md:px-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Recherche"
        className="bg-bg-3 border border-border-2 shadow-xl flex flex-col w-full md:w-[660px] md:max-w-full md:rounded-lg md:max-h-[78vh] max-md:h-full max-md:border-0 mob:bg-bg mob:pt-[env(safe-area-inset-top)] mob:pb-[env(safe-area-inset-bottom)]"
        onClick={e => e.stopPropagation()}
      >
        {/* Champ */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border shrink-0 mob:border-0 mob:py-2">
          <Search size={16} className="text-t-3 shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Libellé, poste, client, montant…"
            className="flex-1 bg-transparent outline-none text-[15px] text-t-1 placeholder:text-t-4 min-w-0"
            autoComplete="off"
            spellCheck={false}
          />
          {q && (
            <button onClick={() => { setQ(''); inputRef.current?.focus(); }} className="text-[11px] mob:text-[13px] mob:h-10 text-t-3 hover:text-t-1 cursor-pointer px-1.5">
              Effacer
            </button>
          )}
          <button onClick={onClose} className="w-8 h-8 mob:w-10 mob:h-10 mob:rounded-full mob:bg-bg-3 flex items-center justify-center rounded-md text-t-3 hover:text-t-1 hover:bg-bg-4 transition-all cursor-pointer shrink-0" aria-label="Fermer la recherche">
            <X size={16} />
          </button>
        </div>

        {/* Totaux */}
        {hasQuery && res.total > 0 && (
          <div className="flex flex-wrap gap-x-5 gap-y-1 px-4 py-2.5 border-b border-border text-[11px] mob:text-[13px] mob:border-0 text-t-3 shrink-0">
            {res.expenses.count > 0 && (
              <span>
                {res.expenses.count} dépense{res.expenses.count > 1 ? 's' : ''} ·{' '}
                <span className="mono-value text-t-1">{f0(res.expenses.aed)} {cur}</span>{' '}
                <span className="mono-value">({f$(res.expenses.eur)} €)</span>
              </span>
            )}
            {res.revenues.count > 0 && (
              <span>
                {res.revenues.count} revenu{res.revenues.count > 1 ? 's' : ''} ·{' '}
                <span className="mono-value text-accent">{f$(res.revenues.eur)} €</span>
              </span>
            )}
          </div>
        )}

        {/* Résultats */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {!hasQuery && (
            <div className="px-5 py-10 text-center text-[12px] mob:text-[14px] text-t-3 leading-relaxed">
              Cherche dans toutes tes dépenses et tous tes revenus, tous mois confondus.
              <div className="text-t-4 mt-2 mob:text-[13px]">Exemples : « carrefour », « loyer octobre », « zinrai prévision », « 1196 »</div>
            </div>
          )}
          {hasQuery && res.total === 0 && (
            <div className="px-5 py-10 text-center text-[12px] mob:text-[14px] text-t-3">Aucun résultat pour « {deferred.trim()} »</div>
          )}
          {res.hits.map((h, i) => {
            const isRev = h.kind === 'revenue';
            const title = h.label || h.context || '—';
            const sub = [h.label ? h.context : '', h.monthLabel].filter(Boolean).join(' · ');
            return (
              <button
                key={i}
                onClick={() => go(h)}
                className="w-full text-left flex items-center gap-3 px-4 py-2.5 mob:min-h-[56px] border-b border-border/60 hover:bg-bg-4 active:bg-bg-4 transition-colors cursor-pointer"
              >
                <span className="text-[10px] mob:text-[12px] mob:w-[58px] text-t-4 w-[52px] shrink-0 tabular-nums">{shortDate(h.date)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[13px] mob:text-[15px] mob:font-medium font-semibold text-t-1 truncate tracking-tight">{title}</span>
                    {isRev && h.status && STATUS_LABEL[h.status] && (
                      <span className={`text-[9px] mob:text-[11px] font-semibold tracking-[0.05em] px-1.5 py-[2px] rounded shrink-0 ${h.status === 'preview' ? 'text-info bg-info/10' : 'text-warning bg-warning/10'}`}>{STATUS_LABEL[h.status]}</span>
                    )}
                    {h.trip && <span className="text-[9px] mob:text-[11px] font-semibold tracking-[0.05em] px-1.5 py-[2px] rounded shrink-0 text-info bg-info/10">VOYAGE</span>}
                  </span>
                  <span className="block text-[11px] mob:text-[13px] text-t-3 truncate">{isRev ? 'Revenu' : 'Dépense'}{sub ? ` · ${sub}` : ''}</span>
                </span>
                <span className="text-right shrink-0">
                  {isRev ? (
                    <span className="block text-[13px] mob:text-[15px] mono-value text-accent">+{f$(h.eur)} €</span>
                  ) : (
                    <>
                      <span className="block text-[13px] mob:text-[15px] mono-value text-t-1">{f0(h.aed)} {cur}</span>
                      <span className="block text-[10px] mob:text-[13px] mono-value text-t-4 m-sub">{f$(h.eur)} €</span>
                    </>
                  )}
                </span>
              </button>
            );
          })}
          {res.total > res.hits.length && (
            <div className="px-4 py-3 text-center text-[11px] text-t-4">
              {res.hits.length} premiers résultats sur {res.total} — précise ta recherche pour voir les autres (les totaux ci-dessus comptent tout)
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
