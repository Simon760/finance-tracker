import { describe, it, expect } from 'vitest';
import { monthLabel, monthWord, dayLabel, shortDay } from '../labels';

describe('monthLabel', () => {
  it('nom + année calculée, avec ou sans suffixe dans l’id', () => {
    expect(monthLabel({ id: 'NOVEMBRE 26', _year: 2026 })).toBe('Novembre 2026');
    expect(monthLabel({ id: 'OCTOBRE', _year: 2025 })).toBe('Octobre 2025');
    expect(monthLabel({ id: 'DECEMBRE', _year: 2025 })).toBe('Décembre 2025'); // accent rétabli
    expect(monthLabel({ id: 'FÉVRIER' })).toBe('Février');
  });
  it('un nom libre reste tel quel', () => {
    expect(monthLabel({ id: 'VACANCES ÉTÉ', _year: 2026 })).toBe('VACANCES ÉTÉ');
    expect(monthWord({ id: 'AOÛT 26' })).toBe('août');
  });
});

describe('dayLabel / shortDay', () => {
  const today = '2026-11-20';
  it('aujourd’hui, hier, puis la date', () => {
    expect(dayLabel('2026-11-20', today)).toBe('Aujourd’hui');
    expect(dayLabel('2026-11-19', today)).toBe('Hier');
    expect(dayLabel('2026-11-18', today)).toBe('18 novembre');
    expect(dayLabel('2026-11-01', today)).toBe('1er novembre');
    expect(dayLabel('2025-12-31', today)).toBe('31 décembre 2025');
  });
  it('hier franchit le mois et l’année', () => {
    expect(dayLabel('2026-10-31', '2026-11-01')).toBe('Hier');
    expect(dayLabel('2025-12-31', '2026-01-01')).toBe('Hier');
  });
  it('date absente ou illisible', () => {
    expect(dayLabel(undefined, today)).toBe('Sans date');
    expect(dayLabel('—', today)).toBe('Sans date');
    expect(shortDay('', today)).toBe('—');
  });
  it('date courte', () => {
    expect(shortDay('2026-11-18', today)).toBe('18/11');
    expect(shortDay('2025-11-18', today)).toBe('18/11/25');
  });
});
