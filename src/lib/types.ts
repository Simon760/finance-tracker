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

// Ce qui est stocké en Firebase (backward compatible)
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
}
