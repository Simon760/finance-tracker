'use client';

import { useState } from 'react';
import { Repeat, Pencil, Trash2 } from 'lucide-react';
import { useApp } from '@/context/AppProvider';
import Modal from '@/components/ui/Modal';
import { useDialog } from '@/components/ui/Dialog';
import { RecurringRule } from '@/lib/types';
import { useRecurring } from '@/lib/useRecurring';
import { ruleSchedule } from '@/lib/recurring';
import { f$, todayISO } from '@/lib/utils';
import { useIsMobile } from '@/lib/useIsMobile';
import BottomSheet from '@/components/mobile/BottomSheet';
import { MBadge, MButton, MCard, MDivider, MField, MLabel, MNum, MRow, MSeg } from '@/components/mobile/ui';

const WEEKDAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

/** 2026-11-20 → 20/11/2026 */
const frDate = (d?: string) => (d && d.length >= 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '');

function blank(kind: RecurringRule['kind'], postes: string[], cats: string[]): RecurringRule {
  return {
    id: '', kind, label: '', amount: 0,
    currency: kind === 'expense' ? 'AED' : 'EUR',
    poste: kind === 'expense' ? postes[0] : undefined,
    cat: kind === 'revenue' ? cats[0] || '' : undefined,
    freq: kind === 'expense' ? 'monthly' : 'weekly',
    day: 1, weekday: 5, active: true, from: todayISO(),
  };
}

// Au niveau module : défini dans le rendu, ce composant serait recréé à chaque frappe et
// les champs qu'il contient perdraient le focus.
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] text-t-3 uppercase tracking-[0.12em] font-semibold mb-1.5">{label}</label>
      {children}
    </div>
  );
}

/**
 * Réglages → Récurrences : les règles de dépenses et de revenus qui reviennent à date
 * fixe. Une règle ne crée rien toute seule — elle fait apparaître un bandeau dans le
 * tracker (dépenses échues) ou dans Revenus (prévisions du mois), ajouté en un clic.
 * Section responsive : Réglages a la même UI sur desktop et mobile.
 */
