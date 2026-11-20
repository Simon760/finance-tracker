import { describe, it, expect } from 'vitest';
import { monthBaseName, monthYearSuffix, monthIndexOf, isLegacyEarnMonth } from '../constants';

describe('identité des mois (id → nom, année, index)', () => {
  it('retire le suffixe année, 2 ou 4 chiffres', () => {
    expect(monthBaseName('OCTOBRE 26')).toBe('OCTOBRE');
    expect(monthBaseName('octobre 2026')).toBe('OCTOBRE');
    expect(monthBaseName('  MARS ')).toBe('MARS');
  });

  it('lit l’année du suffixe', () => {
    expect(monthYearSuffix('OCTOBRE 26')).toBe(2026);
    expect(monthYearSuffix('OCTOBRE 2027')).toBe(2027);
    expect(monthYearSuffix('OCTOBRE')).toBeNull();
  });

  it('index calendaire tolérant aux accents et au suffixe', () => {
    expect(monthIndexOf('JANVIER')).toBe(0);
    expect(monthIndexOf('FEVRIER')).toBe(1);
    expect(monthIndexOf('FÉVRIER')).toBe(1);
    expect(monthIndexOf('AOUT')).toBe(7);
    expect(monthIndexOf('DÉCEMBRE 26')).toBe(11);
    expect(monthIndexOf('VACANCES')).toBe(-1);
  });

  it('mois legacy : comparaison insensible aux accents, un suffixe année en sort', () => {
    expect(isLegacyEarnMonth('FEVRIER')).toBe(true);
    expect(isLegacyEarnMonth('FÉVRIER')).toBe(true);
    expect(isLegacyEarnMonth('MARS')).toBe(false);
    expect(isLegacyEarnMonth('OCTOBRE 26')).toBe(false);
  });
});
