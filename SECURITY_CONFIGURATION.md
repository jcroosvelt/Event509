# Configuration de sécurité (à faire par Joseph — rien de tout cela n'a été fait à sa place)

## 1. JWT et secrets (vérifié dans le code)
- `JWT_SECRET` : 32 caractères minimum exigé (refus de démarrer sinon). HS256 recalculé côté serveur (l'en-tête `alg` n'est jamais cru : `none` refusé, testé), comparaison en temps constant, expiration 30 jours (anciens comptes seulement), révocation par `sessions_valid_from` (changement de mot de passe, déconnexion). Les nouveaux comptes utilisent un cookie `__Host-` (HttpOnly, Secure, SameSite=Lax), pas de JWT.
- **À faire** : vérifier dans Vercel que `JWT_SECRET` est long et aléatoire (≥ 48 caractères), distinct entre Production et Preview. Le même secret sert de poivre OTP/questions (`OTP_PEPPER`, `AUTH_PEPPER` peuvent être définis à part ; changer `JWT_SECRET` invalide les sessions et les codes en cours).
- Recherche de secrets dans les fichiers et tout l'historique git : aucun secret (seulement des exemples dans `.env.example`). Aucune clé `service_role`/Firebase dans le dépôt. Dépôt de l'application : seule `signing/debug.keystore` (voulu, projet).
- **À faire** : activer « Secret scanning » et « Push protection » dans GitHub → Settings → Code security (gratuit pour dépôt privé selon l'offre).
- Variables sensibles uniquement dans Vercel (Production, cochées « Sensitive ») : `DATABASE_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_SECRET`, `META_*`, `PAY_*`, `FIREBASE_SERVICE_ACCOUNT`, `RESEND_API_KEY`.

## 2. Journaux
- Les journaux de sécurité sont des lignes JSON dans les journaux Vercel (`log:"security"`) et la table `security_events` (connexions, échecs, récupérations). IP masquée ; jamais de mot de passe, code, jeton ni identifiant de paiement (testé S13).
- **À faire** : Vercel → Logs → conserver/exporter (la rétention gratuite est courte) ; créer une alerte sur `access_denied`/`rate_limited` en rafale si l'offre le permet.
- Reste à surveiller : quelques `console.error` consignent l'objet d'erreur d'un fournisseur (e-mail, push, paiement) ; ils ne contiennent pas de clé, mais peuvent contenir une adresse e-mail destinataire.

## 3. Sauvegardes de la base (constat — risque réel)
- Neon : `history_retention_seconds = 21600` (**6 heures** de restauration à un instant donné), **aucun instantané**, offre gratuite. Une suppression/corruption découverte après 6 h est irrécupérable.
- **À faire** : (a) Neon → Project settings → Storage → augmenter la rétention (offre payante : 7 jours ou plus) ; (b) Neon → Backup & restore → créer un instantané avant chaque déploiement important et programmer un instantané quotidien si l'offre le permet ; (c) à défaut, exporter régulièrement : `pg_dump "$DATABASE_URL" -Fc -f event509-AAAA-MM-JJ.dump` depuis un ordinateur, stockage chiffré hors de Neon ; (d) **tester** une restauration (nouvelle branche Neon) au moins une fois.
- Les fichiers (`files`) sont dans la base : inclus dans la sauvegarde.

## 4. Base de données : rôle à moindres privilèges (M7, non appliqué)
Le site se connecte avec le rôle propriétaire (DDL au déploiement + requêtes). Pour limiter les dégâts d'une faille : créer un rôle d'exécution et l'utiliser dans `DATABASE_URL` en production, en gardant le rôle propriétaire pour `npm run build` seulement (`DATABASE_URL_MIGRATE`, à introduire dans le script de build — **changement non fait**). SQL à exécuter dans Neon (après validation de Joseph) :
```sql
create role event509_app login password '<généré, à saisir seulement dans Neon/Vercel>';
grant usage on schema public to event509_app;
grant select, insert, update, delete on all tables in schema public to event509_app;
grant usage, select on all sequences in schema public to event509_app;
alter default privileges in schema public grant select, insert, update, delete on tables to event509_app;
```
Le script de schéma et la maintenance continueront d'utiliser le rôle propriétaire.

## 5. Vercel / GitHub
- Production : « Deployment Protection » pour les aperçus ; domaine personnalisé + HTTPS (HSTS est ajouté par Vercel).
- Le site a maintenant une CSP stricte : tout nouveau script externe (analytique, paiement) exige de l'autoriser dans `vercel.json`.
- GitHub : protéger la branche `main` (revue ou vérifications obligatoires), activer Dependabot (alertes + mises à jour de sécurité) et CodeQL (Security → Code scanning). Épingler les actions du dépôt de l'application par empreinte de commit (actuellement par étiquette).
- Google Cloud : limiter l'écran de consentement aux domaines nécessaires ; URI de redirection = uniquement `https://event509.vercel.app/api/auth/google/callback`.
- Meta/WhatsApp, passerelle de paiement : rotation des clés dès qu'une fuite est soupçonnée ; webhook Meta : signature `X-Hub-Signature-256` déjà vérifiée par le code.
