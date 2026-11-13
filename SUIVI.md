# Suivi du projet Event509

> Ce fichier est mis à jour après chaque modification. Dernière mise à jour : voir la ligne « Journal » en bas.

## Où en est le site

| Domaine | État |
| --- | --- |
| Interface (public, compte, organisateur, administration) | Terminée, français et anglais |
| Serveur (API Vercel) et base de données (Neon) | En ligne, testés |
| Comptes (inscription, connexion, rôles) | En ligne |
| Achat de billets, billets avec QR unique | En ligne (sans paiement réel, voir plus bas) |
| Fichiers (affiches, logos, documents de vérification) | En ligne |
| Contrôle d'entrée par événement | Refait et testé |
| Versements aux organisateurs (MonCash, NatCash, PayPal) | Refait et testé |
| Paiements en ligne MonCash, NatCash, KashPaw et carte (une seule API) | Code prêt, **à activer** : définir `PAY_CLIENT_ID` dans Vercel et régler chez la plateforme de paiement le lien de retour `https://event509.vercel.app/retour-paiement` et le webhook `https://event509.vercel.app/api/pay/webhook`. Sans `PAY_CLIENT_ID`, les commandes restent validées sans paiement réel |
| Paiement PayPal | Pas encore branché |
| Envoi des billets par email | Code prêt ; **il faut ajouter `RESEND_API_KEY` et `MAIL_FROM` dans Vercel** pour que les emails partent |
| SMS et WhatsApp | Pas encore branchés |
| Notifications push (application Android) | Code prêt, **à activer** : exécuter le SQL `device_tokens` / `notification_log` de `db/schema.sql` dans Neon, puis définir `FIREBASE_SERVICE_ACCOUNT` et `CRON_SECRET` dans Vercel |

## En cours (cette session)

- [x] Application Android sur le site (APK, plus la PWA) : à l'arrivée depuis un téléphone Android (hors application), une fenêtre propose d'installer l'application ; « Installer » ouvre une fenêtre d'informations (version, taille, Android requis, étapes, avertissement Google Play, empreinte SHA-256) avec le téléchargement de `/app/event509.apk`. « Plus tard » masque l'invitation 3 jours, « J'ai déjà l'application » pour toujours. Page `/telecharger` (lien dans le pied de page). Jamais affichée dans l'application ni sur ordinateur/iPhone. L'ancienne invitation PWA est retirée.
- [x] Mises à jour : le workflow de l'application dépose `public/app/event509.apk` et `public/app/version.json` dans ce dépôt à chaque version de la branche `main`, attend que le site serve la nouvelle version, puis appelle `POST /api/app/announce` : une notification « Mise à jour disponible » part vers tous les appareils où l'application est installée (une seule fois par version). Dans l'application, un bandeau propose aussi la mise à jour. **À régler :** secrets GitHub `SITE_REPO_TOKEN` et `ANNOUNCE_SECRET` dans le dépôt de l'application, et `APP_ANNOUNCE_SECRET` (même valeur) dans Vercel. Sans eux, rien n'est publié ni annoncé. Chaque version ajoute environ 23 Mo à l'historique de ce dépôt.
- [x] La commission est réglée par l'administrateur (Administration > Commissions : pourcentage par défaut, frais fixes, part de l'acheteur, taux personnalisés par organisateur) et reprise automatiquement dans les conditions d'utilisation.

