import { MOIS_LIST, monthIndexOf } from './constants';
import { localISODate } from './utils';
import { Month } from './types';

const cap = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

/**
 * Nom lisible d'un mois du tracker : « Novembre 2026 » (l'id est « NOVEMBRE 26 » ou
 * « NOVEMBRE » + `_year` calculé). Un mois au nom libre garde son id tel quel.
 */
export function monthLabel(m: Pick<Month, 'id' | '_year'>): string {
  const i = monthIndexOf(m.id);
  if (i < 0) return m.id;
  return m._year ? `${cap(MOIS_LIST[i])} ${m._year}` : cap(MOIS_LIST[i]);
}

/** Nom du mois seul, en minuscules : « novembre ». */
export function monthWord(m: Pick<Month, 'id'>): string {
  const i = monthIndexOf(m.id);
  return i < 0 ? m.id : MOIS_LIST[i].toLowerCase();
}

/**
 * Date d'une opération pour un titre de groupe : « Aujourd'hui », « Hier », « 18 novembre »
 * (l'année n'apparaît que si ce n'est pas celle en cours). Date vide ou illisible → « Sans date ».
 */
export function dayLabel(iso: string | undefined, today: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return 'Sans date';
  const day = iso.slice(0, 10);
  if (day === today) return 'Aujourd’hui';
  const t = new Date(`${today}T12:00:00`);
  t.setDate(t.getDate() - 1);
  if (day === localISODate(t)) return 'Hier';
  const [y, mo, d] = day.split('-').map(Number);
  const name = MOIS_LIST[mo - 1]?.toLowerCase() || '';
  const base = `${d === 1 ? '1er' : d} ${name}`;
  return y === Number(today.slice(0, 4)) ? base : `${base} ${y}`;
}

/** Date courte d'une ligne : « 18/11 » (avec l'année sur 2 chiffres si ce n'est pas la bonne). */
export function shortDay(iso: string | undefined, today: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '—';
  const base = `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  return iso.slice(0, 4) === today.slice(0, 4) ? base : `${base}/${iso.slice(2, 4)}`;
}
