# Event509

> Discover events. Get your pass. Show up.

Plateforme web de billetterie et de gestion d'événements. Ce dépôt contient le **frontend complet**. Il tourne sur des données de démonstration tant qu'aucun backend n'est configuré.

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
npm run typecheck    # TypeScript strict
npm run lint         # ESLint : TypeScript, React Hooks, accessibilité (jsx-a11y)
npm run i18n:check   # chaque phrase de l'interface a sa traduction anglaise
npm test             # 30 tests unitaires (Vitest)
npm run build && npm run test:e2e   # 35 tests Playwright, ordinateur et mobile
```

Les tests de bout en bout couvrent :
- l'achat avec places numérotées et code promo, et les redirections selon le rôle ;
- le check-in hors ligne et la création d'événement ;
- l'interface en anglais, les billets consultables hors ligne (service worker) et les aperçus de partage ;
- un audit **axe-core WCAG 2.1 AA** sur 17 pages en thème clair et sombre, avec zéro violation sérieuse acceptée ;
- l'absence de débordement horizontal à 375 px.

## Stack

React 18 · TypeScript · Vite · Tailwind CSS (thème clair/sombre par variables CSS) · React Router · vite-plugin-pwa (Workbox) · lucide-react · qrcode.react · jsQR · Plus Jakarta Sans.

## Fonctionnalités

| Espace | Pages |
| --- | --- |
| **Participants** | accueil, recherche et filtres, page événement (choix de session ou de date), paiement (plan de salle par zones, code promo, HTG/USD, MonCash/NatCash/carte/PayPal/virement), confirmation, portefeuille QR (code dynamique, image du billet, transfert, revente), revente entre participants, favoris, notifications, commandes (facture, remboursement), paramètres (langue, devise, thème, mot de passe, suppression), page publique d'organisateur, programme ambassadeur, CGU, confidentialité |
| **Organisateurs** | tableau de bord temps réel, événements (création en 5 étapes, éditeur de plan de salle, multi-sessions, récurrence, pixels), statistiques par événement, participants (export CSV/Excel, message), check-in QR (caméra, saisie, hors ligne avec synchronisation), codes promo, remboursements (politique), versements (solde calculé, demande), campagnes email/SMS/WhatsApp (programmation), emails automatiques, ambassadeurs, équipe et rôles, paramètres (profil public, vérification, pixels) |
| **Administration** | vue d'ensemble, modération, utilisateurs, vérification des organisateurs, litiges, commissions (taux par défaut et personnalisés) |

**Langues** : français (par défaut) et anglais. La phrase française sert de clé ; les traductions sont dans `src/locales/en.json`. Pour ajouter une phrase, utilisez `t('Texte français')` dans le code, puis complétez `en.json`. `npm run i18n:check` liste ce qui manque.

**Hors ligne** : l'application est installable (PWA). L'interface est mise en cache, et les billets restent consultables sans réseau. Le check-in valide les entrées sur une liste téléchargée, puis les synchronise au retour du réseau.

## Brancher le backend

Toute la donnée passe par **`src/services/api.ts`**. Chaque fonction lit `src/data/mock.ts` ; ses signatures forment le contrat attendu par l'interface, et `src/types.ts` décrit les modèles.

1. Définissez `VITE_API_URL` (voir `.env.example`). Le mode démo (`DEMO`) se désactive alors : les aides de test et les boutons de simulation disparaissent.
2. Remplacez le corps des fonctions par des appels au client `http()` fourni. Il ajoute le jeton `Bearer`, lève des `ApiError` (statut, référence support) et déconnecte l'utilisateur sur une réponse 401.
3. La session : `login()` dans `src/store/app.tsx` et le rôle d'équipe (`teamRole`) renvoyé avec l'utilisateur. Les permissions sont définies dans `src/lib/permissions.ts`, et l'organisation de l'utilisateur dans `orgOf()`.

Ce que le serveur doit fournir :
- **Paiements** : MonCash, NatCash, carte, PayPal, virement, avec leurs webhooks.
- **Billets** : codes signés et usage unique garanti de façon atomique. Le jeton du QR tourne toutes les 30 s (`code.jeton`).
- **Cartes Wallet** : Apple et Google Wallet doivent être signées côté serveur. En attendant, l'app propose l'image du billet.
- **Temps réel** : ventes en direct par WebSocket ou SSE (`useLiveSales`).
- **Envois** : emails, SMS et WhatsApp (campagnes et automatisations).
- **Fichiers** : stockage des images et des documents de vérification.
- **Change** : taux HTG/USD du jour (`USD_TO_HTG`).
- **Aperçus de partage** : `scripts/prerender-og.mjs` lit pour l'instant la démo. Il faut le brancher sur l'API, ou faire ce rendu côté serveur. Définissez aussi `SITE_URL`.

## Structure

```
src/
  components/   kit d'interface accessible (ui/), cartes, billet, plan de salle, garde d'accès, ErrorBoundary
  layouts/      PublicLayout, DashboardLayout (navigation filtrée par permissions)
  pages/        public/ · account/ · organizer/ · admin/
  services/     api.ts — couche d'accès aux données
  store/        app.tsx — session, langue, devise, thème, billets, file hors ligne, toasts
  lib/          formatage, i18n, formulaires, permissions, exports, image du billet, pixels
  locales/      en.json
  data/         mock.ts — données de démonstration
scripts/        i18n.mjs, prerender-og.mjs
e2e/            tests Playwright + audit d'accessibilité
```

Les textes de `src/pages/public/Legal.tsx` sont des modèles, à faire valider par un juriste avant la mise en ligne.
