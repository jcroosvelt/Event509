import { useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BarChart3, CalendarPlus, Copy, ExternalLink, MoreHorizontal, Pencil, Plus, ScanLine, Star, Trash2, XCircle, LayoutTemplate } from 'lucide-react';
import { DEMO, deleteEvent, featureEvent, listOrganizerEvents, saveEvent, setEventStatus } from '@/services/api';
import { useAsync, useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { compact, dateShort, num, time } from '@/lib/format';
import { orgOf } from '@/lib/permissions';
import { deleteTemplate, listTemplates, saveTemplate, type EventTemplate } from '@/services/premium';
import { Badge, Button, ButtonLink, Card, EmptyState, Field, Input, Loading, Modal, PageHeader, ProgressBar, Segmented, type Tone } from '@/components/ui';
import { organizers } from '@/data/mock';
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

function ActionsMenu({ e, onDuplicate, onCancel, onDelete, onFeature, onTemplate }: { e: EventItem; onDuplicate: () => void; onCancel: () => void; onDelete: () => void; onFeature?: () => void; onTemplate?: () => void }) {
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
        <div id={id} className="absolute right-0 z-10 mt-1 w-52 rounded-2xl bg-surface p-1.5 shadow-2xl ring-1 ring-line">
          <Link to={`/organisateur/evenements/${e.id}`} className={item} onClick={() => setOpen(false)}><Pencil className="h-4 w-4" aria-hidden /> {t('Modifier')}</Link>
          {e.status === 'published' && <Link to={`/organisateur/checkin/${e.id}`} className={item} onClick={() => setOpen(false)}><ScanLine className="h-4 w-4" aria-hidden /> {t('Scanner les billets')}</Link>}
          <Link to={`/organisateur/evenements/${e.id}/stats`} className={item} onClick={() => setOpen(false)}><BarChart3 className="h-4 w-4" aria-hidden /> {t('Statistiques')}</Link>
          <Link to={`/e/${e.slug}`} className={item} onClick={() => setOpen(false)}><ExternalLink className="h-4 w-4" aria-hidden /> {t('Voir la page')}</Link>
          <button type="button" onClick={() => { setOpen(false); onDuplicate(); }} className={item}><Copy className="h-4 w-4" aria-hidden /> {t('Dupliquer')}</button>
          {onTemplate && <button type="button" onClick={() => { setOpen(false); onTemplate(); }} className={item}><LayoutTemplate className="h-4 w-4" aria-hidden /> {t('Enregistrer comme modèle')}</button>}
          {onFeature && e.status === 'published' && <button type="button" onClick={() => { setOpen(false); onFeature(); }} className={item}><Star className="h-4 w-4" aria-hidden /> {e.featured ? t('Retirer de la vedette') : t('Mettre en vedette')}</button>}
          {e.status !== 'cancelled' && <button type="button" onClick={() => { setOpen(false); onCancel(); }} className={`${item} text-red-600 hover:bg-red-50`}><XCircle className="h-4 w-4" aria-hidden /> {t('Annuler l’événement')}</button>}
          <button type="button" onClick={() => { setOpen(false); onDelete(); }} className={`${item} text-red-600 hover:bg-red-50`}><Trash2 className="h-4 w-4" aria-hidden /> {t('Supprimer')}</button>
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
  const [remove, setRemove] = useState<EventItem | null>(null);


  // Avantage « visibilité » : le serveur fixe `priority` sur l'organisateur tant que le badge est actif
  const canFeature = !DEMO && !!organizers.find((o) => o.id === orgOf(user))?.priority;
  const feature = async (e: EventItem) => {
    try {
      await featureEvent(e.id, !e.featured);
      toast(e.featured ? t('Événement retiré de la vedette') : t('Événement mis en vedette sur l’accueil'));
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : t('Action impossible. Réessayez.'), 'error');
    }
  };

  // Avantage « multi-événements » : modèles d'événements (le serveur contrôle l'accès)
  const nav = useNavigate();
  const canTpl = !DEMO && !!organizers.find((o) => o.id === orgOf(user))?.perks?.includes('multiEvents');
  const [tplFor, setTplFor] = useState<EventItem | null>(null);
  const [tplName, setTplName] = useState('');
  const tpls = useAsync(() => (canTpl ? listTemplates() : Promise.resolve([] as EventTemplate[])), [canTpl]);
  const saveTpl = async () => {
    setBusy(true);
    try {
      await saveTemplate(tplFor!.id, tplName.trim());
      toast(t('Modèle enregistré'));
      setTplFor(null);
      tpls.reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : t('Action impossible. Réessayez.'), 'error');
    } finally {
      setBusy(false);
    }
  };
  const fromTemplate = async (tp: EventTemplate) => {
    // Nouvel événement en brouillon : mêmes billets et lieu, dates à choisir (par défaut dans 30 jours)
    const d = new Date(Date.now() + 30 * 86_400_000);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const now = new Date();
    const nowIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    try {
      const e = tp.event as EventItem;
      const saved = await saveEvent({
        ...e, id: '', slug: `${(e.title ?? 'evenement').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}-${Date.now().toString(36).slice(-4)}`, start: `${day}T18:00`, end: `${day}T22:00`,
        status: 'draft', views: 0, organizerId: orgOf(user), tickets: e.tickets.map((x) => ({ ...x, sold: 0, salesStart: nowIso, salesEnd: `${day}T18:00` })),
      });
      toast(t('Événement créé depuis le modèle : choisissez les dates'));
      nav(`/organisateur/evenements/${saved.id}`);
    } catch {
      toast(t('Action impossible. Réessayez.'), 'error');
    }
  };

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
      {canTpl && (tpls.data?.length ?? 0) > 0 && (
        <section aria-labelledby="h-tpl" className="mb-6">
          <h2 id="h-tpl" className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-muted">{t('Mes modèles')}</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {tpls.data!.map((tp) => (
              <li key={tp.id} className="flex items-center gap-2 rounded-2xl bg-surface p-3 shadow-card">
                <LayoutTemplate className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{tp.name}</span>
                <Button size="sm" variant="soft" onClick={() => fromTemplate(tp)}>{t('Utiliser')}</Button>
                <Button size="sm" variant="ghost" aria-label={t('Supprimer le modèle {name}', { name: tp.name })} onClick={async () => { await deleteTemplate(tp.id).catch(() => {}); tpls.reload(); }}><Trash2 className="h-4 w-4" aria-hidden /></Button>
              </li>
            ))}
          </ul>
        </section>
      )}
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
                        <ActionsMenu e={e} onDuplicate={() => duplicate(e)} onCancel={() => setCancel(e)} onDelete={() => setRemove(e)} onFeature={canFeature ? () => feature(e) : undefined} onTemplate={canTpl ? () => { setTplFor(e); setTplName(e.title); } : undefined} />
                      </div>
                      <Link to={`/organisateur/evenements/${e.id}/stats`} className="mt-1 line-clamp-1 font-bold hover:text-brand-ink">{e.title}</Link>
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
        open={!!tplFor}
        onClose={() => setTplFor(null)}
        title={t('Enregistrer comme modèle')}
        description={t('Le modèle garde le lieu, la description et les billets, mais ni les dates ni les ventes.')}
        size="sm"
        footer={<><Button variant="ghost" className="flex-1" onClick={() => setTplFor(null)}>{t('Annuler')}</Button><Button className="flex-1" loading={busy} onClick={saveTpl}>{t('Enregistrer')}</Button></>}
      >
        <Field label={t('Nom du modèle')}><Input value={tplName} maxLength={80} onChange={(e) => setTplName(e.target.value)} /></Field>
      </Modal>

      <Modal
        open={!!remove}
        onClose={() => setRemove(null)}
        title={t('Supprimer l’événement ?')}
        description={t('« {event} » sera effacé définitivement. Si des billets ont été vendus, annulez plutôt l’événement pour rembourser les participants.', { event: remove?.title ?? '' })}
        size="sm"
        footer={
          <>
            <Button variant="ghost" className="flex-1" onClick={() => setRemove(null)}>{t('Garder l’événement')}</Button>
            <Button
              variant="danger"
              className="flex-1"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await deleteEvent(remove!.id);
                  setRemove(null);
                  toast(t('Événement supprimé'));
                  reload();
                } catch {
                  toast(t('Suppression impossible : des billets ont été vendus. Annulez l’événement à la place.'), 'error');
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t('Supprimer')}
            </Button>
          </>
        }
      >
        <span />
      </Modal>

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
