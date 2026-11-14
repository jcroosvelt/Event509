# Récupération des comptes

Objectif : un utilisateur doit pouvoir retrouver son compte EVENT509 même s'il perd son compte Google ou change de téléphone, sans qu'un tiers puisse le prendre.

## Méthodes préparées par l'utilisateur (page Sécurité)
| Méthode | Règles |
|---|---|
| **Passkey** | une par appareil ; vérification de l'utilisateur obligatoire |
| **Codes de récupération** | 10 codes `XXXX-XXXX-XXXX` (12 caractères parmi 30, ≈ 59 bits, `crypto.randomInt`) ; seule l'empreinte HMAC-SHA256 est stockée ; affichés **une seule fois** ; usage unique ; nouvelle série = l'ancienne est révoquée ; révocation totale possible ; tentatives limitées ; utilisation journalisée sans le code ; l'utilisateur est prévenu à chaque utilisation |
| **Questions de sécurité** (3, formulées par l'utilisateur) | réponses normalisées (Unicode NFKC, espaces réduits, casse ignorée, accents conservés) puis **Argon2id** (19 Mio, 2 passes, sel individuel) ; jamais renvoyées ni journalisées ; questions publiques refusées (date de naissance, nom de famille, adresse, parents, réseaux sociaux…), réponses faibles refusées ; remplacement après réauthentification |

## Parcours « Je n'ai plus accès à mon compte Google » (`/connexion/recuperation`)
1. L'utilisateur indique son e-mail ou nom d'utilisateur. **Réponse identique** que le compte existe ou non ; aucune méthode n'est révélée.
2. **Premier facteur indépendant** : passkey **ou** code de récupération.
3. **Questions de sécurité** : elles ne sont affichées qu'après le premier facteur ; elles **ne suffisent jamais seules**.
4. Facteurs suffisants (passkey/code **+** questions) → « Associer un nouveau compte Google » : le nouveau Google (jamais déjà utilisé par un autre compte) remplace l'ancien (conservé 72 h pour annulation), **toutes les sessions sont fermées**, l'utilisateur est notifié, les données sont conservées.
5. Verrouillage : 5 échecs par tentative (30 min), 10 échecs/h par compte, 20/h par IP.

## Assistance administrative (dernier recours)
1. L'utilisateur dépose une demande (motif d'au moins 30 caractères, contact facultatif) ; réponse identique pour un compte inconnu ; il reçoit un lien de suivi (gardé sur son appareil). Le titulaire du compte est **prévenu** (application et e-mail du compte) et peut **annuler** depuis la page Sécurité.
2. Un administrateur (réauthentification récente exigée) examine dans **Administration → Récupérations de compte** et décide avec un **motif obligatoire** : approuver, refuser ou **bloquer** (suspect). Il ne peut pas traiter une demande qui le concerne.
3. Approbation = **délai de sécurité de 48 h** ; le titulaire est de nouveau prévenu.
4. Après le délai, **c'est l'utilisateur lui-même** qui s'authentifie avec le nouveau compte Google. **L'administration n'a aucune route pour modifier une identité Google** ; chaque décision est dans `security_events` (acteur, demande, motif dans `recovery_requests`).
5. Connaître le nom, l'e-mail ou la date de naissance ne prouve rien : ces informations ne déclenchent jamais une récupération.

## Si rien n'est disponible
Aucun facteur indépendant (pas de passkey, pas de code, questions oubliées) → seule l'assistance reste possible ; elle peut être refusée. **Recommandation : générer ses codes de récupération et ajouter une passkey dès l'inscription.**

## Changement de téléphone
Connexion Google sur le nouvel appareil (ou passkey/code), puis **Sécurité → Mes appareils et sessions** pour fermer l'ancienne session ; ajouter une nouvelle passkey sur le nouvel appareil.

## Protections (récapitulatif)
Cookies HttpOnly/Secure/SameSite ; CSRF ; sessions révocables ; réauthentification récente ; limites par compte et IP ; anti-énumération ; Argon2id ; empreintes seules pour les codes ; PKCE, state, nonce et validation complète du jeton Google ; unicité des identités en base ; transactions pour la création de compte et les changements d'identité ; journal et notifications sans secret ; aucun administrateur ne peut modifier une identité en silence.
