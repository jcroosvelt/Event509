import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarDays, Heart, MapPin, Search, Sparkles, Ticket, Zap } from 'lucide-react';
import { categories } from '@/data/mock';
import { listEvents } from '@/services/api';
import { useAsync } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { dateShort } from '@/lib/format';
import { Avatar, Card, Chip, IconBadge, ProgressRing, SectionHeader, Skeleton, StatCard } from '@/components/ui';
import { EventCard, EventRow } from '@/components/events';
import { WeekStrip } from '@/components/WeekStrip';

// Date de référence de la démo
const TODAY = new Date('2026-11-08T10:00:00');

function startOfWeek(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // lundi
  return x;
}

export default function Home() {
  const { t, user, tickets, favorites, lang } = useApp();
  const nav = useNavigate();
  const { data: events, loading } = useAsync(() => listEvents({ sort: 'date' }), []);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(new Date(2026, 10, 14));
  const [week, setWeek] = useState(startOfWeek(new Date(2026, 10, 14)));

  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const marked = useMemo(() => (events ?? []).map((e) => e.start.slice(0, 10)), [events]);
  const dayEvents = (events ?? []).filter((e) => e.start.slice(0, 10) === key(selected));

  const valid = tickets.filter((x) => x.status === 'valid');
  const nextTicket = useMemo(() => {
    const evs = (events ?? []).filter((e) => valid.some((v) => v.eventId === e.id));
    return evs.sort((a, b) => a.start.localeCompare(b.start))[0];
  }, [events, valid]);
  const daysLeft = nextTicket ? Math.max(0, Math.ceil((new Date(nextTicket.start).getTime() - TODAY.getTime()) / 86400000)) : 0;

  const featured = (events ?? []).filter((e) => e.featured);
  const online = (events ?? []).filter((e) => e.online);
  const popular = [...(events ?? [])].sort((a, b) => b.views - a.views).slice(0, 4);
  const greeting = TODAY.getHours() < 17 ? t('home.greeting.morning') : t('home.greeting.evening');

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:pt-10">
      {/* Salutation */}
      <div className="mb-6 flex items-center gap-3">
        {user ? <Avatar name={user.name} size={48} /> : <IconBadge size="lg"><Sparkles className="h-5 w-5" /></IconBadge>}
        <div className="min-w-0 flex-1">
          <div className="text-sm text-ink-muted">{greeting} !</div>
          <div className="truncate text-lg font-bold text-ink">{user ? user.name : 'Bienvenue sur Event509'}</div>
        </div>
        <Link to="/explorer?when=week" aria-label="Calendrier" className="grid h-11 w-11 place-items-center rounded-full border border-line bg-white lg:hidden">
          <CalendarDays className="h-[18px] w-[18px]" />
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-6">
          {/* Carte mise en avant */}
          {user && nextTicket ? (
            <Link to="/billets" className="flex items-center gap-4 rounded-3xl bg-brand-100 p-5 transition hover:bg-brand-200/70 sm:p-7">
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-ink-soft">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-white/70"><Zap className="h-3.5 w-3.5 text-brand" /></span>
                  {t('home.nextTicket')}
                </div>
                <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-ink sm:text-3xl">{nextTicket.title}</h1>
                <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-soft">
                  <MapPin className="h-3.5 w-3.5" /> {nextTicket.venue?.name ?? nextTicket.online?.platform} · {dateShort(nextTicket.start, lang)}
                </p>
              </div>
              <ProgressRing value={1 - Math.min(daysLeft, 60) / 60} size={104} stroke={11}>
                <div>
                  <div className="text-2xl font-extrabold leading-none text-ink">{daysLeft}</div>
                  <div className="text-[11px] text-ink-soft">jours</div>
                </div>
              </ProgressRing>
            </Link>
          ) : (
            <div className="rounded-3xl bg-brand-100 p-6 sm:p-8">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-ink-soft">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-white/70"><Zap className="h-3.5 w-3.5 text-brand" /></span>
                {t('home.hero.kicker')}
              </div>
              <h1 className="max-w-lg text-3xl font-extrabold leading-tight tracking-tight text-ink sm:text-4xl">{t('home.hero.title')}</h1>
            </div>
          )}

          {/* Recherche */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              nav(`/explorer?q=${encodeURIComponent(q)}`);
            }}
            className="relative"
          >
            <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('home.search')}
              className="h-14 w-full rounded-full border border-line bg-white pl-14 pr-32 text-sm shadow-card outline-none focus:border-brand"
            />
            <button className="absolute right-2 top-2 h-10 rounded-full bg-ink px-5 text-sm font-semibold text-white">{t('common.search')}</button>
          </form>

          {/* Stats perso */}
          <div className="grid grid-cols-2 gap-4">
            <Link to="/billets">
              <StatCard label="Billets actifs" value={valid.length} unit="billets" icon={<Ticket className="h-[18px] w-[18px]" />} tone="orange" className="h-full transition hover:shadow-lg" />
            </Link>
            <Link to="/favoris">
              <StatCard label="Événements favoris" value={favorites.length} unit="sauvés" icon={<Heart className="h-[18px] w-[18px]" />} tone="brand" className="h-full transition hover:shadow-lg" />
            </Link>
          </div>

          {/* Catégories */}
          <section>
            <SectionHeader title={t('home.categories')} />
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
              {categories.map((c) => (
                <Chip key={c.id} onClick={() => nav(`/explorer?category=${c.id}`)}>
                  <span>{c.emoji}</span> {c.label}
                </Chip>
              ))}
            </div>
          </section>

          {/* À la une */}
          <section>
            <SectionHeader title={t('home.featured')} action={<Link to="/explorer?sort=popular" className="flex items-center gap-1 text-sm font-semibold text-brand">{t('home.seeAll')} <ArrowRight className="h-4 w-4" /></Link>} />
            <div className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0">
              {loading
                ? [0, 1].map((i) => <Skeleton key={i} className="h-72 w-72 shrink-0 sm:w-auto" />)
                : featured.map((e) => <EventCard key={e.id} event={e} className="w-72 shrink-0 snap-start sm:w-auto" />)}
            </div>
          </section>
        </div>

        {/* Colonne droite : calendrier */}
        <aside className="space-y-4">
          <WeekStrip selected={selected} onSelect={setSelected} weekStart={week} onWeekChange={setWeek} marked={marked} />
          {loading ? (
            <Skeleton className="h-24" />
          ) : dayEvents.length ? (
            dayEvents.map((e) => <EventRow key={e.id} event={e} />)
          ) : (
            <Card className="py-8 text-center text-sm text-ink-muted">Aucun événement ce jour-là.<br />Choisissez une date marquée d’un point.</Card>
          )}
        </aside>
      </div>

      {/* Populaires */}
      <section className="mt-10">
        <SectionHeader title={t('home.recommended')} action={<Link to="/explorer" className="flex items-center gap-1 text-sm font-semibold text-brand">{t('home.seeAll')} <ArrowRight className="h-4 w-4" /></Link>} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {loading ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-72" />) : popular.map((e) => <EventCard key={e.id} event={e} />)}
        </div>
      </section>

      {/* En ligne */}
      {online.length > 0 && (
        <section className="mt-10">
          <SectionHeader title={t('home.online')} />
          <div className="grid gap-3 md:grid-cols-2">
            {online.map((e) => <EventRow key={e.id} event={e} />)}
          </div>
        </section>
      )}

      {/* Bandeau organisateur */}
      <section className="mt-10 overflow-hidden rounded-4xl bg-ink p-8 text-white sm:p-10">
        <div className="grid items-center gap-6 md:grid-cols-[1fr_auto]">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Vous organisez un événement ?</h2>
            <p className="mt-2 max-w-xl text-white/70">Billetterie, paiements MonCash, NatCash et cartes, check-in QR hors ligne et tableau de bord en temps réel. Publiez en quelques minutes.</p>
          </div>
          <Link to="/organisateur/evenements/nouveau" className="inline-flex h-14 items-center justify-center gap-2 rounded-full bg-brand px-7 font-semibold text-white hover:bg-brand-dark">
            Créer un événement <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
