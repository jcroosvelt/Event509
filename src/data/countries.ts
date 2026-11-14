/**
 * Pays et proximité : les événements proches de l'utilisateur passent en premier.
 * Un lieu porte son pays (code à 2 lettres) ; sans pays, il est déduit de sa ville, sinon Haïti.
 */
import type { EventItem } from '@/types';
import type { Lang } from '@/types';
import { WORLD_CITIES } from './worldCities';

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
export const KNOWN_CITIES: { city: string; country: string; lat: number; lng: number }[] = [
  { city: 'Port-au-Prince', country: 'HT', lat: 18.5944, lng: -72.3074 },
  { city: 'Pétion-Ville', country: 'HT', lat: 18.5125, lng: -72.2853 },
  { city: 'Delmas', country: 'HT', lat: 18.5453, lng: -72.3029 },
  { city: 'Tabarre', country: 'HT', lat: 18.5736, lng: -72.2578 },
  { city: 'Carrefour', country: 'HT', lat: 18.5413, lng: -72.3996 },
  { city: 'Cap-Haïtien', country: 'HT', lat: 19.7578, lng: -72.2014 },
  { city: 'Gonaïves', country: 'HT', lat: 19.4478, lng: -72.6894 },
  { city: 'Les Cayes', country: 'HT', lat: 18.2, lng: -73.75 },
  { city: 'Jacmel', country: 'HT', lat: 18.2342, lng: -72.5347 },
  { city: 'Jérémie', country: 'HT', lat: 18.65, lng: -74.1167 },
  { city: 'Hinche', country: 'HT', lat: 19.1456, lng: -72.0189 },
  { city: 'Saint-Marc', country: 'HT', lat: 19.1089, lng: -72.6906 },
  { city: 'Petit-Goâve', country: 'HT', lat: 18.4311, lng: -72.8683 },
  { city: 'Léogâne', country: 'HT', lat: 18.5108, lng: -72.6339 },
  { city: 'Port-de-Paix', country: 'HT', lat: 19.9396, lng: -72.8306 },
  { city: 'Fort-Liberté', country: 'HT', lat: 19.6667, lng: -71.8333 },
  { city: 'Miragoâne', country: 'HT', lat: 18.4442, lng: -73.0883 },
  { city: 'Miami', country: 'US', lat: 25.7617, lng: -80.1918 },
  { city: 'Fort Lauderdale', country: 'US', lat: 26.1224, lng: -80.1373 },
  { city: 'Orlando', country: 'US', lat: 28.5383, lng: -81.3792 },
  { city: 'New York', country: 'US', lat: 40.7128, lng: -74.006 },
  { city: 'Boston', country: 'US', lat: 42.3601, lng: -71.0589 },
  { city: 'Montréal', country: 'CA', lat: 45.5017, lng: -73.5673 },
  { city: 'Toronto', country: 'CA', lat: 43.6532, lng: -79.3832 },
  { city: 'Ottawa', country: 'CA', lat: 45.4215, lng: -75.6972 },
  { city: 'Paris', country: 'FR', lat: 48.8566, lng: 2.3522 },
  { city: 'Santo Domingo', country: 'DO', lat: 18.4861, lng: -69.9312 },
  { city: 'Punta Cana', country: 'DO', lat: 18.582, lng: -68.4055 },
  { city: 'Pointe-à-Pitre', country: 'GP', lat: 16.241, lng: -61.533 },
  { city: 'Cayenne', country: 'GF', lat: 4.9224, lng: -52.3135 },
  { city: 'Bruxelles', country: 'BE', lat: 50.8503, lng: 4.3517 },
];

// Les grandes villes du monde complètent la liste (les villes haïtiennes et de la diaspora ci-dessus restent prioritaires)
for (const w of WORLD_CITIES) if (!KNOWN_CITIES.some((k) => k.country === w.country && norm(k.city) === norm(w.city))) KNOWN_CITIES.push(w);

/** Distance à vol d'oiseau en kilomètres. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

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
