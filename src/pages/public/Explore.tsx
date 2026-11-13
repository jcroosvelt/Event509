import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, SearchX, SlidersHorizontal } from 'lucide-react';
import { categories, cities } from '@/data/mock';
import { listEvents, type EventFilters } from '@/services/api';
import { useAsync, useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { cx } from '@/lib/format';
import { Button, Chip, EmptyState, Field, Input, Modal, Segmented, Select, Skeleton, Toggle } from '@/components/ui';
import { CategoryIcon, EventCard } from '@/components/events';
import type { CategoryId } from '@/types';

const whenLabels = { '': 'Toutes', today: 'Aujourd’hui', weekend: 'Ce week-end', week: '7 prochains jours', month: 'Ce mois-ci' } as const;

export default function Explore() {
  const { t } = useApp();
  useTitle(t('Explorer'));
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(false);

  const f: EventFilters = {
    q: params.get('q') ?? '',
    city: params.get('city') ?? '',
    category: (params.get('category') ?? '') as CategoryId | '',
    when: (params.get('when') ?? '') as EventFilters['when'],
    price: (params.get('price') ?? '') as EventFilters['price'],
    online: params.get('online') === '1',
    sort: (params.get('sort') ?? 'date') as EventFilters['sort'],
  };
  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    setParams(p, { replace: true });
  };
  const { data, loading } = useAsync(() => listEvents(f), [params.toString()]);
  const activeCount = ['city', 'category', 'when', 'price', 'online'].filter((k) => params.get(k)).length;
  const count = data?.length ?? 0;

  const Filters = (
    <div className="space-y-5">
      <Field label={t('Ville')}>
        <Select value={f.city} onChange={(e) => set('city', e.target.value)}>
          <option value="">{t('Toutes les villes')}</option>
          {cities.map((c) => <option key={c}>{c}</option>)}
        </Select>
      </Field>
      <Field label={t('Catégorie')}>
        <Select value={f.category} onChange={(e) => set('category', e.target.value)}>
          <option value="">{t('Toutes les catégories')}</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{t(c.label)}</option>)}
        </Select>
      </Field>
      <fieldset>
        <legend className="mb-1.5 block text-sm font-semibold">{t('Date')}</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(whenLabels) as (keyof typeof whenLabels)[]).map((w) => (
            <button
              key={w}
              type="button"
              aria-pressed={f.when === w}
              onClick={() => set('when', w)}
              className={cx('rounded-full px-3.5 py-2 text-xs font-semibold transition', f.when === w ? 'bg-contrast text-on-contrast' : 'bg-canvas text-ink-soft hover:text-ink')}
            >
              {t(whenLabels[w])}
            </button>
          ))}
        </div>
      </fieldset>
      <div>
        <span id="price-label" className="mb-1.5 block text-sm font-semibold">{t('Prix')}</span>
        <Segmented
          label={t('Prix')}
          value={f.price || ''}
          onChange={(v) => set('price', v)}
          options={[{ value: '', label: t('Tous') }, { value: 'free', label: t('Gratuit') }, { value: 'paid', label: t('Payant') }]}
        />
      </div>
      <Toggle checked={!!f.online} onChange={(v) => set('online', v ? '1' : '')} label={t('En ligne / streaming')} description={t('Événements avec lien de diffusion')} />
      <Button variant="ghost" className="w-full" onClick={() => setParams(f.q ? { q: f.q } : {}, { replace: true })}>
        {t('Réinitialiser les filtres')}
      </Button>
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:pt-10">
      <h1 className="mb-4 text-3xl font-extrabold tracking-tight">{t('Explorer')}</h1>
      <div className="mb-4 flex gap-2" role="search">
        <div className="flex-1">
          <label htmlFor="explore-q" className="sr-only">{t('Rechercher un événement')}</label>
          <Input id="explore-q" type="search" icon={<Search className="h-4 w-4" />} value={f.q} onChange={(e) => set('q', e.target.value)} placeholder={t('Événement, lieu, artiste…')} className="rounded-full" />
        </div>
        <Button variant="dark" className="h-12 lg:hidden" onClick={() => setOpen(true)} aria-label={activeCount ? t('Filtres ({n} actifs)', { n: activeCount }) : t('Filtres')}>
          <SlidersHorizontal className="h-4 w-4" aria-hidden /> {activeCount > 0 && <span className="rounded-full bg-brand px-1.5 text-xs text-white">{activeCount}</span>}
        </Button>
      </div>
      <div className="no-scrollbar -mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" aria-label={t('Catégories')}>
        <Chip active={!f.category} onClick={() => set('category', '')}>{t('Tous')}</Chip>
        {categories.map((c) => (
          <Chip key={c.id} active={f.category === c.id} onClick={() => set('category', f.category === c.id ? '' : c.id)}>
            <CategoryIcon id={c.id} className="h-4 w-4 text-brand-ink" /> {t(c.label)}
          </Chip>
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
        <aside className="hidden lg:block" aria-label={t('Filtres')}>
          <div className="sticky top-24 rounded-3xl bg-surface p-5 shadow-card">{Filters}</div>
        </aside>
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-ink-soft" aria-live="polite">
              {loading ? t('Recherche…') : count > 1 ? t('{n} événements', { n: count }) : t('{n} événement', { n: count })}
            </span>
            <Segmented
              size="sm"
              label={t('Trier par')}
              value={f.sort ?? 'date'}
              onChange={(v) => set('sort', v)}
              options={[
                { value: 'date', label: t('Date') },
                { value: 'popular', label: t('Popularité') },
                { value: 'price', label: t('Prix') },
              ]}
            />
          </div>
          {f.sort === 'popular' && <p className="-mt-2 mb-4 text-xs text-ink-muted">{t('Classement transparent : les événements « Sponsorisés » (boost payant) passent en tête, et ceux des organisateurs vérifiés reçoivent un léger coup de pouce. Les tris par date et par prix ne sont jamais modifiés.')}</p>}
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-72" />)}</div>
          ) : count ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{data!.map((e) => <EventCard key={e.id} event={e} />)}</div>
          ) : (
            <EmptyState
              icon={<SearchX className="h-5 w-5" />}
              title={t('Aucun événement ne correspond')}
              body={t('Élargissez la date ou la ville, ou essayez un autre mot-clé.')}
              action={<Button variant="soft" onClick={() => setParams({}, { replace: true })}>{t('Réinitialiser les filtres')}</Button>}
            />
          )}
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={t('Filtres')} footer={<Button className="flex-1" onClick={() => setOpen(false)}>{count > 1 ? t('Voir {n} événements', { n: count }) : t('Voir {n} événement', { n: count })}</Button>}>
        {Filters}
      </Modal>
    </div>
  );
}
