import { AppState, Month } from './types';
import { DEFAULT_POSTES } from './constants';

/**
 * Auto-heal : retire les extras (postes du mois) en DOUBLON et VIDES — lignes fantômes
 * laissées par d'anciennes corruptions / desyncs état↔space. Ne touche JAMAIS une ligne
 * qui a des transactions ou un montant. Rend le tableau d'origine si rien ne change.
 */
export function dedupEmptyExtras(months: Month[]): Month[] {
  let anyChanged = false;
  const out = months.map(mo => {
    const ea = mo.extraActual;
    if (!ea || ea.length < 2) return mo;
    const seen = new Set<string>();
    let moChanged = false;
    const cleaned = ea.filter(r => {
      const nm = (r.name || '').trim().toUpperCase();
      const empty = !(r.txns && r.txns.length) && !r.aed && !r.eur;
      if (seen.has(nm) && empty) { moChanged = true; return false; }
      seen.add(nm);
      return true;
    });
    if (moChanged) { anyChanged = true; return { ...mo, extraActual: cleaned }; }
    return mo;
  });
  return anyChanged ? out : months;
}

/**
 * Met un état LU (localStorage, Firebase, fichier importé) en forme utilisable : champs
 * manquants complétés par leurs défauts, extras fantômes retirés. Point d'entrée unique
 * des trois chemins de chargement — avant, chacun avait sa copie de ces défauts et
 * l'import n'en appliquait aucun. Modifie et retourne l'objet reçu.
 */
export function normalizeLoadedState(data: AppState): AppState {
  if (!data.postes) data.postes = JSON.parse(JSON.stringify(DEFAULT_POSTES));
  if (!data.months) data.months = [];
  if (!data.revenus) data.revenus = { objectif: 5000, categories: [], months: {} };
  if (!data.revenus.months) data.revenus.months = {};
  if (!data.emmenagement) data.emmenagement = [];
  data.months = dedupEmptyExtras(data.months);
  return data;
}

/**
 * Un objet JSON ressemble-t-il à une sauvegarde FinanceHQ ? Garde-fou de l'import : sans
 * lui, coller n'importe quel JSON valide (`{}`) remplaçait toutes les données par du vide.
 */
export function looksLikeBackup(data: unknown): data is AppState {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const d = data as Partial<AppState>;
  return Array.isArray(d.months) || (Array.isArray(d.spaces) && d.spaces.length > 0);
}
