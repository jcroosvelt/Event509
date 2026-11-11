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
| Paiements réels (MonCash, NatCash, carte, PayPal) | **Pas encore branchés** |
| Envoi des billets par email | Code prêt ; **il faut ajouter `RESEND_API_KEY` et `MAIL_FROM` dans Vercel** pour que les emails partent |
| SMS et WhatsApp | Pas encore branchés |

## En cours (cette session)

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
