import { isProduction } from './safety.js';
import { createHash, randomBytes } from 'node:crypto';
import { all, db, one, type Q } from './db.js';
import { newId } from './auth.js';
import { mailConfigured, sendNoticeEmail } from './mail.js';
import { notifyUsers } from './push.js';

/**
 * Sessions serveur (cookie HttpOnly) : le cookie contient un secret aléatoire de 256 bits, la base ne garde que son
 * empreinte SHA-256. Une session peut être révoquée à tout moment, a une durée absolue de 30 jours et expire après
 * 14 jours sans usage. « recent_auth_at » dit quand l'utilisateur a prouvé son identité pour la dernière fois
 * (réauthentification exigée pour les opérations sensibles).
 */

export const SESSION_DAYS = 30;
export const IDLE_DAYS = 14;
export const RECENT_AUTH_MINUTES = 10;

export const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

export interface SessionRow {
  id_hash: string;
  user_id: string;
  created_at: Date;
  last_seen_at: Date;
  expires_at: Date;
  recent_auth_at: Date;
  limited: boolean;
  user_agent: string | null;
  device_label: string | null;
  ip_masked: string | null;
  method: string | null;
}

/** Cookies : « __Host- » (liés au domaine exact, HTTPS obligatoire) sauf en développement local sans HTTPS. */
/** Cookies « Secure » : toujours en production, même si COOKIE_INSECURE est défini par erreur (réservé au développement local en http). */
const secureCookies = () => isProduction() || process.env.COOKIE_INSECURE !== '1';
export const cookieName = (n: string) => (secureCookies() ? `__Host-${n}` : n);
export const SESSION_COOKIE = 'e509_session';

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    const k = part.slice(0, i).trim();
    if (!(k in out)) out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function setCookie(name: string, value: string, maxAgeSeconds: number) {
  return `${cookieName(name)}=${encodeURIComponent(value)}; Path=/; HttpOnly; ${secureCookies() ? 'Secure; ' : ''}SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}
export const clearCookie = (name: string) => `${cookieName(name)}=; Path=/; HttpOnly; ${secureCookies() ? 'Secure; ' : ''}SameSite=Lax; Max-Age=0`;
export const readCookie = (cookies: Record<string, string>, name: string) => cookies[cookieName(name)];

/** « +1.2.3.4 » → « 1.2.•.• » : l'adresse complète n'est jamais gardée. */
export function maskIp(ip: string | undefined) {
  if (!ip) return null;
  if (ip.includes(':')) return `${ip.split(':').slice(0, 3).join(':')}:••••`;
  const p = ip.split('.');
  return p.length === 4 ? `${p[0]}.${p[1]}.•.•` : null;
}

export function deviceLabel(ua: string | undefined) {
  const s = ua ?? '';
  const os = /Android/i.test(s) ? 'Android' : /iPhone|iPad/i.test(s) ? 'iPhone / iPad' : /Windows/i.test(s) ? 'Windows' : /Mac OS X|Macintosh/i.test(s) ? 'Mac' : /Linux/i.test(s) ? 'Linux' : 'Appareil';
  const app = /; wv\)|EVENT509/i.test(s) && /Android/i.test(s) ? 'application EVENT509' : /Edg\//.test(s) ? 'Edge' : /Firefox\//.test(s) ? 'Firefox' : /Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : 'navigateur';
  return `${os} · ${app}`;
}

/** Crée une session ; renvoie le secret du cookie (affiché une seule fois) et son en-tête Set-Cookie. */
export async function createSession(userId: string, o: { method: string; userAgent?: string; ip?: string; limited?: boolean }, q: Q = db()) {
  const token = randomToken();
  // Ménage : les sessions terminées depuis plus de 30 jours ne servent plus
  await q.query(`delete from auth_sessions where expires_at < now() - interval '30 days' or revoked_at < now() - interval '30 days'`);
  await q.query(
    `insert into auth_sessions (id_hash, user_id, expires_at, limited, user_agent, device_label, ip_masked, method)
     values ($1,$2, now() + ($3 || ' days')::interval, $4, $5, $6, $7, $8)`,
    [sha256(token), userId, String(SESSION_DAYS), !!o.limited, (o.userAgent ?? '').slice(0, 300) || null, deviceLabel(o.userAgent), maskIp(o.ip), o.method],
  );
  return { token, cookie: setCookie(SESSION_COOKIE, token, SESSION_DAYS * 86400) };
}

/** Session valide (non révoquée, non expirée, utilisée dans les 14 derniers jours) correspondant au secret du cookie. */
export async function loadSession(token: string | undefined): Promise<SessionRow | null> {
  if (!token || token.length < 30 || token.length > 100) return null;
  const s = await one<SessionRow>(
    `select * from auth_sessions where id_hash = $1 and revoked_at is null and expires_at > now() and last_seen_at > now() - ($2 || ' days')::interval`,
    [sha256(token), String(IDLE_DAYS)]);
  if (s && Date.now() - new Date(s.last_seen_at).getTime() > 5 * 60_000) await db().query(`update auth_sessions set last_seen_at = now() where id_hash = $1`, [s.id_hash]);
  return s;
}

export const publicSessionId = (idHash: string) => idHash.slice(0, 20);
export const isRecent = (s: SessionRow | null | undefined) => !!s && Date.now() - new Date(s.recent_auth_at).getTime() < RECENT_AUTH_MINUTES * 60_000;
export const markRecentAuth = (idHash: string, q: Q = db()) => q.query(`update auth_sessions set recent_auth_at = now() where id_hash = $1`, [idHash]);

export async function revokeSessions(userId: string, opts: { exceptIdHash?: string; onlyPublicId?: string } = {}, q: Q = db()) {
  const r = await q.query(
    `update auth_sessions set revoked_at = now() where user_id = $1 and revoked_at is null
       and ($2::text is null or id_hash <> $2) and ($3::text is null or id_hash like $3 || '%')`,
    [userId, opts.exceptIdHash ?? null, opts.onlyPublicId ?? null]);
  return r.rowCount ?? 0;
}

export const listSessions = (userId: string) =>
  all<SessionRow>(`select * from auth_sessions where user_id = $1 and revoked_at is null and expires_at > now() order by last_seen_at desc`, [userId]);

// ---------- Historique et notifications de sécurité ----------

/** Enregistre une opération de sécurité (jamais de secret, de code ni de réponse dans « detail »). */
export async function logSecurity(userId: string | null, event: string, detail: Record<string, unknown> = {}, ip?: string, q: Q = db()) {
  await q.query(`insert into security_events (id, user_id, event, detail, ip_masked) values ($1,$2,$3,$4::jsonb,$5)`, [newId('sev'), userId, event, JSON.stringify(detail), maskIp(ip)]).catch((e) => console.error('[security-log]', (e as Error).message));
}

/**
 * Prévient l'utilisateur d'une opération sensible, seulement par des canaux déjà vérifiés : notification de l'application
 * (appareils déjà enregistrés) et adresse e-mail du compte (confirmée par Google). Indépendant de Meta et de WhatsApp.
 * Un échec de notification n'empêche jamais l'opération.
 */
export async function notifySecurity(userId: string, title: string, lines: string[]) {
  try {
    const u = await one<{ email: string }>(`select email from users where id = $1`, [userId]);
    await notifyUsers([userId], { title, body: lines[0] ?? title, url: '/compte/securite', channel: 'updates' }).catch(() => 0);
    if (u && mailConfigured()) await sendNoticeEmail(u.email, title, title, [...lines, 'Si ce n’est pas vous, ouvrez votre espace sécurité sans attendre.']).catch(() => false);
  } catch (e) {
    console.error('[security-notify]', (e as Error).message);
  }
}
