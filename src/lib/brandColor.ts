import type { CSSProperties } from 'react';

/**
 * Couleur de marque d'un organisateur vérifié. Les couleurs du site sont des variables CSS (« r g b ») : la page de
 * l'organisateur les remplace localement. Une couleur trop claire est refusée, pour que le texte blanc des boutons
 * reste lisible (contraste d'au moins 4,5 : 1, norme WCAG AA).
 */
export const HEX = /^#[0-9a-fA-F]{6}$/;

const channels = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const lin = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: [number, number, number]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

/** Contraste de la couleur avec du blanc (1 à 21). */
export function contrastWithWhite(hex: string) {
  return 1.05 / (luminance(channels(hex)) + 0.05);
}

export const readableBrand = (hex: string) => HEX.test(hex) && contrastWithWhite(hex) >= 4.5;

const mix = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] =>
  [0, 1, 2].map((i) => Math.round(a[i]! * (1 - t) + b[i]! * t)) as [number, number, number];
const triplet = (c: [number, number, number]) => c.join(' ');

/** Variables CSS à poser sur le conteneur de la page (vide si la couleur n'est pas valable). */
export function brandVars(hex: string | undefined, dark: boolean): CSSProperties | undefined {
  if (!hex || !readableBrand(hex)) return undefined;
  const base = channels(hex);
  const white: [number, number, number] = [255, 255, 255];
  const black: [number, number, number] = [11, 21, 51];
  const vars: Record<string, string> = {
    '--brand': triplet(base),
    '--brand-dark': triplet(mix(base, black, 0.25)),
    // Texte de couleur de marque : la couleur elle-même sur fond clair, une version éclaircie sur fond sombre
    '--brand-ink': triplet(dark ? mix(base, white, 0.55) : base),
    '--brand-50': triplet(dark ? mix(base, [15, 20, 38], 0.85) : mix(base, white, 0.93)),
    '--brand-100': triplet(dark ? mix(base, [15, 20, 38], 0.75) : mix(base, white, 0.86)),
    '--brand-200': triplet(dark ? mix(base, [15, 20, 38], 0.6) : mix(base, white, 0.72)),
  };
  return vars as CSSProperties;
}
