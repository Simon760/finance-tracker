'use client';

import { useState } from 'react';
import { useApp } from '@/context/AppProvider';
import PageHeader from '@/components/layout/PageHeader';
import Modal from '@/components/ui/Modal';
import { Poste } from '@/lib/types';
import DataAudit from '@/components/DataAudit';
import RecurringSettings from '@/components/RecurringSettings';
import { isPosteFixed } from '@/lib/budgetBalance';
import { todayISO } from '@/lib/utils';
import { removePosteAt, swapPostes } from '@/lib/postes';
import { normalizeLoadedState, looksLikeBackup } from '@/lib/normalize';
import { useDialog } from '@/components/ui/Dialog';
import { ListChecks, Layers, Repeat, ShieldCheck, History, Download, Upload, ChevronUp, ChevronDown, EyeOff, Eye, Trash2, Plus } from 'lucide-react';
import { useIsMobile } from '@/lib/useIsMobile';
import { CAT_LABELS } from '@/lib/constants';
import BottomSheet from '@/components/mobile/BottomSheet';
import PosteIcon from '@/components/mobile/tracker/PosteIcon';
import { MBadge, MButton, MCard, MDivider, MField, MIcon, MLabel, MRow, MSeg, MToggle } from '@/components/mobile/ui';

const CAT_OPTIONS = ['vital', 'lifestyle', 'finance', 'logement'] as const;
const CAT_STYLES: Record<string, string> = {
  vital: 'text-accent bg-accent/10 border-accent/25',
  lifestyle: 'text-pink bg-pink/10 border-pink/25',
  finance: 'text-warning bg-warning/10 border-warning/25',
  logement: 'text-info bg-info/10 border-info/25',
};

const ACTION_STYLES: Record<string, { lbl: string; cls: string }> = {
  'revenu.add':     { lbl: 'Ajout',     cls: 'text-accent bg-accent/10 border-accent/25' },
  'revenu.update':  { lbl: 'Modif',     cls: 'text-info bg-info/10 border-info/25' },
  'revenu.delete':  { lbl: 'Suppr',     cls: 'text-danger bg-danger/10 border-danger/25' },
  'revenu.confirm': { lbl: 'Confirm',   cls: 'text-accent bg-accent/10 border-accent/25' },
  'month.create':   { lbl: 'Mois +',    cls: 'text-accent bg-accent/10 border-accent/25' },
  'month.delete':   { lbl: 'Mois ✕',    cls: 'text-danger bg-danger/10 border-danger/25' },
  'space.create':   { lbl: 'Space +',   cls: 'text-purple bg-purple/10 border-purple/25' },
  'space.update':   { lbl: 'Space ~',   cls: 'text-info bg-info/10 border-info/25' },
  'space.delete':   { lbl: 'Space ✕',   cls: 'text-danger bg-danger/10 border-danger/25' },
  'poste.create':   { lbl: 'Poste +',   cls: 'text-accent bg-accent/10 border-accent/25' },
  'poste.update':   { lbl: 'Poste ~',   cls: 'text-info bg-info/10 border-info/25' },
  'poste.delete':   { lbl: 'Poste ✕',   cls: 'text-danger bg-danger/10 border-danger/25' },
};

