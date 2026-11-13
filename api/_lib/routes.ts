import type {
  Ambassador, AppUser, Attendee, AuditEntry, Campaign, Dispute, EventItem, IssuedTicket, Order, Organizer, Payout,
  PlatformTarget, PromoCode, RefundRequest, Report, Review, TeamMember, TeamRole, VerificationRequest,
} from '../../src/types.js';
import { all, db, docs, one, tx, upsert, type Q } from './db.js';
import { hashPassword, newAccessKey, newId, newTicketCode, sameKey, signToken, verifyPassword } from './auth.js';
import { sendNoticeEmail, sendTicketsEmail } from './mail.js';
import { createPayment, MIN_HTG, ONLINE_METHODS, payConfigured, verifyPayment, type OnlineMethod, type PayStatus } from './pay.js';
import { analyticsRoutes } from './analytics.js';
import { multiEventRoutes } from './multi.js';
import { supportRoutes } from './support.js';
import { marketingRoutes } from './marketing.js';
import { financeRoutes } from './finance.js';
import { boostRoutes, checkBoostPayment } from './boost.js';
import { devApiRoutes, fireWebhooks } from './devapi.js';
import { benefitsFor, checkPremiumPayment, patchRequest, premiumMaintenance, premiumRoutes } from './premium.js';
import { claimOnce, holderEmails, holderUserIds, notifyEmails, notifyHolders, notifyUsers, organizerUserIds, pushConfigured } from './push.js';
import { readableBrand } from './color.js';
import { checkFile, DOC_TYPES, safeName, validCover, type FileKind } from './files.js';
import { computeFees, convert, DEFAULT_FEES, DEFAULT_RATES, isDisplayCurrency, RATES, round as roundCur, setRates, USD_TO_HTG, type Currency, type FeeSettings } from './fees.js';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
/** Réponse binaire (fichier) : le routeur ne la convertit pas en JSON. */
export class Binary {
  constructor(public mime: string, public data: Buffer, public cache: string, public name: string) {}
}

const fail = (status: number, message: string): never => {
  throw new HttpError(status, message);
};

export interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  role: AppUser['role'];
  team_role: TeamRole | null;
  team_perms?: string[] | null;
  organizer_id: string | null;
  status: AppUser['status'];
  data: Partial<AppUser>;
}

export interface Ctx {
  user: UserRow | null;
  method?: string;
  path?: string;
  authorization?: string;
  geo?: { country?: string; city?: string };
  params: Record<string, string>;
  query: Record<string, string>;
  body: Record<string, unknown>;
}

type Handler = (c: Ctx) => Promise<unknown>;

// ---------- Utilitaires ----------

export const toAppUser = (u: UserRow): AppUser & { organizerId?: string } => ({
  avatar: '', city: '', joinedAt: '', name: '',
  ...u.data,
  id: u.id,
  email: u.email,
  role: u.role,
  teamRole: u.team_role ?? undefined,
  teamPerms: u.team_perms ?? undefined,
  status: u.status,
  organizerId: u.organizer_id ?? undefined,
});

const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v));
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || 'E5';
const slugify = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'evenement';

/** Permissions attribuables à un membre (« équipe » reste réservée à l'administrateur de l'organisation). */
const MEMBER_PERMS = ['dashboard', 'events', 'attendees', 'checkin', 'promos', 'refunds', 'payouts', 'marketing', 'settings'] as const;

const teamPerms: Record<TeamRole, string[]> = {
  admin: ['dashboard', 'events', 'attendees', 'checkin', 'promos', 'refunds', 'payouts', 'marketing', 'team', 'settings'],
  manager: ['dashboard', 'events', 'attendees', 'checkin', 'promos', 'refunds', 'marketing'],
  lead: ['attendees', 'checkin'],
  staff: ['checkin'],
  accountant: ['dashboard', 'attendees', 'refunds', 'payouts'],
};

/** Permissions d'un membre : celles de son rôle, ou la liste personnalisée fixée par l'administrateur de l'organisation. */
function effectivePerms(u: UserRow): string[] {
  const base = teamPerms[u.team_role ?? 'admin'];
  return u.team_perms ? u.team_perms.filter((p) => base.includes(p) || (MEMBER_PERMS as readonly string[]).includes(p)) : base;
}

function auth(c: Ctx): UserRow {
  if (!c.user) fail(401, 'Connectez-vous pour continuer');
  if (c.user!.status === 'suspended') fail(403, 'Compte suspendu');
  return c.user!;
}
function admin(c: Ctx) {
  const u = auth(c);
  if (u.role !== 'admin') fail(403, 'Accès réservé à l’administration');
  return u;
}
/** Organisation sur laquelle agit l'utilisateur, après contrôle de la permission demandée. */
function org(c: Ctx, perm: string): string {
  const u = auth(c);
  if (u.role === 'admin') return c.query.org || u.organizer_id || fail(400, 'Aucune organisation');
  if (u.role !== 'organizer' || !u.organizer_id) fail(403, 'Accès réservé aux organisateurs');
  if (!effectivePerms(u).includes(perm)) fail(403, 'Votre rôle ne permet pas cette action');
  return u.organizer_id!;
}

async function feeSettings(q: Q = db()): Promise<FeeSettings> {
  const r = await one<{ value: Partial<FeeSettings> & { passToBuyer?: boolean } }>(`select value from settings where key = 'fees'`, [], q);
  const { passToBuyer: _legacy, ...stored } = r?.value ?? {};
  // Anciens réglages (« l'acheteur paie tout » ou « l'organisateur paie tout ») : sans part définie, la commission est partagée 50/50
  return { ...DEFAULT_FEES, ...stored };
}
let rateLoadedAt = 0;
/** Relit le taux de change réglé par l'administrateur (au plus une fois toutes les 30 s par instance). */
export async function refreshRate() {
  if (Date.now() - rateLoadedAt < 30_000) return;
  const r = await one<{ value: { usdToHtg?: number; rates?: Record<string, number> } }>(`select value from settings where key = 'rate'`);
  // Départ : taux par défaut, puis ceux réglés par l'administrateur (l'ancien réglage ne contenait que le dollar)
  setRates({ ...DEFAULT_RATES, ...(r?.value?.usdToHtg ? { USD: r.value.usdToHtg } : {}), ...(r?.value?.rates ?? {}) });
  rateLoadedAt = Date.now();
}
async function rateFor(orgId: string, q: Q = db()) {
  const r = await one<{ rate: string }>(`select rate from custom_commissions where organizer_id = $1`, [orgId], q);
  return r ? Number(r.rate) : undefined;
}
async function audit(c: Ctx, action: string, target: string, q: Q = db()) {
  const e: AuditEntry = { id: newId('al'), at: new Date().toISOString(), actor: (c.user?.data.name as string) ?? 'Admin', action, target };
  await upsert('audit_log', { id: e.id, at: e.at, data: e }, q);
}
/** Journal d'activité de l'organisation (qui a fait quoi) : toujours enregistré, consultable avec l'avantage « équipes avancées ». */
async function act(c: Ctx, orgId: string, action: string, target = '', q: Q = db()) {
  try {
    const u = c.user;
    await q.query(`insert into activity_log (id, organizer_id, user_id, user_name, action, target) values ($1,$2,$3,$4,$5,$6)`,
      [newId('ac'), orgId, u?.id ?? null, (u?.data.name as string) ?? u?.email ?? 'Système', action, target.slice(0, 200)]);
  } catch (e) {
    console.error('[activité]', e);
  }
}
async function eventById(id: string, q: Q = db()) {
  return (await docs<EventItem>(`select data from events where id = $1 or slug = $1`, [id], q))[0] ?? null;
}
async function saveEventRow(e: EventItem, q: Q = db()) {
  await upsert('events', { id: e.id, slug: e.slug, organizer_id: e.organizerId, status: e.status, start_at: e.start, data: e }, q);
}
async function orgName(id: string) {
  return (await one<{ name: string }>(`select data->>'name' as name from organizers where id = $1`, [id]))?.name ?? id;
}

/** Billet → ligne de participant (vue organisateur). */
function toAttendee(t: IssuedTicket & { phone?: string; purchasedAt?: string; amount?: number }, ev?: EventItem): Attendee {
  return {
    id: t.id, eventId: t.eventId, name: t.holderName, email: t.holderEmail, phone: t.phone ?? '',
    ticketType: ev?.tickets.find((x) => x.id === t.ticketTypeId)?.name ?? t.ticketTypeId,
    orderId: t.orderId, checkedIn: t.status === 'used', checkedInAt: t.checkedInAt,
    purchasedAt: t.purchasedAt ?? '', amount: t.amount ?? 0, code: t.code, seat: t.seat, sessionLabel: t.sessionLabel,
  };
}

/** Places vendues par session : { "": ["A-1"], "Jour 1": [...] }. */
async function takenSeats(eventId: string, q: Q = db()) {
  const rows = await all<{ seat: string; session_label: string | null }>(
    `select seat, session_label from tickets where event_id = $1 and seat is not null and status in ('pending','valid','used','resale')`, [eventId], q);
  const out: Record<string, string[]> = {};
  for (const r of rows) (out[r.session_label ?? ''] ??= []).push(r.seat);
  return out;
}

// ---------- Authentification ----------

async function session(u: UserRow) {
  return { token: signToken(u.id), user: toAppUser(u) };
}

