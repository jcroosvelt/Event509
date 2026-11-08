import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, SearchX } from 'lucide-react';
import { categories, cities } from '@/data/mock';
import { listEvents, type EventFilters } from '@/services/api';
import { useAsync } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { Button, Chip, EmptyState, Field, Input, Modal, Segmented, Select, Skeleton, Toggle } from '@/components/ui';
import { EventCard } from '@/components/events';
import type { CategoryId } from '@/types';

export default function Explore() {
  const { t } = useApp();
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

  const Filters = (
    <div className="space-y-5">
      <Field label={t('filters.city')}>
        <Select value={f.city} onChange={(e) => set('city', e.target.value)}>
          <option value="">Toutes les villes</option>
          {cities.map((c) => <option key={c}>{c}</option>)}
        </Select>
      </Field>
      <Field label={t('filters.category')}>
        <Select value={f.category} onChange={(e) => set('category', e.target.value)}>
          <option value="">Toutes les catégories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
        </Select>
      </Field>
      <div>
        <span className="mb-1.5 block text-sm font-semibold">{t('filters.date')}</span>
        <div className="flex flex-wrap gap-2">
          {(['', 'today', 'weekend', 'week', 'month'] as const).map((w) => (
            <button
              key={w}
              onClick={() => set('when', w)}
              className={`rounded-full px-3.5 py-2 text-xs font-semibold transition ${f.when === w ? 'bg-ink text-white' : 'bg-canvas text-ink-soft hover:text-ink'}`}
            >
              {w ? t(`filters.when.${w}`) : t('common.all')}
            </button>
          ))}
        </div>
      </div>
      <div>
        <span className="mb-1.5 block text-sm font-semibold">{t('filters.price')}</span>
        <Segmented
          value={f.price || ''}
          onChange={(v) => set('price', v)}
          options={[{ value: '', label: t('common.all') }, { value: 'free', label: t('filters.price.free') }, { value: 'paid', label: t('filters.price.paid') }]}
        />
      </div>
      <Toggle checked={!!f.online} onChange={(v) => set('online', v ? '1' : '')} label="En ligne / streaming" description="Événements avec lien de diffusion" />
      <Button variant="ghost" className="w-full" onClick={() => setParams(f.q ? { q: f.q } : {}, { replace: true })}>
        {t('common.reset')}
      </Button>
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:pt-10">
      <h1 className="mb-4 text-3xl font-extrabold tracking-tight">{t('nav.explore')}</h1>
      <div className="mb-4 flex gap-2">
        <div className="flex-1">
          <Input icon={<Search className="h-4 w-4" />} value={f.q} onChange={(e) => set('q', e.target.value)} placeholder={t('home.search')} className="rounded-full" />
        </div>
        <Button variant="dark" className="h-12 lg:hidden" onClick={() => setOpen(true)} aria-label={t('common.filters')}>
          <SlidersHorizontal className="h-4 w-4" /> {activeCount > 0 && <span className="rounded-full bg-brand px-1.5 text-xs">{activeCount}</span>}
        </Button>
      </div>
      <div className="no-scrollbar -mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        <Chip active={!f.category} onClick={() => set('category', '')}>{t('common.all')}</Chip>
        {categories.map((c) => (
          <Chip key={c.id} active={f.category === c.id} onClick={() => set('category', f.category === c.id ? '' : c.id)}>
            {c.emoji} {c.label}
          </Chip>
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-24 rounded-3xl bg-white p-5 shadow-card">{Filters}</div>
        </aside>
        <div>
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="text-sm text-ink-soft">
              <b className="text-ink">{data?.length ?? '…'}</b> {t('filters.results')}
            </span>
            <Segmented
              size="sm"
              value={f.sort ?? 'date'}
              onChange={(v) => set('sort', v)}
              options={[
                { value: 'date', label: t('filters.sort.date') },
                { value: 'popular', label: t('filters.sort.popular') },
                { value: 'price', label: t('filters.sort.price') },
              ]}
            />
          </div>
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-72" />)}</div>
          ) : data && data.length ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{data.map((e) => <EventCard key={e.id} event={e} />)}</div>
          ) : (
            <EmptyState icon={<SearchX className="h-5 w-5" />} title="Aucun événement trouvé" body="Essayez d’élargir vos filtres ou une autre recherche." action={<Button variant="soft" onClick={() => setParams({}, { replace: true })}>{t('common.reset')}</Button>} />
          )}
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={t('common.filters')} footer={<Button className="flex-1" onClick={() => setOpen(false)}>Voir {data?.length ?? 0} {t('filters.results')}</Button>}>
        {Filters}
      </Modal>
    </div>
  );
}
