import { defineConfig, devices } from '@playwright/test';

/**
 * Tests de bout en bout sur la version de production (build + vite preview),
 * pour couvrir aussi le service worker et le mode hors ligne.
 *   npm run build && npm run test:e2e
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 45_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    locale: 'fr-FR',
    timezoneId: 'America/Port-au-Prince',
    trace: 'off',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
});
