import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, BarChart3, Eye, Megaphone, Plus, ScanLine, Ticket, TrendingUp, Users, Wallet } from 'lucide-react';
import { organizers, weeklySales } from '@/data/mock';
import { listOrganizerEvents } from '@/services/api';
import { useAsync, useTitle } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { compact, dateShort, moneyRaw, num } from '@/lib/format';
import { can, orgOf } from '@/lib/permissions';
import {
  Avatar, BarChart, ButtonLink, Card, IconBadge, Loading, ProgressBar, ProgressRing, Segmented, Select, SparkBars, SparkLine,
} from '@/components/ui';
import { EventCover } from '@/components/events';

const buyers = ['Wilson C.', 'Nadège L.', 'Kervens M.', 'Fabiola D.', 'Junior A.', 'Mirlande S.', 'Peterson D.', 'Darline E.'];
const types = ['Standard', 'VIP', 'Standard', 'Pack Groupe x5', 'Standard'];
const prices: Record<string, number> = { Standard: 2500, VIP: 7500, 'Pack Groupe x5': 10000 };

interface LiveSale { id: number; who: string; type: string; qty: number; amount: number }

/** Flux de ventes en temps réel (simulé ; à brancher sur WebSocket / SSE). */
function useLiveSales() {
  const [sales, setSales] = useState<LiveSale[]>(() =>
    Array.from({ length: 5 }, (_, i) => {
      const type = types[i % types.length];
      return { id: i, who: buyers[i], type, qty: 1 + (i % 2), amount: prices[type] * (1 + (i % 2)) };
    }),
  );
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = setInterval(() => {
      if (document.hidden) return;
      setSales((s) => {
        const type = types[Math.floor(Math.random() * types.length)];
        const qty = 1 + Math.floor(Math.random() * 3);
        return [{ id: Date.now(), who: buyers[Math.floor(Math.random() * buyers.length)], type, qty, amount: prices[type] * qty }, ...s].slice(0, 8);
      });
    }, reduced ? 15000 : 6000);
    return () => clearInterval(timer);
  }, []);
  return sales;
}

