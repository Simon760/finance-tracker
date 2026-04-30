import { app, gm, save, PIE_COLORS, MOIS_LIST, ensureRevState } from '../core/state.js';
import { f$, f0 } from '../utils/format.js';
import { toEur, toAed, rowEur } from '../utils/currency.js';
import { sumEur, sumAed, sumEurBudget, sumAedBudget } from '../services/budget.js';
import { isRevSynced, getMonthRevEur, getMonthRevAed } from '../services/revenue.js';
import { createChart, destroyChart, CHART_TOOLTIP, CHART_LEGEND } from '../components/charts.js';
import { openOverlay, closeOverlay } from '../components/modals.js';

// Year detection: assigns years to months based on their order and MOIS_LIST position
function detectYears(months) {
  const yearSet = new Set();
  let curYear = new Date().getFullYear();
  const moisIdx = n => MOIS_LIST.findIndex(m => m === n || m.replace(/[ÉÈÊË]/g, c => ({É:'E',È:'E',Ê:'E',Ë:'E'}[c])) === n || n.startsWith(m.slice(0, 3)));

  if (months.length > 0) {
    // Estimate start year: if first month is late in year, it started previous year
    const firstIdx = moisIdx(months[0].id);
    const lastIdx = moisIdx(months[months.length - 1].id);
    const nowMonth = new Date().getMonth();

    // Work backwards from current date
    if (lastIdx <= nowMonth) {
      curYear = new Date().getFullYear();
    }

    let yr = curYear;
    // Assign from the end backwards
    let prevIdx = lastIdx;
    for (let i = months.length - 1; i >= 0; i--) {
      const idx = moisIdx(months[i].id);
      if (idx > prevIdx) yr--;
      prevIdx = idx;
      months[i]._year = yr;
      yearSet.add(yr);
    }
  }
  return [...yearSet].sort();
}

function filterMonthsByYear(months, year) {
  return months.filter(m => m._year === parseInt(year));
}

export function setYear(y) {
  app.curYear = y;
  const filtered = y === 'all' ? app.state.months : filterMonthsByYear(app.state.months, y);
  if (filtered.length > 0 && !filtered.find(m => m.id === app.curMonth)) {
    app.curMonth = filtered[filtered.length - 1].id;
  }
  renderTracker();
}

