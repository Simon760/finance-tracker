'use client';

import { Month, Poste } from '@/lib/types';
import { f$, f0 } from '@/lib/utils';
import { computeMonthStats } from '@/lib/monthStats';
import { TrendingDown, Receipt, Users, CalendarDays, Wallet, Sparkles } from 'lucide-react';

interface Props {
  month: Month;
  postes: Poste[];
  /** true = layout colonne unique (mobile) ; false = grid responsive desktop */
  compact?: boolean;
}

export default function MonthStatsCard({ month, postes, compact = false }: Props) {
  const s = computeMonthStats(month, postes);

  if (s.txnCount === 0) {
    return (
      <div className="bg-bg-3 border border-border rounded-md p-5 text-center text-t-3 text-[12px]">
        <Sparkles className="mx-auto mb-2 text-t-4" size={20} />
        Aucune transaction saisie pour ce mois — les stats apparaîtront ici dès que tu auras détaillé des dépenses.
      </div>
    );
  }

  return (
    <div className={`bg-bg-3 border border-border rounded-md ${compact ? 'p-3' : 'p-4'} mb-5`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-accent" />
          <span className="text-[12px] uppercase tracking-wider text-t-3 font-semibold">Stats du mois</span>
        </div>
        <span className="text-[10px] text-t-4 font-mono mono-value">{s.txnCount} tx · moy. {f0(s.avgTxnAed)} AED</span>
      </div>

      <div className={compact ? 'space-y-2' : 'grid grid-cols-2 lg:grid-cols-3 gap-2.5'}>
        {/* Plus grosse dépense */}
        {s.biggest && (
          <StatRow
            icon={<TrendingDown size={14} className="text-danger" />}
            label="Plus grosse dépense"
            primary={s.biggest.label || '—'}
            secondaryLeft={s.biggest.posteName}
            secondaryRight={s.biggest.date}
            value={`${f0(s.biggest.amount)} ${s.biggest.currency || 'AED'}`}
            valueSub={`${f$(s.biggest.eur || (s.biggest.rate ? s.biggest.amount / s.biggest.rate : 0))} €`}
            tone="danger"
          />
        )}

        {/* Top marchand */}
        {s.topMerchants[0] && (
          <StatRow
            icon={<Users size={14} className="text-warning" />}
            label="Marchand n°1"
            primary={s.topMerchants[0].label}
            secondaryLeft={`${s.topMerchants[0].count} tx`}
            secondaryRight={s.topMerchants[0].variants.length > 1 ? `+${s.topMerchants[0].variants.length - 1} variantes` : undefined}
            value={`${f0(s.topMerchants[0].totalAed)} AED`}
            valueSub={`${f$(s.topMerchants[0].totalEur)} €`}
            tone="warning"
          />
        )}

        {/* Top poste */}
        {s.topPoste && (
          <StatRow
            icon={<Wallet size={14} className="text-info" />}
            label="Poste le plus coûteux"
            primary={s.topPoste.name}
            secondaryLeft={`${s.topPoste.count} tx`}
            value={`${f0(s.topPoste.totalAed)} AED`}
            valueSub={`${((s.topPoste.totalAed / s.totalTxnAed) * 100).toFixed(0)}% des tx`}
            tone="info"
          />
        )}

        {/* Jour le plus dépensier */}
        {s.biggestDay && (
          <StatRow
            icon={<CalendarDays size={14} className="text-accent" />}
            label="Jour le plus dépensier"
            primary={s.biggestDay.date}
            secondaryLeft={`${s.biggestDay.count} tx`}
            value={`${f0(s.biggestDay.totalAed)} AED`}
            valueSub={`${((s.biggestDay.totalAed / s.totalTxnAed) * 100).toFixed(0)}% du mois`}
            tone="accent"
          />
        )}

        {/* Plus petite dépense */}
        {s.smallest && s.smallest !== s.biggest && (
          <StatRow
            icon={<Receipt size={14} className="text-t-3" />}
            label="Plus petite dépense"
            primary={s.smallest.label || '—'}
            secondaryLeft={s.smallest.posteName}
            secondaryRight={s.smallest.date}
            value={`${f0(s.smallest.amount)} ${s.smallest.currency || 'AED'}`}
            valueSub={`${f$(s.smallest.eur || (s.smallest.rate ? s.smallest.amount / s.smallest.rate : 0))} €`}
            tone="neutral"
          />
        )}

        {/* Top 2-3 marchands suivants (si disponibles) */}
        {s.topMerchants.slice(1, 3).map((g, i) => (
          <StatRow
            key={i}
            icon={<Users size={14} className="text-t-3" />}
            label={`Marchand n°${i + 2}`}
            primary={g.label}
            secondaryLeft={`${g.count} tx`}
            secondaryRight={g.variants.length > 1 ? `+${g.variants.length - 1} var.` : undefined}
            value={`${f0(g.totalAed)} AED`}
            valueSub={`${f$(g.totalEur)} €`}
            tone="neutral"
          />
        ))}
      </div>
    </div>
  );
}

function StatRow({
  icon, label, primary, secondaryLeft, secondaryRight, value, valueSub, tone,
}: {
  icon: React.ReactNode;
  label: string;
  primary: string;
  secondaryLeft?: string;
  secondaryRight?: string;
  value: string;
  valueSub?: string;
  tone: 'danger' | 'warning' | 'info' | 'accent' | 'neutral';
}) {
  const colorMap = {
    danger: 'text-danger',
    warning: 'text-warning',
    info: 'text-info',
    accent: 'text-accent',
    neutral: 'text-t-1',
  };
  return (
    <div className="bg-bg-2 border border-border rounded-md p-3 flex items-start gap-2.5">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[9px] uppercase tracking-[0.12em] text-t-3 font-semibold leading-none mb-1">{label}</div>
        <div className="text-[13px] font-semibold tracking-tight text-t-1 truncate">{primary}</div>
        {(secondaryLeft || secondaryRight) && (
          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-t-3">
            {secondaryLeft && <span>{secondaryLeft}</span>}
            {secondaryLeft && secondaryRight && <span className="text-t-4">·</span>}
            {secondaryRight && <span>{secondaryRight}</span>}
          </div>
        )}
      </div>
      <div className="text-right shrink-0">
        <div className={`text-[13px] font-bold mono-value ${colorMap[tone]}`}>{value}</div>
        {valueSub && <div className="text-[10px] text-t-4 mono-value mt-0.5">{valueSub}</div>}
      </div>
    </div>
  );
}
