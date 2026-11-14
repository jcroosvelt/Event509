import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

// Garde-fou : le site de production ne doit jamais tourner en mode démonstration (données fictives).
// Sans VITE_API_URL, l'interface se remplirait de faux événements, faux comptes et fausses commandes.
if (process.env.VERCEL_ENV === 'production' && !process.env.VITE_API_URL) {
  throw new Error('VITE_API_URL manque dans les variables de Vercel : le site de production ne doit jamais afficher de données de démonstration.');
}

export default defineConfig({
  plugins: [
    react(),
    // Cache hors ligne (sans installation PWA) : l'interface, les polices et
    // les images sont mises en cache ; les billets sont déjà stockés sur l'appareil.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'logo-mark.png', 'logo-full.png'],
      // Pas de manifeste web : sans lui, les navigateurs ne proposent pas d'« installer l'application » (PWA).
      // L'application proposée est uniquement l'APK (fenêtre du site, page /telecharger). Le cache hors ligne reste actif.
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: '/index.html',
        // Les pages événement pré-rendues (aperçus de partage) restent servies telles quelles
        // /app/ : l'APK et sa fiche de version se téléchargent tels quels ; /.well-known/ : fichier des liens profonds
        navigateFallbackDenylist: [/^\/api\//, /^\/app\//, /^\/\.well-known\//],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            // Futures réponses de l'API : réseau d'abord, cache en secours hors ligne
            // Seulement le catalogue public : les données de compte ne sont jamais gardées dans le cache
            urlPattern: ({ url }) => url.pathname === '/api/bootstrap' || url.pathname.startsWith('/api/events/'),
            handler: 'NetworkFirst',
            options: { cacheName: 'api', networkTimeoutSeconds: 4, expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 3600 } },
          },
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'images', expiration: { maxEntries: 150, maxAgeSeconds: 30 * 24 * 3600 } },
          },
        ],
      },
    }),
  ],
  // En local, /api est servi par scripts/api-dev.mjs
  server: { proxy: { '/api': 'http://localhost:8787' } },
  preview: { proxy: { '/api': 'http://localhost:8787' } },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});
