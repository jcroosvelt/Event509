import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EventItem, Organizer } from '../../src/types.js';
import { all, one } from './db.js';
import { currentRelease } from './apprelease.js';
import { siteUrl } from './mail.js';
import { Respond } from './respond.js';
import { sniff } from './files.js';

/**
 * Référencement et aperçus de liens (WhatsApp, Facebook, Messenger, Telegram, LinkedIn, X, Discord, Google…), au même endroit :
 * balises, données structurées JSON-LD, plan du site, robots.txt et image d'aperçu 1200 × 630 générée pour chaque événement.
 *
 * Règles : tout vient de la base à chaque demande (rien à régler à la main quand un contenu est publié) ; seuls les contenus
 * publics et publiés sont indexables ; tout texte est échappé ; aucune image distante n'est jamais chargée (seulement celles
 * du site) ; un événement privé reste « noindex », sans données structurées.
 */

export const BRAND = 'Event509';
export const OG_W = 1200;
export const OG_H = 630;
export const site = () => siteUrl() || 'https://event509.com';

export const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
/** Texte d'une ligne : espaces normalisés, caractères de contrôle retirés. */
// Caractères de contrôle et marques invisibles (écrits en séquences d'échappement : aucun caractère invisible dans ce fichier)
// eslint-disable-next-line no-control-regex
const INVISIBLE = new RegExp('[\\u0000-\\u001F\\u007F\\u200B-\\u200F\\u202A-\\u202E\\u2066-\\u2069]', 'g');
const oneLine = (v: unknown) => String(v ?? '').replace(INVISIBLE, ' ').replace(/\s+/g, ' ').trim();
export const clip = (v: string, n: number) => (v.length > n ? `${v.slice(0, n - 1).trimEnd()}…` : v);

/** Image du site seulement (jamais d'adresse externe : pas d'image piégée, pas de chargement distant). */
export function ownImage(v: unknown): string | null {
  return typeof v === 'string' && /^\/api\/files\/[\w-]{6,40}$/.test(v) ? `${site()}${v}` : null;
}

/** Données structurées : « < » échappé pour qu'aucun texte ne puisse fermer la balise. */
export const jsonLdTag = (obj: unknown) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c').replace(new RegExp('[\\u2028\\u2029]', 'g'), '')}</script>`;

// ---------------------------------------------------------------- Dates (Haïti : « 2030-06-01T20:00 » → avec décalage horaire)
const TZ = 'America/Port-au-Prince';
function offsetFor(localIso: string): string {
  const ms = Date.parse(`${localIso.slice(0, 16)}:00Z`);
  if (Number.isNaN(ms)) return '-05:00';
  // Décalage de Haïti à cette date (heure d'été comprise)
  const part = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' }).formatToParts(new Date(ms)).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-05:00';
  const m = /GMT([+-]\d{2}:\d{2})/.exec(part);
  return m ? m[1]! : '-05:00';
}
export const isoWithOffset = (local: string) => `${local.slice(0, 16)}:00${offsetFor(local)}`;
const localMs = (local: string) => Date.parse(`${local.slice(0, 16)}:00Z`);
const dayLabel = (local: string) => new Date(localMs(local)).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

// ---------------------------------------------------------------- Balises
export interface SeoPage {
  title: string;
  description: string;
  path: string;
  image?: string | null;
  imageAlt?: string;
  noindex?: boolean;
  jsonLd?: unknown[];
  /** Contenu visible de la page (HTML déjà échappé) : un robot qui n'exécute pas le JavaScript y trouve le texte de la page. */
  body?: string;
}

/** Titre long : marque en fin de titre, sans doublon. */
export const fullTitle = (t: string) => (t.toLowerCase().includes(BRAND.toLowerCase()) ? t : `${t} · ${BRAND}`);

