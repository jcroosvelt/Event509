import type { EventItem } from '../../src/types.js';
import { all, db, one } from './db.js';
import { newId } from './auth.js';
import { benefitsFor, type PremiumDeps } from './premium.js';
import type { Ctx } from './routes.js';

type Handler = (c: Ctx) => Promise<unknown>;

/** Gestionnaire multi-événements : calendrier, vue globale et modèles (avantage « multiEvents »). */
export function multiEventRoutes(h: PremiumDeps): [string, string, Handler][] {
  const { fail, str, org } = h;
  const need = async (orgId: string) => {
    if (!(await benefitsFor(orgId)).includes('multiEvents')) fail(403, 'Le gestionnaire multi-événements est réservé aux organisateurs vérifiés');
  };

  /** Événements du mois (calendrier) et compteurs de toutes les activités. */
  const calendar: Handler = async (c) => {
    const orgId = org(c, 'events');
    await need(orgId);
    const month = /^\d{4}-\d{2}$/.test(str(c.query.month, 7)) ? str(c.query.month, 7) : new Date().toISOString().slice(0, 7);
    const rows = await all<{ id: string; data: EventItem }>(`select id, data from events where organizer_id = $1 order by start_at`, [orgId]);
    const now = new Date().toISOString().slice(0, 16);
    const slim = (e: EventItem) => ({
      id: e.id, title: e.title, start: e.start, end: e.end, status: e.status, city: e.venue?.city ?? '', recurring: e.recurring ?? null,
      sold: e.tickets.reduce((a, t) => a + t.sold, 0), quota: e.tickets.reduce((a, t) => a + t.quota, 0),
    });
    const all_ = rows.map((r) => r.data);
    return {
      month,
      events: all_.filter((e) => e.start.slice(0, 7) <= month && e.end.slice(0, 7) >= month).map(slim),
      counts: {
        upcoming: all_.filter((e) => e.status === 'published' && e.end >= now).length,
        past: all_.filter((e) => e.end < now && e.status !== 'cancelled' && e.status !== 'draft').length,
        cancelled: all_.filter((e) => e.status === 'cancelled').length,
        draft: all_.filter((e) => ['draft', 'pending', 'rejected'].includes(e.status)).length,
        total: all_.length,
      },
      next: all_.filter((e) => e.status === 'published' && e.end >= now).slice(0, 8).map(slim),
    };
  };

  const listTemplates: Handler = async (c) => {
    const orgId = org(c, 'events');
    await need(orgId);
    const rows = await all<{ id: string; name: string; created_at: Date; data: Partial<EventItem> }>(`select id, name, created_at, data from event_templates where organizer_id = $1 order by created_at desc`, [orgId]);
    return rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at.toISOString(), event: r.data }));
  };

  /** Enregistre un événement comme modèle : ni dates, ni identifiant, ni ventes, ni vues. */
  const saveTemplate: Handler = async (c) => {
    const orgId = org(c, 'events');
    await need(orgId);
    const e = (await one<{ data: EventItem }>(`select data from events where id = $1 and organizer_id = $2`, [str(c.body.eventId, 60), orgId]))?.data;
    if (!e) fail(404, 'Événement introuvable');
    const name = str(c.body.name, 80) || e!.title;
    const count = Number((await one<{ n: string }>(`select count(*) as n from event_templates where organizer_id = $1`, [orgId]))?.n ?? 0);
    if (count >= 30) fail(409, 'Limite de 30 modèles atteinte : supprimez-en un');
    const tpl: Partial<EventItem> = {
      title: e!.title, description: e!.description, cover: e!.cover, images: e!.images, categories: e!.categories, venue: e!.venue, online: e!.online,
      currency: e!.currency, seated: e!.seated, seatMap: e!.seatMap, maxPerPerson: e!.maxPerPerson, tags: e!.tags, pixels: e!.pixels, recurring: e!.recurring,
      tickets: e!.tickets.map((t) => ({ ...t, sold: 0 })),
    };
    const id = newId('tp');
    await db().query(`insert into event_templates (id, organizer_id, name, data) values ($1,$2,$3,$4)`, [id, orgId, name, JSON.stringify(tpl)]);
    return { id, name };
  };

  const removeTemplate: Handler = async (c) => {
    const orgId = org(c, 'events');
    await need(orgId);
    const r = await one<{ id: string }>(`delete from event_templates where id = $1 and organizer_id = $2 returning id`, [c.params.id, orgId]);
    if (!r) fail(404, 'Modèle introuvable');
    return null;
  };

  return [
    ['GET', '/org/calendar', calendar],
    ['GET', '/org/templates', listTemplates],
    ['POST', '/org/templates', saveTemplate],
    ['DELETE', '/org/templates/:id', removeTemplate],
  ];
}
