import { createSign } from 'node:crypto';
import { all, db, one } from './db.js';

/**
 * Notifications push par Firebase Cloud Messaging (API HTTP v1).
 * Réglage à définir dans Vercel (jamais dans le code) :
 *   FIREBASE_SERVICE_ACCOUNT  contenu JSON complet de la clé du compte de service Firebase
 * Tant qu'il n'est pas défini, rien n'est envoyé : le reste du site fonctionne normalement.
 */

export type PushChannel = 'tickets' | 'sales' | 'reminders' | 'updates';
export interface PushMessage {
  title: string;
  body: string;
  /** Page à ouvrir dans l'application au toucher (chemin du site, ex. « /commande/o_x?k=… »). */
  url: string;
  channel: PushChannel;
}

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

function account(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const a = JSON.parse(raw) as ServiceAccount;
    return a.project_id && a.client_email && a.private_key ? a : null;
  } catch {
    console.error('[push] FIREBASE_SERVICE_ACCOUNT n’est pas un JSON valide');
    return null;
  }
}

export const pushConfigured = () => account() !== null;

const b64 = (v: string | Buffer) => Buffer.from(v).toString('base64url');

let cached: { token: string; exp: number } | null = null;

/** Jeton OAuth2 du compte de service (JWT signé RS256), gardé en mémoire jusqu'à son expiration. */
async function accessToken(a: ServiceAccount): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64(JSON.stringify({
    iss: a.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }));
  const sig = createSign('RSA-SHA256').update(`${head}.${claims}`).sign(a.private_key).toString('base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claims}.${sig}` }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`OAuth Firebase refusé (${res.status})`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

/** Corps d'un message FCM v1 : bloc `notification` (affiché par Android app fermée) + `data` (url, canal). */
export function buildMessage(token: string, m: PushMessage) {
  return {
    message: {
      token,
      notification: { title: m.title, body: m.body },
      data: { url: m.url, channel: m.channel },
      android: { priority: 'HIGH', notification: { channel_id: m.channel } },
    },
  };
}

/** Envoie à chaque jeton ; supprime les jetons que Firebase déclare périmés. Renvoie le nombre d'envois réussis. */
export async function sendPush(tokens: string[], m: PushMessage): Promise<number> {
  const a = account();
  const unique = [...new Set(tokens)].filter(Boolean);
  if (!a || !unique.length) return 0;
  try {
    const bearer = await accessToken(a);
    let ok = 0;
    await Promise.all(unique.map(async (t) => {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${a.project_id}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(buildMessage(t, m)),
        signal: AbortSignal.timeout(8_000),
      });
      if (res.ok) ok++;
      else if (res.status === 404 || res.status === 400) {
        const txt = await res.text().catch(() => '');
        if (/UNREGISTERED|NOT_FOUND|INVALID_ARGUMENT/.test(txt)) await db().query(`delete from device_tokens where token = $1`, [t]).catch(() => {});
        else console.error('[push] refus', res.status, txt);
      } else console.error('[push] refus', res.status);
    }));
    return ok;
  } catch (e) {
    // Une notification qui échoue ne doit jamais faire échouer l'action qui la déclenche
    console.error('[push] échec', e);
    return 0;
  }
}

/** Notifie des comptes (organisateurs, équipe). */
export async function notifyUsers(userIds: string[], m: PushMessage) {
  if (!pushConfigured() || !userIds.length) return 0;
  const rows = await all<{ token: string }>(`select distinct token from device_tokens where user_id = any($1)`, [userIds]);
  return sendPush(rows.map((r) => r.token), m);
}

/** Notifie des participants par leur email (appareils enregistrés avec la clé de leur commande). */
export async function notifyEmails(emails: string[], m: PushMessage) {
  if (!pushConfigured() || !emails.length) return 0;
  const rows = await all<{ token: string }>(`select distinct token from device_tokens where buyer_email = any($1)`, [emails.map((e) => e.toLowerCase())]);
  return sendPush(rows.map((r) => r.token), m);
}

/** Comptes de l'organisation (propriétaire et équipe) actifs. */
export async function organizerUserIds(organizerId: string) {
  return (await all<{ id: string }>(`select id from users where organizer_id = $1 and status = 'active'`, [organizerId])).map((r) => r.id);
}

/** Emails des détenteurs de billets valables d'un événement (acheteurs sans compte compris). */
export async function holderEmails(eventId: string) {
  return (await all<{ e: string }>(
    `select distinct lower(owner_email) as e from tickets where event_id = $1 and status in ('valid') and owner_email is not null`, [eventId])).map((r) => r.e);
}

/** Réserve une notification : renvoie false si elle a déjà été envoyée (anti-doublon). */
export async function claimOnce(key: string): Promise<boolean> {
  return !!(await one(`insert into notification_log (key) values ($1) on conflict do nothing returning key`, [key]));
}

/** Comptes qui détiennent un billet valable de l'événement (commande rattachée à leur compte). */
export async function holderUserIds(eventId: string) {
  return (await all<{ u: string }>(
    `select distinct o.user_id as u from orders o join tickets t on t.order_id = o.id
     where t.event_id = $1 and t.status = 'valid' and o.user_id is not null`, [eventId])).map((r) => r.u);
}

/** Notifie tous les détenteurs de billets valables d'un événement (par compte et par email). */
export async function notifyHolders(eventId: string, m: PushMessage) {
  if (!pushConfigured()) return 0;
  const [emails, users] = await Promise.all([holderEmails(eventId), holderUserIds(eventId)]);
  const [a, b] = await Promise.all([notifyEmails(emails, m), notifyUsers(users, m)]);
  return a + b;
}

/** Notifie tous les appareils où l'application est installée (un jeton existe dès qu'elle y a été ouverte). */
export async function notifyAllDevices(m: PushMessage) {
  if (!pushConfigured()) return 0;
  const rows = await all<{ token: string }>(`select distinct token from device_tokens`);
  return sendPush(rows.map((r) => r.token), m);
}
