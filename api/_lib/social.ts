import type { EventItem } from '../../src/types.js';
import { all, db, one, tx } from './db.js';
import { newId } from './auth.js';
import { claimOnce, notifyUsers, organizerUserIds } from './push.js';
import type { Ctx, UserRow } from './routes.js';

/**
 * Fonctions de réseau social : s'abonner aux organisateurs, commenter les événements, écrire en privé à un organisateur.
 * Règles : il faut un compte ; tout est limité en fréquence ; les textes sont du texte brut (jamais interprétés comme du HTML) ;
 * un message privé n'expose ni l'email ni le téléphone de l'acheteur (prénom et initiale seulement) ; seuls l'auteur,
 * l'équipe de l'événement et l'administration peuvent supprimer un commentaire.
 */

type Handler = (c: Ctx) => Promise<unknown>;
export interface SocialDeps {
  fail: (status: number, message: string) => never;
  str: (v: unknown, max?: number) => string;
  auth: (c: Ctx) => UserRow;
  org: (c: Ctx, perm: string) => string;
  rateLimit: (key: string, max: number, windowMinutes: number) => Promise<void>;
  /** Événement visible par la personne (mêmes règles que la page de l'événement : privé, brouillon…) ; 404 sinon. */
  visibleEvent: (c: Ctx, idOrSlug: string) => Promise<EventItem>;
}

export const MAX_COMMENT = 1000;
export const MAX_MESSAGE = 2000;

/** Caractères de contrôle et marques invisibles de direction/largeur nulle (écrits en séquences d'échappement : aucun caractère invisible dans ce fichier). */
// eslint-disable-next-line no-control-regex
const INVISIBLE = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F\\u200B-\\u200F\\u202A-\\u202E\\u2066-\\u2069]', 'g');

/** Texte brut : sans caractères de contrôle, espaces normalisés, longueur bornée. Jamais de HTML interprété (l'interface affiche du texte). */
export const cleanText = (v: unknown, max: number): string =>
  (typeof v === 'string' ? v : '')
    .replace(INVISIBLE, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);

const shortName = (name: string) => {
  const [first, ...rest] = (name || '').trim().split(/\s+/);
  return rest.length ? `${first} ${rest[rest.length - 1]![0]!.toUpperCase()}.` : first || 'Membre';
};
const preview = (s: string) => (s.length > 90 ? `${s.slice(0, 87)}…` : s);

interface UserBits { name?: string; avatarUrl?: string }

/** Abonnés d'une organisation (prévenus à chaque nouvel événement public). */
export async function followerIds(organizerId: string): Promise<string[]> {
  return (await all<{ user_id: string }>(`select f.user_id from follows f join users u on u.id = f.user_id where f.organizer_id = $1 and u.status = 'active' limit 20000`, [organizerId])).map((r) => r.user_id);
}

/** Nouvel événement public : les abonnés de l'organisation sont prévenus (une seule fois par événement ; jamais pour un événement privé). */
export async function notifyFollowers(ev: EventItem, orgName: string) {
  if (ev.private === true || !(await claimOnce(`followers:${ev.id}`))) return 0;
  const team = new Set(await organizerUserIds(ev.organizerId));
  const ids = (await followerIds(ev.organizerId)).filter((id) => !team.has(id));
  let sent = 0;
  for (let i = 0; i < ids.length; i += 100)
    sent += await notifyUsers(ids.slice(i, i + 100), { title: `${orgName} a publié un événement`, body: ev.title, url: `/evenement/${ev.slug || ev.id}`, channel: 'updates' });
  return sent;
}

