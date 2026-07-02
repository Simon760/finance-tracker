'use client';

import { createContext, useContext, useState, useCallback, useRef, useMemo, useEffect, ReactNode } from 'react';
import { AppState, Month, Space, Poste, HistoryEntry, ResidencyEntry, Trip, Transaction } from '@/lib/types';
import { DEFAULT_POSTES, MOIS_LIST } from '@/lib/constants';
import { fbGet, fbSet } from '@/lib/firebase';
import { fetchRate } from '@/lib/utils';

/**
 * Normalise un nom de mois : majuscules, sans accents, sans espaces.
 * Couvre les cas "Juin", "juin ", "JUIN", "JUİN" (etc.)
 */
// Regex pour retirer les marques combinantes (accents) — construite via RegExp pour éviter
// d'avoir des caractères diacritiques en littéral dans le source (qui faisaient tousser le bundler)
const DIACRITICS_RE = new RegExp('[\\u0300-\\u036f]', 'g');
function normalizeMonthName(s: string): string {
  return s
    .normalize('NFD')
    .replace(DIACRITICS_RE, '')
    .toUpperCase()
    .replace(/\s+/g, '');
}

/**
 * Choisit le meilleur mois à afficher à l'ouverture de l'app :
 * - Si un mois correspond au calendrier réel (mois + année actuels), on le retourne
 * - Sinon, on cherche le mois courant par nom seul (peu importe _year, qui n'est assigné que lors d'une visite tracker)
 * - Sinon, on cherche le mois courant en partant de la fin (le plus récent du même nom)
 * - Sinon, fallback : dernier mois enregistré
 *
 * Matching tolérant : casse + accents + espaces normalisés.
 */
function pickInitialMonth(months: Month[]): string | null {
  if (months.length === 0) return null;
  const now = new Date();
  const currentRaw = MOIS_LIST[now.getMonth()];
  const currentNorm = normalizeMonthName(currentRaw); // ex: "JUIN"
  const currentYear = now.getFullYear();

  // Tier 1: match nom normalisé + année
  for (const m of months) {
    if (normalizeMonthName(m.id) === currentNorm && m._year === currentYear) return m.id;
  }
  // Tier 2: match nom normalisé seul (peu importe l'année), en parcourant à l'envers (plus récent gagne)
  for (let i = months.length - 1; i >= 0; i--) {
    if (normalizeMonthName(months[i].id) === currentNorm) return months[i].id;
  }
  // Tier 3: fallback dernier mois enregistré
  return months[months.length - 1].id;
}

interface AppContextType {
  // Raw state (what goes to Firebase)
  state: AppState;
  setState: (s: AppState) => void;
  save: () => void;

  // Spaces
  spaces: Space[];
  activeSpace: Space;
  activeSpaceId: string;
  setActiveSpaceId: (id: string) => void;
  createSpace: (s: Omit<Space, 'postes' | 'months' | 'revenus' | 'emmenagement'>) => void;
  updateSpace: (id: string, updates: Partial<Space>) => void;
  deleteSpace: (id: string) => void;

  // Auth
  userId: string | null;
  setUserId: (id: string | null) => void;
  isLoggedIn: boolean;
  login: (id: string, pin: string) => Promise<boolean>;
  logout: () => void;

  // Rate
  liveRate: number;
  refreshRate: () => Promise<void>;
  setRateManually: (rate: number) => void;
  rateRefreshing: boolean;
  /** Timestamp ms du dernier fetch réussi du taux (null si pas encore fetch dans cette session) */
  lastRateFetch: number | null;

  // UI
  syncStatus: 'ok' | 'saving' | 'off';
  hiddenMode: boolean;
  toggleHidden: () => void;
  curMonth: string | null;
  setCurMonth: (id: string) => void;
  curYear: string;
  setCurYear: (y: string) => void;
  dashCur: 'EUR' | 'AED';
  setDashCur: (c: 'EUR' | 'AED') => void;
  updateMonth: (id: string, field: keyof Month, val: number) => void;

  // Historique
  history: HistoryEntry[];
  logChange: (action: string, detail: string) => void;
  clearHistory: () => void;

  // Résidence fiscale
  residencyEntries: ResidencyEntry[];
  addResidencyEntry: (e: Omit<ResidencyEntry, 'id'>) => void;
  updateResidencyEntry: (id: string, updates: Partial<ResidencyEntry>) => void;
  deleteResidencyEntry: (id: string) => void;

  // Voyages
  trips: Trip[];
  /** Crée un voyage + ajoute la swap-tx dans le tracker (poste VOYAGES auto-créé si manquant) */
  createTrip: (params: {
    name: string; country: string; currency: string;
    startDate: string; endDate: string | null;
    aedOut: number; localIn: number;
    monthId: string; // mois cible pour la swap-tx
  }) => string; // returns trip id
  updateTrip: (id: string, updates: Partial<Trip>) => void;
  deleteTrip: (id: string) => void;
  /** Ajoute une dépense voyage (tx tripId+tripKind=expense). Cible un poste régulier
   * (posteIdx) OU un extra du mois (extraName si fourni). */
  addTripExpense: (params: {
    tripId: string;
    posteIdx: number;
    monthId: string;
    label: string;
    eur: number;
    date: string;
    extraName?: string;
  }) => void;
  deleteTripExpense: (tripId: string, monthId: string, posteIdx: number, txIdx: number, extraName?: string) => void;
  /** Modifie une dépense voyage déjà enregistrée : la retire de son emplacement d'origine
   * (orig) et la ré-ajoute à la nouvelle cible avec les valeurs mises à jour. */
  updateTripExpense: (params: {
    tripId: string;
    orig: { monthId: string; posteIdx: number; txIdx: number; extraName?: string };
    monthId: string;
    posteIdx: number;
    label: string;
    eur: number;
    date: string;
    extraName?: string;
  }) => void;
  /** Recharge le compte EUR d'un voyage (nouveau swap AED→EUR dans la même pocket) */
  addTripSwap: (params: { tripId: string; monthId: string; aedOut: number; localIn: number; date: string }) => void;
}

