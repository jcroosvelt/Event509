# Authentification EVENT509 : Google, inscription progressive, sessions

## 1. Architecture

```
Navigateur ── GET /api/auth/google/start ──► Google (autorisation, PKCE S256, state, nonce)
          ◄── GET /api/auth/google/callback?code&state ──
                   │ échange du code (secret Google côté serveur) + validation complète du jeton d'identité
                   ▼
   identité Google connue ? ── oui, profil complet ───► session (cookie HttpOnly) → tableau de bord       [Situation A]
                            ── oui, profil incomplet ─► session limitée → /compte/completer               [Situation B]
                            ── non ───────────────────► inscription provisoire → /inscription/profil      [Situation C]
```

| Élément | Où |
|---|---|
| OpenID Connect (départ, retour, validation du jeton) | `api/_lib/google.ts` |
| Sessions, cookies, réauthentification récente, journal de sécurité | `api/_lib/session.ts` |
| Parcours (inscription, sessions, passkeys, codes, questions, récupération, administration) | `api/_lib/authflows.ts` |
| Questions de sécurité (Argon2id) et codes de récupération | `api/_lib/secrets.ts` |
| Passkeys WebAuthn | `api/_lib/webauthn.ts` |
| Cookies, CSRF, sessions limitées | `api/_lib/handler.ts` |
| Pages | `src/pages/auth/*`, `src/pages/account/Security.tsx`, `src/pages/admin/RecoveryRequests.tsx` |
| Tests | `api/auth.test.ts` (serveur, 25 tests), `src/pages/auth/auth.test.tsx` (interface) |

### Identité permanente
Chaque compte a un identifiant interne `users.id` qui ne change jamais. L'e-mail n'est **pas** l'identifiant. Les moyens de connexion sont des lignes distinctes rattachées à `users.id` :
- `auth_identities` : identité Google (`subject` = le « sub » stable de Google). Une seule identité Google active par compte ; un « sub » ne peut être actif que sur un seul compte (index unique partiel). Une identité remplacée reste 72 h en base pour pouvoir annuler.
- `webauthn_credentials` : passkeys.
- `recovery_codes`, `security_questions` : moyens de récupération.
Deux comptes ne sont **jamais** fusionnés sur la seule base d'un e-mail identique.

### Tables créées (migration additive, aucune donnée supprimée)
`auth_identities`, `oauth_states`, `pending_signups`, `pending_links`, `security_questions`, `webauthn_credentials`, `auth_challenges`, `recovery_codes`, `auth_sessions`, `recovery_sessions`, `recovery_requests`, `security_events` ; colonnes `users.username`, `users.auth_complete`. Le schéma s'applique automatiquement au déploiement (`db/schema.sql`). Retour arrière : supprimer ces tables et colonnes (les comptes existants ne sont pas touchés).

### Routes (`/api/…`)
Publiques : `GET /auth/config`, `GET /auth/google/start`, `GET /auth/google/callback`, `GET /auth/signup/pending`, `POST /auth/signup/complete`, `POST /auth/passkeys/login/{options,verify}`, `POST /auth/recovery/*`.
Avec session : `GET /auth/security`, `GET /auth/sessions`, `DELETE /auth/sessions/:id`, `POST /auth/sessions/revoke-others`, `POST /auth/logout`, `POST /auth/profile/complete`, `POST /auth/reauth/{passkey/options,passkey/verify,recovery-code}`, `POST /auth/passkeys/register/{options,verify}`, `DELETE /auth/passkeys/:id`, `POST /auth/security/questions`, `POST /auth/security/recovery-codes[/revoke]`, `GET|POST /auth/google/link/{pending,confirm,undo}`, `POST /auth/security/recovery-requests/:id/cancel`.
Administration : `GET /admin/recovery-requests`, `POST /admin/recovery-requests/:id/decide`.