const signup: Handler = async (c) => {
  const name = str(c.body.name, 80);
  const email = str(c.body.email, 160).toLowerCase();
  const password = typeof c.body.password === 'string' ? c.body.password : '';
  if (!name) fail(422, 'Indiquez votre nom');
  if (!isEmail(email)) fail(422, 'Adresse email invalide');
  if (password.length < 8) fail(422, 'Mot de passe trop court');
  if (await one(`select 1 from users where email = $1`, [email])) fail(409, 'Un compte existe déjà avec cet email');

  return tx(async (q) => {
    const id = newId('u');
    let role: AppUser['role'] = 'participant';
    let teamRole: TeamRole | null = null;
    let organizerId: string | null = null;
    let invitePerms: string[] | null = null;
    // Invitation d'équipe en attente : le compte rejoint l'organisation avec son rôle
    const invite = await one<{ organizer_id: string; data: TeamMember }>(`select organizer_id, data from team_members where lower(email) = $1`, [email], q);
    if (invite) {
      role = 'organizer';
      teamRole = invite.data.role;
      organizerId = invite.organizer_id;
      invitePerms = invite.data.perms ?? null;
      await q.query(`update team_members set data = data || '{"status":"active"}'::jsonb where lower(email) = $1`, [email]);
    } else {
      // Les comptes sont réservés aux organisateurs : les participants achètent sans compte
      role = 'organizer';
      teamRole = 'admin';
      organizerId = newId('org');
      let slug = slugify(name);
      if (await one(`select 1 from organizers where slug = $1`, [slug], q)) slug = `${slug}-${organizerId.slice(-4).toLowerCase()}`;
      const o: Organizer = { id: organizerId, slug, name, verified: false, avatar: initials(name), followers: 0, eventsCount: 0, city: '' };
      await upsert('organizers', { id: o.id, slug: o.slug, data: o }, q);
      const mid = newId('m');
      await upsert('team_members', { id: mid, organizer_id: o.id, email, data: { id: mid, name, email, role: 'admin', status: 'active' } satisfies TeamMember }, q);
    }
    const data = { name, avatar: initials(name), city: '', joinedAt: new Date().toISOString().slice(0, 10) };
    await q.query(
      `insert into users (id, email, password_hash, role, team_role, organizer_id, data, team_perms) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
      [id, email, await hashPassword(password), role, teamRole, organizerId, JSON.stringify(data), invitePerms ? JSON.stringify(invitePerms) : null],
    );
    const u = (await one<UserRow>(`select * from users where id = $1`, [id], q))!;
    return session(u);
  });
};

const login: Handler = async (c) => {
  const email = str(c.body.email, 160).toLowerCase();
  const password = typeof c.body.password === 'string' ? c.body.password : '';
  const u = await one<UserRow>(`select * from users where email = $1`, [email]);
  // Même message dans tous les cas : on ne révèle pas si le compte existe
  if (!u || !(await verifyPassword(password, u.password_hash))) fail(401, 'Email ou mot de passe incorrect');
  if (u!.status === 'suspended') fail(403, 'Ce compte est suspendu. Contactez le support.');
  return session(u!);
};

const me: Handler = async (c) => toAppUser(auth(c));

const updateMe: Handler = async (c) => {
  const u = auth(c);
  const patch: Record<string, string> = {};
  for (const k of ['name', 'phone', 'city'] as const) if (typeof c.body[k] === 'string') patch[k] = str(c.body[k], 120);
  if (patch.name) patch.avatar = initials(patch.name);
  await db().query(`update users set data = data || $2::jsonb where id = $1`, [u.id, JSON.stringify(patch)]);
  return toAppUser((await one<UserRow>(`select * from users where id = $1`, [u.id]))!);
};

/** Un participant ouvre son espace organisateur : une organisation est créée à son nom. */
const becomeOrganizer: Handler = async (c) => {
  const u = auth(c);
  if (u.organizer_id) return toAppUser(u);
  return tx(async (q) => {
    const name = (u.data.name as string) || u.email;
    const id = newId('org');
    let slug = slugify(name);
    if (await one(`select 1 from organizers where slug = $1`, [slug], q)) slug = `${slug}-${id.slice(-4).toLowerCase()}`;
    const o: Organizer = { id, slug, name, verified: false, avatar: initials(name), followers: 0, eventsCount: 0, city: (u.data.city as string) ?? '' };
    await upsert('organizers', { id, slug, data: o }, q);
    const mid = newId('m');
    await upsert('team_members', { id: mid, organizer_id: id, email: u.email, data: { id: mid, name, email: u.email, role: 'admin', status: 'active' } satisfies TeamMember }, q);
    const role = u.role === 'admin' ? 'admin' : 'organizer';
    await q.query(`update users set role = $2, team_role = 'admin', organizer_id = $3 where id = $1`, [u.id, role, id]);
    return toAppUser((await one<UserRow>(`select * from users where id = $1`, [u.id], q))!);
  });
};

const changePassword: Handler = async (c) => {
  const u = auth(c);
  const next = typeof c.body.next === 'string' ? c.body.next : '';
  if (!(await verifyPassword(String(c.body.current ?? ''), u.password_hash))) fail(422, 'Mot de passe actuel incorrect');
  if (next.length < 8) fail(422, 'Mot de passe trop court');
  await db().query(`update users set password_hash = $2 where id = $1`, [u.id, await hashPassword(next)]);
  return null;
};

const deleteMe: Handler = async (c) => {
  const u = auth(c);
  if (u.role === 'admin') fail(409, 'Un administrateur ne peut pas supprimer son compte ici');
  await db().query(`delete from users where id = $1`, [u.id]);
  return null;
};

// ---------- Public ----------

const bootstrap: Handler = async (c) => {
  const u = c.user;
  const events = await docs<EventItem>(
    `select data from events where status = 'published' or organizer_id = $1 or $2 order by start_at`,
    [u?.organizer_id ?? '', u?.role === 'admin'],
  );
  const organizers = await docs<Organizer>(`select data from organizers order by data->>'name'`);
  const commissions = await all<{ organizerId: string; rate: string }>(`select organizer_id as "organizerId", rate from custom_commissions`);
  const ambassadors = await all<Pick<Ambassador, 'id' | 'name' | 'code' | 'commission'>>(
    `select id, data->>'name' as name, code, (data->>'commission')::numeric as commission from ambassadors`);
  return {
    events, organizers, ambassadors,
    fees: await feeSettings(),
    rate: USD_TO_HTG,
    rates: { ...RATES },
    site: await siteInfo(),
    customCommissions: commissions.map((x) => ({ organizerId: x.organizerId, rate: Number(x.rate), reason: '' })),
  };
};

const getEvent: Handler = async (c) => {
  const e = await eventById(c.params.id);
  const u = c.user;
  if (!e || (e.status !== 'published' && e.status !== 'ended' && u?.role !== 'admin' && u?.organizer_id !== e.organizerId)) fail(404, 'Événement introuvable');
  return { ...e, taken: await takenSeats(e!.id) };
};

const validatePromo: Handler = async (c) => {
  const p = (await docs<PromoCode>(`select data from promo_codes where upper(code) = upper($1)`, [str(c.body.code, 40)]))[0];
  const eventId = str(c.body.eventId, 60);
  if (!p || !p.active || p.used >= p.limit || new Date(p.expiresAt) < new Date()) return null;
  if (p.eventId !== 'all' && p.eventId !== eventId) return null;
  if (p.eventId === 'all') {
    // Un code « tous les événements » ne vaut que pour l'organisateur qui l'a créé
    const owner = await one<{ organizer_id: string }>(`select organizer_id from promo_codes where id = $1`, [p.id]);
    const ev = await eventById(eventId);
    if (!ev || ev.organizerId !== owner?.organizer_id) return null;
  }
  return p;
};

const reportEvent: Handler = async (c) => {
  const reasons: Report['reason'][] = ['misleading', 'scam', 'inappropriate', 'cancelled', 'other'];
  const reason = str(c.body.reason, 20) as Report['reason'];
  if (!reasons.includes(reason)) fail(422, 'Motif invalide');
  const r: Report = {
    id: newId('rp'), eventId: str(c.body.eventId, 60), reason, details: str(c.body.details, 1000),
    reporter: (c.user?.data.name as string) ?? 'Visiteur', status: 'open', createdAt: new Date().toISOString(),
  };
  if (!(await eventById(r.eventId))) fail(404, 'Événement introuvable');
  await upsert('reports', { id: r.id, event_id: r.eventId, status: r.status, created_at: r.createdAt, data: r });
  return null;
};

// ---------- Commandes ----------

const createOrder: Handler = async (c) => {
  const b = c.body as {
    eventId: string; items: { ticketTypeId: string; qty: number; seats?: string[] }[]; promoCode?: string;
    method: Order['method']; currency: Currency; buyer: { name: string; email: string; phone?: string };
    sessionLabel?: string; referral?: string; lang?: string; src?: string; marketingOptIn?: boolean;
  };
  const methods: Order['method'][] = ['card', 'moncash', 'natcash', 'kashpaw', 'paypal', 'transfer'];
  if (!methods.includes(b.method)) fail(422, 'Moyen de paiement invalide');
  if (!isDisplayCurrency(b.currency)) fail(422, 'Devise invalide');
  const buyer = { name: str(b.buyer?.name, 80), email: str(b.buyer?.email, 160).toLowerCase(), phone: str(b.buyer?.phone, 30) || undefined };
  if (!buyer.name || !isEmail(buyer.email)) fail(422, 'Nom et email de l’acheteur requis');
  if (!Array.isArray(b.items) || !b.items.length) fail(422, 'Panier vide');

  const accessKey = newAccessKey();
  const lang = b.lang === 'en' ? 'en' : 'fr';
  try {
    const result = await tx(async (q) => {
      // Verrou sur l'événement : deux achats simultanés ne peuvent pas dépasser le quota
      const row = await one<{ data: EventItem }>(`select data from events where id = $1 for update`, [b.eventId], q);
      const ev = row?.data;
      if (!ev || ev.status !== 'published') fail(404, 'Cet événement n’est pas en vente');
      const now = new Date();
      let count = 0;
      const lines = b.items.map((it) => {
        const tt = ev!.tickets.find((t) => t.id === it.ticketTypeId);
        const qty = Math.floor(num(it.qty));
        if (!tt || !(qty > 0)) fail(422, 'Billet invalide');
        if (qty > tt!.maxPerOrder) fail(422, `Maximum ${tt!.maxPerOrder} billets « ${tt!.name} » par commande`);
        if (tt!.sold + qty > tt!.quota) fail(409, `Plus assez de billets « ${tt!.name} »`);
        if (new Date(tt!.salesEnd) < now) fail(409, `La vente des billets « ${tt!.name} » est terminée`);
        const seats = ev!.seated ? (it.seats ?? []).map((s) => str(s, 10)) : undefined;
        if (ev!.seated && seats!.length !== qty * (tt!.groupSize ?? 1)) fail(422, 'Choisissez toutes vos places');
        count += qty;
        return { tt: tt!, qty, seats };
      });
      if (count > ev!.maxPerPerson) fail(422, `Maximum ${ev!.maxPerPerson} billets par personne`);

      const srcCode = b.src ? ((await one<{ code: string }>(`select code from tracking_links where code = $1 and organizer_id = $2 and (event_id is null or event_id = $3)`, [str(b.src, 20), ev!.organizerId, ev!.id], q))?.code ?? '') : '';
      // Les prix sont fixés en gourdes : toute devise autre que le dollar est un affichage, la commande est comptée en
      // gourdes (la plateforme de paiement prélève de toute façon des gourdes) et garde la devise choisie à titre indicatif
      const display = b.currency;
      const cur: Currency = display === 'USD' ? 'USD' : 'HTG';
      const c2 = (v: number) => Math.round(convert(v, ev!.currency, cur) * 100) / 100;
      const subtotal = c2(lines.reduce((a, l) => a + l.qty * l.tt.price, 0));
      let promo: PromoCode | undefined;
      let discount = 0;
      if (b.promoCode) {
        promo = (await docs<PromoCode>(`select data from promo_codes where upper(code) = upper($1) for update`, [str(b.promoCode, 40)], q))[0];
        if (!promo || !promo.active || promo.used >= promo.limit || new Date(promo.expiresAt) < now || (promo.eventId !== 'all' && promo.eventId !== ev!.id))
          fail(409, 'Ce code promo n’est plus valable');
        if (promo!.startsAt && new Date(promo!.startsAt) > now) fail(409, 'Ce code promo n’est pas encore valable');
        // Options avancées : seuls les billets visés comptent, et le minimum de billets s'apprécie sur eux
        const eligible = promo!.ticketTypeId ? lines.filter((l) => l.tt.id === promo!.ticketTypeId) : lines;
        const eligibleQty = eligible.reduce((a, l) => a + l.qty, 0);
        if (promo!.ticketTypeId && eligibleQty === 0) fail(409, 'Ce code promo ne s’applique pas aux billets choisis');
        if (promo!.minQty && eligibleQty < promo!.minQty) fail(409, `Ce code promo demande au moins ${promo!.minQty} billet(s)`);
        if (promo!.perEmailLimit) {
          const used = Number((await one<{ n: string }>(
            `select count(*) as n from orders where lower(buyer_email) = lower($1) and data->>'promoCode' = $2 and status in ('paid', 'pending', 'partially_refunded')`, [buyer.email, promo!.code], q))?.n ?? 0);
          if (used >= promo!.perEmailLimit) fail(409, 'Vous avez déjà utilisé ce code promo le nombre de fois autorisé');
        }
        await q.query(`update promo_codes set data = jsonb_set(data, '{used}', to_jsonb((data->>'used')::int + 1)) where id = $1`, [promo!.id]);
        const eligibleSubtotal = c2(eligible.reduce((a, l) => a + l.qty * l.tt.price, 0));
        discount = Math.min(eligibleSubtotal, promo!.type === 'percent' ? Math.round(eligibleSubtotal * promo!.value) / 100 : c2(promo!.value));
      }
      const paidTickets = lines.filter((l) => l.tt.price > 0).reduce((a, l) => a + l.qty, 0);
      const fb = computeFees(await feeSettings(q), subtotal - discount, paidTickets, cur, await rateFor(ev!.organizerId, q));

      const order: Order = {
        id: newId('o'), eventId: ev!.id, createdAt: now.toISOString(),
        items: lines.map((l) => ({ ticketTypeId: l.tt.id, qty: l.qty, unitPrice: l.tt.price, seats: l.seats })),
        subtotal, discount, fees: fb.fee, total: fb.total, currency: cur,
        ...(display !== cur ? { displayCurrency: display, displayTotal: roundCur(convert(fb.total, cur, display), display) } : {}),
        // Le virement attend la réception des fonds ; les autres moyens seront confirmés par la passerelle de paiement
        method: subtotal === 0 ? 'card' : b.method,
        // Virement et paiement en ligne (MonCash, NatCash, KashPaw, carte) : en attente jusqu'à la confirmation du paiement
        status: (b.method === 'transfer' && subtotal > 0) || (payConfigured() && ONLINE_METHODS.includes(b.method) && fb.total > 0) ? 'pending' : 'paid',
        buyerName: buyer.name, buyerEmail: buyer.email, buyerPhone: buyer.phone,
        promoCode: promo?.code, referral: str(b.referral, 40) || undefined, sessionLabel: str(b.sessionLabel, 80) || undefined,
        // Lien de suivi : gardé seulement s'il existe et appartient à l'organisateur de l'événement
        src: srcCode || undefined, marketingOptIn: b.marketingOptIn === true ? true : undefined,
      };
      await q.query(`insert into orders (id, event_id, user_id, buyer_email, status, created_at, data, access_key) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [order.id, order.eventId, c.user?.id ?? null, buyer.email, order.status, order.createdAt, JSON.stringify(order), accessKey]);

      const tickets: IssuedTicket[] = [];
      for (const l of lines) {
        l.tt.sold += l.qty;
        const unit = l.tt.price ? c2(l.tt.price) : 0;
        for (let i = 0; i < l.qty; i++) {
          const t: IssuedTicket & { phone?: string; purchasedAt: string; amount: number } = {
            id: newId('it'), code: newTicketCode(), eventId: ev!.id, ticketTypeId: l.tt.id, holderName: buyer.name, holderEmail: buyer.email,
            // Tant que le virement n'est pas confirmé, le billet existe (il réserve sa place) mais ne passe pas à l'entrée
            seat: l.seats?.[i], status: order.status === 'pending' ? 'pending' : 'valid', orderId: order.id, sessionLabel: order.sessionLabel,
            phone: buyer.phone, purchasedAt: order.createdAt, amount: unit,
          };
          tickets.push(t);
          await q.query(
            `insert into tickets (id, code, event_id, order_id, owner_email, seat, session_label, status, data) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [t.id, t.code, t.eventId, t.orderId, t.holderEmail, t.seat ?? null, t.sessionLabel ?? null, t.status, JSON.stringify(t)],
          );
        }
      }
      await saveEventRow(ev!, q);
      if (order.referral)
        await q.query(
          `update ambassadors set data = jsonb_set(jsonb_set(data, '{sales}', to_jsonb((data->>'sales')::numeric + $2)), '{revenue}', to_jsonb((data->>'revenue')::numeric + $3)) where code = $1`,
          [order.referral, tickets.length, subtotal],
        );
      return { order, tickets, event: ev! };
    });
    // Paiement en ligne : la plateforme renvoie l'adresse de sa page sécurisée (MonCash, NatCash, KashPaw ou carte)
    let payUrl: string | undefined;
    if (result.order.status === 'pending' && payConfigured() && ONLINE_METHODS.includes(result.order.method)) {
      try {
        const amountHtg = Math.round(convert(result.order.total, result.order.currency, 'HTG'));
        if (amountHtg < MIN_HTG) fail(422, `Le montant minimum pour un paiement en ligne est de ${MIN_HTG} HTG`);
        const p = await createPayment({ reference: result.order.id, amountHtg, method: result.order.method as OnlineMethod });
        payUrl = p.url;
        await db().query(`update orders set data = data || $2::jsonb where id = $1`, [result.order.id, JSON.stringify({ payTx: p.transactionId })]);
      } catch (e) {
        // La commande n'est pas payable : on libère les places tout de suite
        await dropOrder(result.order.id);
        if (e instanceof HttpError) throw e;
        console.error('[pay]', e);
        fail(502, 'Le paiement en ligne est momentanément indisponible. Réessayez dans un instant.');
      }
    }
    // Billets par email (pas de compte nécessaire) : un échec d'envoi n'annule jamais la commande
    const emailSent = result.order.status === 'paid'
      ? await sendTicketsEmail({ to: buyer.email, name: buyer.name, lang, event: result.event, tickets: result.tickets, orderId: result.order.id, accessKey })
      : false;
    if (result.order.status === 'paid') {
      await notifySale(result.order, result.event, result.tickets.length, accessKey);
      await emitSale(result.order, result.event, result.tickets.length);
    }
    return { order: result.order, tickets: result.tickets, accessKey, emailSent, ...(payUrl ? { payUrl } : {}) };
  } catch (e) {
    // Index unique sur les places : quelqu'un vient de prendre la même place
    if ((e as { code?: string }).code === '23505') fail(409, 'Une des places choisies vient d’être vendue. Choisissez-en une autre.');
    throw e;
  }
};


// ---------- Notifications push ----------
// Elles ne bloquent jamais l'action qui les déclenche : une erreur est seulement journalisée.

const eventPath = (e: EventItem) => `/e/${e.slug}`;
const orderPath = (orderId: string, key: string) => `/commande/${orderId}?k=${encodeURIComponent(key)}`;

async function safely(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    console.error('[push]', e);
  }
}

/** Achat : billet pour l'acheteur (si son appareil est connu), puis nouvelle vente et « presque complet » pour l'organisation. */
async function notifySale(order: Order, ev: EventItem, count: number, key: string) {
  if (!pushConfigured()) return;
  await safely(async () => {
    await notifyEmails([order.buyerEmail], { title: 'Billet reçu', body: `${count} billet(s) pour ${ev.title}`, url: orderPath(order.id, key), channel: 'tickets' });
  });
  await notifyTeamSale(ev, count);
}

/** Webhook « ticket.sold » : aucune donnée personnelle d'acheteur, seulement l'identifiant de commande et les montants. */
async function emitSale(order: Order, ev: EventItem, count: number) {
  await fireWebhooks(ev.organizerId, 'ticket.sold', {
    orderId: order.id, eventId: ev.id, eventTitle: ev.title, tickets: count, amount: order.subtotal - order.discount, currency: order.currency, createdAt: order.createdAt,
  });
}

/** Nouvelle vente et « presque complet » pour l'organisation. */
async function notifyTeamSale(ev: EventItem, count: number) {
  if (!pushConfigured()) return;
  await safely(async () => {
    const team = await organizerUserIds(ev.organizerId);
    await notifyUsers(team, { title: 'Nouvelle vente', body: `${count} billet(s) vendu(s) — ${ev.title}`, url: '/organisateur/participants', channel: 'sales' });
    const capacity = ev.tickets.reduce((s, x) => s + x.quota, 0);
    const sold = ev.tickets.reduce((s, x) => s + x.sold, 0);
    if (capacity > 0 && sold / capacity >= 0.9 && (await claimOnce(`almost-full:${ev.id}`)))
      await notifyUsers(team, { title: 'Presque complet', body: `${ev.title} : ${sold}/${capacity} billets vendus`, url: `/organisateur/evenements/${ev.id}/stats`, channel: 'sales' });
  });
}

/** Modification importante ou annulation : tous les détenteurs de billets valables sont prévenus. */
async function notifyEventChange(before: EventItem | undefined, after: EventItem) {
  if (!pushConfigured() || !before) return;
  await safely(async () => {
    if (after.status === 'cancelled' && before.status !== 'cancelled') {
      await notifyHolders(after.id, { title: 'Événement annulé', body: `${after.title} a été annulé`, url: eventPath(after), channel: 'tickets' });
    } else if (after.status === 'published' && (before.start !== after.start || JSON.stringify(before.venue) !== JSON.stringify(after.venue))) {
      await notifyHolders(after.id, { title: 'Événement modifié', body: `${after.title} : date ou lieu mis à jour`, url: eventPath(after), channel: 'tickets' });
    }
  });
}


/** Comptes administrateurs actifs (notifiés des suppressions). */
async function adminAccounts() {
  return all<{ id: string; email: string }>(`select id, email from users where role = 'admin' and status = 'active'`);
}

/**
 * Suppression de commande ou d'événement par un administrateur : l'acheteur (ou les détenteurs) et les
 * administrateurs sont prévenus par notification push et par email. Jamais bloquant.
 */
async function notifyDeletion(opts: { title: string; body: string; adminBody: string; emails: string[]; userIds: string[]; url: string }) {
  await safely(async () => {
    const msg = { url: opts.url, channel: 'tickets' as const };
    await notifyEmails(opts.emails, { ...msg, title: opts.title, body: opts.body });
    await notifyUsers(opts.userIds, { ...msg, title: opts.title, body: opts.body });
    const admins = await adminAccounts();
    await notifyUsers(admins.map((a) => a.id), { url: '/admin/transactions', channel: 'sales', title: opts.title, body: opts.adminBody });
    for (const to of [...new Set(opts.emails)].slice(0, 200)) await sendNoticeEmail(to, opts.title, opts.title, [opts.body]);
    for (const a of admins) await sendNoticeEmail(a.email, opts.title, opts.title, [opts.adminBody]);
  });
}

/** Retrouver une commande et ses billets : par le lien reçu (clé d'accès) ou, une fois connecté, par son compte. */
async function orderAccess(c: Ctx, id: string, key: string, q: Q = db()) {
  const r = await one<{ user_id: string | null; access_key: string | null; data: Order }>(`select user_id, access_key, data from orders where id = $1`, [id], q);
  const mine = !!c.user && r?.user_id === c.user.id;
  // Même réponse (introuvable) si la commande n'existe pas ou si la clé est fausse
  if (!r || !(mine || sameKey(r.access_key, key))) fail(404, 'Commande introuvable');
  return r!;
}

const getOrder: Handler = async (c) => {
  const r = await orderAccess(c, c.params.id, str(c.query.k, 60));
  const tickets = await docs<IssuedTicket>(`select data from tickets where order_id = $1 order by id`, [c.params.id]);
  return { order: r.data, tickets, event: await eventById(r.data.eventId), claimed: !!r.user_id };
};

/** Rattacher une commande passée sans compte au compte connecté : la clé du lien prouve que la commande est bien la sienne. */
const claimOrder: Handler = async (c) => {
  const u = auth(c);
  const r = await orderAccess(c, c.params.id, str(c.body.key, 60));
  if (r.user_id && r.user_id !== u.id) fail(409, 'Cette commande est déjà rattachée à un autre compte');
  await db().query(`update orders set user_id = $2 where id = $1`, [c.params.id, u.id]);
  return null;
};

// Un billet appartient à un compte seulement si sa commande y est rattachée (achat connecté, ou lien de commande réclamé).
// Une adresse email seule ne suffit jamais : elle n'est pas vérifiée à l'inscription.
const myTickets: Handler = async (c) => {
  const u = auth(c);
  return docs<IssuedTicket>(
    `select t.data from tickets t join orders o on o.id = t.order_id
     where o.user_id = $1 order by t.data->>'purchasedAt' desc nulls last`, [u.id]);
};
const myOrders: Handler = async (c) => {
  const u = auth(c);
  return docs<Order>(`select data from orders where user_id = $1 order by created_at desc`, [u.id]);
};

async function ownTicket(c: Ctx, id: string, q: Q = db()) {
  const u = auth(c);
  const t = (await docs<IssuedTicket>(
    `select t.data from tickets t join orders o on o.id = t.order_id where t.id = $1 and o.user_id = $2`,
    [id, u.id], q))[0];
  if (!t) fail(404, 'Billet introuvable');
  return t!;
}

const requestRefund: Handler = async (c) => {
  const u = auth(c);
  const o = (await docs<Order>(`select data from orders where id = $1 and user_id = $2`, [c.params.id, u.id]))[0];
  if (!o) fail(404, 'Commande introuvable');
  if (o!.status !== 'paid') fail(409, 'Cette commande ne peut pas être remboursée');
  const ev = await eventById(o!.eventId);
  const reason = str(c.body.reason, 500);
  const r: RefundRequest = {
    id: newId('r'), orderId: o!.id, buyer: o!.buyerName, eventTitle: ev?.title ?? '', amount: o!.total, currency: o!.currency,
    reason, createdAt: new Date().toISOString(), status: 'pending',
  };
  const refundRequest = { reason, at: r.createdAt, status: 'pending' as const };
  await tx(async (q) => {
    await upsert('refunds', { id: r.id, organizer_id: ev?.organizerId ?? null, order_id: o!.id, status: r.status, created_at: r.createdAt, data: r }, q);
    await q.query(`update orders set data = data || $2::jsonb where id = $1`, [o!.id, JSON.stringify({ refundRequest })]);
  });
  return refundRequest;
};

const transferTicket: Handler = async (c) => {
  const to = str(c.body.to, 160).toLowerCase();
  if (!isEmail(to)) fail(422, 'Indiquez l’adresse email du destinataire');
  const lang = c.body.lang === 'en' ? 'en' : 'fr';
  const out = await tx(async (q) => {
    const t = await ownTicket(c, c.params.id, q);
    if (t.status !== 'valid') fail(409, 'Ce billet ne peut plus être transféré');
    const ev = (await eventById(t.eventId, q))!;
    // Le destinataire reçoit une commande à lui (gratuite) avec sa propre clé d'accès et un nouveau QR code
    const key = newAccessKey();
    const order: Order = {
      id: newId('o'), eventId: t.eventId, createdAt: new Date().toISOString(),
      items: [{ ticketTypeId: t.ticketTypeId, qty: 1, unitPrice: 0, seats: t.seat ? [t.seat] : undefined }],
      subtotal: 0, discount: 0, fees: 0, total: 0, currency: ev.currency, method: 'card', status: 'paid',
      buyerName: to, buyerEmail: to, sessionLabel: t.sessionLabel,
    };
    await q.query(`insert into orders (id, event_id, user_id, buyer_email, status, created_at, data, access_key) values ($1,$2,null,$3,'paid',$4,$5,$6)`,
      [order.id, order.eventId, to, order.createdAt, JSON.stringify(order), key]);
    // L'ancien billet est désactivé et sa place libérée avant d'émettre le nouveau
    await q.query(`update tickets set status = 'transferred', seat = null, data = data || $2::jsonb where id = $1`, [t.id, JSON.stringify({ status: 'transferred', transferredTo: to })]);
    const fresh: IssuedTicket = { ...t, id: newId('it'), code: newTicketCode(), holderName: to, holderEmail: to, status: 'valid', orderId: order.id, transferredTo: undefined };
    await q.query(
      `insert into tickets (id, code, event_id, order_id, owner_email, seat, session_label, status, data) values ($1,$2,$3,$4,$5,$6,$7,'valid',$8)`,
      [fresh.id, fresh.code, fresh.eventId, fresh.orderId, to, fresh.seat ?? null, fresh.sessionLabel ?? null, JSON.stringify(fresh)],
    );
    return { ticketId: t.id, to, newCode: fresh.code, link: `/commande/${order.id}?k=${key}`, ev, fresh, order, key };
  });
  const emailSent = await sendTicketsEmail({ to, name: to, lang, event: out.ev, tickets: [out.fresh], orderId: out.order.id, accessKey: out.key });
  await safely(() => notifyEmails([to], { title: 'Billet reçu', body: `On vous a transféré un billet pour ${out.ev.title}`, url: orderPath(out.order.id, out.key), channel: 'tickets' }));
  return { ticketId: out.ticketId, to, newCode: out.newCode, link: out.link, emailSent };
};

const listResale: Handler = async (c) =>
  docs<IssuedTicket>(`select data from resale_listings where $1 = '' or event_id = $1 order by price`, [c.query.eventId ?? '']);

const createResale: Handler = async (c) => {
  const price = num(c.body.price);
  if (!(price > 0)) fail(422, 'Prix invalide');
  return tx(async (q) => {
    const t = await ownTicket(c, c.params.id, q);
    if (t.status !== 'valid') fail(409, 'Ce billet ne peut pas être revendu');
    const listing: IssuedTicket = { ...t, id: newId('rs'), status: 'resale', resalePrice: price };
    await q.query(`update tickets set status = 'resale', data = data || '{"status":"resale"}'::jsonb where id = $1`, [t.id]);
    await upsert('resale_listings', { id: listing.id, ticket_id: t.id, event_id: t.eventId, price, data: listing }, q);
    return null;
  });
};

const cancelResale: Handler = async (c) => {
  const u = auth(c);
  await tx(async (q) => {
    const l = await one<{ ticket_id: string }>(
      `select r.ticket_id from resale_listings r join tickets t on t.id = r.ticket_id join orders o on o.id = t.order_id where t.code = $1 and o.user_id = $2`, [c.params.code, u.id], q);
    if (!l) fail(404, 'Annonce introuvable');
    await q.query(`delete from resale_listings where ticket_id = $1`, [l!.ticket_id]);
    await q.query(`update tickets set status = 'valid', data = data || '{"status":"valid"}'::jsonb where id = $1`, [l!.ticket_id]);
  });
  return null;
};

const buyResale: Handler = async (c) => {
  const u = auth(c);
  const buyer = { name: str(c.body.name, 80) || (u.data.name as string), email: (str(c.body.email, 160) || u.email).toLowerCase() };
  return tx(async (q) => {
    const l = await one<{ ticket_id: string; price: string; data: IssuedTicket }>(`select ticket_id, price, data from resale_listings where id = $1 for update`, [c.params.id], q);
    if (!l) fail(410, 'Ce billet vient d’être vendu');
    const old = (await docs<IssuedTicket>(`select data from tickets where id = $1`, [l!.ticket_id], q))[0]!;
    const ev = (await eventById(old.eventId, q))!;
    const order: Order = {
      id: newId('o'), eventId: old.eventId, createdAt: new Date().toISOString(),
      items: [{ ticketTypeId: old.ticketTypeId, qty: 1, unitPrice: Number(l!.price), seats: old.seat ? [old.seat] : undefined }],
      subtotal: Number(l!.price), discount: 0, fees: 0, total: Number(l!.price), currency: ev.currency, method: 'card', status: 'paid',
      buyerName: buyer.name, buyerEmail: buyer.email, sessionLabel: old.sessionLabel,
    };
    await q.query(`insert into orders (id, event_id, user_id, buyer_email, status, created_at, data) values ($1,$2,$3,$4,'paid',$5,$6)`,
      [order.id, order.eventId, u.id, buyer.email, order.createdAt, JSON.stringify(order)]);
    await q.query(`delete from resale_listings where id = $1`, [c.params.id]);
    // L'ancien code est annulé et sa place libérée avant d'émettre le nouveau billet
    await q.query(`update tickets set status = 'transferred', seat = null, data = data || '{"status":"transferred"}'::jsonb where id = $1`, [old.id]);
    const t: IssuedTicket = { ...old, id: newId('it'), code: newTicketCode(), holderName: buyer.name, holderEmail: buyer.email, status: 'valid', resalePrice: undefined, orderId: order.id };
    await q.query(
      `insert into tickets (id, code, event_id, order_id, owner_email, seat, session_label, status, data) values ($1,$2,$3,$4,$5,$6,$7,'valid',$8)`,
      [t.id, t.code, t.eventId, t.orderId, t.holderEmail, t.seat ?? null, t.sessionLabel ?? null, JSON.stringify(t)],
    );
    return t;
  });
};

// ---------- Organisateur ----------

const orgEvents: Handler = async (c) => docs<EventItem>(`select data from events where organizer_id = $1 order by start_at desc`, [org(c, 'events')]);

const saveEvent: Handler = async (c) => {
  const orgId = org(c, 'events');
  const e = c.body as unknown as EventItem;
  if (!str(e.title) || !Array.isArray(e.tickets)) fail(422, 'Événement incomplet');
  const existing = await one<{ organizer_id: string; data: EventItem }>(`select organizer_id, data from events where id = $1`, [e.id]);
  if (existing && existing.organizer_id !== orgId && c.user!.role !== 'admin') fail(403, 'Cet événement appartient à un autre organisateur');
  const clash = await one(`select 1 from events where slug = $1 and id <> $2`, [e.slug, e.id ?? '']);
  // Jusqu'à 5 visuels (fichiers du site ou adresses https) ; le premier sert de visuel principal
  const images = (Array.isArray(e.images) ? e.images : []).filter((v): v is string => validCover(v) && !/gradient\(/.test(v)).slice(0, 5);
  const next: EventItem = {
    ...e,
    id: existing ? e.id : newId('e'),
    slug: clash || !e.slug ? `${slugify(e.title)}-${Math.random().toString(36).slice(2, 6)}` : slugify(e.slug),
    organizerId: existing?.organizer_id ?? orgId,
    cover: images.length ? images[0]! : validCover(e.cover) ? e.cover : existing?.data.cover ?? 'linear-gradient(135deg, #1F5EFF 0%, #0B1533 100%)',
    images,
    // Pays du lieu (code à 2 lettres) : les participants de ce pays voient l'événement en premier
    venue: e.venue ? { ...e.venue, country: /^[A-Z]{2}$/.test(String(e.venue.country ?? '')) ? e.venue.country : undefined } : null,
    // Les ventes et les vues sont tenues par le serveur, pas par le formulaire
    views: existing?.data.views ?? 0,
    tickets: e.tickets.map((t) => ({ ...t, sold: existing?.data.tickets.find((x) => x.id === t.id)?.sold ?? 0 })),
    featured: existing?.data.featured ?? false,
    // Le boost (payant) n'est jamais modifiable par le formulaire
    boostedUntil: existing?.data.boostedUntil,
    // Une publication par un organisateur non vérifié passe en modération
    status: e.status,
  };
  if (next.status === 'published' && c.user!.role !== 'admin' && existing?.data.status !== 'published') {
    const verified = await one<{ v: boolean }>(`select (data->>'verified')::boolean as v from organizers where id = $1`, [next.organizerId]);
    if (!verified?.v) next.status = 'pending';
  }
  await saveEventRow(next);
  await act(c, orgId, existing ? 'Événement modifié' : 'Événement créé', next.title);
  await notifyEventChange(existing?.data, next);
  return next;
};

const setEventStatus: Handler = async (c) => {
  const orgId = org(c, 'events');
  const status = str(c.body.status, 20) as EventItem['status'];
  if (!['draft', 'published', 'cancelled', 'ended', 'pending'].includes(status)) fail(422, 'Statut invalide');
  const e = await eventById(c.params.id);
  if (!e || (e.organizerId !== orgId && c.user!.role !== 'admin')) fail(404, 'Événement introuvable');
  await saveEventRow({ ...e!, status });
  await act(c, orgId, 'Statut d’événement modifié', `${e!.title} → ${status}`);
  await notifyEventChange(e!, { ...e!, status });
  return null;
};

/** Efface les commandes d'un événement avec tout ce qui s'y rattache (billets, reventes, remboursements, litiges). */
async function purgeOrders(q: Q, where: string, params: unknown[]) {
  await q.query(`delete from resale_listings where ticket_id in (select id from tickets where order_id in (select id from orders where ${where}))`, params);
  await q.query(`delete from tickets where order_id in (select id from orders where ${where})`, params);
  await q.query(`delete from refunds where order_id in (select id from orders where ${where})`, params);
  await q.query(`delete from disputes where order_id in (select id from orders where ${where})`, params);
  await q.query(`delete from orders where ${where}`, params);
}

const deleteEvent: Handler = async (c) => {
  const orgId = org(c, 'events');
  const isAdmin = c.user!.role === 'admin';
  const e = await eventById(c.params.id);
  if (!e || (e.organizerId !== orgId && !isAdmin)) fail(404, 'Événement introuvable');
  const holders = isAdmin ? { emails: await holderEmails(e!.id), users: await holderUserIds(e!.id) } : null;
  await tx(async (q) => {
    const sold = await one<{ n: string }>(`select count(*) as n from tickets where event_id = $1`, [e!.id], q);
    // Un organisateur ne peut pas effacer un événement qui a déjà des billets : il doit l'annuler (remboursements)
    if (!isAdmin && Number(sold?.n ?? 0) > 0) fail(409, 'Des billets ont été vendus : annulez l’événement plutôt que de le supprimer');
    await q.query(`delete from resale_listings where event_id = $1`, [e!.id]);
    await q.query(`delete from tickets where event_id = $1`, [e!.id]);
    await q.query(`delete from refunds where order_id in (select id from orders where event_id = $1)`, [e!.id]);
    await q.query(`delete from disputes where order_id in (select id from orders where event_id = $1)`, [e!.id]);
    await q.query(`delete from orders where event_id = $1`, [e!.id]);
    await q.query(`delete from reports where event_id = $1`, [e!.id]);
    await q.query(`delete from events where id = $1`, [e!.id]);
  });
  await act(c, orgId, 'Événement supprimé', e!.title);
  if (isAdmin) await audit(c, 'Événement supprimé', e!.title);
  if (holders && (holders.emails.length || holders.users.length))
    await notifyDeletion({
      title: 'Événement supprimé',
      body: `${e!.title} a été supprimé : vos billets ne sont plus valables.`,
      adminBody: `Événement « ${e!.title} » supprimé (${holders.emails.length} détenteur(s) prévenu(s))`,
      emails: holders.emails, userIds: holders.users, url: '/',
    });
  return null;
};

const deleteOrder: Handler = async (c) => {
  admin(c);
  const o = (await docs<Order>(`select data from orders where id = $1`, [c.params.id]))[0];
  if (!o) fail(404, 'Commande introuvable');
  const orderUser = await one<{ user_id: string | null }>(`select user_id from orders where id = $1 and user_id is not null`, [c.params.id]);
  await tx(async (q) => {
    // Les places redeviennent disponibles
    const ev = await eventById(o!.eventId, q);
    if (ev && ['paid', 'pending'].includes(o!.status)) {
      const tickets = ev.tickets.map((t) => ({ ...t, sold: Math.max(0, t.sold - o!.items.filter((i) => i.ticketTypeId === t.id).reduce((a, i) => a + i.qty, 0)) }));
      await saveEventRow({ ...ev, tickets }, q);
    }
    await purgeOrders(q, 'id = $1', [o!.id]);
  });
  await audit(c, 'Commande supprimée', o!.id);
  const ev = await eventById(o!.eventId);
  await notifyDeletion({
    title: 'Commande supprimée',
    body: `Votre commande pour ${ev?.title ?? 'un événement'} a été supprimée : vos billets ne sont plus valables.`,
    adminBody: `Commande ${o!.id} (${o!.buyerName}, ${o!.buyerEmail}) supprimée${ev ? ` — ${ev.title}` : ''}`,
    emails: [o!.buyerEmail], userIds: orderUser ? [orderUser.user_id as string] : [], url: ev ? eventPath(ev) : '/',
  });
  return null;
};

/** Adresses qu'un organisateur ne peut pas prendre : pages du site et de son espace (/organisateur/…). */
const RESERVED_SLUGS = new Set([
  'evenements', 'participants', 'checkin', 'codes-promo', 'remboursements', 'marketing', 'emails', 'ambassadeurs', 'avis', 'equipe', 'versements',
  'parametres', 'verification', 'abonnement', 'analyses', 'calendrier', 'modeles', 'activite', 'support', 'finances', 'api', 'liens', 'nouveau', 'admin', 'api', 'connexion', 'inscription', 'explorer', 'revente', 'compte', 'billets',
  'favoris', 'notifications', 'cgu', 'confidentialite', 'event509', 'support', 'aide',
]);
const socialUrl = (v: unknown) => {
  const u = str(v, 200);
  return /^https:\/\/[^\s"'<>]+$/.test(u) ? u : '';
};

const saveOrganizer: Handler = async (c) => {
  const orgId = org(c, 'settings');
  const cur = (await docs<Organizer>(`select data from organizers where id = $1`, [orgId]))[0];
  if (!cur) fail(404, 'Organisation introuvable');
  const p = c.body as Partial<Organizer>;
  // Un champ absent de la demande est conservé tel quel (ex. envoi du logo seul)
  const keep = (v: unknown, max: number, old?: string) => (v === undefined ? old : str(v, max));
  // L'état de vérification, la date de certification et les anciens liens ne viennent jamais du formulaire
  const next: Organizer = {
    ...cur!, name: str(p.name, 80) || cur!.name, bio: keep(p.bio, 1000, cur!.bio), website: keep(p.website, 200, cur!.website),
    instagram: keep(p.instagram, 60, cur!.instagram), city: keep(p.city, 60, cur!.city) || cur!.city,
    logo: p.logo === '' ? undefined : validCover(p.logo) ? p.logo : cur!.logo,
  };
  // Bannière : un dégradé est libre ; une image personnelle, la couleur de marque, les réseaux et l'adresse sont des avantages premium
  const wantsPremium = (p.cover !== undefined && validCover(p.cover) && !p.cover.includes('gradient(')) || p.brandColor !== undefined || p.socials !== undefined
    || (p.slug !== undefined && p.slug !== cur!.slug);
  if (p.cover !== undefined) {
    if (!validCover(p.cover)) fail(422, 'Image de bannière invalide');
    next.cover = p.cover;
  }
  if (wantsPremium && !(await benefitsFor(orgId)).includes('page')) fail(403, 'La page professionnelle est réservée aux organisateurs vérifiés');
  let slug = cur!.slug;
  if (p.brandColor !== undefined) {
    const col = str(p.brandColor, 7);
    if (col && !readableBrand(col)) fail(422, 'Choisissez une couleur plus foncée : le texte blanc des boutons doit rester lisible');
    next.brandColor = col || undefined;
  }
  if (p.socials !== undefined) {
    const so = (p.socials ?? {}) as NonNullable<Organizer['socials']>;
    next.socials = { facebook: socialUrl(so.facebook), tiktok: socialUrl(so.tiktok), youtube: socialUrl(so.youtube), linkedin: socialUrl(so.linkedin), x: socialUrl(so.x) };
    for (const k of Object.keys(next.socials) as (keyof typeof next.socials)[]) if (!next.socials[k]) delete next.socials[k];
  }
  if (p.slug !== undefined && p.slug !== cur!.slug) {
    const wanted = str(p.slug, 40).toLowerCase();
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(wanted) || wanted.length < 3) fail(422, 'Adresse invalide : 3 à 40 caractères, lettres minuscules, chiffres et tirets');
    if (RESERVED_SLUGS.has(wanted)) fail(422, 'Cette adresse est réservée');
    if (await one(`select 1 from organizers where id <> $2 and (slug = $1 or data->'oldSlugs' ? $1)`, [wanted, orgId])) fail(409, 'Cette adresse est déjà prise');
    next.oldSlugs = [...new Set([cur!.slug, ...(cur!.oldSlugs ?? [])])].slice(0, 5);
    next.slug = wanted;
    slug = wanted;
  }
  await upsert('organizers', { id: next.id, slug, data: { ...next, slug } });
  return { ...next, slug };
};

async function orgTickets(orgId: string, eventId?: string) {
  return docs<IssuedTicket & { phone?: string; purchasedAt?: string; amount?: number }>(
    `select t.data from tickets t join events e on e.id = t.event_id
     where e.organizer_id = $1 and ($2 = '' or t.event_id = $2) and t.status in ('valid','used','resale')
     order by t.data->>'purchasedAt' desc nulls last`, [orgId, eventId ?? '']);
}

const attendees: Handler = async (c) => {
  // Le check-in hors ligne télécharge aussi cette liste
  const u = auth(c);
  const orgId = org(c, effectivePerms(u).includes('attendees') ? 'attendees' : 'checkin');
  const evs = await docs<EventItem>(`select data from events where organizer_id = $1`, [orgId]);
  const byId = new Map(evs.map((e) => [e.id, e]));
  return (await orgTickets(orgId, c.query.eventId)).map((t) => toAttendee(t, byId.get(t.eventId)));
};

const checkin: Handler = async (c) => {
  const orgId = org(c, 'checkin');
  const code = str(c.body.code, 40);
  const eventId = str(c.body.eventId, 60);
  // Mise à jour atomique : un billet ne peut être validé qu'une seule fois, même avec deux scanners
  const done = await one<{ data: IssuedTicket }>(
    `update tickets t set status = 'used', checked_in_at = now(),
       data = t.data || jsonb_build_object('status', 'used', 'checkedInAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'checkedInBy', $4::text, 'checkedInByName', $5::text)
     from events e where e.id = t.event_id and e.organizer_id = $1 and t.code = $2 and t.status = 'valid' and ($3 = '' or t.event_id = $3)
     returning t.data`, [orgId, code, eventId, c.user!.id, ((c.user!.data.name as string) ?? c.user!.email).slice(0, 80)]);
  const ev = async (id: string) => (await eventById(id)) ?? undefined;
  if (done) {
    await act(c, orgId, 'Entrée validée', done.data.code);
    await fireWebhooks(orgId, 'ticket.checked_in', { ticketId: done.data.id, eventId: done.data.eventId, checkedInAt: done.data.checkedInAt });
    return { ok: true, attendee: toAttendee(done.data, await ev(done.data.eventId)) };
  }
  const t = (await docs<IssuedTicket>(
    `select t.data from tickets t join events e on e.id = t.event_id where e.organizer_id = $1 and t.code = $2`, [orgId, code]))[0];
  if (!t) return { ok: false, reason: 'unknown' };
  const a = toAttendee(t, await ev(t.eventId));
  if (eventId && t.eventId !== eventId) return { ok: false, reason: 'wrong_event', attendee: a };
  if (t.status === 'used') return { ok: false, reason: 'used', attendee: a };
  return { ok: false, reason: 'inactive', attendee: a };
};

/** Suivi des équipes (avantage « équipes avancées ») : entrées par agent et journal d'activité. */
const teamActivity: Handler = async (c) => {
  const orgId = org(c, 'team');
  await needTeamPerk(orgId);
  const agents = await all<{ id: string | null; name: string; scans: string; last: Date; event_id: string }>(
    `select t.data->>'checkedInBy' as id, coalesce(t.data->>'checkedInByName', 'Inconnu') as name, count(*) as scans, max(t.checked_in_at) as last, t.event_id
     from tickets t join events e on e.id = t.event_id where e.organizer_id = $1 and t.status = 'used' group by 1, 2, t.event_id order by scans desc limit 500`, [orgId]);
  const events = new Map((await docs<EventItem>(`select data from events where organizer_id = $1`, [orgId])).map((e) => [e.id, e.title]));
  const logs = await all<{ id: string; at: Date; user_id: string | null; user_name: string; action: string; target: string | null }>(
    `select id, at, user_id, user_name, action, target from activity_log where organizer_id = $1 and ($2 = '' or user_id = $2) order by at desc limit 200`, [orgId, str(c.query.user, 60)]);
  const members = await all<{ id: string; email: string; team_role: TeamRole | null; data: { name?: string } }>(`select id, email, team_role, data from users where organizer_id = $1`, [orgId]);
  return {
    members: members.map((m) => ({ id: m.id, name: m.data.name ?? m.email, role: m.team_role })),
    agents: agents.map((a) => ({ id: a.id, name: a.name, scans: Number(a.scans), last: a.last?.toISOString() ?? null, eventId: a.event_id, event: events.get(a.event_id) ?? '' })),
    logs: logs.map((l) => ({ id: l.id, at: l.at.toISOString(), userId: l.user_id, user: l.user_name, action: l.action, target: l.target ?? '' })),
  };
};

/** Recherche d'un billet à l'entrée, sans rien modifier : l'organisateur vérifie qui entre, puis valide. */
const checkinLookup: Handler = async (c) => {
  const orgId = org(c, 'checkin');
  const code = str(c.body.code, 40).toUpperCase();
  const eventId = str(c.body.eventId, 60);
  const t = (await docs<IssuedTicket>(
    `select t.data from tickets t join events e on e.id = t.event_id where e.organizer_id = $1 and t.code = $2`, [orgId, code]))[0];
  if (!t) return { ok: false, reason: 'unknown' };
  const a = toAttendee(t, (await eventById(t.eventId)) ?? undefined);
  if (eventId && t.eventId !== eventId) return { ok: false, reason: 'wrong_event', attendee: a };
  if (t.status === 'used') return { ok: false, reason: 'used', attendee: a };
  if (t.status !== 'valid') return { ok: false, reason: 'inactive', attendee: a };
  return { ok: true, attendee: a };
};

const eventStats: Handler = async (c) => {
  const orgId = org(c, 'dashboard');
  const e = await eventById(c.params.id);
  if (!e || (e.organizerId !== orgId && c.user!.role !== 'admin')) fail(404, 'Événement introuvable');
  const tickets = await orgTickets(e!.organizerId, e!.id);
  const orders = await docs<Order>(`select data from orders where event_id = $1 and status = 'paid'`, [e!.id]);
  const daily = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    const day = d.toISOString().slice(0, 10);
    return { date: day, tickets: orders.filter((o) => o.createdAt.slice(0, 10) === day).reduce((a, o) => a + o.items.reduce((x, it) => x + it.qty, 0), 0) };
  });
  const viaAmb = orders.filter((o) => o.referral).length;
  const total = orders.length || 1;
  return {
    event: e,
    byType: e!.tickets.map((t) => ({ id: t.id, name: t.name, sold: t.sold, quota: t.quota, revenue: t.sold * t.price })),
    daily,
    sources: [
      { label: 'Ambassadeurs', share: viaAmb / total },
      { label: 'Direct', share: (total - viaAmb) / total },
    ].filter((s) => s.share > 0),
    checkins: { done: tickets.filter((t) => t.status === 'used').length, total: tickets.length },
    views: e!.views,
  };
};

/** Ventes des 7 derniers jours et dernières commandes (tableau de bord organisateur). */
const orgSales: Handler = async (c) => {
  const orgId = org(c, 'dashboard');
  const orders = await docs<Order>(
    `select o.data from orders o join events e on e.id = o.event_id
     where e.organizer_id = $1 and o.status = 'paid' and o.created_at > now() - interval '8 days' order by o.created_at desc`, [orgId]);
  const evs = new Map((await docs<EventItem>(`select data from events where organizer_id = $1`, [orgId])).map((e) => [e.id, e]));
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const day = d.toISOString().slice(0, 10);
    const inDay = orders.filter((o) => o.createdAt.slice(0, 10) === day);
    return {
      date: day,
      tickets: inDay.reduce((a, o) => a + o.items.reduce((x, it) => x + it.qty, 0), 0),
      revenue: Math.round(inDay.reduce((a, o) => a + (o.currency === 'USD' ? (o.subtotal - o.discount) * USD_TO_HTG : o.subtotal - o.discount), 0)),
    };
  });
  const recent = orders.slice(0, 8).map((o) => ({
    id: o.id,
    who: o.buyerName.replace(/^(\S+)\s+(\S).*$/, '$1 $2.'),
    type: evs.get(o.eventId)?.tickets.find((t) => t.id === o.items[0]?.ticketTypeId)?.name ?? '',
    qty: o.items.reduce((a, it) => a + it.qty, 0),
    amount: Math.round(o.currency === 'USD' ? o.total * USD_TO_HTG : o.total),
  }));
  return { week, recent };
};

// ---------- Fichiers et vérification de l'organisateur ----------

const MAX_FILES_PER_ORG = 300;

/**
 * Met à jour la liste des documents de la demande de vérification. La demande reste un brouillon tant que l'organisateur
 * ne l'a pas soumise (POST /org/premium/apply) : envoyer un document ne l'envoie jamais à l'administration.
 */
async function syncVerification(orgId: string, owner: UserRow, q: Q) {
  const files = await all<{ id: string; doc_type: string; name: string; created_at: Date }>(
    `select id, doc_type, name, created_at from files where organizer_id = $1 and kind = 'verification' order by created_at`, [orgId], q);
  const o = (await docs<Organizer>(`select data from organizers where id = $1`, [orgId], q))[0];
  await patchRequest(
    orgId,
    { docs: files.map((f) => ({ type: f.doc_type as VerificationRequest['docs'][number]['type'], file: f.name, fileId: f.id, uploadedAt: new Date(f.created_at).toISOString() })) },
    { name: o?.name ?? orgId, owner: (owner.data.name as string) ?? owner.email, email: owner.email, city: o?.city ?? '' },
    q,
  );
}

const uploadFile: Handler = async (c) => {
  const kind = str(c.body.kind, 20) as FileKind;
  if (!['event_cover', 'org_logo', 'verification'].includes(kind)) fail(422, 'Type de fichier invalide');
  const orgId = org(c, kind === 'event_cover' ? 'events' : 'settings');
  const docType = str(c.body.docType, 20);
  if (kind === 'verification' && !(DOC_TYPES as readonly string[]).includes(docType)) fail(422, 'Type de document invalide');
  const b64 = typeof c.body.data === 'string' ? c.body.data : '';
  if (!b64 || b64.length > 4.4 * 1024 * 1024) fail(413, 'Fichier trop lourd');
  const data = Buffer.from(b64, 'base64');
  const checked = checkFile(kind, data);
  if ('error' in checked) fail(422, checked.error);
  const mime = (checked as { mime: string }).mime;
  if (kind !== 'verification') {
    const n = Number((await one<{ n: string }>(`select count(*) as n from files where organizer_id = $1 and kind <> 'verification'`, [orgId]))?.n ?? 0);
    if (n >= MAX_FILES_PER_ORG) fail(429, 'Limite de fichiers atteinte pour cette organisation');
  }
  const id = newId('f');
  const u = c.user!;
  await tx(async (q) => {
    await q.query(
      `insert into files (id, organizer_id, user_id, kind, doc_type, visibility, mime, name, size, data) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, orgId, u.id, kind, kind === 'verification' ? docType : null, kind === 'verification' ? 'private' : 'public', mime, safeName(c.body.name), data.length, data]);
    if (kind === 'verification') {
      // Un seul document par type : le nouveau remplace l'ancien
      await q.query(`delete from files where organizer_id = $1 and kind = 'verification' and doc_type = $2 and id <> $3`, [orgId, docType, id]);
      await syncVerification(orgId, u, q);
    }
  });
  return { id, url: `/api/files/${id}`, mime, size: data.length };
};

const readFile: Handler = async (c) => {
  const f = await one<{ organizer_id: string; visibility: string; mime: string; name: string; data: Buffer; kind: string }>(
    `select organizer_id, visibility, mime, name, data, kind from files where id = $1`, [c.params.id]);
  if (!f) fail(404, 'Fichier introuvable');
  if (f!.visibility === 'public') return new Binary(f!.mime, f!.data, 'public, max-age=31536000, immutable', f!.name);
  // Document privé : l'administration, ou l'équipe de l'organisation qui l'a envoyé. Même réponse si le fichier n'existe pas.
  const u = auth(c);
  const allowed = u.role === 'admin' || (u.organizer_id === f!.organizer_id && effectivePerms(u).includes('settings'));
  if (!allowed) fail(404, 'Fichier introuvable');
  // Chaque consultation d'un document d'identité par l'administration est enregistrée (date, heure, administrateur)
  if (u.role === 'admin' && f!.kind === 'verification')
    await db().query(`insert into document_access_log (id, file_id, organizer_id, admin_id, admin_name) values ($1,$2,$3,$4,$5)`,
      [newId('da'), c.params.id, f!.organizer_id, u.id, (u.data.name as string) ?? u.email]);
  return new Binary(f!.mime, f!.data, 'private, no-store', f!.name);
};

const orgVerification: Handler = async (c) => {
  const orgId = org(c, 'settings');
  const o = (await docs<Organizer>(`select data from organizers where id = $1`, [orgId]))[0];
  const files = await all<{ doc_type: string; name: string; created_at: Date }>(
    `select doc_type, name, created_at from files where organizer_id = $1 and kind = 'verification'`, [orgId]);
  const r = await one<{ status: VerificationRequest['status']; data: VerificationRequest }>(`select status, data from verification_requests where organizer_id = $1 limit 1`, [orgId]);
  return {
    verified: !!o?.verified,
    status: r?.status ?? 'none',
    note: r?.data.note ?? null,
    docs: files.map((f) => ({ type: f.doc_type, name: f.name, uploadedAt: new Date(f.created_at).toISOString() })),
  };
};

// Promos, équipe, campagnes, ambassadeurs : listes simples rattachées à l'organisation
const listPromos: Handler = async (c) => docs<PromoCode>(`select data from promo_codes where organizer_id = $1 order by data->>'expiresAt' desc`, [org(c, 'promos')]);
const savePromo: Handler = async (c) => {
  const orgId = org(c, 'promos');
  const p = c.body as unknown as PromoCode;
  const code = str(p.code, 30).toUpperCase();
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) fail(422, 'Code invalide');
  // Options avancées (avantage « outils marketing ») : nettoyées, et refusées sans l'avantage
  const adv = {
    minQty: Number(p.minQty) >= 2 ? Math.min(100, Math.floor(Number(p.minQty))) : undefined,
    perEmailLimit: Number(p.perEmailLimit) >= 1 ? Math.min(100, Math.floor(Number(p.perEmailLimit))) : undefined,
    startsAt: typeof p.startsAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(p.startsAt) ? p.startsAt.slice(0, 16) : undefined,
    ticketTypeId: typeof p.ticketTypeId === 'string' && p.ticketTypeId ? str(p.ticketTypeId, 40) : undefined,
  };
  const before = (await docs<PromoCode>(`select data from promo_codes where id = $1`, [p.id]))[0];
  const changed = (k: keyof typeof adv) => adv[k] !== before?.[k];
  if ((Object.keys(adv) as (keyof typeof adv)[]).some((k) => adv[k] !== undefined && changed(k)) && !(await benefitsFor(orgId)).includes('marketing'))
    fail(403, 'Les codes promo avancés sont réservés aux organisateurs vérifiés');
  const clash = await one<{ id: string; organizer_id: string }>(`select id, organizer_id from promo_codes where upper(code) = $1`, [code]);
  if (clash && clash.id !== p.id) fail(409, 'Ce code existe déjà');
  const own = await one<{ organizer_id: string }>(`select organizer_id from promo_codes where id = $1`, [p.id]);
  if (own && own.organizer_id !== orgId) fail(403, 'Code d’un autre organisateur');
  await upsert('promo_codes', { id: p.id || newId('pc'), organizer_id: orgId, code, data: { ...p, code, ...adv } });
  return null;
};

/** Liste de permissions personnalisées reçue : seules les permissions connues, et jamais « équipe ». */
const cleanPerms = (v: unknown): string[] | null =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && (MEMBER_PERMS as readonly string[]).includes(x)))] : null;
const needTeamPerk = async (orgId: string) => {
  if (!(await benefitsFor(orgId)).includes('team')) fail(403, 'Les rôles avancés et les permissions personnalisées sont réservés aux organisateurs vérifiés');
};

