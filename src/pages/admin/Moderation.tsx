import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ExternalLink, Flag, X } from 'lucide-react';
import { organizers } from '@/data/mock';
import { listAllEvents, setEventStatus } from '@/services/api';
import { useAsync } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { dateShort } from '@/lib/format';
import { Badge, Button, Card, EmptyState, Field, Loading, Modal, PageHeader, Segmented, Select, Textarea } from '@/components/ui';
import { EventCover } from '@/components/events';
import { eventStatus } from '@/pages/organizer/Events';
import type { EventItem } from '@/types';

export default function Moderation() {
  const { toast, lang } = useApp();
  const { data, loading, reload } = useAsync(() => listAllEvents(), []);
  const [tab, setTab] = useState<'pending' | 'published' | 'rejected'>('pending');
  const [reject, setReject] = useState<EventItem | null>(null);

  if (loading) return <Loading />;
  const list = (data ?? []).filter((e) => (tab === 'rejected' ? e.status === 'rejected' || e.status === 'cancelled' : e.status === tab));
  const act = async (e: EventItem, s: EventItem['status']) => {
    await setEventStatus(e.id, s);
    toast(s === 'published' ? 'Événement approuvé et publié' : 'Événement refusé — l’organisateur est notifié');
    setReject(null);
    reload();
  };

  return (
    <div>
      <PageHeader title="Modération des événements" subtitle="Validez les nouveaux événements et traitez les signalements." />
      <Segmented
        className="mb-5"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'pending', label: `En attente (${(data ?? []).filter((e) => e.status === 'pending').length})` },
          { value: 'published', label: 'Publiés' },
          { value: 'rejected', label: 'Refusés / annulés' },
        ]}
      />
      {tab === 'published' && (
        <Card className="mb-4 flex items-center gap-3 bg-amber-50 p-4 text-sm">
          <Flag className="h-4 w-4 text-amber-600" /> 1 signalement : « Rooftop Sunset Session » — prix jugé trompeur.
        </Card>
      )}
      {!list.length ? (
        <EmptyState icon={<Check className="h-5 w-5" />} title="Rien à modérer" />
      ) : (
        <div className="space-y-3">
          {list.map((e) => {
            const org = organizers.find((o) => o.id === e.organizerId);
            return (
              <Card key={e.id} className="flex flex-col gap-4 p-3 sm:flex-row sm:items-center">
                <EventCover event={e} className="h-24 w-full shrink-0 rounded-2xl sm:w-32 [&>span]:!text-[3rem]" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold">{e.title}</span>
                    <Badge tone={eventStatus[e.status].tone}>{eventStatus[e.status].l}</Badge>
                  </div>
                  <div className="text-sm text-ink-soft">{org?.name} {org?.verified ? '· vérifié' : '· non vérifié'} · {dateShort(e.start, lang)} · {e.venue?.city ?? 'En ligne'}</div>
                  <p className="mt-1 line-clamp-1 text-sm text-ink-muted">{e.description}</p>
                </div>
                <div className="flex gap-2">
                  <Link to={`/e/${e.slug}`} className="grid h-11 w-11 place-items-center rounded-full border border-line" aria-label="Voir"><ExternalLink className="h-4 w-4" /></Link>
                  {e.status !== 'published' && <Button onClick={() => act(e, 'published')}><Check className="h-4 w-4" /> Approuver</Button>}
                  {e.status !== 'rejected' && <Button variant="danger" onClick={() => setReject(e)}><X className="h-4 w-4" /> {e.status === 'published' ? 'Retirer' : 'Refuser'}</Button>}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={!!reject} onClose={() => setReject(null)} title="Refuser l’événement" size="sm" footer={<Button variant="danger" className="flex-1" onClick={() => reject && act(reject, 'rejected')}>Confirmer le refus</Button>}>
        <div className="space-y-4">
          <Field label="Motif"><Select><option>Informations incomplètes</option><option>Contenu inapproprié</option><option>Suspicion de fraude</option><option>Doublon</option></Select></Field>
          <Field label="Message à l’organisateur"><Textarea placeholder="Précisez ce qui doit être corrigé…" /></Field>
        </div>
      </Modal>
    </div>
  );
}
