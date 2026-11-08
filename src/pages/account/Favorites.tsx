import { Heart } from 'lucide-react';
import { events } from '@/data/mock';
import { useApp } from '@/store/app';
import { ButtonLink, EmptyState, PageHeader, SectionHeader } from '@/components/ui';
import { EventCard } from '@/components/events';

export default function Favorites() {
  const { favorites, t } = useApp();
  const list = events.filter((e) => favorites.includes(e.id));
  // Recommandations simples : mêmes catégories que les favoris
  const cats = new Set(list.flatMap((e) => e.categories));
  const reco = events.filter((e) => e.status === 'published' && !favorites.includes(e.id) && e.categories.some((c) => cats.has(c))).slice(0, 4);

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:pt-10">
      <PageHeader title={t('nav.favorites')} subtitle="Les événements que vous avez sauvegardés." />
      {list.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{list.map((e) => <EventCard key={e.id} event={e} />)}</div>
      ) : (
        <EmptyState icon={<Heart className="h-5 w-5" />} title="Aucun favori" body="Touchez le cœur d’un événement pour le retrouver ici." action={<ButtonLink to="/explorer">Explorer</ButtonLink>} />
      )}
      {reco.length > 0 && (
        <section className="mt-10">
          <SectionHeader title={t('home.recommended')} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{reco.map((e) => <EventCard key={e.id} event={e} />)}</div>
        </section>
      )}
    </div>
  );
}
