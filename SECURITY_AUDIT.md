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


---

# Audit de sécurité du 25 novembre 2026 (branche `security-hardening`)

Périmètre : site (`api/`, `src/`, configuration Vercel), base Neon, application Android (`event509-apk`) et chaîne de publication de l'APK. Les fonctions ajoutées depuis l'audit du 16 novembre ont été revues en priorité : événements privés, APK hébergé par la plateforme, mise à jour dans l'application, billet téléchargeable.

**Score de risque : 4/10 avant, 2/10 après.** Les contrôles de fond (SQL paramétré, CSRF, cookies `__Host-` HttpOnly Secure SameSite, CSP, contrôle d'accès testé route par route) étaient déjà solides. Les failles trouvées touchaient surtout les nouveautés, et la plupart sont corrigées et testées. Il reste un rôle de base de données trop puissant (bloqué par l'accès Vercel) et une clé de signature Android stockée dans le dépôt (choix à faire par le propriétaire).

## Failles

| ID | Gravité | Catégorie | Fichier / endpoint | Description | Statut |
|---|---|---|---|---|---|
| A1 | ÉLEVÉE | Intégrité / chaîne de distribution | `api/_lib/apprelease.ts` (`/admin/app/upload/finish`) | L'APK téléversé n'était vérifié que sur son identifiant : un compte administrateur volé pouvait faire distribuer une autre application sous le nom EVENT509 | corrigée |
| A2 | MOYENNE | Contrôle d'accès | `GET /events/:id` | Un événement privé pouvait être lu par son identifiant interne, sans le lien secret | corrigée |
| A3 | MOYENNE | Déni de service / coût | `/app/event509.apk` | Téléchargement public de 28 Mo lu dans la base, sans aucune limite | corrigée |
| A4 | MOYENNE | Déni de service / aspiration | `/bootstrap`, `/events/:id`, `/share`, `/resale`, `/geo`, `/legal`, avis | Lectures publiques sans limite de débit | corrigée (limite par instance) ; limite globale : pare-feu Vercel |
| A5 | MOYENNE | Composants vulnérables | `react-router-dom` 6.30.6 | 2 avis (redirection ouverte via « \\ », désérialisation SSR) | corrigée (7.18.7) |
| A6 | MOYENNE | Configuration base | rôle `neondb_owner` | Le site se connecte avec le rôle propriétaire (DDL, création de rôles, contournement RLS) | à faire (accès Vercel requis) |
| A7 | MOYENNE | Sauvegardes | Neon | Aucun instantané, rétention de 6 h ; les sauvegardes programmées ne sont pas disponibles sur l'offre actuelle | partiellement corrigée (instantané manuel créé) |
| A8 | FAIBLE | Hachage | `api/_lib/auth.ts` | scrypt au coût par défaut (N = 16384) | corrigée (N = 65536, r = 8, p = 2, migration à la connexion) |
| A9 | FAIBLE | Intégrité mise à jour | `lib/native/native_platform.dart` | L'adresse du fichier de mise à jour pouvait viser un autre site (« //hôte ») ; l'empreinte SHA-256 était facultative | corrigée |
| A10 | FAIBLE | Configuration | `api/_lib/session.ts` | `COOKIE_INSECURE=1` aurait retiré « Secure » même en production | corrigée |
| A11 | FAIBLE | Secrets | `.gitignore` | `.env`, clés et certificats n'étaient pas ignorés | corrigée |
| A12 | FAIBLE | Chaîne CI | `build-apk.yml` | Actions GitHub référencées par étiquette mobile ; droit `contents: write` inutile | corrigée (empreintes figées, lecture seule) |
| A13 | FAIBLE | Variables d'environnement | `.env.example` | 9 variables utilisées mais non documentées | corrigée |
| A14 | FAIBLE | Clé client exposée | `android/app/google-services.json` | Clé d'API Firebase « client » dans le dépôt privé (prévue pour être embarquée) ; à restreindre | à faire (Google Cloud) |
| A15 | INFO | Signature Android | `signing/debug.keystore` | Clé de signature de l'APK dans le dépôt, mot de passe par défaut « android » | décision du propriétaire |
| A16 | INFO | Dépendances de développement | vite / esbuild / vercel (outils) | Avis sur les outils de développement, absents du site en ligne | accepté |

## Corrections (problème → correction → preuve)

