'use client';

import { useState, useMemo } from 'react';
import { useApp } from '@/context/AppProvider';
import PageHeader from '@/components/layout/PageHeader';
import { KpiCard } from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import { f$, f0 } from '@/lib/utils';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';

interface Asset {
  name: string;
  type: 'cash' | 'investment' | 'crypto' | 'real-estate' | 'other';
  currency: string;
  value: number;
  eurValue: number;
}

const ASSET_TYPES = [
  { value: 'cash', label: 'Cash / Épargne', color: '#10b981' },
  { value: 'investment', label: 'Investissement', color: '#3b82f6' },
  { value: 'crypto', label: 'Crypto', color: '#f59e0b' },
  { value: 'real-estate', label: 'Immobilier', color: '#8b5cf6' },
  { value: 'other', label: 'Autre', color: '#06b6d4' },
];

const tooltipStyle = { background: '#1c1c23', border: '1px solid #2a2a3a', borderRadius: 8 };

export default function NetWorthPage() {
  const { spaces, liveRate } = useApp();
  const [assets, setAssets] = useState<Asset[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('fhq_assets');
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<Asset>({ name: '', type: 'cash', currency: 'EUR', value: 0, eurValue: 0 });

  const saveAssets = (a: Asset[]) => {
    setAssets(a);
    localStorage.setItem('fhq_assets', JSON.stringify(a));
  };

  const addAsset = () => {
    if (!form.name.trim()) return;
    const eurVal = form.currency === 'EUR' ? form.value : form.value / liveRate;
    saveAssets([...assets, { ...form, eurValue: eurVal }]);
    setForm({ name: '', type: 'cash', currency: 'EUR', value: 0, eurValue: 0 });
    setAddOpen(false);
  };

  const deleteAsset = (idx: number) => {
    saveAssets(assets.filter((_, i) => i !== idx));
  };

  // Bank balances from spaces
  const bankBalances = useMemo(() => {
    return spaces.map(s => {
      const lastMonth = s.months[s.months.length - 1];
      const balance = lastMonth?.soldeEnd || lastMonth?.soldeStart || 0;
      const eurBalance = s.localCurrency === 'EUR' ? balance : balance / liveRate;
      return { space: s.name, emoji: s.emoji, currency: s.localCurrency, balance, eurBalance };
    }).filter(b => b.balance > 0);
  }, [spaces, liveRate]);

  const totalBankEur = bankBalances.reduce((s, b) => s + b.eurBalance, 0);
  const totalAssetsEur = assets.reduce((s, a) => s + a.eurValue, 0);
  const netWorth = totalBankEur + totalAssetsEur;

  // Pie data
  const pieData = [
    ...bankBalances.map(b => ({ name: `${b.emoji} ${b.space}`, value: b.eurBalance })),
    ...assets.map(a => ({ name: a.name, value: a.eurValue })),
  ].filter(d => d.value > 0);

  // By type
  const byType: Record<string, number> = {};
  bankBalances.forEach(b => { byType['cash'] = (byType['cash'] || 0) + b.eurBalance; });
  assets.forEach(a => { byType[a.type] = (byType[a.type] || 0) + a.eurValue; });
  const typePie = ASSET_TYPES.filter(t => byType[t.value] > 0).map(t => ({
    name: t.label, value: byType[t.value], color: t.color,
  }));

  return (
    <div>
      <PageHeader breadcrumb={[{ label: 'Net Worth', current: true }]} title="Net Worth" subtitle="Patrimoine total consolidé">
        <button onClick={() => setAddOpen(true)} className="px-4 py-2 bg-accent text-black font-semibold text-sm rounded-sm hover:opacity-90 transition-all flex items-center gap-2 cursor-pointer">
          + Ajouter un actif
        </button>
      </PageHeader>

      {/* Hero KPI */}
      <div className="bg-bg-3 border border-border rounded-md p-6 mb-5 text-center">
        <div className="text-[10px] text-t-3 uppercase tracking-wider font-medium mb-2">Patrimoine net total</div>
        <div className="font-mono text-4xl font-light tracking-tighter mono-value">{f$(netWorth)} €</div>
        <div className="text-t-3 text-xs mt-2 font-mono">
          Banques: {f$(totalBankEur)} € · Actifs: {f$(totalAssetsEur)} €
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5 max-md:grid-cols-1">
        <KpiCard label="Comptes bancaires" value={`${f$(totalBankEur)} €`} accentColor="#10b981" />
        <KpiCard label="Actifs déclarés" value={`${f$(totalAssetsEur)} €`} accentColor="#3b82f6" />
        <KpiCard label="Nombre d'actifs" value={`${bankBalances.length + assets.length}`} accentColor="#8b5cf6" />
      </div>

      {/* Bank balances */}
      {bankBalances.length > 0 && (
        <div className="bg-bg-3 border border-border rounded-md overflow-hidden mb-5">
          <div className="px-4 py-3 border-b border-border">
            <span className="text-[13px] font-semibold">Soldes bancaires (auto)</span>
            <span className="text-[10px] text-t-3 ml-2">Derniers soldes de chaque space</span>
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-bg-2">
                <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium">Space</th>
                <th className="text-right px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium">Local</th>
                <th className="text-right px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium">EUR</th>
              </tr>
            </thead>
            <tbody>
              {bankBalances.map((b, i) => (
                <tr key={i} className="border-b border-border hover:bg-white/[.02]">
                  <td className="px-4 py-2.5 text-[13px] font-medium">{b.emoji} {b.space}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs mono-value">{f0(b.balance)} {b.currency}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold text-accent mono-value">{f$(b.eurBalance)} €</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Manual assets */}
      <div className="bg-bg-3 border border-border rounded-md overflow-hidden mb-5">
        <div className="flex justify-between items-center px-4 py-3 border-b border-border">
          <span className="text-[13px] font-semibold">Actifs manuels</span>
          <button onClick={() => setAddOpen(true)} className="text-xs text-t-2 border border-border px-2.5 py-1 rounded-sm hover:bg-bg-4 transition-all cursor-pointer">+</button>
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-bg-2">
              <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium">Nom</th>
              <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium">Type</th>
              <th className="text-right px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium">Valeur</th>
              <th className="text-right px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium">EUR</th>
              <th className="text-right px-4 py-2 text-[10px] uppercase tracking-wider text-t-4 font-medium w-16"></th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a, i) => (
              <tr key={i} className="border-b border-border hover:bg-white/[.02]">
                <td className="px-4 py-2.5 text-[13px] font-medium">{a.name}</td>
                <td className="px-4 py-2.5">
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-bg-4 text-t-2">
                    {ASSET_TYPES.find(t => t.value === a.type)?.label || a.type}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs mono-value">{f0(a.value)} {a.currency}</td>
                <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold mono-value">{f$(a.eurValue)} €</td>
                <td className="px-4 py-2.5 text-right">
                  <button onClick={() => deleteAsset(i)} className="text-[11px] text-danger bg-danger/10 border border-danger/25 px-2 py-0.5 rounded cursor-pointer hover:bg-danger/20">✕</button>
                </td>
              </tr>
            ))}
            {assets.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-t-3 text-sm">Aucun actif manuel</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-3 mb-5 max-lg:grid-cols-1">
        {pieData.length > 0 && (
          <div className="bg-bg-3 border border-border rounded-md p-4" style={{ height: 280 }}>
            <div className="text-[13px] font-semibold text-t-2 mb-4">Répartition par actif</div>
            <ResponsiveContainer width="100%" height="85%">
              <PieChart>
                <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2}>
                  {pieData.map((_, i) => <Cell key={i} fill={['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899'][i % 6]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${f$(Number(v))} €`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
        {typePie.length > 0 && (
          <div className="bg-bg-3 border border-border rounded-md p-4" style={{ height: 280 }}>
            <div className="text-[13px] font-semibold text-t-2 mb-4">Répartition par type</div>
            <ResponsiveContainer width="100%" height="85%">
              <PieChart>
                <Pie data={typePie} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2}>
                  {typePie.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${f$(Number(v))} €`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Add Asset Modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Ajouter un actif">
        <div className="space-y-3.5">
          <div>
            <label className="block text-[10px] text-t-3 uppercase tracking-wider font-medium mb-1.5">Nom</label>
            <input className="fi" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Livret A, Bitcoin, Appart Paris..." />
          </div>
          <div>
            <label className="block text-[10px] text-t-3 uppercase tracking-wider font-medium mb-1.5">Type</label>
            <select className="fi" value={form.type} onChange={e => setForm({ ...form, type: e.target.value as Asset['type'] })}>
              {ASSET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-t-3 uppercase tracking-wider font-medium mb-1.5">Devise</label>
            <select className="fi" value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}>
              <option value="EUR">EUR</option>
              <option value="AED">AED</option>
              <option value="USD">USD</option>
              <option value="GBP">GBP</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-t-3 uppercase tracking-wider font-medium mb-1.5">Valeur</label>
            <input className="fi" type="number" value={form.value || ''} onChange={e => setForm({ ...form, value: parseFloat(e.target.value) || 0 })} step="0.01" />
          </div>
          <div className="flex gap-2.5 mt-5">
            <button onClick={addAsset} className="px-4 py-2 bg-accent text-black font-semibold text-sm rounded-sm cursor-pointer hover:opacity-90">Ajouter</button>
            <button onClick={() => setAddOpen(false)} className="px-4 py-2 border border-border text-t-2 text-sm rounded-sm cursor-pointer hover:bg-bg-3">Annuler</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
