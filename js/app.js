import { app, loadStateLocal, gm, save, ensureRevState } from './core/state.js';
import { loginPin, logoutUser, autoLogin } from './core/auth.js';
import { go } from './core/router.js';
import { fetchLiveRate } from './utils/currency.js';
import { renderTracker, openNewMonth, createMonth, deleteMonth, openAddRow, addCustomRow } from './pages/tracker.js';
import { renderDashboard } from './pages/dashboard.js';
import { setRevPage, openAddRevenu, openEditRevenu, submitRevenu, deleteRevenu, confirmRevenu, saveRevCats } from './pages/revenus.js';
import { saveRate, savePostes, exportAll, importAll, resetAll } from './pages/settings.js';
import { openTxnModal, openTxnModalExtra, openTxnView, openTxnViewExtra, confirmTxn, setTxnCur, deleteTxn, deleteExtraTxn, editTxn, editExtraTxn } from './components/transactions.js';
import { closeOverlay, initOverlayCloseOnBackdrop } from './components/modals.js';

// Initialize state
app.state = loadStateLocal();
app.curMonth = app.state.months.length > 0 ? app.state.months[app.state.months.length - 1].id : null;

// Expose functions to HTML onclick handlers via window._app
window._app = {
  // Navigation
  go,

  // Auth
  loginPin,
  logoutUser,

  // Tracker
  setCurMonth(id) { app.curMonth = id; renderTracker(); },
  updateMonthField(id, field, val) { gm(id)[field] = parseFloat(val) || 0; save(); renderTracker(); },
  updateBudget(id, i, val) { gm(id).budget[i].aed = parseFloat(val) || 0; save(); renderTracker(); },
  updateBudgetEur(id, i, val) { gm(id).budget[i].eur = parseFloat(val) || 0; save(); renderTracker(); },
  updateActual(id, i, val) { gm(id).actual[i].aed = parseFloat(val) || 0; save(); renderTracker(); },
  updateActualEur(id, i, val) { gm(id).actual[i].eur = parseFloat(val) || 0; save(); renderTracker(); },
  updateExtraBudget(id, i, val) { gm(id).extraBudget[i].aed = parseFloat(val) || 0; save(); renderTracker(); },
  updateExtraActual(id, i, val) { gm(id).extraActual[i].aed = parseFloat(val) || 0; save(); renderTracker(); },
  deleteExtraBudget(id, i) { gm(id).extraBudget.splice(i, 1); save(); renderTracker(); },
  deleteExtraActual(id, i) { gm(id).extraActual.splice(i, 1); save(); renderTracker(); },
  openNewMonth, createMonth, deleteMonth,
  openAddRow, addCustomRow,

  // Transactions
  openTxnModal, openTxnModalExtra, openTxnView, openTxnViewExtra,
  confirmTxn, setTxnCur, deleteTxn, deleteExtraTxn, editTxn, editExtraTxn,

  // Dashboard
  setDashCur(c) {
    app.dashCur = c;
    document.querySelectorAll('#dashCurToggle .cur-btn').forEach(b => b.classList.toggle('on', b.textContent.includes(c)));
    renderDashboard();
  },

  // Revenus
  setRevPage,
  setCurRevMonth(m) { app.curRevMonth = m; import('./pages/revenus.js').then(mod => mod.renderRevenus()); },
  openAddRevenu, openEditRevenu, submitRevenu, deleteRevenu, confirmRevenu, saveRevCats,
  updateRevObj(field, val) {
    ensureRevState();
    if (field === 'mensuel') {
      app.state.revenus.objectif = parseFloat(val) || 5000;
      document.getElementById('revObjAnnuel').value = (app.state.revenus.objectif * 12);
    } else {
      app.state.revenus.objectif = Math.round((parseFloat(val) || 60000) / 12);
      document.getElementById('revObjMensuel').value = app.state.revenus.objectif;
    }
    save();
    import('./pages/revenus.js').then(mod => mod.renderRevGlobal());
  },

  // Settings
  saveRate, savePostes, exportAll, importAll, resetAll,
  fetchLiveRate,

  // Modals
  closeOv: closeOverlay,

  // Hide amounts
  toggleHideAmounts() {
    app.hiddenMode = !app.hiddenMode;
    document.getElementById('hideToggleLabel').textContent = app.hiddenMode ? 'Afficher €' : 'Masquer €';
    document.body.classList.toggle('amounts-hidden', app.hiddenMode);
  }
};

// Chart.js defaults
Chart.defaults.color = '#72728a';
Chart.defaults.borderColor = '#26263a';
Chart.defaults.font.family = "'DM Sans',sans-serif";

// Show initial rate
document.getElementById('sideRate').textContent = app.state.rate.toFixed(4);

// Init overlay close on backdrop click
initOverlayCloseOnBackdrop();

// Auto-refresh rate every 5 minutes
setInterval(() => { if (app.userId) fetchLiveRate(); }, 5 * 60 * 1000);

// Auto-login
autoLogin();