- **A1** : le serveur lit le certificat dans le bloc de signature v2 de l'APK et le compare à l'empreinte de la clé de l'application (`APP_SIGNER_SHA256` pour changer de clé). Preuve : `api/apprelease.test.ts` (signé, autre clé, non signé) et `S3l` (téléversement refusé, code `bad_signer`).
- **A2** : un événement privé ne s'ouvre que par son adresse secrète, sauf pour son organisation, l'administration et les détenteurs d'un billet. Preuve : `S3j`.
- **A3** : 20 téléchargements complets par heure et par adresse IP ; la reprise d'un téléchargement ne compte pas.
- **A4** : compteur en mémoire par IP et par route (sans coût pour la base), réponse 429 au-delà.
- **A5** : `react-router-dom` 7.18.7 ; `npm audit --omit=dev` : 0 vulnérabilité ; e2e : 88 réussis.
- **A8** : format `scrypt2$N$r$p$sel$hash`, paramètres bornés à la lecture, ancien format re-haché à la première connexion réussie, durée égalisée pour ne pas révéler l'existence d'un compte. Preuve : `api/password.test.ts`, `S3m`.
- **A9** : chemin limité au site lui-même, empreinte obligatoire. Preuve : `test/native_platform_test.dart`.
- **A10 à A13** : voir les fichiers cités ; contrôle automatique ajouté : `.github/workflows/security.yml` (recherche de secrets dans tout l'historique, `npm audit` en production) et `scripts/scan-secrets.sh`.

## Actions restantes de votre côté

1. **Rôle de base limité (A6)** : le connecteur Vercel de la session de travail ne voit pas le projet `event509` (il est rattaché à un autre compte). Reconnectez le connecteur Vercel avec le compte qui héberge le site : la création du rôle `event509_app` (lecture/écriture des données seulement) et le changement de `DATABASE_URL` pourront alors être faits automatiquement. Les migrations utiliseront `DATABASE_URL_OWNER`.
2. **Sauvegardes (A7)** : les instantanés programmés exigent une offre Neon supérieure. En attendant, un instantané « avant-audit-securite-2026-11-25 » est gardé jusqu'au 25 décembre 2026.
3. **Clé Firebase (A14)** : Google Cloud Console > APIs et services > Identifiants > la clé Android : restreindre aux applications Android (`com.event509.event509_app` + empreinte SHA-1 de la clé de signature) et aux API Firebase utilisées.
4. **Clé de signature (A15)** : la garder dans le dépôt privé est un risque (toute personne ayant accès au dépôt peut signer une application EVENT509). La changer oblige chaque utilisateur à désinstaller puis réinstaller l'application : décision à prendre par vous.
5. **Pare-feu Vercel** : ajouter une règle de limite de débit globale sur `/api/*` (tableau de bord Vercel > Firewall).

## Secrets

Aucun secret serveur trouvé dans l'arbre ni dans l'historique des deux dépôts (190 et 70 commits). Seule la clé client Firebase (A14, masquée : `AIza****`) est présente, par conception.

## Recommandations durables

Contrôle automatique des secrets et des dépendances à chaque envoi (`security.yml`), Dependabot (npm, pub, actions GitHub) une fois par semaine, instantané Neon avant chaque changement de schéma, revue de sécurité à chaque nouvelle fonction exposée au public.

## Liste de contrôle (24 points)

- [x] Clés API : aucune clé serveur dans le code ni le bundle client
- [~] Base de données : TLS vérifié, requêtes paramétrées ; rôle limité en attente (A6)
- [x] HTTPS : redirection 308, HSTS 2 ans + preload, cookies Secure
- [x] Hachage des mots de passe : scrypt renforcé, migration transparente
- [x] Validation côté serveur
- [x] XSS : CSP stricte, schémas d'URL filtrés
- [x] Journalisation : refus d'accès, limites, échecs de connexion (sans données sensibles)
- [x] Routes admin : rôle vérifié côté serveur, testées route par route
- [x] Requêtes paramétrées
- [x] Variables d'environnement : documentées, validées à l'usage
- [x] Rate limiting
- [x] CORS : l'API ne renvoie aucun en-tête CORS (même origine seulement)
- [x] En-têtes de sécurité
- [x] Cookies : `__Host-`, HttpOnly, Secure, SameSite=Lax
- [x] CSRF : en-tête obligatoire + contrôle d'origine
- [x] Liens de réinitialisation : jetons aléatoires hachés, expiration courte, usage unique
- [x] Uploads : liste blanche, taille, nom régénéré ; APK : identifiant + signature
- [x] Prix / paiements : recalculés côté serveur, paiement relu auprès de la passerelle
- [x] Mode debug : erreurs génériques avec référence côté client
- [x] Dépendances vulnérables (production)
- [x] Paquets inutilisés : aucun trouvé
- [x] Fichiers exposés : aucun
- [x] Historique git : aucun secret serveur
- [~] Révocation des clés : aucune clé compromise à révoquer ; restriction de la clé Firebase à faire (A14)
