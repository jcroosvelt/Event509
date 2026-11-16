# Tests de sécurité

Exécutés **en local** (Postgres jetable, faux serveur de paiement/Google/Meta), jamais contre la production.

Commandes : `npm test` (unitaires), `TEST_DATABASE_URL=… npm run test:api` (intégration), `npm run build && npx playwright test --trace off` (navigateur).

## `api/security.test.ts`
| Test | Ce qu'il prouve |
|---|---|
| unitaire `safeWebUrl`/`boundedNumber` | `javascript:`, `data:`, `vbscript:`, `file:`, identifiants dans l'URL, guillemets/chevrons, trop long → refusés |
| unitaire `privateIp` + `checkWebhookUrl` | 30+ adresses locales/privées/réservées (IPv4, IPv6, mappée, NAT64, 6to4) refusées ; adresses publiques acceptées |
| S1 | toutes les routes `/org`, `/admin`, `/me`, sécurité de compte, plus les écritures sensibles : 401/403 (404) sans connexion |
| S2 / S2b | jeton falsifié, expiré, signé par une autre clé, `alg:none`, à usage précis, identifiant fourni par le navigateur ; ancien jeton après déconnexion |
| S3 / S3b | IDOR entre deux organisations (événements, promos, équipe, remboursements, versements), élévation de rôle par PATCH, membre sans permission, commandes/billets/validation d'entrée d'une autre organisation |
| S4 | téléversement : HTML/SVG/exécutable/PDF déguisés, taille, type inconnu, chemin `../`, octet nul, document d'identité privé |
| S5 | charges d'injection SQL sur recherche, connexion, promo, commande, fichiers, événements, signalements ; pas de détail technique dans les erreurs |
| S6 | prix/total/remise/statut envoyés par le navigateur ignorés ; quantités négatives/NaN/énormes ; moyen inconnu ; production sans passerelle (503) ; PayPal en production (422) |
| S7 | webhook falsifié sans effet ; commande payée seulement si la passerelle confirme ; rejeu parallèle idempotent ; échec libère les places ; références piégées |
| S8 | 8 acheteurs simultanés sur 3 billets = 3 ventes ; code promo à 1 usage sous 6 achats simultanés = 1 remise ; place numérotée vendue une fois |
| S9 | remboursements simultanés = 1 ; prix de revente invalides ; achat de revente fermé en production ; pas d'auto-achat |
| S10 | modération : non vérifié → en attente ; statuts libres refusés ; événement refusé non republié |
| S11 | prix négatif/texte, quotas, dates, devise, doublons, URL en ligne dangereuse, site web de l'organisateur, champs réservés au serveur |
| S12 | limites : 10 échecs/compte (même depuis plusieurs IP) → 429, 20/IP, promo 60/h, signalements, 30 commandes/h |
| S13 / S14 | pas de mot de passe/jeton dans `/me`, `/bootstrap`, journaux ; réponse identique compte inconnu/mauvais mot de passe ; temps comparable |

## Autres
- `api/auth.test.ts` (32 tests) : Google (PKCE, état, nonce), liaison navigateur, passkeys, codes de récupération, récupération assistée, CSRF, anciens comptes, retour application (21*, 17c, **17d**).
- `api/otp.test.ts` (23 tests) : OTP WhatsApp (usage unique, expiration, 5 essais, 3/24 h, révocation des sessions).
- e2e : en-têtes de sécurité et CSP (bureau et mobile) ; parcours fonctionnels (voir `SECURITY_REPORT.md` pour le résultat de la dernière exécution).

## Non testé
- Navigateur/téléphone réels pour la connexion Google dans l'APK (lien profond, onglet Chrome).
- WhatsApp Meta, passerelle de paiement réelle, e-mail (aucune clé en local ; des faux serveurs ont servi).
- Charge réelle / DoS (hors périmètre, interdit sur la production).
- Robustesse des en-têtes sur le domaine de production (vérifiée seulement en `vite preview`).
