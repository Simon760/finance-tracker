'use client';

import { useState } from 'react';
import { useApp } from '@/context/AppProvider';
import PageHeader from '@/components/layout/PageHeader';
import Modal from '@/components/ui/Modal';
import { Poste } from '@/lib/types';

const CAT_OPTIONS = ['vital', 'lifestyle', 'finance', 'logement'] as const;
const CAT_STYLES: Record<string, string> = {
  vital: 'text-accent bg-accent/10 border-accent/25',
  lifestyle: 'text-pink bg-pink/10 border-pink/25',
  finance: 'text-warning bg-warning/10 border-warning/25',
  logement: 'text-info bg-info/10 border-info/25',
};

export default function SettingsPage() {
  const { state, setState, save, liveRate } = useApp();
  const postes = state.postes || [];

  const [addOpen, setAddOpen] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [form, setForm] = useState<Poste>({ name: '', cat: 'vital', isAed: true });
  const [importText, setImportText] = useState('');
  const [importOpen, setImportOpen] = useState(false);

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
  };

  const deletePoste = (idx: number) => {
    if (!confirm(`Supprimer ${postes[idx].name} ?`)) return;
    setState({ ...state, postes: postes.filter((_, i) => i !== idx) });
    save();
  };

  const movePoste = (idx: number, dir: -1 | 1) => {
    const nIdx = idx + dir;
    if (nIdx < 0 || nIdx >= postes.length) return;
    const arr = [...postes];
    [arr[idx], arr[nIdx]] = [arr[nIdx], arr[idx]];
    setState({ ...state, postes: arr });
    save();
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
        <table className="w-full border-collapse">
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
