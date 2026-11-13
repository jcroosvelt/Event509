/**
 * Textes juridiques par défaut (documents « Event509 – Documents légaux », 15 novembre 2026).
 * Ils sont modifiables par l'administrateur (Administration > Contenu et réglages) ; ce fichier sert de point de départ
 * et de texte de repli (« Rétablir le texte d'origine »).
 *
 * Format : « # » titre du document, « > » ligne de mise à jour, « ## » titre de section, « - » puce, sinon paragraphe.
 * Les valeurs entre doubles accolades ({{email}}, {{commission}}…) viennent des réglages de l'administrateur.
 */
import type { Lang } from '@/types';

export type LegalDoc = 'terms' | 'privacy' | 'refund';
export const LEGAL_DOCS: LegalDoc[] = ['terms', 'privacy', 'refund'];

export const legalDefaults: Record<LegalDoc, Record<Lang, string>> = {
  terms: {
    fr: `# Conditions d’utilisation
> Dernière mise à jour : 15 novembre 2026

## 1. Présentation

Event509 est une plateforme en ligne qui permet à des organisateurs de créer et de promouvoir des événements, et à des participants d’acheter des billets. Le service est édité par JC Multimedia, établie à {{address}}, Haïti. Contact : {{email}}.

En créant un compte ou en utilisant Event509, tu acceptes les présentes conditions. Si tu n’es pas d’accord, n’utilise pas l’application.

## 2. Rôle d’Event509

Event509 est un intermédiaire technique. Nous ne sommes pas l’organisateur des événements publiés sur la plateforme. Le contrat de vente du billet est conclu directement entre l’organisateur et le participant. Event509 fournit l’outil de publication, de vente, de paiement et de contrôle d’accès.

## 3. Compte utilisateur
- Les informations fournies doivent être exactes et à jour.
- Tu es responsable de la confidentialité de ton mot de passe et de toute activité faite depuis ton compte.
- Un compte est personnel. Il ne peut être ni vendu ni cédé.

## 4. Pour les participants
- Les prix sont affichés en gourdes (HTG) ou en dollars américains (USD), selon l’événement. Les frais de service éventuels sont indiqués avant le paiement.
- La commande est confirmée seulement après réception du paiement. Un billet électronique (code QR) est alors envoyé par l’application et par {{sendChannel}}.
- Chaque billet est valable une seule fois. Un billet copié, falsifié ou déjà utilisé sera refusé à l’entrée.
- Tu dois respecter le règlement de l’événement et les consignes de sécurité du lieu. L’organisateur peut refuser l’entrée en cas de comportement dangereux ou de non-respect des règles.
- La revente d’un billet est autorisée, à condition que le prix demandé ne dépasse pas le prix d’origine de plus de {{resalePercent}} %. Au-delà de cette limite, Event509 peut annuler les billets concernés sans remboursement.

## 5. Pour les organisateurs
- Tu dois fournir des informations vraies sur ton événement : date, lieu, programme, prix, conditions d’accès.
- Tu garantis que tu as le droit d’organiser cet événement et que tu as toutes les autorisations nécessaires (lieu, autorités, droits d’auteur, etc.).
- Tu es seul responsable du déroulement de l’événement, de la sécurité des participants et du respect des lois en vigueur.
- Tu fixes ta politique d’annulation, dans le respect de la politique de remboursement d’Event509.
- Les fonds des ventes te sont versés selon le calendrier indiqué dans ton espace organisateur, après déduction de la commission d’Event509 ({{commission}} % + frais de paiement). Event509 peut retenir un versement en cas de fraude suspectée, de litige ou d’annulation de l’événement.
- Tu dois verser toi-même tes impôts et taxes sur tes revenus.

## 6. Paiements

Les paiements se font par les moyens affichés dans l’application ({{payments}}). Ils sont traités par des prestataires tiers. Event509 ne conserve pas les données complètes de ta carte bancaire.

## 7. Contenus interdits

Il est interdit de publier un événement ou un contenu :
- illégal, frauduleux ou trompeur ;
- qui incite à la haine, à la violence ou à la discrimination ;
- à caractère pornographique ou qui exploite des mineurs ;
- qui porte atteinte aux droits d’autrui (propriété intellectuelle, vie privée, image) ;
- qui promeut des activités dangereuses ou illégales.

Event509 peut retirer tout événement ou suspendre tout compte qui ne respecte pas ces règles, sans préavis.

## 8. Propriété intellectuelle

L’application, son nom, son logo et son design appartiennent à JC Multimedia. Les organisateurs gardent leurs droits sur leurs contenus, mais accordent à Event509 le droit de les afficher et de les promouvoir sur la plateforme.

## 9. Limitation de responsabilité

Event509 ne peut pas être tenu responsable :
- de l’annulation, du report ou du mauvais déroulement d’un événement ;
- des dommages, blessures ou pertes survenus pendant un événement ;
- des interruptions du service dues à des pannes d’internet, d’électricité ou à des cas de force majeure.

Dans les limites permises par la loi, notre responsabilité est limitée au montant payé pour la commande concernée.

## 10. Suspension et fermeture de compte

Tu peux fermer ton compte à tout moment. Nous pouvons suspendre ou supprimer un compte en cas de violation de ces conditions ou de fraude.

## 11. Modification des conditions

Nous pouvons modifier ces conditions. Les changements importants seront annoncés dans l’application. Continuer à utiliser Event509 après la modification vaut acceptation.

## 12. Loi applicable et litiges

Ces conditions sont régies par les lois de la République d’Haïti. Nous cherchons d’abord une solution à l’amiable. À défaut, le litige sera porté devant les autorités compétentes de Port-au-Prince, notamment le Parquet de Port-au-Prince, ou toute autre autorité compétente.`,
    en: `# Terms of use
> Last updated: November 15, 2026

## 1. Introduction

Event509 is an online platform that lets organizers create and promote events, and lets attendees buy tickets. The service is published by JC Multimedia, based at {{address}}, Haiti. Contact: {{email}}.

By creating an account or using Event509, you accept these terms. If you do not agree, do not use the application.

## 2. Event509's role

Event509 is a technical intermediary. We are not the organizer of the events published on the platform. The ticket sale contract is concluded directly between the organizer and the attendee. Event509 provides the tool for publishing, selling, payment and access control.

## 3. User account
- The information you provide must be accurate and up to date.
- You are responsible for keeping your password confidential and for all activity carried out from your account.
- An account is personal. It cannot be sold or transferred.

## 4. For attendees
- Prices are displayed in gourdes (HTG) or US dollars (USD), depending on the event. Any service fees are shown before payment.
- An order is confirmed only after payment is received. An electronic ticket (QR code) is then sent through the application and by {{sendChannel}}.
- Each ticket is valid only once. A copied, forged or already used ticket will be refused at the entrance.
- You must follow the event's rules and the venue's safety instructions. The organizer may refuse entry in case of dangerous behavior or failure to follow the rules.
- Resale of a ticket is allowed, provided that the asking price does not exceed the original price by more than {{resalePercent}} %. Beyond this limit, Event509 may cancel the tickets concerned without refund.

## 5. For organizers
- You must provide truthful information about your event: date, venue, program, prices, access conditions.
- You guarantee that you have the right to organize this event and that you hold all necessary authorizations (venue, authorities, copyright, etc.).
- You are solely responsible for how the event is run, for the safety of attendees and for compliance with applicable laws.
- You set your cancellation policy, in compliance with Event509's refund policy.
- Sales proceeds are paid to you according to the schedule shown in your organizer area, after deduction of Event509's commission ({{commission}} % + payment fees). Event509 may withhold a payout in case of suspected fraud, a dispute or the cancellation of the event.
- You must pay your own taxes and duties on your income.

## 6. Payments

Payments are made through the methods shown in the application ({{payments}}). They are processed by third-party providers. Event509 does not keep your full bank card data.

## 7. Prohibited content

It is forbidden to publish an event or content that is:
- illegal, fraudulent or misleading;
- inciting hatred, violence or discrimination;
- pornographic or exploiting minors;
- infringing the rights of others (intellectual property, privacy, image);
- promoting dangerous or illegal activities.

Event509 may remove any event or suspend any account that does not comply with these rules, without notice.

## 8. Intellectual property

The application, its name, logo and design belong to JC Multimedia. Organizers keep their rights over their content, but grant Event509 the right to display and promote it on the platform.

## 9. Limitation of liability

Event509 cannot be held liable for:
- the cancellation, postponement or poor running of an event;
- damage, injury or loss occurring during an event;
- service interruptions caused by internet or power outages or force majeure.

Within the limits permitted by law, our liability is limited to the amount paid for the order concerned.

## 10. Suspension and account closure

You may close your account at any time. We may suspend or delete an account in case of violation of these terms or fraud.

## 11. Changes to the terms

We may change these terms. Important changes will be announced in the application. Continuing to use Event509 after a change means you accept it.

## 12. Governing law and disputes

These terms are governed by the laws of the Republic of Haiti. We first seek an amicable solution. Failing that, the dispute will be brought before the competent authorities of Port-au-Prince, in particular the Public Prosecutor's Office of Port-au-Prince, or any other competent authority.`,
  },
  privacy: {
    fr: `# Politique de confidentialité
> Dernière mise à jour : 15 novembre 2026

## 1. Qui est responsable de tes données

JC Multimedia, éditeur d’Event509, {{address}}. Contact : {{email}}.

## 2. Données que nous collectons
- Compte : nom, prénom, email, numéro de téléphone, mot de passe (chiffré).
- Commandes : événements achetés, billets, montants, moyen de paiement utilisé (sans les numéros complets de carte).
- Organisateurs : informations de l’organisation, coordonnées de paiement pour les versements, pièce d’identité si nécessaire pour vérifier le compte.
- Données techniques : type d’appareil, système, adresse IP, journaux de connexion, pages consultées.
- Localisation : seulement si tu l’autorises, pour proposer des événements près de toi.

## 3. Pourquoi nous les utilisons
- Créer et gérer ton compte.
- Traiter les commandes, envoyer les billets et gérer les remboursements.
- Verser les fonds aux organisateurs.
- Contrôler l’accès aux événements (scan des billets).
- Prévenir la fraude et sécuriser la plateforme.
- T’envoyer des messages sur tes commandes, et, si tu es d’accord, des offres et nouveautés.
- Améliorer l’application.

## 4. Avec qui nous les partageons
- L’organisateur de l’événement que tu as acheté : nom, email et informations de billet, pour la gestion de l’événement.
- Les prestataires de paiement et de services techniques (hébergement, envoi d’emails/SMS).
- Les autorités, si la loi l’exige.

Nous ne vendons pas tes données personnelles.

## 5. Conservation

Nous gardons tes données tant que ton compte est actif, puis pendant {{retention}} ans après sa fermeture pour respecter nos obligations légales et comptables. Après cela, elles sont supprimées ou rendues anonymes.

## 6. Sécurité

Nous utilisons des mesures raisonnables pour protéger tes données : connexion chiffrée, mots de passe chiffrés, accès limité. Aucun système n’est sûr à 100 %, mais nous faisons le nécessaire pour réduire les risques. Garde ton mot de passe secret.

## 7. Tes droits

Tu peux demander à :
- accéder à tes données ;
- les corriger ;
- les supprimer ;
- retirer ton consentement aux messages promotionnels (lien de désinscription dans chaque message).

Écris-nous à {{email}}. Nous répondons dans un délai de {{replyDays}} jours.

## 8. Cookies et outils de mesure

L’application peut utiliser des cookies et des outils de mesure pour son bon fonctionnement et pour comprendre comment elle est utilisée. Tu peux les refuser dans les paramètres de ton appareil.

## 9. Modifications

Nous pouvons mettre à jour cette politique. Les changements importants te seront signalés dans l’application.`,
    en: `# Privacy policy
> Last updated: November 15, 2026

## 1. Who is responsible for your data

JC Multimedia, publisher of Event509, {{address}}. Contact: {{email}}.

## 2. Data we collect
- Account: last name, first name, email, phone number, password (encrypted).
- Orders: events purchased, tickets, amounts, payment method used (without full card numbers).
- Organizers: organization information, payment details for payouts, identity document if needed to verify the account.
- Technical data: device type, system, IP address, connection logs, pages viewed.
- Location: only if you allow it, to suggest events near you.

## 3. Why we use it
- To create and manage your account.
- To process orders, send tickets and handle refunds.
- To pay out funds to organizers.
- To control access to events (ticket scanning).
- To prevent fraud and secure the platform.
- To send you messages about your orders and, if you agree, offers and news.
- To improve the application.

## 4. Who we share it with
- The organizer of the event you bought: name, email and ticket information, to manage the event.
- Payment and technical service providers (hosting, email/SMS sending).
- The authorities, if the law requires it.

We do not sell your personal data.

## 5. Retention

We keep your data as long as your account is active, then for {{retention}} years after it is closed to meet our legal and accounting obligations. After that, it is deleted or anonymized.

## 6. Security

We use reasonable measures to protect your data: encrypted connection, encrypted passwords, limited access. No system is 100% secure, but we do what is necessary to reduce risks. Keep your password secret.

## 7. Your rights

You can ask to:
- access your data;
- correct it;
- delete it;
- withdraw your consent to promotional messages (unsubscribe link in each message).

Write to us at {{email}}. We reply within {{replyDays}} days.

## 8. Cookies and measurement tools

The application may use cookies and measurement tools for it to work properly and to understand how it is used. You can refuse them in your device settings.

## 9. Changes

We may update this policy. Important changes will be reported to you in the application.`,
  },
  refund: {
    fr: `# Politique de remboursement
> Dernière mise à jour : 15 novembre 2026

## 1. Principe général

Les billets achetés sur Event509 sont non remboursables, sauf dans les cas prévus ci-dessous. Chaque organisateur peut proposer une politique plus généreuse, qui sera affichée sur la page de son événement avant l’achat.

## 2. Événement annulé

Si l’organisateur annule l’événement, tu es remboursé intégralement (prix du billet + frais de service). Le remboursement est lancé automatiquement dans un délai de {{refundDelay}} jours ouvrables, sur le moyen de paiement utilisé.

## 3. Événement reporté ou modifié
- Si l’événement est reporté, ton billet reste valable pour la nouvelle date.
- Si la nouvelle date ne te convient pas, tu peux demander un remboursement dans les {{postponeDays}} jours suivant l’annonce du report.
- Si le lieu, l’artiste principal ou le contenu change de façon importante, la même règle s’applique.

## 4. Remboursement à la demande du participant

Sauf indication contraire de l’organisateur, il n’y a pas de remboursement si :
- tu changes d’avis ou tu n’es plus disponible ;
- tu arrives en retard ou tu ne te présentes pas ;
- l’entrée t’est refusée pour comportement ou non-respect du règlement ;
- ton billet a été perdu, partagé ou copié.

Si l’organisateur propose une politique de remboursement (par exemple jusqu’à {{organizerRefundDays}} jours avant l’événement), elle s’applique, et les frais de service Event509 ne sont pas remboursés dans ce cas.

## 5. Erreurs et paiements en double

Si tu as été débité deux fois, ou si tu as été facturé un montant incorrect à cause d’une erreur technique, contacte-nous dans les {{errorHours}} heures. Nous vérifions et te remboursons la somme en trop.

## 6. Billet frauduleux ou non valide

Si un billet acheté sur Event509 est refusé à l’entrée alors que tu es le premier acheteur légitime, écris-nous avec ta preuve d’achat. Après vérification, nous te remboursons ou nous réglons le problème avec l’organisateur.

## 7. Comment demander un remboursement
- Écris à {{email}} ou utilise le bouton « Aide » dans l’application.
- Indique ton nom, le numéro de commande et la raison de ta demande.
- Nous répondons dans un délai de {{supportDays}} jours ouvrables.

## 8. Délais et moyen de remboursement

Le remboursement se fait sur le moyen de paiement d’origine ({{payments}}). Le délai peut varier selon ton opérateur ou ta banque, après notre validation.

## 9. Conséquences pour l’organisateur

Quand un remboursement est dû à cause d’une annulation ou d’une faute de l’organisateur, le montant est déduit de ses versements. S’il a déjà été payé, Event509 peut lui réclamer la somme.`,
    en: `# Refund policy
> Last updated: November 15, 2026

## 1. General principle

Tickets bought on Event509 are non-refundable, except in the cases provided below. Each organizer may offer a more generous policy, which will be shown on their event page before purchase.

## 2. Cancelled event

If the organizer cancels the event, you are refunded in full (ticket price + service fees). The refund is started automatically within {{refundDelay}} business days, to the payment method used.

## 3. Postponed or changed event
- If the event is postponed, your ticket remains valid for the new date.
- If the new date does not suit you, you can request a refund within {{postponeDays}} days of the postponement announcement.
- If the venue, the main artist or the content changes significantly, the same rule applies.

## 4. Refund at the attendee's request

Unless the organizer states otherwise, there is no refund if:
- you change your mind or are no longer available;
- you arrive late or do not show up;
- you are refused entry for behavior or failure to follow the rules;
- your ticket was lost, shared or copied.

If the organizer offers a refund policy (for example up to {{organizerRefundDays}} days before the event), it applies, and Event509 service fees are not refunded in that case.

## 5. Errors and double payments

If you were charged twice, or billed an incorrect amount because of a technical error, contact us within {{errorHours}} hours. We check and refund the excess amount.

## 6. Fraudulent or invalid ticket

If a ticket bought on Event509 is refused at the entrance even though you are the first legitimate buyer, write to us with your proof of purchase. After verification, we refund you or settle the problem with the organizer.

## 7. How to request a refund
- Write to {{email}} or use the "Help" button in the application.
- Give your name, the order number and the reason for your request.
- We reply within {{supportDays}} business days.

## 8. Timing and refund method

The refund is made to the original payment method ({{payments}}). The timing may vary depending on your operator or your bank, after our validation.

## 9. Consequences for the organizer

When a refund is due because of a cancellation or a fault of the organizer, the amount is deducted from their payouts. If they have already been paid, Event509 may claim the amount from them.`,
  },
};
