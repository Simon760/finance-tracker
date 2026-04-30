import { renderTracker } from '../pages/tracker.js';
import { renderDashboard } from '../pages/dashboard.js';
import { renderRevenus } from '../pages/revenus.js';
import { renderEmmenagement } from '../pages/emmenagement.js';
import { renderSettings } from '../pages/settings.js';

const PAGE_RENDERERS = {
  tracker: renderTracker,
  dashboard: renderDashboard,
  revenus: renderRevenus,
  emmenagement: renderEmmenagement,
  settings: renderSettings,
};

export function go(pg) {
  document.querySelectorAll('.pg').forEach(p => p.classList.remove('on'));
  document.getElementById('pg-' + pg).classList.add('on');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('on'));
  const navBtn = document.querySelector(`.nav-btn[data-pg="${pg}"]`);
  if (navBtn) navBtn.classList.add('on');
  const renderer = PAGE_RENDERERS[pg];
  if (renderer) renderer();
}
