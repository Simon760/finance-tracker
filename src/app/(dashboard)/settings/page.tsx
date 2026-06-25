'use client';

import { useState } from 'react';
import { useApp } from '@/context/AppProvider';
import PageHeader from '@/components/layout/PageHeader';
import Modal from '@/components/ui/Modal';
import { Poste } from '@/lib/types';
import DataAudit from '@/components/DataAudit';
import { isPosteFixed } from '@/lib/budgetBalance';

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
  const { state, setState, save, liveRate, history, clearHistory, logChange } = useApp();
  const postes = state.postes || [];

  const [addOpen, setAddOpen] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [form, setForm] = useState<Poste>({ name: '', cat: 'vital', isAed: true });
  const [importText, setImportText] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(15);

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
    const p: Poste = { ...form, name: form.name.trim().toUpperCase() };
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

  // Padding helper : étend un array m.budget ou m.actual jusqu'à la longueur min
  // avec des entries par défaut, pour gérer cleanly les données héritées où m.budget.length < postes.length
  const padTo = <T,>(arr: T[], len: number, def: T): T[] => {
    const out = [...arr];
    while (out.length < len) out.push({ ...def } as T);
    return out;
  };

  const deletePoste = (idx: number) => {
    const removed = postes[idx];
    if (!confirm(`Supprimer ${removed.name} ?\n\nLes valeurs de budget et de dépenses associées dans TOUS les mois seront aussi retirées (splice propre pour préserver l'alignement des autres postes).`)) return;

    const newPostes = postes.filter((_, i) => i !== idx);

    // Splice les m.budget[idx] et m.actual[idx] de chaque mois pour garder l'alignement
    const newMonths = state.months.map(mo => {
      const budget = [...(mo.budget || [])];
      const actual = [...(mo.actual || [])];
      if (idx < budget.length) budget.splice(idx, 1);
      if (idx < actual.length) actual.splice(idx, 1);
      return { ...mo, budget, actual };
    });

    setState({ ...state, postes: newPostes, months: newMonths });
    save();
    logChange?.('poste.delete', `Suppression poste « ${removed.name} » (+ valeurs associées de ${state.months.length} mois)`);
  };

  const movePoste = (idx: number, dir: -1 | 1) => {
    const nIdx = idx + dir;
    if (nIdx < 0 || nIdx >= postes.length) return;

    // Swap state.postes
    const newPostes = [...postes];
    [newPostes[idx], newPostes[nIdx]] = [newPostes[nIdx], newPostes[idx]];

    // Swap m.budget[idx] ↔ m.budget[nIdx] ET m.actual[idx] ↔ m.actual[nIdx] dans chaque mois
    const minLen = Math.max(idx, nIdx) + 1;
    const newMonths = state.months.map(mo => {
      const budget = padTo(mo.budget || [], minLen, { aed: 0, eur: null });
      const actual = padTo(mo.actual || [], minLen, { aed: 0, eur: null, txns: [] });
      [budget[idx], budget[nIdx]] = [budget[nIdx], budget[idx]];
      [actual[idx], actual[nIdx]] = [actual[nIdx], actual[idx]];
      return { ...mo, budget, actual };
    });

    setState({ ...state, postes: newPostes, months: newMonths });
    save();
    logChange?.('poste.update', `Réordre poste « ${newPostes[nIdx].name} » ↔ « ${newPostes[idx].name} »`);
  };

  const exportData = () => {
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finance-hq-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importData = () => {
    try {
      const data = JSON.parse(importText);
      if (data && typeof data === 'object') {
        setState(data);
        save();
        setImportOpen(false);
        alert('Données importées avec succès');
      }
    } catch {
      alert('JSON invalide');
    }
  };

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
        <table className="w-full border-collapse min-w-[560px]">
          <thead>
            <tr className="bg-bg-2">
              <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium w-8">#</th>
              <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium">Nom</th>
              <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium">Catégorie</th>
              <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium">Devise</th>
              <th className="text-right px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium w-32">Actions</th>
            </tr>
          </thead>
          <tbody>
            {postes.map((p, i) => (
              <tr key={i} className="border-b border-border hover:bg-white/[.02] transition-colors">
                <td className="px-4 py-2.5 text-t-3 text-xs">{i + 1}</td>
                <td className="px-4 py-2.5 text-[13px] font-semibold">{p.name}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${CAT_STYLES[p.cat]}`}>
                    {p.cat}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-t-2">{p.isAed ? 'AED' : 'EUR'}</td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => movePoste(i, -1)} className="text-[11px] text-t-3 border border-border px-1.5 py-0.5 rounded cursor-pointer hover:bg-bg-4" title="Monter">↑</button>
                    <button onClick={() => movePoste(i, 1)} className="text-[11px] text-t-3 border border-border px-1.5 py-0.5 rounded cursor-pointer hover:bg-bg-4" title="Descendre">↓</button>
                    <button onClick={() => openEdit(i)} className="text-[11px] text-info bg-info/10 border border-info/25 px-2 py-0.5 rounded cursor-pointer hover:bg-info/20">Edit</button>
                    <button onClick={() => deletePoste(i)} className="text-[11px] text-danger bg-danger/10 border border-danger/25 px-2 py-0.5 rounded cursor-pointer hover:bg-danger/20">✕</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* Outil d'audit et repair de la data */}
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
                    onClick={() => {
                      if (confirm('Effacer tout l\'historique ? Cette action est irréversible.')) {
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
          <div className="flex gap-2.5 mt-5">
            <button onClick={savePoste} className="px-4 py-2 bg-accent text-black font-semibold text-sm rounded-sm cursor-pointer hover:opacity-90">{editIdx !== null ? 'Modifier' : 'Créer'}</button>
            <button onClick={() => setAddOpen(false)} className="px-4 py-2 border border-border text-t-2 text-sm rounded-sm cursor-pointer hover:bg-bg-3">Annuler</button>
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
