/** Texte saisi (virgule ou point, espaces tolérés) → nombre. NaN si illisible. */
export const parseAmount = (s: string): number => parseFloat((s || '').replace(/\s/g, '').replace(',', '.'));

/** Nombre → texte de champ (virgule décimale, vide pour 0). */
export const amountText = (n: number | undefined | null): string => (n ? String(Math.round(n * 10000) / 10000).replace('.', ',') : '');
