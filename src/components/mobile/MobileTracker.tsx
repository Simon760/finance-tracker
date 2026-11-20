'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, ArrowDownLeft, Scale, MoreHorizontal, ChevronDown, ChevronLeft, ChevronRight, CalendarPlus, Pencil, ListPlus,
  Target, PieChart as PieIcon, CalendarRange, Wallet, Receipt,
} from 'lucide-react';
import { useApp } from '@/context/AppProvider';
import { Month, Transaction } from '@/lib/types';
import { f$, f0, toEur, toAed, rowEur, rowAedSpent, budgetEurOf, budgetAedOf, startedMonths, todayISO } from '@/lib/utils';
import { TxnTarget } from '@/lib/trackerOps';
import { useTrackerFigures } from '@/lib/useTrackerFigures';
import { useRecurring } from '@/lib/useRecurring';
import { monthLabel, shortDay, dayLabel } from '@/lib/labels';
import { CAT_LABELS } from '@/lib/constants';
import RecurringBanner from '@/components/RecurringBanner';
import BottomSheet from './BottomSheet';
import { MAction, MBadge, MBar, MButton, MCard, MDivider, MEmpty, MIcon, MLabel, MRow, MSeg } from './ui';
import PosteIcon from './tracker/PosteIcon';
import TxnSheet from './tracker/TxnSheet';
import PosteSheet, { PosteSel, groupByDay } from './tracker/PosteSheet';
import { MonthPickerSheet, NewMonthSheet, RenameMonthSheet } from './tracker/MonthSheets';
import { SoldeSheet, RegulSheet, AddPosteSheet, BilanSheet, ChartsSheet, PeriodSheet } from './tracker/MoreSheets';

type Unit = 'local' | 'eur';
type Sheet = 'picker' | 'newMonth' | 'rename' | 'solde' | 'regul' | 'more' | 'addPoste' | 'bilan' | 'charts' | 'period' | 'allTx' | null;
const UNIT_KEY = 'fhq_m_unit';
/** Posé avant d'aller sur Revenus : la page ouvre directement « Nouveau revenu ». */
export const REV_ADD_FLAG = 'fhq_rev_add';

interface Op { t: Transaction; target: TxnTarget; poste: string; cat: string }

/**
 * Accueil de l'UI mobile = le tracker du mois. Un gros chiffre (le solde prévisionnel),
 * les actions rondes dessous, puis des listes fines : résumé du mois, postes, postes
 * ponctuels, dernières opérations. Toutes les écritures passent par lib/trackerOps.
 */
