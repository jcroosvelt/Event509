/**
 * Couche d'accès aux données.
 *
 * Pour l'instant chaque fonction lit/écrit les données de démonstration en mémoire
 * avec une latence simulée. Pour brancher le backend, remplacez le corps de chaque
 * fonction par un appel `http(...)` — les signatures sont le contrat attendu par l'UI.
 */
import * as db from '@/data/mock';
import type {
  Ambassador, AppUser, DisplayCurrency, Lang, Attendee, AuditEntry, Campaign, CategoryId, Currency, Dispute, EventItem, IssuedTicket, Order, Organizer,
  PaymentMethod, Payout, PlatformTarget, PromoCode, RefundRequest, Report, Review, SeatMapConfig, TeamMember, VerificationRequest,
} from '@/types';
import { convert, RATES, setRates, setUsdToHtg, ticketCode, uid, USD_TO_HTG } from '@/lib/format';
import { defaultSiteInfo, type SiteInfo } from '@/lib/legalDoc';
import { browserCountry, countryOfEvent, DEFAULT_PLACE, EMPTY_PROFILE, nearestKnownCity, norm, proximityTier, tasteScore, tasteWeights, type Place, type TasteProfile } from '@/data/countries';
import type { LegalDoc } from '@/data/legalDefaults';
import { DEFAULT_FEES, type FeeSettings } from '@/lib/fees';
import { ApiError } from '@/lib/errors';
import { isBoosted } from '@/lib/boost';
import { blobToBase64, blobToDataUrl } from '@/lib/image';

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

// ---------- Mode API : cache local et session ----------

/** Paramètre ?org= : seul un administrateur peut agir sur une autre organisation (vérifié côté serveur). */
const orgQ = (orgId?: string) => (orgId ? `?org=${encodeURIComponent(orgId)}` : '');

/** Remplace le contenu d'un tableau du cache sans changer sa référence (les écrans le lisent directement). */
function replaceAll<T>(target: T[], items: T[]) {
  target.splice(0, target.length, ...items);
}
function cacheEvent(e: EventItem) {
  const i = db.events.findIndex((x) => x.id === e.id);
  if (i >= 0) db.events[i] = e;
  else db.events.unshift(e);
  return clone(e);
}
function cacheEvents(list: EventItem[]) {
  for (const e of list) cacheEvent(e);
  return clone(list);
}
function patchCachedEvent(id: string, patch: Partial<EventItem>) {
  const e = db.events.find((x) => x.id === id);
  if (e) Object.assign(e, patch);
}
function cacheOrganizer(o: Organizer) {
  const i = db.organizers.findIndex((x) => x.id === o.id);
  if (i >= 0) db.organizers[i] = o;
  else db.organizers.push(o);
  return clone(o);
}
function replaceCommission(c: { organizerId: string; rate?: number; reason?: string }) {
  const rest = db.customCommissions.filter((x) => x.organizerId !== c.organizerId);
  replaceAll(db.customCommissions, c.rate == null ? rest : [...rest, { organizerId: c.organizerId, rate: c.rate, reason: c.reason ?? '' }]);
}

interface Bootstrap {
  events: EventItem[];
  organizers: Organizer[];
  ambassadors: Pick<Ambassador, 'id' | 'name' | 'code' | 'commission'>[];
  fees: FeeSettings;
  /** Taux de change du jour (gourdes pour 1 dollar). */
  rate?: number;
  /** Taux de toutes les devises : gourdes pour 1 unité. */
  rates?: Partial<Record<DisplayCurrency, number>>;
  site?: Partial<SiteInfo>;
  customCommissions: { organizerId: string; rate: number; reason: string }[];
}
const BOOT_KEY = 'e509.cache.bootstrap';

function applyBootstrap(b: Bootstrap) {
  replaceAll(db.events, b.events);
  replaceAll(db.organizers, b.organizers);
  replaceAll(db.ambassadors, b.ambassadors.map((a) => ({ clicks: 0, sales: 0, revenue: 0, ...a })));
  replaceAll(db.customCommissions, b.customCommissions);
  Object.assign(feeSettings, b.fees);
  if (typeof b.rate === 'number') setUsdToHtg(b.rate);
  if (b.rates) setRates(b.rates);
  if (b.site) Object.assign(siteInfo, b.site);
  // Données propres à la démo : vides tant que le serveur ne les a pas fournies
  for (const list of [db.myTickets, db.myOrders, db.notifications, db.attendees, db.resaleListings, db.promoCodes, db.team, db.refunds, db.payouts, db.campaigns, db.users, db.disputes, db.reports, db.verificationRequests, db.auditLog, db.platformTargets, db.platformOrders] as unknown[][])
    list.length = 0;
}

/**
 * Charge le catalogue (événements, organisateurs, réglages de frais) avant le premier affichage.
 * Hors ligne, la dernière copie enregistrée est utilisée.
 */
export async function hydrate() {
  if (DEMO) return;
  try {
    const b = await http<Bootstrap>('/bootstrap');
    applyBootstrap(b);
    writeLocal(BOOT_KEY, b);
  } catch (e) {
    const cached = readLocal<Bootstrap>(BOOT_KEY);
    if (!cached) throw e;
    applyBootstrap(cached);
  }
}

/** Recharge le catalogue (par exemple après connexion, pour voir les brouillons de son organisation). */
export async function refreshCatalog() {
  if (!DEMO) await hydrate().catch(() => {});
}

