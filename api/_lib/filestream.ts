import type { VercelRequest, VercelResponse } from '@vercel/node';
import { one, db } from './db.js';

/** Une réponse de fonction est limitée à 4,5 Mo : les gros fichiers publics (vidéos) sont servis par morceaux de 3 Mo (requêtes « Range »). */
const SLICE = 3 * 1024 * 1024;
const BIG = 4 * 1024 * 1024;

/** Renvoie false quand le fichier n'est pas concerné (privé, petit, introuvable) : la route ordinaire s'en charge. */
export async function streamPublicFile(req: VercelRequest, res: VercelResponse, id: string): Promise<boolean> {
  if (!/^[\w-]{6,40}$/.test(id)) return false;
  const f = await one<{ mime: string; name: string; size: number; visibility: string }>(`select mime, name, size, visibility from files where id = $1`, [id]);
  if (!f || f.visibility !== 'public') return false;
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''));
  if (!range && f.size <= BIG) return false;
  if (!range && !f.mime.startsWith('video/')) return false;
  let start = range && range[1] !== '' ? Number(range[1]) : 0;
  let end = range && range[2] !== '' ? Number(range[2]) : f.size - 1;
  if (range && range[1] === '' && range[2] !== '') {
    // « bytes=-N » : les N derniers octets
    start = Math.max(0, f.size - Number(range[2]));
    end = f.size - 1;
  }
  if (start >= f.size || start > end) {
    res.setHeader('Content-Range', `bytes */${f.size}`);
    res.status(416).end();
    return true;
  }
  end = Math.min(end, f.size - 1, start + SLICE - 1);
  res.setHeader('Content-Type', f.mime);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(f.name)}"`);
  res.setHeader('Content-Range', `bytes ${start}-${end}/${f.size}`);
  res.setHeader('Content-Length', String(end - start + 1));
  if (req.method === 'HEAD') {
    res.status(206).end();
    return true;
  }
  const part = (await db().query<{ d: Buffer }>(`select substring(data from $2::int for $3::int) as d from files where id = $1`, [id, start + 1, end - start + 1])).rows[0];
  if (!part) {
    res.status(404).end();
    return true;
  }
  res.status(206).send(part.d);
  return true;
}
