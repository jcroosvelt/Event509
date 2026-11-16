/**
 * Aides de sécurité partagées (contrôles côté serveur, jamais côté navigateur).
 */

/** Production (Vercel ou NODE_ENV) : aucun contournement de paiement n'y est toléré. Démonstration et développement : oui. */
export const isProduction = () => process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';

/** Une commande peut-elle être validée sans paiement vérifié ? Jamais en production (sauf montant nul). */
export const unpaidAllowed = () => !isProduction();

/**
 * Adresse web saisie par un utilisateur et affichée plus tard comme lien : seuls http(s) sont acceptés (jamais « javascript: »,
 * « data: »…), sans identifiants. Sans schéma, https:// est ajouté. Renvoie null si l'adresse est invalide.
 */
export function safeWebUrl(v: unknown, opts: { httpsOnly?: boolean; max?: number } = {}): string | null {
  if (typeof v !== 'string') return null;
  let s = v.trim();
  if (!s || s.length > (opts.max ?? 300) || /[\s<>"'`\p{Cc}]/u.test(s)) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s}`;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && !opts.httpsOnly)) return null;
  if (u.username || u.password || !u.hostname.includes('.')) return null;
  return u.toString();
}

/** Nombre fini borné (sinon null). */
export function boundedNumber(v: unknown, min: number, max: number, integer = false): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return integer ? (Number.isInteger(n) ? n : null) : n;
}
