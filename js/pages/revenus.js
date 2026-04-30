import { app, MOIS_LIST, ensureRevState, save } from '../core/state.js';
import { f$ } from '../utils/format.js';
import { revCatColor, getRevMonth } from '../services/revenue.js';
import { createChart, CHART_TOOLTIP, CHART_LEGEND } from '../components/charts.js';
import { openOverlay, closeOverlay } from '../components/modals.js';

export function renderRevenus() {
  ensureRevState();
  setTimeout(() => {
    if (app.revPage === 'tracker') renderRevTracker();
    else renderRevGlobal();
  }, 50);
}

export function setRevPage(pg) {
  app.revPage = pg;
  document.getElementById('revPgTracker').style.display = pg === 'tracker' ? '' : 'none';
  document.getElementById('revPgGlobal').style.display = pg === 'global' ? '' : 'none';
  document.querySelectorAll('#revPageToggle .cur-btn').forEach(b => b.classList.remove('on'));
  document.querySelectorAll('#revPageToggle .cur-btn')[pg === 'tracker' ? 0 : 1].classList.add('on');
  if (pg === 'tracker') renderRevTracker();
  else renderRevGlobal();
}

export function openAddRevenu() {
  app.rvEditMode = null;
  ensureRevState();
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('rvDate').value = today;
  document.getElementById('rvClient').value = '';
  document.getElementById('rvContracted').value = '';
  document.getElementById('rvCashed').value = '';
  document.getElementById('rvComment').value = '';
  document.getElementById('rvTitle').textContent = 'Ajouter un revenu';
  document.getElementById('rvSubmitBtn').textContent = 'Ajouter';
  const sel = document.getElementById('rvCat');
  sel.innerHTML = (app.state.revenus.categories || []).map(c => `<option value="${c}">${c}</option>`).join('');
  openOverlay('ovRevenu');
}

export function openEditRevenu(month, idx) {
  app.rvEditMode = { month, idx };
  ensureRevState();
  const e = app.state.revenus.months[month][idx];
  document.getElementById('rvDate').value = e.date || '';
  document.getElementById('rvClient').value = e.client || '';
  document.getElementById('rvContracted').value = e.contracted || '';
  document.getElementById('rvCashed').value = e.cashed || '';
  document.getElementById('rvComment').value = e.comment || '';
  document.getElementById('rvTitle').textContent = 'Modifier le revenu';
  document.getElementById('rvSubmitBtn').textContent = 'Enregistrer';
  const sel = document.getElementById('rvCat');
  sel.innerHTML = (app.state.revenus.categories || []).map(c => `<option value="${c}">${c}</option>`).join('');
  sel.value = e.cat || '';
  openOverlay('ovRevenu');
}

export function submitRevenu() {
  const date = document.getElementById('rvDate').value;
  const client = document.getElementById('rvClient').value.trim().toUpperCase() || '—';
  const cat = document.getElementById('rvCat').value;
  const contracted = parseFloat(document.getElementById('rvContracted').value) || 0;
  const cashed = parseFloat(document.getElementById('rvCashed').value) || 0;
  const comment = document.getElementById('rvComment').value.trim();
  if (!date) return alert('Date requise');
  if (contracted === 0 && cashed === 0) return alert('Montant requis');
  const d = new Date(date);
  const mName = MOIS_LIST[d.getMonth()];
  const entry = { date, client, cat, contracted, cashed, comment, rate: app.state.rate, status: 'preview' };

  if (app.rvEditMode) {
    app.state.revenus.months[app.rvEditMode.month].splice(app.rvEditMode.idx, 1);
    if (app.state.revenus.months[app.rvEditMode.month].length === 0) delete app.state.revenus.months[app.rvEditMode.month];
  }

  const entries = getRevMonth(mName);
  entries.push(entry);
  entries.sort((a, b) => a.date.localeCompare(b.date));
  app.curRevMonth = mName;
  app.rvEditMode = null;
  save();
  closeOverlay('ovRevenu');
  renderRevTracker();
}

export function deleteRevenu(month, idx) {
  if (!confirm('Supprimer cette entrée ?')) return;
  app.state.revenus.months[month].splice(idx, 1);
  save();
  renderRevTracker();
}

export function confirmRevenu(month, idx) {
  const e = app.state.revenus.months[month][idx];
  e.status = 'confirmed';
  e.rate = app.state.rate;
  save();
  renderRevTracker();
}

