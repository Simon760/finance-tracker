import { app, gm, save } from '../core/state.js';
import { f$ } from '../utils/format.js';
import { openOverlay, closeOverlay } from './modals.js';
import { renderTracker } from '../pages/tracker.js';

function recalcActualFromTxns(monthId, posteIdx) {
  const m = gm(monthId);
  const txns = m.actual[posteIdx].txns || [];
  const p = app.state.postes[posteIdx];
  if (txns.length === 0) {
    if (p.isAed) { m.actual[posteIdx].aed = 0; m.actual[posteIdx].eur = null; }
    else { m.actual[posteIdx].eur = 0; }
    return;
  }
  if (p.isAed) {
    m.actual[posteIdx].aed = Math.round(txns.reduce((s, t) => s + t.amount, 0) * 100) / 100;
    m.actual[posteIdx].eur = Math.round(txns.reduce((s, t) => s + (t.eur || t.amount / (t.rate || app.state.rate)), 0) * 100) / 100;
  } else {
    m.actual[posteIdx].eur = Math.round(txns.reduce((s, t) => s + (t.eur || t.amount / (t.rate || app.state.rate)), 0) * 100) / 100;
  }
}

function setupAmountInput() {
  document.getElementById('txnAmount').oninput = function () {
    const v = parseFloat(this.value) || 0;
    if (v > 0) {
      document.getElementById('txnConvVal').textContent =
        app.txnCur === 'AED' ? f$(v / app.state.rate) + ' €' : f$(v * app.state.rate) + ' AED';
    } else {
      document.getElementById('txnConvVal').textContent = '—';
    }
  };
}

function resetTxnModal(title) {
  app.txnCur = 'AED';
  document.getElementById('txnTitle').textContent = title;
  document.getElementById('txnLabel').value = '';
  document.getElementById('txnAmount').value = '';
  document.getElementById('txnRate').textContent = app.state.rate.toFixed(4);
  document.getElementById('txnConvVal').textContent = '—';
  document.getElementById('txnAmountLabel').textContent = 'Montant (AED)';
  document.getElementById('txnConvLabel').textContent = 'Équivalent EUR';
  document.querySelectorAll('#txnCurToggle .cur-btn').forEach((b, i) => b.classList.toggle('on', i === 0));
  setupAmountInput();
}

function fillTxnModal(t, title) {
  const cur = t.currency || 'AED';
  app.txnCur = cur;
  document.getElementById('txnTitle').textContent = title;
  document.getElementById('txnLabel').value = t.label || '';
  document.getElementById('txnAmount').value = t.originalAmount || t.amount || '';
  document.getElementById('txnRate').textContent = app.state.rate.toFixed(4);
  document.getElementById('txnAmountLabel').textContent = 'Montant (' + cur + ')';
  document.getElementById('txnConvLabel').textContent = cur === 'AED' ? 'Équivalent EUR' : 'Équivalent AED';
  document.querySelectorAll('#txnCurToggle .cur-btn').forEach((b, i) => b.classList.toggle('on', i === (cur === 'AED' ? 0 : 1)));
  const v = parseFloat(document.getElementById('txnAmount').value) || 0;
  document.getElementById('txnConvVal').textContent = v > 0 ? (cur === 'AED' ? f$(v / app.state.rate) + ' €' : f$(v * app.state.rate) + ' AED') : '—';
  setupAmountInput();
}

export function setTxnCur(cur) {
  app.txnCur = cur;
  document.querySelectorAll('#txnCurToggle .cur-btn').forEach((b, i) => b.classList.toggle('on', i === (cur === 'AED' ? 0 : 1)));
  document.getElementById('txnAmountLabel').textContent = 'Montant (' + cur + ')';
  document.getElementById('txnConvLabel').textContent = cur === 'AED' ? 'Équivalent EUR' : 'Équivalent AED';
  const v = parseFloat(document.getElementById('txnAmount').value) || 0;
  if (v > 0) {
    document.getElementById('txnConvVal').textContent = cur === 'AED' ? f$(v / app.state.rate) + ' €' : f$(v * app.state.rate) + ' AED';
  } else {
    document.getElementById('txnConvVal').textContent = '—';
  }
}

