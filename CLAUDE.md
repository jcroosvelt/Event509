# Consignes pour Claude

- **Langue** : toujours répondre à l'utilisateur en français, quelle que soit la langue des outils, des erreurs ou des captures d'écran.
- **Priorité aux demandes de Joseph** : quand il envoie une demande ou une correction pendant qu'une tâche tourne (compilation, test, déploiement, attente), arrêter immédiatement la tâche en cours, appliquer d'abord sa demande, puis reprendre le reste seulement si c'est encore utile (règle décidée par lui, à garder pour toujours).
- **Déploiement** : chaque modification validée (typecheck, lint, tests) est poussée sur `main`, que Vercel déploie automatiquement. Ne jamais pousser sur `main` un code qui ne passe pas les vérifications.
- **Interface** : français par défaut et anglais (`src/locales/en.json`) ; pas de créole.
- **Suivi** : après chaque modification, mettre à jour `SUIVI.md` (ce qui est fait, en cours, à faire, et une ligne dans le journal), puis le pousser avec le reste.
- **Secrets** : ne jamais demander de mot de passe, de clé ou de chaîne de connexion dans la conversation ; ils se règlent dans Vercel ou Neon.

## Projet

- Frontend React + Vite (`src/`), API Vercel (`api/`), base Postgres Neon (projet `event509`, schéma `db/schema.sql`).
- Vérifications : `npm run typecheck`, `npm run lint`, `npm run i18n:check`, `npm test`, `npm run build && npm run test:e2e`.
- Détails : voir `README.md`.

## Mémoire : décisions de Joseph (à garder pour toujours)

- **Wallets (Apple Wallet / Google Wallet)** : PAS pour le moment. Ne pas les proposer ni les commencer avant qu'il le redemande.
- **WhatsApp** : PAS pour le moment (aucun envoi WhatsApp). Rappels et alertes = notifications de l'application + e-mail.
- **E-mails** : les e-mails (rappels, billets…) restent à brancher APRÈS l'achat du nom de domaine par Joseph. **À lui rappeler** : acheter le domaine, créer le compte Resend, vérifier le domaine d'envoi, ajouter `RESEND_API_KEY` et `MAIL_FROM` dans Vercel. Tant que ce n'est pas fait : notifications seulement.
- **Notes en étoiles** : 5 étoiles, pour les ÉVÉNEMENTS (jamais pour les publications), possibles même avant l'événement.
- **Publications** : seules les organisations publient ; les membres commentent, répondent (comme Facebook), aiment (publications ET commentaires). Pas d'effet de texte dans les commentaires.
- **Stories** : l'organisateur publie à tout moment (avant, pendant, après l'événement).
- **Badge de fidélité** : pour 5 événements, durée de 3 mois renouvelable (jamais à vie), avec des avantages à définir.
- **Contrôle d'entrée sans connexion** : à expliquer à Joseph (fonctionnement et sécurité) avant/après la mise en place.
- **Feuille de route validée** : invitations par billets groupés, rappels automatiques (notifications), stories, badge de fidélité, contrôle d'entrée en équipe sans connexion, rapport après événement, page publique d'événement plus complète, QR dynamique, détection de fraude à la carte, parrainage récompensé, calendrier à ajouter, PWA pour iPhone, tarifs dégressifs (paliers de prix par date ou nombre de billets).
- **Menu** : UN SEUL menu du compte (pastilles de couleur), identique partout (site, tableaux de bord, application).
- **Mention** : « Powered by JC Multimedia » → https://jcmultimedia.online.
