'use client';

import { useMemo, useState } from 'react';
import { useApp } from '@/context/AppProvider';
import PageHeader from '@/components/layout/PageHeader';
import Card, { KpiCard } from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import { ResidencyEntry, ResidencyCountry } from '@/lib/types';
import { Plus, Pencil, X, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';

const MIN_YEAR = 2026;

// ---- date utils (UTC, jours pleins) ----
function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}
function parseYmd(s: string): Date {
  // construit en UTC pour éviter les décalages TZ
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function todayYmd() {
  const d = new Date();
  return ymd(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())));
}
function dayDiff(a: Date, b: Date) {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}
function addDays(d: Date, n: number) {
  return new Date(d.getTime() + n * 86400000);
}
function isLeap(y: number) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}
function yearDays(y: number) {
  return isLeap(y) ? 366 : 365;
}
function formatFr(s: string) {
  if (!s) return '';
  const d = parseYmd(s);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}

const COUNTRY_LABEL: Record<ResidencyCountry, string> = {
  UAE: '🇦🇪 Émirats',
  FR: '🇫🇷 France',
  OTHER: '🌍 Autre',
};
const COUNTRY_SHORT: Record<ResidencyCountry, string> = {
  UAE: 'UAE',
  FR: 'France',
  OTHER: 'Autre',
};

// Zone colors
const ZONE = {
  red: '#ef4444',
  orange: '#f59e0b',
  green: '#10b981',
  blue: '#3b82f6',
  neutral: '#6b7280',
};

function zoneForUae(days: number) {
  if (days < 90) return { color: ZONE.red, label: 'Insuffisant (TRC impossible)' };
  if (days < 120) return { color: ZONE.orange, label: 'TRC obtenable, marge faible' };
  if (days <= 180) return { color: ZONE.green, label: 'Confortable' };
  return { color: ZONE.blue, label: 'Optimal' };
}
function zoneForFrance(days: number) {
  if (days < 90) return { color: ZONE.green, label: 'OK' };
  if (days <= 150) return { color: ZONE.orange, label: 'À surveiller' };
  if (days <= 183) return { color: ZONE.red, label: 'Très risqué' };
  return { color: ZONE.red, label: 'Violation 4 B' };
}

// Année civile [start, endExclusive)
function yearRange(year: number) {
  const start = new Date(Date.UTC(year, 0, 1));
  const endExcl = new Date(Date.UTC(year + 1, 0, 1));
  return { start, endExcl };
}

interface Computed {
  uae: number;
  fr: number;
  other: number;
  yearTotal: number;
  daysElapsed: number;
  streakOutUae: number;
  streakOutUaeFrom: string | null;
  streakOutUaeTo: string | null;
  longestSegments: { country: ResidencyCountry; start: string; end: string; days: number }[];
  conflicts: string[];
  projection: { uae: number; fr: number; other: number };
}