export function openTxnModal(monthId, posteIdx) {
  app.txnTarget = { monthId, posteIdx };
  const p = app.state.postes[posteIdx];
  resetTxnModal('Transaction — ' + p.name);
  openOverlay('ovTxn');
  document.getElementById('txnLabel').focus();
}

export function openTxnModalExtra(monthId, extraIdx) {
  app.txnTarget = { monthId, extraIdx, isExtra: true };
  const r = gm(monthId).extraActual[extraIdx];
  resetTxnModal('Transaction — ' + r.name);
  openOverlay('ovTxn');
  document.getElementById('txnLabel').focus();
}

export function confirmTxn() {
  if (!app.txnTarget) return;
  const label = document.getElementById('txnLabel').value.trim() || '—';
  const inputAmount = parseFloat(document.getElementById('txnAmount').value) || 0;
  if (inputAmount <= 0) return alert('Montant requis');
  const rate = app.state.rate;
  const amountAed = app.txnCur === 'EUR' ? inputAmount * rate : inputAmount;
  const eurVal = app.txnCur === 'EUR' ? inputAmount : inputAmount / rate;

  const txnEntry = {
    label, amount: Math.round(amountAed * 100) / 100, rate,
    eur: Math.round(eurVal * 100) / 100,
    date: new Date().toISOString().split('T')[0],
    currency: app.txnCur,
    originalAmount: Math.round(inputAmount * 100) / 100
  };

  const m = gm(app.txnTarget.monthId);
  const isEdit = app.txnTarget.editIdx !== undefined;

  if (app.txnTarget.isExtra) {
    const r = m.extraActual[app.txnTarget.extraIdx];
    if (!r.txns) r.txns = [];
    if (isEdit) r.txns[app.txnTarget.editIdx] = txnEntry;
    else r.txns.push(txnEntry);
    r.aed = Math.round(r.txns.reduce((s, t) => s + t.amount, 0) * 100) / 100;
    r.eur = Math.round(r.txns.reduce((s, t) => s + (t.eur || t.amount / (t.rate || app.state.rate)), 0) * 100) / 100;
  } else {
    const idx = app.txnTarget.posteIdx;
    if (!m.actual[idx].txns) m.actual[idx].txns = [];
    if (isEdit) m.actual[idx].txns[app.txnTarget.editIdx] = txnEntry;
    else m.actual[idx].txns.push(txnEntry);
    recalcActualFromTxns(app.txnTarget.monthId, idx);
  }

  app.txnTarget = null;
  save();
  closeOverlay('ovTxn');
  renderTracker();
}

export function openTxnView(monthId, posteIdx) {
  const m = gm(monthId);
  const p = app.state.postes[posteIdx];
  const txns = m.actual[posteIdx].txns || [];
  renderTxnViewTable(txns, p.name + ' (' + m.id + ')', monthId, posteIdx, false);
}

export function openTxnViewExtra(monthId, extraIdx) {
  const m = gm(monthId);
  const r = m.extraActual[extraIdx];
  const txns = r.txns || [];
  renderTxnViewTable(txns, r.name + ' (' + m.id + ')', monthId, extraIdx, true);
}

