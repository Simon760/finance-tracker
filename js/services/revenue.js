import { app, ensureRevState, REV_BASE_COLORS } from '../core/state.js';
import { toAed } from '../utils/currency.js';

const LEGACY_EARN_MONTHS = ['OCTOBRE', 'NOVEMBRE', 'DECEMBRE', 'JANVIER', 'FEVRIER'];

export function isRevSynced(monthId) {
  return !LEGACY_EARN_MONTHS.includes(monthId);
}

export function getMonthRevEur(monthId) {
  ensureRevState();
  const entries = app.state.revenus.months[monthId] || [];
  return entries
    .filter(e => !e.status || e.status === 'confirmed')
    .reduce((s, e) => s + (e.cashed || 0), 0);
}

export function getMonthRevAed(monthId) {
  ensureRevState();
  const entries = app.state.revenus.months[monthId] || [];
  return entries
    .filter(e => !e.status || e.status === 'confirmed')
    .reduce((s, e) => {
      const r = e.rate || app.state.rate;
      return s + ((e.cashed || 0) * r);
    }, 0);
}

export function monthEarnEur(m) {
  return isRevSynced(m.id) ? getMonthRevEur(m.id) : (m.earn || 0);
}

export function monthEarnAed(m) {
  return isRevSynced(m.id) ? getMonthRevAed(m.id) : toAed(m.earn || 0, m.rate);
}

export function getRevMonth(id) {
  ensureRevState();
  if (!app.state.revenus.months[id]) app.state.revenus.months[id] = [];
  return app.state.revenus.months[id];
}

export function revCatColor(cat) {
  const cats = app.state.revenus.categories || [];
  const idx = cats.indexOf(cat);
  return REV_BASE_COLORS[idx >= 0 ? idx % REV_BASE_COLORS.length : 0];
}
