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
export interface SeoOptions {
  description?: string;
  /** Chemin canonique (« /e/mon-evenement ») ; par défaut, la page courante sans paramètres. */
  path?: string;
  image?: string;
  /** Page à ne pas indexer (compte, paiement, connexion, résultats filtrés…). */
  noindex?: boolean;
}

/** Pose une balise de l'en-tête et renvoie de quoi la remettre comme avant. */
function setHead(selector: string, make: () => HTMLElement, attr: string, value: string) {
  let el = document.head.querySelector<HTMLElement>(selector);
  const created = !el;
  if (!el) {
    el = make();
    document.head.appendChild(el);
  }
  const prev = el.getAttribute(attr);
  el.setAttribute(attr, value);
  return () => {
    if (created) el!.remove();
    else if (prev === null) el!.removeAttribute(attr);
    else el!.setAttribute(attr, prev);
  };
}
const meta = (key: 'name' | 'property', name: string, value: string) =>
  setHead(`meta[${key}="${name}"]`, () => { const m = document.createElement('meta'); m.setAttribute(key, name); return m; }, 'content', value);

/**
 * Titre de la page et, au besoin, ses balises de référencement (description, adresse canonique, Open Graph, X, « noindex »).
 * Les robots de partage et les moteurs de recherche reçoivent de toute façon la page préparée par le serveur (api/_lib/seo.ts) ;
 * ceci couvre les visiteurs et les moteurs qui exécutent le JavaScript.
 */
export function useTitle(title?: string, seo?: SeoOptions) {
  const description = seo?.description;
  const path = seo?.path;
  const image = seo?.image;
  const noindex = seo?.noindex;
  useEffect(() => {
    if (!title) return;
    const prev = document.title;
    const full = `${title} · Event509`;
    document.title = full;
    const undo: (() => void)[] = [];
    if (description || path || image || noindex) {
      const url = `${window.location.origin}${path ?? window.location.pathname.replace(/(.)\/+$/, '$1')}`;
      undo.push(setHead('link[rel="canonical"]', () => { const l = document.createElement('link'); l.setAttribute('rel', 'canonical'); return l; }, 'href', url));
      undo.push(meta('property', 'og:title', title), meta('name', 'twitter:title', title), meta('property', 'og:url', url));
      if (description) undo.push(meta('name', 'description', description), meta('property', 'og:description', description), meta('name', 'twitter:description', description));
      if (image) undo.push(meta('property', 'og:image', image), meta('name', 'twitter:image', image));
      undo.push(meta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow'));
    }
    return () => {
      document.title = prev;
      undo.reverse().forEach((u) => u());
    };
  }, [title, description, path, image, noindex]);
}

/** Pages privées ou sans valeur pour un moteur de recherche (tableaux de bord, compte) : jamais indexées. */
export function useNoIndex() {
  useEffect(() => meta('name', 'robots', 'noindex, nofollow'), []);
}