function renderTxnViewTable(txns, title, monthId, idx, isExtra) {
  document.getElementById('txnViewTitle').textContent = 'Transactions — ' + title;
  if (txns.length === 0) {
    document.getElementById('txnViewBody').innerHTML = '<p style="color:var(--t3);text-align:center;padding:20px">Aucune transaction enregistrée</p>';
  } else {
    let total = 0, totalEur = 0;
    let h = '<table style="width:100%"><thead><tr><th>Date</th><th>Libellé</th><th style="text-align:right">AED</th><th style="text-align:right">Taux</th><th style="text-align:right">EUR</th><th></th></tr></thead><tbody>';
    txns.forEach((t, ti) => {
      const eur = t.eur || t.amount / (t.rate || app.state.rate);
      total += t.amount; totalEur += eur;
      const curBadge = t.currency === 'EUR' ? '<span style="font-size:9px;background:var(--blue-bg);color:var(--blue);padding:1px 4px;border-radius:3px;margin-left:4px">€</span>' : '';
      const editFn = isExtra ? `editExtraTxn('${monthId}',${idx},${ti})` : `editTxn('${monthId}',${idx},${ti})`;
      const delFn = isExtra ? `deleteExtraTxn('${monthId}',${idx},${ti})` : `deleteTxn('${monthId}',${idx},${ti})`;
      h += `<tr>
        <td style="font-size:11px;color:var(--t2)">${t.date || '—'}</td>
        <td style="font-size:12px">${t.label}${curBadge}</td>
        <td class="mono" style="font-size:12px">${f$(t.amount)}</td>
        <td class="mono" style="font-size:11px;color:var(--t3)">${(t.rate || 0).toFixed(4)}</td>
        <td class="mono" style="font-size:12px;color:var(--green)">${f$(eur)}</td>
        <td style="text-align:center;white-space:nowrap"><button class="btn-green" style="padding:3px 7px;font-size:10px;margin-right:3px;cursor:pointer" onclick="event.stopPropagation();${editFn}">✎</button><button class="btn-red" style="padding:4px 10px;font-size:12px;cursor:pointer;position:relative;z-index:10" onclick="event.stopPropagation();${delFn}">✕</button></td></tr>`;
    });
    h += `</tbody><tfoot><tr style="background:var(--bg2)"><td colspan="2"><strong>TOTAL (${txns.length})</strong></td><td class="mono"><strong>${f$(total)}</strong></td><td></td><td class="mono"><strong>${f$(totalEur)}</strong></td><td></td></tr></tfoot></table>`;
    document.getElementById('txnViewBody').innerHTML = h;
  }
  openOverlay('ovTxnView');
}

export function deleteTxn(monthId, posteIdx, txnIdx) {
  const m = gm(monthId);
  m.actual[posteIdx].txns.splice(txnIdx, 1);
  recalcActualFromTxns(monthId, posteIdx);
  save();
  openTxnView(monthId, posteIdx);
  renderTracker();
}

export function deleteExtraTxn(monthId, extraIdx, txnIdx) {
  const m = gm(monthId);
  const r = m.extraActual[extraIdx];
  r.txns.splice(txnIdx, 1);
  const txns = r.txns || [];
  r.aed = txns.length > 0 ? Math.round(txns.reduce((s, t) => s + t.amount, 0) * 100) / 100 : 0;
  r.eur = txns.length > 0 ? Math.round(txns.reduce((s, t) => s + (t.eur || t.amount / (t.rate || app.state.rate)), 0) * 100) / 100 : 0;
  save();
  openTxnViewExtra(monthId, extraIdx);
  renderTracker();
}

export function editTxn(monthId, posteIdx, txnIdx) {
  const m = gm(monthId);
  const t = m.actual[posteIdx].txns[txnIdx];
  const p = app.state.postes[posteIdx];
  closeOverlay('ovTxnView');
  app.txnTarget = { monthId, posteIdx, editIdx: txnIdx };
  fillTxnModal(t, 'Modifier — ' + p.name);
  openOverlay('ovTxn');
  document.getElementById('txnLabel').focus();
}

export function editExtraTxn(monthId, extraIdx, txnIdx) {
  const m = gm(monthId);
  const t = m.extraActual[extraIdx].txns[txnIdx];
  const r = m.extraActual[extraIdx];
  closeOverlay('ovTxnView');
  app.txnTarget = { monthId, extraIdx, isExtra: true, editIdx: txnIdx };
  fillTxnModal(t, 'Modifier — ' + r.name);
  openOverlay('ovTxn');
  document.getElementById('txnLabel').focus();
}