## 2. Configuration Google Cloud (à faire par le propriétaire)
1. https://console.cloud.google.com → créez un projet « EVENT509 ».
2. **API et services → Écran de consentement OAuth** : type **Externe**, nom « EVENT509 », e-mail d'assistance, logo, domaine du site, liens vers `/cgu` et `/confidentialite`. Portées : `openid`, `email`, `profile` (rien d'autre). Passez l'application en **Production** (en mode « Test », seuls les testeurs déclarés peuvent se connecter). Les portées de base n'exigent pas de vérification approfondie.
3. **Identifiants → Créer des identifiants → ID client OAuth** : type **Application Web**.
   - Origines JavaScript autorisées : `https://<votre-site>` (facultatif, aucun script Google n'est chargé dans le navigateur).
   - **URI de redirection autorisés** : exactement `https://<votre-site>/api/auth/google/callback`.
4. Copiez l'ID client → `GOOGLE_CLIENT_ID`, le secret → `GOOGLE_CLIENT_SECRET` (Vercel uniquement), et l'URI → `GOOGLE_REDIRECT_URI`.
5. Vercel → Settings → Environment Variables : ajoutez ces trois variables, puis déployez. Tant qu'elles manquent, rien ne change sur le site.
6. Essai : « Continuer avec Google » avec un compte Google ; vous arrivez sur « Terminez votre inscription ».

### Validation du jeton d'identité (serveur)
Signature RS256 avec les clés publiques de Google (JWKS, mises en cache 1 h) ; émetteur `https://accounts.google.com` ; audience = votre ID client ; expiration ; nonce lié à la demande ; `sub` présent ; e-mail **vérifié** par Google. Flux « Authorization Code » avec PKCE (S256), `state` à usage unique (10 min) lié au navigateur par un cookie, secret Google jamais envoyé au navigateur, mot de passe Google jamais vu.

## 3. Inscription et profil
- Nouvel utilisateur : une **inscription provisoire** (24 h, `pending_signups`) n'est pas un compte. Le formulaire est prérempli (prénom, nom, e-mail Google non modifiable, pays et ville déduits de la connexion). Pas de date de naissance ni de téléphone demandés.
- Le compte n'est créé qu'avec : profil + **trois questions de sécurité** + acceptation des conditions + acceptation de la politique de confidentialité, en **une seule transaction** (compte, organisation, identité Google, questions). Deux validations simultanées ne créent qu'un compte (testé).
- Une invitation d'équipe en attente pour cette adresse est honorée (le compte rejoint l'organisation invitée), comme avant.

## 4. Sessions et sécurité transverse
- Cookie `__Host-e509_session` : **HttpOnly, Secure, SameSite=Lax**, secret aléatoire de 256 bits, seule l'empreinte SHA-256 est en base ; 30 jours maximum, 14 jours sans usage ; révocable (page « Mes appareils et sessions »). Aucun jeton d'authentification n'est donné au navigateur.
- **CSRF** : toute requête qui modifie des données avec un cookie doit porter l'en-tête `X-E509-CSRF: 1` (impossible à envoyer depuis un autre site) et, si `Origin` est fourni, il doit être celui du site.
- **Réauthentification récente (10 min)** exigée pour : ajout/suppression de passkey, génération/révocation de codes, remplacement des questions, changement de compte Google, annulation d'un changement, décisions d'administration. Moyens : Google (même compte), passkey ou code de récupération.
- **Limites** : par IP et par compte pour la connexion, les parcours de récupération (5 essais par tentative, verrouillage 30 min, 10 échecs/h par compte, 20/h par IP), les demandes d'assistance (3/jour/IP), la génération de codes (5/jour).
- **Anti-énumération** : la récupération répond de la même façon pour un compte inconnu ; les méthodes configurées et les questions ne sont jamais révélées avant un premier facteur valide.
- **Journal** `security_events` (jamais de secret) + notifications (application et e-mail du compte) pour : nouvelle passkey, passkey supprimée, Google associé/remplacé/annulé, code de récupération utilisé, demande de récupération, récupération terminée, sessions révoquées.
- Un compte au profil incomplet n'a accès qu'aux routes `/auth/*` (session « limitée », contrôlée par le serveur).

## 5. Comptes existants (migration progressive)
- Aucun compte n'est supprimé ni modifié ; billets, événements, rôles, permissions, équipes et historique restent rattachés au même `users.id`.
- Un ancien compte se connecte via **« J'ai un ancien compte »** (`/connexion/ancien`, e-mail + mot de passe, désormais avec une session par cookie), puis **Sécurité → Associer mon compte Google** (preuve de contrôle des deux identités : mot de passe + connexion Google). Ensuite il complète ses questions de sécurité et ses acceptations, et le mot de passe ne sert plus (la connexion par mot de passe est refusée pour un compte associé à Google).
- Google avec un e-mail déjà utilisé par un ancien compte : **aucune fusion**, message demandant d'associer depuis le compte.
- L'inscription par e-mail est désactivée (410) dès que Google est configuré.

## 6. Application Android — point d'attention
Google **refuse** la connexion OAuth dans une WebView (règle de Google : `disallowed_useragent`). Conformément aux règles du projet, aucun contournement n'est fait (pas de faux user-agent) : dans l'application, le bouton Google n'est pas affiché et la page propose la passkey (si l'appareil la prend en charge dans la WebView), l'ancienne connexion, ou d'ouvrir EVENT509 dans le navigateur. Pour offrir Google dans l'application il faudra une évolution du dépôt de l'application : ouverture de la connexion dans un onglet navigateur (Custom Tabs) puis retour par lien profond avec un code à usage unique échangé contre une session dans la WebView. Non fait ici.

## 7. Déploiement
1. Définir `GOOGLE_*` dans Vercel (voir §2). `JWT_SECRET` doit déjà exister.
2. Déployer : le schéma additif s'applique tout seul.
3. Vérifier `GET /api/auth/config` → `{"google": true}`.
4. Les anciens comptes (dont celui de l'administrateur) associent Google depuis **Sécurité** ; l'administrateur crée ensuite ses codes de récupération et une passkey.
