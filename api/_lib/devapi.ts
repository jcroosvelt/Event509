import { createHash, createHmac, randomBytes } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { EventItem } from '../../src/types.js';
import { all, db, one } from './db.js';
import { newId } from './auth.js';
import { siteUrl } from './mail.js';
import { benefitsFor, getConfig, type PremiumDeps } from './premium.js';
import type { Ctx } from './routes.js';

type Handler = (c: Ctx) => Promise<unknown>;

const SCOPES = ['events:read', 'sales:read'] as const;
const WEBHOOK_EVENTS = ['ticket.sold', 'ticket.checked_in'] as const;
const sha = (v: string) => createHash('sha256').update(v).digest('hex');

// ---------- Webhooks : sécurité de l'adresse et envoi signé ----------

/** Adresse privée ou locale : un webhook ne doit jamais pouvoir viser le réseau interne du serveur (SSRF). */
function privateIp(ip: string) {
  if (ip.includes(':')) {
    const l = ip.toLowerCase();
    return l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80') || l.startsWith('::ffff:127.') || l.startsWith('::ffff:10.') || l.startsWith('::ffff:192.168.');
  }
  const [a = 0, b = 0] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
}
/** Seul un test local peut autoriser http et les adresses privées (jamais en production). */
const testMode = () => process.env.NODE_ENV !== 'production' && process.env.WEBHOOK_ALLOW_PRIVATE === '1';

export async function checkWebhookUrl(raw: string): Promise<string | null> {
  let u: URL;
  try { u = new URL(raw); } catch { return 'Adresse invalide'; }
  if (u.protocol !== 'https:' && !(testMode() && u.protocol === 'http:')) return 'L’adresse doit commencer par https://';
  if (u.username || u.password) return 'L’adresse ne doit pas contenir d’identifiants';
  if (testMode()) return null;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return 'Adresse locale refusée';
  try {
    const ips = isIP(host) ? [host] : (await lookup(host, { all: true })).map((r) => r.address);
    if (!ips.length || ips.some(privateIp)) return 'Adresse locale ou privée refusée';
  } catch {
    return 'Adresse introuvable';
  }
  return null;
}

/** Envoie un événement à un webhook, signé : « X-Event509-Signature: t=<horodatage>,v1=<HMAC-SHA256 de "t.corps"> ». */
async function deliver(hook: { id: string; url: string; secret: string }, type: string, data: unknown) {
  const body = JSON.stringify({ id: newId('evt'), type, createdAt: new Date().toISOString(), data });
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', hook.secret).update(`${t}.${body}`).digest('hex');
  let code: number | null = null, error: string | null = null;
  try {
    const bad = await checkWebhookUrl(hook.url);
    if (bad) throw new Error(bad);
    const res = await fetch(hook.url, {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(5000),
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Event509-Webhooks/1', 'X-Event509-Event': type, 'X-Event509-Signature': `t=${t},v1=${sig}` },
      body,
    });
    code = res.status;
    if (res.status < 200 || res.status >= 300) error = `Réponse ${res.status}`;
  } catch (e) {
    error = e instanceof Error ? e.message.slice(0, 160) : 'Échec';
  }
  const ok = !error;
  await db().query(`insert into webhook_deliveries (id, webhook_id, event, status_code, ok, error) values ($1,$2,$3,$4,$5,$6)`, [newId('wd'), hook.id, type, code, ok, error]);
  // Dix échecs de suite : le webhook est mis en pause (l'organisateur peut le réactiver en le recréant)
  await db().query(`update webhooks set failures = case when $2 then 0 else failures + 1 end, active = case when $2 then active else failures + 1 < 10 end where id = $1`, [hook.id, ok]);
  await db().query(`delete from webhook_deliveries where webhook_id = $1 and at < now() - interval '30 days'`, [hook.id]);
  return { ok, code, error };
}

