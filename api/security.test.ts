import { createHmac, generateKeyPairSync, randomBytes } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { boundedNumber, safeWebUrl } from './_lib/safety.js';
import { privateIp, checkWebhookUrl } from './_lib/devapi.js';

// ---------- Unitaires (toujours exécutés) ----------

describe('adresses web saisies par les utilisateurs (XSS par « javascript: »)', () => {
  it('accepte http(s) et refuse tout le reste', () => {
    expect(safeWebUrl('https://lakay.ht')).toBe('https://lakay.ht/');
    expect(safeWebUrl('lakay.ht/events')).toBe('https://lakay.ht/events');
    expect(safeWebUrl('http://exemple.com', { httpsOnly: true })).toBeNull();
    for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:x', 'file:///etc/passwd', 'ftp://x.com', 'https://user:pass@evil.com', 'https://exa mple.com', 'https://a.com/"onmouseover="x', 'https://a.com/<script>', 'https://localhost', '', 'x', null, 12, {}])
      expect(safeWebUrl(bad as unknown), String(bad)).toBeNull();
  });
  it('refuse les adresses trop longues', () => expect(safeWebUrl(`https://a.com/${'x'.repeat(400)}`)).toBeNull());
  it('bornes numériques', () => {
    expect(boundedNumber(5, 0, 10)).toBe(5);
    expect(boundedNumber('7', 0, 10)).toBe(7);
    for (const bad of [-1, 11, NaN, Infinity, '', 'abc', null, undefined, {}, []]) expect(boundedNumber(bad as unknown, 0, 10), String(bad)).toBeNull();
    expect(boundedNumber(1.5, 0, 10, true)).toBeNull();
  });
});

describe('protection SSRF des webhooks', () => {
  it('reconnaît les adresses privées, locales ou réservées sous toutes leurs formes', () => {
    for (const ip of [
      '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '198.18.0.1', '224.0.0.1', '255.255.255.255', '192.0.0.1',
      '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe', '::ffff:10.0.0.1', '64:ff9b::7f00:1', '2002:7f00:1::1', '2001:db8::1', 'zz', '1.2.3',
    ])
      expect(privateIp(ip), ip).toBe(true);
    for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.32.0.1', '2606:4700:4700::1111', '2a00:1450:4009:81f::200e']) expect(privateIp(ip), ip).toBe(false);
  });
  it('refuse les adresses de webhook dangereuses', async () => {
    for (const u of ['http://example.com/hook', 'https://localhost/x', 'https://127.0.0.1/x', 'https://169.254.169.254/latest/meta-data', 'https://[::1]/x', 'https://[::ffff:7f00:1]/x', 'https://10.0.0.5/x', 'https://user:pw@example.com/x', 'https://example.com:8443/x', 'https://service.internal/x', 'https://x.local/x', 'ftp://example.com', 'javascript:alert(1)', 'pas une adresse'])
      expect(await checkWebhookUrl(u), u).not.toBeNull();
  });
});

// ---------- Intégration (base Postgres jetable, faux serveur de paiement local) ----------

const DB = process.env.TEST_DATABASE_URL;

