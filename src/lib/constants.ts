import { Poste } from './types';

export const DEFAULT_POSTES: Poste[] = [
  { name: 'WIFI', cat: 'vital', isAed: true },
  { name: 'FORFAIT MOBILE', cat: 'vital', isAed: true },
  { name: 'COIFFEUR', cat: 'vital', isAed: true },
  { name: 'REPASSAGE', cat: 'vital', isAed: true },
  { name: 'COURSES', cat: 'vital', isAed: true },
  { name: 'MÉNAGE', cat: 'vital', isAed: true },
  { name: 'TAXI', cat: 'vital', isAed: true },
  { name: 'DEWA', cat: 'logement', isAed: true },
  { name: 'CLIMATISATION', cat: 'logement', isAed: true },
  { name: 'LOYER', cat: 'logement', isAed: true },
  { name: 'CHARGES SG', cat: 'finance', isAed: false },
  { name: 'CHARGES REVO', cat: 'finance', isAed: false },
  { name: 'ACTIVITÉS', cat: 'lifestyle', isAed: true },
  { name: 'RESTAURANTS', cat: 'lifestyle', isAed: true },
];

export const MOIS_LIST = [
  'JANVIER', 'FÉVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN',
  'JUILLET', 'AOÛT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DÉCEMBRE',
] as const;

export const PIE_COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#f43f5e', '#0ea5e9',
];

export const REV_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899',
  '#06b6d4', '#f97316', '#ef4444', '#84cc16', '#6366f1',
];

export const CAT_COLORS: Record<string, string> = {
  vital: '#10b981',
  lifestyle: '#ec4899',
  finance: '#f59e0b',
  logement: '#3b82f6',
};

export const CAT_LABELS: Record<string, string> = {
  vital: 'Vital',
  lifestyle: 'Lifestyle',
  finance: 'Finance',
  logement: 'Logement',
};

export const LEGACY_EARN_MONTHS = ['OCTOBRE', 'NOVEMBRE', 'DECEMBRE', 'JANVIER', 'FEVRIER'];

/**
 * Un mois « legacy » lit son revenu dans Month.earn, PAS dans la table Revenus.
 * Comparaison insensible aux accents : la table peut contenir « FÉVRIER » alors que
 * la constante est « FEVRIER » — sans ça le mois était compté deux fois.
 */
export function isLegacyEarnMonth(id: string): boolean {
  const strip = (v: string) => v.trim().toUpperCase().normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '');
  const n = strip(id || '');
  return LEGACY_EARN_MONTHS.some(m => strip(m) === n);
}
