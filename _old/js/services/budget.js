import { app, VITAL_CATS } from '../core/state.js';
import { toEur, toAed, rowEur } from '../utils/currency.js';

export function sumEur(m, arr, extra) {
  let t = 0;
  app.state.postes.forEach((_, i) => { t += rowEur(arr[i], m.rate); });
  (extra || []).forEach(r => { t += r.eur > 0 ? r.eur : toEur(r.aed, m.rate); });
  return t;
}

export function sumAed(m, arr, extra) {
  let t = 0;
  app.state.postes.forEach((p, i) => {
    if (p.isAed) { t += arr[i].aed || 0; }
    else { t += toAed(rowEur(arr[i], m.rate), m.rate); }
  });
  (extra || []).forEach(r => {
    if (r.aed > 0) t += r.aed;
    else if (r.eur > 0) t += toAed(r.eur, m.rate);
  });
  return t;
}

export function sumEurBudget(m) {
  let t = 0;
  const lr = app.state.rate;
  app.state.postes.forEach((p, i) => {
    t += p.isAed ? toEur(m.budget[i].aed || 0, lr) : (m.budget[i].eur || 0);
  });
  (m.extraBudget || []).forEach(r => {
    t += r.eur > 0 ? r.eur : toEur(r.aed || 0, lr);
  });
  return t;
}

export function sumAedBudget(m) {
  let t = 0;
  const lr = app.state.rate;
  app.state.postes.forEach((p, i) => {
    t += p.isAed ? (m.budget[i].aed || 0) : toAed(m.budget[i].eur || 0, lr);
  });
  (m.extraBudget || []).forEach(r => {
    t += r.aed > 0 ? r.aed : toAed(r.eur || 0, lr);
  });
  return t;
}

export function sumVitalEur(m, arr) {
  let t = 0;
  app.state.postes.forEach((p, i) => {
    if (VITAL_CATS.includes(p.cat)) t += rowEur(arr[i], m.rate);
  });
  return t;
}

export function sumCatEur(m, arr, cat) {
  let t = 0;
  app.state.postes.forEach((p, i) => {
    if (p.cat === cat) t += rowEur(arr[i], m.rate);
  });
  return t;
}
