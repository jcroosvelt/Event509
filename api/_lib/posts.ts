import type { EventItem } from '../../src/types.js';
import { all, db, one, tx } from './db.js';
import { newId } from './auth.js';
import { notifyUsers } from './push.js';
import { cleanText, type SocialDeps } from './social.js';
import { attachMedia, dropMedia, mediaFor, TEXT_STYLES, type MediaOut } from './media.js';
import type { Ctx, UserRow } from './routes.js';

/**
 * Publications du fil d'actualité : texte avec effet, photos (avec filtre), GIF, vidéos, autocollants.
 * - Une organisation publie au nom de son organisation (droit « événements ») : ses abonnés la voient dans leur fil.
 * - Un membre publie à propos d'un événement (obligatoire) : la publication apparaît dans le fil des abonnés de l'organisateur et dans le sien.
 * On ne voit d'un membre que son nom (prénom et initiale) et sa photo.
 */

type Handler = (c: Ctx) => Promise<unknown>;
export const MAX_POST = 2000;

const shortName = (name: string) => {
  const [first, ...rest] = (name || '').trim().split(/\s+/);
  return rest.length ? `${first} ${rest[rest.length - 1]![0]!.toUpperCase()}.` : first || 'Membre';
};

export interface PostRow {
  id: string; user_id: string; organizer_id: string | null; event_id: string | null; body: string; style: string | null; created_at: Date;
  name: string | null; avatar: string | null; org_name: string | null; org_logo: string | null; org_slug: string | null; org_verified: boolean | null;
  ev_slug: string | null; ev_title: string | null;
}

export const POST_SELECT = `select p.id, p.user_id, p.organizer_id, p.event_id, p.body, p.style, p.created_at,
  u.data->>'name' as name, u.data->>'avatarUrl' as avatar, o.data->>'name' as org_name, o.data->>'logo' as org_logo, o.data->>'slug' as org_slug,
  (o.data->>'verified')::boolean as org_verified, e.slug as ev_slug, e.data->>'title' as ev_title
  from posts p join users u on u.id = p.user_id left join organizers o on o.id = p.organizer_id left join events e on e.id = p.event_id`;

export function postOut(p: PostRow, media: MediaOut[], viewer: UserRow | null, teamOrgId?: string | null) {
  const asOrg = !!p.organizer_id;
  return {
    id: p.id, body: p.body, style: p.style || 'plain', createdAt: p.created_at.toISOString(), media,
    author: asOrg
      ? { name: p.org_name ?? 'Organisateur', avatarUrl: p.org_logo || undefined, isOrganizer: true, verified: p.org_verified === true, orgSlug: p.org_slug ?? undefined }
      : { name: shortName(p.name ?? ''), avatarUrl: p.avatar || undefined, isOrganizer: false, verified: false },
    event: p.event_id ? { id: p.event_id, slug: p.ev_slug ?? '', title: p.ev_title ?? '' } : undefined,
    mine: viewer?.id === p.user_id,
    canDelete: !!viewer && (viewer.id === p.user_id || viewer.role === 'admin' || (!!teamOrgId && teamOrgId === p.organizer_id)),
  };
}

/** Charge médias et auteurs de plusieurs publications. */
export async function postsOut(rows: PostRow[], viewer: UserRow | null) {
  const media = await mediaFor('post', rows.map((r) => r.id));
  return rows.map((r) => postOut(r, media.get(r.id) ?? [], viewer, viewer?.organizer_id));
}

export async function removePost(id: string) {
  await dropMedia('post', [id]);
  await db().query(`delete from posts where id = $1`, [id]);
}

