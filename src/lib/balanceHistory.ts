import { Month, Poste, RevenuEntry } from './types';
import { monthPeriod, isLegacyMonth, monthRevenus, isRevConfirmed } from './revenus';
import { startedMonths, rowAedSpent, localISODate } from './utils';

/** Solde du compte en FIN de journée (devise locale). */
export interface BalancePoint { date: string; balance: number }

export interface BalanceHistory {
  points: BalancePoint[];
  /** Premier jour couvert (YYYY-MM-DD), null si aucune donnée exploitable. */
  from: string | null;
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const clamp = (date: string | undefined, min: string, max: string) => {
  if (!date || date.length < 10) return min; // non datée → début du mois
  return date < min ? min : date > max ? max : date;
};

/**
 * Solde du compte JOUR PAR JOUR, reconstruit à partir de ce qui est saisi.
 *
 * Chaque mois repart de son `soldeStart` (le solde réel saisi par l'utilisateur ; à
 * défaut, la fin calculée du mois précédent), puis chaque mouvement est appliqué à SA
 * date : revenus confirmés (AED réellement crédité), dépenses qui débitent le compte
 * (les dépenses de voyage en sont exclues — le swap a déjà débité), montants saisis sans
 * transaction (au 1er du mois, faute de date). Même périmètre que le « Prévisionnel
 * compte » du tracker, donc le dernier point d'un mois = son solde calculé (à une
 * exception près : un revenu sans taux enregistré, cf. plus bas).
 *
 * Régul : avec un journal (`month.reguls`), l'ajustement s'applique à la date de chaque
 * régul ; sans journal, l'ajustement du mois est appliqué dès le 1er (sa date est
 * inconnue — montants faibles au regard du solde).
 *
 * Limites assumées : les mois « legacy » (avant mars 2026) n'ont pas de revenus datés
 * et sont exclus ; une date hors de son mois est ramenée dans le mois ; rien n'est tracé
 * après aujourd'hui.
 */
export function dailyBalance(
  months: Month[],
  postes: Poste[],
  revenusMonths: Record<string, RevenuEntry[]> | undefined,
  fallbackRate: number,
  now: Date = new Date(),
): BalanceHistory {
  const today = localISODate(now);
  const points: BalancePoint[] = [];
  let carry: number | null = null; // fin calculée du mois précédent

  startedMonths(months || [], now).forEach(m => {
    const p = monthPeriod(m);
    if (!p || isLegacyMonth(m)) return;
    const start = (m.soldeStart || 0) > 0 ? m.soldeStart : carry;
    if (start === null) return; // aucun point de départ connu : on attend un mois qui en a un

    const first = iso(p.year, p.idx, 1);
    const lastOfMonth = iso(p.year, p.idx, new Date(p.year, p.idx + 1, 0).getDate());
    const last = lastOfMonth > today ? today : lastOfMonth;
    if (first > last) return;

    const deltas = new Map<string, number>();
    const add = (date: string | undefined, delta: number) => {
      if (!delta) return;
      if (date && date > today) return; // pas encore arrivé
      const d = clamp(date, first, last);
      deltas.set(d, (deltas.get(d) || 0) + delta);
    };

    // Revenus confirmés, à leur date. Entrée sans taux enregistré (2 vieilles entrées de
    // mars 2026) : taux DU MOIS, pas le taux du jour comme dans le tracker — sinon le
    // passé de la courbe (et son plus bas) bougerait chaque fois que l'EUR/AED varie.
    monthRevenus(revenusMonths, m).filter(isRevConfirmed).forEach(e => {
      add(e.date, (e.cashed || 0) * (e.rate || m.rate || fallbackRate));
    });

    // Dépenses : postes réguliers non masqués + postes ponctuels
    const hidden = m.hiddenPostes || [];
    const rows = [
      ...postes.map((po, i) => (hidden.includes(po.name) ? null : { row: m.actual?.[i], isAed: po.isAed as boolean | undefined })),
      ...(m.extraActual || []).map(r => ({ row: r, isAed: undefined as boolean | undefined })),
    ];
    rows.forEach(x => {
      if (!x || !x.row) return;
      const txns = x.row.txns || [];
      if (txns.length > 0) {
        txns.forEach(t => { if (t.tripKind !== 'expense') add(t.date, -(t.amount || 0)); });
      } else {
        add(undefined, -rowAedSpent(x.row, m.rate, { isAed: x.isAed, excludeTripExpense: true }));
      }
    });

    // Régul : par étapes si le journal existe, sinon constant sur le mois
    const journal = [...(m.reguls || [])].sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));
    let applied = 0;
    journal.forEach(r => {
      const d = new Date(r.ts);
      add(isNaN(d.getTime()) ? undefined : localISODate(d), r.adjustment - applied);
      applied = r.adjustment;
    });
    const final = m.adjustment || 0;
    if (Math.abs(final - applied) > 0.005) {
      const lastRegul = journal.length ? new Date(journal[journal.length - 1].ts) : null;
      add(lastRegul && !isNaN(lastRegul.getTime()) ? localISODate(lastRegul) : undefined, final - applied);
    }

    // Une valeur par jour, du 1er au dernier jour (ou à aujourd'hui)
    let bal = start;
    const day = new Date(p.year, p.idx, 1);
    for (;;) {
      const key = localISODate(day);
      if (key > last) break;
      bal += deltas.get(key) || 0;
      points.push({ date: key, balance: Math.round(bal * 100) / 100 });
      day.setDate(day.getDate() + 1);
    }
    carry = bal;
  });

  return { points, from: points.length ? points[0].date : null };
}

/** Plus haut, plus bas et moyenne d'une série (le plus ANCIEN jour en cas d'égalité). */
export function balanceExtremes(points: BalancePoint[]): { high: BalancePoint | null; low: BalancePoint | null; avg: number } {
  if (points.length === 0) return { high: null, low: null, avg: 0 };
  let high = points[0];
  let low = points[0];
  let sum = 0;
  points.forEach(p => {
    if (p.balance > high.balance) high = p;
    if (p.balance < low.balance) low = p;
    sum += p.balance;
  });
  return { high, low, avg: sum / points.length };
}

/** Solde en fin de journée à une date donnée ; null si la date est hors de la série. */
export function balanceAt(points: BalancePoint[], date: string): number | null {
  if (points.length === 0 || !date || date < points[0].date || date > points[points.length - 1].date) return null;
  // Série continue du premier au dernier jour, sauf trou entre deux mois non contigus
  let found: number | null = null;
  for (const p of points) {
    if (p.date > date) break;
    found = p.balance;
  }
  return found;
}
