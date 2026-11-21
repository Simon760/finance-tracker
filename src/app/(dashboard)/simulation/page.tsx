'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Copy, Trash2, Plus, X, FlaskConical, CalendarPlus, RotateCw } from 'lucide-react';
import { useIsMobile } from '@/lib/useIsMobile';
import { MAction, MButton, MCard, MDivider, MEmpty, MField, MLabel, MNum, MPill, MRow } from '@/components/mobile/ui';
import { useApp } from '@/context/AppProvider';
import PageHeader from '@/components/layout/PageHeader';
import { useDialog } from '@/components/ui/Dialog';
import { Simulation } from '@/lib/types';
import { projectSimulation, defaultSimulation, monthFromSimulation, simPeriod, averageLines, budgetLines } from '@/lib/simulation';
import { chartTheme, chartTooltipStyle } from '@/lib/chartTheme';
import { f$, f0, lastMonthWithBalance, monthBankBalance, startedMonths } from '@/lib/utils';

const LABEL = 'block text-[10px] text-t-3 uppercase tracking-[0.12em] font-semibold mb-1.5';
const num = (v: string) => parseFloat(v.replace(',', '.')) || 0;

/**
 * Simulateur de trésorerie : des scénarios sur N mois, stockés à part du tracker (donc
 * sans effet sur les stats). Page unique, responsive — même UI sur desktop et mobile.
 * Les calculs sont dans lib/simulation ; ici : édition (enregistrée automatiquement) et rendu.
 */
