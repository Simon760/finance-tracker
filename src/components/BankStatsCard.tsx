'use client';

import { AppState } from '@/lib/types';
import { f0 } from '@/lib/utils';
import { computeBankHistory } from '@/lib/bankHistory';
import { TrendingUp, TrendingDown, Equal, Activity } from 'lucide-react';

function formatDate(d: Date | null | undefined): string {
  if (!d) return '—';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

interface Props {
  state: AppState;
  currency?: string;
}

export default function BankStatsCard({ state, currency = 'AED' }: Props) {
  const h = computeBankHistory(state);

  if (!h.startDate || h.pointCount === 0) {
    return null;
  }

  const swing = h.ath && h.atl ? h.ath.balance - h.atl.balance : 0;

  return (
    <div className="bg-gradient-to-br from-bg-3 to-bg-2 border border-border-2 rounded-md p-5 mb-3.5 shadow-inset-border">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity size={15} className="text-accent" />
          <span className="text-[12px] uppercase tracking-wider text-t-3 font-semibold">Compte bancaire — historique</span>
        </div>
        <span className="text-[10px] text-t-4 font-mono mono-value">
          {h.pointCount} events · depuis {formatDate(h.startDate)}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2.5 max-md:grid-cols-1">
        {/* ATH */}
        <div className="bg-bg-2 border border-accent/20 rounded-md p-3.5 relative overflow-hidden">
          <div
            className="absolute top-0 left-0 right-0 h-[2px]"
            style={{ background: 'linear-gradient(90deg, #10b981, transparent)' }}
          />
          <div className="flex items-center gap-1.5 mb-1.5">
            <TrendingUp size={13} className="text-accent" />
            <span className="text-[9px] uppercase tracking-[0.12em] text-t-3 font-bold">ATH</span>
          </div>
          <div className="text-[18px] font-bold mono-value text-accent leading-none">{f0(h.ath?.balance || 0)} {currency}</div>
          <div className="text-[11px] text-t-3 mt-1.5">{formatDate(h.ath?.date)}</div>
          {h.ath?.label && h.ath.label !== 'Ouverture' && (
            <div className="text-[10px] text-t-4 mt-0.5 truncate" title={h.ath.label}>après · {h.ath.label}</div>
          )}
        </div>

        {/* ATL */}
        <div className="bg-bg-2 border border-danger/20 rounded-md p-3.5 relative overflow-hidden">
          <div
            className="absolute top-0 left-0 right-0 h-[2px]"
            style={{ background: 'linear-gradient(90deg, #ef4444, transparent)' }}
          />
          <div className="flex items-center gap-1.5 mb-1.5">
            <TrendingDown size={13} className="text-danger" />
            <span className="text-[9px] uppercase tracking-[0.12em] text-t-3 font-bold">ATL</span>
          </div>
          <div className="text-[18px] font-bold mono-value text-danger leading-none">{f0(h.atl?.balance || 0)} {currency}</div>
          <div className="text-[11px] text-t-3 mt-1.5">{formatDate(h.atl?.date)}</div>
          {h.atl?.label && h.atl.label !== 'Ouverture' && (
            <div className="text-[10px] text-t-4 mt-0.5 truncate" title={h.atl.label}>après · {h.atl.label}</div>
          )}
        </div>

        {/* Avg */}
        <div className="bg-bg-2 border border-info/20 rounded-md p-3.5 relative overflow-hidden">
          <div
            className="absolute top-0 left-0 right-0 h-[2px]"
            style={{ background: 'linear-gradient(90deg, #3b82f6, transparent)' }}
          />
          <div className="flex items-center gap-1.5 mb-1.5">
            <Equal size={13} className="text-info" />
            <span className="text-[9px] uppercase tracking-[0.12em] text-t-3 font-bold">Solde moyen</span>
          </div>
          <div className="text-[18px] font-bold mono-value text-info leading-none">{f0(h.avg)} {currency}</div>
          <div className="text-[11px] text-t-3 mt-1.5">Pondéré dans le temps</div>
          <div className="text-[10px] text-t-4 mt-0.5">Amplitude : {f0(swing)} {currency}</div>
        </div>
      </div>
    </div>
  );
}