// Pour chaque jour de l'année, déterminer le pays (le premier segment qui couvre ce jour).
// Convention : si deux segments se chevauchent, on garde celui de plus haute priorité (UAE > FR > OTHER)
// pour éviter le double-comptage. Sinon, ordre d'insertion.
function computeYear(year: number, entries: ResidencyEntry[]): Computed {
  const { start, endExcl } = yearRange(year);
  const today = parseYmd(todayYmd());
  // tableau d'attribution par jour
  const total = yearDays(year);
  const owner: (ResidencyCountry | null)[] = new Array(total).fill(null);
  const conflicts: string[] = [];

  // Pré-clamp + tri segments par start
  const segs = entries
    .map(e => {
      const segStart = parseYmd(e.start);
      const segEnd = e.end ? parseYmd(e.end) : today;
      return { ...e, _start: segStart, _end: segEnd };
    })
    .filter(s => s._end >= s._start)
    .sort((a, b) => a._start.getTime() - b._start.getTime());

  // Détection chevauchements
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const a = segs[i], b = segs[j];
      if (b._start <= a._end) {
        conflicts.push(`Chevauchement: ${COUNTRY_SHORT[a.country]} ${a.start}→${a.end || '…'} & ${COUNTRY_SHORT[b.country]} ${b.start}→${b.end || '…'}`);
      } else {
        break;
      }
    }
  }

  for (const seg of segs) {
    // clamp [start, endExcl)
    const segStartClamped = seg._start < start ? start : seg._start;
    const segEndClamped = seg._end >= endExcl ? new Date(endExcl.getTime() - 86400000) : seg._end;
    if (segStartClamped > segEndClamped) continue;
    const i0 = dayDiff(segStartClamped, start);
    const i1 = dayDiff(segEndClamped, start);
    for (let i = i0; i <= i1; i++) {
      if (i < 0 || i >= total) continue;
      // si conflit, priorité UAE > FR > OTHER ; sinon premier set
      const cur = owner[i];
      if (cur === null) owner[i] = seg.country;
      else {
        const prio = (c: ResidencyCountry) => c === 'UAE' ? 3 : c === 'FR' ? 2 : 1;
        if (prio(seg.country) > prio(cur)) owner[i] = seg.country;
      }
    }
  }

  // Comptage borné au jour d'aujourd'hui (pour les compteurs "à date")
  const daysElapsed = year === today.getUTCFullYear()
    ? Math.min(total, dayDiff(today, start) + 1)
    : year < today.getUTCFullYear() ? total : 0;

  let uae = 0, fr = 0, other = 0;
  for (let i = 0; i < daysElapsed; i++) {
    if (owner[i] === 'UAE') uae++;
    else if (owner[i] === 'FR') fr++;
    else if (owner[i] === 'OTHER') other++;
  }

  // Streak hors UAE (sur la portion écoulée)
  let streak = 0, bestStreak = 0, bestFrom = -1, bestTo = -1, curFrom = -1;
  for (let i = 0; i < daysElapsed; i++) {
    if (owner[i] === 'UAE') {
      streak = 0;
      curFrom = -1;
    } else if (owner[i] === null) {
      // jour non renseigné : on ne compte pas comme hors UAE
      streak = 0;
      curFrom = -1;
    } else {
      if (curFrom === -1) curFrom = i;
      streak++;
      if (streak > bestStreak) {
        bestStreak = streak;
        bestFrom = curFrom;
        bestTo = i;
      }
    }
  }
  const streakFrom = bestFrom >= 0 ? ymd(addDays(start, bestFrom)) : null;
  const streakTo = bestTo >= 0 ? ymd(addDays(start, bestTo)) : null;

  // Segments les plus longs (calcul direct depuis segs clamp)
  const longestSegments = segs
    .map(s => {
      const sStart = s._start < start ? start : s._start;
      const sEnd = s._end >= endExcl ? new Date(endExcl.getTime() - 86400000) : s._end;
      const cap = sEnd > today ? today : sEnd;
      const days = sStart > cap ? 0 : dayDiff(cap, sStart) + 1;
      return { country: s.country, start: ymd(sStart), end: ymd(cap), days };
    })
    .filter(x => x.days > 0)
    .sort((a, b) => b.days - a.days)
    .slice(0, 5);

  // Projection annualisée (uniquement pour année en cours)
  let projection = { uae, fr, other };
  if (year === today.getUTCFullYear() && daysElapsed > 0) {
    const factor = total / daysElapsed;
    projection = {
      uae: Math.round(uae * factor),
      fr: Math.round(fr * factor),
      other: Math.round(other * factor),
    };
  }

  return {
    uae, fr, other,
    yearTotal: total,
    daysElapsed,
    streakOutUae: bestStreak,
    streakOutUaeFrom: streakFrom,
    streakOutUaeTo: streakTo,
    longestSegments,
    conflicts,
    projection,
  };
}

