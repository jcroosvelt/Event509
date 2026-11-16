import { maskIp } from './session.js';

/**
 * Journal de sécurité structuré (une ligne JSON par événement, lisible dans les journaux Vercel ou une destination de journaux).
 * Jamais de mot de passe, de code, de jeton, de clé ni de donnée de paiement : seulement le type d'événement, la route (modèle,
 * sans identifiants), un statut, l'adresse IP masquée et l'identifiant interne du compte.
 */
export function securityLog(
  event: string,
  o: { ip?: string; userId?: string | null; route?: string; status?: number; known?: boolean; detail?: Record<string, string | number | boolean> } = {},
) {
  try {
    console.warn(JSON.stringify({ log: 'security', event, at: new Date().toISOString(), ip: maskIp(o.ip) ?? undefined, userId: o.userId ?? undefined, route: o.route, status: o.status, known: o.known, ...(o.detail ? { detail: o.detail } : {}) }));
  } catch {
    /* un journal ne doit jamais faire échouer une requête */
  }
}
