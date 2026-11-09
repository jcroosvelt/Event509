#!/usr/bin/env node
/**
 * Génère, après `vite build`, une page HTML par événement et par organisateur avec
 * les balises Open Graph / Twitter (titre, description, image). Les robots de
 * WhatsApp, Facebook ou X n'exécutent pas le JavaScript : sans ce fichier, un lien
 * partagé n'aurait ni titre ni image.
 *
 * Source des données : la démo (src/data/mock.ts). Une fois le backend branché,
 * remplacer `loadData()` par un appel à l'API (ou faire ce rendu côté serveur).
 *
 * Adresse du site : SITE_URL si défini (ex. https://event509.com), sinon l'adresse de
 * production fournie par Vercel (VERCEL_PROJECT_PRODUCTION_URL), sinon event509.com.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const dist = join(root, 'dist');
const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined;
const site = (process.env.SITE_URL || vercelUrl || 'https://event509.com').replace(/\/$/, '');

async function loadData() {
  const ts = readFileSync(join(root, 'src/data/mock.ts'), 'utf8');
  const { code } = transformSync(ts, { loader: 'ts', format: 'esm' });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

function page(template, { title, description, url, image }) {
  const tags = [
    ['og:title', title], ['og:description', description], ['og:url', url], ['og:image', image],
    ['twitter:title', title], ['twitter:description', description], ['twitter:image', image],
  ];
  let html = template
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)} · Event509</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${esc(description)}" />`)
    .replace(/<meta property="og:(title|description|image)" content="[^"]*" \/>\n?\s*/g, '');
  const extra = tags
    .map(([k, v]) => (k.startsWith('og:') ? `<meta property="${k}" content="${esc(v)}" />` : `<meta name="${k}" content="${esc(v)}" />`))
    .join('\n    ');
  html = html.replace('</head>', `    ${extra}\n    <link rel="canonical" href="${esc(url)}" />\n  </head>`);
  return html;
}

const { events, organizers } = await loadData();
const template = readFileSync(join(dist, 'index.html'), 'utf8');
/** Écrit /e/slug.html et /e/slug/index.html : les hébergeurs résolvent l'un ou l'autre. */
function write(parts, html) {
  const dir = join(dist, ...parts.slice(0, -1));
  mkdirSync(join(dir, parts.at(-1)), { recursive: true });
  writeFileSync(join(dir, `${parts.at(-1)}.html`), html);
  writeFileSync(join(dir, parts.at(-1), 'index.html'), html);
}
const imageOf = (cover) => (/^https?:/.test(cover) ? cover : `${site}/og-default.png`);
let n = 0;

for (const e of events.filter((x) => x.status === 'published')) {
  const where = e.venue ? `${e.venue.name}, ${e.venue.city}` : e.online?.platform ?? '';
  const date = new Date(e.start).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const html = page(template, {
    title: e.title,
    description: clip(`${date} · ${where}. ${e.description}`, 200),
    url: `${site}/e/${e.slug}`,
    image: imageOf(e.cover),
  });
  write(['e', e.slug], html);
  n++;
}
for (const o of organizers) {
  write(['o', o.slug], page(template, {
    title: o.name,
    description: clip(o.bio ?? `Événements organisés par ${o.name} sur Event509.`, 200),
    url: `${site}/o/${o.slug}`,
    image: `${site}/og-default.png`,
  }));
  n++;
}
console.log(`prerender-og : ${n} pages générées`);