export function renderTracker() {
  if (!app.curMonth && app.state.months.length > 0) {
    app.curMonth = app.state.months[app.state.months.length - 1].id;
  }
  if (!app.curMonth) {
    document.getElementById('mTabs').innerHTML = '';
    document.getElementById('soldeRow').innerHTML = '';
    document.getElementById('mKpis').innerHTML = '<div class="card"><div class="kpi-label">Aucun mois</div><div class="kpi-val" style="font-size:14px;color:var(--t3)">Clique "Nouveau mois" pour commencer</div></div>';
    document.getElementById('budgetBody').innerHTML = '';
    document.getElementById('budgetFoot').innerHTML = '';
    document.getElementById('actualBody').innerHTML = '';
    document.getElementById('actualFoot').innerHTML = '';
    document.getElementById('monthChartsArea').style.display = 'none';
    return;
  }
  document.getElementById('monthChartsArea').style.display = '';

  // Year filter
  const years = detectYears(app.state.months);
  const yearSelect = document.getElementById('yearFilter');
  if (yearSelect) {
    yearSelect.innerHTML = `<option value="all">Tous</option>` + years.map(y =>
      `<option value="${y}" ${app.curYear === y ? 'selected' : ''}>${y}</option>`
    ).join('');
    yearSelect.value = app.curYear;
  }

  // Filtered months
  const filteredMonths = app.curYear === 'all' ? app.state.months : filterMonthsByYear(app.state.months, app.curYear);

  // Tabs
  document.getElementById('mTabs').innerHTML = filteredMonths.map(m =>
    `<button class="tab ${m.id === app.curMonth ? 'on' : ''}" onclick="window._app.setCurMonth('${m.id}')">${m.id}</button>`
  ).join('') + `<button class="btn btn-red btn-sm" style="margin-left:6px" onclick="window._app.deleteMonth()">Supprimer</button>`;

  const m = gm(app.curMonth);
  if (!m) return;

  const bA = sumAedBudget(m), bE = sumEurBudget(m);
  const aA = sumAed(m, m.actual, m.extraActual), aE = sumEur(m, m.actual, m.extraActual);

  const synced = isRevSynced(m.id);
  const earnEur = synced ? getMonthRevEur(m.id) : (m.earn || 0);
  const earnAed = synced ? getMonthRevAed(m.id) : toAed(m.earn || 0, m.rate);
  const diff = earnEur - aE;
  const prevCompte = (m.soldeStart || 0) + earnAed - aA;

  let previewEur = 0, previewAed = 0, prevOpti = prevCompte;
  if (synced) {
    ensureRevState();
    const allEntries = app.state.revenus.months[m.id] || [];
    previewEur = allEntries.filter(e => e.status === 'preview').reduce((s, e) => s + (e.cashed || 0), 0);
    previewAed = previewEur * app.state.rate;
    prevOpti = prevCompte + previewAed;
  }

  const earnCard = synced
    ? `<div class="solde-card"><div class="solde-icon">💵</div><div class="solde-info"><div class="solde-lbl">Revenus confirmés</div>
        <div class="solde-val">${f$(earnEur)} €</div><div style="font-size:11px;color:var(--t3);margin-top:2px;font-family:'IBM Plex Mono',monospace">${f0(earnAed)} AED</div>
        ${previewEur > 0 ? `<div style="font-size:10px;color:var(--blue);margin-top:4px">+ ${f$(previewEur)} € en prévision</div>` : ''}</div></div>`
    : `<div class="solde-card"><div class="solde-icon">💵</div><div class="solde-info"><div class="solde-lbl">Revenus (EUR)</div>
        <input class="solde-input" type="number" value="${m.earn || 0}" step="0.01" onchange="window._app.updateMonthField('${m.id}','earn',this.value)"></div></div>`;

  const prevCard = synced && previewEur > 0
    ? `<div class="solde-card"><div class="solde-icon">📊</div><div class="solde-info"><div class="solde-lbl">Prévisionnel (confirmé)</div>
        <div class="solde-val ${prevCompte >= 0 ? 'diff-pos' : 'diff-neg'}">${f0(prevCompte)} AED</div></div></div>
      <div class="solde-card" style="border-color:var(--blue-b);background:var(--blue-bg)"><div class="solde-icon">🔮</div><div class="solde-info"><div class="solde-lbl">Prévisionnel (optimiste)</div>
        <div class="solde-val" style="color:var(--blue)">${f0(prevOpti)} AED</div>
        <div style="font-size:10px;color:var(--t3);margin-top:2px">si ${f$(previewEur)} € confirmés</div></div></div>`
    : `<div class="solde-card"><div class="solde-icon">📊</div><div class="solde-info"><div class="solde-lbl">Prévisionnel compte (AED)</div>
        <div class="solde-val ${prevCompte >= 0 ? 'diff-pos' : 'diff-neg'}">${f0(prevCompte)} AED</div></div></div>`;

  document.getElementById('soldeRow').innerHTML = `
    <div class="solde-card"><div class="solde-icon">🏦</div><div class="solde-info"><div class="solde-lbl">Solde début (AED)</div>
      <input class="solde-input" type="number" value="${m.soldeStart || 0}" step="0.01" onchange="window._app.updateMonthField('${m.id}','soldeStart',this.value)"></div></div>
    <div class="solde-card"><div class="solde-icon">🏦</div><div class="solde-info"><div class="solde-lbl">Solde fin (AED)</div>
      <input class="solde-input" type="number" value="${m.soldeEnd || 0}" step="0.01" onchange="window._app.updateMonthField('${m.id}','soldeEnd',this.value)"></div></div>
    ${prevCard}
    ${earnCard}
    <div class="solde-card"><div class="solde-icon">${diff >= 0 ? '✅' : '⚠️'}</div><div class="solde-info"><div class="solde-lbl">Revenus − Dépenses</div>
      <div class="solde-val ${diff >= 0 ? 'diff-pos' : 'diff-neg'}">${diff >= 0 ? '+' : ''}${f$(diff)} €</div></div></div>
  `;

  document.getElementById('mKpis').innerHTML = `
    <div class="card anim d1"><div class="card-line" style="background:var(--blue)"></div><div class="kpi-label">Budget</div><div class="kpi-val">${f$(bE)} €</div><div class="kpi-sub">${f0(bA)} AED</div></div>
    <div class="card anim d2"><div class="card-line" style="background:var(--amber)"></div><div class="kpi-label">Dépenses du mois</div><div class="kpi-val">${f$(aE)} €</div><div class="kpi-sub">${f0(aA)} AED</div></div>
  `;

  renderBudgetTable(m);
  renderActualTable(m);
  renderMonthCharts(m);
}

