import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Eye, Plus, ScanLine, Ticket, TrendingUp, Users, Wallet } from 'lucide-react';
import { weeklySales } from '@/data/mock';
import { listOrganizerEvents } from '@/services/api';
import { useAsync } from '@/lib/hooks';
import { useApp } from '@/store/app';
import { compact, dateShort, moneyRaw, num } from '@/lib/format';
import {
  Avatar, BarChart, ButtonLink, Card, IconBadge, Loading, ProgressBar, ProgressRing, Segmented, Select, SparkBars, SparkLine,
} from '@/components/ui';
import { EventCover } from '@/components/events';

const buyers = ['Wilson C.', 'Nadège L.', 'Kervens M.', 'Fabiola D.', 'Junior A.', 'Mirlande S.', 'Peterson D.', 'Darline E.'];
const types = ['Standard', 'VIP', 'Standard', 'Pack Groupe x5', 'Standard'];
const prices: Record<string, number> = { Standard: 2500, VIP: 7500, 'Pack Groupe x5': 10000 };

interface LiveSale { id: number; who: string; type: string; qty: number; amount: number; at: Date }

/** Flux de ventes en temps réel (simulé ; à brancher sur WebSocket / SSE). */
function useLiveSales() {
  const [sales, setSales] = useState<LiveSale[]>(() =>
    Array.from({ length: 5 }, (_, i) => {
      const type = types[i % types.length];
      return { id: i, who: buyers[i], type, qty: 1 + (i % 2), amount: prices[type] * (1 + (i % 2)), at: new Date(Date.now() - (i + 1) * 95000) };
    }),
  );
  useEffect(() => {
    const t = setInterval(() => {
      setSales((s) => {
        const type = types[Math.floor(Math.random() * types.length)];
        const qty = 1 + Math.floor(Math.random() * 3);
        return [{ id: Date.now(), who: buyers[Math.floor(Math.random() * buyers.length)], type, qty, amount: prices[type] * qty, at: new Date() }, ...s].slice(0, 8);
      });
    }, 6000);
    return () => clearInterval(t);
  }, []);
  return sales;
}

