// Pixels de suivi (Facebook Pixel / Google Analytics).
// Les identifiants sont configurés par l'organisateur (Paramètres > Pixels de suivi).
// En production, les scripts fbq/gtag seront injectés sur la page événement ; ici on
// appelle les fonctions si elles existent et on journalise pour la démonstration.

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
  }
}

const gaNames: Record<string, string> = {
  ViewContent: 'view_item',
  InitiateCheckout: 'begin_checkout',
  Purchase: 'purchase',
  AddToWishlist: 'add_to_wishlist',
};

export function trackPixel(name: string, params: Record<string, unknown> = {}) {
  window.fbq?.('track', name, params);
  window.gtag?.('event', gaNames[name] ?? name, params);
  if (import.meta.env.DEV) console.info('[pixel]', name, params);
}
