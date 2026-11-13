import { afterEach, describe, expect, it } from 'vitest';
import { convert, currencyName, DEFAULT_RATES, moneyRaw, RATES, setRates } from './format';
import { DISPLAY_CURRENCIES } from '../types';
import * as server from '../../api/_lib/fees';

describe('devises', () => {
  afterEach(() => setRates(DEFAULT_RATES));

  it('le client et le serveur proposent les mêmes devises, avec les mêmes taux de départ', () => {
    expect([...server.DISPLAY_CURRENCIES]).toEqual([...DISPLAY_CURRENCIES]);
    expect(server.DEFAULT_RATES).toEqual(DEFAULT_RATES);
  });

  it('convertit par les gourdes : les prix sont fixés en gourdes, le taux vient de l’administrateur', () => {
    setRates({ EUR: 150, USD: 130 });
    expect(convert(1500, 'HTG', 'EUR')).toBe(10);
    expect(convert(10, 'EUR', 'HTG')).toBe(1500);
    expect(convert(13, 'USD', 'EUR')).toBeCloseTo(11.2667, 3);
    expect(convert(500, 'HTG', 'HTG')).toBe(500);
  });

  it('ignore un taux invalide et ne change jamais la gourde', () => {
    const before = { ...RATES };
    setRates({ EUR: -3, GBP: Number.NaN, HTG: 5 });
    expect(RATES.EUR).toBe(before.EUR);
    expect(RATES.GBP).toBe(before.GBP);
    expect(RATES.HTG).toBe(1);
  });

  it('le serveur et le client convertissent de la même façon', () => {
    server.setRates({ EUR: 150, JPY: 1 });
    setRates({ EUR: 150, JPY: 1 });
    for (const [from, to] of [['HTG', 'EUR'], ['EUR', 'USD'], ['JPY', 'HTG'], ['USD', 'JPY']] as const)
      expect(server.convert(1234, from, to)).toBeCloseTo(convert(1234, from, to), 8);
    server.setRates(server.DEFAULT_RATES);
  });

  it('affiche chaque devise correctement (sans centimes pour HTG et JPY)', () => {
    expect(moneyRaw(1500, 'HTG', 'fr')).toBe('1 500 HTG'.replace(' ', ' '));
    expect(moneyRaw(12.5, 'USD', 'en')).toBe('$12.50');
    expect(moneyRaw(10, 'EUR', 'en')).toBe('€10');
    expect(moneyRaw(1500, 'JPY', 'en')).toBe('¥1,500');
    expect(currencyName('EUR', 'en')).toBe('Euro');
  });
});
