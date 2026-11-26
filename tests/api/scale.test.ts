import pg from 'pg';
import { dbPooled, pooledUrl } from '../../api/_lib/db.js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Montée en charge : des centaines d'achats simultanés sur un même événement, sur une vraie base.
 * Vérifie ce qui ne doit jamais arriver (vente au-delà du quota, billet en double, erreur 500) et mesure les temps de réponse.
 */
const DB = process.env.TEST_DATABASE_URL;

describe.skipIf(!DB)('Charge : achats simultanés', () => {
  let pool: pg.Pool;
  let handle: typeof import('../../api/_lib/handler.js').handle;
  let signToken: typeof import('../../api/_lib/auth.js').signToken;
  const tag = `scale${Date.now()}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Out = { status: number; body: any };
  let ipN = 0;
  const call = async (method: string, path: string, body?: unknown, token?: string): Promise<Out> =>
    (await handle({ method, path, query: {}, body, authorization: token ? `Bearer ${token}` : undefined, ip: `10.9.${Math.floor(ipN / 250) % 250}.${(ipN++ % 250) + 1}` })) as Out;

  const ticket = (over: Record<string, unknown> = {}) => ({
    id: 't1', name: 'Entrée', kind: 'free', price: 0, quota: 40, sold: 0, salesStart: '2026-01-01T00:00:00', salesEnd: '2030-06-01T20:00:00', maxPerOrder: 4, ...over,
  });
  const event = (tickets: unknown[], over: Record<string, unknown> = {}) => ({
    title: `Concert ${tag}`, description: 'Description assez longue', start: '2030-06-01T20:00:00', end: '2030-06-01T23:00:00', currency: 'HTG', status: 'published', seated: false, maxPerPerson: 8,
    venue: { name: 'Salle', address: 'Rue 1', city: 'Port-au-Prince', country: 'HT' }, categories: ['music'], images: [], tags: [], tickets, ...over,
  });

  async function organizer() {
    const id = `u_${tag}org`;
    await pool.query(`insert into users (id, email, password_hash, role, data, auth_complete) values ($1,$2,'x','participant','{"name":"Org"}', true)`, [id, `${id}@scale.test`]);
    const token = signToken(id);
    const o = await call('POST', '/auth/organizer', { orgName: `Org ${tag}`, country: 'HT' }, token);
    expect(o.status, JSON.stringify(o.body)).toBe(200);
    await pool.query(`update organizers set data = data || '{"verified": true}'::jsonb where id = $1`, [o.body.organizerId]);
    return token;
  }
  async function buyers(n: number) {
    const rows = Array.from({ length: n }, (_, i) => `u_${tag}b${i}`);
    await pool.query(
      `insert into users (id, email, password_hash, role, data, auth_complete) select id, id || '@scale.test', 'x', 'participant', '{"name":"Acheteur"}', true from unnest($1::text[]) as id`,
      [rows],
    );
    return rows.map((id) => signToken(id));
  }
  const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.95)];

  beforeAll(async () => {
    process.env.DATABASE_URL = DB;
    process.env.JWT_SECRET = 'q'.repeat(40);
    delete process.env.VERCEL_ENV;
    pool = new pg.Pool({ connectionString: DB });
    ({ handle } = await import('../../api/_lib/handler.js'));
    ({ signToken } = await import('../../api/_lib/auth.js'));
  });
  afterAll(async () => {
    await pool?.query(`delete from users where email like '%@scale.test'`);
    await pool?.end();
  });

  it('150 acheteurs en même temps pour 40 billets : jamais de survente, aucune erreur serveur, billets uniques', async () => {
    const org = await organizer();
    const ev = await call('PUT', '/org/events', event([ticket()]), org);
    expect(ev.status, JSON.stringify(ev.body)).toBe(200);
    const toks = await buyers(150);
    const times: number[] = [];
    const t0 = Date.now();
    const res = await Promise.all(
      toks.map(async (t, i) => {
        const s = Date.now();
        const r = await call('POST', '/orders', { eventId: ev.body.id, items: [{ ticketTypeId: 't1', qty: 2 }], method: 'card', currency: 'HTG', buyer: { name: `Acheteur ${i}`, email: `b${i}-${tag}@scale.test` } }, t);
        times.push(Date.now() - s);
        return r;
      }),
    );
    const total = Date.now() - t0;
    const ok = res.filter((r) => r.status === 200).length;
    const full = res.filter((r) => r.status === 409).length;
    const other = res.filter((r) => r.status !== 200 && r.status !== 409);
    console.log(`[charge] 150 achats : ${total} ms au total, p95 ${p95(times)} ms, ${ok} acceptés, ${full} complets, ${other.length} autres`);
    expect(other.map((r) => `${r.status} ${JSON.stringify(r.body)}`)).toEqual([]);
    expect(ok).toBe(20); // 40 billets / 2 par commande : exactement, ni plus ni moins
    const sold = (await pool.query(`select (data->'tickets'->0->>'sold')::int as n from events where id = $1`, [ev.body.id])).rows[0].n;
    expect(sold).toBe(40);
    const t = (await pool.query(`select count(*)::int as n, count(distinct code)::int as codes from tickets where event_id = $1`, [ev.body.id])).rows[0];
    expect(t).toEqual({ n: 40, codes: 40 });
  }, 120_000);

  it('plusieurs événements et types de billets en parallèle : chaque quota respecté', async () => {
    const org = await organizer().catch(async () => {
      const r = await pool.query(`select id from users where id = $1`, [`u_${tag}org`]);
      return signToken(r.rows[0].id);
    });
    const evs = await Promise.all([1, 2, 3].map((i) => call('PUT', '/org/events', event([ticket({ id: 't1', quota: 10 }), ticket({ id: 't2', name: 'VIP', quota: 5 })]), org).then((r) => ({ ...r, i }))));
    for (const e of evs) expect(e.status, JSON.stringify(e.body)).toBe(200);
    const toks = await buyers(0).catch(() => []);
    void toks;
    const more = await (async () => {
      const ids = Array.from({ length: 90 }, (_, i) => `u_${tag}m${i}`);
      await pool.query(`insert into users (id, email, password_hash, role, data, auth_complete) select id, id || '@scale.test', 'x', 'participant', '{"name":"Acheteur"}', true from unnest($1::text[]) as id`, [ids]);
      return ids.map((id) => signToken(id));
    })();
    const res = await Promise.all(
      more.map((t, i) =>
        call('POST', '/orders', { eventId: evs[i % 3].body.id, items: [{ ticketTypeId: i % 2 ? 't1' : 't2', qty: 1 }], method: 'card', currency: 'HTG', buyer: { name: `M ${i}`, email: `m${i}-${tag}@scale.test` } }, t),
      ),
    );
    expect(res.filter((r) => r.status !== 200 && r.status !== 409).map((r) => `${r.status} ${JSON.stringify(r.body)}`)).toEqual([]);
    for (const e of evs) {
      const row = (await pool.query(`select data->'tickets' as t from events where id = $1`, [e.body.id])).rows[0].t as { id: string; sold: number; quota: number }[];
      for (const t of row) expect(t.sold, `${e.body.id} ${t.id}`).toBeLessThanOrEqual(t.quota);
    }
  }, 120_000);

  it('limite de fréquence : le ménage ne se fait pas à chaque appel (index sur la date et purge périodique)', async () => {
    const idx = (await pool.query(`select 1 from pg_indexes where tablename = 'rate_events' and indexdef ilike '%(at)%'`)).rowCount;
    expect(idx).toBeGreaterThan(0);
  });

  it('adresse groupée Neon : ajoutée à une adresse directe, jamais deux fois, jamais pour une autre base, interrupteur de secours', () => {
    const direct = 'postgresql://u:p%40w@ep-cool-sky-123456.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require';
    expect(new URL(pooledUrl(direct)).hostname).toBe('ep-cool-sky-123456-pooler.c-2.us-east-1.aws.neon.tech');
    expect(pooledUrl(direct)).toContain('u:p%40w@'); // identifiants et options conservés
    expect(pooledUrl(direct)).toContain('sslmode=require');
    const pooled = pooledUrl(direct);
    expect(pooledUrl(pooled)).toBe(pooled); // idempotent
    expect(pooledUrl('postgresql://e5:e5@127.0.0.1:5544/e5test')).toBe('postgresql://e5:e5@127.0.0.1:5544/e5test');
    expect(pooledUrl('postgresql://u:p@db.exemple.com/x')).toBe('postgresql://u:p@db.exemple.com/x');
    expect(pooledUrl('pas une adresse')).toBe('pas une adresse');
    process.env.DB_POOLER = '0';
    expect(pooledUrl(direct)).toBe(direct);
    delete process.env.DB_POOLER;
    const save = process.env.DATABASE_URL;
    process.env.DATABASE_URL = direct;
    expect(dbPooled()).toBe(true);
    process.env.DATABASE_URL = 'postgresql://e5:e5@127.0.0.1:5544/e5test';
    expect(dbPooled()).toBe(false);
    process.env.DATABASE_URL = save;
  });

  it('catalogue public : une seule lecture pour des centaines de visiteurs simultanés ; copie renouvelée à chaque changement ; jamais partagée avec un compte', async () => {
    const routes = await import('../../api/_lib/routes.js');
    const org = await organizer().catch(async () => signToken(`u_${tag}org`));
    process.env.BOOTSTRAP_CACHE_MS = '60000';
    routes.clearPublicBootstrap();
    try {
      // Lectures réelles du catalogue (la requête des événements) comptées sur le pool de l'API
      const orig = pg.Pool.prototype.query;
      let reads = 0;
      const spy = vi.spyOn(pg.Pool.prototype, 'query').mockImplementation(function (this: pg.Pool, ...a: unknown[]) {
        if (typeof a[0] === 'string' && a[0].includes('order by start_at')) reads++;
        return (orig as (...x: unknown[]) => unknown).apply(this, a);
      } as typeof pg.Pool.prototype.query);
      const res = await Promise.all(Array.from({ length: 200 }, () => call('GET', '/bootstrap')));
      expect(res.every((r) => r.status === 200)).toBe(true);
      expect(reads).toBe(1); // 200 visiteurs, une seule lecture de la base
      // Toutes les réponses viennent de la même lecture
      const first = JSON.stringify(res[0]!.body);
      expect(res.every((r) => JSON.stringify(r.body) === first)).toBe(true);
      // Un événement publié change le catalogue : la copie est renouvelée tout de suite
      const ev = await call('PUT', '/org/events', event([ticket({ quota: 7 })]), org);
      expect(ev.status, JSON.stringify(ev.body)).toBe(200);
      const after = await call('GET', '/bootstrap');
      expect(after.body.events.some((e: { id: string }) => e.id === ev.body.id)).toBe(true);
      // Une personne connectée reçoit toujours sa propre vue (jamais la copie du visiteur)
      const priv = await call('PUT', '/org/events', event([ticket()], { private: true, title: `Privé ${tag}` }), org);
      expect(priv.status, JSON.stringify(priv.body)).toBe(200);
      const me = await call('GET', '/bootstrap', undefined, org);
      expect(me.body.events.some((e: { id: string }) => e.id === priv.body.id)).toBe(true);
      expect((await call('GET', '/bootstrap')).body.events.some((e: { id: string }) => e.id === priv.body.id)).toBe(false);
      spy.mockRestore();
    } finally {
      vi.restoreAllMocks();
      delete process.env.BOOTSTRAP_CACHE_MS;
      routes.clearPublicBootstrap();
    }
  });
});
