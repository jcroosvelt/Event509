import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, BellOff, CalendarClock, CheckCheck, Info, Receipt } from 'lucide-react';
import { useApp } from '@/store/app';
import { useTitle } from '@/lib/hooks';
import { cx, relative } from '@/lib/format';
import { Button, Card, EmptyState, IconBadge, PageHeader, Segmented, type Tone } from '@/components/ui';
import type { NotificationItem } from '@/types';

const kinds: Record<NotificationItem['kind'], { icon: typeof Bell; tone: Tone }> = {
  reminder: { icon: CalendarClock, tone: 'brand' },
  update: { icon: Info, tone: 'amber' },
  sale: { icon: Receipt, tone: 'green' },
  system: { icon: Bell, tone: 'gray' },
};

export default function Notifications() {
  const { notifications, markRead, lang, t } = useApp();
  useTitle(t('Notifications'));
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const list = notifications.filter((n) => tab === 'all' || !n.read);
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div className="mx-auto max-w-2xl px-4 pt-6 sm:px-6 lg:pt-10">
      <PageHeader
        title={t('Notifications')}
        subtitle={unread ? t('{n} non lues', { n: unread }) : t('Tout est lu')}
        actions={unread > 0 && <Button variant="outline" onClick={() => markRead()}><CheckCheck className="h-4 w-4" aria-hidden /> {t('Tout marquer comme lu')}</Button>}
      />
      <Segmented label={t('Filtre')} className="mb-5" value={tab} onChange={setTab} options={[{ value: 'all', label: t('Toutes') }, { value: 'unread', label: t('Non lues') }]} />
      {!list.length ? (
        <EmptyState icon={<BellOff className="h-5 w-5" />} title={t('Aucune notification')} body={t('Rappels, mises à jour d’événements et confirmations apparaîtront ici.')} />
      ) : (
        <ul className="space-y-2">
          {list.map((n) => {
            const k = kinds[n.kind];
            return (
              <li key={n.id}>
                <Card className={cx('flex items-start gap-4 p-4', !n.read && 'ring-1 ring-brand/30')}>
                  <IconBadge tone={k.tone}><k.icon className="h-[18px] w-[18px]" /></IconBadge>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="font-semibold">{n.title}</h2>
                      {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" aria-label={t('Non lue')} />}
                    </div>
                    <p className="text-sm text-ink-soft">{n.body}</p>
                    <div className="mt-1 flex items-center gap-3 text-xs text-ink-muted">
                      <span>{relative(n.date, lang)}</span>
                      {!n.read && <button type="button" className="font-semibold text-brand-ink" onClick={() => markRead(n.id)}>{t('Marquer comme lu')}</button>}
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-6 text-center text-sm text-ink-muted">
        <Link to="/compte/parametres#notifications" className="font-semibold text-brand-ink">{t('Choisir les notifications reçues')}</Link>
      </p>
    </div>
  );
}
