import {
  generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse,
  type AuthenticationResponseJSON, type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { all, db, one } from './db.js';
import { newId } from './auth.js';
import { siteUrl } from './mail.js';
import { randomToken, sha256 } from './session.js';

/**
 * Passkeys (WebAuthn / FIDO2). Le serveur ne garde que l'identifiant public et la clé publique de chaque passkey.
 * Vérification obligatoire de l'utilisateur (« userVerification: required » : empreinte, visage ou code de l'appareil).
 * Connexion « sans identifiant » (clés découvrables) : la passkey elle-même désigne le compte.
 * Une passkey enregistrée sur un appareil n'est pas supposée présente sur un autre : chaque appareil s'enregistre séparément
 * (les gestionnaires de mots de passe ou le cloud du système peuvent la synchroniser, mais EVENT509 ne s'y fie jamais).
 */

export const rp = () => {
  const url = process.env.WEBAUTHN_ORIGIN || siteUrl();
  let host = 'localhost';
  try {
    host = new URL(url).hostname;
  } catch {
    /* adresse du site non définie */
  }
  return { name: 'EVENT509', id: process.env.WEBAUTHN_RP_ID || host, origin: url.replace(/\/$/, '') };
};

type Purpose = 'register' | 'login' | 'recover';

async function saveChallenge(purpose: Purpose, challenge: string, userId: string | null, recoveryId?: string) {
  const id = randomToken(24);
  await db().query(`delete from auth_challenges where expires_at < now()`);
  await db().query(`insert into auth_challenges (id_hash, purpose, challenge, user_id, recovery_id, expires_at) values ($1,$2,$3,$4,$5, now() + interval '5 minutes')`, [sha256(id), purpose, challenge, userId, recoveryId ?? null]);
  return id;
}
/** Un défi ne sert qu'une fois, pendant 5 minutes. */
async function takeChallenge(purpose: Purpose, id: string) {
  const row = await one<{ challenge: string; user_id: string | null; recovery_id: string | null; ok: boolean }>(
    `delete from auth_challenges where id_hash = $1 and purpose = $2 returning challenge, user_id, recovery_id, expires_at > now() as ok`, [sha256(String(id)), purpose]);
  return row?.ok ? row : null;
}

export async function passkeyRegistrationOptions(user: { id: string; email: string; name: string }) {
  const existing = await all<{ credential_id: string; transports: string[] | null }>(`select credential_id, transports from webauthn_credentials where user_id = $1`, [user.id]);
  const r = rp();
  const options = await generateRegistrationOptions({
    rpName: r.name, rpID: r.id, userName: user.email, userDisplayName: user.name || user.email,
    userID: new TextEncoder().encode(user.id), attestationType: 'none',
    excludeCredentials: existing.map((c) => ({ id: c.credential_id, transports: (c.transports ?? undefined) as never })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
  });
  return { options, challengeId: await saveChallenge('register', options.challenge, user.id) };
}

export async function verifyPasskeyRegistration(userId: string, challengeId: string, response: RegistrationResponseJSON, name: string) {
  const ch = await takeChallenge('register', challengeId);
  if (!ch || ch.user_id !== userId) return null;
  const r = rp();
  let v;
  try {
    v = await verifyRegistrationResponse({ response, expectedChallenge: ch.challenge, expectedOrigin: r.origin, expectedRPID: r.id, requireUserVerification: true });
  } catch {
    return null;
  }
  if (!v.verified || !v.registrationInfo) return null;
  const c = v.registrationInfo.credential;
  const id = newId('pk');
  try {
    await db().query(
      `insert into webauthn_credentials (id, user_id, credential_id, public_key, counter, transports, device_type, backed_up, name) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, userId, c.id, Buffer.from(c.publicKey).toString('base64url'), c.counter, c.transports ?? null, v.registrationInfo.credentialDeviceType, v.registrationInfo.credentialBackedUp, name]);
  } catch {
    return null; // identifiant déjà enregistré (unicité)
  }
  return { id };
}

/** Options de connexion sans identifiant : n'importe quelle passkey EVENT509 de l'appareil peut répondre. */
export async function passkeyLoginOptions(purpose: 'login' | 'recover' = 'login', recoveryId?: string) {
  const options = await generateAuthenticationOptions({ rpID: rp().id, userVerification: 'required' });
  return { options, challengeId: await saveChallenge(purpose, options.challenge, null, recoveryId) };
}

/** Vérifie une réponse de passkey ; renvoie le compte propriétaire, ou null. */
export async function verifyPasskeyLogin(challengeId: string, response: AuthenticationResponseJSON, purpose: 'login' | 'recover' = 'login'): Promise<{ userId: string; credentialId: string; recoveryId: string | null } | null> {
  const ch = await takeChallenge(purpose, challengeId);
  if (!ch) return null;
  const cred = await one<{ id: string; user_id: string; credential_id: string; public_key: string; counter: string; transports: string[] | null }>(
    `select id, user_id, credential_id, public_key, counter, transports from webauthn_credentials where credential_id = $1`, [String(response?.id ?? '')]);
  if (!cred) return null;
  const r = rp();
  let v;
  try {
    v = await verifyAuthenticationResponse({
      response, expectedChallenge: ch.challenge, expectedOrigin: r.origin, expectedRPID: r.id, requireUserVerification: true,
      credential: { id: cred.credential_id, publicKey: Buffer.from(cred.public_key, 'base64url'), counter: Number(cred.counter), transports: (cred.transports ?? undefined) as never },
    });
  } catch {
    return null;
  }
  if (!v.verified) return null;
  await db().query(`update webauthn_credentials set counter = $2, last_used_at = now() where id = $1`, [cred.id, v.authenticationInfo.newCounter]);
  return { userId: cred.user_id, credentialId: cred.id, recoveryId: ch.recovery_id };
}

export const listPasskeys = (userId: string) =>
  all<{ id: string; name: string; created_at: Date; last_used_at: Date | null; device_type: string | null; backed_up: boolean }>(
    `select id, name, created_at, last_used_at, device_type, backed_up from webauthn_credentials where user_id = $1 order by created_at`, [userId]);
