# Event509

> Discover events. Get your pass. Show up.

Plateforme web de billetterie et de gestion d'événements. Ce dépôt contient le **frontend complet**, qui tourne sur des données de démonstration en attendant le backend.

## Démarrer

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # vérification TypeScript + build de production dans dist/
npm run preview
```

Node 18 ou plus récent est requis.

## Stack

React 18 · TypeScript · Vite · Tailwind CSS · React Router · lucide-react (icônes) · qrcode.react (génération QR) · jsQR (lecture QR, quand le navigateur n'a pas `BarcodeDetector`) · police Plus Jakarta Sans.

## Espaces et pages

| Espace | Routes |
| --- | --- |
| **Participants** | `/` accueil · `/explorer` recherche et filtres (ville, date, catégorie, prix, en ligne) · `/e/:slug` page événement · `/e/:slug/achat` paiement · `/commande/:id` confirmation · `/billets` portefeuille QR · `/billets/:id` billet (QR dynamique, Wallet, transfert, revente) · `/favoris` · `/compte` · `/compte/achats` · `/compte/parametres` · `/ambassadeurs` · `/connexion` · `/inscription` |
| **Organisateurs** `/organisateur` | tableau de bord temps réel · événements (création en 5 étapes : infos, visuels, date/lieu, en ligne/hybride, récurrence, multi-sessions, billets gratuit/payant/VIP/early bird/groupe, quotas, dates de vente, plan de salle, lien de partage, pixels) · participants (export CSV/Excel) · check-in QR (caméra, saisie manuelle, **hors ligne**) · codes promo · remboursements · versements & factures · campagnes email/SMS/WhatsApp · emails automatiques · ambassadeurs · équipe & rôles · paramètres |
| **Administration** `/admin` | statistiques globales · modération des événements · utilisateurs · vérification des organisateurs · litiges · commissions |

Langues : français (par défaut) et anglais. Devises : HTG et USD.

## Brancher le backend

Toute la donnée passe par **`src/services/api.ts`**. Chaque fonction lit pour l'instant `src/data/mock.ts` avec une latence simulée. Pour connecter l'API :

1. Copiez `.env.example` en `.env` et renseignez `VITE_API_URL`.
2. Remplacez le corps de chaque fonction de `api.ts` par un appel au client `http()` déjà fourni (il envoie le jeton `Bearer` stocké dans `localStorage['e509.token']`).
3. Les types de `src/types.ts` décrivent le contrat de données attendu par l'interface.

Points qui demandent une implémentation côté serveur :

- **Paiements** : `createOrder` simule MonCash, NatCash, carte, PayPal et virement. Il faut y brancher les vraies passerelles et leurs webhooks.
- **Billets** : les codes QR (`E509-XXXX-XXXX`) doivent être générés et signés par le serveur. Le QR affiché ajoute un jeton qui change toutes les 30 s (`code.jeton`) ; le scanner ne lit que la partie avant le point.
- **Check-in** : `verifyTicket` doit garantir l'usage unique de façon atomique. En mode hors ligne, l'app valide les billets sur une liste téléchargée, met les scans en file d'attente (`offlineScans`) et les envoie au retour du réseau.
- **Ventes en direct** : le flux du tableau de bord est simulé (`useLiveSales`) ; à remplacer par WebSocket ou SSE.
- **Authentification** : `login()` dans `src/store/app.tsx` est simulé (email, Google, téléphone + code SMS).
- **Emails, SMS, WhatsApp, pixels** : les écrans de configuration existent ; l'envoi réel et l'injection des scripts `fbq` / `gtag` restent à faire (`src/lib/pixels.ts`).

## Structure

```
src/
  components/   UI réutilisable (ui/), cartes d'événement, billet, plan de salle, calendrier semaine
  layouts/      PublicLayout (nav basse mobile avec bouton central), DashboardLayout (organisateur/admin)
  pages/        public/ · account/ · organizer/ · admin/
  services/     api.ts — couche d'accès aux données
  store/        app.tsx — langue, devise, session, favoris, billets, file hors ligne, toasts
  lib/          formatage, i18n, exports CSV/Excel/ICS, pixels, hooks
  data/         mock.ts — données de démonstration
```

Codes promo de démo : `KOMPA10`, `NOEL2026`, `ETUDIANT`.
