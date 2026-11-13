import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import { DEMO } from '@/services/api';
import { getCalendar, type CalendarEvent } from '@/services/premium';
import { ApiError } from '@/lib/errors';
import { useAsync, useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { cx, dateShort, time } from '@/lib/format';
import { Badge, Card, EmptyState, Loading, PageHeader, StatCard, type Tone } from '@/components/ui';

const TONE: Record<string, { l: string; tone: Tone }> = {
  published: { l: 'Publié', tone: 'green' }, draft: { l: 'Brouillon', tone: 'gray' }, pending: { l: 'En validation', tone: 'amber' },
  rejected: { l: 'Refusé', tone: 'red' }, cancelled: { l: 'Annulé', tone: 'red' }, ended: { l: 'Terminé', tone: 'gray' },
};
const shift = (month: string, d: number) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const x = new Date(Date.UTC(y, m - 1 + d, 1));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** Calendrier professionnel : tous les événements du mois (à venir, passés, annulés) et vue globale des activités. */
export default function Calendar() {
  const { t, lang } = useApp();
  useTitle(t('Calendrier'));
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const q = useAsync(() => (DEMO ? Promise.resolve(null) : getCalendar(month)), [month]);
  if (DEMO) return <EmptyState icon={<Lock className="h-5 w-5" />} title={t('Programme disponible sur le site en ligne')} body={t('Le calendrier professionnel nécessite le serveur.')} />;
  if (q.error instanceof ApiError && q.error.status === 403)
    return <EmptyState icon={<Lock className="h-5 w-5" />} title={t('Réservé aux organisateurs vérifiés')} body={t('Calendrier, vue globale, modèles d’événements et gestion de plusieurs événements.')} action={<Link to="/organisateur-verifie" className="font-semibold text-brand-ink">{t('Découvrir le programme')}</Link>} />;
  if (!q.data) return <Loading />;
  const d = q.data;
  const [y, m] = d.month.split('-').map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7; // lundi en premier
  const cells = Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, i) => i - offset + 1);
  const on = (day: number): CalendarEvent[] => {
    const key = `${d.month}-${String(day).padStart(2, '0')}`;
    return d.events.filter((e) => e.start.slice(0, 10) <= key && e.end.slice(0, 10) >= key);
  };
  const title = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const weekdays = lang === 'fr' ? ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <PageHeader title={t('Calendrier')} subtitle={t('Tous vos événements en un coup d’œil.')} actions={<Link to="/organisateur/evenements" className="text-sm font-semibold text-brand-ink">{t('Gérer les événements')}</Link>} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('À venir')} value={d.counts.upcoming} tone="green" />
        <StatCard label={t('Passés')} value={d.counts.past} />
        <StatCard label={t('Annulés')} value={d.counts.cancelled} tone="red" />
        <StatCard label={t('Brouillons et validation')} value={d.counts.draft} tone="amber" />
      </div>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <button type="button" onClick={() => setMonth(shift(d.month, -1))} aria-label={t('Mois précédent')} className="grid h-10 w-10 place-items-center rounded-full hover:bg-canvas"><ChevronLeft className="h-5 w-5" aria-hidden /></button>
          <h2 className="font-extrabold capitalize" aria-live="polite">{title}</h2>
          <button type="button" onClick={() => setMonth(shift(d.month, 1))} aria-label={t('Mois suivant')} className="grid h-10 w-10 place-items-center rounded-full hover:bg-canvas"><ChevronRight className="h-5 w-5" aria-hidden /></button>
        </div>
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-2xl bg-line text-xs">
          {weekdays.map((w) => <div key={w} className="bg-canvas py-1.5 text-center font-bold uppercase text-ink-muted">{w}</div>)}
          {cells.map((day, i) => {
            const evs = day >= 1 && day <= days ? on(day) : [];
            const key = `${d.month}-${String(day).padStart(2, '0')}`;
            return (
              <div key={i} className={cx('min-h-[4.5rem] bg-surface p-1', (day < 1 || day > days) && 'bg-canvas/60')}>
                {day >= 1 && day <= days && <div className={cx('mb-1 text-right font-semibold', key === today ? 'text-brand-ink' : 'text-ink-muted')}>{day}</div>}
                {evs.slice(0, 3).map((e) => (
                  <Link key={e.id} to={`/organisateur/evenements/${e.id}/stats`} className={cx('mb-0.5 block truncate rounded px-1 py-0.5 font-semibold', e.status === 'cancelled' ? 'bg-red-100 text-red-800 line-through dark:bg-red-500/20 dark:text-red-200' : e.status === 'published' ? 'bg-brand-100 text-brand-ink' : 'bg-canvas text-ink-soft')} title={`${e.title} — ${t(TONE[e.status]?.l ?? e.status)}`}>
                    {e.title}
                  </Link>
                ))}
                {evs.length > 3 && <span className="block text-center text-ink-muted">+{evs.length - 3}</span>}
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-ink-muted">{t('Les événements annulés sont barrés ; les brouillons sont en gris.')}</p>
      </Card>

      <section aria-labelledby="h-next">
        <h2 id="h-next" className="mb-3 flex items-center gap-2 text-lg font-extrabold"><CalendarDays className="h-5 w-5" aria-hidden /> {t('Prochains événements')}</h2>
        {!d.next.length ? <p className="text-sm text-ink-muted">{t('Aucun événement à venir.')}</p> : (
          <ul className="space-y-2">
            {d.next.map((e) => (
              <li key={e.id}><Link to={`/organisateur/evenements/${e.id}/stats`} className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface p-3 shadow-card hover:ring-1 hover:ring-brand-200">
                <span className="min-w-0 flex-1"><span className="block truncate font-bold">{e.title}</span><span className="text-xs text-ink-muted">{dateShort(e.start, lang)} · {time(e.start, lang)}{e.city ? ` · ${e.city}` : ''}{e.recurring ? ` · ${e.recurring === 'weekly' ? t('Chaque semaine') : t('Chaque mois')}` : ''}</span></span>
                <span className="text-sm text-ink-soft">{e.sold}/{e.quota}</span>
                <Badge tone={TONE[e.status]?.tone ?? 'gray'}>{t(TONE[e.status]?.l ?? e.status)}</Badge>
              </Link></li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
