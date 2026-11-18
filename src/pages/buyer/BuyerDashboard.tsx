import { Link } from 'react-router-dom';
import { CalendarDays, Heart, MapPin, Receipt, Ticket, Undo2, Wallet } from 'lucide-react';
import { events, organizers } from '@/data/mock';
import { useApp } from '@/store/app';
import { useTitle } from '@/lib/hooks';
import { convert, dateLong, moneyRaw, time } from '@/lib/format';
import { Avatar, ButtonLink, Card, EmptyState, PageHeader, StatCard } from '@/components/ui';
import { EventCard, EventCover } from '@/components/events';

/** Tableau de bord de l'acheteur : prochain événement, billets à venir, dépenses, favoris et organisateurs suivis. */
export default function BuyerDashboard() {
  const { user, tickets, orders, favorites, follows, t, lang } = useApp();
  useTitle(t('Mon espace'));
  const now = Date.now();
  const ev = (id: string) => events.find((e) => e.id === id);
  const active = tickets.filter((x) => x.status === 'valid' || x.status === 'resale');
  const upcoming = active
    .map((x) => ({ ticket: x, event: ev(x.eventId) }))
    .filter((x) => x.event && new Date(x.event.end).getTime() >= now)
    .sort((a, b) => a.event!.start.localeCompare(b.event!.start));
  const nextUp = upcoming[0];
  const upcomingEvents = [...new Map(upcoming.map((x) => [x.event!.id, x])).values()];
  const paid = orders.filter((o) => o.status === 'paid' || o.status === 'partially_refunded');
  const spent = paid.reduce((a, o) => a + convert(o.total, o.currency, 'HTG'), 0);
  const refunds = orders.filter((o) => o.refundRequest);
  const favEvents = favorites.map(ev).filter((e): e is NonNullable<typeof e> => !!e && new Date(e.end).getTime() >= now).slice(0, 3);
  const followed = follows.map((id) => organizers.find((o) => o.id === id)).filter((o): o is NonNullable<typeof o> => !!o);
  const days = nextUp ? Math.max(0, Math.ceil((new Date(nextUp.event!.start).getTime() - now) / 86_400_000)) : 0;
  const first = (user?.name ?? '').split(' ')[0];

  return (
    <div className="space-y-6">
      <PageHeader title={first ? t('Bonjour {name}', { name: first }) : t('Mon espace')} subtitle={t('Vos billets, vos commandes et vos prochains événements.')} actions={<ButtonLink to="/explorer">{t('Trouver un événement')}</ButtonLink>} />

      {nextUp ? (
        <Card className="overflow-hidden !p-0">
          <div className="grid sm:grid-cols-[220px_1fr]">
            <EventCover event={nextUp.event!} className="h-40 sm:h-full" />
            <div className="p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-brand-ink">{days === 0 ? t('Aujourd’hui') : days === 1 ? t('Demain') : t('Dans {n} jours', { n: days })}</p>
              <h2 className="mt-1 text-xl font-extrabold">{nextUp.event!.title}</h2>
              <p className="mt-2 flex items-center gap-2 text-sm text-ink-soft"><CalendarDays className="h-4 w-4" aria-hidden /> <span className="first-letter:uppercase">{dateLong(nextUp.event!.start, lang)} · {time(nextUp.event!.start, lang)}</span></p>
              <p className="mt-1 flex items-center gap-2 text-sm text-ink-soft"><MapPin className="h-4 w-4" aria-hidden /> {nextUp.event!.venue ? `${nextUp.event!.venue.name}, ${nextUp.event!.venue.city}` : t('En ligne')}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <ButtonLink to={`/billets/${nextUp.ticket.id}`}><Ticket className="h-4 w-4" aria-hidden /> {t('Voir mon billet')}</ButtonLink>
                <ButtonLink to={`/e/${nextUp.event!.slug}`} variant="outline">{t('Voir l’événement')}</ButtonLink>
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <EmptyState icon={<Ticket className="h-5 w-5" />} title={t('Aucun événement à venir')} body={t('Vos prochains billets apparaîtront ici.')} action={<ButtonLink to="/explorer">{t('Explorer les événements')}</ButtonLink>} />
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('Billets à venir')} value={upcoming.length} icon={<Ticket className="h-[18px] w-[18px]" />} />
        <StatCard label={t('Commandes')} value={paid.length} icon={<Receipt className="h-[18px] w-[18px]" />} tone="violet" />
        <StatCard label={t('Total dépensé')} value={moneyRaw(Math.round(spent), 'HTG', lang)} icon={<Wallet className="h-[18px] w-[18px]" />} tone="green" />
        <StatCard label={t('Favoris')} value={favorites.length} icon={<Heart className="h-[18px] w-[18px]" />} tone="red" />
      </div>

      {upcomingEvents.length > 1 && (
        <section aria-labelledby="h-up">
          <div className="mb-3 flex items-center justify-between"><h2 id="h-up" className="text-lg font-extrabold">{t('Mes prochains événements')}</h2><Link to="/compte/billets" className="text-sm font-semibold text-brand-ink">{t('Tous mes billets')}</Link></div>
          <ul className="space-y-2">
            {upcomingEvents.slice(1, 5).map(({ event: e, ticket }) => (
              <li key={e!.id}>
                <Link to={`/billets/${ticket.id}`} className="flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-card hover:ring-1 hover:ring-brand-200">
                  <EventCover event={e!} className="h-14 w-14 shrink-0 rounded-xl [&>span]:!text-xl" />
                  <span className="min-w-0 flex-1"><span className="block truncate font-bold">{e!.title}</span><span className="block truncate text-xs text-ink-muted first-letter:uppercase">{dateLong(e!.start, lang)} · {time(e!.start, lang)}</span></span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {refunds.length > 0 && (
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3"><Undo2 className="h-5 w-5 text-ink-muted" aria-hidden /><div><h2 className="font-bold">{t('Remboursements')}</h2><p className="text-sm text-ink-soft">{t('{n} demande(s) en cours ou traitée(s)', { n: refunds.length })}</p></div></div>
            <Link to="/compte/remboursements" className="text-sm font-semibold text-brand-ink">{t('Suivre')}</Link>
          </div>
        </Card>
      )}

      {favEvents.length > 0 && (
        <section aria-labelledby="h-fav">
          <div className="mb-3 flex items-center justify-between"><h2 id="h-fav" className="text-lg font-extrabold">{t('Vos favoris à venir')}</h2><Link to="/compte/favoris" className="text-sm font-semibold text-brand-ink">{t('Tout voir')}</Link></div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{favEvents.map((e) => <EventCard key={e.id} event={e} />)}</div>
        </section>
      )}

      {followed.length > 0 && (
        <section aria-labelledby="h-follow">
          <h2 id="h-follow" className="mb-3 text-lg font-extrabold">{t('Organisateurs suivis')}</h2>
          <ul className="flex flex-wrap gap-2">
            {followed.map((o) => (
              <li key={o.id}><Link to={`/o/${o.slug}`} className="flex items-center gap-2 rounded-full bg-surface py-1.5 pl-1.5 pr-4 text-sm font-semibold shadow-card"><Avatar name={o.name} size={28} /> {o.name}</Link></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
