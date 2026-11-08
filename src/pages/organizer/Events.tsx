import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarPlus, Copy, ExternalLink, MoreHorizontal, Pencil, Plus, XCircle } from 'lucide-react';
import { listOrganizerEvents, saveEvent, setEventStatus } from '@/services/api';
import { useAsync } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { compact, dateShort, num, time } from '@/lib/format';
import { Badge, Button, ButtonLink, Card, EmptyState, Loading, Modal, PageHeader, ProgressBar, Segmented } from '@/components/ui';
import { EventCover } from '@/components/events';
import type { EventItem } from '@/types';

export const eventStatus: Record<EventItem['status'], { l: string; tone: 'green' | 'amber' | 'gray' | 'red' | 'brand' }> = {
  published: { l: 'Publié', tone: 'green' },
  pending: { l: 'En validation', tone: 'amber' },
  draft: { l: 'Brouillon', tone: 'gray' },
  rejected: { l: 'Refusé', tone: 'red' },
  cancelled: { l: 'Annulé', tone: 'red' },
  ended: { l: 'Terminé', tone: 'brand' },
};

export default function Events() {
  const { lang, toast } = useApp();
  const { data, loading, reload } = useAsync(() => listOrganizerEvents('org1'), []);
  const [tab, setTab] = useState<'all' | 'published' | 'draft'>('all');
  const [menu, setMenu] = useState<string | null>(null);
  const [cancel, setCancel] = useState<EventItem | null>(null);

  if (loading) return <Loading />;
  const list = (data ?? []).filter((e) => tab === 'all' || (tab === 'draft' ? e.status === 'draft' || e.status === 'pending' : e.status === tab));

  const duplicate = async (e: EventItem) => {
    await saveEvent({ ...e, id: `e${Date.now()}`, slug: `${e.slug}-copie`, title: `${e.title} (copie)`, status: 'draft', tickets: e.tickets.map((t) => ({ ...t, sold: 0 })), views: 0 });
    toast('Événement dupliqué en brouillon');
    reload();
  };

  return (
    <div>
      <PageHeader
        title="Événements"
        subtitle="Créez, modifiez et suivez vos événements."
        actions={<ButtonLink to="/organisateur/evenements/nouveau"><Plus className="h-4 w-4" /> Nouvel événement</ButtonLink>}
      />
      <Segmented className="mb-5" value={tab} onChange={setTab} options={[{ value: 'all', label: 'Tous' }, { value: 'published', label: 'Publiés' }, { value: 'draft', label: 'Brouillons' }]} />

      {!list.length ? (
        <EmptyState icon={<CalendarPlus className="h-5 w-5" />} title="Aucun événement" action={<ButtonLink to="/organisateur/evenements/nouveau">Créer un événement</ButtonLink>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((e) => {
            const s = e.tickets.reduce((a, t) => a + t.sold, 0);
            const q = e.tickets.reduce((a, t) => a + t.quota, 0);
            const st = eventStatus[e.status];
            return (
              <Card key={e.id} className="p-3">
                <div className="flex gap-4">
                  <EventCover event={e} className="h-28 w-28 shrink-0 rounded-2xl [&>span]:!text-[3.5rem]" />
                  <div className="min-w-0 flex-1 py-1">
                    <div className="flex items-start justify-between gap-2">
                      <Badge tone={st.tone}>{st.l}</Badge>
                      <div className="relative">
                        <button aria-label="Actions" onClick={() => setMenu(menu === e.id ? null : e.id)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-canvas">
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                        {menu === e.id && (
                          <div className="absolute right-0 z-10 mt-1 w-48 rounded-2xl bg-white p-1.5 shadow-2xl ring-1 ring-line" onClick={() => setMenu(null)}>
                            <Link to={`/organisateur/evenements/${e.id}`} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-canvas"><Pencil className="h-4 w-4" /> Modifier</Link>
                            <Link to={`/e/${e.slug}`} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-canvas"><ExternalLink className="h-4 w-4" /> Voir la page</Link>
                            <button onClick={() => duplicate(e)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-canvas"><Copy className="h-4 w-4" /> Dupliquer</button>
                            {e.status !== 'cancelled' && <button onClick={() => setCancel(e)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-red-600 hover:bg-red-50"><XCircle className="h-4 w-4" /> Annuler</button>}
                          </div>
                        )}
                      </div>
                    </div>
                    <Link to={`/organisateur/evenements/${e.id}`} className="mt-1 line-clamp-1 font-bold hover:text-brand">{e.title}</Link>
                    <div className="text-xs text-ink-muted">{dateShort(e.start, lang)} · {time(e.start, lang)} · {e.venue?.city ?? 'En ligne'}</div>
                    <div className="mt-3 flex items-center gap-3">
                      <ProgressBar value={q ? s / q : 0} className="flex-1" />
                      <span className="text-xs font-semibold">{num(s, lang)}/{compact(q, lang)}</span>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={!!cancel}
        onClose={() => setCancel(null)}
        title="Annuler l’événement ?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" className="flex-1" onClick={() => setCancel(null)}>Retour</Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={async () => {
                await setEventStatus(cancel!.id, 'cancelled');
                setCancel(null);
                toast('Événement annulé — remboursements lancés et participants notifiés');
                reload();
              }}
            >
              Annuler et rembourser
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">Tous les participants de <b>{cancel?.title}</b> seront remboursés automatiquement et prévenus par email, SMS et WhatsApp. Cette action est irréversible.</p>
      </Modal>
    </div>
  );
}