export function socialRoutes(h: SocialDeps): [string, string, Handler][] {
  const { fail, str, auth, org, rateLimit, visibleEvent } = h;

  // ---------- Abonnements ----------
  const follow = (on: boolean): Handler => async (c) => {
    const u = auth(c);
    await rateLimit(`follow:${u.id}`, 120, 60);
    const o = await one<{ id: string }>(`select id from organizers where id = $1 or data->>'slug' = $1`, [c.params.id]);
    if (!o) fail(404, 'Organisateur introuvable');
    if (u.organizer_id === o!.id) fail(409, 'Vous ne pouvez pas vous abonner à votre propre organisation');
    if (on) await db().query(`insert into follows (user_id, organizer_id) values ($1, $2) on conflict do nothing`, [u.id, o!.id]);
    else await db().query(`delete from follows where user_id = $1 and organizer_id = $2`, [u.id, o!.id]);
    return { following: on, followers: Number((await one<{ n: string }>(`select count(*) as n from follows where organizer_id = $1`, [o!.id]))?.n ?? 0) };
  };
  const myFollows: Handler = async (c) => {
    const u = auth(c);
    return (await all<{ organizer_id: string }>(`select organizer_id from follows where user_id = $1 order by created_at desc limit 1000`, [u.id])).map((r) => r.organizer_id);
  };

  // ---------- Commentaires ----------
  interface CommentRow { id: string; event_id: string; user_id: string; parent_id: string | null; body: string; created_at: Date; data: UserBits; org_id: string | null }
  const commentOut = (r: CommentRow, ev: EventItem, viewer: UserRow | null, verified: boolean) => ({
    id: r.id, eventId: r.event_id, parentId: r.parent_id, body: r.body, createdAt: r.created_at.toISOString(),
    author: { name: shortName(r.data.name ?? ''), avatarUrl: r.data.avatarUrl || undefined, isOrganizer: r.org_id === ev.organizerId, verified: r.org_id === ev.organizerId && verified },
    mine: viewer?.id === r.user_id,
    canDelete: !!viewer && (viewer.id === r.user_id || viewer.role === 'admin' || viewer.organizer_id === ev.organizerId),
  });

  const listComments: Handler = async (c) => {
    const ev = await visibleEvent(c, c.params.id!);
    const before = c.query.before && !Number.isNaN(Date.parse(c.query.before)) ? new Date(c.query.before).toISOString() : null;
    const top = await all<CommentRow>(
      `select c.id, c.event_id, c.user_id, c.parent_id, c.body, c.created_at, u.data as data, u.organizer_id as org_id
         from event_comments c join users u on u.id = c.user_id
        where c.event_id = $1 and c.parent_id is null and not c.hidden and ($2::timestamptz is null or c.created_at < $2)
        order by c.created_at desc limit 30`, [ev.id, before]);
    const ids = top.map((t) => t.id);
    const replies = ids.length ? await all<CommentRow>(
      `select c.id, c.event_id, c.user_id, c.parent_id, c.body, c.created_at, u.data as data, u.organizer_id as org_id
         from event_comments c join users u on u.id = c.user_id
        where c.parent_id = any($1) and not c.hidden order by c.created_at limit 600`, [ids]) : [];
    const verified = (await one<{ v: boolean | null }>(`select (data->>'verified')::boolean as v from organizers where id = $1`, [ev.organizerId]))?.v === true;
    const total = Number((await one<{ n: string }>(`select count(*) as n from event_comments where event_id = $1 and not hidden`, [ev.id]))?.n ?? 0);
    return {
      total,
      hasMore: top.length === 30,
      items: top.map((t) => ({ ...commentOut(t, ev, c.user, verified), replies: replies.filter((r) => r.parent_id === t.id).map((r) => commentOut(r, ev, c.user, verified)) })),
    };
  };

  const addComment: Handler = async (c) => {
    const u = auth(c);
    const ev = await visibleEvent(c, c.params.id!);
    if (ev.status !== 'published' && ev.status !== 'ended') fail(409, 'Les commentaires ne sont pas ouverts pour cet événement');
    const body = cleanText(c.body.body, MAX_COMMENT);
    if (body.length < 1) fail(422, 'Écrivez un commentaire');
    await rateLimit(`comment:${u.id}`, 10, 10);
    await rateLimit(`comment-day:${u.id}`, 100, 24 * 60);
    let parent: { id: string; user_id: string } | null = null;
    const parentId = str(c.body.parentId, 60);
    if (parentId) {
      parent = await one<{ id: string; user_id: string }>(`select id, user_id from event_comments where id = $1 and event_id = $2 and parent_id is null and not hidden`, [parentId, ev.id]);
      if (!parent) fail(404, 'Commentaire introuvable');
    }
    // Même texte déjà publié par la même personne il y a peu : on ne le republie pas (anti-répétition)
    if (await one(`select 1 from event_comments where user_id = $1 and event_id = $2 and body = $3 and created_at > now() - interval '1 hour'`, [u.id, ev.id, body])) fail(409, 'Vous avez déjà publié ce commentaire');
    const id = newId('cm');
    await db().query(`insert into event_comments (id, event_id, user_id, parent_id, body) values ($1,$2,$3,$4,$5)`, [id, ev.id, u.id, parent?.id ?? null, body]);
    const name = shortName((u.data.name as string) ?? '');
    try {
      const team = await organizerUserIds(ev.organizerId);
      if (parent && parent.user_id !== u.id) await notifyUsers([parent.user_id], { title: 'Réponse à votre commentaire', body: `${name} : ${preview(body)}`, url: `/evenement/${ev.slug || ev.id}`, channel: 'updates' });
      const others = team.filter((t) => t !== u.id && t !== parent?.user_id);
      if (others.length) await notifyUsers(others, { title: parent ? 'Nouvelle réponse' : 'Nouveau commentaire', body: `${name} sur « ${ev.title} » : ${preview(body)}`, url: `/evenement/${ev.slug || ev.id}`, channel: 'updates' });
    } catch (e) {
      console.error('[social] notification', e);
    }
    const row = (await all<CommentRow>(
      `select c.id, c.event_id, c.user_id, c.parent_id, c.body, c.created_at, u.data as data, u.organizer_id as org_id from event_comments c join users u on u.id = c.user_id where c.id = $1`, [id]))[0]!;
    const verified = (await one<{ v: boolean | null }>(`select (data->>'verified')::boolean as v from organizers where id = $1`, [ev.organizerId]))?.v === true;
    return { ...commentOut(row, ev, u, verified), replies: [] };
  };

  const deleteComment: Handler = async (c) => {
    const u = auth(c);
    const r = await one<{ user_id: string; event_id: string; organizer_id: string }>(
      `select c.user_id, c.event_id, e.organizer_id from event_comments c join events e on e.id = c.event_id where c.id = $1`, [c.params.id]);
    if (!r) fail(404, 'Commentaire introuvable');
    const allowed = u.id === r!.user_id || u.role === 'admin' || (!!u.organizer_id && u.organizer_id === r!.organizer_id);
    if (!allowed) fail(404, 'Commentaire introuvable');
    await db().query(`delete from event_comments where id = $1`, [c.params.id]);
    return null;
  };

  // ---------- Messages privés ----------
  interface ConvRow { id: string; user_id: string; organizer_id: string; event_id: string | null; last_at: Date; user_unread: number; org_unread: number }
  const msgOut = (m: { id: string; sender: string; body: string; created_at: Date }) => ({ id: m.id, from: m.sender as 'user' | 'org', body: m.body, at: m.created_at.toISOString() });

  /** Envoie un message dans une conversation (jamais deux conversations pour la même paire personne/organisation). */
  async function post(convId: string, sender: 'user' | 'org', senderId: string, body: string) {
    const id = newId('ms');
    await tx(async (q) => {
      await q.query(`insert into messages (id, conversation_id, sender, sender_user_id, body) values ($1,$2,$3,$4,$5)`, [id, convId, sender, senderId, body]);
      await q.query(
        sender === 'user'
          ? `update conversations set last_at = now(), org_unread = org_unread + 1, user_unread = 0 where id = $1`
          : `update conversations set last_at = now(), user_unread = user_unread + 1, org_unread = 0 where id = $1`, [convId]);
    });
    return id;
  }

  /** Une personne écrit à une organisation (première fois : la conversation est créée). */
  const startConversation: Handler = async (c) => {
    const u = auth(c);
    const o = await one<{ id: string; name: string }>(`select id, data->>'name' as name from organizers where id = $1`, [str(c.body.organizerId, 60)]);
    if (!o) fail(404, 'Organisateur introuvable');
    if (u.organizer_id === o!.id) fail(409, 'Vous ne pouvez pas vous écrire à vous-même');
    const body = cleanText(c.body.body, MAX_MESSAGE);
    if (!body) fail(422, 'Écrivez votre message');
    await rateLimit(`msg:${u.id}`, 30, 60);
    let eventId: string | null = null;
    const evRef = str(c.body.eventId, 60);
    if (evRef) {
      const ev = await visibleEvent(c, evRef);
      if (ev.organizerId === o!.id) eventId = ev.id;
    }
    let conv = await one<ConvRow>(`select * from conversations where user_id = $1 and organizer_id = $2`, [u.id, o!.id]);
    if (!conv) {
      await rateLimit(`conv-new:${u.id}`, 10, 24 * 60);
      conv = (await one<ConvRow>(
        `insert into conversations (id, user_id, organizer_id, event_id) values ($1,$2,$3,$4)
         on conflict (user_id, organizer_id) do update set last_at = conversations.last_at returning *`, [newId('cv'), u.id, o!.id, eventId]))!;
    }
    await post(conv.id, 'user', u.id, body);
    await notifyOrg(o!.id, u, body, eventId);
    return { id: conv.id };
  };

  async function notifyOrg(orgId: string, from: UserRow, body: string, eventId: string | null) {
    try {
      const team = (await organizerUserIds(orgId)).filter((t) => t !== from.id);
      await notifyUsers(team, { title: `Message de ${shortName((from.data.name as string) ?? '')}`, body: preview(body), url: '/organisateur/messages', channel: 'updates' });
      void eventId;
    } catch (e) {
      console.error('[social] notification', e);
    }
  }

  const myConversations: Handler = async (c) => {
    const u = auth(c);
    const rows = await all<ConvRow & { org_name: string; org_logo: string | null; verified: boolean | null; body: string | null; sender: string | null; title: string | null }>(
      `select c.*, o.data->>'name' as org_name, o.data->>'logo' as org_logo, (o.data->>'verified')::boolean as verified,
              m.body, m.sender, e.data->>'title' as title
         from conversations c join organizers o on o.id = c.organizer_id
         left join lateral (select body, sender from messages where conversation_id = c.id order by created_at desc limit 1) m on true
         left join events e on e.id = c.event_id
        where c.user_id = $1 order by c.last_at desc limit 200`, [u.id]);
    return rows.map((r) => ({
      id: r.id, organizer: { id: r.organizer_id, name: r.org_name, logo: r.org_logo || undefined, verified: !!r.verified },
      event: r.title || undefined, last: r.body ? { body: preview(r.body), from: r.sender } : null, at: r.last_at.toISOString(), unread: r.user_unread,
    }));
  };

  const myThread: Handler = async (c) => {
    const u = auth(c);
    const conv = await one<ConvRow>(`select * from conversations where id = $1 and user_id = $2`, [c.params.id, u.id]);
    if (!conv) fail(404, 'Conversation introuvable');
    const msgs = await all<{ id: string; sender: string; body: string; created_at: Date }>(`select id, sender, body, created_at from messages where conversation_id = $1 order by created_at limit 500`, [conv!.id]);
    await db().query(`update conversations set user_unread = 0 where id = $1`, [conv!.id]);
    const o = await one<{ name: string; logo: string | null; verified: boolean | null }>(`select data->>'name' as name, data->>'logo' as logo, (data->>'verified')::boolean as verified from organizers where id = $1`, [conv!.organizer_id]);
    return { id: conv!.id, organizer: { id: conv!.organizer_id, name: o?.name ?? '', logo: o?.logo || undefined, verified: !!o?.verified }, messages: msgs.map(msgOut) };
  };

  const myReply: Handler = async (c) => {
    const u = auth(c);
    const conv = await one<ConvRow>(`select * from conversations where id = $1 and user_id = $2`, [c.params.id, u.id]);
    if (!conv) fail(404, 'Conversation introuvable');
    const body = cleanText(c.body.body, MAX_MESSAGE);
    if (!body) fail(422, 'Écrivez votre message');
    await rateLimit(`msg:${u.id}`, 30, 60);
    const id = await post(conv!.id, 'user', u.id, body);
    await notifyOrg(conv!.organizer_id, u, body, conv!.event_id);
    return { id };
  };

  const orgConversations: Handler = async (c) => {
    const orgId = org(c, 'marketing');
    const rows = await all<ConvRow & { name: string | null; body: string | null; sender: string | null; title: string | null }>(
      `select c.*, u.data->>'name' as name, m.body, m.sender, e.data->>'title' as title
         from conversations c join users u on u.id = c.user_id
         left join lateral (select body, sender from messages where conversation_id = c.id order by created_at desc limit 1) m on true
         left join events e on e.id = c.event_id
        where c.organizer_id = $1 order by c.last_at desc limit 300`, [orgId]);
    return rows.map((r) => ({ id: r.id, from: shortName(r.name ?? ''), event: r.title || undefined, last: r.body ? { body: preview(r.body), from: r.sender } : null, at: r.last_at.toISOString(), unread: r.org_unread }));
  };

  const orgThread: Handler = async (c) => {
    const orgId = org(c, 'marketing');
    const conv = await one<ConvRow>(`select * from conversations where id = $1 and organizer_id = $2`, [c.params.id, orgId]);
    if (!conv) fail(404, 'Conversation introuvable');
    const msgs = await all<{ id: string; sender: string; body: string; created_at: Date }>(`select id, sender, body, created_at from messages where conversation_id = $1 order by created_at limit 500`, [conv!.id]);
    await db().query(`update conversations set org_unread = 0 where id = $1`, [conv!.id]);
    const u = await one<{ data: UserBits }>(`select data from users where id = $1`, [conv!.user_id]);
    return { id: conv!.id, from: shortName(u?.data.name ?? ''), avatarUrl: u?.data.avatarUrl || undefined, messages: msgs.map(msgOut) };
  };

  const orgReply: Handler = async (c) => {
    const orgId = org(c, 'marketing');
    const me = auth(c);
    const conv = await one<ConvRow>(`select * from conversations where id = $1 and organizer_id = $2`, [c.params.id, orgId]);
    if (!conv) fail(404, 'Conversation introuvable');
    const body = cleanText(c.body.body, MAX_MESSAGE);
    if (!body) fail(422, 'Écrivez votre message');
    await rateLimit(`msg-org:${me.id}`, 120, 60);
    const id = await post(conv!.id, 'org', me.id, body);
    try {
      const o = await one<{ name: string }>(`select data->>'name' as name from organizers where id = $1`, [orgId]);
      await notifyUsers([conv!.user_id], { title: `Réponse de ${o?.name ?? 'l’organisateur'}`, body: preview(body), url: '/compte/messages', channel: 'updates' });
    } catch (e) {
      console.error('[social] notification', e);
    }
    return { id };
  };

  const unreadCount: Handler = async (c) => {
    const u = auth(c);
    const mine = Number((await one<{ n: string }>(`select coalesce(sum(user_unread), 0) as n from conversations where user_id = $1`, [u.id]))?.n ?? 0);
    let orgN = 0;
    if (u.organizer_id && (u.role === 'admin' || u.role === 'organizer')) orgN = Number((await one<{ n: string }>(`select coalesce(sum(org_unread), 0) as n from conversations where organizer_id = $1`, [u.organizer_id]))?.n ?? 0);
    return { inbox: mine, organizer: orgN };
  };

  return [
    ['POST', '/orgs/:id/follow', follow(true)],
    ['DELETE', '/orgs/:id/follow', follow(false)],
    ['GET', '/me/follows', myFollows],
    ['GET', '/events/:id/comments', listComments],
    ['POST', '/events/:id/comments', addComment],
    ['DELETE', '/comments/:id', deleteComment],
    ['POST', '/messages', startConversation],
    ['GET', '/me/conversations', myConversations],
    ['GET', '/me/conversations/:id', myThread],
    ['POST', '/me/conversations/:id/messages', myReply],
    ['GET', '/org/conversations', orgConversations],
    ['GET', '/org/conversations/:id', orgThread],
    ['POST', '/org/conversations/:id/messages', orgReply],
    ['GET', '/me/unread-messages', unreadCount],
  ];
}
