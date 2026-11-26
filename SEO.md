# Référencement et aperçus de liens (Event509)

Tout est produit par `api/_lib/seo.ts` (un seul endroit) à partir de la base : publier, modifier ou retirer un contenu met à jour
ses balises, son plan du site et son image d'aperçu sans rien republier.

## Ce que reçoit chaque lecteur
- **Visiteurs** : le site (application React). `useTitle(titre, options)` (src/lib/hooks.ts) pose titre, description, adresse
  canonique, Open Graph, X et `noindex` côté navigateur ; `useNoIndex()` pour les espaces connectés.
- **Robots de partage et moteurs de recherche** (WhatsApp, Facebook, Messenger, Telegram, LinkedIn, X, Discord, Slack, Pinterest,
  Signal, Viber, Googlebot, Bing, DuckDuckGo, Yandex, Apple, Baidu, Mastodon, Bluesky…) : la page HTML préparée par le serveur
  (`/share`, choisie par `vercel.json` selon l'agent utilisateur) avec titre, description, canonique, `og:*`, `twitter:*`,
  données structurées JSON-LD et le texte de la page. Contenu identique à celui du site (pas de contenu caché).

## Adresses
| Adresse | Contenu | Indexable |
|---|---|---|
| `/`, `/explorer`, `/telecharger`, `/organisateur-verifie`, `/cgu`, `/confidentialite`, `/remboursement`, `/ambassadeurs` | pages fixes | oui (`/explorer?…` filtré : non) |
| `/e/<slug>` | événement publié et public (JSON-LD `Event`) | oui ; privé : `noindex` et aucune donnée structurée |
| `/o/<slug>` | organisateur (JSON-LD `Organization`) | oui s'il a au moins un événement public ; sinon `noindex` |
| `/og/e/<slug>.png`, `/og/o/<slug>.png` | image d'aperçu 1 200 × 630 (marque, titre, date, lieu, prix, affiche) | image |
| `/sitemap.xml` → `sitemap-pages.xml`, `sitemap-events-N.xml`, `sitemap-organizers-N.xml` | plan du site (5 000 adresses par fichier) | — |
| `/robots.txt` | généré ; images et plan du site ouverts | — |
| `/.well-known/assetlinks.json` | liens Android vérifiés + connexion par passkey | — |
Espaces connectés, paiement, connexion, commande, billets, widget, APK : `X-Robots-Tag: noindex` (vercel.json) et fermés dans robots.txt.

## Sécurité
- Les images d'aperçu ne viennent que du site (`/api/files/…`) : aucune adresse externe n'est chargée ni recopiée.
- Tout texte est échappé (HTML, attributs, SVG de l'image) ; `<` est échappé dans le JSON-LD.
- Brouillon, retiré ou inconnu : 404 + `noindex` ; image de marque par défaut dans les aperçus.
- Un événement en ligne n'expose jamais le lien de la réunion (la page de l'événement tient lieu d'adresse).

## Liens Android (App Links)
Le manifeste de l'application déclare `https://<site>/e/…` et `/o/…` en liens vérifiés (`autoVerify`) ; `assetlinks.json` contient le
paquet `com.event509.event509_app` et l'empreinte SHA-256 de la clé de signature (`signing/debug.keystore`). Seuls ces deux chemins :
l'application ne les envoie jamais au navigateur (garde-fous dans `native_platform.dart`, `main.dart` et le workflow de compilation),
donc pas de boucle application → navigateur → application. Application absente : la page web s'ouvre.

## Rafraîchir un aperçu déjà mis en cache par un réseau
L'adresse de l'image porte une version (`?v=…`) qui change avec le titre, la date, le lieu, le prix ou l'affiche : un aperçu à
jour apparaît dès que le réseau relit la page. Pour forcer :
- Facebook / Messenger / Instagram : https://developers.facebook.com/tools/debug/ → « Scrape Again ».
- LinkedIn : https://www.linkedin.com/post-inspector/ → « Inspect ».
- X : l'aperçu se renouvelle seul (le validateur public a été retiré).
- WhatsApp et Telegram : pas d'outil ; Telegram : envoyer le lien au robot @WebpageBot ; WhatsApp relit après quelques heures (ou
  ajouter un paramètre au lien, ex. `?r=2`, qui produit un nouvel aperçu).
- Google : Search Console → Inspection d'URL → « Demander une indexation » ; soumettre `https://<site>/sitemap.xml`.

## Limites à connaître
- Le site est bilingue sur une seule adresse (langue choisie dans le navigateur) : pas de `hreflang` (il faudrait des adresses
  distinctes par langue ; non inventé).
- Chaque réseau affiche l'aperçu à sa façon (ratio, longueur du titre) ; WhatsApp n'affiche pas les données structurées.
