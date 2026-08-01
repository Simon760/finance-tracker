'use client';

/**
 * Répartition par catégorie — barres horizontales triées plutôt qu'un camembert :
 * au-delà de ~7 catégories les parts d'un donut deviennent illisibles (et les
 * couleurs cyclent). Une seule teinte, l'intensité porte la magnitude, le nom
 * et la valeur sont lus directement sur la ligne.
 * En HTML/CSS (pas Recharts) : responsive par construction, aucun risque de
 * troncature des libellés sur petit écran.
 */
export default function RankedBars({
  data,
  fmt,
  barClass = 'bg-info',
  emptyLabel = 'Aucune donnée',
}: {
  data: { name: string; value: number }[];
  fmt: (v: number) => string;
  /** Classe Tailwind de la barre — bleu par défaut (dépenses), vert pour les revenus */
  barClass?: string;
  emptyLabel?: string;
}) {
  if (data.length === 0) {
    return <div className="text-[12px] text-t-4 text-center py-10">{emptyLabel}</div>;
  }
  const max = Math.max(...data.map(d => d.value)) || 1;
  return (
    <div className="space-y-1.5">
      {data.map(d => {
        const ratio = d.value / max;
        return (
          <div
            key={d.name}
            className="group grid grid-cols-[minmax(0,6.5rem)_1fr_auto] items-center gap-2.5 -mx-1.5 px-1.5 py-0.5 rounded transition-colors hover:bg-bg-4/70"
            title={`${d.name} — ${fmt(d.value)}`}
          >
            <span className="text-[11px] text-t-3 truncate transition-colors group-hover:text-t-1">{d.name}</span>
            <div className="h-2.5 flex items-center">
              <div
                className={`h-full ${barClass} rounded-r-[4px] transition-opacity group-hover:!opacity-100`}
                style={{ width: `${Math.max(ratio * 100, 1)}%`, opacity: 0.4 + 0.6 * ratio }}
              />
            </div>
            <span className="text-[11px] text-t-2 mono-value whitespace-nowrap transition-colors group-hover:text-t-1">{fmt(d.value)}</span>
          </div>
        );
      })}
    </div>
  );
}