function renderBudgetTable(m) {
  let h = '';
  const liveRate = app.state.rate;
  const tE = sumEurBudget(m);

  app.state.postes.forEach((p, i) => {
    const row = m.budget[i];
    const eur = p.isAed ? toEur(row.aed, liveRate) : (row.eur || 0);
    const pct = tE > 0 ? ((eur / tE) * 100).toFixed(1) : '0.0';
    h += `<tr><td><strong>${p.name}</strong></td>
      <td>${p.isAed ? `<input class="cell-input" type="number" value="${row.aed || ''}" step="0.01" placeholder="0" onchange="window._app.updateBudget('${m.id}',${i},this.value)">` : '<span class="mono" style="color:var(--t3)">—</span>'}</td>
      <td>${!p.isAed ? `<input class="cell-input" type="number" value="${row.eur || ''}" step="0.01" placeholder="0" onchange="window._app.updateBudgetEur('${m.id}',${i},this.value)">` : `<span class="mono cell-input eur">${f$(eur)}</span>`}</td>
      <td><div class="mono" style="font-size:11px">${pct}%</div><div class="pbar"><div class="pfill" style="width:${Math.min(pct, 100)}%;background:var(--blue)"></div></div></td></tr>`;
  });

  (m.extraBudget || []).forEach((r, i) => {
    const eur = r.eur > 0 ? r.eur : toEur(r.aed, liveRate);
    h += `<tr><td><strong>${r.name}</strong></td>
      <td><input class="cell-input" type="number" value="${r.aed || ''}" step="0.01" onchange="window._app.updateExtraBudget('${m.id}',${i},this.value)"></td>
      <td><span class="mono cell-input eur">${f$(eur)}</span></td>
      <td><button class="btn-red" onclick="window._app.deleteExtraBudget('${m.id}',${i})">✕</button></td></tr>`;
  });

  h += `<tr><td colspan="4" style="text-align:center;padding:8px"><button class="btn btn-g btn-sm" onclick="window._app.openAddRow('budget')">+ Ajouter un poste</button></td></tr>`;
  document.getElementById('budgetBody').innerHTML = h;

  const tA = sumAedBudget(m);
  document.getElementById('budgetFoot').innerHTML = `<tr style="background:var(--bg2)"><td><strong>TOTAL</strong></td><td class="mono"><strong>${f0(tA)} AED</strong></td><td class="mono"><strong>${f$(tE)} €</strong></td><td></td></tr>`;
}

