# Passkeys (WebAuthn / FIDO2)

- Bibliothèque serveur : `@simplewebauthn/server` ; navigateur : `@simplewebauthn/browser` (versions épinglées).
- Identifiant du site (RP ID) : le domaine de `SITE_URL` (ou `WEBAUTHN_RP_ID`) ; origine attendue : `SITE_URL` (ou `WEBAUTHN_ORIGIN`). Une passkey créée sur un domaine ne fonctionne pas sur un autre : ne changez pas de domaine sans prévoir la migration.
- Cérémonies : défi aléatoire à usage unique (5 min) ; **vérification de l'utilisateur obligatoire** (empreinte, visage ou code de l'appareil) ; clés découvrables (connexion sans saisir d'identifiant). Le serveur ne garde que l'identifiant public, la clé publique, le compteur et un nom.
- Compteur de signatures vérifié (une passkey clonée est détectée) ; attestation « none » (aucune exigence sur le constructeur).
- **Une passkey enregistrée sur un téléphone n'est jamais supposée présente ailleurs** (certains gestionnaires la synchronisent, pas tous) : « Ajouter une passkey sur cet appareil » se refait sur chaque appareil, l'interface le dit, et l'écran Sécurité indique les passkeys « synchronisées ».
- Suppression d'une passkey : réauthentification récente exigée ; jamais la dernière méthode de connexion.
- **Solution de secours** : connexion Google, codes de récupération, questions de sécurité (avec un autre facteur), assistance administrative.
- Application Android : la prise en charge de WebAuthn dans une WebView dépend de la version d'Android System WebView ; non testée sur un vrai téléphone.

Tests : `api/auth.test.ts` utilise un authentificateur virtuel (vraies signatures ES256) que le serveur vérifie réellement : enregistrement, connexion, mauvaise origine, mauvais RP, signature falsifiée, compteur qui recule, défi rejoué, réauthentification, suppression.