export interface Session_ {
  token: string;
  user: AppUser;
}
export function signIn(email: string, password: string) {
  return http<Session_>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
}
export interface SignUpInput {
  name: string;
  email: string;
  password: string;
  orgName?: string;
  kind?: 'individual' | 'company' | 'association';
  country?: string;
  phone?: string;
  acceptTerms?: boolean;
  /** Champ piège (doit rester vide). */
  website?: string;
}
export function signUp(input: SignUpInput) {
  return http<Session_>('/auth/signup', { method: 'POST', body: JSON.stringify(input) });
}
export function verifyEmail(token: string) {
  return http<{ ok: true }>('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) });
}
export function resendVerification() {
  return http<{ sent: boolean }>('/auth/resend-verification', { method: 'POST' });
}
export function fetchMe() {
  return http<AppUser>('/auth/me');
}
export function updateProfile(patch: Partial<Pick<AppUser, 'name' | 'phone' | 'city'>>) {
  return http<AppUser>('/auth/me', { method: 'PATCH', body: JSON.stringify(patch) });
}
export function becomeOrganizer() {
  return http<AppUser>('/auth/organizer', { method: 'POST' });
}
export function fetchMyTickets() {
  return http<IssuedTicket[]>('/me/tickets');
}
export function fetchMyOrders() {
  return http<Order[]>('/me/orders');
}

// ---------- Événements ----------

export interface EventFilters {
  q?: string;
  city?: string;
  /** Pays du lieu (code à 2 lettres). */
  country?: string;
  category?: CategoryId | '';
  when?: '' | 'today' | 'weekend' | 'week' | 'month';
  price?: '' | 'free' | 'paid';
  maxPrice?: number;
  online?: boolean;
  /** Position de l'utilisateur, pour le tri « Près de chez moi ». */
  place?: Place;
  /** Goûts de l'utilisateur (catégories choisies, favoris, billets, événements consultés) pour le tri « Pour vous ». */
  profile?: TasteProfile;
  sort?: 'near' | 'date' | 'popular' | 'price';
}

/** Position probable de l'utilisateur : pays (et ville) de sa connexion, fournis par le serveur ; sinon la langue du navigateur. */
export async function detectPlace(): Promise<Pick<Place, 'country' | 'city'> | null> {
  if (!DEMO) {
    try {
      const g = await http<{ country: string | null; city: string | null }>('/geo');
      if (g.country) return { country: g.country, city: g.city ?? '' };
    } catch {
      /* hors ligne : on essaie la langue */
    }
  }
  const c = browserCountry();
  return c ? { country: c, city: '' } : null;
}

/**
 * Position réelle de l'utilisateur (GPS), avec son autorisation : rattachée à la ville connue la plus proche.
 * Hors d'un rayon de 60 km d'une ville connue, seul le pays de la connexion reste utilisé.
 */
export function locateByGps(): Promise<Pick<Place, 'country' | 'city'> | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const near = nearestKnownCity(pos.coords.latitude, pos.coords.longitude);
        resolve(near ? { country: near.country, city: near.city } : null);
      },
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 10 * 60_000 },
    );
  });
}

export function minPrice(e: EventItem) {
  return Math.min(...e.tickets.map((t) => t.price));
}

export async function listEvents(f: EventFilters = {}): Promise<EventItem[]> {
  // En mode API, le catalogue public est chargé au démarrage (hydrate) puis filtré ici
  if (DEMO) await wait();
  const now = new Date();
  let list = db.events.filter((e) => e.status === 'published');
  if (f.q) {
    const q = f.q.toLowerCase();
    list = list.filter((e) =>
      [e.title, e.description, e.venue?.city, e.venue?.name, ...(e.tags ?? [])].some((s) => s?.toLowerCase().includes(q)),
    );
  }
  if (f.country) list = list.filter((e) => countryOfEvent(e) === f.country);
  if (f.city) list = list.filter((e) => e.venue && norm(e.venue.city) === norm(f.city!));
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
  // Classement transparent : seul le tri « Populaires » reçoit le coup de pouce des organisateurs vérifiés (date et prix jamais modifiés)
  const boosted = (e: EventItem) => e.views * (1 + (db.organizers.find((o) => o.id === e.organizerId)?.priority ?? 0) / 100);
  // Événements sponsorisés (boost payant) : en tête de « Populaires », étiquetés « Sponsorisé » ; date et prix ne bougent jamais
  const sponsored = (e: EventItem) => (isBoosted(e) ? 1 : 0);
  // « Près de chez moi » : même ville, puis même pays, puis le reste ; à proximité égale, par date. Date et prix ne sont jamais modifiés.
  const place = f.place ?? DEFAULT_PLACE;
  const weights = tasteWeights(f.profile ?? EMPTY_PROFILE, db.events);
  list = [...list].sort((a, b) =>
    sort === 'near' ? proximityTier(a, place) - proximityTier(b, place) || tasteScore(b, weights) - tasteScore(a, weights) || a.start.localeCompare(b.start) : sort === 'popular' ? sponsored(b) - sponsored(a) || boosted(b) - boosted(a) : sort === 'price' ? minPrice(a) - minPrice(b) : a.start.localeCompare(b.start),
  );
  return clone(list);
}

export async function getEvent(idOrSlug: string) {
  if (!DEMO) return http<EventItem>(`/events/${encodeURIComponent(idOrSlug)}`).catch((e) => (e instanceof ApiError && e.status === 404 ? null : Promise.reject(e)));
  await wait(150);
  const e = db.events.find((x) => x.id === idOrSlug || x.slug === idOrSlug);
  return e ? clone(e) : null;
}

export function getOrganizer(idOrSlug: string) {
  // Les anciennes adresses d'une page (changées par l'organisateur) continuent de fonctionner
  return db.organizers.find((o) => o.id === idOrSlug || o.slug === idOrSlug) ?? db.organizers.find((o) => o.oldSlugs?.includes(idOrSlug)) ?? null;
}

export async function getOrganizerPage(slug: string) {
  await wait(150);
  const org = getOrganizer(slug);
  if (!org) return null;
  const evs = db.events.filter((e) => e.organizerId === org.id && e.status === 'published');
  return clone({ org, events: evs });
}

export async function saveOrganizer(id: string, patch: Partial<Organizer>) {
  if (!DEMO) return cacheOrganizer(await http<Organizer>('/org/profile', { method: 'PUT', body: JSON.stringify(patch) }));
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
  if (!DEMO) return http<EventItem[]>(`/org/events${orgQ(orgId)}`);
  await wait();
  return clone(db.events.filter((e) => e.organizerId === orgId));
}

export async function saveEvent(e: EventItem) {
  if (!DEMO) return cacheEvent(await http<EventItem>('/org/events', { method: 'PUT', body: JSON.stringify(e) }));
  await wait(500);
  const i = db.events.findIndex((x) => x.id === e.id);
  if (i >= 0) db.events[i] = clone(e);
  else db.events.unshift(clone(e));
  return clone(e);
}

export async function featureEvent(id: string, on: boolean) {
  await http(`/org/events/${encodeURIComponent(id)}/feature`, { method: 'POST', body: JSON.stringify({ on }) });
  patchCachedEvent(id, { featured: on });
}

