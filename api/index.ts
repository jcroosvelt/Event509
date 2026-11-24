import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handle } from './_lib/handler.js';
import { Binary } from './_lib/routes.js';
import { streamApk } from './_lib/apprelease.js';

/**
 * Fonction Vercel unique : toutes les routes /api/* y sont redirigées (voir vercel.json),
 * le chemin d'origine arrivant dans le paramètre « path ».
 */
export default async function api(req: VercelRequest, res: VercelResponse) {
  const { path, ...rest } = req.query;
  const query = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, Array.isArray(v) ? v[0] ?? '' : v ?? '']));
  const p = Array.isArray(path) ? path.join('/') : path ?? '';
  // Fichier de l'application Android : envoyé en flux (il dépasse la limite de 4,5 Mo d'une réponse ordinaire)
  if (p === 'app/download' && (req.method === 'GET' || req.method === 'HEAD')) return streamApk(req, res);
  const out = await handle({
    method: req.method ?? 'GET',
    path: `/${p}`.replace(/\/+/g, '/'),
    query,
    body: req.body,
    authorization: req.headers.authorization,
    cookie: req.headers.cookie,
    csrf: String(req.headers['x-e509-csrf'] ?? '') || undefined,
    origin: String(req.headers.origin ?? '') || undefined,
    host: String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '') || undefined,
    userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300) || undefined,
    ip: String(req.headers['x-forwarded-for'] ?? '').split(',')[0]?.trim() || undefined,
    geo: {
      country: String(req.headers['x-vercel-ip-country'] ?? '').toUpperCase() || undefined,
      city: (() => {
        try {
          return decodeURIComponent(String(req.headers['x-vercel-ip-city'] ?? '')).slice(0, 80) || undefined;
        } catch {
          return undefined;
        }
      })(),
    },
  });
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(out.headers ?? {})) res.setHeader(k, v);
  if (typeof out.body === 'string' && String(out.headers?.['Content-Type'] ?? '').startsWith('text/html')) {
    res.status(out.status).send(out.body);
    return;
  }
  if (out.status >= 300 && out.status < 400) {
    res.status(out.status).end();
    return;
  }
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
