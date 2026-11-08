import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ExternalLink, Flag, X } from 'lucide-react';
import { organizers } from '@/data/mock';
import { listAllEvents, setEventStatus } from '@/services/api';
import { useAsync, useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { dateShort } from '@/lib/format';
import { useForm } from '@/lib/form';
import { Badge, Button, Card, EmptyState, Field, Loading, Modal, PageHeader, Segmented, Select, Textarea } from '@/components/ui';
import { EventCover } from '@/components/events';
import { eventStatus } from '@/pages/organizer/Events';
import type { EventItem } from '@/types';

const reasons = ['Informations incomplètes', 'Contenu inapproprié', 'Suspicion de fraude', 'Doublon'];

export default function Moderation() {
  const { toast, lang, t } = useApp();
  useTitle(t('Modération'));
  const { data, loading, reload } = useAsync(() => listAllEvents(), []);
  const [tab, setTab] = useState<'pending' | 'published' | 'rejected'>('pending');
  const [reject, setReject] = useState<EventItem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const form = useForm({ reason: reasons[0], message: '' }, { message: (v) => (String(v).trim().length < 10 ? t('Expliquez à l’organisateur ce qu’il doit corriger') : undefined) });

  if (loading) return <Loading />;
  const all = data ?? [];
  const list = all.filter((e) => (tab === 'rejected' ? e.status === 'rejected' || e.status === 'cancelled' : e.status === tab));

  const act = async (e: EventItem, s: EventItem['status']) => {
    setBusy(e.id);
    await setEventStatus(e.id, s);
    setBusy(null);
    toast(s === 'published' ? t('« {event} » approuvé et publié', { event: e.title }) : t('« {event} » refusé : l’organisateur est prévenu', { event: e.title }));
    setReject(null);
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
          { value: 'published', label: t('Publiés') },
          { value: 'rejected', label: t('Refusés ou annulés') },
        ]}
      />
      {tab === 'published' && (
        <Card className="mb-4 flex items-center gap-3 !bg-amber-50 p-4 text-sm">
          <Flag className="h-4 w-4 text-amber-700" aria-hidden /> {t('1 signalement : « Rooftop Sunset Session » — prix jugé trompeur.')}
        </Card>
      )}
      {!list.length ? (
        <EmptyState icon={<Check className="h-5 w-5" />} title={t('Rien à modérer')} />
      ) : (
        <ul className="space-y-3">
          {list.map((e) => {
            const org = organizers.find((o) => o.id === e.organizerId);
            return (
              <li key={e.id}>
                <Card className="flex flex-col gap-4 p-3 sm:flex-row sm:items-center">
                  <EventCover event={e} className="h-24 w-full shrink-0 rounded-2xl sm:w-32 [&>span]:!text-[3rem]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-bold">{e.title}</h2>
                      <Badge tone={eventStatus[e.status].tone}>{t(eventStatus[e.status].l)}</Badge>
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
        title={reject?.status === 'published' ? t('Retirer l’événement') : t('Refuser l’événement')}
        size="sm"
        footer={<Button variant="danger" className="flex-1" loading={busy === reject?.id} onClick={() => reject && form.validate() && act(reject, 'rejected')}>{t('Confirmer')}</Button>}
      >
        <form noValidate onSubmit={(e) => { e.preventDefault(); if (reject && form.validate()) act(reject, 'rejected'); }} className="space-y-4">
          <Field label={t('Motif')}>
            <Select {...form.bind('reason')}>{reasons.map((r) => <option key={r} value={r}>{t(r)}</option>)}</Select>
          </Field>
          <Field label={t('Message à l’organisateur')} error={form.errors.message} required><Textarea placeholder={t('Précisez ce qui doit être corrigé…')} {...form.bind('message')} /></Field>
        </form>
      </Modal>
    </div>
  );
}
