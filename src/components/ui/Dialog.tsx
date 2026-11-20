'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';

/**
 * Boîtes de dialogue de l'app — remplacent `confirm()` / `alert()` / `prompt()` du
 * navigateur (fenêtres grises hors thème, bloquantes, parfois désactivables par
 * l'utilisateur, et affichées deux fois en dev quand elles étaient appelées depuis un
 * setState). API à base de promesses, pour que les appels restent d'une ligne :
 *
 *   const { confirm, alert, prompt } = useDialog();
 *   if (!(await confirm('Supprimer ce séjour ?', { danger: true }))) return;
 *
 * Une seule fenêtre à la fois ; les demandes suivantes sont mises en file.
 */
export interface DialogOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Action destructrice : bouton principal rouge. */
  danger?: boolean;
  /** `prompt` uniquement. */
  placeholder?: string;
  defaultValue?: string;
}

export interface DialogApi {
  confirm: (message: string, opts?: DialogOptions) => Promise<boolean>;
  alert: (message: string, opts?: DialogOptions) => Promise<void>;
  prompt: (message: string, opts?: DialogOptions) => Promise<string | null>;
}

type Pending =
  | { kind: 'confirm'; message: string; opts: DialogOptions; resolve: (v: boolean) => void }
  | { kind: 'alert'; message: string; opts: DialogOptions; resolve: () => void }
  | { kind: 'prompt'; message: string; opts: DialogOptions; resolve: (v: string | null) => void };

// Hors provider (tests, écran d'erreur global) : repli sur les dialogues natifs.
const nativeApi: DialogApi = {
  confirm: async message => (typeof window !== 'undefined' ? window.confirm(message) : false),
  alert: async message => { if (typeof window !== 'undefined') window.alert(message); },
  prompt: async (message, opts) => (typeof window !== 'undefined' ? window.prompt(message, opts?.defaultValue ?? '') : null),
};

const DialogContext = createContext<DialogApi>(nativeApi);

export function useDialog(): DialogApi {
  return useContext(DialogContext);
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Pending[]>([]);
  const [value, setValue] = useState('');
  const current = queue[0];
  const primaryRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const push = useCallback((p: Pending) => setQueue(q => [...q, p]), []);
  // API stable (useRef) : les composants peuvent la mettre en dépendance sans re-rendus.
  const api = useRef<DialogApi>({
    confirm: (message, opts = {}) => new Promise<boolean>(resolve => push({ kind: 'confirm', message, opts, resolve })),
    alert: (message, opts = {}) => new Promise<void>(resolve => push({ kind: 'alert', message, opts, resolve })),
    prompt: (message, opts = {}) => new Promise<string | null>(resolve => push({ kind: 'prompt', message, opts, resolve })),
  }).current;

  const close = (accepted: boolean) => {
    if (!current) return;
    setQueue(q => (q[0] === current ? q.slice(1) : q));
    if (current.kind === 'confirm') current.resolve(accepted);
    else if (current.kind === 'alert') current.resolve();
    else current.resolve(accepted ? value : null);
  };
  // Toujours la dernière version (valeur saisie comprise) pour l'écouteur clavier
  const closeRef = useRef(close);
  closeRef.current = close;

  // À l'ouverture : valeur par défaut du prompt et focus sur l'action principale
  useEffect(() => {
    if (!current) return;
    setValue(current.kind === 'prompt' ? (current.opts.defaultValue ?? '') : '');
    const t = setTimeout(() => (current.kind === 'prompt' ? inputRef.current : primaryRef.current)?.focus(), 0);
    return () => clearTimeout(t);
  }, [current]);

  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(false); }
      else if (e.key === 'Enter' && current.kind === 'prompt') { e.preventDefault(); closeRef.current(true); }
    };
    // Capture : passe avant le Escape des Modal / SlideOver ouverts en dessous
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [current]);

  const o = current?.opts || {};
  const isAlert = current?.kind === 'alert';
  const title = o.title ?? (current?.kind === 'confirm' ? 'Confirmer' : current?.kind === 'prompt' ? 'Saisie' : 'Information');
  const primaryCls = o.danger ? 'btn-danger' : 'btn-primary';

  return (
    <DialogContext.Provider value={api}>
      {children}
      {current && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-md z-[400] flex items-center justify-center animate-fade-in p-4"
          onClick={() => close(false)}
          role="presentation"
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label={title}
            className="bg-bg-3 border border-border-2 rounded-lg p-6 max-md:p-5 w-[420px] max-w-full max-h-[88vh] overflow-y-auto shadow-xl animate-fade-up"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-[15px] font-bold mb-3 tracking-tight text-t-1">{title}</h3>
            <p className="text-[13px] text-t-2 leading-relaxed whitespace-pre-line break-words">{current.message}</p>
            {current.kind === 'prompt' && (
              <input
                ref={inputRef}
                className="fi mt-4"
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder={o.placeholder}
              />
            )}
            <div className="flex gap-2.5 mt-6 justify-end max-md:flex-col-reverse">
              {!isAlert && (
                <button onClick={() => close(false)} className="btn btn-ghost">
                  {o.cancelLabel ?? 'Annuler'}
                </button>
              )}
              <button
                ref={primaryRef}
                onClick={() => close(true)}
                className={`btn ${primaryCls}`}
              >
                {o.confirmLabel ?? (isAlert ? 'OK' : o.danger ? 'Supprimer' : 'Confirmer')}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}