export async function setEventStatus(id: string, status: EventItem['status']) {
  if (!DEMO) {
    await http(`/org/events/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) });
    return patchCachedEvent(id, { status });
  }
  await wait(200);
  const e = db.events.find((x) => x.id === id);
  if (e) e.status = status;
}

export async function deleteEvent(id: string) {
  if (!DEMO) return void (await http(`/org/events/${encodeURIComponent(id)}`, { method: 'DELETE' }));
  await wait(200);
  const i = db.events.findIndex((x) => x.id === id);
  if (i >= 0) db.events.splice(i, 1);
}

// ---------- Commandes & billets ----------

export interface CheckoutInput {
  eventId: string;
  items: { ticketTypeId: string; qty: number; seats?: string[] }[];
  promo?: PromoCode | null;
  method: PaymentMethod;
  /** Devise choisie par l'acheteur ; les prix sont fixés en gourdes. */
  currency: DisplayCurrency;
  buyer: { name: string; email: string; phone?: string };
  feePercent: number;
  totals: { subtotal: number; discount: number; fees: number; total: number };
  sessionLabel?: string;
  referral?: string;
  /** Lien de suivi de l'organisateur et consentement (case cochée) à recevoir ses actualités. */
  src?: string;
  marketingOptIn?: boolean;
  /** Langue de l'email des billets. */
  lang?: 'fr' | 'en';
}

export interface OrderResult {
  order: Order;
  tickets: IssuedTicket[];
  /** Clé du lien qui permet de retrouver la commande sans compte (mode serveur). */
  accessKey?: string;
  /** L'email des billets est parti (mode serveur, envoi configuré). */
  emailSent?: boolean;
  /** Paiement en ligne : adresse de la page de paiement sécurisée où envoyer l'acheteur. */
  payUrl?: string;
}

/** État du paiement en ligne d'une commande, relu par le serveur auprès de la plateforme de paiement. */
export async function verifyOrderPayment(orderId: string): Promise<'paid' | 'pending' | 'failed' | 'cancelled'> {
  if (DEMO) return 'paid';
  const r = await http<{ status: string }>(`/orders/${encodeURIComponent(orderId)}/verify`, { method: 'POST', body: '{}' });
  return r.status === 'paid' || r.status === 'failed' || r.status === 'cancelled' ? r.status : 'pending';
}

/** Démonstration : comme sur le serveur, la commande est comptée en gourdes (ou en dollars) ; la devise choisie est indicative. */
function demoTotals(input: CheckoutInput) {
  const acc: Currency = input.currency === 'USD' ? 'USD' : 'HTG';
  const k = convert(1, input.currency, acc);
  const r = (v: number) => (acc === 'HTG' ? Math.round(v * k) : Math.round(v * k * 100) / 100);
  const t = input.totals;
  return {
    subtotal: r(t.subtotal), discount: r(t.discount), fees: r(t.fees), total: r(t.total), currency: acc,
    ...(input.currency !== acc ? { displayCurrency: input.currency, displayTotal: t.total } : {}),
  };
}

export async function createOrder(input: CheckoutInput): Promise<OrderResult> {
  if (!DEMO)
    return http('/orders', {
      method: 'POST',
      body: JSON.stringify({ eventId: input.eventId, items: input.items, promoCode: input.promo?.code, method: input.method, currency: input.currency, buyer: input.buyer, sessionLabel: input.sessionLabel, referral: input.referral, lang: input.lang, src: input.src, marketingOptIn: input.marketingOptIn }),
    });
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
    ...demoTotals(input),
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
  db.platformOrders.unshift(clone(order));
  return { order, tickets };
}

export async function validatePromo(code: string, eventId: string): Promise<PromoCode | null> {
  if (!DEMO) return http<PromoCode | null>('/promo/validate', { method: 'POST', body: JSON.stringify({ code, eventId }) });
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
export function takenSeats(e: EventItem & { taken?: Record<string, string[]> }, session = ''): Set<string> {
  const map = seatMapOf(e);
  const s = new Set<string>(map.blocked);
  // Mode API : places réellement vendues, renvoyées par le serveur avec l'événement
  if (e.taken) {
    for (const seat of e.taken[session] ?? []) s.add(seat);
    return s;
  }
  const seed = e.id.charCodeAt(1);
  for (let ri = 0; ri < map.rows; ri++)
    for (let c = 1; c <= map.cols; c++) if ((ri * 17 + c * seed) % 5 === 0 || (ri < 2 && c % 4 === 0)) s.add(`${rowLetter(ri)}-${c}`);
  return s;
}

// ---------- Participants : billets, revente, remboursements ----------

export async function requestRefund(order: Order, reason: string) {
  if (!DEMO) return http<NonNullable<Order['refundRequest']>>(`/orders/${order.id}/refund`, { method: 'POST', body: JSON.stringify({ reason }) });
  await wait(400);
  const ev = db.events.find((e) => e.id === order.eventId);
  db.refunds.unshift({
    id: uid('r'), orderId: order.id, buyer: order.buyerName, eventTitle: ev?.title ?? '', amount: order.total,
    currency: order.currency, reason, createdAt: new Date().toISOString(), status: 'pending',
  });
  return { reason, at: new Date().toISOString(), status: 'pending' as const };
}

export interface TransferResult {
  ticketId: string;
  to: string;
  newCode: string;
  /** Lien de la commande du destinataire (à lui transmettre si l'email n'est pas parti). */
  link?: string;
  emailSent?: boolean;
}
export async function transferTicket(ticketId: string, to: string, lang?: 'fr' | 'en'): Promise<TransferResult> {
  if (!DEMO) return http<TransferResult>(`/tickets/${ticketId}/transfer`, { method: 'POST', body: JSON.stringify({ to, lang }) });
  await wait(500);
  if (!to.trim()) throw new ApiError(422, 'Destinataire manquant');
  return { ticketId, to, newCode: ticketCode() };
}

export async function listForResale(ticket: IssuedTicket, price: number) {
  if (!DEMO) return void (await http(`/tickets/${ticket.id}/resale`, { method: 'POST', body: JSON.stringify({ price }) }));
  await wait(300);
  db.resaleListings.unshift({ ...clone(ticket), status: 'resale', resalePrice: price });
}

export async function cancelResale(ticketCode_: string) {
  if (!DEMO) return void (await http(`/resale/code/${encodeURIComponent(ticketCode_)}`, { method: 'DELETE' }));
  await wait(200);
  const i = db.resaleListings.findIndex((x) => x.code === ticketCode_);
  if (i >= 0) db.resaleListings.splice(i, 1);
}

export async function listResale(eventId?: string) {
  if (!DEMO) return http<IssuedTicket[]>(`/resale${eventId ? `?eventId=${encodeURIComponent(eventId)}` : ''}`);
  await wait();
  return clone(db.resaleListings.filter((x) => !eventId || x.eventId === eventId));
}

export async function buyResale(listingId: string, buyer: { name: string; email: string }) {
  if (!DEMO) return http<IssuedTicket>(`/resale/${listingId}/buy`, { method: 'POST', body: JSON.stringify(buyer) });
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
  if (!DEMO) return void (await http('/auth/password', { method: 'POST', body: JSON.stringify({ current, next }) }));
  await wait(500);
  if (current.length < 1) throw new ApiError(422, 'Mot de passe actuel requis');
  if (next.length < 8) throw new ApiError(422, 'Mot de passe trop court');
}

export async function deleteAccount() {
  if (!DEMO) return void (await http('/auth/me', { method: 'DELETE' }));
  await wait(600);
}

export async function requestPasswordReset(email: string) {
  if (!DEMO) throw new ApiError(501, 'La réinitialisation par email n’est pas encore disponible. Écrivez au support.');
  await wait(500);
  return { sentTo: email };
}

export async function resetPassword(token: string, password: string) {
  if (!DEMO) throw new ApiError(501, 'La réinitialisation par email n’est pas encore disponible. Écrivez au support.');
  await wait(500);
  if (!token) throw new ApiError(400, 'Lien invalide ou expiré');
  if (password.length < 8) throw new ApiError(422, 'Mot de passe trop court');
}

// ---------- Organisateur ----------

export async function listAttendees(eventId?: string): Promise<Attendee[]> {
  if (!DEMO) return http<Attendee[]>(`/org/attendees${eventId ? `?eventId=${encodeURIComponent(eventId)}` : ''}`);
  await wait();
  return clone(db.attendees.filter((a) => !eventId || a.eventId === eventId));
}

export async function listPromoCodes() {
  if (!DEMO) return http<PromoCode[]>('/org/promos');
  await wait(); return clone(db.promoCodes);
}
export async function savePromo(p: PromoCode) {
  if (!DEMO) return void (await http('/org/promos', { method: 'PUT', body: JSON.stringify(p) }));
  await wait(200);
  if (db.promoCodes.some((x) => x.code === p.code && x.id !== p.id)) throw new ApiError(409, 'Ce code existe déjà');
  const i = db.promoCodes.findIndex((x) => x.id === p.id);
  if (i >= 0) db.promoCodes[i] = p; else db.promoCodes.unshift(p);
}

export async function listTeam() {
  if (!DEMO) return http<TeamMember[]>('/org/team');
  await wait(); return clone(db.team);
}
export async function inviteMember(m: Omit<TeamMember, 'id' | 'status'>) {
  if (!DEMO) return http<TeamMember>('/org/team', { method: 'POST', body: JSON.stringify(m) });
  await wait(300);
  if (db.team.some((x) => x.email.toLowerCase() === m.email.toLowerCase())) throw new ApiError(409, 'Déjà membre');
  const n: TeamMember = { ...m, id: uid('m'), status: 'invited' };
  db.team.push(n);
  return n;
}
export async function updateMember(id: string, patch: Partial<TeamMember>) {
  if (!DEMO) return void (await http(`/org/team/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }));
  await wait(200);
  const m = db.team.find((x) => x.id === id);
  if (m) Object.assign(m, patch);
}
export async function removeMember(id: string) {
  if (!DEMO) return void (await http(`/org/team/${id}`, { method: 'DELETE' }));
  await wait(200);
  const i = db.team.findIndex((x) => x.id === id);
  if (i >= 0) db.team.splice(i, 1);
}

