/** Thème de l'interface. Persisté sous la clé THEME_KEY, appliqué en data-theme sur <html>. */
export type Theme = 'dark' | 'light';

export interface Poste {
  name: string;
  cat: 'vital' | 'lifestyle' | 'finance' | 'logement';
  isAed: boolean;
  /** Charge fixe (loyer, abos...) payée quoi qu'il arrive → exclue du Bilan vs prévisionnel.
   * Si undefined, un défaut par nom s'applique (cf. isPosteFixed). */
  fixed?: boolean;
  /** Étiquette de regroupement pour les stats (Dashboard) UNIQUEMENT — n'affecte jamais
   * le tracker, le budget/réel, ni l'historique. Plusieurs postes (variantes de nom, ou
   * un ancien poste désactivé + son remplaçant) peuvent partager le même groupe pour être
   * additionnés en une seule barre. Si vide/absent, le poste est groupé sous son propre
   * nom (comportement identique à avant ce champ). Cf. dashboard/page.tsx. */
  group?: string;
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
  /** Générée par une récurrence : clé d'occurrence `idRègle@YYYY-MM-DD` (cf. lib/recurring). */
  recur?: string;
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
  /** Journal des régularisations de ce mois (solde réel constaté à une date). Conservé
   * DANS le mois : l'historique global est capé à 200 entrées, les régul d'avant juin
   * 2026 y avaient déjà disparu. Ajout uniquement, cf. lib/regul. */
  reguls?: RegulEntry[];
  /** Année calendaire — champ CALCULÉ (detectYears), jamais saisi. */
  _year?: number;
}

/** Une régularisation : le solde réel du compte constaté à un instant donné. */
export interface RegulEntry {
  /** Horodatage ISO de la régul */
  ts: string;
  /** Solde réel saisi (devise locale) */
  real: number;
  /** Ajustement du mois APRÈS cette régul (= real − prévisionnel hors ajustement) */
  adjustment: number;
}

export interface RevenuEntry {
  date: string;
  client: string;
  cat: string;
  /** Toujours en EUR (converti à la saisie si devise ≠ EUR) */
  contracted: number;
  /** Toujours en EUR (converti à la saisie si devise ≠ EUR) */
  cashed: number;
  comment: string;
  /** Taux EUR→AED à la saisie — sert à calculer l'AED ajouté au compte (earnAed) */
  rate: number;
  status: 'preview' | 'confirmed' | 'pending';
  /** Devise dans laquelle le revenu a été reçu. Absent = EUR (entrées historiques). */
  currency?: 'EUR' | 'AED' | 'USD';
  /** Montant encaissé dans la devise d'origine (affiché en petit dans le tableau). */
  origAmount?: number;
  /** Montant contracté dans la devise d'origine (pour ré-éditer sans dérive). */
  origContracted?: number;
  /** Taux devise/EUR utilisé à la saisie (ex: 1.0842 USD par EUR) — l'édition réutilise
   * ce taux pour que sauvegarder sans rien changer ne modifie pas les montants EUR. */
  origRate?: number;
  /** USD uniquement : taux USD→AED effectif du swap (défaut 3.6725, modifiable).
   * C'est LUI qui détermine l'AED crédité au compte (rate est dérivé de lui). */
  origToAed?: number;
  /** Générée par une récurrence : clé d'occurrence `idRègle@YYYY-MM-DD` (cf. lib/recurring). */
  recur?: string;
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
  /** Regroupement pour les stats des postes PONCTUELS (extras, ajoutés pour un seul
   * mois dans les Dépenses Réelles) — clé = nom brut de l'extra (ex: "AUTRE"), valeur
   * = groupe affiché dans le Dashboard (ex: pour fusionner avec "AUTRES"). Équivalent
   * de Poste.group mais pour les extras, qui n'ont pas d'objet partagé où stocker ça
   * directement — cf. dashboard/page.tsx et settings/page.tsx. */
  extraGroups?: Record<string, string>;
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
  /** Ajustement manuel du solde de la pocket (devise locale, signé). Réconcilie le
   * Restant calculé (budget − dépensé) avec le cash réel. Analogue à Month.adjustment. */
  adjustment?: number;
  createdAt: string;
}

/**
 * Récurrence : une dépense (loyer, abonnement) ou un revenu (client régulier) qui revient
 * à date fixe. La règle ne crée rien toute seule : elle PROPOSE ses occurrences, ajoutées
 * en un clic (cf. lib/recurring et <RecurringBanner>).
 */
export interface RecurringRule {
  id: string;
  /** Espace concerné (les règles sont stockées globalement, comme les voyages). */
  spaceId?: string;
  kind: 'expense' | 'revenue';
  /** Libellé de la transaction (dépense) ou nom du client (revenu). */
  label: string;
  /** Montant dans `currency`. */
  amount: number;
  currency: 'AED' | 'EUR' | 'USD';
  /** Dépense : nom du poste régulier qui reçoit la transaction. */
  poste?: string;
  /** Revenu : catégorie. */
  cat?: string;
  freq: 'monthly' | 'weekly';
  /** Mensuelle : jour du mois (1–31 ; ramené au dernier jour d'un mois plus court). */
  day?: number;
  /** Hebdomadaire : jour de la semaine (0 = dimanche … 6 = samedi). */
  weekday?: number;
  active: boolean;
  /** Première date d'effet (YYYY-MM-DD) : aucune occurrence proposée avant. */
  from?: string;
  /** Occurrences écartées à la main (clés `idRègle@YYYY-MM-DD`). */
  skipped?: string[];
}

/** Une ligne de budget mensuel d'une simulation (montant en devise locale). */
export interface SimLine { name: string; amount: number }

/** Une dépense (ou rentrée, montant négatif) ponctuelle d'une simulation. */
export interface SimExtra { label: string; amount: number; /** 0 = premier mois simulé */ month: number }

/**
 * Simulation de trésorerie : un scénario sur N mois, stocké À PART des mois du tracker
 * (donc sans aucun effet sur les stats) — remplace les faux mois créés à l'avance.
 */
export interface Simulation {
  id: string;
  spaceId?: string;
  name: string;
  createdAt: string;
  /** Premier mois simulé (YYYY-MM). */
  start: string;
  /** Horizon en mois (1–12). */
  months: number;
  /** Solde de départ (devise locale). */
  startBalance: number;
  /** Revenu mensuel attendu (devise base, EUR). */
  revenueEur: number;
  /** Taux base→locale utilisé pour convertir le revenu. */
  rate: number;
  lines: SimLine[];
  extras: SimExtra[];
}

export interface AppState {
  rate: number;
  postes: Poste[];
  months: Month[];
  revenus: RevenuState;
  emmenagement: EmmenagementItem[];
  /** Regroupement pour les stats des extras — cf. commentaire sur Space.extraGroups. */
  extraGroups?: Record<string, string>;
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
  // Récurrences et simulations (global, hors spaces — chaque élément porte son spaceId)
  recurring?: RecurringRule[];
  simulations?: Simulation[];
}
