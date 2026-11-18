import { createHash, timingSafeEqual } from 'node:crypto';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import type { AppUser, TeamMember, TeamRole } from '../../src/types.js';
import { all, db, one, tx, type Q } from './db.js';
import { newId } from './auth.js';
import { googleConfigured, finishGoogle, OAuthError, safeNext, startGoogle, verifyIdToken } from './google.js';
import { normalizePhone } from './otp.js';
import { Respond } from './respond.js';
import {
  clearCookie, createSession, deviceLabel, isRecent, listSessions, logSecurity, markRecentAuth, notifySecurity, publicSessionId,
  randomToken, readCookie, revokeSessions, setCookie, sha256, SESSION_COOKIE, type SessionRow,
} from './session.js';
import {
  checkQuestions, type QuestionInput, consumeRecoveryCode, getQuestions, remainingCodes, replaceRecoveryCodes, revokeRecoveryCodes, saveQuestions, verifyAnswers,
} from './secrets.js';
import { listPasskeys, passkeyLoginOptions, passkeyRegistrationOptions, verifyPasskeyLogin, verifyPasskeyRegistration } from './webauthn.js';
import type { Ctx, UserRow } from './routes.js';

/**
 * Parcours d'authentification : Google (OpenID Connect), inscription progressive, sessions, passkeys, questions de
 * sécurité, codes de récupération, changement de compte Google, récupération sans Google et assistance administrative.
 * Les décisions sont toutes prises ici, côté serveur.
 */

type Handler = (c: Ctx) => Promise<unknown>;

export interface AuthFlowDeps {
  fail: (status: number, message: string, code?: string) => never;
  admin: (c: Ctx) => UserRow;
  rateLimit: (key: string, max: number, windowMinutes: number) => Promise<void>;
  toAppUser: (u: UserRow) => AppUser & { organizerId?: string };
}

const TERMS_VERSION = '2026-11';
/** Lien profond de l'application Android (déclaré dans son manifeste). */
const APP_SCHEME = 'event509';
const SIGNUP_COOKIE = 'e509_signup';
const OAUTH_COOKIE = 'e509_oauth';
const RECOVERY_DELAY_HOURS = 48;
const UNDO_HOURS = 72;

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || 'E5';
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');
const maskEmail = (e: string) => {
  const [l = '', d = ''] = e.split('@');
  return `${l.slice(0, 2)}${'•'.repeat(Math.max(2, l.length - 2))}@${d}`;
};
const isUnique = (e: unknown) => (e as { code?: string })?.code === '23505';
/**
 * Retour vers l'application Android depuis le navigateur du téléphone : une page avec un bouton (geste de l'utilisateur, accepté par
 * tous les navigateurs) et une redirection automatique vers le lien profond. Les paramètres sont tirés d'un jeu de caractères sûr.
 */
function backToApp(query: string, cookies: string[]) {
  const url = `${APP_SCHEME}://auth?${query.replace(/[^A-Za-z0-9_=&-]/g, '')}`;
  return Respond.html(
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=${url}"><title>EVENT509</title>` +
      `<style>body{font-family:system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#F2F2FA;color:#0C0640;text-align:center;padding:24px}a{display:inline-block;margin-top:16px;background:#1509F3;color:#fff;padding:14px 28px;border-radius:999px;font-weight:700;text-decoration:none}</style></head>` +
      `<body><main><h1>Retour dans EVENT509</h1><p>Si l’application ne s’ouvre pas toute seule, touchez le bouton.</p><a href="${url}">Ouvrir EVENT509</a></main></body></html>`,
    cookies,
  );
}
const dummyWork = () => sha256(randomToken(16)); // temps comparable pour un compte inconnu

/** Le compte a-t-il une identité Google active ? (l'interface en déduit s'il faut proposer l'association) */
export async function hasGoogleIdentity(userId: string) {
  return !!(await one(`select 1 from auth_identities where user_id = $1 and provider = 'google' and status = 'active'`, [userId]));
}

