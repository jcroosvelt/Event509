import { createHash, createPublicKey, createVerify, timingSafeEqual } from 'node:crypto';
import { db, one } from './db.js';
import { randomToken, sha256 } from './session.js';

/**
 * Google OAuth 2.0 / OpenID Connect, « Authorization Code Flow » avec PKCE (S256).
 * Le secret Google n'existe que sur le serveur. Le jeton d'identité est entièrement validé ici : signature RS256 (clés
 * publiques de Google), émetteur, audience, expiration, nonce, « sub » et e-mail vérifié. Les adresses d'API sont
 * remplaçables par variables d'environnement UNIQUEMENT pour les tests (faux serveur Google local).
 */

export type OAuthPurpose = 'login' | 'link' | 'reauth' | 'recover';

export const googleConfigured = () => !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET && !!process.env.GOOGLE_REDIRECT_URI;
const authUrl = () => process.env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth';
const tokenUrl = () => process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token';
const jwksUrl = () => process.env.GOOGLE_JWKS_URL || 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

/** Chemin interne sûr (jamais une adresse externe) : évite les redirections ouvertes. */
export function safeNext(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 300) return null;
  // Caractères de contrôle écartés sans expression régulière (évite l'alerte no-control-regex)
  if (!v.startsWith('/') || v.startsWith('//') || v.includes('\\') || v.includes('://') || [...v].some((ch) => ch.charCodeAt(0) < 32)) return null;
  return v;
}

export interface GoogleClaims {
  sub: string;
  email: string;
  givenName?: string;
  familyName?: string;
  picture?: string;
}

/** Prépare la redirection vers Google ; renvoie l'adresse et le secret qui lie la demande à ce navigateur. */
export async function startGoogle(o: { purpose: OAuthPurpose; userId?: string; recoveryId?: string; next?: string | null; appChallenge?: string | null }) {
  const state = randomToken(32);
  const nonce = randomToken(24);
  const verifier = randomToken(48);
  const browser = randomToken(24);
  await db().query(`delete from oauth_states where expires_at < now()`);
  await db().query(
    `insert into oauth_states (state_hash, nonce, code_verifier, purpose, user_id, recovery_id, next_path, browser_hash, app_challenge, expires_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now() + interval '10 minutes')`,
    [sha256(state), nonce, verifier, o.purpose, o.userId ?? null, o.recoveryId ?? null, o.next ?? null, sha256(browser), o.appChallenge ?? null]);
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    nonce,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    // Réauthentification et changement de compte : Google redemande le compte à choisir
    prompt: o.purpose === 'login' ? 'select_account' : 'select_account consent',
    access_type: 'online',
  });
  return { url: `${authUrl()}?${p}`, browser };
}

export interface OAuthState {
  purpose: OAuthPurpose;
  user_id: string | null;
  recovery_id: string | null;
  next_path: string | null;
  /** Défi PKCE de l'application Android (la connexion s'est faite dans le navigateur du téléphone). */
  app_challenge: string | null;
}

export class OAuthError extends Error {
  /** La demande venait de l'application Android : l'erreur doit y être renvoyée par lien profond. */
  app = false;
  constructor(public reason: string) {
    super(reason);
  }
}

