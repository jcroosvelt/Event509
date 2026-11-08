/**
 * Couche d'accès aux données.
 *
 * Pour l'instant chaque fonction lit/écrit les données de démonstration en mémoire
 * avec une latence simulée. Pour brancher le backend, remplacez le corps de chaque
 * fonction par un appel `http(...)` — les signatures sont le contrat attendu par l'UI.
 */
import * as db from '@/data/mock';
import type {
  Attendee, CategoryId, Currency, EventItem, IssuedTicket, Order, PaymentMethod, PromoCode,
  RefundRequest, TeamMember,
} from '@/types';
import { ticketCode, uid } from '@/lib/format';

export const API_URL = import.meta.env.VITE_API_URL ?? '';

const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));
const clone = <T,>(v: T): T => structuredClone(v);

/** Client HTTP prêt pour le futur backend. */
export async function http<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('e509.token');
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

// ---------- Événements ----------

export interface EventFilters {
  q?: string;
  city?: string;
  category?: CategoryId | '';
  when?: '' | 'today' | 'weekend' | 'week' | 'month';
  price?: '' | 'free' | 'paid';
  maxPrice?: number;
  online?: boolean;
  sort?: 'date' | 'popular' | 'price';
}

export function minPrice(e: EventItem) {
  return Math.min(...e.tickets.map((t) => t.price));
}

export async function listEvents(f: EventFilters = {}): Promise<EventItem[]> {
  await wait();
  const now = new Date('2026-11-08T12:00:00');
  let list = db.events.filter((e) => e.status === 'published');
  if (f.q) {
    const q = f.q.toLowerCase();
    list = list.filter((e) =>
      [e.title, e.description, e.venue?.city, e.venue?.name, ...(e.tags ?? [])].some((s) => s?.toLowerCase().includes(q)),
    );
  }
  if (f.city) list = list.filter((e) => e.venue?.city === f.city);
  if (f.category) list = list.filter((e) => e.categories.includes(f.category as CategoryId));
  if (f.online) list = list.filter((e) => !!e.online);
  if (f.price === 'free') list = list.filter((e) => e.tickets.some((t) => t.price === 0));
  if (f.price === 'paid') list = list.filter((e) => e.tickets.some((t) => t.price > 0));
  if (f.maxPrice != null) list = list.filter((e) => minPrice(e) <= f.maxPrice!);
  if (f.when) {
    const end = new Date(now);
    if (f.when === 'today') end.setHours(23, 59);
    if (f.when === 'weekend') end.setDate(now.getDate() + ((7 - now.getDay()) % 7) + 1);
    if (f.when === 'week') end.setDate(now.getDate() + 7);
    if (f.when === 'month') end.setMonth(now.getMonth() + 1);
    list = list.filter((e) => new Date(e.start) <= end && new Date(e.end) >= now);
  }
  const sort = f.sort ?? 'date';
  list = [...list].sort((a, b) =>
    sort === 'popular' ? b.views - a.views : sort === 'price' ? minPrice(a) - minPrice(b) : a.start.localeCompare(b.start),
  );
  return clone(list);
}

export async function getEvent(idOrSlug: string) {
  await wait(150);
  const e = db.events.find((x) => x.id === idOrSlug || x.slug === idOrSlug);
  return e ? clone(e) : null;
}

export function getOrganizer(id: string) {
  return db.organizers.find((o) => o.id === id) ?? null;
}

export async function listOrganizerEvents(orgId = 'org1') {
  await wait();
  return clone(db.events.filter((e) => e.organizerId === orgId));
}

export async function saveEvent(e: EventItem) {
  await wait(500);
  const i = db.events.findIndex((x) => x.id === e.id);
  if (i >= 0) db.events[i] = clone(e);
  else db.events.unshift(clone(e));
  return clone(e);
}

export async function setEventStatus(id: string, status: EventItem['status']) {
  await wait(200);
  const e = db.events.find((x) => x.id === id);
  if (e) e.status = status;
}

// ---------- Commandes & billets ----------

export interface CheckoutInput {
  eventId: string;
  items: { ticketTypeId: string; qty: number; seats?: string[] }[];
  promo?: PromoCode | null;
  method: PaymentMethod;
  currency: Currency;
  buyer: { name: string; email: string; phone?: string };
  delivery: { email: boolean; whatsapp: boolean; app: boolean };
  feePercent: number;
  totals: { subtotal: number; discount: number; fees: number; total: number };
}

