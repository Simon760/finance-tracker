'use client';

import { useState } from 'react';
import { useApp } from '@/context/AppProvider';
import PageHeader from '@/components/layout/PageHeader';
import { KpiCard } from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import { f$, f0, toEur } from '@/lib/utils';
import { INSTALL_CAPITAL } from '@/lib/constants';
import { EmmenagementItem } from '@/lib/types';
import { useDialog } from '@/components/ui/Dialog';
import { Plus, Trash2, Home } from 'lucide-react';
import { useIsMobile } from '@/lib/useIsMobile';
import BottomSheet from '@/components/mobile/BottomSheet';
import { MButton, MCard, MDivider, MEmpty, MField, MLabel, MNum, MRow } from '@/components/mobile/ui';

const CATS = ['Meubles', 'Électroménager', 'Décoration', 'Cuisine', 'Autre'];

export default function SetupPage() {
  const { state, setState, save, getState, liveRate, activeSpace } = useApp();
  const { confirm } = useDialog();
  const isMobile = useIsMobile();
  const items = state.emmenagement || [];

  const [addOpen, setAddOpen] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [form, setForm] = useState<EmmenagementItem>({ poste: '', aed: 0, taux: liveRate, eur: 0, cat: CATS[0] });

  // Catégories proposées : la liste de base + celles déjà utilisées (sinon une ligne
  // rangée dans « Société » s'affichait comme « Meubles » dans le formulaire)
  const catOptions = Array.from(new Set([...CATS, ...items.map(i => i.cat).filter(Boolean)]));

  const totalAed = items.reduce((s, i) => s + (i.aed || 0), 0);
  const totalEur = items.reduce((s, i) => s + (i.eur || toEur(i.aed, i.taux || liveRate)), 0);

  // Ce qu'il fallait avoir en poche avant de s'installer : les frais de setup déjà
  // payés sur place + le capital transféré vers les comptes UAE (cf. INSTALL_CAPITAL,
  // reconstitué depuis les relevés Revolut / FAB / WIO). Converti au taux du jour de
  // l'expatriation, pas au taux courant — c'est une photo, pas une valeur qui vit.
  const install = INSTALL_CAPITAL[activeSpace.id];
  const capitalPreInstall = install ? totalAed + install.aed : 0;

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

  const deleteItem = async (idx: number) => {
    if (!(await confirm(`Supprimer « ${items[idx]?.poste || 'cette ligne'} » ?`, { danger: true }))) return;
    setState({ ...getState(), emmenagement: items.filter((_, i) => i !== idx) });
    save();
  };

  // ─── UI mobile : mêmes données et mêmes actions, rendu en cartes fines ───
  if (isMobile === true) {
    const cur = activeSpace?.localCurrency || 'AED';
    const eurOf = (i: EmmenagementItem) => i.eur || toEur(i.aed, i.taux || liveRate);
    const cats = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
    const sheet = (
      <BottomSheet open={addOpen} onClose={() => setAddOpen(false)} title={editIdx !== null ? 'Modifier le frais' : 'Nouveau frais'} footer={<MButton disabled={!form.poste.trim()} onClick={saveItem}>{editIdx !== null ? 'Enregistrer' : 'Ajouter'}</MButton>}>
        <div className="flex flex-col items-center pt-2 pb-4">
          <MNum className="m-amount text-center px-6" value={form.aed} onChange={n => setForm({ ...form, aed: n })} autoFocus={editIdx === null} ariaLabel="Montant" />
          <span className="text-[13px] text-t-3 mt-1">{cur}</span>
          <span className="text-[13px] text-t-3 mt-1 mono-value m-sub">{form.aed > 0 && form.taux > 0 ? `≈ ${f$(form.aed / form.taux)} €` : 'au taux indiqué ci-dessous'}</span>
        </div>
        <MCard surface="sheet">
          <MField label="Quoi"><input className="m-input text-right" value={form.poste} onChange={e => setForm({ ...form, poste: e.target.value })} placeholder="Canapé" /></MField>
          <MDivider />
          <MField label="Catégorie">
            <select className="m-input text-right" dir="rtl" value={form.cat} onChange={e => setForm({ ...form, cat: e.target.value })}>{catOptions.map(c => <option key={c} value={c}>{c}</option>)}</select>
          </MField>
          <MDivider />
          <MField label={`Taux EUR / ${cur}`}><MNum className="text-right" value={form.taux} onChange={n => setForm({ ...form, taux: n })} /></MField>
        </MCard>
        {editIdx !== null && (
          <button type="button" onClick={() => { const i = editIdx; setAddOpen(false); deleteItem(i); }} className="w-full flex items-center justify-center gap-2 h-12 mt-3 text-[15px] font-medium text-danger active:opacity-60"><Trash2 size={16} />Supprimer</button>
        )}
      </BottomSheet>
    );
    if (items.length === 0) {
      return (
        <>
          <MEmpty icon={<Home size={26} />} title="Note tes frais d’installation" text="Meubles, électroménager, dépôt : ce que t’a coûté ton arrivée, à part du budget mensuel." action={<MButton onClick={openAdd}><Plus size={17} />Ajouter un frais</MButton>} />
          {sheet}
        </>
      );
    }
    return (
      <div className="-mx-1">
        <div className="flex flex-col items-center pt-3 pb-6">
          <span className="text-[13px] text-t-3">Frais d’installation</span>
          <span className="flex items-baseline gap-1.5 mt-1">
            <span className="text-[36px] leading-none hero-num mono-value text-t-1">{f0(totalAed)}</span>
            <span className="text-[16px] text-t-3 font-medium">{cur}</span>
          </span>
          <span className="text-[13px] text-t-3 mt-1.5 mono-value m-sub">≈ {f$(totalEur)} € · {items.length} ligne{items.length > 1 ? 's' : ''}</span>
          <MButton className="!w-auto !h-11 px-6 mt-4" onClick={openAdd}><Plus size={17} />Ajouter un frais</MButton>
        </div>

        {install && (
          <MCard className="mb-4">
            <MRow
              title="Capital avant installation"
              sub={<span className="mono-value">{f0(totalAed)} de frais + {f0(install.aed)} transférés</span>}
              right={<span className="mono-value">{f0(capitalPreInstall)} {cur}</span>}
              rightSub={<span className="mono-value">{f$(capitalPreInstall / install.rate)} €</span>}
            />
          </MCard>
        )}

        <MLabel>Par catégorie</MLabel>
        <MCard className="mb-4">
          {cats.map(([cat, val], k) => (
            <div key={cat}>
              {k > 0 && <MDivider />}
              <MRow className="!min-h-[48px]" title={<span className="text-[14px] font-normal text-t-2">{cat}</span>} right={<span className="mono-value">{f$(val)} €</span>} rightSub={<span className="mono-value">{totalEur > 0 ? Math.round((val / totalEur) * 100) : 0} %</span>} />
            </div>
          ))}
        </MCard>

        <MLabel>Détail</MLabel>
        <MCard className="mb-2">
          {items.map((item, i) => (
            <div key={i}>
              {i > 0 && <MDivider />}
              <MRow
                title={item.poste || 'Sans nom'}
                sub={<span className="mono-value">{item.cat || 'Autre'} · taux {(item.taux || liveRate).toFixed(4)}</span>}
                right={<span className="mono-value">{f0(item.aed)} {cur}</span>}
                rightSub={<span className="mono-value">{f$(eurOf(item))} €</span>}
                onClick={() => openEdit(i)}
              />
            </div>
          ))}
        </MCard>
        {sheet}
      </div>
    );
  }

  return (
    <div>
      <PageHeader breadcrumb={[{ label: activeSpace.name }, { label: 'Setup', current: true }]} title="Setup" subtitle="Frais d'installation">
        <button onClick={openAdd} className="px-4 py-2 bg-accent text-black font-semibold text-sm rounded-sm hover:opacity-90 transition-all flex items-center gap-2 cursor-pointer">
          + Ajouter
        </button>
      </PageHeader>

      {/* KPIs */}
      <div className={`grid ${install ? 'grid-cols-4' : 'grid-cols-3'} gap-3 mb-5 max-lg:grid-cols-2 max-md:grid-cols-1`}>
        <KpiCard label="Total AED" value={`${f0(totalAed)} AED`} accentColor="#3b82f6" />
        <KpiCard label="Total EUR" value={`${f$(totalEur)} €`} accentColor="#10b981" />
        <KpiCard label="Postes" value={`${items.length}`} accentColor="#8b5cf6" />
        {install && (
          <KpiCard
            label="Capital avant installation"
            value={`${f0(capitalPreInstall)} AED`}
            sub={`${f$(capitalPreInstall / install.rate)} € au taux du ${install.date} · ${f0(totalAed)} de frais + ${f0(install.aed)} transférés`}
            accentColor="#f59e0b"
          />
        )}
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
        <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[640px]">
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
      </div>

      {/* Modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={editIdx !== null ? 'Modifier' : 'Ajouter un frais'}>
        <div className="space-y-3.5">
          <FormField label="Poste">
            <input className="fi" value={form.poste} onChange={e => setForm({ ...form, poste: e.target.value })} placeholder="Ex: Canapé" />
          </FormField>
          <FormField label="Catégorie">
            <select className="fi" value={form.cat} onChange={e => setForm({ ...form, cat: e.target.value })}>
              {catOptions.map(c => <option key={c} value={c}>{c}</option>)}
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