function fmtRelTs(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `il y a ${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `il y a ${d}j`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

export default function SettingsPage() {
  const { state, setState, save, getState, liveRate, history, clearHistory, logChange, activeSpace } = useApp();
  const { confirm, alert } = useDialog();
  const isMobile = useIsMobile();
  const [section, setSection] = useState<'postes' | 'extras' | 'recur' | 'audit' | 'history' | null>(null);
  const postes = state.postes || [];

  const [addOpen, setAddOpen] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [form, setForm] = useState<Poste>({ name: '', cat: 'vital', isAed: true });
  const [importText, setImportText] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(15);
  const [disableIdx, setDisableIdx] = useState<number | null>(null);
  const [disableMonthId, setDisableMonthId] = useState('');
  const [extraGroupDrafts, setExtraGroupDrafts] = useState<Record<string, string>>({});

  const openAdd = () => {
    setForm({ name: '', cat: 'vital', isAed: true });
    setEditIdx(null);
    setAddOpen(true);
  };

  const openEdit = (idx: number) => {
    setForm({ ...postes[idx] });
    setEditIdx(idx);
    setAddOpen(true);
  };

  const savePoste = () => {
    if (!form.name.trim()) return;
    const groupTrimmed = (form.group || '').trim().toUpperCase();
    const p: Poste = { ...form, name: form.name.trim().toUpperCase(), group: groupTrimmed || undefined };
    let updated: Poste[];
    if (editIdx !== null) {
      updated = postes.map((item, i) => i === editIdx ? p : item);
    } else {
      updated = [...postes, p];
    }
    setState({ ...state, postes: updated });
    setAddOpen(false);
    save();
    logChange?.(editIdx !== null ? 'poste.update' : 'poste.create', `${editIdx !== null ? 'Modif' : 'Création'} poste « ${p.name} » (${p.cat})`);
  };

  const deletePoste = async (idx: number) => {
    const removed = postes[idx];
    const ok = await confirm(
      `Supprimer ${removed.name} ?\n\nSes valeurs de budget et de dépenses seront retirées de TOUS les mois (${state.months.length}). Les autres postes ne bougent pas.`,
      { title: 'Supprimer le poste', danger: true },
    );
    if (!ok) return;

    // Retire le poste ET sa ligne dans chaque mois (cf. lib/postes : seul endroit autorisé
    // à déplacer des lignes, l'alignement des autres postes y est testé).
    const next = removePosteAt(postes, state.months, idx);
    setState({ ...getState(), postes: next.postes, months: next.months });
    save();
    logChange?.('poste.delete', `Suppression poste « ${removed.name} » (+ valeurs associées de ${state.months.length} mois)`);
  };

  const movePoste = (idx: number, dir: -1 | 1) => {
    const nIdx = idx + dir;
    if (nIdx < 0 || nIdx >= postes.length) return;

    // Échange les deux postes ET leurs lignes (budget + réel) dans chaque mois — cf. lib/postes
    const next = swapPostes(postes, state.months, idx, nIdx);
    setState({ ...state, postes: next.postes, months: next.months });
    save();
    logChange?.('poste.update', `Réordre poste « ${next.postes[nIdx].name} » ↔ « ${next.postes[idx].name} »`);
  };

  /**
   * Désactive/réactive un poste régulier À PARTIR D'UN MOIS DONNÉ, sans jamais toucher
   * aux montants. Ça écrit/retire juste le nom dans `Month.hiddenPostes` (déjà utilisé
   * partout pour exclure une ligne de l'affichage et des totaux — cf. isHidden dans
   * utils.ts) pour chaque mois à partir du cutoff, en une seule action au lieu de
   * cliquer le masquage à la main dans chaque mois. `cutoffMonthId` = null réactive
   * partout (retire des hiddenPostes de tous les mois).
   *
   * createMonth (desktop + mobile) fait hériter hiddenPostes du mois précédent, donc
   * les mois créés APRÈS cette action restent désactivés automatiquement.
   */
  const setPosteActiveFrom = (posteName: string, cutoffMonthId: string | null) => {
    const cutoffIdx = cutoffMonthId ? state.months.findIndex(mo => mo.id === cutoffMonthId) : -1;
    const months = state.months.map((mo, i) => {
      const shouldHide = cutoffMonthId !== null && i >= cutoffIdx;
      const cur = mo.hiddenPostes || [];
      const has = cur.includes(posteName);
      if (shouldHide === has) return mo;
      return { ...mo, hiddenPostes: shouldHide ? [...cur, posteName] : cur.filter(n => n !== posteName) };
    });
    setState({ ...state, months });
    save();
    logChange?.('poste.update', cutoffMonthId
      ? `« ${posteName} » désactivé à partir de ${cutoffMonthId} (historique conservé)`
      : `« ${posteName} » réactivé sur tous les mois`);
  };

  // Statut de masquage d'un poste. `since` = mois depuis lequel il est désactivé en
  // continu jusqu'au dernier mois (le cas « Désactiver à partir de »), sinon null.
  // `count` = nb de mois où il est masqué, tous cas confondus — y compris un masquage
  // ponctuel au milieu de l'historique (icône œil dans le tracker). Depuis que la
  // bannière du tracker a disparu, Réglages est le SEUL endroit pour restaurer, donc
  // le bouton Réactiver doit apparaître dès que count > 0, pas seulement pour `since`.
  const hiddenStatus = (posteName: string): { since: string | null; count: number } => {
    const count = state.months.filter(mo => (mo.hiddenPostes || []).includes(posteName)).length;
    if (state.months.length === 0 || !(state.months[state.months.length - 1].hiddenPostes || []).includes(posteName)) {
      return { since: null, count };
    }
    let i = state.months.length - 1;
    while (i > 0 && (state.months[i - 1].hiddenPostes || []).includes(posteName)) i--;
    return { since: state.months[i].id, count };
  };

  const openDisable = (idx: number) => {
    setDisableIdx(idx);
    setDisableMonthId(state.months[state.months.length - 1]?.id || '');
  };

  const confirmDisable = () => {
    if (disableIdx === null || !disableMonthId) return;
    setPosteActiveFrom(postes[disableIdx].name, disableMonthId);
    setDisableIdx(null);
  };

  const reactivate = async (idx: number) => {
    const p = postes[idx];
    if (!(await confirm(`Réactiver « ${p.name} » sur tous les mois où il est désactivé ?`, { confirmLabel: 'Réactiver' }))) return;
    setPosteActiveFrom(p.name, null);
  };

  /**
   * Postes ponctuels (extras, ajoutés pour un seul mois dans les Dépenses Réelles) :
   * contrairement aux postes réguliers, pas d'objet partagé entre mois où stocker un
   * groupe — chaque mois a sa propre copie du nom. On scanne donc tous les mois pour
   * lister les noms distincts (avec leur nb d'occurrences, pour repérer d'un coup d'œil
   * les variantes du type "AUTRE"/"AUTRES"), et le regroupement se stocke à part dans
   * state.extraGroups (nom brut → groupe), lu par dashboard/page.tsx au moment d'agréger.
   * Ne touche jamais extraActual/extraBudget dans les mois.
   */
  const extraNameStats = (() => {
    const counts: Record<string, number> = {};
    state.months.forEach(mo => {
      (mo.extraActual || []).forEach(r => {
        const n = (r.name || '').trim().toUpperCase();
        if (!n) return;
        counts[n] = (counts[n] || 0) + 1;
      });
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  })();

  const extraGroupDraft = (name: string): string =>
    extraGroupDrafts[name] ?? (state.extraGroups?.[name] || '');

  const saveExtraGroups = () => {
    const extraGroups = { ...(state.extraGroups || {}) };
    let changed = 0;
    Object.entries(extraGroupDrafts).forEach(([name, val]) => {
      const trimmed = val.trim().toUpperCase();
      const prev = extraGroups[name];
      if (trimmed === (prev || '')) return;
      changed++;
      if (trimmed) extraGroups[name] = trimmed;
      else delete extraGroups[name];
    });
    if (changed === 0) return;
    setState({ ...state, extraGroups });
    save();
    logChange?.('poste.update', `Regroupement de ${changed} poste(s) ponctuel(s) mis à jour`);
    setExtraGroupDrafts({});
  };

  const exportData = () => {
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finance-hq-backup-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importData = async () => {
    let data: unknown;
    try {
      data = JSON.parse(importText);
    } catch {
      await alert('JSON invalide', { title: 'Import impossible' });
      return;
    }
    // Garde-fou : un JSON valide quelconque (« {} ») remplaçait toutes les données par du vide
    if (!looksLikeBackup(data)) {
      await alert('Ce JSON ne ressemble pas à une sauvegarde FinanceHQ (aucun mois ni espace dedans). Rien n\'a été modifié.', { title: 'Import impossible' });
      return;
    }
    const nbMois = (data.months || []).length;
    const ok = await confirm(
      `Remplacer TOUTES les données actuelles (${state.months.length} mois) par cette sauvegarde (${nbMois} mois) ?\n\nPense à exporter l'état actuel avant : l'opération ne s'annule pas.`,
      { title: 'Importer une sauvegarde', confirmLabel: 'Remplacer', danger: true },
    );
    if (!ok) return;
    setState(normalizeLoadedState(data)); // mêmes défauts que le chargement normal
    save();
    setImportOpen(false);
    await alert('Données importées avec succès');
  };

  // ─── UI mobile : une liste de rubriques, chacune ouverte dans un volet ───
  if (isMobile === true) {
    const cur = activeSpace?.localCurrency || 'AED';
    const soft = (t: string) => <span className="text-[14px] font-normal text-t-2">{t}</span>;
    const hasDrafts = Object.keys(extraGroupDrafts).length > 0;
    const editing = editIdx !== null ? postes[editIdx] : null;
    const editStatus = editing ? hiddenStatus(editing.name) : null;
    const act = 'w-full flex items-center justify-center gap-2 h-12 text-[15px] font-medium active:opacity-60';
    return (
      <div className="-mx-1">
        <MCard className="mb-4 mt-2">
          <MRow className="!min-h-[48px]" title={soft('Taux du jour')} right={<span className="mono-value">{liveRate.toFixed(4)}</span>} />
          <MDivider />
          <MRow className="!min-h-[48px]" title={soft('Mois enregistrés')} right={<span className="mono-value">{state.months.length}</span>} />
          <MDivider />
          <MRow className="!min-h-[48px]" title={soft('Dernière modification')} right={<span className="text-[14px] text-t-2">{state.lastUpdate ? new Date(state.lastUpdate).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</span>} />
        </MCard>

        <MLabel>Budget</MLabel>
        <MCard className="mb-4">
          <MRow icon={<MIcon><ListChecks size={17} /></MIcon>} title="Postes réguliers" sub={`${postes.length} postes · ordre, devise, désactivation`} chevron onClick={() => setSection('postes')} />
          <MDivider />
          <MRow icon={<MIcon><Layers size={17} /></MIcon>} title="Dépenses ponctuelles" sub={`${extraNameStats.length} nom${extraNameStats.length > 1 ? 's' : ''} · regroupement pour les stats`} chevron onClick={() => setSection('extras')} />
          <MDivider />
          <MRow icon={<MIcon><Repeat size={17} /></MIcon>} title="Récurrences" sub="Dépenses et revenus à date fixe" chevron onClick={() => setSection('recur')} />
        </MCard>

        <MLabel>Données</MLabel>
        <MCard className="mb-2">
          <MRow icon={<MIcon><ShieldCheck size={17} /></MIcon>} title="Vérifier les données" sub="Doublons, lignes orphelines, réparations" chevron onClick={() => setSection('audit')} />
          <MDivider />
          <MRow icon={<MIcon><History size={17} /></MIcon>} title="Historique" sub={`${history.length} modification${history.length > 1 ? 's' : ''}`} chevron onClick={() => setSection('history')} />
          <MDivider />
          <MRow icon={<MIcon><Download size={17} /></MIcon>} title="Exporter une sauvegarde" sub="Un fichier JSON avec toutes tes données" onClick={exportData} />
          <MDivider />
          <MRow icon={<MIcon><Upload size={17} /></MIcon>} title="Importer une sauvegarde" sub="Remplace toutes les données actuelles" chevron onClick={() => setImportOpen(true)} />
        </MCard>

        {/* Postes réguliers */}
        <BottomSheet open={section === 'postes'} onClose={() => setSection(null)} title="Postes réguliers" subtitle="Communs à tous les mois" fullHeight footer={<MButton onClick={openAdd}><Plus size={17} />Nouveau poste</MButton>}>
          <MCard surface="sheet">
            {postes.length === 0 && <div className="px-4 py-6 text-center text-[13px] text-t-3">Aucun poste pour l’instant</div>}
            {postes.map((p, i) => {
              const st = hiddenStatus(p.name);
              return (
                <div key={`${p.name}-${i}`}>
                  {i > 0 && <MDivider />}
                  <MRow
                    icon={<PosteIcon name={p.name} cat={p.cat} />}
                    title={p.name}
                    badge={st.since ? <MBadge tone="warning">Désactivé</MBadge> : st.count > 0 ? <MBadge>Masqué {st.count} mois</MBadge> : undefined}
                    sub={`${CAT_LABELS[p.cat] || p.cat} · ${p.isAed ? cur : 'EUR'}${(p.fixed ?? isPosteFixed(p)) ? ' · charge fixe' : ''}${p.group ? ` · ${p.group}` : ''}${st.since ? ` · depuis ${st.since}` : ''}`}
                    chevron
                    onClick={() => openEdit(i)}
                  />
                </div>
              );
            })}
          </MCard>
        </BottomSheet>

        {/* Dépenses ponctuelles : regroupement pour les stats */}
        <BottomSheet open={section === 'extras'} onClose={() => setSection(null)} title="Dépenses ponctuelles" subtitle="Regrouper des noms proches dans les stats" fullHeight footer={<MButton disabled={!hasDrafts} onClick={saveExtraGroups}>Enregistrer</MButton>}>
          <p className="text-[13px] text-t-3 px-4 pb-3 leading-relaxed">Donne le même groupe à des noms qui désignent la même chose (« AUTRE » et « AUTRES »). Rien ne change dans les mois, seulement dans les stats.</p>
          <MCard surface="sheet">
            {extraNameStats.length === 0 && <div className="px-4 py-6 text-center text-[13px] text-t-3">Aucune dépense ponctuelle enregistrée</div>}
            {extraNameStats.map(([name, count], k) => (
              <div key={name}>
                {k > 0 && <MDivider />}
                <label className="flex items-center gap-3 px-4 min-h-[56px]">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium text-t-1 truncate">{name}</span>
                    <span className="block text-[13px] text-t-3">{count} mois</span>
                  </span>
                  <input className="m-input text-right uppercase !w-[45%]" value={extraGroupDraft(name)} placeholder="Groupe" onChange={e => setExtraGroupDrafts({ ...extraGroupDrafts, [name]: e.target.value })} aria-label={`Groupe de ${name}`} />
                </label>
              </div>
            ))}
          </MCard>
        </BottomSheet>

        <BottomSheet open={section === 'recur'} onClose={() => setSection(null)} title="Récurrences" fullHeight>
          <RecurringSettings />
        </BottomSheet>

        <BottomSheet open={section === 'audit'} onClose={() => setSection(null)} title="Vérifier les données" subtitle="Outil technique : il affiche les lignes brutes" fullHeight>
          <div className="m-legacy"><DataAudit /></div>
        </BottomSheet>

        {/* Historique */}
        <BottomSheet open={section === 'history'} onClose={() => setSection(null)} title="Historique" subtitle={`${history.length} modification${history.length > 1 ? 's' : ''} · les 200 dernières`} fullHeight>
          <MCard surface="sheet">
            {history.length === 0 && <div className="px-4 py-6 text-center text-[13px] text-t-3">Aucune modification enregistrée</div>}
            {history.slice(0, historyLimit).map((h, i) => {
              const KIND: Record<string, string> = { revenu: 'Revenu', month: 'Mois', poste: 'Poste', txn: 'Opération', recurring: 'Récurrence', simulation: 'Simulation', space: 'Espace', trip: 'Voyage' };
              const meta = ACTION_STYLES[h.action] || { lbl: KIND[h.action.split('.')[0]] || h.action, cls: '' };
              return (
                <div key={i}>
                  {i > 0 && <MDivider />}
                  <div className="px-4 py-3">
                    <div className="text-[14px] text-t-1 leading-snug break-words">{h.detail}</div>
                    <div className="text-[12px] text-t-3 mt-1">{meta.lbl} · {fmtRelTs(h.ts)}{h.spaceName ? ` · ${h.spaceName}` : ''}</div>
                  </div>
                </div>
              );
            })}
          </MCard>
          {history.length > historyLimit && (
            <button type="button" onClick={() => setHistoryLimit(l => l + 25)} className={`${act} text-t-1 mt-2`}>Voir plus ({history.length - historyLimit} restantes)</button>
          )}
          {history.length > 0 && (
            <button type="button" onClick={async () => { if (await confirm('Effacer tout l\'historique ? Cette action est irréversible.', { confirmLabel: 'Effacer', danger: true })) clearHistory(); }} className={`${act} text-danger`}>
              <Trash2 size={16} />Effacer l’historique
            </button>
          )}
        </BottomSheet>

        {/* Import */}
        <BottomSheet open={importOpen} onClose={() => setImportOpen(false)} title="Importer une sauvegarde" footer={<MButton variant="danger" disabled={!importText.trim()} onClick={importData}>Remplacer mes données</MButton>}>
          <p className="text-[13px] text-t-3 px-1 pb-3 leading-relaxed">Colle le contenu d’un fichier exporté. Tout ce qui existe aujourd’hui sera remplacé : exporte d’abord l’état actuel.</p>
          <textarea className="m-input bg-cell rounded-[16px] p-4 min-h-[180px] font-mono !text-[16px] leading-snug" value={importText} onChange={e => setImportText(e.target.value)} placeholder="Colle le JSON ici" aria-label="Sauvegarde au format JSON" />
        </BottomSheet>

        {/* Poste : création / modification (par-dessus la liste) */}
        <BottomSheet open={addOpen} onClose={() => setAddOpen(false)} title={editIdx !== null ? 'Modifier le poste' : 'Nouveau poste'} fullHeight={editIdx !== null} footer={<MButton disabled={!form.name.trim()} onClick={savePoste}>{editIdx !== null ? 'Enregistrer' : 'Créer'}</MButton>}>
          <MCard surface="sheet">
            <MField label="Nom"><input className="m-input text-right uppercase" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="LOYER" /></MField>
            <MDivider />
            <MField label="Catégorie">
              <select className="m-input text-right" dir="rtl" value={form.cat} onChange={e => setForm({ ...form, cat: e.target.value as Poste['cat'] })}>
                {CAT_OPTIONS.map(c => <option key={c} value={c}>{CAT_LABELS[c] || c}</option>)}
              </select>
            </MField>
            <MDivider />
            <MField label="Devise du budget"><MSeg surface="page" value={form.isAed ? 'AED' : 'EUR'} options={[['AED', cur], ['EUR', 'EUR']] as const} onChange={v => setForm({ ...form, isAed: v === 'AED' })} /></MField>
            <MDivider />
            <MRow title={soft('Charge fixe')} sub="Payée quoi qu’il arrive, hors bilan du mois" right={<MToggle on={form.fixed ?? isPosteFixed(form)} />} onClick={() => setForm({ ...form, fixed: !(form.fixed ?? isPosteFixed(form)) })} />
            <MDivider />
            <MField label="Groupe (stats)"><input className="m-input text-right uppercase" value={form.group || ''} onChange={e => setForm({ ...form, group: e.target.value })} placeholder={form.name || 'Facultatif'} /></MField>
          </MCard>
          <p className="text-[12px] text-t-4 px-4 pt-2 leading-relaxed">Renommer ou supprimer un poste s’applique à tous les mois. Le groupe sert seulement à additionner plusieurs postes dans les stats.</p>
          {editIdx !== null && editing && (
            <div className="pt-3">
              <div className="flex gap-2">
                <MButton variant="ghost" disabled={editIdx === 0} onClick={() => { movePoste(editIdx, -1); setEditIdx(editIdx - 1); }}><ChevronUp size={17} />Monter</MButton>
                <MButton variant="ghost" disabled={editIdx >= postes.length - 1} onClick={() => { movePoste(editIdx, 1); setEditIdx(editIdx + 1); }}><ChevronDown size={17} />Descendre</MButton>
              </div>
              {editStatus && editStatus.count > 0
                ? <button type="button" onClick={() => { const i = editIdx; setAddOpen(false); reactivate(i); }} className={`${act} text-accent mt-2`}><Eye size={16} />Réactiver sur tous les mois</button>
                : <button type="button" disabled={state.months.length === 0} onClick={() => { const i = editIdx; setAddOpen(false); openDisable(i); }} className={`${act} text-warning mt-2 disabled:opacity-30`}><EyeOff size={16} />Désactiver à partir d’un mois</button>}
              <button type="button" onClick={() => { const i = editIdx; setAddOpen(false); deletePoste(i); }} className={`${act} text-danger`}><Trash2 size={16} />Supprimer le poste</button>
            </div>
          )}
        </BottomSheet>

        {/* Désactiver à partir d'un mois */}
        <BottomSheet open={disableIdx !== null} onClose={() => setDisableIdx(null)} title="Désactiver ce poste" footer={<MButton disabled={!disableMonthId} onClick={confirmDisable}>Désactiver</MButton>}>
          <p className="text-[13px] text-t-3 px-1 pb-3 leading-relaxed">« {disableIdx !== null ? postes[disableIdx]?.name : ''} » disparaît des mois à partir de celui choisi, et des mois créés ensuite. L’historique d’avant reste intact, et c’est réversible.</p>
          <MCard surface="sheet">
            <MField label="À partir de">
              <select className="m-input text-right" dir="rtl" value={disableMonthId} onChange={e => setDisableMonthId(e.target.value)}>
                {state.months.map(mo => <option key={mo.id} value={mo.id}>{mo.id}</option>)}
              </select>
            </MField>
          </MCard>
        </BottomSheet>
      </div>
    );
  }

  return (
    <div>
      <PageHeader breadcrumb={[{ label: 'Système' }, { label: 'Paramètres', current: true }]} title="Paramètres" subtitle="Configuration de l'application">
        <button onClick={openAdd} className="px-4 py-2 bg-accent text-black font-semibold text-sm rounded-sm hover:opacity-90 transition-all flex items-center gap-2 cursor-pointer">
          + Nouveau poste
        </button>
      </PageHeader>

      {/* Info */}
      <div className="bg-bg-3 border border-border rounded-md p-4 mb-5">
        <div className="text-[13px] font-semibold mb-3">Informations</div>
        <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
          <div>
            <div className="text-[9px] text-t-3 uppercase tracking-wider font-medium">Taux live</div>
            <div className="font-mono text-sm font-semibold mt-1">{liveRate.toFixed(4)}</div>
          </div>
          <div>
            <div className="text-[9px] text-t-3 uppercase tracking-wider font-medium">Mois enregistrés</div>
            <div className="font-mono text-sm font-semibold mt-1">{state.months.length}</div>
          </div>
          <div>
            <div className="text-[9px] text-t-3 uppercase tracking-wider font-medium">Dernière MAJ</div>
            <div className="text-sm mt-1 text-t-2">{state.lastUpdate ? new Date(state.lastUpdate).toLocaleString('fr-FR') : '—'}</div>
          </div>
        </div>
      </div>

      {/* Postes table */}
      <div className="bg-bg-3 border border-border rounded-md overflow-hidden mb-5">
        <div className="flex justify-between items-center px-4 py-3 border-b border-border">
          <span className="text-[13px] font-semibold">Postes budgétaires ({postes.length})</span>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[680px]">
          <thead>
            <tr className="bg-bg-2">
              <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium w-8">#</th>
              <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium">Nom</th>
              <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium">Catégorie</th>
              <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium">Devise</th>
              <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium">Statut</th>
              <th className="text-right px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium w-48">Actions</th>
            </tr>
          </thead>
          <tbody>
            {postes.map((p, i) => {
              const { since, count: hiddenCount } = hiddenStatus(p.name);
              return (
              <tr key={i} className="border-b border-border hover:bg-white/[.02] transition-colors">
                <td className="px-4 py-2.5 text-t-3 text-xs">{i + 1}</td>
                <td className="px-4 py-2.5 text-[13px] font-semibold">
                  {p.name}
                  {p.group && p.group !== p.name && (
                    <div className="text-[10px] text-t-4 font-normal mt-0.5">groupé : {p.group}</div>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${CAT_STYLES[p.cat]}`}>
                    {p.cat}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-t-2">{p.isAed ? 'AED' : 'EUR'}</td>
                <td className="px-4 py-2.5">
                  {since
                    ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border text-warning bg-warning/10 border-warning/25" title={`Masqué (calculs + affichage) depuis ${since}, historique intact`}>Désactivé depuis {since}</span>
                    : hiddenCount > 0
                      ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border text-warning bg-warning/10 border-warning/25" title="Masqué ponctuellement dans certains mois (icône œil du tracker), historique intact">Masqué dans {hiddenCount} mois</span>
                      : <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border text-accent bg-accent/10 border-accent/25">Actif</span>}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => movePoste(i, -1)} className="text-[11px] text-t-3 border border-border px-1.5 py-0.5 rounded cursor-pointer hover:bg-bg-4" title="Monter">↑</button>
                    <button onClick={() => movePoste(i, 1)} className="text-[11px] text-t-3 border border-border px-1.5 py-0.5 rounded cursor-pointer hover:bg-bg-4" title="Descendre">↓</button>
                    <button onClick={() => openEdit(i)} className="text-[11px] text-info bg-info/10 border border-info/25 px-2 py-0.5 rounded cursor-pointer hover:bg-info/20">Edit</button>
                    {hiddenCount > 0
                      ? <button onClick={() => reactivate(i)} className="text-[11px] text-accent bg-accent/10 border border-accent/25 px-2 py-0.5 rounded cursor-pointer hover:bg-accent/20">Réactiver</button>
                      : <button onClick={() => openDisable(i)} disabled={state.months.length === 0} className="text-[11px] text-warning bg-warning/10 border border-warning/25 px-2 py-0.5 rounded cursor-pointer hover:bg-warning/20 disabled:opacity-40 disabled:cursor-not-allowed" title="Désactiver à partir d'un mois, sans supprimer l'historique">Désactiver…</button>}
                    <button onClick={() => deletePoste(i)} className="text-[11px] text-danger bg-danger/10 border border-danger/25 px-2 py-0.5 rounded cursor-pointer hover:bg-danger/20">✕</button>
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      {/* Postes ponctuels (extras) — regroupement pour les stats */}
      {extraNameStats.length > 0 && (
        <div className="bg-bg-3 border border-border rounded-md overflow-hidden mb-5">
          <div className="flex justify-between items-center px-4 py-3 border-b border-border">
            <div>
              <span className="text-[13px] font-semibold">Dépenses ponctuelles ({extraNameStats.length})</span>
              <div className="text-[10px] text-t-4 mt-0.5">Ajoutées pour un seul mois dans les Dépenses Réelles — regroupe les variantes de nom (ex: « AUTRE »/« AUTRES ») pour les stats du Dashboard, sans toucher aux dépenses elles-mêmes.</div>
            </div>
            <button
              onClick={saveExtraGroups}
              disabled={Object.keys(extraGroupDrafts).length === 0}
              className="px-3 py-1.5 bg-accent text-black font-semibold text-[11px] rounded-sm cursor-pointer hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed shrink-0 ml-3"
            >
              Enregistrer
            </button>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[480px]">
            <thead>
              <tr className="bg-bg-2">
                <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium">Nom</th>
                <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium w-24">Occurrences</th>
                <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium">Groupe</th>
              </tr>
            </thead>
            <tbody>
              {extraNameStats.map(([name, count]) => (
                <tr key={name} className="border-b border-border last:border-0 hover:bg-white/[.02] transition-colors">
                  <td className="px-4 py-2.5 text-[13px] font-semibold">{name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-t-2">{count}</td>
                  <td className="px-4 py-2.5">
                    <input
                      className="fi !py-1.5 !text-xs"
                      value={extraGroupDraft(name)}
                      onChange={e => setExtraGroupDrafts({ ...extraGroupDrafts, [name]: e.target.value })}
                      placeholder={name}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Outil d'audit et repair de la data */}
      {/* Dépenses et revenus récurrents */}
      <RecurringSettings />

      <DataAudit />

      {/* Historique des modifs */}
      <div className="bg-bg-3 border border-border rounded-lg overflow-hidden mb-5 shadow-inset-border">
        <button
          onClick={() => setHistoryOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-3 border-b border-border hover:bg-white/[.02] transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2 text-[13px] font-semibold tracking-tight">
            🔨 Historique des modifications
            <span className="text-[10px] text-t-3 font-mono mono-value font-normal">
              ({history.length} entrée{history.length > 1 ? 's' : ''})
            </span>
          </span>
          <span className={`text-t-3 text-[11px] transition-transform ${historyOpen ? 'rotate-180' : ''}`}>▾</span>
        </button>
        {historyOpen && (
          <div>
            {history.length === 0 ? (
              <div className="px-4 py-8 text-center text-t-4 text-[12px]">
                Aucune modification enregistrée pour le moment.
              </div>
            ) : (
              <>
                <div className="max-h-[440px] overflow-y-auto">
                  {history.slice(0, historyLimit).map((h, i) => {
                    const meta = ACTION_STYLES[h.action] || { lbl: h.action, cls: 'text-t-3 bg-bg-4 border-border' };
                    return (
                      <div
                        key={i}
                        className="flex items-start gap-3 px-4 py-2.5 border-b border-border last:border-0 hover:bg-white/[.02] transition-colors"
                      >
                        <span className={`text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded border whitespace-nowrap mt-0.5 ${meta.cls}`}>
                          {meta.lbl}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[12px] text-t-1 leading-snug">{h.detail}</div>
                          <div className="text-[10px] text-t-4 mt-0.5 flex items-center gap-2 font-mono">
                            <span title={new Date(h.ts).toLocaleString('fr-FR')}>{fmtRelTs(h.ts)}</span>
                            {h.spaceName && (
                              <>
                                <span>·</span>
                                <span>{h.spaceName}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between px-4 py-2.5 bg-bg-2 border-t border-border">
                  {history.length > historyLimit ? (
                    <button
                      onClick={() => setHistoryLimit(l => l + 25)}
                      className="text-[11px] text-accent hover:underline cursor-pointer font-semibold"
                    >
                      Voir plus ({history.length - historyLimit} restantes)
                    </button>
                  ) : (
                    <span className="text-[10px] text-t-4">Fin de l&apos;historique</span>
                  )}
                  <button
                    onClick={async () => {
                      if (await confirm('Effacer tout l\'historique ? Cette action est irréversible.', { confirmLabel: 'Effacer', danger: true })) {
                        clearHistory();
                      }
                    }}
                    className="text-[10px] text-danger hover:underline cursor-pointer font-semibold"
                  >
                    Effacer l&apos;historique
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Export/Import */}
      <div className="bg-bg-3 border border-border rounded-md p-4 mb-5">
        <div className="text-[13px] font-semibold mb-3">Données</div>
        <div className="flex gap-2.5">
          <button onClick={exportData} className="px-4 py-2 border border-border text-t-2 text-sm rounded-sm hover:bg-bg-4 transition-all cursor-pointer font-semibold">
            Exporter JSON
          </button>
          <button onClick={() => setImportOpen(true)} className="px-4 py-2 border border-border text-t-2 text-sm rounded-sm hover:bg-bg-4 transition-all cursor-pointer font-semibold">
            Importer JSON
          </button>
        </div>
      </div>

      {/* Add/Edit Poste Modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={editIdx !== null ? 'Modifier le poste' : 'Nouveau poste'}>
        <div className="space-y-3.5">
          <div>
            <label className="block text-[10px] text-t-3 uppercase tracking-wider font-medium mb-1.5">Nom</label>
            <input className="fi" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: LOYER" />
          </div>
          <div>
            <label className="block text-[10px] text-t-3 uppercase tracking-wider font-medium mb-1.5">Catégorie</label>
            <select className="fi" value={form.cat} onChange={e => setForm({ ...form, cat: e.target.value as Poste['cat'] })}>
              {CAT_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-t-3 uppercase tracking-wider font-medium mb-1.5">Devise</label>
            <select className="fi" value={form.isAed ? 'AED' : 'EUR'} onChange={e => setForm({ ...form, isAed: e.target.value === 'AED' })}>
              <option value="AED">AED (converti en EUR)</option>
              <option value="EUR">EUR (saisie directe)</option>
            </select>
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.fixed ?? isPosteFixed(form)}
              onChange={e => setForm({ ...form, fixed: e.target.checked })}
              className="w-4 h-4 accent-accent cursor-pointer"
            />
            <span className="text-[12px] text-t-2">Charge fixe <span className="text-t-4">(payée quoi qu'il arrive — exclue du Bilan vs prévisionnel)</span></span>
          </label>
          <div>
            <label className="block text-[10px] text-t-3 uppercase tracking-wider font-medium mb-1.5">Groupe (stats)</label>
            <input className="fi" value={form.group || ''} onChange={e => setForm({ ...form, group: e.target.value })} placeholder={form.name || 'Laisser vide = groupé sous son propre nom'} />
            <div className="text-[10px] text-t-4 mt-1">
              Additionne ce poste avec d&apos;autres dans le Dashboard (même nom de groupe = une seule barre). N&apos;affecte que les stats — le tracker, le budget et l&apos;historique restent inchangés.
            </div>
          </div>
          <div className="flex gap-2.5 mt-5">
            <button onClick={savePoste} className="px-4 py-2 bg-accent text-black font-semibold text-sm rounded-sm cursor-pointer hover:opacity-90">{editIdx !== null ? 'Modifier' : 'Créer'}</button>
            <button onClick={() => setAddOpen(false)} className="px-4 py-2 border border-border text-t-2 text-sm rounded-sm cursor-pointer hover:bg-bg-3">Annuler</button>
          </div>
        </div>
      </Modal>

      {/* Disable Poste Modal */}
      <Modal open={disableIdx !== null} onClose={() => setDisableIdx(null)} title="Désactiver ce poste">
        <div className="space-y-3.5">
          <p className="text-[12px] text-t-3">
            « {disableIdx !== null ? postes[disableIdx]?.name : ''} » disparaîtra du tableau et des totaux à partir du mois choisi (inclus) — les mois précédents et leurs montants ne bougent pas. Réversible à tout moment.
          </p>
          <div>
            <label className="block text-[10px] text-t-3 uppercase tracking-wider font-medium mb-1.5">À partir de</label>
            <select className="fi" value={disableMonthId} onChange={e => setDisableMonthId(e.target.value)}>
              {state.months.map(mo => <option key={mo.id} value={mo.id}>{mo.id}</option>)}
            </select>
          </div>
          <div className="flex gap-2.5 mt-5">
            <button onClick={confirmDisable} className="px-4 py-2 bg-warning text-black font-semibold text-sm rounded-sm cursor-pointer hover:opacity-90">Désactiver</button>
            <button onClick={() => setDisableIdx(null)} className="px-4 py-2 border border-border text-t-2 text-sm rounded-sm cursor-pointer hover:bg-bg-3">Annuler</button>
          </div>
        </div>
      </Modal>

      {/* Import Modal */}
      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Importer des données">
        <div className="space-y-3.5">
          <div>
            <label className="block text-[10px] text-t-3 uppercase tracking-wider font-medium mb-1.5">JSON</label>
            <textarea className="fi min-h-[200px] font-mono text-xs" value={importText} onChange={e => setImportText(e.target.value)} placeholder='Coller le JSON exporté ici...' />
          </div>
          <div className="flex gap-2.5 mt-5">
            <button onClick={importData} className="px-4 py-2 bg-warning text-black font-semibold text-sm rounded-sm cursor-pointer hover:opacity-90">Importer</button>
            <button onClick={() => setImportOpen(false)} className="px-4 py-2 border border-border text-t-2 text-sm rounded-sm cursor-pointer hover:bg-bg-3">Annuler</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