function renderActualTable(m) {
  let h = '';
  const tE = sumEur(m, m.actual, m.extraActual);

  app.state.postes.forEach((p, i) => {
    const row = m.actual[i], brow = m.budget[i];
    const eur = rowEur(row, m.rate), beur = rowEur(brow, m.rate);
    const txns = row.txns || [];
    const hasTxns = txns.length > 0;
    const eurDisplay = hasTxns ? txns.reduce((s, t) => s + (t.eur || t.amount / (t.rate || m.rate)), 0) : eur;
    const ratio = beur > 0 ? (eurDisplay / beur) : 0, ecart = beur - eurDisplay;
    const rc = ratio > 1.05 ? 'over' : ratio < 0.95 && ratio > 0 ? 'under' : 'neutral';
    const ec = ecart >= 0 ? 'diff-pos' : 'diff-neg';

    h += `<tr><td><strong>${p.name}</strong>
        <button style="background:var(--green-bg);color:var(--green);border:1px solid var(--green-b);padding:1px 6px;font-size:11px;cursor:pointer;border-radius:4px;margin-left:4px;font-weight:700" onclick="window._app.openTxnModal('${m.id}',${i})">+</button>${hasTxns ? `<button style="background:var(--blue-bg);color:var(--blue);border:1px solid var(--blue-b);padding:1px 6px;font-size:10px;cursor:pointer;border-radius:4px;margin-left:2px" onclick="window._app.openTxnView('${m.id}',${i})">👁 ${txns.length}</button>` : ''}</td>
      <td>${p.isAed ? `<input class="cell-input" type="number" value="${row.aed || ''}" step="0.01" placeholder="0" onchange="window._app.updateActual('${m.id}',${i},this.value)">` : '<span class="mono" style="color:var(--t3)">—</span>'}</td>
      <td>${!p.isAed ? `<input class="cell-input" type="number" value="${row.eur || ''}" step="0.01" placeholder="0" onchange="window._app.updateActualEur('${m.id}',${i},this.value)">` : `<span class="mono cell-input eur">${f$(eurDisplay)}</span>`}</td>
      <td><span class="ratio ${rc}">${beur > 0 ? (ratio * 100).toFixed(0) + '%' : '—'}</span></td>
      <td><span class="mono ${ec}">${beur > 0 ? (ecart >= 0 ? '+' : '') + f$(ecart) + ' €' : '—'}</span></td></tr>`;
  });

  (m.extraActual || []).forEach((r, i) => {
    const txns = r.txns || [];
    const hasTxns = txns.length > 0;
    const eurDisplay = hasTxns ? txns.reduce((s, t) => s + (t.eur || t.amount / (t.rate || m.rate)), 0) : (r.eur > 0 ? r.eur : toEur(r.aed, m.rate));

    h += `<tr><td><strong>${r.name}</strong>
        <button style="background:var(--green-bg);color:var(--green);border:1px solid var(--green-b);padding:1px 6px;font-size:11px;cursor:pointer;border-radius:4px;margin-left:4px;font-weight:700" onclick="window._app.openTxnModalExtra('${m.id}',${i})">+</button>${hasTxns ? `<button style="background:var(--blue-bg);color:var(--blue);border:1px solid var(--blue-b);padding:1px 6px;font-size:10px;cursor:pointer;border-radius:4px;margin-left:2px" onclick="window._app.openTxnViewExtra('${m.id}',${i})">👁 ${txns.length}</button>` : ''}</td>
      <td><input class="cell-input" type="number" value="${r.aed || ''}" step="0.01" onchange="window._app.updateExtraActual('${m.id}',${i},this.value)"></td>
      <td><span class="mono cell-input eur">${f$(eurDisplay)}</span></td>
      <td><span class="ratio neutral">—</span></td>
      <td><button class="btn-red" onclick="window._app.deleteExtraActual('${m.id}',${i})">✕</button></td></tr>`;
  });

  h += `<tr><td colspan="5" style="text-align:center;padding:8px"><button class="btn btn-g btn-sm" onclick="window._app.openAddRow('actual')">+ Ajouter un poste</button></td></tr>`;
  document.getElementById('actualBody').innerHTML = h;

  const tBE = sumEurBudget(m);
  const globalRatio = tBE > 0 ? (tE / tBE) : 0;
  const globalPct = tBE > 0 ? (tE / tBE * 100).toFixed(0) + '%' : '—';
  const globalRc = globalRatio > 1.05 ? 'over' : globalRatio < 0.95 && globalRatio > 0 ? 'under' : 'neutral';
  document.getElementById('actualFoot').innerHTML = `<tr style="background:var(--bg2)"><td><strong>TOTAL</strong></td><td class="mono"><strong>${f0(sumAed(m, m.actual, m.extraActual))} AED</strong></td><td class="mono"><strong>${f$(tE)} €</strong></td><td><span class="ratio ${globalRc}">${globalPct}</span></td><td></td></tr>`;
}

