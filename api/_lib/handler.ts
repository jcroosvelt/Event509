import { readSession } from './auth.js';
import { Respond } from './respond.js';
import { loadSession, parseCookies, readCookie, SESSION_COOKIE, clearCookie, type SessionRow } from './session.js';
import { siteUrl } from './mail.js';
import { securityLog } from './seclog.js';
import { one } from './db.js';
import { Binary, HttpError, refreshRate, routes, type Ctx, type UserRow } from './routes.js';

export interface ApiRequest {
  method: string;
  path: string; // ex. « /events/e1 »
  query: Record<string, string>;
  body: unknown;
  authorization?: string;
  /** Pays et ville de la connexion, fournis par l'hébergeur (jamais enregistrés). */
  geo?: { country?: string; city?: string };
  /** Adresse IP de la connexion (limite de fréquence ; jamais gardée). */
  ip?: string;
  /** En-tête Cookie brut (session serveur). */
  cookie?: string;
  /** En-têtes nécessaires à la protection CSRF et à la description de l'appareil. */
  csrf?: string;
  origin?: string;
  host?: string;
  userAgent?: string;
}
export interface ApiResponse {
  status: number;
  body: unknown;
  /** En-têtes à ajouter (Set-Cookie, Location). */
  headers?: Record<string, string | string[]>;
}

