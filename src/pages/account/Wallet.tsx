import { useState } from 'react';
import { Ticket } from 'lucide-react';
import { events } from '@/data/mock';
import { useApp } from '@/store/app';
import { ButtonLink, EmptyState, PageHeader, Segmented } from '@/components/ui';
import { TicketCard } from '@/components/TicketCard';

const NOW = new Date('2026-11-08T12:00:00');

export default function Wallet() {
  const { tickets, user, t } = useApp();
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');

  if (!user)
    return (
      <div className="mx-auto max-w-xl px-4 pt-10">
        <EmptyState icon={<Ticket className="h-5 w-5" />} title="Connectez-vous pour voir vos billets" action={<ButtonLink to="/connexion">{t('nav.login')}</ButtonLink>} />
      </div>
    );

  const isPast = (id: string) => {
    const e = events.find((x) => x.id === id);
    return e ? new Date(e.end) < NOW : false;
  };
  const list = tickets
    .filter((x) => (tab === 'past' ? isPast(x.eventId) || x.status === 'used' : !isPast(x.eventId) && x.status !== 'used'))
    .sort((a, b) => (events.find((e) => e.id === a.eventId)?.start ?? '').localeCompare(events.find((e) => e.id === b.eventId)?.start ?? ''));

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 sm:px-6 lg:pt-10">
      <PageHeader title={t('nav.tickets')} subtitle="Présentez le QR code à l’entrée. Il fonctionne aussi sans connexion." />
      <Segmented
        className="mb-6"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'upcoming', label: 'À venir' },
          { value: 'past', label: 'Passés' },
        ]}
      />
      {list.length ? (
        <div className="grid gap-4">
          {list.map((x) => <TicketCard key={x.id} ticket={x} />)}
        </div>
      ) : (
        <EmptyState
          icon={<Ticket className="h-5 w-5" />}
          title={tab === 'upcoming' ? 'Aucun billet à venir' : 'Aucun billet passé'}
          body="Vos billets achetés apparaîtront ici."
          action={<ButtonLink to="/explorer">Explorer les événements</ButtonLink>}
        />
      )}
    </div>
  );
}
