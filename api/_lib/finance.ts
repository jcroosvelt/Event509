import type { Order, Payout, RefundRequest } from '../../src/types.js';
import { all, docs } from './db.js';
import { convert, type Currency } from './fees.js';
import { benefitsFor, type PremiumDeps } from './premium.js';
import type { Ctx } from './routes.js';

type Handler = (c: Ctx) => Promise<unknown>;
type Balance = Record<'HTG' | 'USD', { gross: number; fees: number; rate: number; refunded: number; paid: number; balance: number }> & { buyerShare: number };

/**
 * Gestion financière avancée (avantage « finance ») : tableau de bord des revenus, commissions, paiements en attente,
 * historique des transactions et des retraits. Les transactions ne montrent jamais le nom ni l'email de l'acheteur.
 * Les retraits (même « prioritaires ») restent soumis à la validation de l'administration.
 */
export function financeRoutes(h: PremiumDeps & { balanceOf: (orgId: string) => Promise<Balance> }): [string, string, Handler][] {
  const { fail, str, org, balanceOf } = h;

  const finance: Handler = async (c) => {
    const orgId = org(c, 'payouts');
    if (!(await benefitsFor(orgId)).includes('finance')) fail(403, 'La gestion financière avancée est réservée aux organisateurs vérifiés');
    const day = (v: string, fallback: Date) => {
      const d = /^\d{4}-\d{2}-\d{2}$/.test(str(v, 10)) ? new Date(`${str(v, 10)}T00:00:00Z`) : fallback;
      return Number.isNaN(d.getTime()) ? fallback : d;
    };
    const to = day(c.query.to ?? '', new Date());
    const from = day(c.query.from ?? '', new Date(to.getTime() - 364 * 86_400_000));
    if (from > to || to.getTime() - from.getTime() > 800 * 86_400_000) fail(422, 'Période invalide');
    const end = new Date(to.getTime() + 86_400_000);

    const rows = await all<{ id: string; created_at: Date; status: string; event: string; data: Order }>(
      `select o.id, o.created_at, o.status, e.data->>'title' as event, o.data from orders o join events e on e.id = o.event_id
       where e.organizer_id = $1 and o.created_at >= $2 and o.created_at < $3 and o.status in ('paid', 'pending', 'partially_refunded', 'refunded') order by o.created_at desc limit 5000`,
      [orgId, from, end]);
    const htg = (o: Order, v: number) => Math.round(convert(v, o.currency as Currency, 'HTG'));
    const net = (o: Order) => htg(o, o.subtotal - o.discount);

    let gross = 0, fees = 0, organizerFees = 0, pendingAmount = 0, pendingOrders = 0, orders = 0;
    const monthly = new Map<string, { gross: number; fees: number; orders: number }>();
    for (const r of rows) {
      const o = r.data;
      if (r.status === 'pending') { pendingAmount += htg(o, o.total); pendingOrders++; continue; }
      if (r.status === 'refunded') continue;
      gross += net(o); fees += htg(o, o.fees); orders++;
      // Part payée par l'acheteur = total payé − prix des billets ; le reste de la commission est déduit de l'organisateur
      organizerFees += htg(o, Math.max(0, o.fees - (o.total - (o.subtotal - o.discount))));
      const m = r.created_at.toLocaleDateString('en-CA', { timeZone: 'America/Port-au-Prince' }).slice(0, 7);
      const cur = monthly.get(m) ?? { gross: 0, fees: 0, orders: 0 };
      cur.gross += net(o); cur.fees += htg(o, o.fees); cur.orders++; monthly.set(m, cur);
    }
    const refundRows = await all<{ data: RefundRequest }>(`select data from refunds where organizer_id = $1 and status = 'approved' and created_at >= $2 and created_at < $3`, [orgId, from, end]);
    const refunds = refundRows.reduce((a, r) => a + Math.round(convert(r.data.amount, r.data.currency, 'HTG')), 0);
    const payouts = await docs<Payout>(`select data from payouts where organizer_id = $1 order by created_at desc limit 200`, [orgId]);
    const bal = await balanceOf(orgId);
    const payoutTotals = payouts.reduce<Record<string, number>>((a, p) => ((a[p.status] = (a[p.status] ?? 0) + Math.round(convert(p.amount, p.currency, 'HTG'))), a), {});

    return {
      range: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) },
      summary: { gross, fees, buyerFees: Math.max(0, fees - organizerFees), organizerFees, refunds, net: Math.max(0, gross - organizerFees - refunds), pendingAmount, pendingOrders, orders },
      balance: { HTG: bal.HTG.balance, USD: bal.USD.balance, buyerShare: bal.buyerShare },
      payoutTotals,
      monthly: [...monthly].map(([month, v]) => ({ month, ...v })).sort((a, b) => a.month.localeCompare(b.month)),
      transactions: rows.slice(0, 500).map((r) => ({
        id: r.id, date: r.created_at.toISOString(), event: r.event, method: r.data.method, status: r.status, currency: r.data.currency,
        amount: r.data.subtotal - r.data.discount, fee: r.data.fees, total: r.data.total, tickets: r.data.items.reduce((a, i) => a + i.qty, 0),
      })),
      payouts: payouts.map((p) => ({ id: p.id, reference: p.reference, date: p.date, amount: p.amount, currency: p.currency, method: p.method, status: p.status, priority: p.priority === true })),
    };
  };

  return [['GET', '/org/finance', finance]];
}
