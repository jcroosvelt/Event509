# Consignes pour Claude

- **Langue** : toujours répondre à l'utilisateur en français, quelle que soit la langue des outils, des erreurs ou des captures d'écran.
- **Déploiement** : chaque modification validée (typecheck, lint, tests) est poussée sur `main`, que Vercel déploie automatiquement. Ne jamais pousser sur `main` un code qui ne passe pas les vérifications.
- **Interface** : français par défaut et anglais (`src/locales/en.json`) ; pas de créole.
- **Suivi** : après chaque modification, mettre à jour `SUIVI.md` (ce qui est fait, en cours, à faire, et une ligne dans le journal), puis le pousser avec le reste.
- **Secrets** : ne jamais demander de mot de passe, de clé ou de chaîne de connexion dans la conversation ; ils se règlent dans Vercel ou Neon.

## Projet

- Frontend React + Vite (`src/`), API Vercel (`api/`), base Postgres Neon (projet `event509`, schéma `db/schema.sql`).
- Vérifications : `npm run typecheck`, `npm run lint`, `npm run i18n:check`, `npm test`, `npm run build && npm run test:e2e`.
- Détails : voir `README.md`.
