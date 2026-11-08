import { Link } from 'react-router-dom';
import { Heart, MapPin, Plus, Radio, Repeat, Ticket } from 'lucide-react';
import { categories, organizers } from '@/data/mock';
import { minPrice } from '@/services/api';
import { useApp } from '@/store/app';
import { convert, cx, dayParts, money, time } from '@/lib/format';
import type { EventItem } from '@/types';
import { Badge, IconBadge } from './ui';

export function categoryOf(id: string) {
  return categories.find((c) => c.id === id);
}

/** Visuel d'événement : image fournie par le backend, sinon dégradé + motif. */
export function EventCover({ event, className, children }: { event: EventItem; className?: string; children?: React.ReactNode }) {
  const isUrl = /^(https?:|\/|data:)/.test(event.cover);
  const cat = categoryOf(event.categories[0]);
  return (
    <div className={cx('relative overflow-hidden', className)} style={isUrl ? undefined : { background: event.cover }}>
      {isUrl ? (
        <img src={event.cover} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
      ) : (
        <>
          <div className="cover-pattern absolute inset-0 opacity-30" />
          <span className="absolute -bottom-4 -right-2 select-none text-[7rem] leading-none opacity-90 drop-shadow-xl" aria-hidden>
            {cat?.emoji}
          </span>
        </>
      )}
      {children}
    </div>
  );
}

function usePrice(e: EventItem) {
  const { currency, lang, t } = useApp();
  // Prix d'appel : le moins cher des billets payants ; « Gratuit » seulement si tout est gratuit
  const paid = e.tickets.filter((x) => x.price > 0).map((x) => x.price);
  const p = paid.length ? Math.min(...paid) : minPrice(e);
  if (p === 0) return t('common.free');
  return `${t('common.from')} ${money(Math.round(convert(p, e.currency, currency) * 100) / 100, currency, lang)}`;
}

export function FavoriteButton({ eventId, className }: { eventId: string; className?: string }) {
  const { favorites, toggleFavorite, toast, lang } = useApp();
  const on = favorites.includes(eventId);
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite(eventId);
        toast(on ? (lang === 'en' ? 'Removed from favorites' : 'Retiré des favoris') : lang === 'en' ? 'Added to favorites' : 'Ajouté aux favoris', 'info');
      }}
      className={cx('grid h-10 w-10 place-items-center rounded-full bg-white/90 backdrop-blur transition active:scale-90', className)}
    >
      <Heart className={cx('h-[18px] w-[18px]', on ? 'fill-rose-500 text-rose-500' : 'text-ink')} />
    </button>
  );
}

function DateBlock({ iso, className }: { iso: string; className?: string }) {
  const { lang } = useApp();
  const d = dayParts(iso, lang);
  return (
    <div className={cx('flex w-12 flex-col items-center rounded-2xl bg-white py-1.5 text-ink shadow-sm', className)}>
      <span className="text-[10px] font-semibold uppercase text-ink-muted">{d.month}</span>
      <span className="text-lg font-extrabold leading-none">{d.day}</span>
    </div>
  );
}

/** Carte verticale (grilles, carrousels). */
export function EventCard({ event, className }: { event: EventItem; className?: string }) {
  const price = usePrice(event);
  const { lang } = useApp();
  const left = event.tickets.reduce((a, t) => a + t.quota - t.sold, 0);
  return (
    <Link to={`/e/${event.slug}`} className={cx('group block rounded-3xl bg-white p-2 shadow-card transition hover:-translate-y-0.5', className)}>
      <EventCover event={event} className="aspect-[4/3] rounded-[1.25rem]">
        <DateBlock iso={event.start} className="absolute left-3 top-3" />
        <FavoriteButton eventId={event.id} className="absolute right-3 top-3" />
        <div className="absolute bottom-3 left-3 flex flex-wrap gap-1.5">
          {event.online && (
            <Badge tone="ink" className="bg-ink/80 backdrop-blur">
              <Radio className="h-3 w-3" /> {event.venue ? 'Hybride' : 'En ligne'}
            </Badge>
          )}
          {event.recurring && (
            <Badge className="bg-white/90">
              <Repeat className="h-3 w-3" /> Récurrent
            </Badge>
          )}
          {left === 0 && <Badge tone="red" className="bg-white">Complet</Badge>}
        </div>
      </EventCover>
      <div className="px-2 pb-2 pt-3">
        <h3 className="line-clamp-1 font-bold text-ink">{event.title}</h3>
        <p className="mt-1 flex items-center gap-1 text-sm text-ink-muted">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="line-clamp-1">{event.venue ? `${event.venue.name}, ${event.venue.city}` : event.online?.platform}</span>
        </p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm font-bold text-brand">{price}</span>
          <span className="text-xs text-ink-muted">{time(event.start, lang)}</span>
        </div>
      </div>
    </Link>
  );
}

/** Ligne compacte — reprend les lignes « Breakfast / Lunch time » de la maquette. */
export function EventRow({ event, className }: { event: EventItem; className?: string }) {
  const price = usePrice(event);
  const { lang } = useApp();
  const org = organizers.find((o) => o.id === event.organizerId);
  return (
    <Link to={`/e/${event.slug}`} className={cx('flex items-center gap-4 rounded-3xl bg-white p-3 pr-4 shadow-card transition hover:bg-brand-50/40', className)}>
      <EventCover event={event} className="h-16 w-16 shrink-0 rounded-2xl [&>span]:!text-[2.6rem] [&>span]:!-bottom-1" />
      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-1 font-bold text-ink">{event.title}</h3>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
          <IconBadge size="sm" tone="orange" className="h-6 w-6 rounded-lg">
            <Ticket className="h-3.5 w-3.5" />
          </IconBadge>
          <span className="font-semibold text-ink">{price}</span>
          <span className="text-ink-muted">· {dayParts(event.start, lang).day} {dayParts(event.start, lang).month} · {org?.name}</span>
        </div>
      </div>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-canvas text-ink">
        <Plus className="h-4 w-4" />
      </span>
    </Link>
  );
}
