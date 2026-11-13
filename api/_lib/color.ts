// Copie serveur de la règle de src/lib/brandColor.ts : une couleur de marque doit garder un contraste d'au moins 4,5 : 1
// avec le texte blanc des boutons.
const lin = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
export const readableBrand = (hex: string) => {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return false;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
  return 1.05 / (0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) + 0.05) >= 4.5;
};
