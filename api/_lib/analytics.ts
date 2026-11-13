import type { Campaign, Order } from '../../src/types.js';
import { all, docs } from './db.js';
import { convert, type Currency } from './fees.js';
import { benefitsFor, type PremiumDeps } from './premium.js';
import type { Ctx } from './routes.js';

type Handler = (c: Ctx) => Promise<unknown>;

/**
 * Statistiques avancées (avantage « analytics » des organisateurs vérifiés). Uniquement des chiffres agrégés :
 * aucune donnée personnelle d'acheteur (nom, email, téléphone) ne sort d'ici.
 */
export function analyticsRoutes(h: PremiumDeps): [string, string, Handler][] {
  const { fail, str, org } = h;

  const analytics: Handler = async (c) => {
    const orgId = org(c, 'dashboard');
    if (!(await benefitsFor(orgId)).includes('analytics')) fail(403, 'Les statistiques avancées sont réservées aux organisateurs vérifiés');
    const day = (v: string, fallback: Date) => {
      const d = /^\d{4}-\d{2}-\d{2}$/.test(str(v, 10)) ? new Date(`${str(v, 10)}T00:00:00Z`) : fallback;
      return Number.isNaN(d.getTime()) ? fallback : d;
    };
    const to = day(c.query.to ?? '', new Date());
    const from = day(c.query.from ?? '', new Date(to.getTime() - 89 * 86_400_000));
    if (from > to || to.getTime() - from.getTime() > 800 * 86_400_000) fail(422, 'Période invalide');
    const end = new Date(to.getTime() + 86_400_000);

    const events = await all<{ id: string; data: { title: string; start: string; status: string; categories: string[]; currency: Currency; views: number; tickets: { quota: number; sold: number; price: number }[] } }>(
      `select id, data from events where organizer_id = $1`, [orgId]);
    const rows = await all<{ event_id: string; created_at: Date; data: Order }>(
      `select o.event_id, o.created_at, o.data from orders o join events e on e.id = o.event_id
       where e.organizer_id = $1 and o.status in ('paid', 'partially_refunded') and o.created_at >= $2 and o.created_at < $3 order by o.created_at limit 20000`,
      [orgId, from, end]);

    const qty = (o: Order) => o.items.reduce((a, i) => a + i.qty, 0);
    const htg = (o: Order, v: number) => Math.round(convert(v, o.currency, 'HTG'));
    const byEvent = new Map<string, { revenue: number; tickets: number; orders: number }>();
    const byDay = new Map<string, { tickets: number; revenue: number }>();
    const sources = { direct: { orders: 0, revenue: 0 }, promo: { orders: 0, revenue: 0 }, ambassador: { orders: 0, revenue: 0 }, link: { orders: 0, revenue: 0 } };
    let revenue = 0, fees = 0, tickets = 0;
    for (const r of rows) {
      const o = r.data;
      const rev = htg(o, o.subtotal - o.discount);
      const q = qty(o);
      revenue += rev; fees += htg(o, o.fees); tickets += q;
      const e = byEvent.get(r.event_id) ?? { revenue: 0, tickets: 0, orders: 0 };
      e.revenue += rev; e.tickets += q; e.orders++; byEvent.set(r.event_id, e);
      const d = r.created_at.toLocaleDateString('en-CA', { timeZone: 'America/Port-au-Prince' });
      const dd = byDay.get(d) ?? { tickets: 0, revenue: 0 };
      dd.tickets += q; dd.revenue += rev; byDay.set(d, dd);
      const src = o.src ? 'link' : o.referral ? 'ambassador' : o.promoCode ? 'promo' : 'direct';
      sources[src].orders++; sources[src].revenue += rev;
    }
    // Série continue : un point par jour de la période (les jours sans vente valent 0)
    const series: { day: string; tickets: number; revenue: number }[] = [];
    for (let t = from.getTime(); t <= to.getTime(); t += 86_400_000) {
      const k = new Date(t).toISOString().slice(0, 10);
      series.push({ day: k, ...(byDay.get(k) ?? { tickets: 0, revenue: 0 }) });
    }
    const perEvent = events.map((e) => {
      const s = byEvent.get(e.id) ?? { revenue: 0, tickets: 0, orders: 0 };
      const quota = e.data.tickets.reduce((a, t) => a + t.quota, 0);
      const sold = e.data.tickets.reduce((a, t) => a + t.sold, 0);
      return {
        id: e.id, title: e.data.title, start: e.data.start, status: e.data.status, category: e.data.categories?.[0] ?? '',
        revenue: s.revenue, ticketsInPeriod: s.tickets, orders: s.orders, views: e.data.views ?? 0, quota, sold, remaining: Math.max(0, quota - sold),
        conversion: e.data.views > 0 ? Math.round((s.orders / e.data.views) * 1000) / 10 : 0,
      };
    }).sort((a, b) => b.revenue - a.revenue);
    const categories = new Map<string, { revenue: number; tickets: number }>();
    for (const e of perEvent) {
      const k = e.category || 'other';
      const cur = categories.get(k) ?? { revenue: 0, tickets: 0 };
      cur.revenue += e.revenue; cur.tickets += e.ticketsInPeriod; categories.set(k, cur);
    }
    const campaigns = await docs<Campaign>(`select data from campaigns where organizer_id = $1 order by data->>'date' desc limit 20`, [orgId]);
    const capacity = perEvent.reduce((a, e) => a + e.quota, 0);
    const sold = perEvent.reduce((a, e) => a + e.sold, 0);
    return {
      range: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) },
      totals: { revenue, fees, net: revenue - fees, tickets, orders: rows.length, averageOrder: rows.length ? Math.round(revenue / rows.length) : 0 },
      inventory: { capacity, sold, remaining: Math.max(0, capacity - sold) },
      series,
      events: perEvent,
      categories: [...categories].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.revenue - a.revenue),
      sources: Object.entries(sources).map(([key, v]) => ({ key, ...v })).filter((s) => s.orders > 0),
      campaigns: campaigns.map((k) => ({ id: k.id, name: k.name, channel: k.channel, status: k.status, sent: k.sent, opened: k.opened, clicks: k.clicks, date: k.date })),
    };
  };

  return [['GET', '/org/analytics', analytics]];
}
