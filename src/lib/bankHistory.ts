import { AppState } from './types';
import { LEGACY_EARN_MONTHS } from './constants';

const MOIS_ORDER = ['JANVIER', 'FÉVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN', 'JUILLET', 'AOÛT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DÉCEMBRE'];

function monthStartDate(monthId: string, year?: number): Date {
  const idx = MOIS_ORDER.indexOf(monthId.toUpperCase());
  const y = year || new Date().getFullYear();
  if (idx < 0) return new Date(y, 0, 1);
  return new Date(y, idx, 1);
}

function dateFromString(s: string | undefined, fallback: Date): Date {
  if (!s) return fallback;
  const d = new Date(s);
  if (isNaN(d.getTime())) return fallback;
  return d;
}

export interface BankHistoryPoint {
  date: Date;
  balance: number;
  label: string;
}

export interface BankHistory {
  ath: BankHistoryPoint | null;
  atl: BankHistoryPoint | null;
  /** Solde moyen pondéré par le temps entre chaque event */
  avg: number;
  /** Solde courant (dernier point) */
  current: number;
  /** Nombre de points (events) */
  pointCount: number;
  /** Date du tout 1er point (ouverture) */
  startDate: Date | null;
}

/**
 * Calcule l'historique "en direct" du solde bancaire d'un space :
 * - démarre au soldeStart du 1er mois
 * - applique chaque revenue et chaque transaction de dépense à sa date
 * - tracke ATH/ATL avec leur date exacte et solde moyen pondéré dans le temps
 *
 * Tous les montants sont en devise locale (AED pour Dubai, etc.).
 */
export function computeBankHistory(state: AppState): BankHistory {
  // Trie les mois dans l'ordre chronologique
  const months = [...(state.months || [])].sort((a, b) => {
    const ai = MOIS_ORDER.indexOf((a.id || '').toUpperCase());
    const bi = MOIS_ORDER.indexOf((b.id || '').toUpperCase());
    const ay = a._year || 0;
    const by = b._year || 0;
    if (ay !== by) return ay - by;
    return ai - bi;
  });

  if (months.length === 0) {
    return { ath: null, atl: null, avg: 0, current: 0, pointCount: 0, startDate: null };
  }

  // Construit la liste d'events triés par date
  type Event = { date: Date; delta: number; label: string };
  const events: Event[] = [];
  let initialBalance = 0;
  let initialDate: Date | null = null;

  months.forEach(m => {
    const mStart = monthStartDate(m.id, m._year);
    if (!initialDate) {
      initialBalance = m.soldeStart || 0;
      initialDate = mStart;
    }

    // Revenues confirmés du mois (depuis state.revenus)
    const revs = state.revenus?.months?.[m.id] || [];
    const isLegacyMonth = LEGACY_EARN_MONTHS.includes(m.id);
    if (!isLegacyMonth) {
      revs
        .filter(r => !r.status || r.status === 'confirmed')
        .forEach(r => {
          const dt = dateFromString(r.date, mStart);
          const local = (r.cashed || 0) * (r.rate || m.rate || 1);
          if (local > 0) events.push({ date: dt, delta: local, label: `Revenu ${r.client || '—'}` });
        });
    } else if (m.earn && m.earn > 0) {
      // Mois legacy : on prend m.earn comme bloc en début de mois
      events.push({ date: mStart, delta: m.earn * (m.rate || 1), label: 'Revenus du mois' });
    }

    // Transactions de dépense
    (m.actual || []).forEach((row, idx) => {
      const posteName = state.postes?.[idx]?.name || '—';
      (row.txns || []).forEach(t => {
        if (!t || (t.amount || 0) <= 0) return;
        const dt = dateFromString(t.date, mStart);
        events.push({ date: dt, delta: -t.amount, label: `${posteName}${t.label && t.label !== '---' ? ' · ' + t.label : ''}` });
      });
    });
  });

  // Si aucun event, on retourne juste le solde initial
  if (events.length === 0) {
    return {
      ath: initialDate ? { date: initialDate, balance: initialBalance, label: 'Ouverture' } : null,
      atl: initialDate ? { date: initialDate, balance: initialBalance, label: 'Ouverture' } : null,
      avg: initialBalance,
      current: initialBalance,
      pointCount: 1,
      startDate: initialDate,
    };
  }

  events.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Walk forward, track ATH/ATL et somme pondérée pour la moyenne
  let balance = initialBalance;
  let ath: BankHistoryPoint = { date: initialDate!, balance, label: 'Ouverture' };
  let atl: BankHistoryPoint = { date: initialDate!, balance, label: 'Ouverture' };

  let weightedSum = 0;
  let weightedDays = 0;
  let lastDate = initialDate!;

  events.forEach(ev => {
    // Pondération : combien de jours le solde précédent a tenu avant cet event
    const dayDiff = Math.max(0, (ev.date.getTime() - lastDate.getTime()) / 86400000);
    weightedSum += balance * dayDiff;
    weightedDays += dayDiff;

    balance += ev.delta;

    if (balance > ath.balance) ath = { date: ev.date, balance, label: ev.label };
    if (balance < atl.balance) atl = { date: ev.date, balance, label: ev.label };

    lastDate = ev.date;
  });

  // Ajoute la période entre le dernier event et aujourd'hui pour la moyenne
  const now = new Date();
  if (now > lastDate) {
    const dayDiff = (now.getTime() - lastDate.getTime()) / 86400000;
    weightedSum += balance * dayDiff;
    weightedDays += dayDiff;
  }

  const avg = weightedDays > 0 ? weightedSum / weightedDays : balance;

  return {
    ath, atl, avg,
    current: balance,
    pointCount: events.length + 1,
    startDate: initialDate,
  };
}
