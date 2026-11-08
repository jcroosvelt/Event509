/**
 * Couche d'accès aux données.
 *
 * Pour l'instant chaque fonction lit/écrit les données de démonstration en mémoire
 * avec une latence simulée. Pour brancher le backend, remplacez le corps de chaque
 * fonction par un appel `http(...)` — les signatures sont le contrat attendu par l'UI.
 */
import * as db from '@/data/mock';
import type {
  Ambassador, AppUser, Attendee, Campaign, CategoryId, Currency, Dispute, EventItem, IssuedTicket, Order, Organizer,
  PaymentMethod, Payout, PromoCode, RefundRequest, SeatMapConfig, TeamMember,
} from '@/types';
import { ticketCode, uid } from '@/lib/format';
import { ApiError } from '@/lib/errors';

export const API_URL = import.meta.env.VITE_API_URL ?? '';
/** Mode démo : actif tant qu'aucun backend n'est configuré (affiche les aides de test). */
export const DEMO = !API_URL;

// Latence simulée de la démo (désactivée dans les tests)
const wait = (ms = 250) => (import.meta.env.MODE === 'test' ? Promise.resolve() : new Promise((r) => setTimeout(r, ms)));
const clone = <T,>(v: T): T => structuredClone(v);

/** Événement global émis quand le serveur répond 401 (session expirée). */
export const UNAUTHORIZED_EVENT = 'e509:unauthorized';

/** Client HTTP prêt pour le futur backend. */
export async function http<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('e509.token');
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, 'Réseau indisponible');
  }
  if (res.status === 401) {
    localStorage.removeItem('e509.token');
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (body as { message?: string }).message ?? res.statusText);
  }
  return res.status === 204 ? (undefined as T) : (res.json() as Promise<T>);
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
  const now = new Date();
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

export function getOrganizer(idOrSlug: string) {
  return db.organizers.find((o) => o.id === idOrSlug || o.slug === idOrSlug) ?? null;
}

export async function getOrganizerPage(slug: string) {
  await wait(150);
  const org = getOrganizer(slug);
  if (!org) return null;
  const evs = db.events.filter((e) => e.organizerId === org.id && e.status === 'published');
  return clone({ org, events: evs });
}

export async function saveOrganizer(id: string, patch: Partial<Organizer>) {
  await wait(300);
  const o = db.organizers.find((x) => x.id === id);
  if (o) Object.assign(o, patch);
  return o ? clone(o) : null;
}

