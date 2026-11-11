import { Link, Navigate } from 'react-router-dom';
import { CalendarDays, MapPin, ScanLine } from 'lucide-react';
import { listAttendees, listOrganizerEvents } from '@/services/api';
import { useAsync, useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { dateShort, time } from '@/lib/format';
import { orgOf } from '@/lib/permissions';
import { ButtonLink, Card, EmptyState, Loading, PageHeader, ProgressBar } from '@/components/ui';
import { can } from '@/lib/permissions';

/**
 * Entrée du contrôle d'accès : on choisit d'abord l'événement, puis on scanne ses billets.
 * Avec un seul événement publié, on y entre directement.
 */
export default function CheckInHome() {
  const { t, lang, user } = useApp();
  useTitle(t('Contrôle d’entrée'));
  const orgId = orgOf(user);
  const { data, loading } = useAsync(() => Promise.all([listOrganizerEvents(orgId), listAttendees()]), [orgId]);

  if (loading || !data) return <Loading />;
  const [all, attendees] = data;
  const events = all.filter((e) => e.status === 'published').sort((a, b) => a.start.localeCompare(b.start));
  if (events.length === 1) return <Navigate to={`/organisateur/checkin/${events[0].id}`} replace />;

  return (
    <div>
      <PageHeader title={t('Contrôle d’entrée')} subtitle={t('Choisissez l’événement dont vous contrôlez les billets.')} />
      {!events.length ? (
        <EmptyState
          icon={<ScanLine className="h-5 w-5" />}
          title={t('Aucun événement publié')}
          body={t('Le contrôle d’entrée est disponible dès qu’un événement est publié.')}
          action={can(user, 'events') ? <ButtonLink to="/organisateur/evenements/nouveau">{t('Créer un événement')}</ButtonLink> : undefined}
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {events.map((e) => {
            const mine = attendees.filter((a) => a.eventId === e.id);
            const inside = mine.filter((a) => a.checkedIn).length;
            return (
              <li key={e.id}>
                <Link to={`/organisateur/checkin/${e.id}`} className="block rounded-3xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/30">
                  <Card className="h-full transition hover:-translate-y-0.5">
                    <h2 className="text-lg font-bold">{e.title}</h2>
                    <p className="mt-2 flex items-center gap-2 text-sm text-ink-soft"><CalendarDays className="h-4 w-4 shrink-0" aria-hidden /> {dateShort(e.start, lang)} · {time(e.start, lang)}</p>
                    <p className="mt-1 flex items-center gap-2 text-sm text-ink-soft"><MapPin className="h-4 w-4 shrink-0" aria-hidden /> {e.venue?.name ?? e.online?.platform}</p>
                    <div className="mt-4">
                      <div className="mb-1 flex justify-between text-xs font-semibold text-ink-soft">
                        <span>{t('{n} / {total} entrés', { n: inside, total: mine.length })}</span>
                      </div>
                      <ProgressBar value={mine.length ? inside / mine.length : 0} label={t('{n} / {total} entrés', { n: inside, total: mine.length })} />
                    </div>
                    <span className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-brand-ink"><ScanLine className="h-4 w-4" aria-hidden /> {t('Scanner les billets')}</span>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