export function headTags(p: SeoPage): string {
  const url = `${site()}${p.path}`;
  const title = fullTitle(oneLine(p.title));
  const desc = clip(oneLine(p.description), 200);
  const img = p.image ?? `${site()}/og-default.png`;
  const mime = /\.png(\?|$)/.test(img) ? 'image/png' : /\.jpe?g(\?|$)/.test(img) ? 'image/jpeg' : 'image/png';
  const alt = clip(oneLine(p.imageAlt ?? p.title), 200);
  const robots = p.noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large, max-snippet:-1';
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(desc)}" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    `<meta name="robots" content="${robots}" />`,
    `<meta name="theme-color" content="#1509F3" />`,
    `<meta property="og:site_name" content="${BRAND}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:locale" content="fr_FR" />`,
    `<meta property="og:title" content="${esc(clip(oneLine(p.title), 90))}" />`,
    `<meta property="og:description" content="${esc(desc)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${esc(img)}" />`,
    `<meta property="og:image:secure_url" content="${esc(img)}" />`,
    `<meta property="og:image:type" content="${mime}" />`,
    `<meta property="og:image:width" content="${OG_W}" />`,
    `<meta property="og:image:height" content="${OG_H}" />`,
    `<meta property="og:image:alt" content="${esc(alt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(clip(oneLine(p.title), 70))}" />`,
    `<meta name="twitter:description" content="${esc(desc)}" />`,
    `<meta name="twitter:image" content="${esc(img)}" />`,
    `<meta name="twitter:image:alt" content="${esc(alt)}" />`,
    ...(p.noindex ? [] : (p.jsonLd ?? []).map(jsonLdTag)),
  ].join('\n');
}

export function renderHtml(p: SeoPage): string {
  const url = `${site()}${p.path}`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
${headTags(p)}
</head><body><header><a href="${esc(site())}/">${BRAND}</a></header><main>
<h1>${esc(oneLine(p.title))}</h1>
<p>${esc(oneLine(p.description))}</p>
${p.body ?? ''}
<p><a href="${esc(url)}">${esc(oneLine(p.title))}</a></p>
</main></body></html>`;
}

// ---------------------------------------------------------------- Données structurées
export const websiteLd = () => ({ '@context': 'https://schema.org', '@type': 'WebSite', name: BRAND, url: `${site()}/`, inLanguage: ['fr', 'en'] });
export const organizationLd = () => ({ '@context': 'https://schema.org', '@type': 'Organization', name: BRAND, url: `${site()}/`, logo: `${site()}/icon-512.png` });
export const breadcrumbLd = (items: [string, string][]) => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${site()}${path}` })),
});

export function eventLd(e: EventItem, org: { name: string; slug: string } | null, image: string | null) {
  const url = `${site()}/e/${e.slug}`;
  const online = !e.venue && !!e.online;
  const prices = e.tickets.map((t) => t.price).filter((p) => p > 0);
  const offers = e.tickets.map((t) => ({
    '@type': 'Offer', name: t.name, url, price: String(Math.max(0, t.price)), priceCurrency: e.currency,
    availability: t.quota - t.sold > 0 ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
    ...(t.salesStart ? { validFrom: isoWithOffset(t.salesStart) } : {}),
  }));
  void prices;
  return {
    '@context': 'https://schema.org', '@type': 'Event', name: oneLine(e.title), url,
    description: clip(oneLine(e.description), 500) || oneLine(e.title),
    startDate: isoWithOffset(e.start), endDate: isoWithOffset(e.end),
    eventStatus: e.status === 'cancelled' ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
    eventAttendanceMode: online ? 'https://schema.org/OnlineEventAttendanceMode' : 'https://schema.org/OfflineEventAttendanceMode',
    // Lieu : adresse du lieu ; jamais le lien privé d'un événement en ligne (la page de l'événement tient lieu d'adresse)
    location: online
      ? { '@type': 'VirtualLocation', url }
      : e.venue ? { '@type': 'Place', name: oneLine(e.venue.name), address: { '@type': 'PostalAddress', streetAddress: oneLine(e.venue.address), addressLocality: oneLine(e.venue.city), addressCountry: oneLine(e.venue.country) } } : undefined,
    ...(image ? { image: [image] } : {}),
    ...(org ? { organizer: { '@type': 'Organization', name: org.name, url: `${site()}/o/${org.slug}` } } : {}),
    ...(offers.length ? { offers } : {}),
  };
}

export const organizerLd = (o: Organizer, image: string | null) => ({
  '@context': 'https://schema.org', '@type': 'Organization', name: oneLine(o.name), url: `${site()}/o/${o.slug}`,
  ...(o.bio ? { description: clip(oneLine(o.bio), 300) } : {}), ...(image ? { logo: image, image } : {}),
});

