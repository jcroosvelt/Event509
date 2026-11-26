import type { EventItem } from '../../src/types.js';
import { all, db, one, tx } from './db.js';
import { newId } from './auth.js';
import { checkFile, safeName } from './files.js';
import { notifyUsers, organizerUserIds } from './push.js';
import { sendNoticeEmail } from './mail.js';
import { cleanText, type SocialDeps } from './social.js';
import { dropMedia, mediaFor } from './media.js';
import { POST_SELECT, postsOut, removePost, type PostRow } from './posts.js';
import type { Ctx, UserRow } from './routes.js';

/**
 * Vie de la communauté autour des événements : fil d'actualité des organisateurs suivis, photos des événements passés,
 * « Je participe », liste d'attente, signalements de contenu et blocage de membres.
 * Règles : un compte est obligatoire pour écrire ; on ne voit d'un membre que son nom (prénom et initiale) et sa photo ;
 * toute écriture est limitée en fréquence ; les contenus signalés par 3 personnes différentes sont masqués en attendant l'administration.
 */

type Handler = (c: Ctx) => Promise<unknown>;
export interface CommunityDeps extends SocialDeps {
  admin: (c: Ctx) => UserRow;
  /** Vrai quand l'événement est terminé (heure locale d'Haïti). */
  isEnded: (ev: EventItem) => boolean;
  /** Fiche publique d'un événement (champs réservés à l'organisation retirés). */
  publicEvent: (e: EventItem, u: UserRow | null) => unknown;
}

export const MAX_PHOTOS_PER_USER = 12;
export const REPORT_HIDE_AT = 3;
export const REPORT_REASONS = ['spam', 'abuse', 'inappropriate', 'scam', 'other'] as const;

const shortName = (name: string) => {
  const [first, ...rest] = (name || '').trim().split(/\s+/);
  return rest.length ? `${first} ${rest[rest.length - 1]![0]!.toUpperCase()}.` : first || 'Membre';
};

/** Billets encore disponibles par type (quota - vendus) d'un événement. */
const available = (ev: EventItem) => ev.tickets.map((t) => ({ id: t.id, name: t.name, left: Math.max(0, t.quota - t.sold), full: t.sold >= t.quota }));

/**
 * Des places se libèrent (remboursement, commande abandonnée, quota augmenté) : les personnes en liste d'attente sont prévenues
 * dans l'ordre d'inscription, au plus autant que de places libres, et jamais deux fois en 24 h. Aucune place n'est réservée :
 * la première personne qui achète l'obtient (le quota reste vérifié à l'achat).
 */
export async function notifyWaitlist(eventId: string): Promise<number> {
  const row = await one<{ data: EventItem }>(`select data from events where id = $1 and status = 'published'`, [eventId]);
  const ev = row?.data;
  if (!ev || ev.private === true) return 0;
  let notified = 0;
  for (const t of available(ev)) {
    if (t.left <= 0) continue;
    // Places déjà « offertes » à des personnes prévenues depuis moins de 24 h et toujours en attente : on ne les promet pas deux fois
    const offered = Number((await one<{ n: string }>(`select coalesce(sum(qty), 0) as n from waitlist where event_id = $1 and ticket_type_id = $2 and notified_at > now() - interval '24 hours'`, [eventId, t.id]))?.n ?? 0);
    if (t.left - offered <= 0) continue;
    const entries = await all<{ id: string; user_id: string; qty: number; email: string }>(
      `select w.id, w.user_id, w.qty, u.email from waitlist w join users u on u.id = w.user_id
        where w.event_id = $1 and w.ticket_type_id = $2 and u.status = 'active' and (w.notified_at is null or w.notified_at < now() - interval '24 hours')
        order by w.created_at limit 200`, [eventId, t.id]);
    let room = t.left - offered;
    const picked: typeof entries = [];
    for (const e of entries) {
      if (e.qty > room) continue;
      picked.push(e);
      room -= e.qty;
      if (room <= 0) break;
    }
    if (!picked.length) continue;
    await db().query(`update waitlist set notified_at = now() where id = any($1)`, [picked.map((p) => p.id)]);
    const title = 'Des billets sont disponibles';
    const body = `${ev.title} : des places « ${t.name} » viennent de se libérer. Premier arrivé, premier servi.`;
    await notifyUsers(picked.map((p) => p.user_id), { title, body, url: `/e/${ev.slug}`, channel: 'updates' }).catch(() => 0);
    for (const p of picked.slice(0, 100)) await sendNoticeEmail(p.email, title, title, [body]).catch(() => {});
    notified += picked.length;
  }
  return notified;
}

