import type { Client } from 'pg';
import { all, db, one, tx } from './db.js';
import { newId } from './auth.js';
import { safeName } from './files.js';
import type { Ctx, UserRow } from './routes.js';

/**
 * Médias des commentaires et des publications : photos, GIF, vidéos (envoyées en morceaux de 3 Mo, assemblées côté serveur)
 * et autocollants (un émoji, sans fichier). Le type du fichier est lu dans ses premiers octets, jamais pris sur parole.
 * Un fichier envoyé reste « orphelin » (invisible) tant qu'il n'est pas attaché à un commentaire ou une publication ; les orphelins sont purgés.
 */

type Handler = (c: Ctx) => Promise<unknown>;
export interface MediaDeps {
  fail: (status: number, message: string, code?: string) => never;
  str: (v: unknown, max: number) => string;
  auth: (c: Ctx) => UserRow;
  rateLimit: (key: string, max: number, windowMin: number) => Promise<void>;
}

export type MediaOwner = 'comment' | 'post' | 'pcomment';
export const CHUNK_BYTES = 3 * 1024 * 1024;
export const MAX_CHUNKS = 8;
export const MAX_IMAGE = 3 * 1024 * 1024;
export const MAX_GIF = 6 * 1024 * 1024;
export const MAX_VIDEO = 20 * 1024 * 1024;
export const MAX_MEDIA_PER_ITEM = 6;
export const TEXT_STYLES = ['plain', 'bold', 'italic', 'neon', 'sunset', 'ocean', 'night', 'party', 'mono'] as const;
export type MediaKind = 'image' | 'gif' | 'video' | 'sticker';

export function sniffMedia(b: Buffer): { mime: string; kind: 'image' | 'gif' | 'video' } | null {
  if (b.length < 16) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', kind: 'image' };
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', kind: 'image' };
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return { mime: 'image/webp', kind: 'image' };
  const g = b.subarray(0, 6).toString('latin1');
  if (g === 'GIF87a' || g === 'GIF89a') return { mime: 'image/gif', kind: 'gif' };
  if (b.subarray(4, 8).toString('latin1') === 'ftyp') return { mime: 'video/mp4', kind: 'video' };
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { mime: 'video/webm', kind: 'video' };
  return null;
}

/** Un autocollant est un ou quelques émojis (16 caractères au plus). */
export const validSticker = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 16 && /^[\p{Extended_Pictographic}\p{Emoji_Component}]+$/u.test(v) && /\p{Extended_Pictographic}/u.test(v);

export interface MediaOut { id: string; kind: MediaKind; url?: string; sticker?: string; mime?: string; duration?: number }
export interface MediaIn { fileId?: string; kind?: string; sticker?: string; duration?: number }

/** Médias de plusieurs commentaires / publications, regroupés par propriétaire. */
export async function mediaFor(kind: MediaOwner, ids: string[]): Promise<Map<string, MediaOut[]>> {
  const out = new Map<string, MediaOut[]>();
  if (!ids.length) return out;
  const rows = await all<{ id: string; owner_id: string; kind: MediaKind; file_id: string | null; sticker: string | null; duration: number | null }>(
    `select id, owner_id, kind, file_id, sticker, duration from post_media where owner_kind = $1 and owner_id = any($2) order by position`, [kind, ids]);
  for (const r of rows) {
    const list = out.get(r.owner_id) ?? [];
    list.push({
      id: r.id, kind: r.kind, url: r.file_id ? `/api/files/${r.file_id}` : undefined, sticker: r.sticker ?? undefined,
      duration: r.duration ?? undefined,
    });
    out.set(r.owner_id, list);
  }
  return out;
}

/** Vérifie et attache les médias envoyés par un client à un commentaire / une publication (dans la transaction de l'appelant). */
export async function attachMedia(q: Client, fail: MediaDeps['fail'], ownerKind: MediaOwner, ownerId: string, userId: string, raw: unknown, max = MAX_MEDIA_PER_ITEM) {
  if (raw === undefined || raw === null) return 0;
  if (!Array.isArray(raw)) fail(422, 'Médias invalides');
  const items = raw as MediaIn[];
  if (items.length > max) fail(422, `${max} médias au plus`);
  let videos = 0;
  let pos = 0;
  for (const m of items) {
    if (m.kind === 'sticker') {
      if (!validSticker(m.sticker)) fail(422, 'Autocollant invalide');
      await q.query(`insert into post_media (id, owner_kind, owner_id, position, kind, sticker) values ($1,$2,$3,$4,'sticker',$5)`, [newId('pm'), ownerKind, ownerId, pos++, m.sticker]);
      continue;
    }
    if (typeof m.fileId !== 'string' || !/^[\w-]{6,40}$/.test(m.fileId)) fail(422, 'Média invalide');
    const f = (await q.query<{ mime: string }>(`select mime from files where id = $1 and user_id = $2 and kind = 'post_media'`, [m.fileId, userId])).rows[0];
    if (!f) fail(404, 'Fichier introuvable : renvoyez-le');
    if ((await q.query(`select 1 from post_media where file_id = $1`, [m.fileId])).rowCount) fail(409, 'Ce fichier est déjà utilisé');
    const kind: MediaKind = f!.mime.startsWith('video/') ? 'video' : f!.mime === 'image/gif' ? 'gif' : 'image';
    if (kind === 'video' && ++videos > 1) fail(422, 'Une seule vidéo à la fois');
    const dur = typeof m.duration === 'number' && m.duration >= 0 && m.duration <= 3600 ? Math.round(m.duration) : null;
    await q.query(`insert into post_media (id, owner_kind, owner_id, position, kind, file_id, duration) values ($1,$2,$3,$4,$5,$6,$7)`,
      [newId('pm'), ownerKind, ownerId, pos++, kind, m.fileId, dur]);
  }
  return pos;
}

