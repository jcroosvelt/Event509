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

- [x] **Programme « Organisateur vérifié » — fondations (lot 1)** : page publique `/organisateur-verifie` ; demande en 4 étapes avec sauvegarde automatique (`/organisateur/verification`) ; abonnement mensuel/annuel, paiement (en ligne via l'API existante, sinon confirmation manuelle par l'admin), historique, factures imprimables, résiliation (`/organisateur/abonnement`) ; administration : décisions motivées (en cours, documents requis, approuver avec 4 contrôles, refuser, suspendre, révoquer, rétablir), historique, commentaires internes, journal des consultations de documents, réglages (prix, validité, documents, remboursement, rappels, avantages) et paiements à traiter (`/admin/programme-verifie`) ; recours après refus ; expiration et rappels par le cron. Le badge est calculé par le serveur (demande approuvée ET abonnement actif ET certification valable) : aucun champ envoyé par un organisateur ne peut le modifier. Tables : `premium_subscriptions`, `premium_payments`, `verification_log`, `document_access_log`. Testé sur une base locale (API : 50 contrôles ; navigateur : parcours complet demande → paiement → décision → badge → suspension).
- [x] **Avantage 8 — Page professionnelle personnalisée** : adresse personnalisée (`/organisateur/mon-nom`, l'ancienne adresse reste valable, adresses de l'espace réservées), bannière image, couleur de marque (refusée si le texte blanc des boutons devenait illisible), réseaux sociaux (https seulement), date de certification, événements à venir et précédents. Réservé aux organisateurs vérifiés, contrôlé côté serveur ; la page ne montre ces éléments que tant que le badge est actif (les données ne sont jamais supprimées). Réglages dans Paramètres > « Page professionnelle ».
- [x] **Avantage 2 — Visibilité prioritaire** : coup de pouce réglable (25 % par défaut) dans le seul tri « Populaires » (date et prix jamais modifiés, personne masqué), section « Organisateurs vérifiés » sur l'accueil, mise en vedette limitée par organisateur (réglable), note de transparence sur Explorer et sur la page du programme. Le serveur pose `priority` seulement tant que le badge et l'avantage sont actifs.
- [x] **Avantage 3 — Statistiques avancées** (`/organisateur/analyses`) : chiffre d'affaires, billets vendus et restants, évolution des ventes, performance et comparaison d'événements (jusqu'à 4), répartition par catégorie, provenance (direct / code promo / ambassadeur), conversion (commandes ÷ vues), campagnes ; exports Excel et PDF. Chiffres agrégés seulement (aucune donnée d'acheteur). Réservé aux vérifiés, contrôlé côté serveur.
- [x] **Avantage 4 — Gestionnaire multi-événements** : calendrier professionnel (`/organisateur/calendrier`, mois, événements à venir / passés / annulés / brouillons), vue globale, modèles d'événements (enregistrer, utiliser pour créer un brouillon, supprimer). La duplication et les événements récurrents existaient déjà. Le serveur expose les avantages actifs (`perks`) et contrôle chaque appel.
- [x] **Avantage 5 — Équipes avancées** : rôles gestionnaire et responsable de contrôle (l'« agent de contrôle » est l'ancien « staff d'entrée »), permissions personnalisées par membre, entrées validées par chaque agent (enregistrées sur le billet), journal d'activité de l'organisation (`/organisateur/activite`). Réservé aux vérifiés pour attribuer les nouveaux rôles et les permissions ; un organisateur qui perd l'avantage garde ses membres et leurs rôles (rien n'est supprimé). Colonnes ajoutées : `users.team_perms`, table `activity_log`, rôles étendus dans la contrainte `users_team_role_check`.
- [ ] **Programme vérifié — lot 2, avantages restants (à faire, un par un)** : avantages premium eux-mêmes (visibilité prioritaire, statistiques avancées + export, gestionnaire multi-événements, équipes avancées, support prioritaire, outils marketing, page personnalisée, finances avancées, API/widgets/webhooks). Leur interrupteur et leur accès côté serveur existent déjà (`benefitsFor`), mais les écrans ne sont pas encore construits.
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
