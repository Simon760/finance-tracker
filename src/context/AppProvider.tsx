'use client';

import { createContext, useContext, useState, useCallback, useRef, useMemo, useEffect, ReactNode } from 'react';
import { AppState, Month, Space, Poste, HistoryEntry, ResidencyEntry } from '@/lib/types';
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
  if (s.spaces && s.spaces.length > 0) return s.spaces;
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
      const updated = { ...prev, lastUpdate: new Date().toISOString() };
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
      liveRate, refreshRate, setRateManually, rateRefreshing,
      syncStatus,
      hiddenMode, toggleHidden,
      curMonth, setCurMonth,
      curYear, setCurYear,
      dashCur, setDashCur,
      updateMonth,
      history: state.history || [],
      logChange, clearHistory,
      residencyEntries, addResidencyEntry, updateResidencyEntry, deleteResidencyEntry,
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
