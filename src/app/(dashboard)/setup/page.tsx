'use client';

import { useState } from 'react';
import { useApp } from '@/context/AppProvider';
import PageHeader from '@/components/layout/PageHeader';
import { KpiCard } from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import { f$, f0, toEur } from '@/lib/utils';
import { EmmenagementItem } from '@/lib/types';

const CATS = ['Meubles', 'Électroménager', 'Décoration', 'Cuisine', 'Autre'];

export default function SetupPage() {
  const { state, setState, save, liveRate } = useApp();
  const items = state.emmenagement || [];

  const [addOpen, setAddOpen] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [form, setForm] = useState<EmmenagementItem>({ poste: '', aed: 0, taux: liveRate, eur: 0, cat: CATS[0] });

  const totalAed = items.reduce((s, i) => s + (i.aed || 0), 0);
  const totalEur = items.reduce((s, i) => s + (i.eur || toEur(i.aed, i.taux || liveRate)), 0);

  const catTotals: Record<string, number> = {};
  items.forEach(i => {
    catTotals[i.cat || 'Autre'] = (catTotals[i.cat || 'Autre'] || 0) + (i.eur || toEur(i.aed, i.taux || liveRate));
  });

  const openAdd = () => {
    setForm({ poste: '', aed: 0, taux: liveRate, eur: 0, cat: CATS[0] });
    setEditIdx(null);
    setAddOpen(true);
  };

  const openEdit = (idx: number) => {
    setForm({ ...items[idx] });
    setEditIdx(idx);
    setAddOpen(true);
  };

  const saveItem = () => {
    const computed = { ...form, eur: form.taux > 0 ? form.aed / form.taux : 0 };
    let updated: EmmenagementItem[];
    if (editIdx !== null) {
      updated = items.map((item, i) => i === editIdx ? computed : item);
    } else {
      updated = [...items, computed];
    }
    setState({ ...state, emmenagement: updated });
    setAddOpen(false);
    save();
  };

  const deleteItem = (idx: number) => {
    if (!confirm('Supprimer ?')) return;
    setState({ ...state, emmenagement: items.filter((_, i) => i !== idx) });
    save();
  };

  return (
    <div>
      <PageHeader breadcrumb={[{ label: 'Dubai' }, { label: 'Setup', current: true }]} title="Setup" subtitle="Frais d'installation">
        <button onClick={openAdd} className="px-4 py-2 bg-accent text-black font-semibold text-sm rounded-sm hover:opacity-90 transition-all flex items-center gap-2 cursor-pointer">
          + Ajouter
        </button>
      </PageHeader>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3 mb-5 max-md:grid-cols-1">
        <KpiCard label="Total AED" value={`${f0(totalAed)} AED`} accentColor="#3b82f6" />
        <KpiCard label="Total EUR" value={`${f$(totalEur)} €`} accentColor="#10b981" />
        <KpiCard label="Postes" value={`${items.length}`} accentColor="#8b5cf6" />
      </div>

      {/* Category summary */}
      <div className="flex gap-2.5 flex-wrap mb-5">
        {Object.entries(catTotals).sort((a, b) => b[1] - a[1]).map(([cat, val]) => (
          <div key={cat} className="bg-bg-3 border border-border rounded-md px-4 py-3 min-w-[140px]">
            <div className="text-[9px] text-t-3 uppercase tracking-wider font-medium">{cat}</div>
            <div className="font-mono text-sm font-semibold mt-1 mono-value">{f$(val)} €</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-bg-3 border border-border rounded-md overflow-hidden mb-5">
        <div className="flex justify-between items-center px-4 py-3 border-b border-border">
          <span className="text-[13px] font-semibold">Détail des frais</span>
          <span className="font-mono text-sm font-semibold text-accent mono-value">{f$(totalEur)} €</span>
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-bg-2">
              <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium">Poste</th>
              <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium">Catégorie</th>
              <th className="text-right px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium">AED</th>
              <th className="text-right px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium">Taux</th>
              <th className="text-right px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium">EUR</th>
              <th className="text-right px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium w-20">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} className="border-b border-border hover:bg-white/[.02] transition-colors">
                <td className="px-4 py-2.5 text-[13px] font-medium">{item.poste}</td>
                <td className="px-4 py-2.5"><span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-bg-4 text-t-2">{item.cat || '—'}</span></td>
                <td className="px-4 py-2.5 text-right font-mono text-xs mono-value">{f0(item.aed)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-xs text-t-3">{(item.taux || liveRate).toFixed(4)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold mono-value">{f$(item.eur || toEur(item.aed, item.taux || liveRate))}</td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => openEdit(i)} className="text-[11px] text-info bg-info/10 border border-info/25 px-2 py-0.5 rounded cursor-pointer hover:bg-info/20">Edit</button>
                    <button onClick={() => deleteItem(i)} className="text-[11px] text-danger bg-danger/10 border border-danger/25 px-2 py-0.5 rounded cursor-pointer hover:bg-danger/20">✕</button>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-t-3 text-sm">Aucun frais enregistré</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={editIdx !== null ? 'Modifier' : 'Ajouter un frais'}>
        <div className="space-y-3.5">
          <FormField label="Poste">
            <input className="fi" value={form.poste} onChange={e => setForm({ ...form, poste: e.target.value })} placeholder="Ex: Canapé" />
          </FormField>
          <FormField label="Catégorie">
            <select className="fi" value={form.cat} onChange={e => setForm({ ...form, cat: e.target.value })}>
              {CATS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </FormField>
          <FormField label="Montant AED">
            <input className="fi" type="number" value={form.aed || ''} onChange={e => setForm({ ...form, aed: parseFloat(e.target.value) || 0 })} step="0.01" />
          </FormField>
          <FormField label="Taux EUR/AED">
            <input className="fi" type="number" value={form.taux} onChange={e => setForm({ ...form, taux: parseFloat(e.target.value) || 0 })} step="0.0001" />
          </FormField>
          <div className="flex gap-2.5 mt-5">
            <button onClick={saveItem} className="px-4 py-2 bg-accent text-black font-semibold text-sm rounded-sm cursor-pointer hover:opacity-90">{editIdx !== null ? 'Modifier' : 'Ajouter'}</button>
            <button onClick={() => setAddOpen(false)} className="px-4 py-2 border border-border text-t-2 text-sm rounded-sm cursor-pointer hover:bg-bg-3">Annuler</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] text-t-3 uppercase tracking-wider font-medium mb-1.5">{label}</label>
      {children}
    </div>
  );
}