// ---- composant ----
export default function ResidencyPage() {
  const { residencyEntries, addResidencyEntry, updateResidencyEntry, deleteResidencyEntry } = useApp();

  const nowYear = new Date().getUTCFullYear();
  const initialYear = nowYear < MIN_YEAR ? MIN_YEAR : nowYear;
  const [year, setYear] = useState<number>(initialYear);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ResidencyEntry | null>(null);
  const [fCountry, setFCountry] = useState<ResidencyCountry>('UAE');
  const [fCountryName, setFCountryName] = useState('');
  const [fStart, setFStart] = useState('');
  const [fEnd, setFEnd] = useState('');
  const [fOngoing, setFOngoing] = useState(false);
  const [fNote, setFNote] = useState('');

  const computed = useMemo(() => computeYear(year, residencyEntries), [year, residencyEntries]);

  const entriesForYear = useMemo(() => {
    const { start, endExcl } = yearRange(year);
    return [...residencyEntries]
      .filter(e => {
        const s = parseYmd(e.start);
        const en = e.end ? parseYmd(e.end) : new Date();
        return en >= start && s < endExcl;
      })
      .sort((a, b) => a.start.localeCompare(b.start));
  }, [year, residencyEntries]);

  const isCurrentYear = year === nowYear;
  const today = todayYmd();
  const alerts = useMemo(() => {
    const list: { level: 'red' | 'orange'; msg: string }[] = [];
    if (computed.streakOutUae > 180) list.push({ level: 'red', msg: `Streak hors UAE: ${computed.streakOutUae} jours — Emirates ID compromis (>180j)` });
    else if (computed.streakOutUae >= 150) list.push({ level: 'orange', msg: `Streak hors UAE: ${computed.streakOutUae} jours — approche du seuil 180j` });

    if (isCurrentYear) {
      const m = new Date().getUTCMonth(); // 0=jan
      if (m >= 9 && computed.uae < 90) {
        list.push({ level: 'red', msg: `UAE: ${computed.uae}j à mi-octobre — TRC compromis pour ${year}` });
      }
    }

    if (computed.fr > 183) list.push({ level: 'red', msg: `France: ${computed.fr}j — violation art. 4 B (>183j)` });
    else if (computed.fr > 150) list.push({ level: 'red', msg: `France: ${computed.fr}j — proche du plafond 183j` });
    else if (computed.fr > 90) list.push({ level: 'orange', msg: `France: ${computed.fr}j — au-delà du seuil de sécurité 90j` });

    return list;
  }, [computed, isCurrentYear, year]);

  function resetForm() {
    setFCountry('UAE');
    setFCountryName('');
    setFStart('');
    setFEnd('');
    setFOngoing(false);
    setFNote('');
    setEditing(null);
  }

  function openNew() {
    resetForm();
    setFStart(today);
    setModalOpen(true);
  }

  function openEdit(e: ResidencyEntry) {
    setEditing(e);
    setFCountry(e.country);
    setFCountryName(e.countryName || '');
    setFStart(e.start);
    setFEnd(e.end || '');
    setFOngoing(!e.end);
    setFNote(e.note || '');
    setModalOpen(true);
  }

  function handleSave() {
    if (!fStart) return alert('Date de début requise');
    if (!fOngoing && !fEnd) return alert('Date de fin requise (ou cocher "en cours")');
    if (!fOngoing && fEnd < fStart) return alert('Date de fin avant date de début');
    const payload: Omit<ResidencyEntry, 'id'> = {
      country: fCountry,
      start: fStart,
      end: fOngoing ? null : fEnd,
      ...(fCountry === 'OTHER' && fCountryName.trim() ? { countryName: fCountryName.trim() } : {}),
      ...(fNote.trim() ? { note: fNote.trim() } : {}),
    };
    if (editing) updateResidencyEntry(editing.id, payload);
    else addResidencyEntry(payload);
    setModalOpen(false);
    resetForm();
  }

  function handleDelete(id: string) {
    if (!confirm('Supprimer ce séjour ?')) return;
    deleteResidencyEntry(id);
  }

  const uaeZone = zoneForUae(computed.uae);
  const frZone = zoneForFrance(computed.fr);

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Global' }, { label: 'Résidence', current: true }]}
        title="Résidence fiscale"
        subtitle="Jours par pays sur l'année civile — suivi UAE / France / Autres"
      >
        <div className="flex items-center gap-2">
          <button
            onClick={() => setYear(y => Math.max(MIN_YEAR, y - 1))}
            disabled={year <= MIN_YEAR}
            className="w-8 h-8 flex items-center justify-center rounded-md border border-border bg-bg-3 text-t-2 hover:text-t-1 hover:bg-bg-4 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all"
          >
            <ChevronLeft size={14} />
          </button>
          <div className="px-3 py-1.5 bg-bg-3 border border-border rounded-md text-[13px] font-semibold mono-value">{year}</div>
          <button
            onClick={() => setYear(y => y + 1)}
            className="w-8 h-8 flex items-center justify-center rounded-md border border-border bg-bg-3 text-t-2 hover:text-t-1 hover:bg-bg-4 cursor-pointer transition-all"
          >
            <ChevronRight size={14} />
          </button>
          <button
            onClick={openNew}
            className="ml-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent text-black font-semibold text-[12px] rounded-md hover:opacity-90 cursor-pointer"
          >
            <Plus size={13} /> Nouveau séjour
          </button>
        </div>
      </PageHeader>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <KpiCard
          label="🇦🇪 UAE"
          value={`${computed.uae} / 90 J`}
          sub={`${uaeZone.label}${isCurrentYear ? ` · proj. ${computed.projection.uae}J` : ''}`}
          accentColor={uaeZone.color}
          hero
        />
        <KpiCard
          label="🇫🇷 France"
          value={`${computed.fr} / 183 J`}
          sub={`${frZone.label}${isCurrentYear ? ` · proj. ${computed.projection.fr}J` : ''}`}
          accentColor={frZone.color}
          hero
        />
        <KpiCard
          label="🌍 Autres pays"
          value={`${computed.other} J`}
          sub={`${isCurrentYear ? `proj. ${computed.projection.other}J · ` : ''}voir détail tableau`}
          accentColor={ZONE.neutral}
          hero
        />
      </div>

      {/* Alertes & conflits */}
      {(alerts.length > 0 || computed.conflicts.length > 0) && (
        <div className="mb-6 space-y-2">
          {alerts.map((a, i) => (
            <div
              key={`a${i}`}
              className="flex items-start gap-2 px-3 py-2.5 rounded-md border text-[12px]"
              style={{
                background: a.level === 'red' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)',
                borderColor: a.level === 'red' ? 'rgba(239,68,68,0.35)' : 'rgba(245,158,11,0.35)',
                color: a.level === 'red' ? '#fca5a5' : '#fcd34d',
              }}
            >
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <div className="tracking-tight">{a.msg}</div>
            </div>
          ))}
          {computed.conflicts.map((c, i) => (
            <div
              key={`c${i}`}
              className="flex items-start gap-2 px-3 py-2.5 rounded-md border text-[12px]"
              style={{
                background: 'rgba(245,158,11,0.06)',
                borderColor: 'rgba(245,158,11,0.25)',
                color: '#fcd34d',
              }}
            >
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <div className="tracking-tight">{c}</div>
            </div>
          ))}
        </div>
      )}

      {/* Bandeau résumé */}
      <Card className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-[10px] text-t-3 uppercase tracking-[0.12em] font-semibold mb-1">Total jours saisis</div>
            <div className="text-[18px] mono-value">{computed.uae + computed.fr + computed.other} / {isCurrentYear ? computed.daysElapsed : computed.yearTotal} J</div>
            <div className="text-[10px] text-t-3 mt-0.5">
              {(() => {
                const reste = (isCurrentYear ? computed.daysElapsed : computed.yearTotal) - (computed.uae + computed.fr + computed.other);
                return reste > 0 ? `${reste}J non renseignés` : 'tous renseignés';
              })()}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-t-3 uppercase tracking-[0.12em] font-semibold mb-1">Streak hors UAE</div>
            <div className="text-[18px] mono-value" style={{ color: computed.streakOutUae > 150 ? ZONE.red : computed.streakOutUae > 100 ? ZONE.orange : undefined }}>
              {computed.streakOutUae} J
            </div>
            <div className="text-[10px] text-t-3 mt-0.5 mono-value">
              {computed.streakOutUaeFrom ? `${formatFr(computed.streakOutUaeFrom)} → ${formatFr(computed.streakOutUaeTo!)}` : '—'}
            </div>
          </div>
        </div>
      </Card>

      {/* Tableau séjours */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[12px] uppercase tracking-[0.14em] font-semibold text-t-2">Séjours {year}</div>
          <div className="text-[10px] text-t-3 mono-value">{entriesForYear.length} entrée{entriesForYear.length > 1 ? 's' : ''}</div>
        </div>
        {entriesForYear.length === 0 ? (
          <div className="text-center py-8 text-t-3 text-[12px]">
            Aucun séjour pour {year}. Clique <span className="text-accent font-semibold">+ Nouveau séjour</span> pour commencer.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-[10px] text-t-3 uppercase tracking-[0.12em]">
                  <th className="text-left font-semibold py-2 px-2">Pays</th>
                  <th className="text-left font-semibold py-2 px-2">Du</th>
                  <th className="text-left font-semibold py-2 px-2">Au</th>
                  <th className="text-right font-semibold py-2 px-2">Jours</th>
                  <th className="text-left font-semibold py-2 px-2">Note</th>
                  <th className="text-right font-semibold py-2 px-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {entriesForYear.map(e => {
                  const sStart = parseYmd(e.start);
                  const sEnd = e.end ? parseYmd(e.end) : parseYmd(today);
                  const { start: yStart, endExcl: yEnd } = yearRange(year);
                  const clampStart = sStart < yStart ? yStart : sStart;
                  const cap = sEnd >= yEnd ? new Date(yEnd.getTime() - 86400000) : sEnd;
                  const today2 = parseYmd(today);
                  const realCap = cap > today2 ? today2 : cap;
                  const days = clampStart > realCap ? 0 : dayDiff(realCap, clampStart) + 1;
                  const label = e.country === 'OTHER' && e.countryName
                    ? `🌍 ${e.countryName}`
                    : COUNTRY_LABEL[e.country];
                  return (
                    <tr key={e.id} className="border-t border-border hover:bg-bg-3/40 transition-colors">
                      <td className="py-2 px-2 font-medium">{label}</td>
                      <td className="py-2 px-2 mono-value">{formatFr(e.start)}</td>
                      <td className="py-2 px-2 mono-value">{e.end ? formatFr(e.end) : <span className="text-accent font-semibold">en cours</span>}</td>
                      <td className="py-2 px-2 text-right mono-value">{days}</td>
                      <td className="py-2 px-2 text-t-3 truncate max-w-[200px]">{e.note || '—'}</td>
                      <td className="py-2 px-2 text-right">
                        <div className="inline-flex gap-1">
                          <button
                            onClick={() => openEdit(e)}
                            className="w-6 h-6 inline-flex items-center justify-center rounded-md text-t-3 hover:text-t-1 hover:bg-bg-4 cursor-pointer transition-all"
                            title="Modifier"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => handleDelete(e.id)}
                            className="w-6 h-6 inline-flex items-center justify-center rounded-md text-t-3 hover:text-danger hover:bg-danger/10 cursor-pointer transition-all"
                            title="Supprimer"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Top segments */}
      {computed.longestSegments.length > 0 && (
        <Card className="mt-4">
          <div className="text-[12px] uppercase tracking-[0.14em] font-semibold text-t-2 mb-2">Plus longs séjours {year}</div>
          <div className="space-y-1.5">
            {computed.longestSegments.map((s, i) => (
              <div key={i} className="flex items-center justify-between text-[12px] py-1.5 px-2 rounded-md bg-bg-2/50">
                <span className="font-medium">{COUNTRY_LABEL[s.country]}</span>
                <span className="text-t-3 mono-value">{formatFr(s.start)} → {formatFr(s.end)}</span>
                <span className="mono-value font-semibold">{s.days} j</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Modal */}
      <Modal open={modalOpen} onClose={() => { setModalOpen(false); resetForm(); }} title={editing ? 'Modifier le séjour' : 'Nouveau séjour'}>
        <div className="space-y-3.5">
          <div>
            <label className="block text-[10px] text-t-3 uppercase tracking-wider font-medium mb-1.5">Pays</label>
            <select className="fi" value={fCountry} onChange={e => setFCountry(e.target.value as ResidencyCountry)}>
              <option value="UAE">🇦🇪 Émirats Arabes Unis</option>
              <option value="FR">🇫🇷 France</option>
              <option value="OTHER">🌍 Autre</option>
            </select>
          </div>
          {fCountry === 'OTHER' && (
            <div>
              <label className="block text-[10px] text-t-3 uppercase tracking-wider font-medium mb-1.5">Nom du pays</label>
              <input className="fi" value={fCountryName} onChange={e => setFCountryName(e.target.value)} placeholder="Ex: Italie, Thaïlande..." />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[10px] text-t-3 uppercase tracking-wider font-medium mb-1.5">Date d&apos;arrivée</label>
              <input type="date" className="fi" value={fStart} onChange={e => setFStart(e.target.value)} />
            </div>
            <div>
              <label className="block text-[10px] text-t-3 uppercase tracking-wider font-medium mb-1.5">Date de fin</label>
              <input
                type="date"
                className="fi"
                value={fEnd}
                disabled={fOngoing}
                onChange={e => setFEnd(e.target.value)}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-[12px] text-t-2 cursor-pointer">
            <input type="checkbox" checked={fOngoing} onChange={e => { setFOngoing(e.target.checked); if (e.target.checked) setFEnd(''); }} />
            En cours (jusqu&apos;à aujourd&apos;hui)
          </label>
          <div>
            <label className="block text-[10px] text-t-3 uppercase tracking-wider font-medium mb-1.5">Note (optionnel)</label>
            <input className="fi" value={fNote} onChange={e => setFNote(e.target.value)} placeholder="Ex: voyage business, vacances..." />
          </div>
          <div className="flex gap-2.5 mt-5">
            <button onClick={handleSave} className="px-4 py-2 bg-accent text-black font-semibold text-sm rounded-sm cursor-pointer hover:opacity-90">
              {editing ? 'Enregistrer' : 'Créer'}
            </button>
            <button onClick={() => { setModalOpen(false); resetForm(); }} className="px-4 py-2 border border-border text-t-2 text-sm rounded-sm cursor-pointer hover:bg-bg-3">
              Annuler
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