const listTeam: Handler = async (c) => docs<TeamMember>(`select data from team_members where organizer_id = $1`, [org(c, 'team')]);
const inviteMember: Handler = async (c) => {
  const orgId = org(c, 'team');
  const email = str(c.body.email, 160).toLowerCase();
  const role = str(c.body.role, 20) as TeamRole;
  if (!isEmail(email) || !teamPerms[role]) fail(422, 'Invitation invalide');
  const perms = c.body.perms === undefined ? null : cleanPerms(c.body.perms);
  if (role === 'manager' || role === 'lead' || perms) await needTeamPerk(orgId);
  if (await one(`select 1 from team_members where organizer_id = $1 and lower(email) = $2`, [orgId, email])) fail(409, 'Déjà membre');
  const existing = await one<UserRow>(`select * from users where email = $1`, [email]);
  const m: TeamMember = { id: newId('m'), name: str(c.body.name, 80) || email, email, role, status: existing ? 'active' : 'invited', ...(perms ? { perms } : {}) };
  await upsert('team_members', { id: m.id, organizer_id: orgId, email, data: m });
  // Un compte existant rejoint l'équipe tout de suite
  if (existing && existing.role === 'participant')
    await db().query(`update users set role = 'organizer', team_role = $2, organizer_id = $3, team_perms = $4::jsonb where id = $1`, [existing.id, role, orgId, perms ? JSON.stringify(perms) : null]);
  await act(c, orgId, 'Membre invité', `${email} (${role})`);
  return m;
};
const updateMember: Handler = async (c) => {
  const orgId = org(c, 'team');
  const role = c.body.role as TeamRole | undefined;
  const m = await one<{ email: string; data: TeamMember }>(`select email, data from team_members where id = $1 and organizer_id = $2`, [c.params.id, orgId]);
  if (!m) fail(404, 'Membre introuvable');
  const hasPerms = c.body.perms !== undefined;
  const perms = c.body.perms === null ? null : cleanPerms(c.body.perms);
  // Garder un rôle avancé ou personnaliser les permissions demande l'avantage ; revenir aux rôles de base reste toujours possible
  if ((role === 'manager' || role === 'lead') && role !== m!.data.role) await needTeamPerk(orgId);
  if (hasPerms && perms) await needTeamPerk(orgId);
  if (role && teamPerms[role]) {
    await db().query(`update team_members set data = data || $2::jsonb where id = $1`, [c.params.id, JSON.stringify({ role })]);
    await db().query(`update users set team_role = $2 where email = $1 and organizer_id = $3 and role = 'organizer'`, [m!.email, role, orgId]);
    await act(c, orgId, 'Rôle modifié', `${m!.email} → ${role}`);
  }
  if (hasPerms) {
    // Liste vide ou null : retour aux permissions du rôle
    const value = perms && perms.length ? perms : null;
    await db().query(`update team_members set data = case when $2::jsonb is null then data - 'perms' else data || jsonb_build_object('perms', $2::jsonb) end where id = $1`, [c.params.id, value ? JSON.stringify(value) : null]);
    await db().query(`update users set team_perms = $2::jsonb where email = $1 and organizer_id = $3 and role = 'organizer'`, [m!.email, value ? JSON.stringify(value) : null, orgId]);
    await act(c, orgId, 'Permissions modifiées', `${m!.email}: ${value ? value.join(', ') : 'celles du rôle'}`);
  }
  return null;
};
const removeMember: Handler = async (c) => {
  const orgId = org(c, 'team');
  const m = await one<{ email: string }>(`select email from team_members where id = $1 and organizer_id = $2`, [c.params.id, orgId]);
  if (!m) return null;
  if (m.email === c.user!.email) fail(409, 'Vous ne pouvez pas vous retirer vous-même');
  await db().query(`delete from team_members where id = $1`, [c.params.id]);
  await db().query(`update users set role = 'participant', team_role = null, team_perms = null, organizer_id = null where email = $1 and organizer_id = $2 and role = 'organizer'`, [m.email, orgId]);
  await act(c, orgId, 'Membre retiré', m.email);
  return null;
};

