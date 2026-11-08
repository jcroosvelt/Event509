import { useCallback, useEffect, useState } from 'react';

/**
 * Petit hook de chargement asynchrone (remplaçable plus tard par React Query).
 * Par défaut, une erreur de chargement est relancée pendant le rendu pour être
 * affichée par l'ErrorBoundary de la page (avec « Réessayer »).
 * Passez `{ throwOnError: false }` pour la gérer vous-même.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = [], opts: { throwOnError?: boolean } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fn()
      .then((d) => {
        if (alive) {
          setData(d);
          setError(null);
        }
      })
      .catch((e: Error) => {
        if (alive) setError(e);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  if (error && opts.throwOnError !== false) throw error;

  const reload = useCallback(() => setTick((x) => x + 1), []);
  return { data, loading, error, reload, setData };
}

export function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

/** Titre de l'onglet du navigateur. */
export function useTitle(title?: string) {
  useEffect(() => {
    if (!title) return;
    const prev = document.title;
    document.title = `${title} · Event509`;
    return () => {
      document.title = prev;
    };
  }, [title]);
}