/** Supprime les fichiers d'un commentaire / d'une publication (à appeler avant de supprimer la ligne). */
export async function dropMedia(ownerKind: MediaOwner, ids: string[]) {
  if (!ids.length) return;
  await db().query(
    `delete from files where id in (select file_id from post_media where owner_kind = $1 and owner_id = any($2) and file_id is not null)`, [ownerKind, ids]);
  await db().query(`delete from post_media where owner_kind = $1 and owner_id = any($2)`, [ownerKind, ids]);
}

/** Purge : morceaux d'envoi abandonnés (1 h) et fichiers jamais attachés (24 h). */
export async function sweepMedia(): Promise<number> {
  const a = await db().query(`delete from media_chunks where created_at < now() - interval '1 hour'`);
  const b = await db().query(
    `delete from files where kind = 'post_media' and created_at < now() - interval '24 hours' and not exists (select 1 from post_media m where m.file_id = files.id)`);
  return (a.rowCount ?? 0) + (b.rowCount ?? 0);
}

export function mediaRoutes(h: MediaDeps): [string, string, Handler][] {
  const { fail, str, auth, rateLimit } = h;

  /** Reçoit un fichier en morceaux : { uploadId, index, total, data (base64, 3 Mo bruts au plus par morceau), name }. */
  const upload: Handler = async (c) => {
    const u = auth(c);
    if (u.status !== 'active') fail(403, 'Compte inactif');
    const uploadId = str(c.body.uploadId, 40);
    if (!/^[A-Za-z0-9_-]{8,40}$/.test(uploadId)) fail(422, 'Envoi invalide');
    const index = Number(c.body.index);
    const total = Number(c.body.total);
    if (!Number.isInteger(index) || !Number.isInteger(total) || total < 1 || total > MAX_CHUNKS || index < 0 || index >= total) fail(422, 'Envoi invalide');
    const b64 = typeof c.body.data === 'string' ? c.body.data : '';
    if (!b64 || b64.length > 4.2 * 1024 * 1024) fail(413, 'Morceau trop gros');
    await rateLimit(`media:${u.id}`, 120, 60);
    const part = Buffer.from(b64, 'base64');
    if (!part.length || part.length > CHUNK_BYTES + 16) fail(413, 'Morceau trop gros');
    // Un identifiant d'envoi appartient à une seule personne
    const owner = await one<{ user_id: string }>(`select user_id from media_chunks where upload_id = $1 limit 1`, [uploadId]);
    if (owner && owner.user_id !== u.id) fail(409, 'Envoi invalide');
    await db().query(
      `insert into media_chunks (upload_id, idx, user_id, data) values ($1,$2,$3,$4) on conflict (upload_id, idx) do update set data = excluded.data, created_at = now()`,
      [uploadId, index, u.id, part]);
    if (index < total - 1) return { done: false };
    const rows = await all<{ idx: number; data: Buffer }>(`select idx, data from media_chunks where upload_id = $1 and user_id = $2 order by idx`, [uploadId, u.id]);
    if (rows.length !== total || rows.some((r, i) => r.idx !== i)) fail(409, 'Envoi incomplet : recommencez');
    const data = Buffer.concat(rows.map((r) => r.data));
    const t = sniffMedia(data);
    if (!t) fail(422, 'Format non pris en charge : photo (JPG, PNG, WebP), GIF ou vidéo (MP4, WebM)');
    const limit = t!.kind === 'video' ? MAX_VIDEO : t!.kind === 'gif' ? MAX_GIF : MAX_IMAGE;
    if (data.length > limit) fail(413, `Fichier trop lourd : ${Math.round(limit / 1048576)} Mo au plus`);
    const day = Number((await one<{ n: string }>(`select count(*) as n from files where user_id = $1 and kind = 'post_media' and created_at > now() - interval '24 hours'`, [u.id]))?.n ?? 0);
    if (day >= 60) fail(429, 'Limite quotidienne de médias atteinte');
    const id = newId('f');
    await tx(async (q) => {
      await q.query(
        `insert into files (id, organizer_id, user_id, kind, visibility, mime, name, size, data) values ($1,null,$2,'post_media','public',$3,$4,$5,$6)`,
        [id, u.id, t!.mime, safeName(c.body.name), data.length, data]);
      await q.query(`delete from media_chunks where upload_id = $1`, [uploadId]);
    });
    return { done: true, fileId: id, url: `/api/files/${id}`, kind: t!.kind, mime: t!.mime, size: data.length };
  };

  return [['POST', '/media/upload', upload]];
}
