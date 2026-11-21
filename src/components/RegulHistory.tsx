'use client';

import { Month } from '@/lib/types';
import { f0 } from '@/lib/utils';
import { regulsNewestFirst } from '@/lib/regul';

/**
 * Régul déjà faites sur ce mois (solde réel constaté + date) — affiché dans la fenêtre
 * de régularisation, desktop ET mobile (même composant, donc toujours à parité).
 */
export default function RegulHistory({ month, currency = 'AED', max = 5 }: { month: Month | undefined; currency?: string; max?: number }) {
  const list = regulsNewestFirst(month);
  if (list.length === 0) return null;
  const fmt = (ts: string) => {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };
  return (
    <div className="bg-bg-2 border border-border rounded-md p-3 mob:bg-cell mob:border-0 mob:rounded-[20px] mob:px-4 mob:py-3.5">
      <div className="text-[10px] text-t-3 uppercase tracking-[0.12em] font-semibold mb-2 mob:text-[13px] mob:normal-case mob:tracking-normal mob:font-medium">
        Régul de ce mois ({list.length})
      </div>
      <div className="space-y-1.5">
        {list.slice(0, max).map(r => (
          <div key={r.ts} className="flex items-center justify-between gap-3 text-[11px] mob:text-[13px] mob:py-0.5">
            <span className="text-t-3 shrink-0">{fmt(r.ts)}</span>
            <span className="font-mono mono-value text-t-1">{f0(r.real)} {currency}</span>
            <span className={`font-mono mono-value shrink-0 ${r.adjustment > 0 ? 'text-accent' : r.adjustment < 0 ? 'text-warning' : 'text-t-3'}`}>
              {r.adjustment >= 0 ? '+' : ''}{f0(r.adjustment)}
            </span>
          </div>
        ))}
      </div>
      {list.length > max && <div className="text-[10px] mob:text-[12px] text-t-4 mt-2">+ {list.length - max} plus ancienne{list.length - max > 1 ? 's' : ''}</div>}
    </div>
  );
}