/** Prévient les webhooks de l'organisation (ne bloque et ne fait jamais échouer l'action qui le déclenche). */
export async function fireWebhooks(orgId: string, type: (typeof WEBHOOK_EVENTS)[number], data: unknown) {
  try {
    if (!(await benefitsFor(orgId)).includes('api')) return;
    const hooks = await all<{ id: string; url: string; secret: string }>(`select id, url, secret from webhooks where organizer_id = $1 and active and $2 = any(events)`, [orgId, type]);
    await Promise.all(hooks.map((h) => deliver(h, type, data)));
  } catch (e) {
    console.error('[webhooks]', e);
  }
}

// ---------- Routes ----------

/** API pour les organisateurs vérifiés : clés, API publique en lecture (/v1), webhooks et suivi d'utilisation. */
export function devApiRoutes(h: PremiumDeps): [string, string, Handler][] {
  const { fail, str, org, auth } = h;
  const need = async (orgId: string) => {
    if (!(await benefitsFor(orgId)).includes('api')) fail(403, 'L’API est réservée aux organisateurs vérifiés');
  };

  // ----- Clés API (gestion) -----

  const listKeys: Handler = async (c) => {
    const orgId = org(c, 'settings');
    const rows = await all<{ id: string; name: string; prefix: string; scopes: string[]; created_at: Date; last_used_at: Date | null; revoked_at: Date | null; day: string }>(
      `select k.id, k.name, k.prefix, k.scopes, k.created_at, k.last_used_at, k.revoked_at,
         (select coalesce(sum(count), 0) from api_usage u where u.key_id = k.id and u.minute > now() - interval '24 hours') as day
       from api_keys k where k.organizer_id = $1 order by k.created_at desc`, [orgId]);
    const cfg = await getConfig();
    return {
      canCreate: (await benefitsFor(orgId)).includes('api'), limits: cfg.apiLimits,
      keys: rows.map((r) => ({ id: r.id, name: r.name, prefix: r.prefix, scopes: r.scopes, createdAt: r.created_at.toISOString(), lastUsedAt: r.last_used_at?.toISOString() ?? null, revoked: !!r.revoked_at, requests24h: Number(r.day) })),
    };
  };

  /** Crée une clé. La clé complète n'est montrée qu'une fois : seule son empreinte est conservée. */
  const createKey: Handler = async (c) => {
    const orgId = org(c, 'settings');
    await need(orgId);
    const name = str(c.body.name, 60);
    if (name.length < 2) fail(422, 'Donnez un nom à cette clé (ex. « Site web »)');
    const scopes = (Array.isArray(c.body.scopes) ? c.body.scopes : ['events:read']).filter((s): s is (typeof SCOPES)[number] => (SCOPES as readonly string[]).includes(s as string));
    if (!scopes.length) fail(422, 'Choisissez au moins une autorisation');
    const cfg = await getConfig();
    const active = Number((await one<{ n: string }>(`select count(*) as n from api_keys where organizer_id = $1 and revoked_at is null`, [orgId]))?.n ?? 0);
    if (active >= cfg.apiLimits.maxKeys) fail(409, `Limite de ${cfg.apiLimits.maxKeys} clés actives atteinte : révoquez-en une`);
    const key = `e509_live_${randomBytes(24).toString('base64url')}`;
    const id = newId('ak');
    await db().query(`insert into api_keys (id, organizer_id, name, prefix, key_hash, scopes, created_by) values ($1,$2,$3,$4,$5,$6,$7)`, [id, orgId, name, key.slice(0, 14), sha(key), scopes, auth(c).id]);
    return { id, key, prefix: key.slice(0, 14) };
  };

  const revokeKey: Handler = async (c) => {
    const orgId = org(c, 'settings');
    const r = await one<{ id: string }>(`update api_keys set revoked_at = now() where id = $1 and organizer_id = $2 and revoked_at is null returning id`, [c.params.id, orgId]);
    if (!r) fail(404, 'Clé introuvable');
    return null;
  };

  /** Suivi : les dernières requêtes faites avec les clés de l'organisation. */
  const usage: Handler = async (c) => {
    const orgId = org(c, 'settings');
    const rows = await all<{ at: Date; method: string; path: string; status: number; name: string }>(
      `select r.at, r.method, r.path, r.status, k.name from api_requests r join api_keys k on k.id = r.key_id where k.organizer_id = $1 order by r.at desc limit 50`, [orgId]);
    await db().query(`delete from api_requests where at < now() - interval '30 days'`);
    return rows.map((r) => ({ at: r.at.toISOString(), method: r.method, path: r.path, status: r.status, key: r.name }));
  };

  // ----- API publique /v1 (clé en en-tête « Authorization: Bearer … ») -----

  /** Authentifie la clé, applique la limite par minute, journalise. Renvoie l'organisation et ses autorisations. */
  async function authKey(c: Ctx, scope: (typeof SCOPES)[number]) {
    const key = (c.authorization ?? '').replace(/^Bearer\s+/i, '').trim();
    const k = key.startsWith('e509_live_') ? await one<{ id: string; organizer_id: string; scopes: string[]; revoked_at: Date | null }>(`select id, organizer_id, scopes, revoked_at from api_keys where key_hash = $1`, [sha(key)]) : null;
    if (!k || k.revoked_at) fail(401, 'Clé API invalide ou révoquée');
    const log = (status: number) => db().query(`insert into api_requests (id, key_id, method, path, status) values ($1,$2,$3,$4,$5)`, [newId('ar'), k!.id, c.method ?? 'GET', (c.path ?? '/v1').slice(0, 160), status]).catch(() => {});
    if (!(await benefitsFor(k!.organizer_id)).includes('api')) { await log(403); fail(403, 'L’accès API de cette organisation est suspendu'); }
    if (!k!.scopes.includes(scope)) { await log(403); fail(403, `Cette clé n’a pas l’autorisation « ${scope} »`); }
    const cfg = await getConfig();
    const n = Number((await one<{ count: number }>(
      `insert into api_usage (key_id, minute, count) values ($1, date_trunc('minute', now()), 1) on conflict (key_id, minute) do update set count = api_usage.count + 1 returning count`, [k!.id]))?.count ?? 1);
    if (n > cfg.apiLimits.perMinute) { await log(429); fail(429, `Limite dépassée : ${cfg.apiLimits.perMinute} requêtes par minute`); }
    await db().query(`update api_keys set last_used_at = now() where id = $1`, [k!.id]);
    return { orgId: k!.organizer_id, log };
  }

  const publicEvent = (e: EventItem) => ({
    id: e.id, slug: e.slug, title: e.title, description: e.description, start: e.start, end: e.end, status: e.status, currency: e.currency,
    venue: e.venue ? { name: e.venue.name, address: e.venue.address, city: e.venue.city } : null, online: !!e.online,
    url: `${siteUrl()}/e/${e.slug}`, checkoutUrl: `${siteUrl()}/e/${e.slug}/achat`,
    tickets: e.tickets.map((t) => ({ id: t.id, name: t.name, price: t.price, quota: t.quota, sold: t.sold, remaining: Math.max(0, t.quota - t.sold), salesStart: t.salesStart, salesEnd: t.salesEnd })),
  });

  const v1Events: Handler = async (c) => {
    const { orgId, log } = await authKey(c, 'events:read');
    const rows = await all<{ data: EventItem }>(`select data from events where organizer_id = $1 and status = 'published' order by start_at limit 200`, [orgId]);
    await log(200);
    return { data: rows.map((r) => publicEvent(r.data)) };
  };
  const v1Event: Handler = async (c) => {
    const { orgId, log } = await authKey(c, 'events:read');
    const r = await one<{ data: EventItem }>(`select data from events where organizer_id = $1 and status = 'published' and (id = $2 or slug = $2)`, [orgId, c.params.id]);
    if (!r) { await log(404); fail(404, 'Événement introuvable'); }
    await log(200);
    return { data: publicEvent(r!.data) };
  };
  const v1Sales: Handler = async (c) => {
    const { orgId, log } = await authKey(c, 'sales:read');
    const rows = await all<{ id: string; title: string; orders: string; tickets: string; revenue: string | null; currency: string }>(
      `select e.id, e.data->>'title' as title, e.data->>'currency' as currency, count(o.id) as orders,
         coalesce(sum((select sum((it->>'qty')::int) from jsonb_array_elements(o.data->'items') it)), 0) as tickets,
         sum((o.data->>'subtotal')::numeric - (o.data->>'discount')::numeric) as revenue
       from events e left join orders o on o.event_id = e.id and o.status in ('paid', 'partially_refunded')
       where e.organizer_id = $1 group by e.id order by e.start_at desc limit 200`, [orgId]);
    await log(200);
    // Chiffres agrégés seulement : jamais de nom, d'email ni de téléphone d'acheteur
    return { data: rows.map((r) => ({ eventId: r.id, title: r.title, currency: r.currency, orders: Number(r.orders), tickets: Number(r.tickets), revenue: Math.round(Number(r.revenue ?? 0)) })) };
  };

  // ----- Webhooks (gestion) -----

  const listHooks: Handler = async (c) => {
    const orgId = org(c, 'settings');
    const rows = await all<{ id: string; url: string; events: string[]; active: boolean; failures: number; created_at: Date }>(`select id, url, events, active, failures, created_at from webhooks where organizer_id = $1 order by created_at desc`, [orgId]);
    const dl = await all<{ webhook_id: string; event: string; at: Date; status_code: number | null; ok: boolean; error: string | null }>(
      `select d.webhook_id, d.event, d.at, d.status_code, d.ok, d.error from webhook_deliveries d join webhooks w on w.id = d.webhook_id where w.organizer_id = $1 order by d.at desc limit 50`, [orgId]);
    return {
      canCreate: (await benefitsFor(orgId)).includes('api'), events: WEBHOOK_EVENTS,
      hooks: rows.map((r) => ({ id: r.id, url: r.url, events: r.events, active: r.active, failures: r.failures, createdAt: r.created_at.toISOString() })),
      deliveries: dl.map((d) => ({ hookId: d.webhook_id, event: d.event, at: d.at.toISOString(), status: d.status_code, ok: d.ok, error: d.error })),
    };
  };

  const createHook: Handler = async (c) => {
    const orgId = org(c, 'settings');
    await need(orgId);
    const url = str(c.body.url, 300);
    const bad = await checkWebhookUrl(url);
    if (bad) fail(422, bad);
    const events = (Array.isArray(c.body.events) ? c.body.events : []).filter((e): e is (typeof WEBHOOK_EVENTS)[number] => (WEBHOOK_EVENTS as readonly string[]).includes(e as string));
    if (!events.length) fail(422, 'Choisissez au moins un événement');
    const n = Number((await one<{ n: string }>(`select count(*) as n from webhooks where organizer_id = $1`, [orgId]))?.n ?? 0);
    if (n >= 5) fail(409, 'Limite de 5 webhooks atteinte');
    const id = newId('wh');
    const secret = `whsec_${randomBytes(24).toString('base64url')}`;
    await db().query(`insert into webhooks (id, organizer_id, url, secret, events) values ($1,$2,$3,$4,$5)`, [id, orgId, url, secret, events]);
    return { id, secret };
  };

  const deleteHook: Handler = async (c) => {
    const orgId = org(c, 'settings');
    await db().query(`delete from webhooks where id = $1 and organizer_id = $2`, [c.params.id, orgId]);
    return null;
  };

  const testHook: Handler = async (c) => {
    const orgId = org(c, 'settings');
    await need(orgId);
    const hook = await one<{ id: string; url: string; secret: string }>(`select id, url, secret from webhooks where id = $1 and organizer_id = $2`, [c.params.id, orgId]);
    if (!hook) fail(404, 'Webhook introuvable');
    return deliver(hook!, 'ticket.sold', { test: true, orderId: 'test', eventId: 'test', tickets: 1, amount: 0, currency: 'HTG' });
  };

  return [
    ['GET', '/v1/events', v1Events],
    ['GET', '/v1/events/:id', v1Event],
    ['GET', '/v1/sales', v1Sales],
    ['GET', '/org/api/keys', listKeys],
    ['POST', '/org/api/keys', createKey],
    ['DELETE', '/org/api/keys/:id', revokeKey],
    ['GET', '/org/api/usage', usage],
    ['GET', '/org/api/webhooks', listHooks],
    ['POST', '/org/api/webhooks', createHook],
    ['DELETE', '/org/api/webhooks/:id', deleteHook],
    ['POST', '/org/api/webhooks/:id/test', testHook],
  ];
}