- [x] Événements proches et selon les goûts : l'accueil a une section « Près de chez vous » et l'exploration trie par défaut « Pour vous » (même ville, puis même pays, puis les goûts, puis la date ; les événements en ligne comptent comme proches ; les tris Date, Popularité et Prix ne sont jamais modifiés). **Position :** pays (et ville) de la connexion fournis par l'hébergeur (`GET /api/geo`, rien n'est enregistré), précisés par le GPS avec l'autorisation de l'utilisateur (« Utiliser ma position », rattaché à la ville connue la plus proche, rayon 60 km), ou choisis à la main (pays + ville, jamais remplacés). **Goûts :** centres d'intérêt choisis, favoris, billets achetés et événements consultés. Fenêtre « Personnaliser » (accueil, exploration, paramètres). Chaque lieu d'événement a un pays (éditeur d'événement) ; sans pays il est déduit de la ville, sinon Haïti. Choix gardés sur l'appareil. Limite : la proximité se fait à la ville et au pays (les lieux n'ont pas encore de coordonnées).

- [x] Principales devises du monde : l'acheteur choisit HTG, USD, EUR, GBP, CAD, CHF, JPY, CNY, AUD, MXN, BRL ou DOP (sélecteur de l'en-tête, des paramètres du compte et de la caisse). **Les prix restent fixés en gourdes** : la commande est comptée en gourdes (ou en dollars si l'acheteur choisit le dollar), garde la devise choisie à titre indicatif (`displayCurrency`, `displayTotal`) et le paiement en ligne est toujours prélevé en gourdes (note à la caisse). L'administrateur règle le taux de chaque devise en gourdes dans Administration > Commissions (`PUT /api/admin/rate`, valeurs de départ approximatives à vérifier). Les finances organisateur et admin restent en gourdes et en dollars.

- [x] Contrôle d'entrée : dans l'application Android, « Activer la caméra » ouvre le scanner de QR codes natif (message `scan:start`, résultat par `window.onQrScanned`) ; il se relance après chaque validation. Dans un navigateur, la caméra de la page reste utilisée.

- [x] Pages légales mises à jour avec le document « Event509 – Documents légaux » (15 novembre 2026) : conditions d'utilisation, politique de confidentialité et nouvelle politique de remboursement (`/remboursement`, lien dans le pied de page), en français et en anglais. L'administrateur les modifie dans Administration > **Contenu et réglages** (texte libre par document et par langue, « rétablir le texte d'origine ») et règle les valeurs insérées (adresse, email, délais, moyens de paiement…). La commission vient de la page Commissions. **À renseigner :** l'adresse de JC Multimedia, la durée de conservation des données et le nombre de jours de la politique d'un organisateur : tant qu'ils sont vides, les pages affichent « [à renseigner] ».

- [x] **Programme « Organisateur vérifié » — fondations (lot 1)** : page publique `/organisateur-verifie` ; demande en 4 étapes avec sauvegarde automatique (`/organisateur/verification`) ; abonnement mensuel/annuel, paiement (en ligne via l'API existante, sinon confirmation manuelle par l'admin), historique, factures imprimables, résiliation (`/organisateur/abonnement`) ; administration : décisions motivées (en cours, documents requis, approuver avec 4 contrôles, refuser, suspendre, révoquer, rétablir), historique, commentaires internes, journal des consultations de documents, réglages (prix, validité, documents, remboursement, rappels, avantages) et paiements à traiter (`/admin/programme-verifie`) ; recours après refus ; expiration et rappels par le cron. Le badge est calculé par le serveur (demande approuvée ET abonnement actif ET certification valable) : aucun champ envoyé par un organisateur ne peut le modifier. Tables : `premium_subscriptions`, `premium_payments`, `verification_log`, `document_access_log`. Testé sur une base locale (API : 50 contrôles ; navigateur : parcours complet demande → paiement → décision → badge → suspension).
- [x] **Avantage 8 — Page professionnelle personnalisée** : adresse personnalisée (`/organisateur/mon-nom`, l'ancienne adresse reste valable, adresses de l'espace réservées), bannière image, couleur de marque (refusée si le texte blanc des boutons devenait illisible), réseaux sociaux (https seulement), date de certification, événements à venir et précédents. Réservé aux organisateurs vérifiés, contrôlé côté serveur ; la page ne montre ces éléments que tant que le badge est actif (les données ne sont jamais supprimées). Réglages dans Paramètres > « Page professionnelle ».
- [x] **Avantage 2 — Visibilité prioritaire** : coup de pouce réglable (25 % par défaut) dans le seul tri « Populaires » (date et prix jamais modifiés, personne masqué), section « Organisateurs vérifiés » sur l'accueil, mise en vedette limitée par organisateur (réglable), note de transparence sur Explorer et sur la page du programme. Le serveur pose `priority` seulement tant que le badge et l'avantage sont actifs.
- [x] **Avantage 3 — Statistiques avancées** (`/organisateur/analyses`) : chiffre d'affaires, billets vendus et restants, évolution des ventes, performance et comparaison d'événements (jusqu'à 4), répartition par catégorie, provenance (direct / code promo / ambassadeur), conversion (commandes ÷ vues), campagnes ; exports Excel et PDF. Chiffres agrégés seulement (aucune donnée d'acheteur). Réservé aux vérifiés, contrôlé côté serveur.
- [x] **Avantage 4 — Gestionnaire multi-événements** : calendrier professionnel (`/organisateur/calendrier`, mois, événements à venir / passés / annulés / brouillons), vue globale, modèles d'événements (enregistrer, utiliser pour créer un brouillon, supprimer). La duplication et les événements récurrents existaient déjà. Le serveur expose les avantages actifs (`perks`) et contrôle chaque appel.
- [x] **Avantage 5 — Équipes avancées** : rôles gestionnaire et responsable de contrôle (l'« agent de contrôle » est l'ancien « staff d'entrée »), permissions personnalisées par membre, entrées validées par chaque agent (enregistrées sur le billet), journal d'activité de l'organisation (`/organisateur/activite`). Réservé aux vérifiés pour attribuer les nouveaux rôles et les permissions ; un organisateur qui perd l'avantage garde ses membres et leurs rôles (rien n'est supprimé). Colonnes ajoutées : `users.team_perms`, table `activity_log`, rôles étendus dans la contrainte `users_team_role_check`.
- [x] **Avantage 6 — Support prioritaire** : tickets avec conversation, catégories, priorité (« mon événement a lieu en ce moment » = urgent), suivi de résolution, notifications de réponse (push + email), boîte de réception administrateur (urgent puis prioritaire d'abord) à `/admin/support`. Création réservée aux vérifiés ; l'historique reste lisible et complétable si l'avantage est retiré. Tables `support_tickets`, `support_messages`.
- [x] **Avantage 7 — Outils marketing** : liens de suivi (`/organisateur/liens`, clics, ventes, chiffre d'affaires, conversion ; `?src=CODE` mémorisé par session et rattaché à la commande seulement si le code existe chez l'organisateur), codes promo avancés (début de validité, billets minimum, billet visé, usages par email : appliqués par le serveur), consentement à l'achat (case facultative « Recevoir les actualités de… »), campagnes réelles par email et notification vers les acheteurs consentants non désinscrits (limite 2000 destinataires, une campagne toutes les 10 minutes), désinscription en un clic (jeton signé, page `/desinscription`). Ouvertures et clics d'emails ne sont pas mesurés (aucun faux chiffre). L'email exige `RESEND_API_KEY` + `MAIL_FROM`, la notification exige `FIREBASE_SERVICE_ACCOUNT`. Le programme d'ambassadeurs existait déjà. Correctif au passage : texte d'avertissement de la page Campagnes illisible en thème sombre.
- [x] **Avantage 9 — Gestion financière avancée** (`/organisateur/finances`) : revenus par mois, commissions (qui les supporte), paiements en attente, solde, historique des transactions (sans nom ni email d'acheteur), historique des retraits, rapports CSV / Excel / PDF ; retraits « prioritaires » (traités en premier par l'administration mais jamais validés automatiquement ni dispensés du contrôle du solde). Correctif : tri des retraits côté administration.
- [x] **Commission partagée 50/50** : la plateforme prélève un pourcentage (5 % par défaut, sans frais fixes) sur chaque billet payant ; l'acheteur en paie la moitié en plus du prix (2,5 %) et l'organisateur l'autre moitié (2,5 %, déduite de son revenu). La part de l'acheteur est réglable par l'administrateur (page Commissions, « Part de la commission payée par l'acheteur »), et le taux négocié d'un organisateur est partagé de la même façon. Les anciens réglages stockés sans part sont lus comme 50/50 ; **vérifier sur la page Commissions que le taux est bien de 5 % et les frais fixes à 0 : un ancien réglage enregistré (ex. 25 HTG par billet) reste appliqué tant qu'il n'est pas modifié**.
- [x] **Programme certifié : un seul prix**, payé en une fois pour l'année (formule mensuelle retirée ; un paiement prolonge d'un an à partir de l'expiration ; les anciens abonnements mensuels restent valables jusqu'à leur fin).
- [x] **Boost par événement** (`/organisateur/boosts`, `/admin/boosts`) : formules durée + prix réglables (3, 7 et 14 jours par défaut), nombre maximum d'événements boostés en même temps, paiement par la même passerelle (sinon confirmation par l'administration), événement « Sponsorisé » en tête de « Populaires » et sur « À la une », résultats (vues, billets) depuis le début du boost. Le champ de fin de boost est verrouillé côté serveur (le formulaire ne peut pas le modifier). Date et prix ne sont jamais réordonnés.
- [x] **Correctif** : la page Versements de l'administration plantait (« Cannot read properties of undefined (reading 'i') ») quand un versement avait un moyen ou un statut inconnu ; elle affiche maintenant une valeur de repli.
- [x] **Avantage 10 — API et intégrations** (`/organisateur/api`) : clés API (affichées une seule fois, stockées hachées, révocables, limite de clés et de requêtes par minute réglables par l'admin), API publique en lecture `/api/v1` (`events`, `events/:id`, `sales` ; autorisations `events:read` / `sales:read` ; aucune donnée d'acheteur), suivi des requêtes (journal 30 jours, compteur 24 h), webhooks signés HMAC-SHA256 (`ticket.sold`, `ticket.checked_in` ; adresses https publiques seulement, protection contre l'accès au réseau interne, mise en pause après 10 échecs), widget de billetterie intégrable (`/widget.js` + `/widget/:slug`, hauteur automatique, achat sur Event509 en nouvel onglet) et documentation avec vérification de signature. Un organisateur qui perd l'avantage voit ses clés et webhooks suspendus (sans suppression) et ses widgets masqués.
- [x] **Programme vérifié : les dix avantages sont livrés.**
- [ ] ~~Programme vérifié — lot 2~~ (terminé) : avantages premium eux-mêmes (visibilité prioritaire, statistiques avancées + export, gestionnaire multi-événements, équipes avancées, support prioritaire, outils marketing, page personnalisée, finances avancées, API/widgets/webhooks). Leur interrupteur et leur accès côté serveur existent déjà (`benefitsFor`), mais les écrans ne sont pas encore construits.
- [x] Avis et notes : un avis par commande payée, après la fin de l'événement (lien de la commande), note moyenne et avis sur la page événement, page organisateur « Avis » avec réponses (table `reviews`, testé sur une base locale : doublon, événement futur et mauvaise clé refusés)
- [x] Jusqu'à 5 visuels par événement (éditeur : ajout multiple, visuel principal modifiable, retrait ; page événement : galerie de miniatures). Le serveur ne garde que des fichiers du site ou des adresses https, 5 au plus.
- [x] Taux de change gourdes / dollar réglable par l'administrateur (page Commissions, `PUT /api/admin/rate`, relu depuis la base à chaque requête, enregistré au journal). Par défaut 132.
- [x] Application Android, phase 4 côté site : messages `ticket:open` / `ticket:close` sur les pages de billet (écran allumé, luminosité maximale, captures bloquées), réglage « Verrouiller l'application » (empreinte ou code du téléphone, visible dans l'application seulement), fichier des liens profonds `/.well-known/assetlinks.json` (empreinte de la clé de signature de l'application)

- [x] Paiement en ligne par une seule API (MonCash, NatCash, KashPaw, carte Square) : l'acheteur est redirigé vers la page sécurisée, la commande reste « en attente » (places réservées), puis est confirmée par le webhook ou par la vérification serveur (`/api/orders/:id/verify`, page `/retour-paiement`, mise à jour automatique de la page de commande). Paiement échoué ou abandonné depuis plus de 2 h : commande supprimée et places libérées (le contrôle tourne avec le cron quotidien). Plus aucune saisie de carte sur le site. Logos des moyens de paiement dans `public/pay/`. Testé de bout en bout sur une base locale avec un faux fournisseur.

- [x] Billet refait dans le style d'un billet de spectacle (bloc coloré avec titre, zone centrale, souche avec QR code) et téléchargeable en ultra HD (3840 × 1400 px, QR net) ; page de confirmation : « Téléchargez vos billets (recommandé) »
- [x] Déconnexion plus visible sur téléphone (icône rouge dans la barre du haut des espaces organisateur et administration)

- [x] Bouton « Déconnexion » dans l'espace organisateur et l'administration (menu du téléphone et barre latérale) : il n'existait que dans le menu du site public, absent sur mobile

- [x] Suppression d'une commande ou d'un événement par l'admin : l'acheteur (ou les détenteurs) et les administrateurs sont prévenus par notification push et par email (l'email part seulement si `RESEND_API_KEY` et `MAIL_FROM` sont définis)
- [x] Bouton « Espace organisateur » retiré en haut du site pour les visiteurs ; bouton « S’inscrire » ajouté sur la page de connexion organisateur

- [x] Notifications push : `window.onFcmToken` (src/lib/push.ts), `POST /api/devices` (jeton lié au compte et/ou à la commande par sa clé), envoi FCM v1 (api/_lib/push.ts), déclencheurs (nouvelle vente, presque complet, billet reçu, paiement confirmé, événement modifié ou annulé) et rappels par Vercel Cron (`/api/cron/reminders`, une fois par jour)

- [x] Comptes réservés aux organisateurs : l'inscription crée toujours un compte organisateur ; les participants achètent sans compte et retrouvent leurs billets par l'email / le lien de commande (plus d'invitation à créer un compte, plus de « Mes billets » pour les visiteurs)
- [x] Compte admin : un seul espace à deux facettes (sélecteur « Organisateur | Administration » en haut du menu, sur ordinateur et mobile) ; l'admin arrive sur l'Administration à la connexion
- [x] Application installable : bandeau « Installer l'application » (Android/Chrome : bouton natif ; iPhone/iPad : explication « Partager » puis « Sur l'écran d'accueil »)
- [x] Suppression d'un événement (organisateur : sans billet vendu ; admin : avec tout son contenu) et d'une commande avec ses billets (admin, page Transactions)
- [x] Champs numériques : on peut effacer et retaper (plus de « 1 » ou de « 0 » collé)
- [x] Clavier mobile : durcissement des champs (voir détail dans le journal)
- [x] Emojis remplacés par des icônes
- [x] Versements : destination demandée (MonCash/NatCash : numéro + nom complet ; PayPal : email PayPal)
- [x] Contrôle d'entrée : on choisit l'événement, puis on scanne ; « Valider l'entrée » relance le scan
- [x] Données fictives sorties du site en ligne (chargées seulement par la version de démonstration)
- [x] Exemples fictifs dans les champs de saisie
- [x] Achat sans compte : le billet est créé à l'achat (jamais à l'inscription), le client donne son email (saisi deux fois), reçoit un email avec un QR unique par billet ; page de commande consultable sans compte grâce au lien de l'email (envoi réel : il reste à brancher le compte Resend)
- [x] Rattachement des billets au compte : sécurité (plus de rattachement par simple email ; on rattache avec le lien de la commande)
- [x] Pages Campagnes et Emails automatiques rendues honnêtes (plus de fausses statistiques ni de faux envois)
- [x] Tests mis à jour et lancés
- [x] Déploiement sur `main`

## À faire ensuite

0. **À faire par vous** : créer un compte Resend, vérifier un domaine d'envoi, puis ajouter `RESEND_API_KEY` et `MAIL_FROM` dans Vercel (Production) pour que les billets partent par email.

1. Paiements réels (MonCash, NatCash, carte, PayPal) et leurs notifications
2. Envois SMS et WhatsApp
3. Aperçus de partage des événements (WhatsApp, Facebook) générés depuis la base
4. Mot de passe oublié par email
5. Pixels de suivi (Facebook, Google) enregistrés dans la base
6. Campagnes et rappels automatiques par email (le serveur sait déjà envoyer des emails) ; SMS et WhatsApp
7. Vérification de l'adresse email à l'inscription (aujourd'hui une invitation d'équipe se rattache au premier inscrit avec cet email)

## Journal

- 2026-11-11 : création du fichier de suivi.
- 2026-11-11 : vérifié sur le site en ligne (compte et événement de test, supprimés ensuite) : achat sans compte, billets créés à l'achat, lien de commande qui rouvre les billets sans compte, mauvaise clé refusée ; le code livré ne contient aucune donnée fictive (81 fichiers examinés). L'email des billets ne part pas encore : `RESEND_API_KEY` et `MAIL_FROM` ne sont pas définis dans Vercel.
- 2026-11-11 : vérifié dans un vrai navigateur sur une base vide (15 contrôles) : création d'événement, champs numériques, achat sans compte, email avec QR décodable, contrôle d'entrée, versements, saisie tactile, et audit de 37 pages (aucune donnée fictive, aucun emoji). Bug corrigé au passage : un billet refusé au contrôle d'entrée renvoyait une erreur 503 (introduit par la page de santé, déjà en ligne).
- 2026-11-11 : achat sans compte (clé d'accès dans le lien de la commande), email des billets avec QR unique (Resend), virement : billets « en attente » jusqu'à confirmation par l'administration, transfert de billet par email.
- 2026-11-11 : champs numériques (effaçables), icônes à la place des emojis, versements avec destination, contrôle d'entrée par événement (Valider l'entrée relance le scan), données fictives sorties du site en ligne (vérifié : aucune dans la version de production), exemples des champs de saisie rendus neutres.
- 2026-11-11 : PWA (bandeau d'installation) et suppression d'événements / de commandes ; vérifié en ligne sur event509.vercel.app : le bandeau est dans le code livré, les routes de suppression répondent « connexion requise » sans session.
- 2026-11-11 : espace unique à deux facettes pour le compte admin (sélecteur Organisateur / Administration).
- 2026-11-11 : comptes réservés aux organisateurs (inscription = organisateur ; visiteurs sans menu de compte).
- 2026-11-12 : notifications push (jetons d'appareil, envoi Firebase, déclencheurs, rappels). Rien n'est envoyé tant que `FIREBASE_SERVICE_ACCOUNT` n'est pas défini.
- 2026-11-12 : notifications de suppression (commande, événement), bouton d'en-tête retiré, bouton S'inscrire sur la connexion.
- 2026-11-12 : bouton Déconnexion dans les espaces organisateur et administration.
- 2026-11-12 : nouveau billet ultra HD, téléchargement recommandé à la confirmation, déconnexion visible.
- 2026-11-12 : paiement en ligne MonCash / NatCash / KashPaw / carte (API unique), logos, page de retour, vérification et webhook.
- 2026-11-12 : visuels multiples (5), taux de change réglable par l'admin, phase 4 côté site (billet, verrouillage, liens profonds).
- 2026-11-13 : avis et notes (API, page événement, confirmation, page organisateur) ; test e2e « visiteur renvoyé vers la connexion » rendu fiable (il attend le démarrage de l'application).
- 2026-11-13 : programme « Organisateur vérifié » (lot 1 : vérification, abonnement, badge, administration) ; correctif : la demande de vérification n'est plus créée en double quand la sauvegarde automatique et l'envoi d'un document arrivent en même temps.
- 2026-11-13 : avantage 8 du programme vérifié (page professionnelle personnalisée) ; la bannière de l'organisateur est maintenant validée côté serveur (avant, n'importe quelle valeur était acceptée).
- 2026-11-13 : avantage « visibilité prioritaire » du programme vérifié.
- 2026-11-13 : avantage « statistiques avancées » du programme vérifié.
- 2026-11-13 : avantage « gestionnaire multi-événements » du programme vérifié.
- 2026-11-13 : avantage « équipes avancées » du programme vérifié.
- 2026-11-13 : avantage « support prioritaire » du programme vérifié.
- 2026-11-13 : avantage « outils marketing » du programme vérifié.
- 2026-11-13 : avantage « gestion financière avancée » du programme vérifié.
- 2026-11-13 : commission partagée 50/50, prix annuel unique du programme certifié, boost par événement, correctif de la page Versements (admin).
- 2026-11-13 : avantage « API et intégrations » du programme vérifié (clés, API /v1, webhooks signés, widget, documentation).
- 2026-11-13 : pages légales mises à jour (3 documents FR/EN) et modifiables par l'administrateur (Contenu et réglages).
- 2026-11-13 : contrôle d'entrée branché sur le scanner natif de l'application.
- 2026-11-13 : devises du monde pour l'acheteur, taux réglables en gourdes par l'admin, paiement toujours en gourdes.
- 2026-11-13 : événements proches (ville, pays) et selon les goûts, position détectée ou choisie, pays du lieu dans l'éditeur.
- 2026-11-13 : invitation à installer l'APK sur le site, fenêtre d'informations, page /telecharger, mises à jour (publication automatique et notification).
- 2026-11-13 : première version de l'application (1.0.21) publiée dans public/app/ ; le workflow de l'application garde l'APK le plus récent dans sa branche apk-release.