export async function listRefunds() {
  if (!DEMO) return http<RefundRequest[]>('/org/refunds');
  await wait(); return clone(db.refunds);
}
export async function decideRefund(id: string, status: RefundRequest['status']) {
  if (!DEMO) return void (await http(`/org/refunds/${id}`, { method: 'POST', body: JSON.stringify({ status }) }));
  await wait(300);
  const r = db.refunds.find((x) => x.id === id);
  if (r) r.status = status;
}

export async function listPayouts(orgId: string) {
  if (!DEMO) return http<Payout[]>(`/org/payouts${orgQ(orgId)}`);
  await wait(); return clone(db.payouts.filter((p) => p.organizerId === orgId));
}

/** Solde de l'organisateur calculé à partir des ventes, commissions, remboursements et versements. */
/** Solde de l'organisateur : ventes, commission (taux réel), remboursements et versements. */
export async function getBalance(orgId: string) {
  if (!DEMO) return http<never>(`/org/balance${orgQ(orgId)}`);
  await wait();
  const evs = db.events.filter((e) => e.organizerId === orgId);
  const rate = feeRateFor(orgId);
  const by = (cur: Currency) => {
    const gross = evs.filter((e) => e.currency === cur).reduce((a, e) => a + e.tickets.reduce((x, t) => x + t.sold * t.price, 0), 0);
    const titles = new Set(evs.filter((e) => e.currency === cur).map((e) => e.title));
    const refunded = db.refunds.filter((r) => r.status === 'approved' && r.currency === cur && titles.has(r.eventTitle)).reduce((a, r) => a + r.amount, 0);
    const paid = db.payouts.filter((p) => p.organizerId === orgId && p.currency === cur && !['scheduled', 'rejected'].includes(p.status)).reduce((a, p) => a + p.amount, 0);
    // Seule la part de la commission qui n'est pas payée par l'acheteur est déduite de l'organisateur
    const fees = Math.round(gross * (rate / 100) * ((100 - feeSettings.buyerShare) / 100) * 100) / 100;
    return { gross, fees, rate, refunded, paid, balance: Math.max(0, gross - fees - refunded - paid) };
  };
  return { HTG: by('HTG'), USD: by('USD'), buyerShare: feeSettings.buyerShare };
}

export async function requestPayout(orgId: string, amount: number, currency: Currency, method: Payout['method'], destination: Payout['destination'], priority = false) {
  if (!DEMO) return http<Payout>(`/org/payouts${orgQ(orgId)}`, { method: 'POST', body: JSON.stringify({ amount, currency, method, destination, priority }) });
  await wait(500);
  // La demande attend la validation de l'administration
  const p: Payout = { id: uid('py'), organizerId: orgId, amount, currency, method, destination, status: 'requested', date: new Date().toISOString().slice(0, 10), reference: `VRS-${Date.now().toString(36).toUpperCase()}` };
  db.payouts.unshift(p);
  return clone(p);
}

/** Retrouver une commande sans compte grâce à la clé du lien reçu par email. */
export async function getOrderByKey(id: string, key: string) {
  const r = await http<{ order: Order; tickets: IssuedTicket[]; event: EventItem | null; claimed: boolean }>(`/orders/${encodeURIComponent(id)}?k=${encodeURIComponent(key)}`);
  if (r.event) cacheEvent(r.event);
  return r;
}
/** Rattacher une commande passée sans compte au compte connecté. */
export async function claimOrder(id: string, key: string) {
  await http(`/orders/${encodeURIComponent(id)}/claim`, { method: 'POST', body: JSON.stringify({ key }) });
}
/** Administration : un virement est arrivé, les billets deviennent valables. */
export async function confirmOrderPayment(id: string) {
  if (!DEMO) return http<{ emailSent: boolean }>(`/admin/orders/${encodeURIComponent(id)}/confirm`, { method: 'POST' });
  await wait(200);
  const o = db.platformOrders.find((x) => x.id === id);
  if (o) o.status = 'paid';
  audit('Paiement confirmé', id);
  return { emailSent: false };
}

export async function deleteOrder(id: string) {
  if (!DEMO) return void (await http(`/admin/orders/${encodeURIComponent(id)}`, { method: 'DELETE' }));
  await wait(200);
  const i = db.platformOrders.findIndex((x) => x.id === id);
  if (i >= 0) db.platformOrders.splice(i, 1);
  audit('Commande supprimée', id);
}

// ---------- Fichiers ----------

