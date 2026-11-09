import { describe, expect, it } from 'vitest';
import { convert, initials, money, moneyRaw, ticketCode, USD_TO_HTG } from './format';
import { can, hasOrganizerAccess, permsOf } from './permissions';
import { translate } from './i18n';
import { computeFees, DEFAULT_FEES } from './fees';
import { users } from '@/data/mock';
import type { AppUser } from '@/types';
// @ts-expect-error script Node sans types
import { extract } from '../../scripts/i18n.mjs';
import en from '@/locales/en.json';

const byId = (id: string) => users.find((u) => u.id === id) as AppUser;

describe('format', () => {
  it('formate les montants par devise et affiche « Gratuit » pour 0', () => {
    expect(money(0, 'HTG')).toBe('Gratuit');
    expect(money(0, 'USD', 'en')).toBe('Free');
    expect(moneyRaw(2500, 'HTG').replace(/\s/g, ' ')).toBe('2 500 HTG');
    expect(moneyRaw(25, 'USD', 'en')).toBe('$25');
    expect(moneyRaw(12.5, 'USD', 'en')).toBe('$12.50');
  });

  it('convertit HTG ↔ USD au taux configuré', () => {
    expect(convert(10, 'USD', 'HTG')).toBe(10 * USD_TO_HTG);
    expect(convert(USD_TO_HTG, 'HTG', 'USD')).toBe(1);
    expect(convert(42, 'HTG', 'HTG')).toBe(42);
  });

  it('génère des codes de billet au bon format et uniques', () => {
    const codes = new Set(Array.from({ length: 200 }, ticketCode));
    expect(codes.size).toBe(200);
    for (const c of codes) expect(c).toMatch(/^E509-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  it('calcule les initiales', () => {
    expect(initials('Marie Joseph')).toBe('MJ');
    expect(initials('  jean  ')).toBe('J');
  });
});

describe('permissions', () => {
  it('donne tout à l’administrateur d’organisation, sauf l’administration plateforme', () => {
    const u = byId('u2');
    expect(can(u, 'events')).toBe(true);
    expect(can(u, 'team')).toBe(true);
    expect(can(u, 'admin')).toBe(false);
  });

  it('limite le staff d’entrée au check-in', () => {
    expect(permsOf(byId('u8'))).toEqual(['checkin']);
  });

  it('donne au comptable les ventes mais pas les événements ni le check-in', () => {
    const u = byId('u9');
    expect(can(u, 'payouts')).toBe(true);
    expect(can(u, 'refunds')).toBe(true);
    expect(can(u, 'events')).toBe(false);
    expect(can(u, 'checkin')).toBe(false);
  });

  it('refuse l’espace organisateur aux participants et aux visiteurs', () => {
    expect(hasOrganizerAccess(byId('u1'))).toBe(false);
    expect(hasOrganizerAccess(null)).toBe(false);
    expect(can(byId('u7'), 'admin')).toBe(true);
  });
});

describe('i18n', () => {
  it('traduit et remplace les variables', () => {
    expect(translate('en', 'Payer {amount}', { amount: '$10' })).toBe('Pay $10');
    expect(translate('fr', 'Payer {amount}', { amount: '10 HTG' })).toBe('Payer 10 HTG');
  });

  it('garde le français quand une phrase manque au catalogue', () => {
    expect(translate('en', 'Phrase inconnue')).toBe('Phrase inconnue');
  });

  it('a une traduction anglaise pour chaque phrase de l’interface, avec les mêmes variables', () => {
    const found: Map<string, Set<string>> = extract();
    const catalog = en as Record<string, string>;
    const ignore = new Set(['MonCash', 'NatCash', 'PayPal', 'WhatsApp', 'VIP', 'Event509', 'Live', 'HTG', 'USD', 'CVC', 'Zoom', 'Instagram', 'Facebook', 'X', 'SMS', 'Jakmèl Arts Collectif', 'Konbit Events', 'Saveurs du Nord']);
    const missing = [...found.keys()].filter((k) => !ignore.has(k) && !(k in catalog));
    expect(missing).toEqual([]);
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    const mismatched = Object.entries(catalog).filter(([k, v]) => vars(k) !== vars(v));
    expect(mismatched).toEqual([]);
  });
});


describe('frais de service', () => {
  it('ajoute pourcentage et frais fixes au prix payé par l’acheteur', () => {
    const f = computeFees({ ...DEFAULT_FEES, percent: 5, fixedHTG: 25, passToBuyer: true }, 2500, 1, 'HTG');
    expect(f.fee).toBe(150); // 125 + 25
    expect(f.total).toBe(2650);
    expect(f.organizerNet).toBe(2500);
  });

  it('déduit les frais du revenu de l’organisateur si l’acheteur ne les paie pas', () => {
    const f = computeFees({ ...DEFAULT_FEES, percent: 5, fixedHTG: 0, passToBuyer: false }, 1000, 2, 'HTG');
    expect(f.total).toBe(1000);
    expect(f.organizerNet).toBe(950);
  });

  it('applique le taux négocié de l’organisateur et convertit les frais fixes en USD', () => {
    const f = computeFees({ ...DEFAULT_FEES, percent: 5, fixedHTG: 132, passToBuyer: true }, 100, 1, 'USD', 3);
    expect(f.rate).toBe(3);
    expect(f.fee).toBe(4); // 3 $ + 1 $ de frais fixes
  });

  it('ne prélève rien sur une commande gratuite', () => {
    expect(computeFees(DEFAULT_FEES, 0, 0, 'HTG').total).toBe(0);
  });
});

import { computeFees as serverFees } from '../../api/_lib/fees';
describe('frais : serveur et navigateur', () => {
  it('le serveur calcule exactement les mêmes frais que l’interface', () => {
    const cases: [number, number, 'HTG' | 'USD', number | undefined][] = [[2500, 1, 'HTG', undefined], [15000, 2, 'HTG', 4.5], [50, 2, 'USD', 3], [0, 0, 'HTG', undefined]];
    for (const passToBuyer of [true, false])
      for (const [amount, n, cur, rate] of cases) {
        const s = { ...DEFAULT_FEES, passToBuyer };
        expect(serverFees(s, amount, n, cur, rate)).toEqual(computeFees(s, amount, n, cur, rate));
      }
  });
});
