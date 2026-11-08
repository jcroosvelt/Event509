import { Heart } from 'lucide-react';
import { events } from '@/data/mock';
import { useApp } from '@/store/app';
import { useTitle } from '@/lib/hooks';
import { ButtonLink, EmptyState, PageHeader, SectionHeader } from '@/components/ui';
import { EventCard } from '@/components/events';

export default function Favorites() {
  const { favorites, follows, t } = useApp();
  useTitle(t('Favoris'));
  const list = events.filter((e) => favorites.includes(e.id));
  // Recommandations : mêmes catégories que les favoris, ou organisateurs suivis
  const cats = new Set(list.flatMap((e) => e.categories));
  const reco = events
    .filter((e) => e.status === 'published' && !favorites.includes(e.id) && new Date(e.end) > new Date())
    .filter((e) => e.categories.some((c) => cats.has(c)) || follows.includes(e.organizerId))
    .slice(0, 4);

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:pt-10">
      <PageHeader title={t('Favoris')} subtitle={t('Les événements que vous avez sauvegardés.')} />
      {list.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{list.map((e) => <EventCard key={e.id} event={e} />)}</div>
      ) : (
        <EmptyState icon={<Heart className="h-5 w-5" />} title={t('Aucun favori pour l’instant')} body={t('Touchez le cœur d’un événement pour le retrouver ici et recevoir des suggestions.')} action={<ButtonLink to="/explorer">{t('Explorer')}</ButtonLink>} />
      )}
      {reco.length > 0 && (
        <section aria-labelledby="h-reco" className="mt-10">
          <SectionHeader id="h-reco" title={t('Recommandés pour vous')} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{reco.map((e) => <EventCard key={e.id} event={e} />)}</div>
        </section>
      )}
    </div>
  );
}
