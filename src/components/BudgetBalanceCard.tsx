'use client';

import { useState } from 'react';
import { Month, Poste } from '@/lib/types';
import { f$ } from '@/lib/utils';
import { computeBudgetBalance, budgetBalanceMessage } from '@/lib/budgetBalance';
import { Target, ChevronDown } from 'lucide-react';

interface Props {
  month: Month;
  postes: Poste[];
  liveRate: number;
  compact?: boolean; // mobile
}

const signed = (n: number) => `${n >= 0 ? '+' : ''}${f$(n)} €`;

export default function BudgetBalanceCard({ month, postes, liveRate, compact = false }: Props) {
  const b = computeBudgetBalance(month, postes, liveRate);
  const msg = budgetBalanceMessage(b);
  const [open, setOpen] = useState(false);

  const toneColor = msg.tone === 'good' ? 'text-accent' : msg.tone === 'warn' ? 'text-warning' : 'text-danger';
  const toneBorder = msg.tone === 'good' ? 'border-accent/30' : msg.tone === 'warn' ? 'border-warning/30' : 'border-danger/30';
  const globalCls = b.globalNet >= -0.5 ? 'text-accent' : 'text-danger';

  return (
    <div className={`bg-bg-3 border ${toneBorder} rounded-md mb-5 overflow-hidden`}>
      {/* Header */}
      <div className={`flex items-center justify-between gap-3 px-4 ${compact ? 'py-3' : 'py-3'}`}>
        <div className="flex items-center gap-2 min-w-0">
          <Target size={15} className={toneColor} />
          <span className="text-[12px] uppercase tracking-wider text-t-3 font-semibold">Bilan vs prévisionnel</span>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[9px] uppercase tracking-wider text-t-4 font-semibold leading-none">Solde global</div>
          <div className={`text-[16px] font-bold mono-value ${globalCls} leading-tight`}>{signed(b.globalNet)}</div>
        </div>
      </div>

      {/* Message */}
      <div className="px-4 pb-3">
        <p className={`text-[12px] leading-relaxed ${toneColor}`}>{msg.text}</p>
      </div>

      {/* Breakdown 2 colonnes */}
      <div className={`grid grid-cols-2 gap-px bg-border ${compact ? '' : ''}`}>
        {/* Postes prévisionnels */}
        <div className="bg-bg-3 px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-t-3 font-semibold mb-1.5">Postes prévus</div>
          <div className={`text-[15px] font-bold mono-value ${b.regNet >= 0 ? 'text-accent' : 'text-danger'}`}>{signed(b.regNet)}</div>
          <div className="mt-1.5 space-y-0.5 text-[10px]">
            {b.overrunTotal > 0.5 && (
              <div className="flex justify-between text-t-3">
                <span>Dépassements <span className="text-t-4">({b.overruns.length})</span></span>
                <span className="text-danger font-mono mono-value">−{f$(b.overrunTotal)} €</span>
              </div>
            )}
            {b.marginTotal > 0.5 && (
              <div className="flex justify-between text-t-3">
                <span>Marges <span className="text-t-4">({b.margins.length})</span></span>
                <span className="text-accent font-mono mono-value">+{f$(b.marginTotal)} €</span>
              </div>
            )}
          </div>
        </div>

        {/* Extras */}
        <div className="bg-bg-3 px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-t-3 font-semibold mb-1.5">Extras du mois</div>
          {b.hasExtras ? (
            <>
              <div className={`text-[15px] font-bold mono-value ${b.extraNet >= 0 ? 'text-accent' : 'text-danger'}`}>{signed(b.extraNet)}</div>
              <div className="text-[10px] text-t-3 mt-1.5">
                {b.extras.length} poste{b.extras.length > 1 ? 's' : ''} ajouté{b.extras.length > 1 ? 's' : ''} · {f$(b.extraActualEur)} € dépensés
              </div>
            </>
          ) : (
            <div className="text-[13px] text-t-4 mt-1">Aucun extra ce mois</div>
          )}
        </div>
      </div>

      {/* Détail collapsible */}
      {(b.overruns.length > 0 || b.margins.length > 0 || b.extras.length > 0) && (
        <>
          <button
            onClick={() => setOpen(o => !o)}
            className="w-full flex items-center justify-center gap-1.5 py-2 border-t border-border text-[11px] text-t-3 hover:text-t-1 active:bg-bg-4 transition-colors cursor-pointer"
          >
            {open ? 'Masquer le détail' : 'Voir le détail poste par poste'}
            <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
          {open && (
            <div className="border-t border-border px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-3 max-md:grid-cols-1">
              {b.overruns.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-danger font-semibold mb-1">Dépassements</div>
                  <div className="space-y-0.5">
                    {b.overruns.map(p => (
                      <div key={p.name} className="flex justify-between text-[11px]">
                        <span className="text-t-2 truncate pr-2">{p.name}</span>
                        <span className="text-danger font-mono mono-value shrink-0">{signed(p.delta)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {b.margins.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-accent font-semibold mb-1">Marges restantes</div>
                  <div className="space-y-0.5">
                    {b.margins.map(p => (
                      <div key={p.name} className="flex justify-between text-[11px]">
                        <span className="text-t-2 truncate pr-2">{p.name}</span>
                        <span className="text-accent font-mono mono-value shrink-0">{signed(p.delta)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {b.extras.length > 0 && (
                <div className="col-span-2 max-md:col-span-1">
                  <div className="text-[10px] uppercase tracking-wider text-warning font-semibold mb-1">Extras (non prévus)</div>
                  <div className="space-y-0.5">
                    {b.extras.map(e => (
                      <div key={e.name} className="flex justify-between text-[11px]">
                        <span className="text-t-2 truncate pr-2">
                          {e.name}
                          {e.planned && <span className="text-t-4 ml-1 text-[9px]">(budgété)</span>}
                        </span>
                        <span className="text-t-3 font-mono mono-value shrink-0">
                          {f$(e.actualEur)} €{e.planned && e.budgetEur > 0 ? ` / ${f$(e.budgetEur)} €` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
