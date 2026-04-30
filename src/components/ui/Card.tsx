'use client';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  accentColor?: string;
}

export default function Card({ children, className = '', accentColor }: CardProps) {
  return (
    <div className={`bg-bg-3 border border-border rounded-md p-4 relative overflow-hidden transition-all hover:border-border-2 ${className}`}>
      {accentColor && (
        <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: accentColor }} />
      )}
      {children}
    </div>
  );
}

export function KpiCard({ label, value, sub, accentColor, className = '' }: {
  label: string; value: string; sub?: string; accentColor?: string; className?: string;
}) {
  return (
    <Card accentColor={accentColor} className={`animate-fade-up ${className}`}>
      <div className="text-[10px] text-t-3 uppercase tracking-wider font-medium mb-2">{label}</div>
      <div className="font-mono text-[22px] font-bold tracking-tight mono-value">{value}</div>
      {sub && <div className="text-[11px] text-t-3 mt-1 font-mono mono-value">{sub}</div>}
    </Card>
  );
}
