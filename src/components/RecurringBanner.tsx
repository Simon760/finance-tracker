'use client';

import { Repeat } from 'lucide-react';

/**
 * Bandeau « récurrences à ajouter » — n'apparaît QUE s'il y a quelque chose à faire, et
 * disparaît dès que c'est ajouté ou ignoré (jamais un bandeau permanent). Composant de
 * rendu partagé par le tracker et la page Revenus, desktop comme mobile.
 */
export default function RecurringBanner({ title, items, addLabel, onAdd, onSkip }: {
  title: string;
  /** Une puce par occurrence : libellé + détail (date, montant). */
  items: { key: string; label: string; detail: string }[];
  addLabel: string;
  onAdd: () => void;
  onSkip: () => void;
}) {
  if (items.length === 0) return null;
  const shown = items.slice(0, 4);
  return (
    <div className="bg-info/5 border border-info/25 rounded-lg px-3.5 py-3 mb-4 flex items-center gap-3 flex-wrap mob:border-0 mob:bg-info/10 mob:rounded-[20px] mob:px-4 mob:py-3.5">
      <Repeat size={15} className="text-info shrink-0" />
      <div className="min-w-0 flex-1 basis-[220px]">
        <div className="text-[12px] mob:text-[14px] font-semibold text-t-1 tracking-tight">{title}</div>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {shown.map(it => (
            <span key={it.key} className="text-[10px] mob:text-[12px] bg-bg-3 border border-border mob:border-0 rounded mob:rounded-md px-1.5 py-[2px] text-t-2 whitespace-nowrap">
              {it.label} <span className="mono-value text-t-3">{it.detail}</span>
            </span>
          ))}
          {items.length > shown.length && <span className="text-[10px] mob:text-[12px] text-t-4 py-[2px]">+ {items.length - shown.length}</span>}
        </div>
      </div>
      <div className="flex gap-2 shrink-0 max-md:w-full">
        <button onClick={onAdd} className="btn btn-primary max-md:flex-1">{addLabel}</button>
        <button onClick={onSkip} className="btn btn-ghost" title="Ne plus proposer ces occurrences (la règle reste active)">Ignorer</button>
      </div>
    </div>
  );
}
