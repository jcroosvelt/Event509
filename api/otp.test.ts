import http from 'node:http';
import type { AddressInfo } from 'node:net';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { classifyMetaError, generateCode, hashCode, maskPhone, normalizePhone } from './_lib/otp.js';

// ---------- Unitaires (toujours exécutés) ----------

describe('numéros et codes', () => {
  it('normalise au format E.164 et refuse le reste', () => {
    expect(normalizePhone('+509 3712 3456')).toBe('+50937123456');
    expect(normalizePhone('509-3712-3456')).toBeNull(); // sans « + » ni « 00 » : refusé (sauf 8 chiffres locaux)
    expect(normalizePhone('0050937123456')).toBe('+50937123456');
    expect(normalizePhone('37123456')).toBe('+50937123456'); // numéro local haïtien
    expect(normalizePhone('+1 (305) 555-0100')).toBe('+13055550100');
    for (const bad of ['', 'abc', '+0123456789', '+12', '+1234567890123456', "+509'; drop table users;--", null, 123, '+509 3712 345a'])
      expect(normalizePhone(bad as unknown)).toBeNull();
  });
  it('génère 6 chiffres', () => {
    for (let i = 0; i < 200; i++) expect(generateCode()).toMatch(/^\d{6}$/);
  });
  it('l’empreinte dépend du code, du numéro, du motif et de la ligne', () => {
    process.env.JWT_SECRET = 'x'.repeat(40);
    const h = hashCode('otp_1', '+50937123456', 'register', '123456');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain('123456');
    expect(hashCode('otp_1', '+50937123456', 'register', '123457')).not.toBe(h);
    expect(hashCode('otp_2', '+50937123456', 'register', '123456')).not.toBe(h);
    expect(hashCode('otp_1', '+50937123457', 'register', '123456')).not.toBe(h);
    expect(hashCode('otp_1', '+50937123456', 'forgot_password', '123456')).not.toBe(h);
  });
  it('masque les numéros', () => expect(maskPhone('+50937123456')).toBe('+509••••56'));
  it('classe les erreurs de Meta', () => {
    expect(classifyMetaError(400, 131026)).toBe('unreachable');
    expect(classifyMetaError(400, 100)).toBe('invalid_number');
    expect(classifyMetaError(401, 190)).toBe('auth');
    expect(classifyMetaError(429, 130429)).toBe('rate_limit');
    expect(classifyMetaError(400, 80007)).toBe('rate_limit');
    expect(classifyMetaError(404, 132001)).toBe('template');
    expect(classifyMetaError(500, undefined)).toBe('temporary');
    expect(classifyMetaError(400, 131000)).toBe('temporary');
  });
});

// ---------- Intégration (base Postgres jetable + faux serveur Meta local) ----------

