import { createHash, createSign, generateKeyPairSync, randomBytes, sign as edSign } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { normalizeAnswer, checkQuestions, generateRecoveryCode, normalizeCode } from './_lib/secrets.js';
import { safeNext } from './_lib/google.js';
import { parseCookies, maskIp, deviceLabel } from './_lib/session.js';

// ---------- Unitaires (toujours exécutés) ----------

describe('questions de sécurité : règles', () => {
  const ok = [
    { question: 'Comment s’appelait mon premier chat ?', answer: 'Moustache' },
    { question: 'Quel était le titre de mon premier projet créatif ?', answer: 'Kanaval Pam' },
    { question: 'Où ai-je rangé mon vieux carnet rouge ?', answer: 'Sous le lit de grand-père' },
  ];
  it('accepte trois questions personnelles distinctes', () => expect(checkQuestions(ok).ok).toBe(true));
  it('refuse un nombre incorrect de questions', () => {
    expect(checkQuestions(ok.slice(0, 2)).ok).toBe(false);
    expect(checkQuestions([...ok, ok[0]]).ok).toBe(false);
    expect(checkQuestions('x').ok).toBe(false);
  });
  it('refuse les questions sur des informations publiques', () => {
    for (const q of ['Quelle est votre date de naissance exacte ?', 'Quel est votre nom de famille complet ?', 'Quelle est votre adresse actuelle ?', 'Comment s’appelle votre mère ?', 'Quel est votre pseudo Instagram ?'])
      expect(checkQuestions([{ question: q, answer: 'Réponse longue' }, ok[1], ok[2]]).ok, q).toBe(false);
  });
  it('refuse les réponses trop faibles, identiques ou qui répètent la question', () => {
    expect(checkQuestions([{ ...ok[0]!, answer: 'oui' }, ok[1], ok[2]]).ok).toBe(false);
    expect(checkQuestions([{ ...ok[0]!, answer: 'aaaa' }, ok[1], ok[2]]).ok).toBe(false);
    expect(checkQuestions([ok[0], { ...ok[1]!, answer: ok[0]!.answer }, ok[2]]).ok).toBe(false);
    expect(checkQuestions([ok[0], ok[0], ok[2]]).ok).toBe(false);
  });
  it('normalise les réponses sans effacer les accents', () => {
    expect(normalizeAnswer('  Éléphant   Rose ')).toBe('éléphant rose');
    expect(normalizeAnswer('Elephant')).not.toBe(normalizeAnswer('Éléphant'));
    expect(normalizeAnswer('ＡＢＣ')).toBe('abc'); // NFKC
  });
});

describe('codes de récupération et aides', () => {
  it('génère des codes longs et aléatoires', () => {
    const set = new Set(Array.from({ length: 500 }, generateRecoveryCode));
    expect(set.size).toBe(500);
    for (const c of set) expect(c).toMatch(/^[A-HJKMNP-TV-Z2-9]{4}-[A-HJKMNP-TV-Z2-9]{4}-[A-HJKMNP-TV-Z2-9]{4}$/);
    expect(normalizeCode('abcd-efgh-jkmn')).toBe('ABCDEFGHJKMN');
  });
  it('accepte seulement des chemins internes comme destination (pas de redirection ouverte)', () => {
    expect(safeNext('/organisateur')).toBe('/organisateur');
    for (const bad of ['//evil.com', 'https://evil.com', '/\\evil.com', 'javascript:alert(1)', '/a://b', 'organisateur', null, 12]) expect(safeNext(bad as unknown)).toBeNull();
  });
  it('cookies, adresses et appareils', () => {
    expect(parseCookies('a=1; b=hello%20x; a=2')).toEqual({ a: '1', b: 'hello x' });
    expect(maskIp('203.0.113.77')).toBe('203.0.•.•');
    expect(deviceLabel('Mozilla/5.0 (Linux; Android 13; Pixel 7) Chrome/120 Mobile Safari/537.36')).toBe('Android · Chrome');
  });
});

// ---------- Intégration : faux Google local, authentificateur WebAuthn virtuel, base Postgres jetable ----------

const DB = process.env.TEST_DATABASE_URL;

// Encodage CBOR minimal (entiers, octets, textes, tableaux, dictionnaires) pour fabriquer des réponses d'authentificateur
function cbor(v: unknown): Buffer {
  const head = (major: number, n: number) => {
    if (n < 24) return Buffer.from([(major << 5) | n]);
    if (n < 256) return Buffer.from([(major << 5) | 24, n]);
    return Buffer.from([(major << 5) | 25, n >> 8, n & 255]);
  };
  if (typeof v === 'number') return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (Buffer.isBuffer(v)) return Buffer.concat([head(2, v.length), v]);
  if (typeof v === 'string') return Buffer.concat([head(3, Buffer.byteLength(v)), Buffer.from(v)]);
  if (v instanceof Map) return Buffer.concat([head(5, v.size), ...[...v].flatMap(([k, x]) => [cbor(k), cbor(x)])]);
  throw new Error('cbor');
}
const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest();

/** Authentificateur virtuel : produit de vraies signatures ES256 que le serveur vérifie réellement. */
class Authenticator {
  key = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  credId = randomBytes(16);
  counter = 0;
  constructor(public rpId: string, public origin: string) {}
  private clientData(type: string, challenge: string) {
    return Buffer.from(JSON.stringify({ type, challenge, origin: this.origin, crossOrigin: false }));
  }
  register(challenge: string) {
    const jwk = this.key.publicKey.export({ format: 'jwk' });
    const cose = cbor(new Map<number, unknown>([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x!, 'base64url')], [-3, Buffer.from(jwk.y!, 'base64url')]]));
    const idLen = Buffer.alloc(2);
    idLen.writeUInt16BE(this.credId.length);
    const counter = Buffer.alloc(4);
    const authData = Buffer.concat([sha(this.rpId), Buffer.from([0x45]), counter, Buffer.alloc(16), idLen, this.credId, cose]);
    const att = cbor(new Map<string, unknown>([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]));
    return {
      id: b64u(this.credId), rawId: b64u(this.credId), type: 'public-key', clientExtensionResults: {},
      response: { clientDataJSON: b64u(this.clientData('webauthn.create', challenge)), attestationObject: b64u(att), transports: ['internal'] },
    };
  }
  assert(challenge: string, o: { rpId?: string; counter?: number } = {}) {
    this.counter = o.counter ?? this.counter + 1;
    const cnt = Buffer.alloc(4);
    cnt.writeUInt32BE(this.counter);
    const authData = Buffer.concat([sha(o.rpId ?? this.rpId), Buffer.from([0x05]), cnt]);
    const cd = this.clientData('webauthn.get', challenge);
    const signature = edSign('sha256', Buffer.concat([authData, sha(cd)]), this.key.privateKey);
    return {
      id: b64u(this.credId), rawId: b64u(this.credId), type: 'public-key', clientExtensionResults: {},
      response: { clientDataJSON: b64u(cd), authenticatorData: b64u(authData), signature: b64u(signature) },
    };
  }
}