export const softwareLd = (rel: { versionName: string; size: number; date: string } | null) => ({
  '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: BRAND, operatingSystem: 'Android 7.0+', applicationCategory: 'LifestyleApplication',
  description: 'Application Android Event509 : découvrez des événements, achetez et gardez vos billets dans votre téléphone.',
  url: `${site()}/telecharger`, image: `${site()}/icon-512.png`,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  ...(rel ? { softwareVersion: rel.versionName, fileSize: `${Math.round(rel.size / 1024 / 1024)}MB`, datePublished: rel.date, downloadUrl: `${site()}/app/event509.apk` } : {}),
});

// ---------------------------------------------------------------- Pages publiques fixes
export const STATIC_PAGES: Record<string, { path: string; title: string; description: string; ld?: 'home' | 'download' }> = {
  home: { path: '/', title: 'Billetterie et événements', description: 'Découvrez des concerts, soirées, conférences et ateliers, achetez vos billets en ligne (MonCash, NatCash, carte) et gardez-les dans votre téléphone.', ld: 'home' },
  explore: { path: '/explorer', title: 'Explorer les événements', description: 'Trouvez des événements près de chez vous : concerts, soirées, conférences, ateliers. Filtrez par date, lieu et catégorie.' },
  download: { path: '/telecharger', title: 'Application Android', description: 'Téléchargez l’application Android Event509 : vos billets toujours dans votre téléphone, même sans connexion, et les événements près de chez vous.', ld: 'download' },
  program: { path: '/organisateur-verifie', title: 'Organisateur vérifié', description: 'Le badge rouge « Organisateur vérifié » : identité contrôlée, outils professionnels et visibilité renforcée pour vos événements.' },
  terms: { path: '/cgu', title: 'Conditions d’utilisation', description: 'Les conditions d’utilisation de la plateforme Event509 : achat de billets, commissions, responsabilités des organisateurs et des participants.' },
  privacy: { path: '/confidentialite', title: 'Politique de confidentialité', description: 'Comment Event509 protège vos données personnelles : ce que nous collectons, pourquoi, et vos droits.' },
  refund: { path: '/remboursement', title: 'Politique de remboursement', description: 'Les règles de remboursement des billets sur Event509 : annulation d’un événement, délais et démarches.' },
  ambassador: { path: '/ambassadeurs', title: 'Programme ambassadeurs', description: 'Devenez ambassadeur Event509 : partagez des événements avec votre lien et gagnez une commission sur les billets vendus.' },
};

// ---------------------------------------------------------------- Image d'aperçu (1200 × 630)
const root = join(process.cwd(), 'server-assets');
let fonts: string[] | null = null;
const assetBuf = (name: string) => { try { return readFileSync(join(root, name)); } catch { return null; } };
const cache = new Map<string, Buffer>();

/** Coupe un titre en lignes de largeur bornée (largeur de caractère moyenne estimée). */
export function wrapLines(text: string, maxChars: number, maxLines: number): string[] {
  const words = oneLine(text).split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur ? cur.length + 1 : 0) + w.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = clip(`${kept[maxLines - 1]} ${lines.slice(maxLines).join(' ')}`, maxChars);
    return kept;
  }
  return lines.map((l) => (l.length > maxChars ? clip(l, maxChars) : l));
}

export interface OgInput { title: string; kicker?: string; line1?: string; line2?: string; footer?: string; cover?: { mime: string; data: Buffer } | null }

