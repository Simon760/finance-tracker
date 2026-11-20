'use client';

import { useEffect, useRef } from 'react';

/**
 * Pile des fenêtres ouvertes (volets, modales, dialogues) — une seule logique pour :
 *  - Échap : ferme celle du dessus uniquement ;
 *  - le bouton / geste « retour » du téléphone : ferme celle du dessus au lieu de
 *    quitter la page (UI mobile seulement) ;
 *  - le blocage du défilement de la page derrière.
 *
 * Retour : à l'ouverture on pose UNE entrée d'historique « garde » (même URL). Le retour
 * la consomme → on ferme. À la fermeture par l'interface on ne touche PAS à l'historique
 * (un history.back() ici peut courir contre un router.push lancé au même moment et
 * annuler la navigation) : la garde reste et sera réutilisée par la prochaine ouverture.
 */
interface Entry { close: () => void; escape: boolean }

const stack: Entry[] = [];
let attached = false;
let locks = 0;
let prevOverflow = '';

const mobileUi = () => document.documentElement.getAttribute('data-ui') === 'mobile';

function ensureGuard() {
  if (!mobileUi()) return;
  try {
    const st = window.history.state;
    if (st && st.__ov) return;
    window.history.pushState({ ...(st || {}), __ov: 1 }, '');
  } catch { /* historique indisponible : on perd seulement le « retour ferme » */ }
}

function attach() {
  if (attached) return;
  attached = true;
  window.addEventListener('popstate', () => {
    const top = stack[stack.length - 1];
    if (top) top.close();
  });
  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const top = stack[stack.length - 1];
    if (top && top.escape) top.close();
  });
}

/** Nombre de fenêtres ouvertes (tests / diagnostics). */
export const overlayDepth = () => stack.length;

export function useOverlay(open: boolean, onClose: () => void, opts: { escape?: boolean; lock?: boolean } = {}) {
  const { escape = true, lock = true } = opts;
  const ref = useRef(onClose);
  ref.current = onClose;

  useEffect(() => {
    if (!open) return;
    const entry: Entry = { close: () => ref.current(), escape };
    stack.push(entry);
    attach();
    ensureGuard();
    if (lock) {
      if (locks === 0) { prevOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
      locks++;
    }
    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      if (lock) {
        locks--;
        if (locks === 0) document.body.style.overflow = prevOverflow;
      }
      // Une fenêtre reste ouverte dessous : elle doit retrouver sa garde (consommée si
      // on vient de fermer par « retour »).
      if (stack.length > 0) ensureGuard();
    };
  }, [open, escape, lock]);
}

/**
 * Hauteur du clavier virtuel dans la variable CSS --kb (0px sans clavier). iOS ne
 * réduit pas la fenêtre quand le clavier s'ouvre : un volet ancré en bas passerait
 * dessous et son bouton de validation avec. À monter une fois (shell mobile).
 */
export function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const update = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root.style.setProperty('--kb', `${kb > 60 ? Math.round(kb) : 0}px`);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      root.style.removeProperty('--kb');
    };
  }, []);
}
