import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Copy, Share2, Trash2, UserX } from 'lucide-react';
import { useApp } from '@/store/app';
import { addPhoto, blockAuthor, communityAvailable, deletePhoto, listPhotos, type EventPhoto, type PhotoList } from '@/services/community';
import { shrinkImage } from '@/lib/image';
import { relative } from '@/lib/format';
import { Avatar, Button, Card, Modal, Spinner } from '@/components/ui';
import { ReportContent } from '@/components/ReportContent';

/** Photos d'un événement passé : les personnes qui avaient un billet (et l'équipe) en ajoutent ; tout le monde les voit et peut les partager. */
export function EventPhotos({ eventId, slug, title }: { eventId: string; slug: string; title: string }) {
  const { t, lang, toast, user } = useApp();
  const [data, setData] = useState<PhotoList | null>(null);
  const [open, setOpen] = useState<EventPhoto | null>(null);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const load = useCallback(() => { listPhotos(eventId).then(setData).catch(() => {}); }, [eventId]);
  useEffect(() => { if (communityAvailable) load(); }, [load, user?.id]);
  // Lien partagé vers une photo : ?photo=<id>
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('photo');
    if (id && data) setOpen(data.items.find((p) => p.id === id) ?? null);
  }, [data]);
  if (!communityAvailable || !data) return null;
  if (!data.items.length && !data.canAdd) return null;

  const upload = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) return toast(t('Choisissez une image JPG, PNG ou WebP'), 'error');
    if (f.size > 20 * 1024 * 1024) return toast(t('Image trop lourde : 20 Mo maximum'), 'error');
    setBusy(true);
    try {
      await addPhoto(eventId, await shrinkImage(f, { maxSide: 1600, type: 'image/jpeg', quality: 0.85 }), f.name);
      toast(t('Photo ajoutée'));
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('La photo n’a pas pu être envoyée. Réessayez.'), 'error');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  const loadMore = async () => {
    setMore(true);
    try {
      const next = await listPhotos(eventId, data.items[data.items.length - 1]!.createdAt);
      setData({ ...next, items: [...data.items, ...next.items] });
    } finally {
      setMore(false);
    }
  };
  const link = (p: EventPhoto) => `${window.location.origin}/e/${slug}?photo=${encodeURIComponent(p.id)}`;
  const share = async (p: EventPhoto) => {
    const url = link(p);
    if (typeof navigator.share === 'function') await navigator.share({ title, text: t('Photo de {title}', { title }), url }).catch(() => {});
    else await navigator.clipboard?.writeText(url).then(() => toast(t('Lien copié')), () => toast(t('Copie impossible : sélectionnez le lien manuellement'), 'error'));
  };
  const remove = async (p: EventPhoto) => {
    if (!window.confirm(t('Supprimer cette photo ?'))) return;
    try { await deletePhoto(p.id); setOpen(null); load(); } catch { toast(t('Suppression impossible. Réessayez.'), 'error'); }
  };
  const block = async (p: EventPhoto) => {
    if (!window.confirm(t('Bloquer ce membre ? Vous ne verrez plus ses commentaires ni ses photos.'))) return;
    try { await blockAuthor('photo', p.id); setOpen(null); load(); toast(t('Membre bloqué')); } catch { toast(t('Action impossible. Réessayez.'), 'error'); }
  };

  return (
    <section aria-labelledby="h-photos" className="mt-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="h-photos" className="flex items-center gap-2 text-lg font-extrabold"><Camera className="h-5 w-5" aria-hidden /> {t('Photos')} ({data.total})</h2>
        {data.canAdd && (
          <>
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void upload(e.target.files)} />
            <Button size="sm" loading={busy} onClick={() => input.current?.click()}><Camera className="h-4 w-4" aria-hidden /> {t('Ajouter une photo')}</Button>
          </>
        )}
      </div>
      <Card>
        {!data.items.length ? <p className="text-sm text-ink-muted">{t('Aucune photo pour le moment. Les personnes qui avaient un billet peuvent en ajouter.')}</p> : (
          <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
            {data.items.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => setOpen(p)} className="block aspect-square w-full overflow-hidden rounded-xl bg-canvas">
                  <img src={p.url} alt={p.caption || t('Photo de {title}', { title })} loading="lazy" className="h-full w-full object-cover transition hover:scale-105" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {data.hasMore && <div className="mt-4 text-center"><Button variant="outline" size="sm" loading={more} onClick={() => void loadMore()}>{more ? <Spinner /> : t('Voir plus de photos')}</Button></div>}
      </Card>
      <Modal open={!!open} onClose={() => setOpen(null)} title={t('Photo')} size="lg">
        {open && (
          <div className="space-y-3">
            <img src={open.url} alt={open.caption || t('Photo de {title}', { title })} className="max-h-[60vh] w-full rounded-2xl bg-canvas object-contain" />
            {open.caption && <p className="whitespace-pre-wrap break-words text-sm text-ink-soft">{open.caption}</p>}
            <div className="flex items-center gap-2 text-sm">
              <Avatar name={open.author.name} src={open.author.avatarUrl} size={28} />
              <b>{open.author.name}</b>
              <span className="text-xs text-ink-muted">{relative(open.createdAt, lang)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-ink-muted">
              <Button size="sm" variant="soft" onClick={() => void share(open)}><Share2 className="h-4 w-4" aria-hidden /> {t('Partager')}</Button>
              <button type="button" className="hover:text-ink" onClick={() => navigator.clipboard?.writeText(link(open)).then(() => toast(t('Lien copié')), () => toast(t('Copie impossible : sélectionnez le lien manuellement'), 'error'))}><Copy className="mr-1 inline h-3 w-3" aria-hidden />{t('Copier le lien')}</button>
              {!open.mine && <ReportContent kind="photo" targetId={open.id} />}
              {!open.mine && user && <button type="button" className="hover:text-red-600" onClick={() => void block(open)}><UserX className="mr-1 inline h-3 w-3" aria-hidden />{t('Bloquer')}</button>}
              {open.canDelete && <button type="button" className="hover:text-red-600" onClick={() => void remove(open)}><Trash2 className="mr-1 inline h-3 w-3" aria-hidden />{t('Supprimer')}</button>}
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
