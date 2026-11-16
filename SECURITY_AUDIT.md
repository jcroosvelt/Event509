# Audit de sécurité EVENT509 — état initial (avant corrections)

Date : 2026-11-16 · Périmètre : dépôt du site (`jcroosvelt/event509` : front React/Vite, API Vercel `api/`, base Postgres Neon) et, pour la chaîne de distribution, le dépôt de l'application Android (`event509-apk`, lecture seule).
Méthode : lecture du code (201 routes inventoriées par script, handlers critiques lus ligne à ligne), `npm audit`, recherche de secrets dans l'arbre et tout l'historique Git, vérification des en-têtes HTTP du site en ligne (lecture seule), lecture des configurations (`vercel.json`, schéma SQL). **Aucune attaque n'a été menée contre la production** ; seules des requêtes GET publiques ont été faites.

## 1. Architecture découverte
- Front : React 18 + Vite + Tailwind, PWA (service worker), mode démo (sans serveur) et mode serveur (`VITE_API_URL`).
- API : une seule fonction Vercel (`api/index.ts` → `api/_lib/handler.ts`), routeur maison (201 routes), SQL paramétré via `pg`, base Neon (rôle propriétaire, DDL appliqué au build).
- Authentification : Google OIDC + passkeys + sessions cookie (HttpOnly) ; anciens comptes e-mail/mot de passe (scrypt) avec JWT HS256 ; OTP WhatsApp.
- Paiement : passerelle externe (MonCash, NatCash, KashPaw, carte) ; la confirmation est relue auprès de la passerelle (le webhook n'est jamais cru).
- Pas de Redis, pas de CI dans le dépôt du site (déploiement Vercel sur push `main`).

## 2. Contrôles déjà solides (vérifiés dans le code)
SQL toujours paramétré (les 6 interpolations restantes ne portent que sur des constantes du code) ; commandes protégées par clé d'accès de 144 bits ; entrée en salle atomique et limitée à l'organisation ; billets liés au compte par la commande ; téléversements contrôlés par signature (JPEG/PNG/WebP/PDF), 3 Mo max, documents d'identité privés avec journal d'accès ; webhook de paiement non fiable → re-vérification auprès de la passerelle, idempotente (`for update`) ; prix, remises, quotas et places calculés côté serveur, verrou sur l'événement ; webhooks sortants signés (HMAC) avec contrôle SSRF ; secrets : aucun dans l'arbre ni dans l'historique (seul un exemple factice dans `.env.example`) ; HSTS actif ; cookies de session HttpOnly/Secure/SameSite.

## 3. Inventaire des vulnérabilités

| # | Sévérité | Titre | Fichiers |
|---|---|---|---|
| C1 | **CRITIQUE** | Achat d'un billet en revente **sans aucun paiement** : la commande est créée « payée » et le billet transféré | `api/_lib/routes.ts` (`buyResale`) |
| C2 | **CRITIQUE** | Moyen « paypal » : accepté à la création de commande mais jamais relié à un paiement ; la commande était validée « payée » sans encaissement (même en production avec passerelle) | `api/_lib/routes.ts` (`createOrder`) |
| H1 | **HAUTE** | XSS stocké : le site web de l'organisateur et l'adresse « en ligne » d'un événement sont rendus dans `href` sans contrôle de schéma (`javascript:`) | `api/_lib/routes.ts` (`saveOrganizer`, `saveEvent`), `src/pages/public/OrganizerPage.tsx`, `src/pages/account/TicketDetail.tsx` |
| H2 | **HAUTE** | Contournement de la modération : `POST /org/events/:id/status` publie directement un événement (organisateur non vérifié, événement refusé par l'admin) ; `status` accepté tel quel dans `saveEvent` | `api/_lib/routes.ts` (`setEventStatus`, `saveEvent`) |
| H3 | **HAUTE** | Dépendances de production vulnérables : `react-router`/`@remix-run/router` (redirections ouvertes, XSS via redirections — 4 avis), `@simplewebauthn/server` (avis d'attestation) | `package.json` |
| H4 | **HAUTE** | Aucun en-tête de sécurité applicatif : pas de CSP, pas de protection anti-clickjacking, pas de Referrer-Policy / Permissions-Policy / nosniff sur les pages | `vercel.json` |
| H5 | **HAUTE** | Un changement ou une réinitialisation de mot de passe par OTP **ne ferme pas les sessions par cookie** ; la déconnexion ne révoque pas un ancien jeton JWT | `api/_lib/otp.ts`, `api/_lib/authflows.ts`, `api/_lib/routes.ts` |
| M1 | MOYENNE | Paiement « ouvert par défaut » : sans `PAY_CLIENT_ID`, toute commande payante (hors virement) est validée sans paiement. Production actuellement configurée (`onlinePayment: true`), mais une mauvaise configuration vendrait gratuitement | `api/_lib/routes.ts` (`createOrder`) |
| M2 | MOYENNE | Absence de limitation de débit : création de commandes (retenue de stock), validation de codes promo (énumération), signalements, clics, désinscriptions, webhook de paiement (amplification d'appels sortants), connexion par compte (seulement par IP), changement de mot de passe (essais du mot de passe actuel) | `api/_lib/routes.ts`, `marketing.ts` |
| M3 | MOYENNE | `saveEvent` : prix négatif/non numérique, quotas, longueurs, statut libre, URL « en ligne » non validées (écrit tel quel après `...e`) | `api/_lib/routes.ts` |
| M4 | MOYENNE | SSRF des webhooks : adresse vérifiée puis résolue une seconde fois (DNS rebinding) ; plages non couvertes (198.18/15, 192.0.0/24, multicast, IPv4 mappée en IPv6 hexadécimale…) | `api/_lib/devapi.ts` |
| M5 | MOYENNE | Suppression de compte sans confirmation d'identité récente (session cookie volée = compte supprimé) | `api/_lib/routes.ts` (`deleteMe`) |
| M6 | MOYENNE | Plusieurs demandes de remboursement simultanées pour une même commande (doublons) | `api/_lib/routes.ts` (`requestRefund`) |
| M7 | MOYENNE | Un seul rôle de base de données, propriétaire (DDL + DML) ; pas de RLS (tout passe par l'API). Un défaut d'API = tous les droits sur la base | configuration Neon / `scripts/db-setup.mjs` |
| M8 | MOYENNE | Code promo créé sans identifiant dans les données : le compteur d'utilisations ne s'incrémentait pas (limite d'usage contournable). Trouvé par le test de concurrence | `api/_lib/routes.ts` (`savePromo`) |
| M9 | MOYENNE | Sauvegardes de la base : rétention Neon de 6 h seulement, aucun instantané (snapshot) ; restauration impossible au-delà | Neon (configuration, hors code) |
| L1 | BASSE | Connexion par mot de passe : temps de réponse différent si le compte n'existe pas (énumération par chronométrage) | `api/_lib/routes.ts` (`login`) |
| L2 | BASSE | Facture : identifiant de commande non échappé dans le HTML ; scripts en ligne dans les fenêtres d'impression (incompatibles avec une CSP) | `src/pages/account/Orders.tsx`, `src/lib/printReport.ts`, `src/pages/organizer/Subscription.tsx` |
| L3 | BASSE | Visuels d'événement : n'importe quelle adresse https externe (traçage des visiteurs) | `api/_lib/files.ts` (`validCover`) |
| L4 | BASSE | Code ambassadeur non contrôlé : n'importe qui gonfle les statistiques d'un ambassadeur | `api/_lib/routes.ts` (`createOrder`) |
| L5 | BASSE | Commandes « virement » en attente sans expiration : retenue de places | `api/_lib/routes.ts` |
| L6 | BASSE | Dépendances de développement vulnérables (vitest/vite/esbuild/@vercel/node : 24 avis, hors production) | `package.json` |
| L7 | BASSE | Un jeton de session ancien (JWT) est écrit dans `localStorage` après un changement de mot de passe par OTP | `src/pages/account/Settings.tsx` |
| I1 | INFO | Application Android : clé de signature `debug.keystore` (mot de passe « android ») versionnée dans un dépôt privé ; actions GitHub référencées par étiquette (non épinglées par empreinte) | dépôt `event509-apk` |
| I2 | INFO | Pas de CI/Dependabot/CodeQL dans le dépôt du site | — |
| I3 | INFO | `X-Forwarded-For` utilisé pour les limites : fiable seulement derrière Vercel (qui l'écrase) | `api/index.ts` |

## 4. Récapitulatif initial
**22 constats** : 1 critique, 5 hautes, 7 moyennes, 7 basses, 3 informatifs.

Les limites de cet audit : revue manuelle de ~200 routes (les handlers à fort enjeu ont été lus intégralement, les autres par échantillonnage et par un test automatique d'accès anonyme à ajouter) ; aucun test d'intrusion actif en production ; `gitleaks`, `semgrep`, `osv-scanner` et CodeQL ne sont pas installés dans cet environnement (recherche de secrets faite par expressions régulières sur l'arbre et l'historique).
