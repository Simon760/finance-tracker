import { AppState, RevenuEntry } from './types';
import { MOIS_LIST } from './constants';
import { revKeyPeriod } from './revenus';

/** Un résultat de la recherche globale : une dépense ou un revenu. */
export interface SearchHit {
  kind: 'expense' | 'revenue';
  /** YYYY-MM-DD, ou '' si la ligne n'est pas datée (montant saisi sans transaction). */
  date: string;
  /** Libellé de la transaction, ou client du revenu. */
  label: string;
  /** Poste (dépense) ou catégorie (revenu). */
  context: string;
  /** Mois affiché : id du mois tracker (dépense) ou « OCTOBRE 2026 » (revenu). */
  monthLabel: string;
  /** Montant en devise locale et en devise base. */
  aed: number;
  eur: number;
  status?: RevenuEntry['status'];
  /** Dépense de voyage (payée depuis une pocket, pas depuis le compte). */
  trip?: boolean;
  /** Où ouvrir ce résultat. */
  target: { page: 'tracker'; monthId: string } | { page: 'revenus'; year: number; month: string };
}

export interface SearchResult {
  hits: SearchHit[];
  /** Nombre total de résultats (les `hits` peuvent être tronqués à `limit`). */
  total: number;
  expenses: { count: number; aed: number; eur: number };
  revenues: { count: number; aed: number; eur: number };
}

const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g');
const norm = (v: string) => (v || '').toLowerCase().normalize('NFD').replace(DIACRITICS, '');

/** Un mot de la recherche vu comme un montant (« 1196 », « 45,5 ») ; null si ce n'en est pas un. */
function asAmount(token: string): number | null {
  if (!/^\d+([.,]\d{1,2})?$/.test(token)) return null;
  return parseFloat(token.replace(',', '.'));
}

/** « 1196 » trouve 1 196,00 et 1 196,40 ; « 45,5 » ne trouve que 45,50. */
function amountMatches(token: string, wanted: number, amounts: number[]): boolean {
  const exact = /[.,]/.test(token);
  return amounts.some(a => {
    if (!(a > 0)) return false;
    return exact ? Math.abs(a - wanted) < 0.005 : Math.floor(a) === wanted || Math.round(a) === wanted;
  });
}

/**
 * Recherche dans TOUTES les dépenses (transactions des postes réguliers et ponctuels, et
 * montants saisis sans transaction) et tous les revenus, tous mois confondus.
 *
 * Chaque mot doit être trouvé (ET) : dans le texte de la ligne — libellé, poste ou
 * catégorie, mois, date, statut — sans tenir compte des accents ni de la casse, ou, si
 * c'est un nombre, dans son montant (devise locale, EUR ou devise d'origine).
 * Résultats du plus récent au plus ancien ; les totaux portent sur TOUS les résultats,
 * même quand la liste est tronquée.
 */
export function searchAll(
  state: Pick<AppState, 'months' | 'postes' | 'revenus'>,
  query: string,
  limit = 150,
): SearchResult {
  const tokens = norm(query).split(/\s+/).filter(Boolean);
  const empty: SearchResult = { hits: [], total: 0, expenses: { count: 0, aed: 0, eur: 0 }, revenues: { count: 0, aed: 0, eur: 0 } };
  if (tokens.length === 0) return empty;

  const all: { hit: SearchHit; text: string; amounts: number[] }[] = [];
  const push = (hit: SearchHit, extraText: string, amounts: number[]) => {
    all.push({ hit, text: norm(`${hit.label} ${hit.context} ${hit.monthLabel} ${hit.date} ${extraText}`), amounts });
  };

  (state.months || []).forEach(m => {
    const target = { page: 'tracker' as const, monthId: m.id };
    const rows = [
      ...(state.postes || []).map((p, i) => ({ name: p.name, row: m.actual?.[i], extra: false })),
      ...(m.extraActual || []).map(r => ({ name: r.name, row: r, extra: true })),
    ];
    rows.forEach(({ name, row, extra }) => {
      if (!row) return;
      const txns = row.txns || [];
      if (txns.length > 0) {
        txns.forEach(t => {
          const eur = t.eur || (t.rate ? t.amount / t.rate : 0);
          const orig = t.originalAmount || 0;
          const kind = t.tripKind === 'swap' ? 'swap voyage' : t.tripId ? 'voyage' : '';
          push(
            { kind: 'expense', date: t.date || '', label: t.label && t.label !== '---' ? t.label : '', context: name, monthLabel: m.id, aed: t.amount || 0, eur, trip: !!t.tripId, target },
            `${extra ? 'ponctuel' : ''} ${kind}`, [t.amount || 0, eur, orig],
          );
        });
      } else if ((row.aed || 0) > 0 || (row.eur || 0) > 0) {
        // Montant saisi directement dans la ligne, sans transaction
        const eur = (row.eur || 0) > 0 ? (row.eur as number) : (m.rate > 0 ? (row.aed || 0) / m.rate : 0);
        const aed = (row.aed || 0) > 0 ? (row.aed as number) : eur * m.rate;
        push({ kind: 'expense', date: '', label: '', context: name, monthLabel: m.id, aed, eur, target }, extra ? 'ponctuel' : '', [aed, eur]);
      }
    });
  });

  Object.entries(state.revenus?.months || {}).forEach(([key, entries]) => {
    const p = revKeyPeriod(key);
    const monthLabel = p ? `${MOIS_LIST[p.idx]} ${p.year}` : key;
    (entries || []).forEach(e => {
      const aed = (e.cashed || 0) * (e.rate || 0);
      const status = e.status || 'confirmed';
      const statusText = status === 'confirmed' ? 'confirme' : status === 'preview' ? 'prevision' : 'en attente';
      push(
        {
          kind: 'revenue', date: e.date || '', label: e.client || '', context: e.cat || '', monthLabel,
          aed, eur: e.cashed || 0, status,
          target: p ? { page: 'revenus', year: p.year, month: MOIS_LIST[p.idx] } : { page: 'revenus', year: new Date().getFullYear(), month: key },
        },
        `revenu ${statusText} ${e.comment || ''} ${e.currency || ''}`, [e.cashed || 0, aed, e.origAmount || 0, e.contracted || 0],
      );
    });
  });

  const matched = all.filter(({ text, amounts }) =>
    tokens.every(tok => {
      if (text.includes(tok)) return true;
      const n = asAmount(tok);
      return n !== null && amountMatches(tok, n, amounts);
    }),
  );
  matched.sort((a, b) => (b.hit.date || '').localeCompare(a.hit.date || ''));

  const res: SearchResult = { ...empty, expenses: { ...empty.expenses }, revenues: { ...empty.revenues }, total: matched.length };
  matched.forEach(({ hit }) => {
    const bucket = hit.kind === 'expense' ? res.expenses : res.revenues;
    bucket.count++;
    bucket.aed += hit.aed;
    bucket.eur += hit.eur;
  });
  res.hits = matched.slice(0, limit).map(x => x.hit);
  return res;
}