export default function Dashboard() {
  const { lang } = useApp();
  const { data: events, loading } = useAsync(() => listOrganizerEvents('org1'), []);
  const [eventId, setEventId] = useState('all');
  const [metric, setMetric] = useState<'tickets' | 'revenue'>('tickets');
  const [active, setActive] = useState(2);
  const live = useLiveSales();

  const scope = useMemo(() => (events ?? []).filter((e) => eventId === 'all' || e.id === eventId), [events, eventId]);
  const sold = scope.reduce((a, e) => a + e.tickets.reduce((x, t) => x + t.sold, 0), 0);
  const quota = scope.reduce((a, e) => a + e.tickets.reduce((x, t) => x + t.quota, 0), 0);
  const revenue = scope.filter((e) => e.currency === 'HTG').reduce((a, e) => a + e.tickets.reduce((x, t) => x + t.sold * t.price, 0), 0);
  const views = scope.reduce((a, e) => a + e.views, 0);
  const liveTotal = live.reduce((a, s) => a + s.amount, 0);

  const week = weeklySales.map((d) => ({
    label: d.day,
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
          <Avatar name="LP" size={48} />
          <div>
            <div className="text-sm text-ink-muted">Bonjour !</div>
            <div className="text-lg font-bold">Lakay Productions</div>
          </div>
        </div>
        <div className="flex gap-2">
          <Select value={eventId} onChange={(e) => setEventId(e.target.value)} className="h-11 w-56 rounded-full">
            <option value="all">Tous les événements</option>
            {(events ?? []).map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </Select>
          <ButtonLink to="/organisateur/evenements/nouveau" className="hidden sm:inline-flex"><Plus className="h-4 w-4" /> Créer</ButtonLink>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        {/* Graphique principal */}
        <Card className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-base font-semibold text-ink-soft">{metric === 'tickets' ? 'Billets vendus' : 'Revenus'} · 7 jours</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-5xl font-extrabold tracking-tight">{metric === 'tickets' ? num(weekTotal, lang) : compact(weekTotal, lang)}</span>
                <span className="text-lg text-ink-muted">{metric === 'tickets' ? 'billets' : 'HTG'}</span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Segmented size="sm" value={metric} onChange={setMetric} options={[{ value: 'tickets', label: 'Billets' }, { value: 'revenue', label: 'Revenus' }]} />
              <span className="text-sm text-ink-muted">Objectif : <b className="text-ink">{metric === 'tickets' ? num(weekTarget, lang) : compact(weekTarget, lang)}</b></span>
            </div>
          </div>
          <div className="mt-6">
            <BarChart data={week} activeIndex={active} onSelect={setActive} height={190} />
          </div>
        </Card>

        {/* Ventes en temps réel */}
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold">Ventes en direct</h2>
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-600">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>
              Live
            </span>
          </div>
          <div className="mb-4 rounded-2xl bg-brand-100 p-4">
            <div className="text-xs font-semibold text-ink-soft">Dernières ventes</div>
            <div className="text-2xl font-extrabold">{moneyRaw(liveTotal, 'HTG', lang)}</div>
          </div>
          <ul className="space-y-3">
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

      {/* Cartes KPI */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-2"><IconBadge tone="green" size="sm"><Ticket className="h-4 w-4" /></IconBadge><span className="text-sm font-semibold">Billets</span></div>
          <SparkBars values={[4, 6, 3, 8, 5, 9, 7, 10, 6, 8, 11, 7, 9, 12]} />
          <div><span className="text-2xl font-extrabold">{num(sold, lang)}</span> <span className="text-sm text-ink-muted">vendus</span></div>
        </Card>
        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-2"><IconBadge tone="red" size="sm"><Wallet className="h-4 w-4" /></IconBadge><span className="text-sm font-semibold">Revenus</span></div>
          <SparkLine values={[3, 4, 3.5, 6, 4.5, 7, 6, 8, 7.5, 9]} stroke="#F43F5E" />
          <div><span className="text-2xl font-extrabold">{compact(revenue, lang)}</span> <span className="text-sm text-ink-muted">HTG</span></div>
        </Card>
        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-2"><IconBadge tone="orange" size="sm"><Users className="h-4 w-4" /></IconBadge><span className="text-sm font-semibold">Remplissage</span></div>
          <div className="flex items-center gap-3">
            <ProgressRing value={quota ? sold / quota : 0} size={64} stroke={8} track="#F1F3F8" color="#F97316">
              <span className="text-sm font-extrabold">{quota ? Math.round((sold / quota) * 100) : 0}%</span>
            </ProgressRing>
            <span className="text-xs text-ink-muted">{num(quota - sold, lang)} places restantes</span>
          </div>
        </Card>
        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-2"><IconBadge tone="brand" size="sm"><Eye className="h-4 w-4" /></IconBadge><span className="text-sm font-semibold">Visites</span></div>
          <SparkBars values={[8, 6, 9, 7, 11, 10, 12, 9, 13, 11, 14, 12, 15, 13]} color="bg-brand" />
          <div><span className="text-2xl font-extrabold">{compact(views, lang)}</span> <span className="text-sm text-ink-muted">· conv. {views ? ((sold / views) * 100).toFixed(1) : 0}%</span></div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        {/* Événements */}
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold">Vos événements</h2>
            <Link to="/organisateur/evenements" className="flex items-center gap-1 text-sm font-semibold text-brand">Tout voir <ArrowUpRight className="h-4 w-4" /></Link>
          </div>
          <div className="space-y-3">
            {(events ?? []).map((e) => {
              const s = e.tickets.reduce((a, t) => a + t.sold, 0);
              const q = e.tickets.reduce((a, t) => a + t.quota, 0);
              return (
                <Link key={e.id} to={`/organisateur/evenements/${e.id}`} className="flex items-center gap-4 rounded-2xl p-2 hover:bg-canvas">
                  <EventCover event={e} className="h-14 w-14 shrink-0 rounded-2xl [&>span]:!-bottom-1 [&>span]:!text-[2.2rem]" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{e.title}</div>
                    <div className="mt-1.5 flex items-center gap-3">
                      <ProgressBar value={s / q} className="flex-1" />
                      <span className="w-20 text-right text-xs text-ink-muted">{num(s, lang)}/{compact(q, lang)}</span>
                    </div>
                  </div>
                  <span className="hidden text-sm text-ink-muted sm:block">{dateShort(e.start, lang)}</span>
                </Link>
              );
            })}
          </div>
        </Card>

        {/* Actions rapides */}
        <div className="grid grid-cols-2 gap-4 content-start">
          <Link to="/organisateur/checkin" className="col-span-2 flex items-center gap-4 rounded-3xl bg-ink p-5 text-white">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-brand"><ScanLine className="h-6 w-6" /></span>
            <div className="flex-1"><div className="font-bold">Scanner les billets</div><div className="text-sm text-white/60">Fonctionne hors ligne</div></div>
            <ArrowUpRight className="h-5 w-5" />
          </Link>
          {[
            { to: '/organisateur/participants', l: 'Participants', i: Users, tone: 'orange' as const },
            { to: '/organisateur/codes-promo', l: 'Codes promo', i: TrendingUp, tone: 'violet' as const },
            { to: '/organisateur/marketing', l: 'Campagnes', i: ArrowUpRight, tone: 'green' as const },
            { to: '/organisateur/versements', l: 'Versements', i: Wallet, tone: 'brand' as const },
          ].map((x) => (
            <Link key={x.to} to={x.to} className="rounded-3xl bg-white p-4 shadow-card transition hover:-translate-y-0.5">
              <IconBadge tone={x.tone}><x.i className="h-[18px] w-[18px]" /></IconBadge>
              <div className="mt-3 text-sm font-bold">{x.l}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
