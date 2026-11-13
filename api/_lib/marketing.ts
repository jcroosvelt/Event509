import { createHmac } from 'node:crypto';
import type { Campaign } from '../../src/types.js';
import { all, db, one, upsert } from './db.js';
import { newId, randomCode, sameKey } from './auth.js';
import { mailConfigured, sendCampaignEmail, siteUrl } from './mail.js';
import { notifyEmails, pushConfigured } from './push.js';
import { benefitsFor, type PremiumDeps } from './premium.js';
import type { Ctx } from './routes.js';

type Handler = (c: Ctx) => Promise<unknown>;
const secret = () => process.env.JWT_SECRET ?? '';
/** Jeton de désinscription : impossible à fabriquer sans le secret du serveur, donc personne ne peut désinscrire un tiers. */
const unsubToken = (orgId: string, email: string) => createHmac('sha256', secret()).update(`unsub:${orgId}:${email.toLowerCase()}`).digest('base64url').slice(0, 32);

/**
 * Outils marketing (avantage « marketing ») : liens de suivi, campagnes envoyées aux acheteurs qui ont donné leur
 * consentement à l'achat (et qui ne se sont pas désinscrits), désinscription en un clic.
 */
export function marketingRoutes(h: PremiumDeps): [string, string, Handler][] {
  const { fail, str, org } = h;
  const need = async (orgId: string) => {
    if (!(await benefitsFor(orgId)).includes('marketing')) fail(403, 'Les outils marketing sont réservés aux organisateurs vérifiés');
  };

  // ---------- Liens de suivi ----------

  const listLinks: Handler = async (c) => {
    const orgId = org(c, 'marketing');
    await need(orgId);
    const rows = await all<{ id: string; event_id: string | null; code: string; label: string; clicks: number; created_at: Date; orders: string; revenue: string | null; event: string | null }>(
      `select l.id, l.event_id, l.code, l.label, l.clicks, l.created_at,
         (select count(*) from orders o where o.data->>'src' = l.code and o.status in ('paid', 'partially_refunded')) as orders,
         (select sum((o.data->>'subtotal')::numeric - (o.data->>'discount')::numeric) from orders o where o.data->>'src' = l.code and o.status in ('paid', 'partially_refunded')) as revenue,
         (select e.data->>'title' from events e where e.id = l.event_id) as event
       from tracking_links l where l.organizer_id = $1 order by l.created_at desc`, [orgId]);
    return rows.map((r) => ({
      id: r.id, code: r.code, label: r.label, eventId: r.event_id, event: r.event, clicks: r.clicks, orders: Number(r.orders), revenue: Math.round(Number(r.revenue ?? 0)),
      conversion: r.clicks > 0 ? Math.round((Number(r.orders) / r.clicks) * 1000) / 10 : 0, createdAt: r.created_at.toISOString(),
    }));
  };

  const createLink: Handler = async (c) => {
    const orgId = org(c, 'marketing');
    await need(orgId);
    const label = str(c.body.label, 60);
    if (label.length < 2) fail(422, 'Donnez un nom à ce lien (ex. « Instagram », « Affiches »)');
    const eventId = str(c.body.eventId, 60);
    if (eventId && !(await one(`select 1 from events where id = $1 and organizer_id = $2`, [eventId, orgId]))) fail(404, 'Événement introuvable');
    const n = Number((await one<{ n: string }>(`select count(*) as n from tracking_links where organizer_id = $1`, [orgId]))?.n ?? 0);
    if (n >= 100) fail(409, 'Limite de 100 liens atteinte');
    const id = newId('tl');
    const code = randomCode(7);
    await db().query(`insert into tracking_links (id, organizer_id, event_id, code, label) values ($1,$2,$3,$4,$5)`, [id, orgId, eventId || null, code, label]);
    return { id, code };
  };

  const removeLink: Handler = async (c) => {
    const orgId = org(c, 'marketing');
    await need(orgId);
    await db().query(`delete from tracking_links where id = $1 and organizer_id = $2`, [c.params.id, orgId]);
    return null;
  };

  /** Clic sur un lien de suivi (public) : compte seulement les codes qui existent. */
  const click: Handler = async (c) => {
    const code = str(c.body.code, 20);
    if (code) await db().query(`update tracking_links set clicks = clicks + 1 where code = $1`, [code]);
    return null;
  };

  // ---------- Campagnes ----------

  /** Acheteurs consentants (case cochée à l'achat), sans doublon, hors désinscrits. */
  const audience = async (orgId: string, eventId: string) =>
    (await all<{ email: string }>(
      `select distinct lower(o.buyer_email) as email from orders o join events e on e.id = o.event_id
       where e.organizer_id = $1 and ($2 = '' or o.event_id = $2) and o.data->>'marketingOptIn' = 'true' and o.status in ('paid', 'partially_refunded') and o.buyer_email is not null
         and not exists (select 1 from marketing_optouts u where u.organizer_id = $1 and u.email = lower(o.buyer_email))`, [orgId, eventId])).map((r) => r.email);

  const audienceCount: Handler = async (c) => {
    const orgId = org(c, 'marketing');
    await need(orgId);
    const eventId = str(c.query.eventId, 60);
    const emails = await audience(orgId, eventId);
    const total = Number((await one<{ n: string }>(`select count(distinct lower(o.buyer_email)) as n from orders o join events e on e.id = o.event_id where e.organizer_id = $1 and ($2 = '' or o.event_id = $2) and o.status in ('paid', 'partially_refunded')`, [orgId, eventId]))?.n ?? 0);
    return { consenting: emails.length, buyers: total, mailConfigured: mailConfigured(), pushConfigured: pushConfigured() };
  };

  const send: Handler = async (c) => {
    const orgId = org(c, 'marketing');
    await need(orgId);
    const name = str(c.body.name, 80);
    const subject = str(c.body.subject, 140);
    const body = str(c.body.body, 5000);
    const eventId = str(c.body.eventId, 60);
    const channels = Array.isArray(c.body.channels) ? c.body.channels.filter((x) => x === 'email' || x === 'push') : [];
    if (!name || subject.length < 3 || body.length < 10) fail(422, 'Renseignez le nom, l’objet et le message de la campagne');
    if (!channels.length) fail(422, 'Choisissez au moins un canal');
    if (eventId && !(await one(`select 1 from events where id = $1 and organizer_id = $2`, [eventId, orgId]))) fail(404, 'Événement introuvable');
    // Une campagne toutes les 10 minutes par organisation : pas de rafale d'envois
    if (await one(`select 1 from campaigns where organizer_id = $1 and (data->>'sentAt')::timestamptz > now() - interval '10 minutes'`, [orgId])) fail(429, 'Une campagne vient d’être envoyée : patientez quelques minutes');
    const emails = (await audience(orgId, eventId)).slice(0, 2000);
    if (!emails.length) fail(409, 'Aucun acheteur consentant pour cette audience');
    const organizer = (await one<{ name: string }>(`select data->>'name' as name from organizers where id = $1`, [orgId]))?.name ?? 'Organisateur';
    let sentEmail = 0, sentPush = 0;
    if (channels.includes('email')) {
      if (!mailConfigured()) fail(409, 'L’envoi d’emails n’est pas encore activé sur la plateforme');
      for (const e of emails) {
        const url = `${siteUrl()}/desinscription?o=${encodeURIComponent(orgId)}&e=${encodeURIComponent(e)}&t=${unsubToken(orgId, e)}`;
        if (await sendCampaignEmail(e, { organizer, subject, body, unsubscribeUrl: url })) sentEmail++;
      }
    }
    if (channels.includes('push') && pushConfigured()) sentPush = (await notifyEmails(emails, { title: organizer, body: subject, url: '/', channel: 'sales' }).catch(() => 0)) as number;
    const sent = Math.max(sentEmail, sentPush);
    const k: Campaign = { id: newId('cp'), name, channel: 'email', audience: eventId || 'all', status: sent > 0 ? 'sent' : 'draft', sent, opened: 0, clicks: 0, date: new Date().toISOString(), body };
    // sentAt sert au délai entre deux campagnes ; ouvertures et clics ne sont pas mesurés (on n'affiche pas de faux chiffres)
    await upsert('campaigns', { id: k.id, organizer_id: orgId, data: { ...k, sentAt: k.date, recipients: emails.length, sentEmail, sentPush } });
    return { recipients: emails.length, sentEmail, sentPush };
  };

  // ---------- Désinscription (publique, par jeton) ----------

  const unsubscribe: Handler = async (c) => {
    const orgId = str(c.body.o, 60);
    const email = str(c.body.e, 160).toLowerCase();
    if (!orgId || !email || !sameKey(unsubToken(orgId, email), str(c.body.t, 60))) fail(400, 'Lien de désinscription invalide');
    const name = (await one<{ name: string }>(`select data->>'name' as name from organizers where id = $1`, [orgId]))?.name ?? '';
    await db().query(`insert into marketing_optouts (organizer_id, email) values ($1,$2) on conflict do nothing`, [orgId, email]);
    return { organization: name };
  };

  return [
    ['GET', '/org/links', listLinks],
    ['POST', '/org/links', createLink],
    ['DELETE', '/org/links/:id', removeLink],
    ['POST', '/track/click', click],
    ['GET', '/org/audience', audienceCount],
    ['POST', '/org/campaigns/send', send],
    ['POST', '/unsubscribe', unsubscribe],
  ];
}