const listRefunds: Handler = async (c) => docs<RefundRequest>(`select data from refunds where organizer_id = $1 order by created_at desc`, [org(c, 'refunds')]);
const decideRefund: Handler = async (c) => {
  const orgId = org(c, 'refunds');
  const status = str(c.body.status, 20) as RefundRequest['status'];
  if (status !== 'approved' && status !== 'declined') fail(422, 'Décision invalide');
  await tx(async (q) => {
    const r = await one<{ order_id: string; data: RefundRequest }>(`select order_id, data from refunds where id = $1 and organizer_id = $2 for update`, [c.params.id, orgId], q);
    if (!r) fail(404, 'Demande introuvable');
    if (r!.data.status !== 'pending') fail(409, 'Demande déjà traitée');
    await q.query(`update refunds set status = $2, data = data || $3::jsonb where id = $1`, [c.params.id, status, JSON.stringify({ status })]);
    const order = { status: status === 'approved' ? 'refunded' : 'paid' };
    await q.query(`update orders set status = $2, data = jsonb_set(data || $3::jsonb, '{refundRequest,status}', to_jsonb($4::text)) where id = $1`,
      [r!.order_id, order.status, JSON.stringify(order), status]);
    // Billets remboursés : leurs codes ne passent plus au contrôle et les places sont libérées
    if (status === 'approved')
      await q.query(`update tickets set status = 'refunded', seat = null, data = data || '{"status":"refunded"}'::jsonb where order_id = $1 and status in ('valid','resale')`, [r!.order_id]);
  });
  await act(c, orgId, status === 'approved' ? 'Remboursement accepté' : 'Remboursement refusé', c.params.id);
  return null;
};