export function communityRoutes(h: CommunityDeps): [string, string, Handler][] {
  const { fail, str, auth, org, admin, rateLimit, visibleEvent, isEnded, publicEvent } = h;

  const blockedBy = (u: UserRow | null) => u?.id ?? '';
  const blockFilter = (col: string, idx: number) => `${col} not in (select blocked_id from user_blocks where blocker_id = $${idx})`;

  /** Billet valable (ou utilisé) pour cet événement, ou équipe de l'organisation / administration. */
  async function attended(u: UserRow, ev: EventItem) {
    if (u.role === 'admin' || (!!u.organizer_id && u.organizer_id === ev.organizerId)) return true;
    return !!(await one(
      `select 1 from tickets t where t.event_id = $1 and t.status in ('valid', 'used')
         and (lower(t.owner_email) = $2 or t.order_id in (select id from orders where user_id = $3)) limit 1`, [ev.id, (u.email ?? '').toLowerCase(), u.id]));
  }

  // ---------- Photos des événements passés ----------
  interface PhotoRow { id: string; event_id: string; user_id: string; file_id: string; caption: string | null; created_at: Date; name: string | null; avatar: string | null }
  const photoOut = (p: PhotoRow, ev: EventItem, viewer: UserRow | null) => ({
    id: p.id, eventId: p.event_id, url: `/api/files/${p.file_id}`, caption: p.caption || undefined, createdAt: p.created_at.toISOString(),
    author: { name: shortName(p.name ?? ''), avatarUrl: p.avatar || undefined },
    mine: viewer?.id === p.user_id,
    canDelete: !!viewer && (viewer.id === p.user_id || viewer.role === 'admin' || viewer.organizer_id === ev.organizerId),
  });

  const listPhotos: Handler = async (c) => {
    const ev = await visibleEvent(c, c.params.id!);
    const before = c.query.before && !Number.isNaN(Date.parse(c.query.before)) ? new Date(c.query.before).toISOString() : null;
    const rows = await all<PhotoRow>(
      `select p.id, p.event_id, p.user_id, p.file_id, p.caption, p.created_at, u.data->>'name' as name, u.data->>'avatarUrl' as avatar
         from event_photos p join users u on u.id = p.user_id
        where p.event_id = $1 and not p.hidden and ($2::timestamptz is null or p.created_at < $2) and ${blockFilter('p.user_id', 3)}
        order by p.created_at desc limit 24`, [ev.id, before, blockedBy(c.user)]);
    const total = Number((await one<{ n: string }>(`select count(*) as n from event_photos where event_id = $1 and not hidden`, [ev.id]))?.n ?? 0);
    const canAdd = !!c.user && c.user.status === 'active' && isEnded(ev) && (await attended(c.user, ev));
    return { total, hasMore: rows.length === 24, canAdd, ended: isEnded(ev), items: rows.map((r) => photoOut(r, ev, c.user)) };
  };

  const addPhoto: Handler = async (c) => {
    const u = auth(c);
    const ev = await visibleEvent(c, c.params.id!);
    if (!isEnded(ev)) fail(409, 'Les photos s’ajoutent une fois l’événement terminé');
    if (!(await attended(u, ev))) fail(403, 'Seules les personnes qui avaient un billet peuvent ajouter des photos');
    await rateLimit(`photo:${u.id}`, 20, 60);
    const b64 = typeof c.body.data === 'string' ? c.body.data : '';
    if (!b64 || b64.length > 4.4 * 1024 * 1024) fail(413, 'Image trop lourde : 2 Mo maximum');
    const data = Buffer.from(b64, 'base64');
    const checked = checkFile('event_photo', data);
    if ('error' in checked) fail(422, checked.error);
    const n = Number((await one<{ n: string }>(`select count(*) as n from event_photos where event_id = $1 and user_id = $2`, [ev.id, u.id]))?.n ?? 0);
    if (n >= MAX_PHOTOS_PER_USER) fail(429, `Vous avez déjà ajouté ${MAX_PHOTOS_PER_USER} photos pour cet événement`);
    const fileId = newId('f');
    const id = newId('ph');
    await tx(async (q) => {
      await q.query(
        `insert into files (id, organizer_id, user_id, kind, visibility, mime, name, size, data) values ($1,$2,$3,'event_photo','public',$4,$5,$6,$7)`,
        [fileId, ev.organizerId, u.id, (checked as { mime: string }).mime, safeName(c.body.name), data.length, data]);
      await q.query(`insert into event_photos (id, event_id, user_id, file_id, caption) values ($1,$2,$3,$4,$5)`, [id, ev.id, u.id, fileId, cleanText(c.body.caption, 200) || null]);
    });
    const row = (await all<PhotoRow>(
      `select p.id, p.event_id, p.user_id, p.file_id, p.caption, p.created_at, u.data->>'name' as name, u.data->>'avatarUrl' as avatar from event_photos p join users u on u.id = p.user_id where p.id = $1`, [id]))[0]!;
    try {
      const team = (await organizerUserIds(ev.organizerId)).filter((t) => t !== u.id);
      await notifyUsers(team, { title: 'Nouvelle photo', body: `${shortName((u.data.name as string) ?? '')} a ajouté une photo de « ${ev.title} »`, url: `/e/${ev.slug}`, channel: 'updates' });
    } catch (e) {
      console.error('[community] notification', e);
    }
    return photoOut(row, ev, u);
  };

  /** Supprime une photo et son fichier. */
  async function removePhoto(id: string) {
    const p = await one<{ file_id: string }>(`delete from event_photos where id = $1 returning file_id`, [id]);
    if (p) await db().query(`delete from files where id = $1`, [p.file_id]);
  }
  const deletePhoto: Handler = async (c) => {
    const u = auth(c);
    const r = await one<{ user_id: string; organizer_id: string }>(`select p.user_id, e.organizer_id from event_photos p join events e on e.id = p.event_id where p.id = $1`, [c.params.id]);
    if (!r) fail(404, 'Photo introuvable');
    if (!(u.id === r!.user_id || u.role === 'admin' || (!!u.organizer_id && u.organizer_id === r!.organizer_id))) fail(404, 'Photo introuvable');
    await removePhoto(c.params.id!);
    return null;
  };

  // ---------- « Je participe » ----------
  const goingState = async (c: Ctx, ev: EventItem) => {
    const rows = await all<{ name: string | null; avatar: string | null }>(
      `select u.data->>'name' as name, u.data->>'avatarUrl' as avatar from event_rsvps r join users u on u.id = r.user_id
        where r.event_id = $1 and u.status = 'active' and ${blockFilter('r.user_id', 2)} order by r.created_at desc limit 12`, [ev.id, blockedBy(c.user)]);
    const count = Number((await one<{ n: string }>(`select count(*) as n from event_rsvps where event_id = $1`, [ev.id]))?.n ?? 0);
    const me = !!c.user && !!(await one(`select 1 from event_rsvps where event_id = $1 and user_id = $2`, [ev.id, c.user.id]));
    return { count, me, people: rows.map((r) => ({ name: shortName(r.name ?? ''), avatarUrl: r.avatar || undefined })) };
  };
  const getGoing: Handler = async (c) => goingState(c, await visibleEvent(c, c.params.id!));
  const setGoing = (on: boolean): Handler => async (c) => {
    const u = auth(c);
    const ev = await visibleEvent(c, c.params.id!);
    await rateLimit(`going:${u.id}`, 60, 60);
    if (on) {
      if (ev.status !== 'published' || isEnded(ev)) fail(409, 'Cet événement n’accepte plus de participants');
      await db().query(`insert into event_rsvps (event_id, user_id) values ($1,$2) on conflict do nothing`, [ev.id, u.id]);
    } else await db().query(`delete from event_rsvps where event_id = $1 and user_id = $2`, [ev.id, u.id]);
    return goingState(c, ev);
  };

  // ---------- Liste d'attente ----------
  const myWaitlist: Handler = async (c) => {
    const u = auth(c);
    const ev = await visibleEvent(c, c.params.id!);
    const rows = await all<{ ticket_type_id: string; qty: number }>(`select ticket_type_id, qty from waitlist where event_id = $1 and user_id = $2`, [ev.id, u.id]);
    return rows.map((r) => ({ ticketTypeId: r.ticket_type_id, qty: r.qty }));
  };
  const joinWaitlist: Handler = async (c) => {
    const u = auth(c);
    const ev = await visibleEvent(c, c.params.id!);
    if (ev.status !== 'published' || isEnded(ev)) fail(409, 'Cet événement n’est plus en vente');
    const t = ev.tickets.find((x) => x.id === str(c.body.ticketTypeId, 60));
    if (!t) fail(422, 'Billet invalide');
    const qty = Math.max(1, Math.min(10, Math.floor(Number(c.body.qty) || 1)));
    if (t!.quota - t!.sold >= qty) fail(409, 'Des billets sont encore disponibles : vous pouvez acheter maintenant');
    if (new Date(t!.salesEnd) < new Date()) fail(409, 'La vente de ce billet est terminée');
    await rateLimit(`waitlist:${u.id}`, 20, 60);
    const mine = Number((await one<{ n: string }>(`select count(*) as n from waitlist where user_id = $1`, [u.id]))?.n ?? 0);
    const exists = await one(`select 1 from waitlist where event_id = $1 and ticket_type_id = $2 and user_id = $3`, [ev.id, t!.id, u.id]);
    if (!exists && mine >= 10) fail(429, 'Vous êtes déjà sur 10 listes d’attente');
    await db().query(
      `insert into waitlist (id, event_id, ticket_type_id, user_id, qty) values ($1,$2,$3,$4,$5)
       on conflict (event_id, ticket_type_id, user_id) do update set qty = excluded.qty`, [newId('wl'), ev.id, t!.id, u.id, qty]);
    const position = Number((await one<{ n: string }>(`select count(*) as n from waitlist where event_id = $1 and ticket_type_id = $2 and created_at <= (select created_at from waitlist where event_id = $1 and ticket_type_id = $2 and user_id = $3)`, [ev.id, t!.id, u.id]))?.n ?? 1);
    return { ticketTypeId: t!.id, qty, position };
  };
  const leaveWaitlist: Handler = async (c) => {
    const u = auth(c);
    const ev = await visibleEvent(c, c.params.id!);
    const tt = str(c.body.ticketTypeId, 60) || str(c.query.ticketTypeId, 60);
    await db().query(`delete from waitlist where event_id = $1 and user_id = $2 and ($3 = '' or ticket_type_id = $3)`, [ev.id, u.id, tt]);
    return null;
  };

  // ---------- Signalements et blocages ----------
  const reportContent: Handler = async (c) => {
    const u = auth(c);
    const kind = str(c.body.kind, 20);
    if (!['comment', 'photo', 'message', 'post'].includes(kind)) fail(422, 'Type de contenu invalide');
    const reason = str(c.body.reason, 20) as (typeof REPORT_REASONS)[number];
    if (!REPORT_REASONS.includes(reason)) fail(422, 'Motif invalide');
    const targetId = str(c.body.targetId, 60);
    await rateLimit(`creport:${u.id}`, 20, 24 * 60);
    let snapshot: Record<string, unknown> = {};
    let owner = '';
    if (kind === 'comment') {
      const r = await one<{ body: string; user_id: string; event_id: string; name: string | null }>(`select c.body, c.user_id, c.event_id, u.data->>'name' as name from event_comments c join users u on u.id = c.user_id where c.id = $1`, [targetId]);
      if (!r) fail(404, 'Contenu introuvable');
      await visibleEvent(c, r!.event_id);
      owner = r!.user_id;
      snapshot = { text: r!.body, author: r!.name, eventId: r!.event_id };
    } else if (kind === 'post') {
      const r = await one<{ user_id: string; organizer_id: string | null; body: string; name: string | null }>(`select p.user_id, p.organizer_id, p.body, u.data->>'name' as name from posts p join users u on u.id = p.user_id where p.id = $1 and not p.hidden`, [targetId]);
      if (!r) fail(404, 'Contenu introuvable');
      owner = r!.user_id;
      const media = (await mediaFor('post', [targetId])).get(targetId) ?? [];
      snapshot = { text: r!.body, author: r!.name, media: media.map((m) => m.url ?? m.sticker) };
    } else if (kind === 'photo') {
      const r = await one<{ user_id: string; event_id: string; file_id: string; caption: string | null; name: string | null }>(`select p.user_id, p.event_id, p.file_id, p.caption, u.data->>'name' as name from event_photos p join users u on u.id = p.user_id where p.id = $1`, [targetId]);
      if (!r) fail(404, 'Contenu introuvable');
      await visibleEvent(c, r!.event_id);
      owner = r!.user_id;
      snapshot = { url: `/api/files/${r!.file_id}`, caption: r!.caption, author: r!.name, eventId: r!.event_id };
    } else {
      const m = await one<{ conversation_id: string; sender_user_id: string | null; user_id: string; organizer_id: string }>(
        `select m.conversation_id, m.sender_user_id, c.user_id, c.organizer_id from messages m join conversations c on c.id = m.conversation_id where m.id = $1`, [targetId]);
      if (!m) fail(404, 'Contenu introuvable');
      // Seules les deux parties de la conversation peuvent signaler un de ses messages
      let teamSide = false;
      try {
        teamSide = org(c, 'marketing') === m!.organizer_id;
      } catch {
        teamSide = false;
      }
      if (m!.user_id !== u.id && !teamSide) fail(404, 'Contenu introuvable');
      owner = m!.sender_user_id ?? '';
      // Contexte transmis à l'administration au moment du signalement : le message et les 5 précédents, rien d'autre
      const ctx = await all<{ sender: string; body: string; created_at: Date }>(
        `select sender, body, created_at from messages where conversation_id = $1 and created_at <= (select created_at from messages where id = $2) order by created_at desc limit 6`, [m!.conversation_id, targetId]);
      snapshot = { conversationId: m!.conversation_id, messages: ctx.reverse().map((x) => ({ from: x.sender, text: x.body, at: x.created_at.toISOString() })) };
    }
    if (owner === u.id) fail(409, 'Vous ne pouvez pas signaler votre propre contenu');
    const id = newId('cr');
    const ins = await one<{ id: string }>(
      `insert into content_reports (id, kind, target_id, reporter_id, reason, note, snapshot) values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (kind, target_id, reporter_id) do nothing returning id`, [id, kind, targetId, u.id, reason, cleanText(c.body.note, 500) || null, JSON.stringify(snapshot)]);
    // Trois personnes différentes : le contenu est masqué en attendant la décision de l'administration (commentaire, photo)
    const n = Number((await one<{ n: string }>(`select count(*) as n from content_reports where kind = $1 and target_id = $2 and status = 'open'`, [kind, targetId]))?.n ?? 0);
    if (n >= REPORT_HIDE_AT && kind === 'comment') await db().query(`update event_comments set hidden = true where id = $1`, [targetId]);
    if (n >= REPORT_HIDE_AT && kind === 'post') await db().query(`update posts set hidden = true where id = $1`, [targetId]);
    if (n >= REPORT_HIDE_AT && kind === 'photo') await db().query(`update event_photos set hidden = true where id = $1`, [targetId]);
    if (ins) {
      try {
        const admins = await all<{ id: string }>(`select id from users where role = 'admin' and status = 'active'`);
        await notifyUsers(admins.map((a) => a.id), { title: 'Contenu signalé', body: `${kind === 'comment' ? 'Commentaire' : kind === 'photo' ? 'Photo' : kind === 'post' ? 'Publication' : 'Message'} signalé (${reason})`, url: '/admin/signalements', channel: 'sales' });
      } catch (e) {
        console.error('[community] notification', e);
      }
    }
    return { reported: true };
  };

  const adminReports: Handler = async (c) => {
    admin(c);
    const status = ['open', 'removed', 'dismissed'].includes(c.query.status ?? '') ? c.query.status! : 'open';
    const rows = await all<{ id: string; kind: string; target_id: string; reason: string; note: string | null; status: string; snapshot: unknown; created_at: Date; reporter: string | null; n: string }>(
      `select r.id, r.kind, r.target_id, r.reason, r.note, r.status, r.snapshot, r.created_at, u.data->>'name' as reporter,
              (select count(*) from content_reports x where x.kind = r.kind and x.target_id = r.target_id and x.status = 'open') as n
         from content_reports r join users u on u.id = r.reporter_id where r.status = $1 order by r.created_at desc limit 200`, [status]);
    return rows.map((r) => ({ id: r.id, kind: r.kind, targetId: r.target_id, reason: r.reason, note: r.note ?? undefined, status: r.status, snapshot: r.snapshot, createdAt: r.created_at.toISOString(), reporter: r.reporter ?? '', reports: Number(r.n) }));
  };
  const decideReport: Handler = async (c) => {
    const a = admin(c);
    const r = await one<{ kind: string; target_id: string }>(`select kind, target_id from content_reports where id = $1`, [c.params.id]);
    if (!r) fail(404, 'Signalement introuvable');
    const action = str(c.body.action, 20);
    if (!['remove', 'dismiss'].includes(action)) fail(422, 'Action invalide');
    if (action === 'remove') {
      if (r!.kind === 'comment') {
        await dropMedia('comment', [r!.target_id]);
        await db().query(`delete from event_comments where id = $1`, [r!.target_id]);
      } else if (r!.kind === 'post') await removePost(r!.target_id);
      else if (r!.kind === 'photo') await removePhoto(r!.target_id);
      else await db().query(`delete from messages where id = $1`, [r!.target_id]);
    } else {
      if (r!.kind === 'comment') await db().query(`update event_comments set hidden = false where id = $1`, [r!.target_id]);
      if (r!.kind === 'post') await db().query(`update posts set hidden = false where id = $1`, [r!.target_id]);
      if (r!.kind === 'photo') await db().query(`update event_photos set hidden = false where id = $1`, [r!.target_id]);
    }
    await db().query(
      `update content_reports set status = $3, handled_by = $4, handled_at = now() where kind = $1 and target_id = $2 and status = 'open'`,
      [r!.kind, r!.target_id, action === 'remove' ? 'removed' : 'dismissed', (a.data.name as string) ?? a.email]);
    return null;
  };

  /** Bloque l'auteur d'un commentaire ou d'une photo (on ne voit plus ses contenus ; on ne reçoit plus ses réponses). */
  const blockAuthor = (table: 'event_comments' | 'event_photos'): Handler => async (c) => {
    const u = auth(c);
    const r = await one<{ user_id: string; name: string | null; event_id: string }>(
      `select t.user_id, x.data->>'name' as name, t.event_id from ${table} t join users x on x.id = t.user_id where t.id = $1`, [c.params.id]);
    if (!r) fail(404, 'Contenu introuvable');
    await visibleEvent(c, r!.event_id);
    if (r!.user_id === u.id) fail(409, 'Vous ne pouvez pas vous bloquer vous-même');
    await rateLimit(`block:${u.id}`, 60, 60);
    await db().query(`insert into user_blocks (id, blocker_id, blocked_id) values ($1,$2,$3) on conflict do nothing`, [newId('bl'), u.id, r!.user_id]);
    return { blocked: true, name: shortName(r!.name ?? '') };
  };
  const myBlocks: Handler = async (c) => {
    const u = auth(c);
    const rows = await all<{ id: string; name: string | null; avatar: string | null }>(
      `select b.id, x.data->>'name' as name, x.data->>'avatarUrl' as avatar from user_blocks b join users x on x.id = b.blocked_id where b.blocker_id = $1 order by b.created_at desc limit 500`, [u.id]);
    return rows.map((r) => ({ id: r.id, name: shortName(r.name ?? ''), avatarUrl: r.avatar || undefined }));
  };
  const unblock: Handler = async (c) => {
    const u = auth(c);
    await db().query(`delete from user_blocks where id = $1 and blocker_id = $2`, [c.params.id, u.id]);
    return null;
  };
  /** L'organisation bloque (ou débloque) la personne d'une conversation : elle ne peut plus lui écrire. */
  const orgBlock: Handler = async (c) => {
    const orgId = org(c, 'marketing');
    const conv = await one<{ user_id: string }>(`select user_id from conversations where id = $1 and organizer_id = $2`, [c.params.id, orgId]);
    if (!conv) fail(404, 'Conversation introuvable');
    const on = c.body.on !== false;
    if (on) await db().query(`insert into organizer_blocks (organizer_id, user_id) values ($1,$2) on conflict do nothing`, [orgId, conv!.user_id]);
    else await db().query(`delete from organizer_blocks where organizer_id = $1 and user_id = $2`, [orgId, conv!.user_id]);
    return { blocked: on };
  };

  // ---------- Fil d'actualité ----------
  const feed: Handler = async (c) => {
    const u = auth(c);
    const before = c.query.before && !Number.isNaN(Date.parse(c.query.before)) ? new Date(c.query.before).toISOString() : null;
    const evs = await all<{ data: EventItem; at: Date }>(
      `select e.data, coalesce(e.published_at, e.start_at - interval '14 days') as at
         from events e join follows f on f.organizer_id = e.organizer_id and f.user_id = $1
        where e.status = 'published' and coalesce(e.data->>'private', 'false') <> 'true' and e.start_at > now() - interval '30 days'
          and ($2::timestamptz is null or coalesce(e.published_at, e.start_at - interval '14 days') < $2)
        order by at desc limit 20`, [u.id, before]);
    const photos = await all<{ event_id: string; slug: string; title: string; n: string; at: Date; files: string[] }>(
      `select p.event_id, e.slug, e.data->>'title' as title, count(*) as n, max(p.created_at) as at, (array_agg(p.file_id order by p.created_at desc))[1:4] as files
         from event_photos p join events e on e.id = p.event_id join follows f on f.organizer_id = e.organizer_id and f.user_id = $1
        where not p.hidden and p.created_at > now() - interval '14 days' and coalesce(e.data->>'private', 'false') <> 'true'
          and ($2::timestamptz is null or p.created_at < $2) and ${blockFilter('p.user_id', 3)}
        group by p.event_id, e.slug, e.data->>'title' order by at desc limit 20`, [u.id, before, u.id]);
    const posts = await all<PostRow>(
      `${POST_SELECT}
        where not p.hidden and coalesce(e.data->>'private', 'false') <> 'true'
          and (p.user_id = $1 or coalesce(p.organizer_id, e.organizer_id) in (select organizer_id from follows where user_id = $1))
          and ($2::timestamptz is null or p.created_at < $2) and ${blockFilter('p.user_id', 1)}
        order by p.created_at desc limit 20`, [u.id, before]);
    const postItems = await postsOut(posts, u);
    const items = [
      ...postItems.map((p) => ({ type: 'post' as const, at: p.createdAt, post: p })),
      ...evs.map((e) => ({ type: 'event' as const, at: e.at.toISOString(), event: publicEvent(e.data, u) })),
      ...photos.map((p) => ({ type: 'photos' as const, at: p.at.toISOString(), event: { id: p.event_id, slug: p.slug, title: p.title }, count: Number(p.n), thumbs: p.files.map((f) => `/api/files/${f}`) })),
    ].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 20);
    return { items, hasMore: items.length === 20 };
  };

  return [
    ['GET', '/events/:id/photos', listPhotos],
    ['POST', '/events/:id/photos', addPhoto],
    ['DELETE', '/photos/:id', deletePhoto],
    ['GET', '/events/:id/going', getGoing],
    ['POST', '/events/:id/going', setGoing(true)],
    ['DELETE', '/events/:id/going', setGoing(false)],
    ['GET', '/events/:id/waitlist', myWaitlist],
    ['POST', '/events/:id/waitlist', joinWaitlist],
    ['DELETE', '/events/:id/waitlist', leaveWaitlist],
    ['POST', '/reports/content', reportContent],
    ['GET', '/admin/content-reports', adminReports],
    ['POST', '/admin/content-reports/:id', decideReport],
    ['POST', '/comments/:id/block', blockAuthor('event_comments')],
    ['POST', '/photos/:id/block', blockAuthor('event_photos')],
    ['GET', '/me/blocks', myBlocks],
    ['DELETE', '/me/blocks/:id', unblock],
    ['POST', '/org/conversations/:id/block', orgBlock],
    ['GET', '/me/feed', feed],
  ];
}

/** Balayage quotidien : les listes d'attente d'événements où des places sont libres (filet de sécurité en plus des déclenchements immédiats). */
export async function sweepWaitlists(): Promise<number> {
  const ids = await all<{ event_id: string }>(`select distinct event_id from waitlist`);
  let n = 0;
  for (const r of ids) n += await notifyWaitlist(r.event_id).catch((e) => (console.error('[community] liste d’attente', e), 0));
  return n;
}
