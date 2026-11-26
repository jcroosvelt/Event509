import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Badge vérifié : choix libre par l'administration, règle des 500 billets, boost gratuit de l'administration. */
const DB = process.env.TEST_DATABASE_URL;

describe.skipIf(!DB)('Badge vérifié et boost', () => {
  let pool: pg.Pool;
  let handle: typeof import('../../api/_lib/handler.js').handle;
  let signToken: typeof import('../../api/_lib/auth.js').signToken;
  let premium: typeof import('../../api/_lib/premium.js');
  const tag = `bd${Date.now()}`;
  let ipN = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Out = { status: number; body: any };
  const call = async (method: string, path: string, body?: unknown, token?: string, query: Record<string, string> = {}): Promise<Out> => {
    const o = (await handle({ method, path, query, body, authorization: token ? `Bearer ${token}` : undefined, ip: `10.6.${Math.floor(ipN / 250)}.${(ipN++ % 250) + 1}` })) as Out;
    return o.status === 204 ? { ...o, status: 200 } : o;
  };
  async function account(role: 'participant' | 'admin', n: string, withOrg: boolean) {
    const id = `u_${tag}${n}`;
    await pool.query(`insert into users (id, email, password_hash, role, data, auth_complete) values ($1,$2,'x',$3,$4, true)`, [id, `${id}@badge.test`, role, JSON.stringify({ name: `Compte ${n}` })]);
    const token = signToken(id);
    let orgId = '';
    if (withOrg) {
      const o = await call('POST', '/auth/organizer', { orgName: `Org ${tag}${n}`, country: 'HT' }, token);
      expect(o.status, JSON.stringify(o.body)).toBe(200);
      orgId = o.body.organizerId;
    }
    return { id, token, orgId };
  }
  const verified = async (orgId: string) => (await pool.query(`select (data->>'verified')::boolean as v from organizers where id = $1`, [orgId])).rows[0].v === true;
  const event = () => ({
    title: `Fête ${tag}`, description: 'Description assez longue', start: '2030-06-01T20:00:00', end: '2030-06-01T23:00:00', currency: 'HTG', status: 'published', seated: false, maxPerPerson: 8,
    venue: { name: 'Salle', address: 'Rue 1', city: 'Port-au-Prince', country: 'HT' }, categories: ['music'], images: [], tags: [],
    tickets: [{ id: 't1', name: 'Entrée', kind: 'paid', price: 500, quota: 5000, sold: 0, salesStart: '2026-01-01T00:00:00', salesEnd: '2030-06-01T20:00:00', maxPerOrder: 4 }],
  });
  async function addTickets(eventId: string, n: number, amount: number, status = 'valid') {
    const k = `${tag}${Math.random().toString(36).slice(2, 8)}`;
    await pool.query(
      `insert into tickets (id, code, event_id, order_id, owner_email, status, data)
       select 'it_' || $1 || g, 'C' || $1 || g, $2, null, 'x@badge.test', $3, jsonb_build_object('amount', $4::numeric) from generate_series(1, $5) g`, [k, eventId, status, amount, n]);
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = DB;
    process.env.JWT_SECRET = 'q'.repeat(40);
    delete process.env.VERCEL_ENV;
    pool = new pg.Pool({ connectionString: DB });
    ({ handle } = await import('../../api/_lib/handler.js'));
    ({ signToken } = await import('../../api/_lib/auth.js'));
    premium = await import('../../api/_lib/premium.js');
  });
  afterAll(async () => {
    await pool?.query(`delete from tickets where owner_email = 'x@badge.test'`);
    await pool?.query(`delete from users where email like '%@badge.test'`);
    await pool?.end();
  });

  it('l’administration choisit n’importe quel organisateur (sans demande ni paiement) ; les autres comptes ne le peuvent pas', async () => {
    const admin = await account('admin', 'a', false);
    const org = await account('participant', 'o', true);
    const other = await account('participant', 'p', true);
    expect(await verified(org.orgId)).toBe(false);
    // Refus : visiteur et organisateur
    expect((await call('POST', `/admin/organizers/${org.orgId}/verification`, { verified: true })).status).toBe(401);
    expect((await call('POST', `/admin/organizers/${org.orgId}/verification`, { verified: true }, other.token)).status).toBe(403);
    expect((await call('GET', '/admin/organizers', undefined, other.token)).status).toBe(403);
    // Liste : tous les organisateurs, même non vérifiés
    const list = await call('GET', '/admin/organizers', undefined, admin.token, { q: tag });
    expect(list.status).toBe(200);
    expect(list.body.map((r: { id: string }) => r.id)).toEqual(expect.arrayContaining([org.orgId, other.orgId]));
    // Don du badge
    const g = await call('POST', `/admin/organizers/${org.orgId}/verification`, { verified: true }, admin.token);
    expect(g.status, JSON.stringify(g.body)).toBe(200);
    expect(await verified(org.orgId)).toBe(true);
    expect(await verified(other.orgId)).toBe(false);
    const sub = (await pool.query(`select status, expires_at from premium_subscriptions where organizer_id = $1`, [org.orgId])).rows[0];
    expect(sub.status).toBe('active');
    const days = (new Date(sub.expires_at).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(363);
    expect(days).toBeLessThan(366);
    // Un abonnement déjà payé plus long n'est jamais raccourci
    await pool.query(`update premium_subscriptions set expires_at = now() + interval '900 days' where organizer_id = $1`, [org.orgId]);
    await call('POST', `/admin/organizers/${org.orgId}/verification`, { verified: true }, admin.token);
    const sub2 = (await pool.query(`select expires_at from premium_subscriptions where organizer_id = $1`, [org.orgId])).rows[0];
    expect((new Date(sub2.expires_at).getTime() - Date.now()) / 86_400_000).toBeGreaterThan(890);
    // Retrait
    expect((await call('POST', `/admin/organizers/${org.orgId}/verification`, { verified: false }, admin.token)).status).toBe(200);
    expect(await verified(org.orgId)).toBe(false);
  });

  it('500 billets payés vendus → badge offert pour 1 an, une seule fois ; gratuits et remboursés ne comptent pas', async () => {
    const o = await account('participant', 's', true);
    const ev = await call('PUT', '/org/events', event(), o.token);
    expect(ev.status, JSON.stringify(ev.body)).toBe(200);
    await addTickets(ev.body.id, 300, 500); // payés
    await addTickets(ev.body.id, 400, 0); // gratuits : ne comptent pas
    await addTickets(ev.body.id, 100, 500, 'refunded'); // remboursés : ne comptent pas
    expect(await premium.paidTicketsSold(o.orgId)).toBe(300);
    expect(await premium.checkSalesBadge(o.orgId)).toBe(false);
    expect(await verified(o.orgId)).toBe(false);
    await addTickets(ev.body.id, 199, 500); // 499
    expect(await premium.checkSalesBadge(o.orgId)).toBe(false);
    await addTickets(ev.body.id, 1, 500); // 500
    expect(await premium.checkSalesBadge(o.orgId)).toBe(true);
    expect(await verified(o.orgId)).toBe(true);
    const sub = (await pool.query(`select expires_at from premium_subscriptions where organizer_id = $1`, [o.orgId])).rows[0];
    expect((new Date(sub.expires_at).getTime() - Date.now()) / 86_400_000).toBeGreaterThan(363);
    // Progression visible par l'organisation
    expect((await call('GET', '/org/badge-progress', undefined, o.token)).body).toMatchObject({ sold: 500, goal: 500, reached: true });
    // Une seule fois : après un retrait, le seuil ne le redonne pas tout seul
    const admin = await account('admin', 'a2', false);
    await call('POST', `/admin/organizers/${o.orgId}/verification`, { verified: false }, admin.token);
    expect(await verified(o.orgId)).toBe(false);
    expect(await premium.checkSalesBadge(o.orgId)).toBe(false);
    expect(await verified(o.orgId)).toBe(false);
  });

  it('le badge offert expire au bout d’un an (la maintenance quotidienne le masque)', async () => {
    const o = await account('participant', 'x', true);
    const admin = await account('admin', 'a3', false);
    await call('POST', `/admin/organizers/${o.orgId}/verification`, { verified: true }, admin.token);
    expect(await verified(o.orgId)).toBe(true);
    await pool.query(`update premium_subscriptions set expires_at = now() - interval '1 day' where organizer_id = $1`, [o.orgId]);
    await premium.premiumMaintenance();
    expect(await verified(o.orgId)).toBe(false);
  });

  it('boost : gratuit pour l’administration (même sans place libre), payant pour les autres', async () => {
    const admin = await account('admin', 'ab', true);
    await pool.query(`update organizers set data = data || '{"verified": true}'::jsonb where id = $1`, [admin.orgId]);
    const ev = await call('PUT', '/org/events', event(), admin.token);
    expect(ev.status, JSON.stringify(ev.body)).toBe(200);
    expect((await call('GET', '/org/boosts/config', undefined, admin.token)).body?.free ?? (await call('GET', '/boost/config', undefined, admin.token)).body?.free).toBe(true);
    const b = await call('POST', '/org/boosts', { eventId: ev.body.id, days: 7, method: 'moncash' }, admin.token);
    expect(b.status, JSON.stringify(b.body)).toBe(200);
    expect(b.body.paid).toBe(true);
    const row = (await pool.query(`select amount, status from event_boosts where id = $1`, [b.body.id])).rows[0];
    expect(Number(row.amount)).toBe(0);
    expect(row.status).toBe('active');
    // Organisateur ordinaire : pas gratuit
    const o = await account('participant', 'ob', true);
    await pool.query(`update organizers set data = data || '{"verified": true}'::jsonb where id = $1`, [o.orgId]);
    const ev2 = await call('PUT', '/org/events', event(), o.token);
    const b2 = await call('POST', '/org/boosts', { eventId: ev2.body.id, days: 7, method: 'moncash' }, o.token);
    expect(b2.status, JSON.stringify(b2.body)).toBe(200);
    expect(b2.body.paid).toBe(false);
    expect(Number((await pool.query(`select amount from event_boosts where id = $1`, [b2.body.id])).rows[0].amount)).toBeGreaterThan(0);
  });
});