async function balanceOf(orgId: string) {
  const evs = await docs<EventItem>(`select data from events where organizer_id = $1`, [orgId]);
  const fees = await feeSettings();
  const rate = (await rateFor(orgId)) ?? fees.percent;
  const refunds = await docs<RefundRequest>(`select data from refunds where organizer_id = $1 and status = 'approved'`, [orgId]);
  const payouts = await docs<Payout>(`select data from payouts where organizer_id = $1`, [orgId]);
  const by = (cur: Currency) => {
    const gross = evs.filter((e) => e.currency === cur).reduce((a, e) => a + e.tickets.reduce((x, t) => x + t.sold * t.price, 0), 0);
    const refunded = refunds.filter((r) => r.currency === cur).reduce((a, r) => a + r.amount, 0);
    const paid = payouts.filter((p) => p.currency === cur && !['scheduled', 'rejected'].includes(p.status)).reduce((a, p) => a + p.amount, 0);
    // Part de la commission déduite de l'organisateur (l'autre part est payée en plus par l'acheteur)
    const f = Math.round(gross * (rate / 100) * ((100 - fees.buyerShare) / 100) * 100) / 100;
    return { gross, fees: f, rate, refunded, paid, balance: Math.max(0, gross - f - refunded - paid) };
  };
  return { HTG: by('HTG'), USD: by('USD'), buyerShare: fees.buyerShare };
}

