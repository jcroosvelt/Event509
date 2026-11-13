import { readToken } from './auth.js';
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
}
export interface ApiResponse {
  status: number;
  body: unknown;
}

const compiled = routes.map(([method, pattern, handler]) => {
  const keys: string[] = [];
  const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k: string) => (keys.push(k), '([^/]+)'))}/?$`);
  return { method, re, keys, handler };
});

/** Point d'entrée unique de l'API, indépendant de l'hébergeur. */
export async function handle(req: ApiRequest): Promise<ApiResponse> {
  try {
    // Taux de change réglé par l'administrateur (la panne de base est gérée plus loin, route par route)
    await refreshRate().catch(() => {});
    let pathMatched = false;
    for (const r of compiled) {
      const m = r.re.exec(req.path);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== req.method) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1]!)]));
      const userId = readToken(req.authorization?.replace(/^Bearer\s+/i, ''));
      const user = userId ? await one<UserRow>(`select * from users where id = $1`, [userId]) : null;
      // Jeton présent mais invalide ou compte supprimé : la session est terminée
      if (req.authorization && !user && !req.path.startsWith('/auth/') && !req.path.startsWith('/cron/') && !req.path.startsWith('/app/') && !req.path.startsWith('/v1/')) return { status: 401, body: { message: 'Session expirée, reconnectez-vous' } };
      const ctx: Ctx = { user, method: req.method, path: req.path, authorization: req.authorization, geo: req.geo, params, query: req.query, body: (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown> };
      const out = await r.handler(ctx);
      if (out === null || out === undefined) return { status: 204, body: null };
      if (out instanceof Binary) return { status: 200, body: out };
      // Seul le diagnostic de /health est renvoyé en 503 quand le serveur est en panne ; ailleurs « ok: false »
      // est une réponse normale (ex. billet refusé au contrôle d'entrée)
      const down = req.path === '/health' && typeof out === 'object' && (out as { ok?: unknown }).ok === false;
      return { status: down ? 503 : 200, body: out };
    }
    return pathMatched ? { status: 405, body: { message: 'Méthode non autorisée' } } : { status: 404, body: { message: 'Route inconnue' } };
  } catch (e) {
    if (e instanceof HttpError) return { status: e.status, body: { message: e.message } };
    const ref = Math.random().toString(36).slice(2, 8).toUpperCase();
    console.error(`[api ${ref}]`, e);
    return { status: 500, body: { message: 'Erreur du serveur', ref } };
  }
}
