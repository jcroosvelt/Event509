import { describe, expect, it } from 'vitest';
import { COUNTRIES, KNOWN_CITIES, countryName, nearestKnownCity } from '@/data/countries';

describe('pays et villes du monde', () => {
  it('propose tous les pays, sans doublon, Haïti en premier', () => {
    expect(COUNTRIES[0]).toBe('HT');
    expect(new Set(COUNTRIES).size).toBe(COUNTRIES.length);
    expect(COUNTRIES.length).toBeGreaterThan(190);
    for (const c of ['JP', 'NG', 'BR', 'IN', 'AU', 'ZA']) expect(COUNTRIES).toContain(c);
  });
  it('chaque pays a un nom lisible dans les deux langues', () => {
    for (const c of COUNTRIES) {
      expect(countryName(c, 'fr')).not.toBe(c);
      expect(countryName(c, 'en')).not.toBe(c);
    }
  });
  it('les grandes villes du monde ont un pays valide et des coordonnées plausibles', () => {
    expect(KNOWN_CITIES.length).toBeGreaterThan(200);
    for (const k of KNOWN_CITIES) {
      expect(COUNTRIES).toContain(k.country);
      expect(Math.abs(k.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(k.lng)).toBeLessThanOrEqual(180);
    }
    const seen = new Set<string>();
    for (const k of KNOWN_CITIES) {
      const key = `${k.country}|${k.city}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
  it('rattache une position GPS à la bonne ville du monde', () => {
    expect(nearestKnownCity(35.68, 139.7)?.city).toBe('Tokyo');
    expect(nearestKnownCity(6.5, 3.4)).toMatchObject({ city: 'Lagos', country: 'NG' });
    expect(nearestKnownCity(18.59, -72.3)?.city).toBe('Port-au-Prince');
  });
});
