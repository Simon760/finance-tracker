import { app, PIE_COLORS } from '../core/state.js';
import { f$, f0, catTag } from '../utils/format.js';
import { createChart, CHART_TOOLTIP } from '../components/charts.js';

export function renderEmmenagement() {
  const d = app.state.emmenagement;
  const total = d.reduce((s, e) => s + e.eur, 0);
  const totalAed = d.reduce((s, e) => s + e.aed, 0);
  const cats = {};
  d.forEach(e => { cats[e.cat] = (cats[e.cat] || 0) + e.eur; });
  const cc = { 'Société': 'var(--green)', 'Logement': 'var(--blue)', 'Ameublement': 'var(--purple)' };

  let kH = `<div class="card anim d1"><div class="card-line" style="background:var(--red)"></div><div class="kpi-label">Total</div><div class="kpi-val">${f$(total)} €</div><div class="kpi-sub">${f0(totalAed)} AED</div></div>`;
  Object.entries(cats).forEach(([c, v], i) => {
    kH += `<div class="card anim d${i + 2}"><div class="card-line" style="background:${cc[c] || 'var(--cyan)'}"></div><div class="kpi-label">${c}</div><div class="kpi-val">${f$(v)} €</div><div class="kpi-sub">${((v / total) * 100).toFixed(0)}%</div></div>`;
  });
  document.getElementById('emKpis').innerHTML = kH;

  createChart('cEmPie', {
    type: 'doughnut',
    data: { labels: Object.keys(cats), datasets: [{ data: Object.values(cats), backgroundColor: ['#10b981', '#3b82f6', '#8b5cf6'], borderWidth: 0, spacing: 3 }] },
    options: { responsive: true, cutout: '60%', plugins: { legend: { position: 'bottom', labels: { padding: 14, usePointStyle: true, pointStyle: 'circle', color: '#a1a1aa' } } } }
  });

  const sorted = [...d].sort((a, b) => b.eur - a.eur).slice(0, 8);
  createChart('cEmBar', {
    type: 'bar',
    data: { labels: sorted.map(e => e.poste.slice(0, 14)), datasets: [{ data: sorted.map(e => e.eur), backgroundColor: PIE_COLORS, borderRadius: 6 }] },
    options: { responsive: true, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { grid: { color: 'rgba(30,30,42,.5)' } }, y: { grid: { display: false } } } }
  });

  let tH = '';
  d.forEach(e => {
    const tc = e.cat === 'Société' ? 'vital' : e.cat === 'Logement' ? 'logement' : 'lifestyle';
    tH += `<tr><td><strong>${e.poste}</strong></td><td>${catTag(tc)}</td><td class="mono">${f$(e.aed)} AED</td><td class="mono" style="color:var(--t3)">${e.taux}</td><td class="mono">${f$(e.eur)} €</td></tr>`;
  });
  document.getElementById('emTable').innerHTML = tH;
}
