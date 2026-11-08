import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, ExternalLink, Flag, X } from 'lucide-react';
import { organizers } from '@/data/mock';
import { listAllEvents, listReports, moderateEvent, setReportStatus } from '@/services/api';
import { useAsync, useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { dateShort, relative } from '@/lib/format';
import { useForm } from '@/lib/form';
import { reportReason } from '@/lib/labels';
import { Badge, Button, Card, EmptyState, Field, IconBadge, Loading, Modal, PageHeader, Segmented, Select, Textarea, type Tone } from '@/components/ui';
import { EventCover } from '@/components/events';
import { eventStatus } from '@/pages/organizer/Events';
import type { EventItem, Report } from '@/types';

const reasons = ['Informations incomplètes', 'Contenu inapproprié', 'Suspicion de fraude', 'Doublon'];
const reportStatus: Record<Report['status'], { l: string; tone: Tone }> = {
  open: { l: 'À traiter', tone: 'red' },
  dismissed: { l: 'Classé', tone: 'gray' },
  actioned: { l: 'Traité', tone: 'green' },
};

type Tab = 'pending' | 'reports' | 'published' | 'rejected';

export default function Moderation() {
  const { toast, lang, t } = useApp();
  useTitle(t('Modération'));
  const [params, setParams] = useSearchParams();
  const tab = (params.get('onglet') === 'signalements' ? 'reports' : params.get('onglet') ?? 'pending') as Tab;
  const setTab = (v: Tab) => setParams(v === 'pending' ? {} : { onglet: v === 'reports' ? 'signalements' : v }, { replace: true });
  const { data, loading, reload } = useAsync(() => Promise.all([listAllEvents(), listReports()]), []);
  const [reject, setReject] = useState<EventItem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const form = useForm({ reason: reasons[0], message: '' }, { message: (v) => (String(v).trim().length < 10 ? t('Expliquez à l’organisateur ce qu’il doit corriger') : undefined) });

  if (loading || !data) return <Loading />;
  const [all, reports] = data;
  const openReports = reports.filter((r) => r.status === 'open');
  const list = all.filter((e) => (tab === 'rejected' ? e.status === 'rejected' || e.status === 'cancelled' : e.status === tab));

  const act = async (e: EventItem, s: EventItem['status'], reason?: string) => {
    setBusy(e.id);
    await moderateEvent(e.id, s, reason);
    setBusy(null);
    toast(s === 'published' ? t('« {event} » approuvé et publié', { event: e.title }) : t('« {event} » refusé : l’organisateur est prévenu', { event: e.title }));
    setReject(null);
    reload();
  };
  const handleReport = async (r: Report, status: Report['status']) => {
    await setReportStatus(r.id, status);
    toast(status === 'dismissed' ? t('Signalement classé sans suite') : t('Signalement marqué comme traité'));
    reload();
  };

  return (
    <div>
      <PageHeader title={t('Modération des événements')} subtitle={t('Validez les nouveaux événements et traitez les signalements.')} />
      <Segmented
        label={t('Filtre')}
        className="mb-5"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'pending', label: t('En attente ({n})', { n: all.filter((e) => e.status === 'pending').length }) },
          { value: 'reports', label: t('Signalements ({n})', { n: openReports.length }) },
          { value: 'published', label: t('Publiés') },
          { value: 'rejected', label: t('Refusés ou annulés') },
        ]}
      />

      {tab === 'reports' ? (
        !reports.length ? (
          <EmptyState icon={<Flag className="h-5 w-5" />} title={t('Aucun signalement')} />
        ) : (
          <ul className="space-y-3">
            {reports.map((r) => {
              const ev = all.find((e) => e.id === r.eventId);
              return (
                <li key={r.id}>
                  <Card className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <IconBadge tone={r.status === 'open' ? 'red' : 'gray'}><Flag className="h-[18px] w-[18px]" /></IconBadge>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-bold">{t(reportReason[r.reason])}</h2>
                        <Badge tone={reportStatus[r.status].tone}>{t(reportStatus[r.status].l)}</Badge>
                      </div>
                      <p className="text-sm text-ink-soft">{ev ? <Link to={`/e/${ev.slug}`} className="font-semibold text-brand-ink">{ev.title}</Link> : r.eventId} · {t('par {name}', { name: r.reporter })} · {relative(r.createdAt, lang)}</p>
                      <p className="mt-1 text-sm">« {r.details} »</p>
                    </div>
                    {r.status === 'open' && ev && (
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleReport(r, 'dismissed')}>{t('Classer sans suite')}</Button>
                        <Button variant="danger" size="sm" onClick={() => { form.reset({ reason: r.reason === 'scam' ? 'Suspicion de fraude' : 'Informations incomplètes', message: '' }); setReject(ev); handleReport(r, 'actioned'); }}>{t('Retirer l’événement')}</Button>
                        <Button size="sm" variant="soft" onClick={() => handleReport(r, 'actioned')}>{t('Marquer comme traité')}</Button>
                      </div>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        )
      ) : !list.length ? (
        <EmptyState icon={<Check className="h-5 w-5" />} title={t('Rien à modérer')} />
      ) : (
        <ul className="space-y-3">
          {list.map((e) => {
            const org = organizers.find((o) => o.id === e.organizerId);
            const flagged = openReports.filter((r) => r.eventId === e.id).length;
            return (
              <li key={e.id}>
                <Card className="flex flex-col gap-4 p-3 sm:flex-row sm:items-center">
                  <EventCover event={e} className="h-24 w-full shrink-0 rounded-2xl sm:w-32 [&>span]:!text-[3rem]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-bold">{e.title}</h2>
                      <Badge tone={eventStatus[e.status].tone}>{t(eventStatus[e.status].l)}</Badge>
                      {flagged > 0 && <Badge tone="red"><Flag className="h-3 w-3" aria-hidden /> {t('{n} signalement(s)', { n: flagged })}</Badge>}
                    </div>
                    <p className="text-sm text-ink-soft">{org?.name} · {org?.verified ? t('vérifié') : t('non vérifié')} · {dateShort(e.start, lang)} · {e.venue?.city ?? t('En ligne')}</p>
                    <p className="mt-1 line-clamp-1 text-sm text-ink-muted">{e.description}</p>
                  </div>
                  <div className="flex gap-2">
                    <Link to={`/e/${e.slug}`} className="grid h-11 w-11 place-items-center rounded-full border border-line" aria-label={t('Voir la page de {event}', { event: e.title })}><ExternalLink className="h-4 w-4" aria-hidden /></Link>
                    {e.status !== 'published' && <Button onClick={() => act(e, 'published')} loading={busy === e.id}><Check className="h-4 w-4" aria-hidden /> {t('Approuver')}</Button>}
                    {e.status !== 'rejected' && <Button variant="danger" onClick={() => { form.reset(); setReject(e); }}><X className="h-4 w-4" aria-hidden /> {e.status === 'published' ? t('Retirer') : t('Refuser')}</Button>}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={!!reject}
        onClose={() => setReject(null)}
        title={reject?.status === 'published' ? t('Retirer « {event} »', { event: reject?.title ?? '' }) : t('Refuser « {event} »', { event: reject?.title ?? '' })}
        size="sm"
        footer={<Button variant="danger" className="flex-1" loading={busy === reject?.id} onClick={() => reject && form.validate() && act(reject, 'rejected', t(form.values.reason))}>{t('Confirmer')}</Button>}
      >
        <form noValidate onSubmit={(e) => { e.preventDefault(); if (reject && form.validate()) act(reject, 'rejected', t(form.values.reason)); }} className="space-y-4">
          <Field label={t('Motif')}>
            <Select {...form.bind('reason')}>{reasons.map((r) => <option key={r} value={r}>{t(r)}</option>)}</Select>
          </Field>
          <Field label={t('Message à l’organisateur')} error={form.errors.message} required><Textarea placeholder={t('Précisez ce qui doit être corrigé…')} {...form.bind('message')} /></Field>
        </form>
      </Modal>
    </div>
  );
}