export default function SimulationPage() {
  const { state, setState, save, getState, liveRate, activeSpace, activeSpaceId, setCurMonth, theme, logChange } = useApp();
  const { confirm, alert } = useDialog();
  const isMobile = useIsMobile();
  const router = useRouter();
  const ct = chartTheme(theme);
  const cur = activeSpace?.localCurrency || 'AED';

  const sims = useMemo(
    () => (state.simulations || []).filter(s => !s.spaceId || s.spaceId === activeSpaceId),
    [state.simulations, activeSpaceId],
  );
  const [selId, setSelId] = useState<string | null>(null);
  const selected = sims.find(s => s.id === selId) || sims[0];

  // Brouillon édité localement, enregistré automatiquement (600 ms après la dernière frappe)
  const [draft, setDraft] = useState<Simulation | null>(null);
  const dirty = useRef(false);
  const latest = useRef<Simulation | null>(null);
  latest.current = draft;

  const persist = (sim: Simulation) => {
    const s = getState();
    if (!(s.simulations || []).some(x => x.id === sim.id)) return; // supprimée entre-temps
    setState({ ...s, simulations: (s.simulations || []).map(x => (x.id === sim.id ? sim : x)) });
    save();
  };
  const flush = () => {
    if (dirty.current && latest.current) { dirty.current = false; persist(latest.current); }
  };

  const selectedId = selected?.id;
  useEffect(() => {
    setDraft(selected ? { ...selected } : null);
    dirty.current = false;
  // On ne recharge le brouillon que si on CHANGE de simulation (pas à chaque enregistrement)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    if (!draft || !dirty.current) return;
    const t = setTimeout(flush, 600);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  // En quittant la page : enregistre ce qui ne l'est pas encore
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => flush(), []);

  const update = (patch: Partial<Simulation>) => {
    dirty.current = true;
    setDraft(d => (d ? { ...d, ...patch } : d));
  };

  const select = (id: string) => { flush(); setSelId(id); };

  const create = () => {
    flush();
    const s = getState();
    const sim = defaultSimulation({ months: s.months, postes: s.postes, revenusMonths: s.revenus?.months, liveRate: s.rate || liveRate, spaceId: activeSpaceId });
    setState({ ...s, simulations: [...(s.simulations || []), sim] });
    save();
    setSelId(sim.id);
    logChange?.('simulation.create', `Nouvelle simulation « ${sim.name} »`);
  };

  const duplicate = () => {
    if (!draft) return;
    flush();
    const s = getState();
    const copy: Simulation = { ...draft, id: `sim-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: `${draft.name} (copie)`, createdAt: new Date().toISOString() };
    setState({ ...s, simulations: [...(s.simulations || []), copy] });
    save();
    setSelId(copy.id);
  };

  const remove = async () => {
    if (!draft) return;
    if (!(await confirm(`Supprimer la simulation « ${draft.name} » ?`, { danger: true }))) return;
    dirty.current = false;
    const s = getState();
    setState({ ...s, simulations: (s.simulations || []).filter(x => x.id !== draft.id) });
    save();
    setSelId(null);
  };

  const useCurrentBalance = () => {
    const lm = lastMonthWithBalance(state.months);
    if (lm) update({ startBalance: Math.round(monthBankBalance(lm, state.postes, state.revenus?.months, state.rate || liveRate)) });
  };

  // Dépense réelle mensuelle moyenne (3 derniers mois terminés) — repère affiché sous le budget
  const realLines = useMemo(() => averageLines(state.months, state.postes, 3), [state.months, state.postes]);
  const realAvg = realLines.reduce((s, l) => s + l.amount, 0);

  const fillLines = async (mode: 'budget' | 'real') => {
    if (!draft) return;
    const started = startedMonths(state.months);
    const lines = mode === 'real' ? realLines : budgetLines(started[started.length - 1], state.postes, draft.rate || liveRate);
    if (lines.length === 0) { await alert(mode === 'real' ? 'Aucun mois terminé pour calculer une moyenne.' : 'Aucun budget saisi dans le mois en cours.'); return; }
    if (draft.lines.length > 0 && !(await confirm(
      `Remplacer les ${draft.lines.length} ligne(s) actuelles par ${mode === 'real' ? 'la moyenne de tes dépenses réelles des 3 derniers mois' : 'le budget du mois en cours'} ?`,
      { confirmLabel: 'Remplacer' },
    ))) return;
    update({ lines });
  };

  const createRealMonth = async () => {
    if (!draft) return;
    flush();
    const s = getState();
    const res = monthFromSimulation(draft, s.months, s.postes);
    if ('error' in res) { await alert(res.error, { title: 'Création impossible' }); return; }
    const first = simPeriod(draft, 0).label;
    const ok = await confirm(
      `Créer « ${res.month.id} » dans le tracker à partir de cette simulation ?\n\n• Solde de départ : ${f0(res.month.soldeStart)} ${cur}\n• Budget : ${draft.lines.length} ligne(s) reprise(s)${res.reactivated.length ? `\n• Postes désactivés qui seront réactivés pour ce mois (ils ont une ligne) : ${res.reactivated.join(', ')}` : ''}\n\nLe mois est ajouté à la suite des autres ; tu pourras l'ajuster ensuite comme n'importe quel mois.`,
      { title: `Créer ${first}`, confirmLabel: 'Créer le mois' },
    );
    if (!ok) return;
    const now = getState();
    setState({ ...now, months: [...now.months, res.month] });
    setCurMonth(res.month.id);
    save();
    logChange?.('month.create', `Création du mois ${res.month.id} (depuis la simulation « ${draft.name} »)`);
    router.push('/tracker');
  };

  const header = (
    <PageHeader breadcrumb={[{ label: activeSpace.name }, { label: 'Simulateur', current: true }]} title="Simulateur" subtitle="Teste un budget sans toucher à tes vrais mois">
      <button onClick={create} className="btn btn-primary">+ Nouvelle simulation</button>
    </PageHeader>
  );

  if (!draft && isMobile === true) {
    return (
      <MEmpty
        icon={<FlaskConical size={26} />}
        title="Teste un budget avant de le vivre"
        text="Projette ton solde sur plusieurs mois, sans créer de mois à l’avance. Une simulation ne compte dans aucune statistique."
        action={<MButton onClick={create}><Plus size={17} />Nouvelle simulation</MButton>}
      />
    );
  }
  if (!draft) {
    return (
      <div>
        {header}
        <div className="bg-bg-3 border border-border rounded-lg p-8 text-center max-w-[560px] mx-auto">
          <FlaskConical size={34} className="mx-auto text-t-4 mb-3" />
          <div className="text-t-2 font-semibold mb-1.5">Aucune simulation</div>
          <p className="text-[12px] text-t-3 leading-relaxed mb-5">
            Projette ton solde sur plusieurs mois à partir de ton budget, de tes revenus moyens et de dépenses ponctuelles —
            sans créer de mois à l&apos;avance dans le tracker. Une simulation ne compte dans aucune statistique.
          </p>
          <button onClick={create} className="btn btn-primary">Créer ma première simulation</button>
        </div>
      </div>
    );
  }

  const res = projectSimulation(draft);
  const horizon = res.rows.length;
  const spentTotal = draft.lines.reduce((s, l) => s + (l.amount || 0), 0);
  const firstLabel = simPeriod(draft, 0).label;
  const chartData = res.rows.map(r => ({ name: `${r.label.slice(0, 3)} ${r.label.slice(-2)}`, Solde: r.end }));
  const tone = (v: number) => (v > 0 ? 'text-accent' : v < 0 ? 'text-danger' : 'text-t-1');

  // ─── UI mobile : mêmes calculs, même enregistrement automatique, rendu en cartes fines ───
  if (isMobile === true) {
    const capLabel = (l: string) => l.slice(0, 1) + l.slice(1).toLowerCase();
    const soft = (t: string) => <span className="text-[14px] font-normal text-t-2">{t}</span>;
    const below = realAvg > 0 && spentTotal < realAvg * 0.8;
    return (
      <div className="-mx-1">
        <div className="flex flex-col items-center pt-3 pb-5">
          <span className="text-[13px] text-t-3">Solde fin {res.rows[horizon - 1].label.toLowerCase()}</span>
          <span className="flex items-baseline gap-1.5 mt-1">
            <span className={`text-[36px] leading-none hero-num mono-value ${res.endBalance < 0 ? 'text-danger' : 'text-t-1'}`}>{f0(res.endBalance)}</span>
            <span className="text-[16px] text-t-3 font-medium">{cur}</span>
          </span>
          <span className={`text-[13px] mt-1.5 mono-value m-sub ${tone(res.delta)}`}>{res.delta >= 0 ? '+' : ''}{f0(res.delta)} en {horizon} mois</span>
        </div>

        {sims.length > 1 && (
          <div className="flex gap-2 overflow-x-auto m-noscroll px-1 pb-5">
            {sims.map(sm => <MPill key={sm.id} active={sm.id === draft.id} onClick={() => select(sm.id)}>{(sm.id === draft.id ? draft.name : sm.name) || 'Sans nom'}</MPill>)}
          </div>
        )}

        <div className="flex justify-around px-2 pb-6">
          <MAction icon={<Plus size={21} />} label="Nouvelle" onClick={create} />
          <MAction icon={<Copy size={18} />} label="Dupliquer" onClick={duplicate} />
          <MAction icon={<CalendarPlus size={19} />} label="Créer le mois" onClick={createRealMonth} />
          <MAction icon={<Trash2 size={18} />} label="Supprimer" onClick={remove} />
        </div>

        <MCard className="mb-4">
          <MRow className="!min-h-[50px]" title={soft('Net d’un mois type')} sub="Revenu − budget, hors ponctuels" right={<span className={`mono-value ${tone(res.monthlyNet)}`}>{res.monthlyNet >= 0 ? '+' : ''}{f0(res.monthlyNet)} {cur}</span>} />
          <MDivider />
          <MRow className="!min-h-[50px]" title={soft('Point bas')} sub={res.lowest ? `Fin ${res.lowest.label.toLowerCase()}` : undefined} right={<span className={`mono-value ${res.lowest && res.lowest.balance < 0 ? 'text-danger' : 'text-warning'}`}>{res.lowest ? `${f0(res.lowest.balance)} ${cur}` : '—'}</span>} />
        </MCard>

        <MLabel>Solde en fin de mois</MLabel>
        <MCard className="mb-4 pt-3 px-1">
          <div style={{ height: 170 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fill: ct.tick, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: ct.tick, fontSize: 10 }} tickFormatter={v => `${Math.round(Number(v) / 1000)}k`} width={34} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={chartTooltipStyle(theme)} formatter={v => [`${f0(Number(v))} ${cur}`, 'Solde']} cursor={{ fill: 'transparent' }} />
                <ReferenceLine y={0} stroke={ct.tick} />
                <Bar dataKey="Solde" radius={5} maxBarSize={40} isAnimationActive={false}>
                  {chartData.map((d, i) => <Cell key={i} fill={d.Solde < 0 ? '#ef4444' : '#3b82f6'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </MCard>

        <MLabel>Paramètres</MLabel>
        <MCard className="mb-2">
          <MField label="Nom"><input className="m-input text-right" value={draft.name} onChange={e => update({ name: e.target.value })} aria-label="Nom de la simulation" /></MField>
          <MDivider />
          <MField label="Premier mois"><input className="m-input text-right" type="month" value={draft.start} onChange={e => e.target.value && update({ start: e.target.value })} /></MField>
          <MDivider />
          <MField label="Durée (1 à 12 mois)"><MNum className="text-right" value={draft.months} onChange={n => update({ months: Math.min(12, Math.max(0, Math.round(n))) })} /></MField>
          <MDivider />
          <MField label={`Solde de départ (${cur})`}>
            <span className="flex items-center justify-end gap-2">
              <MNum className="text-right" value={draft.startBalance} onChange={n => update({ startBalance: n })} />
              <button type="button" onClick={useCurrentBalance} className="h-10 w-10 -mr-1 rounded-full bg-bg-4 text-t-2 flex items-center justify-center shrink-0 active:opacity-60" aria-label="Reprendre le solde prévisionnel actuel"><RotateCw size={15} /></button>
            </span>
          </MField>
          <MDivider />
          <MField label="Revenu mensuel (€)"><MNum className="text-right" value={draft.revenueEur} onChange={n => update({ revenueEur: n })} /></MField>
          <MDivider />
          <MField label={`Taux EUR / ${cur}`}><MNum className="text-right" value={draft.rate} onChange={n => update({ rate: n })} /></MField>
        </MCard>
        <p className="text-[12px] text-t-4 px-4 mb-4 leading-relaxed">Soit <span className="mono-value text-t-2">{f0((draft.revenueEur || 0) * (draft.rate || 0))} {cur}</span> de revenu par mois. Tout est enregistré automatiquement.</p>

        <MLabel right={<span className="text-[13px] text-t-1 mono-value">{f0(spentTotal)} {cur}</span>}>Budget mensuel</MLabel>
        <datalist id="sim-postes-m">{(state.postes || []).map(po => <option key={po.name} value={po.name} />)}</datalist>
        <MCard className="mb-2">
          {draft.lines.map((l, i) => (
            <div key={i}>
              {i > 0 && <MDivider />}
              <div className="flex items-center gap-2 pl-4 pr-1 min-h-[52px]">
                <input className="m-input uppercase flex-1" list="sim-postes-m" value={l.name} placeholder="POSTE" aria-label={`Poste de la ligne ${i + 1}`} onChange={e => update({ lines: draft.lines.map((x, j) => (j === i ? { ...x, name: e.target.value.toUpperCase() } : x)) })} />
                <MNum className="text-right !w-[92px] shrink-0" value={l.amount} ariaLabel={`Montant de ${l.name || `la ligne ${i + 1}`}`} onChange={n => update({ lines: draft.lines.map((x, j) => (j === i ? { ...x, amount: n } : x)) })} />
                <button type="button" onClick={() => update({ lines: draft.lines.filter((_, j) => j !== i) })} className="w-11 h-11 shrink-0 flex items-center justify-center text-t-3 active:text-danger" aria-label={`Retirer ${l.name || 'la ligne'}`}><X size={16} /></button>
              </div>
            </div>
          ))}
          {draft.lines.length > 0 && <MDivider />}
          <button type="button" onClick={() => update({ lines: [...draft.lines, { name: '', amount: 0 }] })} className="w-full flex items-center gap-2 px-4 min-h-[50px] text-[15px] font-medium text-t-2 active:bg-t-1/5"><Plus size={17} />Ajouter une ligne</button>
        </MCard>
        {realAvg > 0 && (
          <p className={`text-[12px] px-4 mb-2 leading-relaxed ${below ? 'text-warning' : 'text-t-4'}`}>
            Tu dépenses réellement <span className="mono-value">{f0(realAvg)} {cur}</span> par mois (moyenne des 3 derniers mois terminés){below ? ' : ce budget est nettement en dessous, la projection sera optimiste.' : '.'}
          </p>
        )}
        <div className="flex gap-2 overflow-x-auto m-noscroll px-1 pb-5">
          <MPill onClick={() => fillLines('real')}>Remplir avec ma moyenne réelle</MPill>
          <MPill onClick={() => fillLines('budget')}>Avec le budget du mois</MPill>
        </div>

        <MLabel>Dépenses ou rentrées ponctuelles</MLabel>
        <MCard className="mb-2">
          {draft.extras.map((x, i) => (
            <div key={i}>
              {i > 0 && <MDivider />}
              <div className="pl-4 pr-1 py-1.5">
                <div className="flex items-center gap-2 min-h-[44px]">
                  <input className="m-input flex-1" value={x.label} placeholder="Voyage, achat…" aria-label={`Libellé du ponctuel ${i + 1}`} onChange={e => update({ extras: draft.extras.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)) })} />
                  <button type="button" onClick={() => update({ extras: draft.extras.filter((_, j) => j !== i) })} className="w-11 h-11 shrink-0 flex items-center justify-center text-t-3 active:text-danger" aria-label="Retirer ce ponctuel"><X size={16} /></button>
                </div>
                <div className="flex items-center gap-2 min-h-[40px] pr-3">
                  <select className="m-input !w-auto text-t-2" value={Math.min(x.month, horizon - 1)} aria-label={`Mois du ponctuel ${i + 1}`} onChange={e => update({ extras: draft.extras.map((y, j) => (j === i ? { ...y, month: parseInt(e.target.value, 10) } : y)) })}>
                    {res.rows.map(r => <option key={r.n} value={r.n}>{capLabel(r.label)}</option>)}
                  </select>
                  <MNum className="text-right flex-1" value={x.amount} ariaLabel={`Montant du ponctuel ${i + 1}`} onChange={n => update({ extras: draft.extras.map((y, j) => (j === i ? { ...y, amount: n } : y)) })} />
                </div>
              </div>
            </div>
          ))}
          {draft.extras.length > 0 && <MDivider />}
          <button type="button" onClick={() => update({ extras: [...draft.extras, { label: '', amount: 0, month: 0 }] })} className="w-full flex items-center gap-2 px-4 min-h-[50px] text-[15px] font-medium text-t-2 active:bg-t-1/5"><Plus size={17} />Ajouter un ponctuel</button>
        </MCard>
        <p className="text-[12px] text-t-4 px-4 mb-4 leading-relaxed">Un montant négatif compte comme une rentrée d’argent.</p>

        <MLabel>Mois par mois</MLabel>
        <MCard className="mb-4">
          {res.rows.map((r, k) => (
            <div key={r.n}>
              {k > 0 && <MDivider />}
              <MRow
                title={capLabel(r.label)}
                sub={<span className="mono-value">+{f0(r.revenue)} revenu · −{f0(r.spent)} budget{r.extras !== 0 ? ` · ${r.extras > 0 ? '−' : '+'}${f0(Math.abs(r.extras))} ponctuel` : ''}</span>}
                right={<span className={`mono-value ${r.end < 0 ? 'text-danger' : ''}`}>{f0(r.end)}</span>}
                rightSub={<span className="mono-value">début {f0(r.start)}</span>}
              />
            </div>
          ))}
        </MCard>

        <p className="text-[13px] text-t-3 px-4 mb-3 leading-relaxed">
          Quand {firstLabel.toLowerCase()} arrive, crée-le dans le tracker avec ce solde de départ et ce budget (≈ <span className="mono-value">{f$(draft.rate > 0 ? spentTotal / draft.rate : 0)} €</span>). La simulation reste intacte.
        </p>
        <div className="px-1"><MButton onClick={createRealMonth}><CalendarPlus size={17} />Créer {capLabel(firstLabel)} dans le tracker</MButton></div>
      </div>
    );
  }

  return (
    <div>
      {header}

      {/* Simulations enregistrées */}
      {sims.length > 1 && (
        <div className="flex gap-1.5 flex-wrap mb-4">
          {sims.map(s => (
            <button key={s.id} onClick={() => select(s.id)} className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer border ${s.id === draft.id ? 'bg-bg-4 text-t-1 border-border-2' : 'text-t-3 border-transparent hover:text-t-2'}`}>
              {s.id === draft.id ? draft.name || 'Sans nom' : s.name || 'Sans nom'}
            </button>
          ))}
        </div>
      )}

      {/* Résultat */}
      <div className="grid grid-cols-4 gap-3 mb-4 max-lg:grid-cols-2">
        <div className="bg-bg-3 border border-border rounded-lg px-4 py-3.5">
          <div className="text-[9px] text-t-3 uppercase tracking-[0.14em] font-semibold">Solde dans {horizon} mois</div>
          <div className={`text-[20px] mt-1.5 mono-value leading-none ${res.endBalance < 0 ? 'text-danger' : 'text-t-1'}`}>{f0(res.endBalance)} {cur}</div>
          <div className="text-[10px] text-t-4 mt-1.5">fin {res.rows[horizon - 1].label.toLowerCase()}</div>
        </div>
        <div className="bg-bg-3 border border-border rounded-lg px-4 py-3.5">
          <div className="text-[9px] text-t-3 uppercase tracking-[0.14em] font-semibold">Variation</div>
          <div className={`text-[20px] mt-1.5 mono-value leading-none ${tone(res.delta)}`}>{res.delta >= 0 ? '+' : ''}{f0(res.delta)} {cur}</div>
          <div className="text-[10px] text-t-4 mt-1.5">depuis {f0(draft.startBalance)} {cur}</div>
        </div>
        <div className="bg-bg-3 border border-border rounded-lg px-4 py-3.5">
          <div className="text-[9px] text-t-3 uppercase tracking-[0.14em] font-semibold">Net d&apos;un mois type</div>
          <div className={`text-[20px] mt-1.5 mono-value leading-none ${tone(res.monthlyNet)}`}>{res.monthlyNet >= 0 ? '+' : ''}{f0(res.monthlyNet)} {cur}</div>
          <div className="text-[10px] text-t-4 mt-1.5">revenu − budget, hors ponctuels</div>
        </div>
        <div className="bg-bg-3 border border-border rounded-lg px-4 py-3.5">
          <div className="text-[9px] text-t-3 uppercase tracking-[0.14em] font-semibold">Point bas</div>
          <div className={`text-[20px] mt-1.5 mono-value leading-none ${res.lowest && res.lowest.balance < 0 ? 'text-danger' : 'text-warning'}`}>{res.lowest ? `${f0(res.lowest.balance)} ${cur}` : '—'}</div>
          <div className="text-[10px] text-t-4 mt-1.5">{res.lowest ? `fin ${res.lowest.label.toLowerCase()}` : ''}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
        {/* ── Colonne édition ── */}
        <div className="space-y-4 min-w-0">
          <div className="bg-bg-3 border border-border rounded-lg p-4 space-y-3.5">
            <div className="text-[13px] font-semibold text-t-2">Paramètres</div>
            <div>
              <label className={LABEL} htmlFor="sim-name">Nom</label>
              <input id="sim-name" className="fi" value={draft.name} onChange={e => update({ name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL} htmlFor="sim-start">Premier mois</label>
                <input id="sim-start" className="fi" type="month" value={draft.start} onChange={e => e.target.value && update({ start: e.target.value })} />
              </div>
              <div>
                <label className={LABEL} htmlFor="sim-months">Durée (mois)</label>
                <input id="sim-months" className="fi" type="number" min={1} max={12} value={draft.months || ''} onChange={e => update({ months: Math.min(12, Math.max(0, Math.round(num(e.target.value)))) })} />
              </div>
            </div>
            <div>
              <label className={LABEL} htmlFor="sim-balance">Solde de départ ({cur})</label>
              <div className="flex gap-2">
                <input id="sim-balance" className="fi flex-1 mono-value" type="number" step="1" value={draft.startBalance || ''} onChange={e => update({ startBalance: num(e.target.value) })} />
                <button type="button" onClick={useCurrentBalance} className="btn btn-ghost shrink-0" title="Reprendre le prévisionnel actuel du compte">↻ Actuel</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL} htmlFor="sim-rev">Revenu mensuel (€)</label>
                <input id="sim-rev" className="fi mono-value" type="number" step="1" value={draft.revenueEur || ''} onChange={e => update({ revenueEur: num(e.target.value) })} />
              </div>
              <div>
                <label className={LABEL} htmlFor="sim-rate">Taux EUR / {cur}</label>
                <input id="sim-rate" className="fi mono-value" type="number" step="0.0001" value={draft.rate || ''} onChange={e => update({ rate: num(e.target.value) })} />
              </div>
            </div>
            <div className="text-[11px] text-t-4">Soit <span className="mono-value text-t-2">{f0((draft.revenueEur || 0) * (draft.rate || 0))} {cur}</span> de revenu par mois.</div>
          </div>

          <div className="bg-bg-3 border border-border rounded-lg p-4">
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <span className="text-[13px] font-semibold text-t-2">Budget mensuel</span>
              <span className="text-[12px] mono-value text-t-1">{f0(spentTotal)} {cur}</span>
            </div>
            <datalist id="sim-postes">{(state.postes || []).map(p => <option key={p.name} value={p.name} />)}</datalist>
            <div className="space-y-2">
              {draft.lines.map((l, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    className="fi flex-1 min-w-0" list="sim-postes" value={l.name} placeholder="Poste" aria-label={`Poste de la ligne ${i + 1}`}
                    onChange={e => update({ lines: draft.lines.map((x, j) => (j === i ? { ...x, name: e.target.value.toUpperCase() } : x)) })}
                  />
                  <input
                    className="fi !w-[110px] shrink-0 mono-value text-right" type="number" step="1" value={l.amount || ''} placeholder="0" aria-label={`Montant de ${l.name || `la ligne ${i + 1}`}`}
                    onChange={e => update({ lines: draft.lines.map((x, j) => (j === i ? { ...x, amount: num(e.target.value) } : x)) })}
                  />
                  <button type="button" onClick={() => update({ lines: draft.lines.filter((_, j) => j !== i) })} className="w-8 h-8 shrink-0 flex items-center justify-center text-t-3 hover:text-danger rounded-md hover:bg-danger/10 transition-all cursor-pointer" aria-label={`Retirer ${l.name || 'la ligne'}`}>
                    <X size={14} />
                  </button>
                </div>
              ))}
              {draft.lines.length === 0 && <div className="text-[11px] text-t-4 py-1">Aucune ligne — ajoute tes postes de dépense mensuels.</div>}
            </div>
            <button type="button" onClick={() => update({ lines: [...draft.lines, { name: '', amount: 0 }] })} className="mt-3 text-[11px] text-accent font-semibold cursor-pointer hover:underline flex items-center gap-1">
              <Plus size={12} /> Ajouter une ligne
            </button>
            <div className="mt-4 pt-3 border-t border-border">
              {realAvg > 0 && (
                <div className={`text-[11px] leading-relaxed mb-2.5 ${spentTotal < realAvg * 0.8 ? 'text-warning' : 'text-t-3'}`}>
                  Tes dépenses réelles : <span className="mono-value">{f0(realAvg)} {cur}</span> / mois en moyenne sur les 3 derniers mois terminés
                  {spentTotal < realAvg * 0.8 ? ' — ce budget est nettement en dessous, la projection sera optimiste.' : '.'}
                </div>
              )}
              <div className="flex gap-2 flex-wrap items-center">
                <span className="text-[10px] text-t-4 uppercase tracking-[0.1em] font-semibold">Remplir avec</span>
                <button type="button" onClick={() => fillLines('real')} className="btn btn-ghost">Moyenne réelle (3 mois)</button>
                <button type="button" onClick={() => fillLines('budget')} className="btn btn-ghost">Budget du mois</button>
              </div>
            </div>
          </div>

          <div className="bg-bg-3 border border-border rounded-lg p-4">
            <div className="text-[13px] font-semibold text-t-2">Ponctuels</div>
            <div className="text-[11px] text-t-4 mt-0.5 mb-3">Une dépense qui n&apos;arrive qu&apos;une fois (voyage, achat…). Montant négatif = une rentrée d&apos;argent.</div>
            <div className="space-y-2">
              {draft.extras.map((x, i) => (
                <div key={i} className="flex gap-2 items-center flex-wrap">
                  <input
                    className="fi flex-1 min-w-[120px]" value={x.label} placeholder="Libellé" aria-label={`Libellé du ponctuel ${i + 1}`}
                    onChange={e => update({ extras: draft.extras.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)) })}
                  />
                  <select
                    className="fi !w-[130px] shrink-0" value={Math.min(x.month, horizon - 1)} aria-label={`Mois du ponctuel ${i + 1}`}
                    onChange={e => update({ extras: draft.extras.map((y, j) => (j === i ? { ...y, month: parseInt(e.target.value, 10) } : y)) })}
                  >
                    {res.rows.map(r => <option key={r.n} value={r.n}>{r.label.slice(0, 3)} {r.label.slice(-4)}</option>)}
                  </select>
                  <input
                    className="fi !w-[110px] shrink-0 mono-value text-right" type="number" step="1" value={x.amount || ''} placeholder="0" aria-label={`Montant du ponctuel ${i + 1}`}
                    onChange={e => update({ extras: draft.extras.map((y, j) => (j === i ? { ...y, amount: num(e.target.value) } : y)) })}
                  />
                  <button type="button" onClick={() => update({ extras: draft.extras.filter((_, j) => j !== i) })} className="w-8 h-8 shrink-0 flex items-center justify-center text-t-3 hover:text-danger rounded-md hover:bg-danger/10 transition-all cursor-pointer" aria-label="Retirer ce ponctuel">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => update({ extras: [...draft.extras, { label: '', amount: 0, month: 0 }] })} className="mt-3 text-[11px] text-accent font-semibold cursor-pointer hover:underline flex items-center gap-1">
              <Plus size={12} /> Ajouter un ponctuel
            </button>
          </div>
        </div>

        {/* ── Colonne résultat ── */}
        <div className="space-y-4 min-w-0">
          <div className="bg-bg-3 border border-border rounded-lg p-4">
            <div className="text-[13px] font-semibold text-t-2 mb-3">Solde en fin de mois</div>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={ct.grid} vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: ct.tick, fontSize: 10 }} />
                  <YAxis tick={{ fill: ct.tick, fontSize: 10 }} tickFormatter={v => `${Math.round(Number(v) / 1000)}k`} width={38} />
                  <Tooltip contentStyle={chartTooltipStyle(theme)} formatter={v => [`${f0(Number(v))} ${cur}`, 'Solde']} cursor={{ fill: ct.grid, opacity: 0.4 }} />
                  <ReferenceLine y={0} stroke={ct.tick} />
                  <Bar dataKey="Solde" radius={4} maxBarSize={46} isAnimationActive={false}>
                    {chartData.map((d, i) => <Cell key={i} fill={d.Solde < 0 ? '#ef4444' : '#3b82f6'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-bg-3 border border-border rounded-lg p-4">
            <div className="text-[13px] font-semibold text-t-2 mb-3">Mois par mois</div>
            <div className="space-y-2">
              {res.rows.map(r => (
                <div key={r.n} className="bg-bg-2 border border-border rounded-md px-3 py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[12px] font-semibold text-t-2">{r.label}</span>
                    <span className={`text-[13px] mono-value ${r.end < 0 ? 'text-danger' : 'text-t-1'}`}>{f0(r.end)} {cur}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-[11px] text-t-3">
                    <span>Début <span className="mono-value">{f0(r.start)}</span></span>
                    <span className="text-accent">+ <span className="mono-value">{f0(r.revenue)}</span> revenu</span>
                    <span>− <span className="mono-value">{f0(r.spent)}</span> budget</span>
                    {r.extras !== 0 && <span className={r.extras > 0 ? 'text-warning' : 'text-accent'}>{r.extras > 0 ? '−' : '+'} <span className="mono-value">{f0(Math.abs(r.extras))}</span> ponctuel</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-bg-3 border border-border rounded-lg p-4">
            <div className="text-[13px] font-semibold text-t-2">Passer au réel</div>
            <p className="text-[11px] text-t-3 mt-1 mb-3 leading-relaxed">
              Quand {firstLabel.toLowerCase()} arrive, crée-le dans le tracker avec ce solde de départ et ce budget
              (≈ <span className="mono-value">{f$(draft.rate > 0 ? spentTotal / draft.rate : 0)} €</span>). La simulation, elle, reste intacte.
            </p>
            <div className="flex gap-2 flex-wrap">
              <button onClick={createRealMonth} className="btn btn-primary">Créer {firstLabel.slice(0, 1) + firstLabel.slice(1).toLowerCase()} dans le tracker</button>
              <button onClick={duplicate} className="btn btn-ghost"><Copy size={12} /> Dupliquer</button>
              <button onClick={remove} className="btn btn-danger"><Trash2 size={12} /> Supprimer</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
