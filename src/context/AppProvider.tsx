'use client';

import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
import { AppState, Month, RevenuState } from '@/lib/types';
import { DEFAULT_POSTES } from '@/lib/constants';
import { fbGet, fbSet } from '@/lib/firebase';
import { fetchRate } from '@/lib/utils';

interface AppContextType {
  state: AppState;
  setState: (s: AppState) => void;
  save: () => void;
  userId: string | null;
  setUserId: (id: string | null) => void;
  isLoggedIn: boolean;
  login: (id: string, pin: string) => Promise<boolean>;
  logout: () => void;
  liveRate: number;
  refreshRate: () => Promise<void>;
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

const defaultState: AppState = {
  rate: 4.3284,
  postes: JSON.parse(JSON.stringify(DEFAULT_POSTES)),
  months: [],
  revenus: { objectif: 5000, categories: ['ITC VIP', 'EDUCATEUR', 'CONCIERGERIE', 'MOON BUNDLE', 'AUTRE'], months: {} },
  emmenagement: [],
};

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
  const saveTimer = useRef<NodeJS.Timeout | null>(null);

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
        if (data.months.length > 0) setCurMonth(data.months[data.months.length - 1].id);
      }
      setUserId(id);
      localStorage.setItem('fdxb_uid', id);
      localStorage.setItem('fdxb_pin', pin);
      setSyncStatus('ok');

      // Fetch live rate
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

  const toggleHidden = useCallback(() => {
    setHiddenMode(prev => !prev);
  }, []);

  const updateMonth = useCallback((id: string, field: keyof Month, val: number) => {
    setStateRaw(prev => {
      const months = prev.months.map(m => m.id === id ? { ...m, [field]: val } : m);
      const updated = { ...prev, months, lastUpdate: new Date().toISOString() };
      localStorage.setItem('fdxb_state', JSON.stringify(updated));
      if (userId) persistToFirebase(updated, userId);
      return updated;
    });
  }, [userId, persistToFirebase]);

  return (
    <AppContext.Provider value={{
      state, setState, save,
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
