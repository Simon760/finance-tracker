'use client';

import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Kit de l'UI mobile — les briques communes à tous les écrans téléphone, pour qu'ils
 * aient la même densité : un gros chiffre par écran, des listes fines dans des cartes
 * arrondies sans bordure, des pilules, des actions rondes.
 *
 * Tailles de référence : titre de ligne 15px, ligne secondaire 13px, ligne 56px mini,
 * pastille 36px, zone tactile 44px mini, champ de saisie 16px (en dessous iOS zoome).
 * `surface` : « page » = carte posée sur le fond de page, « sheet » = cellule dans un volet.
 */

type Surface = 'page' | 'sheet';
const surfaceBg = (s: Surface) => (s === 'sheet' ? 'bg-cell' : 'bg-bg-3');

/** Carte arrondie qui regroupe des lignes. */
export function MCard({ children, className = '', surface = 'page' }: { children: ReactNode; className?: string; surface?: Surface }) {
  return <div className={`${surfaceBg(surface)} rounded-[20px] overflow-hidden ${className}`}>{children}</div>;
}

/** Titre de section au-dessus d'une carte. */
export function MLabel({ children, right, className = '' }: { children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={`flex items-center justify-between gap-3 px-4 pt-1 pb-2 min-h-[32px] ${className}`}>
      <span className="text-[13px] font-medium text-t-3 tracking-tight">{children}</span>
      {right}
    </div>
  );
}

/** Pastille ronde (icône ou initiale) en tête de ligne. */
export function MIcon({ children, color, size = 36, className = '' }: { children: ReactNode; color?: string; size?: number; className?: string }) {
  return (
    <span
      className={`rounded-full bg-bg-4 flex items-center justify-center shrink-0 text-t-2 text-[13px] font-semibold ${className}`}
      style={{ width: size, height: size, color }}
    >
      {children}
    </span>
  );
}

/** Ligne de liste : pastille · titre + sous-titre · valeur + sous-valeur · chevron. */
export function MRow({ icon, title, sub, right, rightSub, onClick, chevron, tone, badge, className = '' }: {
  icon?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  rightSub?: ReactNode;
  onClick?: () => void;
  chevron?: boolean;
  /** Couleur du titre (classe texte), ex. « text-danger ». */
  tone?: string;
  badge?: ReactNode;
  className?: string;
}) {
  const body = (
    <>
      {icon}
      <span className="min-w-0 flex-1 text-left">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className={`text-[15px] font-medium tracking-tight truncate ${tone || 'text-t-1'}`}>{title}</span>
          {badge}
        </span>
        {sub != null && sub !== '' && <span className="m-sub block text-[13px] text-t-3 truncate leading-snug">{sub}</span>}
      </span>
      {(right != null || rightSub != null) && (
        <span className="text-right shrink-0 max-w-[55%]">
          {right != null && <span className="block text-[15px] text-t-1">{right}</span>}
          {rightSub != null && <span className="m-sub block text-[13px] text-t-3 leading-snug">{rightSub}</span>}
        </span>
      )}
      {chevron && <ChevronRight size={17} className="text-t-4 shrink-0 -mr-1" />}
    </>
  );
  const cls = `w-full flex items-center gap-3 px-4 py-2.5 min-h-[56px] ${className}`;
  return onClick
    ? <button type="button" onClick={onClick} className={`${cls} active:bg-t-1/5 transition-colors`}>{body}</button>
    : <div className={cls}>{body}</div>;
}

/** Petite étiquette (statut, devise…). */
export function MBadge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'info' | 'warning' | 'danger' | 'accent' }) {
  const c = {
    neutral: 'text-t-3 bg-bg-4',
    info: 'text-info bg-info/10',
    warning: 'text-warning bg-warning/10',
    danger: 'text-danger bg-danger/10',
    accent: 'text-accent bg-accent/10',
  }[tone];
  return <span className={`text-[11px] font-medium px-1.5 py-[1px] rounded-md shrink-0 ${c}`}>{children}</span>;
}

