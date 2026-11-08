import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, CalendarPlus, Copy, ExternalLink, MoreHorizontal, Pencil, Plus, XCircle } from 'lucide-react';
import { listOrganizerEvents, saveEvent, setEventStatus } from '@/services/api';
import { useAsync, useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { compact, dateShort, num, time } from '@/lib/format';
import { orgOf } from '@/lib/permissions';
import { Badge, Button, ButtonLink, Card, EmptyState, Loading, Modal, PageHeader, ProgressBar, Segmented, type Tone } from '@/components/ui';
import { EventCover } from '@/components/events';
import type { EventItem } from '@/types';

export const eventStatus: Record<EventItem['status'], { l: string; tone: Tone }> = {
  published: { l: 'Publié', tone: 'green' },
  pending: { l: 'En validation', tone: 'amber' },
  draft: { l: 'Brouillon', tone: 'gray' },
  rejected: { l: 'Refusé', tone: 'red' },
  cancelled: { l: 'Annulé', tone: 'red' },
  ended: { l: 'Terminé', tone: 'brand' },
};

function ActionsMenu({ e, onDuplicate, onCancel }: { e: EventItem; onDuplicate: () => void; onCancel: () => void }) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onDown = (ev: MouseEvent) => {
      if (ref.current && !ref.current.contains(ev.target as Node)) setOpen(false);
    };
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const item = 'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-canvas';
  return (
    <div className="relative" ref={ref}>
      <button type="button" aria-label={t('Actions pour {event}', { event: e.title })} aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-canvas">
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>
      {open && (
        <div id={id} className="absolute right-0 z-10 mt-1 w-52 rounded-2xl bg-surface p-1.5 shadow-2xl ring-1 ring-line" onClick={() => setOpen(false)}>
          <Link to={`/organisateur/evenements/${e.id}`} className={item}><Pencil className="h-4 w-4" aria-hidden /> {t('Modifier')}</Link>
          <Link to={`/organisateur/evenements/${e.id}/stats`} className={item}><BarChart3 className="h-4 w-4" aria-hidden /> {t('Statistiques')}</Link>
          <Link to={`/e/${e.slug}`} className={item}><ExternalLink className="h-4 w-4" aria-hidden /> {t('Voir la page')}</Link>
          <button type="button" onClick={onDuplicate} className={item}><Copy className="h-4 w-4" aria-hidden /> {t('Dupliquer')}</button>
          {e.status !== 'cancelled' && <button type="button" onClick={onCancel} className={`${item} text-red-600 hover:bg-red-50`}><XCircle className="h-4 w-4" aria-hidden /> {t('Annuler l’événement')}</button>}
        </div>
      )}
    </div>
  );
}

export default function Events() {
  const { lang, toast, t, user } = useApp();
  useTitle(t('Événements'));
  const { data, loading, reload } = useAsync(() => listOrganizerEvents(orgOf(user)), [user?.id]);
  const [tab, setTab] = useState<'all' | 'published' | 'draft'>('all');
  const [cancel, setCancel] = useState<EventItem | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <Loading />;
  const list = (data ?? []).filter((e) => tab === 'all' || (tab === 'draft' ? ['draft', 'pending', 'rejected'].includes(e.status) : e.status === tab));

  const duplicate = async (e: EventItem) => {
    await saveEvent({ ...e, id: `e${Date.now()}`, slug: `${e.slug}-copie-${Date.now().toString(36).slice(-4)}`, title: `${e.title} (${t('copie')})`, status: 'draft', tickets: e.tickets.map((x) => ({ ...x, sold: 0 })), views: 0 });
    toast(t('Événement dupliqué en brouillon'));
    reload();
  };

  return (
    <div>
      <PageHeader
        title={t('Événements')}
        subtitle={t('Créez, modifiez et suivez vos événements.')}
        actions={<ButtonLink to="/organisateur/evenements/nouveau"><Plus className="h-4 w-4" aria-hidden /> {t('Nouvel événement')}</ButtonLink>}
      />
      <Segmented label={t('Filtre')} className="mb-5" value={tab} onChange={setTab} options={[{ value: 'all', label: t('Tous') }, { value: 'published', label: t('Publiés') }, { value: 'draft', label: t('Brouillons et validation') }]} />

      {!list.length ? (
        <EmptyState icon={<CalendarPlus className="h-5 w-5" />} title={t('Aucun événement ici')} body={t('Créez votre premier événement : il sera prêt en quelques minutes.')} action={<ButtonLink to="/organisateur/evenements/nouveau">{t('Créer un événement')}</ButtonLink>} />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {list.map((e) => {
            const s = e.tickets.reduce((a, x) => a + x.sold, 0);
            const q = e.tickets.reduce((a, x) => a + x.quota, 0);
            const st = eventStatus[e.status];
            return (
              <li key={e.id}>
                <Card className="p-3">
                  <div className="flex gap-4">
                    <EventCover event={e} className="h-28 w-28 shrink-0 rounded-2xl [&>span]:!text-[3.5rem]" />
                    <div className="min-w-0 flex-1 py-1">
                      <div className="flex items-start justify-between gap-2">
                        <Badge tone={st.tone}>{t(st.l)}</Badge>
                        <ActionsMenu e={e} onDuplicate={() => duplicate(e)} onCancel={() => setCancel(e)} />
                      </div>
                      <Link to={`/organisateur/evenements/${e.id}/stats`} className="mt-1 line-clamp-1 font-bold hover:text-brand">{e.title}</Link>
                      <div className="text-xs text-ink-muted">{dateShort(e.start, lang)} · {time(e.start, lang)} · {e.venue?.city ?? t('En ligne')}</div>
                      <div className="mt-3 flex items-center gap-3">
                        <ProgressBar value={q ? s / q : 0} className="flex-1" label={t('Billets vendus')} />
                        <span className="text-xs font-semibold">{num(s, lang)}/{compact(q, lang)}</span>
                      </div>
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={!!cancel}
        onClose={() => setCancel(null)}
        title={t('Annuler l’événement ?')}
        description={t('Tous les participants de {event} seront remboursés automatiquement et prévenus par email, SMS et WhatsApp. Cette action est définitive.', { event: cancel?.title ?? '' })}
        size="sm"
        footer={
          <>
            <Button variant="ghost" className="flex-1" onClick={() => setCancel(null)}>{t('Garder l’événement')}</Button>
            <Button
              variant="danger"
              className="flex-1"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                await setEventStatus(cancel!.id, 'cancelled');
                setBusy(false);
                setCancel(null);
                toast(t('Événement annulé : remboursements lancés et participants prévenus'));
                reload();
              }}
            >
              {t('Annuler et rembourser')}
            </Button>
          </>
        }
      >
        <span />
      </Modal>
    </div>
  );
}
