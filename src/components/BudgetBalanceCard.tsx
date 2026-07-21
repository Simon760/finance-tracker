'use client';

import { useState } from 'react';
import { Month, Poste } from '@/lib/types';
import { f$, f0, toEur, toAed, rowEur } from '@/lib/utils';
import { computeBudgetBalance, budgetBalanceMessage, isPosteFixed } from '@/lib/budgetBalance';
import { Target, ChevronDown } from 'lucide-react';

interface Props {
  month: Month;
  postes: Poste[];
  liveRate: number;
  compact?: boolean; // mobile
  /** Données revenus/compte du mois (fournies par le parent) pour les prévisions fin de mois. */
  forecast?: {
    earnEur: number;       // revenus confirmés (EUR)
    previewEur: number;    // revenus en prévision (EUR, status='preview')
    prevCompteAed: number; // prévisionnel compte actuel (AED) = soldeStart + earnAed − aABank + adjustment
  };
}

const signed = (n: number) => `${n >= 0 ? '+' : ''}${f$(n)} €`;

export default function BudgetBalanceCard({ month, postes, liveRate, forecast }: Props) {
  const b = computeBudgetBalance(month, postes, liveRate);
  const msg = budgetBalanceMessage(b);
  const [open, setOpen] = useState(false);

  // Projection fin de mois : chaque poste prévu finit à son budget (les marges se
  // consomment), les dépassements restent acquis, les imprévus s'ajoutent.
  // = budget prévu + dépassements + non-budgétés (même périmètre que la carte : hors fixes)
  const projection = b.prevuBudgetEur + b.overrunTotal + b.nonPrevuActualEur;
  const spentSoFar = b.prevuActualEur + b.nonPrevuActualEur;

  // Récap fin de mois : le cash-flow réel inclut les charges fixes → on les réintègre
  // ici (projection au max(budget, réel) ; reste à payer = budget − réel si >0).
  // Seul ce récap les inclut — le reste de la carte reste hors fixes.
  let projFixedEur = 0;
  let remainingFixedEur = 0;
  let spentFixedEur = 0;
  postes.forEach((p, i) => {
    if (month.hiddenPostes?.includes(p.name)) return;
    if (!isPosteFixed(p)) return;
    const brow = month.budget?.[i] || { aed: 0, eur: null };
    const arow = month.actual?.[i] || { aed: 0, eur: null };
    const budgetEur = p.isAed ? toEur(brow.aed, liveRate) : (brow.eur || 0);
    const actualEur = rowEur(arow, month.rate);
    projFixedEur += Math.max(budgetEur, actualEur);
    remainingFixedEur += Math.max(0, budgetEur - actualEur);
    spentFixedEur += actualEur;
  });
  const projTotalEur = projection + projFixedEur;              // dépenses projetées, fixes incluses
  const spentTotalEur = spentSoFar + spentFixedEur;            // déjà dépensé, fixes incluses
  const remainingEur = b.marginTotal + remainingFixedEur;      // reste à dépenser d'ici fin de mois
  const revDepConf = forecast ? forecast.earnEur - projTotalEur : 0;
  const revDepAll = forecast ? forecast.earnEur + forecast.previewEur - projTotalEur : 0;
  const bankEndAed = forecast ? forecast.prevCompteAed - toAed(remainingEur, liveRate) : 0;
  const bankEndAllAed = forecast ? bankEndAed + toAed(forecast.previewEur, liveRate) : 0;

  const toneColor = msg.tone === 'good' ? 'text-accent' : msg.tone === 'warn' ? 'text-warning' : 'text-danger';
  const toneBorder = msg.tone === 'good' ? 'border-accent/30' : msg.tone === 'warn' ? 'border-warning/30' : 'border-danger/30';
  const globalCls = b.globalNet >= -0.5 ? 'text-accent' : 'text-danger';

  return (
    <div className={`bg-bg-3 border ${toneBorder} rounded-md mb-5 overflow-hidden`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <Target size={15} className={toneColor} />
          <span className="text-[12px] uppercase tracking-wider text-t-3 font-semibold">Bilan vs prévisionnel</span>
          {b.excludedFixed.length > 0 && <span className="text-[9px] text-t-4 normal-case tracking-normal">hors charges fixes</span>}
        </div>
        <div className="text-right shrink-0">
          <div className="text-[9px] uppercase tracking-wider text-t-4 font-semibold leading-none">Solde global</div>
          <div className={`text-[16px] font-bold mono-value ${globalCls} leading-tight`}>{signed(b.globalNet)}</div>
        </div>
      </div>

      {/* Message */}
      <div className="px-4 pb-3">
        <p className={`text-[12px] leading-relaxed ${toneColor}`}>{msg.text}</p>
        {b.excludedFixed.length > 0 && (
          <p className="text-[10px] text-t-4 mt-1">Exclus (payés quoi qu'il arrive) : {b.excludedFixed.join(', ')}</p>
        )}
      </div>

      {/* Breakdown 2 colonnes */}
      <div className="grid grid-cols-2 gap-px bg-border">
        {/* Postes prévus */}
        <div className="bg-bg-3 px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-t-3 font-semibold mb-1.5">Postes prévus</div>
          <div className={`text-[15px] font-bold mono-value ${b.prevuNet >= 0 ? 'text-accent' : 'text-danger'}`}>{signed(b.prevuNet)}</div>
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

        {/* Non prévus */}
        <div className="bg-bg-3 px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-t-3 font-semibold mb-1.5">Extras non prévus</div>
          {b.hasNonPrevu ? (
            <>
              <div className="text-[15px] font-bold mono-value text-danger">{signed(b.nonPrevuNet)}</div>
              <div className="text-[10px] text-t-3 mt-1.5">
                {b.nonPrevu.length} poste{b.nonPrevu.length > 1 ? 's' : ''} sans budget · {f$(b.nonPrevuActualEur)} € dépensés
              </div>
            </>
          ) : (
            <div className="text-[13px] text-t-4 mt-1">Aucun imprévu ce mois</div>
          )}
        </div>
      </div>

      {/* Détail collapsible */}
      {(b.overruns.length > 0 || b.margins.length > 0 || b.nonPrevu.length > 0) && (
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
                        <span className="text-t-2 truncate pr-2">
                          {p.name}
                          {p.isExtra && <span className="text-t-4 ml-1 text-[9px]">(extra budgété)</span>}
                        </span>
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
                        <span className="text-t-2 truncate pr-2">
                          {p.name}
                          {p.isExtra && <span className="text-t-4 ml-1 text-[9px]">(extra budgété)</span>}
                        </span>
                        <span className="text-accent font-mono mono-value shrink-0">{signed(p.delta)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {b.nonPrevu.length > 0 && (
                <div className="col-span-2 max-md:col-span-1">
                  <div className="text-[10px] uppercase tracking-wider text-warning font-semibold mb-1">Imprévus (sans budget)</div>
                  <div className="space-y-0.5">
                    {b.nonPrevu.map(e => (
                      <div key={e.name} className="flex justify-between text-[11px]">
                        <span className="text-t-2 truncate pr-2">{e.name}</span>
                        <span className="text-danger font-mono mono-value shrink-0">−{f$(e.actualEur)} €</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Récap fin de mois — charges fixes INCLUSES (seule section de la carte à les compter) */}
      <div className="border-t border-border-2 bg-bg-2/60 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[12px] uppercase tracking-wider text-t-2 font-bold">Récap fin de mois</div>
            <div className="text-[11px] text-t-4 mt-0.5">budget prévu + dépassements + imprévus · charges fixes incluses</div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[20px] font-bold mono-value text-t-1">≈ {f$(projTotalEur)} €</div>
            <div className="text-[11px] text-t-4 mono-value">déjà dépensé {f$(spentTotalEur)} €</div>
          </div>
        </div>
        {forecast && (
          <div className="mt-3 pt-3 border-t border-border/60 space-y-1.5">
            <div className="flex justify-between gap-3 text-[13px]">
              <span className="text-t-2">Revenus − dépenses <span className="text-t-4 text-[11px]">(confirmés)</span></span>
              <span className={`mono-value font-bold shrink-0 ${revDepConf >= 0 ? 'text-accent' : 'text-danger'}`}>{signed(revDepConf)}</span>
            </div>
            {forecast.previewEur > 0 && (
              <div className="flex justify-between gap-3 text-[13px]">
                <span className="text-t-2">Revenus − dépenses <span className="text-t-4 text-[11px]">(avec {f$(forecast.previewEur)} € en prévision)</span></span>
                <span className={`mono-value font-bold shrink-0 ${revDepAll >= 0 ? 'text-accent' : 'text-danger'}`}>{signed(revDepAll)}</span>
              </div>
            )}
            <div className="flex justify-between gap-3 text-[13px]">
              <span className="text-t-2">Solde compte fin de mois <span className="text-t-4 text-[11px]">(confirmés)</span></span>
              <span className={`mono-value font-bold shrink-0 ${bankEndAed >= 0 ? 'text-t-1' : 'text-danger'}`}>≈ {f0(bankEndAed)} AED</span>
            </div>
            {forecast.previewEur > 0 && (
              <div className="flex justify-between gap-3 text-[13px]">
                <span className="text-t-2">Solde compte fin de mois <span className="text-t-4 text-[11px]">(avec prévisions)</span></span>
                <span className={`mono-value font-bold shrink-0 ${bankEndAllAed >= 0 ? 'text-t-1' : 'text-danger'}`}>≈ {f0(bankEndAllAed)} AED</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
