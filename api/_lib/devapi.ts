import { createHash, createHmac, randomBytes } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import https from 'node:https';
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

/** IPv6 → 16 octets (gère « :: » et la forme IPv4 finale), ou null si illisible. */
function ipv6Bytes(ip: string): number[] | null {
  let s = ip.toLowerCase().split('%')[0]!;
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (v4) {
    const o = v4[1]!.split('.').map(Number);
    if (o.length !== 4 || o.some((n) => !(n >= 0 && n <= 255))) return null;
    s = s.slice(0, -v4[1]!.length) + ((o[0]! << 8) | o[1]!).toString(16) + ':' + ((o[2]! << 8) | o[3]!).toString(16);
  }
  const parts = s.split('::');
  if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(':') : [];
  const tail = parts.length === 2 && parts[1] ? parts[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (parts.length === 1 ? head.length !== 8 : missing < 1) return null;
  const groups = [...head, ...Array(parts.length === 2 ? missing : 0).fill('0'), ...tail];
  if (groups.length !== 8) return null;
  const out: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    const n = parseInt(g, 16);
    out.push(n >> 8, n & 255);
  }
  return out;
}

function privateV4(a: number, b: number, c: number) {
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 || // réseau local, privé, boucle locale, multicast et réservé
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113)
  );
}

/** Adresse privée, locale ou réservée : un webhook ne doit jamais pouvoir viser le réseau interne du serveur (SSRF). */
export function privateIp(ip: string) {
  if (ip.includes(':')) {
    const b = ipv6Bytes(ip);
    if (!b) return true; // illisible : refusée
    const allZero = (from: number, to: number) => b.slice(from, to).every((x) => x === 0);
    if (allZero(0, 15) && (b[15] === 0 || b[15] === 1)) return true; // :: et ::1
    if (b[0] === 0xfe && (b[1]! & 0xc0) === 0x80) return true; // fe80::/10
    if ((b[0]! & 0xfe) === 0xfc) return true; // fc00::/7
    if (b[0] === 0xff) return true; // multicast
    if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8) return true; // documentation
    if (allZero(0, 10) && b[10] === 0xff && b[11] === 0xff) return privateV4(b[12]!, b[13]!, b[14]!); // IPv4 mappée
    if (allZero(0, 12)) return privateV4(b[12]!, b[13]!, b[14]!); // IPv4 compatible
    if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b) return privateV4(b[12]!, b[13]!, b[14]!); // NAT64
    if (b[0] === 0x20 && b[1] === 0x02) return privateV4(b[2]!, b[3]!, b[4]!); // 6to4
    return false;
  }
  const o = ip.split('.').map(Number);
  if (o.length !== 4 || o.some((n) => !(n >= 0 && n <= 255))) return true;
  return privateV4(o[0]!, o[1]!, o[2]!);
}
/** Seul un test local peut autoriser http et les adresses privées (jamais en production). */
const testMode = () => process.env.NODE_ENV !== 'production' && process.env.VERCEL_ENV !== 'production' && process.env.WEBHOOK_ALLOW_PRIVATE === '1';

type Target = { error: string } | { ip: string; family: 4 | 6 } | { test: true };

/** Contrôle l'adresse et renvoie l'IP publique vers laquelle se connecter (connexion épinglée : pas de seconde résolution). */
async function resolveTarget(raw: string): Promise<Target> {
  let u: URL;
  try { u = new URL(raw); } catch { return { error: 'Adresse invalide' }; }
  if (u.protocol !== 'https:' && !(testMode() && u.protocol === 'http:')) return { error: 'L’adresse doit commencer par https://' };
  if (u.username || u.password) return { error: 'L’adresse ne doit pas contenir d’identifiants' };
  if (testMode()) return { test: true };
  if (u.port && u.port !== '443') return { error: 'Seul le port 443 est accepté' };
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.localhost') || host.endsWith('.internal')) return { error: 'Adresse locale refusée' };
  try {
    const found = isIP(host) ? [{ address: host, family: isIP(host) }] : await lookup(host, { all: true });
    if (!found.length || found.some((r) => privateIp(r.address))) return { error: 'Adresse locale ou privée refusée' };
    return { ip: found[0]!.address, family: found[0]!.family === 6 ? 6 : 4 };
  } catch {
    return { error: 'Adresse introuvable' };
  }
}

export async function checkWebhookUrl(raw: string): Promise<string | null> {
  const t = await resolveTarget(raw);
  return 'error' in t ? t.error : null;
}

/** POST vers l'adresse vérifiée, en se connectant à l'IP déjà contrôlée (le nom de domaine ne peut plus pointer ailleurs entre-temps). */
function postPinned(raw: string, ip: string, family: 4 | 6, headers: Record<string, string>, body: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const u = new URL(raw);
    const req = https.request(
      {
        host: u.hostname.replace(/^\[|\]$/g, ''), servername: isIP(u.hostname) ? undefined : u.hostname, port: 443, path: `${u.pathname}${u.search}`, method: 'POST',
        headers: { ...headers, 'Content-Length': String(Buffer.byteLength(body)), Host: u.host }, timeout: 5000,
        lookup: ((_h: string, opts: { all?: boolean }, cb: (...a: unknown[]) => void) => (opts?.all ? cb(null, [{ address: ip, family }]) : cb(null, ip, family))) as never,
      },
      (res) => {
        res.resume(); // la réponse n'est pas lue (jamais renvoyée à l'organisateur)
        resolve(res.statusCode ?? 0);
      },
    );
    req.on('timeout', () => req.destroy(new Error('Délai dépassé')));
    req.on('error', reject);
    req.end(body);
  });
}

/** Envoie un événement à un webhook, signé : « X-Event509-Signature: t=<horodatage>,v1=<HMAC-SHA256 de "t.corps"> ». */
async function deliver(hook: { id: string; url: string; secret: string }, type: string, data: unknown) {
  const body = JSON.stringify({ id: newId('evt'), type, createdAt: new Date().toISOString(), data });
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', hook.secret).update(`${t}.${body}`).digest('hex');
  let code: number | null = null, error: string | null = null;
  try {
    const target = await resolveTarget(hook.url);
    if ('error' in target) throw new Error(target.error);
    const headers = { 'Content-Type': 'application/json', 'User-Agent': 'Event509-Webhooks/1', 'X-Event509-Event': type, 'X-Event509-Signature': `t=${t},v1=${sig}` };
    if ('test' in target) {
      // Essais locaux uniquement (jamais en production)
      const res = await fetch(hook.url, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(5000), headers, body });
      code = res.status;
    } else code = await postPinned(hook.url, target.ip, target.family, headers, body);
    // Aucune redirection n'est suivie : une réponse 3xx est un échec
    if (code < 200 || code >= 300) error = `Réponse ${code}`;
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
    private: e.private === true,
    url: `${siteUrl()}/e/${e.slug}`, checkoutUrl: `${siteUrl()}/e/${e.slug}/achat`,
    tickets: e.tickets.map((t) => ({ id: t.id, name: t.name, price: t.price, quota: t.quota, sold: t.sold, remaining: Math.max(0, t.quota - t.sold), salesStart: t.salesStart, salesEnd: t.salesEnd })),
  });

  const v1Events: Handler = async (c) => {
    const { orgId, log } = await authKey(c, 'events:read');
    const rows = await all<{ data: EventItem }>(`select data from events where organizer_id = $1 and status = 'published' and coalesce(data->>'private', 'false') <> 'true' order by start_at limit 200`, [orgId]);
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
