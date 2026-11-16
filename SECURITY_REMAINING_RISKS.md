# Risques restants (non cachés)

| Réf. | Risque | Gravité | Pourquoi non corrigé | Action recommandée |
|---|---|---|---|---|
| R1 | Sauvegardes : 6 h de rétention, aucun instantané (M9) | **Haute** | Dépend de l'offre Neon (hors code) | `SECURITY_CONFIGURATION.md` §3 |
| R2 | Rôle base de données unique, sans RLS (M7) | Moyenne | Exige de séparer migration/exécution dans le build et un rôle Neon | `SECURITY_CONFIGURATION.md` §4 |
| R3 | 2 avis modérés `react-router` (v6 → corrigés seulement en v7, rupture) | Moyenne→Basse | Concernent surtout le rendu serveur (non utilisé) ; atténué par `safeInternalPath` | migrer vers v7 dans un chantier dédié |
| R4 | ~24 avis sur dépendances de développement (vitest, vite, esbuild, @vercel/node) | Basse | Hors production (outils de build/test) | mise à jour majeure planifiée |
| R5 | Revente (C1) fermée en production plutôt que « réparée » | Fonctionnelle | Le paiement d'un acheteur de revente et le versement au vendeur n'existent pas | construire le flux de paiement de revente puis rouvrir |
| R6 | Paiement PayPal non relié (C2) : refusé en production | Fonctionnelle | Pas de passerelle PayPal | n'activer qu'une fois intégré |
| R7 | Commandes « virement » en attente sans expiration (L5) | Basse | Choix métier (délai) | ajouter une expiration à 48–72 h |
| R8 | Codes ambassadeur non contrôlés (L4) | Basse | Statistiques seulement | valider le code à la commande |
| R9 | Visuels externes en https acceptés (L3) | Basse | Usage voulu ; la CSP limite aux images | héberger via `/files` |
| R10 | Épinglage DNS limité aux webhooks sortants | Basse | Autres appels sortants vers des hôtes fixes | — |
| R11 | `moderateEvent` (admin) accepte n'importe quel statut | Basse | Réservé aux administrateurs | liste blanche des statuts |
| R12 | Pas de CI/Dependabot/CodeQL, actions GitHub de l'app non épinglées, `debug.keystore` versionnée (I1–I2) | Info | Configuration GitHub | §5 de la configuration |
| R13 | Connexion Google dans l'APK : correctif (17d) testé côté site seulement, pas sur téléphone | À confirmer | Impossible ici | Joseph teste l'APK suivant |
| R14 | CSP : `style-src 'unsafe-inline'` (styles de la bibliothèque UI) | Basse | Retirer casse l'interface | migrer vers styles à empreinte |
| R15 | Journaux Vercel : rétention courte, pas d'alerte | Moyenne | Offre | export + alerte |
