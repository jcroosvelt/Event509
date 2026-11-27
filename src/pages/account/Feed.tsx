import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Newspaper } from 'lucide-react';
import { useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { communityAvailable, getFeed, type FeedItem } from '@/services/community';
import { relative } from '@/lib/format';
import { Button, Card, EmptyState, Loading } from '@/components/ui';
import { EventCard } from '@/components/events';
import { PostCard, PostComposer } from '@/components/PostCard';

/** Fil d'actualité : les nouveaux événements et les photos des organisateurs que l'on suit. */
export default function Feed() {
  const { t, lang, user } = useApp();
  useTitle(t('Fil d’actualité'));
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [more, setMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const load = useCallback(() => { getFeed().then((d) => { setItems(d.items); setHasMore(d.hasMore); }).catch(() => setItems([])); }, []);
  useEffect(() => { if (communityAvailable) load(); else setItems([]); }, [load]);
  if (items === null) return <Loading />;
  const next = async () => {
    setMore(true);
    try {
      const d = await getFeed(items[items.length - 1]!.at);
      setItems([...items, ...d.items]);
      setHasMore(d.hasMore);
    } finally {
      setMore(false);
    }
  };
  return (
    <div className="mx-auto max-w-2xl px-4 pb-28 pt-6 sm:px-6 lg:pt-10">
      <h1 className="mb-4 flex items-center gap-2 text-2xl font-extrabold tracking-tight"><Newspaper className="h-6 w-6" aria-hidden /> {t('Fil d’actualité')}</h1>
      {user?.organizerId && <PostComposer onDone={load} />}
      {!items.length ? (
        <EmptyState icon={<Newspaper className="h-5 w-5" />} title={t('Rien à voir pour le moment')} body={t('Suivez des organisateurs : leurs nouveaux événements et leurs photos apparaîtront ici.')} action={<Link to="/explorer"><Button>{t('Découvrir des événements')}</Button></Link>} />
      ) : (
        <ul className="space-y-4">
          {items.map((it) => (
            <li key={`${it.type}-${it.at}-${it.type === 'post' ? it.post.id : it.event.id}`}>
              {it.type === 'post' ? (
                <PostCard post={it.post} onRemoved={load} />
              ) : it.type === 'event' ? (
                <div>
                  <p className="mb-1 text-xs text-ink-muted">{t('Nouvel événement')} · {relative(it.at, lang)}</p>
                  <EventCard event={it.event} />
                </div>
              ) : (
                <Card>
                  <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><Camera className="h-4 w-4" aria-hidden /> {it.count === 1 ? t('1 nouvelle photo') : t('{n} nouvelles photos', { n: it.count })} · <Link to={`/e/${it.event.slug}`} className="truncate text-brand-ink">{it.event.title}</Link></p>
                  <Link to={`/e/${it.event.slug}#h-photos`} className="grid grid-cols-4 gap-1.5">
                    {it.thumbs.map((u) => <img key={u} src={u} alt="" loading="lazy" className="aspect-square w-full rounded-xl object-cover" />)}
                  </Link>
                  <p className="mt-2 text-xs text-ink-muted">{relative(it.at, lang)}</p>
                </Card>
              )}
            </li>
          ))}
        </ul>
      )}
      {hasMore && <div className="mt-5 text-center"><Button variant="outline" loading={more} onClick={() => void next()}>{t('Voir plus')}</Button></div>}
    </div>
  );
}
