import { ActualRow, ExtraRow, Month, Transaction } from './types';

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Une transaction telle que la stocke le tracker (mêmes règles que sa saisie manuelle) :
 * `amount` TOUJOURS en devise locale (AED), converti au taux fourni — le taux du jour de
 * la saisie, pas celui du mois ; `eur` enregistré à côté ; `originalAmount` = le montant
 * saisi dans sa devise. Ne jamais reconvertir `amount` ensuite (double conversion).
 */
export function makeTxn(input: {
  label: string; amount: number; currency: 'AED' | 'EUR'; date: string; rate: number; recur?: string;
}): Transaction {
  const aed = input.currency === 'EUR' ? input.amount * input.rate : input.amount;
  const eur = input.currency === 'EUR' ? input.amount : (input.rate > 0 ? input.amount / input.rate : 0);
  const t: Transaction = {
    label: input.label.trim() || '---',
    amount: r2(aed),
    rate: input.rate,
    eur: r2(eur),
    date: input.date,
    currency: input.currency,
    originalAmount: r2(input.amount),
  };
  if (input.recur) t.recur = input.recur;
  return t;
}

/**
 * Remplace les transactions d'une ligne et recalcule ses totaux. Les DEUX devises sont
 * toujours écrites, y compris pour un poste EUR (sinon la colonne AED devait re-dériver
 * l'EUR au taux du mois et affichait 1 175 pour une tx saisie à 1 196 AED).
 */
export function withTxns<T extends { aed?: number; eur?: number | null; txns?: Transaction[] }>(
  row: T, txns: Transaction[], rate: number,
): T {
  return {
    ...row,
    txns,
    aed: r2(txns.reduce((s, t) => s + (t.amount || 0), 0)),
    eur: r2(txns.reduce((s, t) => s + (t.eur || (t.amount || 0) / (t.rate || rate || 1)), 0)),
  };
}

/**
 * Ajoute des transactions au poste régulier d'index `posteIdx` d'un mois. Les lignes
 * manquantes avant cet index sont créées vides (jamais de trou dans `actual`).
 */
export function addTxnsToPoste(m: Month, posteIdx: number, txns: Transaction[], rate: number): Month {
  if (posteIdx < 0 || txns.length === 0) return m;
  const actual: ActualRow[] = [...(m.actual || [])];
  for (let i = 0; i <= posteIdx; i++) if (!actual[i]) actual[i] = { aed: 0, eur: null };
  const row = actual[posteIdx];
  actual[posteIdx] = withTxns(row, [...(row.txns || []), ...txns], rate);
  return { ...m, actual };
}

/**
 * Ajoute des transactions à un poste PONCTUEL du mois (créé s'il n'existe pas ; la
 * comparaison de nom ignore casse et espaces, pour ne pas créer de doublon).
 */
export function addTxnsToExtra(m: Month, name: string, cat: string, txns: Transaction[], rate: number): Month {
  const key = name.trim().toUpperCase();
  if (!key || txns.length === 0) return m;
  const extraActual: ExtraRow[] = [...(m.extraActual || [])];
  const i = extraActual.findIndex(r => (r.name || '').trim().toUpperCase() === key);
  if (i >= 0) {
    extraActual[i] = withTxns(extraActual[i], [...(extraActual[i].txns || []), ...txns], rate) as ExtraRow;
  } else {
    extraActual.push(withTxns({ name: key, cat, aed: 0, eur: 0 }, txns, rate) as ExtraRow);
  }
  return { ...m, extraActual };
}
