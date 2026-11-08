import { describe, expect, it } from 'vitest';
import * as api from './api';
import { attendees, events, promoCodes } from '@/data/mock';

const ev = (id: string) => events.find((e) => e.id === id)!;

describe('données de démo', () => {
  it('décale les dates pour que les événements vedettes restent à venir', () => {
    const now = new Date();
    for (const e of events.filter((x) => x.featured)) expect(new Date(e.end).getTime()).toBeGreaterThan(now.getTime());
  });
});

describe('événements', () => {
  it('filtre par catégorie, ville et gratuité', async () => {
    const music = await api.listEvents({ category: 'music' });
    expect(music.length).toBeGreaterThan(0);
    expect(music.every((e) => e.categories.includes('music'))).toBe(true);
    const cap = await api.listEvents({ city: 'Cap-Haïtien' });
    expect(cap.every((e) => e.venue?.city === 'Cap-Haïtien')).toBe(true);
    const free = await api.listEvents({ price: 'free' });
    expect(free.every((e) => e.tickets.some((t) => t.price === 0))).toBe(true);
  });

  it('n’expose pas les événements non publiés', async () => {
    const all = await api.listEvents();
    expect(all.some((e) => e.status !== 'published')).toBe(false);
  });

  it('propose une date par semaine pour un événement récurrent', () => {
    const occ = api.occurrences(ev('e6'));
    expect(occ.length).toBeGreaterThanOrEqual(3);
    const gap = new Date(occ[1].start).getTime() - new Date(occ[0].start).getTime();
    expect(gap).toBe(7 * 86400000);
  });

  it('liste les sessions d’un événement multi-sessions', () => {
    expect(api.occurrences(ev('e2')).map((o) => o.label)).toHaveLength(2);
  });
});

describe('codes promo', () => {
  it('accepte un code valide pour son événement, quelle que soit la casse', async () => {
    expect((await api.validatePromo('kompa10', 'e1'))?.code).toBe('KOMPA10');
  });

  it('refuse un code d’un autre événement, épuisé ou inconnu', async () => {
    expect(await api.validatePromo('KOMPA10', 'e2')).toBeNull();
    expect(await api.validatePromo('VIP500', 'e1')).toBeNull();
    expect(await api.validatePromo('NEXISTEPAS', 'e1')).toBeNull();
  });

  it('accepte un code « tous événements »', async () => {
    expect(await api.validatePromo('NOEL2026', 'e7')).not.toBeNull();
  });
});

describe('commande', () => {
  it('émet un billet unique par place, décompte le stock et l’utilisation du code', async () => {
    const tt = ev('e2').tickets.find((t) => t.id === 't2b')!;
    const soldBefore = tt.sold;
    const promo = promoCodes.find((p) => p.code === 'NOEL2026')!;
    const usedBefore = promo.used;
    const { order, tickets } = await api.createOrder({
      eventId: 'e2',
      items: [{ ticketTypeId: 't2b', qty: 2, seats: ['C-1', 'C-2'] }],
      promo,
      method: 'moncash',
      currency: 'HTG',
      buyer: { name: 'Test', email: 'test@example.com' },
      delivery: { email: true, whatsapp: false, app: true },
      feePercent: 5,
      totals: { subtotal: 7000, discount: 1050, fees: 298, total: 6248 },
      sessionLabel: 'Jour 1 — Keynotes & panels',
    });
    expect(order.status).toBe('paid');
    expect(tickets).toHaveLength(2);
    expect(new Set(tickets.map((t) => t.code)).size).toBe(2);
    expect(tickets.map((t) => t.seat)).toEqual(['C-1', 'C-2']);
    expect(tickets[0].sessionLabel).toBe('Jour 1 — Keynotes & panels');
    expect(tt.sold).toBe(soldBefore + 2);
    expect(promo.used).toBe(usedBefore + 1);
  });

  it('laisse une commande par virement en attente', async () => {
    const { order } = await api.createOrder({
      eventId: 'e5', items: [{ ticketTypeId: 't5a', qty: 1 }], method: 'transfer', currency: 'HTG',
      buyer: { name: 'A', email: 'a@b.co' }, delivery: { email: true, whatsapp: false, app: true }, feePercent: 5,
      totals: { subtotal: 300, discount: 0, fees: 15, total: 315 },
    });
    expect(order.status).toBe('pending');
  });
});

describe('check-in', () => {
  it('valide un billet une seule fois', async () => {
    const a = attendees.find((x) => !x.checkedIn && x.eventId === 'e1')!;
    expect((await api.verifyTicket(a.code, 'e1')).ok).toBe(true);
    const again = await api.verifyTicket(a.code, 'e1');
    expect(again.ok).toBe(false);
    expect(!again.ok && again.reason).toBe('used');
  });

  it('refuse un billet d’un autre événement et un code inconnu', async () => {
    const a = attendees.find((x) => !x.checkedIn && x.eventId === 'e5')!;
    const r = await api.verifyTicket(a.code, 'e1');
    expect(!r.ok && r.reason).toBe('wrong_event');
    const u = await api.verifyTicket('E509-FAUX-0000', 'e1');
    expect(!u.ok && u.reason).toBe('unknown');
  });
});

describe('revente et versements', () => {
  it('vend un billet de revente une seule fois avec un nouveau code', async () => {
    const [listing] = await api.listResale('e8');
    const ticket = await api.buyResale(listing.id, { name: 'B', email: 'b@c.co' });
    expect(ticket.code).not.toBe(listing.code);
    expect(ticket.status).toBe('valid');
    await expect(api.buyResale(listing.id, { name: 'C', email: 'c@d.co' })).rejects.toMatchObject({ status: 410 });
  });

  it('calcule un solde cohérent et jamais négatif', async () => {
    const b = await api.getBalance('org1', 5);
    for (const cur of ['HTG', 'USD'] as const) {
      expect(b[cur].balance).toBeGreaterThanOrEqual(0);
      expect(b[cur].fees).toBeCloseTo(b[cur].gross * 0.05, 0);
    }
  });
});
