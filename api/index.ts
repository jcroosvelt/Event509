import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handle } from './_lib/handler.js';
import { Binary } from './_lib/routes.js';

/**
 * Fonction Vercel unique : toutes les routes /api/* y sont redirigées (voir vercel.json),
 * le chemin d'origine arrivant dans le paramètre « path ».
 */
export default async function api(req: VercelRequest, res: VercelResponse) {
  const { path, ...rest } = req.query;
  const query = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, Array.isArray(v) ? v[0] ?? '' : v ?? '']));
  const p = Array.isArray(path) ? path.join('/') : path ?? '';
  const out = await handle({
    method: req.method ?? 'GET',
    path: `/${p}`.replace(/\/+/g, '/'),
    query,
    body: req.body,
    authorization: req.headers.authorization,
  });
  res.setHeader('Cache-Control', 'no-store');
  if (out.body instanceof Binary) {
    const f = out.body;
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Cache-Control', f.cache);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(f.name)}"`);
    res.status(200).send(f.data);
  } else if (out.status === 204) res.status(204).end();
  else res.status(out.status).json(out.body);
}
