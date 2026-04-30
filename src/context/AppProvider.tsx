'use client';

import { createContext, useContext, useState, useCallback, useRef, useMemo, ReactNode } from 'react';
import { AppState, Month, Space, Poste } from '@/lib/types';
import { DEFAULT_POSTES } from '@/lib/constants';
import { fbGet, fbSet } from '@/lib/firebase';
import { fetchRate } from '@/lib/utils';

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
}

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
  const [activeSpaceId, setActiveSpaceIdRaw] = useState<string>('dubai');
  const saveTimer = useRef<NodeJS.Timeout | null>(null);

  const spaces = useMemo(() => stateToSpaces(state), [state]);
  const activeSpace = useMemo(() => spaces.find(s => s.id === activeSpaceId) || spaces[0], [spaces, activeSpaceId]);

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
      const updated = spacesToState([...allSpaces, newSpace], activeSpaceId, prev.rate, new Date().toISOString());
      localStorage.setItem('fdxb_state', JSON.stringify(updated));
      if (userId) persistToFirebase(updated, userId);
      return updated;
    });
  }, [activeSpaceId, userId, persistToFirebase]);

  const updateSpace = useCallback((id: string, updates: Partial<Space>) => {
    setStateRaw(prev => {
      const allSpaces = stateToSpaces(prev).map(s => s.id === id ? { ...s, ...updates } : s);
      const updated = spacesToState(allSpaces, activeSpaceId, prev.rate, new Date().toISOString());
      localStorage.setItem('fdxb_state', JSON.stringify(updated));
      if (userId) persistToFirebase(updated, userId);
      return updated;
    });
  }, [activeSpaceId, userId, persistToFirebase]);

  const deleteSpace = useCallback((id: string) => {
    setStateRaw(prev => {
      const allSpaces = stateToSpaces(prev).filter(s => s.id !== id);
      if (allSpaces.length === 0) return prev;
      const newActiveId = id === activeSpaceId ? allSpaces[0].id : activeSpaceId;
      if (id === activeSpaceId) setActiveSpaceIdRaw(newActiveId);
      const updated = spacesToState(allSpaces, newActiveId, prev.rate, new Date().toISOString());
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
        if (active.months.length > 0) setCurMonth(active.months[active.months.length - 1].id);
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
    const rate = await fetchRate();
    setLiveRate(rate);
    setStateRaw(prev => {
      const u = { ...prev, rate };
      localStorage.setItem('fdxb_state', JSON.stringify(u));
      if (userId) persistToFirebase(u, userId);
      return u;
    });
  }, [userId, persistToFirebase]);

  const toggleHidden = useCallback(() => setHiddenMode(prev => !prev), []);

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
      liveRate, refreshRate,
      syncStatus,
      hiddenMode, toggleHidden,
      curMonth, setCurMonth,
      curYear, setCurYear,
      dashCur, setDashCur,
      updateMonth,
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
