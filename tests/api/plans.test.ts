import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Forfait à vie (prix en dollars réglable) et taux de change réglable à la main. */
const DB = process.env.TEST_DATABASE_URL;

describe.skipIf(!DB)('Forfait à vie et taux de change', () => {
  let pool: pg.Pool;
  let handle: typeof import('../../api/_lib/handler.js').handle;
  let signToken: typeof import('../../api/_lib/auth.js').signToken;
  let premium: typeof import('../../api/_lib/premium.js');
  let routes: typeof import('../../api/_lib/routes.js');
  const tag = `pl${Date.now()}`;
  let ipN = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Out = { status: number; body: any };
  const call = async (method: string, path: string, body?: unknown, token?: string): Promise<Out> => {
    const o = (await handle({ method, path, query: {}, body, authorization: token ? `Bearer ${token}` : undefined, ip: `10.4.${Math.floor(ipN / 250) % 250}.${(ipN++ % 250) + 1}` })) as Out;
    return o.status === 204 ? { ...o, status: 200 } : o;
  };
  async function account(n: string, role: 'participant' | 'admin', org: boolean) {
    const id = `u_${tag}${n}`;
    await pool.query(`insert into users (id, email, password_hash, role, data, auth_complete) values ($1,$2,'x',$3,$4, true)`, [id, `${id}@plans.test`, role, JSON.stringify({ name: `Compte ${n}` })]);
    const token = signToken(id);
    let orgId = '';
    if (org) {
      const o = await call('POST', '/auth/organizer', { orgName: `Org ${tag}${n}`, country: 'HT' }, token);
      expect(o.status, JSON.stringify(o.body)).toBe(200);
      orgId = o.body.organizerId;
    }
    return { id, token, orgId };
  }
  const verified = async (orgId: string) => (await pool.query(`select (data->>'verified')::boolean as v from organizers where id = $1`, [orgId])).rows[0].v === true;

  beforeAll(async () => {
    process.env.DATABASE_URL = DB;
    process.env.JWT_SECRET = 'q'.repeat(40);
    delete process.env.VERCEL_ENV;
    delete process.env.PAY_PROVIDER;
    pool = new pg.Pool({ connectionString: DB });
    await pool.query(`delete from settings where key in ('premium', 'rate')`);
    ({ handle } = await import('../../api/_lib/handler.js'));
    ({ signToken } = await import('../../api/_lib/auth.js'));
    premium = await import('../../api/_lib/premium.js');
    routes = await import('../../api/_lib/routes.js');
    await routes.refreshRate(true);
  });
  afterAll(async () => {
    await pool?.query(`delete from settings where key in ('premium', 'rate')`);
    await pool?.query(`delete from users where email like '%@plans.test'`);
    await pool?.end();
  });

  it('l’administration règle le prix à vie (USD) et l’ouverture du forfait ; les autres ne le peuvent pas', async () => {
    const adm = await account('a', 'admin', false);
    const org = await account('o', 'participant', true);
    const cfg = await call('GET', '/premium/config');
    expect(cfg.body).toMatchObject({ lifetimeEnabled: true, lifetimePriceUsd: 200 });
    expect(cfg.body.lifetimePriceHtg).toBe(Math.round(200 * (await call('GET', '/bootstrap')).body.rates.USD));
    const cur = (await call('GET', '/admin/premium/config', undefined, adm.token)).body;
    expect((await call('PUT', '/admin/premium/config', { ...cur, lifetimePriceUsd: 250 }, org.token)).status).toBe(403);
    const put = await call('PUT', '/admin/premium/config', { ...cur, lifetimePriceUsd: 250.456 }, adm.token);
    expect(put.status, JSON.stringify(put.body)).toBe(200);
    expect(put.body.lifetimePriceUsd).toBe(250.46);
    expect((await call('GET', '/premium/config')).body.lifetimePriceUsd).toBe(250.46);
    // Fermé : impossible à souscrire
    await call('PUT', '/admin/premium/config', { ...put.body, lifetimeEnabled: false }, adm.token);
    expect((await call('POST', '/org/premium/subscribe', { plan: 'lifetime', method: 'moncash' }, org.token)).status).toBe(403);
    await call('PUT', '/admin/premium/config', { ...put.body, lifetimeEnabled: true, lifetimePriceUsd: 200 }, adm.token);
  });

  it('forfait à vie : prix en dollars converti au taux du jour, paiement confirmé = abonnement sans fin, badge qui n’expire jamais', async () => {
    const adm = await account('a2', 'admin', false);
    const org = await account('o2', 'participant', true);
    const rate = (await call('GET', '/bootstrap')).body.rates.USD as number;
    const sub = await call('POST', '/org/premium/subscribe', { plan: 'lifetime', method: 'moncash' }, org.token);
    expect(sub.status, JSON.stringify(sub.body)).toBe(200);
    const pay = (await pool.query(`select id, plan, amount, status from premium_payments where organizer_id = $1`, [org.orgId])).rows[0];
    expect(pay).toMatchObject({ plan: 'lifetime', status: 'pending' });
    expect(Number(pay.amount)).toBe(Math.round(200 * rate));
    // Confirmation par l'administration (virement)
    const conf = await call('POST', `/admin/premium/payments/${pay.id}/confirm`, {}, adm.token);
    expect(conf.status, JSON.stringify(conf.body)).toBe(200);
    const s = (await pool.query(`select plan, status, expires_at from premium_subscriptions where organizer_id = $1`, [org.orgId])).rows[0];
    expect(s).toMatchObject({ plan: 'lifetime', status: 'active' });
    expect(new Date(s.expires_at).getFullYear()).toBeGreaterThan(2100);
    // Pas de badge sans approbation de la demande ; une fois approuvée (même ancienne), il ne s'éteint jamais
    expect(await verified(org.orgId)).toBe(false);
    await pool.query(`insert into verification_requests (id, organizer_id, status, data) values ($1,$2,'approved',$3)`, [`vr_${org.orgId}`, org.orgId, JSON.stringify({ id: `vr_${org.orgId}`, organizerId: org.orgId, name: 'x', owner: 'x', email: 'x@plans.test', city: '', docs: [], status: 'approved', submittedAt: '2015-01-01T00:00:00Z', approvedAt: '2015-01-01T00:00:00Z' })]);
    await premium.recompute(org.orgId);
    expect(await verified(org.orgId)).toBe(true);
    await premium.premiumMaintenance();
    expect(await verified(org.orgId)).toBe(true);
    // Déjà à vie : rien à payer de plus
    expect((await call('POST', '/org/premium/subscribe', { plan: 'lifetime', method: 'moncash' }, org.token)).status).toBe(409);
    expect((await call('POST', '/org/premium/subscribe', { plan: 'yearly', method: 'moncash' }, org.token)).status).toBe(409);
    expect((await call('GET', '/org/premium', undefined, org.token)).body.subscription.plan).toBe('lifetime');
  });

  it('taux de change : l’administration le fixe à la main (plus de mise à jour automatique) puis revient à l’automatique', async () => {
    const adm = await account('a3', 'admin', false);
    const org = await account('o3', 'participant', true);
    expect((await call('GET', '/admin/rate')).status).toBe(401);
    expect((await call('GET', '/admin/rate', undefined, org.token)).status).toBe(403);
    expect((await call('PUT', '/admin/rate', { mode: 'manual', usdToHtg: 150 }, org.token)).status).toBe(403);
    for (const bad of [0, -5, 5, 99999, 'abc', null]) expect((await call('PUT', '/admin/rate', { mode: 'manual', usdToHtg: bad }, adm.token)).status, String(bad)).toBe(422);
    const r = await call('PUT', '/admin/rate', { mode: 'manual', usdToHtg: 150.123 }, adm.token);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ usdToHtg: 150.12, manual: true, source: 'manuel' });
    expect((await call('GET', '/bootstrap')).body.rates.USD).toBe(150.12);
    // La mise à jour automatique est suspendue
    let called = 0;
    const res = await routes.updateMarketRate((async () => { called++; return new Response('{}'); }) as unknown as typeof fetch);
    expect(res).toMatchObject({ updated: false, rate: 150.12, reason: 'taux fixé à la main' });
    expect(called).toBe(0);
    // Le prix à vie suit le taux fixé
    expect((await call('GET', '/premium/config')).body.lifetimePriceHtg).toBe(Math.round(200 * 150.12));
    // Retour à l'automatique : la source est interrogée de nouveau
    const back = await call('PUT', '/admin/rate', { mode: 'auto' }, adm.token);
    expect(back.status, JSON.stringify(back.body)).toBe(200);
    expect(back.body.manual).toBe(false);
    expect((await call('GET', '/admin/rate', undefined, adm.token)).body.manual).toBe(false);
  });
});
