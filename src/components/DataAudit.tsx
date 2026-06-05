'use client';

import { useState } from 'react';
import { useApp } from '@/context/AppProvider';
import { Month, Transaction } from '@/lib/types';
import { f0, f$ } from '@/lib/utils';

interface RowDiagnostic {
  monthId: string;
  posteCount: number;
  budgetLen: number;
  actualLen: number;
  extraBudgetCount: number;
  extraActualCount: number;
  txnsTotal: number;
  hasOrphans: boolean;
  warnings: string[];
}

export default function DataAudit() {
  const { state, setState, save } = useApp();
  const [open, setOpen] = useState(false);
  const [monthDetail, setMonthDetail] = useState<string | null>(null);

  const postes = state.postes || [];
  const months: Month[] = state.months || [];

  const diags: RowDiagnostic[] = months.map(m => {
    const budgetLen = (m.budget || []).length;
    const actualLen = (m.actual || []).length;
    const warnings: string[] = [];
    const hasOrphans = budgetLen > postes.length || actualLen > postes.length;
    if (budgetLen !== postes.length) warnings.push(`budget.length=${budgetLen} ≠ postes.length=${postes.length}`);
    if (actualLen !== postes.length) warnings.push(`actual.length=${actualLen} ≠ postes.length=${postes.length}`);
    const txnsTotal = (m.actual || []).reduce((s, r) => s + ((r?.txns || []).length), 0)
      + (m.extraActual || []).reduce((s, r) => s + ((r?.txns || []).length), 0);
    return {
      monthId: m.id,
      posteCount: postes.length,
      budgetLen,
      actualLen,
      extraBudgetCount: (m.extraBudget || []).length,
      extraActualCount: (m.extraActual || []).length,
      txnsTotal,
      hasOrphans,
      warnings,
    };
  });

  const totalWarnings = diags.filter(d => d.warnings.length > 0).length;
  const detailMonth = monthDetail ? months.find(m => m.id === monthDetail) : null;

  // Helpers d'action sur les extras
  const deleteExtra = (monthId: string, section: 'budget' | 'actual', idx: number) => {
    const name = section === 'budget' ? state.months.find(m => m.id === monthId)?.extraBudget?.[idx]?.name : state.months.find(m => m.id === monthId)?.extraActual?.[idx]?.name;
    if (!confirm(`Supprimer cet extra (${section}) « ${name} » du mois ${monthId} ?`)) return;
    const updated = {
      ...state,
      months: state.months.map(m => {
        if (m.id !== monthId) return m;
        if (section === 'budget') {
          return { ...m, extraBudget: (m.extraBudget || []).filter((_, i) => i !== idx) };
        }
        return { ...m, extraActual: (m.extraActual || []).filter((_, i) => i !== idx) };
      }),
    };
    setState(updated);
    save();
  };

  // Trim m.budget / m.actual à la longueur de state.postes (retire les orphelins en queue uniquement)
  const trimOrphansTail = (monthId: string) => {
    if (!confirm(`Trim les rows orphelines en queue de ${monthId} ? (Garde seulement les ${postes.length} premières entrées de budget/actual, équivalentes aux ${postes.length} postes courants)`)) return;
    const updated = {
      ...state,
      months: state.months.map(m => {
        if (m.id !== monthId) return m;
        return {
          ...m,
          budget: (m.budget || []).slice(0, postes.length),
          actual: (m.actual || []).slice(0, postes.length),
        };
      }),
    };
    setState(updated);
    save();
  };

  return (
    <div className="bg-bg-3 border border-border rounded-lg overflow-hidden mb-5 shadow-inset-border">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 border-b border-border hover:bg-white/[.02] transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-2 text-[13px] font-semibold tracking-tight">
          🔧 Audit & repair data
          {totalWarnings > 0 && (
            <span className="text-[10px] text-danger bg-danger/10 border border-danger/25 px-1.5 py-0.5 rounded-full font-bold">
              {totalWarnings} mois avec warnings
            </span>
          )}
          {totalWarnings === 0 && (
            <span className="text-[10px] text-accent bg-accent/10 border border-accent/25 px-1.5 py-0.5 rounded-full font-bold">
              alignement OK
            </span>
          )}
        </span>
        <span className={`text-t-3 text-[11px] transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="p-4 space-y-3">
          <div className="text-[11px] text-t-3 leading-relaxed">
            <strong className="text-t-2">postes globaux : {postes.length}</strong> — chaque mois doit avoir {postes.length} entrées dans budget/actual. Si plus → orphelins, si moins → désalignement. Les extras (extraBudget/extraActual) ont leurs propres noms et ne posent pas de problème d'index.
          </div>

          {/* Liste des postes globaux pour reference */}
          <details className="bg-bg-2 border border-border rounded-md p-2">
            <summary className="cursor-pointer text-[11px] font-semibold text-t-2">Postes globaux ({postes.length}) — par index</summary>
            <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-1 text-[11px] font-mono">
              {postes.map((p, i) => (
                <div key={i} className="text-t-3"><span className="text-t-4">{i}.</span> {p.name}</div>
              ))}
            </div>
          </details>

          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-t-3 border-b border-border">
                  <th className="text-left py-1.5 px-2">Mois</th>
                  <th className="text-right py-1.5 px-2">budget.len</th>
                  <th className="text-right py-1.5 px-2">actual.len</th>
                  <th className="text-right py-1.5 px-2">extraB</th>
                  <th className="text-right py-1.5 px-2">extraA</th>
                  <th className="text-right py-1.5 px-2">txns</th>
                  <th className="text-left py-1.5 px-2">Statut</th>
                  <th className="text-right py-1.5 px-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {diags.map(d => (
                  <tr key={d.monthId} className={`border-b border-border/50 ${d.warnings.length > 0 ? 'bg-danger/5' : ''}`}>
                    <td className="py-1.5 px-2 font-semibold">{d.monthId}</td>
                    <td className={`py-1.5 px-2 text-right font-mono mono-value ${d.budgetLen !== postes.length ? 'text-danger font-bold' : 'text-t-2'}`}>{d.budgetLen}</td>
                    <td className={`py-1.5 px-2 text-right font-mono mono-value ${d.actualLen !== postes.length ? 'text-danger font-bold' : 'text-t-2'}`}>{d.actualLen}</td>
                    <td className="py-1.5 px-2 text-right font-mono mono-value text-t-3">{d.extraBudgetCount}</td>
                    <td className="py-1.5 px-2 text-right font-mono mono-value text-t-3">{d.extraActualCount}</td>
                    <td className="py-1.5 px-2 text-right font-mono mono-value text-t-3">{d.txnsTotal}</td>
                    <td className="py-1.5 px-2 text-[10px]">
                      {d.warnings.length === 0 ? <span className="text-accent">✓</span> : <span className="text-danger" title={d.warnings.join('\n')}>⚠ {d.warnings.length}</span>}
                    </td>
                    <td className="py-1.5 px-2 text-right">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => setMonthDetail(d.monthId === monthDetail ? null : d.monthId)} className="text-[10px] text-info bg-info/10 border border-info/25 px-1.5 py-0.5 rounded">Détail</button>
                        {d.hasOrphans && (
                          <button onClick={() => trimOrphansTail(d.monthId)} className="text-[10px] text-warning bg-warning/10 border border-warning/25 px-1.5 py-0.5 rounded" title={`Trim au max ${postes.length}`}>Trim</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Détail du mois sélectionné */}
          {detailMonth && (
            <div className="bg-bg-2 border border-border rounded-md p-3 space-y-3">
              <div className="text-[12px] font-bold tracking-tight">Détail — {detailMonth.id}</div>

              {/* budget par index */}
              <details open>
                <summary className="cursor-pointer text-[11px] font-semibold text-t-2 mb-1">budget[] ({(detailMonth.budget || []).length} entrées) — devraient correspondre aux postes par index</summary>
                <div className="space-y-0.5 text-[11px] font-mono mt-1">
                  {(detailMonth.budget || []).map((row, i) => {
                    const expectedName = postes[i]?.name;
                    const isOrphan = i >= postes.length;
                    return (
                      <div key={i} className={`flex items-center gap-2 px-2 py-1 rounded ${isOrphan ? 'bg-danger/10 text-danger' : ''}`}>
                        <span className="text-t-4 w-6">{i}.</span>
                        <span className="flex-1">{expectedName || '⚠ ORPHELIN'}</span>
                        <span className="text-t-3">AED {f0(row?.aed || 0)}</span>
                        <span className="text-t-3">EUR {row?.eur != null ? f$(row.eur) : '—'}</span>
                      </div>
                    );
                  })}
                </div>
              </details>

              {/* actual par index */}
              <details open>
                <summary className="cursor-pointer text-[11px] font-semibold text-t-2 mb-1">actual[] ({(detailMonth.actual || []).length} entrées) — montre les txns par index</summary>
                <div className="space-y-1 text-[11px] font-mono mt-1">
                  {(detailMonth.actual || []).map((row, i) => {
                    const expectedName = postes[i]?.name;
                    const isOrphan = i >= postes.length;
                    const txns = row?.txns || [];
                    return (
                      <div key={i} className={`px-2 py-1 rounded ${isOrphan ? 'bg-danger/10 text-danger' : 'bg-bg-3'}`}>
                        <div className="flex items-center gap-2">
                          <span className="text-t-4 w-6">{i}.</span>
                          <span className="flex-1 font-semibold">{expectedName || '⚠ ORPHELIN'}</span>
                          <span className="text-t-3">{txns.length} txns</span>
                          <span className="text-t-3">AED {f0(row?.aed || 0)}</span>
                        </div>
                        {txns.length > 0 && (
                          <div className="ml-8 mt-1 space-y-0.5 text-[10px] text-t-3">
                            {txns.map((t: Transaction, ti: number) => (
                              <div key={ti}>· {t.date} · {t.label || '—'} · {f0(t.amount)} {t.currency || 'AED'}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </details>

              {/* extras */}
              {((detailMonth.extraBudget || []).length > 0 || (detailMonth.extraActual || []).length > 0) && (
                <details open>
                  <summary className="cursor-pointer text-[11px] font-semibold text-t-2 mb-1">Extras du mois</summary>
                  <div className="space-y-2 mt-1">
                    {(detailMonth.extraBudget || []).length > 0 && (
                      <div>
                        <div className="text-[10px] text-t-3 uppercase tracking-wider mb-1">extraBudget</div>
                        {(detailMonth.extraBudget || []).map((r, i) => (
                          <div key={i} className="flex items-center gap-2 text-[11px] font-mono bg-bg-3 px-2 py-1 rounded mb-0.5">
                            <span className="flex-1">{r.name}</span>
                            <span className="text-t-3">AED {f0(r.aed)} · EUR {f$(r.eur || 0)}</span>
                            <button onClick={() => deleteExtra(detailMonth.id, 'budget', i)} className="text-[10px] text-danger bg-danger/10 border border-danger/25 px-1.5 py-0.5 rounded">✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                    {(detailMonth.extraActual || []).length > 0 && (
                      <div>
                        <div className="text-[10px] text-t-3 uppercase tracking-wider mb-1">extraActual</div>
                        {(detailMonth.extraActual || []).map((r, i) => (
                          <div key={i} className="flex items-center gap-2 text-[11px] font-mono bg-bg-3 px-2 py-1 rounded mb-0.5">
                            <span className="flex-1">{r.name}</span>
                            <span className="text-t-3">{(r.txns || []).length} txns · AED {f0(r.aed)}</span>
                            <button onClick={() => deleteExtra(detailMonth.id, 'actual', i)} className="text-[10px] text-danger bg-danger/10 border border-danger/25 px-1.5 py-0.5 rounded">✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </details>
              )}
            </div>
          )}

          <div className="text-[10px] text-t-4 leading-relaxed pt-2 border-t border-border">
            <strong>Comment ça marche :</strong><br/>
            • <span className="text-danger">budget.len ou actual.len ≠ postes.len</span> = désalignement. Si plus → orphelins (data laissée après suppressions de postes), bouton <em>Trim</em> coupe la queue.<br/>
            • Clique <em>Détail</em> pour voir mois par mois ce qu'il y a dans chaque index, et purger les extras créés par erreur.<br/>
            • Si tu vois une row marquée ORPHELIN, ses data sont là mais pas reliée à un poste — Trim si elles sont en queue, sinon laissez-moi t'aider sur ces cas.
          </div>
        </div>
      )}
    </div>
  );
}
