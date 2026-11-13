import { all, db, one, tx } from './db.js';
import { newId } from './auth.js';
import { sendNoticeEmail } from './mail.js';
import { notifyUsers, organizerUserIds } from './push.js';
import { benefitsFor, type PremiumDeps } from './premium.js';
import type { Ctx } from './routes.js';

type Handler = (c: Ctx) => Promise<unknown>;
const CATEGORIES = ['technical', 'billing', 'event', 'other'];

interface TicketRow {
  id: string; organizer_id: string; user_id: string | null; subject: string; category: string; priority: 'normal' | 'priority' | 'urgent';
  status: 'open' | 'pending' | 'resolved'; created_at: Date; updated_at: Date; resolved_at: Date | null;
}
const out = (t: TicketRow) => ({
  id: t.id, subject: t.subject, category: t.category, priority: t.priority, status: t.status,
  createdAt: t.created_at.toISOString(), updatedAt: t.updated_at.toISOString(), resolvedAt: t.resolved_at?.toISOString() ?? null,
});

/**
 * Support prioritaire : canal d'assistance réservé aux organisateurs vérifiés (avantage « support »).
 * Un ticket « assistance pendant un événement » est urgent ; les autres sont prioritaires. La boîte de l'administration
 * les classe avant les demandes normales. Une organisation qui perd l'avantage garde son historique et peut y répondre.
 */