const listPayouts: Handler = async (c) => docs<Payout>(`select data from payouts where organizer_id = $1 order by created_at desc`, [org(c, 'payouts')]);
const balance: Handler = async (c) => balanceOf(org(c, 'payouts'));
/** Destination d'un versement : MonCash et NatCash = numéro + nom complet ; PayPal = email PayPal. */
function checkDestination(method: Payout['method'], raw: unknown): Payout['destination'] {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (method === 'paypal') {
    const email = str(d.email, 160).toLowerCase();
    if (!isEmail(email)) fail(422, 'Indiquez votre adresse email PayPal');
    return { email };
  }
  const name = str(d.name, 80).replace(/\s+/g, ' ');
  const phone = str(d.phone, 30);
  if (name.split(' ').filter((w) => w.length >= 2).length < 2) fail(422, 'Indiquez le nom complet du titulaire du compte (prénom et nom)');
  if (phone.replace(/\D/g, '').length < 8 || !/^[+\d][\d\s().-]*$/.test(phone)) fail(422, `Indiquez le numéro ${method === 'moncash' ? 'MonCash' : 'NatCash'}`);
  return { name, phone };
}

const requestPayout: Handler = async (c) => {
  const orgId = org(c, 'payouts');
  const amount = num(c.body.amount);
  const currency = c.body.currency as Currency;
  const method = c.body.method as Payout['method'];
  if (!['moncash', 'natcash', 'paypal'].includes(method) || (currency !== 'HTG' && currency !== 'USD')) fail(422, 'Demande invalide');
  const destination = checkDestination(method, c.body.destination);
  const bal = (await balanceOf(orgId))[currency];
  if (!(amount > 0) || amount > bal.balance) fail(422, 'Le montant dépasse le solde disponible');
  // « Prioritaire » : traitée en premier par l'administration (avantage « finance »), mais toujours validée par elle
  const priority = c.body.priority === true;
  if (priority && !(await benefitsFor(orgId)).includes('finance')) fail(403, 'Les retraits prioritaires sont réservés aux organisateurs vérifiés');
  const p: Payout = { id: newId('py'), organizerId: orgId, amount, currency, method, destination, status: 'requested', date: new Date().toISOString().slice(0, 10), reference: `VRS-${Date.now().toString(36).toUpperCase()}`, ...(priority ? { priority: true } : {}) };
  await upsert('payouts', { id: p.id, organizer_id: orgId, status: p.status, created_at: new Date().toISOString(), data: p });
  return p;
};

const listCampaigns: Handler = async (c) => docs<Campaign>(`select data from campaigns where organizer_id = $1 order by data->>'date' desc`, [org(c, 'marketing')]);
const saveCampaign: Handler = async (c) => {
  const orgId = org(c, 'marketing');
  const k = c.body as unknown as Campaign;
  const own = await one<{ organizer_id: string }>(`select organizer_id from campaigns where id = $1`, [k.id]);
  if (own && own.organizer_id !== orgId) fail(403, 'Campagne d’un autre organisateur');
  const next = { ...k, id: k.id || newId('cp') };
  await upsert('campaigns', { id: next.id, organizer_id: orgId, data: next });
  return next;
};

const listAmbassadors: Handler = async (c) => docs<Ambassador>(`select data from ambassadors where organizer_id = $1`, [org(c, 'marketing')]);
const saveAmbassador: Handler = async (c) => {
  const orgId = org(c, 'marketing');
  const a = c.body as unknown as Ambassador;
  const code = str(a.code, 30).toUpperCase();
  const clash = await one<{ id: string }>(`select id from ambassadors where code = $1`, [code]);
  if (clash && clash.id !== a.id) fail(409, 'Code déjà utilisé');
  const own = await one<{ organizer_id: string }>(`select organizer_id from ambassadors where id = $1`, [a.id]);
  if (own && own.organizer_id !== orgId) fail(403, 'Ambassadeur d’un autre organisateur');
  await upsert('ambassadors', { id: a.id || newId('am'), organizer_id: orgId, code, data: { ...a, code } });
  return null;
};

// ---------- Administration ----------


/** Valeurs insérées dans les documents légaux (adresse, email, délais…), réglées par l'administrateur. */
const SITE_FIELDS = ['address', 'email', 'sendChannel', 'resalePercent', 'payments', 'retention', 'replyDays', 'refundDelay', 'postponeDays', 'organizerRefundDays', 'errorHours', 'supportDays'] as const;
async function siteInfo(q: Q = db()): Promise<Record<string, string>> {
  const r = await one<{ value: Record<string, string> }>(`select value from settings where key = 'site'`, [], q);
  return Object.fromEntries(Object.entries(r?.value ?? {}).filter(([k, v]) => (SITE_FIELDS as readonly string[]).includes(k) && typeof v === 'string'));
}
const LEGAL_DOCS = ['terms', 'privacy', 'refund'];

/** Textes juridiques modifiés par l'administrateur (public). Ce qui n'a pas été modifié garde le texte d'origine du site. */
/** Pays et ville de la connexion (fournis par l'hébergeur), pour proposer d'abord les événements proches. Rien n'est enregistré. */
const getGeo: Handler = async (c) => ({
  country: /^[A-Z]{2}$/.test(c.geo?.country ?? '') ? c.geo!.country! : null,
  city: c.geo?.city ?? null,
});

const getLegal: Handler = async () => {
  const r = await one<{ value: Record<string, Record<string, string>> }>(`select value from settings where key = 'legal'`);
  return r?.value ?? {};
};

/** Modifie (ou rétablit, avec text = null) un document légal dans une langue. Réservé à l'administrateur. */
const saveLegal: Handler = async (c) => {
  admin(c);
  const doc = str(c.body.doc, 20);
  const lang = str(c.body.lang, 4);
  if (!LEGAL_DOCS.includes(doc) || (lang !== 'fr' && lang !== 'en')) fail(422, 'Document ou langue invalide');
  const cur = (await one<{ value: Record<string, Record<string, string>> }>(`select value from settings where key = 'legal'`))?.value ?? {};
  const next = { ...cur, [doc]: { ...(cur[doc] ?? {}) } };
  if (c.body.text === null) delete next[doc]![lang];
  else {
    const text = typeof c.body.text === 'string' ? c.body.text.replace(/\r\n/g, '\n').trim() : '';
    if (text.length < 20 || text.length > 60_000) fail(422, 'Le texte doit faire entre 20 et 60 000 caractères');
    next[doc]![lang] = text;
  }
  if (!Object.keys(next[doc]!).length) delete next[doc];
  await upsert('settings', { key: 'legal', value: next });
  await audit(c, c.body.text === null ? 'Texte légal rétabli' : 'Texte légal modifié', `${doc} (${lang})`);
  return next;
};

/** Valeurs insérées dans les documents légaux. Réservé à l'administrateur. */
const saveSite: Handler = async (c) => {
  admin(c);
  const next: Record<string, string> = {};
  for (const k of SITE_FIELDS) {
    const v = c.body[k];
    if (v === undefined) continue;
    const s = typeof v === 'string' ? v.trim() : '';
    if (typeof v !== 'string' || s.length > 160) fail(422, 'Valeur invalide');
    if (k === 'email' && s && !isEmail(s)) fail(422, 'Adresse email invalide');
    next[k] = s;
  }
  const merged = { ...(await siteInfo()), ...next };
  await upsert('settings', { key: 'site', value: merged });
  await audit(c, 'Réglages des documents légaux modifiés', Object.keys(next).join(', '));
  return merged;
};

/**
 * Taux de change du site : combien de gourdes valent 1 unité de chaque devise (dollar, euro, livre…). Les prix restent
 * fixés en gourdes. Réservé à l'administrateur.
 */
const saveRate: Handler = async (c) => {
  admin(c);
  const given = (typeof c.body.rates === 'object' && c.body.rates ? c.body.rates : {}) as Record<string, unknown>;
  // Ancienne forme : { rate } = gourdes pour 1 dollar
  if (c.body.rate !== undefined) given.USD = c.body.rate;
  const next: Record<string, number> = {};
  for (const [code, raw] of Object.entries(given)) {
    if (code === 'HTG') continue;
    if (!isDisplayCurrency(code)) fail(422, `Devise inconnue : ${code}`);
    const v = Math.round(num(raw) * 10000) / 10000;
    if (!Number.isFinite(v) || v < 0.001 || v > 100000) fail(422, `Taux invalide pour ${code} : indiquez le nombre de gourdes pour 1 ${code}`);
    next[code] = v;
  }
  if (!Object.keys(next).length) fail(422, 'Aucun taux à enregistrer');
  const rates = { ...RATES, ...next };
  await upsert('settings', { key: 'rate', value: { usdToHtg: rates.USD, rates } });
  setRates(rates);
  rateLoadedAt = Date.now();
  await audit(c, 'Taux de change modifiés', Object.entries(next).map(([k, v]) => `1 ${k} = ${v} HTG`).join(', '));
  return { rates: { ...RATES } };
};

const saveFees: Handler = async (c) => {
  admin(c);
  const b = c.body as Partial<FeeSettings>;
  const next: FeeSettings = {
    percent: Math.min(50, Math.max(0, num(b.percent))), fixedHTG: Math.max(0, num(b.fixedHTG)),
    buyerShare: Math.min(100, Math.max(0, b.buyerShare === undefined ? 50 : num(b.buyerShare))), freeNoFee: b.freeNoFee !== false,
  };
  if (!Number.isFinite(next.percent) || !Number.isFinite(next.fixedHTG) || !Number.isFinite(next.buyerShare)) fail(422, 'Valeurs invalides');
  await upsert('settings', { key: 'fees', value: next });
  await audit(c, 'Commission par défaut modifiée', `${next.percent} % + ${next.fixedHTG} HTG, ${next.buyerShare} % payés par l’acheteur`);
  return next;
};
const listCommissions: Handler = async (c) => {
  admin(c);
  return (await all<{ organizerId: string; rate: string; reason: string }>(`select organizer_id as "organizerId", rate, reason from custom_commissions`))
    .map((x) => ({ ...x, rate: Number(x.rate) }));
};
const saveCommission: Handler = async (c) => {
  admin(c);
  const organizerId = str(c.body.organizerId, 60);
  const rate = num(c.body.rate);
  if (!(rate >= 0 && rate <= 50)) fail(422, 'Taux invalide');
  await upsert('custom_commissions', { organizer_id: organizerId, rate, reason: str(c.body.reason, 300) });
  await audit(c, 'Taux personnalisé enregistré', `${await orgName(organizerId)} — ${rate} %`);
  return null;
};
const removeCommission: Handler = async (c) => {
  admin(c);
  await db().query(`delete from custom_commissions where organizer_id = $1`, [c.params.id]);
  await audit(c, 'Taux personnalisé supprimé', await orgName(c.params.id));
  return null;
};
const listAudit: Handler = async (c) => {
  admin(c);
  return docs<AuditEntry>(`select data from audit_log order by at desc limit 500`);
};

const toHTG = (amount: number, cur: Currency) => (cur === 'USD' ? amount * USD_TO_HTG : amount);

