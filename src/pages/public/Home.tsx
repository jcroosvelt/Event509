import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarDays, Heart, MapPin, Search, Sparkles, Ticket, Zap } from 'lucide-react';
import { categories, organizers } from '@/data/mock';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { listEvents } from '@/services/api';
import { useAsync, useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { dateShort } from '@/lib/format';
import { isBoosted } from '@/lib/boost';
import { Avatar, Card, Chip, IconBadge, ProgressRing, SectionHeader, Skeleton, StatCard } from '@/components/ui';
import { CategoryIcon, EventCard, EventRow } from '@/components/events';
import { WeekStrip } from '@/components/WeekStrip';

function startOfWeek(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // lundi
  return x;
}
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function Home() {
  const { t, user, tickets, favorites, lang } = useApp();
  useTitle(t('Découvrir'));
  const nav = useNavigate();
  const { data: events, loading } = useAsync(() => listEvents({ sort: 'date' }), []);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(() => new Date());
  const [week, setWeek] = useState(() => startOfWeek(new Date()));
  const now = new Date();

  const marked = useMemo(() => (events ?? []).map((e) => e.start.slice(0, 10)), [events]);
  const dayEvents = (events ?? []).filter((e) => e.start.slice(0, 10) === dayKey(selected));

  const valid = tickets.filter((x) => x.status === 'valid');
  const nextTicket = useMemo(() => {
    const evs = (events ?? []).filter((e) => valid.some((v) => v.eventId === e.id) && new Date(e.end) > new Date());
    return evs.sort((a, b) => a.start.localeCompare(b.start))[0];
  }, [events, valid]);
  const daysLeft = nextTicket ? Math.max(0, Math.ceil((new Date(nextTicket.start).getTime() - now.getTime()) / 86400000)) : 0;

  // « À la une » : événements mis en vedette et événements sponsorisés (étiquetés), les sponsorisés d'abord
  const featured = (events ?? []).filter((e) => e.featured || isBoosted(e)).sort((a, b) => Number(isBoosted(b)) - Number(isBoosted(a)));
  const online = (events ?? []).filter((e) => e.online);
  // Section réservée aux organisateurs vérifiés : elle s'ajoute au reste, elle ne remplace ni ne masque personne
  const verifiedOrgs = organizers
    .filter((o) => o.verified)
    .map((o) => ({ ...o, upcoming: (events ?? []).filter((e) => e.organizerId === o.id).length }))
    .filter((o) => o.upcoming > 0)
    .sort((a, b) => b.upcoming - a.upcoming || a.name.localeCompare(b.name))
    .slice(0, 12);
  const popular = [...(events ?? [])].sort((a, b) => b.views - a.views).slice(0, 4);
  const greeting = now.getHours() < 18 ? t('Bonjour') : t('Bonsoir');

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:pt-10">
      <h1 className="sr-only">{t('Découvrez les événements près de chez vous')}</h1>
      <div className="mb-6 flex items-center gap-3">
        {user ? <Avatar name={user.name} size={48} /> : <IconBadge size="lg"><Sparkles className="h-5 w-5" /></IconBadge>}
        <div className="min-w-0 flex-1">
          <div className="text-sm text-ink-muted">{greeting} !</div>
          <div className="truncate text-lg font-bold text-ink">{user ? user.name : t('Bienvenue sur Event509')}</div>
        </div>
        <Link to="/explorer?when=week" aria-label={t('Événements de la semaine')} className="grid h-11 w-11 place-items-center rounded-full border border-line bg-surface lg:hidden">
          <CalendarDays className="h-[18px] w-[18px]" aria-hidden />
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-6">
          {user && nextTicket ? (
            <Link to="/billets" className="flex items-center gap-4 rounded-3xl bg-brand-100 p-5 transition hover:bg-brand-200/70 sm:p-7">
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-ink-soft">
                  <span aria-hidden className="grid h-7 w-7 place-items-center rounded-full bg-surface/70"><Zap className="h-3.5 w-3.5 text-brand-ink" /></span>
                  {t('Votre prochain événement')}
                </div>
                <h2 className="text-2xl font-extrabold leading-tight tracking-tight text-ink sm:text-3xl">{nextTicket.title}</h2>
                <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-soft">
                  <MapPin className="h-3.5 w-3.5" aria-hidden /> {nextTicket.venue?.name ?? nextTicket.online?.platform} · {dateShort(nextTicket.start, lang)}
                </p>
              </div>
              <ProgressRing value={1 - Math.min(daysLeft, 60) / 60} size={104} stroke={11} label={t('Dans {n} jours', { n: daysLeft })}>
                <div>
                  <div className="text-2xl font-extrabold leading-none text-ink">{daysLeft}</div>
                  <div className="text-[11px] text-ink-soft">{daysLeft > 1 ? t('jours') : t('jour')}</div>
                </div>
              </ProgressRing>
            </Link>
          ) : (
            <div className="rounded-3xl bg-brand-100 p-6 sm:p-8">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-ink-soft">
                <span aria-hidden className="grid h-7 w-7 place-items-center rounded-full bg-surface/70"><Zap className="h-3.5 w-3.5 text-brand-ink" /></span>
                {t('Cette semaine')}
              </div>
              <p className="max-w-lg text-3xl font-extrabold leading-tight tracking-tight text-ink sm:text-4xl">{t('Découvrez les événements près de chez vous')}</p>
            </div>
          )}

          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              nav(`/explorer?q=${encodeURIComponent(q)}`);
            }}
            className="relative"
          >
            <label htmlFor="home-search" className="sr-only">{t('Rechercher un événement')}</label>
            <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted" aria-hidden />
            <input
              id="home-search"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('Événement, lieu, artiste…')}
              className="h-14 w-full rounded-full border border-line bg-surface pl-14 pr-32 text-sm shadow-card outline-none focus:border-brand"
            />
            <button type="submit" className="absolute right-2 top-2 h-10 rounded-full bg-contrast px-5 text-sm font-semibold text-on-contrast">{t('Rechercher')}</button>
          </form>

          {user && (
            <div className="grid grid-cols-2 gap-4">
              <Link to="/billets" className="rounded-3xl">
                <StatCard label={t('Billets actifs')} value={valid.length} unit={valid.length > 1 ? t('billets') : t('billet')} icon={<Ticket className="h-[18px] w-[18px]" />} tone="orange" className="h-full transition hover:shadow-lg" />
              </Link>
              <Link to="/favoris" className="rounded-3xl">
                <StatCard label={t('Événements favoris')} value={favorites.length} unit={t('sauvés')} icon={<Heart className="h-[18px] w-[18px]" />} tone="brand" className="h-full transition hover:shadow-lg" />
              </Link>
            </div>
          )}

          <section aria-labelledby="h-cat">
            <SectionHeader id="h-cat" title={t('Catégories')} />
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
              {categories.map((c) => (
                <Chip key={c.id} onClick={() => nav(`/explorer?category=${c.id}`)}>
                  <CategoryIcon id={c.id} className="h-4 w-4 text-brand-ink" /> {t(c.label)}
                </Chip>
              ))}
            </div>
          </section>

          <section aria-labelledby="h-feat">
            <SectionHeader id="h-feat" title={t('À la une')} action={<Link to="/explorer?sort=popular" className="flex items-center gap-1 text-sm font-semibold text-brand-ink">{t('Tout voir')} <ArrowRight className="h-4 w-4" aria-hidden /></Link>} />
            <div className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0">
              {loading
                ? [0, 1].map((i) => <Skeleton key={i} className="h-72 w-72 shrink-0 sm:w-auto" />)
                : featured.map((e) => <EventCard key={e.id} event={e} className="w-72 shrink-0 snap-start sm:w-auto" />)}
            </div>
          </section>

          {verifiedOrgs.length > 0 && (
            <section aria-labelledby="h-vo">
              <SectionHeader id="h-vo" title={t('Organisateurs vérifiés')} />
              <ul className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:px-0">
                {verifiedOrgs.map((o) => (
                  <li key={o.id} className="shrink-0 snap-start">
                    <Link to={`/o/${o.slug}`} className="flex w-56 items-center gap-3 rounded-3xl bg-surface p-3 shadow-card ring-1 ring-line transition hover:ring-brand-200">
                      <Avatar name={o.avatar} src={o.logo} size={44} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1 truncate text-sm font-bold">{o.name} <VerifiedBadge size={14} /></span>
                        <span className="block truncate text-xs text-ink-muted">{t('{n} à venir', { n: o.upcoming })}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside aria-label={t('Agenda')} className="space-y-4">
          <WeekStrip selected={selected} onSelect={setSelected} weekStart={week} onWeekChange={setWeek} marked={marked} />
          <div aria-live="polite" className="space-y-4">
            {loading ? (
              <Skeleton className="h-24" />
            ) : dayEvents.length ? (
              dayEvents.map((e) => <EventRow key={e.id} event={e} />)
            ) : (
              <Card className="py-8 text-center text-sm text-ink-muted">
                {t('Aucun événement ce jour-là.')}
                <br />
                {t('Choisissez une date marquée d’un point.')}
              </Card>
            )}
          </div>
        </aside>
      </div>

      <section aria-labelledby="h-reco" className="mt-10">
        <SectionHeader id="h-reco" title={t('Recommandés pour vous')} action={<Link to="/explorer" className="flex items-center gap-1 text-sm font-semibold text-brand-ink">{t('Tout voir')} <ArrowRight className="h-4 w-4" aria-hidden /></Link>} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {loading ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-72" />) : popular.map((e) => <EventCard key={e.id} event={e} />)}
        </div>
      </section>

      {online.length > 0 && (
        <section aria-labelledby="h-online" className="mt-10">
          <SectionHeader id="h-online" title={t('Événements en ligne')} />
          <div className="grid gap-3 md:grid-cols-2">
            {online.map((e) => <EventRow key={e.id} event={e} />)}
          </div>
        </section>
      )}

      <section className="mt-10 overflow-hidden rounded-4xl bg-navy p-8 text-white dark:ring-1 dark:ring-line sm:p-10">
        <div className="grid items-center gap-6 md:grid-cols-[1fr_auto]">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{t('Vous organisez un événement ?')}</h2>
            <p className="mt-2 max-w-xl text-white/75">{t('Billetterie, paiements MonCash, NatCash et cartes, check-in QR hors ligne et tableau de bord en temps réel. Publiez en quelques minutes.')}</p>
          </div>
          <Link to="/organisateur/evenements/nouveau" className="inline-flex h-14 items-center justify-center gap-2 rounded-full bg-brand px-7 font-semibold text-white hover:bg-brand-dark">
            {t('Créer un événement')} <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>
    </div>
  );
}
