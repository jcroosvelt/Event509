import { useApp } from '@/store/app';
import { useTitle } from '@/lib/hooks';
import { Card } from '@/components/ui';

// Modèles de textes juridiques : à faire relire et adapter par un juriste avant la mise en ligne.
type Doc = { title: string; updated: string; sections: { h: string; p: string[] }[] };

const terms: Record<'fr' | 'en', Doc> = {
  fr: {
    title: 'Conditions générales d’utilisation',
    updated: 'Dernière mise à jour : novembre 2026',
    sections: [
      { h: '1. Objet', p: ['Event509 est une plateforme qui permet à des organisateurs de publier des événements et de vendre des billets, et aux participants de les découvrir et de les acheter.'] },
      { h: '2. Compte', p: ['La création d’un compte est gratuite. Vous êtes responsable de la confidentialité de vos identifiants et des actions effectuées depuis votre compte.'] },
      { h: '3. Achat de billets', p: ['Le contrat de vente est conclu entre le participant et l’organisateur. Event509 agit en tant qu’intermédiaire technique et encaisse le paiement pour le compte de l’organisateur.', 'Des frais de service peuvent s’ajouter au prix du billet ; ils sont affichés avant le paiement.'] },
      { h: '4. Billets et QR codes', p: ['Chaque billet comporte un QR code unique, valable pour une seule entrée. Toute copie ou reproduction est inutile : le premier scan invalide le billet.'] },
      { h: '5. Remboursements', p: ['La politique de remboursement est fixée par chaque organisateur et indiquée sur la page de l’événement. En cas d’annulation d’un événement, les participants sont remboursés intégralement.'] },
      { h: '6. Transfert et revente', p: ['Un billet peut être transféré gratuitement ou revendu sur Event509, à un prix ne dépassant pas sa valeur faciale. La revente hors plateforme n’est pas garantie.'] },
      { h: '7. Organisateurs', p: ['L’organisateur garantit l’exactitude des informations publiées et la tenue de l’événement. Event509 peut retirer tout événement non conforme.'] },
      { h: '8. Litiges', p: ['En cas de désaccord avec un organisateur, le participant peut ouvrir un litige auprès d’Event509, qui assure une médiation.'] },
    ],
  },
  en: {
    title: 'Terms of use',
    updated: 'Last updated: November 2026',
    sections: [
      { h: '1. Purpose', p: ['Event509 is a platform that lets organizers publish events and sell tickets, and lets attendees discover and buy them.'] },
      { h: '2. Account', p: ['Creating an account is free. You are responsible for keeping your credentials confidential and for actions taken from your account.'] },
      { h: '3. Buying tickets', p: ['The sale contract is between the attendee and the organizer. Event509 acts as a technical intermediary and collects payment on the organizer’s behalf.', 'Service fees may be added to the ticket price; they are shown before payment.'] },
      { h: '4. Tickets and QR codes', p: ['Each ticket has a unique QR code valid for a single entry. Copies are useless: the first scan invalidates the ticket.'] },
      { h: '5. Refunds', p: ['Each organizer sets its own refund policy, shown on the event page. If an event is cancelled, attendees are refunded in full.'] },
      { h: '6. Transfer and resale', p: ['A ticket can be transferred for free or resold on Event509 at no more than its face value. Resale outside the platform is not guaranteed.'] },
      { h: '7. Organizers', p: ['Organizers guarantee that published information is accurate and that the event takes place. Event509 may remove any non-compliant event.'] },
      { h: '8. Disputes', p: ['If an attendee disagrees with an organizer, they can open a dispute with Event509, which provides mediation.'] },
    ],
  },
};

const privacy: Record<'fr' | 'en', Doc> = {
  fr: {
    title: 'Politique de confidentialité',
    updated: 'Dernière mise à jour : novembre 2026',
    sections: [
      { h: 'Données collectées', p: ['Nom, email, téléphone, historique d’achats, billets, et données techniques nécessaires au fonctionnement du service (appareil, langue).'] },
      { h: 'Utilisation', p: ['Envoyer vos billets et les informations sur vos événements, traiter les paiements, prévenir la fraude, et, si vous l’acceptez, vous recommander des événements.'] },
      { h: 'Partage', p: ['L’organisateur d’un événement reçoit le nom et l’email des participants à son événement. Les données de paiement sont traitées par nos prestataires (MonCash, NatCash, PayPal, banques) et ne sont pas stockées par Event509.'] },
      { h: 'Pixels et mesure d’audience', p: ['Les organisateurs peuvent activer des pixels (Facebook, Google Analytics) sur leurs pages événement pour mesurer leurs campagnes.'] },
      { h: 'Vos droits', p: ['Vous pouvez consulter, corriger ou supprimer vos données depuis Paramètres, ou en écrivant à privacy@event509.com.'] },
    ],
  },
  en: {
    title: 'Privacy policy',
    updated: 'Last updated: November 2026',
    sections: [
      { h: 'Data we collect', p: ['Name, email, phone, purchase history, tickets, and technical data required to run the service (device, language).'] },
      { h: 'How we use it', p: ['To send your tickets and event information, process payments, prevent fraud and, if you agree, recommend events.'] },
      { h: 'Sharing', p: ['An event organizer receives the name and email of attendees of their event. Payment data is handled by our providers (MonCash, NatCash, PayPal, banks) and is not stored by Event509.'] },
      { h: 'Pixels and analytics', p: ['Organizers may enable pixels (Facebook, Google Analytics) on their event pages to measure their campaigns.'] },
      { h: 'Your rights', p: ['You can view, correct or delete your data from Settings, or by writing to privacy@event509.com.'] },
    ],
  },
};

export default function Legal({ page }: { page: 'terms' | 'privacy' }) {
  const { lang } = useApp();
  const doc = (page === 'terms' ? terms : privacy)[lang];
  useTitle(doc.title);
  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 sm:px-6 lg:pt-12">
      <Card className="p-6 sm:p-10">
        <h1 className="text-3xl font-extrabold tracking-tight">{doc.title}</h1>
        <p className="mt-1 text-sm text-ink-muted">{doc.updated}</p>
        <div className="mt-8 space-y-6">
          {doc.sections.map((s) => (
            <section key={s.h}>
              <h2 className="text-lg font-bold">{s.h}</h2>
              {s.p.map((p) => <p key={p} className="mt-2 leading-relaxed text-ink-soft">{p}</p>)}
            </section>
          ))}
        </div>
      </Card>
    </div>
  );
}
