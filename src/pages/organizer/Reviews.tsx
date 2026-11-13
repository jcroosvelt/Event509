import { useMemo, useState } from 'react';
import { MessageSquareText } from 'lucide-react';
import { deleteReview, listOrgReviews, replyToReview } from '@/services/api';
import { useAsync, useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { can } from '@/lib/permissions';
import { ReviewItem, Stars } from '@/components/Reviews';
import { Button, Card, EmptyState, Field, Loading, PageHeader, Select, StatCard, Textarea } from '@/components/ui';

/** Avis des participants : note moyenne, filtre par événement et réponses de l'organisateur. */
export default function Reviews() {
  const { t, lang, toast, user } = useApp();
  useTitle(t('Avis'));
  const { data, loading, reload } = useAsync(() => listOrgReviews(), [user?.id], { throwOnError: true });
  const [eventId, setEventId] = useState('');
  const [replying, setReplying] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const all = useMemo(() => data ?? [], [data]);
  const titles = useMemo(() => [...new Set(all.map((r) => r.eventTitle))], [all]);
  const list = all.filter((r) => !eventId || r.eventTitle === eventId);
  const avg = list.length ? list.reduce((a, r) => a + r.rating, 0) / list.length : 0;

  const send = async (id: string) => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await replyToReview(id, text.trim());
      toast(t('Réponse publiée'));
      setReplying(null);
      setText('');
      reload();
    } catch {
      toast(t('La réponse n’a pas pu être envoyée. Réessayez.'), 'error');
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string) => {
    try {
      await deleteReview(id);
      toast(t('Avis supprimé'));
      reload();
    } catch {
      toast(t('La suppression a échoué. Réessayez.'), 'error');
    }
  };

  if (loading) return <Loading />;
  return (
    <div>
      <PageHeader title={t('Avis')} subtitle={t('Les notes et commentaires laissés par vos participants après l’événement.')} />
      {!all.length ? (
        <EmptyState icon={<MessageSquareText className="h-5 w-5" />} title={t('Aucun avis pour le moment')} body={t('Les participants peuvent noter un événement depuis le lien de leur commande, une fois qu’il est terminé.')} />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            <StatCard label={t('Note moyenne')} value={avg ? `${avg.toFixed(1)} / 5` : '—'} tone="orange" />
            <StatCard label={t('Avis reçus')} value={String(list.length)} />
          </div>
          <div className="mb-4 max-w-sm">
            <label htmlFor="rv-e" className="sr-only">{t('Événement')}</label>
            <Select id="rv-e" value={eventId} onChange={(e) => setEventId(e.target.value)}>
              <option value="">{t('Tous les événements')}</option>
              {titles.map((x) => <option key={x} value={x}>{x}</option>)}
            </Select>
          </div>
          <ul className="space-y-3">
            {list.map((r) => (
              <ReviewItem key={r.id} r={r} lang={lang}>
                <div className="mt-2 text-xs text-ink-muted">{r.eventTitle} · <Stars value={r.rating} size={12} /></div>
                {replying === r.id ? (
                  <Card className="mt-3 !p-3">
                    <Field label={t('Votre réponse')}><Textarea rows={3} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} /></Field>
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" loading={busy} onClick={() => send(r.id)}>{t('Publier la réponse')}</Button>
                      <Button size="sm" variant="ghost" onClick={() => setReplying(null)}>{t('Annuler')}</Button>
                    </div>
                  </Card>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="soft" onClick={() => { setReplying(r.id); setText(r.reply?.body ?? ''); }}>{r.reply ? t('Modifier la réponse') : t('Répondre')}</Button>
                    {can(user, 'admin') && <Button size="sm" variant="ghost" onClick={() => remove(r.id)}>{t('Supprimer')}</Button>}
                  </div>
                )}
              </ReviewItem>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