export default function RecurringSettings() {
  const { state } = useApp();
  const { rules, saveRule, deleteRule } = useRecurring();
  const { confirm } = useDialog();
  const isMobile = useIsMobile();
  const postes = (state.postes || []).map(p => p.name);
  const cats = state.revenus?.categories || [];

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<RecurringRule>(blank('expense', postes, cats));
  const [error, setError] = useState('');
  const isEdit = !!form.id;

  const openAdd = (kind: RecurringRule['kind']) => { setForm(blank(kind, postes, cats)); setError(''); setOpen(true); };
  const openEdit = (r: RecurringRule) => { setForm({ ...r }); setError(''); setOpen(true); };

  const setKind = (kind: RecurringRule['kind']) => {
    const b = blank(kind, postes, cats);
    setForm(f => ({ ...b, id: f.id, label: f.label, amount: f.amount, active: f.active, from: f.from, skipped: f.skipped }));
  };

  const submit = () => {
    const label = form.label.trim();
    if (!label) { setError(form.kind === 'expense' ? 'Donne un libellé à la dépense.' : 'Indique le client.'); return; }
    if (!(form.amount > 0)) { setError('Le montant doit être supérieur à zéro.'); return; }
    if (form.kind === 'expense' && !form.poste) { setError('Choisis le poste qui recevra la dépense.'); return; }
    const rule: RecurringRule = {
      ...form,
      id: form.id || `rec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      label,
      day: form.freq === 'monthly' ? Math.min(31, Math.max(1, Math.round(form.day || 1))) : undefined,
      weekday: form.freq === 'weekly' ? (form.weekday ?? 5) : undefined,
      poste: form.kind === 'expense' ? form.poste : undefined,
      cat: form.kind === 'revenue' ? form.cat || '' : undefined,
    };
    saveRule(rule);
    setOpen(false);
  };

  const remove = async (r: RecurringRule) => {
    if (!(await confirm(`Supprimer la récurrence « ${r.label} » ?\n\nCe qui a déjà été ajouté grâce à elle n'est pas touché.`, { danger: true }))) return;
    deleteRule(r.id);
  };

  const expenses = rules.filter(r => r.kind === 'expense');
  const revenues = rules.filter(r => r.kind === 'revenue');

  // ─── UI mobile (affichée dans un volet de Réglages) : mêmes règles, mêmes actions ───
  if (isMobile === true) {
    const group = (title: string, list: RecurringRule[], kind: RecurringRule['kind'], empty: string) => (
      <div className="mb-4">
        <MLabel right={<button type="button" onClick={() => openAdd(kind)} className="text-[13px] text-t-1 font-medium h-8 px-1">Ajouter</button>}>{title}</MLabel>
        <MCard surface="sheet">
          {list.length === 0 && <div className="px-4 py-5 text-center text-[13px] text-t-3">{empty}</div>}
          {list.map((r, k) => (
            <div key={r.id} className={r.active ? '' : 'opacity-60'}>
              {k > 0 && <MDivider />}
              <MRow
                title={r.label}
                badge={<>{!r.active && <MBadge>En pause</MBadge>}{r.kind === 'expense' && !postes.includes(r.poste || '') && <MBadge tone="warning">Poste introuvable</MBadge>}</>}
                sub={`${ruleSchedule(r)} · ${r.kind === 'expense' ? r.poste : r.cat || 'sans catégorie'}`}
                right={<span className={`mono-value ${r.kind === 'revenue' ? 'text-accent' : ''}`}>{f$(r.amount)} {r.currency}</span>}
                chevron
                onClick={() => openEdit(r)}
              />
            </div>
          ))}
        </MCard>
      </div>
    );
    return (
      <>
        <p className="text-[13px] text-t-3 px-4 pb-4 leading-relaxed">Ce qui revient à date fixe. Une dépense est proposée dans l’accueil dès qu’elle est échue ; les revenus du mois sont proposés dans Revenus, en prévision. Rien n’est ajouté sans ton accord.</p>
        {group('Dépenses', expenses, 'expense', 'Loyer, abonnements, forfait…')}
        {group('Revenus', revenues, 'revenue', 'Un client payé chaque semaine ou chaque mois')}

        <BottomSheet open={open} onClose={() => setOpen(false)} title={isEdit ? 'Modifier la récurrence' : 'Nouvelle récurrence'} fullHeight footer={<MButton onClick={submit}>{isEdit ? 'Enregistrer' : 'Créer'}</MButton>}>
          <MSeg className="w-full mb-2" value={form.kind} options={[['expense', 'Dépense'], ['revenue', 'Revenu']] as const} onChange={setKind} />
          <div className="flex flex-col items-center pt-2 pb-4">
            <MNum className="m-amount text-center px-6" value={form.amount} onChange={n => setForm({ ...form, amount: n })} ariaLabel="Montant" />
            <MSeg
              className="mt-2.5"
              value={form.currency}
              options={(form.kind === 'expense' ? ['AED', 'EUR'] : ['EUR', 'AED', 'USD']).map(c => [c, c] as const) as readonly (readonly [RecurringRule['currency'], string])[]}
              onChange={c => setForm({ ...form, currency: c })}
            />
          </div>
          <MCard surface="sheet" className="mb-3">
            <MField label={form.kind === 'expense' ? 'Libellé' : 'Client'}>
              <input className="m-input text-right" value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder={form.kind === 'expense' ? 'Loyer' : 'Nom du client'} />
            </MField>
            <MDivider />
            {form.kind === 'expense' ? (
              <MField label="Poste">
                <select className="m-input text-right" dir="rtl" value={form.poste || ''} onChange={e => setForm({ ...form, poste: e.target.value })}>
                  {!postes.includes(form.poste || '') && <option value={form.poste || ''}>{form.poste || 'Choisir'}</option>}
                  {postes.map(po => <option key={po} value={po}>{po}</option>)}
                </select>
              </MField>
            ) : (
              <MField label="Catégorie">
                <select className="m-input text-right" dir="rtl" value={form.cat || ''} onChange={e => setForm({ ...form, cat: e.target.value })}>
                  <option value="">Aucune</option>
                  {cats.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </MField>
            )}
          </MCard>
          <MSeg className="w-full mb-3" value={form.freq} options={[['monthly', 'Chaque mois'], ['weekly', 'Chaque semaine']] as const} onChange={f => setForm({ ...form, freq: f })} />
          <MCard surface="sheet">
            {form.freq === 'monthly' ? (
              <MField label="Jour du mois"><MNum className="text-right" value={form.day} onChange={n => setForm({ ...form, day: Math.round(n) || 1 })} placeholder="1" /></MField>
            ) : (
              <MField label="Jour">
                <select className="m-input text-right" dir="rtl" value={form.weekday ?? 5} onChange={e => setForm({ ...form, weekday: parseInt(e.target.value, 10) })}>
                  {[1, 2, 3, 4, 5, 6, 0].map(d => <option key={d} value={d}>{WEEKDAYS[d]}</option>)}
                </select>
              </MField>
            )}
            <MDivider />
            <MField label="À partir du"><input className="m-input text-right" type="date" value={form.from || ''} onChange={e => setForm({ ...form, from: e.target.value })} /></MField>
          </MCard>
          <p className="text-[12px] text-t-4 px-4 pt-2 leading-relaxed">
            Rien n’est proposé avant cette date : laisse aujourd’hui si ce qui précède est déjà saisi.
            {form.freq === 'monthly' && (form.day || 1) > 28 ? ' Un mois plus court utilise son dernier jour.' : ''}
          </p>
          {error && <p className="text-[13px] text-danger px-4 pt-2">{error}</p>}
          {isEdit && (
            <div className="pt-3">
              <MButton variant="ghost" onClick={() => { saveRule({ ...form, active: !form.active }); setOpen(false); }}>{form.active ? 'Mettre en pause' : 'Reprendre'}</MButton>
              <button type="button" onClick={() => { const r = form; setOpen(false); remove(r); }} className="w-full flex items-center justify-center gap-2 h-12 mt-1 text-[15px] font-medium text-danger active:opacity-60"><Trash2 size={16} />Supprimer</button>
            </div>
          )}
        </BottomSheet>
      </>
    );
  }

  const renderRow = (r: RecurringRule) => {
    const orphan = r.kind === 'expense' && !postes.includes(r.poste || '');
    return (
      <div key={r.id} className={`flex items-center gap-3 px-4 py-3 border-t border-border max-md:flex-wrap ${r.active ? '' : 'opacity-55'}`}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-t-1 tracking-tight">{r.label}</span>
            {!r.active && <span className="text-[9px] font-semibold tracking-[0.05em] px-1.5 py-[2px] rounded text-t-3 bg-bg-4">EN PAUSE</span>}
            {orphan && <span className="text-[9px] font-semibold tracking-[0.05em] px-1.5 py-[2px] rounded text-warning bg-warning/10">POSTE INTROUVABLE</span>}
          </div>
          <div className="text-[11px] text-t-3 mt-0.5">
            {ruleSchedule(r)} · {r.kind === 'expense' ? r.poste : r.cat || 'sans catégorie'}
            {r.from ? ` · depuis le ${frDate(r.from)}` : ''}
          </div>
        </div>
        <div className={`text-[13px] mono-value shrink-0 ${r.kind === 'revenue' ? 'text-accent' : 'text-t-1'}`}>{f$(r.amount)} {r.currency}</div>
        <div className="flex gap-1.5 shrink-0">
          <button onClick={() => saveRule({ ...r, active: !r.active })} className="text-[10px] text-t-2 bg-bg-2 border border-border px-2 py-1 rounded cursor-pointer hover:bg-bg-4 transition-all">
            {r.active ? 'Pause' : 'Reprendre'}
          </button>
          <button onClick={() => openEdit(r)} className="w-7 h-7 flex items-center justify-center text-info bg-info/10 border border-info/25 rounded cursor-pointer hover:bg-info/20 transition-all" title="Modifier" aria-label={`Modifier ${r.label}`}>
            <Pencil size={12} />
          </button>
          <button onClick={() => remove(r)} className="w-7 h-7 flex items-center justify-center text-danger bg-danger/10 border border-danger/25 rounded cursor-pointer hover:bg-danger/20 transition-all" title="Supprimer" aria-label={`Supprimer ${r.label}`}>
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    );
  };

  const renderGroup = (title: string, list: RecurringRule[], kind: RecurringRule['kind'], empty: string) => (
    <div>
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-border bg-bg-2/50">
        <span className="text-[10px] text-t-3 uppercase tracking-[0.12em] font-semibold">{title} ({list.length})</span>
        <button onClick={() => openAdd(kind)} className="text-[11px] text-accent font-semibold cursor-pointer hover:underline">+ Ajouter</button>
      </div>
      {list.length === 0
        ? <div className="px-4 py-3 border-t border-border text-[11px] text-t-4">{empty}</div>
        : list.map(renderRow)}
    </div>
  );

  return (
    <div className="bg-bg-3 border border-border rounded-lg overflow-hidden mb-5 shadow-inset-border">
      <div className="px-4 py-3.5">
        <div className="flex items-center gap-2">
          <Repeat size={14} className="text-info" />
          <span className="text-[13px] font-semibold text-t-2 tracking-tight">Récurrences</span>
        </div>
        <p className="text-[11px] text-t-3 mt-1.5 leading-relaxed">
          Ce qui revient à date fixe. Une dépense est proposée dans le tracker dès qu&apos;elle est échue ; les revenus du mois sont proposés
          dans Revenus, en prévision. Rien n&apos;est ajouté sans ton clic.
        </p>
      </div>
      {renderGroup('Dépenses', expenses, 'expense', 'Aucune dépense récurrente — loyer, abonnements, forfait…')}
      {renderGroup('Revenus', revenues, 'revenue', 'Aucun revenu récurrent — un client payé chaque semaine ou chaque mois')}

      <Modal open={open} onClose={() => setOpen(false)} title={isEdit ? 'Modifier la récurrence' : 'Nouvelle récurrence'}>
        <div className="space-y-3.5">
          <div className="flex bg-bg-2 border border-border rounded-md p-0.5 gap-0.5">
            {(['expense', 'revenue'] as const).map(k => (
              <button key={k} type="button" onClick={() => setKind(k)} className={`flex-1 py-1.5 text-xs font-semibold rounded transition-all cursor-pointer ${form.kind === k ? 'bg-bg-4 text-t-1 shadow-sm' : 'text-t-3'}`}>
                {k === 'expense' ? 'Dépense' : 'Revenu'}
              </button>
            ))}
          </div>
          <Field label={form.kind === 'expense' ? 'Libellé' : 'Client'}>
            <input className="fi" value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder={form.kind === 'expense' ? 'Ex : Loyer' : 'Ex : ZINRAI'} />
          </Field>
          <div className="grid grid-cols-[1fr_110px] gap-3">
            <Field label="Montant">
              <input className="fi" type="number" step="0.01" value={form.amount || ''} onChange={e => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })} />
            </Field>
            <Field label="Devise">
              <select className="fi" value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value as RecurringRule['currency'] })}>
                {(form.kind === 'expense' ? ['AED', 'EUR'] : ['EUR', 'AED', 'USD']).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </div>
          {form.kind === 'expense' ? (
            <Field label="Poste">
              <select className="fi" value={form.poste || ''} onChange={e => setForm({ ...form, poste: e.target.value })}>
                {!postes.includes(form.poste || '') && <option value={form.poste || ''}>{form.poste || '—'}</option>}
                {postes.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
          ) : (
            <Field label="Catégorie">
              <select className="fi" value={form.cat || ''} onChange={e => setForm({ ...form, cat: e.target.value })}>
                <option value="">—</option>
                {cats.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fréquence">
              <select className="fi" value={form.freq} onChange={e => setForm({ ...form, freq: e.target.value as RecurringRule['freq'] })}>
                <option value="monthly">Chaque mois</option>
                <option value="weekly">Chaque semaine</option>
              </select>
            </Field>
            {form.freq === 'monthly' ? (
              <Field label="Jour du mois">
                <input className="fi" type="number" min={1} max={31} value={form.day || ''} onChange={e => setForm({ ...form, day: parseInt(e.target.value, 10) || 1 })} />
              </Field>
            ) : (
              <Field label="Jour">
                <select className="fi" value={form.weekday ?? 5} onChange={e => setForm({ ...form, weekday: parseInt(e.target.value, 10) })}>
                  {[1, 2, 3, 4, 5, 6, 0].map(d => <option key={d} value={d}>{WEEKDAYS[d]}</option>)}
                </select>
              </Field>
            )}
          </div>
          <Field label="À partir du">
            <input className="fi" type="date" value={form.from || ''} onChange={e => setForm({ ...form, from: e.target.value })} />
          </Field>
          <p className="text-[11px] text-t-4 leading-relaxed -mt-1">
            Rien n&apos;est proposé avant cette date — laisse aujourd&apos;hui si ce qui précède est déjà saisi.
            {form.freq === 'monthly' && (form.day || 1) > 28 ? ' Un mois plus court utilise son dernier jour.' : ''}
          </p>
          {error && <div className="text-[12px] text-danger">{error}</div>}
          <div className="flex gap-2.5 mt-5">
            <button onClick={submit} className="btn btn-primary">{isEdit ? 'Enregistrer' : 'Créer'}</button>
            <button onClick={() => setOpen(false)} className="btn btn-ghost">Annuler</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
