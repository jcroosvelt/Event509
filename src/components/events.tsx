import { Link } from 'react-router-dom';
import { Briefcase, Drama, GraduationCap, Heart, HandHeart, MapPin, Mic, Monitor, Music, PartyPopper, Plus, Radio, Repeat, Ticket, Trophy, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import { categories, organizers } from '@/data/mock';
import { minPrice } from '@/services/api';
import { useApp } from '@/store/app';
import { convert, cx, dayParts, money, time } from '@/lib/format';
import type { EventItem } from '@/types';
import { Badge, IconBadge } from './ui';

export function categoryOf(id: string) {
  return categories.find((c) => c.id === id);
}

const categoryIcons: Record<string, LucideIcon> = {
  music: Music, party: PartyPopper, conference: Mic, sport: Trophy, culture: Drama,
  food: UtensilsCrossed, business: Briefcase, education: GraduationCap, religion: HandHeart, online: Monitor,
};

/** Icône d'une catégorie (décorative : le nom de la catégorie est toujours écrit à côté). */
export function CategoryIcon({ id, className }: { id?: string; className?: string }) {
  const I = (id && categoryIcons[id]) || Ticket;
  return <I aria-hidden className={className ?? 'h-4 w-4'} />;
}

/** Visuel d'événement : image fournie par le backend, sinon dégradé + motif. */
export function EventCover({ event, className, children }: { event: EventItem; className?: string; children?: React.ReactNode }) {
  const isUrl = /^(https?:|\/|data:)/.test(event.cover);
  const cat = categoryOf(event.categories[0]);
  return (
    <div className={cx('relative overflow-hidden', className)} style={isUrl ? undefined : { background: event.cover }}>
      {isUrl ? (
        <img src={event.cover} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" decoding="async" />
      ) : (
        <>
          <div className="cover-pattern absolute inset-0 opacity-30" />
          <CategoryIcon id={cat?.id} className="absolute -bottom-3 -right-2 h-28 w-28 text-white/25" />
        </>
      )}
      {children}
    </div>
  );
}

/** Prix d'appel : le moins cher des billets payants ; « Gratuit » seulement si tout est gratuit. */
export function usePriceLabel(e: EventItem) {
  const { currency, lang, t } = useApp();
  const paid = e.tickets.filter((x) => x.price > 0).map((x) => x.price);
  const p = paid.length ? Math.min(...paid) : minPrice(e);
  if (p === 0) return t('Gratuit');
  return t('Dès {price}', { price: money(Math.round(convert(p, e.currency, currency) * 100) / 100, currency, lang) });
}

export function FavoriteButton({ eventId, className }: { eventId: string; className?: string }) {
  const { favorites, toggleFavorite, toast, t } = useApp();
  const on = favorites.includes(eventId);
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? t('Retirer des favoris') : t('Ajouter aux favoris')}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite(eventId);
        toast(on ? t('Retiré des favoris') : t('Ajouté aux favoris'), 'info', { label: t('Annuler l’action'), run: () => toggleFavorite(eventId) });
      }}
      className={cx('grid h-10 w-10 place-items-center rounded-full bg-surface/90 backdrop-blur transition active:scale-90', className)}
    >
      <Heart className={cx('h-[18px] w-[18px]', on ? 'fill-rose-500 text-rose-500' : 'text-ink')} aria-hidden />
    </button>
  );
}

function DateBlock({ iso, className }: { iso: string; className?: string }) {
  const { lang } = useApp();
  const d = dayParts(iso, lang);
  return (
    <div className={cx('flex w-12 flex-col items-center rounded-2xl bg-surface py-1.5 text-ink shadow-sm', className)} aria-hidden>
      <span className="text-[10px] font-semibold uppercase text-ink-muted">{d.month}</span>
      <span className="text-lg font-extrabold leading-none">{d.day}</span>
    </div>
  );
}

/** Carte verticale (grilles, carrousels). */
export function EventCard({ event, className }: { event: EventItem; className?: string }) {
  const price = usePriceLabel(event);
  const { lang, t } = useApp();
  const left = event.tickets.reduce((a, x) => a + x.quota - x.sold, 0);
  const d = dayParts(event.start, lang);
  return (
    <article className={cx('group relative rounded-3xl bg-surface p-2 shadow-card transition hover:-translate-y-0.5', className)}>
      <EventCover event={event} className="aspect-[4/3] rounded-[1.25rem]">
        <DateBlock iso={event.start} className="absolute left-3 top-3" />
        <div className="absolute bottom-3 left-3 flex flex-wrap gap-1.5">
          {event.online && (
            <Badge tone="ink" className="!bg-navy/80 !text-white backdrop-blur">
              <Radio className="h-3 w-3" aria-hidden /> {event.venue ? t('Hybride') : t('En ligne')}
            </Badge>
          )}
          {event.recurring && (
            <Badge className="!bg-surface/90">
              <Repeat className="h-3 w-3" aria-hidden /> {t('Récurrent')}
            </Badge>
          )}
          {left === 0 && <Badge tone="red" className="!bg-surface">{t('Complet')}</Badge>}
        </div>
      </EventCover>
      <div className="px-2 pb-2 pt-3">
        <h3 className="line-clamp-1 font-bold text-ink">
          {/* Le lien couvre toute la carte ; le bouton favori reste cliquable au-dessus */}
          <Link to={`/e/${event.slug}`} className="after:absolute after:inset-0 after:rounded-3xl after:content-['']">
            {event.title}
          </Link>
        </h3>
        <p className="mt-1 flex items-center gap-1 text-sm text-ink-muted">
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="line-clamp-1">{event.venue ? `${event.venue.name}, ${event.venue.city}` : event.online?.platform}</span>
        </p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm font-bold text-brand-ink">{price}</span>
          <span className="text-xs text-ink-muted"><span className="sr-only">{d.day} {d.month}, </span>{time(event.start, lang)}</span>
        </div>
      </div>
      <FavoriteButton eventId={event.id} className="absolute right-5 top-5 z-10" />
    </article>
  );
}

/** Ligne compacte — reprend les lignes « Breakfast / Lunch time » de la maquette. */
export function EventRow({ event, className }: { event: EventItem; className?: string }) {
  const price = usePriceLabel(event);
  const { lang } = useApp();
  const org = organizers.find((o) => o.id === event.organizerId);
  const d = dayParts(event.start, lang);
  return (
    <Link to={`/e/${event.slug}`} className={cx('flex items-center gap-4 rounded-3xl bg-surface p-3 pr-4 shadow-card transition hover:bg-brand-50/40', className)}>
      <EventCover event={event} className="h-16 w-16 shrink-0 rounded-2xl [&>span]:!-bottom-1 [&>span]:!text-[2.6rem]" />
      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-1 font-bold text-ink">{event.title}</h3>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
          <IconBadge size="sm" tone="orange" className="h-6 w-6 rounded-lg">
            <Ticket className="h-3.5 w-3.5" />
          </IconBadge>
          <span className="font-semibold text-ink">{price}</span>
          <span className="text-ink-muted">· {d.day} {d.month} · {org?.name}</span>
        </div>
      </div>
      <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-canvas text-ink">
        <Plus className="h-4 w-4" />
      </span>
    </Link>
  );
}
