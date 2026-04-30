import { fbGet, fbSet } from './firebase.js';
import { app, loadStateLocal, showSync, save } from './state.js';
import { fetchLiveRate } from '../utils/currency.js';
import { renderTracker } from '../pages/tracker.js';

function hashPin(pin) {
  let h = 0;
  for (let i = 0; i < pin.length; i++) {
    h = ((h << 5) - h) + pin.charCodeAt(i);
    h |= 0;
  }
  return 'h_' + Math.abs(h).toString(36);
}

function setStatus(msg) {
  document.getElementById('loginStatus').textContent = msg;
}

export function enterApp(id, ph) {
  app.userId = id;
  localStorage.setItem('fdxb_userId', id);
  localStorage.setItem('fdxb_pinHash', ph);
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appShell').style.display = 'flex';
  document.getElementById('userInfo').style.display = 'flex';
  document.getElementById('userName').textContent = id;
  document.getElementById('syncBadge').style.display = 'flex';

  if (app.dbReady) {
    loadFromFirebase();
  } else {
    app.state = loadStateLocal();
    app.curMonth = app.state.months.length > 0 ? app.state.months[app.state.months.length - 1].id : null;
    document.getElementById('sideRate').textContent = app.state.rate.toFixed(4);
    showSync('off');
    renderTracker();
    fetchLiveRate();
  }
}

export async function loginPin() {
  const id = document.getElementById('loginId').value.trim().toLowerCase();
  const pin = document.getElementById('loginPin').value;
  if (!id || !pin) return setStatus('Remplis les deux champs');
  if (id.length < 2) return setStatus('ID trop court (min 2)');
  if (pin.length < 3) return setStatus('PIN trop court (min 3)');

  setStatus('Connexion...');
  const ph = hashPin(pin);

  try {
    const existing = await fbGet('users/' + id + '/pinHash');
    if (existing) {
      if (existing !== ph) { setStatus('❌ Code PIN incorrect'); return; }
    } else {
      await fbSet('users/' + id + '/pinHash', ph);
    }
    app.dbReady = true;
    enterApp(id, ph);
  } catch (err) {
    console.error('Firebase error:', err);
    setStatus('⚠️ Cloud indispo — mode hors-ligne');
    app.dbReady = false;
    setTimeout(() => enterApp(id, ph), 800);
  }
}

export function logoutUser() {
  if (!confirm('Te déconnecter ?')) return;
  localStorage.removeItem('fdxb_userId');
  localStorage.removeItem('fdxb_pinHash');
  app.userId = null;
  app.dbReady = false;
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('appShell').style.display = 'none';
}

function loadFromFirebase() {
  showSync('saving');
  fbGet('users/' + app.userId + '/state').then(data => {
    if (data && data.months) {
      app.state = data;
      app.state.months.forEach(m => {
        if (!m.extraBudget) m.extraBudget = [];
        if (!m.extraActual) m.extraActual = [];
      });
      if (!app.state.revenus) {
        app.state.revenus = { objectif: 5000, categories: ['ITC VIP', 'EDUCATEUR', 'CONCIERGERIE', 'MOON BUNDLE', 'AUTRE'], months: {} };
      }
      if (!app.state.revenus.months) app.state.revenus.months = {};
      localStorage.setItem('fdxb_state', JSON.stringify(app.state));
    } else {
      app.state = loadStateLocal();
      fbSet('users/' + app.userId + '/state', app.state);
    }
    app.curMonth = app.state.months.length > 0 ? app.state.months[app.state.months.length - 1].id : null;
    document.getElementById('sideRate').textContent = app.state.rate.toFixed(4);
    showSync('ok');
    const el = document.getElementById('lastUpdateBadge');
    if (el && app.state.lastUpdate) {
      const d = new Date(app.state.lastUpdate);
      el.textContent = '🕐 ' + d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) +
        ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }
    renderTracker();
    fetchLiveRate();
  }).catch(err => {
    console.error('Load error:', err);
    app.state = loadStateLocal();
    app.curMonth = app.state.months.length > 0 ? app.state.months[app.state.months.length - 1].id : null;
    showSync('off');
    renderTracker();
    fetchLiveRate();
  });
}

export async function autoLogin() {
  const savedId = localStorage.getItem('fdxb_userId');
  const savedHash = localStorage.getItem('fdxb_pinHash');
  if (!savedId || !savedHash) {
    document.getElementById('loginScreen').style.display = 'flex';
    return;
  }
  try {
    const stored = await fbGet('users/' + savedId + '/pinHash');
    if (stored === savedHash) {
      app.dbReady = true;
      enterApp(savedId, savedHash);
      return;
    }
  } catch (e) {
    console.log('Auto-login cloud failed');
  }
  app.dbReady = false;
  enterApp(savedId, savedHash);
}
