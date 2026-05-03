'use client';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  accentColor?: string;
  hover?: boolean;
}

export default function Card({ children, className = '', accentColor, hover = true }: CardProps) {
  return (
    <div className={`bg-bg-3 border border-border rounded-lg p-5 relative overflow-hidden transition-all shadow-inset-border ${hover ? 'hover:border-border-2' : ''} ${className}`}>
      {accentColor && (
        <div
          className="absolute top-0 left-0 right-0 h-[2px] opacity-80"
          style={{ background: `linear-gradient(90deg, ${accentColor}, transparent)` }}
        />
      )}
      {children}
    </div>
  );
}

export function KpiCard({ label, value, sub, accentColor, className = '', hero = false }: {
  label: string; value: string; sub?: string; accentColor?: string; className?: string; hero?: boolean;
}) {
  return (
    <Card accentColor={accentColor} className={`animate-fade-up ${className}`}>
      <div className="flex items-center justify-between mb-2.5">
        <div className="text-[10px] text-t-3 uppercase tracking-[0.12em] font-semibold">{label}</div>
        {accentColor && (
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: accentColor, boxShadow: `0 0 8px ${accentColor}` }} />
        )}
      </div>
      {hero ? (
        <div className="hero-num text-[30px] leading-none mono-value text-t-1">{value}</div>
      ) : (
        <div className="hero-num text-[24px] leading-none mono-value text-t-1" style={{ fontWeight: 400, letterSpacing: '-0.5px' }}>{value}</div>
      )}
      {sub && <div className="text-[11px] text-t-3 mt-2 font-mono mono-value tracking-tight">{sub}</div>}
    </Card>
  );
}
