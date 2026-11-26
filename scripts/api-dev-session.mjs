/**
 * Variante de api-dev.mjs avec les sessions par cookie (comme la fonction Vercel) : cookie, CSRF, origine, hôte, agent, IP.
 * Sert aux essais de bout en bout en local (http, donc cookies non « Secure » : COOKIE_INSECURE=1).
 *
 *   COOKIE_INSECURE=1 DATABASE_URL=… JWT_SECRET=… node scripts/api-dev-session.mjs
 */
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const out = join(root, 'node_modules/.cache/api-dev-session.mjs');
buildSync({ entryPoints: [join(root, 'api/_lib/handler.ts')], bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: out });
const { handle } = await import(pathToFileURL(out).href);
const port = Number(process.env.API_PORT ?? 8787);

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (!url.pathname.startsWith('/api')) return void res.writeHead(404).end();
  let raw = '';
  for await (const chunk of req) raw += chunk;
  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return void res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ message: 'JSON invalide' }));
  }
  const h = req.headers;
  const r = await handle({
    method: req.method ?? 'GET',
    path: url.pathname.replace(/^\/api/, '') || '/',
    query: Object.fromEntries(url.searchParams),
    body,
    authorization: h.authorization,
    cookie: h.cookie,
    csrf: String(h['x-e509-csrf'] ?? '') || undefined,
    origin: String(h.origin ?? '') || undefined,
    // Derrière le proxy de Vite l'hôte vu ici est celui de l'API locale, pas celui du navigateur : on retient l'hôte de l'origine
    host: (h.origin ? new URL(String(h.origin)).host : String(h['x-forwarded-host'] ?? h.host ?? '')) || undefined,
    userAgent: String(h['user-agent'] ?? '').slice(0, 300) || undefined,
    ip: String(h['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0]?.trim() || undefined,
  });
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(r.headers ?? {}) };
  if (r.body && r.body.data instanceof Buffer) {
    res.writeHead(200, { 'Content-Type': r.body.mime, 'Cache-Control': r.body.cache, 'X-Content-Type-Options': 'nosniff' });
    return void res.end(r.body.data);
  }
  res.writeHead(r.status, headers);
  res.end(r.status === 204 || r.status >= 300 && r.status < 400 ? '' : typeof r.body === 'string' ? r.body : JSON.stringify(r.body));
}).listen(port, () => console.log(`API locale (sessions par cookie) : http://localhost:${port}/api`));
