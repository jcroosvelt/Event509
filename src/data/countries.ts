/**
 * Pays et proximité : les événements proches de l'utilisateur passent en premier.
 * Un lieu porte son pays (code à 2 lettres) ; sans pays, il est déduit de sa ville, sinon Haïti.
 */
import type { EventItem } from '@/types';
import type { Lang } from '@/types';
import { BASE_CITIES, distanceKm } from './cityCoords';
import { WORLD_CITIES } from './worldCities';

export { distanceKm };

/** Tous les pays (codes ISO) : Haïti d'abord, puis les pays les plus liés à la diaspora, puis le reste du monde. */
const PRIORITY = ['HT', 'US', 'CA', 'DO', 'FR', 'JM', 'BS', 'CU', 'PR', 'MX', 'BR', 'GP', 'MQ', 'GF', 'BE', 'CH', 'GB'] as const;
const OTHERS = `AF AL DZ AD AO AG AR AM AU AT AZ BH BD BB BY BZ BJ BT BO BA BW BN BG BF BI KH CM CV CF TD CL CN CO KM CG CD CR CI HR CY CZ DK DJ DM EC EG SV GQ ER EE SZ ET FJ FI GA GM GE DE GH GR GD GT GN GW GY HN HK HU IS IN ID IR IQ IE IL IT JP JO KZ KE KI KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MR MU MD MC MN ME MA MZ MM NA NP NL NC NZ NI NE NG MK NO OM PK PA PG PY PE PH PL PT PF QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA KR SS ES LK SD SR SE SY TW TJ TZ TH TL TG TO TT TN TR TM UG UA AE UY UZ VU VE VN YE ZM ZW`.split(' ');
export const COUNTRIES: string[] = [...PRIORITY, ...OTHERS.filter((c) => !(PRIORITY as readonly string[]).includes(c))];
export const DEFAULT_COUNTRY = 'HT';

/** Villes connues dont le pays n'est pas Haïti. */
export const CITY_COUNTRY: Record<string, string> = { Miami: 'US', 'Montréal': 'CA', Montreal: 'CA', 'New York': 'US', Paris: 'FR', 'Santo Domingo': 'DO', Boston: 'US', Orlando: 'US', Toronto: 'CA' };

/** Nom d'un pays dans la langue de l'interface. */
export function countryName(code: string, lang: Lang = 'fr') {
  try {
    return new Intl.DisplayNames(lang === 'en' ? 'en-US' : 'fr-FR', { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Texte comparable : sans accents ni majuscules. */
export const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** Position choisie ou détectée de l'utilisateur. */
export interface Place {
  country: string;
  city: string;
  /** Choisie par l'utilisateur : elle n'est plus remplacée par la détection automatique. */
  manual: boolean;
}
export const DEFAULT_PLACE: Place = { country: DEFAULT_COUNTRY, city: '', manual: false };

/** Pays d'un événement ; null pour un événement uniquement en ligne. */
export function countryOfEvent(e: Pick<EventItem, 'venue'>): string | null {
  if (!e.venue) return null;
  return e.venue.country ?? CITY_COUNTRY[e.venue.city] ?? DEFAULT_COUNTRY;
}

/**
 * Proximité : 0 = dans la même ville, 1 = dans le même pays (ou en ligne, accessible partout), 2 = ailleurs.
 */
export function proximityTier(e: Pick<EventItem, 'venue'>, place: Place): 0 | 1 | 2 {
  const c = countryOfEvent(e);
  if (c === null) return 1;
  if (c !== place.country) return 2;
  if (place.city && e.venue && norm(e.venue.city) === norm(place.city)) return 0;
  return 1;
}

/** Pays déduit de la langue du navigateur (« fr-HT » → HT), en dernier recours. */
export function browserCountry(): string | null {
  try {
    const r = new Intl.Locale(navigator.language).region;
    return r && COUNTRIES.includes(r) ? r : null;
  } catch {
    return null;
  }
}

/** Villes connues (latitude, longitude) : la position GPS de l'utilisateur est rattachée à la ville la plus proche. */
export const KNOWN_CITIES: { city: string; country: string; lat: number; lng: number }[] = [...BASE_CITIES];

// Les grandes villes du monde complètent la liste (les villes haïtiennes et de la diaspora ci-dessus restent prioritaires)
for (const w of WORLD_CITIES) if (!KNOWN_CITIES.some((k) => k.country === w.country && norm(k.city) === norm(w.city))) KNOWN_CITIES.push(w);


/** Ville connue la plus proche d'une position GPS (dans un rayon de `maxKm`), sinon null. */
export function nearestKnownCity(lat: number, lng: number, maxKm = 60) {
  let best: { city: string; country: string; km: number } | null = null;
  for (const k of KNOWN_CITIES) {
    const km = distanceKm({ lat, lng }, k);
    if (km <= maxKm && (!best || km < best.km)) best = { city: k.city, country: k.country, km };
  }
  return best;
}

/**
 * Goûts de l'utilisateur : catégories choisies, et signaux implicites (favoris, billets achetés, événements consultés).
 * Le poids d'une catégorie sert à classer les événements « Pour vous ».
 */
export interface TasteProfile {
  tastes: string[];
  favorites: string[];
  purchased: string[];
  viewed: string[];
}
export const EMPTY_PROFILE: TasteProfile = { tastes: [], favorites: [], purchased: [], viewed: [] };

export function tasteWeights(profile: TasteProfile, events: Pick<EventItem, 'id' | 'categories'>[]) {
  const w = new Map<string, number>();
  const add = (cat: string, n: number) => w.set(cat, (w.get(cat) ?? 0) + n);
  for (const cat of profile.tastes) add(cat, 3);
  const byId = new Map(events.map((e) => [e.id, e]));
  for (const id of profile.purchased) for (const cat of byId.get(id)?.categories ?? []) add(cat, 2);
  for (const id of profile.favorites) for (const cat of byId.get(id)?.categories ?? []) add(cat, 2);
  for (const id of profile.viewed) for (const cat of byId.get(id)?.categories ?? []) add(cat, 1);
  return w;
}

/** Note d'un événement selon les goûts (somme des poids de ses catégories). */
export const tasteScore = (e: Pick<EventItem, 'categories'>, weights: Map<string, number>) =>
  e.categories.reduce((a, cat) => a + (weights.get(cat) ?? 0), 0);
