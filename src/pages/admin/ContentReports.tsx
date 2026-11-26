import { useCallback, useEffect, useState } from 'react';
import { Flag } from 'lucide-react';
import { useApp } from '@/store/app';
import { useTitle } from '@/lib/hooks';
import { adminContentReports, decideContentReport, type AdminContentReport } from '@/services/community';
import { relative } from '@/lib/format';
import { Badge, Button, Card, EmptyState, Loading, PageHeader, Segmented } from '@/components/ui';

const KIND: Record<string, string> = { comment: 'Commentaire', photo: 'Photo', message: 'Message privé' };
const REASON: Record<string, string> = { spam: 'Publicité ou spam', abuse: 'Insultes ou harcèlement', inappropriate: 'Contenu inapproprié', scam: 'Arnaque ou fraude', other: 'Autre motif' };

/** Administration : signalements de commentaires, photos et messages. Un contenu public signalé par 3 personnes est déjà masqué en attendant. */
export default function ContentReports() {
  const { t, lang, toast } = useApp();
  useTitle(t('Signalements de contenu'));
  const [status, setStatus] = useState<'open' | 'removed' | 'dismissed'>('open');
  const [items, setItems] = useState<AdminContentReport[] | null>(null);
  const [busy, setBusy] = useState('');
  const load = useCallback(() => { setItems(null); adminContentReports(status).then(setItems).catch(() => setItems([])); }, [status]);
  useEffect(load, [load]);
  const decide = async (r: AdminContentReport, action: 'remove' | 'dismiss') => {
    if (action === 'remove' && !window.confirm(t('Supprimer ce contenu définitivement ?'))) return;
    setBusy(r.id);
    try {
      await decideContentReport(r.id, action);
      toast(action === 'remove' ? t('Contenu supprimé') : t('Signalement classé : contenu rétabli'));
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Action impossible. Réessayez.'), 'error');
    } finally {
      setBusy('');
    }
  };
  return (
    <div className="max-w-4xl">
      <PageHeader title={t('Signalements de contenu')} subtitle={t('Commentaires, photos et messages signalés par les membres. Pour un message, vous ne voyez que le message signalé et les 5 précédents.')} />
      <Segmented label={t('Filtre')} className="mb-5" value={status} onChange={setStatus} options={[{ value: 'open', label: t('À traiter') }, { value: 'removed', label: t('Supprimés') }, { value: 'dismissed', label: t('Classés') }]} />
      {items === null ? <Loading /> : !items.length ? <EmptyState icon={<Flag className="h-5 w-5" />} title={t('Aucun signalement')} /> : (
        <ul className="space-y-3">
          {items.map((r) => {
            const s = r.snapshot as { text?: string; url?: string; caption?: string; author?: string; messages?: { from: string; text: string }[] };
            return (
              <li key={r.id}>
                <Card>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="red">{t(KIND[r.kind] ?? r.kind)}</Badge>
                    <Badge tone="amber">{t(REASON[r.reason] ?? r.reason)}</Badge>
                    {r.reports > 1 && <Badge tone="violet">{t('{n} signalements', { n: r.reports })}</Badge>}
                    <span className="ml-auto text-xs text-ink-muted">{t('Signalé par {name}', { name: r.reporter })} · {relative(r.createdAt, lang)}</span>
                  </div>
                  {s.author && <p className="mt-2 text-sm text-ink-muted">{t('Auteur : {name}', { name: s.author })}</p>}
                  {s.text && <p className="mt-2 whitespace-pre-wrap break-words rounded-2xl bg-canvas p-3 text-sm">{s.text}</p>}
                  {s.url && <img src={s.url} alt="" className="mt-2 max-h-64 rounded-2xl" />}
                  {s.caption && <p className="mt-1 text-sm text-ink-soft">{s.caption}</p>}
                  {s.messages && (
                    <ul className="mt-2 space-y-1 rounded-2xl bg-canvas p-3 text-sm">
                      {s.messages.map((m, i) => <li key={i}><b>{m.from === 'org' ? t('Organisation') : t('Membre')} :</b> <span className="whitespace-pre-wrap break-words">{m.text}</span></li>)}
                    </ul>
                  )}
                  {r.note && <p className="mt-2 text-sm text-ink-soft">{t('Précisions : {note}', { note: r.note })}</p>}
                  {r.status === 'open' && (
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="danger" loading={busy === r.id} onClick={() => void decide(r, 'remove')}>{t('Supprimer le contenu')}</Button>
                      <Button size="sm" variant="outline" loading={busy === r.id} onClick={() => void decide(r, 'dismiss')}>{t('Classer (aucune action)')}</Button>
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
