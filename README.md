# Event509

> Discover events. Get your pass. Show up.

Plateforme web de billetterie et de gestion d'événements : interface React et serveur (fonction Vercel + Postgres Neon). Sans base configurée, le site tourne sur des données de démonstration.

## Démarrer

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # TypeScript + build + pages d'aperçu de partage (dist/)
npm run preview      # sert dist/ (PWA et hors ligne actifs)
```

Node 18 ou plus récent.

### Comptes de démonstration

Sur `/connexion`, ouvrez **Comptes de démonstration** pour vous connecter avec un rôle :

| Compte | Accès |
| --- | --- |
| Participant | Billets, favoris, commandes, revente |
| Organisateur (admin) | Tout l'espace organisateur |
| Staff d'entrée | Uniquement le check-in |
| Comptable | Tableau de bord, participants, remboursements, versements |
| Admin plateforme | Espace organisateur + administration |

Codes promo de démo : `KOMPA10`, `NOEL2026`, `ETUDIANT`. Les dates de démo se décalent automatiquement pour rester « à venir ».

## Qualité

```bash
npm run typecheck    # TypeScript strict (interface et serveur)
npm run lint         # ESLint : TypeScript, React Hooks, accessibilité (jsx-a11y)
npm run i18n:check   # chaque phrase de l'interface a sa traduction anglaise
npm test             # 40 tests unitaires (Vitest)
npm run build && npm run test:e2e   # 43 tests Playwright, ordinateur et mobile
```

Les tests de bout en bout couvrent :
- l'achat avec places numérotées et code promo, et les redirections selon le rôle ;
- le check-in hors ligne et la création d'événement ;
- l'interface en anglais, les billets consultables hors ligne (service worker) et les aperçus de partage ;
- un audit **axe-core WCAG 2.1 AA** sur 25 pages en thème clair et sombre, avec zéro violation sérieuse acceptée ;
- l'absence de débordement horizontal à 375 px.

## Stack

React 18 · TypeScript · Vite · Tailwind CSS (thème clair/sombre par variables CSS) · React Router · vite-plugin-pwa (Workbox) · lucide-react · qrcode.react · jsQR · Plus Jakarta Sans.

## Fonctionnalités

| Espace | Pages |
| --- | --- |
| **Participants** | accueil, recherche et filtres, page événement (choix de session ou de date), paiement (plan de salle par zones, code promo, HTG/USD, MonCash/NatCash/carte/PayPal/virement), confirmation, portefeuille QR (code dynamique, image du billet, transfert, revente), revente entre participants, favoris, notifications, commandes (facture, remboursement), paramètres (langue, devise, thème, mot de passe, suppression), page publique d'organisateur, programme ambassadeur, CGU, confidentialité |
| **Organisateurs** | tableau de bord temps réel, événements (création en 5 étapes, éditeur de plan de salle, multi-sessions, récurrence, pixels), statistiques par événement, participants (export CSV/Excel, message), check-in QR (caméra, saisie, hors ligne avec synchronisation), codes promo, remboursements (politique), versements (solde calculé, demande), campagnes email/SMS/WhatsApp (programmation), emails automatiques, ambassadeurs, équipe et rôles, paramètres (profil public, vérification, pixels) |
| **Administration** | tableau de bord (commissions encaissées, objectifs avec progression, ventes et remboursements sur 6 mois, santé financière, file « À traiter », transactions récentes), modération et signalements, utilisateurs et fiche détaillée, vérification des organisateurs (documents), transactions (filtres, CSV), validation des versements, litiges (échanges, décision, remboursement), commissions, journal d'activité |

**Langues** : français (par défaut) et anglais. La phrase française sert de clé ; les traductions sont dans `src/locales/en.json`. Pour ajouter une phrase, utilisez `t('Texte français')` dans le code, puis complétez `en.json`. `npm run i18n:check` liste ce qui manque.

**Frais de service** : `src/lib/fees.ts` calcule la commission (taux par défaut ou négocié, frais fixes par billet, frais payés par l'acheteur ou déduits de l'organisateur, gratuité). Le paiement, les soldes des organisateurs et l'administration utilisent ce même calcul.

**Hors ligne** : l'application est installable (PWA). L'interface est mise en cache, et les billets restent consultables sans réseau. Le check-in valide les entrées sur une liste téléchargée, puis les synchronise au retour du réseau.

## Backend (Neon + Vercel)

Le serveur est dans **`api/`** : une seule fonction Vercel (`api/index.ts`) qui sert toutes les routes `/api/*`, avec une base **Postgres Neon**.

| Fichier | Rôle |
| --- | --- |
| `db/schema.sql` | tables (idempotent) |
| `api/_lib/routes.ts` | les routes : catalogue, comptes, commandes, billets, revente, espace organisateur, administration |
| `api/_lib/auth.ts` | mots de passe (scrypt) et jetons de session signés (HS256, 30 jours) |
| `api/_lib/db.ts` | connexion Postgres |
| `scripts/db-setup.mjs` | crée le schéma et charge le contenu de départ |

**Mise en ligne sur Vercel** : définissez `DATABASE_URL`, `JWT_SECRET` et `VITE_API_URL=/api` (voir `.env.example`), puis redéployez. Au build, le schéma est mis à jour, et la base est remplie avec le contenu de départ si elle ne contient aucun événement. Sans ces variables, le site reste en mode démo.

**Ce que le serveur garantit** : les prix, réductions et frais sont recalculés côté serveur ; les quotas sont respectés même avec des achats simultanés ; une place numérotée ne peut être vendue qu'une fois ; un billet n'est validé qu'une fois au check-in, même avec deux scanners ; chaque route vérifie le rôle (participant, équipe organisateur par rôle, administration) et l'organisation.

**En local** :

```bash
DATABASE_URL=… JWT_SECRET=… npm run db:setup -- --seed   # base de test
DATABASE_URL=… JWT_SECRET=… npm run api:dev              # API sur :8787
VITE_API_URL=/api npm run dev                             # interface, /api redirigé vers :8787
```

Encore à brancher :
- **Paiements** : MonCash, NatCash, carte, PayPal et leurs webhooks. Pour l'instant, une commande est confirmée sans débit réel (sauf le virement, qui reste « en attente »).
- **Envois** : emails (billets, mot de passe oublié), SMS et WhatsApp. La connexion par téléphone et Google n'apparaît qu'en démo.
- **Fichiers** : stockage des images et des documents de vérification.
- **Cartes Wallet** Apple et Google, **taux de change** du jour, **temps réel** (le tableau de bord se rafraîchit toutes les 20 s).
- **Aperçus de partage** : `scripts/prerender-og.mjs` lit encore la démo.

## Structure

```
src/
  components/   kit d'interface accessible (ui/), cartes, billet, plan de salle, garde d'accès, ErrorBoundary
  layouts/      PublicLayout, DashboardLayout (navigation filtrée par permissions)
  pages/        public/ · account/ · organizer/ · admin/
  services/     api.ts — couche d'accès aux données (démo ou appels /api)
  store/        app.tsx — session, langue, devise, thème, billets, file hors ligne, toasts
  lib/          formatage, i18n, formulaires, permissions, exports, image du billet, pixels
  locales/      en.json
  data/         mock.ts — données de démonstration (et cache du catalogue en mode serveur)
api/            fonction Vercel : routes, authentification, accès à la base
db/             schema.sql
scripts/        i18n.mjs, prerender-og.mjs, db-setup.mjs, api-dev.mjs
e2e/            tests Playwright + audit d'accessibilité
```

Les textes de `src/pages/public/Legal.tsx` sont des modèles, à faire valider par un juriste avant la mise en ligne.
