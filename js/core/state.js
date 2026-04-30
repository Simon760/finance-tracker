import { fbSet } from './firebase.js';

export const DEFAULT_POSTES = [
  { name: 'WIFI', cat: 'vital', isAed: true },
  { name: 'FORFAIT MOBILE', cat: 'vital', isAed: true },
  { name: 'COIFFEUR', cat: 'vital', isAed: true },
  { name: 'REPASSAGE', cat: 'vital', isAed: true },
  { name: 'COURSES', cat: 'vital', isAed: true },
  { name: 'MÉNAGE', cat: 'vital', isAed: true },
  { name: 'TAXI', cat: 'vital', isAed: true },
  { name: 'DEWA', cat: 'logement', isAed: true },
  { name: 'CLIMATISATION', cat: 'logement', isAed: true },
  { name: 'LOYER', cat: 'logement', isAed: true },
  { name: 'CHARGES SG', cat: 'finance', isAed: false },
  { name: 'CHARGES REVO', cat: 'finance', isAed: false },
  { name: 'ACTIVITÉS', cat: 'lifestyle', isAed: true },
  { name: 'RESTAURANTS', cat: 'lifestyle', isAed: true },
];

export const VITAL_CATS = ['vital', 'logement', 'finance'];

export const CAT_COLORS = {
  vital: 'var(--green)', lifestyle: 'var(--pink)',
  finance: 'var(--amber)', logement: 'var(--blue)'
};

export const CAT_CHART = {
  vital: '#34d399', lifestyle: '#f472b6',
  finance: '#fbbf24', logement: '#60a5fa'
};

export const PIE_COLORS = [
  '#34d399', '#60a5fa', '#fbbf24', '#f87171', '#a78bfa',
  '#22d3ee', '#f472b6', '#a3e635', '#fb923c', '#818cf8',
  '#2dd4bf', '#fb7185', '#38bdf8'
];

export const MOIS_LIST = [
  'JANVIER', 'FÉVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN',
  'JUILLET', 'AOÛT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DÉCEMBRE'
];

export const REV_BASE_COLORS = [
  '#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#f472b6',
  '#22d3ee', '#fb923c', '#f87171', '#a3e635', '#818cf8'
];

const STORAGE_KEY = 'fdxb_state';

// Global app state
export const app = {
  state: null,
  curMonth: null,
  curRevMonth: null,
  dashCur: 'EUR',
  revPage: 'tracker',
  userId: null,
  dbReady: false,
  hiddenMode: false,
  charts: {},
  rvEditMode: null,
  txnTarget: null,
  txnCur: 'AED',
};

