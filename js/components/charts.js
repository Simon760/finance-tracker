import { app } from '../core/state.js';

export const CHART_TOOLTIP = {
  backgroundColor: '#1e1e28',
  titleColor: '#f2f2fa',
  bodyColor: '#b0b0c8',
  borderColor: '#1e1e2e',
  borderWidth: 1,
  padding: 10,
  cornerRadius: 8
};

export const CHART_LEGEND = {
  padding: 8,
  usePointStyle: true,
  pointStyle: 'circle',
  font: { size: 10 },
  color: '#b0b0c8'
};

export function destroyChart(id) {
  if (app.charts[id]) {
    app.charts[id].destroy();
    delete app.charts[id];
  }
}

export function createChart(id, config) {
  destroyChart(id);
  const canvas = document.getElementById(id);
  if (!canvas) return null;
  app.charts[id] = new Chart(canvas, config);
  return app.charts[id];
}

export function doughnutConfig(labels, data, colors) {
  return {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors, borderWidth: 0, spacing: 2 }]
    },
    options: {
      responsive: true,
      cutout: '58%',
      plugins: {
        legend: { position: 'right', labels: CHART_LEGEND },
        tooltip: CHART_TOOLTIP
      }
    }
  };
}