const HISTORY_CAP = 200;

const DEFAULT_SPACE: Space = {
  id: 'dubai',
  name: 'Dubai',
  emoji: '🇦🇪',
  localCurrency: 'AED',
  baseCurrency: 'EUR',
  status: 'active',
  dateFrom: '2024-10',
  dateTo: null,
  postes: JSON.parse(JSON.stringify(DEFAULT_POSTES)),
  months: [],
  revenus: { objectif: 5000, categories: ['ITC VIP', 'EDUCATEUR', 'CONCIERGERIE', 'MOON BUNDLE', 'AUTRE'], months: {} },
  emmenagement: [],
};

const defaultState: AppState = {
  rate: 4.3284,
  postes: JSON.parse(JSON.stringify(DEFAULT_POSTES)),
  months: [],
  revenus: { objectif: 5000, categories: ['ITC VIP', 'EDUCATEUR', 'CONCIERGERIE', 'MOON BUNDLE', 'AUTRE'], months: {} },
  emmenagement: [],
};

// Convert flat state to spaces array (backward compat)
function stateToSpaces(s: AppState): Space[] {
  if (s.spaces && s.spaces.length > 0) {
    // BUG FIX : le top-level state (postes/months/revenus/emmenagement) est la source de vérité
    // après chaque setState (createMonth, etc.). Mais spaces[activeId] peut être stale (les
    // setState dans tracker/MobileTracker ne syncent pas back vers spaces[]).
    // Donc on patche ici en mirrorant le top-level dans le space actif.
    if (s.activeSpaceId) {
      return s.spaces.map(sp =>
        sp.id === s.activeSpaceId
          ? { ...sp, postes: s.postes, months: s.months, revenus: s.revenus, emmenagement: s.emmenagement }
          : sp
      );
    }
    return s.spaces;
  }
  // Wrap existing data as spaces[0]
  return [{
    id: 'dubai',
    name: 'Dubai',
    emoji: '🇦🇪',
    localCurrency: 'AED',
    baseCurrency: 'EUR',
    status: 'active',
    dateFrom: '2024-10',
    dateTo: null,
    postes: s.postes || JSON.parse(JSON.stringify(DEFAULT_POSTES)),
    months: s.months || [],
    revenus: s.revenus || { objectif: 5000, categories: [], months: {} },
    emmenagement: s.emmenagement || [],
  }];
}

