import { app, PIE_COLORS } from '../core/state.js';
import { f$, f0 } from '../utils/format.js';
import { toAed, rowEur, dcFmt, dcSym } from '../utils/currency.js';
import { sumEur } from '../services/budget.js';
import { monthEarnEur, monthEarnAed } from '../services/revenue.js';
import { createChart, CHART_TOOLTIP, CHART_LEGEND } from '../components/charts.js';

export function renderDashboard() {
  if (app.state.months.length === 0) {
    document.getElementById('dashKpis').innerHTML = '<div class="card"><div class="kpi-val" style="font-size:14px;color:var(--t3)">Aucune donnée</div></div>';
    return;
  }

  const ms = app.state.months;
  const totalSpent = ms.reduce((s, m) => s + sumEur(m, m.actual, m.extraActual), 0);
  const totalEarn = ms.reduce((s, m) => s + monthEarnEur(m), 0);
  const avg = totalSpent / ms.length;
  const avgRate = ms.reduce((s, m) => s + m.rate, 0) / ms.length;

  document.getElementById('dashKpis').innerHTML = `
    <div class="card anim d1"><div class="card-line" style="background:var(--blue)"></div><div class="kpi-label">Total dépensé</div>
      <div class="kpi-val">${dcFmt(totalSpent, avgRate)}</div><div class="kpi-sub">Moy: ${dcFmt(avg, avgRate)}/mois</div></div>
  `;

  const labels = ms.map(m => m.id.slice(0, 3));

  // Evolution chart
  const spendD = ms.map(m => { const e = sumEur(m, m.actual, m.extraActual); return app.dashCur === 'EUR' ? e : toAed(e, m.rate); });
  const earnD = ms.map(m => { const e = monthEarnEur(m); return app.dashCur === 'EUR' ? e : monthEarnAed(m); });
  const evoAll = [...spendD, ...earnD].filter(v => v > 0);
  const evoMax = evoAll.length > 0 ? Math.max(...evoAll) : 1000;
  const evoMinVal = evoAll.length > 0 ? Math.min(...evoAll) : 0;
  const evoPad = (evoMax - evoMinVal) * 0.15 || 500;

  createChart('cEvo', {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Dépenses', data: spendD, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,.06)', fill: true, tension: .4, pointRadius: 5, pointBackgroundColor: '#ef4444', borderWidth: 2 },
        { label: 'Revenus', data: earnD, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,.06)', fill: true, tension: .4, pointRadius: 5, pointBackgroundColor: '#10b981', borderWidth: 2 },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        y: { min: Math.max(0, Math.floor(evoMinVal - evoPad)), max: Math.ceil(evoMax + evoPad), grid: { color: 'rgba(30,30,42,.5)' }, ticks: { color: '#52525b', font: { size: 11 } } },
        x: { grid: { display: false }, ticks: { color: '#52525b', font: { size: 11 } } }
      },
      plugins: {
        legend: { labels: { usePointStyle: true, pointStyle: 'circle', font: { size: 12 }, color: '#a1a1aa' } },
        tooltip: { ...CHART_TOOLTIP, callbacks: { label: ctx => `${ctx.dataset.label}: ${f$(ctx.parsed.y)} ${dcSym()}` } }
      }
    }
  });

  // Solde chart
  const soldeMonths = ms.filter(m => m.soldeStart > 0 || m.soldeEnd > 0);
  if (soldeMonths.length > 0) {
    const soldeLabels = soldeMonths.map(m => m.id.slice(0, 3));
    const soldeStart = soldeMonths.map(m => m.soldeStart || 0);
    const soldeEnd = soldeMonths.map(m => m.soldeEnd || 0);
    const soldeAll = [...soldeStart, ...soldeEnd].filter(v => v > 0);
    const soldeMax = soldeAll.length > 0 ? Math.max(...soldeAll) : 100000;
    const soldeMinVal = soldeAll.length > 0 ? Math.min(...soldeAll) : 0;
    const soldePad = (soldeMax - soldeMinVal) * 0.15 || 5000;

    createChart('cSolde', {
      type: 'line',
      data: {
        labels: soldeLabels,
        datasets: [
          { label: 'Début de mois', data: soldeStart, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,.06)', fill: true, tension: .3, pointRadius: 5, pointBackgroundColor: '#3b82f6', borderWidth: 2 },
          { label: 'Fin de mois', data: soldeEnd, borderColor: '#06b6d4', backgroundColor: 'rgba(6,182,212,.06)', fill: true, tension: .3, pointRadius: 5, pointBackgroundColor: '#06b6d4', borderWidth: 2 },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          y: { min: Math.max(0, Math.floor(soldeMinVal - soldePad)), max: Math.ceil(soldeMax + soldePad), grid: { color: 'rgba(30,30,42,.5)' }, ticks: { color: '#52525b', font: { size: 11 } } },
          x: { grid: { display: false }, ticks: { color: '#52525b', font: { size: 11 } } }
        },
        plugins: {
          legend: { labels: { usePointStyle: true, pointStyle: 'circle', font: { size: 12 }, color: '#a1a1aa' } },
          tooltip: { ...CHART_TOOLTIP, callbacks: { label: ctx => `${ctx.dataset.label}: ${f0(ctx.parsed.y)} AED` } }
        }
      }
    });
  }

  // Average pie
  const avgExp = {};
  ms.forEach(m => {
    app.state.postes.forEach((p, i) => {
      const v = rowEur(m.actual[i], m.rate);
      avgExp[p.name] = (avgExp[p.name] || 0) + (app.dashCur === 'EUR' ? v : toAed(v, m.rate));
    });
  });
  const pL = Object.keys(avgExp).filter(k => avgExp[k] > 10);
  const pD = pL.map(k => avgExp[k] / ms.length);
  createChart('cPie', {
    type: 'doughnut',
    data: { labels: pL, datasets: [{ data: pD, backgroundColor: PIE_COLORS, borderWidth: 0, spacing: 2 }] },
    options: {
      responsive: true, cutout: '62%',
      plugins: { legend: { position: 'right', labels: CHART_LEGEND }, tooltip: CHART_TOOLTIP }
    }
  });

  // Total par poste
  const posteTotals = {};
  ms.forEach(m => {
    app.state.postes.forEach((p, i) => {
      const v = rowEur(m.actual[i], m.rate);
      const val = app.dashCur === 'EUR' ? v : toAed(v, m.rate);
      posteTotals[p.name] = (posteTotals[p.name] || 0) + val;
    });
    (m.extraActual || []).forEach(r => {
      const v = r.eur > 0 ? r.eur : rowEur({ aed: r.aed, eur: 0 }, m.rate);
      const val = app.dashCur === 'EUR' ? v : toAed(v, m.rate);
      posteTotals[r.name] = (posteTotals[r.name] || 0) + val;
    });
  });
  const ptEntries = Object.entries(posteTotals).filter(([, v]) => v > 1).sort((a, b) => b[1] - a[1]);

  createChart('cCatTotal', {
    type: 'doughnut',
    data: {
      labels: ptEntries.map(([k]) => k),
      datasets: [{ data: ptEntries.map(([, v]) => v), backgroundColor: PIE_COLORS.slice(0, ptEntries.length), borderWidth: 0, spacing: 2 }]
    },
    options: {
      responsive: true, cutout: '58%',
      plugins: {
        legend: { position: 'right', labels: { padding: 6, usePointStyle: true, pointStyle: 'circle', font: { size: 9 }, color: '#a1a1aa' } },
        tooltip: { ...CHART_TOOLTIP, callbacks: { label: ctx => `${ctx.label}: ${f$(ctx.parsed)} ${dcSym()}` } }
      }
    }
  });
}
