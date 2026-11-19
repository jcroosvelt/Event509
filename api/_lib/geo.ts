import { BASE_CITIES, distanceKm } from '../../src/data/cityCoords.js';
import { WORLD_CITIES } from '../../src/data/worldCities.js';

export { distanceKm };

/** Nom de lieu comparable : sans accents ni ponctuation, en minuscules (« Port-au-Prince » = « port au prince »). */
export const plainPlace = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

type City = { city: string; country: string; lat: number; lng: number };
let index: Map<string, City[]> | null = null;

function cities() {
  if (index) return index;
  index = new Map();
  // Les villes d'Haïti et de la diaspora passent avant les grandes villes du monde
  for (const c of [...BASE_CITIES, ...WORLD_CITIES]) {
    const k = plainPlace(c.city);
    index.set(k, [...(index.get(k) ?? []), c]);
  }
  return index;
}

/** Coordonnées d'une ville connue (le pays du lieu départage les homonymes ; sans pays, la première ville de la liste). */
export function cityCoords(city: unknown, country?: string | null): { lat: number; lng: number } | null {
  const list = cities().get(plainPlace(city));
  if (!list?.length) return null;
  const c = (country && list.find((x) => x.country === country.toUpperCase())) || list[0]!;
  return { lat: c.lat, lng: c.lng };
}

/** Position d'un appareil : nombres valides seulement, arrondis à 0,01° (environ 1 km) avant d'être gardés. */
export function cleanPosition(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const a = typeof lat === 'number' ? lat : Number.NaN;
  const b = typeof lng === 'number' ? lng : Number.NaN;
  if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > 90 || Math.abs(b) > 180) return null;
  return { lat: Math.round(a * 100) / 100, lng: Math.round(b * 100) / 100 };
}