/** Pilule : filtre, choix, raccourci. */
export function MPill({ children, active, onClick, className = '', surface = 'page' }: {
  children: ReactNode; active?: boolean; onClick?: () => void; className?: string; surface?: Surface;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-full text-[13px] font-medium whitespace-nowrap shrink-0 transition-colors active:opacity-70 ${
        active ? 'bg-t-1 text-bg' : `${surface === 'sheet' ? 'bg-cell' : 'bg-bg-3'} text-t-2`
      } ${className}`}
    >
      {children}
    </button>
  );
}

/** Choix exclusif compact (AED | EUR, Ce mois | Permanent…). */
export function MSeg<T extends string>({ value, options, onChange, className = '', surface = 'sheet' }: {
  value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; className?: string; surface?: Surface;
}) {
  return (
    <div className={`inline-flex p-0.5 rounded-full ${surface === 'sheet' ? 'bg-cell' : 'bg-bg-3'} ${className}`}>
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`h-8 px-3.5 rounded-full text-[13px] font-medium transition-colors flex-1 whitespace-nowrap ${value === v ? 'bg-t-1 text-bg' : 'text-t-3'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Action ronde sous le gros chiffre (Dépense, Revenu, Régul…). */
export function MAction({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col items-center gap-1.5 min-w-[64px] active:opacity-60 transition-opacity">
      <span className="w-[46px] h-[46px] rounded-full bg-bg-3 flex items-center justify-center text-t-1">{icon}</span>
      <span className="text-[12px] text-t-2 font-medium tracking-tight">{label}</span>
    </button>
  );
}

/** Bouton pleine largeur. Un seul « primary » par écran. */
export function MButton({ children, onClick, variant = 'primary', disabled, className = '', type = 'button' }: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'ghost' | 'danger' | 'accent'; disabled?: boolean; className?: string; type?: 'button' | 'submit';
}) {
  const v = {
    primary: 'bg-t-1 text-bg',
    accent: 'bg-accent text-black',
    ghost: 'bg-cell text-t-1',
    danger: 'bg-danger/10 text-danger',
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`w-full h-12 rounded-full text-[15px] font-semibold tracking-tight flex items-center justify-center gap-2 transition-opacity active:opacity-70 disabled:opacity-30 ${v} ${className}`}
    >
      {children}
    </button>
  );
}

/** Cellule de formulaire : libellé à gauche, champ ou valeur à droite. */
export function MField({ label, children, hint, stacked }: { label: string; children: ReactNode; hint?: ReactNode; stacked?: boolean }) {
  return (
    <label className={`flex ${stacked ? 'flex-col items-stretch gap-1 py-2.5' : 'items-center gap-3 min-h-[52px] py-1.5'} px-4`}>
      <span className="text-[13px] text-t-3 shrink-0">{label}</span>
      <span className={`min-w-0 ${stacked ? '' : 'flex-1 flex justify-end text-right'}`}>{children}</span>
      {hint && <span className="text-[12px] text-t-4">{hint}</span>}
    </label>
  );
}

/** Séparateur fin entre deux cellules d'une même carte. */
export function MDivider() {
  return <div className="h-px bg-t-1/[0.06] ml-4" />;
}

/** État vide : une invitation, pas une excuse. */
export function MEmpty({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-10">
      {icon && <div className="w-14 h-14 rounded-full bg-bg-3 flex items-center justify-center text-t-3 mb-4">{icon}</div>}
      <div className="text-[16px] font-semibold text-t-1 tracking-tight">{title}</div>
      {text && <div className="text-[13px] text-t-3 mt-1.5 max-w-[280px] leading-relaxed">{text}</div>}
      {action && <div className="mt-5 w-full max-w-[260px]">{action}</div>}
    </div>
  );
}

/** Barre de progression fine (budget consommé). */
export function MBar({ pct, tone }: { pct: number; tone?: 'accent' | 'warning' | 'danger' }) {
  const c = tone === 'danger' ? 'bg-danger' : tone === 'warning' ? 'bg-warning' : 'bg-accent';
  return (
    <div className="h-[3px] bg-t-1/10 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${c}`} style={{ width: `${Math.max(0, Math.min(100, pct * 100))}%` }} />
    </div>
  );
}
