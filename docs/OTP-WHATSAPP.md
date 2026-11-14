# Codes de vérification WhatsApp (OTP) — Meta Cloud API

Vérification de numéro à l'inscription, mot de passe oublié et changement de mot de passe, par l'**API officielle WhatsApp Cloud de Meta** (aucun intermédiaire).

## 1. Ce qui est en place

| Élément | Fichier |
|---|---|
| Cœur (génération, hachage, limites, envoi Meta, routes) | `api/_lib/otp.ts` |
| Webhook de livraison (signature vérifiée) | `api/whatsapp-webhook.ts` (adresse `/api/whatsapp/webhook`) |
| Tables | `db/schema.sql` : `otp_verifications`, `otp_security_log`, colonne `users.sessions_valid_from` |
| Inscription (preuve du numéro) | `api/_lib/routes.ts` (`signup`) |
| Interface | `src/components/otp/OtpChallenge.tsx`, `Auth.tsx`, `ForgotPassword.tsx`, `Settings.tsx` |
| Tests | `api/otp.test.ts` (serveur), `src/components/otp/OtpChallenge.test.tsx` (interface) |
| Essai d'envoi réel | `scripts/otp-test-send.mjs` |

### Routes
| Route | Rôle |
|---|---|
| `GET /api/auth/otp/status` | `{enabled}` : le service est-il configuré ? |
| `POST /api/auth/otp/register/send` · `/verify` | numéro → code → **preuve signée** (30 min, liée au numéro) à présenter à `POST /api/auth/signup` (`phoneProof`) |
| `POST /api/auth/otp/forgot-password/send` · `/verify` | réponse **identique** que le compte existe ou non ; code bon → autorisation de réinitialisation (10 min, usage unique, n'ouvre aucune session) |
| `POST /api/auth/otp/reset-password` | autorisation + nouveau mot de passe |
| `POST /api/auth/otp/change-password/send` · `/verify` · `/confirm` | utilisateur connecté, code envoyé à **son** numéro vérifié ; `confirm` renvoie un nouveau jeton de session |

### Règles appliquées côté serveur
- Code à 6 chiffres (`crypto.randomInt`), stocké en **HMAC-SHA256** (lié à la ligne, au numéro et au motif), comparaison à temps constant.
- Valable **5 minutes** (échéance calculée par Postgres). Une nouvelle demande invalide l'ancien code.
- **3 demandes par 24 h glissantes**, partagées entre les trois motifs. Référence : le compte (`user_id`) **et** le numéro E.164 (un code demandé à l'inscription compte aussi pour le mot de passe oublié du même numéro). Un envoi refusé par Meta ne compte pas.
- Demandes simultanées : verrou consultatif Postgres (`pg_advisory_xact_lock`) autour du comptage et de l'insertion — testé avec 8 demandes parallèles (exactement 3 passent).
- **5 essais** par code ; le 5e échec invalide le code ; le 6e essai est refusé même avec le bon code. Chaque code ne sert qu'une fois.
- Limite supplémentaire de **10 demandes par heure et par adresse IP** (anti-abus, table `rate_events`).
- Numéros normalisés E.164 (`+509…`) ; un numéro local à 8 chiffres est considéré comme haïtien.
- Journal `otp_security_log` : jamais de code, numéros masqués (`+509••••56`), conservé 90 jours. Les lignes OTP de plus de 48 h sont supprimées à chaque nouvelle demande (aucune tâche planifiée à configurer).
- Après un changement de mot de passe, **toutes les sessions antérieures sont fermées** (`sessions_valid_from`) ; la session courante continue avec un nouveau jeton. (Les jetons sont comparés à la seconde : une session ouverte dans la même seconde que le changement n'est pas fermée.)
- Un numéro vérifié ne peut plus être modifié par `PATCH /auth/me`, et l'ancienne route `POST /auth/password` est refusée (403 `otp_required`) pour un compte au numéro vérifié.
- Le navigateur ne décide de rien : « vérifié » n'existe que si le serveur a accepté le code (preuve signée / champ `phoneVerified` posé par le serveur).

### Comportement tant que Meta n'est pas configuré
Sans `META_ACCESS_TOKEN` et `META_PHONE_NUMBER_ID`, le service est **désactivé** : les routes OTP répondent 503 (`otp_unavailable`), l'inscription et le changement de mot de passe fonctionnent comme avant (numéro facultatif, non vérifié) et le mot de passe oublié reste « non disponible ». Dès que les deux variables existent, le numéro WhatsApp vérifié devient **obligatoire** pour s'inscrire. Il n'y a aucune solution de repli par email ou SMS (voulu).

Limite connue : les comptes déjà créés n'ont pas de numéro vérifié ; pour eux, le changement de mot de passe reste l'ancienne méthode (mot de passe actuel) et le mot de passe oublié par WhatsApp n'est pas possible. Une vérification du numéro depuis les paramètres du compte peut être ajoutée ensuite.

## 2. Ce que vous devez faire chez Meta

### 2.1 Application Meta et WhatsApp
1. https://developers.facebook.com → **Mes apps → Créer une app** → type **Entreprise** (Business).
2. Rattachez-la à votre **portefeuille d'entreprise** (Meta Business Suite). Pour écrire à de vrais utilisateurs, la **vérification de l'entreprise** (Business Verification) est nécessaire.
3. Dans l'app : **Ajouter un produit → WhatsApp → Configurer**.
4. **WhatsApp → Configuration de l'API** : ajoutez et vérifiez **votre numéro d'envoi** (un numéro qui n'est pas déjà utilisé sur l'application WhatsApp classique). Le numéro de test fourni par Meta ne peut écrire qu'à 5 numéros enregistrés.
5. Notez le **Phone Number ID** (→ `META_PHONE_NUMBER_ID`) et le **WhatsApp Business Account ID** (→ `META_WABA_ID`), tous deux affichés sur cette page.
6. **Paramètres de l'app → Général** : copiez le **Secret de l'app** (→ `META_APP_SECRET`).

(Les intitulés exacts des menus de Meta changent parfois ; suivez la documentation « WhatsApp Business Platform — Cloud API — Get started » si un libellé diffère.)

### 2.2 Jeton permanent
Le jeton temporaire de 24 h ne convient pas. Dans **Business Settings → Utilisateurs → Utilisateurs système** : créez un utilisateur système (rôle Admin), **attribuez-lui l'app et le compte WhatsApp** (contrôle total), puis **Générer un jeton** avec les permissions `whatsapp_business_messaging` et `whatsapp_business_management`, sans expiration. → `META_ACCESS_TOKEN`. Ne le collez jamais dans une conversation, dans le code ou dans Git.

### 2.3 Modèle de message (catégorie AUTHENTICATION)
**WhatsApp Manager → Modèles de messages → Créer** : catégorie **Authentification**, nom `event509_otp`, langue **Français** (`fr`).
- Corps : généré par Meta (« *{{1}} est votre code de vérification.* ») ; cochez **Ajouter l'avertissement de sécurité** (« Pour votre sécurité, ne le partagez avec personne »).
- Pied de page : **durée de validité du code = 5 minutes** (« Ce code expire dans 5 minutes »).
- Bouton : **Copier le code** (*COPY_CODE*).

Ou par l'API (remplacez les valeurs entre chevrons) :
```
curl -X POST "https://graph.facebook.com/v21.0/<META_WABA_ID>/message_templates" \
  -H "Authorization: Bearer <META_ACCESS_TOKEN>" -H "Content-Type: application/json" \
  -d '{"name":"event509_otp","language":"fr","category":"AUTHENTICATION","components":[
        {"type":"BODY","add_security_recommendation":true},
        {"type":"FOOTER","code_expiration_minutes":5},
        {"type":"BUTTONS","buttons":[{"type":"OTP","otp_type":"COPY_CODE","text":"Copier le code"}]}]}'
```
L'approbation prend de quelques minutes à quelques heures. Tant qu'il n'est pas **Approuvé**, Meta répond « modèle introuvable / non approuvé » (erreur 132001, traitée comme un échec d'envoi : aucun code n'est considéré comme envoyé). Si vous le créez sans bouton, mettez `META_OTP_COPY_BUTTON=false`. Si vous le créez dans une autre langue, adaptez `META_OTP_LANG` (ex. `en_US`).

Le serveur envoie le code dans le corps **et** dans le bouton (c'est ce que Meta exige pour un modèle d'authentification à bouton « Copier le code »).

### 2.4 Webhook (accusés de livraison — recommandé)
**WhatsApp → Configuration → Webhook → Modifier** :
- URL de rappel : `https://<votre-site>/api/whatsapp/webhook`
- Jeton de vérification : la valeur de `META_VERIFY_TOKEN`
- Abonnez-vous au champ **messages** (il porte aussi les états « envoyé / distribué / lu / échec »).

Les accusés servent à noter un échec de livraison (le code est alors invalidé et ne compte pas dans la limite). Les requêtes sans signature valide (`META_APP_SECRET`) sont rejetées (401).

## 3. Déploiement
1. Vercel → **Settings → Environment Variables** : ajoutez `META_ACCESS_TOKEN`, `META_PHONE_NUMBER_ID`, `META_WABA_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN`, `META_GRAPH_API_VERSION`, `META_OTP_TEMPLATE`, `META_OTP_LANG` (voir `.env.example`). `JWT_SECRET` doit déjà exister.
2. Déployez (le schéma de base, additif, s'applique automatiquement : nouvelles tables et une colonne).
3. Tant que le modèle n'est pas approuvé, ne définissez pas `META_ACCESS_TOKEN` : le service reste désactivé et l'inscription continue comme avant.

## 4. Tester l'envoi réel
1. Sur votre ordinateur : `META_ACCESS_TOKEN=… META_PHONE_NUMBER_ID=… node scripts/otp-test-send.mjs +509XXXXXXXX` → statut 200 et un message WhatsApp reçu. Une erreur affiche le code Meta (ex. 131030 : numéro non autorisé en mode test, 132001 : modèle non approuvé, 190 : jeton invalide).
2. Sur le site (avec les variables définies) : Inscription → étape 2 → « Recevoir le code sur WhatsApp » → saisir le code.
3. Mot de passe oublié → numéro d'un compte vérifié → code → nouveau mot de passe.
4. Paramètres → Changer le mot de passe (compte au numéro vérifié) → code → nouveau mot de passe.

## 5. Erreurs de Meta et ce que voit l'utilisateur
| Cas | Codes Meta (principaux) | Réponse |
|---|---|---|
| Numéro invalide | 100, 131009, 131021 | 422 `otp_invalid_number` |
| Utilisateur non joignable | 131026, 131030, 131047, 131049, 131050 | 422 `otp_unreachable` |
| Jeton / permissions | 190, 10, 200–299, HTTP 401/403 | 503 `otp_auth` (message générique) |
| Limite de débit Meta | 4, 80007, 130429, 131056, HTTP 429 | 503 `otp_rate_limit` |
| Modèle non approuvé / introuvable | 132000, 132001, 132005, 132007, 132012, 132015, 132016 | 503 `otp_template` |
| Panne temporaire | 1, 2, 131000, 131016, HTTP 5xx, délai dépassé (10 s) | 503 `otp_temporary` |
| Échec de livraison (webhook) | statut `failed` | code invalidé, ne compte pas |

Dans tous les cas d'échec, la ligne est marquée `send_failed`, le code est invalidé et **ne consomme pas** la limite quotidienne. Les détails techniques restent dans `otp_security_log` (code Meta, jamais le code OTP).

La correspondance entre codes d'erreur Meta et catégories vient de la documentation de Meta telle que je la connais ; elle n'a pas été confrontée à de vraies réponses de Meta. Tout code inconnu est traité comme une panne temporaire.

## 6. Coût Meta (estimation)
Les messages de catégorie **Authentification** sont facturés **par message envoyé**, au tarif du pays du destinataire (grille Meta, révisée régulièrement). **Je n'ai pas pu vérifier le tarif actuel pour Haïti** : consultez *WhatsApp Manager → Tarification* ou la grille officielle (« Pricing » de WhatsApp Business Platform) et remplacez le tarif ci-dessous.

Coût mensuel ≈ nombre de codes envoyés × tarif. Hypothèses d'illustration (non officielles) :

| Codes / mois | à 0,02 $ | à 0,03 $ | à 0,05 $ |
|---|---|---|---|
| 1 000 | 20 $ | 30 $ | 50 $ |
| 10 000 | 200 $ | 300 $ | 500 $ |
| 100 000 | 2 000 $ | 3 000 $ | 5 000 $ |

Plafond par personne : 3 codes par jour. Un envoi refusé par Meta n'est pas facturé. Les remises par volume de Meta, si applicables, ne sont pas incluses.

## 7. Sécurité — rappels
- Aucune clé dans le navigateur, dans les réponses de l'API ni dans les journaux (le journal n'enregistre ni code, ni jeton, ni numéro complet).
- Si un jeton a été exposé : révoquez-le (Business Settings → Utilisateurs système) et générez-en un nouveau.

## 8. Lancer les tests
- `npm test` : tests unitaires (numéros, hachage, classement des erreurs Meta, composants) — les tests d'intégration sont ignorés sans base.
- Intégration (base Postgres **jetable**, jamais la vraie) : `TEST_DATABASE_URL=postgres://… npm run test:api` — applique `db/schema.sql` avant, utilise un faux serveur Meta local (aucun vrai envoi).
