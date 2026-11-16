# Rapport de sécurité EVENT509 — synthèse

Périmètre : site (React/Vite, API Vercel, Postgres Neon) ; application Android (WebView) en lecture seulement. Audit statique + tests locaux ; aucune opération sur la production (une lecture de la table `security_events` et de la configuration Neon a servi au diagnostic de la connexion Google et des sauvegardes).

## Résultats
| Gravité | Trouvées | Corrigées et vérifiées | Restantes |
|---|---|---|---|
| Critique | 2 (C1 revente sans paiement, C2 PayPal « payé » sans paiement) | 2 (fermées en production, échec fermé) | 0 (fonctionnalités à reconstruire : R5, R6) |
| Haute | 5 (XSS stocké, modération, dépendances, en-têtes/CSP, sessions OTP) | 5 | 0 (réf. R1 sauvegardes classée haute, voir ci-dessous) |
| Moyenne | 9 (M1–M9) | 7 (M1–M6, M8) | 2 : M7 rôle BD unique, M9 sauvegardes 6 h (config Neon, non faite par moi) |
| Basse | 7 | 4 (L1, L2, L7, partiellement L3) | 3 (L3, L4, L5) |
| Info | 3 | 0 | 3 |

« Corrigé » = test automatique ou revue indiquée dans `SECURITY_FIXES.md`.

## Vérifications exécutées (dernière exécution, branche `securite`)
- `npm run typecheck`, `npm run lint`, `npm run i18n:check` : propres.
- `npm test` : 105 réussis.
- `npm run test:api` (Postgres local) : 75 réussis (dont 21 nouveaux tests de sécurité).
- `npm run build` + Playwright : 81 réussis, 1 ignoré (bureau + mobile, accessibilité, en-têtes/CSP).
- `npm audit --omit=dev` : 2 avis modérés restants (react-router, correctif en v7 seulement).

## JWT / secrets / journaux / sauvegardes (demande de Joseph)
- **JWT** : correct (HS256 recalculé, `alg:none` et jeton falsifié/expiré/autre clé refusés — testés ; secret ≥ 32 car. exigé ; révocation à la déconnexion et au changement de mot de passe). Réserve : 30 jours de validité pour les anciens comptes ; les nouveaux comptes n'utilisent pas de JWT.
- **Secrets** : aucun dans le code ni dans tout l'historique git. Les valeurs réelles ne sont que dans Vercel.
- **Journaux** : structurés, IP masquée, sans mot de passe/code/jeton (testé).
- **Sauvegardes** : **point faible** — 6 h de rétention, aucun instantané. À corriger côté Neon (`SECURITY_CONFIGURATION.md` §3).

## Actions externes pour Joseph
1. Neon : augmenter la rétention, créer un instantané, tester une restauration.
2. Vercel : vérifier `JWT_SECRET` (≥ 48 car.), variables en « Sensitive ».
3. GitHub : Secret scanning + Push protection, Dependabot, CodeQL, protection de `main`.
4. Rôle BD à moindres privilèges (SQL fourni, non exécuté).
5. Tester l'APK suivant pour la connexion Google.

## Déploiement
Les correctifs de la branche `securite` ne sont **pas** en production : le déploiement attend l'autorisation de Joseph (la production applique `db/schema.sql` au build ; aucun changement de schéma dans ces correctifs). Effets visibles après déploiement : revente d'occasion fermée, moyen PayPal refusé, paiement en ligne indisponible si la passerelle tombe (503), CSP stricte.

## Évaluation finale
Risque nettement réduit : les deux failles critiques (billets gratuits) et les XSS sont fermées et couvertes par des tests. Le risque principal restant n'est plus dans le code mais dans l'exploitation : **sauvegardes insuffisantes** et rôle base de données trop puissant. Aucune garantie d'absence de faille : audit sans test d'intrusion externe, sans passerelle de paiement réelle ni téléphone réel.