export type UploadKind = 'event_cover' | 'org_logo' | 'verification';

/**
 * Envoie un fichier. Mode serveur : renvoie l'adresse du fichier stocké (/api/files/…).
 * Démo : le fichier reste dans la page sous forme d'adresse « data: ».
 */
export async function uploadFile(kind: UploadKind, blob: Blob, name: string, docType?: string): Promise<{ id: string; url: string }> {
  if (DEMO) return { id: uid('f'), url: await blobToDataUrl(blob) };
  return http<{ id: string; url: string }>('/files', { method: 'POST', body: JSON.stringify({ kind, name, docType, data: await blobToBase64(blob) }) });
}

/** Document privé (vérification) : lu avec la session, jamais par une adresse publique. */
export async function fetchPrivateFile(id: string): Promise<Blob> {
  const token = localStorage.getItem('e509.token');
  const res = await fetch(`${API_URL}/files/${encodeURIComponent(id)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new ApiError(res.status, 'Fichier introuvable');
  return res.blob();
}

export interface OrgVerification {
  verified: boolean;
  status: 'none' | VerificationRequest['status'];
  note: string | null;
  docs: { type: 'id' | 'license' | 'bank'; name: string; uploadedAt: string }[];
}
export function orgVerification() {
  return http<OrgVerification>('/org/verification');
}

export interface OrgSales {
  week: { date: string; tickets: number; revenue: number }[];
  recent: { id: string; who: string; type: string; qty: number; amount: number }[];
}
/** Mode serveur : ventes réelles des 7 derniers jours et dernières commandes. */
export async function orgSales(orgId: string): Promise<OrgSales> {
  if (!DEMO) return http<OrgSales>(`/org/sales${orgQ(orgId)}`);
  await wait(100);
  const mine = db.platformOrders.filter((o) => o.status === 'paid' && orgOfEvent(o.eventId) === orgId);
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const day = d.toISOString().slice(0, 10);
    const inDay = mine.filter((o) => o.createdAt.slice(0, 10) === day);
    return { date: day, tickets: inDay.reduce((a, o) => a + o.items.reduce((x, it) => x + it.qty, 0), 0), revenue: Math.round(inDay.reduce((a, o) => a + toHTG(o.subtotal - o.discount, o.currency), 0)) };
  });
  const recent = [...mine].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8).map((o) => ({
    id: o.id,
    who: o.buyerName,
    type: db.events.find((e) => e.id === o.eventId)?.tickets.find((t) => t.id === o.items[0]?.ticketTypeId)?.name ?? '',
    qty: o.items.reduce((a, it) => a + it.qty, 0),
    amount: Math.round(toHTG(o.total, o.currency)),
  }));
  return { week, recent };
}

export async function listCampaigns() {
  if (!DEMO) return http<Campaign[]>('/org/campaigns');
  await wait(); return clone(db.campaigns);
}
export async function saveCampaign(c: Campaign) {
  if (!DEMO) return http<Campaign>('/org/campaigns', { method: 'PUT', body: JSON.stringify(c) });
  await wait(400);
  const i = db.campaigns.findIndex((x) => x.id === c.id);
  if (i >= 0) db.campaigns[i] = c; else db.campaigns.unshift(c);
  return clone(c);
}

export async function listAmbassadors() {
  if (!DEMO) return http<Ambassador[]>('/org/ambassadors');
  await wait(); return clone(db.ambassadors);
}
export async function saveAmbassador(a: Ambassador) {
  if (!DEMO) return void (await http('/org/ambassadors', { method: 'PUT', body: JSON.stringify(a) }));
  await wait(300);
  if (db.ambassadors.some((x) => x.code === a.code && x.id !== a.id)) throw new ApiError(409, 'Code déjà utilisé');
  const i = db.ambassadors.findIndex((x) => x.id === a.id);
  if (i >= 0) db.ambassadors[i] = a; else db.ambassadors.push(a);
}

/** Statistiques détaillées d'un événement. */
export async function eventStats(eventId: string) {
  if (!DEMO) return http<never>(`/org/events/${eventId}/stats${orgQ(db.events.find((e) => e.id === eventId)?.organizerId)}`).catch(() => null);
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

export type TicketCheck =
  | { ok: true; attendee: Attendee }
  | { ok: false; reason: 'unknown' | 'used' | 'wrong_event' | 'inactive'; attendee?: Attendee };

/** Recherche d'un billet à l'entrée, sans rien modifier : l'organisateur vérifie qui entre, puis valide. */
export async function lookupTicket(code: string, eventId?: string): Promise<TicketCheck> {
  if (!DEMO) return http<TicketCheck>('/org/checkin/lookup', { method: 'POST', body: JSON.stringify({ code, eventId }) });
  await wait(120);
  const a = db.attendees.find((x) => x.code === code);
  if (!a) return { ok: false, reason: 'unknown' };
  if (eventId && a.eventId !== eventId) return { ok: false, reason: 'wrong_event', attendee: clone(a) };
  if (a.checkedIn) return { ok: false, reason: 'used', attendee: clone(a) };
  return { ok: true, attendee: clone(a) };
}

/** Validation d'un billet à l'entrée : un billet ne peut être validé qu'une seule fois (contrôle atomique côté serveur). */
export async function verifyTicket(code: string, eventId?: string): Promise<TicketCheck> {
  if (!DEMO) return http<TicketCheck>('/org/checkin', { method: 'POST', body: JSON.stringify({ code, eventId }) });
  await wait(150);
  const a = db.attendees.find((x) => x.code === code);
  if (!a) return { ok: false, reason: 'unknown' };
  if (eventId && a.eventId !== eventId) return { ok: false, reason: 'wrong_event', attendee: clone(a) };
  if (a.checkedIn) return { ok: false, reason: 'used', attendee: clone(a) };
  a.checkedIn = true;
  a.checkedInAt = new Date().toISOString();
  return { ok: true, attendee: clone(a) };
}

// ---------- Commissions ----------

const FEES_KEY = 'e509.demo.fees';
const CUSTOM_KEY = 'e509.demo.customFees';
function readLocal<T>(k: string): T | null {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function writeLocal(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}
// En démo, les réglages survivent au rechargement (le backend les stockera)
const feeSettings: FeeSettings = { ...DEFAULT_FEES, ...db.platformSettings.fees, ...((DEMO && readLocal<FeeSettings>(FEES_KEY)) || {}) };

/** Réglages de frais en vigueur (lecture synchrone, utilisée au paiement). */
export function currentFeeSettings(): FeeSettings {
  return { ...feeSettings };
}
/** Taux de commission d'un organisateur : taux négocié, sinon taux par défaut. */
export function feeRateFor(orgId: string) {
  return db.customCommissions.find((c) => c.organizerId === orgId)?.rate ?? feeSettings.percent;
}
export async function saveFeeSettings(next: FeeSettings) {
  if (!DEMO) return void Object.assign(feeSettings, await http<FeeSettings>('/admin/fees', { method: 'PUT', body: JSON.stringify(next) }));
  await wait(200);
  Object.assign(feeSettings, next);
  writeLocal(FEES_KEY, feeSettings);
  audit('Commission par défaut modifiée', `${next.percent} % + ${next.fixedHTG} HTG`);
}
// ---------- Documents légaux et valeurs du site ----------

const SITE_KEY = 'e509.siteInfo';
const LEGAL_KEY = 'e509.legalTexts';
const siteInfo: SiteInfo = { ...defaultSiteInfo, ...((DEMO && readLocal<Partial<SiteInfo>>(SITE_KEY)) || {}) };

/** Valeurs insérées dans les documents légaux (lecture synchrone). */
export function currentSiteInfo(): SiteInfo {
  return { ...siteInfo };
}
export type LegalOverrides = Partial<Record<LegalDoc, Partial<Record<Lang, string>>>>;

/** Textes juridiques modifiés par l'administrateur ; ce qui manque garde le texte d'origine. */
export async function getLegalOverrides(): Promise<LegalOverrides> {
  if (!DEMO) return http<LegalOverrides>('/legal');
  return readLocal<LegalOverrides>(LEGAL_KEY) ?? {};
}
/** Administrateur : modifie un document (ou le rétablit avec text = null). */
export async function saveLegalText(doc: LegalDoc, lang: Lang, text: string | null) {
  if (!DEMO) return void (await http('/admin/legal', { method: 'PUT', body: JSON.stringify({ doc, lang, text }) }));
  await wait(150);
  const cur = readLocal<LegalOverrides>(LEGAL_KEY) ?? {};
  const next: LegalOverrides = { ...cur, [doc]: { ...(cur[doc] ?? {}) } };
  if (text === null) delete next[doc]![lang];
  else next[doc]![lang] = text;
  writeLocal(LEGAL_KEY, next);
  audit(text === null ? 'Texte légal rétabli' : 'Texte légal modifié', `${doc} (${lang})`);
}
/** Administrateur : enregistre les valeurs insérées dans les documents légaux. */
export async function saveSiteInfo(next: SiteInfo) {
  if (!DEMO) return void Object.assign(siteInfo, await http<Partial<SiteInfo>>('/admin/site', { method: 'PUT', body: JSON.stringify(next) }));
  await wait(150);
  Object.assign(siteInfo, next);
  writeLocal(SITE_KEY, siteInfo);
  audit('Réglages des documents légaux modifiés', Object.keys(next).join(', '));
}

/** Taux de change en vigueur : gourdes pour 1 unité de chaque devise. */
export function currentExchangeRates(): Record<DisplayCurrency, number> {
  return { ...RATES };
}
/** Réservé à l'administrateur : fixe les taux de change du site (gourdes pour 1 unité de chaque devise). */
export async function saveExchangeRates(rates: Partial<Record<DisplayCurrency, number>>) {
  if (!DEMO) {
    const r = await http<{ rates: Partial<Record<DisplayCurrency, number>> }>('/admin/rate', { method: 'PUT', body: JSON.stringify({ rates }) });
    return void setRates(r.rates);
  }
  await wait(200);
  setRates(rates);
  audit('Taux de change modifiés', Object.entries(rates).map(([k, v]) => `1 ${k} = ${v} HTG`).join(', '));
}
export async function listCustomCommissions() {
  if (!DEMO) return http<typeof db.customCommissions>('/admin/commissions');
  await wait(); return clone(db.customCommissions);
}
export async function saveCustomCommission(c: { organizerId: string; rate: number; reason: string }) {
  if (!DEMO) {
    await http('/admin/commissions', { method: 'PUT', body: JSON.stringify(c) });
    return void replaceCommission(c);
  }
  await wait(200);
  const i = db.customCommissions.findIndex((x) => x.organizerId === c.organizerId);
  if (i >= 0) db.customCommissions[i] = c; else db.customCommissions.push(c);
  writeLocal(CUSTOM_KEY, db.customCommissions);
  audit('Taux personnalisé enregistré', `${db.organizers.find((o) => o.id === c.organizerId)?.name} — ${c.rate} %`);
}
export async function removeCustomCommission(organizerId: string) {
  if (!DEMO) {
    await http(`/admin/commissions/${organizerId}`, { method: 'DELETE' });
    return void replaceCommission({ organizerId });
  }
  await wait(200);
  const i = db.customCommissions.findIndex((x) => x.organizerId === organizerId);
  if (i >= 0) db.customCommissions.splice(i, 1);
  writeLocal(CUSTOM_KEY, db.customCommissions);
  audit('Taux personnalisé supprimé', db.organizers.find((o) => o.id === organizerId)?.name ?? organizerId);
}

// ---------- Administration ----------

/** Auteur des actions d'administration (le backend le déduira du jeton). */
function actorName() {
  try {
    return (JSON.parse(localStorage.getItem('e509.user') ?? 'null') as AppUser | null)?.name ?? 'Admin';
  } catch {
    return 'Admin';
  }
}
function audit(action: string, target: string) {
  db.auditLog.unshift({ id: uid('al'), at: new Date().toISOString(), actor: actorName(), action, target });
}
export async function listAudit() {
  if (!DEMO) return http<AuditEntry[]>('/admin/audit');
  await wait(); return clone(db.auditLog);
}

const toHTG = (amount: number, cur: Currency) => (cur === 'USD' ? amount * USD_TO_HTG : amount);
const orgOfEvent = (eventId: string) => db.events.find((e) => e.id === eventId)?.organizerId ?? '';
const monthKey = (iso: string) => iso.slice(0, 7);

/** Utilisateur → organisation dont il fait partie (le backend le fournira). */
export function organizationOfUser(u: AppUser): string | undefined {
  if (!DEMO) return u.organizerId;
  const map: Record<string, string> = { u2: 'org1', u8: 'org1', u9: 'org1', u3: 'org2', u4: 'org3', u13: 'org4' };
  return u.role === 'organizer' ? map[u.id] : undefined;
}

/** Statistiques de la plateforme, calculées à partir des commandes. */
export async function platformStats() {
  if (!DEMO) return http<never>('/admin/stats');
  await wait();
  const now = new Date();
  const orders = db.platformOrders;
  const paid = orders.filter((o) => o.status === 'paid');
  const refunded = orders.filter((o) => o.status === 'refunded' || o.status === 'partially_refunded');
  const qty = (o: Order) => o.items.reduce((a, i) => a + i.qty, 0);

  // Six derniers mois, du plus ancien au plus récent
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const monthly = months.map((m) => {
    const inM = orders.filter((o) => monthKey(o.createdAt) === m);
    const sales = inM.filter((o) => o.status === 'paid').reduce((a, o) => a + toHTG(o.subtotal - o.discount, o.currency), 0);
    const refunds = inM.filter((o) => o.status !== 'paid' && o.status !== 'pending').reduce((a, o) => a + toHTG(o.subtotal - o.discount, o.currency), 0);
    const fees = inM.filter((o) => o.status === 'paid').reduce((a, o) => a + toHTG(o.fees, o.currency), 0);
    return { month: m, sales: Math.round(sales), refunds: Math.round(refunds), fees: Math.round(fees), tickets: inM.reduce((a, o) => a + qty(o), 0) };
  });

  const gmv = monthly.reduce((a, m) => a + m.sales, 0);
  const fees = monthly.reduce((a, m) => a + m.fees, 0);
  const refundTotal = monthly.reduce((a, m) => a + m.refunds, 0);
  const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
  const ticketsWeek = paid.filter((o) => o.createdAt >= weekAgo).reduce((a, o) => a + qty(o), 0);
  const refundRate = orders.length ? refunded.length / orders.length : 0;
  const openDisputes = db.disputes.filter((d) => d.status !== 'resolved').length;

  const share = <K extends string>(keyOf: (o: Order) => K) => {
    const m = new Map<K, number>();
    for (const o of paid) m.set(keyOf(o), (m.get(keyOf(o)) ?? 0) + toHTG(o.subtotal, o.currency));
    const total = [...m.values()].reduce((a, b) => a + b, 0) || 1;
    return [...m.entries()].map(([label, v]) => ({ label, share: v / total })).sort((a, b) => b.share - a.share);
  };

  const verifiedOrganizers = db.organizers.filter((o) => o.verified).length;
  const metrics = { gmv, tickets: ticketsWeek, organizers: verifiedOrganizers, users: db.users.length };

  // Santé financière : taux de remboursement et litiges ouverts
  const health = refundRate > 0.08 || openDisputes > 5 ? 'critical' : refundRate > 0.05 || openDisputes > 2 ? 'watch' : 'healthy';

  return clone({
    gmv, fees, refundTotal, refundRate, ticketsWeek, health,
    feesThisMonth: monthly[5].fees,
    users: db.users.length,
    newUsersMonth: db.users.filter((u) => monthKey(u.joinedAt) === months[5]).length,
    activeEvents: db.events.filter((e) => e.status === 'published' && new Date(e.end) >= now).length,
    pendingEvents: db.events.filter((e) => e.status === 'pending').length,
    openDisputes,
    openReports: db.reports.filter((r) => r.status === 'open').length,
    pendingVerifications: db.verificationRequests.filter((v) => v.status === 'pending').length,
    pendingPayouts: db.payouts.filter((p) => p.status === 'requested').length,
    monthly,
    byCity: share((o) => db.events.find((e) => e.id === o.eventId)?.venue?.city ?? 'En ligne'),
    byMethod: share((o) => o.method),
    metrics,
    targets: db.platformTargets.map((tg) => ({ ...tg, current: metrics[tg.metric] })),
    recent: orders.slice(0, 12),
  });
}

export async function saveTarget(tg: PlatformTarget) {
  if (!DEMO) return void (await http('/admin/targets', { method: 'PUT', body: JSON.stringify(tg) }));
  await wait(200);
  const i = db.platformTargets.findIndex((x) => x.id === tg.id);
  if (i >= 0) db.platformTargets[i] = tg; else db.platformTargets.push(tg);
  audit(i >= 0 ? 'Objectif modifié' : 'Objectif créé', tg.title);
}
export async function removeTarget(id: string) {
  if (!DEMO) return void (await http(`/admin/targets/${id}`, { method: 'DELETE' }));
  await wait(200);
  const i = db.platformTargets.findIndex((x) => x.id === id);
  if (i >= 0) audit('Objectif supprimé', db.platformTargets.splice(i, 1)[0].title);
}

/** Toutes les transactions de la plateforme (filtrables). */
export async function listPlatformOrders(f: { q?: string; status?: Order['status'] | ''; method?: Order['method'] | ''; organizerId?: string } = {}) {
  if (!DEMO) return http<Order[]>(`/admin/orders?${new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][])}`);
  await wait();
  const q = f.q?.toLowerCase().trim();
  return clone(
    db.platformOrders.filter(
      (o) =>
        (!q || `${o.id} ${o.buyerName} ${o.buyerEmail}`.toLowerCase().includes(q)) &&
        (!f.status || o.status === f.status) &&
        (!f.method || o.method === f.method) &&
        (!f.organizerId || orgOfEvent(o.eventId) === f.organizerId),
    ),
  );
}

export async function listUsers() {
  if (!DEMO) return http<AppUser[]>('/admin/users');
  await wait(); return clone(db.users);
}
export async function setUserStatus(id: string, status: AppUser['status']) {
  if (!DEMO) return void (await http(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }));
  await wait(200);
  const u = db.users.find((x) => x.id === id);
  if (u) {
    u.status = status;
    audit(status === 'suspended' ? 'Utilisateur suspendu' : 'Utilisateur réactivé', u.name);
  }
}
export async function setUserRole(id: string, role: AppUser['role']) {
  if (!DEMO) return void (await http(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify({ role }) }));
  await wait(200);
  const u = db.users.find((x) => x.id === id);
  if (u) {
    u.role = role;
    if (role === 'organizer') u.teamRole = u.teamRole ?? 'admin';
    audit('Rôle modifié', `${u.name} → ${role}`);
  }
}
/** Fiche détaillée : profil, commandes, événements organisés. */
export async function getUserDetail(id: string) {
  if (!DEMO) return http<never>(`/admin/users/${id}`);
  await wait();
  const u = db.users.find((x) => x.id === id);
  if (!u) return null;
  const orgId = organizationOfUser(u);
  const orders = [...(u.id === 'u1' ? db.myOrders : []), ...db.platformOrders.filter((o) => o.buyerName === u.name)];
  return clone({
    user: u,
    organization: orgId ? db.organizers.find((o) => o.id === orgId) ?? null : null,
    orders,
    spent: orders.filter((o) => o.status === 'paid').reduce((a, o) => a + toHTG(o.total, o.currency), 0),
    events: orgId ? db.events.filter((e) => e.organizerId === orgId) : [],
  });
}

export async function listAllEvents() {
  if (!DEMO) return cacheEvents(await http<EventItem[]>('/admin/events'));
  await wait(); return clone(db.events);
}
export async function moderateEvent(id: string, status: EventItem['status'], reason?: string) {
  if (!DEMO) {
    await http(`/admin/events/${id}/moderate`, { method: 'POST', body: JSON.stringify({ status, reason }) });
    return void patchCachedEvent(id, { status });
  }
  await wait(200);
  const e = db.events.find((x) => x.id === id);
  if (!e) return;
  e.status = status;
  audit(status === 'published' ? 'Événement approuvé' : status === 'rejected' ? 'Événement refusé' : 'Événement modifié', `${e.title}${reason ? ` — ${reason}` : ''}`);
}

export async function listReports() {
  if (!DEMO) return http<Report[]>('/admin/reports');
  await wait(); return clone(db.reports);
}
// ---------- Avis et notes (mode serveur seulement) ----------

export interface ReviewList { average: number; count: number; items: Review[] }
export async function listReviews(eventId: string): Promise<ReviewList> {
  if (DEMO) return { average: 0, count: 0, items: [] };
  return http<ReviewList>(`/events/${encodeURIComponent(eventId)}/reviews`);
}
export async function reviewState(orderId: string, key: string) {
  if (DEMO) return { canReview: false, over: false, review: null as Review | null };
  return http<{ canReview: boolean; over: boolean; review: Review | null }>(`/reviews/state?order=${encodeURIComponent(orderId)}&k=${encodeURIComponent(key)}`);
}
export async function createReview(input: { orderId: string; key: string; rating: number; comment: string }) {
  return http<Review>('/reviews', { method: 'POST', body: JSON.stringify(input) });
}
export async function listOrgReviews(): Promise<(Review & { eventTitle: string })[]> {
  if (DEMO) return [];
  return http('/org/reviews');
}
export async function replyToReview(id: string, body: string) {
  await http(`/org/reviews/${encodeURIComponent(id)}/reply`, { method: 'POST', body: JSON.stringify({ body }) });
}
export async function deleteReview(id: string) {
  await http(`/admin/reviews/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function reportEvent(eventId: string, reason: Report['reason'], details: string, reporter: string) {
  if (!DEMO) return void (await http('/reports', { method: 'POST', body: JSON.stringify({ eventId, reason, details, reporter }) }));
  await wait(400);
  db.reports.unshift({ id: uid('rp'), eventId, reason, details, reporter, status: 'open', createdAt: new Date().toISOString() });
}
export async function setReportStatus(id: string, status: Report['status']) {
  if (!DEMO) return void (await http(`/admin/reports/${id}`, { method: 'POST', body: JSON.stringify({ status }) }));
  await wait(200);
  const r = db.reports.find((x) => x.id === id);
  if (!r) return;
  r.status = status;
  audit(status === 'dismissed' ? 'Signalement classé' : 'Signalement traité', db.events.find((e) => e.id === r.eventId)?.title ?? r.eventId);
}

