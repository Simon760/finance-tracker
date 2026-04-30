import { app, gm, save } from '../core/state.js';
import { fbSet } from '../core/firebase.js';
import { fetchLiveRate } from '../utils/currency.js';
import { renderTracker } from './tracker.js';
import { go } from '../core/router.js';

export function renderSettings() {
  document.getElementById('rateIn').value = app.state.rate;
  document.getElementById('postesTA').value = app.state.postes.map(p => `${p.name}|${p.cat}|${p.isAed ? 'aed' : 'eur'}`).join('\n');
}

export function saveRate() {
  app.state.rate = parseFloat(document.getElementById('rateIn').value) || 4.3284;
  document.getElementById('sideRate').textContent = app.state.rate.toFixed(4);
  save();
  renderTracker();
  alert('Taux sauvegardé !');
}

export function savePostes() {
  const lines = document.getElementById('postesTA').value.trim().split('\n').filter(l => l.trim());
  const np = lines.map(l => {
    const [name, cat, type] = l.split('|').map(s => s.trim());
    return { name: name.toUpperCase(), cat: cat || 'vital', isAed: type !== 'eur' };
  });
  app.state.months.forEach(m => {
    while (m.budget.length < np.length) m.budget.push({ aed: 0, eur: null });
    while (m.actual.length < np.length) m.actual.push({ aed: 0, eur: null });
    m.budget = m.budget.slice(0, np.length);
    m.actual = m.actual.slice(0, np.length);
  });
  app.state.postes = np;
  save();
  alert('Postes mis à jour !');
}

export function exportAll() {
  const b = new Blob([JSON.stringify(app.state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b);
  a.download = `finances_dxb_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
}

export function importAll(e) {
  const file = e.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = ev => {
    try {
      app.state = JSON.parse(ev.target.result);
      save();
      app.curMonth = app.state.months.length > 0 ? app.state.months[app.state.months.length - 1].id : null;
      alert('Import OK !');
      go('tracker');
    } catch (err) {
      alert('Erreur: ' + err.message);
    }
  };
  r.readAsText(file);
}

export async function resetAll() {
  if (!confirm('Supprimer TOUTES les données et recharger les données par défaut ?')) return;
  localStorage.removeItem('fdxb_state');
  if (app.dbReady && app.userId) {
    try { await fbSet('users/' + app.userId + '/state', null); } catch (e) { console.log('Firebase clear failed'); }
  }
  location.reload();
}
