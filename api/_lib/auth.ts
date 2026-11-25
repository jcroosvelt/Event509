import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

type ScryptOpts = { N: number; r: number; p: number; maxmem: number };
const scryptRaw = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, o: ScryptOpts) => Promise<Buffer>;
/** Ancien coût (valeurs par défaut de Node : N = 16384, r = 8, p = 1), gardé pour relire les anciens hachages. */
const LEGACY: ScryptOpts = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
/** Coût actuel (recommandation OWASP : N = 2^16, r = 8, p = 2, soit 64 Mo et environ 0,2 s par mot de passe). */
const COST = { N: 65536, r: 8, p: 2 };
const optsOf = (c: { N: number; r: number; p: number }): ScryptOpts => ({ ...c, maxmem: 256 * c.N * c.r });

/** Mot de passe haché avec scrypt et un sel aléatoire : « scrypt2$N$r$p$sel$hash » (coût écrit dans le hachage, donc évolutif). */
export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const hash = await scryptRaw(pw, salt, 64, optsOf(COST));
  return `scrypt2$${COST.N}$${COST.r}$${COST.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(pw: string, stored: string | null | undefined) {
  if (!stored) return false;
  const parts = stored.split('$');
  let opts = LEGACY;
  let salt: string | undefined;
  let hash: string | undefined;
  if (parts[0] === 'scrypt' && parts.length === 3) [, salt, hash] = parts;
  else if (parts[0] === 'scrypt2' && parts.length === 6) {
    const [N, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
    // Paramètres lus dans la base : bornés (un hachage altéré ne doit pas pouvoir épuiser la mémoire du serveur)
    if (![N, r, p].every(Number.isInteger) || N < 16384 || N > 2 ** 17 || (N & (N - 1)) !== 0 || r < 1 || r > 16 || p < 1 || p > 4) return false;
    opts = optsOf({ N, r, p });
    [, , , , salt, hash] = parts;
  }
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const got = await scryptRaw(pw, Buffer.from(salt, 'base64'), expected.length, opts);
  return timingSafeEqual(got, expected);
}

/** Le hachage enregistré date d'un ancien coût : il sera refait à la prochaine connexion réussie. */
export const passwordNeedsRehash = (stored: string | null | undefined) => !!stored && !stored.startsWith(`scrypt2$${COST.N}$${COST.r}$${COST.p}$`);

const b64 = (v: string | Buffer) => Buffer.from(v).toString('base64url');

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error('JWT_SECRET manquant ou trop court (32 caractères minimum)');
  return s;
}

/** Jeton de session signé (HS256), valable 30 jours. */
export function signToken(userId: string) {
  const header = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64(JSON.stringify({ sub: userId, iat: now, exp: now + 30 * 86400 }));
  const sig = createHmac('sha256', secret()).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

/** Jeton à usage précis (ex. « verify-email »), signé, à durée limitée ; il ne sert jamais de jeton de session. */
export function signPurposeToken(purpose: string, userId: string, ttlSeconds: number) {
  const header = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64(JSON.stringify({ sub: userId, p: purpose, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  const sig = createHmac('sha256', secret()).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

export function readPurposeToken(token: string | undefined, purpose: string): string | null {
  if (!token) return null;
  const [header, payload, sig] = token.split('.');
  if (!header || !payload || !sig) return null;
  const expected = createHmac('sha256', secret()).update(`${header}.${payload}`).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { sub: string; p?: string; exp: number };
    return p.p === purpose && p.exp > Date.now() / 1000 ? p.sub : null;
  } catch {
    return null;
  }
}

/** Identifiant du compte d'un jeton de session valide. */
export function readToken(token: string | undefined): string | null {
  return readSession(token)?.sub ?? null;
}

/** Jeton de session valide : compte et date d'émission (0 pour les anciens jetons), pour fermer les sessions après un changement de mot de passe. */
export function readSession(token: string | undefined): { sub: string; iat: number } | null {
  if (!token) return null;
  const [header, payload, sig] = token.split('.');
  if (!header || !payload || !sig) return null;
  const expected = createHmac('sha256', secret()).update(`${header}.${payload}`).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { sub: string; exp: number; iat?: number; p?: string };
    // Un jeton à usage précis (confirmation d'email…) n'ouvre jamais une session
    return !p.p && p.exp > Date.now() / 1000 ? { sub: p.sub, iat: p.iat ?? 0 } : null;
  } catch {
    return null;
  }
}

export const newId = (prefix: string) => `${prefix}_${randomBytes(6).toString('base64url')}`;

/** Code de billet imprévisible (aléa cryptographique). */
export function newTicketCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(8);
  const s = [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
  return `E509-${s.slice(0, 4)}-${s.slice(4)}`;
}

/** Clé d'accès à une commande (144 bits) : placée dans le lien envoyé à l'acheteur. */
export const newAccessKey = () => randomBytes(18).toString('base64url');

export function sameKey(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Code court lisible (sans caractères ambigus : pas de 0/O ni 1/I), pour les liens de suivi. */
export function randomCode(n: number) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(randomBytes(n), (b) => alphabet[b % alphabet.length]).join('');
}
