import { describe, it, expect } from 'vitest';
import { shouldAdoptRemote, sendWasDelivered } from '../sync';

const OLD = '2026-11-18T08:00:00.000Z';
const NEW = '2026-11-20T19:30:00.000Z';

describe('shouldAdoptRemote', () => {
  it('adopte la version en ligne si elle est plus récente', () => {
    expect(shouldAdoptRemote(OLD, NEW, false)).toBe(true);
    expect(shouldAdoptRemote(undefined, NEW, false)).toBe(true);
  });
  it('garde la copie locale si elle est identique ou plus récente', () => {
    expect(shouldAdoptRemote(NEW, NEW, false)).toBe(false);
    expect(shouldAdoptRemote(NEW, OLD, false)).toBe(false);
  });
  it('ne touche à rien s’il reste des modifications locales non envoyées', () => {
    expect(shouldAdoptRemote(OLD, NEW, true)).toBe(false);
  });
  it('une version en ligne sans date ne remplace jamais rien', () => {
    expect(shouldAdoptRemote(OLD, undefined, false)).toBe(false);
    expect(shouldAdoptRemote(undefined, undefined, false)).toBe(false);
  });
});

describe('sendWasDelivered', () => {
  it('même horodatage des deux côtés = l’envoi était arrivé', () => {
    expect(sendWasDelivered(NEW, NEW)).toBe(true);
    expect(sendWasDelivered(NEW, OLD)).toBe(false);
    expect(sendWasDelivered(undefined, undefined)).toBe(false);
  });
});
