/**
 * Adresse affichée comme lien : seuls http(s) sont acceptés (jamais « javascript: », « data: »…). Défense en profondeur : le serveur
 * contrôle déjà ces adresses à l'enregistrement, mais des valeurs plus anciennes ou modifiées en base ne doivent jamais devenir un lien actif.
 */
export function safeHref(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  try {
    const u = new URL(v.trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Destination interne reçue dans l'adresse (« ?next=… ») : un chemin du site seulement (jamais une adresse externe, « // », « \\ » ou
 * un caractère de contrôle). Protège contre les redirections ouvertes, y compris celles liées à la barre oblique inverse.
 */
export function safeInternalPath(v: unknown): string | undefined {
  if (typeof v !== 'string' || v.length > 300) return undefined;
  if (!v.startsWith('/') || v.startsWith('//') || v.includes('\\') || v.includes('://') || [...v].some((ch) => ch.charCodeAt(0) < 32)) return undefined;
  return v;
}
