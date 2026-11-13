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
  it('partage la commission : 5 % = 2,5 % payés par l’acheteur et 2,5 % par l’organisateur', () => {
    const f = computeFees({ ...DEFAULT_FEES, percent: 5, fixedHTG: 0, buyerShare: 50 }, 2000, 1, 'HTG');
    expect(f.fee).toBe(100); // 5 % de 2000
    expect(f.buyerFee).toBe(50); // 2,5 % payés en plus par l'acheteur
    expect(f.organizerFee).toBe(50); // 2,5 % déduits de l'organisateur
    expect(f.total).toBe(2050);
    expect(f.organizerNet).toBe(1950);
    expect(f.buyerFee + f.organizerFee).toBe(f.fee);
  });

  it('par défaut : 5 %, sans frais fixes, partagés à parts égales', () => {
    expect(DEFAULT_FEES).toMatchObject({ percent: 5, fixedHTG: 0, buyerShare: 50 });
  });

  it('l’acheteur peut tout payer (100) ou rien (0)', () => {
    const all = computeFees({ ...DEFAULT_FEES, percent: 5, fixedHTG: 25, buyerShare: 100 }, 2500, 1, 'HTG');
    expect(all.fee).toBe(150); // 125 + 25
    expect(all.total).toBe(2650);
    expect(all.organizerNet).toBe(2500);
    const none = computeFees({ ...DEFAULT_FEES, percent: 5, fixedHTG: 0, buyerShare: 0 }, 1000, 2, 'HTG');
    expect(none.total).toBe(1000);
    expect(none.organizerNet).toBe(950);
  });

  it('partage aussi les frais fixes et applique le taux négocié (USD)', () => {
    const f = computeFees({ ...DEFAULT_FEES, percent: 5, fixedHTG: 132, buyerShare: 50 }, 100, 1, 'USD', 3);
    expect(f.rate).toBe(3);
    expect(f.fee).toBe(4); // 3 $ + 1 $ de frais fixes
    expect(f.buyerFee).toBe(2);
    expect(f.organizerFee).toBe(2);
  });

  it('ne prélève rien sur une commande gratuite', () => {
    expect(computeFees(DEFAULT_FEES, 0, 0, 'HTG').total).toBe(0);
  });
});

import { computeFees as serverFees } from '../../api/_lib/fees';
describe('frais : serveur et navigateur', () => {
  it('le serveur calcule exactement les mêmes frais que l’interface', () => {
    const cases: [number, number, 'HTG' | 'USD', number | undefined][] = [[2500, 1, 'HTG', undefined], [15000, 2, 'HTG', 4.5], [50, 2, 'USD', 3], [0, 0, 'HTG', undefined]];
    for (const buyerShare of [0, 50, 100])
      for (const [amount, n, cur, rate] of cases) {
        const s = { ...DEFAULT_FEES, buyerShare };
        expect(serverFees(s, amount, n, cur, rate)).toEqual(computeFees(s, amount, n, cur, rate));
      }
  });
});

import { checkFile, safeName, sniff, validCover } from '../../api/_lib/files';
describe('fichiers envoyés', () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]);
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]);
  const pdf = Buffer.from('%PDF-1.4\n' + 'x'.repeat(30));
  it('reconnaît le vrai type par les premiers octets, pas par le nom', () => {
    expect(sniff(png)).toBe('image/png');
    expect(sniff(jpg)).toBe('image/jpeg');
    expect(sniff(pdf)).toBe('application/pdf');
    expect(sniff(Buffer.from('<html><script>alert(1)</script></html>'))).toBeNull();
    expect(sniff(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
  });
  it('n’accepte un PDF que pour la vérification, et limite les tailles', () => {
    expect('mime' in checkFile('verification', pdf)).toBe(true);
    expect('error' in checkFile('event_cover', pdf)).toBe(true);
    expect('error' in checkFile('org_logo', Buffer.concat([png, Buffer.alloc(2 * 1024 * 1024)]))).toBe(true);
    expect('error' in checkFile('verification', Buffer.concat([pdf, Buffer.alloc(3 * 1024 * 1024)]))).toBe(true);
  });
  it('ne garde que des affiches sûres', () => {
    expect(validCover('linear-gradient(135deg, #1F5EFF 0%, #0B1533 100%)')).toBe(true);
    expect(validCover('/api/files/f_abc123XY')).toBe(true);
    expect(validCover('https://exemple.com/a.jpg')).toBe(true);
    for (const bad of ['javascript:alert(1)', 'data:text/html;base64,AAAA', 'http://exemple.com/a.jpg', '/api/files/../../x', 'url(javascript:1)', 'linear-gradient(red);}</style>']) expect(validCover(bad)).toBe(false);
  });
  it('nettoie le nom des fichiers', () => {
    expect(safeName('../../etc/passwd')).not.toContain('/');
    expect(safeName('a\u0000b')).toBe('a_b');
    expect(safeName(undefined)).toBe('fichier');
  });
});