// Convert spaces back to flat state for Firebase (backward compat)
function spacesToState(spaces: Space[], activeId: string, rate: number, lastUpdate?: string): AppState {
  const active = spaces.find(s => s.id === activeId) || spaces[0];
  return {
    rate,
    postes: active.postes,
    months: active.months,
    revenus: active.revenus,
    emmenagement: active.emmenagement,
    lastUpdate,
    spaces,
    activeSpaceId: activeId,
  };
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setStateRaw] = useState<AppState>(defaultState);
  const [userId, setUserId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'ok' | 'saving' | 'off'>('off');
  const [hiddenMode, setHiddenMode] = useState(false);
  const [curMonth, setCurMonth] = useState<string | null>(null);
  const [curYear, setCurYear] = useState<string>('all');
  const [dashCur, setDashCur] = useState<'EUR' | 'AED'>('EUR');
  const [liveRate, setLiveRate] = useState(4.3284);
  const [rateRefreshing, setRateRefreshing] = useState(false);
  const [lastRateFetch, setLastRateFetch] = useState<number | null>(null);
  const [activeSpaceId, setActiveSpaceIdRaw] = useState<string>('dubai');
  const saveTimer = useRef<NodeJS.Timeout | null>(null);

  const spaces = useMemo(() => stateToSpaces(state), [state]);
  const activeSpace = useMemo(() => spaces.find(s => s.id === activeSpaceId) || spaces[0], [spaces, activeSpaceId]);

  // Auto-restore from localStorage on mount
  useEffect(() => {
    const uid = localStorage.getItem('fdxb_uid');
    const savedState = localStorage.getItem('fdxb_state');
    if (uid && savedState) {
      try {
        const data: AppState = JSON.parse(savedState);
        if (!data.postes) data.postes = JSON.parse(JSON.stringify(DEFAULT_POSTES));
        if (!data.months) data.months = [];
        if (!data.revenus) data.revenus = { objectif: 5000, categories: [], months: {} };
        if (!data.emmenagement) data.emmenagement = [];
        setStateRaw(data);
        setLiveRate(data.rate);
        setUserId(uid);
        setSyncStatus('ok');
        const sp = stateToSpaces(data);
        const activeId = data.activeSpaceId || sp[0].id;
        setActiveSpaceIdRaw(activeId);
        const active = sp.find(s => s.id === activeId) || sp[0];
        if (active.months.length > 0) {
          const picked = pickInitialMonth(active.months);
          const now = new Date();
          console.log('[fdxb] pickInitialMonth →', picked, {
            today: now.toISOString().split('T')[0],
            calendar: MOIS_LIST[now.getMonth()] + ' ' + now.getFullYear(),
            available: active.months.map(m => `${m.id}${m._year ? '/' + m._year : ''}`).join(', '),
          });
          setCurMonth(picked);
        }
        // Auto-fetch rate en arrière-plan
        fetchRate().then(r => {
          if (r > 0) {
            console.log('[fdxb] auto-fetched rate:', r);
            setLiveRate(r);
            setLastRateFetch(Date.now());
            setStateRaw(prev => ({ ...prev, rate: r }));
          }
        }).catch(() => {});
      } catch {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setState = useCallback((s: AppState) => {
    setStateRaw(s);
    setLiveRate(s.rate);
  }, []);

  const persistToFirebase = useCallback((s: AppState, uid: string) => {
    setSyncStatus('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fbSet(`users/${uid}/state`, s)
        .then(() => setSyncStatus('ok'))
        .catch(() => setSyncStatus('off'));
    }, 600);
  }, []);

  const save = useCallback(() => {
    setStateRaw(prev => {
      // Sync spaces[activeId] avec top-level avant persistance (sinon les modifs en top-level
      // ne sont jamais mirrorées vers spaces[], et au reload stateToSpaces voit du stale).
      let synced = prev;
      if (prev.spaces && prev.spaces.length > 0 && prev.activeSpaceId) {
        synced = {
          ...prev,
          spaces: prev.spaces.map(sp =>
            sp.id === prev.activeSpaceId
              ? { ...sp, postes: prev.postes, months: prev.months, revenus: prev.revenus, emmenagement: prev.emmenagement }
              : sp
          ),
        };
      }
      const updated = { ...synced, lastUpdate: new Date().toISOString() };
      localStorage.setItem('fdxb_state', JSON.stringify(updated));
      if (userId) persistToFirebase(updated, userId);
      return updated;
    });
  }, [userId, persistToFirebase]);

  const setActiveSpaceId = useCallback((id: string) => {
    setActiveSpaceIdRaw(id);
    // Update state to reflect active space's data at top level
    setStateRaw(prev => {
      const allSpaces = stateToSpaces(prev);
      const space = allSpaces.find(s => s.id === id);
      if (!space) return prev;
      return {
        ...prev,
        postes: space.postes,
        months: space.months,
        revenus: space.revenus,
        emmenagement: space.emmenagement,
        activeSpaceId: id,
      };
    });
    setCurMonth(null);
    setCurYear('all');
  }, []);

  const createSpace = useCallback((s: Omit<Space, 'postes' | 'months' | 'revenus' | 'emmenagement'>) => {
    setStateRaw(prev => {
      const allSpaces = stateToSpaces(prev);
      const newSpace: Space = {
        ...s,
        postes: [],
        months: [],
        revenus: { objectif: 5000, categories: [], months: {} },
        emmenagement: [],
      };
      const next = spacesToState([...allSpaces, newSpace], activeSpaceId, prev.rate, new Date().toISOString());
      const entry: HistoryEntry = {
        ts: new Date().toISOString(), spaceId: s.id, spaceName: s.name,
        action: 'space.create', detail: `Création du space « ${s.name} »`,
      };
      const updated = { ...next, history: [entry, ...(prev.history || [])].slice(0, HISTORY_CAP) };
      localStorage.setItem('fdxb_state', JSON.stringify(updated));
      if (userId) persistToFirebase(updated, userId);
      return updated;
    });
  }, [activeSpaceId, userId, persistToFirebase]);

  const updateSpace = useCallback((id: string, updates: Partial<Space>) => {
    setStateRaw(prev => {
      const before = stateToSpaces(prev).find(s => s.id === id);
      const allSpaces = stateToSpaces(prev).map(s => s.id === id ? { ...s, ...updates } : s);
      const next = spacesToState(allSpaces, activeSpaceId, prev.rate, new Date().toISOString());
      const fields = Object.keys(updates).filter(k => k !== 'postes' && k !== 'months' && k !== 'revenus' && k !== 'emmenagement');
      const entry: HistoryEntry = {
        ts: new Date().toISOString(), spaceId: id, spaceName: before?.name,
        action: 'space.update',
        detail: fields.length ? `Modif space (${fields.join(', ')})` : 'Modif space',
      };
      const updated = { ...next, history: [entry, ...(prev.history || [])].slice(0, HISTORY_CAP) };
      localStorage.setItem('fdxb_state', JSON.stringify(updated));
      if (userId) persistToFirebase(updated, userId);
      return updated;
    });
  }, [activeSpaceId, userId, persistToFirebase]);

  const deleteSpace = useCallback((id: string) => {
    setStateRaw(prev => {
      const before = stateToSpaces(prev).find(s => s.id === id);
      const allSpaces = stateToSpaces(prev).filter(s => s.id !== id);
      if (allSpaces.length === 0) return prev;
      const newActiveId = id === activeSpaceId ? allSpaces[0].id : activeSpaceId;
      if (id === activeSpaceId) setActiveSpaceIdRaw(newActiveId);
      const next = spacesToState(allSpaces, newActiveId, prev.rate, new Date().toISOString());
      const entry: HistoryEntry = {
        ts: new Date().toISOString(), spaceId: id, spaceName: before?.name,
        action: 'space.delete', detail: `Suppression du space « ${before?.name || id} »`,
      };
      const updated = { ...next, history: [entry, ...(prev.history || [])].slice(0, HISTORY_CAP) };
      localStorage.setItem('fdxb_state', JSON.stringify(updated));
      if (userId) persistToFirebase(updated, userId);
      return updated;
    });
  }, [activeSpaceId, userId, persistToFirebase]);

  const login = useCallback(async (id: string, pin: string): Promise<boolean> => {
    try {
      const userPin = await fbGet<string>(`users/${id}/pin`);
      if (userPin !== pin) return false;
      const data = await fbGet<AppState>(`users/${id}/state`);
      if (data) {
        if (!data.postes) data.postes = JSON.parse(JSON.stringify(DEFAULT_POSTES));
        if (!data.months) data.months = [];
        if (!data.revenus) data.revenus = { objectif: 5000, categories: [], months: {} };
        if (!data.emmenagement) data.emmenagement = [];
        setState(data);
        localStorage.setItem('fdxb_state', JSON.stringify(data));
        // Set active space
        const sp = stateToSpaces(data);
        const activeId = data.activeSpaceId || sp[0].id;
        setActiveSpaceIdRaw(activeId);
        const active = sp.find(s => s.id === activeId) || sp[0];
        if (active.months.length > 0) setCurMonth(pickInitialMonth(active.months));
      }
      setUserId(id);
      localStorage.setItem('fdxb_uid', id);
      localStorage.setItem('fdxb_pin', pin);
      setSyncStatus('ok');

      try {
        const rate = await fetchRate();
        setLiveRate(rate);
        setStateRaw(prev => {
          const u = { ...prev, rate };
          localStorage.setItem('fdxb_state', JSON.stringify(u));
          return u;
        });
      } catch {}

      return true;
    } catch {
      return false;
    }
  }, [setState]);

  const logout = useCallback(() => {
    setUserId(null);
    localStorage.removeItem('fdxb_uid');
    localStorage.removeItem('fdxb_pin');
    setSyncStatus('off');
  }, []);

  const refreshRate = useCallback(async () => {
    setRateRefreshing(true);
    try {
      const rate = await fetchRate();
      setLiveRate(rate);
      setLastRateFetch(Date.now());
      setStateRaw(prev => {
        const u = { ...prev, rate };
        localStorage.setItem('fdxb_state', JSON.stringify(u));
        if (userId) persistToFirebase(u, userId);
        return u;
      });
    } finally {
      setRateRefreshing(false);
    }
  }, [userId, persistToFirebase]);

  // Auto-refresh toutes les 10 minutes (TwelveData 800 req/jour suffit largement = ~144 req/jour avec 10min interval)
  useEffect(() => {
    if (!userId) return; // ne tourne pas avant login
    const interval = setInterval(() => {
      refreshRate().catch(() => {});
    }, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [userId, refreshRate]);

  const setRateManually = useCallback((rate: number) => {
    if (!isFinite(rate) || rate <= 0) return;
    setLiveRate(rate);
    setStateRaw(prev => {
      const u = { ...prev, rate };
      localStorage.setItem('fdxb_state', JSON.stringify(u));
      if (userId) persistToFirebase(u, userId);
      return u;
    });
  }, [userId, persistToFirebase]);

  const toggleHidden = useCallback(() => setHiddenMode(prev => !prev), []);

  const logChange = useCallback((action: string, detail: string) => {
    setStateRaw(prev => {
      const allSpaces = stateToSpaces(prev);
      const space = allSpaces.find(s => s.id === activeSpaceId);
      const entry: HistoryEntry = {
        ts: new Date().toISOString(),
        spaceId: activeSpaceId,
        spaceName: space?.name,
        action,
        detail,
      };
      const history = [entry, ...(prev.history || [])].slice(0, HISTORY_CAP);
      const updated = { ...prev, history, lastUpdate: new Date().toISOString() };
      try { localStorage.setItem('fdxb_state', JSON.stringify(updated)); } catch {}
      if (userId) persistToFirebase(updated, userId);
      return updated;
    });
  }, [activeSpaceId, userId, persistToFirebase]);

  const clearHistory = useCallback(() => {
    setStateRaw(prev => {
      const updated = { ...prev, history: [], lastUpdate: new Date().toISOString() };
      try { localStorage.setItem('fdxb_state', JSON.stringify(updated)); } catch {}
      if (userId) persistToFirebase(updated, userId);
      return updated;
    });
  }, [userId, persistToFirebase]);

  const residencyEntries = useMemo(() => state.residency?.entries || [], [state.residency]);

  const addResidencyEntry = useCallback((e: Omit<ResidencyEntry, 'id'>) => {
    setStateRaw(prev => {
      const id = `res-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const entry: ResidencyEntry = { ...e, id };
      const list = [...(prev.residency?.entries || []), entry];
      const hist: HistoryEntry = {
        ts: new Date().toISOString(),
        action: 'residency.add',
        detail: `Séjour ${entry.country}${entry.countryName ? ' (' + entry.countryName + ')' : ''} du ${entry.start}${entry.end ? ' au ' + entry.end : ' (en cours)'}`,
      };
      const updated = {
        ...prev,
        residency: { entries: list },
        history: [hist, ...(prev.history || [])].slice(0, HISTORY_CAP),
        lastUpdate: new Date().toISOString(),
      };
      try { localStorage.setItem('fdxb_state', JSON.stringify(updated)); } catch {}
      if (userId) persistToFirebase(updated, userId);
      return updated;
    });
  }, [userId, persistToFirebase]);

  const updateResidencyEntry = useCallback((id: string, updates: Partial<ResidencyEntry>) => {
    setStateRaw(prev => {
      const list = (prev.residency?.entries || []).map(e => e.id === id ? { ...e, ...updates } : e);
      const hist: HistoryEntry = {
        ts: new Date().toISOString(),
        action: 'residency.update',
        detail: `Modif séjour (${Object.keys(updates).join(', ')})`,
      };
      const updated = {
        ...prev,
        residency: { entries: list },
        history: [hist, ...(prev.history || [])].slice(0, HISTORY_CAP),
        lastUpdate: new Date().toISOString(),
      };
      try { localStorage.setItem('fdxb_state', JSON.stringify(updated)); } catch {}
      if (userId) persistToFirebase(updated, userId);
      return updated;
    });
  }, [userId, persistToFirebase]);

  const deleteResidencyEntry = useCallback((id: string) => {
    setStateRaw(prev => {
      const before = (prev.residency?.entries || []).find(e => e.id === id);
      const list = (prev.residency?.entries || []).filter(e => e.id !== id);
      const hist: HistoryEntry = {
        ts: new Date().toISOString(),
        action: 'residency.delete',
        detail: before
          ? `Suppr séjour ${before.country} du ${before.start}${before.end ? ' au ' + before.end : ''}`
          : 'Suppr séjour',
      };
      const updated = {
        ...prev,
        residency: { entries: list },
        history: [hist, ...(prev.history || [])].slice(0, HISTORY_CAP),
        lastUpdate: new Date().toISOString(),
      };
      try { localStorage.setItem('fdxb_state', JSON.stringify(updated)); } catch {}
      if (userId) persistToFirebase(updated, userId);
      return updated;
    });
  }, [userId, persistToFirebase]);

  // ─── VOYAGES ───
  const trips = useMemo(() => state.trips || [], [state.trips]);

  const createTrip = useCallback((params: {
    name: string; country: string; currency: string;
    startDate: string; endDate: string | null;
    aedOut: number; localIn: number;
    monthId: string;
  }): string => {
    const id = `trip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const rate = params.localIn > 0 ? params.aedOut / params.localIn : 0;

    setStateRaw(prev => {
      // Crée la swap-tx dans le mois cible — DANS UN EXTRA (per-month, pas global)
      // La tx représente la réalité économique du swap : aedOut sortis du compte AED,
      // localIn EUR réellement reçus (frais inclus dans le taux effectif). On NE recalcule
      // PAS l'EUR au taux du jour (sinon on ignore les frais et on prend un taux qui peut
      // être le fallback si le fetch a échoué).
      const swapTxn: Transaction = {
        label: `Swap → ${params.name}`,
        amount: params.aedOut,
        currency: 'AED',
        rate: rate,              // taux effectif du swap = aedOut / localIn (frais inclus)
        eur: params.localIn,     // EUR réellement reçus
        date: params.startDate,
        tripId: id,
        tripKind: 'swap',
      };

      const months = prev.months.map(mo => {
        if (mo.id !== params.monthId) return mo;
        // Find or create VOYAGES extra in this month
        const extraActual = [...(mo.extraActual || [])];
        const extraBudget = [...(mo.extraBudget || [])];
        let extraIdx = extraActual.findIndex(r => r.name.trim().toUpperCase() === 'VOYAGES');
        if (extraIdx < 0) {
          extraActual.push({ name: 'VOYAGES', cat: 'lifestyle', aed: 0, eur: 0, txns: [] });
          extraBudget.push({ name: 'VOYAGES', cat: 'lifestyle', aed: 0, eur: 0 });
          extraIdx = extraActual.length - 1;
        }
        const row = { ...extraActual[extraIdx] };
        const txns = [...(row.txns || []), swapTxn];
        row.txns = txns;
        row.aed = Math.round(txns.reduce((s, t) => s + t.amount, 0) * 100) / 100;
        row.eur = Math.round(txns.reduce((s, t) => s + (t.eur || t.amount / (t.rate || prev.rate)), 0) * 100) / 100;
        extraActual[extraIdx] = row;
        return { ...mo, extraActual, extraBudget };
      });

      const newTrip: Trip = {
        id, name: params.name, country: params.country, currency: params.currency,
        startDate: params.startDate, endDate: params.endDate,
        // posteIdx = -1 sentinel : la swap-tx est dans extraActual['VOYAGES'] du monthId
        swap: { aedOut: params.aedOut, localIn: params.localIn, rate, date: params.startDate, posteIdx: -1, monthId: params.monthId },
        status: 'ongoing',
        createdAt: new Date().toISOString(),
      };

      const hist: HistoryEntry = {
        ts: new Date().toISOString(),
        action: 'trip.create',
        detail: `Voyage ${params.name} (${params.country}) — swap ${params.aedOut} AED → ${params.localIn} ${params.currency}`,
      };

      const updated = {
        ...prev,
        months,
        trips: [...(prev.trips || []), newTrip],
        history: [hist, ...(prev.history || [])].slice(0, HISTORY_CAP),
        lastUpdate: new Date().toISOString(),
      };
      try { localStorage.setItem('fdxb_state', JSON.stringify(updated)); } catch {}
      if (userId) persistToFirebase(updated, userId);
      return updated;
    });
    return id;
  }, [userId, persistToFirebase]);

  const updateTrip = useCallback((id: string, updates: Partial<Trip>) => {
    setStateRaw(prev => {
      const list = (prev.trips || []).map(t => t.id === id ? { ...t, ...updates } : t);
      const updated = { ...prev, trips: list, lastUpdate: new Date().toISOString() };
      try { localStorage.setItem('fdxb_state', JSON.stringify(updated)); } catch {}
      if (userId) persistToFirebase(updated, userId);
      return updated;
    });
  }, [userId, persistToFirebase]);

  const deleteTrip = useCallback((id: string) => {
    setStateRaw(prev => {
      const before = (prev.trips || []).find(t => t.id === id);
      // Compte les tx qui vont être supprimées (actual + extraActual)
      let swapCount = 0;
      let expenseCount = 0;
      let totalAedRemoved = 0;
      prev.months.forEach(mo => {
        (mo.actual || []).forEach(row => {
          (row.txns || []).forEach(t => {
            if (t.tripId === id) {
              if (t.tripKind === 'swap') swapCount++;
              else expenseCount++;
              totalAedRemoved += t.amount || 0;
            }
          });
        });
        (mo.extraActual || []).forEach(row => {
          (row.txns || []).forEach(t => {
            if (t.tripId === id) {
              if (t.tripKind === 'swap') swapCount++;
              else expenseCount++;
              totalAedRemoved += t.amount || 0;
            }
          });
        });
      });
      if (!confirm(`Supprimer ce voyage et TOUTES ses transactions ?\n\n• ${swapCount} swap-tx + ${expenseCount} dépense(s)\n• ${Math.round(totalAedRemoved)} AED retirés du tracker (ton compte AED retrouvera son état d'avant le swap)\n\nCette action est irréversible.`)) return prev;

      const list = (prev.trips || []).filter(t => t.id !== id);
      // Supprime physiquement les tx tagged tripId — actual + extras
      const months = prev.months.map(mo => {
        // Regular actual
        const newActual = (mo.actual || []).map(row => {
          const oldTxns = row.txns || [];
          const newTxns = oldTxns.filter(t => t.tripId !== id);
          if (newTxns.length === oldTxns.length) return row;
          const rate = mo.rate;
          const newAed = Math.round(newTxns.reduce((s, t) => s + (t.amount || 0), 0) * 100) / 100;
          const newEur = Math.round(newTxns.reduce((s, t) => s + (t.eur || (t.amount / (t.rate || rate))), 0) * 100) / 100;
          return { ...row, txns: newTxns, aed: newAed, eur: newEur };
        });
        // Extras: filter + remove extras whose txns become empty (= row VOYAGES vidée)
        let newExtraActual = (mo.extraActual || []).map(row => {
          const oldTxns = row.txns || [];
          const newTxns = oldTxns.filter(t => t.tripId !== id);
          if (newTxns.length === oldTxns.length) return row;
          const rate = mo.rate;
          const newAed = Math.round(newTxns.reduce((s, t) => s + (t.amount || 0), 0) * 100) / 100;
          const newEur = Math.round(newTxns.reduce((s, t) => s + (t.eur || (t.amount / (t.rate || rate))), 0) * 100) / 100;
          return { ...row, txns: newTxns, aed: newAed, eur: newEur };
        });
        let newExtraBudget = mo.extraBudget || [];
        // Si une row d'extra était dédiée au voyage (créée par createTrip et plus aucune txns dedans), on la retire
        // (pas seulement VOYAGES : on retire toute row extra qui est devenue 0 txns ET aed=0 ET eur=0)
        const extrasToKeep: number[] = [];
        newExtraActual.forEach((row, i) => {
          const isEmpty = (!row.txns || row.txns.length === 0) && (row.aed || 0) === 0 && (row.eur || 0) === 0;
          // Heuristic: retire seulement si nom === 'VOYAGES' (pour ne pas tuer d'autres extras vides du user)
          if (isEmpty && row.name.trim().toUpperCase() === 'VOYAGES') return;
          extrasToKeep.push(i);
        });
        if (extrasToKeep.length < newExtraActual.length) {
          newExtraActual = extrasToKeep.map(i => newExtraActual[i]);
          // Sync extraBudget: retire les rows VOYAGES vides en correspondance par nom
          newExtraBudget = newExtraBudget.filter(b => {
            if (b.name.trim().toUpperCase() !== 'VOYAGES') return true;
            return newExtraActual.some(a => a.name.trim().toUpperCase() === 'VOYAGES');
          });
        }
        return { ...mo, actual: newActual, extraActual: newExtraActual, extraBudget: newExtraBudget };
      });
      const hist: HistoryEntry = {
        ts: new Date().toISOString(),
        action: 'trip.delete',
        detail: `Suppr voyage ${before?.name || id} + ${swapCount + expenseCount} tx (${Math.round(totalAedRemoved)} AED)`,
      };
      const updated = {
        ...prev, months, trips: list,
        history: [hist, ...(prev.history || [])].slice(0, HISTORY_CAP),
        lastUpdate: new Date().toISOString(),
      };
      try { localStorage.setItem('fdxb_state', JSON.stringify(updated)); } catch {}
      if (userId) persistToFirebase(updated, userId);
      return updated;
    });
  }, [userId, persistToFirebase]);

  const addTripExpense = useCallback((params: {
    tripId: string; posteIdx: number; monthId: string;
    label: string; eur: number; date: string;
    extraName?: string; // si défini, la dépense va dans l'extra (poste du mois) de ce nom
  }) => {
    setStateRaw(prev => {
      const trip = (prev.trips || []).find(t => t.id === params.tripId);
      if (!trip) return prev;
      const rate = trip.swap.rate; // utilise le taux du swap pour cohérence
      const txn: Transaction = {
        label: params.label || '—',
        amount: Math.round(params.eur * rate * 100) / 100,
        currency: 'EUR',
        rate,
        eur: params.eur,
        date: params.date,
        tripId: params.tripId,
        tripKind: 'expense',
      };
      const recompute = (row: { aed?: number; eur?: number | null; txns?: Transaction[] }) => {
        const txns = row.txns || [];
        row.aed = Math.round(txns.reduce((s, t) => s + t.amount, 0) * 100) / 100;
        row.eur = Math.round(txns.reduce((s, t) => s + (t.eur || t.amount / (t.rate || prev.rate)), 0) * 100) / 100;
      };
      const months = prev.months.map(mo => {
        if (mo.id !== params.monthId) return mo;
        // Cible un extra (poste du mois) si extraName fourni, sinon un poste régulier
        if (params.extraName) {
          const extraActual = [...(mo.extraActual || [])];
          const idx = extraActual.findIndex(r => r.name === params.extraName);
          if (idx < 0) return mo; // extra introuvable ce mois → no-op
          const row = { ...extraActual[idx] };
          row.txns = [...(row.txns || []), txn];
          recompute(row);
          extraActual[idx] = row;
          return { ...mo, extraActual };
        }
        const actual = [...mo.actual];
        const row = { ...(actual[params.posteIdx] || { aed: 0, eur: null, txns: [] }) };
        row.txns = [...(row.txns || []), txn];
        recompute(row);
        actual[params.posteIdx] = row;
        return { ...mo, actual };
      });
      const updated = { ...prev, months, lastUpdate: new Date().toISOString() };
      try { localStorage.setItem('fdxb_state', JSON.stringify(updated)); } catch {}
      if (userId) persistToFirebase(updated, userId);
      return updated;
    });
  }, [userId, persistToFirebase]);

  const deleteTripExpense = useCallback((tripId: string, monthId: string, posteIdx: number, txIdx: number, extraName?: string) => {
    setStateRaw(prev => {
      const recompute = (row: { aed?: number; eur?: number | null; txns?: Transaction[] }) => {
        const txns = row.txns || [];
        row.aed = Math.round(txns.reduce((s, t) => s + t.amount, 0) * 100) / 100;
        row.eur = Math.round(txns.reduce((s, t) => s + (t.eur || t.amount / (t.rate || prev.rate)), 0) * 100) / 100;
      };
      const months = prev.months.map(mo => {
        if (mo.id !== monthId) return mo;
        if (extraName) {
          const extraActual = [...(mo.extraActual || [])];
          const idx = extraActual.findIndex(r => r.name === extraName);
          if (idx < 0) return mo;
          const row = { ...extraActual[idx] };
          const txns = [...(row.txns || [])];
          if (txns[txIdx]?.tripId !== tripId) return mo;
          txns.splice(txIdx, 1);
          row.txns = txns;
          recompute(row);
          extraActual[idx] = row;
          return { ...mo, extraActual };
        }
        const actual = [...mo.actual];
        const row = { ...(actual[posteIdx] || { aed: 0, eur: null, txns: [] }) };
        const txns = [...(row.txns || [])];
        if (txns[txIdx]?.tripId !== tripId) return mo;
        txns.splice(txIdx, 1);
        row.txns = txns;
        recompute(row);
        actual[posteIdx] = row;
        return { ...mo, actual };
      });
      const updated = { ...prev, months, lastUpdate: new Date().toISOString() };
      try { localStorage.setItem('fdxb_state', JSON.stringify(updated)); } catch {}
      if (userId) persistToFirebase(updated, userId);
      return updated;
    });
  }, [userId, persistToFirebase]);

  const updateTripExpense = useCallback((params: {
    tripId: string;
    orig: { monthId: string; posteIdx: number; txIdx: number; extraName?: string };
    monthId: string; posteIdx: number; label: string; eur: number; date: string; extraName?: string;
  }) => {
    setStateRaw(prev => {
      const trip = (prev.trips || []).find(t => t.id === params.tripId);
      if (!trip) return prev;
      const rate = trip.swap.rate;
      const recompute = (row: { aed?: number; eur?: number | null; txns?: Transaction[] }) => {
        const txns = row.txns || [];
        row.aed = Math.round(txns.reduce((s, t) => s + t.amount, 0) * 100) / 100;
        row.eur = Math.round(txns.reduce((s, t) => s + (t.eur || t.amount / (t.rate || prev.rate)), 0) * 100) / 100;
      };
      // 1) retirer la tx d'origine (même logique que deleteTripExpense)
      const o = params.orig;
      let months = prev.months.map(mo => {
        if (mo.id !== o.monthId) return mo;
        if (o.extraName) {
          const extraActual = [...(mo.extraActual || [])];
          const idx = extraActual.findIndex(r => r.name === o.extraName);
          if (idx < 0) return mo;
          const row = { ...extraActual[idx] };
          const txns = [...(row.txns || [])];
          if (txns[o.txIdx]?.tripId !== params.tripId) return mo;
          txns.splice(o.txIdx, 1);
          row.txns = txns; recompute(row); extraActual[idx] = row;
          return { ...mo, extraActual };
        }
        const actual = [...mo.actual];
        const row = { ...(actual[o.posteIdx] || { aed: 0, eur: null, txns: [] }) };
        const txns = [...(row.txns || [])];
        if (txns[o.txIdx]?.tripId !== params.tripId) return mo;
        txns.splice(o.txIdx, 1);
        row.txns = txns; recompute(row); actual[o.posteIdx] = row;
        return { ...mo, actual };
      });
      // 2) ré-ajouter la tx mise à jour à la nouvelle cible
      const txn: Transaction = {
        label: params.label || '—',
        amount: Math.round(params.eur * rate * 100) / 100,
        currency: 'EUR', rate, eur: params.eur, date: params.date,
        tripId: params.tripId, tripKind: 'expense',
      };
      months = months.map(mo => {
        if (mo.id !== params.monthId) return mo;
        if (params.extraName) {
          const extraActual = [...(mo.extraActual || [])];
          const idx = extraActual.findIndex(r => r.name === params.extraName);
          if (idx < 0) return mo;
          const row = { ...extraActual[idx] };
          row.txns = [...(row.txns || []), txn]; recompute(row); extraActual[idx] = row;
          return { ...mo, extraActual };
        }
        const actual = [...mo.actual];
        const row = { ...(actual[params.posteIdx] || { aed: 0, eur: null, txns: [] }) };
        row.txns = [...(row.txns || []), txn]; recompute(row); actual[params.posteIdx] = row;
        return { ...mo, actual };
      });
      const updated = { ...prev, months, lastUpdate: new Date().toISOString() };
      try { localStorage.setItem('fdxb_state', JSON.stringify(updated)); } catch {}
      if (userId) persistToFirebase(updated, userId);
      return updated;
    });
  }, [userId, persistToFirebase]);

  // Recharge le compte EUR d'un voyage : nouveau swap AED→EUR ajouté à la même pocket.
  // Débite l'AED (swap-tx dans VOYAGES) et augmente le budget (= somme des swaps).
  const addTripSwap = useCallback((params: {
    tripId: string; monthId: string; aedOut: number; localIn: number; date: string;
  }) => {
    setStateRaw(prev => {
      const trip = (prev.trips || []).find(t => t.id === params.tripId);
      if (!trip) return prev;
      const rate = params.localIn > 0 ? params.aedOut / params.localIn : prev.rate;
      const swapTxn: Transaction = {
        label: `Recharge → ${trip.name}`,
        amount: params.aedOut,
        currency: 'AED',
        rate,
        eur: params.localIn,
        date: params.date,
        tripId: params.tripId,
        tripKind: 'swap',
      };
      const months = prev.months.map(mo => {
        if (mo.id !== params.monthId) return mo;
        const extraActual = [...(mo.extraActual || [])];
        const extraBudget = [...(mo.extraBudget || [])];
        let idx = extraActual.findIndex(r => r.name.trim().toUpperCase() === 'VOYAGES');
        if (idx < 0) {
          extraActual.push({ name: 'VOYAGES', cat: 'lifestyle', aed: 0, eur: 0, txns: [] });
          extraBudget.push({ name: 'VOYAGES', cat: 'lifestyle', aed: 0, eur: 0 });
          idx = extraActual.length - 1;
        }
        const row = { ...extraActual[idx] };
        const txns = [...(row.txns || []), swapTxn];
        row.txns = txns;
        row.aed = Math.round(txns.reduce((s, t) => s + t.amount, 0) * 100) / 100;
        row.eur = Math.round(txns.reduce((s, t) => s + (t.eur || t.amount / (t.rate || prev.rate)), 0) * 100) / 100;
        extraActual[idx] = row;
        return { ...mo, extraActual, extraBudget };
      });
      const hist: HistoryEntry = {
        ts: new Date().toISOString(),
        action: 'trip.recharge',
        detail: `Recharge ${trip.name} — ${params.aedOut} AED → ${params.localIn} ${trip.currency}`,
      };
      const updated = { ...prev, months, history: [hist, ...(prev.history || [])].slice(0, HISTORY_CAP), lastUpdate: new Date().toISOString() };
      try { localStorage.setItem('fdxb_state', JSON.stringify(updated)); } catch {}
      if (userId) persistToFirebase(updated, userId);
      return updated;
    });
  }, [userId, persistToFirebase]);

  const updateMonth = useCallback((id: string, field: keyof Month, val: number) => {
    setStateRaw(prev => {
      const months = prev.months.map(m => m.id === id ? { ...m, [field]: val } : m);
      // Also update in spaces
      const allSpaces = stateToSpaces(prev).map(s =>
        s.id === activeSpaceId ? { ...s, months } : s
      );
      const updated = { ...prev, months, spaces: allSpaces, lastUpdate: new Date().toISOString() };
      localStorage.setItem('fdxb_state', JSON.stringify(updated));
      if (userId) persistToFirebase(updated, userId);
      return updated;
    });
  }, [userId, persistToFirebase, activeSpaceId]);

  return (
    <AppContext.Provider value={{
      state, setState, save,
      spaces, activeSpace, activeSpaceId, setActiveSpaceId,
      createSpace, updateSpace, deleteSpace,
      userId, setUserId, isLoggedIn: !!userId,
      login, logout,
      liveRate, refreshRate, setRateManually, rateRefreshing, lastRateFetch,
      syncStatus,
      hiddenMode, toggleHidden,
      curMonth, setCurMonth,
      curYear, setCurYear,
      dashCur, setDashCur,
      updateMonth,
      history: state.history || [],
      logChange, clearHistory,
      residencyEntries, addResidencyEntry, updateResidencyEntry, deleteResidencyEntry,
      trips, createTrip, updateTrip, deleteTrip, addTripExpense, deleteTripExpense, updateTripExpense, addTripSwap,
    }}>
      <div className={hiddenMode ? 'amounts-hidden' : ''}>
        {children}
      </div>
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