export async function listVerificationRequests() {
  if (!DEMO) return http<VerificationRequest[]>('/admin/verifications');
  await wait(); return clone(db.verificationRequests);
}
export async function decideVerification(
  id: string, status: VerificationRequest['status'] | 'revoked' | 'reinstated', note?: string,
  checklist?: { identity: boolean; email: boolean; phone: boolean; presence: boolean },
) {
  if (!DEMO) {
    await http(`/admin/verifications/${id}`, { method: 'POST', body: JSON.stringify({ status, note, checklist }) });
    return;
  }
  await wait(300);
  const v = db.verificationRequests.find((x) => x.id === id);
  if (!v) return;
  v.status = status === 'revoked' ? 'rejected' : status === 'reinstated' ? 'approved' : status;
  v.note = note;
  const o = db.organizers.find((x) => x.id === v.organizerId);
  if (o) o.verified = v.status === 'approved';
  audit(status === 'approved' ? 'Organisateur vérifié' : status === 'docs_requested' ? 'Documents demandés' : 'Vérification mise à jour', v.name);
}

/** L'administrateur vérifie (ou retire la vérification d') une organisation directement, sans demande ni paiement. */
export async function setOrganizerVerified(organizerId: string, verified: boolean) {
  if (!DEMO) return void (await http(`/admin/organizers/${organizerId}/verification`, { method: 'POST', body: JSON.stringify({ verified }) }));
  await wait(200);
  const o = db.organizers.find((x) => x.id === organizerId);
  if (!o) return;
  o.verified = verified;
  audit(verified ? 'Organisateur vérifié directement' : 'Vérification retirée', o.name);
}

