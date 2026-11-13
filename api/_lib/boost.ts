import type { EventItem } from '../../src/types.js';
import { all, db, one, tx, upsert } from './db.js';
import { newId } from './auth.js';
import { sendNoticeEmail } from './mail.js';
import { createPayment, MIN_HTG, ONLINE_METHODS, payConfigured, verifyPayment, type OnlineMethod, type PayStatus } from './pay.js';
import { notifyUsers, organizerUserIds } from './push.js';
import type { PremiumDeps } from './premium.js';
import type { Ctx } from './routes.js';

type Handler = (c: Ctx) => Promise<unknown>;

export interface BoostConfig {
  enabled: boolean;
  /** Formules proposées : durée en jours et prix en HTG (réglables par l'administration). */
  packages: { days: number; price: number }[];
  /** Nombre maximum d'événements boostés en même temps : la mise en avant reste rare, donc visible. */
  maxActive: number;
}
export const DEFAULT_BOOST: BoostConfig = { enabled: true, packages: [{ days: 3, price: 500 }, { days: 7, price: 1000 }, { days: 14, price: 1800 }], maxActive: 6 };

export async function getBoostConfig(): Promise<BoostConfig> {
  const r = await one<{ value: Partial<BoostConfig> }>(`select value from settings where key = 'boost'`);
  const v = r?.value ?? {};
  return {
    enabled: v.enabled !== false,
    packages: Array.isArray(v.packages) && v.packages.length ? v.packages : DEFAULT_BOOST.packages,
    maxActive: typeof v.maxActive === 'number' ? v.maxActive : DEFAULT_BOOST.maxActive,
  };
}

interface BoostRow {
  id: string; organizer_id: string; event_id: string; days: number; amount: string; status: 'pending' | 'active' | 'canceled' | 'failed'; method: string;
  created_at: Date; paid_at: Date | null; starts_at: Date | null; ends_at: Date | null; views_at_start: number;
}
const state = (b: BoostRow) => (b.status === 'active' ? (b.ends_at && b.ends_at.getTime() > Date.now() ? 'active' : 'ended') : b.status);

/** Places de boost encore disponibles : boosts actifs + paiements récents en attente. */
async function slotsUsed() {
  return Number((await one<{ n: string }>(
    `select count(*) as n from event_boosts where (status = 'active' and ends_at > now()) or (status = 'pending' and created_at > now() - interval '2 hours')`))?.n ?? 0);
}

/** Paiement confirmé : le boost démarre tout de suite et l'événement porte sa date de fin (le site la compare à l'heure). */
export async function applyBoostPaid(id: string): Promise<boolean> {
  const b = await tx(async (q) => {
    const row = await one<BoostRow>(
      `update event_boosts set status = 'active', paid_at = now(), starts_at = now(), ends_at = now() + make_interval(days => days),
         views_at_start = coalesce((select (data->>'views')::int from events where id = event_id), 0)
       where id = $1 and status = 'pending' returning *`, [id], q);
    if (!row) return null;
    await q.query(`update events set data = data || jsonb_build_object('boostedUntil', to_char($2::timestamptz at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')) where id = $1`, [row.event_id, row.ends_at]);
    return row;
  });
  if (!b) return false;
  try {
    await notifyUsers(await organizerUserIds(b.organizer_id), { title: 'Boost activé', body: `Votre événement est mis en avant pendant ${b.days} jour(s).`, url: '/organisateur/boosts', channel: 'sales' });
    const owners = await all<{ email: string }>(`select email from users where organizer_id = $1 and team_role = 'admin'`, [b.organizer_id]);
    await Promise.all(owners.map((o) => sendNoticeEmail(o.email, 'Boost activé', 'Boost activé', [`Votre événement est mis en avant pendant ${b.days} jour(s).`])));
  } catch (e) {
    console.error('[boost] notification', e);
  }
  return true;
}

