import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Ticket } from 'lucide-react';
import { events } from '@/data/mock';
import { useApp } from '@/store/app';
import { useTitle } from '@/lib/hooks';
import { ButtonLink, EmptyState, PageHeader, Segmented } from '@/components/ui';
import { TicketCard } from '@/components/TicketCard';

export default function Wallet() {
  const { tickets, t, user } = useApp();
  useTitle(t('Mes billets'));
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');

  const now = new Date();
  const ev = (id: string) => events.find((x) => x.id === id);
  const isPast = (id: string) => {
    const e = ev(id);
    return e ? new Date(e.end) < now : false;
  };
  const isActive = (s: string) => s === 'valid' || s === 'resale';
  const list = tickets
    .filter((x) => (tab === 'past' ? isPast(x.eventId) || !isActive(x.status) : !isPast(x.eventId) && isActive(x.status)))
    .sort((a, b) => (ev(a.eventId)?.start ?? '').localeCompare(ev(b.eventId)?.start ?? ''));

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 sm:px-6 lg:pt-10">
      <PageHeader title={t('Mes billets')} subtitle={t('Présentez le QR code à l’entrée. Il reste disponible sans connexion.')} />
      {!user && (
        <p className="mb-5 rounded-2xl bg-brand-50 p-4 text-sm text-ink-soft">
          {t('Vous voyez les billets achetés sur cet appareil. Pour les retrouver partout, ouvrez le lien reçu par email, ou')}{' '}
          <Link to="/connexion?next=/billets" className="font-bold text-brand-ink">{t('connectez-vous')}</Link>.
        </p>
      )}
      <Segmented
        label={t('Période')}
        className="mb-6"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'upcoming', label: t('À venir') },
          { value: 'past', label: t('Passés et inactifs') },
        ]}
      />
      {list.length ? (
        <ul className="grid gap-4">
          {list.map((x) => <li key={x.id}><TicketCard ticket={x} linked={!!user} /></li>)}
        </ul>
      ) : (
        <EmptyState
          icon={<Ticket className="h-5 w-5" />}
          title={tab === 'upcoming' ? t('Aucun billet à venir') : t('Aucun billet passé')}
          body={t('Les billets que vous achetez apparaissent ici, même hors connexion.')}
          action={<ButtonLink to="/explorer">{t('Explorer les événements')}</ButtonLink>}
        />
      )}
    </div>
  );
}
