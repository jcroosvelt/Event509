/** Réponse HTTP complète (statut, en-têtes, cookies, redirection) : le routeur la transmet telle quelle. */
export class Respond {
  constructor(public status: number, public headers: Record<string, string | string[]> = {}, public body: unknown = null) {}
  static redirect(location: string, cookies: string[] = []) {
    return new Respond(302, { Location: location, ...(cookies.length ? { 'Set-Cookie': cookies } : {}) });
  }
  static json(body: unknown, cookies: string[] = [], status = 200) {
    return new Respond(status, cookies.length ? { 'Set-Cookie': cookies } : {}, body);
  }
}