export function supportRoutes(h: PremiumDeps): [string, string, Handler][] {
  const { fail, str, admin, org } = h;
  const name = (c: Ctx) => (c.user?.data.name as string) ?? c.user?.email ?? 'Membre';

  const mine = async (c: Ctx, id: string) => {
    const orgId = org(c, 'settings');
    const t = await one<TicketRow>(`select * from support_tickets where id = $1 and organizer_id = $2`, [id, orgId]);
    if (!t) fail(404, 'Demande introuvable');
    return { orgId, t: t! };
  };
  const thread = async (id: string) =>
    (await all<{ id: string; from_role: string; author: string; body: string; created_at: Date }>(`select id, from_role, author, body, created_at from support_messages where ticket_id = $1 order by created_at`, [id]))
      .map((m) => ({ id: m.id, from: m.from_role, author: m.author, body: m.body, at: m.created_at.toISOString() }));

  const tellAdmins = async (title: string, body: string) => {
    try {
      const ids = (await all<{ id: string }>(`select id from users where role = 'admin'`)).map((x) => x.id);
      await notifyUsers(ids, { title, body, url: '/admin/support', channel: 'sales' });
    } catch (e) {
      console.error('[support] notification admin', e);
    }
  };
  const tellOrg = async (t: TicketRow, title: string, body: string) => {
    try {
      await notifyUsers(await organizerUserIds(t.organizer_id), { title, body, url: '/organisateur/support', channel: 'sales' });
      const creator = t.user_id ? await one<{ email: string }>(`select email from users where id = $1`, [t.user_id]) : null;
      if (creator) await sendNoticeEmail(creator.email, title, title, [body]);
    } catch (e) {
      console.error('[support] notification', e);
    }
  };

  const list: Handler = async (c) => {
    const orgId = org(c, 'settings');
    const rows = await all<TicketRow>(`select * from support_tickets where organizer_id = $1 order by (status = 'resolved'), updated_at desc limit 100`, [orgId]);
    return { canCreate: (await benefitsFor(orgId)).includes('support'), tickets: rows.map(out) };
  };

  const create: Handler = async (c) => {
    const orgId = org(c, 'settings');
    if (!(await benefitsFor(orgId)).includes('support')) fail(403, 'Le support prioritaire est réservé aux organisateurs vérifiés');
    const subject = str(c.body.subject, 140);
    const body = str(c.body.body, 4000);
    const category = str(c.body.category, 20);
    if (subject.length < 4) fail(422, 'Indiquez l’objet de votre demande');
    if (body.length < 10) fail(422, 'Décrivez votre demande en quelques phrases');
    if (!CATEGORIES.includes(category)) fail(422, 'Catégorie invalide');
    const open = Number((await one<{ n: string }>(`select count(*) as n from support_tickets where organizer_id = $1 and status <> 'resolved'`, [orgId]))?.n ?? 0);
    if (open >= 20) fail(429, 'Trop de demandes ouvertes : attendez une réponse avant d’en créer d’autres');
    const priority = c.body.eventDay === true ? 'urgent' : 'priority';
    const id = newId('st');
    await tx(async (q) => {
      await q.query(`insert into support_tickets (id, organizer_id, user_id, subject, category, priority, status) values ($1,$2,$3,$4,$5,$6,'open')`, [id, orgId, c.user!.id, subject, category, priority]);
      await q.query(`insert into support_messages (id, ticket_id, from_role, author, body) values ($1,$2,'organizer',$3,$4)`, [newId('sm'), id, name(c), body]);
    });
    await tellAdmins(priority === 'urgent' ? 'Support urgent (événement en cours)' : 'Nouvelle demande de support prioritaire', subject);
    return { id };
  };

  const get: Handler = async (c) => {
    const { t } = await mine(c, c.params.id);
    return { ticket: out(t), messages: await thread(t.id) };
  };

  const reply: Handler = async (c) => {
    const { t } = await mine(c, c.params.id);
    const body = str(c.body.body, 4000);
    if (body.length < 2) fail(422, 'Écrivez votre message');
    await tx(async (q) => {
      await q.query(`insert into support_messages (id, ticket_id, from_role, author, body) values ($1,$2,'organizer',$3,$4)`, [newId('sm'), t.id, name(c), body]);
      // Une réponse rouvre la demande : elle attend maintenant l'équipe d'Event509
      await q.query(`update support_tickets set status = 'open', resolved_at = null, updated_at = now() where id = $1`, [t.id]);
    });
    await tellAdmins('Réponse d’un organisateur', t.subject);
    return null;
  };

  const resolve: Handler = async (c) => {
    const { t } = await mine(c, c.params.id);
    await db().query(`update support_tickets set status = 'resolved', resolved_at = now(), updated_at = now() where id = $1`, [t.id]);
    return null;
  };

  // ---------- Administration ----------

  const inbox: Handler = async (c) => {
    admin(c);
    const status = str(c.query.status, 10);
    const rows = await all<TicketRow & { org_name: string; last: string | null }>(
      `select t.*, o.data->>'name' as org_name,
         (select body from support_messages m where m.ticket_id = t.id order by created_at desc limit 1) as last
       from support_tickets t join organizers o on o.id = t.organizer_id
       where ($1 = '' or t.status = $1)
       order by (t.status = 'resolved'), case t.priority when 'urgent' then 0 when 'priority' then 1 else 2 end, t.updated_at desc limit 200`, [status]);
    return rows.map((r) => ({ ...out(r), organization: r.org_name, last: (r.last ?? '').slice(0, 160) }));
  };

  const adminGet: Handler = async (c) => {
    admin(c);
    const t = await one<TicketRow & { org_name: string }>(`select t.*, o.data->>'name' as org_name from support_tickets t join organizers o on o.id = t.organizer_id where t.id = $1`, [c.params.id]);
    if (!t) fail(404, 'Demande introuvable');
    return { ticket: { ...out(t!), organization: t!.org_name }, messages: await thread(t!.id) };
  };

  const adminReply: Handler = async (c) => {
    const a = admin(c);
    const t = await one<TicketRow>(`select * from support_tickets where id = $1`, [c.params.id]);
    if (!t) fail(404, 'Demande introuvable');
    const body = str(c.body.body, 4000);
    if (body.length < 2) fail(422, 'Écrivez votre réponse');
    const resolved = c.body.resolve === true;
    await tx(async (q) => {
      await q.query(`insert into support_messages (id, ticket_id, from_role, author, body) values ($1,$2,'admin',$3,$4)`, [newId('sm'), t!.id, ((a.data.name as string) ?? 'Support Event509'), body]);
      await q.query(`update support_tickets set status = $2, resolved_at = case when $2 = 'resolved' then now() else null end, updated_at = now() where id = $1`, [t!.id, resolved ? 'resolved' : 'pending']);
    });
    await tellOrg(t!, resolved ? 'Votre demande de support est résolue' : 'Réponse du support Event509', `${t!.subject} — ${body.slice(0, 140)}`);
    return null;
  };

  const adminStatus: Handler = async (c) => {
    admin(c);
    const status = str(c.body.status, 10);
    if (!['open', 'pending', 'resolved'].includes(status)) fail(422, 'Statut invalide');
    const r = await one<TicketRow>(`update support_tickets set status = $2, resolved_at = case when $2 = 'resolved' then now() else null end, updated_at = now() where id = $1 returning *`, [c.params.id, status]);
    if (!r) fail(404, 'Demande introuvable');
    if (status === 'resolved') await tellOrg(r!, 'Votre demande de support est résolue', r!.subject);
    return null;
  };

  return [
    ['GET', '/org/support', list],
    ['POST', '/org/support', create],
    ['GET', '/org/support/:id', get],
    ['POST', '/org/support/:id/reply', reply],
    ['POST', '/org/support/:id/resolve', resolve],
    ['GET', '/admin/support', inbox],
    ['GET', '/admin/support/:id', adminGet],
    ['POST', '/admin/support/:id/reply', adminReply],
    ['POST', '/admin/support/:id/status', adminStatus],
  ];
}
