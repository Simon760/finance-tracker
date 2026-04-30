'use client';

interface PageHeaderProps {
  breadcrumb: { label: string; current?: boolean }[];
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
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