describe.skipIf(!DB)('Authentification Google, passkeys et récupération (intégration)', () => {
  let pool: pg.Pool;
  let srv: http.Server;
  let handle: typeof import('./_lib/handler.js').handle;
  let hashPassword: typeof import('./_lib/auth.js').hashPassword;
  const RP = 'event509.test';
  const ORIGIN = 'https://event509.test';
  const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const otherRsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const KID = 'k1';
  // codes Google en attente : code → { claims }
  const grants = new Map<string, { claims: Record<string, unknown>; challenge: string }>();
  let tokenCalls = 0;
  let ipN = 0;
  let seq = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Out = { status: number; body: any; headers?: Record<string, string | string[]> };

  function idToken(claims: Record<string, unknown>, o: { key?: typeof rsa; alg?: string; kid?: string } = {}) {
    const h = b64u(JSON.stringify({ alg: o.alg ?? 'RS256', kid: o.kid ?? KID, typ: 'JWT' }));
    const p = b64u(JSON.stringify(claims));
    const sig = o.alg === 'none' ? '' : createSign('RSA-SHA256').update(`${h}.${p}`).sign((o.key ?? rsa).privateKey).toString('base64url');
    return `${h}.${p}.${sig}`;
  }

  /** Navigateur simulé : garde les cookies, ajoute l'en-tête CSRF comme le fait l'application. */
  class Browser {
    jar = new Map<string, string>();
    ip = `10.1.${Math.floor(ipN / 250)}.${(ipN++ % 250) + 1}`;
    constructor(public ua = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36') {}
    private store(h?: Record<string, string | string[]>) {
      const sc = h?.['Set-Cookie'];
      for (const line of Array.isArray(sc) ? sc : sc ? [sc] : []) {
        const [pair = ''] = line.split(';');
        const i = pair.indexOf('=');
        const name = pair.slice(0, i);
        const val = decodeURIComponent(pair.slice(i + 1));
        if (/Max-Age=0/i.test(line) || !val) this.jar.delete(name);
        else this.jar.set(name, val);
      }
    }
    get cookieHeader() {
      return [...this.jar].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ');
    }
    async call(method: string, path: string, body?: unknown, o: { csrf?: boolean; query?: Record<string, string>; origin?: string } = {}): Promise<Out> {
      const [pathname, qs] = path.split('?');
      const query = { ...Object.fromEntries(new URLSearchParams(qs ?? '')), ...(o.query ?? {}) };
      const out = (await handle({
        method, path: pathname!, query, body, ip: this.ip, cookie: this.cookieHeader || undefined, userAgent: this.ua,
        csrf: o.csrf === false ? undefined : '1', origin: o.origin, host: RP,
      })) as Out;
      this.store(out.headers);
      return out;
    }
    /** Parcours Google complet : départ, retour de Google (faux serveur), callback. */
    async google(purpose: string, claims: Record<string, unknown>, o: { next?: string; tamper?: (u: URL) => void; dropBrowser?: boolean; claimsOverride?: (c: Record<string, unknown>, nonce: string) => Record<string, unknown>; token?: (c: Record<string, unknown>) => string } = {}) {
      const start = await this.call('GET', '/auth/google/start', undefined, { query: { purpose, ...(o.next ? { next: o.next } : {}) } });
      expect(start.status).toBe(302);
      const loc = new URL(String(start.headers!.Location));
      if (loc.host !== 'accounts.google.test') return { start, cb: start };
      const state = loc.searchParams.get('state')!;
      const nonce = loc.searchParams.get('nonce')!;
      const challenge = loc.searchParams.get('code_challenge')!;
      expect(loc.searchParams.get('code_challenge_method')).toBe('S256');
      expect(loc.searchParams.get('response_type')).toBe('code');
      expect(loc.searchParams.get('scope')).toBe('openid email profile');
      return { start, cb: await this.callback(state, nonce, challenge, claims, o), state, nonce };
    }
    async callback(state: string, nonce: string, challenge: string, claims: Record<string, unknown>, o: { dropBrowser?: boolean; claimsOverride?: (c: Record<string, unknown>, nonce: string) => Record<string, unknown>; token?: (c: Record<string, unknown>) => string } = {}) {
      const code = `code_${++seq}`;
      const full = o.claimsOverride ? o.claimsOverride(claims, nonce) : { iss: 'https://accounts.google.com', aud: 'test-client', exp: Math.floor(Date.now() / 1000) + 600, iat: Math.floor(Date.now() / 1000), nonce, email_verified: true, ...claims };
      grants.set(code, { claims: full, challenge });
      if (o.token) grants.set(code, { claims: { __raw: o.token(full) }, challenge });
      const saved = this.jar.get('e509_oauth');
      if (o.dropBrowser) this.jar.delete('e509_oauth');
      const cb = await this.call('GET', '/auth/google/callback', undefined, { query: { code, state } });
      if (o.dropBrowser && saved) this.jar.set('e509_oauth', saved);
      return cb;
    }
  }
  const loc = (o: Out) => String(o.headers?.Location ?? '');
  const qs3 = [
    { question: 'Comment s’appelait mon premier chat ?', answer: 'Moustache' },
    { question: 'Quel était le titre de mon premier projet créatif ?', answer: 'Kanaval Pam' },
    { question: 'Où ai-je rangé mon vieux carnet rouge ?', answer: 'Sous le lit de grand-père' },
  ];
  const profile = (extra: Record<string, unknown> = {}) => ({ givenName: 'Marie', familyName: 'Claire', country: 'HT', city: 'Jacmel', questions: qs3, acceptTerms: true, acceptPrivacy: true, ...extra });
  const google = (n: number, extra: Record<string, unknown> = {}) => ({ sub: `g-sub-${n}-${seq}`, email: `user${n}-${Date.now()}${seq}@gmail.test`, given_name: 'Marie', family_name: 'Claire', ...extra });

  /** Crée un compte complet via Google ; renvoie le navigateur connecté et ses informations. */
  async function newAccount(claimsExtra: Record<string, unknown> = {}) {
    const b = new Browser();
    const claims = google(++seq, claimsExtra);
    const { cb } = await b.google('login', claims);
    expect(loc(cb)).toBe('/inscription/profil');
    const done = await b.call('POST', '/auth/signup/complete', profile());
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    return { b, claims, user: done.body.user, id: done.body.user.id as string };
  }
  const events = async (userId: string) => (await pool.query(`select event from security_events where user_id = $1 order by at`, [userId])).rows.map((r) => r.event as string);
  const lastCodes = async (b: Browser) => {
    await b.call('POST', '/auth/reauth/passkey/options'); // (appel inoffensif pour la session)
  };
  void lastCodes;

  beforeAll(async () => {
    process.env.DATABASE_URL = DB;
    process.env.JWT_SECRET = 'z'.repeat(40);
    process.env.COOKIE_INSECURE = '1';
    process.env.SITE_URL = ORIGIN;
    process.env.WEBAUTHN_RP_ID = RP;
    process.env.GOOGLE_CLIENT_ID = 'test-client';
    process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
    process.env.GOOGLE_REDIRECT_URI = `${ORIGIN}/api/auth/google/callback`;
    process.env.GOOGLE_AUTH_URL = 'https://accounts.google.test/auth';
    srv = http.createServer((req, res) => {
      let b = '';
      req.on('data', (d) => (b += d));
      req.on('end', () => {
        res.setHeader('content-type', 'application/json');
        if (req.url === '/certs') {
          const jwk = rsa.publicKey.export({ format: 'jwk' });
          return void res.end(JSON.stringify({ keys: [{ ...jwk, kid: KID, alg: 'RS256', use: 'sig' }] }));
        }
        tokenCalls++;
        const p = new URLSearchParams(b);
        const g = grants.get(p.get('code') ?? '');
        grants.delete(p.get('code') ?? ''); // un code Google ne sert qu'une fois
        const okSecret = p.get('client_secret') === 'test-secret' && p.get('client_id') === 'test-client' && p.get('redirect_uri') === process.env.GOOGLE_REDIRECT_URI;
        // PKCE : le vérificateur doit correspondre au défi envoyé au départ
        const pkce = !!g && createHash('sha256').update(p.get('code_verifier') ?? '').digest('base64url') === g.challenge;
        if (!g || !okSecret || !pkce) return void res.writeHead(400).end(JSON.stringify({ error: 'invalid_grant' }));
        const raw = (g.claims as { __raw?: string }).__raw;
        res.end(JSON.stringify({ id_token: raw ?? idToken(g.claims), access_token: 'x' }));
      });
    });
    await new Promise<void>((r) => srv.listen(0, r));
    const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    process.env.GOOGLE_TOKEN_URL = `${base}/token`;
    process.env.GOOGLE_JWKS_URL = `${base}/certs`;
    pool = new pg.Pool({ connectionString: DB });
    for (const t of ['rate_events', 'oauth_states', 'pending_signups', 'pending_links', 'recovery_sessions', 'recovery_requests', 'auth_challenges']) await pool.query(`delete from ${t}`);
    await pool.query(`delete from users where email like '%@gmail.test' or email like '%@legacy.test' or email like '%@admin.test'`);
    await pool.query(`delete from organizers where id like 'org_leg%'`);
    ({ handle } = await import('./_lib/handler.js'));
    ({ hashPassword } = await import('./_lib/auth.js'));
  });
  afterAll(async () => {
    await pool?.query(`delete from users where email like '%@gmail.test' or email like '%@legacy.test' or email like '%@admin.test'`);
    await pool?.query(`delete from organizers where id like 'org_leg%'`);
    await pool?.end();
    srv?.close();
  });

  // ---- 1-4. Inscription Google, profil, questions

  it('1-3. inscription Google : provisoire, préremplie, puis compte créé après profil + questions + conditions', async () => {
    const b = new Browser();
    const claims = google(1, { given_name: 'Joseph', family_name: 'Roosvelt' });
    const { start, cb } = await b.google('login', claims);
    expect(start.headers!['Set-Cookie']).toBeTruthy();
    // Nouvel utilisateur : inscription provisoire, aucun compte, aucune session
    expect(loc(cb)).toBe('/inscription/profil');
    expect((await pool.query(`select 1 from users where email = $1`, [claims.email])).rowCount).toBe(0);
    expect((await b.call('GET', '/auth/me')).status).toBe(401);
    const pend = await b.call('GET', '/auth/signup/pending');
    expect(pend.body).toMatchObject({ pending: true, email: claims.email, givenName: 'Joseph', familyName: 'Roosvelt' });
    expect(JSON.stringify(pend.body)).not.toMatch(/sub|token|secret/i);
    // Champs obligatoires et acceptations
    expect((await b.call('POST', '/auth/signup/complete', profile({ acceptTerms: false }))).body.code).toBe('consent_required');
    expect((await b.call('POST', '/auth/signup/complete', profile({ acceptPrivacy: false }))).body.code).toBe('consent_required');
    expect((await b.call('POST', '/auth/signup/complete', profile({ givenName: '' }))).body.code).toBe('profile_invalid');
    expect((await b.call('POST', '/auth/signup/complete', profile({ country: 'Haïti' }))).body.code).toBe('profile_invalid');
    expect((await b.call('POST', '/auth/signup/complete', profile({ questions: qs3.slice(0, 2) }))).body.code).toBe('questions_invalid');
    expect((await b.call('POST', '/auth/signup/complete', profile({ questions: [{ question: 'Quelle est votre date de naissance ?', answer: 'xxxxxx' }, qs3[1], qs3[2]] }))).body.code).toBe('questions_invalid');
    // Rien n'a été créé par les refus (atomicité) : l'inscription provisoire est toujours là
    expect((await pool.query(`select 1 from users where email = $1`, [claims.email])).rowCount).toBe(0);
    expect((await b.call('GET', '/auth/signup/pending')).body.pending).toBe(true);
    const done = await b.call('POST', '/auth/signup/complete', profile({ username: 'Joseph.R' }));
    expect(done.status).toBe(200);
    expect(done.body.user).toMatchObject({ email: claims.email, name: 'Marie Claire', role: 'organizer', authComplete: true, username: 'joseph.r' });
    expect(done.body.token).toBeUndefined(); // aucun jeton dans le navigateur
    expect(JSON.stringify(done.body)).not.toMatch(/answer|hash|\$argon2/);
    const cookie = [...b.jar.keys()].find((k) => k.includes('e509_session'));
    expect(cookie).toBeTruthy();
    expect((await b.call('GET', '/auth/me')).body.email).toBe(claims.email);
    // Compte, identité Google (par « sub »), 3 questions, organisation
    const u = (await pool.query(`select id, role, team_role, organizer_id, auth_complete, password_hash from users where email = $1`, [claims.email])).rows[0];
    expect(u).toMatchObject({ role: 'organizer', team_role: 'admin', auth_complete: true, password_hash: null });
    expect(u.id).toMatch(/^u_/); // identifiant interne, pas l'e-mail
    expect((await pool.query(`select subject, status from auth_identities where user_id = $1`, [u.id])).rows).toEqual([{ subject: claims.sub, status: 'active' }]);
    expect((await pool.query(`select count(*)::int as n from security_questions where user_id = $1`, [u.id])).rows[0].n).toBe(3);
    expect((await pool.query(`select 1 from organizers where id = $1`, [u.organizer_id])).rowCount).toBe(1);
    // L'inscription provisoire est supprimée ; elle ne peut pas servir deux fois
    expect((await pool.query(`select 1 from pending_signups where google_sub = $1`, [claims.sub])).rowCount).toBe(0);
    const again = await b.call('POST', '/auth/signup/complete', profile());
    expect(again.status).toBe(410);
  });

  it('2. connexion Google : même compte, session créée, jamais de doublon', async () => {
    const { claims, id } = await newAccount();
    const b2 = new Browser();
    const r = await b2.google('login', claims, { next: '/organisateur/evenements' });
    expect(loc(r.cb)).toBe('/organisateur/evenements');
    expect((await b2.call('GET', '/auth/me')).body.id).toBe(id);
    expect((await pool.query(`select count(*)::int as n from users where email = $1`, [claims.email])).rows[0].n).toBe(1);
    // Destination externe refusée : retour au tableau de bord
    const b3 = new Browser();
    const r3 = await b3.google('login', claims, { next: 'https://evil.example/x' });
    expect(loc(r3.cb)).toBe('/organisateur');
    expect(await events(id)).toContain('login');
  });

  // ---- 5-7. Questions : stockage, vérification, tentatives

  it('6. les réponses sont hachées avec Argon2id et ne ressortent jamais', async () => {
    const { b, id } = await newAccount();
    const rows = (await pool.query(`select question, answer_hash from security_questions where user_id = $1 order by position`, [id])).rows;
    for (const r of rows) {
      expect(r.answer_hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
      for (const a of ['moustache', 'kanaval pam', 'grand-père', 'Moustache', 'Kanaval']) expect(r.answer_hash.toLowerCase()).not.toContain(a.toLowerCase());
    }
    expect(new Set(rows.map((r) => r.answer_hash.split('$')[4])).size).toBe(3); // sels individuels
    const sec = await b.call('GET', '/auth/security');
    const text = JSON.stringify(sec.body);
    expect(sec.body.questions.count).toBe(3);
    for (const bad of ['Moustache', 'Kanaval', 'argon2', 'answer', 'premier chat']) expect(text).not.toContain(bad);
    const logs = JSON.stringify((await pool.query(`select detail from security_events where user_id = $1`, [id])).rows);
    expect(logs).not.toMatch(/Moustache|Kanaval|argon2/);
  });

  // ---- 8-9. Passkeys

  it('8-9. enregistrement et connexion avec une passkey (vraies signatures vérifiées)', async () => {
    const { b, id, claims } = await newAccount();
    const auth = new Authenticator(RP, ORIGIN);
    // Sans réauthentification récente : refusé
    await pool.query(`update auth_sessions set recent_auth_at = now() - interval '1 hour' where user_id = $1`, [id]);
    expect((await b.call('POST', '/auth/passkeys/register/options')).body.code).toBe('reauth_required');
    await pool.query(`update auth_sessions set recent_auth_at = now() where user_id = $1`, [id]);
    const o = await b.call('POST', '/auth/passkeys/register/options');
    expect(o.status).toBe(200);
    expect(o.body.options.authenticatorSelection).toMatchObject({ userVerification: 'required', residentKey: 'required' });
    // Mauvaise origine : refusée
    const evil = new Authenticator(RP, 'https://evil.example');
    expect((await b.call('POST', '/auth/passkeys/register/verify', { challengeId: o.body.challengeId, response: evil.register(o.body.options.challenge), name: 'x' })).status).toBe(400);
    const o2 = await b.call('POST', '/auth/passkeys/register/options');
    const reg = await b.call('POST', '/auth/passkeys/register/verify', { challengeId: o2.body.challengeId, response: auth.register(o2.body.options.challenge), name: 'Mon téléphone' });
    expect(reg.status).toBe(200);
    // Le défi est à usage unique
    expect((await b.call('POST', '/auth/passkeys/register/verify', { challengeId: o2.body.challengeId, response: auth.register(o2.body.options.challenge), name: 'Rejeu' })).status).toBe(400);
    const sec = await b.call('GET', '/auth/security');
    expect(sec.body.passkeys).toHaveLength(1);
    expect(sec.body.passkeys[0].name).toBe('Mon téléphone');
    expect(JSON.stringify(sec.body)).not.toMatch(/publicKey|public_key|credential/i);
    // Connexion avec la passkey sur un autre appareil (sans cookie)
    const dev = new Browser();
    const lo = await dev.call('POST', '/auth/passkeys/login/options');
    expect(lo.body.options.userVerification).toBe('required');
    const ok = await dev.call('POST', '/auth/passkeys/login/verify', { challengeId: lo.body.challengeId, response: auth.assert(lo.body.options.challenge) });
    expect(ok.status).toBe(200);
    expect(ok.body.user.id).toBe(id);
    expect((await dev.call('GET', '/auth/me')).body.id).toBe(id);
    // Signature falsifiée, mauvais RP, compteur qui recule, défi rejoué
    const lo2 = await dev.call('POST', '/auth/passkeys/login/options');
    const forged = new Authenticator(RP, ORIGIN);
    forged.credId = auth.credId;
    expect((await new Browser().call('POST', '/auth/passkeys/login/verify', { challengeId: lo2.body.challengeId, response: forged.assert(lo2.body.options.challenge) })).status).toBe(400);
    const lo3 = await dev.call('POST', '/auth/passkeys/login/options');
    expect((await new Browser().call('POST', '/auth/passkeys/login/verify', { challengeId: lo3.body.challengeId, response: auth.assert(lo3.body.options.challenge, { rpId: 'evil.example' }) })).status).toBe(400);
    const lo4 = await dev.call('POST', '/auth/passkeys/login/options');
    expect((await new Browser().call('POST', '/auth/passkeys/login/verify', { challengeId: lo4.body.challengeId, response: auth.assert(lo4.body.options.challenge, { counter: 1 }) })).status).toBe(400);
    const lo5 = await dev.call('POST', '/auth/passkeys/login/options');
    const good = auth.assert(lo5.body.options.challenge);
    expect((await new Browser().call('POST', '/auth/passkeys/login/verify', { challengeId: lo5.body.challengeId, response: good })).status).toBe(200);
    expect((await new Browser().call('POST', '/auth/passkeys/login/verify', { challengeId: lo5.body.challengeId, response: good })).status).toBe(400);
    // Réauthentification par passkey
    await pool.query(`update auth_sessions set recent_auth_at = now() - interval '1 hour' where user_id = $1`, [id]);
    const ro = await b.call('POST', '/auth/reauth/passkey/options');
    expect((await b.call('POST', '/auth/reauth/passkey/verify', { challengeId: ro.body.challengeId, response: auth.assert(ro.body.options.challenge) })).status).toBe(200);
    expect((await b.call('GET', '/auth/security')).body.recentAuth).toBe(true);
    // Suppression : réauthentification récente exigée, jamais la dernière méthode
    const pid = sec.body.passkeys[0].id;
    await pool.query(`update auth_sessions set recent_auth_at = now() - interval '1 hour' where user_id = $1`, [id]);
    expect((await b.call('DELETE', `/auth/passkeys/${pid}`)).body.code).toBe('reauth_required');
    await pool.query(`update auth_sessions set recent_auth_at = now() where user_id = $1`, [id]);
    expect((await b.call('DELETE', `/auth/passkeys/${pid}`)).status).toBe(200);
    expect((await b.call('GET', '/auth/security')).body.passkeys).toHaveLength(0);
    expect(await events(id)).toEqual(expect.arrayContaining(['passkey_added', 'passkey_removed']));
    void claims;
  });

  // ---- 10-11. Codes de récupération

  it('10-11. codes de récupération : affichés une fois, hachés, usage unique, révocables', async () => {
    const { b, id } = await newAccount();
    const gen = await b.call('POST', '/auth/security/recovery-codes');
    expect(gen.status).toBe(200);
    const codes: string[] = gen.body.codes;
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    const rows = (await pool.query(`select code_hash from recovery_codes where user_id = $1`, [id])).rows.map((r) => r.code_hash as string);
    for (const c of codes) for (const h of rows) expect(h).not.toContain(normalizeCode(c));
    expect(rows.every((h) => /^[0-9a-f]{64}$/.test(h))).toBe(true);
    // Jamais renvoyés ensuite
    const sec = await b.call('GET', '/auth/security');
    expect(sec.body.recoveryCodes).toEqual({ remaining: 10 });
    for (const c of codes) expect(JSON.stringify(sec.body)).not.toContain(c);
    // Réauthentification par code : usage unique
    await pool.query(`update auth_sessions set recent_auth_at = now() - interval '1 hour' where user_id = $1`, [id]);
    const used = await b.call('POST', '/auth/reauth/recovery-code', { code: codes[0] });
    expect(used.status).toBe(200);
    expect(used.body.remaining).toBe(9);
    expect((await b.call('POST', '/auth/reauth/recovery-code', { code: codes[0] })).status).toBe(400); // déjà consommé
    expect((await b.call('POST', '/auth/reauth/recovery-code', { code: 'ZZZZ-ZZZZ-ZZZZ' })).status).toBe(400);
    const log = JSON.stringify((await pool.query(`select detail from security_events where user_id = $1`, [id])).rows);
    expect(log).not.toContain(normalizeCode(codes[0]!));
    expect(await events(id)).toContain('recovery_code_used');
    // Nouvelle série : les anciens codes ne fonctionnent plus
    const gen2 = await b.call('POST', '/auth/security/recovery-codes');
    expect(gen2.body.codes).not.toEqual(expect.arrayContaining([codes[1]]));
    await pool.query(`update auth_sessions set recent_auth_at = now() - interval '1 hour' where user_id = $1`, [id]);
    expect((await b.call('POST', '/auth/reauth/recovery-code', { code: codes[1] })).status).toBe(400);
    // Révocation de toute la série (réauthentification requise)
    expect((await b.call('POST', '/auth/security/recovery-codes/revoke')).body.code).toBe('reauth_required');
    expect((await b.call('POST', '/auth/reauth/recovery-code', { code: gen2.body.codes[0] })).status).toBe(200);
    expect((await b.call('POST', '/auth/security/recovery-codes/revoke')).body.revoked).toBe(9);
    expect((await b.call('GET', '/auth/security')).body.recoveryCodes.remaining).toBe(0);
    // Limite de tentatives
    const results: number[] = [];
    for (let i = 0; i < 7; i++) results.push((await b.call('POST', '/auth/reauth/recovery-code', { code: 'AAAA-BBBB-CCCC' })).status);
    expect(results).toContain(429);
  });

  // ---- 12. Perte d'accès à Google, récupération par facteurs indépendants

  it('12. perte de Google : code de récupération + questions, puis nouveau Google ; l’ancien est écarté', async () => {
    const { b, id, claims } = await newAccount();
    const codes: string[] = (await b.call('POST', '/auth/security/recovery-codes')).body.codes;
    const oldSession = b;
    const rec = new Browser();
    const start = await rec.call('POST', '/auth/recovery/start', { identifier: claims.email });
    const token = start.body.recoveryToken;
    // Les questions et l'accès Google ne sont pas offerts sans facteur
    expect((await rec.call('POST', '/auth/recovery/questions/list', { recoveryToken: token })).body.code).toBe('factor_required');
    expect((await rec.call('POST', '/auth/recovery/google', { recoveryToken: token })).status).toBe(403);
    // Les questions seules ne suffisent jamais : on ne peut même pas les atteindre
    expect((await rec.call('POST', '/auth/recovery/questions/answer', { recoveryToken: token, answers: ['Moustache', 'Kanaval Pam', 'Sous le lit de grand-père'] })).status).toBe(400);
    expect((await rec.call('POST', '/auth/recovery/code', { recoveryToken: token, code: 'AAAA-BBBB-CCCC' })).body.code).toBe('recovery_failed');
    expect((await rec.call('POST', '/auth/recovery/code', { recoveryToken: token, code: codes[0] })).status).toBe(200);
    // Premier facteur : insuffisant seul
    expect((await rec.call('POST', '/auth/recovery/google', { recoveryToken: token })).status).toBe(403);
    const ql = await rec.call('POST', '/auth/recovery/questions/list', { recoveryToken: token });
    expect(ql.body.questions).toEqual(qs3.map((q) => q.question));
    expect(JSON.stringify(ql.body)).not.toContain('Moustache');
    // Mauvaises réponses
    expect((await rec.call('POST', '/auth/recovery/questions/answer', { recoveryToken: token, answers: ['non', 'Kanaval Pam', 'Sous le lit de grand-père'] })).body.code).toBe('recovery_failed');
    expect((await rec.call('POST', '/auth/recovery/google', { recoveryToken: token })).status).toBe(403);
    // Bonnes réponses (casse et espaces ignorés)
    expect((await rec.call('POST', '/auth/recovery/questions/answer', { recoveryToken: token, answers: ['  MOUSTACHE ', 'kanaval   pam', 'Sous le lit de grand-père'] })).status).toBe(200);
    const g = await rec.call('POST', '/auth/recovery/google', { recoveryToken: token });
    expect(g.status).toBe(200);
    // Un Google déjà associé à un autre compte est refusé
    const other = await newAccount();
    const url = new URL(g.body.url);
    const taken = await rec.callback(url.searchParams.get('state')!, url.searchParams.get('nonce')!, url.searchParams.get('code_challenge')!, other.claims);
    expect(loc(taken)).toContain('google_in_use');
    // Nouveau Google libre : la récupération aboutit (la tentative précédente a consommé l'état ; on recommence)
    const g2 = await rec.call('POST', '/auth/recovery/google', { recoveryToken: token });
    const u2 = new URL(g2.body.url);
    const newClaims = google(99);
    const done = await rec.callback(u2.searchParams.get('state')!, u2.searchParams.get('nonce')!, u2.searchParams.get('code_challenge')!, newClaims);
    expect(loc(done)).toBe('/compte/securite?recovered=1');
    expect((await rec.call('GET', '/auth/me')).body.id).toBe(id); // même compte EVENT509
    // L'ancienne session est fermée, l'ancien Google n'ouvre plus ce compte, le nouveau oui
    expect((await oldSession.call('GET', '/auth/me')).status).toBe(401);
    const oldLogin = await new Browser().google('login', claims);
    expect(loc(oldLogin.cb)).toBe('/connexion?error=legacy_account'); // l'ancien Google n'est plus rattaché et n'est jamais fusionné sur l'e-mail
    const newLogin = await new Browser().google('login', newClaims);
    expect(loc(newLogin.cb)).toBe('/organisateur');
    expect((await pool.query(`select status from auth_identities where user_id = $1 order by created_at`, [id])).rows.map((r) => r.status)).toEqual(['replaced', 'active']);
    // La tentative de récupération ne ressert pas
    expect(loc(await rec.callback(u2.searchParams.get('state')!, u2.searchParams.get('nonce')!, u2.searchParams.get('code_challenge')!, newClaims))).toContain('error=');
    expect(await events(id)).toEqual(expect.arrayContaining(['recovery_started', 'recovery_code_used', 'recovery_completed']));
  });

  it('7. tentatives incorrectes : verrouillage, réponses identiques pour un compte inconnu', async () => {
    const { b, claims } = await newAccount();
    const codes: string[] = (await b.call('POST', '/auth/security/recovery-codes')).body.codes;
    const rec = new Browser();
    const token = (await rec.call('POST', '/auth/recovery/start', { identifier: claims.email })).body.recoveryToken;
    await rec.call('POST', '/auth/recovery/code', { recoveryToken: token, code: codes[0] });
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await rec.call('POST', '/auth/recovery/questions/answer', { recoveryToken: token, answers: ['a1x', 'b2y', 'c3z'] })).status);
    expect(statuses.slice(0, 5)).toEqual([400, 400, 400, 400, 400]);
    expect(statuses[5]).toBe(429);
    // Même avec les bonnes réponses, la tentative est verrouillée
    expect((await rec.call('POST', '/auth/recovery/questions/answer', { recoveryToken: token, answers: ['Moustache', 'Kanaval Pam', 'Sous le lit de grand-père'] })).status).toBe(429);
    // Compte inconnu : mêmes réponses, aucune fuite
    const u = new Browser();
    const known = await u.call('POST', '/auth/recovery/start', { identifier: claims.email });
    const unknown = await u.call('POST', '/auth/recovery/start', { identifier: 'personne-inconnue@gmail.test' });
    expect(Object.keys(unknown.body).sort()).toEqual(Object.keys(known.body).sort());
    expect(unknown.body.methods).toEqual(known.body.methods);
    const f1 = await u.call('POST', '/auth/recovery/code', { recoveryToken: unknown.body.recoveryToken, code: 'AAAA-BBBB-CCCC' });
    const f2 = await u.call('POST', '/auth/recovery/code', { recoveryToken: known.body.recoveryToken, code: 'AAAA-BBBB-CCCC' });
    expect(f1.status).toBe(f2.status);
    expect(f1.body).toEqual(f2.body);
    // Limite par connexion (IP) : au-delà, 429 même sans compte
    const spam = new Browser();
    const out: number[] = [];
    for (let i = 0; i < 12; i++) out.push((await spam.call('POST', '/auth/recovery/start', { identifier: `x${i}@gmail.test` })).status);
    expect(out).toContain(429);
  });

  // ---- 13. Changement de compte Google

  it('13. changement de compte Google : réauthentification, confirmation explicite, annulation possible', async () => {
    const { b, id, claims } = await newAccount();
    const fresh = google(50);
    // Réauthentification périmée : refusé
    await pool.query(`update auth_sessions set recent_auth_at = now() - interval '1 hour' where user_id = $1`, [id]);
    const early = await b.call('GET', '/auth/google/start', undefined, { query: { purpose: 'link' } });
    expect(loc(early)).toContain('error=reauth_required');
    // Réauthentification Google : doit être le même compte
    const wrong = await b.google('reauth', google(51));
    expect(loc(wrong.cb)).toContain('error=wrong_google');
    expect((await b.call('GET', '/auth/security')).body.recentAuth).toBe(false);
    const re = await b.google('reauth', claims);
    expect(loc(re.cb)).toBe('/compte/securite');
    expect((await b.call('GET', '/auth/security')).body.recentAuth).toBe(true);
    // Nouveau Google : demande en attente, rien n'est encore changé
    const l = await b.google('link', fresh);
    const token = new URL(loc(l.cb), 'https://x').searchParams.get('link')!;
    expect(token).toBeTruthy();
    expect((await b.call('GET', '/auth/google/link/pending', undefined, { query: { token } })).body.email).toBe(fresh.email);
    expect((await pool.query(`select subject from auth_identities where user_id = $1 and status = 'active'`, [id])).rows[0].subject).toBe(claims.sub);
    // Sans confirmation explicite : refusé ; avec : accepté
    expect((await b.call('POST', '/auth/google/link/confirm', { token, confirm: false })).status).toBe(422);
    // Un autre compte EVENT509 ne peut pas utiliser cette demande
    const intruder = await newAccount();
    expect((await intruder.b.call('POST', '/auth/google/link/confirm', { token, confirm: true })).status).toBe(404);
    expect((await b.call('POST', '/auth/google/link/confirm', { token, confirm: true })).status).toBe(200);
    expect((await pool.query(`select subject, status from auth_identities where user_id = $1 order by created_at`, [id])).rows.map((r) => `${r.subject === fresh.sub ? 'new' : 'old'}:${r.status}`)).toEqual(['old:replaced', 'new:active']);
    // Données conservées : même compte, même organisation
    expect((await new Browser().google('login', fresh)).cb.headers!.Location).toBe('/organisateur');
    expect((await b.call('GET', '/auth/me')).body.id).toBe(id);
    // La demande est à usage unique
    expect((await b.call('POST', '/auth/google/link/confirm', { token, confirm: true })).status).toBe(404);
    // Un Google déjà pris par un autre compte est refusé
    const dupe = await b.google('link', intruder.claims);
    expect(loc(dupe.cb)).toContain('google_in_use');
    // Annulation dans les 72 h
    expect((await b.call('POST', '/auth/google/link/undo')).status).toBe(200);
    expect(loc((await new Browser().google('login', claims)).cb)).toBe('/organisateur');
    expect(await events(id)).toEqual(expect.arrayContaining(['google_changed', 'google_change_undone']));
  });

  // ---- 14-15. Changement de téléphone, sessions

  it('14-15. nouveau téléphone : connexion Google, liste des appareils, révocation des anciennes sessions', async () => {
    const { b: oldPhone, id, claims } = await newAccount();
    const newPhone = new Browser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1');
    const r = await newPhone.google('login', claims);
    expect(loc(r.cb)).toBe('/organisateur');
    const list = await newPhone.call('GET', '/auth/sessions');
    expect(list.body).toHaveLength(2);
    expect(list.body.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
    expect(list.body.map((s: { device: string }) => s.device).sort()).toEqual(['Android · Chrome', 'iPhone / iPad · Safari']);
    expect(JSON.stringify(list.body)).not.toMatch(/\d+\.\d+\.\d+\.\d+/); // adresses masquées
    // Révoquer l'ancien téléphone
    const oldId = list.body.find((s: { current: boolean }) => !s.current).id;
    expect((await newPhone.call('DELETE', `/auth/sessions/${oldId}`)).status).toBe(200);
    expect((await oldPhone.call('GET', '/auth/me')).status).toBe(401);
    expect((await newPhone.call('GET', '/auth/me')).body.id).toBe(id);
    expect((await newPhone.call('DELETE', `/auth/sessions/${oldId}`)).status).toBe(404);
    // Révoquer les autres sessions d'un coup
    const third = new Browser();
    await third.google('login', claims);
    const rv = await newPhone.call('POST', '/auth/sessions/revoke-others');
    expect(rv.body.revoked).toBe(1);
    expect((await third.call('GET', '/auth/me')).status).toBe(401);
    // Les sessions d'un autre compte ne sont pas accessibles
    const other = await newAccount();
    const otherList = await other.b.call('GET', '/auth/sessions');
    expect((await newPhone.call('DELETE', `/auth/sessions/${otherList.body[0].id}`)).status).toBe(404);
    // Déconnexion
    expect((await newPhone.call('POST', '/auth/logout')).status).toBe(200);
    expect((await newPhone.call('GET', '/auth/me')).status).toBe(401);
  });

  // ---- 16. Assistance administrative

  async function adminBrowser() {
    const email = `adm${++seq}@admin.test`;
    await pool.query(`insert into users (id, email, password_hash, role, data, auth_complete) values ($1,$2,$3,'admin','{"name":"Admin Test"}', true)`, [`u_adm${seq}`, email, await hashPassword('Admin2026secure')]);
    const b = new Browser();
    const r = await b.call('POST', '/auth/login', { email, password: 'Admin2026secure' });
    expect(r.status).toBe(200);
    return { b, id: `u_adm${seq}` };
  }

  it('16. assistance : demande, décision motivée, délai de sécurité, nouveau Google par l’utilisateur lui-même', async () => {
    const { id, claims, b: victim } = await newAccount();
    const requester = new Browser();
    const req = await requester.call('POST', '/auth/recovery/assist', { identifier: claims.email, reason: 'J’ai perdu mon téléphone et l’accès à mon compte Google, je suis l’organisateur de plusieurs événements.', contact: 'autre@exemple.test' });
    expect(req.status).toBe(200);
    // Réponse identique pour un compte inconnu
    const unk = await new Browser().call('POST', '/auth/recovery/assist', { identifier: 'inconnu@gmail.test', reason: 'Je souhaite récupérer un compte qui n’existe pas vraiment ici.' });
    expect(Object.keys(unk.body).sort()).toEqual(Object.keys(req.body).sort());
    expect((await requester.call('POST', '/auth/recovery/assist', { identifier: claims.email, reason: 'court' })).status).toBe(422);
    const st = await requester.call('POST', '/auth/recovery/assist/status', { requestToken: req.body.requestToken });
    expect(st.body).toMatchObject({ status: 'pending', ready: false });
    // Le titulaire est prévenu (journal) et peut voir la demande
    expect(await events(id)).toContain('recovery_requested');
    expect((await victim.call('GET', '/auth/security')).body.recoveryRequests[0].status).toBe('pending');
    // Sans administrateur, aucun accès
    expect((await requester.call('GET', '/admin/recovery-requests')).status).toBe(401);
    expect((await victim.call('GET', '/admin/recovery-requests')).status).toBe(403);
    const adm = await adminBrowser();
    const list = await adm.b.call('GET', '/admin/recovery-requests');
    const item = list.body.find((r: { user_id: string }) => r.user_id === id);
    expect(item).toMatchObject({ status: 'pending', email: claims.email });
    // Décision motivée obligatoire ; réauthentification récente obligatoire
    expect((await adm.b.call('POST', `/admin/recovery-requests/${item.id}/decide`, { action: 'approve', note: 'ok' })).body.code).toBe('note_required');
    await pool.query(`update auth_sessions set recent_auth_at = now() - interval '1 hour' where user_id = $1`, [adm.id]);
    expect((await adm.b.call('POST', `/admin/recovery-requests/${item.id}/decide`, { action: 'approve', note: 'Identité vérifiée par visioconférence.' })).body.code).toBe('reauth_required');
    await pool.query(`update auth_sessions set recent_auth_at = now() where user_id = $1`, [adm.id]);
    const ok = await adm.b.call('POST', `/admin/recovery-requests/${item.id}/decide`, { action: 'approve', note: 'Identité vérifiée par visioconférence.' });
    expect(ok.status).toBe(200);
    expect(new Date(ok.body.executeAfter).getTime() - Date.now()).toBeGreaterThan(47 * 3_600_000);
    expect((await adm.b.call('POST', `/admin/recovery-requests/${item.id}/decide`, { action: 'reject', note: 'Déjà traité ailleurs.' })).status).toBe(409);
    // Délai de sécurité : pas encore utilisable, même avec le bon lien
    expect((await requester.call('POST', '/auth/recovery/assist/status', { requestToken: req.body.requestToken })).body).toMatchObject({ status: 'approved', ready: false });
    expect((await requester.call('POST', '/auth/recovery/assist/google', { requestToken: req.body.requestToken })).status).toBe(403);
    // L'administrateur n'a aucun moyen de changer l'identité Google lui-même
    expect((await adm.b.call('POST', '/auth/google/link/confirm', { token: 'x', confirm: true })).status).toBe(404);
    // Délai écoulé : l'utilisateur s'authentifie lui-même avec le NOUVEAU Google
    await pool.query(`update recovery_requests set execute_after = now() - interval '1 minute' where id = $1`, [item.id]);
    expect((await requester.call('POST', '/auth/recovery/assist/status', { requestToken: req.body.requestToken })).body.ready).toBe(true);
    const g = await requester.call('POST', '/auth/recovery/assist/google', { requestToken: req.body.requestToken });
    const url = new URL(g.body.url);
    const fresh = google(77);
    const done = await requester.callback(url.searchParams.get('state')!, url.searchParams.get('nonce')!, url.searchParams.get('code_challenge')!, fresh);
    expect(loc(done)).toBe('/compte/securite?recovered=1');
    expect((await requester.call('GET', '/auth/me')).body.id).toBe(id);
    expect((await victim.call('GET', '/auth/me')).status).toBe(401); // anciennes sessions fermées
    expect((await pool.query(`select status from recovery_requests where id = $1`, [item.id])).rows[0].status).toBe('completed');
    // Usage unique
    expect((await requester.call('POST', '/auth/recovery/assist/google', { requestToken: req.body.requestToken })).status).toBe(403);
    expect(await events(id)).toEqual(expect.arrayContaining(['recovery_approved', 'recovery_completed']));
    expect((await pool.query(`select count(*)::int as n from security_events where event = 'admin_recovery_decision'`)).rows[0].n).toBeGreaterThan(0);
  });

  it('16b. assistance : blocage d’une demande suspecte, annulation par le titulaire, pas d’auto-validation', async () => {
    const { id, claims, b: owner } = await newAccount();
    const adm = await adminBrowser();
    const mk = async () => (await new Browser().call('POST', '/auth/recovery/assist', { identifier: claims.email, reason: 'Je dis que c’est moi mais je n’ai aucune preuve concrète à fournir ici.' })).body.requestToken as string;
    const t1 = await mk();
    const row = async (t: string) => (await pool.query(`select id, status from recovery_requests where token_hash = $1`, [createHash('sha256').update(t).digest('hex')])).rows[0];
    const r1 = await row(t1);
    expect((await adm.b.call('POST', `/admin/recovery-requests/${r1.id}/decide`, { action: 'block', note: 'Demande suspecte : contact injoignable.' })).status).toBe(200);
    expect((await new Browser().call('POST', '/auth/recovery/assist/google', { requestToken: t1 })).status).toBe(403);
    expect((await new Browser().call('POST', '/auth/recovery/assist/status', { requestToken: t1 })).body.status).toBe('rejected'); // un blocage n'est pas détaillé
    const t2 = await mk();
    const r2 = await row(t2);
    expect((await adm.b.call('POST', `/admin/recovery-requests/${r2.id}/decide`, { action: 'approve', note: 'Vérifié par téléphone avec le titulaire.' })).status).toBe(200);
    // Le titulaire annule : la demande n'est plus utilisable
    expect((await owner.call('POST', `/auth/security/recovery-requests/${r2.id}/cancel`)).status).toBe(200);
    await pool.query(`update recovery_requests set execute_after = now() - interval '1 minute' where id = $1`, [r2.id]);
    expect((await new Browser().call('POST', '/auth/recovery/assist/google', { requestToken: t2 })).status).toBe(403);
    // Un administrateur ne traite pas une demande qui le concerne
    const selfClaims = google(60);
    const adminAsUser = new Browser();
    await adminAsUser.google('login', selfClaims);
    await adminAsUser.call('POST', '/auth/signup/complete', profile());
    await pool.query(`update users set role = 'admin' where lower(email) = $1`, [selfClaims.email]);
    const t3 = (await new Browser().call('POST', '/auth/recovery/assist', { identifier: selfClaims.email, reason: 'Demande déposée à mon propre nom pour tester le contrôle des droits.' })).body.requestToken as string;
    const r3 = await row(t3);
    expect((await adminAsUser.call('POST', `/admin/recovery-requests/${r3.id}/decide`, { action: 'approve', note: 'Je valide ma propre demande.' })).body.code).toBe('self_decision');
    void id;
  });

  // ---- 17. Prises de contrôle

  it('17. jetons Google falsifiés ou rejoués : toujours refusés, aucune session', async () => {
    const claims = google(70);
    const cases: [string, Parameters<Browser['google']>[2]][] = [
      ['mauvaise audience', { claimsOverride: (c, nonce) => ({ iss: 'https://accounts.google.com', aud: 'autre-app', exp: Math.floor(Date.now() / 1000) + 600, nonce, email_verified: true, ...c }) }],
      ['mauvais émetteur', { claimsOverride: (c, nonce) => ({ iss: 'https://evil.example', aud: 'test-client', exp: Math.floor(Date.now() / 1000) + 600, nonce, email_verified: true, ...c }) }],
      ['jeton expiré', { claimsOverride: (c, nonce) => ({ iss: 'https://accounts.google.com', aud: 'test-client', exp: Math.floor(Date.now() / 1000) - 3600, nonce, email_verified: true, ...c }) }],
      ['mauvais nonce', { claimsOverride: (c) => ({ iss: 'https://accounts.google.com', aud: 'test-client', exp: Math.floor(Date.now() / 1000) + 600, nonce: 'autre', email_verified: true, ...c }) }],
      ['e-mail non vérifié', { claimsOverride: (c, nonce) => ({ iss: 'https://accounts.google.com', aud: 'test-client', exp: Math.floor(Date.now() / 1000) + 600, nonce, email_verified: false, ...c }) }],
      ['sans sub', { claimsOverride: (_c, nonce) => ({ iss: 'https://accounts.google.com', aud: 'test-client', exp: Math.floor(Date.now() / 1000) + 600, nonce, email_verified: true, email: 'a@gmail.test' }) }],
      ['signature d’une autre clé', { token: (c) => idToken(c, { key: otherRsa }) }],
      ['algorithme « none »', { token: (c) => idToken(c, { alg: 'none' }) }],
      ['clé inconnue', { token: (c) => idToken(c, { kid: 'inconnue' }) }],
      ['jeton mal formé', { token: () => 'abc.def' }],
    ];
    for (const [name, opt] of cases) {
      const b = new Browser();
      const r = await b.google('login', claims, opt);
      expect(loc(r.cb), name).toContain('/connexion?error=');
      expect((await b.call('GET', '/auth/me')).status, name).toBe(401);
      expect([...b.jar.keys()].some((k) => k.includes('e509_session') || k.includes('e509_signup')), name).toBe(false);
    }
    expect((await pool.query(`select 1 from pending_signups where google_sub = $1`, [claims.sub])).rowCount).toBe(0);
    // État rejoué, falsifié, ou venant d'un autre navigateur
    const b = new Browser();
    const { cb, state, nonce } = await b.google('login', claims);
    expect(loc(cb)).toBe('/inscription/profil');
    const replay = await b.callback(state!, nonce!, 'x', claims);
    expect(loc(replay)).toContain('error=google');
    const v = new Browser();
    expect(loc((await v.callback('etat-invente', 'n', 'x', claims)))).toContain('error=google');
    const victim = new Browser();
    const start = await victim.call('GET', '/auth/google/start', undefined, { query: { purpose: 'login' } });
    const u = new URL(String(start.headers!.Location));
    const attacker = new Browser(); // l'attaquant fait ouvrir son lien à la victime : le cookie de liaison manque
    const noCookie = await attacker.callback(u.searchParams.get('state')!, u.searchParams.get('nonce')!, u.searchParams.get('code_challenge')!, google(71));
    expect(loc(noCookie)).toContain('error=google');
    // Mauvais vérificateur PKCE : Google refuse l'échange
    const p = new Browser();
    const s2 = await p.call('GET', '/auth/google/start', undefined, { query: { purpose: 'login' } });
    const u2 = new URL(String(s2.headers!.Location));
    expect(loc(await p.callback(u2.searchParams.get('state')!, u2.searchParams.get('nonce')!, 'mauvais-defi', google(72)))).toContain('error=google');
  });

  it('17b. protections : CSRF, réauthentification, droits, profil incomplet, anciens comptes', async () => {
    const { b, id } = await newAccount();
    // CSRF : sans l'en-tête personnalisé, ou depuis un autre site, une action modifiant des données est refusée
    expect((await b.call('POST', '/auth/logout', undefined, { csrf: false })).status).toBe(403);
    expect((await b.call('POST', '/auth/sessions/revoke-others', undefined, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await b.call('GET', '/auth/security')).status).toBe(200); // lecture : pas de jeton CSRF requis
    // Opérations sensibles sans réauthentification récente
    await pool.query(`update auth_sessions set recent_auth_at = now() - interval '1 hour' where user_id = $1`, [id]);
    for (const [m, p] of [['POST', '/auth/security/recovery-codes'], ['POST', '/auth/security/questions'], ['POST', '/auth/passkeys/register/options'], ['POST', '/auth/google/link/undo']] as const)
      expect((await b.call(m, p, { questions: qs3 })).body.code, p).toBe('reauth_required');
    // Remplacement des questions après réauthentification
    await pool.query(`update auth_sessions set recent_auth_at = now() where user_id = $1`, [id]);
    const newQs = [{ question: 'Comment appelais-je ma guitare ?', answer: 'Mélodie' }, qs3[1], qs3[2]];
    expect((await b.call('POST', '/auth/security/questions', { questions: newQs })).status).toBe(200);
    expect((await b.call('POST', '/auth/security/questions', { questions: qs3.slice(0, 1) })).status).toBe(422);
    // Les ressources de gestion ne sont pas ouvertes sans session
    const anon = new Browser();
    for (const [m, p] of [['GET', '/auth/security'], ['GET', '/auth/sessions'], ['POST', '/auth/security/recovery-codes'], ['POST', '/auth/passkeys/register/options']] as const)
      expect((await anon.call(m, p)).status, p).toBe(401);
    // Une session cookie ne donne pas les droits d'administration
    expect((await b.call('GET', '/admin/recovery-requests')).status).toBe(403);
    // Les cookies sont HttpOnly, SameSite, Secure en production
    const raw = await new Browser().call('GET', '/auth/google/start', undefined, { query: { purpose: 'login' } });
    const sc = String(([] as string[]).concat(raw.headers!['Set-Cookie'] as string[])[0]);
    expect(sc).toMatch(/HttpOnly/);
    expect(sc).toMatch(/SameSite=Lax/);
    process.env.COOKIE_INSECURE = '0';
    const sec = await new Browser().call('GET', '/auth/google/start', undefined, { query: { purpose: 'login' } });
    process.env.COOKIE_INSECURE = '1';
    expect(String(([] as string[]).concat(sec.headers!['Set-Cookie'] as string[])[0])).toMatch(/^__Host-.*Secure/);
  });

  it('14b/19. ancien compte : jamais fusionné automatiquement ; Google associé après connexion ; données conservées', async () => {
    const n = ++seq;
    const legId = `u_leg${n}`;
    const email = `ancien${n}@legacy.test`;
    const orgId = `org_leg${n}`;
    await pool.query(`insert into organizers (id, slug, data) values ($1,$2,$3)`, [orgId, `ancien-${n}`, JSON.stringify({ id: orgId, slug: `ancien-${n}`, name: 'Org ancienne', verified: true, avatar: 'OA', followers: 7, eventsCount: 3, city: 'Jacmel' })]);
    await pool.query(`insert into users (id, email, password_hash, role, team_role, organizer_id, data) values ($1,$2,$3,'organizer','admin',$4,$5)`, [legId, email, await hashPassword('AncienMdp2026x'), orgId, JSON.stringify({ name: 'Ancien Compte', city: 'Jacmel', joinedAt: '2024-01-01' })]);
    const claims = google(80, { email });
    // Google avec le même e-mail : aucune fusion, aucun doublon
    const b = new Browser();
    const r = await b.google('login', claims);
    expect(loc(r.cb)).toBe('/connexion?error=legacy_account');
    expect((await pool.query(`select count(*)::int as n from users where lower(email) = $1`, [email])).rows[0].n).toBe(1);
    expect((await pool.query(`select 1 from auth_identities where user_id = $1`, [legId])).rowCount).toBe(0);
    // Connexion avec l'ancienne méthode (session serveur, pas de jeton)
    const login = await b.call('POST', '/auth/login', { email, password: 'AncienMdp2026x' });
    expect(login.status).toBe(200);
    expect(login.body.token).toBeUndefined();
    expect((await b.call('POST', '/auth/login', { email, password: 'mauvais' })).status).toBe(401);
    // Association de Google (réauthentification = connexion à l'instant)
    const l = await b.google('link', claims);
    const token = new URL(loc(l.cb), 'https://x').searchParams.get('link')!;
    const conf = await b.call('POST', '/auth/google/link/confirm', { token, confirm: true });
    expect(conf.body).toMatchObject({ ok: true, authComplete: false });
    // Compte à compléter : accès limité aux routes d'authentification (Situation B), sans doublon
    expect((await b.call('GET', '/org/events')).body.code).toBe('profile_incomplete');
    expect((await b.call('GET', '/auth/me')).body.authComplete).toBe(false);
    expect((await b.call('POST', '/auth/profile/complete', profile({ acceptTerms: false }))).body.code).toBe('consent_required');
    const done = await b.call('POST', '/auth/profile/complete', profile());
    expect(done.status).toBe(200);
    expect(done.body.user.authComplete).toBe(true);
    expect((await b.call('POST', '/auth/profile/complete', profile())).status).toBe(409);
    // Mêmes identifiant, rôle, organisation et informations d'origine
    const u = (await pool.query(`select id, role, team_role, organizer_id, data from users where email = $1`, [email])).rows[0];
    expect(u).toMatchObject({ id: legId, role: 'organizer', team_role: 'admin', organizer_id: orgId });
    expect(u.data.joinedAt).toBe('2024-01-01');
    expect((await pool.query(`select data->>'name' as n, (data->>'verified')::boolean as v from organizers where id = $1`, [orgId])).rows[0]).toEqual({ n: 'Org ancienne', v: true });
    // L'ancien mot de passe ne sert plus ; Google ouvre le même compte
    expect((await new Browser().call('POST', '/auth/login', { email, password: 'AncienMdp2026x' })).status).toBe(401);
    const g = new Browser();
    expect(loc((await g.google('login', claims)).cb)).toBe('/organisateur');
    expect((await g.call('GET', '/auth/me')).body.id).toBe(legId);
  });

  // ---- 18-20. Doublons, expiration

  it('18. doublons : deux validations simultanées ne créent qu’un seul compte', async () => {
    const b = new Browser();
    const claims = google(90);
    await b.google('login', claims);
    const results = await Promise.all([b.call('POST', '/auth/signup/complete', profile()), b.call('POST', '/auth/signup/complete', profile()), b.call('POST', '/auth/signup/complete', profile())]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect((await pool.query(`select count(*)::int as n from users where email = $1`, [claims.email])).rows[0].n).toBe(1);
    expect((await pool.query(`select count(*)::int as n from auth_identities where subject = $1`, [claims.sub])).rows[0].n).toBe(1);
    // Même Google dans un autre navigateur : connexion, pas de second compte
    const b2 = new Browser();
    expect(loc((await b2.google('login', claims)).cb)).toBe('/organisateur');
    // Nom d'utilisateur unique (sans tenir compte de la casse)
    const u1 = new Browser();
    await u1.google('login', google(91));
    expect((await u1.call('POST', '/auth/signup/complete', profile({ username: 'unique.nom' }))).status).toBe(200);
    const u2 = new Browser();
    await u2.google('login', google(92));
    expect((await u2.call('POST', '/auth/signup/complete', profile({ username: 'UNIQUE.nom' }))).body.code).toBe('username_taken');
  });

  it('20. une inscription provisoire expire seule (24 h)', async () => {
    const b = new Browser();
    const claims = google(95);
    await b.google('login', claims);
    await pool.query(`update pending_signups set expires_at = now() - interval '1 second' where google_sub = $1`, [claims.sub]);
    expect((await b.call('GET', '/auth/signup/pending')).body.pending).toBe(false);
    const done = await b.call('POST', '/auth/signup/complete', profile());
    expect(done.status).toBe(410);
    expect((await pool.query(`select 1 from users where email = $1`, [claims.email])).rowCount).toBe(0);
  });

  it('inscription par e-mail désactivée dès que Google est configuré ; configuration publique', async () => {
    const b = new Browser();
    expect((await b.call('POST', '/auth/signup', { name: 'X Y', email: 'x@gmail.test', password: 'Soleil2026x', acceptTerms: true })).status).toBe(410);
    expect((await b.call('GET', '/auth/config')).body).toMatchObject({ google: true, passkeys: true });
    // Google non configuré : départ refusé proprement
    const id = process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_ID;
    expect(loc(await b.call('GET', '/auth/google/start', undefined, { query: { purpose: 'login' } }))).toContain('error=unavailable');
    expect((await b.call('GET', '/auth/config')).body.google).toBe(false);
    process.env.GOOGLE_CLIENT_ID = id;
    void tokenCalls;
  });
});