const platformStats: Handler = async (c) => {
  admin(c);
  const now = new Date();
  const orders = await docs<Order>(`select data from orders order by created_at desc`);
  const evs = await docs<EventItem>(`select data from events`);
  const evById = new Map(evs.map((e) => [e.id, e]));
  const users = await all<{ created_at: Date }>(`select created_at from users`);
  const paid = orders.filter((o) => o.status === 'paid');
  const refunded = orders.filter((o) => o.status === 'refunded' || o.status === 'partially_refunded');
  const qty = (o: Order) => o.items.reduce((a, i) => a + i.qty, 0);
  const monthKey = (iso: string) => iso.slice(0, 7);
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
  const count = async (sql: string) => Number((await one<{ n: string }>(sql))?.n ?? 0);
  const openDisputes = await count(`select count(*) as n from disputes where status <> 'resolved'`);
  const share = (keyOf: (o: Order) => string) => {
    const m = new Map<string, number>();
    for (const o of paid) m.set(keyOf(o), (m.get(keyOf(o)) ?? 0) + toHTG(o.subtotal, o.currency));
    const total = [...m.values()].reduce((a, b) => a + b, 0) || 1;
    return [...m.entries()].map(([label, v]) => ({ label, share: v / total })).sort((a, b) => b.share - a.share);
  };
  const verifiedOrganizers = await count(`select count(*) as n from organizers where (data->>'verified')::boolean`);
  const metrics = { gmv, tickets: ticketsWeek, organizers: verifiedOrganizers, users: users.length };
  const health = refundRate > 0.08 || openDisputes > 5 ? 'critical' : refundRate > 0.05 || openDisputes > 2 ? 'watch' : 'healthy';
  const targets = await docs<PlatformTarget>(`select data from platform_targets order by data->>'deadline'`);
  return {
    gmv, fees, refundTotal, refundRate, ticketsWeek, health,
    feesThisMonth: monthly[5]!.fees,
    users: users.length,
    newUsersMonth: users.filter((u) => new Date(u.created_at).toISOString().slice(0, 7) === months[5]).length,
    activeEvents: evs.filter((e) => e.status === 'published' && new Date(e.end) >= now).length,
    pendingEvents: evs.filter((e) => e.status === 'pending').length,
    openDisputes,
    openReports: await count(`select count(*) as n from reports where status = 'open'`),
    pendingVerifications: await count(`select count(*) as n from verification_requests where status = 'pending'`),
    pendingPayouts: await count(`select count(*) as n from payouts where status = 'requested'`),
    monthly,
    byCity: share((o) => evById.get(o.eventId)?.venue?.city ?? 'En ligne'),
    byMethod: share((o) => o.method),
    metrics,
    targets: targets.map((tg) => ({ ...tg, current: metrics[tg.metric] })),
    recent: orders.slice(0, 12),
  };
};

const saveTarget: Handler = async (c) => {
  admin(c);
  const tg = c.body as unknown as PlatformTarget;
  if (!str(tg.title) || !['gmv', 'tickets', 'organizers', 'users'].includes(tg.metric)) fail(422, 'Objectif invalide');
  const exists = await one(`select 1 from platform_targets where id = $1`, [tg.id]);
  const next = { ...tg, id: tg.id || newId('tg') };
  await upsert('platform_targets', { id: next.id, data: next });
  await audit(c, exists ? 'Objectif modifié' : 'Objectif créé', next.title);
  return null;
};
const removeTarget: Handler = async (c) => {
  admin(c);
  const r = await one<{ title: string }>(`delete from platform_targets where id = $1 returning data->>'title' as title`, [c.params.id]);
  if (r) await audit(c, 'Objectif supprimé', r.title);
  return null;
};

const adminOrders: Handler = async (c) => {
  admin(c);
  const q = (c.query.q ?? '').toLowerCase().trim();
  return docs<Order>(
    `select o.data from orders o left join events e on e.id = o.event_id
     where ($1 = '' or lower(o.id || ' ' || coalesce(o.data->>'buyerName','') || ' ' || coalesce(o.buyer_email,'')) like '%' || $1 || '%')
       and ($2 = '' or o.status = $2) and ($3 = '' or o.data->>'method' = $3) and ($4 = '' or e.organizer_id = $4)
     order by o.created_at desc limit 1000`,
    [q, c.query.status ?? '', c.query.method ?? '', c.query.organizerId ?? '']);
};

const listUsers: Handler = async (c) => {
  admin(c);
  return (await all<UserRow>(`select * from users order by created_at desc`)).map(toAppUser);
};
const updateUser: Handler = async (c) => {
  const me_ = admin(c);
  const u = await one<UserRow>(`select * from users where id = $1`, [c.params.id]);
  if (!u) fail(404, 'Utilisateur introuvable');
  if (u!.id === me_.id) fail(409, 'Vous ne pouvez pas modifier votre propre compte ici');
  const name = (u!.data.name as string) ?? u!.email;
  if (c.body.status === 'active' || c.body.status === 'suspended') {
    await db().query(`update users set status = $2 where id = $1`, [u!.id, c.body.status]);
    await audit(c, c.body.status === 'suspended' ? 'Utilisateur suspendu' : 'Utilisateur réactivé', name);
  }
  const role = c.body.role as AppUser['role'];
  if (role && ['participant', 'organizer', 'admin'].includes(role)) {
    await db().query(`update users set role = $2, team_role = case when $2 = 'organizer' then coalesce(team_role, 'admin') else team_role end where id = $1`, [u!.id, role]);
    await audit(c, 'Rôle modifié', `${name} → ${role}`);
  }
  return null;
};
const userDetail: Handler = async (c) => {
  admin(c);
  const u = await one<UserRow>(`select * from users where id = $1`, [c.params.id]);
  if (!u) return null;
  const orders = await docs<Order>(`select data from orders where user_id = $1 or lower(buyer_email) = $2 order by created_at desc`, [u.id, u.email]);
  const organization = u.organizer_id ? (await docs<Organizer>(`select data from organizers where id = $1`, [u.organizer_id]))[0] ?? null : null;
  return {
    user: toAppUser(u), organization, orders,
    spent: orders.filter((o) => o.status === 'paid').reduce((a, o) => a + toHTG(o.total, o.currency), 0),
    events: u.organizer_id ? await docs<EventItem>(`select data from events where organizer_id = $1`, [u.organizer_id]) : [],
  };
};

/**
 * Une commande en attente est payée : les billets deviennent valables et sont envoyés (email + notification).
 * Sert au virement confirmé par l'admin et au paiement en ligne confirmé par la plateforme de paiement.
 * Renvoie null si la commande n'est pas (ou plus) en attente : l'appel est donc idempotent.
 */
async function settleOrder(orderId: string, by?: Ctx) {
  const out = await tx(async (q) => {
    const r = await one<{ access_key: string; data: Order }>(`select access_key, data from orders where id = $1 and status = 'pending' for update`, [orderId], q);
    if (!r) return null;
    await q.query(`update orders set status = 'paid', data = data || '{"status":"paid"}'::jsonb where id = $1`, [orderId]);
    await q.query(`update tickets set status = 'valid', data = data || '{"status":"valid"}'::jsonb where order_id = $1 and status = 'pending'`, [orderId]);
    if (by) await audit(by, 'Paiement confirmé', `${r.data.id} — ${r.data.buyerName}`, q);
    return { order: { ...r.data, status: 'paid' as const }, key: r.access_key, tickets: await docs<IssuedTicket>(`select data from tickets where order_id = $1 order by id`, [orderId], q), event: await eventById(r.data.eventId, q) };
  });
  if (!out) return null;
  const emailSent = out.event ? await sendTicketsEmail({ to: out.order.buyerEmail, name: out.order.buyerName, lang: 'fr', event: out.event, tickets: out.tickets, orderId: out.order.id, accessKey: out.key }) : false;
  if (out.event) {
    await safely(() => notifyEmails([out.order.buyerEmail], { title: 'Paiement confirmé', body: `Vos billets pour ${out.event!.title} sont prêts`, url: orderPath(out.order.id, out.key), channel: 'tickets' }));
    await notifyTeamSale(out.event, out.tickets.length);
    await emitSale(out.order, out.event, out.tickets.length);
  }
  return { emailSent };
}

/** Un virement bancaire est arrivé : la commande est payée, les billets deviennent valables et sont envoyés. */
const confirmOrderPayment: Handler = async (c) => {
  admin(c);
  const out = await settleOrder(c.params.id, c);
  if (!out) fail(404, 'Commande en attente introuvable');
  return out;
};

/** Supprime une commande jamais payée (paiement échoué ou abandonné) et libère ses places. */
async function dropOrder(orderId: string) {
  const o = (await docs<Order>(`select data from orders where id = $1`, [orderId]))[0];
  if (!o) return;
  await tx(async (q) => {
    const ev = await eventById(o.eventId, q);
    if (ev && ['paid', 'pending'].includes(o.status)) {
      const tickets = ev.tickets.map((t) => ({ ...t, sold: Math.max(0, t.sold - o.items.filter((i) => i.ticketTypeId === t.id).reduce((a, i) => a + i.qty, 0)) }));
      await saveEventRow({ ...ev, tickets }, q);
    }
    await purgeOrders(q, 'id = $1', [o.id]);
  });
}

/** Interroge la plateforme de paiement pour une commande en ligne : confirmée, échouée ou toujours en attente. */
async function checkPayment(orderId: string): Promise<PayStatus> {
  if (!payConfigured()) return 'pending';
  let st: PayStatus;
  try {
    st = await verifyPayment(orderId);
  } catch (e) {
    console.error('[pay] vérification', e);
    return 'pending';
  }
  if (st === 'paid') await settleOrder(orderId);
  else if (st === 'failed') await dropOrder(orderId);
  return st;
}

/** Appelé par la page de retour et par la page de commande : état du paiement d'une commande. */
const verifyOrder: Handler = async (c) => {
  const r = await one<{ status: string; method: string | null }>(`select status, data->>'method' as method from orders where id = $1`, [c.params.id]);
  if (!r) fail(404, 'Commande introuvable');
  if (r!.status !== 'pending') return { status: r!.status === 'paid' ? 'paid' : r!.status };
  // Un virement n'a pas de paiement en ligne à vérifier
  if (!r!.method || !ONLINE_METHODS.includes(r!.method)) return { status: 'pending' };
  return { status: await checkPayment(c.params.id) };
};

/**
 * Notification de la plateforme de paiement (webhook). Son contenu n'est jamais cru sur parole : il sert seulement
 * à savoir quelle commande vérifier, et l'état est relu auprès de la plateforme (impossible à falsifier).
 */
const payWebhook: Handler = async (c) => {
  const ref = str((c.body.transaction as { reference_id?: unknown } | undefined)?.reference_id, 60);
  if (ref.startsWith('sp_')) await checkPremiumPayment(ref);
  else if (ref.startsWith('bo_')) await checkBoostPayment(ref);
  else if (ref) await checkPayment(ref);
  return { ok: true };
};

const adminEvents: Handler = async (c) => {
  admin(c);
  return docs<EventItem>(`select data from events order by start_at desc`);
};
const moderateEvent: Handler = async (c) => {
  admin(c);
  const e = await eventById(c.params.id);
  if (!e) return null;
  const status = str(c.body.status, 20) as EventItem['status'];
  const reason = str(c.body.reason, 300);
  await saveEventRow({ ...e, status });
  await audit(c, status === 'published' ? 'Événement approuvé' : status === 'rejected' ? 'Événement refusé' : 'Événement modifié', `${e.title}${reason ? ` — ${reason}` : ''}`);
  return null;
};

const listReports: Handler = async (c) => {
  admin(c);
  return docs<Report>(`select data from reports order by created_at desc`);
};
const setReportStatus: Handler = async (c) => {
  admin(c);
  const status = str(c.body.status, 20) as Report['status'];
  const r = await one<{ event_id: string }>(`update reports set status = $2, data = data || $3::jsonb where id = $1 returning event_id`, [c.params.id, status, JSON.stringify({ status })]);
  if (r) await audit(c, status === 'dismissed' ? 'Signalement classé' : 'Signalement traité', (await eventById(r.event_id))?.title ?? r.event_id);
  return null;
};

const listDisputes: Handler = async (c) => {
  admin(c);
  return docs<Dispute>(`select data from disputes order by created_at desc`);
};
const resolveDispute: Handler = async (c) => {
  admin(c);
  const status = str(c.body.status, 20) as Dispute['status'];
  const decision = c.body.decision as Dispute['decision'];
  const note = str(c.body.note, 2000);
  await tx(async (q) => {
    const d = (await docs<Dispute>(`select data from disputes where id = $1 for update`, [c.params.id], q))[0];
    if (!d) return;
    d.status = status;
    if (note) d.note = note;
    if (status === 'resolved' && decision) {
      d.decision = decision;
      d.refunded = decision === 'refund_full' ? d.amount : decision === 'refund_half' ? Math.round(d.amount / 2) : 0;
      if (d.refunded > 0) {
        const r: RefundRequest = { id: newId('r'), orderId: d.orderId, buyer: d.opener, eventTitle: d.against, amount: d.refunded, currency: d.currency, reason: `Litige ${d.id}`, createdAt: new Date().toISOString(), status: 'approved' };
        const orgId = (await one<{ organizer_id: string }>(`select e.organizer_id from orders o join events e on e.id = o.event_id where o.id = $1`, [d.orderId], q))?.organizer_id ?? null;
        await upsert('refunds', { id: r.id, organizer_id: orgId, order_id: d.orderId, status: 'approved', created_at: r.createdAt, data: r }, q);
        const st = d.refunded >= d.amount ? 'refunded' : 'partially_refunded';
        await q.query(`update orders set status = $2, data = data || $3::jsonb where id = $1`, [d.orderId, st, JSON.stringify({ status: st })]);
      }
      d.messages.push({ from: 'admin', author: 'Équipe Event509', body: note, at: new Date().toISOString() });
    }
    await q.query(`update disputes set status = $2, data = $3 where id = $1`, [d.id, d.status, JSON.stringify(d)]);
    await audit(c, status === 'resolved' ? 'Litige résolu' : 'Litige passé en enquête', d.orderId, q);
  });
  return null;
};
const disputeMessage: Handler = async (c) => {
  admin(c);
  const body = str(c.body.body, 2000);
  if (!body) fail(422, 'Message vide');
  const msg = { from: 'admin', author: 'Équipe Event509', body, at: new Date().toISOString() };
  await db().query(`update disputes set data = jsonb_set(data, '{messages}', (data->'messages') || $2::jsonb) where id = $1`, [c.params.id, JSON.stringify([msg])]);
  return null;
};

const adminPayouts: Handler = async (c) => {
  admin(c);
  return docs<Payout>(`select data from payouts order by (coalesce(data->>'priority', '') = 'true' and status = 'requested') desc, created_at desc`);
};
const setPayoutStatus: Handler = async (c) => {
  admin(c);
  const status = str(c.body.status, 20) as Payout['status'];
  if (!['processing', 'paid', 'rejected', 'scheduled'].includes(status)) fail(422, 'Statut invalide');
  const p = await one<{ data: Payout }>(`update payouts set status = $2, data = data || $3::jsonb where id = $1 returning data`, [c.params.id, status, JSON.stringify({ status })]);
  if (p) await audit(c, status === 'paid' ? 'Versement payé' : status === 'processing' ? 'Versement approuvé' : 'Versement refusé', `${await orgName(p.data.organizerId)} — ${p.data.amount} ${p.data.currency}`);
  return null;
};

// ---------- Table de routage ----------

// ---------- Appareils (notifications push) ----------

/**
 * Enregistre le jeton FCM d'un appareil. Propriétaire : le compte connecté et/ou l'acheteur d'une commande
 * (clé du lien de commande). Sans l'un des deux, le jeton n'est pas accepté. Idempotent (pas de doublon).
 */