const DB = process.env.TEST_DATABASE_URL;
describe.skipIf(!DB)('OTP WhatsApp (intégration)', () => {
  let pool: pg.Pool;
  let srv: http.Server;
  let handle: typeof import('./_lib/handler.js').handle;
  let signToken: typeof import('./_lib/auth.js').signToken;
  let sent: { to: string; code: string; template: string }[] = [];
  let metaFail: { status: number; code: number } | null = null;
  let ipN = 0;

  // Corps JSON de l'API : forme libre selon la route
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Out = { status: number; body: Record<string, any> };
  const call = (method: string, path: string, body?: unknown, token?: string, ip = `10.0.${Math.floor(ipN / 250)}.${(ipN++ % 250) + 1}`) =>
    handle({ method, path, query: {}, body, authorization: token ? `Bearer ${token}` : undefined, ip }) as Promise<Out>;
  const lastCode = (to: string) => [...sent].reverse().find((m) => m.to === to)!.code;
  const seq = 0;
  // Numéro aléatoire (la base de test garde les demandes des dernières 24 h)
  const newPhone = () => `+5093${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;

  beforeAll(async () => {
    process.env.DATABASE_URL = DB;
    process.env.JWT_SECRET = 'y'.repeat(40);
    srv = http.createServer((req, res) => {
      let b = '';
      req.on('data', (d) => (b += d));
      req.on('end', () => {
        res.setHeader('content-type', 'application/json');
        if (req.headers.authorization !== 'Bearer test-token') return void res.writeHead(401).end(JSON.stringify({ error: { code: 190 } }));
        if (metaFail) return void res.writeHead(metaFail.status).end(JSON.stringify({ error: { code: metaFail.code } }));
        const j = JSON.parse(b);
        sent.push({ to: `+${j.to}`, code: j.template.components[0].parameters[0].text, template: j.template.name });
        res.end(JSON.stringify({ messages: [{ id: `wamid.${sent.length}` }] }));
      });
    });
    await new Promise<void>((r) => srv.listen(0, r));
    process.env.META_GRAPH_BASE_URL = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    process.env.META_ACCESS_TOKEN = 'test-token';
    process.env.META_PHONE_NUMBER_ID = '123456';
    pool = new pg.Pool({ connectionString: DB });
    await pool.query(`delete from otp_verifications`);
    await pool.query(`delete from otp_security_log`);
    await pool.query(`delete from users where email like '%@otp.test'`);
    ({ handle } = await import('./_lib/handler.js'));
    ({ signToken } = await import('./_lib/auth.js'));
  });
  afterAll(async () => {
    await pool?.query(`delete from users where email like '%@otp.test'`);
    await pool?.end();
    srv?.close();
  });
  beforeEach(() => {
    sent = [];
    metaFail = null;
    process.env.META_ACCESS_TOKEN = 'test-token';
  });

  /** Inscription complète avec numéro vérifié ; renvoie la session. */
  async function signup(phone: string, password = 'Soleil2026x') {
    const email = `u${Date.now()}${Math.floor(Math.random() * 1e6)}@otp.test`;
    expect((await call('POST', '/auth/otp/register/send', { phone })).status).toBe(200);
    const v = await call('POST', '/auth/otp/register/verify', { phone, code: lastCode(phone) });
    expect(v.status).toBe(200);
    const r = await call('POST', '/auth/signup', { name: 'Test Otp', email, password, phone, acceptTerms: true, phoneProof: v.body.proof });
    expect(r.status).toBe(200);
    return { email, password, token: r.body.token as string, id: r.body.user.id as string, user: r.body.user, proof: v.body.proof as string };
  }
  const rows = async (phone: string) => (await pool.query(`select * from otp_verifications where phone_number = $1 order by created_at`, [phone])).rows;

  it('envoie un code valide par le modèle WhatsApp et ne garde que son empreinte', async () => {
    const phone = newPhone();
    const r = await call('POST', '/auth/otp/register/send', { phone: phone.replace('+509', '509 ').replace(/^/, '+') });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ sent: true, expiresInSeconds: 300, requestsLeft: 2 });
    expect(JSON.stringify(r.body)).not.toMatch(/\d{6}/); // le code n'est jamais renvoyé
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: phone, template: 'event509_otp' });
    expect(sent[0]!.code).toMatch(/^\d{6}$/);
    const [row] = await rows(phone);
    expect(row.otp_hash).not.toContain(sent[0]!.code);
    expect(row.otp_hash).toMatch(/^[0-9a-f]{64}$/);
    expect((new Date(row.expires_at).getTime() - new Date(row.created_at).getTime()) / 1000).toBeCloseTo(300, 0);
    expect(row.delivery_status).toBe('sent');
    expect(JSON.stringify(row)).not.toContain(sent[0]!.code);
  });

  it('vérifie le bon code, une seule fois', async () => {
    const phone = newPhone();
    await call('POST', '/auth/otp/register/send', { phone });
    const code = lastCode(phone);
    const ok = await call('POST', '/auth/otp/register/verify', { phone, code });
    expect(ok.status).toBe(200);
    expect(ok.body.verified).toBe(true);
    // Réutilisation du même code : refusée
    const again = await call('POST', '/auth/otp/register/verify', { phone, code });
    expect(again.status).toBe(400);
    expect(again.body.code).toBe('otp_invalid');
  });

  it('refuse un code incorrect', async () => {
    const phone = newPhone();
    await call('POST', '/auth/otp/register/send', { phone });
    const wrong = lastCode(phone) === '000000' ? '000001' : '000000';
    const r = await call('POST', '/auth/otp/register/verify', { phone, code: wrong });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('otp_invalid');
    expect((await rows(phone))[0].attempts).toBe(1);
  });

  it('le code expire après 5 minutes', async () => {
    const phone = newPhone();
    await call('POST', '/auth/otp/register/send', { phone });
    const code = lastCode(phone);
    await pool.query(`update otp_verifications set expires_at = now() - interval '1 second' where phone_number = $1`, [phone]);
    const r = await call('POST', '/auth/otp/register/verify', { phone, code });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('otp_expired');
    // Il reste invalide ensuite
    expect((await call('POST', '/auth/otp/register/verify', { phone, code })).body.code).toBe('otp_invalid');
  });

  it('un nouveau code invalide l’ancien', async () => {
    const phone = newPhone();
    await call('POST', '/auth/otp/register/send', { phone });
    const old = lastCode(phone);
    await call('POST', '/auth/otp/register/send', { phone });
    const fresh = lastCode(phone);
    expect((await call('POST', '/auth/otp/register/verify', { phone, code: old })).status).toBe(old === fresh ? 200 : 400);
    if (old !== fresh) expect((await call('POST', '/auth/otp/register/verify', { phone, code: fresh })).status).toBe(200);
  });

  it('5e essai faux : code invalidé ; 6e essai bloqué même avec le bon code', async () => {
    const phone = newPhone();
    await call('POST', '/auth/otp/register/send', { phone });
    const good = lastCode(phone);
    const bad = good === '111111' ? '222222' : '111111';
    const codes: string[] = [];
    for (let i = 0; i < 5; i++) codes.push((await call('POST', '/auth/otp/register/verify', { phone, code: bad })).body.code);
    expect(codes.slice(0, 4)).toEqual(Array(4).fill('otp_invalid'));
    expect(codes[4]).toBe('otp_locked');
    const sixth = await call('POST', '/auth/otp/register/verify', { phone, code: good });
    expect(sixth.status).toBe(400);
    expect(sixth.body.code).not.toBeUndefined();
    expect((await rows(phone))[0].consumed_at).not.toBeNull();
  });

  it('3 demandes par jour autorisées, la 4e refusée (côté serveur)', async () => {
    const phone = newPhone();
    for (let i = 0; i < 3; i++) expect((await call('POST', '/auth/otp/register/send', { phone })).status).toBe(200);
    const fourth = await call('POST', '/auth/otp/register/send', { phone });
    expect(fourth.status).toBe(429);
    expect(fourth.body.code).toBe('otp_limit');
    expect(sent).toHaveLength(3);
    // Même en contournant l'interface (autre adresse IP) : toujours refusée
    expect((await call('POST', '/auth/otp/register/send', { phone }, undefined, '203.0.113.9')).status).toBe(429);
    // La fenêtre est glissante : après 24 h, une nouvelle demande passe
    await pool.query(`update otp_verifications set created_at = now() - interval '25 hours' where phone_number = $1`, [phone]);
    expect((await call('POST', '/auth/otp/register/send', { phone })).status).toBe(200);
  });

  it('la limite est partagée entre inscription, mot de passe oublié et changement de mot de passe', async () => {
    const phone = newPhone();
    const s = await signup(phone); // 1 demande (inscription)
    expect((await call('POST', '/auth/otp/forgot-password/send', { phone })).status).toBe(200); // 2
    expect((await call('POST', '/auth/otp/change-password/send', {}, s.token)).status).toBe(200); // 3
    expect(sent).toHaveLength(3);
    const blocked = await call('POST', '/auth/otp/change-password/send', {}, s.token);
    expect(blocked.status).toBe(429);
    await call('POST', '/auth/otp/forgot-password/send', { phone });
    expect(sent).toHaveLength(3); // aucun 4e message n'est parti
    expect((await call('POST', '/auth/otp/register/send', { phone })).status).toBe(429);
  });

  it('deux demandes simultanées ne dépassent pas la limite', async () => {
    const phone = newPhone();
    const out = await Promise.all(Array.from({ length: 8 }, () => call('POST', '/auth/otp/register/send', { phone })));
    expect(out.filter((o) => o.status === 200)).toHaveLength(3);
    expect(out.filter((o) => o.status === 429)).toHaveLength(5);
    expect(sent).toHaveLength(3);
    expect((await rows(phone)).length).toBe(3);
  });

  it('un échec de transmission à Meta n’est jamais présenté comme un envoi et ne consomme pas la limite', async () => {
    const phone = newPhone();
    metaFail = { status: 400, code: 131026 };
    const r = await call('POST', '/auth/otp/register/send', { phone });
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('otp_unreachable');
    expect(r.body.sent).toBeUndefined();
    const [row] = await rows(phone);
    expect(row.send_failed).toBe(true);
    expect(row.consumed_at).not.toBeNull();
    // Les autres erreurs
    for (const [status, code, expected, http] of [[401, 190, 'otp_auth', 503], [429, 130429, 'otp_rate_limit', 503], [404, 132001, 'otp_template', 503], [500, 1, 'otp_temporary', 503], [400, 100, 'otp_invalid_number', 422]] as const) {
      metaFail = { status, code };
      const x = await call('POST', '/auth/otp/register/send', { phone });
      expect(x.status).toBe(http);
      expect(x.body.code).toBe(expected);
    }
    // Les échecs n'ont rien consommé : 3 envois réussis restent possibles
    metaFail = null;
    for (let i = 0; i < 3; i++) expect((await call('POST', '/auth/otp/register/send', { phone })).status).toBe(200);
    expect((await call('POST', '/auth/otp/register/send', { phone })).status).toBe(429);
    // Jamais de code en clair dans les messages d'erreur
    expect(JSON.stringify(r.body)).not.toMatch(/\d{6}/);
  });

  it('numéro invalide refusé, service non configuré indisponible', async () => {
    expect((await call('POST', '/auth/otp/register/send', { phone: 'abc' })).body.code).toBe('phone_invalid');
    expect((await call('POST', '/auth/otp/register/send', { phone: "+509'; drop table users;--" })).status).toBe(422);
    delete process.env.META_ACCESS_TOKEN;
    const r = await call('POST', '/auth/otp/register/send', { phone: newPhone() });
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('otp_unavailable');
    expect((await call('GET', '/auth/otp/status')).body.enabled).toBe(false);
  });

  it('inscription : impossible sans preuve du serveur, preuve à usage unique', async () => {
    const phone = newPhone();
    const base = { name: 'Test Otp', password: 'Soleil2026x', phone, acceptTerms: true };
    expect((await call('POST', '/auth/signup', { ...base, email: `a${seq}@otp.test` })).body.code).toBe('phone_unverified');
    expect((await call('POST', '/auth/signup', { ...base, email: `b${seq}@otp.test`, phoneProof: 'faux.jeton.signe' })).body.code).toBe('phone_unverified');
    expect((await call('POST', '/auth/signup', { name: 'Test Otp', email: `c${seq}@otp.test`, password: 'Soleil2026x', acceptTerms: true })).body.code).toBe('phone_required');
    // Une preuve d'un autre numéro ne sert pas
    const other = newPhone();
    await call('POST', '/auth/otp/register/send', { phone: other });
    const v = await call('POST', '/auth/otp/register/verify', { phone: other, code: lastCode(other) });
    expect((await call('POST', '/auth/signup', { ...base, email: `d${seq}@otp.test`, phoneProof: v.body.proof })).body.code).toBe('phone_unverified');
    // Le bon numéro avec sa preuve : accepté une fois
    const ok = await call('POST', '/auth/signup', { ...base, phone: other, email: `e${seq}@otp.test`, phoneProof: v.body.proof });
    expect(ok.status).toBe(200);
    expect(ok.body.user.phoneVerified).toBe(true);
    expect(ok.body.user.phone).toBe(other);
    const replay = await call('POST', '/auth/signup', { ...base, phone: other, email: `f${seq}@otp.test`, phoneProof: v.body.proof });
    expect(replay.status).not.toBe(200);
    // Le navigateur ne peut pas se déclarer vérifié
    const me = await call('PATCH', '/auth/me', { phoneVerified: true, phone: newPhone() }, ok.body.token);
    expect(me.body.phoneVerified).toBe(true); // reste la valeur décidée à l'inscription
    expect(me.body.phone).toBe(other); // le numéro vérifié ne se change pas par cette route
  });

  it('mot de passe oublié : réponse identique pour un compte connu ou inconnu', async () => {
    const phone = newPhone();
    await signup(phone);
    sent = [];
    const known = await call('POST', '/auth/otp/forgot-password/send', { phone });
    const unknownPhone = newPhone();
    const unknown = await call('POST', '/auth/otp/forgot-password/send', { phone: unknownPhone });
    expect(unknown).toEqual(known);
    expect(sent.map((m) => m.to)).toEqual([phone]); // rien n'est envoyé à un numéro sans compte
    // Vérification avec un numéro inconnu : même erreur qu'un mauvais code
    const v = await call('POST', '/auth/otp/forgot-password/verify', { phone: unknownPhone, code: '123456' });
    expect(v.body.code).toBe('otp_invalid');
  });

  it('réinitialisation du mot de passe par code, autorisation à usage unique, anciennes sessions fermées', async () => {
    const phone = newPhone();
    const s = await signup(phone);
    await new Promise((r) => setTimeout(r, 1100)); // les sessions plus anciennes que la seconde du changement sont fermées
    await call('POST', '/auth/otp/forgot-password/send', { phone });
    const v = await call('POST', '/auth/otp/forgot-password/verify', { phone, code: lastCode(phone) });
    expect(v.status).toBe(200);
    expect(v.body.resetToken).toBeTruthy();
    // L'autorisation n'ouvre pas de session
    expect((await call('GET', '/auth/me', undefined, v.body.resetToken)).status).toBe(401);
    // Mot de passe faible refusé, bon mot de passe accepté
    expect((await call('POST', '/auth/otp/reset-password', { resetToken: v.body.resetToken, password: '12345678' })).status).toBe(422);
    const r = await call('POST', '/auth/otp/reset-password', { resetToken: v.body.resetToken, password: 'NouveauMdp2027' });
    expect(r.status).toBe(200);
    // Usage unique
    expect((await call('POST', '/auth/otp/reset-password', { resetToken: v.body.resetToken, password: 'AutreMdp2027x' })).status).toBe(400);
    // Connexion : ancien refusé, nouveau accepté
    expect((await call('POST', '/auth/login', { email: s.email, password: s.password })).status).toBe(401);
    expect((await call('POST', '/auth/login', { email: s.email, password: 'NouveauMdp2027' })).status).toBe(200);
    // L'ancienne session est fermée
    expect((await call('GET', '/auth/me', undefined, s.token)).status).toBe(401);
    // Un jeton falsifié est refusé
    expect((await call('POST', '/auth/otp/reset-password', { resetToken: 'a.b.c', password: 'NouveauMdp2028' })).status).toBe(400);
  });

  it('changement du mot de passe par code ; la route classique est fermée', async () => {
    const phone = newPhone();
    const s = await signup(phone);
    // Sans connexion : refusé
    expect((await call('POST', '/auth/otp/change-password/send', {})).status).toBe(401);
    // La route classique ne contourne pas le code
    const legacy = await call('POST', '/auth/password', { current: s.password, next: 'Contourne2027x' }, s.token);
    expect(legacy.status).toBe(403);
    expect(legacy.body.code).toBe('otp_required');
    await new Promise((r) => setTimeout(r, 1100));
    expect((await call('POST', '/auth/otp/change-password/send', {}, s.token)).status).toBe(200);
    expect(lastCode(phone)).toMatch(/^\d{6}$/);
    // Mauvais code, puis bon code
    expect((await call('POST', '/auth/otp/change-password/verify', { code: '000000' === lastCode(phone) ? '000001' : '000000' }, s.token)).body.code).toBe('otp_invalid');
    const v = await call('POST', '/auth/otp/change-password/verify', { code: lastCode(phone) }, s.token);
    expect(v.status).toBe(200);
    // L'autorisation est liée au compte : un autre compte ne peut pas s'en servir
    const other = await signup(newPhone());
    expect((await call('POST', '/auth/otp/change-password/confirm', { changeToken: v.body.changeToken, password: 'Vole2027xyz' }, other.token)).status).toBe(400);
    const c = await call('POST', '/auth/otp/change-password/confirm', { changeToken: v.body.changeToken, password: 'Change2027xyz' }, s.token);
    expect(c.status).toBe(200);
    expect(c.body.token).toBeTruthy();
    expect((await call('POST', '/auth/otp/change-password/confirm', { changeToken: v.body.changeToken, password: 'Rejoue2027xyz' }, c.body.token)).status).toBe(400);
    expect((await call('POST', '/auth/login', { email: s.email, password: 'Change2027xyz' })).status).toBe(200);
    expect((await call('GET', '/auth/me', undefined, s.token)).status).toBe(401); // ancienne session fermée
    expect((await call('GET', '/auth/me', undefined, c.body.token)).status).toBe(200); // la session courante continue
  });

  it('changement : refusé sans numéro vérifié ; vérification sans demande préalable refusée', async () => {
    const email = `nov${Date.now()}@otp.test`;
    await pool.query(`insert into users (id, email, password_hash, role, data) values ('u_nov', $1, 'x', 'organizer', '{"name":"Sans numéro"}')`, [email]);
    const tok = signToken('u_nov');
    expect((await call('POST', '/auth/otp/change-password/send', {}, tok)).body.code).toBe('phone_unverified');
    const phone = newPhone();
    const s = await signup(phone);
    expect((await call('POST', '/auth/otp/change-password/verify', { code: '123456' }, s.token)).body.code).toBe('otp_invalid');
    await pool.query(`delete from users where id = 'u_nov'`);
  });

  it('le journal de sécurité et la base ne contiennent jamais les codes ni les numéros complets', async () => {
    const phone = newPhone();
    await call('POST', '/auth/otp/register/send', { phone });
    const code = lastCode(phone);
    await call('POST', '/auth/otp/register/verify', { phone, code: '999999' });
    const log = JSON.stringify((await pool.query(`select * from otp_security_log`)).rows);
    expect(log).toContain('"event":"sent"');
    expect(log).not.toContain(phone);
    expect(log).not.toContain(`"${code}"`);
    expect(log).not.toMatch(/otp_hash/);
  });

  it('le webhook de livraison note un échec et invalide le code', async () => {
    const phone = newPhone();
    await call('POST', '/auth/otp/register/send', { phone });
    const wamid = (await rows(phone))[0].wamid;
    const { recordDeliveryStatus } = await import('./_lib/otp.js');
    await recordDeliveryStatus(wamid, 'delivered');
    expect((await rows(phone))[0].delivery_status).toBe('delivered');
    await recordDeliveryStatus(wamid, 'failed', 131026);
    const [row] = await rows(phone);
    expect(row.delivery_status).toBe('failed');
    expect(row.send_failed).toBe(true);
    expect(row.consumed_at).not.toBeNull();
  });
});
