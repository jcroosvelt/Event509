import type { EventItem } from '../../src/types.js';
import { all, db, one, tx } from './db.js';
import { newId } from './auth.js';
import { notifyUsers } from './push.js';
import { cleanText, type SocialDeps } from './social.js';
import { attachMedia, dropMedia, mediaFor, TEXT_STYLES, type MediaOut } from './media.js';
import type { Ctx, UserRow } from './routes.js';

/**
 * Publications du fil d'actualité : texte avec effet, photos, GIF, vidéos, autocollants.
 * - Seules les organisations publient (droit « événements ») : leurs abonnés voient la publication dans leur fil.
 * - Les membres ne publient pas : ils aiment et commentent les publications (texte, photos, GIF, vidéos, autocollants).
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
  ev_slug: string | null; ev_title: string | null; likes?: string; comments?: string; liked?: boolean; rating_avg?: string | null; rating_count?: string; my_stars?: number | null;
}

export const POST_SELECT = `select p.id, p.user_id, p.organizer_id, p.event_id, p.body, p.style, p.created_at,
  u.data->>'name' as name, u.data->>'avatarUrl' as avatar, o.data->>'name' as org_name, o.data->>'logo' as org_logo, o.data->>'slug' as org_slug,
  (o.data->>'verified')::boolean as org_verified, e.slug as ev_slug, e.data->>'title' as ev_title,
  (select count(*) from post_likes l where l.post_id = p.id) as likes,
  (select count(*) from post_comments pc where pc.post_id = p.id and not pc.hidden) as comments,
  exists (select 1 from post_likes l2 where l2.post_id = p.id and l2.user_id = @VIEWER@) as liked,
  (select round(avg(r.stars)::numeric, 1) from post_ratings r where r.post_id = p.id) as rating_avg,
  (select count(*) from post_ratings r where r.post_id = p.id) as rating_count,
  (select r2.stars from post_ratings r2 where r2.post_id = p.id and r2.user_id = @VIEWER@) as my_stars
  from posts p join users u on u.id = p.user_id left join organizers o on o.id = p.organizer_id left join events e on e.id = p.event_id`;

/** Lecture des publications : @VIEWER@ devient le paramètre SQL qui porte l'identifiant de la personne connectée (ou ''). */
export const postSelect = (viewerParam: number) => POST_SELECT.split('@VIEWER@').join('$' + String(viewerParam));