/** Dates proposées pour un événement récurrent ou multi-sessions. */
export function occurrences(e: EventItem): { id: string; label: string; start: string; end: string }[] {
  if (e.sessions?.length) return e.sessions.map((s) => ({ id: s.id, label: s.label, start: s.start, end: s.end }));
  if (!e.recurring) return [];
  const out: { id: string; label: string; start: string; end: string }[] = [];
  const first = new Date(e.start);
  const last = new Date(e.end);
  const durationMs = 2 * 3600 * 1000;
  for (let d = new Date(first), i = 0; d <= last && i < 12; i++) {
    const start = new Date(d);
    out.push({ id: `occ${i}`, label: start.toISOString(), start: start.toISOString(), end: new Date(start.getTime() + durationMs).toISOString() });
    if (e.recurring === 'weekly') d.setDate(d.getDate() + 7);
    else d.setMonth(d.getMonth() + 1);
  }
  return out;
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
  sessionLabel?: string;
  referral?: string;
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
    referral: input.referral,
    sessionLabel: input.sessionLabel,
  };
  const tickets: IssuedTicket[] = [];
  for (const it of input.items) {
    const tt = ev.tickets.find((t) => t.id === it.ticketTypeId)!;
    tt.sold += it.qty;
    for (let i = 0; i < it.qty; i++) {
      tickets.push({
        id: uid('it'), code: ticketCode(), eventId: ev.id, ticketTypeId: tt.id,
        holderName: input.buyer.name, holderEmail: input.buyer.email,
        seat: it.seats?.[i], status: 'valid', orderId: order.id, sessionLabel: input.sessionLabel,
      });
    }
  }
  if (input.referral) {
    const am = db.ambassadors.find((a) => a.code === input.referral);
    if (am) {
      am.sales += tickets.length;
      am.revenue += input.totals.subtotal;
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
  if (!p || !p.active || p.used >= p.limit || new Date(p.expiresAt) < new Date()) return null;
  if (p.eventId !== 'all' && p.eventId !== eventId) return null;
  return clone(p);
}

const ROWS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const rowLetter = (i: number) => ROWS[i] ?? `R${i + 1}`;

/** Plan de salle par défaut quand l'organisateur n'en a pas défini. */
export function seatMapOf(e: EventItem): SeatMapConfig {
  return e.seatMap ?? { rows: 10, cols: 16, aisleAfter: 8, zones: [{ ticketTypeId: e.tickets[0]?.id ?? '', fromRow: 0, toRow: 9 }], blocked: [] };
}

/** Places déjà vendues (déterministe pour la démo ; le backend renverra l'état réel). */
export function takenSeats(e: EventItem): Set<string> {
  const map = seatMapOf(e);
  const s = new Set<string>(map.blocked);
  const seed = e.id.charCodeAt(1);
  for (let ri = 0; ri < map.rows; ri++)
    for (let c = 1; c <= map.cols; c++) if ((ri * 17 + c * seed) % 5 === 0 || (ri < 2 && c % 4 === 0)) s.add(`${rowLetter(ri)}-${c}`);
  return s;
}

// ---------- Participants : billets, revente, remboursements ----------

export async function requestRefund(order: Order, reason: string) {
  await wait(400);
  const ev = db.events.find((e) => e.id === order.eventId);
  db.refunds.unshift({
    id: uid('r'), orderId: order.id, buyer: order.buyerName, eventTitle: ev?.title ?? '', amount: order.total,
    currency: order.currency, reason, createdAt: new Date().toISOString(), status: 'pending',
  });
  return { reason, at: new Date().toISOString(), status: 'pending' as const };
}

export async function transferTicket(ticketId: string, to: string) {
  await wait(500);
  if (!to.trim()) throw new ApiError(422, 'Destinataire manquant');
  return { ticketId, to, newCode: ticketCode() };
}

export async function listForResale(ticket: IssuedTicket, price: number) {
  await wait(300);
  db.resaleListings.unshift({ ...clone(ticket), status: 'resale', resalePrice: price });
}

export async function cancelResale(ticketCode_: string) {
  await wait(200);
  const i = db.resaleListings.findIndex((x) => x.code === ticketCode_);
  if (i >= 0) db.resaleListings.splice(i, 1);
}

export async function listResale(eventId?: string) {
  await wait();
  return clone(db.resaleListings.filter((x) => !eventId || x.eventId === eventId));
}

export async function buyResale(listingId: string, buyer: { name: string; email: string }) {
  await wait(1000);
  const i = db.resaleListings.findIndex((x) => x.id === listingId);
  if (i < 0) throw new ApiError(410, 'Ce billet vient d’être vendu');
  const [l] = db.resaleListings.splice(i, 1);
  const ticket: IssuedTicket = {
    ...l, id: uid('it'), code: ticketCode(), holderName: buyer.name, holderEmail: buyer.email,
    status: 'valid', resalePrice: undefined, orderId: `o${Math.floor(3000 + Math.random() * 6000)}`,
  };
  return ticket;
}

// ---------- Compte ----------

export async function changePassword(current: string, next: string) {
  await wait(500);
  if (current.length < 1) throw new ApiError(422, 'Mot de passe actuel requis');
  if (next.length < 8) throw new ApiError(422, 'Mot de passe trop court');
}

export async function deleteAccount() {
  await wait(600);
}

export async function requestPasswordReset(email: string) {
  await wait(500);
  return { sentTo: email };
}

export async function resetPassword(token: string, password: string) {
  await wait(500);
  if (!token) throw new ApiError(400, 'Lien invalide ou expiré');
  if (password.length < 8) throw new ApiError(422, 'Mot de passe trop court');
}

// ---------- Organisateur ----------

export async function listAttendees(eventId?: string): Promise<Attendee[]> {
  await wait();
  return clone(db.attendees.filter((a) => !eventId || a.eventId === eventId));
}

export async function listPromoCodes() { await wait(); return clone(db.promoCodes); }
export async function savePromo(p: PromoCode) {
  await wait(200);
  if (db.promoCodes.some((x) => x.code === p.code && x.id !== p.id)) throw new ApiError(409, 'Ce code existe déjà');
  const i = db.promoCodes.findIndex((x) => x.id === p.id);
  if (i >= 0) db.promoCodes[i] = p; else db.promoCodes.unshift(p);
}

export async function listTeam() { await wait(); return clone(db.team); }
export async function inviteMember(m: Omit<TeamMember, 'id' | 'status'>) {
  await wait(300);
  if (db.team.some((x) => x.email.toLowerCase() === m.email.toLowerCase())) throw new ApiError(409, 'Déjà membre');
  const n: TeamMember = { ...m, id: uid('m'), status: 'invited' };
  db.team.push(n);
  return n;
}
export async function updateMember(id: string, patch: Partial<TeamMember>) {
  await wait(200);
  const m = db.team.find((x) => x.id === id);
  if (m) Object.assign(m, patch);
}
export async function removeMember(id: string) {
  await wait(200);
  const i = db.team.findIndex((x) => x.id === id);
  if (i >= 0) db.team.splice(i, 1);
}

export async function listRefunds() { await wait(); return clone(db.refunds); }
export async function decideRefund(id: string, status: RefundRequest['status']) {
  await wait(300);
  const r = db.refunds.find((x) => x.id === id);
  if (r) r.status = status;
}

export async function listPayouts() { await wait(); return clone(db.payouts); }

/** Solde de l'organisateur calculé à partir des ventes, commissions, remboursements et versements. */
export async function getBalance(orgId: string, feePercent: number) {
  await wait();
  const evs = db.events.filter((e) => e.organizerId === orgId);
  const by = (cur: Currency) => {
    const gross = evs.filter((e) => e.currency === cur).reduce((a, e) => a + e.tickets.reduce((x, t) => x + t.sold * t.price, 0), 0);
    const titles = new Set(evs.filter((e) => e.currency === cur).map((e) => e.title));
    const refunded = db.refunds.filter((r) => r.status === 'approved' && r.currency === cur && titles.has(r.eventTitle)).reduce((a, r) => a + r.amount, 0);
    const paid = db.payouts.filter((p) => p.currency === cur && p.status !== 'scheduled').reduce((a, p) => a + p.amount, 0);
    const fees = Math.round(gross * (feePercent / 100) * 100) / 100;
    return { gross, fees, refunded, paid, balance: Math.max(0, gross - fees - refunded - paid) };
  };
  return { HTG: by('HTG'), USD: by('USD') };
}

export async function requestPayout(amount: number, currency: Currency, method: Payout['method']) {
  await wait(500);
  const p: Payout = { id: uid('py'), amount, currency, method, status: 'processing', date: new Date().toISOString().slice(0, 10), reference: `VRS-${Date.now().toString(36).toUpperCase()}` };
  db.payouts.unshift(p);
  return clone(p);
}

export async function listCampaigns() { await wait(); return clone(db.campaigns); }
export async function saveCampaign(c: Campaign) {
  await wait(400);
  const i = db.campaigns.findIndex((x) => x.id === c.id);
  if (i >= 0) db.campaigns[i] = c; else db.campaigns.unshift(c);
  return clone(c);
}

export async function listAmbassadors() { await wait(); return clone(db.ambassadors); }
export async function saveAmbassador(a: Ambassador) {
  await wait(300);
  if (db.ambassadors.some((x) => x.code === a.code && x.id !== a.id)) throw new ApiError(409, 'Code déjà utilisé');
  const i = db.ambassadors.findIndex((x) => x.id === a.id);
  if (i >= 0) db.ambassadors[i] = a; else db.ambassadors.push(a);
}

/** Statistiques détaillées d'un événement. */
export async function eventStats(eventId: string) {
  await wait();
  const e = db.events.find((x) => x.id === eventId);
  if (!e) return null;
  const att = db.attendees.filter((a) => a.eventId === eventId);
  const sold = e.tickets.reduce((a, t) => a + t.sold, 0);
  // Ventes des 14 derniers jours (synthétiques, proportionnelles au total vendu)
  const daily = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    const w = 0.5 + Math.abs(Math.sin((i + 1) * (e.id.charCodeAt(1) % 7 + 1)));
    return { date: d.toISOString().slice(0, 10), tickets: Math.round((sold / 40) * w) };
  });
  const sources = [
    { label: 'WhatsApp', share: 0.38 }, { label: 'Instagram', share: 0.24 }, { label: 'Recherche Event509', share: 0.17 },
    { label: 'Facebook', share: 0.12 }, { label: 'Ambassadeurs', share: 0.09 },
  ];
  return clone({
    event: e,
    byType: e.tickets.map((t) => ({ id: t.id, name: t.name, sold: t.sold, quota: t.quota, revenue: t.sold * t.price })),
    daily,
    sources,
    checkins: { done: att.filter((a) => a.checkedIn).length, total: att.length },
    views: e.views,
  });
}

