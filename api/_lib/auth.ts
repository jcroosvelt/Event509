import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

/** Mot de passe haché avec scrypt et un sel aléatoire : « scrypt$sel$hash ». */
export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const hash = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(pw: string, stored: string | null | undefined) {
  if (!stored) return false;
  const [algo, salt, hash] = stored.split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const got = await scrypt(pw, Buffer.from(salt, 'base64'), expected.length);
  return timingSafeEqual(got, expected);
}

const b64 = (v: string | Buffer) => Buffer.from(v).toString('base64url');

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error('JWT_SECRET manquant ou trop court (32 caractères minimum)');
  return s;
}

/** Jeton de session signé (HS256), valable 30 jours. */
export function signToken(userId: string) {
  const header = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 30 * 86400 }));
  const sig = createHmac('sha256', secret()).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

export function readToken(token: string | undefined): string | null {
  if (!token) return null;
  const [header, payload, sig] = token.split('.');
  if (!header || !payload || !sig) return null;
  const expected = createHmac('sha256', secret()).update(`${header}.${payload}`).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { sub: string; exp: number };
    return p.exp > Date.now() / 1000 ? p.sub : null;
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
