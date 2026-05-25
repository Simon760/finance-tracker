import { Month, Transaction, Poste } from './types';

export type TxnWithCtx = Transaction & { posteName: string; posteIdx: number };

export interface MerchantGroup {
  /** Label affiché (le plus fréquent du groupe) */
  label: string;
  /** Somme en AED (devise locale) */
  totalAed: number;
  /** Somme en EUR */
  totalEur: number;
  /** Nombre de transactions */
  count: number;
  /** Liste des transactions du groupe */
  items: TxnWithCtx[];
  /** Variantes orthographiques agrégées */
  variants: string[];
}

export interface MonthStats {
  /** Total des dépenses (somme des txns individuelles uniquement, en AED) */
  totalTxnAed: number;
  totalTxnEur: number;
  /** Nombre de transactions */
  txnCount: number;
  /** Dépense moyenne par transaction (AED) */
  avgTxnAed: number;
  /** Plus grosse dépense */
  biggest: TxnWithCtx | null;
  /** Plus petite dépense (>0) */
  smallest: TxnWithCtx | null;
  /** Top marchands groupés (fuzzy) — déjà triés par totalAed desc */
  topMerchants: MerchantGroup[];
  /** Jour où on a le plus dépensé */
  biggestDay: { date: string; totalAed: number; count: number } | null;
  /** Poste qui a coûté le plus en transactions */
  topPoste: { name: string; totalAed: number; count: number } | null;
}

/** Normalise un libellé pour fuzzy matching : minuscules, sans accents, sans espaces ni ponctuation */
function normalize(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/** Distance de Levenshtein simple */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const v0 = new Array(b.length + 1).fill(0).map((_, i) => i);
  const v1 = new Array(b.length + 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j];
  }
  return v1[b.length];
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/** Seuil de similarité pour considérer 2 libellés comme le même marchand */
const SIM_THRESHOLD = 0.78;

export function groupByMerchant(txns: TxnWithCtx[]): MerchantGroup[] {
  const groups: (MerchantGroup & { _normKey: string })[] = [];
  for (const t of txns) {
    const raw = (t.label || '').trim();
    if (!raw || raw === '---') continue;
    const norm = normalize(raw);
    if (!norm) continue;

    // Cherche un groupe existant assez similaire
    let target = groups.find(g => g._normKey === norm); // match exact normalisé d'abord
    if (!target) {
      target = groups.find(g => similarity(g._normKey, norm) >= SIM_THRESHOLD);
    }

    const eur = t.eur || (t.rate ? t.amount / t.rate : 0);

    if (target) {
      target.totalAed += t.amount;
      target.totalEur += eur;
      target.count++;
      target.items.push(t);
      if (!target.variants.includes(raw)) target.variants.push(raw);
    } else {
      groups.push({
        _normKey: norm,
        label: raw,
        totalAed: t.amount,
        totalEur: eur,
        count: 1,
        items: [t],
        variants: [raw],
      });
    }
  }

  // Pour chaque groupe, le label affiché = celui le plus fréquent dans les items
  for (const g of groups) {
    const freq = new Map<string, number>();
    g.items.forEach(it => {
      const lbl = (it.label || '').trim();
      freq.set(lbl, (freq.get(lbl) || 0) + 1);
    });
    let best = g.label, bestCount = 0;
    freq.forEach((v, k) => { if (v > bestCount) { bestCount = v; best = k; } });
    g.label = best;
  }

  return groups
    .sort((a, b) => b.totalAed - a.totalAed)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .map(({ _normKey, ...rest }) => rest);
}

export function computeMonthStats(m: Month, postes: Poste[]): MonthStats {
  // Collecte les transactions individuelles avec leur contexte poste
  const all: TxnWithCtx[] = [];
  (m.actual || []).forEach((row, idx) => {
    (row.txns || []).forEach(t => {
      if (!t || (t.amount || 0) <= 0) return;
      all.push({ ...t, posteName: postes[idx]?.name || '—', posteIdx: idx });
    });
  });

  if (all.length === 0) {
    return {
      totalTxnAed: 0, totalTxnEur: 0, txnCount: 0, avgTxnAed: 0,
      biggest: null, smallest: null,
      topMerchants: [], biggestDay: null, topPoste: null,
    };
  }

  const totalTxnAed = all.reduce((s, t) => s + t.amount, 0);
  const totalTxnEur = all.reduce((s, t) => s + (t.eur || (t.rate ? t.amount / t.rate : 0)), 0);
  const txnCount = all.length;
  const avgTxnAed = totalTxnAed / txnCount;

  // Plus grosse / plus petite
  const sortedByAmount = [...all].sort((a, b) => b.amount - a.amount);
  const biggest = sortedByAmount[0];
  const smallest = sortedByAmount[sortedByAmount.length - 1];

  // Fuzzy groups
  const topMerchants = groupByMerchant(all);

  // Jour le plus dépensier
  const byDay = new Map<string, { totalAed: number; count: number }>();
  all.forEach(t => {
    const d = t.date || '—';
    const cur = byDay.get(d) || { totalAed: 0, count: 0 };
    cur.totalAed += t.amount;
    cur.count++;
    byDay.set(d, cur);
  });
  let biggestDay: MonthStats['biggestDay'] = null;
  byDay.forEach((v, k) => {
    if (!biggestDay || v.totalAed > biggestDay.totalAed) {
      biggestDay = { date: k, totalAed: v.totalAed, count: v.count };
    }
  });

  // Top poste (par txns uniquement)
  const byPoste = new Map<string, { totalAed: number; count: number }>();
  all.forEach(t => {
    const cur = byPoste.get(t.posteName) || { totalAed: 0, count: 0 };
    cur.totalAed += t.amount;
    cur.count++;
    byPoste.set(t.posteName, cur);
  });
  let topPoste: MonthStats['topPoste'] = null;
  byPoste.forEach((v, k) => {
    if (!topPoste || v.totalAed > topPoste.totalAed) {
      topPoste = { name: k, totalAed: v.totalAed, count: v.count };
    }
  });

  return {
    totalTxnAed, totalTxnEur, txnCount, avgTxnAed,
    biggest, smallest, topMerchants, biggestDay, topPoste,
  };
}
