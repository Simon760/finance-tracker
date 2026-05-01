'use client';

import { useApp } from '@/context/AppProvider';
import { useEffect, useState } from 'react';

interface PageHeaderProps {
  breadcrumb: { label: string; current?: boolean }[];
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}

function LastUpdateBadge() {
  const { state } = useApp();
  const [, setTick] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(iv);
  }, []);

  if (!state.lastUpdate) return null;

  const d = new Date(state.lastUpdate);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);

  let ago: string;
  if (diffMin < 1) ago = "à l'instant";
  else if (diffMin < 60) ago = `il y a ${diffMin} min`;
  else if (diffH < 24) ago = `il y a ${diffH}h${diffMin % 60 > 0 ? String(diffMin % 60).padStart(2, '0') : ''}`;
  else ago = d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  return (
    <span className="text-[10px] text-t-4 font-mono ml-auto">
      Maj: {ago}
    </span>
  );
}

export default function PageHeader({ breadcrumb, title, subtitle, children }: PageHeaderProps) {
  return (
    <>
      <div className="flex items-center gap-1.5 text-xs text-t-3 mb-5">
        {breadcrumb.map((b, i) => (
          <span key={i} className={b.current ? 'text-t-2 font-medium' : ''}>
            {i > 0 && <span className="text-[10px] mr-1.5">›</span>}
            {b.label}
          </span>
        ))}
        <LastUpdateBadge />
      </div>
      <div className="flex justify-between items-start mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="text-t-3 text-xs mt-0.5">{subtitle}</p>}
        </div>
        {children && <div className="flex items-center gap-2">{children}</div>}
      </div>
    </>
  );
}