let jwksCache: { at: number; keys: { kid?: string; kty: string; n?: string; e?: string; alg?: string }[] } | null = null;
async function jwks(force = false) {
  if (!force && jwksCache && Date.now() - jwksCache.at < 3_600_000) return jwksCache.keys;
  const res = await fetch(jwksUrl(), { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new OAuthError('jwks');
  jwksCache = { at: Date.now(), keys: ((await res.json()) as { keys: never[] }).keys ?? [] };
  return jwksCache.keys;
}

/** Valide le jeton d'identité de Google et renvoie les informations d'identité. */
export async function verifyIdToken(idToken: string, nonce: string): Promise<GoogleClaims> {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new OAuthError('token_format');
  const [h, p, s] = parts as [string, string, string];
  let header: { alg?: string; kid?: string };
  let claims: Record<string, unknown>;
  try {
    header = JSON.parse(Buffer.from(h, 'base64url').toString());
    claims = JSON.parse(Buffer.from(p, 'base64url').toString());
  } catch {
    throw new OAuthError('token_format');
  }
  if (header.alg !== 'RS256') throw new OAuthError('token_alg');
  let key = (await jwks()).find((k) => k.kid === header.kid && k.kty === 'RSA');
  if (!key) key = (await jwks(true)).find((k) => k.kid === header.kid && k.kty === 'RSA');
  if (!key) throw new OAuthError('token_key');
  const ok = createVerify('RSA-SHA256').update(`${h}.${p}`).verify(createPublicKey({ key: key as never, format: 'jwk' }), Buffer.from(s, 'base64url'));
  if (!ok) throw new OAuthError('token_signature');
  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.iss !== 'string' || !ISSUERS.includes(claims.iss)) throw new OAuthError('token_issuer');
  const aud = claims.aud;
  const audOk = aud === process.env.GOOGLE_CLIENT_ID || (Array.isArray(aud) && aud.includes(process.env.GOOGLE_CLIENT_ID));
  if (!audOk) throw new OAuthError('token_audience');
  if (typeof claims.exp !== 'number' || claims.exp + 60 < now) throw new OAuthError('token_expired');
  if (typeof claims.iat === 'number' && claims.iat - 300 > now) throw new OAuthError('token_iat');
  const a = Buffer.from(String(claims.nonce ?? ''));
  const b = Buffer.from(nonce);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new OAuthError('token_nonce');
  if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255) throw new OAuthError('token_sub');
  if (typeof claims.email !== 'string' || !claims.email) throw new OAuthError('token_email');
  if (claims.email_verified !== true && claims.email_verified !== 'true') throw new OAuthError('email_not_verified');
  return {
    sub: claims.sub,
    email: claims.email.toLowerCase(),
    givenName: typeof claims.given_name === 'string' ? claims.given_name.slice(0, 80) : undefined,
    familyName: typeof claims.family_name === 'string' ? claims.family_name.slice(0, 80) : undefined,
    picture: typeof claims.picture === 'string' && /^https:\/\//.test(claims.picture) ? claims.picture.slice(0, 500) : undefined,
  };
}

/**
 * Retour de Google : consomme l'état (usage unique, 10 min, lié au navigateur), échange le code contre les jetons
 * (secret + vérificateur PKCE) et valide le jeton d'identité.
 */
export async function finishGoogle(o: { code: string; state: string; browser: string | undefined }): Promise<{ claims: GoogleClaims; state: OAuthState }> {
  if (!o.code || !o.state || o.code.length > 2000 || o.state.length > 200) throw new OAuthError('params');
  const hash = sha256(o.state);
  const row = await one<OAuthState & { nonce: string; code_verifier: string; browser_hash: string; expired: boolean }>(
    `select nonce, code_verifier, purpose, user_id, recovery_id, next_path, app_challenge, browser_hash, expires_at <= now() as expired from oauth_states where state_hash = $1`, [hash]);
  if (!row || row.expired) throw new OAuthError('state');
  // Liaison au navigateur (protège contre un lien de retour piégé qui ferait entrer la victime dans le compte d'un tiers) :
  // vérifiée AVANT de consommer l'état, donc une requête sans le bon cookie (doublon, aperçu, tiers) ne détruit pas la connexion en cours.
  // Application Android : aucune session n'est créée dans le navigateur, le retour exige le secret PKCE que seule l'application détient ;
  // le cookie n'est donc pas exigé (certains onglets de navigateur ne le renvoient pas toujours).
  if (!row.app_challenge && (!o.browser || !timingSafeEqual(Buffer.from(sha256(o.browser)), Buffer.from(row.browser_hash)))) throw new OAuthError('browser');
  // Consommation atomique : un état ne sert qu'une fois (si deux requêtes arrivent ensemble, une seule passe)
  const taken = await one<{ ok: number }>(`delete from oauth_states where state_hash = $1 returning 1 as ok`, [hash]);
  if (!taken) throw new OAuthError('state');
  try {
    return await exchange(o, row);
  } catch (e) {
    if (e instanceof OAuthError) e.app = !!row.app_challenge;
    throw e;
  }
}

async function exchange(o: { code: string }, row: OAuthState & { nonce: string; code_verifier: string }): Promise<{ claims: GoogleClaims; state: OAuthState }> {
  const res = await fetch(tokenUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: o.code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI!, grant_type: 'authorization_code', code_verifier: row.code_verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!res || !res.ok) throw new OAuthError('exchange');
  const tok = (await res.json().catch(() => ({}))) as { id_token?: string };
  if (!tok.id_token) throw new OAuthError('exchange');
  const claims = await verifyIdToken(tok.id_token, row.nonce);
  return { claims, state: { purpose: row.purpose, user_id: row.user_id, recovery_id: row.recovery_id, next_path: row.next_path, app_challenge: row.app_challenge } };
}
