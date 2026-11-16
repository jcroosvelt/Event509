# Correctifs de sécurité appliqués

Chaque correctif indique la vérification réellement exécutée (voir `SECURITY_TESTS.md`). « Vérifié » = couvert par un test automatique qui passe ; rien n'est marqué corrigé sans test.

| Réf. | Correctif | Fichiers | Vérification |
|---|---|---|---|
| C1 | Achat en revente fermé en production tant qu'il n'est pas relié à un paiement (503 `resale_unavailable`) ; achat de son propre billet refusé ; limite de débit | `api/_lib/routes.ts` | S9 |
| C2 | Un moyen non relié à une passerelle n'est plus jamais « payé » en production (422) ; passerelle absente → 503 ; la commande payante reste « en attente » tant que la passerelle ne confirme pas | `api/_lib/routes.ts` (`orderStatus`), `api/_lib/safety.ts` | S6, S7 |
| H1 | Adresses saisies (site web, lien « en ligne », réseaux) : http(s) seulement, contrôle serveur (`safeWebUrl`) **et** à l'affichage (`safeHref`) ; paramètre `next` : chemin interne seulement (`safeInternalPath`) | `api/_lib/safety.ts`, `src/lib/safeUrl.ts`, pages | S11 + unitaires |
| H2 | Le statut d'un événement n'est plus libre : publication → modération si l'organisateur n'est pas vérifié ; un événement refusé ne se republie pas seul | `routes.ts` (`setEventStatus`, `saveEvent`) | S10 |
| H3 | `react-router-dom` 6.30.6, `@simplewebauthn/server` 13.3.3 (reste : 2 avis modérés react-router, voir risques restants) | `package.json` | `npm audit` |
| H4 | CSP stricte (script `'self'` + empreinte du script de thème), `frame-ancestors 'none'`, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, COOP ; règle séparée pour le widget intégrable | `vercel.json`, `vite.config.ts` | e2e « sécurité du navigateur » |
| H5 | Changement/réinitialisation de mot de passe par code : toutes les sessions sont fermées ; déconnexion d'un ancien jeton : révoqué ; plus de jeton renvoyé aux sessions par cookie | `otp.ts`, `authflows.ts`, `Settings.tsx` | S2b, otp.test |
| M1 | Fusionné avec C2 (échec fermé en production) | — | S6 |
| M2 | Limites de débit : commandes, codes promo, signalements, clics, désinscription, vérification, webhook, appareils, changement de mot de passe, échecs de connexion par compte | `routes.ts`, `marketing.ts`, `premium.ts` | S12 |
| M3 | Validation de `saveEvent` : prix, quotas, quantités, dates, devise, doublons, longueurs ; ventes/vues/mise en avant tenues par le serveur | `routes.ts` | S11 |
| M4 | Webhooks sortants : toutes plages IPv4/IPv6 privées/réservées (y compris IPv4 mappée, NAT64, 6to4), port 443, connexion épinglée sur l'IP vérifiée (anti DNS-rebinding), sans redirection | `devapi.ts` | unitaires `privateIp`, adresses refusées |
| M5 | Suppression de compte : réauthentification récente exigée (session cookie) | `routes.ts` | auth.test 17b |
| M6 | Remboursement : verrou de ligne + contrôle de doublon + limite de débit | `routes.ts` | S9 |
| M8 | L'identifiant du code promo est celui de la ligne (compteur d'utilisation fiable) | `routes.ts` | S8 |
| L1 | Hachage factice pour un compte inconnu (temps comparable) ; réponse identique | `routes.ts` (`login`) | S13, S14 |
| L2 | Identifiant échappé ; plus de script en ligne dans les impressions (lancement depuis la page) | `Orders.tsx`, `printReport.ts`, `Subscription.tsx` | e2e |
| L7 | Plus de jeton écrit dans `localStorage` pour une session par cookie | `Settings.tsx` | revue + otp.test |
| — | Journalisation de sécurité structurée (401/403/429, échecs de paiement, connexions refusées) : IP masquée, jamais de mot de passe/code/jeton | `seclog.ts`, `handler.ts` | S13 |

## Correctif hors audit (demandé par Joseph)
Connexion Google dans l'APK : si le lien profond `event509://` ne s'ouvre pas depuis l'onglet du navigateur, l'application vérifie auprès du site (avec son secret PKCE) que la connexion est terminée, ferme l'onglet et termine dans la WebView. Test auth.test 17d (site). **Non testé sur un vrai téléphone.**
