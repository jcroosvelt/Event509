import { afterEach, describe, expect, it } from 'vitest';
import { convert, DEFAULT_RATES, moneyRaw, RATES, setRates } from './format';
import { DISPLAY_CURRENCIES, isDisplayCurrency } from '../types';
import * as server from '../../api/_lib/fees';

describe('devises : gourde et dollar américain seulement', () => {
  afterEach(() => setRates(DEFAULT_RATES));

  it('le client et le serveur proposent les mêmes deux devises, avec le même taux de départ', () => {
    expect([...DISPLAY_CURRENCIES]).toEqual(['HTG', 'USD']);
    expect([...server.DISPLAY_CURRENCIES]).toEqual(['HTG', 'USD']);
    expect(server.DEFAULT_RATES).toEqual(DEFAULT_RATES);
  });

  it('toute autre devise est refusée (ancienne préférence enregistrée comprise)', () => {
    for (const c of ['EUR', 'GBP', 'CAD', 'JPY', 'DOP', '', 'usd', null, 5]) {
      expect(isDisplayCurrency(c), String(c)).toBe(false);
      expect(server.isDisplayCurrency(c), String(c)).toBe(false);
    }
  });

  it('convertit par les gourdes avec le taux du dollar', () => {
    setRates({ USD: 130 });
    expect(convert(1300, 'HTG', 'USD')).toBe(10);
    expect(convert(10, 'USD', 'HTG')).toBe(1300);
    expect(convert(500, 'HTG', 'HTG')).toBe(500);
  });

  it('ignore un taux invalide et ne change jamais la gourde', () => {
    const before = { ...RATES };
    setRates({ USD: -3 });
    setRates({ USD: Number.NaN });
    setRates({ HTG: 5 });
    expect(RATES.USD).toBe(before.USD);
    expect(RATES.HTG).toBe(1);
  });

  it('le serveur et le client convertissent de la même façon', () => {
    server.setRates({ USD: 140 });
    setRates({ USD: 140 });
    for (const [from, to] of [['HTG', 'USD'], ['USD', 'HTG']] as const) expect(server.convert(1234, from, to)).toBeCloseTo(convert(1234, from, to), 8);
    server.setRates(server.DEFAULT_RATES);
  });

  it('affiche gourdes sans centimes et dollars avec centimes ; une ancienne commande en euros reste lisible', () => {
    expect(moneyRaw(1500, 'HTG', 'fr').replace(/\s/g, ' ')).toBe('1 500 HTG');
    expect(moneyRaw(12.5, 'USD', 'en')).toBe('$12.50');
    expect(moneyRaw(10, 'EUR' as never, 'en')).toBe('€10');
  });
});