export async function createOrder(input: CheckoutInput): Promise<{ order: Order; tickets: IssuedTicket[] }> {
  await wait(1200); // simulation passerelle de paiement
  const ev = db.events.find((e) => e.id === input.eventId)!;
  const order: Order = {
    id: `o${Math.floor(3000 + Math.random() * 6000)}`,
    eventId: input.eventId,
    createdAt: new Date().toISOString(),
    items: input.items.map((it) => ({
      ticketTypeId: it.ticketTypeId, qty: it.qty, seats: it.seats,
      unitPrice: ev.tickets.find((t) => t.id === it.ticketTypeId)!.price,
    })),
    ...input.totals,
    currency: input.currency,
    method: input.method,
    status: input.method === 'transfer' ? 'pending' : 'paid',
    buyerName: input.buyer.name,
    buyerEmail: input.buyer.email,
    buyerPhone: input.buyer.phone,
    promoCode: input.promo?.code,
  };
  const tickets: IssuedTicket[] = [];
  for (const it of input.items) {
    const tt = ev.tickets.find((t) => t.id === it.ticketTypeId)!;
    tt.sold += it.qty;
    for (let i = 0; i < it.qty; i++) {
      tickets.push({
        id: uid('it'), code: ticketCode(), eventId: ev.id, ticketTypeId: tt.id,
        holderName: input.buyer.name, holderEmail: input.buyer.email,
        seat: it.seats?.[i], status: 'valid', orderId: order.id,
      });
    }
  }
  if (input.promo) {
    const p = db.promoCodes.find((x) => x.id === input.promo!.id);
    if (p) p.used += 1;
  }
  return { order, tickets };
}

export async function validatePromo(code: string, eventId: string): Promise<PromoCode | null> {
  await wait(300);
  const p = db.promoCodes.find((x) => x.code.toUpperCase() === code.trim().toUpperCase());
  if (!p || !p.active || p.used >= p.limit || new Date(p.expiresAt) < new Date('2026-11-08')) return null;
  if (p.eventId !== 'all' && p.eventId !== eventId) return null;
  return clone(p);
}

/** Places déjà occupées dans le plan de salle (déterministe pour la démo). */
export function takenSeats(eventId: string): Set<string> {
  const s = new Set<string>();
  const seed = eventId.charCodeAt(1);
  'ABCDEFGHIJ'.split('').forEach((r, ri) => {
    for (let c = 1; c <= 16; c++) if ((ri * 17 + c * seed) % 5 === 0 || (ri < 2 && c % 4 === 0)) s.add(`${r}-${c}`);
  });
  return s;
}

// ---------- Organisateur ----------

export async function listAttendees(): Promise<Attendee[]> {
  await wait();
  return clone(db.attendees);
}

export async function listPromoCodes() { await wait(); return clone(db.promoCodes); }
export async function savePromo(p: PromoCode) {
  await wait(200);
  const i = db.promoCodes.findIndex((x) => x.id === p.id);
  if (i >= 0) db.promoCodes[i] = p; else db.promoCodes.unshift(p);
}

export async function listTeam() { await wait(); return clone(db.team); }
export async function inviteMember(m: Omit<TeamMember, 'id' | 'status'>) {
  await wait(300);
  const n: TeamMember = { ...m, id: uid('m'), status: 'invited' };
  db.team.push(n);
  return n;
}

export async function listRefunds() { await wait(); return clone(db.refunds); }
export async function decideRefund(id: string, status: RefundRequest['status']) {
  await wait(300);
  const r = db.refunds.find((x) => x.id === id);
  if (r) r.status = status;
}

export async function listPayouts() { await wait(); return clone(db.payouts); }
export async function listCampaigns() { await wait(); return clone(db.campaigns); }
export async function listAmbassadors() { await wait(); return clone(db.ambassadors); }

/** Validation d'un billet au check-in. Le backend vérifiera la signature et l'usage unique. */
export async function verifyTicket(code: string) {
  await wait(150);
  const a = db.attendees.find((x) => x.code === code);
  if (!a) return { ok: false as const, reason: 'unknown' as const };
  if (a.checkedIn) return { ok: false as const, reason: 'used' as const, attendee: clone(a) };
  a.checkedIn = true;
  a.checkedInAt = new Date().toISOString();
  return { ok: true as const, attendee: clone(a) };
}

// ---------- Administration ----------

export async function listUsers() { await wait(); return clone(db.users); }
export async function listDisputes() { await wait(); return clone(db.disputes); }
export async function listAllEvents() { await wait(); return clone(db.events); }