export default function MobileTracker() {
  const { state, curMonth, setCurMonth, liveRate, activeSpace } = useApp();
  const router = useRouter();
  const cur = activeSpace?.localCurrency || 'AED';
  const months = state.months;
  const idx = months.findIndex(mo => mo.id === curMonth);
  const m: Month | undefined = idx >= 0 ? months[idx] : undefined;
  const F = useTrackerFigures(m);
  const recur = useRecurring(m);

  const [unit, setUnit] = useState<Unit>('local');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [posteSel, setPosteSel] = useState<PosteSel | null>(null);
  const [txn, setTxn] = useState<{ open: boolean; target: TxnTarget | null }>({ open: false, target: null });
  const swipe = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => { try { if (localStorage.getItem(UNIT_KEY) === 'eur') setUnit('eur'); } catch { /* préférence facultative */ } }, []);
  const changeUnit = (u: Unit) => { setUnit(u); try { localStorage.setItem(UNIT_KEY, u); } catch { /* idem */ } };
  // Changer de mois referme le détail d'un poste
  useEffect(() => { setPosteSel(null); }, [curMonth]);

  const close = () => setSheet(null);
  const openTxn = (target: TxnTarget) => setTxn({ open: true, target });
  const goPrev = () => { if (idx > 0) setCurMonth(months[idx - 1].id); };
  const goNext = () => { if (idx >= 0 && idx < months.length - 1) setCurMonth(months[idx + 1].id); };

  if (!m) {
    return (
      <>
        <MEmpty
          icon={<Receipt size={26} />}
          title="Commence ton premier mois"
          text="Un mois regroupe ton budget, tes dépenses et ton solde de départ."
          action={<MButton onClick={() => setSheet('newMonth')}><Plus size={17} />Créer un mois</MButton>}
        />
        <NewMonthSheet open={sheet === 'newMonth'} onClose={close} />
      </>
    );
  }

  const local = unit === 'local';
  const money = (aed: number, eur: number) => (local ? f0(aed) : `${f$(eur)} €`);
  const started = startedMonths(months).some(mo => mo.id === m.id);
  const hidden = m.hiddenPostes || [];
  const today = todayISO();

  // Postes réguliers visibles ce mois
  const rows = state.postes.map((p, i) => {
    if (hidden.includes(p.name)) return null;
    const a = m.actual[i] || { aed: 0, eur: null };
    const b = m.budget[i] || { aed: 0, eur: null };
    const eur = rowEur(a, m.rate);
    const aed = rowAedSpent(a, m.rate, { isAed: p.isAed });
    const beur = budgetEurOf(b, p.isAed, liveRate);
    const baed = budgetAedOf(b, p.isAed, liveRate);
    return { i, p, eur, aed, beur, baed, n: (a.txns || []).length };
  }).filter((r): r is NonNullable<typeof r> => r !== null);
  // Consommation calculée dans la devise AFFICHÉE : en devise locale les opérations sont
  // au taux du jour de saisie et le budget au taux du jour — un ratio en EUR pouvait
  // afficher « 99 % » à côté de « dépassé de 1 ».
  const pctOf = (r: { beur: number; baed: number; eur: number; aed: number }) => (r.beur <= 0 ? 0 : local ? (r.baed > 0 ? r.aed / r.baed : 0) : r.eur / r.beur);

  // Postes ponctuels : ceux qui ont une ligne « réel », plus ceux qui n'ont qu'un budget
  const extras = [
    ...(m.extraActual || []).map(r => {
      const b = (m.extraBudget || []).find(x => x.name === r.name);
      const eur = r.eur > 0 ? r.eur : toEur(r.aed, m.rate);
      const aed = r.aed > 0 ? r.aed : (r.eur > 0 ? toAed(r.eur, m.rate) : 0);
      const beur = b ? (b.eur > 0 ? b.eur : toEur(b.aed, liveRate)) : 0;
      const baed = b ? (b.eur > 0 ? toAed(b.eur, liveRate) : b.aed) : 0;
      const txns = r.txns || [];
      return { name: r.name, cat: r.cat, eur, aed, beur, baed, n: txns.length, swap: txns.length > 0 && txns.every(t => t.tripKind === 'swap') };
    }),
    ...(m.extraBudget || []).filter(b => !(m.extraActual || []).some(r => r.name === b.name)).map(b => {
      const beur = b.eur > 0 ? b.eur : toEur(b.aed, liveRate);
      const baed = b.eur > 0 ? toAed(b.eur, liveRate) : b.aed;
      return { name: b.name, cat: b.cat, eur: 0, aed: 0, beur, baed, n: 0, swap: false };
    }),
  ];

  // Toutes les opérations du mois (postes masqués compris : elles existent)
  const ops: Op[] = [
    ...state.postes.flatMap((p, i) => (m.actual[i]?.txns || []).map((t, ti) => ({ t, target: { posteIdx: i, editIdx: ti }, poste: p.name, cat: p.cat as string }))),
    ...(m.extraActual || []).flatMap((r, ei) => (r.txns || []).map((t, ti) => ({ t, target: { posteIdx: -1, isExtra: true, extraIdx: ei, editIdx: ti }, poste: r.name, cat: r.cat }))),
  ];
  const opGroups = groupByDay(ops);
  const recent = opGroups.flatMap(g => g.items).slice(0, 5);

  const subOf = (r: { beur: number; baed: number; eur: number; aed: number; n: number }) => {
    if (r.beur <= 0) return r.n > 0 ? `${r.n} opération${r.n > 1 ? 's' : ''}` : 'Sans budget';
    const left = local ? r.baed - r.aed : r.beur - r.eur;
    const pct = `${Math.round(pctOf(r) * 100)} %`;
    // Écart inférieur à l'unité affichée = budget atteint, pas « dépassé de 0 »
    if (Math.abs(left) < (local ? 0.5 : 0.005)) return `${pct} · budget atteint`;
    return left > 0
      ? `${pct} · reste ${local ? f0(left) : f$(left)}`
      : <span className="text-danger">{pct} · dépassé de {local ? f0(-left) : f$(-left)}</span>;
  };
  const over = (r: { beur: number; baed: number; eur: number; aed: number }) => r.beur > 0 && (local ? r.aed - r.baed >= 0.5 : r.eur - r.beur >= 0.005);
  const opRow = (o: Op, k: number) => (
    <div key={`${o.poste}-${o.target.editIdx}-${k}`}>
      {k > 0 && <MDivider />}
      <MRow
        icon={<PosteIcon name={o.poste} cat={o.cat} />}
        title={o.t.label && o.t.label !== '---' ? o.t.label : o.poste}
        badge={o.t.tripId ? <MBadge tone="info">Voyage</MBadge> : undefined}
        sub={`${o.poste} · ${shortDay(o.t.date, today)}`}
        right={<span className="mono-value">−{f0(o.t.amount)}</span>}
        rightSub={<span className="mono-value">{f$(o.t.eur || o.t.amount / (o.t.rate || m.rate))} €</span>}
        onClick={() => openTxn(o.target)}
      />
    </div>
  );

  const more: { icon: React.ReactNode; title: string; sub: string; go: Sheet }[] = [
    { icon: <ListPlus size={17} />, title: 'Ajouter un poste', sub: 'Pour ce mois ou pour tous les mois', go: 'addPoste' },
    { icon: <Target size={17} />, title: 'Bilan du mois', sub: 'Où tu en es par rapport au budget', go: 'bilan' },
    { icon: <PieIcon size={17} />, title: 'Graphiques', sub: 'Répartition et budget face au réel', go: 'charts' },
    { icon: <CalendarRange size={17} />, title: 'Totaux sur une période', sub: 'Trimestre, semestre, année', go: 'period' },
    { icon: <Wallet size={17} />, title: 'Détail du solde', sub: 'Solde de départ, de fin, ajustement', go: 'solde' },
    { icon: <CalendarPlus size={17} />, title: 'Nouveau mois', sub: 'Créer le mois suivant', go: 'newMonth' },
    { icon: <Pencil size={17} />, title: 'Renommer ce mois', sub: m.id, go: 'rename' },
  ];

  return (
    <div className="-mx-1">
      {/* Solde du mois — glisser à gauche / à droite change de mois */}
      <div
        className="flex flex-col items-center pt-3 pb-5"
        onTouchStart={e => { swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
        onTouchEnd={e => {
          const s = swipe.current; swipe.current = null;
          if (!s) return;
          const dx = e.changedTouches[0].clientX - s.x;
          const dy = e.changedTouches[0].clientY - s.y;
          if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.8) (dx > 0 ? goPrev : goNext)();
        }}
      >
        <button type="button" onClick={() => setSheet('solde')} className="flex flex-col items-center active:opacity-70 transition-opacity">
          <span className="text-[13px] text-t-3">Solde prévisionnel</span>
          <span className="flex items-baseline gap-1.5 mt-1">
            <span className={`text-[36px] leading-none hero-num mono-value ${F.prevCompte < 0 ? 'text-danger' : 'text-t-1'}`}>{f0(F.prevCompte)}</span>
            <span className="text-[16px] text-t-3 font-medium">{cur}</span>
          </span>
          <span className="text-[13px] text-t-3 mt-1.5 mono-value m-sub">≈ {f$(liveRate > 0 ? F.prevCompte / liveRate : 0)} €</span>
          {F.synced && F.previewEur > 0 && (
            <span className="text-[13px] text-info mt-0.5 mono-value m-sub">{f0(F.prevOpti)} {cur} avec les revenus prévus</span>
          )}
        </button>
        <div className="flex items-center gap-1 mt-3.5">
          <button type="button" onClick={goPrev} disabled={idx <= 0} className="w-10 h-10 flex items-center justify-center rounded-full text-t-3 disabled:opacity-25 active:bg-bg-3" aria-label="Mois précédent"><ChevronLeft size={19} /></button>
          <button type="button" onClick={() => setSheet('picker')} className="h-9 px-4 rounded-full bg-bg-3 flex items-center gap-1.5 text-[14px] font-medium text-t-1 active:opacity-70">
            {monthLabel(m)}
            {!started && <MBadge tone="info">À venir</MBadge>}
            <ChevronDown size={15} className="text-t-3" />
          </button>
          <button type="button" onClick={goNext} disabled={idx >= months.length - 1} className="w-10 h-10 flex items-center justify-center rounded-full text-t-3 disabled:opacity-25 active:bg-bg-3" aria-label="Mois suivant"><ChevronRight size={19} /></button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-around px-2 pb-6">
        <MAction icon={<Plus size={21} />} label="Dépense" onClick={() => openTxn({ posteIdx: [...rows].sort((a, b) => b.n - a.n || a.i - b.i)[0]?.i ?? 0 })} />
        <MAction icon={<ArrowDownLeft size={21} />} label="Revenu" onClick={() => { try { sessionStorage.setItem(REV_ADD_FLAG, '1'); } catch { /* sans stockage : on arrive sur la page */ } router.push('/revenus'); }} />
        <MAction icon={<Scale size={20} />} label="Régul" onClick={() => setSheet('regul')} />
        <MAction icon={<MoreHorizontal size={21} />} label="Plus" onClick={() => setSheet('more')} />
      </div>

      {/* Dépenses récurrentes échues (n'apparaît que s'il y en a) */}
      <RecurringBanner
        title={`${recur.due.length} dépense${recur.due.length > 1 ? 's' : ''} récurrente${recur.due.length > 1 ? 's' : ''} échue${recur.due.length > 1 ? 's' : ''} à ajouter`}
        items={recur.due.map(o => ({ key: o.key, label: o.rule.label, detail: `${o.date.slice(8, 10)}/${o.date.slice(5, 7)} · ${f0(o.rule.amount)} ${o.rule.currency}` }))}
        addLabel="Ajouter"
        onAdd={recur.addDue}
        onSkip={recur.skipDue}
      />

      {/* Résumé du mois */}
      <MCard className="mb-4">
        <button type="button" onClick={() => setSheet('bilan')} className="w-full text-left px-4 pt-3.5 pb-3 active:bg-t-1/5 transition-colors">
          <div className="grid grid-cols-2 gap-4">
            <div className="min-w-0">
              <div className="text-[13px] text-t-3">Revenus</div>
              <div className="text-[17px] text-t-1 mono-value mt-0.5 truncate">+{f$(F.earnEur)} €</div>
              <div className="text-[13px] text-t-3 mono-value m-sub truncate">{F.previewEur > 0 ? `+ ${f$(F.previewEur)} € prévus` : F.synced ? 'confirmés' : 'saisis à la main'}</div>
            </div>
            <div className="min-w-0 text-right">
              <div className="text-[13px] text-t-3">Dépenses</div>
              <div className="text-[17px] text-t-1 mono-value mt-0.5 truncate">{local ? `${f0(F.aA)} ${cur}` : `${f$(F.aE)} €`}</div>
              <div className="text-[13px] text-t-3 mono-value m-sub truncate">sur {local ? f0(F.bA) : `${f$(F.bE)} €`} de budget</div>
            </div>
          </div>
          <div className="mt-3"><MBar pct={F.bE > 0 ? F.aE / F.bE : 0} tone={F.bE > 0 && F.aE / F.bE > 1 ? 'danger' : F.bE > 0 && F.aE / F.bE > 0.9 ? 'warning' : 'accent'} /></div>
        </button>
        <MDivider />
        <MRow
          className="!min-h-[50px]"
          title={<span className="text-[14px] font-normal text-t-2">Revenus − dépenses</span>}
          right={<span className={`mono-value ${F.diff >= 0 ? 'text-accent' : 'text-danger'}`}>{F.diff >= 0 ? '+' : ''}{f$(F.diff)} €</span>}
          chevron
          onClick={() => setSheet('bilan')}
        />
      </MCard>

      {/* Postes */}
      <MLabel right={<MSeg surface="page" value={unit} options={[['local', cur], ['eur', 'EUR']] as const} onChange={changeUnit} />}>
        Postes{hidden.length > 0 ? ` · ${rows.length} sur ${state.postes.length}` : ''}
      </MLabel>
      <MCard className="mb-4">
        {rows.length === 0 && <div className="px-4 py-6 text-center text-[13px] text-t-3">Aucun poste visible ce mois-ci</div>}
        {rows.map((r, k) => (
          <div key={r.i}>
            {k > 0 && <MDivider />}
            <MRow
              icon={<PosteIcon name={r.p.name} cat={r.p.cat} />}
              title={r.p.name}
              sub={subOf(r)}
              right={<span className={`mono-value ${over(r) ? 'text-danger' : ''}`}>{money(r.aed, r.eur)}</span>}
              rightSub={r.beur > 0 ? <span className="mono-value">sur {money(r.baed, r.beur)}</span> : undefined}
              onClick={() => setPosteSel({ kind: 'poste', idx: r.i })}
            />
          </div>
        ))}
        <MDivider />
        <button type="button" onClick={() => setSheet('addPoste')} className="w-full flex items-center gap-3 px-4 min-h-[52px] text-[15px] font-medium text-t-2 active:bg-t-1/5">
          <MIcon><Plus size={17} /></MIcon>Ajouter un poste
        </button>
      </MCard>

      {/* Postes ponctuels du mois */}
      {extras.length > 0 && (
        <>
          <MLabel>Ponctuels de {monthLabel(m).split(' ')[0].toLowerCase()}</MLabel>
          <MCard className="mb-4">
            {extras.map((r, k) => (
              <div key={`${r.name}-${k}`}>
                {k > 0 && <MDivider />}
                <MRow
                  icon={<PosteIcon name={r.name} cat={r.cat} />}
                  title={r.name}
                  badge={r.swap ? <MBadge>Transfert</MBadge> : undefined}
                  sub={r.swap ? 'Hors total des dépenses' : r.beur > 0 ? subOf(r) : `${CAT_LABELS[r.cat] || 'Ponctuel'}${r.n > 0 ? ` · ${r.n} opération${r.n > 1 ? 's' : ''}` : ''}`}
                  right={<span className="mono-value">{money(r.aed, r.eur)}</span>}
                  rightSub={r.beur > 0 ? <span className="mono-value">sur {money(r.baed, r.beur)}</span> : undefined}
                  onClick={() => setPosteSel({ kind: 'extra', name: r.name })}
                />
              </div>
            ))}
          </MCard>
        </>
      )}

      {/* Dernières opérations */}
      {recent.length > 0 && (
        <>
          <MLabel right={ops.length > recent.length ? <button type="button" onClick={() => setSheet('allTx')} className="text-[13px] text-t-1 font-medium h-8 px-1">Tout voir</button> : undefined}>
            Dernières opérations
          </MLabel>
          <MCard className="mb-2">{recent.map(opRow)}</MCard>
        </>
      )}

      {/* ─── Volets ─── */}
      <PosteSheet open={posteSel !== null} onClose={() => setPosteSel(null)} month={m} sel={posteSel} unit={unit} onAdd={openTxn} onEdit={openTxn} />
      <MonthPickerSheet open={sheet === 'picker'} onClose={close} onNew={() => setSheet('newMonth')} />
      <NewMonthSheet open={sheet === 'newMonth'} onClose={close} />
      <RenameMonthSheet open={sheet === 'rename'} onClose={close} />
      <SoldeSheet open={sheet === 'solde'} onClose={close} month={m} onRegul={() => setSheet('regul')} />
      <RegulSheet open={sheet === 'regul'} onClose={close} month={m} />
      <AddPosteSheet open={sheet === 'addPoste'} onClose={close} month={m} />
      <BilanSheet open={sheet === 'bilan'} onClose={close} month={m} />
      <ChartsSheet open={sheet === 'charts'} onClose={close} month={m} />
      <PeriodSheet open={sheet === 'period'} onClose={close} />

      <BottomSheet open={sheet === 'more'} onClose={close} title={monthLabel(m)}>
        <MCard surface="sheet">
          {more.map((it, k) => (
            <div key={it.title}>
              {k > 0 && <MDivider />}
              <MRow icon={<MIcon className="!bg-bg-4">{it.icon}</MIcon>} title={it.title} sub={it.sub} chevron onClick={() => setSheet(it.go)} />
            </div>
          ))}
        </MCard>
      </BottomSheet>

      <BottomSheet open={sheet === 'allTx'} onClose={close} title="Opérations" subtitle={`${monthLabel(m)} · ${ops.length} opération${ops.length > 1 ? 's' : ''}`} fullHeight>
        {opGroups.map(g => (
          <div key={g.day || 'x'} className="mb-3">
            <MLabel right={<span className="text-[13px] text-t-3 mono-value">−{f0(g.total)}</span>}>{dayLabel(g.day, today)}</MLabel>
            <MCard surface="sheet">{g.items.map(opRow)}</MCard>
          </div>
        ))}
      </BottomSheet>
      {/* En dernier : la saisie s'ouvre PAR-DESSUS le détail d'un poste ou la liste des opérations */}
      <TxnSheet open={txn.open} onClose={() => setTxn(t => ({ ...t, open: false }))} month={m} target={txn.target} />
    </div>
  );
}
