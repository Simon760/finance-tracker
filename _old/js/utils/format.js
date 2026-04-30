export function f$(n, d = 2) {
  return parseFloat(n || 0).toLocaleString('fr-FR', {
    minimumFractionDigits: d,
    maximumFractionDigits: d
  });
}

export function f0(n) {
  return parseFloat(n || 0).toLocaleString('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
}

export function catTag(c) {
  return `<span class="cell-tag tag-${c}">${c.charAt(0).toUpperCase() + c.slice(1)}</span>`;
}
