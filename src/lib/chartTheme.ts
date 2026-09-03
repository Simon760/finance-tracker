import { Theme } from './types';

/**
 * Couleurs de « chrome » des graphes Recharts (grille, graduations, tooltip).
 *
 * Pourquoi pas des tokens CSS comme le reste de l'UI : Recharts pose `fill` et
 * `stroke` en ATTRIBUTS SVG, et un attribut n'accepte pas `var(--x)`. Il faut
 * donc des couleurs déjà résolues, d'où ce petit dictionnaire côté JS.
 *
 * Les palettes de séries (PIE_COLORS, REV_COLORS, CAT_COLORS) ne bougent pas :
 * elles portent du sens (une catégorie = une couleur) et restent lisibles sur
 * les deux fonds.
 */
export function chartTheme(theme: Theme) {
  return theme === 'light'
    ? { grid: '#e4e4e8', tick: '#8f8f98', tooltipBg: '#ffffff', tooltipBorder: '#d0d2da', text: '#18181b' }
    : { grid: '#1e1e2a', tick: '#52525b', tooltipBg: '#1c1c23', tooltipBorder: '#2a2a3a', text: '#fafafa' };
}

/** Prêt à passer à `<Tooltip contentStyle={…} />`. */
export function chartTooltipStyle(theme: Theme) {
  const c = chartTheme(theme);
  return { background: c.tooltipBg, border: `1px solid ${c.tooltipBorder}`, borderRadius: 8, color: c.text };
}
