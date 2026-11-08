/** Erreur réseau ou serveur levée par la couche API. `ref` sert au support. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public ref = Math.random().toString(36).slice(2, 10).toUpperCase(),
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