const compiled = routes.map(([method, pattern, handler]) => {
  const keys: string[] = [];
  const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k: string) => (keys.push(k), '([^/]+)'))}/?$`);
  return { method, re, keys, handler, pattern };
});

/**
 * Limite « douce » des lectures publiques les plus coûteuses (copie complète du catalogue, fiches, aperçus, revente) : compteur en
 * mémoire par adresse IP et par instance, sans aucun coût pour la base. Elle freine un robot qui aspire le site ; une limite
 * répartie entre toutes les instances se règle dans le pare-feu de Vercel (voir SECURITY_AUDIT).
 */
const SOFT_LIMITS: Record<string, number> = { '/bootstrap': 120, '/events/:id': 240, '/events/:id/reviews': 120, '/share': 240, '/resale': 120, '/geo': 120, '/legal': 120 };
const softHits = new Map<string, { n: number; until: number }>();
function softAllow(key: string, max: number) {
  const now = Date.now();
  if (softHits.size > 5000) for (const [k, v] of softHits) if (v.until < now) softHits.delete(k);
  const h = softHits.get(key);
  if (!h || h.until < now) { softHits.set(key, { n: 1, until: now + 60_000 }); return true; }
  return ++h.n <= max;
}

/** Renseigné pendant le traitement pour le journal de sécurité (route sous forme de modèle, jamais l'adresse réelle avec ses identifiants). */
interface Meta { route?: string; userId?: string }

/**
 * Point d'entrée unique de l'API, indépendant de l'hébergeur. Chaque refus d'accès (401/403) et chaque limite de débit atteinte (429)
 * est journalisé de façon structurée (route modèle, statut, IP masquée, compte), sans aucune donnée sensible.
 */
export async function handle(req: ApiRequest): Promise<ApiResponse> {
  const meta: Meta = {};
  const out = await handleInner(req, meta);
  if (out.status === 401 || out.status === 403 || out.status === 429)
    securityLog(out.status === 429 ? 'rate_limited' : 'access_denied', { ip: req.ip, userId: meta.userId, route: `${req.method} ${meta.route ?? 'inconnue'}`, status: out.status });
  return out;
}

async function handleInner(req: ApiRequest, meta: Meta): Promise<ApiResponse> {
  try {
    // Taux de change réglé par l'administrateur (la panne de base est gérée plus loin, route par route)
    await refreshRate().catch(() => {});
    let pathMatched = false;
    for (const r of compiled) {
      const m = r.re.exec(req.path);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== req.method) continue;
      meta.route = r.pattern;
      if (req.ip && SOFT_LIMITS[r.pattern] && !softAllow(`${r.pattern}|${req.ip}`, SOFT_LIMITS[r.pattern]!)) return { status: 429, body: { message: 'Trop de requêtes. Réessayez dans un instant.' } };
      let params: Record<string, string>;
      try {
        params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1]!)]));
      } catch {
        return { status: 400, body: { message: 'Adresse invalide' } };
      }
      const sess = readSession(req.authorization?.replace(/^Bearer\s+/i, ''));
      let user = sess ? await one<UserRow>(`select * from users where id = $1`, [sess.sub]) : null;
      // Session ouverte avant le dernier changement de mot de passe : elle est fermée
      if (user && sess && user.sessions_valid_from && sess.iat < Math.floor(new Date(user.sessions_valid_from).getTime() / 1000)) user = null;
      // Session serveur (cookie HttpOnly) : révocable, avec protection CSRF pour toute opération qui modifie des données
      const cookies = parseCookies(req.cookie);
      const cookieToken = readCookie(cookies, SESSION_COOKIE);
      let session: SessionRow | null = null;
      if (!user && cookieToken) {
        session = await loadSession(cookieToken);
        if (session) {
          user = await one<UserRow>(`select * from users where id = $1`, [session.user_id]);
          if (user?.status === 'suspended') user = null;
          const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
          if (user && unsafe) {
            // Un site tiers ne peut pas envoyer cet en-tête personnalisé ; l'origine, si elle est donnée, doit être celle du site
            const site = (() => { try { return new URL(siteUrl() || `https://${req.host ?? ''}`).origin; } catch { return ''; } })();
            const originOk = !req.origin || req.origin === site || req.origin === `https://${req.host}` || req.origin === `http://${req.host}`;
            if (req.csrf !== '1' || !originOk) return { status: 403, body: { message: 'Requête refusée (protection CSRF)', code: 'csrf' } };
          }
          // Profil à compléter : seules les routes d'authentification restent accessibles
          if (user && session.limited && !req.path.startsWith('/auth/')) return { status: 403, body: { message: 'Complétez votre profil pour continuer.', code: 'profile_incomplete' } };
        }
      }
      // Jeton présent mais invalide ou compte supprimé : la session est terminée
      if ((req.authorization || cookieToken) && !user && !req.path.startsWith('/auth/') && !req.path.startsWith('/cron/') && !req.path.startsWith('/app/') && !req.path.startsWith('/v1/'))
        return { status: 401, body: { message: 'Session expirée, reconnectez-vous' }, ...(cookieToken ? { headers: { 'Set-Cookie': clearCookie(SESSION_COOKIE) } } : {}) };
      meta.userId = user?.id;
      const ctx: Ctx = { user, session, cookies, userAgent: req.userAgent, method: req.method, path: req.path, authorization: req.authorization, geo: req.geo, ip: req.ip, params, query: req.query, body: (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown> };
      const out = await r.handler(ctx);
      if (out instanceof Respond) return { status: out.status, body: out.body, headers: out.headers };
      if (out === null || out === undefined) return { status: 204, body: null };
      if (out instanceof Binary) return { status: 200, body: out };
      // Seul le diagnostic de /health est renvoyé en 503 quand le serveur est en panne ; ailleurs « ok: false »
      // est une réponse normale (ex. billet refusé au contrôle d'entrée)
      const down = req.path === '/health' && typeof out === 'object' && (out as { ok?: unknown }).ok === false;
      return { status: down ? 503 : 200, body: out };
    }
    return pathMatched ? { status: 405, body: { message: 'Méthode non autorisée' } } : { status: 404, body: { message: 'Route inconnue' } };
  } catch (e) {
    if (e instanceof HttpError) return { status: e.status, body: { message: e.message, ...(e.code ? { code: e.code } : {}) } };
    const ref = Math.random().toString(36).slice(2, 8).toUpperCase();
    console.error(`[api ${ref}]`, e);
    return { status: 500, body: { message: 'Erreur du serveur', ref } };
  }
}