/** Validation d'un billet au check-in. Le backend vérifiera la signature et l'usage unique. */
export async function verifyTicket(code: string, eventId?: string) {
  await wait(150);
  const a = db.attendees.find((x) => x.code === code);
  if (!a) return { ok: false as const, reason: 'unknown' as const };
  if (eventId && a.eventId !== eventId) return { ok: false as const, reason: 'wrong_event' as const, attendee: clone(a) };
  if (a.checkedIn) return { ok: false as const, reason: 'used' as const, attendee: clone(a) };
  a.checkedIn = true;
  a.checkedInAt = new Date().toISOString();
  return { ok: true as const, attendee: clone(a) };
}

// ---------- Administration ----------

export async function listUsers() { await wait(); return clone(db.users); }
export async function setUserStatus(id: string, status: AppUser['status']) {
  await wait(200);
  const u = db.users.find((x) => x.id === id);
  if (u) u.status = status;
}
export async function listDisputes() { await wait(); return clone(db.disputes); }
export async function resolveDispute(id: string, status: Dispute['status']) {
  await wait(300);
  const d = db.disputes.find((x) => x.id === id);
  if (d) d.status = status;
}
export async function listAllEvents() { await wait(); return clone(db.events); }
export async function listCustomCommissions() { await wait(); return clone(db.customCommissions); }
export async function saveCustomCommission(c: { organizerId: string; rate: number; reason: string }) {
  await wait(200);
  const i = db.customCommissions.findIndex((x) => x.organizerId === c.organizerId);
  if (i >= 0) db.customCommissions[i] = c; else db.customCommissions.push(c);
}
export async function removeCustomCommission(organizerId: string) {
  await wait(200);
  const i = db.customCommissions.findIndex((x) => x.organizerId === organizerId);
  if (i >= 0) db.customCommissions.splice(i, 1);
}
