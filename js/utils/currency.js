import { app, saveSilent } from '../core/state.js';
import { f$ } from './format.js';

export function toEur(aed, rate) {
  return aed / (rate || app.state.rate);
}

export function toAed(eur, rate) {
  return eur * (rate || app.state.rate);
}

export function rowEur(row, rate) {
  if (row.eur !== null && row.eur !== undefined && row.eur > 0) return row.eur;
  return toEur(row.aed, rate);
}

export function rowAed(row, rate) {
  if (row.aed > 0) return row.aed;
  if (row.eur > 0) return toAed(row.eur, rate);
  return 0;
}

// Dashboard currency helpers
export function dc(eurVal, monthRate) {
  return app.dashCur === 'EUR' ? eurVal : toAed(eurVal, monthRate);
}

export function dcFmt(eurVal, monthRate) {
  const v = dc(eurVal, monthRate);
  return f$(v) + (app.dashCur === 'EUR' ? ' €' : ' AED');
}

export function dcSym() {
  return app.dashCur === 'EUR' ? '€' : 'AED';
}

export async function fetchLiveRate() {
  const apis = [
    {
      url: 'https://api.allorigins.win/get?url=' + encodeURIComponent('https://api.wise.com/v1/rates?source=EUR&target=AED'),
      parse: d => { try { const arr = JSON.parse(d.contents); return Array.isArray(arr) && arr[0] ? arr[0].rate : null; } catch (e) { return null; } }
    },
    {
      url: 'https://open.er-api.com/v6/latest/EUR',
      parse: d => d && d.rates ? d.rates.AED : null
    },
    {
      url: 'https://api.frankfurter.app/latest?from=EUR&to=AED',
      parse: d => d && d.rates ? d.rates.AED : null
    },
    {
      url: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/eur.json',
      parse: d => d && d.eur ? d.eur.aed : null
    },
  ];

  for (const api of apis) {
    try {
      const r = await fetch(api.url);
      if (!r.ok) { console.log('Rate ✗', api.url.split('/')[2], r.status); continue; }
      const d = await r.json();
      const rate = api.parse(d);
      console.log('Rate ✓', api.url.split('/')[2], '→', rate);
      if (rate && rate > 3 && rate < 6) {
        app.state.rate = rate;
        saveSilent();
        document.getElementById('sideRate').textContent = app.state.rate.toFixed(4);
        const ri = document.getElementById('rateIn');
        if (ri) ri.value = app.state.rate;
        document.getElementById('rateLive').style.display = 'flex';
        // Lazy import to avoid circular dep
        const { renderTracker } = await import('../pages/tracker.js');
        renderTracker();
        return true;
      }
    } catch (e) {
      console.log('Rate ✗', api.url.split('/')[2], e.message);
      continue;
    }
  }
  console.log('All rate APIs failed, using saved rate');
  return false;
}
