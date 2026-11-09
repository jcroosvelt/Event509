import { readToken } from './auth.js';
import { one } from './db.js';
import { HttpError, routes, type Ctx, type UserRow } from './routes.js';

export interface ApiRequest {
  method: string;
  path: string; // ex. « /events/e1 »
  query: Record<string, string>;
  body: unknown;
  authorization?: string;
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
      if (req.authorization && !user && !req.path.startsWith('/auth/')) return { status: 401, body: { message: 'Session expirée, reconnectez-vous' } };
      const ctx: Ctx = { user, params, query: req.query, body: (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown> };
      const out = await r.handler(ctx);
      return { status: out === null || out === undefined ? 204 : 200, body: out ?? null };
    }
    return pathMatched ? { status: 405, body: { message: 'Méthode non autorisée' } } : { status: 404, body: { message: 'Route inconnue' } };
  } catch (e) {
    if (e instanceof HttpError) return { status: e.status, body: { message: e.message } };
    const ref = Math.random().toString(36).slice(2, 8).toUpperCase();
    console.error(`[api ${ref}]`, e);
    return { status: 500, body: { message: 'Erreur du serveur', ref } };
  }
}
