'use client';

import { useMemo, useRef, useState } from 'react';
import { Upload, FileSpreadsheet, Check, X } from 'lucide-react';
import { useApp } from '@/context/AppProvider';
import PageHeader from '@/components/layout/PageHeader';
import { useDialog } from '@/components/ui/Dialog';
import {
  parseCsv, guessMapping, toBankLines, trackerItems, linesInMonth, reconcile, suggestPoste, detectDateOrder,
  CsvMapping, BankLine,
} from '@/lib/bankCsv';
import { makeTxn, addTxnsToPoste } from '@/lib/txns';
import { f0, f$, startedMonths } from '@/lib/utils';

const LABEL = 'block text-[10px] text-t-3 uppercase tracking-[0.12em] font-semibold mb-1.5';
/** 2026-11-05 → 05/11 */
const dm = (d: string) => (d && d.length >= 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '—');

/**
 * Relevé bancaire : import d'un CSV et rapprochement avec un mois du tracker. Le fichier
 * est lu DANS le navigateur — rien n'est envoyé ni conservé ; seules les transactions que
 * tu choisis d'ajouter sont enregistrées. Page unique, responsive (desktop + mobile).
 * Lecture et rapprochement : lib/bankCsv.
 */
export default function ImportPage() {
  const { state, setState, save, getState, liveRate, activeSpace, curMonth, logChange } = useApp();
  const { confirm } = useDialog();
  const cur = activeSpace?.localCurrency || 'AED';
  const fileRef = useRef<HTMLInputElement>(null);

  const months = useMemo(() => startedMonths(state.months).slice().reverse(), [state.months]);
  const [monthId, setMonthId] = useState('');
  const effectiveMonthId = monthId || (months.some(m => m.id === curMonth) ? (curMonth as string) : months[0]?.id || '');
  const month = state.months.find(m => m.id === effectiveMonthId);

  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<string[][] | null>(null);
  const [map, setMap] = useState<CsvMapping | null>(null);
  const [error, setError] = useState('');
  const [targets, setTargets] = useState<Record<number, number>>({});
  const [ignored, setIgnored] = useState<number[]>([]);
  const [showMatched, setShowMatched] = useState(false);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setError('');
    try {
      const buf = await f.arrayBuffer();
      let text: string;
      // Beaucoup de banques exportent en Windows-1252 : on retombe dessus si ce n'est pas de l'UTF-8 valide
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { text = new TextDecoder('windows-1252').decode(buf); }
      const r = parseCsv(text);
      if (r.length < 2) { setError('Ce fichier ne contient pas de lignes exploitables. Il faut un export CSV du relevé (pas un PDF).'); return; }
      setRows(r); setMap(guessMapping(r)); setFileName(f.name);
      setTargets({}); setIgnored([]); setShowMatched(false);
    } catch {
      setError('Lecture du fichier impossible.');
    }
  };

  const reset = () => {
    setRows(null); setMap(null); setFileName(''); setError(''); setTargets({}); setIgnored([]);
    if (fileRef.current) fileRef.current.value = '';
  };

  const parsed = useMemo(() => (rows && map ? toBankLines(rows, map) : null), [rows, map]);
  const scoped = useMemo(() => (parsed && month ? linesInMonth(parsed.lines, month) : null), [parsed, month]);
  const items = useMemo(
    () => (month ? trackerItems(month, state.postes, state.revenus?.months, state.rate || liveRate) : []),
    [month, state.postes, state.revenus, state.rate, liveRate],
  );
  const rec = useMemo(() => (scoped ? reconcile(scoped.lines, items) : null), [scoped, items]);

  const hidden = month?.hiddenPostes || [];
  const posteOptions = state.postes.map((p, i) => ({ i, name: p.name })).filter(p => !hidden.includes(p.name));
  const targetOf = (l: BankLine): number => {
    if (targets[l.idx] !== undefined) return targets[l.idx];
    const s = suggestPoste(l.label, state.months, state.postes);
    return s >= 0 && !hidden.includes(state.postes[s].name) ? s : -1;
  };

  const addLines = (lines: { line: BankLine; posteIdx: number }[]) => {
    const s = getState();
    const m = s.months.find(x => x.id === effectiveMonthId);
    if (!m || lines.length === 0) return;
    let next = m;
    lines.forEach(({ line, posteIdx }) => {
      const t = makeTxn({ label: line.label || 'Relevé bancaire', amount: Math.abs(line.amount), currency: 'AED', date: line.date, rate: s.rate });
      next = addTxnsToPoste(next, posteIdx, [t], s.rate);
    });
    setState({ ...s, months: s.months.map(mo => (mo.id === effectiveMonthId ? next : mo)) });
    save();
    const total = lines.reduce((sum, x) => sum + Math.abs(x.line.amount), 0);
    logChange?.('import.add', `${lines.length} transaction(s) ajoutée(s) à ${effectiveMonthId} depuis le relevé (${f0(total)} ${cur})`);
  };

  const missingOut = rec ? rec.bankOnly.filter(l => l.amount < 0 && !ignored.includes(l.idx)) : [];
  const missingIn = rec ? rec.bankOnly.filter(l => l.amount > 0 && !ignored.includes(l.idx)) : [];
  const ready = missingOut.map(l => ({ line: l, posteIdx: targetOf(l) })).filter(x => x.posteIdx >= 0);

  const addAll = async () => {
    if (ready.length === 0) return;
    const total = ready.reduce((s, x) => s + Math.abs(x.line.amount), 0);
    const ok = await confirm(
      `Ajouter ${ready.length} transaction(s) à ${effectiveMonthId} pour ${f0(total)} ${cur} ?\n\nChacune va dans le poste affiché sur sa ligne.${ready.length < missingOut.length ? `\n\n${missingOut.length - ready.length} ligne(s) sans poste choisi ne seront pas ajoutées.` : ''}`,
      { title: 'Ajouter depuis le relevé', confirmLabel: 'Ajouter' },
    );
    if (ok) addLines(ready);
  };

  const headerNames = rows && map ? (map.headerRow >= 0 ? rows[map.headerRow] : []) : [];
  const width = rows ? Math.max(0, ...rows.map(r => r.length)) : 0;
  const colOptions = Array.from({ length: width }, (_, i) => ({ i, name: headerNames[i] ? `${headerNames[i]}` : `Colonne ${i + 1}` }));
  const twoCols = !!map && (map.debit >= 0 || map.credit >= 0);
  const setCol = (patch: Partial<CsvMapping>) => {
    if (!map || !rows) return;
    const next = { ...map, ...patch };
    if (patch.date !== undefined && next.date >= 0) next.order = detectDateOrder(rows.slice(next.headerRow + 1).map(r => r[next.date] || ''));
    setMap(next);
  };
  const gap = rec ? Math.round((rec.totals.bankOut - rec.totals.trackerOut) * 100) / 100 : 0;

  return (
    <div>
      <PageHeader breadcrumb={[{ label: activeSpace.name }, { label: 'Relevé bancaire', current: true }]} title="Relevé bancaire" subtitle="Compare un relevé CSV à ce que tu as saisi">
        {rows && <button onClick={reset} className="btn btn-ghost">Changer de fichier</button>}
      </PageHeader>

      {/* ── Étape 1 : mois + fichier ── */}
      <div className="bg-bg-3 border border-border rounded-lg p-4 mb-4">
        <div className="grid grid-cols-[240px_1fr] gap-4 items-end max-md:grid-cols-1">
          <div>
            <label className={LABEL} htmlFor="imp-month">Mois à rapprocher</label>
            <select id="imp-month" className="fi" value={effectiveMonthId} onChange={e => setMonthId(e.target.value)}>
              {months.map(m => <option key={m.id} value={m.id}>{m.id}</option>)}
            </select>
          </div>
          <div>
            <input ref={fileRef} id="imp-file" type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
            {rows ? (
              <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-bg-2 border border-border rounded-md min-w-0">
                <FileSpreadsheet size={15} className="text-accent shrink-0" />
                <span className="text-[13px] text-t-1 truncate">{fileName}</span>
                <span className="text-[11px] text-t-4 shrink-0">{parsed ? `${parsed.lines.length} ligne(s) lue(s)` : ''}</span>
              </div>
            ) : (
              <label
                htmlFor="imp-file"
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]); }}
                className="flex items-center justify-center gap-2.5 px-4 py-4 border border-dashed border-border-2 rounded-md text-t-2 hover:border-accent hover:text-t-1 transition-all cursor-pointer text-[13px] font-semibold"
              >
                <Upload size={15} /> Choisir le relevé (.csv)
              </label>
            )}
          </div>
        </div>
        {error && <div className="text-[12px] text-danger mt-3">{error}</div>}
        {!rows && (
          <p className="text-[11px] text-t-4 mt-3 leading-relaxed">
            Exporte le relevé du mois au format CSV depuis ta banque (compte en {cur}). Le fichier reste sur ton appareil : il est lu ici, dans le navigateur,
            et rien n&apos;est envoyé ni conservé. Seules les transactions que tu choisiras d&apos;ajouter seront enregistrées.
          </p>
        )}
      </div>

      {/* ── Étape 2 : colonnes ── */}
      {rows && map && (
        <div className="bg-bg-3 border border-border rounded-lg p-4 mb-4">
          <div className="text-[13px] font-semibold text-t-2">Colonnes du fichier</div>
          <div className="text-[11px] text-t-4 mt-0.5 mb-3">Détectées automatiquement — corrige si l&apos;aperçu est faux.</div>
          <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2">
            <div>
              <label className={LABEL} htmlFor="imp-date">Date</label>
              <select id="imp-date" className="fi" value={map.date} onChange={e => setCol({ date: parseInt(e.target.value, 10) })}>
                <option value={-1}>—</option>
                {colOptions.map(c => <option key={c.i} value={c.i}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL} htmlFor="imp-label">Libellé</label>
              <select id="imp-label" className="fi" value={map.label} onChange={e => setCol({ label: parseInt(e.target.value, 10) })}>
                <option value={-1}>—</option>
                {colOptions.map(c => <option key={c.i} value={c.i}>{c.name}</option>)}
              </select>
            </div>
            {twoCols ? (
              <>
                <div>
                  <label className={LABEL} htmlFor="imp-debit">Sorties (débit)</label>
                  <select id="imp-debit" className="fi" value={map.debit} onChange={e => setCol({ debit: parseInt(e.target.value, 10) })}>
                    <option value={-1}>—</option>
                    {colOptions.map(c => <option key={c.i} value={c.i}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={LABEL} htmlFor="imp-credit">Entrées (crédit)</label>
                  <select id="imp-credit" className="fi" value={map.credit} onChange={e => setCol({ credit: parseInt(e.target.value, 10) })}>
                    <option value={-1}>—</option>
                    {colOptions.map(c => <option key={c.i} value={c.i}>{c.name}</option>)}
                  </select>
                </div>
              </>
            ) : (
              <div className="col-span-2 max-lg:col-span-2">
                <label className={LABEL} htmlFor="imp-amount">Montant</label>
                <select id="imp-amount" className="fi" value={map.amount} onChange={e => setCol({ amount: parseInt(e.target.value, 10) })}>
                  <option value={-1}>—</option>
                  {colOptions.map(c => <option key={c.i} value={c.i}>{c.name}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 mt-3 text-[12px] text-t-2">
            <button type="button" onClick={() => setMap(twoCols ? { ...map, amount: map.debit, debit: -1, credit: -1 } : { ...map, amount: -1, debit: map.amount >= 0 ? map.amount : 0, credit: -1 })} className="text-info hover:underline cursor-pointer">
              {twoCols ? 'Mon relevé a une seule colonne « montant »' : 'Mon relevé a deux colonnes débit / crédit'}
            </button>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={map.order === 'MDY'} onChange={e => setMap({ ...map, order: e.target.checked ? 'MDY' : 'DMY' })} />
              Dates au format américain (mois/jour)
            </label>
            {!twoCols && (
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={map.invert} onChange={e => setMap({ ...map, invert: e.target.checked })} />
                Les dépenses sont écrites en positif
              </label>
            )}
          </div>
          {parsed && (
            <div className="mt-3 pt-3 border-t border-border">
              <div className="text-[10px] text-t-3 uppercase tracking-[0.12em] font-semibold mb-1.5">
                Aperçu — {parsed.lines.length} ligne(s) lue(s){parsed.skipped > 0 ? `, ${parsed.skipped} ignorée(s) (sans date ou sans montant)` : ''}
              </div>
              {parsed.lines.length === 0
                ? <div className="text-[12px] text-warning">Aucune ligne lisible avec ces colonnes : vérifie la date et le montant.</div>
                : parsed.lines.slice(0, 3).map(l => (
                  <div key={l.idx} className="flex items-baseline gap-3 text-[12px] py-0.5">
                    <span className="text-t-4 w-[42px] shrink-0 tabular-nums">{dm(l.date)}</span>
                    <span className="text-t-2 truncate flex-1 min-w-0">{l.label || '—'}</span>
                    <span className={`mono-value shrink-0 ${l.amount < 0 ? 'text-t-1' : 'text-accent'}`}>{l.amount < 0 ? '−' : '+'}{f$(Math.abs(l.amount))}</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* ── Étape 3 : rapprochement ── */}
      {rec && scoped && month && (
        <>
          <div className="grid grid-cols-4 gap-3 mb-4 max-lg:grid-cols-2">
            <div className="bg-bg-3 border border-border rounded-lg px-4 py-3.5">
              <div className="text-[9px] text-t-3 uppercase tracking-[0.14em] font-semibold">Sorties du relevé</div>
              <div className="text-[19px] mt-1.5 mono-value leading-none text-t-1">{f0(rec.totals.bankOut)} {cur}</div>
              <div className="text-[10px] text-t-4 mt-1.5">{scoped.lines.filter(l => l.amount < 0).length} ligne(s) en {month.id.toLowerCase()}</div>
            </div>
            <div className="bg-bg-3 border border-border rounded-lg px-4 py-3.5">
              <div className="text-[9px] text-t-3 uppercase tracking-[0.14em] font-semibold">Sorties dans le tracker</div>
              <div className="text-[19px] mt-1.5 mono-value leading-none text-t-1">{f0(rec.totals.trackerOut)} {cur}</div>
              <div className="text-[10px] text-t-4 mt-1.5">hors dépenses payées en voyage</div>
            </div>
            <div className="bg-bg-3 border border-border rounded-lg px-4 py-3.5">
              <div className="text-[9px] text-t-3 uppercase tracking-[0.14em] font-semibold">Écart</div>
              <div className={`text-[19px] mt-1.5 mono-value leading-none ${Math.abs(gap) < 1 ? 'text-accent' : 'text-warning'}`}>{gap > 0 ? '+' : ''}{f0(gap)} {cur}</div>
              <div className="text-[10px] text-t-4 mt-1.5">{Math.abs(gap) < 1 ? 'les deux concordent' : gap > 0 ? 'le relevé a plus de sorties' : 'le tracker a plus de sorties'}</div>
            </div>
            <div className="bg-bg-3 border border-border rounded-lg px-4 py-3.5">
              <div className="text-[9px] text-t-3 uppercase tracking-[0.14em] font-semibold">Rapprochées</div>
              <div className="text-[19px] mt-1.5 mono-value leading-none text-t-1">{rec.matched.length} / {scoped.lines.length}</div>
              <div className="text-[10px] text-t-4 mt-1.5">{scoped.outside > 0 ? `${scoped.outside} ligne(s) hors du mois, non comptée(s)` : 'lignes du relevé retrouvées'}</div>
            </div>
          </div>

          {/* Dans le relevé, pas dans le tracker */}
          <div className="bg-bg-3 border border-border rounded-lg overflow-hidden mb-4">
            <div className="flex items-center justify-between gap-3 px-4 py-3 flex-wrap">
              <div>
                <div className="text-[13px] font-semibold text-t-2">Dans le relevé, absent du tracker <span className="text-t-4 font-normal">({missingOut.length + missingIn.length})</span></div>
                <div className="text-[11px] text-t-4 mt-0.5">Des dépenses que tu n&apos;as pas saisies. Choisis le poste puis ajoute-les.</div>
              </div>
              {ready.length > 1 && <button onClick={addAll} className="btn btn-primary">Tout ajouter ({ready.length})</button>}
            </div>
            {missingOut.length + missingIn.length === 0 && (
              <div className="px-4 py-3 border-t border-border text-[12px] text-accent flex items-center gap-2"><Check size={14} /> Tout ce qui est dans le relevé est dans le tracker.</div>
            )}
            {missingOut.map(l => {
              const t = targetOf(l);
              return (
                <div key={l.idx} className="flex items-center gap-3 px-4 py-2.5 border-t border-border flex-wrap">
                  <span className="text-[11px] text-t-4 w-[42px] shrink-0 tabular-nums">{dm(l.date)}</span>
                  <span className="text-[13px] text-t-1 flex-1 min-w-[140px] truncate" title={l.label}>{l.label || '—'}</span>
                  <span className="text-[13px] mono-value text-t-1 shrink-0">{f$(Math.abs(l.amount))} {cur}</span>
                  <div className="flex gap-2 items-center shrink-0 max-md:w-full">
                    <select className="fi !w-[170px] !py-1.5 text-[12px] max-md:!w-auto max-md:flex-1" value={t} onChange={e => setTargets({ ...targets, [l.idx]: parseInt(e.target.value, 10) })} aria-label={`Poste pour ${l.label}`}>
                      <option value={-1}>Choisir un poste…</option>
                      {posteOptions.map(p => <option key={p.i} value={p.i}>{p.name}</option>)}
                    </select>
                    <button onClick={() => addLines([{ line: l, posteIdx: t }])} disabled={t < 0} className="btn btn-primary disabled:opacity-40 disabled:cursor-not-allowed">Ajouter</button>
                    <button onClick={() => setIgnored([...ignored, l.idx])} className="w-8 h-8 flex items-center justify-center text-t-3 hover:text-t-1 rounded-md hover:bg-bg-4 transition-all cursor-pointer" title="Ignorer cette ligne" aria-label={`Ignorer ${l.label}`}>
                      <X size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
            {missingIn.map(l => (
              <div key={l.idx} className="flex items-center gap-3 px-4 py-2.5 border-t border-border flex-wrap">
                <span className="text-[11px] text-t-4 w-[42px] shrink-0 tabular-nums">{dm(l.date)}</span>
                <span className="text-[13px] text-t-1 flex-1 min-w-[140px] truncate" title={l.label}>{l.label || '—'}</span>
                <span className="text-[13px] mono-value text-accent shrink-0">+{f$(l.amount)} {cur}</span>
                <span className="text-[11px] text-t-4 shrink-0">entrée d&apos;argent — à saisir dans Revenus</span>
              </div>
            ))}
            {ignored.length > 0 && (
              <div className="px-4 py-2.5 border-t border-border text-[11px] text-t-4">
                {ignored.length} ligne(s) ignorée(s) · <button onClick={() => setIgnored([])} className="text-info hover:underline cursor-pointer">les réafficher</button>
              </div>
            )}
          </div>

          {/* Dans le tracker, pas dans le relevé */}
          <div className="bg-bg-3 border border-border rounded-lg overflow-hidden mb-4">
            <div className="px-4 py-3">
              <div className="text-[13px] font-semibold text-t-2">Dans le tracker, absent du relevé <span className="text-t-4 font-normal">({rec.trackerOnly.length})</span></div>
              <div className="text-[11px] text-t-4 mt-0.5">Saisi mais introuvable à la banque : doublon, montant ou mois erroné, paiement en espèces, ou pas encore débité.</div>
            </div>
            {rec.trackerOnly.length === 0 && (
              <div className="px-4 py-3 border-t border-border text-[12px] text-accent flex items-center gap-2"><Check size={14} /> Tout ce qui est saisi apparaît dans le relevé.</div>
            )}
            {rec.trackerOnly.map(t => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 border-t border-border">
                <span className="text-[11px] text-t-4 w-[42px] shrink-0 tabular-nums">{t.date ? dm(t.date) : '—'}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] text-t-1 truncate">{t.label}</span>
                  <span className="block text-[11px] text-t-3 truncate">{t.kind === 'revenue' ? 'Revenu' : t.where}{t.date ? '' : ' · montant saisi sans transaction'}</span>
                </span>
                <span className={`text-[13px] mono-value shrink-0 ${t.kind === 'revenue' ? 'text-accent' : 'text-t-1'}`}>{t.kind === 'revenue' ? '+' : ''}{f$(t.amount)} {cur}</span>
              </div>
            ))}
          </div>

          {/* Rapprochées */}
          <div className="bg-bg-3 border border-border rounded-lg overflow-hidden mb-4">
            <button onClick={() => setShowMatched(v => !v)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left cursor-pointer hover:bg-bg-4/40 transition-colors">
              <span className="text-[13px] font-semibold text-t-2">Rapprochées <span className="text-t-4 font-normal">({rec.matched.length})</span></span>
              <span className="text-[11px] text-t-3">{showMatched ? 'Masquer' : 'Afficher'}</span>
            </button>
            {showMatched && rec.matched.map(m => (
              <div key={`${m.bank.idx}-${m.item.id}`} className="flex items-center gap-3 px-4 py-2 border-t border-border">
                <span className="text-[11px] text-t-4 w-[42px] shrink-0 tabular-nums">{dm(m.bank.date)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] text-t-1 truncate">{m.bank.label || '—'}</span>
                  <span className="block text-[11px] text-t-3 truncate">
                    ↔ {m.item.label} · {m.item.where}
                    {m.dayGap ? ` · ${m.dayGap} j d'écart` : ''}
                  </span>
                </span>
                {!m.exact && <span className="text-[9px] font-semibold tracking-[0.05em] px-1.5 py-[2px] rounded text-warning bg-warning/10 shrink-0">≈ {m.diff > 0 ? '+' : ''}{f$(m.diff)}</span>}
                <span className="text-[12px] mono-value text-t-2 shrink-0">{f$(Math.abs(m.bank.amount))}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
