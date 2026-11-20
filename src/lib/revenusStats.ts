import { MOIS_LIST } from './constants';
import { RevenuEntry } from './types';

export interface RevClientStat {
  client: string;
  total: number;
  contracted: number;
  count: number;
  monthsActive: number;
  avgPerActiveMonth: number;
  pctOfYear: number;
  lastDate: string;
  lastMonth: string;
  topCat: string;
}

/**
 * Statistiques ANNUELLES des revenus pour l'année affichée — partagées par la vue
 * « Année » desktop et mobile. `viewMonths` = la table de l'année par nom de mois, déjà
 * au taux du jour pour les entrées non confirmées (cf. useRevenus) ; `isFuture(nom)` dit
 * si le mois n'a pas encore commencé ; `obj` = objectif mensuel ; `todayKey` = aujourd'hui.
 */
export function revAnnualStats(
  viewMonths: Record<string, RevenuEntry[]>,
  isFuture: (month: string) => boolean,
  obj: number,
  todayKey: string,
) {
  // Stats arrêtées à la DATE DU JOUR : dans les mois commencés, une entrée datée après
  // aujourd'hui ne compte pas encore. Les mois à venir gardent leurs entrées (listés
  // estompés, déjà exclus des totaux via `future` ci-dessous).
  const rm: Record<string, RevenuEntry[]> = {};
  Object.entries(viewMonths).forEach(([k, es]) => {
    rm[k] = isFuture(k) ? es : es.filter(e => !e.date || e.date <= todayKey);
  });
  const yearObj = obj * 12;
  let yearContracted = 0, yearCashed = 0;
  let prevCashed: number | null = null;

  // Un mois pas encore commencé (revenus saisis en prévision pour le mois suivant) est
  // exclu de TOUTES les stats annuelles : si on est en septembre, tout se calcule de
  // janvier à septembre inclus. Il reste listé dans le tableau, estompé, hors total.
  const monthData = (MOIS_LIST as readonly string[]).map(m => {
    const me = rm[m] || [];
    const future = isFuture(m);
    const mc = me.reduce((s, e) => s + (e.contracted || 0), 0);
    const mk = me.filter(e => !e.status || e.status === 'confirmed').reduce((s, e) => s + (e.cashed || 0), 0);
    if (!future) {
      yearContracted += mc;
      yearCashed += mk;
    }
    const md = mk - obj;
    const mp = obj > 0 ? (mk / obj * 100) : 0;
    const vsM1 = !future && prevCashed !== null ? (mk - prevCashed) : null;
    const hasData = me.length > 0;
    if (hasData && !future) prevCashed = mk;
    return { name: m, contracted: mc, cashed: mk, delta: md, pct: mp, vsM1, hasData, future };
  });
  const futureWithData = monthData.filter(m => m.future && m.hasData).map(m => m.name);

  const yearPct = yearObj > 0 ? (yearCashed / yearObj * 100) : 0;
  const activeMonths = monthData.filter(m => m.hasData && !m.future).length;
  const avg = activeMonths > 0 ? yearCashed / activeMonths : 0;
  const yearPL = yearCashed - yearObj;

  // Source summary (mois à venir exclus)
  const srcTotals: Record<string, number> = {};
  Object.entries(rm).forEach(([monthName, entries]) => {
    if (isFuture(monthName)) return;
    (entries || []).forEach(e => {
      if (!e.status || e.status === 'confirmed') {
        srcTotals[e.cat || 'Autre'] = (srcTotals[e.cat || 'Autre'] || 0) + (e.cashed || 0);
      }
    });
  });
  const srcEntries = Object.entries(srcTotals).sort((a, b) => b[1] - a[1]);

  // Bar chart data — les mois à venir gardent leur barre, estompée (prévision)
  const evoData = (MOIS_LIST as readonly string[]).map(m => {
    const entries = rm[m] || [];
    return {
      name: m.slice(0, 3),
      Encaissé: entries.filter(e => !e.status || e.status === 'confirmed').reduce((s, e) => s + (e.cashed || 0), 0),
      Contracté: entries.reduce((s, e) => s + (e.contracted || 0), 0),
      future: isFuture(m),
    };
  });

  // Quarterly (mois à venir exclus : un trimestre entamé ne compte que ses mois commencés)
  const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
  const qData = quarters.map((q, qi) => {
    const ms = (MOIS_LIST as readonly string[]).slice(qi * 3, qi * 3 + 3).filter(m => !isFuture(m));
    const total = ms.reduce((s, m) => s + (rm[m] || []).filter(e => !e.status || e.status === 'confirmed').reduce((s2, e) => s2 + (e.cashed || 0), 0), 0);
    return { name: q, Encaissé: total };
  });
  const qObj = obj * 3;

  // ─── Vue par client ── agrégat sur tous les mois (confirmés uniquement)
  const clientMap = new Map<string, {
    total: number; contracted: number; count: number;
    months: Set<string>; lastDate: string; lastMonth: string;
    catCounts: Record<string, number>;
  }>();
  Object.entries(rm).forEach(([monthName, entries]) => {
    if (isFuture(monthName)) return;
    (entries || []).forEach(e => {
      const isConfirmed = !e.status || e.status === 'confirmed';
      if (!isConfirmed) return;
      const key = (e.client || '').trim() || 'Sans nom';
      let cur = clientMap.get(key);
      if (!cur) {
        cur = { total: 0, contracted: 0, count: 0, months: new Set(), lastDate: '', lastMonth: '', catCounts: {} };
        clientMap.set(key, cur);
      }
      cur.total += e.cashed || 0;
      cur.contracted += e.contracted || 0;
      cur.count += 1;
      cur.months.add(monthName);
      if (e.date && e.date > cur.lastDate) {
        cur.lastDate = e.date;
        cur.lastMonth = monthName;
      } else if (!cur.lastDate) {
        cur.lastMonth = monthName;
      }
      const cat = e.cat || 'Autre';
      cur.catCounts[cat] = (cur.catCounts[cat] || 0) + (e.cashed || 0);
    });
  });
  const clientStats: RevClientStat[] = Array.from(clientMap.entries()).map(([client, c]) => {
    const topCat = Object.entries(c.catCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    return {
      client,
      total: c.total,
      contracted: c.contracted,
      count: c.count,
      monthsActive: c.months.size,
      avgPerActiveMonth: c.months.size > 0 ? c.total / c.months.size : 0,
      pctOfYear: yearCashed > 0 ? (c.total / yearCashed) * 100 : 0,
      lastDate: c.lastDate,
      lastMonth: c.lastMonth,
      topCat,
    };
  }).sort((a, b) => b.total - a.total);
  const topClient = clientStats[0];

  return {
    yearObj, yearContracted, yearCashed, monthData, futureWithData, yearPct, activeMonths, avg, yearPL,
    srcEntries, evoData, qData, qObj, clientStats, topClient,
  };
}