export function saveRevCats() {
  const raw = document.getElementById('revCatsTA').value.trim();
  const cats = raw.split('\n').map(s => s.trim().toUpperCase()).filter(s => s.length > 0);
  if (cats.length === 0) return alert('Au moins une catégorie');
  app.state.revenus.categories = cats;
  save();
  renderRevGlobal();
}

function renderRevTracker() {
  ensureRevState();
  const rm = app.state.revenus.months;
  const activeMonths = MOIS_LIST.filter(m => rm[m] && rm[m].length > 0);
  if (!app.curRevMonth && activeMonths.length > 0) app.curRevMonth = activeMonths[activeMonths.length - 1];
  if (!app.curRevMonth) app.curRevMonth = MOIS_LIST[new Date().getMonth()];

  document.getElementById('revTabs').innerHTML = MOIS_LIST.map(m => {
    const hasData = rm[m] && rm[m].length > 0;
    return `<button class="tab ${m === app.curRevMonth ? 'on' : ''}" onclick="window._app.setCurRevMonth('${m}')" style="color:${hasData ? '#f2f2fa' : '#6e6e8a'}">${m.slice(0, 3)}</button>`;
  }).join('');

  const entries = rm[app.curRevMonth] || [];
  const totalContracted = entries.reduce((s, e) => s + e.contracted, 0);
  const totalCashed = entries.reduce((s, e) => s + e.cashed, 0);
  const confirmedCashed = entries.filter(e => !e.status || e.status === 'confirmed').reduce((s, e) => s + e.cashed, 0);
  const previewCashed = entries.filter(e => e.status === 'preview').reduce((s, e) => s + e.cashed, 0);
  const obj = app.state.revenus.objectif || 5000;
  const delta = totalCashed - obj;
  const pct = obj > 0 ? (totalCashed / obj * 100) : 0;

  document.getElementById('revKpis').innerHTML = `
    <div class="solde-card"><div class="solde-icon">🎯</div><div class="solde-info"><div class="solde-lbl">Objectif</div><div class="solde-val">${f$(obj)} €</div></div></div>
    <div class="solde-card"><div class="solde-icon">💰</div><div class="solde-info"><div class="solde-lbl">Encaissé (confirmé)</div>
      <div class="solde-val" style="color:var(--green)">${f$(confirmedCashed)} €</div>${previewCashed > 0 ? `<div style="font-size:10px;color:var(--blue);margin-top:2px">+ ${f$(previewCashed)} € en prévision</div>` : ''}</div></div>
    <div class="solde-card"><div class="solde-icon">📝</div><div class="solde-info"><div class="solde-lbl">Contracté</div><div class="solde-val">${f$(totalContracted)} €</div></div></div>
    <div class="solde-card"><div class="solde-icon">${delta >= 0 ? '✅' : '⚠️'}</div><div class="solde-info"><div class="solde-lbl">Delta</div>
      <div class="solde-val ${delta >= 0 ? 'diff-pos' : 'diff-neg'}">${delta >= 0 ? '+' : ''}${f$(delta)} €</div></div></div>
    <div class="solde-card"><div class="solde-icon">📊</div><div class="solde-info"><div class="solde-lbl">Atteinte</div>
      <div class="solde-val" style="color:${pct >= 100 ? 'var(--green)' : 'var(--amber)'}"><strong>${pct.toFixed(0)}%</strong></div></div></div>
  `;

  let h = '';
  entries.forEach((e, i) => {
    const dateStr = e.date ? new Date(e.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '—';
    const catColor = revCatColor(e.cat);
    const st = e.status || 'confirmed';
    const isPreview = st === 'preview';
    const isPending = st === 'pending';
    const isConfirmed = st === 'confirmed';
    const rowStyle = isPreview ? 'opacity:0.7;border-left:3px solid var(--blue)' : isPending ? 'opacity:0.6;background:var(--amber-bg);border-left:3px solid var(--amber)' : 'border-left:3px solid var(--green)';
    const statusBadge = isPreview ? '<span style="font-size:9px;background:var(--blue-bg);color:var(--blue);padding:1px 6px;border-radius:4px;margin-left:6px">PRÉVISION</span>' : isPending ? '<span style="font-size:9px;background:var(--amber-bg);color:var(--amber);padding:1px 6px;border-radius:4px;margin-left:6px">EN ATTENTE</span>' : '<span style="font-size:9px;background:var(--green-bg);color:var(--green);padding:1px 6px;border-radius:4px;margin-left:6px">CONFIRMÉ</span>';
    const confirmBtn = !isConfirmed ? `<button class="btn-green" style="padding:3px 7px;font-size:10px;margin-right:4px" onclick="window._app.confirmRevenu('${app.curRevMonth}',${i})" title="Confirmer le revenu">✓</button>` : '';
    h += `<tr style="${rowStyle}">
      <td>${dateStr}</td><td><strong>${e.client}</strong>${statusBadge}</td>
      <td><span style="background:${catColor}22;color:${catColor};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:500">${e.cat}</span></td>
      <td class="mono">${e.contracted > 0 ? f$(e.contracted) + ' €' : '—'}</td>
      <td class="mono" style="color:${isConfirmed ? 'var(--green)' : isPending ? 'var(--amber)' : 'var(--blue)'}">${e.cashed > 0 ? f$(e.cashed) + ' €' : '—'}${isPending ? ' ⏳' : ''}</td>
      <td style="font-size:12px;color:var(--t2)">${e.comment || ''}</td>
      <td style="white-space:nowrap">${confirmBtn}<button class="btn-green" style="padding:3px 7px;font-size:10px;margin-right:4px" onclick="window._app.openEditRevenu('${app.curRevMonth}',${i})">✎</button><button class="btn-red" onclick="window._app.deleteRevenu('${app.curRevMonth}',${i})">✕</button></td></tr>`;
  });
  if (entries.length === 0) h = '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--t3)">Aucun revenu ce mois</td></tr>';
  document.getElementById('revBody').innerHTML = h;
  document.getElementById('revFoot').innerHTML = entries.length > 0 ? `<tr style="background:var(--bg2)"><td colspan="2"><strong>TOTAL ${app.curRevMonth}</strong></td><td></td><td class="mono"><strong>${f$(totalContracted)} €</strong></td><td class="mono"><strong>${f$(totalCashed)} €</strong></td><td colspan="2"></td></tr>` : '';

  // Pie
  const srcTotals = {};
  entries.forEach(e => { srcTotals[e.cat] = (srcTotals[e.cat] || 0) + e.cashed; });
  const srcLabels = Object.keys(srcTotals).filter(k => srcTotals[k] > 0);
  if (srcLabels.length > 0) {
    createChart('cRevPie', {
      type: 'doughnut',
      data: { labels: srcLabels, datasets: [{ data: srcLabels.map(k => srcTotals[k]), backgroundColor: srcLabels.map(k => revCatColor(k)), borderWidth: 0, spacing: 2 }] },
      options: { responsive: true, cutout: '60%', plugins: { legend: { position: 'right', labels: CHART_LEGEND }, tooltip: CHART_TOOLTIP } }
    });
  }

  // Evolution bar
  const evoLabels = MOIS_LIST.map(m => m.slice(0, 3));
  const evoCashed = MOIS_LIST.map(m => (rm[m] || []).reduce((s, e) => s + e.cashed, 0));
  createChart('cRevEvo', {
    type: 'bar',
    data: {
      labels: evoLabels,
      datasets: [
        { label: 'Encaissé', data: evoCashed, backgroundColor: MOIS_LIST.map(m => m === app.curRevMonth ? 'rgba(52,211,153,.7)' : 'rgba(52,211,153,.3)'), borderRadius: 6 },
        { type: 'line', label: 'Objectif', data: MOIS_LIST.map(() => obj), borderColor: '#f87171', borderDash: [6, 4], borderWidth: 2, pointRadius: 0, fill: false },
      ]
    },
    options: {
      responsive: true,
      scales: { y: { grid: { color: 'rgba(38,38,58,.4)' } }, x: { grid: { display: false } } },
      plugins: {
        legend: { labels: { usePointStyle: true, pointStyle: 'circle', font: { size: 10 }, color: '#b0b0c8' } },
        tooltip: { ...CHART_TOOLTIP, callbacks: { label: ctx => `${ctx.dataset.label}: ${f$(ctx.parsed.y)} €` } }
      }
    }
  });
}

export function renderRevGlobal() {
  ensureRevState();
  const rm = app.state.revenus.months;
  const obj = app.state.revenus.objectif || 5000;

  document.getElementById('revObjMensuel').value = obj;
  document.getElementById('revObjAnnuel').value = obj * 12;
  document.getElementById('revCatsTA').value = (app.state.revenus.categories || []).join('\n');

  let yearContracted = 0, yearCashed = 0;
  const monthData = [];
  let prevCashed = null;
  MOIS_LIST.forEach(m => {
    const me = rm[m] || [];
    const mc = me.reduce((s, e) => s + e.contracted, 0);
    const mk = me.reduce((s, e) => s + e.cashed, 0);
    yearContracted += mc; yearCashed += mk;
    const md = mk - obj, mp = obj > 0 ? (mk / obj * 100) : 0;
    const vsM1 = prevCashed !== null ? (mk - prevCashed) : null;
    monthData.push({ name: m, contracted: mc, cashed: mk, delta: md, pct: mp, vsM1, hasData: me.length > 0 });
    if (me.length > 0) prevCashed = mk;
  });

  const yearObj = obj * 12;
  const yearPct = yearObj > 0 ? (yearCashed / yearObj * 100) : 0;
  const activeMonths = monthData.filter(m => m.hasData).length;
  const avg = activeMonths > 0 ? yearCashed / activeMonths : 0;
  const yearPL = yearCashed - yearObj;
  const plLabel = yearPL >= 0 ? 'Surplus' : 'Reste à atteindre';

  document.getElementById('revGlobalKpis').innerHTML = `
    <div style="flex:1;min-width:120px"><div style="font-size:10px;color:var(--t3);text-transform:uppercase;margin-bottom:4px">Total encaissé</div><div style="font-size:20px;font-weight:600;color:var(--green)">${f$(yearCashed)} €</div></div>
    <div style="flex:1;min-width:120px"><div style="font-size:10px;color:var(--t3);text-transform:uppercase;margin-bottom:4px">Objectif annuel</div><div style="font-size:20px;font-weight:600">${f$(yearObj)} €</div></div>
    <div style="flex:1;min-width:120px"><div style="font-size:10px;color:var(--t3);text-transform:uppercase;margin-bottom:4px">${plLabel}</div><div style="font-size:20px;font-weight:600;color:${yearPL >= 0 ? 'var(--green)' : 'var(--red)'}">${yearPL >= 0 ? '+' : ''}${f$(yearPL)} €</div></div>
    <div style="flex:1;min-width:120px"><div style="font-size:10px;color:var(--t3);text-transform:uppercase;margin-bottom:4px">Atteinte</div><div style="font-size:20px;font-weight:600;color:${yearPct >= 100 ? 'var(--green)' : 'var(--amber)'}"><strong>${yearPct.toFixed(0)}%</strong></div></div>
    <div style="flex:1;min-width:120px"><div style="font-size:10px;color:var(--t3);text-transform:uppercase;margin-bottom:4px">Moyenne/mois</div><div style="font-size:20px;font-weight:600">${f$(avg)} €</div></div>
  `;

  // Source summary
  const srcTotals = {};
  Object.values(rm).flat().forEach(e => { srcTotals[e.cat] = (srcTotals[e.cat] || 0) + e.cashed; });
  const srcEntries = Object.entries(srcTotals).sort((a, b) => b[1] - a[1]);
  document.getElementById('revSourceSummary').innerHTML = `<div style="font-size:10px;color:var(--t3);text-transform:uppercase;margin-bottom:8px">Par source</div>` +
    srcEntries.map(([cat, val]) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--border)">
      <span style="display:flex;align-items:center;gap:8px"><span style="width:8px;height:8px;border-radius:50%;background:${revCatColor(cat)}"></span>${cat}</span>
      <span class="mono" style="font-size:13px">${f$(val)} €</span></div>`).join('');

  // Annual table
  let ah = '';
  monthData.forEach(m => {
    if (!m.hasData) return;
    const vsStr = m.vsM1 !== null ? `<span class="mono ${m.vsM1 >= 0 ? 'diff-pos' : 'diff-neg'}">${m.vsM1 >= 0 ? '+' : ''}${f$(m.vsM1)} €</span>` : '—';
    ah += `<tr><td><strong>${m.name}</strong></td>
      <td class="mono">${f$(obj)} €</td>
      <td class="mono">${f$(m.contracted)} €</td>
      <td class="mono">${f$(m.cashed)} €</td>
      <td class="mono ${m.delta >= 0 ? 'diff-pos' : 'diff-neg'}">${m.delta >= 0 ? '+' : ''}${f$(m.delta)} €</td>
      <td><span class="ratio ${m.pct >= 100 ? 'under' : 'over'}">${m.pct.toFixed(0)}%</span></td>
      <td>${vsStr}</td></tr>`;
  });
  document.getElementById('revAnnualBody').innerHTML = ah || '<tr><td colspan="7" style="text-align:center;padding:16px;color:var(--t3)">Pas encore de données</td></tr>';
  const yearDelta = yearCashed - yearObj;
  document.getElementById('revAnnualFoot').innerHTML = yearCashed > 0 ? `<tr style="background:var(--bg2)"><td><strong>TOTAL 2026</strong></td><td class="mono"><strong>${f$(yearObj)} €</strong></td><td class="mono"><strong>${f$(yearContracted)} €</strong></td><td class="mono"><strong>${f$(yearCashed)} €</strong></td><td class="mono ${yearDelta >= 0 ? 'diff-pos' : 'diff-neg'}"><strong>${yearDelta >= 0 ? '+' : ''}${f$(yearDelta)} €</strong></td><td><span class="ratio ${yearPct >= 100 ? 'under' : 'over'}">${yearPct.toFixed(0)}%</span></td><td></td></tr>` : '';

  // Charts
  const evoLabels = MOIS_LIST.map(m => m.slice(0, 3));
  const evoCashed = MOIS_LIST.map(m => (rm[m] || []).reduce((s, e) => s + e.cashed, 0));
  const evoContracted = MOIS_LIST.map(m => (rm[m] || []).reduce((s, e) => s + e.contracted, 0));

  createChart('cRevGloEvo', {
    type: 'bar',
    data: {
      labels: evoLabels,
      datasets: [
        { label: 'Encaissé', data: evoCashed, backgroundColor: 'rgba(52,211,153,.5)', borderRadius: 6 },
        { label: 'Contracté', data: evoContracted, backgroundColor: 'rgba(96,165,250,.3)', borderRadius: 6 },
        { type: 'line', label: 'Objectif', data: MOIS_LIST.map(() => obj), borderColor: '#f87171', borderDash: [6, 4], borderWidth: 2, pointRadius: 0, fill: false },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { grid: { color: 'rgba(38,38,58,.4)' } }, x: { grid: { display: false } } },
      plugins: {
        legend: { labels: { usePointStyle: true, pointStyle: 'circle', font: { size: 10 }, color: '#b0b0c8' } },
        tooltip: { ...CHART_TOOLTIP, callbacks: { label: ctx => `${ctx.dataset.label}: ${f$(ctx.parsed.y)} €` } }
      }
    }
  });

  // Annual pie
  if (srcEntries.length > 0) {
    createChart('cRevGloPie', {
      type: 'doughnut',
      data: { labels: srcEntries.map(([k]) => k), datasets: [{ data: srcEntries.map(([, v]) => v), backgroundColor: srcEntries.map(([k]) => revCatColor(k)), borderWidth: 0, spacing: 2 }] },
      options: { responsive: true, cutout: '60%', plugins: { legend: { position: 'right', labels: CHART_LEGEND }, tooltip: CHART_TOOLTIP } }
    });
  }

  // Quarterly
  const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
  const qData = quarters.map((_, qi) => {
    const ms = MOIS_LIST.slice(qi * 3, qi * 3 + 3);
    return ms.reduce((s, m) => (rm[m] || []).reduce((s2, e) => s2 + e.cashed, 0) + s, 0);
  });
  const qObj = obj * 3;

  createChart('cRevQuarter', {
    type: 'bar',
    data: {
      labels: quarters,
      datasets: [
        { label: 'Encaissé', data: qData, backgroundColor: 'rgba(167,139,250,.5)', borderRadius: 8, barThickness: 50 },
        { type: 'line', label: 'Objectif trimestre', data: quarters.map(() => qObj), borderColor: '#f87171', borderDash: [6, 4], borderWidth: 2, pointRadius: 0, fill: false },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { grid: { color: 'rgba(38,38,58,.4)' } }, x: { grid: { display: false } } },
      plugins: {
        legend: { labels: { usePointStyle: true, pointStyle: 'circle', font: { size: 10 }, color: '#b0b0c8' } },
        tooltip: { ...CHART_TOOLTIP, callbacks: { label: ctx => `${ctx.dataset.label}: ${f$(ctx.parsed.y)} €` } }
      }
    }
  });
}
