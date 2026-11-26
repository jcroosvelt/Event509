import type { Lang } from '@/types';
import en from '@/locales/en.json';
import es from '@/locales/es.json';

/**
 * Traduction façon gettext : la phrase française sert de clé, l'anglais vient du
 * catalogue `src/locales/en.ts`. Une phrase absente du catalogue reste en
 * français (et un test vérifie que le catalogue est complet).
 *
 * Variables : t('Payer {amount}', { amount: '1 000 HTG' })
 */
export type Vars = Record<string, string | number>;

const warned = new Set<string>();

export function translate(lang: Lang, source: string, vars?: Vars) {
  let s = source;
  if (lang === 'en' || lang === 'es') {
    const hit = ((lang === 'en' ? en : es) as Record<string, string>)[source];
    if (hit !== undefined) s = hit;
    else if (import.meta.env.DEV && !warned.has(source)) {
      warned.add(source);
      console.warn('[i18n] traduction manquante :', source);
    }
  }
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
  return s;
}

/** Langue du navigateur → langue de l'interface (français par défaut). */
export function detectLang(nav: string | undefined): Lang {
  const l = (nav ?? '').toLowerCase();
  return l.startsWith('en') ? 'en' : l.startsWith('es') ? 'es' : 'fr';
}

/** Code de langue pour les dates, nombres et noms de pays (Intl). */
export const intlLocale = (lang: Lang) => (lang === 'en' ? 'en-US' : lang === 'es' ? 'es-419' : 'fr-FR');

export const languages: { id: Lang; label: string; short: string }[] = [
  { id: 'fr', label: 'Français', short: 'FR' },
  { id: 'en', label: 'English', short: 'EN' },
  { id: 'es', label: 'Español', short: 'ES' },
];