export async function listDisputes() {
  if (!DEMO) return http<Dispute[]>('/admin/disputes');
  await wait(); return clone(db.disputes);
}
/** Décision sur un litige : enregistre la décision, la note et déclenche le remboursement. */
export async function resolveDispute(id: string, input: { status: Dispute['status']; decision?: Dispute['decision']; note?: string }) {
  if (!DEMO) return void (await http(`/admin/disputes/${id}/resolve`, { method: 'POST', body: JSON.stringify(input) }));
  await wait(300);
  const d = db.disputes.find((x) => x.id === id);
  if (!d) return;
  d.status = input.status;
  if (input.note) d.note = input.note;
  if (input.status === 'resolved' && input.decision) {
    d.decision = input.decision;
    d.refunded = input.decision === 'refund_full' ? d.amount : input.decision === 'refund_half' ? Math.round(d.amount / 2) : 0;
    if (d.refunded > 0) {
      db.refunds.unshift({ id: uid('r'), orderId: d.orderId, buyer: d.opener, eventTitle: d.against, amount: d.refunded, currency: d.currency, reason: `Litige ${d.id}`, createdAt: new Date().toISOString(), status: 'approved' });
      const o = db.platformOrders.find((x) => x.id === d.orderId);
      if (o) o.status = d.refunded >= d.amount ? 'refunded' : 'partially_refunded';
    }
    d.messages.push({ from: 'admin', author: 'Équipe Event509', body: input.note ?? '', at: new Date().toISOString() });
  }
  audit(input.status === 'resolved' ? 'Litige résolu' : 'Litige passé en enquête', d.orderId);
}
export async function addDisputeMessage(id: string, body: string) {
  if (!DEMO) return void (await http(`/admin/disputes/${id}/messages`, { method: 'POST', body: JSON.stringify({ body }) }));
  await wait(200);
  const d = db.disputes.find((x) => x.id === id);
  if (d) d.messages.push({ from: 'admin', author: 'Équipe Event509', body, at: new Date().toISOString() });
}

/** Versements de tous les organisateurs (validation par l'administration). */
export async function listAllPayouts() {
  if (!DEMO) return http<Payout[]>('/admin/payouts');
  await wait(); return clone(db.payouts);
}
export async function setPayoutStatus(id: string, status: Payout['status']) {
  if (!DEMO) return void (await http(`/admin/payouts/${id}`, { method: 'POST', body: JSON.stringify({ status }) }));
  await wait(300);
  const p = db.payouts.find((x) => x.id === id);
  if (!p) return;
  p.status = status;
  const org = db.organizers.find((o) => o.id === p.organizerId)?.name ?? p.organizerId;
  audit(status === 'paid' ? 'Versement payé' : status === 'processing' ? 'Versement approuvé' : 'Versement refusé', `${org} — ${p.amount} ${p.currency}`);
}