/** Relit l'état du paiement auprès de la plateforme (jamais cru sur parole) puis l'applique. */
export async function checkBoostPayment(id: string): Promise<PayStatus> {
  const b = await one<{ status: string; method: string }>(`select status, method from event_boosts where id = $1`, [id]);
  if (!b) return 'failed';
  if (b.status === 'active') return 'paid';
  if (b.status !== 'pending' || b.method === 'transfer' || !payConfigured()) return b.status === 'failed' ? 'failed' : 'pending';
  let st: PayStatus;
  try {
    st = await verifyPayment(id);
  } catch (e) {
    console.error('[boost] vérification du paiement', e);
    return 'pending';
  }
  if (st === 'paid') await applyBoostPaid(id);
  else if (st === 'failed') await db().query(`update event_boosts set status = 'failed' where id = $1 and status = 'pending'`, [id]);
  return st;
}

/** Boost par événement : formules et prix réglés par l'administration, paiement distinct de tout le reste. */
export function boostRoutes(h: PremiumDeps): [string, string, Handler][] {
  const { fail, str, admin, org, audit } = h;

  const config: Handler = async () => {
    const c = await getBoostConfig();
    const used = await slotsUsed();
    return { enabled: c.enabled, packages: c.packages, maxActive: c.maxActive, slotsLeft: Math.max(0, c.maxActive - used), onlinePayment: payConfigured() };
  };

  const list: Handler = async (c) => {
    const orgId = org(c, 'events');
    const rows = await all<BoostRow & { title: string; views: string | null; orders: string; tickets: string }>(
      `select b.*, e.data->>'title' as title, e.data->>'views' as views,
         (select count(*) from orders o where o.event_id = b.event_id and b.starts_at is not null and o.created_at >= b.starts_at and o.status in ('paid', 'partially_refunded')) as orders,
         (select coalesce(sum((it->>'qty')::int), 0) from orders o, jsonb_array_elements(o.data->'items') it where o.event_id = b.event_id and b.starts_at is not null and o.created_at >= b.starts_at and o.status in ('paid', 'partially_refunded')) as tickets
       from event_boosts b join events e on e.id = b.event_id where b.organizer_id = $1 order by b.created_at desc limit 100`, [orgId]);
    return rows.map((r) => ({
      id: r.id, eventId: r.event_id, event: r.title, days: r.days, amount: Number(r.amount), state: state(r), method: r.method === 'transfer' ? 'transfer' : 'online',
      createdAt: r.created_at.toISOString(), startsAt: r.starts_at?.toISOString() ?? null, endsAt: r.ends_at?.toISOString() ?? null,
      views: r.starts_at ? Math.max(0, Number(r.views ?? 0) - r.views_at_start) : 0, orders: Number(r.orders), tickets: Number(r.tickets),
    }));
  };

  const create: Handler = async (c) => {
    const orgId = org(c, 'events');
    const cfg = await getBoostConfig();
    if (!cfg.enabled) fail(403, 'Le boost n’est pas disponible pour le moment');
    const days = Math.floor(Number(c.body.days));
    const pack = cfg.packages.find((p) => p.days === days);
    if (!pack) fail(422, 'Formule invalide');
    const ev = await one<{ id: string; data: EventItem }>(`select id, data from events where id = $1 and organizer_id = $2`, [str(c.body.eventId, 60), orgId]);
    if (!ev) fail(404, 'Événement introuvable');
    if (ev!.data.status !== 'published') fail(409, 'Seul un événement publié peut être boosté');
    if (ev!.data.end < new Date().toISOString().slice(0, 16)) fail(409, 'Cet événement est terminé');
    if (await one(`select 1 from event_boosts where event_id = $1 and ((status = 'active' and ends_at > now()) or (status = 'pending' and created_at > now() - interval '2 hours'))`, [ev!.id]))
      fail(409, 'Cet événement a déjà un boost en cours ou en attente de paiement');
    if ((await slotsUsed()) >= cfg.maxActive) fail(409, 'Toutes les places de boost sont occupées pour le moment : réessayez dans quelques jours');
    const amount = pack!.price;
    const method = str(c.body.method, 20) || 'moncash';
    const online = payConfigured() && amount >= MIN_HTG;
    if (online && !ONLINE_METHODS.includes(method)) fail(422, 'Moyen de paiement invalide');
    const id = `bo_${newId('b').slice(2)}`;
    await db().query(`insert into event_boosts (id, organizer_id, event_id, days, amount, status, method) values ($1,$2,$3,$4,$5,'pending',$6)`, [id, orgId, ev!.id, days, amount, online ? method : 'transfer']);
    if (amount <= 0) {
      await applyBoostPaid(id);
      return { id, paid: true };
    }
    if (!online) return { id, paid: false, manual: true };
    try {
      const p = await createPayment({ reference: id, amountHtg: Math.round(amount), method: method as OnlineMethod });
      return { id, paid: false, payUrl: p.url };
    } catch (e) {
      console.error('[boost] paiement', e);
      await db().query(`update event_boosts set status = 'failed' where id = $1`, [id]);
      fail(502, 'Le paiement en ligne est momentanément indisponible. Réessayez dans un instant.');
    }
    return null;
  };

  const check: Handler = async (c) => ({ status: await checkBoostPayment(c.params.id) });

  // ---------- Administration ----------

  const adminList: Handler = async (c) => {
    admin(c);
    const rows = await all<BoostRow & { title: string; org: string }>(
      `select b.*, e.data->>'title' as title, o.data->>'name' as org from event_boosts b join events e on e.id = b.event_id join organizers o on o.id = b.organizer_id
       order by (b.status = 'pending') desc, b.created_at desc limit 200`);
    return {
      config: await getBoostConfig(),
      items: rows.map((r) => ({ id: r.id, event: r.title, organization: r.org, days: r.days, amount: Number(r.amount), state: state(r), method: r.method === 'transfer' ? 'transfer' : 'online', createdAt: r.created_at.toISOString(), endsAt: r.ends_at?.toISOString() ?? null })),
    };
  };

  const saveConfig: Handler = async (c) => {
    admin(c);
    const b = c.body as Partial<BoostConfig>;
    const packs = (Array.isArray(b.packages) ? b.packages : [])
      .map((p) => ({ days: Math.floor(Number(p?.days)), price: Math.max(0, Math.round(Number(p?.price))) }))
      .filter((p) => p.days >= 1 && p.days <= 90 && Number.isFinite(p.price))
      .slice(0, 6);
    if (!packs.length) fail(422, 'Proposez au moins une formule (durée en jours et prix)');
    if (new Set(packs.map((p) => p.days)).size !== packs.length) fail(422, 'Chaque durée ne peut apparaître qu’une fois');
    const next: BoostConfig = { enabled: b.enabled !== false, packages: packs.sort((x, y) => x.days - y.days), maxActive: Math.min(100, Math.max(1, Math.floor(Number(b.maxActive) || DEFAULT_BOOST.maxActive))) };
    await upsert('settings', { key: 'boost', value: next });
    await audit(c, 'Réglages du boost modifiés', next.packages.map((p) => `${p.days} j = ${p.price} HTG`).join(', '));
    return next;
  };

  const confirm: Handler = async (c) => {
    admin(c);
    if (!(await applyBoostPaid(c.params.id))) fail(409, 'Ce boost n’est plus en attente de paiement');
    await audit(c, 'Paiement de boost confirmé', c.params.id);
    return null;
  };

  const cancel: Handler = async (c) => {
    admin(c);
    const r = await one<BoostRow>(`update event_boosts set status = 'canceled', ends_at = case when status = 'active' then now() else ends_at end where id = $1 and status in ('pending', 'active') returning *`, [c.params.id]);
    if (!r) fail(404, 'Boost introuvable');
    // Plus de boost : l'événement n'est plus mis en avant (sauf s'il en a un autre en cours)
    await db().query(`update events set data = data - 'boostedUntil' where id = $1 and not exists (select 1 from event_boosts where event_id = $1 and status = 'active' and ends_at > now())`, [r!.event_id]);
    await audit(c, 'Boost annulé', c.params.id);
    return null;
  };

  return [
    ['GET', '/boost/config', config],
    ['POST', '/boost/payments/:id/check', check],
    ['GET', '/org/boosts', list],
    ['POST', '/org/boosts', create],
    ['GET', '/admin/boosts', adminList],
    ['PUT', '/admin/boost/config', saveConfig],
    ['POST', '/admin/boosts/:id/confirm', confirm],
    ['POST', '/admin/boosts/:id/cancel', cancel],
  ];
}