const registerDevice: Handler = async (c) => {
  const token = str(c.body.token, 4096);
  if (token.length < 20) fail(422, 'Jeton invalide');
  const owners: { owner: string; userId: string | null; email: string | null }[] = [];
  if (c.user && c.user.status === 'active') owners.push({ owner: `u:${c.user.id}`, userId: c.user.id, email: null });
  const orderId = str(c.body.orderId, 60);
  if (orderId) {
    const r = await orderAccess(c, orderId, str(c.body.key, 60));
    const email = String(r.data.buyerEmail ?? '').toLowerCase();
    if (email) owners.push({ owner: `e:${email}`, userId: null, email });
  }
  if (!owners.length) fail(401, 'Connectez-vous ou ouvrez le lien de votre commande');
  for (const o of owners)
    await db().query(
      `insert into device_tokens (token, owner, user_id, buyer_email) values ($1,$2,$3,$4)
       on conflict (token, owner) do update set updated_at = now()`, [token, o.owner, o.userId, o.email]);
  return null;
};

/** Déconnexion : l'appareil ne reçoit plus les notifications du compte (celles des commandes restent). */
const unregisterDevice: Handler = async (c) => {
  const u = auth(c);
  await db().query(`delete from device_tokens where token = $1 and owner = $2`, [str(c.query.token, 4096), `u:${u.id}`]);
  return null;
};

// ---------- Avis et notes ----------

/** « Marie Dupont » → « Marie D. » : l'avis public ne montre jamais le nom complet. */
const shortName = (name: string) => {
  const [first, ...rest] = name.trim().split(/\s+/);
  return rest.length ? `${first} ${rest[rest.length - 1]![0]!.toUpperCase()}.` : first || 'Participant';
};

const reviewSummary = async (eventId: string) => {
  const r = await one<{ avg: string | null; n: string }>(`select avg(rating) as avg, count(*) as n from reviews where event_id = $1`, [eventId]);
  return { average: r?.avg ? Math.round(Number(r.avg) * 10) / 10 : 0, count: Number(r?.n ?? 0) };
};

const eventReviews: Handler = async (c) => {
  const e = await eventById(c.params.id);
  if (!e || (e.status !== 'published' && e.status !== 'ended')) fail(404, 'Événement introuvable');
  const items = await docs<Review>(`select data from reviews where event_id = $1 order by created_at desc limit 100`, [e!.id]);
  return { ...(await reviewSummary(e!.id)), items };
};

/** L'acheteur (lien de sa commande) peut donner son avis une fois l'événement terminé. */
const reviewState: Handler = async (c) => {
  const r = await orderAccess(c, str(c.query.order, 60), str(c.query.k, 60));
  const ev = await eventById(r.data.eventId);
  const mine = (await docs<Review>(`select data from reviews where order_id = $1`, [r.data.id]))[0] ?? null;
  const nowLocal = new Date().toLocaleString('sv-SE', { timeZone: 'America/Port-au-Prince' }).replace(' ', 'T');
  const over = !!ev && localMs(ev.end) < Date.parse(`${nowLocal}Z`);
  return { canReview: !mine && over && r.data.status === 'paid', over, review: mine };
};

const createReview: Handler = async (c) => {
  const r = await orderAccess(c, str(c.body.orderId, 60), str(c.body.key, 60));
  if (r.data.status !== 'paid') fail(409, 'Seules les commandes payées peuvent être notées');
  const ev = await eventById(r.data.eventId);
  if (!ev) fail(404, 'Événement introuvable');
  const nowLocal = new Date().toLocaleString('sv-SE', { timeZone: 'America/Port-au-Prince' }).replace(' ', 'T');
  if (localMs(ev!.end) >= Date.parse(`${nowLocal}Z`)) fail(409, 'Vous pourrez donner votre avis une fois l’événement terminé');
  const rating = Math.round(Number(c.body.rating));
  if (!(rating >= 1 && rating <= 5)) fail(422, 'Choisissez une note de 1 à 5');
  const rv: Review = {
    id: newId('rv'), eventId: ev!.id, rating, comment: str(c.body.comment, 1000), author: shortName(r.data.buyerName), createdAt: new Date().toISOString(),
  };
  try {
    await db().query(
      `insert into reviews (id, event_id, order_id, rating, created_at, data) values ($1,$2,$3,$4,$5,$6)`,
      [rv.id, rv.eventId, r.data.id, rv.rating, rv.createdAt, JSON.stringify(rv)],
    );
  } catch (e) {
    if ((e as { code?: string }).code === '23505') fail(409, 'Vous avez déjà donné votre avis pour cette commande');
    throw e;
  }
  await safely(async () => {
    const ids = await organizerUserIds(ev!.organizerId);
    await notifyUsers(ids, { title: 'Nouvel avis', body: `${rv.author} a noté « ${ev!.title} » ${rv.rating}/5`, url: '/organisateur/avis', channel: 'sales' });
  });
  return rv;
};

const orgReviews: Handler = async (c) => {
  const orgId = org(c, 'marketing');
  const items = await all<{ data: Review; title: string }>(
    `select r.data, e.data->>'title' as title from reviews r join events e on e.id = r.event_id where e.organizer_id = $1 order by r.created_at desc limit 300`, [orgId]);
  return items.map((x) => ({ ...x.data, eventTitle: x.title }));
};

const replyReview: Handler = async (c) => {
  const orgId = org(c, 'marketing');
  const body = str(c.body.body, 1000);
  if (!body) fail(422, 'Écrivez une réponse');
  const r = await one<{ data: Review }>(`select r.data from reviews r join events e on e.id = r.event_id where r.id = $1 and e.organizer_id = $2`, [c.params.id, orgId]);
  if (!r) fail(404, 'Avis introuvable');
  await db().query(`update reviews set data = data || $2::jsonb where id = $1`, [c.params.id, JSON.stringify({ reply: { body, at: new Date().toISOString() } })]);
  return null;
};

const removeReview: Handler = async (c) => {
  admin(c);
  const r = await one<{ title: string }>(`delete from reviews where id = $1 returning (select data->>'title' from events where id = event_id) as title`, [c.params.id]);
  if (r) await audit(c, 'Avis supprimé', r.title ?? c.params.id);
  return null;
};

/** Début de l'événement sans fuseau (heure locale d'Haïti) lu comme une heure UTC, comme le reste du site. */
const localMs = (iso: string) => Date.parse(iso.length === 16 ? `${iso}:00Z` : `${iso}Z`.replace('ZZ', 'Z'));

/**
 * Rappels (appelé par Vercel Cron avec « Authorization: Bearer $CRON_SECRET ») : la veille, le jour même
 * à partir de 8 h, et dans les 4 heures qui précèdent, pour les détenteurs de billets valables.
 * Chaque rappel n'est envoyé qu'une fois par événement (table notification_log).
 */
const runReminders: Handler = async (c) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || !sameKey(c.authorization?.replace(/^Bearer\s+/i, ''), secret)) fail(401, 'Non autorisé');
  // Paiements en ligne abandonnés depuis plus de 2 h : dernière vérification, puis les places sont libérées
  const stale = await all<{ id: string }>(
    `select id from orders where status = 'pending' and data->>'method' = any($1) and created_at < now() - interval '2 hours'`, [[...ONLINE_METHODS]]);
  for (const o of stale) if ((await checkPayment(o.id)) === 'pending') await dropOrder(o.id);
  const premium = await premiumMaintenance().catch((e) => (console.error('[premium] maintenance', e), null));
  if (!pushConfigured()) return { sent: 0, premium, note: 'FIREBASE_SERVICE_ACCOUNT non défini' };
  const nowLocal = new Date().toLocaleString('sv-SE', { timeZone: 'America/Port-au-Prince' }).replace(' ', 'T');
  const now = Date.parse(`${nowLocal}Z`);
  const today = nowLocal.slice(0, 10);
  const tomorrow = new Date(now + 86_400_000).toISOString().slice(0, 10);
  const hour = Number(nowLocal.slice(11, 13));
  const events = await docs<EventItem>(`select data from events where status = 'published' and start_at > now() - interval '1 day' and start_at < now() + interval '3 days'`);
  let sent = 0;
  for (const ev of events) {
    const start = localMs(ev.start);
    const diffH = (start - now) / 3_600_000;
    if (!Number.isFinite(diffH) || diffH <= 0) continue;
    const day = ev.start.slice(0, 10);
    const kind = diffH <= 4 ? 'soon' : day === today && hour >= 8 ? 'day' : day === tomorrow ? 'eve' : null;
    if (!kind) continue;
    if (!(await claimOnce(`reminder:${kind}:${ev.id}`))) continue;
    const time = ev.start.slice(11, 16);
    const body = kind === 'eve' ? `${ev.title} a lieu demain à ${time}` : kind === 'day' ? `${ev.title} a lieu aujourd’hui à ${time}` : `${ev.title} commence bientôt (${time})`;
    sent += await notifyHolders(ev.id, { title: 'Rappel', body, url: eventPath(ev), channel: 'reminders' });
  }
  return { sent, premium };
};

export const routes: [method: string, pattern: string, handler: Handler][] = [
  ...premiumRoutes({ fail, str, auth, admin, org, audit }),
  ...analyticsRoutes({ fail, str, auth, admin, org, audit }),
  ...multiEventRoutes({ fail, str, auth, admin, org, audit }),
  ...supportRoutes({ fail, str, auth, admin, org, audit }),
  ...marketingRoutes({ fail, str, auth, admin, org, audit }),
  ...financeRoutes({ fail, str, auth, admin, org, audit, balanceOf }),
  ...boostRoutes({ fail, str, auth, admin, org, audit }),
  ...devApiRoutes({ fail, str, auth, admin, org, audit }),
  ['GET', '/health', async () => {
    // Diagnostic : indique seulement si les réglages sont présents, jamais leur valeur
    const env = { DATABASE_URL: !!process.env.DATABASE_URL, JWT_SECRET: (process.env.JWT_SECRET?.length ?? 0) >= 32 };
    try {
      return { ok: true, db: !!(await one(`select 1 as ok`)), env };
    } catch {
      return { ok: false, db: false, env };
    }
  }],
  ['GET', '/bootstrap', bootstrap],
  ['POST', '/auth/signup', signup],
  ['POST', '/auth/login', login],
  ['GET', '/auth/me', me],
  ['PATCH', '/auth/me', updateMe],
  ['DELETE', '/auth/me', deleteMe],
  ['POST', '/auth/password', changePassword],
  ['POST', '/auth/organizer', becomeOrganizer],
  ['GET', '/events/:id', getEvent],
  ['POST', '/promo/validate', validatePromo],
  ['POST', '/reports', reportEvent],
  ['GET', '/events/:id/reviews', eventReviews],
  ['GET', '/reviews/state', reviewState],
  ['POST', '/reviews', createReview],
  ['GET', '/org/reviews', orgReviews],
  ['POST', '/org/reviews/:id/reply', replyReview],
  ['DELETE', '/admin/reviews/:id', removeReview],
  ['POST', '/files', uploadFile],
  ['GET', '/files/:id', readFile],
  ['GET', '/org/verification', orgVerification],
  ['POST', '/orders', createOrder],
  ['GET', '/orders/:id', getOrder],
  ['POST', '/orders/:id/claim', claimOrder],
  ['POST', '/orders/:id/verify', verifyOrder],
  ['POST', '/pay/webhook', payWebhook],
  ['POST', '/devices', registerDevice],
  ['DELETE', '/devices', unregisterDevice],
  ['GET', '/cron/reminders', runReminders],
  ['GET', '/me/tickets', myTickets],
  ['GET', '/me/orders', myOrders],
  ['POST', '/orders/:id/refund', requestRefund],
  ['POST', '/tickets/:id/transfer', transferTicket],
  ['POST', '/tickets/:id/resale', createResale],
  ['DELETE', '/resale/code/:code', cancelResale],
  ['GET', '/resale', listResale],
  ['POST', '/resale/:id/buy', buyResale],

  ['GET', '/org/events', orgEvents],
  ['GET', '/org/sales', orgSales],
  ['PUT', '/org/events', saveEvent],
  ['POST', '/org/events/:id/status', setEventStatus],
  ['DELETE', '/org/events/:id', deleteEvent],
  ['GET', '/org/events/:id/stats', eventStats],
  ['PUT', '/org/profile', saveOrganizer],
  ['GET', '/org/attendees', attendees],
  ['POST', '/org/checkin/lookup', checkinLookup],
  ['POST', '/org/checkin', checkin],
  ['GET', '/org/promos', listPromos],
  ['PUT', '/org/promos', savePromo],
  ['GET', '/org/team', listTeam],
  ['POST', '/org/team', inviteMember],
  ['GET', '/org/activity', teamActivity],
  ['PATCH', '/org/team/:id', updateMember],
  ['DELETE', '/org/team/:id', removeMember],
  ['GET', '/org/refunds', listRefunds],
  ['POST', '/org/refunds/:id', decideRefund],
  ['GET', '/org/payouts', listPayouts],
  ['POST', '/org/payouts', requestPayout],
  ['GET', '/org/balance', balance],
  ['GET', '/org/campaigns', listCampaigns],
  ['PUT', '/org/campaigns', saveCampaign],
  ['GET', '/org/ambassadors', listAmbassadors],
  ['PUT', '/org/ambassadors', saveAmbassador],

  ['PUT', '/admin/fees', saveFees],
  ['PUT', '/admin/rate', saveRate],
  ['GET', '/geo', getGeo],
  ['GET', '/legal', getLegal],
  ['PUT', '/admin/legal', saveLegal],
  ['PUT', '/admin/site', saveSite],
  ['GET', '/admin/commissions', listCommissions],
  ['PUT', '/admin/commissions', saveCommission],
  ['DELETE', '/admin/commissions/:id', removeCommission],
  ['GET', '/admin/audit', listAudit],
  ['GET', '/admin/stats', platformStats],
  ['PUT', '/admin/targets', saveTarget],
  ['DELETE', '/admin/targets/:id', removeTarget],
  ['GET', '/admin/orders', adminOrders],
  ['POST', '/admin/orders/:id/confirm', confirmOrderPayment],
  ['DELETE', '/admin/orders/:id', deleteOrder],
  ['GET', '/admin/users', listUsers],
  ['GET', '/admin/users/:id', userDetail],
  ['PATCH', '/admin/users/:id', updateUser],
  ['GET', '/admin/events', adminEvents],
  ['POST', '/admin/events/:id/moderate', moderateEvent],
  ['GET', '/admin/reports', listReports],
  ['POST', '/admin/reports/:id', setReportStatus],
  ['GET', '/admin/disputes', listDisputes],
  ['POST', '/admin/disputes/:id/resolve', resolveDispute],
  ['POST', '/admin/disputes/:id/messages', disputeMessage],
  ['GET', '/admin/payouts', adminPayouts],
  ['POST', '/admin/payouts/:id', setPayoutStatus],
];


