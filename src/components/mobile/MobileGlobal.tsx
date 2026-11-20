'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp } from 'lucide-react';
import { useApp } from '@/context/AppProvider';
import { f$, f0, sumEur, lastMonthWithBalance, monthBankBalance, bankRealDelta, monthRevenuConfirmedEur, startedMonths, shortMonth } from '@/lib/utils';
import { INSTALL_CAPITAL, PIE_COLORS } from '@/lib/constants';
import { chartTheme, chartTooltipStyle } from '@/lib/chartTheme';
import { MBadge, MCard, MDivider, MIcon, MLabel, MRow } from './ui';

export default function MobileGlobal() {
  const { spaces, liveRate, setActiveSpaceId, theme } = useApp();
  const router = useRouter();

  const spaceStats = useMemo(() => {
    return spaces.map(space => {
      // Mois pas encore commencés (simulations) exclus des totaux — cf. startedMonths
      const months = startedMonths(space.months);
      const totalSpent = months.reduce((s, m) => s + sumEur(m, space.postes, m.extraActual), 0);
      // Somme mois tracker par mois tracker (Month.earn pour un mois legacy, table
      // Revenus sinon, résolue par monthRevenus) — même valeur que la colonne Revenus
      // du tracker, donc réconciliable avec lui. Itérer les CLÉS de la table en
      // sautant les noms legacy ratait « OCTOBRE 26 », dont les revenus vivent sous la
      // clé « OCTOBRE » (nom legacy) faute d'année dans la table.
      const totalRevenue = months.reduce((s, m) => s + monthRevenuConfirmedEur(m, space.revenus?.months), 0);

      // La balance affichée est la variation RÉELLE du compte depuis le capital
      // d'installation, pas revenus − dépenses : les deux diffèrent de tous les
      // mouvements bancaires jamais saisis. Repli sur la balance comptable pour un
      // space sans solde bancaire suivi.
      const base = INSTALL_CAPITAL[space.id];
      const real = bankRealDelta(space.months, space.postes, space.revenus?.months, liveRate,
        base ? { aed: base.aed, label: `le ${base.date}` } : undefined);
      const realBalance = real.from
        ? (space.localCurrency === 'EUR' ? real.delta : real.delta / liveRate)
        : totalRevenue - totalSpent;

      return {
        id: space.id,
        name: space.name,
        emoji: space.emoji,
        currency: space.localCurrency,
        status: space.status,
        monthCount: months.length,
        totalSpent,
        totalRevenue,
        balance: totalRevenue - totalSpent,
        realBalance,
      };
    });
  }, [spaces, liveRate]);

  const grandTotalSpent = spaceStats.reduce((s, sp) => s + sp.totalSpent, 0);
  const grandTotalRev = spaceStats.reduce((s, sp) => s + sp.totalRevenue, 0);
  const grandBalance = grandTotalRev - grandTotalSpent;

  // Variation RÉELLE du compte (tous spaces, converti en EUR) + net des flux tracés
  // sur la même période : l'écart entre les deux = mouvements bancaires non saisis.
  // Le point de départ est le capital d'installation reconstitué depuis les relevés
  // bancaires (INSTALL_CAPITAL), pas le soldeStart du premier mois renseigné.
  const bankReality = useMemo(() => {
    return spaces.reduce((acc, s) => {
      const base = INSTALL_CAPITAL[s.id];
      const r = bankRealDelta(s.months, s.postes, s.revenus?.months, liveRate,
        base ? { aed: base.aed, label: `le ${base.date}` } : undefined);
      const toEurLocal = (v: number) => (s.localCurrency === 'EUR' ? v : v / liveRate);
      return {
        delta: acc.delta + toEurLocal(r.delta),
        flows: acc.flows + toEurLocal(r.flows),
        from: acc.from || r.from,
        startLabel: acc.startLabel || (base ? `capital ${f0(base.aed)} ${s.localCurrency}` : ''),
      };
    }, { delta: 0, flows: 0, from: null as string | null, startLabel: '' });
  }, [spaces, liveRate]);

  // Bank balances
  const bankBalances = useMemo(() => {
    return spaces.map(s => {
      // Dernier mois RENSEIGNÉ (pas le dernier de la liste, souvent un mois futur vide)
      const lastMonth = lastMonthWithBalance(s.months);
      if (!lastMonth) return null;
      const balance = monthBankBalance(lastMonth, s.postes, s.revenus?.months, liveRate);
      const eurBalance = s.localCurrency === 'EUR' ? balance : balance / liveRate;
      return { space: s.name, emoji: s.emoji, currency: s.localCurrency, balance, eurBalance };
    }).filter((b): b is { space: string; emoji: string; currency: string; balance: number; eurBalance: number } => b !== null && b.balance > 0);
  }, [spaces, liveRate]);

  const manualAssets = useMemo(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem('fhq_assets');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  }, []);

  const totalBankEur = bankBalances.reduce((s, b) => s + b.eurBalance, 0);
  const totalAssetsEur = (manualAssets as { eurValue: number }[]).reduce((s, a) => s + (a.eurValue || 0), 0);
  const netWorth = totalBankEur + totalAssetsEur;

  // Dépenses par mois, tous espaces (mêmes données que le graphe desktop)
  const monthIds = Array.from(new Set(spaces.flatMap(s => startedMonths(s.months).map(m => m.id))));
  const evoData = monthIds.map(id => {
    const row: Record<string, string | number> = { name: shortMonth(id) };
    spaces.forEach(s => {
      const m = s.months.find(mo => mo.id === id);
      row[s.name] = m ? Math.round(sumEur(m, s.postes, m.extraActual)) : 0;
    });
    return row;
  });
  const ct = chartTheme(theme);
  const signed = (v: number) => `${v >= 0 ? '+' : ''}${f$(v)} €`;

  const goToSpace = (id: string) => {
    setActiveSpaceId(id);
    router.push('/tracker');
  };

  return (
    <div className="-mx-1">
      {/* Variation réelle du compte, tous espaces */}
      <div className="flex flex-col items-center text-center pt-3 pb-6 px-4">
        <span className="text-[13px] text-t-3">{bankReality.from ? 'Variation réelle du compte' : 'Revenus − dépenses'}</span>
        <span className="flex items-baseline gap-1.5 mt-1">
          <span className={`text-[36px] leading-none hero-num mono-value ${(bankReality.from ? bankReality.delta : grandBalance) < 0 ? 'text-danger' : 'text-t-1'}`}>
            {(bankReality.from ? bankReality.delta : grandBalance) >= 0 ? '+' : ''}{f$(bankReality.from ? bankReality.delta : grandBalance)}
          </span>
          <span className="text-[16px] text-t-3 font-medium">€</span>
        </span>
        {bankReality.from && (
          <span className="text-[13px] text-t-3 mt-1.5 mono-value m-sub leading-snug">
            depuis {bankReality.from}{bankReality.startLabel ? ` · ${bankReality.startLabel}` : ''}
          </span>
        )}
      </div>

      <MCard className="mb-4">
        <div className="grid grid-cols-2 gap-4 px-4 pt-3.5 pb-3">
          <div className="min-w-0">
            <div className="text-[13px] text-t-3">Revenus</div>
            <div className="text-[17px] text-t-1 mono-value mt-0.5 truncate">+{f$(grandTotalRev)} €</div>
          </div>
          <div className="min-w-0 text-right">
            <div className="text-[13px] text-t-3">Dépenses</div>
            <div className="text-[17px] text-t-1 mono-value mt-0.5 truncate">{f$(grandTotalSpent)} €</div>
          </div>
        </div>
        <MDivider />
        <MRow
          className="!min-h-[50px]"
          title={<span className="text-[14px] font-normal text-t-2">Entrées − sorties saisies</span>}
          sub={bankReality.from ? 'Écart = mouvements non saisis' : undefined}
          right={<span className={`mono-value ${(bankReality.from ? bankReality.flows : grandBalance) >= 0 ? 'text-accent' : 'text-danger'}`}>{signed(bankReality.from ? bankReality.flows : grandBalance)}</span>}
        />
      </MCard>

      <MCard className="mb-4">
        <MRow
          icon={<MIcon><TrendingUp size={17} /></MIcon>}
          title="Patrimoine net"
          sub={<span className="mono-value">{totalAssetsEur > 0 ? `Dont actifs ${f0(totalAssetsEur)} €` : 'Soldes bancaires'}</span>}
          right={<span className="mono-value">{f$(netWorth)} €</span>}
          chevron
          onClick={() => router.push('/networth')}
        />
      </MCard>

      <MLabel>{spaceStats.length > 1 ? `${spaceStats.length} espaces` : 'Espace'}</MLabel>
      <MCard className="mb-4">
        {spaceStats.map((sp, k) => (
          <div key={sp.id}>
            {k > 0 && <MDivider />}
            <MRow
              icon={<MIcon>{sp.emoji || sp.name[0]}</MIcon>}
              title={sp.name}
              badge={sp.status === 'active' ? undefined : <MBadge>{sp.status === 'archived' ? 'Archivé' : 'Brouillon'}</MBadge>}
              sub={<span className="mono-value">{sp.currency} · {sp.monthCount} mois{grandTotalSpent > 0 && spaceStats.length > 1 ? ` · ${Math.round((sp.totalSpent / grandTotalSpent) * 100)} % des dépenses` : ''}</span>}
              right={<span className={`mono-value ${sp.realBalance >= 0 ? 'text-accent' : 'text-danger'}`}>{signed(sp.realBalance)}</span>}
              chevron
              onClick={() => goToSpace(sp.id)}
            />
            <div className="flex justify-between gap-3 pl-[64px] pr-4 pb-3 -mt-1 text-[13px] text-t-3 mono-value m-sub">
              <span>Revenus {f0(sp.totalRevenue)} €</span>
              <span>Dépenses {f0(sp.totalSpent)} €</span>
            </div>
          </div>
        ))}
      </MCard>

      {evoData.length > 0 && (
        <>
          <MLabel>Dépenses par mois (€)</MLabel>
          <MCard className="mb-4 px-2 pt-3 pb-1">
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={evoData} margin={{ left: 4, right: 4, top: 4, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fill: ct.tick, fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <Tooltip contentStyle={chartTooltipStyle(theme)} cursor={{ fill: 'transparent' }} formatter={v => `${f0(Number(v))} €`} />
                {spaces.map((s, i) => (
                  <Bar key={s.id} dataKey={s.name} stackId="a" fill={spaces.length > 1 ? PIE_COLORS[i % PIE_COLORS.length] : 'rgb(var(--t-2))'} radius={i === spaces.length - 1 ? [4, 4, 0, 0] : undefined} />
                ))}
              </BarChart>
            </ResponsiveContainer>
            {spaces.length > 1 && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 px-2 pb-2 pt-1">
                {spaces.map((s, i) => (
                  <span key={s.id} className="flex items-center gap-1.5 text-[12px] text-t-3">
                    <span className="w-2 h-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />{s.name}
                  </span>
                ))}
              </div>
            )}
          </MCard>
        </>
      )}

      {bankBalances.length > 0 && (
        <>
          <MLabel>Soldes bancaires</MLabel>
          <MCard className="mb-2">
            {bankBalances.map((b, i) => (
              <div key={i}>
                {i > 0 && <MDivider />}
                <MRow
                  icon={<MIcon>{b.emoji || b.space[0]}</MIcon>}
                  title={b.space}
                  right={<span className="mono-value">{f$(b.eurBalance)} €</span>}
                  rightSub={<span className="mono-value">{f0(b.balance)} {b.currency}</span>}
                />
              </div>
            ))}
            {bankBalances.length > 1 && (
              <>
                <MDivider />
                <MRow className="!min-h-[50px]" title={<span className="font-semibold">Total</span>} right={<span className="mono-value font-semibold">{f$(totalBankEur)} €</span>} />
              </>
            )}
          </MCard>
        </>
      )}
    </div>
  );
}
