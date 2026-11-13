import { describe, expect, it } from 'vitest';
import { listEvents } from '@/services/api';
import type { CategoryId } from '@/types';
import { countryOfEvent, EMPTY_PROFILE, nearestKnownCity, proximityTier, tasteScore, tasteWeights, type Place } from '@/data/countries';

const at = (country: string, city = ''): Place => ({ country, city, manual: true });
const ids = async (place: Place, profile = EMPTY_PROFILE) => (await listEvents({ sort: 'near', place, profile })).map((e) => e.id);

describe('événements près de l’utilisateur', () => {
  it('déduit le pays d’un lieu : celui indiqué, sinon celui de la ville, sinon Haïti ; en ligne = aucun pays', () => {
    expect(countryOfEvent({ venue: { name: 'x', address: '', city: 'Port-au-Prince' } })).toBe('HT');
    expect(countryOfEvent({ venue: { name: 'x', address: '', city: 'Miami' } })).toBe('US');
    expect(countryOfEvent({ venue: { name: 'x', address: '', city: 'Miami', country: 'CA' } })).toBe('CA');
    expect(countryOfEvent({ venue: null })).toBeNull();
  });

  it('classe la proximité : même ville, puis même pays (ou en ligne), puis ailleurs ; sans tenir compte des accents', () => {
    const pv = { venue: { name: 'x', address: '', city: 'Pétion-Ville' } };
    expect(proximityTier(pv, at('HT', 'petion-ville'))).toBe(0);
    expect(proximityTier(pv, at('HT', 'Jacmel'))).toBe(1);
    expect(proximityTier(pv, at('HT'))).toBe(1);
    expect(proximityTier(pv, at('US', 'Miami'))).toBe(2);
    expect(proximityTier({ venue: null }, at('US', 'Miami'))).toBe(1);
  });

  it('rattache une position GPS à la ville connue la plus proche, et ignore ce qui est trop loin', () => {
    expect(nearestKnownCity(18.5944, -72.3074)?.city).toBe('Port-au-Prince');
    expect(nearestKnownCity(18.5125, -72.2853)?.city).toBe('Pétion-Ville');
    expect(nearestKnownCity(25.77, -80.19)).toMatchObject({ city: 'Miami', country: 'US' });
    expect(nearestKnownCity(0, 0)).toBeNull();
  });

  it('« Pour vous » met en tête ma ville, puis mon pays, puis le reste, par date', async () => {
    // Données de démonstration : e5, e2, e1, e7 à Port-au-Prince ; e8 (Pétion-Ville), e4, e3 ailleurs en Haïti ; e6 en ligne
    expect(await ids(at('HT', 'Port-au-Prince'))).toEqual(['e5', 'e2', 'e1', 'e7', 'e8', 'e6', 'e4', 'e3']);
    expect((await ids(at('HT', 'Cap-Haïtien')))[0]).toBe('e4');
  });

  it('hors d’Haïti, seuls les événements en ligne restent proches ; les autres passent après', async () => {
    const list = await ids(at('US', 'Miami'));
    expect(list[0]).toBe('e6');
    expect(list).toHaveLength(8);
  });

  it('les goûts départagent à proximité égale : mes catégories d’abord', async () => {
    const list = await ids(at('HT', 'Port-au-Prince'), { ...EMPTY_PROFILE, tastes: ['music'] });
    // à Port-au-Prince : musique (e1, e7) avant sport et conférence (e5, e2) ; ailleurs en Haïti : e8 (fête, musique) d'abord
    expect(list.slice(0, 4)).toEqual(['e1', 'e7', 'e5', 'e2']);
    expect(list[4]).toBe('e8');
  });

  it('les favoris, les billets et les événements consultés comptent dans les goûts', async () => {
    const events: { id: string; categories: CategoryId[] }[] = [
      { id: 'a', categories: ['music'] },
      { id: 'b', categories: ['sport'] },
      { id: 'c', categories: ['food', 'party'] },
    ];
    const w = tasteWeights({ tastes: ['food'], favorites: ['a'], purchased: ['b'], viewed: ['a', 'c'] }, events);
    expect(w.get('food')).toBe(3 + 1); // choisi (3) + consulté (1)
    expect(w.get('music')).toBe(2 + 1); // favori (2) + consulté (1)
    expect(w.get('sport')).toBe(2); // acheté
    expect(tasteScore({ categories: ['music', 'sport'] }, w)).toBe(5);
    expect(tasteScore({ categories: ['religion'] }, w)).toBe(0);
  });

  it('les tris par date et par prix ne sont jamais modifiés par la position ni par les goûts', async () => {
    const byDate = (await listEvents({ sort: 'date', place: at('HT', 'Jacmel'), profile: { ...EMPTY_PROFILE, tastes: ['music'] } })).map((e) => e.id);
    expect(byDate).toEqual(['e8', 'e6', 'e5', 'e2', 'e4', 'e1', 'e7', 'e3']);
  });
});
