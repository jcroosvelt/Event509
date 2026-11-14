import { defineConfig } from 'vitest/config';

// Tests du serveur (API) : environnement Node. Les tests d'intégration demandent une base Postgres jetable
// (TEST_DATABASE_URL, jamais la vraie base) ; sans elle, seuls les tests unitaires s'exécutent.
export default defineConfig({
  test: { environment: 'node', include: ['api/**/*.test.ts'], testTimeout: 30_000, fileParallelism: false },
});
