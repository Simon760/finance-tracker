'use client';

import { useMemo, useState } from 'react';
import { useApp } from '@/context/AppProvider';
import { Month, Transaction, ActualRow, BudgetRow } from '@/lib/types';
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

  // Normalise un nom: trim + uppercase + retire les accents
  const normalizeName = (s: string): string => {
    return s.trim().normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '').toUpperCase();
  };

  // Détecte les doublons par nom (accent + case insensitive) dans state.postes
  const duplicates = useMemo(() => {
    const map = new Map<string, number[]>();
    postes.forEach((p, i) => {
      const key = normalizeName(p.name);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(i);
    });
    return Array.from(map.entries())
      .filter(([, idxs]) => idxs.length > 1)
      .map(([name, idxs]) => ({ name, idxs }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postes]);

  // Détecte les extras dont le nom matche un poste régulier (= duplication cachée)
  const posteNamesSet = useMemo(() => {
    return new Set(postes.map(p => normalizeName(p.name)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postes]);
  const extraConflicts = useMemo(() => {
    type Conflict = { monthId: string; section: 'budget' | 'actual'; idx: number; name: string; aed: number; eur: number; txnsCount: number };
    const list: Conflict[] = [];
    months.forEach(mo => {
      (mo.extraBudget || []).forEach((r, i) => {
        if (posteNamesSet.has(normalizeName(r.name))) {
          list.push({ monthId: mo.id, section: 'budget', idx: i, name: r.name, aed: r.aed || 0, eur: r.eur || 0, txnsCount: 0 });
        }
      });
      (mo.extraActual || []).forEach((r, i) => {
        if (posteNamesSet.has(normalizeName(r.name))) {
          list.push({ monthId: mo.id, section: 'actual', idx: i, name: r.name, aed: r.aed || 0, eur: r.eur || 0, txnsCount: (r.txns || []).length });
        }
      });
    });
    return list;
  }, [months, posteNamesSet]);

  // Fusionne un extra conflict dans le poste régulier (somme valeurs, append txns) puis le supprime
  const mergeExtraIntoPoste = (monthId: string, section: 'budget' | 'actual', extraIdx: number) => {
    const month = months.find(m => m.id === monthId);
    if (!month) return;
    const extra = section === 'budget' ? month.extraBudget?.[extraIdx] : month.extraActual?.[extraIdx];
    if (!extra) return;
    const posteIdx = postes.findIndex(p => normalizeName(p.name) === normalizeName(extra.name));
    if (posteIdx < 0) return;

    if (!confirm(`Fusionner l'extra "${extra.name}" (${section}) du mois ${monthId} dans le poste régulier homonyme ?\n\n• Les valeurs aed/eur seront ajoutées au m.${section === 'budget' ? 'budget' : 'actual'}[${posteIdx}]\n${section === 'actual' ? `• Les ${(extra.txns || []).length} transactions seront concaténées\n` : ''}• L'extra sera supprimé\n\nBackup recommandé avant.`)) return;

    const updated = {
      ...state,
      months: months.map(mo => {
        if (mo.id !== monthId) return mo;
        const newM = { ...mo };
        if (section === 'budget') {
          const newBudget = [...(mo.budget || [])];
          const cur = newBudget[posteIdx] || { aed: 0, eur: null };
          newBudget[posteIdx] = {
            aed: (cur.aed || 0) + (extra.aed || 0),
            eur: (cur.eur ?? 0) + (extra.eur || 0) || null,
          };
          newM.budget = newBudget;
          newM.extraBudget = (mo.extraBudget || []).filter((_, j) => j !== extraIdx);
        } else {
          const newActual = [...(mo.actual || [])];
          const cur = newActual[posteIdx] || { aed: 0, eur: null, txns: [] };
          const extraTxns = ('txns' in extra ? extra.txns : []) || [];
          newActual[posteIdx] = {
            aed: (cur.aed || 0) + (extra.aed || 0),
            eur: (cur.eur ?? 0) + (extra.eur || 0) || null,
            txns: [...(cur.txns || []), ...extraTxns],
          };
          newM.actual = newActual;
          newM.extraActual = (mo.extraActual || []).filter((_, j) => j !== extraIdx);
        }
        return newM;
      }),
    };
    setState(updated);
    save();
  };

  // Fusionne tous les doublons d'un nom en gardant le 1er index, supprimant les autres
  // Pour chaque mois: sum aed/eur dans budget+actual du 1er, append txns; puis splice les autres.
  const mergeDuplicates = (name: string, idxs: number[]) => {
    if (idxs.length < 2) return;
    if (!confirm(`Fusionner ${idxs.length} entrées "${name}" en une seule ?\n\n• Les valeurs budget et réel de chaque mois seront SOMMÉES dans la 1ère entrée\n• Les transactions seront concaténées\n• Les autres entrées seront supprimées (splice clean des indices dans tous les mois)\n\nÀ faire après backup ! (Settings → Exporter)`)) return;

    const keepIdx = idxs[0];
    const removeIdxs = idxs.slice(1).sort((a, b) => b - a); // desc pour splice safe

    const updated = {
      ...state,
      postes: postes.filter((_, i) => !removeIdxs.includes(i)),
      months: months.map(mo => {
        let budget = [...(mo.budget || [])];
        let actual = [...(mo.actual || [])];

        // Snapshot des valeurs pour SUMMING
        const budgetEntries = idxs.map(idx => budget[idx] || { aed: 0, eur: null });
        const actualEntries = idxs.map(idx => actual[idx] || { aed: 0, eur: null });
        const txnsMerged: Transaction[] = [];
        actualEntries.forEach(a => { if (a.txns) txnsMerged.push(...a.txns); });

        // Set la fusion dans le keepIdx
        const sumAed = budgetEntries.reduce((s, b) => s + (b.aed || 0), 0);
        const sumEurB = budgetEntries.reduce((s: number, b: BudgetRow) => s + (b.eur ?? 0), 0);
        budget[keepIdx] = { aed: sumAed, eur: sumEurB > 0 ? sumEurB : null };

        const sumActAed = actualEntries.reduce((s, a) => s + (a.aed || 0), 0);
        const sumActEur = actualEntries.reduce((s: number, a: ActualRow) => s + (a.eur ?? 0), 0);
        actual[keepIdx] = {
          aed: sumActAed,
          eur: sumActEur > 0 ? sumActEur : null,
          txns: txnsMerged,
        };

        // Splice les indices supplémentaires (desc pour pas casser)
        removeIdxs.forEach(i => {
          budget.splice(i, 1);
          actual.splice(i, 1);
        });

        return { ...mo, budget, actual };
      }),
    };
    setState(updated);
    save();
    alert(`Fusion OK : ${idxs.length} entrées "${name}" → 1 entrée.`);
  };

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

  // Pour le mois sélectionné, regroupe toutes les sources (regular + extras) par nom de poste
  // Permet de voir si un même nom apparaît dans plusieurs entrées
  type SourceEntry = { kind: 'regular' | 'extraBudget' | 'extraActual'; idx: number; name: string; budgetAed: number; actualAed: number; txnsCount: number };
  const sourcesByName: Map<string, SourceEntry[]> = useMemo(() => {
    const map = new Map<string, SourceEntry[]>();
    if (!detailMonth) return map;
    const push = (key: string, e: SourceEntry) => {
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    };
    // Regular postes (par index)
    postes.forEach((p, i) => {
      const key = normalizeName(p.name);
      push(key, {
        kind: 'regular',
        idx: i,
        name: p.name,
        budgetAed: detailMonth.budget?.[i]?.aed || 0,
        actualAed: detailMonth.actual?.[i]?.aed || 0,
        txnsCount: (detailMonth.actual?.[i]?.txns || []).length,
      });
    });
    // Extra budget
    (detailMonth.extraBudget || []).forEach((r, i) => {
      const key = normalizeName(r.name);
      push(key, { kind: 'extraBudget', idx: i, name: r.name, budgetAed: r.aed || 0, actualAed: 0, txnsCount: 0 });
    });
    // Extra actual
    (detailMonth.extraActual || []).forEach((r, i) => {
      const key = normalizeName(r.name);
      push(key, { kind: 'extraActual', idx: i, name: r.name, budgetAed: 0, actualAed: r.aed || 0, txnsCount: (r.txns || []).length });
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailMonth, postes]);

  // Liste les noms qui apparaissent dans >1 source
  const multiSourceNames = useMemo(() => {
    return Array.from(sourcesByName.entries()).filter(([, srcs]) => srcs.length > 1);
  }, [sourcesByName]);

  // Édition manuelle directe d'une cellule m.budget[idx].aed ou m.actual[idx].aed
  const setRowAed = (monthId: string, section: 'budget' | 'actual', idx: number, newAed: number) => {
    const updated = {
      ...state,
      months: state.months.map(mo => {
        if (mo.id !== monthId) return mo;
        if (section === 'budget') {
          const arr = [...(mo.budget || [])];
          arr[idx] = { ...(arr[idx] || { aed: 0, eur: null }), aed: newAed };
          return { ...mo, budget: arr };
        }
        const arr = [...(mo.actual || [])];
        arr[idx] = { ...(arr[idx] || { aed: 0, eur: null, txns: [] }), aed: newAed };
        return { ...mo, actual: arr };
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

          {/* Conflits extras vs poste régulier */}
          {extraConflicts.length > 0 && (
            <div className="bg-warning/10 border border-warning/30 rounded-md p-3 space-y-2">
              <div className="text-[12px] font-bold text-warning">⚠ {extraConflicts.length} extra{extraConflicts.length > 1 ? 's' : ''} avec le même nom qu'un poste régulier</div>
              <div className="text-[10px] text-t-3">
                Probablement créés par erreur. Tu peux les fusionner dans le poste régulier homonyme (somme des valeurs + txns) ou les supprimer.
              </div>
              {extraConflicts.map((c, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px] bg-bg-3 px-2 py-1.5 rounded">
                  <span className="font-mono text-t-2 flex-1">
                    <strong>{c.name}</strong> · {c.monthId} · extra<span className="text-t-4">.{c.section}</span> · {f0(c.aed)} AED · {f$(c.eur)} €
                    {c.section === 'actual' && c.txnsCount > 0 && <span className="text-t-3"> · {c.txnsCount} txns</span>}
                  </span>
                  <button
                    onClick={() => mergeExtraIntoPoste(c.monthId, c.section, c.idx)}
                    className="text-[10px] font-semibold text-accent bg-accent/15 border border-accent/30 px-2 py-0.5 rounded hover:bg-accent/25"
                  >
                    Fusionner
                  </button>
                  <button
                    onClick={() => deleteExtra(c.monthId, c.section, c.idx)}
                    className="text-[10px] font-semibold text-danger bg-danger/15 border border-danger/30 px-2 py-0.5 rounded hover:bg-danger/25"
                  >
                    ✕ Supprimer
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Doublons détectés */}
          {duplicates.length > 0 && (
            <div className="bg-danger/10 border border-danger/30 rounded-md p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-bold text-danger">⚠ {duplicates.length} doublon{duplicates.length > 1 ? 's' : ''} détecté{duplicates.length > 1 ? 's' : ''}</span>
              </div>
              {duplicates.map(({ name, idxs }) => (
                <div key={name} className="flex items-center gap-2 text-[11px]">
                  <span className="font-mono text-t-2 flex-1">
                    <strong>{name}</strong> aux index <span className="text-danger">{idxs.join(', ')}</span> ({idxs.length}×)
                  </span>
                  <button
                    onClick={() => mergeDuplicates(name, idxs)}
                    className="text-[11px] font-semibold text-accent bg-accent/15 border border-accent/30 px-2.5 py-1 rounded hover:bg-accent/25"
                  >
                    Fusionner
                  </button>
                </div>
              ))}
              <div className="text-[10px] text-t-3 pt-1 border-t border-danger/20">
                Fusion = somme des montants budget+actual du nom, txns concaténées, indices supplémentaires retirés cleanly de tous les mois.
              </div>
            </div>
          )}

          {/* Liste des postes globaux pour reference */}
          <details className="bg-bg-2 border border-border rounded-md p-2">
            <summary className="cursor-pointer text-[11px] font-semibold text-t-2">Postes globaux ({postes.length}) — par index</summary>
            <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-1 text-[11px] font-mono">
              {postes.map((p, i) => (
                <div key={i} className={`${duplicates.some(d => d.idxs.includes(i)) ? 'text-danger font-bold' : 'text-t-3'}`}>
                  <span className="text-t-4">{i}.</span> {p.name}
                </div>
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

              {/* Noms apparaissant dans plusieurs sources */}
              {multiSourceNames.length > 0 && (
                <div className="bg-danger/10 border border-danger/30 rounded-md p-2.5 space-y-1.5">
                  <div className="text-[11px] font-bold text-danger">⚠ {multiSourceNames.length} nom{multiSourceNames.length > 1 ? 's' : ''} dans plusieurs sources</div>
                  {multiSourceNames.map(([key, srcs]) => (
                    <div key={key} className="text-[11px] bg-bg-3 p-2 rounded">
                      <div className="font-semibold text-t-1 mb-1">{srcs[0].name} ({srcs.length} sources)</div>
                      {srcs.map((s, i) => (
                        <div key={i} className="flex items-center gap-2 text-[10px] font-mono text-t-3 pl-2">
                          <span className="text-t-4 w-3">{i+1}.</span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${s.kind === 'regular' ? 'bg-info/15 text-info' : 'bg-warning/15 text-warning'}`}>{s.kind === 'regular' ? `regular[${s.idx}]` : s.kind === 'extraBudget' ? `extraBudget[${s.idx}]` : `extraActual[${s.idx}]`}</span>
                          <span className="flex-1">budget {f0(s.budgetAed)} · actual {f0(s.actualAed)} · {s.txnsCount} txns</span>
                        </div>
                      ))}
                    </div>
                  ))}
                  <div className="text-[10px] text-t-3 pt-1 border-t border-danger/20">
                    Si tu vois 2+ sources pour un même nom (ex: 1 regular + 1 extraBudget), c'est ça qui fausse les % entre Budget et Réel. Supprime la mauvaise via les ✕ dans la liste extras plus bas, OU édite manuellement les valeurs.
                  </div>
                </div>
              )}

              {/* budget par index — éditable */}
              <details open>
                <summary className="cursor-pointer text-[11px] font-semibold text-t-2 mb-1">
                  budget[] ({(detailMonth.budget || []).length} entrées) — clic sur la valeur AED pour éditer
                </summary>
                <div className="space-y-0.5 text-[11px] font-mono mt-1">
                  {(detailMonth.budget || []).map((row, i) => {
                    const expectedName = postes[i]?.name;
                    const isOrphan = i >= postes.length;
                    return (
                      <div key={i} className={`flex items-center gap-2 px-2 py-1 rounded ${isOrphan ? 'bg-danger/10 text-danger' : ''}`}>
                        <span className="text-t-4 w-6">{i}.</span>
                        <span className="flex-1">{expectedName || '⚠ ORPHELIN'}</span>
                        <input
                          type="number"
                          defaultValue={row?.aed || 0}
                          onBlur={e => {
                            const v = parseFloat(e.target.value) || 0;
                            if (v !== (row?.aed || 0)) setRowAed(detailMonth.id, 'budget', i, v);
                          }}
                          className="w-24 bg-bg-3 border border-border rounded px-2 py-0.5 text-right text-[11px] mono-value focus:border-accent outline-none"
                          step="0.01"
                          title="Édite m.budget[i].aed directement"
                        />
                        <span className="text-t-4 text-[10px]">AED · EUR {row?.eur != null ? f$(row.eur) : '—'}</span>
                      </div>
                    );
                  })}
                </div>
              </details>

              {/* actual par index — éditable */}
              <details open>
                <summary className="cursor-pointer text-[11px] font-semibold text-t-2 mb-1">
                  actual[] ({(detailMonth.actual || []).length} entrées) — clic sur la valeur AED pour éditer
                </summary>
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
                          <span className="text-t-3 text-[10px]">{txns.length} txns</span>
                          <input
                            type="number"
                            defaultValue={row?.aed || 0}
                            onBlur={e => {
                              const v = parseFloat(e.target.value) || 0;
                              if (v !== (row?.aed || 0)) setRowAed(detailMonth.id, 'actual', i, v);
                            }}
                            className="w-24 bg-bg-3 border border-border rounded px-2 py-0.5 text-right text-[11px] mono-value focus:border-accent outline-none"
                            step="0.01"
                            title="Édite m.actual[i].aed directement"
                          />
                          <span className="text-t-4 text-[10px]">AED</span>
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
