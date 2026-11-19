/** Villes d'Haïti et de la diaspora avec leurs coordonnées (fichier sans dépendance : utilisé par le site ET par le serveur). */
export const BASE_CITIES: { city: string; country: string; lat: number; lng: number }[] = [
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

/** Distance à vol d'oiseau en kilomètres. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
