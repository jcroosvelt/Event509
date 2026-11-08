import type { Lang } from '@/types';
import { en } from '@/locales/en';

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
  if (lang === 'en') {
    const hit = en[source];
    if (hit !== undefined) s = hit;
    else if (import.meta.env.DEV && !warned.has(source)) {
      warned.add(source);
      console.warn('[i18n] traduction manquante :', source);
    }
  }
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
  return s;
}

export const languages: { id: Lang; label: string; short: string }[] = [
  { id: 'fr', label: 'Français', short: 'FR' },
  { id: 'en', label: 'English', short: 'EN' },
];
