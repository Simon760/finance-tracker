export interface Poste {
  name: string;
  cat: 'vital' | 'lifestyle' | 'finance' | 'logement';
  isAed: boolean;
}

export interface BudgetRow {
  aed: number;
  eur: number | null;
}

export interface ActualRow extends BudgetRow {
  txns?: Transaction[];
}

export interface Transaction {
  label: string;
  amount: number;
  currency: 'AED' | 'EUR';
  rate: number;
  eur?: number;
  date?: string;
  /** Si défini, cette tx fait partie d'un voyage. tripKind=swap : débite l'AED bank (normal).
   * tripKind=expense (défaut si tripId set) : NE débite PAS l'AED bank (le swap initial l'a déjà fait). */
  tripId?: string;
  tripKind?: 'swap' | 'expense';
}

export interface ExtraRow {
  name: string;
  cat: string;
  aed: number;
  eur: number;
  txns?: Transaction[];
}

export interface Month {
  id: string;
  rate: number;
  earn: number;
  soldeStart: number;
  soldeEnd: number;
  budget: BudgetRow[];
  actual: ActualRow[];
  extraBudget: ExtraRow[];
  extraActual: ExtraRow[];
  /** Noms de postes réguliers masqués pour ce mois uniquement (display + sums) */
  hiddenPostes?: string[];
  /** Ajustement manuel (AED signé) ajouté au prévisionnel — sert à régulariser les écarts compte réel vs calculé */
  adjustment?: number;
  _year?: number;
}

export interface RevenuEntry {
  date: string;
  client: string;
  cat: string;
  contracted: number;
  cashed: number;
  comment: string;
  rate: number;
  status: 'preview' | 'confirmed' | 'pending';
}

export interface RevenuState {
  objectif: number;
  objectifAnnuel?: number;
  categories: string[];
  months: Record<string, RevenuEntry[]>;
}

export interface EmmenagementItem {
  poste: string;
  aed: number;
  taux: number;
  eur: number;
  cat: string;
}

// Space = un chapitre de vie / pays
export interface Space {
  id: string;
  name: string;
  emoji: string;
  localCurrency: string;
  baseCurrency: string;
  status: 'active' | 'archived' | 'draft';
  dateFrom?: string;
  dateTo?: string | null;
  postes: Poste[];
  months: Month[];
  revenus: RevenuState;
  emmenagement: EmmenagementItem[];
}

// Historique des modifications — visible uniquement dans Settings
export interface HistoryEntry {
  ts: string;            // ISO timestamp
  spaceId?: string;      // space concerné si applicable
  spaceName?: string;    // libellé pour affichage
  action: string;        // ex: "revenu.add", "month.create", "poste.update"
  detail: string;        // résumé humain
}

// Résidence fiscale — suivi des jours par pays
export type ResidencyCountry = 'UAE' | 'FR' | 'OTHER';

export interface ResidencyEntry {
  id: string;
  start: string;          // YYYY-MM-DD inclus
  end: string | null;     // YYYY-MM-DD inclus, null = en cours jusqu'à aujourd'hui
  country: ResidencyCountry;
  countryName?: string;   // libre si country === 'OTHER' (ex: "Italie")
  note?: string;
}

export interface ResidencyState {
  entries: ResidencyEntry[];
}

// Ce qui est stocké en Firebase (backward compatible)
export interface Trip {
  id: string;
  name: string;
  country: string;        // ex "France", "Italie"
  currency: string;       // devise locale (ex "EUR")
  startDate: string;      // YYYY-MM-DD
  endDate: string | null; // null = ongoing
  /** Le swap initial qui débite l'AED bank */
  swap: {
    aedOut: number;       // montant AED swappé
    localIn: number;      // montant local reçu (ex 250 EUR)
    rate: number;         // dérivé : aedOut / localIn
    date: string;
    /** Index du poste dans state.postes où la swap-tx a été créée (typiquement 'VOYAGES') */
    posteIdx: number;
    /** Mois du tracker où la swap-tx a été ajoutée */
    monthId: string;
  };
  /** Status: ongoing si on est entre start et end, ended sinon */
  status: 'ongoing' | 'ended';
  createdAt: string;
}

export interface AppState {
  rate: number;
  postes: Poste[];
  months: Month[];
  revenus: RevenuState;
  emmenagement: EmmenagementItem[];
  lastUpdate?: string;
  // Multi-space: si undefined, on wrappe automatiquement dans spaces[0]
  spaces?: Space[];
  activeSpaceId?: string;
  // Historique de modifs — capé à N entrées
  history?: HistoryEntry[];
  // Résidence fiscale (global, hors spaces)
  residency?: ResidencyState;
  // Voyages (global, hors spaces) — modules optionnel
  trips?: Trip[];
}