function renderMonthCharts(m) {
  const bData = [], aData = [], bLabels = [], aLabels = [];
  app.state.postes.forEach((p, i) => {
    const bv = rowEur(m.budget[i], m.rate), av = rowEur(m.actual[i], m.rate);
    if (bv > 0) { bLabels.push(p.name); bData.push(bv); }
    if (av > 0) { aLabels.push(p.name); aData.push(av); }
  });

  createChart('cMBudgetPie', {
    type: 'doughnut',
    data: { labels: bLabels, datasets: [{ data: bData, backgroundColor: PIE_COLORS, borderWidth: 0, spacing: 2 }] },
    options: { responsive: true, cutout: '58%', plugins: { legend: { position: 'right', labels: CHART_LEGEND }, tooltip: CHART_TOOLTIP } }
  });

  createChart('cMActualPie', {
    type: 'doughnut',
    data: { labels: aLabels, datasets: [{ data: aData, backgroundColor: PIE_COLORS, borderWidth: 0, spacing: 2 }] },
    options: { responsive: true, cutout: '58%', plugins: { legend: { position: 'right', labels: CHART_LEGEND }, tooltip: CHART_TOOLTIP } }
  });

  const allLabels = [...new Set([...bLabels, ...aLabels])];
  const bMap = {}, aMap = {};
  app.state.postes.forEach((p, i) => {
    bMap[p.name] = rowEur(m.budget[i], m.rate);
    aMap[p.name] = rowEur(m.actual[i], m.rate);
  });

  createChart('cMCompare', {
    type: 'bar',
    data: {
      labels: allLabels.map(l => l.slice(0, 8)),
      datasets: [
        { label: 'Budget', data: allLabels.map(l => bMap[l] || 0), backgroundColor: 'rgba(59,130,246,.3)', borderRadius: 4 },
        { label: 'Réel', data: allLabels.map(l => aMap[l] || 0), backgroundColor: 'rgba(236,72,153,.35)', borderRadius: 4 },
      ]
    },
    options: {
      responsive: true, indexAxis: 'y',
      plugins: {
        legend: { labels: { usePointStyle: true, pointStyle: 'circle', font: { size: 10 }, color: '#a1a1aa' } },
        tooltip: CHART_TOOLTIP
      },
      scales: { x: { grid: { color: 'rgba(30,30,42,.5)' } }, y: { grid: { display: false } } }
    }
  });
}

// Month management
export function openNewMonth() {
  document.getElementById('nmRate').value = app.state.rate;
  document.getElementById('nmName').value = '';
  document.getElementById('nmSoldeStart').value = '';
  openOverlay('ovMonth');
}

export function createMonth() {
  const name = document.getElementById('nmName').value.trim().toUpperCase();
  if (!name) return alert('Nom requis');
  if (app.state.months.find(m => m.id === name)) return alert('Ce mois existe déjà');
  const rate = parseFloat(document.getElementById('nmRate').value) || app.state.rate;
  const soldeStart = parseFloat(document.getElementById('nmSoldeStart').value) || 0;
  const mo = { id: name, rate, earn: 0, soldeStart, soldeEnd: 0, budget: [], actual: [], extraBudget: [], extraActual: [] };

  if (app.state.months.length > 0) {
    const last = app.state.months[app.state.months.length - 1];
    app.state.postes.forEach((_, i) => {
      mo.budget.push({ aed: last.budget[i] ? last.budget[i].aed : 0, eur: last.budget[i] ? last.budget[i].eur : null });
      mo.actual.push({ aed: 0, eur: null });
    });
    if (last.soldeEnd > 0) mo.soldeStart = last.soldeEnd;
  } else {
    app.state.postes.forEach(() => { mo.budget.push({ aed: 0, eur: null }); mo.actual.push({ aed: 0, eur: null }); });
  }

  app.state.months.push(mo);
  app.curMonth = name;
  save();
  closeOverlay('ovMonth');
  renderTracker();
}

export function deleteMonth() {
  if (!confirm(`Supprimer ${app.curMonth} ?`)) return;
  app.state.months = app.state.months.filter(m => m.id !== app.curMonth);
  app.curMonth = app.state.months.length > 0 ? app.state.months[app.state.months.length - 1].id : null;
  save();
  renderTracker();
}

export function openAddRow(section) {
  document.getElementById('arSection').value = section;
  document.getElementById('arName').value = '';
  document.getElementById('arAed').value = '0';
  document.getElementById('arEur').value = '0';
  openOverlay('ovRow');
}

export function addCustomRow() {
  const m = gm(app.curMonth);
  const section = document.getElementById('arSection').value;
  const name = document.getElementById('arName').value.trim().toUpperCase() || 'AUTRE';
  const cat = document.getElementById('arCat').value;
  const aed = parseFloat(document.getElementById('arAed').value) || 0;
  const eur = parseFloat(document.getElementById('arEur').value) || 0;
  const row = { name, cat, aed, eur };

  if (section === 'budget') {
    if (!m.extraBudget) m.extraBudget = [];
    m.extraBudget.push(row);
    if (!m.extraActual) m.extraActual = [];
    if (!m.extraActual.find(r => r.name === name)) {
      m.extraActual.push({ name, cat, aed: 0, eur: 0 });
    }
  } else {
    if (!m.extraActual) m.extraActual = [];
    m.extraActual.push(row);
  }

  save();
  closeOverlay('ovRow');
  renderTracker();
}