export function postRoutes(h: SocialDeps): [string, string, Handler][] {
  const { fail, str, auth, org, rateLimit, visibleEvent } = h;

  const createPost: Handler = async (c) => {
    const u = auth(c);
    if (u.status !== 'active') fail(403, 'Compte inactif');
    const body = cleanText(c.body.body, MAX_POST);
    const rawMedia = c.body.media;
    const hasMedia = Array.isArray(rawMedia) && rawMedia.length > 0;
    if (!body && !hasMedia) fail(422, 'Écrivez un texte ou ajoutez une photo ou une vidéo');
    const style = (TEXT_STYLES as readonly string[]).includes(str(c.body.style, 20)) ? str(c.body.style, 20) : 'plain';
    // Un fond coloré n'a de sens que pour un texte seul : avec des médias on garde le style « plain »
    const finalStyle = hasMedia ? 'plain' : style;
    await rateLimit(`post:${u.id}`, 20, 60);
    await rateLimit(`post-day:${u.id}`, 100, 24 * 60);
    let orgId: string | null = null;
    if (c.body.asOrganizer === true) orgId = org(c, 'events');
    let ev: EventItem | null = null;
    const eventRef = str(c.body.eventId, 80);
    if (eventRef) {
      ev = await visibleEvent(c, eventRef);
      if (ev.private === true && ev.organizerId !== orgId) fail(404, 'Événement introuvable');
      if (orgId && ev.organizerId !== orgId) fail(403, 'Cet événement n’appartient pas à votre organisation');
    }
    if (!orgId && !ev) fail(422, 'Choisissez l’événement concerné par votre publication');
    if (!orgId && ev!.status !== 'published' && ev!.status !== 'ended') fail(409, 'Les publications ne sont pas ouvertes pour cet événement');
    if (body && (await one(`select 1 from posts where user_id = $1 and body = $2 and created_at > now() - interval '1 hour'`, [u.id, body]))) fail(409, 'Vous avez déjà publié ce texte');
    const id = newId('po');
    await tx(async (q) => {
      await q.query(`insert into posts (id, user_id, organizer_id, event_id, body, style) values ($1,$2,$3,$4,$5,$6)`, [id, u.id, orgId, ev?.id ?? null, body, finalStyle]);
      await attachMedia(q, fail, 'post', id, u.id, rawMedia);
    });
    // Les abonnés de l'organisation sont prévenus d'une publication faite en son nom
    if (orgId) {
      try {
        const orgRow = await one<{ name: string }>(`select data->>'name' as name from organizers where id = $1`, [orgId]);
        const ids = (await all<{ user_id: string }>(`select user_id from follows where organizer_id = $1 and user_id <> $2 limit 5000`, [orgId, u.id])).map((r) => r.user_id);
        for (let i = 0; i < ids.length; i += 100)
          await notifyUsers(ids.slice(i, i + 100), { title: `${orgRow?.name ?? 'Un organisateur'} a publié`, body: (body || 'Nouvelle publication').slice(0, 100), url: '/fil', channel: 'updates' });
      } catch (e) {
        console.error('[posts] notification', e);
      }
    }
    const row = (await all<PostRow>(`${POST_SELECT} where p.id = $1`, [id]))[0]!;
    return (await postsOut([row], u))[0];
  };

  const deletePost: Handler = async (c) => {
    const u = auth(c);
    const r = await one<{ user_id: string; organizer_id: string | null }>(`select user_id, organizer_id from posts where id = $1`, [c.params.id]);
    if (!r) fail(404, 'Publication introuvable');
    const allowed = u.id === r!.user_id || u.role === 'admin' || (!!r!.organizer_id && u.organizer_id === r!.organizer_id);
    if (!allowed) fail(404, 'Publication introuvable');
    await removePost(c.params.id!);
    return null;
  };

  /** Publications d'une organisation (page publique de l'organisateur). */
  const orgPosts: Handler = async (c) => {
    const o = await one<{ id: string }>(`select id from organizers where id = $1 or data->>'slug' = $1`, [c.params.id]);
    if (!o) fail(404, 'Organisateur introuvable');
    const before = c.query.before && !Number.isNaN(Date.parse(c.query.before)) ? new Date(c.query.before).toISOString() : null;
    const rows = await all<PostRow>(
      `${POST_SELECT} where p.organizer_id = $1 and not p.hidden and ($2::timestamptz is null or p.created_at < $2) order by p.created_at desc limit 20`, [o!.id, before]);
    return { items: await postsOut(rows, c.user), hasMore: rows.length === 20 };
  };

  const blockPostAuthor: Handler = async (c) => {
    const u = auth(c);
    const r = await one<{ user_id: string; organizer_id: string | null; name: string | null }>(
      `select p.user_id, p.organizer_id, x.data->>'name' as name from posts p join users x on x.id = p.user_id where p.id = $1`, [c.params.id]);
    if (!r) fail(404, 'Contenu introuvable');
    if (r!.user_id === u.id) fail(409, 'Vous ne pouvez pas vous bloquer vous-même');
    if (r!.organizer_id) fail(409, 'Pour ne plus voir cet organisateur, désabonnez-vous');
    await rateLimit(`block:${u.id}`, 60, 60);
    await db().query(`insert into user_blocks (id, blocker_id, blocked_id) values ($1,$2,$3) on conflict do nothing`, [newId('bl'), u.id, r!.user_id]);
    return { blocked: true, name: shortName(r!.name ?? '') };
  };

  return [
    ['POST', '/posts', createPost],
    ['DELETE', '/posts/:id', deletePost],
    ['GET', '/organizers/:id/posts', orgPosts],
    ['POST', '/posts/:id/block', blockPostAuthor],
  ];
}
