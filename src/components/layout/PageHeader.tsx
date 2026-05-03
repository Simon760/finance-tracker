'use client';

import { useApp } from '@/context/AppProvider';

interface PageHeaderProps {
  breadcrumb: { label: string; current?: boolean }[];
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}

function LastUpdateBadge() {
  const { state } = useApp();
  if (!state.lastUpdate) return null;

  const d = new Date(state.lastUpdate);
  const dateStr = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  return (
    <span className="inline-flex items-center gap-1.5 ml-auto text-[10px] text-t-3 font-mono mono-value bg-bg-3/60 border border-border rounded-full px-2.5 py-1">
      <span className="w-1 h-1 rounded-full bg-accent" />
      Maj: {dateStr} · {timeStr}
    </span>
  );
}

export default function PageHeader({ breadcrumb, title, subtitle, children }: PageHeaderProps) {
  return (
    <div className="animate-fade-up">
      <div className="flex items-center gap-1.5 text-[11px] text-t-3 mb-5">
        {breadcrumb.map((b, i) => (
          <span key={i} className={b.current ? 'text-t-2 font-medium tracking-tight' : 'tracking-tight'}>
            {i > 0 && <span className="text-[10px] mx-1 text-t-4">›</span>}
            {b.label}
          </span>
        ))}
        <LastUpdateBadge />
      </div>
      <div className="flex justify-between items-start mb-7 flex-wrap gap-3">
        <div>
          <h1 className="text-[26px] font-bold tracking-tightest leading-none text-t-1">{title}</h1>
          {subtitle && <p className="text-t-3 text-[12px] mt-2 tracking-tight">{subtitle}</p>}
        </div>
        {children && <div className="flex items-center gap-2">{children}</div>}
      </div>
    </div>
  );
}
