import { createHmac, randomBytes } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
    const r = await call('POST', '/auth/signup', { name: `Orga Test${n}`, email, password: 'Soleil2026x', acceptTerms: true, orgName: `Org Sec ${n}`, country: 'HT' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const orgId = r.body.user.organizerId as string;
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
  const order = (eventId: string, extra: Record<string, unknown> = {}, ip?: string) =>
    call('POST', '/orders', { eventId, items: [{ ticketTypeId: 't1', qty: 1 }], method: 'moncash', currency: 'HTG', buyer: { name: 'Acheteur', email: `buyer${++seq}@sec.test` }, ...extra }, undefined, ip);

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
