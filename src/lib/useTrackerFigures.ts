'use client';

import { useApp } from '@/context/AppProvider';
import { Month } from './types';
import {
  sumEurBudget, sumAedBudget, sumEur, sumAed, sumAedBank, isLegacyMonth, monthRevenus, monthRevenuConfirmedEur,
  monthRevenuConfirmedAed, revenuLive, pocketCashEur,
} from './utils';

/**
 * Les chiffres d'un mois du tracker (mêmes formules que le tracker desktop) : budget,
 * dépenses, revenus confirmés et en prévision, prévisionnel du compte.
 */
export function useTrackerFigures(m: Month | undefined) {
  const { state, liveRate, trips } = useApp();
  const extra = m?.extraActual || [];
  const bE = m ? sumEurBudget(m, state.postes, liveRate) : 0;
  const bA = m ? sumAedBudget(m, state.postes, liveRate) : 0;
  const aE = m ? sumEur(m, state.postes, extra) : 0;
  const aA = m ? sumAed(m, state.postes, extra) : 0;
  // Hors dépenses de voyage : le swap initial a déjà débité le compte
  const aABank = m ? sumAedBank(m, state.postes, extra) : 0;

  // Revenus : mois legacy → m.earn ; sinon entrées confirmées de la table Revenus
  const synced = m ? !isLegacyMonth(m) : false;
  const earnEur = m ? monthRevenuConfirmedEur(m, state.revenus?.months) : 0;
  const earnAed = m ? monthRevenuConfirmedAed(m, state.revenus?.months, state.rate) : 0;
  const diff = earnEur - aE;
  const adjustment = m?.adjustment || 0;
  const prevSansAjust = m ? (m.soldeStart || 0) + earnAed - aABank : 0;
  const prevCompte = prevSansAjust + adjustment;

  // Prévisions au taux du jour ; AED = celui de CHAQUE entrée (cf. revenuLive)
  const previews = m && synced
    ? monthRevenus(state.revenus?.months, m).filter(e => e.status === 'preview').map(e => revenuLive(e, liveRate))
    : [];
  const previewEur = previews.reduce((s, e) => s + (e.cashed || 0), 0);
  const previewAed = previews.reduce((s, e) => s + (e.cashed || 0) * (e.rate || liveRate), 0);

  return {
    bE, bA, aE, aA, aABank, synced, earnEur, earnAed, diff, adjustment, prevSansAjust, prevCompte,
    previewEur, previewAed, prevOpti: prevCompte + previewAed,
    pocketEur: pocketCashEur(trips, state.months),
  };
}