export function postOut(p: PostRow, media: MediaOut[], viewer: UserRow | null, teamOrgId?: string | null) {
  const asOrg = !!p.organizer_id;
  return {
    id: p.id, body: p.body, style: p.style || 'plain', createdAt: p.created_at.toISOString(), media,
    likes: Number(p.likes ?? 0), commentCount: Number(p.comments ?? 0), liked: p.liked === true,
    rating: { average: p.rating_avg == null ? 0 : Number(p.rating_avg), count: Number(p.rating_count ?? 0), mine: p.my_stars ?? 0 },
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

  /** Publication visible (non masquée) ; 404 sinon. */
  async function visiblePost(id: string) {
    const r = await one<{ id: string; user_id: string; organizer_id: string | null; hidden: boolean }>(`select id, user_id, organizer_id, hidden from posts where id = $1`, [id]);
    if (!r || r.hidden) fail(404, 'Publication introuvable');
    return r!;
  }

  /** Seules les organisations publient, au nom de leur organisation (droit « événements »). */
  const createPost: Handler = async (c) => {
    const u = auth(c);
    if (u.status !== 'active') fail(403, 'Compte inactif');
    const orgId = org(c, 'events');
    const body = cleanText(c.body.body, MAX_POST);
    const rawMedia = c.body.media;
    const hasMedia = Array.isArray(rawMedia) && rawMedia.length > 0;
    if (!body && !hasMedia) fail(422, 'Écrivez un texte ou ajoutez une photo ou une vidéo');
    const style = (TEXT_STYLES as readonly string[]).includes(str(c.body.style, 20)) ? str(c.body.style, 20) : 'plain';
    // Un fond coloré n'a de sens que pour un texte seul : avec des médias on garde le style « plain »
    const finalStyle = hasMedia ? 'plain' : style;
    await rateLimit(`post:${u.id}`, 20, 60);
    await rateLimit(`post-day:${u.id}`, 100, 24 * 60);
    let ev: EventItem | null = null;
    const eventRef = str(c.body.eventId, 80);
    if (eventRef) {
      ev = await visibleEvent(c, eventRef);
      if (ev.organizerId !== orgId) fail(403, 'Cet événement n’appartient pas à votre organisation');
    }
    if (body && (await one(`select 1 from posts where user_id = $1 and body = $2 and created_at > now() - interval '1 hour'`, [u.id, body]))) fail(409, 'Vous avez déjà publié ce texte');
    const id = newId('po');
    await tx(async (q) => {
      await q.query(`insert into posts (id, user_id, organizer_id, event_id, body, style) values ($1,$2,$3,$4,$5,$6)`, [id, u.id, orgId, ev?.id ?? null, body, finalStyle]);
      await attachMedia(q, fail, 'post', id, u.id, rawMedia);
    });
    // Les abonnés de l'organisation sont prévenus
    try {
      const orgRow = await one<{ name: string }>(`select data->>'name' as name from organizers where id = $1`, [orgId]);
      const ids = (await all<{ user_id: string }>(`select user_id from follows where organizer_id = $1 and user_id <> $2 limit 5000`, [orgId, u.id])).map((r) => r.user_id);
      for (let i = 0; i < ids.length; i += 100)
        await notifyUsers(ids.slice(i, i + 100), { title: `${orgRow?.name ?? 'Un organisateur'} a publié`, body: (body || 'Nouvelle publication').slice(0, 100), url: '/fil', channel: 'updates' });
    } catch (e) {
      console.error('[posts] notification', e);
    }
    const row = (await all<PostRow>(`${postSelect(2)} where p.id = $1`, [id, u.id]))[0]!;
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
      `${postSelect(3)} where p.organizer_id = $1 and not p.hidden and ($2::timestamptz is null or p.created_at < $2) order by p.created_at desc limit 20`, [o!.id, before, c.user?.id ?? '']);
    return { items: await postsOut(rows, c.user), hasMore: rows.length === 20 };
  };

  // ---------- « J'aime » ----------
  const like = (on: boolean): Handler => async (c) => {
    const u = auth(c);
    const p = await visiblePost(c.params.id!);
    await rateLimit(`like:${u.id}`, 120, 60);
    if (on) await db().query(`insert into post_likes (post_id, user_id) values ($1,$2) on conflict do nothing`, [p.id, u.id]);
    else await db().query(`delete from post_likes where post_id = $1 and user_id = $2`, [p.id, u.id]);
    const n = Number((await one<{ n: string }>(`select count(*) as n from post_likes where post_id = $1`, [p.id]))?.n ?? 0);
    return { liked: on, likes: n };
  };

  // ---------- Notes (1 à 5 étoiles) ----------
  const ratingOut = async (postId: string, userId: string) => {
    const r = await one<{ avg: string | null; n: string }>(`select round(avg(stars)::numeric, 1) as avg, count(*) as n from post_ratings where post_id = $1`, [postId]);
    const mine = await one<{ stars: number }>(`select stars from post_ratings where post_id = $1 and user_id = $2`, [postId, userId]);
    return { average: r?.avg == null ? 0 : Number(r.avg), count: Number(r?.n ?? 0), mine: mine?.stars ?? 0 };
  };
  /** Une note par personne : la nouvelle remplace l'ancienne ; DELETE la retire. L'organisation ne note pas ses propres publications. */
  const rate: Handler = async (c) => {
    const u = auth(c);
    const p = await visiblePost(c.params.id!);
    const stars = Number(c.body.stars);
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) fail(422, 'Choisissez une note de 1 à 5');
    if (p.organizer_id && u.organizer_id === p.organizer_id) fail(409, 'Vous ne pouvez pas noter vos propres publications');
    await rateLimit(`prate:${u.id}`, 120, 60);
    await db().query(`insert into post_ratings (post_id, user_id, stars) values ($1,$2,$3) on conflict (post_id, user_id) do update set stars = excluded.stars, created_at = now()`, [p.id, u.id, stars]);
    return ratingOut(p.id, u.id);
  };
  const unrate: Handler = async (c) => {
    const u = auth(c);
    const p = await visiblePost(c.params.id!);
    await db().query(`delete from post_ratings where post_id = $1 and user_id = $2`, [p.id, u.id]);
    return ratingOut(p.id, u.id);
  };

  // ---------- Commentaires des publications ----------
  interface PCRow { id: string; post_id: string; user_id: string; body: string; style: string | null; created_at: Date; name: string | null; avatar: string | null; org_id: string | null }
  const pcOut = (r: PCRow, media: MediaOut[], viewer: UserRow | null, postOrg: string | null) => ({
    id: r.id, postId: r.post_id, body: r.body, style: r.style || 'plain', createdAt: r.created_at.toISOString(), media,
    author: { name: shortName(r.name ?? ''), avatarUrl: r.avatar || undefined, isOrganizer: !!r.org_id && r.org_id === postOrg },
    mine: viewer?.id === r.user_id,
    canDelete: !!viewer && (viewer.id === r.user_id || viewer.role === 'admin' || (!!postOrg && viewer.organizer_id === postOrg)),
  });
  const PC_SELECT = `select c.id, c.post_id, c.user_id, c.body, c.style, c.created_at, u.data->>'name' as name, u.data->>'avatarUrl' as avatar, u.organizer_id as org_id
      from post_comments c join users u on u.id = c.user_id`;

  const listPostComments: Handler = async (c) => {
    const p = await visiblePost(c.params.id!);
    const before = c.query.before && !Number.isNaN(Date.parse(c.query.before)) ? new Date(c.query.before).toISOString() : null;
    const rows = await all<PCRow>(
      `${PC_SELECT} where c.post_id = $1 and not c.hidden and ($2::timestamptz is null or c.created_at < $2)
         and c.user_id not in (select blocked_id from user_blocks where blocker_id = $3) order by c.created_at desc limit 30`, [p.id, before, c.user?.id ?? '']);
    const media = await mediaFor('pcomment', rows.map((r) => r.id));
    const total = Number((await one<{ n: string }>(`select count(*) as n from post_comments where post_id = $1 and not hidden`, [p.id]))?.n ?? 0);
    return { total, hasMore: rows.length === 30, items: rows.map((r) => pcOut(r, media.get(r.id) ?? [], c.user, p.organizer_id)) };
  };

  const addPostComment: Handler = async (c) => {
    const u = auth(c);
    if (u.status !== 'active') fail(403, 'Compte inactif');
    const p = await visiblePost(c.params.id!);
    const body = cleanText(c.body.body, 1000);
    const rawMedia = c.body.media;
    const hasMedia = Array.isArray(rawMedia) && rawMedia.length > 0;
    if (!body && !hasMedia) fail(422, 'Écrivez un commentaire ou ajoutez une photo');
    const style = 'plain'; // pas d'effet de texte dans les commentaires
    await rateLimit(`pcomment:${u.id}`, 10, 10);
    await rateLimit(`pcomment-day:${u.id}`, 100, 24 * 60);
    if (body && (await one(`select 1 from post_comments where user_id = $1 and post_id = $2 and body = $3 and created_at > now() - interval '1 hour'`, [u.id, p.id, body]))) fail(409, 'Vous avez déjà publié ce commentaire');
    const id = newId('pc');
    await tx(async (q) => {
      await q.query(`insert into post_comments (id, post_id, user_id, body, style) values ($1,$2,$3,$4,$5)`, [id, p.id, u.id, body, style]);
      await attachMedia(q, fail, 'pcomment', id, u.id, rawMedia, 4);
    });
    try {
      if (p.user_id !== u.id) await notifyUsers([p.user_id], { title: 'Nouveau commentaire', body: `${shortName((u.data.name as string) ?? '')} : ${(body || 'Photo').slice(0, 100)}`, url: '/fil', channel: 'updates' });
    } catch (e) {
      console.error('[posts] notification', e);
    }
    const row = (await all<PCRow>(`${PC_SELECT} where c.id = $1`, [id]))[0]!;
    return pcOut(row, (await mediaFor('pcomment', [id])).get(id) ?? [], u, p.organizer_id);
  };

  const deletePostComment: Handler = async (c) => {
    const u = auth(c);
    const r = await one<{ user_id: string; organizer_id: string | null }>(`select c.user_id, p.organizer_id from post_comments c join posts p on p.id = c.post_id where c.id = $1`, [c.params.id]);
    if (!r) fail(404, 'Commentaire introuvable');
    const allowed = u.id === r!.user_id || u.role === 'admin' || (!!r!.organizer_id && u.organizer_id === r!.organizer_id);
    if (!allowed) fail(404, 'Commentaire introuvable');
    await dropMedia('pcomment', [c.params.id!]);
    await db().query(`delete from post_comments where id = $1`, [c.params.id]);
    return null;
  };

  const blockPostCommenter: Handler = async (c) => {
    const u = auth(c);
    const r = await one<{ user_id: string; name: string | null }>(`select c.user_id, x.data->>'name' as name from post_comments c join users x on x.id = c.user_id where c.id = $1`, [c.params.id]);
    if (!r) fail(404, 'Contenu introuvable');
    if (r!.user_id === u.id) fail(409, 'Vous ne pouvez pas vous bloquer vous-même');
    await rateLimit(`block:${u.id}`, 60, 60);
    await db().query(`insert into user_blocks (id, blocker_id, blocked_id) values ($1,$2,$3) on conflict do nothing`, [newId('bl'), u.id, r!.user_id]);
    return { blocked: true, name: shortName(r!.name ?? '') };
  };

  return [
    ['POST', '/posts', createPost],
    ['DELETE', '/posts/:id', deletePost],
    ['GET', '/organizers/:id/posts', orgPosts],
    ['POST', '/posts/:id/like', like(true)],
    ['DELETE', '/posts/:id/like', like(false)],
    ['PUT', '/posts/:id/rating', rate],
    ['DELETE', '/posts/:id/rating', unrate],
    ['GET', '/posts/:id/comments', listPostComments],
    ['POST', '/posts/:id/comments', addPostComment],
    ['DELETE', '/post-comments/:id', deletePostComment],
    ['POST', '/post-comments/:id/block', blockPostCommenter],
  ];
}