export function ogSvg(i: OgInput): string {
  const mark = assetBuf('logo-mark.png');
  const size = i.title.length > 60 ? 48 : i.title.length > 30 ? 58 : 72;
  const lines = wrapLines(i.title, Math.floor((i.cover ? 640 : 1000) / (size * 0.56)), 3);
  const textW = i.cover ? 640 : 1000;
  const coverImg = i.cover && ['image/png', 'image/jpeg', 'image/webp'].includes(i.cover.mime)
    ? `<clipPath id="cv"><rect x="760" y="70" width="380" height="490" rx="36"/></clipPath>
       <image href="data:${i.cover.mime};base64,${i.cover.data.toString('base64')}" x="760" y="70" width="380" height="490" preserveAspectRatio="xMidYMid slice" clip-path="url(#cv)"/>`
    : '';
  const t = (txt: string, y: number, fs: number, fill: string, w = 500) => `<text x="64" y="${y}" font-family="Plus Jakarta Sans" font-weight="${w}" font-size="${fs}" fill="${fill}">${esc(txt)}</text>`;
  const top = 150;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="${OG_H}" viewBox="0 0 ${OG_W} ${OG_H}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1509F3"/><stop offset="1" stop-color="#0C0640"/></linearGradient></defs>
<rect width="${OG_W}" height="${OG_H}" fill="url(#g)"/>
${coverImg}
${!coverImg && mark ? `<image href="data:image/png;base64,${mark.toString('base64')}" x="800" y="110" width="290" height="355" opacity="0.14" preserveAspectRatio="xMidYMid meet"/>` : ''}
${mark ? `<rect x="56" y="44" width="52" height="52" rx="14" fill="#fff"/><image href="data:image/png;base64,${mark.toString('base64')}" x="64" y="52" width="36" height="36" preserveAspectRatio="xMidYMid meet"/>` : ''}
<text x="124" y="82" font-family="Plus Jakarta Sans" font-weight="800" font-size="34" fill="#fff">${BRAND}</text>
${i.kicker ? t(i.kicker.toUpperCase(), top, 26, '#B9C2FF', 800) : ''}
${lines.map((l, n) => `<text x="64" y="${top + 80 + n * (size + 14)}" font-family="Plus Jakarta Sans" font-weight="800" font-size="${size}" fill="#fff">${esc(l)}</text>`).join('\n')}
${i.line1 ? t(clip(i.line1, Math.floor(textW / 15)), 470, 32, '#fff', 500) : ''}
${i.line2 ? t(clip(i.line2, Math.floor(textW / 15)), 516, 30, '#B9C2FF', 500) : ''}
${i.footer ? t(clip(i.footer, 60), 590, 26, '#B9C2FF', 500) : ''}
</svg>`;
}

/** Rend l'image en PNG (cache mémoire : la même image n'est jamais redessinée deux fois par instance). */
export async function renderOg(i: OgInput, key: string): Promise<Buffer> {
  const hit = cache.get(key);
  if (hit) return hit;
  const { Resvg } = await import('@resvg/resvg-js');
  if (!fonts) fonts = ['PJS-500.ttf', 'PJS-800.ttf'].map((f) => join(root, 'fonts', f));
  const png = new Resvg(ogSvg(i), { font: { loadSystemFonts: false, fontFiles: fonts, defaultFontFamily: 'Plus Jakarta Sans' }, fitTo: { mode: 'width', value: OG_W } }).render().asPng();
  if (cache.size >= 60) cache.delete(cache.keys().next().value as string);
  cache.set(key, png);
  return png;
}

const OG_CACHE = 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400';
/** Version de l'image dans son adresse : elle change avec le contenu, donc les réseaux sociaux la rechargent seulement quand il faut. */
export const ogVersion = (...parts: unknown[]) => createHash('sha1').update(parts.map((p) => String(p ?? '')).join('|')).digest('hex').slice(0, 8);

async function coverOf(images: (string | undefined)[]): Promise<{ mime: string; data: Buffer } | null> {
  for (const v of images) {
    const m = typeof v === 'string' ? /^\/api\/files\/([\w-]{6,40})$/.exec(v) : null;
    if (!m) continue;
    const f = await one<{ mime: string; data: Buffer; size: number }>(`select mime, data, size from files where id = $1 and visibility = 'public' and size < 2500000`, [m[1]]);
    if (f && sniff(f.data) === f.mime) return { mime: f.mime, data: f.data };
  }
  return null;
}

const eventRow = (slug: string) => one<{ data: EventItem; org: { name: string; slug: string } | null }>(
  `select e.data, jsonb_build_object('name', o.data->>'name', 'slug', o.data->>'slug') as org from events e left join organizers o on o.id = e.organizer_id where e.slug = $1 and e.status = 'published'`, [slug]);

/** `/og/e/<slug>.png`, `/og/o/<slug>.png` : image d'aperçu de marque ; contenu absent ou non publié = image par défaut (jamais d'erreur visible dans un aperçu). */
export async function ogImageResponse(kind: string, slug: string): Promise<{ png: Buffer; cache: string; noindex: boolean }> {
  slug = oneLine(slug).slice(0, 120);
  if (kind === 'e') {
    const r = slug ? await eventRow(slug) : null;
    if (r) {
      const e = r.data;
      const where = e.venue ? [e.venue.name, e.venue.city].filter(Boolean).join(' · ') : e.online ? 'En ligne' : '';
      const paid = e.tickets.filter((t) => t.price > 0).map((t) => t.price);
      const price = e.tickets.length && !paid.length ? 'Gratuit' : paid.length ? `dès ${Math.min(...paid)} ${e.currency}` : '';
      const cat = e.categories?.[0] ? oneLine(e.categories[0]).replace(/[-_]/g, ' ') : 'Événement';
      const cover = await coverOf([e.images?.[0], e.cover]);
      const key = `e:${slug}:${ogVersion(e.title, e.start, where, price, e.images?.[0], e.cover)}`;
      const png = await renderOg({ title: e.title, kicker: cat, line1: dayLabel(e.start), line2: [where, price].filter(Boolean).join(' · '), footer: r.org?.name ? `Organisé par ${r.org.name}` : undefined, cover }, key);
      return { png, cache: OG_CACHE, noindex: e.private === true };
    }
  } else if (kind === 'o') {
    const o = slug ? (await one<{ data: Organizer }>(`select data from organizers where data->>'slug' = $1`, [slug]))?.data : undefined;
    if (o) {
      const n = Number((await one<{ n: string }>(`select count(*) as n from events where organizer_id = $1 and status = 'published' and coalesce(data->>'private','false') <> 'true'`, [o.id]))?.n ?? 0);
      const cover = await coverOf([o.logo, o.cover]);
      const key = `o:${slug}:${ogVersion(o.name, o.logo, o.cover, n, o.verified)}`;
      const png = await renderOg({ title: o.name, kicker: o.verified ? 'Organisateur vérifié' : 'Organisateur', line1: [o.city, n ? `${n} événement${n > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · '), cover }, key);
      return { png, cache: OG_CACHE, noindex: false };
    }
  }
  // Repli : l'image de marque du site (même taille, même format)
  const fallback = assetBuf('og-default.png');
  if (fallback) return { png: fallback, cache: 'public, max-age=3600', noindex: true };
  return { png: await renderOg({ title: BRAND, line1: 'Billetterie et événements' }, 'default'), cache: 'public, max-age=3600', noindex: true };
}

