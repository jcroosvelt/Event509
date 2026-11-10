/**
 * Serveur local de l'API (même code que la fonction Vercel) sur http://localhost:8787/api.
 * Vite redirige /api vers ce serveur en développement.
 *
 *   DATABASE_URL=… JWT_SECRET=… node scripts/api-dev.mjs
 */
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const out = join(root, 'node_modules/.cache/api-dev.mjs');
buildSync({ entryPoints: [join(root, 'api/_lib/handler.ts')], bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: out });
const { handle } = await import(pathToFileURL(out).href);
const port = Number(process.env.API_PORT ?? 8787);

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (!url.pathname.startsWith('/api')) {
    res.writeHead(404).end();
    return;
  }
  let raw = '';
  for await (const chunk of req) raw += chunk;
  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ message: 'JSON invalide' }));
    return;
  }
  const r = await handle({
    method: req.method ?? 'GET',
    path: url.pathname.replace(/^\/api/, '') || '/',
    query: Object.fromEntries(url.searchParams),
    body,
    authorization: req.headers.authorization,
  });
  if (r.body && r.body.data instanceof Buffer) {
    // Fichier : mêmes en-têtes que la fonction Vercel
    res.writeHead(200, { 'Content-Type': r.body.mime, 'Cache-Control': r.body.cache, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
    res.end(r.body.data);
    return;
  }
  res.writeHead(r.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(r.status === 204 ? '' : JSON.stringify(r.body));
}).listen(port, () => console.log(`API locale : http://localhost:${port}/api`));