export function authFlowRoutes(d: AuthFlowDeps) {
  const { fail } = d;
  const dest = (u: UserRow, next?: string | null) => next ?? (u.role === 'admin' ? '/admin' : u.organizer_id ? '/organisateur' : '/compte');

  // ---------- Aides ----------

  /** Trois questions valides, ou erreur 422 (le message explique quoi corriger). */
  const questionsOf = (v: unknown): QuestionInput[] => {
    const r = checkQuestions(v);
    if (!r.ok) fail(422, r.message, 'questions_invalid');
    return (r as { items: QuestionInput[] }).items;
  };

  /** Compte connecté par session serveur (cookie) ; les anciens jetons n'ouvrent pas ces opérations. */
  const needSession = (c: Ctx) => {
    if (!c.user || !c.session) fail(401, 'Connectez-vous pour continuer', 'login_required');
    return { user: c.user!, session: c.session! };
  };
  /** Opération sensible : l'identité doit avoir été prouvée il y a moins de 10 minutes. */
  const needRecent = (c: Ctx) => {
    const s = needSession(c);
    if (!isRecent(s.session)) fail(403, 'Confirmez votre identité pour continuer.', 'reauth_required');
    return s;
  };
  const failures = async (key: string) => Number((await one<{ n: string }>(`select count(*)::text as n from rate_events where key = $1 and at > now() - interval '1 hour'`, [key]))?.n ?? 0);
  const hit = (key: string) => db().query(`insert into rate_events (key) values ($1)`, [key]).then(() => undefined);
  const wantsJson = (c: Ctx) => c.method !== 'GET';
  const authMethods = async (userId: string, q?: Q) => {
    const g = await one<{ n: string }>(`select count(*)::text as n from auth_identities where user_id = $1 and status = 'active'`, [userId], q);
    const p = await one<{ n: string }>(`select count(*)::text as n from webauthn_credentials where user_id = $1`, [userId], q);
    return Number(g?.n ?? 0) + Number(p?.n ?? 0);
  };
  const sessionResponse = async (u: UserRow, c: Ctx, method: string, extra: Record<string, unknown> = {}, limited = false, cookies: string[] = []) => {
    const s = await createSession(u.id, { method, userAgent: c.userAgent, ip: c.ip, limited });
    await logSecurity(u.id, 'login', { method, device: deviceLabel(c.userAgent) }, c.ip);
    const fresh = (await one<UserRow>(`select * from users where id = $1`, [u.id]))!;
    return Respond.json({ user: { ...d.toAppUser(fresh), hasGoogle: await hasGoogleIdentity(u.id) }, ...extra }, [s.cookie, ...cookies]);
  };

  // ---------- Configuration publique ----------

  const config: Handler = async () => ({ google: googleConfigured(), passkeys: true, termsVersion: TERMS_VERSION });

  // ---------- Google : départ et retour ----------

  const googleStartRoute: Handler = async (c) => {
    const purpose = str(c.query.purpose, 10);
    const err = (e: string, to = '/connexion') => Respond.redirect(`${to}?error=${e}`);
    if (!googleConfigured()) return err('unavailable');
    if (!['login', 'link', 'reauth'].includes(purpose)) return err('invalid');
    const next = safeNext(c.query.next);
    let userId: string | undefined;
    if (purpose !== 'login') {
      if (!c.user || !c.session) return err('login_required');
      if (purpose === 'link' && !isRecent(c.session)) return err('reauth_required', '/compte/securite');
      userId = c.user.id;
    } else if (c.ip) await d.rateLimit(`gstart:${c.ip}`, 40, 60);
    // Application Android : défi PKCE (SHA-256 en base64url) du secret que seule l'application connaît ; connexion et inscription seulement
    const appChallenge = purpose === 'login' && typeof c.query.app_challenge === 'string' && /^[A-Za-z0-9_-]{43}$/.test(c.query.app_challenge) ? c.query.app_challenge : null;
    const g = await startGoogle({ purpose: purpose as 'login' | 'link' | 'reauth', userId, next, appChallenge });
    return Respond.redirect(g.url, [setCookie(OAUTH_COOKIE, g.browser, 600)]);
  };

  /**
   * Application Android native, compte connecté : changement de compte Google ou confirmation d'identité par Google.
   * L'application appelle cette route avec sa session et le défi PKCE d'un secret qu'elle seule détient, puis ouvre l'adresse
   * renvoyée dans l'onglet du navigateur (où aucune session EVENT509 n'existe).
   */
  const appGoogleStart: Handler = async (c) => {
    if (!googleConfigured()) fail(503, 'La connexion Google n’est pas disponible.', 'unavailable');
    const purpose = str(c.body.purpose, 10);
    if (purpose !== 'link' && purpose !== 'reauth') fail(422, 'Opération inconnue.');
    const challenge = str(c.body.challenge, 60);
    if (!/^[A-Za-z0-9_-]{43}$/.test(challenge)) fail(422, 'Défi invalide.');
    const { user } = purpose === 'link' ? needRecent(c) : needSession(c);
    if (c.ip) await d.rateLimit(`appgoogle:${user.id}`, 20, 60);
    const g = await startGoogle({ purpose: purpose as 'link' | 'reauth', userId: user.id, appChallenge: challenge });
    return { url: g.url };
  };

  /**
   * Application Android native : connexion par la fenêtre Google du téléphone (sélecteur de compte intégré, sans navigateur).
   * L'application envoie le jeton d'identité Google et le « nonce » qu'elle a fixé ; le serveur vérifie la signature, l'émetteur,
   * le destinataire (notre identifiant client), l'expiration et le nonce, puis applique les mêmes règles que la connexion
   * par le navigateur : compte existant → session, nouvelle personne → inscription en cours (profil à compléter),
   * ancien compte → refus (jamais de fusion automatique sur l'e-mail).
   */
  const appGoogleToken: Handler = async (c) => {
    if (!googleConfigured()) fail(503, 'La connexion Google n’est pas disponible.', 'unavailable');
    if (c.ip) await d.rateLimit(`gtoken:${c.ip}`, 20, 60);
    const idToken = str(c.body.idToken, 4000);
    const nonce = str(c.body.nonce, 200);
    if (!idToken || !/^[A-Za-z0-9_-]{16,128}$/.test(nonce)) fail(422, 'Requête invalide.');
    let claims!: Awaited<ReturnType<typeof verifyIdToken>>;
    try {
      claims = await verifyIdToken(idToken, nonce);
    } catch (e) {
      await logSecurity(null, 'oauth_failed', { reason: e instanceof OAuthError ? e.reason : 'error', app: true, native: true }, c.ip);
      fail(401, e instanceof OAuthError && e.reason === 'email_not_verified' ? 'L’adresse de ce compte Google n’est pas vérifiée.' : 'Connexion Google refusée. Réessayez.', 'google');
    }
    const active = await one<{ user_id: string }>(`select user_id from auth_identities where provider = 'google' and subject = $1 and status = 'active'`, [claims.sub]);
    if (active) {
      const u = await one<UserRow>(`select * from users where id = $1`, [active.user_id]);
      if (!u || u.status === 'suspended') return fail(403, 'Ce compte est suspendu.', 'suspended');
      const s = await createSession(u.id, { method: 'google', userAgent: c.userAgent, ip: c.ip, limited: !u.auth_complete });
      await logSecurity(u.id, 'login', { method: 'google', device: deviceLabel(c.userAgent), native: true }, c.ip);
      return Respond.json({ next: u.auth_complete ? '/' : '/compte/completer' }, [s.cookie]);
    }
    if (await one(`select 1 from users where lower(email) = $1`, [claims.email])) fail(409, 'Un compte existe déjà avec cette adresse : connectez-vous avec votre e-mail et votre mot de passe.', 'legacy_account');
    const token = randomToken(32);
    await db().query(`delete from pending_signups where expires_at < now() or google_sub = $1`, [claims.sub]);
    await db().query(
      `insert into pending_signups (id_hash, google_sub, email, given_name, family_name, picture, expires_at) values ($1,$2,$3,$4,$5,$6, now() + interval '24 hours')`,
      [sha256(token), claims.sub, claims.email, claims.givenName ?? null, claims.familyName ?? null, claims.picture ?? null]);
    return Respond.json({ next: '/inscription/profil' }, [setCookie(SIGNUP_COOKIE, token, 86400)]);
  };

  const googleCallback: Handler = async (c) => {
    const clear = clearCookie(OAUTH_COOKIE);
    let fromApp = false;
    // Dans le navigateur du téléphone, une erreur retourne à l'application (lien profond) ; sinon, page de connexion du site
    const bad = (e: string, to = '/connexion') => (fromApp ? backToApp(`error=${e}`, [clear]) : Respond.redirect(`${to}?error=${e}`, [clear]));
    if (c.query.error) return bad('cancelled');
    let res;
    try {
      res = await finishGoogle({ code: str(c.query.code, 2000), state: str(c.query.state, 200), browser: readCookie(c.cookies ?? {}, OAUTH_COOKIE) });
    } catch (e) {
      fromApp = e instanceof OAuthError && e.app;
      await logSecurity(null, 'oauth_failed', { reason: e instanceof OAuthError ? e.reason : 'error', app: fromApp }, c.ip);
      return bad(e instanceof OAuthError && e.reason === 'email_not_verified' ? 'email_not_verified' : 'google');
    }
    const { claims, state } = res;
    fromApp = !!state.app_challenge;
    const next = safeNext(state.next_path);
    /** Application : aucune session n'est créée dans le navigateur ; un code à usage unique (2 min) retourne à l'application. */
    const toApp = async (kind: 'session' | 'signup', o: { userId?: string; pendingHash?: string }, extraCookies: string[] = []) => {
      const code = randomToken(32);
      await db().query(`delete from app_handoffs where expires_at < now()`);
      await db().query(
        `insert into app_handoffs (code_hash, kind, user_id, pending_hash, challenge, next_path, expires_at) values ($1,$2,$3,$4,$5,$6, now() + interval '2 minutes')`,
        [sha256(code), kind, o.userId ?? null, o.pendingHash ?? null, state.app_challenge, next]);
      return backToApp(`code=${code}`, [clear, ...extraCookies]);
    };
    const active = await one<{ user_id: string }>(`select user_id from auth_identities where provider = 'google' and subject = $1 and status = 'active'`, [claims.sub]);

    // ---- Connexion / inscription
    if (state.purpose === 'login') {
      if (active) {
        const u = await one<UserRow>(`select * from users where id = $1`, [active.user_id]);
        if (!u || u.status === 'suspended') return bad('suspended');
        if (state.app_challenge) return toApp('session', { userId: u.id });
        const s = await createSession(u.id, { method: 'google', userAgent: c.userAgent, ip: c.ip, limited: !u.auth_complete });
        await logSecurity(u.id, 'login', { method: 'google', device: deviceLabel(c.userAgent) }, c.ip);
        return Respond.redirect(u.auth_complete ? dest(u, next) : '/compte/completer', [clear, s.cookie]);
      }
      // Jamais de fusion automatique sur l'e-mail : un ancien compte doit d'abord être connecté avec son ancienne méthode
      if (await one(`select 1 from users where lower(email) = $1`, [claims.email])) return bad('legacy_account');
      const token = randomToken(32);
      await db().query(`delete from pending_signups where expires_at < now() or google_sub = $1`, [claims.sub]);
      await db().query(
        `insert into pending_signups (id_hash, google_sub, email, given_name, family_name, picture, expires_at) values ($1,$2,$3,$4,$5,$6, now() + interval '24 hours')`,
        [sha256(token), claims.sub, claims.email, claims.givenName ?? null, claims.familyName ?? null, claims.picture ?? null]);
      if (state.app_challenge) return toApp('signup', { pendingHash: sha256(token) });
      return Respond.redirect('/inscription/profil', [clear, setCookie(SIGNUP_COOKIE, token, 86400)]);
    }

    // ---- Application native, compte connecté (la session est dans l'application, pas dans le navigateur)
    if (state.app_challenge && state.purpose === 'reauth') {
      // Le compte Google doit être celui du compte : l'application reçoit alors une session neuve (identité confirmée à l'instant)
      if (!state.user_id || active?.user_id !== state.user_id) {
        if (state.user_id) await logSecurity(state.user_id, 'reauth_failed', { method: 'google', app: true }, c.ip);
        return bad('wrong_google');
      }
      await logSecurity(state.user_id, 'reauth', { method: 'google', app: true }, c.ip);
      return toApp('session', { userId: state.user_id });
    }
    if (state.app_challenge && state.purpose === 'link') {
      if (!state.user_id) return bad('invalid');
      if (active) return bad(active.user_id === state.user_id ? 'same_google' : 'google_in_use');
      // Demande en attente, retrouvée par l'application grâce au défi de son secret ; elle doit encore la confirmer avec sa session
      await db().query(`delete from pending_links where expires_at < now() or user_id = $1`, [state.user_id]);
      await db().query(`insert into pending_links (id_hash, user_id, google_sub, email, expires_at) values ($1,$2,$3,$4, now() + interval '10 minutes')`,
        [sha256(state.app_challenge), state.user_id, claims.sub, claims.email]);
      return backToApp('link=1', [clear]);
    }

    // ---- Opérations sur un compte connecté
    const sUser = c.user;
    if (state.purpose === 'reauth') {
      if (!sUser || !c.session || state.user_id !== sUser.id) return bad('login_required');
      if (active?.user_id !== sUser.id) {
        await logSecurity(sUser.id, 'reauth_failed', { method: 'google' }, c.ip);
        return bad('wrong_google', '/compte/securite');
      }
      await markRecentAuth(c.session.id_hash);
      await logSecurity(sUser.id, 'reauth', { method: 'google' }, c.ip);
      return Respond.redirect(next ?? '/compte/securite', [clear]);
    }

    if (state.purpose === 'link') {
      if (!sUser || !c.session || state.user_id !== sUser.id || !isRecent(c.session)) return bad('reauth_required', '/compte/securite');
      if (active) return bad(active.user_id === sUser.id ? 'same_google' : 'google_in_use', '/compte/securite');
      const token = randomToken(24);
      await db().query(`delete from pending_links where expires_at < now() or user_id = $1`, [sUser.id]);
      await db().query(`insert into pending_links (id_hash, user_id, google_sub, email, expires_at) values ($1,$2,$3,$4, now() + interval '10 minutes')`, [sha256(token), sUser.id, claims.sub, claims.email]);
      return Respond.redirect(`/compte/securite?link=${encodeURIComponent(token)}`, [clear]);
    }

    // ---- Récupération : le nouveau Google remplace l'ancien après validation des facteurs
    if (state.purpose === 'recover') return finishRecovery(c, state.recovery_id, claims, clear, state.app_challenge ? (userId) => toApp('session', { userId }) : undefined);
    return bad('invalid');
  };

  async function finishRecovery(c: Ctx, recoveryId: string | null, claims: { sub: string; email: string }, clear: string, toApp?: (userId: string) => Promise<unknown>) {
    const bad = (e: string) => (toApp ? backToApp(`error=${e}`, [clear]) : Respond.redirect(`/connexion/recuperation?error=${e}`, [clear]));
    if (!recoveryId) return bad('invalid');
    const rec = await one<{ id_hash: string; user_id: string | null; factors: string[]; request_id: string | null }>(
      `select id_hash, user_id, factors, request_id from recovery_sessions where id_hash = $1 and completed_at is null and expires_at > now()`, [recoveryId]);
    if (!rec?.user_id || !recoverySufficient(rec.factors)) return bad('invalid');
    if (await one(`select 1 from auth_identities where provider = 'google' and subject = $1 and status = 'active' and user_id <> $2`, [claims.sub, rec.user_id])) return bad('google_in_use');
    const userId = rec.user_id;
    try {
      await tx(async (q) => {
        // Consommation unique de la tentative de récupération
        const done = await q.query(`update recovery_sessions set completed_at = now() where id_hash = $1 and completed_at is null`, [rec.id_hash]);
        if (done.rowCount !== 1) throw new Error('déjà utilisée');
        await replaceGoogle(q, userId, claims);
        if (rec.request_id) await q.query(`update recovery_requests set status = 'completed' where id = $1 and status = 'approved'`, [rec.request_id]);
        // Toutes les anciennes sessions sont fermées
        await revokeSessions(userId, {}, q);
      });
    } catch (e) {
      if (isUnique(e)) return bad('google_in_use');
      return bad('invalid');
    }
    const u = (await one<UserRow>(`select * from users where id = $1`, [userId]))!;
    await logSecurity(userId, 'recovery_completed', { factors: rec.factors }, c.ip);
    await notifySecurity(userId, 'Récupération de compte terminée', ['Un nouveau compte Google a été associé à votre compte EVENT509 et vos autres sessions ont été fermées.']);
    // Application native : la nouvelle session est remise à l'application (code à usage unique + secret PKCE)
    if (toApp) return toApp(userId);
    const s = await createSession(userId, { method: 'recovery', userAgent: c.userAgent, ip: c.ip, limited: !u.auth_complete });
    return Respond.redirect(u.auth_complete ? '/compte/securite?recovered=1' : '/compte/completer', [clear, s.cookie]);
  }

  /** Remplace l'identité Google active (l'ancienne reste « remplacée » 72 h pour pouvoir annuler). */
  async function replaceGoogle(q: Q, userId: string, claims: { sub: string; email: string }) {
    await q.query(`update auth_identities set status = 'replaced', replaced_at = now() where user_id = $1 and provider = 'google' and status = 'active'`, [userId]);
    await q.query(`insert into auth_identities (id, user_id, provider, subject, email) values ($1,$2,'google',$3,$4)`, [newId('idn'), userId, claims.sub, claims.email]);
  }

  /**
   * Application Android : échange du code à usage unique contre une vraie session, DANS la WebView de l'application.
   * Il faut présenter le secret (verifier) dont le défi a été donné au départ : un code intercepté seul ne sert à rien.
   * Un seul essai par code (il est supprimé dès qu'on le présente).
   */
  const appExchange: Handler = async (c) => {
    const fail302 = () => Respond.redirect('/connexion?error=google');
    if (c.ip) await d.rateLimit(`appx:${c.ip}`, 30, 60);
    const code = str(c.query.code, 100);
    const verifier = str(c.query.verifier, 200);
    if (!verifier) return fail302();
    const want = createHash('sha256').update(verifier).digest('base64url');
    // Avec le code reçu par le lien profond, ou, si ce lien n'a pas ouvert l'application, grâce au seul secret PKCE
    // (l'application le vérifie via /auth/app/ready) : dans les deux cas, le secret que seule l'application détient est exigé.
    const h = await one<{ kind: string; user_id: string | null; pending_hash: string | null; challenge: string; next_path: string | null; ok: boolean }>(
      code
        ? `delete from app_handoffs where code_hash = $1 returning kind, user_id, pending_hash, challenge, next_path, expires_at > now() as ok`
        : `delete from app_handoffs where code_hash = (select code_hash from app_handoffs where challenge = $1 and expires_at > now() order by created_at desc limit 1) returning kind, user_id, pending_hash, challenge, next_path, expires_at > now() as ok`,
      [code ? sha256(code) : want]);
    if (!h || !h.ok || want.length !== h.challenge.length || !timingSafeEqual(Buffer.from(want), Buffer.from(h.challenge))) {
      await logSecurity(null, 'app_exchange_failed', {}, c.ip);
      return fail302();
    }
    if (h.kind === 'session') {
      const u = await one<UserRow>(`select * from users where id = $1`, [h.user_id]);
      if (!u || u.status === 'suspended') return fail302();
      const s = await createSession(u.id, { method: 'google', userAgent: c.userAgent, ip: c.ip, limited: !u.auth_complete });
      await logSecurity(u.id, 'login', { method: 'google', device: deviceLabel(c.userAgent) }, c.ip);
      return Respond.redirect(u.auth_complete ? dest(u, safeNext(h.next_path)) : '/compte/completer', [s.cookie]);
    }
    // Inscription : le jeton de l'inscription provisoire est renouvelé (rien n'est gardé en clair) et remis à la WebView
    const fresh = randomToken(32);
    const r = await db().query(`update pending_signups set id_hash = $2 where id_hash = $1 and expires_at > now() returning id_hash`, [h.pending_hash, sha256(fresh)]);
    if (r.rowCount !== 1) return fail302();
    return Respond.redirect('/inscription/profil', [setCookie(SIGNUP_COOKIE, fresh, 86400)]);
  };

  /** L'application demande si la connexion faite dans le navigateur est terminée (le lien profond peut ne pas s'ouvrir : cette vérification le remplace). Ne consomme rien. */
  const appReady: Handler = async (c) => {
    if (c.ip) await d.rateLimit(`appready:${c.ip}`, 120, 60);
    const verifier = str(c.query.verifier, 200);
    if (!verifier) return { ready: false };
    const want = createHash('sha256').update(verifier).digest('base64url');
    const r = await one<{ ok: number }>(`select 1 as ok from app_handoffs where challenge = $1 and expires_at > now() limit 1`, [want]);
    return { ready: !!r };
  };

  // ---------- Inscription progressive ----------

  const pendingOf = (c: Ctx) => {
    const t = readCookie(c.cookies ?? {}, SIGNUP_COOKIE);
    return t ? one<{ id_hash: string; google_sub: string; email: string; given_name: string | null; family_name: string | null; picture: string | null }>(
      `select id_hash, google_sub, email, given_name, family_name, picture from pending_signups where id_hash = $1 and expires_at > now()`, [sha256(t)]) : Promise.resolve(null);
  };

  /** Informations Google à préremplir (jamais de jeton). */
  const signupPending: Handler = async (c) => {
    const p = await pendingOf(c);
    if (!p) return { pending: false };
    return { pending: true, email: p.email, givenName: p.given_name ?? '', familyName: p.family_name ?? '', picture: p.picture ?? '', country: c.geo?.country ?? '', city: c.geo?.city ?? '', termsVersion: TERMS_VERSION };
  };

  function checkProfile(b: Record<string, unknown>) {
    const givenName = str(b.givenName, 60);
    const familyName = str(b.familyName, 60);
    const country = str(b.country, 10).toUpperCase();
    const city = str(b.city, 80);
    const username = str(b.username, 30).toLowerCase();
    if (givenName.length < 1 || !/\p{L}/u.test(givenName)) fail(422, 'Indiquez votre prénom.', 'profile_invalid');
    if (familyName.length < 1 || !/\p{L}/u.test(familyName)) fail(422, 'Indiquez votre nom.', 'profile_invalid');
    if (!/^[A-Z]{2}$/.test(country)) fail(422, 'Choisissez votre pays.', 'profile_invalid');
    if (city.length < 2) fail(422, 'Indiquez votre ville.', 'profile_invalid');
    if (username && !/^[a-z0-9][a-z0-9_.-]{2,29}$/.test(username)) fail(422, 'Nom d’utilisateur : 3 à 30 caractères (lettres, chiffres, point, tiret, tiret bas).', 'profile_invalid');
    // Un seul type de compte : l'organisation se crée plus tard depuis le compte (POST /auth/organizer)
    return { givenName, familyName, country, city, username: username || null };
  }
  function checkConsent(b: Record<string, unknown>) {
    if (b.acceptTerms !== true || b.acceptPrivacy !== true) fail(422, 'Acceptez les conditions d’utilisation et la politique de confidentialité.', 'consent_required');
  }

  /**
   * Création définitive du compte : profil, trois questions de sécurité et acceptations sont tous obligatoires, puis tout
   * est écrit dans UNE transaction (compte, organisation, identité Google, questions) ; l'inscription provisoire est supprimée.
   */
  const signupComplete: Handler = async (c) => {
    if (c.ip) await d.rateLimit(`signup2:${c.ip}`, 10, 60);
    const p = await pendingOf(c);
    if (!p) fail(410, 'Votre inscription a expiré. Recommencez avec Google.', 'signup_expired');
    const prof = checkProfile(c.body);
    checkConsent(c.body);
    const qItems = questionsOf(c.body.questions);
    const pend = p!;
    let user: UserRow;
    try {
      user = await tx(async (q) => {
        // L'inscription provisoire ne sert qu'une fois (verrou de ligne)
        const taken = await q.query(`delete from pending_signups where id_hash = $1 and expires_at > now() returning id_hash`, [pend.id_hash]);
        if (taken.rowCount !== 1) fail(410, 'Votre inscription a expiré. Recommencez avec Google.', 'signup_expired');
        if (await one(`select 1 from auth_identities where provider = 'google' and subject = $1 and status = 'active'`, [pend.google_sub], q)) fail(409, 'Ce compte Google est déjà associé à un compte EVENT509.', 'google_in_use');
        if (await one(`select 1 from users where lower(email) = $1`, [pend.email], q)) fail(409, 'Un compte existe déjà avec cette adresse.', 'legacy_account');
        const id = newId('u');
        const name = `${prof.givenName} ${prof.familyName}`;
        let role: AppUser['role'] = 'organizer';
        let teamRole: TeamRole | null = 'admin';
        let organizerId: string | null;
        let perms: string[] | null = null;
        // Invitation d'équipe en attente : le compte rejoint l'organisation avec son rôle (comme avant la refonte)
        const invite = await one<{ organizer_id: string; data: TeamMember }>(`select organizer_id, data from team_members where lower(email) = $1`, [pend.email], q);
        if (invite) {
          teamRole = invite.data.role;
          organizerId = invite.organizer_id;
          perms = invite.data.perms ?? null;
          await q.query(`update team_members set data = data || '{"status":"active"}'::jsonb where lower(email) = $1`, [pend.email]);
        } else {
          // Compte commun : pas d'organisation (il pourra en créer une depuis son compte)
          role = 'participant';
          teamRole = null;
          organizerId = null;
        }
        const data = {
          name, avatar: initials(name), city: prof.city, country: prof.country, givenName: prof.givenName, familyName: prof.familyName,
          joinedAt: new Date().toISOString().slice(0, 10), emailVerified: true,
          consent: { termsVersion: TERMS_VERSION, privacyVersion: TERMS_VERSION, at: new Date().toISOString() },
        };
        await q.query(
          `insert into users (id, email, password_hash, role, team_role, organizer_id, data, team_perms, username, auth_complete) values ($1,$2,null,$3,$4,$5,$6,$7::jsonb,$8,true)`,
          [id, pend.email, role, teamRole, organizerId, JSON.stringify(data), perms ? JSON.stringify(perms) : null, prof.username]);
        await q.query(`insert into auth_identities (id, user_id, provider, subject, email) values ($1,$2,'google',$3,$4)`, [newId('idn'), id, pend.google_sub, pend.email]);
        await saveQuestions(id, qItems, q);
        return (await one<UserRow>(`select * from users where id = $1`, [id], q))!;
      });
    } catch (e) {
      if (isUnique(e)) {
        const m = String((e as { constraint?: string }).constraint ?? '');
        if (m.includes('username')) fail(409, 'Ce nom d’utilisateur est déjà pris.', 'username_taken');
        fail(409, 'Un compte existe déjà pour cette identité.', 'duplicate');
      }
      throw e;
    }
    await logSecurity(user.id, 'account_created', { method: 'google' }, c.ip);
    return sessionResponse(user, c, 'google', {}, false, [clearCookie(SIGNUP_COOKIE)]);
  };

  /** Compte d'avant la refonte (ou profil incomplet) : complète les informations manquantes (questions, conditions). */
  const profileComplete: Handler = async (c) => {
    const { user, session } = needSession(c);
    if (user.auth_complete) fail(409, 'Votre profil est déjà complet.', 'already_complete');
    const prof = checkProfile({ givenName: c.body.givenName, familyName: c.body.familyName, country: c.body.country, city: c.body.city, username: c.body.username });
    checkConsent(c.body);
    const qItems = questionsOf(c.body.questions);
    try {
      await tx(async (q) => {
        await saveQuestions(user.id, qItems, q);
        const name = `${prof.givenName} ${prof.familyName}`;
        await q.query(
          `update users set auth_complete = true, username = coalesce($2, username), data = data || $3::jsonb where id = $1`,
          [user.id, prof.username, JSON.stringify({ name, avatar: initials(name), city: prof.city, country: prof.country, givenName: prof.givenName, familyName: prof.familyName, consent: { termsVersion: TERMS_VERSION, privacyVersion: TERMS_VERSION, at: new Date().toISOString() } })]);
        await q.query(`update auth_sessions set limited = false where id_hash = $1`, [session.id_hash]);
      });
    } catch (e) {
      if (isUnique(e)) fail(409, 'Ce nom d’utilisateur est déjà pris.', 'username_taken');
      throw e;
    }
    await logSecurity(user.id, 'profile_completed', {}, c.ip);
    return { user: { ...d.toAppUser((await one<UserRow>(`select * from users where id = $1`, [user.id]))!), hasGoogle: await hasGoogleIdentity(user.id) } };
  };

  // ---------- Sessions et appareils ----------

  const sessionsList: Handler = async (c) => {
    const { user, session } = needSession(c);
    return (await listSessions(user.id)).map((s) => ({
      id: publicSessionId(s.id_hash), device: s.device_label ?? 'Appareil', ip: s.ip_masked, method: s.method, createdAt: s.created_at, lastSeenAt: s.last_seen_at, current: s.id_hash === session.id_hash,
    }));
  };
  const sessionRevoke: Handler = async (c) => {
    const { user, session } = needSession(c);
    const pid = String(c.params.id ?? '');
    if (!/^[a-f0-9]{20}$/.test(pid)) fail(404, 'Session introuvable');
    const n = await revokeSessions(user.id, { onlyPublicId: pid });
    if (!n) fail(404, 'Session introuvable');
    await logSecurity(user.id, 'session_revoked', { current: session.id_hash.startsWith(pid) }, c.ip);
    return session.id_hash.startsWith(pid) ? Respond.json({ ok: true }, [clearCookie(SESSION_COOKIE)]) : { ok: true };
  };
  const sessionsRevokeOthers: Handler = async (c) => {
    const { user, session } = needSession(c);
    const n = await revokeSessions(user.id, { exceptIdHash: session.id_hash });
    await logSecurity(user.id, 'sessions_revoked', { count: n }, c.ip);
    if (n) await notifySecurity(user.id, 'Sessions fermées', [`${n} autre(s) session(s) ont été fermées sur votre compte EVENT509.`]);
    return { revoked: n };
  };
  const logout: Handler = async (c) => {
    if (c.session) await db().query(`update auth_sessions set revoked_at = now() where id_hash = $1`, [c.session.id_hash]);
    // Ancien jeton (JWT sans état) : la déconnexion le rend inutilisable, en même temps que les autres anciens jetons du compte
    else if (c.user && c.authorization) await db().query(`update users set sessions_valid_from = now() where id = $1`, [c.user.id]);
    return Respond.json({ ok: true }, [clearCookie(SESSION_COOKIE)]);
  };

  // ---------- Réauthentification ----------

  const reauthPasskeyOptions: Handler = async (c) => {
    needSession(c);
    const r = await passkeyLoginOptions('login');
    return { options: r.options, challengeId: r.challengeId };
  };
  const reauthPasskeyVerify: Handler = async (c) => {
    const { user, session } = needSession(c);
    await d.rateLimit(`reauth:${user.id}`, 15, 60);
    const v = await verifyPasskeyLogin(str(c.body.challengeId, 100), c.body.response as AuthenticationResponseJSON);
    if (!v || v.userId !== user.id) {
      await logSecurity(user.id, 'reauth_failed', { method: 'passkey' }, c.ip);
      fail(400, 'Vérification impossible. Réessayez.', 'reauth_failed');
    }
    await markRecentAuth(session.id_hash);
    await logSecurity(user.id, 'reauth', { method: 'passkey' }, c.ip);
    return { ok: true };
  };
  const reauthCode: Handler = async (c) => {
    const { user, session } = needSession(c);
    if ((await failures(`reauthcode:${user.id}`)) >= 5) fail(429, 'Trop de tentatives. Réessayez plus tard.', 'rate_limited');
    if (!(await consumeRecoveryCode(user.id, str(c.body.code, 40)))) {
      await hit(`reauthcode:${user.id}`);
      await logSecurity(user.id, 'reauth_failed', { method: 'recovery_code' }, c.ip);
      fail(400, 'Code incorrect ou déjà utilisé.', 'reauth_failed');
    }
    await markRecentAuth(session.id_hash);
    await logSecurity(user.id, 'recovery_code_used', { purpose: 'reauth' }, c.ip);
    await notifySecurity(user.id, 'Code de récupération utilisé', ['Un de vos codes de récupération vient d’être utilisé pour confirmer votre identité.']);
    return { ok: true, remaining: await remainingCodes(user.id) };
  };

  // ---------- Passkeys ----------

  const passkeyRegOptions: Handler = async (c) => {
    const { user } = needRecent(c);
    const r = await passkeyRegistrationOptions({ id: user.id, email: user.email, name: (user.data.name as string) ?? '' });
    return r;
  };
  const passkeyRegVerify: Handler = async (c) => {
    const { user } = needRecent(c);
    const name = str(c.body.name, 60) || deviceLabel(c.userAgent);
    const r = await verifyPasskeyRegistration(user.id, str(c.body.challengeId, 100), c.body.response as RegistrationResponseJSON, name);
    if (!r) fail(400, 'La passkey n’a pas pu être enregistrée. Réessayez.', 'passkey_failed');
    await logSecurity(user.id, 'passkey_added', { name }, c.ip);
    await notifySecurity(user.id, 'Nouvelle passkey enregistrée', [`Une passkey (« ${name} ») a été ajoutée à votre compte EVENT509.`]);
    return { id: r!.id };
  };
  const passkeyDelete: Handler = async (c) => {
    const { user } = needRecent(c);
    const id = String(c.params.id ?? '');
    const row = await one<{ name: string }>(`select name from webauthn_credentials where id = $1 and user_id = $2`, [id, user.id]);
    if (!row) fail(404, 'Passkey introuvable');
    if ((await authMethods(user.id)) <= 1) fail(409, 'C’est votre seule méthode de connexion : ajoutez-en une autre avant de la supprimer.', 'last_method');
    await db().query(`delete from webauthn_credentials where id = $1 and user_id = $2`, [id, user.id]);
    await logSecurity(user.id, 'passkey_removed', { name: row!.name }, c.ip);
    await notifySecurity(user.id, 'Passkey supprimée', [`La passkey « ${row!.name} » a été retirée de votre compte EVENT509.`]);
    return { ok: true };
  };
  const passkeyLoginOpts: Handler = async (c) => {
    if (c.ip) await d.rateLimit(`pklogin:${c.ip}`, 60, 60);
    return passkeyLoginOptions('login');
  };
  const passkeyLoginVerify: Handler = async (c) => {
    if (c.ip) await d.rateLimit(`pkverify:${c.ip}`, 30, 60);
    const v = await verifyPasskeyLogin(str(c.body.challengeId, 100), c.body.response as AuthenticationResponseJSON);
    if (!v) {
      await logSecurity(null, 'login_failed', { method: 'passkey' }, c.ip);
      fail(400, 'Connexion impossible avec cette passkey.', 'login_failed');
    }
    const u = await one<UserRow>(`select * from users where id = $1`, [v!.userId]);
    if (!u || u.status === 'suspended') fail(400, 'Connexion impossible avec cette passkey.', 'login_failed');
    return sessionResponse(u!, c, 'passkey', {}, !u!.auth_complete);
  };

  // ---------- Questions et codes de récupération ----------

  const questionsReplace: Handler = async (c) => {
    const { user } = needRecent(c);
    const qItems = questionsOf(c.body.questions);
    await tx((q) => saveQuestions(user.id, qItems, q));
    await logSecurity(user.id, 'questions_replaced', {}, c.ip);
    await notifySecurity(user.id, 'Questions de sécurité modifiées', ['Vos questions de sécurité ont été remplacées.']);
    return { ok: true };
  };
  const codesGenerate: Handler = async (c) => {
    const { user } = needRecent(c);
    await d.rateLimit(`codes:${user.id}`, 5, 24 * 60);
    const codes = await tx((q) => replaceRecoveryCodes(user.id, q));
    await logSecurity(user.id, 'recovery_codes_generated', { count: codes.length }, c.ip);
    await notifySecurity(user.id, 'Nouveaux codes de récupération', ['Une nouvelle série de codes de récupération a été générée ; les anciens ne fonctionnent plus.']);
    // Les codes ne sont affichés qu'ici, une seule fois
    return Respond.json({ codes, remaining: codes.length }, [], 200);
  };
  const codesRevoke: Handler = async (c) => {
    const { user } = needRecent(c);
    const n = await tx((q) => revokeRecoveryCodes(user.id, q));
    await logSecurity(user.id, 'recovery_codes_revoked', { count: n }, c.ip);
    await notifySecurity(user.id, 'Codes de récupération révoqués', ['Tous vos codes de récupération ont été révoqués.']);
    return { revoked: n };
  };

  // ---------- Changement de compte Google ----------

  const linkPending: Handler = async (c) => {
    const { user } = needSession(c);
    const p = await one<{ email: string }>(`select email from pending_links where id_hash = $1 and user_id = $2 and expires_at > now()`, [sha256(str(c.query.token, 100)), user.id]);
    if (!p) fail(404, 'Cette demande a expiré. Recommencez.', 'link_expired');
    return { email: p!.email };
  };
  const linkConfirm: Handler = async (c) => {
    const { user, session } = needRecent(c);
    if (c.body.confirm !== true) fail(422, 'Confirmez explicitement le changement.', 'confirm_required');
    const hash = sha256(str(c.body.token, 100));
    let first = false;
    try {
      first = await tx(async (q) => {
        const p = await one<{ google_sub: string; email: string }>(`delete from pending_links where id_hash = $1 and user_id = $2 and expires_at > now() returning google_sub, email`, [hash, user.id], q);
        if (!p) fail(404, 'Cette demande a expiré. Recommencez.', 'link_expired');
        const had = !!(await one(`select 1 from auth_identities where user_id = $1 and provider = 'google' and status = 'active'`, [user.id], q));
        // L'ancienne identité n'est remplacée qu'ici, en même temps que la nouvelle est validée (unicité garantie par la base)
        await replaceGoogle(q, user.id, { sub: p!.google_sub, email: p!.email });
        if (!user.auth_complete) await q.query(`update auth_sessions set limited = true where id_hash = $1`, [session.id_hash]);
        return !had;
      });
    } catch (e) {
      if (isUnique(e)) fail(409, 'Ce compte Google est déjà associé à un compte EVENT509.', 'google_in_use');
      throw e;
    }
    await logSecurity(user.id, first ? 'google_linked' : 'google_changed', {}, c.ip);
    await notifySecurity(user.id, first ? 'Compte Google associé' : 'Compte Google remplacé', [first ? 'Un compte Google a été associé à votre compte EVENT509.' : `Votre compte Google a été remplacé. Vous pouvez annuler pendant ${UNDO_HOURS} heures depuis la page Sécurité.`]);
    return { ok: true, authComplete: !!user.auth_complete };
  };
  /** Annule un changement récent (72 h) : l'ancienne identité redevient active, la nouvelle est mise de côté. */
  const linkUndo: Handler = async (c) => {
    const { user } = needRecent(c);
    await tx(async (q) => {
      const old = await one<{ id: string; subject: string; email: string }>(
        `select id, subject, email from auth_identities where user_id = $1 and provider = 'google' and status = 'replaced' and replaced_at > now() - ($2 || ' hours')::interval order by replaced_at desc limit 1`, [user.id, String(UNDO_HOURS)], q);
      if (!old) fail(404, 'Aucun changement récent à annuler.', 'nothing_to_undo');
      if (await one(`select 1 from auth_identities where provider = 'google' and subject = $1 and status = 'active'`, [old!.subject], q)) fail(409, 'Ce compte Google est déjà utilisé ailleurs.', 'google_in_use');
      await q.query(`update auth_identities set status = 'replaced', replaced_at = now() where user_id = $1 and provider = 'google' and status = 'active'`, [user.id]);
      await q.query(`update auth_identities set status = 'active', replaced_at = null where id = $1`, [old!.id]);
    });
    await logSecurity(user.id, 'google_change_undone', {}, c.ip);
    await notifySecurity(user.id, 'Changement de compte Google annulé', ['Votre ancien compte Google est de nouveau associé à votre compte EVENT509.']);
    return { ok: true };
  };

  // ---------- Récapitulatif de sécurité ----------

  const security: Handler = async (c) => {
    const { user, session } = needSession(c);
    const ident = await one<{ email: string; created_at: Date }>(`select email, created_at from auth_identities where user_id = $1 and provider = 'google' and status = 'active'`, [user.id]);
    const undo = await one<{ replaced_at: Date }>(`select replaced_at from auth_identities where user_id = $1 and provider = 'google' and status = 'replaced' and replaced_at > now() - ($2 || ' hours')::interval order by replaced_at desc limit 1`, [user.id, String(UNDO_HOURS)]);
    const q = await one<{ n: string; at: Date | null }>(`select count(*)::text as n, max(created_at) as at from security_questions where user_id = $1`, [user.id]);
    const events = await all<{ event: string; detail: Record<string, unknown>; ip_masked: string | null; at: Date }>(`select event, detail, ip_masked, at from security_events where user_id = $1 order by at desc limit 40`, [user.id]);
    const requests = await all<{ id: string; status: string; created_at: Date; execute_after: Date | null }>(`select id, status, created_at, execute_after from recovery_requests where user_id = $1 order by created_at desc limit 10`, [user.id]);
    return {
      recentAuth: isRecent(session),
      authComplete: !!user.auth_complete,
      google: ident ? { email: maskEmail(ident.email), since: ident.created_at } : null,
      canUndoGoogleChange: !!undo,
      passkeys: (await listPasskeys(user.id)).map((p) => ({ id: p.id, name: p.name, createdAt: p.created_at, lastUsedAt: p.last_used_at, synced: p.backed_up })),
      questions: { count: Number(q?.n ?? 0), updatedAt: q?.at ?? null },
      recoveryCodes: { remaining: await remainingCodes(user.id) },
      events: events.map((e) => ({ event: e.event, at: e.at, ip: e.ip_masked, detail: pickSafe(e.detail) })),
      recoveryRequests: requests.map((r) => ({ id: r.id, status: r.status, createdAt: r.created_at, executeAfter: r.execute_after })),
    };
  };
  /** Seules quelques informations non sensibles d'un événement sont montrées. */
  const pickSafe = (d0: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const k of ['method', 'device', 'name', 'count', 'purpose', 'factors']) if (k in d0) out[k] = d0[k];
    return out;
  };

  // ---------- Récupération sans accès à Google ----------

  const recoverySufficient = (f: string[]) => f.includes('admin') || ((f.includes('passkey') || f.includes('code')) && f.includes('questions'));
  const loadRecovery = async (token: unknown) => {
    const t = str(token, 100);
    const r = t ? await one<{ id_hash: string; user_id: string | null; factors: string[]; attempts: number; locked: boolean }>(
      `select id_hash, user_id, factors, attempts, coalesce(locked_until > now(), false) as locked from recovery_sessions where id_hash = $1 and completed_at is null and expires_at > now()`, [sha256(t)]) : null;
    if (!r) fail(400, 'Cette demande a expiré. Recommencez.', 'recovery_expired');
    if (r!.locked || r!.attempts >= 5) fail(429, 'Trop de tentatives. Réessayez plus tard ou demandez de l’aide.', 'rate_limited');
    return r!;
  };
  /** Échec d'un facteur : même réponse pour un compte connu ou inconnu ; verrouillage après 5 essais. */
  const recoveryFail = async (r: { id_hash: string; user_id: string | null }, c: Ctx, what: string): Promise<never> => {
    await db().query(`update recovery_sessions set attempts = attempts + 1, locked_until = case when attempts + 1 >= 5 then now() + interval '30 minutes' else locked_until end where id_hash = $1`, [r.id_hash]);
    if (r.user_id) {
      await hit(`recfail:${r.user_id}`);
      await logSecurity(r.user_id, 'recovery_factor_failed', { method: what }, c.ip);
    }
    if (c.ip) await hit(`recfail-ip:${c.ip}`);
    return fail(400, 'Vérification impossible. Vérifiez les informations ou demandez de l’aide.', 'recovery_failed');
  };
  const recoveryGuard = async (r: { user_id: string | null }, c: Ctx) => {
    if (r.user_id && (await failures(`recfail:${r.user_id}`)) >= 10) fail(429, 'Trop de tentatives. Réessayez plus tard ou demandez de l’aide.', 'rate_limited');
    if (c.ip && (await failures(`recfail-ip:${c.ip}`)) >= 20) fail(429, 'Trop de tentatives. Réessayez plus tard.', 'rate_limited');
  };
  const addFactor = (id: string, f: string) => db().query(`update recovery_sessions set factors = (select array_agg(distinct x) from unnest(factors || $2::text) x) where id_hash = $1`, [id, f]);

  const findByIdentifier = (identifier: string) =>
    one<UserRow>(`select * from users where status = 'active' and (lower(email) = $1 or lower(username) = $1) limit 1`, [identifier.toLowerCase()]);

  const recoveryStart: Handler = async (c) => {
    if (c.ip) await d.rateLimit(`recstart:${c.ip}`, 10, 60);
    const identifier = str(c.body.identifier, 160);
    if (identifier.length < 3) fail(422, 'Indiquez votre adresse e-mail ou votre nom d’utilisateur.', 'identifier_required');
    const u = await findByIdentifier(identifier);
    if (!u) dummyWork();
    const token = randomToken(32);
    await db().query(`delete from recovery_sessions where expires_at < now() - interval '1 day'`);
    await db().query(`insert into recovery_sessions (id_hash, user_id, expires_at) values ($1,$2, now() + interval '30 minutes')`, [sha256(token), u?.id ?? null]);
    if (u) await logSecurity(u.id, 'recovery_started', {}, c.ip);
    // Même réponse pour un compte existant ou non ; aucune méthode n'est révélée
    return { recoveryToken: token, methods: ['passkey', 'code', 'questions', 'assist'] };
  };
  const recoveryPasskeyOptions: Handler = async (c) => {
    const r = await loadRecovery(c.body.recoveryToken);
    const o = await passkeyLoginOptions('recover', r.id_hash);
    return { options: o.options, challengeId: o.challengeId };
  };
  const recoveryPasskeyVerify: Handler = async (c) => {
    const r = await loadRecovery(c.body.recoveryToken);
    await recoveryGuard(r, c);
    const v = await verifyPasskeyLogin(str(c.body.challengeId, 100), c.body.response as AuthenticationResponseJSON, 'recover');
    if (!v || v.recoveryId !== r.id_hash || !r.user_id || v.userId !== r.user_id) return recoveryFail(r, c, 'passkey');
    await addFactor(r.id_hash, 'passkey');
    await logSecurity(r.user_id, 'recovery_factor_ok', { method: 'passkey' }, c.ip);
    return { ok: true };
  };
  const recoveryCode: Handler = async (c) => {
    const r = await loadRecovery(c.body.recoveryToken);
    await recoveryGuard(r, c);
    const code = str(c.body.code, 40);
    if (!r.user_id) {
      dummyWork();
      return recoveryFail(r, c, 'code');
    }
    if (!(await consumeRecoveryCode(r.user_id, code))) return recoveryFail(r, c, 'code');
    await addFactor(r.id_hash, 'code');
    await logSecurity(r.user_id, 'recovery_code_used', { purpose: 'recovery' }, c.ip);
    await notifySecurity(r.user_id, 'Code de récupération utilisé', ['Un de vos codes de récupération vient d’être utilisé dans une procédure de récupération de compte.']);
    return { ok: true };
  };
  /** Les questions ne sont montrées qu'après un premier facteur indépendant (passkey ou code). */
  const recoveryQuestionsList: Handler = async (c) => {
    const r = await loadRecovery(c.body.recoveryToken);
    if (!r.user_id || !(r.factors.includes('passkey') || r.factors.includes('code'))) fail(400, 'Validez d’abord une passkey ou un code de récupération.', 'factor_required');
    return { questions: (await getQuestions(r.user_id!)).map((q) => q.question) };
  };
  const recoveryQuestionsAnswer: Handler = async (c) => {
    const r = await loadRecovery(c.body.recoveryToken);
    if (!r.user_id || !(r.factors.includes('passkey') || r.factors.includes('code'))) fail(400, 'Validez d’abord une passkey ou un code de récupération.', 'factor_required');
    await recoveryGuard(r, c);
    if (!(await verifyAnswers(r.user_id!, c.body.answers))) return recoveryFail(r, c, 'questions');
    await addFactor(r.id_hash, 'questions');
    await logSecurity(r.user_id, 'recovery_factor_ok', { method: 'questions' }, c.ip);
    return { ok: true };
  };
  /** Facteurs suffisants (passkey ou code + questions) : départ vers le nouveau compte Google. */
  const recoveryGoogle: Handler = async (c) => {
    if (!googleConfigured()) fail(503, 'La connexion Google n’est pas disponible.', 'unavailable');
    const r = await loadRecovery(c.body.recoveryToken);
    if (!r.user_id || !recoverySufficient(r.factors)) fail(403, 'Validez d’abord les vérifications demandées.', 'factors_missing');
    const g = await startGoogle({ purpose: 'recover', recoveryId: r.id_hash, appChallenge: typeof c.body.appChallenge === 'string' && /^[A-Za-z0-9_-]{43}$/.test(c.body.appChallenge) ? c.body.appChallenge : null });
    return Respond.json({ url: g.url }, [setCookie(OAUTH_COOKIE, g.browser, 600)]);
  };

  // ---------- Assistance de l'administration ----------

  const assistCreate: Handler = async (c) => {
    if (c.ip) await d.rateLimit(`assist:${c.ip}`, 3, 24 * 60);
    const identifier = str(c.body.identifier, 160);
    const reason = str(c.body.reason, 1000);
    const contact = str(c.body.contact, 160);
    if (identifier.length < 3) fail(422, 'Indiquez votre adresse e-mail ou votre nom d’utilisateur.', 'identifier_required');
    if (reason.length < 30) fail(422, 'Expliquez votre situation en quelques phrases (30 caractères minimum).', 'reason_required');
    const u = await findByIdentifier(identifier);
    const token = randomToken(32);
    const id = newId('rr');
    await db().query(`insert into recovery_requests (id, token_hash, user_id, identifier, reason, contact) values ($1,$2,$3,$4,$5,$6)`, [id, sha256(token), u?.id ?? null, identifier, reason, contact || null]);
    if (u) {
      await logSecurity(u.id, 'recovery_requested', {}, c.ip);
      await notifySecurity(u.id, 'Demande de récupération de compte', ['Une demande de récupération de votre compte EVENT509 avec assistance a été déposée. Si ce n’est pas vous, annulez-la depuis la page Sécurité.']);
    }
    // Réponse identique, que le compte existe ou non
    return { requestToken: token, message: 'Votre demande est enregistrée. Conservez ce lien : il permet de suivre son avancement.' };
  };
  const assistStatus: Handler = async (c) => {
    const r = await one<{ status: string; execute_after: Date | null; user_id: string | null }>(`select status, execute_after, user_id from recovery_requests where token_hash = $1`, [sha256(str(c.body.requestToken, 100))]);
    if (!r) fail(404, 'Demande introuvable.', 'not_found');
    const ready = r!.status === 'approved' && !!r!.user_id && !!r!.execute_after && r!.execute_after.getTime() <= Date.now();
    return { status: r!.status === 'blocked' ? 'rejected' : r!.status, executeAfter: r!.status === 'approved' ? r!.execute_after : null, ready };
  };
  /** Demande approuvée et délai de sécurité écoulé : départ vers le nouveau compte Google (aucun administrateur ne change l'identité à la place de l'utilisateur). */
  const assistGoogle: Handler = async (c) => {
    if (!googleConfigured()) fail(503, 'La connexion Google n’est pas disponible.', 'unavailable');
    const r = await one<{ id: string; user_id: string | null; status: string; execute_after: Date | null }>(`select id, user_id, status, execute_after from recovery_requests where token_hash = $1`, [sha256(str(c.body.requestToken, 100))]);
    if (!r || r.status !== 'approved' || !r.user_id || !r.execute_after || r.execute_after.getTime() > Date.now()) fail(403, 'Cette demande n’est pas encore utilisable.', 'not_ready');
    const rid = sha256(randomToken(32));
    await db().query(`insert into recovery_sessions (id_hash, user_id, factors, expires_at, request_id) values ($1,$2,'{admin}', now() + interval '30 minutes', $3)`, [rid, r!.user_id, r!.id]);
    const g = await startGoogle({ purpose: 'recover', recoveryId: rid, appChallenge: typeof c.body.appChallenge === 'string' && /^[A-Za-z0-9_-]{43}$/.test(c.body.appChallenge) ? c.body.appChallenge : null });
    return Respond.json({ url: g.url }, [setCookie(OAUTH_COOKIE, g.browser, 600)]);
  };
  /** Le titulaire du compte peut annuler une demande d'assistance déposée à son nom. */
  const assistCancel: Handler = async (c) => {
    const { user } = needRecent(c);
    const r = await db().query(`update recovery_requests set status = 'cancelled' where id = $1 and user_id = $2 and status in ('pending', 'approved') returning id`, [str(c.params.id, 60), user.id]);
    if (!r.rowCount) fail(404, 'Demande introuvable.');
    await logSecurity(user.id, 'recovery_request_cancelled', {}, c.ip);
    return { ok: true };
  };

  const adminRequests: Handler = async (c) => {
    const a = d.admin(c);
    needRecent(c);
    void a;
    const rows = await all(
      `select r.id, r.status, r.reason, r.contact, r.identifier, r.created_at, r.decided_at, r.execute_after, r.note,
              u.id as user_id, u.email, u.data->>'name' as name, (select count(*) from security_events e where e.user_id = u.id and e.at > now() - interval '7 days') as recent_events,
              (select data->>'name' from users x where x.id = r.decided_by) as decided_by
       from recovery_requests r left join users u on u.id = r.user_id order by (r.status = 'pending') desc, r.created_at desc limit 100`);
    return rows;
  };
  const adminDecide: Handler = async (c) => {
    const a = d.admin(c);
    const { session } = needRecent(c);
    void session;
    const action = str(c.body.action, 10);
    const note = str(c.body.note, 500);
    if (!['approve', 'reject', 'block'].includes(action)) fail(422, 'Décision invalide.');
    if (note.length < 10) fail(422, 'Motivez la décision (10 caractères minimum) : elle est conservée dans le journal.', 'note_required');
    const r = await one<{ id: string; user_id: string | null; status: string }>(`select id, user_id, status from recovery_requests where id = $1`, [str(c.params.id, 60)]);
    if (!r) fail(404, 'Demande introuvable.');
    if (r!.status !== 'pending') fail(409, 'Cette demande a déjà été traitée.', 'already_decided');
    if (r!.user_id === a.id) fail(403, 'Vous ne pouvez pas traiter une demande vous concernant.', 'self_decision');
    if (action === 'approve' && !r!.user_id) fail(409, 'Aucun compte ne correspond à cette demande.', 'no_account');
    const status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'blocked';
    await db().query(
      `update recovery_requests set status = $2, decided_by = $3, decided_at = now(), note = $4, execute_after = case when $2 = 'approved' then now() + ($5 || ' hours')::interval end where id = $1`,
      [r!.id, status, a.id, note, String(RECOVERY_DELAY_HOURS)]);
    await logSecurity(a.id, 'admin_recovery_decision', { action, request: r!.id }, c.ip);
    if (r!.user_id) {
      await logSecurity(r!.user_id, `recovery_${status}`, { delayHours: action === 'approve' ? RECOVERY_DELAY_HOURS : undefined }, c.ip);
      if (action === 'approve') await notifySecurity(r!.user_id, 'Récupération de compte approuvée', [`Une demande de récupération a été approuvée. Elle ne pourra être utilisée que dans ${RECOVERY_DELAY_HOURS} heures. Si ce n’est pas vous, annulez-la depuis la page Sécurité.`]);
    }
    return { ok: true, status, executeAfter: action === 'approve' ? new Date(Date.now() + RECOVERY_DELAY_HOURS * 3_600_000) : null };
  };

  void wantsJson;
  void normalizePhone;
  void (null as unknown as SessionRow);

  return [
    ['GET', '/auth/config', config],
    ['GET', '/auth/google/start', googleStartRoute],
    ['GET', '/auth/google/callback', googleCallback],
    ['GET', '/auth/app/exchange', appExchange],
    ['GET', '/auth/app/ready', appReady],
    ['POST', '/auth/app/google', appGoogleStart],
    ['POST', '/auth/google/app-token', appGoogleToken],
    ['GET', '/auth/signup/pending', signupPending],
    ['POST', '/auth/signup/complete', signupComplete],
    ['POST', '/auth/profile/complete', profileComplete],
    ['GET', '/auth/sessions', sessionsList],
    ['DELETE', '/auth/sessions/:id', sessionRevoke],
    ['POST', '/auth/sessions/revoke-others', sessionsRevokeOthers],
    ['POST', '/auth/logout', logout],
    ['POST', '/auth/reauth/passkey/options', reauthPasskeyOptions],
    ['POST', '/auth/reauth/passkey/verify', reauthPasskeyVerify],
    ['POST', '/auth/reauth/recovery-code', reauthCode],
    ['POST', '/auth/passkeys/register/options', passkeyRegOptions],
    ['POST', '/auth/passkeys/register/verify', passkeyRegVerify],
    ['DELETE', '/auth/passkeys/:id', passkeyDelete],
    ['POST', '/auth/passkeys/login/options', passkeyLoginOpts],
    ['POST', '/auth/passkeys/login/verify', passkeyLoginVerify],
    ['POST', '/auth/security/questions', questionsReplace],
    ['POST', '/auth/security/recovery-codes', codesGenerate],
    ['POST', '/auth/security/recovery-codes/revoke', codesRevoke],
    ['GET', '/auth/google/link/pending', linkPending],
    ['POST', '/auth/google/link/confirm', linkConfirm],
    ['POST', '/auth/google/link/undo', linkUndo],
    ['GET', '/auth/security', security],
    ['POST', '/auth/recovery/start', recoveryStart],
    ['POST', '/auth/recovery/passkey/options', recoveryPasskeyOptions],
    ['POST', '/auth/recovery/passkey/verify', recoveryPasskeyVerify],
    ['POST', '/auth/recovery/code', recoveryCode],
    ['POST', '/auth/recovery/questions/list', recoveryQuestionsList],
    ['POST', '/auth/recovery/questions/answer', recoveryQuestionsAnswer],
    ['POST', '/auth/recovery/google', recoveryGoogle],
    ['POST', '/auth/recovery/assist', assistCreate],
    ['POST', '/auth/recovery/assist/status', assistStatus],
    ['POST', '/auth/recovery/assist/google', assistGoogle],
    ['POST', '/auth/security/recovery-requests/:id/cancel', assistCancel],
    ['GET', '/admin/recovery-requests', adminRequests],
    ['POST', '/admin/recovery-requests/:id/decide', adminDecide],
  ] as [string, string, Handler][];
}