// ---------------------------------------------------------------- Pages (aperçus et référencement)
const notFound = (what: string) => {
  const r = new Respond(404, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow' }, what);
  return r;
};

/** Page servie aux robots (partage et moteurs de recherche) pour une adresse publique du site. Les visiteurs reçoivent le site. */
export async function seoPageResponse(kind: string, slug: string): Promise<Respond> {
  slug = oneLine(slug).slice(0, 120);
  let page: SeoPage;
  let noindex = false;
  if (kind === 'e') {
    const r = slug ? await eventRow(slug) : null;
    if (!r) return notFound('Événement introuvable');
    const e = r.data;
    const isPrivate = e.private === true;
    const where = e.venue ? [e.venue.name, e.venue.city].filter(Boolean).join(', ') : e.online?.platform ? 'En ligne' : '';
    const paid = e.tickets.filter((t) => t.kind === 'paid' && t.price > 0).map((t) => t.price);
    const price = e.tickets.length && !paid.length ? 'Gratuit' : paid.length ? `dès ${Math.min(...paid)} ${e.currency}` : '';
    const desc = [dayLabel(e.start), where, price].filter(Boolean).join(' · ') + (e.description ? `. ${oneLine(e.description)}` : '');
    const own = ownImage(e.images?.[0]) ?? ownImage(e.cover);
    const img = `${site()}/og/e/${encodeURIComponent(e.slug)}.png?v=${ogVersion(e.title, e.start, where, price, e.images?.[0], e.cover)}`;
    noindex = isPrivate;
    const tick = e.tickets.map((t) => `<li>${esc(oneLine(t.name))} : ${t.price > 0 ? `${esc(String(t.price))} ${esc(e.currency)}` : 'Gratuit'}${t.quota - t.sold <= 0 ? ' (complet)' : ''}</li>`).join('');
    page = {
      title: e.title, description: desc, path: `/e/${e.slug}`, image: img, imageAlt: `${e.title} — ${dayLabel(e.start)}`, noindex,
      jsonLd: isPrivate ? [] : [eventLd(e, r.org?.slug ? { name: r.org.name, slug: r.org.slug } : null, own), breadcrumbLd([['Accueil', '/'], ['Explorer', '/explorer'], [e.title, `/e/${e.slug}`]])],
      body: `<p>${esc(dayLabel(e.start))}${where ? ` — ${esc(where)}` : ''}</p>${r.org?.name ? `<p>Organisé par <a href="${esc(site())}/o/${esc(r.org.slug)}">${esc(r.org.name)}</a></p>` : ''}${tick ? `<h2>Billets</h2><ul>${tick}</ul>` : ''}`,
    };
  } else if (kind === 'o') {
    const o = slug ? (await one<{ data: Organizer }>(`select data from organizers where data->>'slug' = $1`, [slug]))?.data : undefined;
    if (!o) return notFound('Organisateur introuvable');
    const evs = await all<{ slug: string; title: string; start: string }>(
      `select slug, data->>'title' as title, data->>'start' as start from events where organizer_id = $1 and status = 'published' and coalesce(data->>'private','false') <> 'true' order by start_at limit 30`, [o.id]);
    const n = evs.length;
    // Page sans aucun événement public : rien à indexer (pas de page vide dans les moteurs de recherche)
    noindex = n === 0;
    const desc = o.bio ? oneLine(o.bio) : `Les événements de ${o.name} sur ${BRAND}.`;
    page = {
      title: o.name, description: desc, path: `/o/${o.slug}`, noindex,
      image: `${site()}/og/o/${encodeURIComponent(o.slug)}.png?v=${ogVersion(o.name, o.logo, o.cover, n, o.verified)}`, imageAlt: o.name,
      jsonLd: [organizerLd(o, ownImage(o.logo) ?? ownImage(o.cover)), breadcrumbLd([['Accueil', '/'], [o.name, `/o/${o.slug}`]])],
      body: n ? `<h2>Événements</h2><ul>${evs.map((x) => `<li><a href="${esc(site())}/e/${esc(x.slug)}">${esc(oneLine(x.title))}</a> — ${esc(dayLabel(x.start))}</li>`).join('')}</ul>` : '',
    };
  } else {
    const s = STATIC_PAGES[kind];
    if (!s) return notFound('Page introuvable');
    const rel = s.ld === 'download' ? await currentRelease().catch(() => null) : null;
    const relInfo = rel ? { versionName: rel.version_name, size: Number(rel.size), date: new Date(rel.created_at).toISOString().slice(0, 10) } : null;
    page = {
      title: s.title, description: s.description, path: s.path,
      jsonLd: s.ld === 'home' ? [websiteLd(), organizationLd()] : s.ld === 'download' ? [softwareLd(relInfo), breadcrumbLd([['Accueil', '/'], ['Application Android', '/telecharger']])] : [breadcrumbLd([['Accueil', '/'], [s.title, s.path]])],
      body: s.ld === 'download' ? `<p>${relInfo ? `Version ${esc(relInfo.versionName)}, Android 7.0 ou plus récent.` : 'Le fichier sera bientôt disponible.'}</p>` : '',
    };
  }
  const out = Respond.html(renderHtml(page));
  // Les robots de partage et de recherche relisent la page de temps en temps : copie courte au niveau du réseau, jamais partagée avec les visiteurs
  out.headers['Cache-Control'] = 'public, max-age=0, s-maxage=300, stale-while-revalidate=600';
  out.headers['Vary'] = 'User-Agent';
  if (noindex) out.headers['X-Robots-Tag'] = 'noindex, nofollow';
  return out;
}

// ---------------------------------------------------------------- robots.txt et plan du site
const PRIVATE_PREFIXES = ['/admin', '/organisateur', '/compte', '/connexion', '/inscription', '/mot-de-passe-oublie', '/reinitialiser', '/verifier-email', '/retour-paiement', '/commande', '/billets', '/favoris', '/notifications', '/fil', '/desinscription', '/widget/', '/app/', '/revente'];

export function robotsTxt(): string {
  return [
    'User-agent: *',
    // Les images (aperçus, affiches, photos) restent accessibles aux robots ; le reste de l'API leur est fermé
    'Allow: /api/files/',
    'Allow: /og/',
    'Disallow: /api/',
    // « /organisateur/ » et « /organisateur$ » : sans fermer par erreur les pages publiques qui commencent pareil (« /organisateur-verifie »)
    ...PRIVATE_PREFIXES.flatMap((p) => (p.endsWith('/') ? [`Disallow: ${p}`] : [`Disallow: ${p}/`, `Disallow: ${p}$`])),
    'Disallow: /e/*/achat',
    'Disallow: /explorer?*',
    '',
    `Sitemap: ${site()}/sitemap.xml`,
    '',
  ].join('\n');
}

const PER_SITEMAP = 5000;
const xml = (body: string) => new Respond(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=900, stale-while-revalidate=3600', 'X-Content-Type-Options': 'nosniff' }, `<?xml version="1.0" encoding="UTF-8"?>\n${body}`);
const publicEvents = `status = 'published' and coalesce(data->>'private', 'false') <> 'true' and start_at > now() - interval '90 days'`;

export async function sitemapResponse(name: string): Promise<Respond> {
  const s = site();
  if (name === 'index') {
    const ne = Number((await one<{ n: string }>(`select count(*) as n from events where ${publicEvents}`))?.n ?? 0);
    const no = Number((await one<{ n: string }>(`select count(*) as n from organizers o where exists (select 1 from events e where e.organizer_id = o.id and e.status = 'published' and coalesce(e.data->>'private','false') <> 'true')`))?.n ?? 0);
    const parts = [`${s}/sitemap-pages.xml`, ...Array.from({ length: Math.max(1, Math.ceil(ne / PER_SITEMAP)) }, (_, i) => `${s}/sitemap-events-${i + 1}.xml`), ...Array.from({ length: Math.max(1, Math.ceil(no / PER_SITEMAP)) }, (_, i) => `${s}/sitemap-organizers-${i + 1}.xml`)];
    return xml(`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${parts.map((u) => `<sitemap><loc>${esc(u)}</loc></sitemap>`).join('')}</sitemapindex>`);
  }
  const urlset = (items: { loc: string; lastmod?: string }[]) =>
    xml(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items.map((i) => `<url><loc>${esc(i.loc)}</loc>${i.lastmod ? `<lastmod>${i.lastmod}</lastmod>` : ''}</url>`).join('')}</urlset>`);
  if (name === 'pages') return urlset(Object.values(STATIC_PAGES).map((p) => ({ loc: `${s}${p.path === '/' ? '/' : p.path}` })));
  const m = /^(events|organizers)-(\d{1,4})$/.exec(name);
  if (!m) return notFound('Plan du site introuvable');
  const offset = (Number(m[2]) - 1) * PER_SITEMAP;
  if (m[1] === 'events') {
    const rows = await all<{ slug: string; at: Date | null }>(`select slug, published_at as at from events where ${publicEvents} order by start_at desc limit ${PER_SITEMAP} offset $1`, [offset]);
    return urlset(rows.map((r) => ({ loc: `${s}/e/${encodeURIComponent(r.slug)}`, lastmod: r.at ? new Date(r.at).toISOString().slice(0, 10) : undefined })));
  }
  const rows = await all<{ slug: string }>(
    `select o.data->>'slug' as slug from organizers o where o.data->>'slug' is not null and exists (select 1 from events e where e.organizer_id = o.id and e.status = 'published' and coalesce(e.data->>'private','false') <> 'true') order by o.data->>'slug' limit ${PER_SITEMAP} offset $1`, [offset]);
  return urlset(rows.map((r) => ({ loc: `${s}/o/${encodeURIComponent(r.slug)}` })));
}