describe.skipIf(!DB)('Sécurité de l’API (intégration)', () => {
  let pool: pg.Pool;
  let srv: http.Server;
  let handle: typeof import('./_lib/handler.js').handle;
  let routes: typeof import('./_lib/routes.js').routes;
  let signToken: typeof import('./_lib/auth.js').signToken;
  let hashPassword: typeof import('./_lib/auth.js').hashPassword;
  // état des paiements du faux fournisseur : référence → 'ok' | 'failed' (sinon : en attente)
  const payStates = new Map<string, 'ok' | 'failed'>();
  let payCalls = 0;
  let ipN = 0;
  let seq = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Out = { status: number; body: any; headers?: Record<string, string | string[]> };
  // Une réponse « 204 sans contenu » signifie « réussi » : on la compte comme 200
  const norm = async (r: Promise<Out>) => { const o = await r; return o.status === 204 ? { ...o, status: 200 } : o; };
  const call = (method: string, path: string, body?: unknown, token?: string, ip = `10.9.${Math.floor(ipN / 250)}.${(ipN++ % 250) + 1}`, extra: Record<string, string | undefined> = {}) =>
    norm(handle({ method, path, query: {}, body, authorization: token ? `Bearer ${token}` : undefined, ip, ...extra }) as Promise<Out>);
  const callQ = (method: string, path: string, query: Record<string, string>, token?: string) =>
    handle({ method, path, query, body: undefined, authorization: token ? `Bearer ${token}` : undefined, ip: `10.8.${Math.floor(ipN / 250)}.${(ipN++ % 250) + 1}` }) as Promise<Out>;

  /** Organisateur avec son organisation (inscription par e-mail, possible tant que Google n'est pas configuré). */
  async function organizer(verified = true) {
    const n = ++seq;
    const email = `sec${n}-${Date.now()}@sec.test`;
    const r = await call('POST', '/auth/signup', { name: `Orga Test${n}`, email, password: 'Soleil2026x', acceptTerms: true });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const up = await call('POST', '/auth/organizer', { orgName: `Org Sec ${n}`, country: 'HT' }, r.body.token);
    expect(up.status, JSON.stringify(up.body)).toBe(200);
    const orgId = up.body.organizerId as string;
    if (verified) await pool.query(`update organizers set data = data || '{"verified": true}'::jsonb where id = $1`, [orgId]);
    return { token: r.body.token as string, id: r.body.user.id as string, orgId, email };
  }
  async function adminUser() {
    const id = `u_secadm${++seq}${Date.now()}`;
    await pool.query(`insert into users (id, email, password_hash, role, data, auth_complete) values ($1,$2,'x','admin','{"name":"Admin Sec"}', true)`, [id, `${id}@sec.test`]);
    return { id, token: signToken(id) };
  }
  const evBody = (o: Record<string, unknown> = {}) => ({
    title: 'Concert de test', description: 'Description', start: '2030-06-01T20:00:00', end: '2030-06-01T23:00:00', currency: 'HTG', status: 'published', seated: false, maxPerPerson: 8,
    venue: { name: 'Salle', address: 'Rue 1', city: 'Jacmel' }, categories: ['music'], images: [], tags: [],
    tickets: [{ id: 't1', name: 'Standard', kind: 'paid', price: 500, quota: 20, sold: 0, salesStart: '2026-01-01T00:00:00', salesEnd: '2030-06-01T20:00:00', maxPerOrder: 5 }], ...o,
  });
  async function eventOf(o: Awaited<ReturnType<typeof organizer>>, body: Record<string, unknown> = {}) {
    const r = await call('PUT', '/org/events', evBody(body), o.token);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    return r.body as { id: string; slug: string; status: string; tickets: { id: string }[] };
  }
  /** Compte acheteur (obligatoire pour acheter). */
  let buyerTok = '';
  async function buyerToken() {
    if (buyerTok) return buyerTok;
    const id = `u_secbuy${Date.now()}`;
    await pool.query(`insert into users (id, email, password_hash, role, data, auth_complete) values ($1,$2,'x','participant','{"name":"Acheteur Sec"}', true)`, [id, `${id}@sec.test`]);
    buyerTok = signToken(id);
    return buyerTok;
  }
  const order = async (eventId: string, extra: Record<string, unknown> = {}, ip?: string) =>
    call('POST', '/orders', { eventId, items: [{ ticketTypeId: 't1', qty: 1 }], method: 'moncash', currency: 'HTG', buyer: { name: 'Acheteur', email: `buyer${++seq}@sec.test` }, ...extra }, await buyerToken(), ip);

  beforeAll(async () => {
    process.env.DATABASE_URL = DB;
    process.env.JWT_SECRET = 'q'.repeat(40);
    delete process.env.VERCEL_ENV;
    delete process.env.GOOGLE_CLIENT_ID;
    srv = http.createServer((req, res) => {
      let b = '';
      req.on('data', (d) => (b += d));
      req.on('end', () => {
        payCalls++;
        res.setHeader('content-type', 'application/json');
        const j = b ? JSON.parse(b) : {};
        if (req.url?.endsWith('paiement-marchand')) return void res.end(JSON.stringify({ status: true, url: 'https://pay.example/checkout', transaction_id: `tx_${payCalls}` }));
        const st = payStates.get(j.refference_id);
        res.end(JSON.stringify(st ? { status: true, trans_status: st } : { status: false }));
      });
    });
    await new Promise<void>((r) => srv.listen(0, r));
    process.env.PAY_BASE_URL = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    pool = new pg.Pool({ connectionString: DB });
    for (const t of ['rate_events']) await pool.query(`delete from ${t}`);
    await pool.query(`delete from users where email like '%@sec.test'`);
    ({ handle } = await import('./_lib/handler.js'));
    ({ routes } = await import('./_lib/routes.js'));
    ({ signToken, hashPassword } = await import('./_lib/auth.js'));
  });
  afterAll(async () => {
    delete process.env.PAY_CLIENT_ID;
    delete process.env.VERCEL_ENV;
    await pool?.query(`delete from users where email like '%@sec.test'`);
    await pool?.end();
    srv?.close();
  });
  beforeEach(() => {
    delete process.env.PAY_CLIENT_ID;
    delete process.env.VERCEL_ENV;
  });

  // ---- Accès non autorisé et authentification invalide

  it('S1. toute route d’organisation, d’administration ou de compte refuse un visiteur anonyme', async () => {
    // (les routes de changement de mot de passe par code répondent 503 tant que WhatsApp n'est pas configuré : rien n'est exposé)
    const guarded = routes.filter(([, p]) => /^\/(org|admin|me)\//.test(p) || /^\/auth\/(security|sessions|profile|reauth|passkeys\/register|google\/link)/.test(p) || p === '/auth/password' || p === '/auth/organizer');
    expect(guarded.length).toBeGreaterThan(90);
    const bad: string[] = [];
    for (const [method, pattern] of guarded) {
      const r = await call(method, pattern.replace(/:\w+/g, 'x'), {});
      if (![401, 403].includes(r.status)) bad.push(`${method} ${pattern} → ${r.status}`);
    }
    console.info('S1 routes non protégées :', bad);
    expect(bad).toEqual([]);
    // Les autres routes d'écriture sensibles
    for (const [method, path] of [['POST', '/orders/x/refund'], ['POST', '/tickets/x/transfer'], ['POST', '/tickets/x/resale'], ['POST', '/resale/x/buy'], ['DELETE', '/resale/code/x'], ['POST', '/orders/x/claim'], ['DELETE', '/auth/me'], ['PATCH', '/auth/me']] as const)
      expect([401, 404], `${method} ${path}`).toContain((await call(method, path, { to: 'a@sec.test', price: 100, reason: 'x', key: 'mauvaise', name: 'X', email: 'a@sec.test' })).status);
  });

  it('S2. jetons invalides, expirés, falsifiés ou à usage précis : aucune session', async () => {
    const o = await organizer();
    expect((await call('GET', '/org/events', undefined, 'n-importe-quoi')).status).toBe(401);
    expect((await call('GET', '/org/events', undefined, `${o.token}x`)).status).toBe(401);
    // Jeton expiré, signé avec la bonne clé
    const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
    const sign = (payload: unknown) => {
      const h = b64({ alg: 'HS256', typ: 'JWT' });
      const p = b64(payload);
      return `${h}.${p}.${createHmac('sha256', process.env.JWT_SECRET!).update(`${h}.${p}`).digest('base64url')}`;
    };
    const now = Math.floor(Date.now() / 1000);
    expect((await call('GET', '/org/events', undefined, sign({ sub: o.id, iat: now - 90 * 86400, exp: now - 60 }))).status).toBe(401);
    expect((await call('GET', '/org/events', undefined, sign({ sub: o.id, iat: now, exp: now + 600 }))).status).toBe(200);
    // Jeton à usage précis (confirmation d'e-mail…) : jamais une session
    expect((await call('GET', '/org/events', undefined, sign({ sub: o.id, iat: now, exp: now + 600, p: 'verify-email' }))).status).toBe(401);
    // Jeton signé avec une autre clé
    const h = b64({ alg: 'HS256', typ: 'JWT' });
    const p = b64({ sub: o.id, exp: now + 600 });
    expect((await call('GET', '/org/events', undefined, `${h}.${p}.${createHmac('sha256', 'autre-cle-autre-cle-autre-cle-autre').update(`${h}.${p}`).digest('base64url')}`)).status).toBe(401);
    // Algorithme « none »
    expect((await call('GET', '/org/events', undefined, `${b64({ alg: 'none', typ: 'JWT' })}.${p}.`)).status).toBe(401);
    // Un identifiant d'utilisateur fourni par le navigateur n'est jamais cru
    expect((await call('GET', '/org/events', { userId: 'u_autre', organizerId: 'org_autre' }, undefined)).status).toBe(401);
  });

  it('S2b. la déconnexion rend inutilisable un ancien jeton', async () => {
    const o = await organizer();
    expect((await call('GET', '/auth/me', undefined, o.token)).status).toBe(200);
    await new Promise((r) => setTimeout(r, 1100));
    expect((await call('POST', '/auth/logout', {}, o.token)).status).toBe(200);
    expect((await call('GET', '/auth/me', undefined, o.token)).status).toBe(401);
  });

  // ---- Contrôle d'accès : IDOR et élévation de privilèges

  it('S3. IDOR : une organisation ne peut ni lire ni modifier les ressources d’une autre', async () => {
    const a = await organizer();
    const b = await organizer();
    const ev = await eventOf(a);
    // Événement
    expect((await call('PUT', '/org/events', evBody({ id: ev.id, title: 'Piraté' }), b.token)).status).toBe(403);
    expect((await call('POST', `/org/events/${ev.id}/status`, { status: 'cancelled' }, b.token)).status).toBe(404);
    expect((await call('DELETE', `/org/events/${ev.id}`, undefined, b.token)).status).toBe(404);
    expect((await call('GET', `/org/events/${ev.id}/stats`, undefined, b.token)).status).toBeGreaterThanOrEqual(400);
    expect((await call('GET', '/org/events', undefined, b.token)).body.map((e: { id: string }) => e.id)).not.toContain(ev.id);
    expect(((await pool.query(`select data->>'title' as t from events where id = $1`, [ev.id])).rows[0] as { t: string }).t).toBe('Concert de test');
    // Codes promo
    const promo = await call('PUT', '/org/promos', { code: `SEC${Date.now() % 100000}`, eventId: 'all', type: 'percent', value: 10, limit: 5, used: 0, active: true, expiresAt: '2030-01-01T00:00:00', id: '' }, a.token);
    expect(promo.status, JSON.stringify(promo.body)).toBe(200);
    const pid = (await pool.query(`select id from promo_codes where organizer_id = $1 limit 1`, [a.orgId])).rows[0]?.id as string;
    expect((await call('PUT', '/org/promos', { id: pid, code: 'VOLE123', eventId: 'all', type: 'percent', value: 100, limit: 99, used: 0, active: true, expiresAt: '2030-01-01T00:00:00' }, b.token)).status).toBe(403);
    expect((await call('GET', '/org/promos', undefined, b.token)).body).toEqual([]);
    // Équipe
    const inv = await call('POST', '/org/team', { email: `membre-${Date.now()}@sec.test`, name: 'M', role: 'staff' }, a.token);
    expect(inv.status).toBe(200);
    expect((await call('PATCH', `/org/team/${inv.body.id}`, { role: 'admin' }, b.token)).status).toBe(404);
    expect((await call('DELETE', `/org/team/${inv.body.id}`, undefined, b.token)).status).toBeLessThan(500);
    expect((await call('GET', '/org/team', undefined, b.token)).body.map((m: { id: string }) => m.id)).not.toContain(inv.body.id);
    // Remboursements et versements
    expect((await call('POST', '/org/refunds/inconnu/decide', { status: 'approved' }, b.token)).status).toBe(404);
    expect((await call('GET', '/org/payouts', undefined, b.token)).body).toEqual([]);
    // Un organisateur n'est pas administrateur
    for (const [m, p] of [['GET', '/admin/users'], ['GET', '/admin/events'], ['POST', '/admin/verifications/x'], ['GET', '/admin/orders'], ['POST', '/admin/premium/payments/x/confirm'], ['GET', '/admin/recovery-requests'], ['PUT', '/admin/fees']] as const)
      expect((await call(m, p, {}, a.token)).status, `${m} ${p}`).toBe(403);
    // ... et ne s'attribue pas de droits en les envoyant
    const me = await call('PATCH', '/auth/me', { role: 'admin', status: 'active', organizerId: 'org_event509', teamRole: 'admin', emailVerified: true, phoneVerified: true }, a.token);
    expect(me.status).toBe(200);
    const row = (await pool.query(`select role, organizer_id, data from users where id = $1`, [a.id])).rows[0];
    expect(row.role).toBe('organizer');
    expect(row.organizer_id).toBe(a.orgId);
    expect(row.data.phoneVerified).toBeUndefined();
    // Un membre d'équipe sans la permission « équipe » ne gère pas l'équipe
    const staff = await call('POST', '/auth/signup', { name: 'Staff Test', email: inv.body.email, password: 'Soleil2026x', acceptTerms: true });
    expect(staff.status).toBe(200);
    expect(staff.body.user.teamRole).toBe('staff');
    expect((await call('POST', '/org/team', { email: 'x@sec.test', role: 'admin' }, staff.body.token)).status).toBe(403);
    expect((await call('PUT', '/org/events', evBody(), staff.body.token)).status).toBe(403);
  });

  it('S3b. commandes, billets et fichiers : seul le titulaire (ou la clé du lien) y accède', async () => {
    const a = await organizer();
    const ev = await eventOf(a);
    const o = await order(ev.id, { method: 'transfer' });
    expect(o.status).toBe(200);
    const { order: ord, accessKey } = o.body;
    expect((await call('GET', `/orders/${ord.id}`)).status).toBe(404);
    expect((await call('GET', `/orders/${ord.id}`, undefined, undefined, undefined, {})).status).toBe(404);
    expect((await callQ('GET', `/orders/${ord.id}`, { k: 'mauvaise-cle' })).status).toBe(404);
    expect((await callQ('GET', `/orders/${ord.id}`, { k: accessKey })).status).toBe(200);
    // Un compte quelconque ne s'approprie pas la commande avec une fausse clé, ni ne transfère/revend les billets d'autrui
    const other = await organizer();
    expect((await call('POST', `/orders/${ord.id}/claim`, { key: 'fausse' }, other.token)).status).toBe(404);
    const tid = (await pool.query(`select id from tickets where order_id = $1`, [ord.id])).rows[0].id as string;
    expect((await call('POST', `/tickets/${tid}/transfer`, { to: 'x@sec.test' }, other.token)).status).toBe(404);
    expect((await call('POST', `/tickets/${tid}/resale`, { price: 100 }, other.token)).status).toBe(404);
    expect((await call('POST', `/orders/${ord.id}/refund`, { reason: 'x' }, other.token)).status).toBe(404);
    // Entrée en salle : une autre organisation ne valide pas ces billets
    const code = (await pool.query(`select code from tickets where id = $1`, [tid])).rows[0].code as string;
    await pool.query(`update tickets set status = 'valid' where id = $1`, [tid]);
    const chk = await call('POST', '/org/checkin', { code }, other.token);
    expect(chk.body.ok).toBe(false);
    expect((await pool.query(`select status from tickets where id = $1`, [tid])).rows[0].status).toBe('valid');
    expect((await call('POST', '/org/checkin', { code }, a.token)).body.ok).toBe(true);
    expect((await call('POST', '/org/checkin', { code }, a.token)).body.ok).toBe(false); // un billet ne passe qu'une fois
  });

  it('S3c. entrées en direct : compteurs, rythme, agents et dernières entrées ; réservé à l’organisation de l’événement', async () => {
    const a = await organizer();
    const ev = await eventOf(a);
    const o = await order(ev.id, { method: 'transfer' });
    expect(o.status).toBe(200);
    const row = (await pool.query(`select id, code from tickets where order_id = $1`, [o.body.order.id])).rows[0] as { id: string; code: string };
    await pool.query(`update tickets set status = 'valid' where id = $1`, [row.id]);
    const before = await call('GET', `/org/events/${ev.id}/live`, undefined, a.token);
    expect(before.status, JSON.stringify(before.body)).toBe(200);
    expect(before.body).toMatchObject({ eventId: ev.id, entered: 0 });
    expect(before.body.total).toBeGreaterThanOrEqual(1);
    expect(before.body.series).toHaveLength(60);
    expect((await call('POST', '/org/checkin', { code: row.code }, a.token)).body.ok).toBe(true);
    const live = await call('GET', `/org/events/${ev.id}/live`, undefined, a.token);
    expect(live.body.entered).toBe(1);
    expect(live.body.remaining).toBe(live.body.total - 1);
    expect(live.body.last5).toBe(1);
    expect(live.body.series.at(-1).n + live.body.series.at(-2).n).toBe(1);
    expect(live.body.types.find((t: { id: string }) => t.id === ev.tickets[0].id)).toMatchObject({ entered: 1 });
    expect(live.body.agents[0]).toMatchObject({ scans: 1 });
    expect(live.body.recent).toHaveLength(1);
    // Prénom et initiale seulement : ni e-mail ni nom complet
    expect(live.body.recent[0].name).toMatch(/^\S+( \S\.)?$/);
    expect(JSON.stringify(live.body)).not.toMatch(/@/);
    // Une autre organisation et un événement inconnu : introuvable
    const other = await organizer();
    expect((await call('GET', `/org/events/${ev.id}/live`, undefined, other.token)).status).toBe(404);
    expect((await call('GET', '/org/events/inconnu/live', undefined, a.token)).status).toBe(404);
  });

  it('S3d. notifications push : remboursement, versement et litige préviennent la bonne personne, jamais les autres', async () => {
    // Firebase simulé : on enregistre chaque envoi (jeton, titre) sans rien envoyer pour de vrai
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: 'p-test', client_email: 'x@p-test.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() });
    const sent: { token: string; title: string }[] = [];
    const real = globalThis.fetch;
    vi.stubGlobal('fetch', async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.startsWith('https://oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 });
      if (u.startsWith('https://fcm.googleapis.com/')) {
        const m = JSON.parse(String(init?.body)).message as { token: string; notification: { title: string } };
        sent.push({ token: m.token, title: m.notification.title });
        return new Response('{}', { status: 200 });
      }
      return real(url as string, init);
    });
    try {
      const a = await organizer();
      const other = await organizer();
      const ev = await eventOf(a);
      const buyerTokenValue = await buyerToken();
      const buyerId = (await pool.query(`select id from users where data->>'name' = 'Acheteur Sec' limit 1`)).rows[0].id as string;
      const adm = await adminUser();
      const dev = async (token: string, userId: string) => pool.query(`insert into device_tokens (token, owner, user_id) values ($1,$2,$3) on conflict do nothing`, [token, `u:${userId}`, userId]);
      await dev(`tok-org-${a.id}-xxxxxxxxxxxx`, a.id);
      await dev(`tok-other-${other.id}-xxxxxxxxxxx`, other.id);
      await dev(`tok-buy-${buyerId}-xxxxxxxxxxx`, buyerId);
      await dev(`tok-adm-${adm.id}-xxxxxxxxxxxx`, adm.id);
      const to = (who: string) => sent.filter((x) => x.token.startsWith(`tok-${who}-`)).map((x) => x.title);
      const o = await order(ev.id, { method: 'transfer' });
      expect(o.status).toBe(200);
      await pool.query(`update orders set status = 'paid', data = data || '{"status":"paid"}'::jsonb where id = $1`, [o.body.order.id]);
      sent.length = 0;

      // Demande de remboursement : l'organisation est prévenue (pas une autre organisation, pas l'acheteur)
      expect((await call('POST', `/orders/${o.body.order.id}/refund`, { reason: 'Empêchement' }, buyerTokenValue)).status).toBe(200);
      expect(to('org')).toEqual(['Demande de remboursement']);
      expect(to('other')).toEqual([]);
      expect(to('buy')).toEqual([]);

      // Décision : l'acheteur est prévenu, une seule fois
      sent.length = 0;
      const rid = (await pool.query(`select id from refunds where order_id = $1`, [o.body.order.id])).rows[0].id as string;
      expect((await call('POST', `/org/refunds/${rid}`, { status: 'approved' }, a.token)).status).toBe(200);
      expect(to('buy')).toEqual(['Remboursement accepté']);
      expect(to('other')).toEqual([]);

      // Versement : décision de l'administration → l'organisation (jamais une autre)
      sent.length = 0;
      const py = { id: `py_t${Date.now()}`, organizerId: a.orgId, amount: 500, currency: 'HTG', method: 'moncash', destination: { name: 'Marie', phone: '+50937000000' }, status: 'requested', date: '2026-11-18', reference: 'VRS-T' };
      await pool.query(`insert into payouts (id, organizer_id, status, data) values ($1,$2,'requested',$3)`, [py.id, a.orgId, JSON.stringify(py)]);
      expect((await call('POST', `/admin/payouts/${py.id}`, { status: 'paid' }, adm.token)).status).toBe(200);
      expect(to('org')).toEqual(['Versement envoyé']);
      expect(to('other')).toEqual([]);

      // Litige résolu : l'acheteur et l'organisation, pas les autres
      sent.length = 0;
      const dp = { id: `dp_t${Date.now()}`, orderId: o.body.order.id, opener: 'Acheteur', against: ev.id, subject: 'Test', amount: 500, currency: 'HTG', status: 'open', createdAt: '2026-11-18T10:00:00Z', messages: [] };
      await pool.query(`insert into disputes (id, order_id, status, data) values ($1,$2,'open',$3)`, [dp.id, dp.orderId, JSON.stringify(dp)]);
      expect((await call('POST', `/admin/disputes/${dp.id}/resolve`, { status: 'resolved', decision: 'reject', note: 'Refusé' }, adm.token)).status).toBe(200);
      expect(to('buy')).toEqual(['Litige résolu']);
      expect(to('org')).toEqual(['Litige résolu']);
      expect(to('other')).toEqual([]);
      // Passer un litige « en enquête » ne notifie personne
      sent.length = 0;
      await pool.query(`update disputes set status = 'open' where id = $1`, [dp.id]);
      expect((await call('POST', `/admin/disputes/${dp.id}/resolve`, { status: 'investigating' }, adm.token)).status).toBe(200);
      expect(sent).toEqual([]);
      // Bouton « Tester les notifications » : n'écrit qu'aux appareils du compte qui le demande
      sent.length = 0;
      expect((await call('POST', '/me/push-test', {})).status).toBe(401);
      const t1 = await call('POST', '/me/push-test', {}, buyerTokenValue);
      expect(t1.body).toEqual({ configured: true, devices: 1, sent: 1 });
      expect(to('buy')).toEqual(['Notification de test']);
      expect(to('org') .concat(to('other'), to('adm'))).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
      delete process.env.FIREBASE_SERVICE_ACCOUNT;
    }
    // Sans réglage Firebase côté serveur : le test l'explique, rien n'est envoyé
    expect((await call('POST', '/me/push-test', {}, await buyerToken())).body).toEqual({ configured: false, devices: 1, sent: 0 });
  });

  it('S3e. nouvel événement près de chez vous : même ville seulement, une fois, une par jour, réglage respecté', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: 'p-test', client_email: 'x@p-test.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() });
    const sent: { token: string; title: string; body: string }[] = [];
    const real = globalThis.fetch;
    vi.stubGlobal('fetch', async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.startsWith('https://oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 });
      if (u.startsWith('https://fcm.googleapis.com/')) {
        const m = JSON.parse(String(init?.body)).message as { token: string; notification: { title: string; body: string } };
        sent.push({ token: m.token, title: m.notification.title, body: m.notification.body });
        return new Response('{}', { status: 200 });
      }
      return real(url as string, init);
    });
    try {
      const tag = `${Date.now()}`;
      const mk = async (key: string, data: Record<string, unknown>, device = true) => {
        const id = `u_near_${key}_${tag}`;
        await pool.query(`insert into users (id, email, password_hash, role, data, auth_complete) values ($1,$2,'x','participant',$3,true)`, [id, `${id}@sec.test`, JSON.stringify({ name: key, ...data })]);
        if (device) await pool.query(`insert into device_tokens (token, owner, user_id) values ($1,$2,$3)`, [`tok-${key}-${tag}-xxxxxxxxxxxxxxxx`, `u:${id}`, id]);
        return id;
      };
      const got = (key: string) => sent.filter((x) => x.token === `tok-${key}-${tag}-xxxxxxxxxxxxxxxx`);
      await mk('near', { city: 'JACMEL ', country: 'HT' });
      await mk('accent', { city: 'Jàcmel' }); // sans pays : Haïti ; accents ignorés
      await mk('far', { city: 'Cap-Haïtien', country: 'HT' });
      await mk('optout', { city: 'Jacmel', country: 'HT', notifyNearby: false });
      await mk('abroad', { city: 'Jacmel', country: 'US' });
      await mk('nodevice', { city: 'Jacmel', country: 'HT' }, false);
      const a = await organizer();
      const ownerDevice = `tok-owner-${tag}-xxxxxxxxxxxxxxxx`;
      await pool.query(`update users set data = data || '{"city":"Jacmel","country":"HT"}'::jsonb where id = $1`, [a.id]);
      await pool.query(`insert into device_tokens (token, owner, user_id) values ($1,$2,$3)`, [ownerDevice, `u:${a.id}`, a.id]);

      // Brouillon : personne n'est prévenu
      const draft = await eventOf(a, { title: 'Soirée Jacmel', status: 'draft' });
      expect(sent).toEqual([]);
      // Publication : seules les personnes de la ville (avec un téléphone, alertes actives), jamais l'équipe de l'organisation
      const pub = await call('PUT', '/org/events', evBody({ id: draft.id, slug: draft.slug, title: 'Soirée Jacmel', status: 'published' }), a.token);
      expect(pub.status, JSON.stringify(pub.body)).toBe(200);
      expect(pub.body.status).toBe('published');
      expect(got('near').map((x) => x.title)).toEqual(['Nouvel événement près de chez vous']);
      expect(got('near')[0]!.body).toBe('Soirée Jacmel · Jacmel');
      expect(got('accent')).toHaveLength(1);
      for (const k of ['far', 'optout', 'abroad', 'nodevice']) expect(got(k), k).toEqual([]);
      expect(sent.filter((x) => x.token === ownerDevice)).toEqual([]);
      // Modifier l'événement publié : pas de nouvelle alerte
      sent.length = 0;
      expect((await call('PUT', '/org/events', evBody({ id: draft.id, slug: draft.slug, title: 'Soirée Jacmel (nouvelle heure)', status: 'published' }), a.token)).status).toBe(200);
      expect(sent).toEqual([]);
      // Un autre événement le même jour dans la même ville : une alerte de proximité par personne et par jour
      await eventOf(a, { title: 'Autre soirée' });
      expect(sent).toEqual([]);
      // Un événement en ligne ou déjà terminé ne prévient personne
      await eventOf(a, { title: 'Atelier en ligne', venue: null, online: { platform: 'Zoom', url: 'https://zoom.us/j/1' } });
      await eventOf(a, { title: 'Soirée passée', start: '2020-01-01T20:00:00', end: '2020-01-01T23:00:00' }).catch(() => null);
      expect(sent).toEqual([]);
      // Le réglage se change par le profil et est rendu au compte
      const b = await mk('toggle', { city: 'Leogane', country: 'HT' });
      const { signToken: sign } = await import('./_lib/auth.js');
      const off = await call('PATCH', '/auth/me', { notifyNearby: false }, sign(b));
      expect(off.body.notifyNearby).toBe(false);
      await eventOf(a, { title: 'Fête à Léogâne', venue: { name: 'Place', address: 'Centre', city: 'Léogâne' } });
      expect(got('toggle')).toEqual([]);
      const on = await call('PATCH', '/auth/me', { notifyNearby: true }, sign(b));
      expect(on.body.notifyNearby).toBe(true);
    } finally {
      vi.unstubAllGlobals();
      delete process.env.FIREBASE_SERVICE_ACCOUNT;
    }
  });

  it('S3f. alertes de proximité par position du téléphone : rayon 40 km, positions récentes, réglage respecté, position arrondie', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: 'p-test', client_email: 'x@p-test.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() });
    const sent: { token: string; title: string }[] = [];
    const real = globalThis.fetch;
    vi.stubGlobal('fetch', async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.startsWith('https://oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 });
      if (u.startsWith('https://fcm.googleapis.com/')) {
        const m = JSON.parse(String(init?.body)).message as { token: string; notification: { title: string } };
        sent.push({ token: m.token, title: m.notification.title });
        return new Response('{}', { status: 200 });
      }
      return real(url as string, init);
    });
    try {
      const tag = `${Date.now()}`;
      const { signToken: sign } = await import('./_lib/auth.js');
      const mk = async (key: string, data: Record<string, unknown>, pos?: { lat: number; lng: number; days?: number }) => {
        const id = `u_gps_${key}_${tag}`;
        await pool.query(`insert into users (id, email, password_hash, role, data, auth_complete) values ($1,$2,'x','participant',$3,true)`, [id, `${id}@sec.test`, JSON.stringify({ name: key, ...data })]);
        const token = `tok-${key}-${tag}-xxxxxxxxxxxxxxxx`;
        await pool.query(`insert into device_tokens (token, owner, user_id, lat, lng, located_at) values ($1,$2,$3,$4,$5,$6)`,
          [token, `u:${id}`, id, pos?.lat ?? null, pos?.lng ?? null, pos ? new Date(Date.now() - (pos.days ?? 0) * 86_400_000) : null]);
        return { id, token };
      };
      const got = (key: string) => sent.filter((x) => x.token === `tok-${key}-${tag}-xxxxxxxxxxxxxxxx`).map((x) => x.title);
      // Hinche : 19,1456 / -72,0189
      await mk('here', { city: 'Miami', country: 'US' }, { lat: 19.15, lng: -72.02 }); // sur place, profil ailleurs
      await mk('mid', { city: 'Miami', country: 'US' }, { lat: 19.4, lng: -72.1 }); // environ 29 km
      await mk('far', { city: 'Miami', country: 'US' }, { lat: 19.11, lng: -72.69 }); // Saint-Marc, environ 70 km
      await mk('stale', { city: 'Miami', country: 'US' }, { lat: 19.15, lng: -72.02, days: 60 }); // position trop ancienne
      await mk('optout', { city: 'Miami', country: 'US', notifyNearby: false }, { lat: 19.15, lng: -72.02 });
      await mk('nopos', { city: 'Miami', country: 'US' });
      await mk('both', { city: 'Hinche', country: 'HT' }, { lat: 19.15, lng: -72.02 }); // profil ET position : un seul message
      const a = await organizer();
      const ev = await call('PUT', '/org/events', evBody({ title: 'Festival de Hinche', venue: { name: 'Stade', address: 'Centre', city: 'Hinche' } }), a.token);
      expect(ev.status, JSON.stringify(ev.body)).toBe(200);
      for (const k of ['here', 'mid', 'both']) expect(got(k), k).toEqual(['Nouvel événement près de chez vous']);
      for (const k of ['far', 'stale', 'optout', 'nopos']) expect(got(k), k).toEqual([]);

      // Route de position : arrondie, réservée au compte propriétaire de l'appareil, effacée sur demande ou si l'alerte est coupée
      const me = await mk('me', { city: 'Jacmel' });
      const tok = me.token;
      expect((await call('POST', '/devices/location', { token: tok, lat: 18.2345, lng: -72.5347 })).status).toBe(401);
      const ok = await call('POST', '/devices/location', { token: tok, lat: 18.23456, lng: -72.53471 }, sign(me.id));
      expect(ok.body).toEqual({ stored: true });
      expect((await pool.query(`select lat, lng from device_tokens where token = $1`, [tok])).rows[0]).toEqual({ lat: 18.23, lng: -72.53 });
      expect((await call('POST', '/devices/location', { token: tok, lat: 123, lng: 0 }, sign(me.id))).status).toBe(422);
      expect((await call('POST', '/devices/location', { token: tok, lat: 'x', lng: 0 }, sign(me.id))).status).toBe(422);
      // L'appareil d'un autre compte n'est pas modifiable
      const other = await mk('other', { city: 'Jacmel' });
      await call('POST', '/devices/location', { token: tok, lat: 10, lng: 10 }, sign(other.id));
      expect((await pool.query(`select lat from device_tokens where token = $1`, [tok])).rows[0].lat).toBe(18.23);
      // Effacement sur demande
      expect((await call('POST', '/devices/location', { token: tok, clear: true }, sign(me.id))).body).toEqual({ stored: false });
      expect((await pool.query(`select lat, located_at from device_tokens where token = $1`, [tok])).rows[0]).toEqual({ lat: null, located_at: null });
      // Alerte coupée : la position est effacée et plus jamais enregistrée
      await call('POST', '/devices/location', { token: tok, lat: 18.23, lng: -72.53 }, sign(me.id));
      expect((await call('PATCH', '/auth/me', { notifyNearby: false }, sign(me.id))).body.notifyNearby).toBe(false);
      expect((await pool.query(`select lat from device_tokens where token = $1`, [tok])).rows[0].lat).toBeNull();
      expect((await call('POST', '/devices/location', { token: tok, lat: 18.23, lng: -72.53 }, sign(me.id))).body).toEqual({ stored: false });
      expect((await pool.query(`select lat from device_tokens where token = $1`, [tok])).rows[0].lat).toBeNull();
    } finally {
      vi.unstubAllGlobals();
      delete process.env.FIREBASE_SERVICE_ACCOUNT;
    }
  });

  it('S3g. aperçus de partage : titre, date, lieu, prix et image lus dans la base, tout échappé, brouillons introuvables', async () => {
    const a = await organizer();
    const ev = await eventOf(a, { title: 'Concert <b>"Test"</b> & Cie', description: 'Super <script>alert(1)</script> soirée', cover: 'https://exemple.com/affiche.jpg' });
    const r = await callQ('GET', '/share', { kind: 'e', slug: ev.slug });
    expect(r.status).toBe(200);
    const html = String(r.body);
    expect(html).toContain('<meta property="og:title" content="Concert &lt;b&gt;&quot;Test&quot;&lt;/b&gt; &amp; Cie" />');
    expect(html).not.toMatch(/<script|<b>/i);
    expect(html).toContain('<meta property="og:image" content="https://exemple.com/affiche.jpg" />');
    expect(html).toMatch(/og:description" content="[^"]*Jacmel[^"]*dès 500 HTG/);
    expect(html).toMatch(/og:url" content="https:\/\/[^"]+\/e\//);
    expect(html).toContain('summary_large_image');
    // Affiche en dégradé : image par défaut ; fichier du site : adresse absolue
    const grad = await eventOf(a, { title: 'Sans affiche', cover: 'linear-gradient(135deg, #1509F3 0%, #0C0640 100%)' });
    expect(String((await callQ('GET', '/share', { kind: 'e', slug: grad.slug })).body)).toMatch(/og:image" content="https:\/\/[^"]+\/og-default\.png"/);
    const file = await eventOf(a, { title: 'Avec fichier', cover: '/api/files/abcdef123456' });
    expect(String((await callQ('GET', '/share', { kind: 'e', slug: file.slug })).body)).toMatch(/og:image" content="https:\/\/[^"]+\/api\/files\/abcdef123456"/);
    // Brouillon, événement inconnu : rien n'est montré
    const draft = await eventOf(a, { title: 'Secret', status: 'draft' });
    expect((await callQ('GET', '/share', { kind: 'e', slug: draft.slug })).status).toBe(404);
    expect((await callQ('GET', '/share', { kind: 'e', slug: 'inconnu' })).status).toBe(404);
    expect((await callQ('GET', '/share', { kind: 'e' })).status).toBe(404);
    // Organisateur
    const slug = (await pool.query(`select slug from organizers where id = $1`, [a.orgId])).rows[0].slug as string;
    const o = await callQ('GET', '/share', { kind: 'o', slug });
    expect(o.status).toBe(200);
    expect(String(o.body)).toMatch(/og:title" content="Org Sec \d+"/);
    expect((await callQ('GET', '/share', { kind: 'o', slug: 'inconnu' })).status).toBe(404);
  });

  it('S3h. versements par événement : délai de remboursement terminé ET 40 % vendus (ou moins de 5 jours), montant limité, jamais le brouillon', async () => {
    const a = await organizer();
    const other = await organizer();
    const soon = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 19);
    const mkEvent = (title: string, days: number, extra: Record<string, unknown> = {}) =>
      eventOf(a, { title, start: soon(days), end: soon(days + 0.2), ...extra });
    const sold = (id: string, n: number) => pool.query(`update events set data = jsonb_set(data, '{tickets,0,sold}', $2::jsonb) where id = $1`, [id, String(n)]);
    const list = async () => (await call('GET', '/org/payouts/events', undefined, a.token)).body as { eventId: string; eligible: boolean; reason: string; payable: number; net: number; percentSold: number; availableAt: string | null; refundDays: number }[];
    const row = async (id: string) => (await list()).find((x) => x.eventId === id)!;

    // Événement lointain : le délai de remboursement (7 jours par défaut) est ouvert → rien à verser, date indiquée
    const far = await mkEvent('Lointain', 60);
    await sold(far.id, 15);
    const f = await row(far.id);
    expect(f).toMatchObject({ eligible: false, reason: 'window', payable: 0, refundDays: 7, percentSold: 75 });
    expect(Math.abs(Date.parse(f.availableAt!) - (Date.now() + 53 * 86_400_000))).toBeLessThan(2 * 3_600_000);

    // Dans les 5 jours : versable quel que soit le nombre de billets vendus (ici 10 sur 20 = 5 000 HTG brut, 125 de commission)
    const near = await mkEvent('Proche', 3);
    await sold(near.id, 10);
    expect(await row(near.id)).toMatchObject({ eligible: true, reason: 'ok', payable: 4875, net: 4875 });
    await sold(near.id, 0);
    expect(await row(near.id)).toMatchObject({ eligible: true, payable: 0 }); // rien vendu : rien à verser

    // 6 jours avant : délai terminé, mais il faut 40 % vendus
    const six = await mkEvent('Dans six jours', 6);
    await sold(six.id, 7); // 35 %
    expect(await row(six.id)).toMatchObject({ eligible: false, reason: 'threshold', percentSold: 35, payable: 0 });
    await sold(six.id, 8); // 40 %
    expect(await row(six.id)).toMatchObject({ eligible: true, reason: 'ok', percentSold: 40, payable: 3900 });

    // Aucun remboursement (délai 0) : versable dès 40 % même très en avance ; en dessous, non
    const none = await mkEvent('Sans remboursement', 90, { refundDays: 0 });
    await sold(none.id, 8);
    expect(await row(none.id)).toMatchObject({ eligible: true, refundDays: 0 });
    await sold(none.id, 5);
    expect(await row(none.id)).toMatchObject({ eligible: false, reason: 'threshold' });

    // Brouillon : absent de la liste ; annulé : jamais versable
    const draft = await mkEvent('Brouillon', 3, { status: 'draft' });
    expect((await list()).some((x) => x.eventId === draft.id)).toBe(false);
    await pool.query(`update events set data = data || '{"status":"cancelled"}'::jsonb where id = $1`, [near.id]);
    expect(await row(near.id)).toMatchObject({ eligible: false, reason: 'status', payable: 0 });
    await pool.query(`update events set data = data || '{"status":"published"}'::jsonb where id = $1`, [near.id]);

    // Demande : événement obligatoire, inconnu ou d'une autre organisation, pas encore versable, montant trop élevé
    const dest = { method: 'moncash', destination: { name: 'Marie Claire', phone: '+50937000000' } };
    const ask = (body: Record<string, unknown>, tok = a.token) => call('POST', '/org/payouts', { amount: 100, ...dest, ...body }, tok);
    expect((await ask({})).body.code).toBe('event_required');
    expect((await ask({ eventId: 'e_inconnu' })).status).toBe(404);
    expect((await ask({ eventId: six.id }, other.token)).status).toBe(404);
    expect((await ask({ eventId: far.id })).body).toMatchObject({ code: 'payout_not_available' });
    expect((await ask({ eventId: far.id })).status).toBe(409);
    await sold(six.id, 7);
    expect((await ask({ eventId: six.id })).status).toBe(409);
    await sold(six.id, 8);
    const tooMuch = await ask({ eventId: six.id, amount: 3900.01 });
    expect(tooMuch.status).toBe(422);
    expect(tooMuch.body.code).toBe('amount_too_high');
    expect((await ask({ eventId: six.id, amount: 0 })).status).toBe(422);
    expect([401, 403]).toContain((await ask({ eventId: six.id }, undefined)).status);
  });

  it('S3i. après un versement, l’organisateur n’annule plus seul ; le délai de remboursement ferme les demandes des acheteurs', async () => {
    const a = await organizer();
    const soon = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 19);
    const ev = await eventOf(a, { title: 'À annuler', start: soon(40), end: soon(40.2) });
    // Un versement refusé ne bloque rien ; un versement demandé, en cours ou fait bloque l'annulation
    const py = (status: string) => ({ id: `py_c${status}${Date.now()}`, organizerId: a.orgId, eventId: ev.id, eventTitle: 'À annuler', amount: 100, currency: 'HTG', method: 'moncash', destination: {}, status, date: '2026-11-19', reference: `VRS-${status}` });
    const insert = (p: ReturnType<typeof py>) => pool.query(`insert into payouts (id, organizer_id, status, data) values ($1,$2,$3,$4)`, [p.id, a.orgId, p.status, JSON.stringify(p)]);
    await insert(py('rejected'));
    const cancel = () => call('PUT', '/org/events', evBody({ id: ev.id, slug: ev.slug, title: 'À annuler', start: soon(40), end: soon(40.2), status: 'cancelled' }), a.token);
    const viaStatus = () => call('POST', `/org/events/${ev.id}/status`, { status: 'cancelled' }, a.token);
    // (un événement publié se repasse en brouillon pour tester sans effet de bord)
    await insert(py('requested'));
    for (const r of [await cancel(), await viaStatus()]) {
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('cancel_after_payout');
    }
    expect((await pool.query(`select data->>'status' as s from events where id = $1`, [ev.id])).rows[0].s).toBe('published');
    // L'administrateur, lui, peut annuler
    const adm = await adminUser();
    const byAdmin = await handle({ method: 'POST', path: `/org/events/${ev.id}/status`, query: { org: a.orgId }, body: { status: 'cancelled' }, authorization: `Bearer ${adm.token}`, ip: '10.8.9.9' });
    expect(byAdmin.status, JSON.stringify(byAdmin.body)).toBe(200);
    expect((await pool.query(`select data->>'status' as s from events where id = $1`, [ev.id])).rows[0].s).toBe('cancelled');

    // Délai de remboursement : ouvert (événement dans 40 jours), fermé (dans 3 jours), aucun remboursement (0), annulé (toujours possible)
    const buyerTokenValue = await buyerToken();
    const paidOrder = async (id: string) => {
      const o = await order(id, { method: 'transfer' });
      expect(o.status, JSON.stringify(o.body)).toBe(200);
      await pool.query(`update orders set status = 'paid', data = data || '{"status":"paid"}'::jsonb where id = $1`, [o.body.order.id]);
      return o.body.order.id as string;
    };
    const askRefund = (orderId: string) => call('POST', `/orders/${orderId}/refund`, { reason: 'Empêchement' }, buyerTokenValue);
    const refundOf = async (id: string) => askRefund(await paidOrder(id));
    const open = await eventOf(a, { title: 'Remboursable', start: soon(40), end: soon(40.2) });
    expect((await refundOf(open.id)).status).toBe(200);
    const closed = await eventOf(a, { title: 'Délai passé', start: soon(3), end: soon(3.2) });
    const closedOrder = await paidOrder(closed.id);
    const r1 = await askRefund(closedOrder);
    expect(r1.status).toBe(409);
    expect(r1.body.code).toBe('refund_closed');
    expect(String(r1.body.message)).toContain('7 jour');
    const zero = await eventOf(a, { title: 'Aucun remboursement', start: soon(40), end: soon(40.2), refundDays: 0 });
    const r2 = await refundOf(zero.id);
    expect(r2.status).toBe(409);
    expect(String(r2.body.message)).toContain('n’accepte pas de remboursement');
    const short = await eventOf(a, { title: 'Délai court', start: soon(3), end: soon(3.2), refundDays: 2 });
    expect((await refundOf(short.id)).status).toBe(200); // fermé seulement 2 jours avant
    await pool.query(`update events set data = data || '{"status":"cancelled"}'::jsonb where id = $1`, [closed.id]);
    expect((await askRefund(closedOrder)).status).toBe(200); // événement annulé : remboursement toujours possible
    // Valeur invalide du délai : retour au délai par défaut (7)
    const bad = await eventOf(a, { title: 'Délai invalide', start: soon(40), end: soon(40.2), refundDays: 99 });
    expect((await pool.query(`select data->'refundDays' as d from events where id = $1`, [bad.id])).rows[0].d).toBeNull();
  });

  // ---- Téléversement de fichiers

  it('S4. téléversements : signature réelle, taille, type autorisé, nom nettoyé, documents privés', async () => {
    const a = await organizer();
    const b = await organizer();
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(200)]);
    const up = (token: string | undefined, data: Buffer, kind = 'event_cover', name = 'x.png', docType?: string) =>
      call('POST', '/files', { kind, data: data.toString('base64'), name, ...(docType ? { docType } : {}) }, token);
    expect((await up(undefined, png)).status).toBe(401);
    // Extension et type annoncés mensongers : seul le contenu compte
    expect((await up(a.token, Buffer.from('<html><script>alert(1)</script></html>'), 'event_cover', 'photo.png')).status).toBe(422);
    expect((await up(a.token, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'), 'event_cover', 'logo.png')).status).toBe(422);
    expect((await up(a.token, Buffer.from('MZ\x90\x00 exécutable'), 'org_logo', 'logo.jpg')).status).toBe(422);
    expect((await up(a.token, Buffer.concat([Buffer.from('%PDF-1.4\n'), randomBytes(100)]), 'event_cover')).status).toBe(422); // PDF refusé pour une image
    expect((await up(a.token, Buffer.concat([png, Buffer.alloc(2.5 * 1024 * 1024)]))).status).toBe(422); // trop lourd
    expect((await call('POST', '/files', { kind: 'autre', data: png.toString('base64') }, a.token)).status).toBe(422);
    expect((await call('POST', '/files', { kind: 'verification', docType: '../../etc', data: png.toString('base64') }, a.token)).status).toBe(422);
    // Image valide : nom nettoyé, servie avec son vrai type
    const ok = await up(a.token, png, 'event_cover', '../../etc/passwd\u0000.png');
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const row = (await pool.query(`select name, mime, visibility from files where id = $1`, [ok.body.id])).rows[0];
    expect(/[\\/\p{Cc}]/u.test(row.name)).toBe(false);
    expect(row.mime).toBe('image/png');
    expect((await call('GET', `/files/${ok.body.id}`)).status).toBe(200);
    // Document d'identité : privé, invisible pour les autres organisations et les anonymes
    const doc = await up(a.token, png, 'verification', 'cni.png', 'id');
    expect(doc.status, JSON.stringify(doc.body)).toBe(200);
    expect((await call('GET', `/files/${doc.body.id}`)).status).toBe(401);
    expect((await call('GET', `/files/${doc.body.id}`, undefined, b.token)).status).toBe(404);
    expect((await call('GET', `/files/${doc.body.id}`, undefined, a.token)).status).toBe(200);
    expect((await pool.query(`select visibility from files where id = $1`, [doc.body.id])).rows[0].visibility).toBe('private');
  });

  // ---- Injection SQL

  it('S5. injection SQL : les charges d’attaque sont traitées comme du texte, rien ne fuit', async () => {
    const evil = ["' OR '1'='1", "'; DROP TABLE users; --", "x' UNION SELECT password_hash FROM users --", '" OR ""="', '\\', '%', "' or 1=1 --"];
    const a = await organizer();
    const ev = await eventOf(a);
    for (const e of evil) {
      expect((await call('POST', '/promo/validate', { code: e, eventId: e })).body ?? null).toBeNull();
      expect((await call('POST', '/auth/login', { email: e, password: e })).status).toBe(401);
      expect((await callQ('GET', '/resale', { eventId: e })).body).toEqual([]);
      expect([404, 422]).toContain((await order(e)).status);
      expect((await call('GET', `/orders/${encodeURIComponent(e)}`)).status).toBe(404);
      expect((await call('GET', `/files/${encodeURIComponent(e)}`)).status).toBe(404);
      expect((await call('GET', `/events/${encodeURIComponent(e)}`)).status).toBe(404);
      expect((await call('POST', '/reports', { eventId: e, reason: 'scam' })).status).toBe(404);
      expect((await call('POST', '/promo/validate', { code: ev.id, eventId: e })).status).toBe(200);
    }
    // Contenu stocké tel quel mais inoffensif : le titre injecté ne casse rien et ne sort pas de son champ
    const inj = await eventOf(a, { title: "Fête'); DROP TABLE events;--" });
    expect(inj.id).toBeTruthy();
    expect((await pool.query(`select count(*)::int as n from events`)).rows[0].n).toBeGreaterThan(0);
    expect((await pool.query(`select count(*)::int as n from users`)).rows[0].n).toBeGreaterThan(0);
    // Des données mal formées donnent une erreur propre, jamais un détail technique
    const r = await call('GET', '/events/%E0%A4%A', undefined, undefined);
    expect([400, 404]).toContain(r.status);
    expect(JSON.stringify(r.body)).not.toMatch(/at .*\.(ts|js):\d+|pg_|syntax error|stack/i);
  });

  // ---- Logique métier et paiement

  it('S6. paiement : aucun moyen de payer « en moins » ou sans payer', async () => {
    const a = await organizer();
    const ev = await eventOf(a);
    process.env.PAY_CLIENT_ID = 'cid';
    // Les champs financiers envoyés par le navigateur sont ignorés : le serveur recalcule
    const o = await order(ev.id, { total: 1, subtotal: 1, fees: 0, discount: 9999, status: 'paid', items: [{ ticketTypeId: 't1', qty: 2, unitPrice: 0.01, price: 0 }] });
    expect(o.status, JSON.stringify(o.body)).toBe(200);
    expect(o.body.order.status).toBe('pending');
    expect(o.body.order.subtotal).toBe(1000);
    expect(o.body.order.discount).toBe(0);
    expect(o.body.order.total).toBeGreaterThanOrEqual(1000);
    expect(o.body.payUrl).toBe('https://pay.example/checkout');
    // Aucun billet ne passe à l'entrée tant que le paiement n'est pas confirmé
    expect((await pool.query(`select status from tickets where order_id = $1`, [o.body.order.id])).rows.every((r) => r.status === 'pending')).toBe(true);
    // Quantités et billets invalides
    for (const items of [[{ ticketTypeId: 't1', qty: -3 }], [{ ticketTypeId: 't1', qty: 0 }], [{ ticketTypeId: 't1', qty: 'NaN' }], [{ ticketTypeId: 't1', qty: 99 }], [{ ticketTypeId: 'inconnu', qty: 1 }], [], 'x'])
      expect([409, 422], JSON.stringify(items)).toContain((await order(ev.id, { items })).status);
    expect([422]).toContain((await order(ev.id, { method: 'bitcoin' })).status);
    expect([422]).toContain((await order(ev.id, { currency: 'XXX' })).status);
    // Moyen « paypal » : accepté par la liste, mais jamais synonyme de « payé » sans paiement
    process.env.VERCEL_ENV = 'production';
    const ppProd = await order(ev.id, { method: 'paypal' });
    expect(ppProd.status).toBe(422);
    expect(ppProd.body.code).toBe('payment_method_unavailable');
    // Production sans passerelle de paiement : aucune vente payante « gratuite »
    delete process.env.PAY_CLIENT_ID;
    const noGateway = await order(ev.id, { method: 'card' });
    expect(noGateway.status).toBe(503);
    expect(noGateway.body.code).toBe('payment_unavailable');
    // Virement : en attente de réception des fonds, même en production
    const tr = await order(ev.id, { method: 'transfer' });
    expect(tr.status).toBe(200);
    expect(tr.body.order.status).toBe('pending');
    // Rien n'a été validé sans paiement
    expect(Number((await pool.query(`select count(*) as n from orders where status = 'paid' and (data->>'eventId') = $1`, [ev.id])).rows[0].n)).toBe(0);
  });

  it('S7. webhook et vérification de paiement : jamais crus sur parole, idempotents', async () => {
    const a = await organizer();
    const ev = await eventOf(a);
    process.env.PAY_CLIENT_ID = 'cid';
    const o = await order(ev.id);
    const id = o.body.order.id as string;
    const status = async () => (await pool.query(`select status from orders where id = $1`, [id])).rows[0].status as string;
    const sold = async () => ((await pool.query(`select data from events where id = $1`, [ev.id])).rows[0].data.tickets[0].sold as number);
    // Webhook falsifié : la passerelle dit « en attente » → la commande reste en attente
    for (const body of [{ transaction: { reference_id: id, status: 'ok', trans_status: 'ok', paid: true } }, { reference_id: id, status: 'paid' }, { transaction: { reference_id: id } }]) {
      expect((await call('POST', '/pay/webhook', body)).status).toBe(200);
      expect(await status()).toBe('pending');
    }
    // La page de retour interroge la passerelle : toujours en attente
    expect((await call('POST', `/orders/${id}/verify`, {})).body.status).toBe('pending');
    // Un paiement confirmé par la passerelle : commande payée, billets valables
    payStates.set(id, 'ok');
    await call('POST', '/pay/webhook', { transaction: { reference_id: id } });
    expect(await status()).toBe('paid');
    expect((await pool.query(`select status from tickets where order_id = $1`, [id])).rows.every((r) => r.status === 'valid')).toBe(true);
    const soldAfter = await sold();
    // Rejeu du même événement, plusieurs fois et en parallèle : aucun effet de plus
    await Promise.all(Array.from({ length: 6 }, () => call('POST', '/pay/webhook', { transaction: { reference_id: id } })));
    await call('POST', `/orders/${id}/verify`, {});
    expect(await status()).toBe('paid');
    expect(await sold()).toBe(soldAfter);
    expect(Number((await pool.query(`select count(*) as n from tickets where order_id = $1`, [id])).rows[0].n)).toBe(1);
    // Un échec confirmé libère les places ; une référence inconnue ou piégée ne fait rien de grave
    const o2 = await order(ev.id);
    const before = await sold();
    payStates.set(o2.body.order.id, 'failed');
    await call('POST', '/pay/webhook', { transaction: { reference_id: o2.body.order.id } });
    expect((await pool.query(`select 1 from orders where id = $1`, [o2.body.order.id])).rowCount).toBe(0);
    expect(await sold()).toBe(before); // une commande non payée n'a jamais compté comme vendue
    for (const ref of ["x'; drop table orders;--", 'sp_inconnu', 'bo_inconnu', '', 'a'.repeat(500)]) expect((await call('POST', '/pay/webhook', { transaction: { reference_id: ref } })).status).toBe(200);
    expect((await call('POST', '/pay/webhook', 'pas un objet')).status).toBeLessThan(500);
  });

  it('S8. concurrence : quota, code promo à usage limité et places numérotées tiennent sous charge', async () => {
    const a = await organizer();
    // Quota de 3 billets, 8 commandes non payées : aucune ne compte comme vendue ; 8 confirmations simultanées → 3 seulement
    const ev = await eventOf(a, { tickets: [{ id: 't1', name: 'Rare', kind: 'paid', price: 500, quota: 3, sold: 0, salesStart: '2026-01-01T00:00:00', salesEnd: '2030-06-01T20:00:00', maxPerOrder: 5 }] });
    const res = await Promise.all(Array.from({ length: 8 }, () => order(ev.id, { method: 'transfer' })));
    expect(res.filter((r) => r.status === 200)).toHaveLength(8);
    const soldOf = async () => (await pool.query(`select data from events where id = $1`, [ev.id])).rows[0].data.tickets[0].sold as number;
    expect(await soldOf()).toBe(0);
    const adm = await adminUser();
    const conf = await Promise.all(res.map((r) => call('POST', `/admin/orders/${r.body.order.id}/confirm`, {}, adm.token)));
    expect(conf.filter((r) => r.status === 200)).toHaveLength(3);
    expect(conf.filter((r) => r.status === 409)).toHaveLength(5);
    expect(await soldOf()).toBe(3);
    // Code promo utilisable une seule fois : une seule remise sous 6 achats simultanés
    const ev2 = await eventOf(a);
    const code = `RACE${Date.now() % 1000000}`;
    expect((await call('PUT', '/org/promos', { code, eventId: ev2.id, type: 'percent', value: 50, limit: 1, used: 0, active: true, expiresAt: '2030-01-01T00:00:00', id: '' }, a.token)).status).toBe(200);
    const promos = await Promise.all(Array.from({ length: 6 }, () => order(ev2.id, { method: 'transfer', promoCode: code })));
    expect(promos.filter((r) => r.status === 200 && r.body.order.discount > 0)).toHaveLength(1);
    expect(promos.filter((r) => r.status === 409)).toHaveLength(5);
    // Une place numérotée ne se vend qu'une fois
    const ev3 = await eventOf(a, { seated: true, tickets: [{ id: 't1', name: 'Fauteuil', kind: 'paid', price: 500, quota: 50, sold: 0, salesStart: '2026-01-01T00:00:00', salesEnd: '2030-06-01T20:00:00', maxPerOrder: 5 }] });
    const seats = await Promise.all(Array.from({ length: 5 }, () => order(ev3.id, { method: 'transfer', items: [{ ticketTypeId: 't1', qty: 1, seats: ['A-1'] }] })));
    expect(seats.filter((r) => r.status === 200)).toHaveLength(1);
  });

  it('S9. revente et remboursements : pas de billet gratuit, pas de doublon', async () => {
    const a = await organizer();
    const ev = await eventOf(a);
    const buyer = await organizer();
    // Un acheteur connecté avec une commande payée (démonstration : sans passerelle)
    const o = await order(ev.id, { method: 'card' }, undefined);
    expect(o.status).toBe(200);
    expect(o.body.order.status).toBe('paid');
    await pool.query(`update orders set user_id = $2 where id = $1`, [o.body.order.id, buyer.id]);
    const tid = (await pool.query(`select id from tickets where order_id = $1`, [o.body.order.id])).rows[0].id as string;
    // Demandes de remboursement simultanées : une seule
    const refunds = await Promise.all(Array.from({ length: 4 }, () => call('POST', `/orders/${o.body.order.id}/refund`, { reason: 'test' }, buyer.token)));
    expect(refunds.filter((r) => r.status === 200)).toHaveLength(1);
    expect(Number((await pool.query(`select count(*) as n from refunds where order_id = $1`, [o.body.order.id])).rows[0].n)).toBe(1);
    // Revente : prix invalides refusés ; en production l'achat est fermé (aucun paiement n'est encaissé)
    const o2 = await order(ev.id, { method: 'card' });
    await pool.query(`update orders set user_id = $2 where id = $1`, [o2.body.order.id, buyer.id]);
    const t2 = (await pool.query(`select id from tickets where order_id = $1`, [o2.body.order.id])).rows[0].id as string;
    for (const price of [-5, 0, 'abc', 1e12, null]) expect((await call('POST', `/tickets/${t2}/resale`, { price }, buyer.token)).status, String(price)).toBe(422);
    expect((await call('POST', `/tickets/${t2}/resale`, { price: 400 }, buyer.token)).status).toBe(200);
    const listing = (await pool.query(`select id from resale_listings where ticket_id = $1`, [t2])).rows[0].id as string;
    const thief = await organizer();
    process.env.VERCEL_ENV = 'production';
    const stolen = await call('POST', `/resale/${listing}/buy`, { name: 'Voleur', email: 'v@sec.test' }, thief.token);
    expect(stolen.status).toBe(503);
    expect(stolen.body.code).toBe('resale_unavailable');
    expect((await pool.query(`select 1 from resale_listings where id = $1`, [listing])).rowCount).toBe(1);
    expect(Number((await pool.query(`select count(*) as n from orders where user_id = $1`, [thief.id])).rows[0].n)).toBe(0);
    delete process.env.VERCEL_ENV;
    // Hors production (démonstration), on ne s'achète pas son propre billet
    expect((await call('POST', `/resale/${listing}/buy`, { name: 'Moi', email: 'moi@sec.test' }, buyer.token)).status).toBe(409);
    void tid;
  });

  it('S10. modération : un organisateur ne contourne pas la publication ni la modération', async () => {
    const unverified = await organizer(false);
    const ev = await eventOf(unverified);
    expect(ev.status).toBe('pending'); // publication demandée → modération
    // Le changement de statut suit les mêmes règles
    const st = await call('POST', `/org/events/${ev.id}/status`, { status: 'published' }, unverified.token);
    expect(st.status).toBe(200);
    expect(st.body.status).toBe('pending');
    expect((await pool.query(`select status from events where id = $1`, [ev.id])).rows[0].status).toBe('pending');
    expect((await order(ev.id, { method: 'transfer' })).status).toBe(404); // pas en vente
    for (const bad of ['rejected', 'blocked', 'feature', '', 'PUBLISHED']) expect((await call('POST', `/org/events/${ev.id}/status`, { status: bad }, unverified.token)).status, bad).toBe(422);
    // Statut libre dans le formulaire : jamais accepté tel quel
    const forged = await call('PUT', '/org/events', evBody({ id: ev.id, status: 'rejected' }), unverified.token);
    expect(forged.status).toBe(422);
    // Organisateur vérifié : publication directe ; mais un événement refusé par l'administration ne se republie pas seul
    const v = await organizer(true);
    const ev2 = await eventOf(v);
    expect(ev2.status).toBe('published');
    const adm = await adminUser();
    expect((await call('POST', `/admin/events/${ev2.id}/moderate`, { status: 'rejected', reason: 'test' }, adm.token)).status).toBe(200);
    const back = await call('POST', `/org/events/${ev2.id}/status`, { status: 'published' }, v.token);
    expect(back.body.status).toBe('pending');
    const back2 = await call('PUT', '/org/events', evBody({ id: ev2.id, status: 'published' }), v.token);
    expect(['pending', 'published']).toContain(back2.body.status);
    // Un événement refusé puis re-sauvé ne devient pas « publié »
    await pool.query(`update events set status = 'rejected', data = data || '{"status":"rejected"}'::jsonb where id = $1`, [ev2.id]);
    const again = await call('PUT', '/org/events', evBody({ id: ev2.id, status: 'published' }), v.token);
    expect(again.body.status).toBe('pending');
  });

  it('S11. validation des données d’événement : prix, quantités, liens', async () => {
    const o = await organizer();
    const bad = (patch: Record<string, unknown>) => call('PUT', '/org/events', evBody(patch), o.token);
    const t = (x: Record<string, unknown>) => [{ id: 't1', name: 'S', kind: 'paid', price: 500, quota: 20, sold: 0, salesStart: '2026-01-01T00:00:00', salesEnd: '2030-06-01T20:00:00', maxPerOrder: 5, ...x }];
    expect((await bad({ tickets: t({ price: -500 }) })).status).toBe(422);
    expect((await bad({ tickets: t({ price: 'gratuit' }) })).status).toBe(422);
    expect((await bad({ tickets: t({ price: null }) })).status).toBe(422);
    expect((await bad({ tickets: t({ quota: -1 }) })).status).toBe(422);
    expect((await bad({ tickets: t({ quota: 1e9 }) })).status).toBe(422);
    expect((await bad({ tickets: t({ maxPerOrder: 0 }) })).status).toBe(422);
    expect((await bad({ tickets: t({ salesEnd: 'pas une date' }) })).status).toBe(422);
    expect((await bad({ tickets: [] })).status).toBe(422);
    expect((await bad({ tickets: [...t({}), ...t({})] })).status).toBe(422);
    expect((await bad({ currency: 'BTC' })).status).toBe(422);
    expect((await bad({ title: 'x'.repeat(300) })).status).toBe(422);
    expect((await bad({ start: 'demain' })).status).toBe(422);
    // Lien « événement en ligne » : https seulement (affiché comme lien cliquable)
    for (const url of ['javascript:alert(document.cookie)', 'data:text/html,<script>1</script>', 'http://exemple.com/live']) expect((await bad({ online: { platform: 'X', url } })).status, url).toBe(422);
    expect((await bad({ online: { platform: 'YouTube', url: 'https://youtube.com/live/abc' } })).status).toBe(200);
    // Les ventes et les vues sont tenues par le serveur
    const ev = await eventOf(o, { tickets: t({ sold: 999 }), views: 50000, featured: true, boostedUntil: '2099-01-01' });
    const saved = (await pool.query(`select data from events where id = $1`, [ev.id])).rows[0].data;
    expect(saved.tickets[0].sold).toBe(0);
    expect(saved.views).toBe(0);
    expect(saved.featured).toBe(false);
    expect(saved.boostedUntil).toBeUndefined();
    // Site web de l'organisateur
    for (const website of ['javascript:alert(1)', 'data:text/html,x', 'JAVASCRIPT:alert(1)', 'ftp://x.com']) expect((await call('PUT', '/org/profile', { website }, o.token)).status, website).toBe(422);
    expect((await call('PUT', '/org/profile', { website: 'lakay.ht' }, o.token)).status).toBe(200);
    expect(((await pool.query(`select data->>'website' as w from organizers where id = $1`, [o.orgId])).rows[0] as { w: string }).w).toBe('https://lakay.ht/');
  });

  // ---- Limitation de débit et attaques par force brute

  it('S12. limitation de débit : connexion, codes promo, commandes, signalements', async () => {
    // Force brute sur un compte : 10 échecs par heure, depuis n'importe quelles adresses (« credential stuffing » distribué)
    const o = await organizer();
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await call('POST', '/auth/login', { email: o.email, password: `mauvais-${i}` }, undefined, `172.20.${i}.1`)).status);
    expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true);
    expect(codes.slice(10)).toEqual([429, 429]);
    // Même avec le bon mot de passe, le compte est verrouillé le temps de la fenêtre
    expect((await call('POST', '/auth/login', { email: o.email, password: 'Soleil2026x' }, undefined, '172.21.0.1')).status).toBe(429);
    // Par adresse : 20 essais par 15 minutes
    const ip = '172.22.0.9';
    const ipCodes: number[] = [];
    for (let i = 0; i < 22; i++) ipCodes.push((await call('POST', '/auth/login', { email: `inconnu${i}@sec.test`, password: 'x' }, undefined, ip)).status);
    expect(ipCodes.slice(0, 20).every((c) => c === 401)).toBe(true);
    expect(ipCodes.slice(20)).toEqual([429, 429]);
    // Codes promo : énumération limitée
    const promoIp = '172.23.0.7';
    const promo: number[] = [];
    for (let i = 0; i < 62; i++) promo.push((await call('POST', '/promo/validate', { code: `CODE${i}`, eventId: 'x' }, undefined, promoIp)).status);
    expect(promo.slice(0, 60).every((c) => c === 200)).toBe(true);
    expect(promo.slice(60)).toEqual([429, 429]);
    // Signalements : pas de spam
    const a = await organizer();
    const ev = await eventOf(a);
    const rep: number[] = [];
    for (let i = 0; i < 12; i++) rep.push((await call('POST', '/reports', { eventId: ev.id, reason: 'scam', details: 'x' }, undefined, '172.24.0.3')).status);
    expect(rep.filter((c) => c === 429).length).toBeGreaterThanOrEqual(2);
    // Commandes : 30 par heure et par adresse (retenue de stock)
    const ev2 = await eventOf(a, { tickets: [{ id: 't1', name: 'G', kind: 'free', price: 0, quota: 1000, sold: 0, salesStart: '2026-01-01T00:00:00', salesEnd: '2030-06-01T20:00:00', maxPerOrder: 5 }] });
    const ords: number[] = [];
    for (let i = 0; i < 32; i++) ords.push((await order(ev2.id, { method: 'card' }, '172.25.0.5')).status);
    expect(ords.slice(0, 30).every((c) => c === 200)).toBe(true);
    expect(ords.slice(30)).toEqual([429, 429]);
  });

  // ---- Exposition de données sensibles

  it('S13. aucune donnée sensible dans les réponses ni dans les journaux', async () => {
    const o = await organizer();
    const me = JSON.stringify((await call('GET', '/auth/me', undefined, o.token)).body);
    expect(me).not.toMatch(/password|hash|scrypt|secret|token/i);
    const boot = JSON.stringify((await call('GET', '/bootstrap')).body);
    expect(boot).not.toContain(o.email);
    expect(boot).not.toMatch(/password|scrypt|access_key|accessKey/i);
    // Même réponse pour un compte inconnu et pour un mauvais mot de passe
    const known = await call('POST', '/auth/login', { email: o.email, password: 'faux' });
    const unknown = await call('POST', '/auth/login', { email: `absent-${Date.now()}@sec.test`, password: 'faux' });
    expect(known.status).toBe(unknown.status);
    expect(known.body).toEqual(unknown.body);
    // Le journal d'événements de sécurité ne contient ni mot de passe ni jeton
    const logs = JSON.stringify((await pool.query(`select event, detail from security_events order by at desc limit 200`)).rows);
    expect(logs).not.toMatch(/Soleil2026x|scrypt|Bearer|eyJ/);
    // L'erreur serveur ne renvoie pas la pile d'appels
    const e = await call('POST', '/org/events', 'pas du json valide', o.token);
    expect(JSON.stringify(e.body)).not.toMatch(/\.ts:\d+|node_modules|at async/);
  });

  it('S14. connexion : durée de calcul comparable pour un compte inconnu (pas d’énumération par chronométrage)', async () => {
    const o = await organizer();
    const time = async (email: string) => {
      const t = process.hrtime.bigint();
      await call('POST', '/auth/login', { email, password: 'mot-de-passe-faux' });
      return Number(process.hrtime.bigint() - t) / 1e6;
    };
    // le compte inconnu ne répond plus « instantanément » : il dépense lui aussi un calcul de hachage
    const known = Math.min(await time(o.email), await time(o.email));
    const unknown = Math.min(await time(`nobody${Date.now()}@sec.test`), await time(`nobody${Date.now()}b@sec.test`));
    expect(unknown).toBeGreaterThan(known * 0.4);
    void hashPassword;
  });
});