export default function Dashboard() {
  const { lang, t, user } = useApp();
  useTitle(t('Tableau de bord'));
  const orgId = orgOf(user);
  const org = organizers.find((o) => o.id === orgId);
  const { data: events, loading } = useAsync(() => listOrganizerEvents(orgId), [orgId]);
  const [eventId, setEventId] = useState('all');
  const [metric, setMetric] = useState<'tickets' | 'revenue'>('tickets');
  const [active, setActive] = useState(2);
  const live = useLiveSales();

  const scope = useMemo(() => (events ?? []).filter((e) => eventId === 'all' || e.id === eventId), [events, eventId]);
  const sold = scope.reduce((a, e) => a + e.tickets.reduce((x, tt) => x + tt.sold, 0), 0);
  const quota = scope.reduce((a, e) => a + e.tickets.reduce((x, tt) => x + tt.quota, 0), 0);
  const revenue = scope.filter((e) => e.currency === 'HTG').reduce((a, e) => a + e.tickets.reduce((x, tt) => x + tt.sold * tt.price, 0), 0);
  const views = scope.reduce((a, e) => a + e.views, 0);
  const liveTotal = live.reduce((a, s) => a + s.amount, 0);

  // Libellés des jours dans la langue de l'interface (lundi → dimanche)
  const dayNames = useMemo(() => {
    const monday = new Date(2024, 0, 1);
    return Array.from({ length: 7 }, (_, i) => new Date(monday.getFullYear(), 0, 1 + i).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR', { weekday: 'short' }).replace('.', ''));
  }, [lang]);
  const week = weeklySales.map((d, i) => ({
    label: dayNames[i],
    value: metric === 'tickets' ? d.tickets : d.revenue,
    max: metric === 'tickets' ? d.target : d.target * 2500,
  }));
  const weekTotal = weeklySales.reduce((a, d) => a + (metric === 'tickets' ? d.tickets : d.revenue), 0);
  const weekTarget = weeklySales.reduce((a, d) => a + (metric === 'tickets' ? d.target : d.target * 2500), 0);

  if (loading) return <Loading />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-3">
          <Avatar name={org?.avatar ?? 'E5'} size={48} />
          <div>
            <div className="text-sm text-ink-muted">{t('Bonjour')} {user?.name.split(' ')[0]} !</div>
            <h1 className="text-lg font-bold">{org?.name}</h1>
          </div>
        </div>
        <div className="flex gap-2">
          <label htmlFor="dash-ev" className="sr-only">{t('Événement')}</label>
          <Select id="dash-ev" value={eventId} onChange={(e) => setEventId(e.target.value)} className="h-11 w-full rounded-full sm:w-56">
            <option value="all">{t('Tous les événements')}</option>
            {(events ?? []).map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </Select>
          {can(user, 'events') && <ButtonLink to="/organisateur/evenements/nouveau" className="hidden shrink-0 sm:inline-flex"><Plus className="h-4 w-4" aria-hidden /> {t('Créer')}</ButtonLink>}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-ink-soft">{metric === 'tickets' ? t('Billets vendus') : t('Revenus')} · {t('7 jours')}</h2>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-4xl font-extrabold tracking-tight sm:text-5xl">{metric === 'tickets' ? num(weekTotal, lang) : compact(weekTotal, lang)}</span>
                <span className="text-lg text-ink-muted">{metric === 'tickets' ? t('billets') : 'HTG'}</span>
              </div>
            </div>
            <div className="flex flex-col items-start gap-2 sm:items-end">
              <Segmented label={t('Indicateur')} size="sm" value={metric} onChange={setMetric} options={[{ value: 'tickets', label: t('Billets') }, { value: 'revenue', label: t('Revenus') }]} />
              <span className="text-sm text-ink-muted">{t('Objectif :')} <b className="text-ink">{metric === 'tickets' ? num(weekTarget, lang) : compact(weekTarget, lang)}</b></span>
            </div>
          </div>
          <div className="mt-6">
            <BarChart label={t('Ventes par jour par rapport à l’objectif')} data={week} activeIndex={active} onSelect={setActive} height={190} />
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold">{t('Ventes en direct')}</h2>
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
              <span aria-hidden className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>
              Live
            </span>
          </div>
          <div className="mb-4 rounded-2xl bg-brand-100 p-4">
            <div className="text-xs font-semibold text-ink-soft">{t('Dernières ventes')}</div>
            <div className="text-2xl font-extrabold">{moneyRaw(liveTotal, 'HTG', lang)}</div>
          </div>
          <ul className="space-y-3" aria-live="polite" aria-label={t('Ventes en direct')}>
            {live.slice(0, 6).map((s) => (
              <li key={s.id} className="flex animate-[toast_.3s_ease-out] items-center gap-3">
                <Avatar name={s.who} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{s.who}</div>
                  <div className="text-xs text-ink-muted">{s.qty} × {s.type}</div>
                </div>
                <span className="text-sm font-bold">+{compact(s.amount, lang)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-2"><IconBadge tone="green" size="sm"><Ticket className="h-4 w-4" /></IconBadge><h2 className="text-sm font-semibold">{t('Billets')}</h2></div>
          <SparkBars values={[4, 6, 3, 8, 5, 9, 7, 10, 6, 8, 11, 7, 9, 12]} />
          <div><span className="text-2xl font-extrabold">{num(sold, lang)}</span> <span className="text-sm text-ink-muted">{t('vendus')}</span></div>
        </Card>
        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-2"><IconBadge tone="red" size="sm"><Wallet className="h-4 w-4" /></IconBadge><h2 className="text-sm font-semibold">{t('Revenus')}</h2></div>
          <SparkLine values={[3, 4, 3.5, 6, 4.5, 7, 6, 8, 7.5, 9]} stroke="#F43F5E" />
          <div><span className="text-2xl font-extrabold">{compact(revenue, lang)}</span> <span className="text-sm text-ink-muted">HTG</span></div>
        </Card>
        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-2"><IconBadge tone="orange" size="sm"><Users className="h-4 w-4" /></IconBadge><h2 className="text-sm font-semibold">{t('Remplissage')}</h2></div>
          <div className="flex items-center gap-3">
            <ProgressRing value={quota ? sold / quota : 0} size={64} stroke={8} track="rgb(var(--canvas))" color="#F97316">
              <span className="text-sm font-extrabold">{quota ? Math.round((sold / quota) * 100) : 0}%</span>
            </ProgressRing>
            <span className="text-xs text-ink-muted">{t('{n} places restantes', { n: num(quota - sold, lang) })}</span>
          </div>
        </Card>
        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-2"><IconBadge tone="brand" size="sm"><Eye className="h-4 w-4" /></IconBadge><h2 className="text-sm font-semibold">{t('Visites')}</h2></div>
          <SparkBars values={[8, 6, 9, 7, 11, 10, 12, 9, 13, 11, 14, 12, 15, 13]} color="bg-brand" />
          <div><span className="text-2xl font-extrabold">{compact(views, lang)}</span> <span className="text-sm text-ink-muted">· {t('conv.')} {views ? ((sold / views) * 100).toFixed(1) : 0}%</span></div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold">{t('Vos événements')}</h2>
            {can(user, 'events') && <Link to="/organisateur/evenements" className="flex items-center gap-1 text-sm font-semibold text-brand-ink">{t('Tout voir')} <ArrowUpRight className="h-4 w-4" aria-hidden /></Link>}
          </div>
          <ul className="space-y-1">
            {(events ?? []).map((e) => {
              const s = e.tickets.reduce((a, x) => a + x.sold, 0);
              const q = e.tickets.reduce((a, x) => a + x.quota, 0);
              return (
                <li key={e.id}>
                  <Link to={can(user, 'events') ? `/organisateur/evenements/${e.id}/stats` : `/e/${e.slug}`} className="flex items-center gap-4 rounded-2xl p-2 hover:bg-canvas">
                    <EventCover event={e} className="h-14 w-14 shrink-0 rounded-2xl [&>span]:!-bottom-1 [&>span]:!text-[2.2rem]" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{e.title}</div>
                      <div className="mt-1.5 flex items-center gap-3">
                        <ProgressBar value={s / q} className="flex-1" label={t('Remplissage de {event}', { event: e.title })} />
                        <span className="w-20 text-right text-xs text-ink-muted">{num(s, lang)}/{compact(q, lang)}</span>
                      </div>
                    </div>
                    <span className="hidden text-sm text-ink-muted sm:block">{dateShort(e.start, lang)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>

        <div className="grid grid-cols-2 content-start gap-4">
          {can(user, 'checkin') && (
            <Link to="/organisateur/checkin" className="col-span-2 flex items-center gap-4 rounded-3xl bg-navy p-5 text-white dark:ring-1 dark:ring-line">
              <span aria-hidden className="grid h-12 w-12 place-items-center rounded-full bg-brand"><ScanLine className="h-6 w-6" /></span>
              <div className="flex-1"><div className="font-bold">{t('Scanner les billets')}</div><div className="text-sm text-white/70">{t('Fonctionne hors ligne')}</div></div>
              <ArrowUpRight className="h-5 w-5" aria-hidden />
            </Link>
          )}
          {[
            { to: '/organisateur/participants', l: t('Participants'), i: Users, tone: 'orange' as const, p: 'attendees' as const },
            { to: '/organisateur/codes-promo', l: t('Codes promo'), i: TrendingUp, tone: 'violet' as const, p: 'promos' as const },
            { to: '/organisateur/marketing', l: t('Campagnes'), i: Megaphone, tone: 'green' as const, p: 'marketing' as const },
            { to: '/organisateur/versements', l: t('Versements'), i: Wallet, tone: 'brand' as const, p: 'payouts' as const },
            { to: '/organisateur/evenements', l: t('Statistiques'), i: BarChart3, tone: 'amber' as const, p: 'events' as const },
          ]
            .filter((x) => can(user, x.p))
            .slice(0, 4)
            .map((x) => (
              <Link key={x.to} to={x.to} className="rounded-3xl bg-surface p-4 shadow-card transition hover:-translate-y-0.5">
                <IconBadge tone={x.tone}><x.i className="h-[18px] w-[18px]" /></IconBadge>
                <div className="mt-3 text-sm font-bold">{x.l}</div>
              </Link>
            ))}
        </div>
      </div>
    </div>
  );
}