export function buildDefault() {
  const s = {
    rate: 4.3284,
    postes: JSON.parse(JSON.stringify(DEFAULT_POSTES)),
    months: [],
    revenus: {
      objectif: 5000,
      categories: ['ITC VIP', 'EDUCATEUR', 'CONCIERGERIE', 'MOON BUNDLE', 'AUTRE'],
      months: {}
    },
    emmenagement: [
      { poste: 'LICENCE LLC', aed: 8485, taux: 4.2905, eur: 1977.62, cat: 'Société' },
      { poste: 'IMMIGRATION CARD', aed: 2920, taux: 4.296, eur: 679.70, cat: 'Société' },
      { poste: 'VISA', aed: 2530, taux: 4.3066, eur: 587.47, cat: 'Société' },
      { poste: 'HEALTH INSURANCE', aed: 1695.92, taux: 4.2758, eur: 396.63, cat: 'Société' },
      { poste: 'MEDICAL TEST', aed: 340, taux: 4.2965, eur: 79.52, cat: 'Société' },
      { poste: 'CARTE SIM', aed: 82.95, taux: 4.2955, eur: 19.31, cat: 'Société' },
      { poste: 'AGENCY FEES', aed: 4725, taux: 4.2658, eur: 1107.65, cat: 'Logement' },
      { poste: 'SECURITY DEPOSIT', aed: 4500, taux: 4.2658, eur: 1054.90, cat: 'Logement' },
      { poste: 'EJARI FEES', aed: 500, taux: 4.28, eur: 116.82, cat: 'Logement' },
      { poste: 'DEWA DEPOSIT', aed: 2130, taux: 4.2791, eur: 497.77, cat: 'Logement' },
      { poste: 'GAS DEPOSIT', aed: 300, taux: 4.2661, eur: 70.32, cat: 'Logement' },
      { poste: 'PAN HOME', aed: 9587, taux: 4.2683, eur: 2246.09, cat: 'Ameublement' },
      { poste: 'NOON', aed: 2510.8, taux: 4.2789, eur: 586.79, cat: 'Ameublement' },
      { poste: 'LOYER', aed: 22500, taux: 4.28, eur: 5257.01, cat: 'Logement' },
      { poste: 'RIDEAUX', aed: 1700, taux: 4.2924, eur: 396.05, cat: 'Ameublement' },
      { poste: 'MÉNAGE MOVE IN', aed: 100, taux: 4.2745, eur: 23.39, cat: 'Logement' },
      { poste: 'INSTALLATION TV', aed: 98, taux: 4.2746, eur: 22.93, cat: 'Ameublement' },
    ]
  };

  const xm = [
    { id: 'OCTOBRE', rate: 4.3284, earn: 4650, soldeStart: 0, soldeEnd: 0,
      b: [361,341,400,125,1100,240,800,450,0,7500,0,0,1500,1800], be: [null,null,null,null,null,null,null,null,null,null,280,92,null,null],
      a: [150,238.89,0,49,509,0,348.17,0,0,4500,0,0,472.2,877.96], ae: [null,null,null,null,null,null,null,null,null,null,280,92,null,null] },
    { id: 'NOVEMBRE', rate: 4.3284, earn: 6058, soldeStart: 91712, soldeEnd: 97070,
      b: [361,239,400,125,1100,400,800,450,0,7500,0,0,1500,1800], be: [null,null,null,null,null,null,null,null,null,null,280,92,null,null],
      a: [436,239,125.5,28,435,300,1257.25,457,0,7500,0,0,1101,2172], ae: [null,null,null,null,null,null,null,null,null,null,280,92,null,null] },
    { id: 'DECEMBRE', rate: 4.3284, earn: 3948, soldeStart: 0, soldeEnd: 0,
      b: [361,239,0,0,950,100,1000,442,0,7500,0,0,900,1200], be: [null,null,null,null,null,null,null,null,null,null,280,92,null,null],
      a: [361,239,0,0,663,100,1226,442,0,7500,0,0,937.4,1267], ae: [null,null,null,null,184.32,null,null,null,null,null,280,92,null,null],
      xa: [{ name: 'FRANCE', cat: 'vital', aed: 0, eur: 641 }, { name: 'AUTRE', cat: 'vital', aed: 3726, eur: 0 }] },
    { id: 'JANVIER', rate: 4.3284, earn: 3000, soldeStart: 91684, soldeEnd: 88243,
      b: [361,239,125.5,200,1100,200,600,442,0,7500,0,0,750,400], be: [null,null,null,null,null,null,null,null,null,null,280,42,null,null],
      a: [361,239,110,170.5,1292,164.3,862,437.45,0,7500,0,0,656,1919], ae: [null,null,null,null,null,null,null,null,null,null,280,42,null,null],
      xa: [{ name: 'AUTRE', cat: 'vital', aed: 1176, eur: 0 }] },
    { id: 'FEVRIER', rate: 4.3284, earn: 817, soldeStart: 0, soldeEnd: 0,
      b: [361,239,251,150,1300,200,600,442,0,7500,0,0,1000,800], be: [null,null,null,null,null,null,null,null,null,null,280,38,null,null],
      a: [0,0,220,55,1318,136,400,458,0,0,0,0,945,1357], ae: [null,null,null,null,null,null,null,null,null,null,280,38,null,null],
      xa: [{ name: 'AUTRE', cat: 'vital', aed: 1680, eur: 568.13 }] },
    { id: 'MARS', rate: 4.3284, earn: 0, soldeStart: 0, soldeEnd: 0,
      b: [361,239,251,150,1300,200,400,442,0,7500,0,0,500,1000], be: [null,null,null,null,null,null,null,null,null,null,280,42,null,null],
      a: [0,0,0,0,0,0,0,0,0,0,0,0,0,0], ae: [null,null,null,null,null,null,null,null,null,null,0,0,null,null],
      xa: [{ name: 'KSA', cat: 'vital', aed: 0, eur: 0 }, { name: 'FRANCE', cat: 'vital', aed: 0, eur: 0 }, { name: 'AUTRE', cat: 'vital', aed: 0, eur: 0 }] },
  ];

  xm.forEach(m => {
    const mo = {
      id: m.id, rate: m.rate, earn: m.earn,
      soldeStart: m.soldeStart, soldeEnd: m.soldeEnd,
      budget: [], actual: [], extraBudget: [], extraActual: m.xa || []
    };
    s.postes.forEach((_, i) => {
      mo.budget.push({ aed: m.b[i] || 0, eur: m.be[i] });
      mo.actual.push({ aed: m.a[i] || 0, eur: m.ae[i] });
    });
    s.months.push(mo);
  });

  return s;
}

export function loadStateLocal() {
  const s = localStorage.getItem(STORAGE_KEY);
  if (s) return JSON.parse(s);
  return buildDefault();
}

let saveTimeout = null;

function updateLastBadge() {
  const el = document.getElementById('lastUpdateBadge');
  if (!el || !app.state.lastUpdate) return;
  const d = new Date(app.state.lastUpdate);
  el.textContent = '🕐 ' + d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) +
    ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function showSync(s) {
  const b = document.getElementById('syncBadge');
  const t = document.getElementById('syncText');
  if (!b || !t) return;
  b.className = 'sync-badge ' + (s === 'ok' ? 'ok' : s === 'saving' ? 'saving' : 'off');
  t.textContent = s === 'ok' ? '☁️ SYNCED' : s === 'saving' ? 'SYNCING...' : 'OFFLINE';
}

function persistToFirebase() {
  if (!app.dbReady || !app.userId) return;
  showSync('saving');
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    fbSet('users/' + app.userId + '/state', app.state)
      .then(() => showSync('ok'))
      .catch(err => { console.error('Save error:', err); showSync('off'); });
  }, 600);
}

export function save() {
  app.state.lastUpdate = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(app.state));
  updateLastBadge();
  persistToFirebase();
}

export function saveSilent() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(app.state));
  persistToFirebase();
}

export function gm(id) {
  return app.state.months.find(m => m.id === id);
}

export function ensureRevState() {
  if (!app.state.revenus) {
    app.state.revenus = {
      objectif: 5000,
      categories: ['ITC VIP', 'EDUCATEUR', 'CONCIERGERIE', 'MOON BUNDLE', 'AUTRE'],
      months: {}
    };
  }
  if (!app.state.revenus.months) app.state.revenus.months = {};
  if (!app.state.revenus.categories) {
    app.state.revenus.categories = ['ITC VIP', 'EDUCATEUR', 'CONCIERGERIE', 'MOON BUNDLE', 'AUTRE'];
  }
}
