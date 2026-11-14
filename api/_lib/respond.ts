/** Réponse HTTP complète (statut, en-têtes, cookies, redirection) : le routeur la transmet telle quelle. */
export class Respond {
  constructor(public status: number, public headers: Record<string, string | string[]> = {}, public body: unknown = null) {}
  static redirect(location: string, cookies: string[] = []) {
    return new Respond(302, { Location: location, ...(cookies.length ? { 'Set-Cookie': cookies } : {}) });
  }
  /** Page HTML minimale (retour vers l'application Android) : politique de contenu stricte, rien n'est mis en cache. */
  static html(html: string, cookies: string[] = []) {
    return new Respond(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
      'X-Content-Type-Options': 'nosniff',
      ...(cookies.length ? { 'Set-Cookie': cookies } : {}),
    }, html);
  }
  static json(body: unknown, cookies: string[] = [], status = 200) {
    return new Respond(status, cookies.length ? { 'Set-Cookie': cookies } : {}, body);
  }
}
