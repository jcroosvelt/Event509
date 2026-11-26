import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clip, headTags, isoWithOffset, jsonLdTag, ogSvg, ownImage, robotsTxt, STATIC_PAGES, wrapLines } from '../../api/_lib/seo.js';

/** Référencement et aperçus de liens : balises, données structurées, plan du site, robots.txt, images d'aperçu. */
const DB = process.env.TEST_DATABASE_URL;

describe('SEO : fonctions pures', () => {
  it('images : seulement celles du site ; jamais d’adresse externe ni de chemin détourné', () => {
    process.env.SITE_URL = 'https://exemple.test';
    expect(ownImage('/api/files/f_abc123XY')).toBe('https://exemple.test/api/files/f_abc123XY');
    for (const bad of ['https://evil.example/x.png', 'javascript:alert(1)', '/api/files/../../x', 'data:image/png;base64,AAAA', '//evil.example/x.png', '', null, undefined, 42])
      expect(ownImage(bad), String(bad)).toBeNull();
  });

  it('balises : tout est échappé, image absolue en https avec ses dimensions, canonique sans paramètres', () => {
    process.env.SITE_URL = 'https://exemple.test';
    const h = headTags({ title: 'Fête "spéciale" <b>&</b>', description: 'Une soirée\n\navec <script>alert(1)</script> et des "guillemets"', path: '/e/ma-fete', image: 'https://exemple.test/og/e/ma-fete.png?v=abcd1234' });
    expect(h).toContain('<link rel="canonical" href="https://exemple.test/e/ma-fete" />');
    expect(h).toContain('property="og:image:width" content="1200"');
    expect(h).toContain('property="og:image:height" content="630"');
    expect(h).toContain('property="og:image:type" content="image/png"');
    expect(h).toContain('property="og:locale" content="fr_FR"');
    expect(h).toContain('name="twitter:card" content="summary_large_image"');
    expect(h).not.toContain('<script>alert');
    expect(h).not.toContain('<b>');
    expect(h).not.toMatch(/content="[^"]*"[^>]*"[^>]*"[^>]*"/); // aucune valeur ne casse son attribut
    expect(h).toContain('index, follow');
    expect(headTags({ title: 'x', description: 'y', path: '/p', noindex: true, jsonLd: [{ a: 1 }] })).not.toContain('application/ld+json');
  });

  it('données structurées : « </script> » ne ferme jamais la balise ; dates avec le décalage horaire d’Haïti', () => {
    const t = jsonLdTag({ name: '</script><script>alert(1)</script>' });
    expect(t.match(/<\/script>/g)).toHaveLength(1); // seulement la fermeture finale
    expect(JSON.parse(t.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, ''))).toEqual({ name: '</script><script>alert(1)</script>' });
    expect(isoWithOffset('2030-01-15T20:00')).toBe('2030-01-15T20:00:00-05:00');
    expect(isoWithOffset('2030-07-15T20:00')).toBe('2030-07-15T20:00:00-04:00');
  });

  it('robots.txt : pages privées fermées, images et plan du site ouverts, pages publiques voisines non fermées par erreur', () => {
    process.env.SITE_URL = 'https://exemple.test';
    const r = robotsTxt().split('\n');
    for (const l of ['User-agent: *', 'Allow: /api/files/', 'Allow: /og/', 'Disallow: /api/', 'Disallow: /admin/', 'Disallow: /compte/', 'Disallow: /organisateur/', 'Disallow: /organisateur$', 'Disallow: /e/*/achat', 'Disallow: /explorer?*', 'Sitemap: https://exemple.test/sitemap.xml'])
      expect(r, l).toContain(l);
    expect(r).not.toContain('Disallow: /organisateur'); // fermerait « /organisateur-verifie »
    expect(r).not.toContain('Disallow: /');
    expect(r).not.toContain('Disallow: /assets/');
  });

  it('pages publiques : titres et descriptions tous différents, jamais vides', () => {
    const pages = Object.values(STATIC_PAGES);
    expect(new Set(pages.map((p) => p.title)).size).toBe(pages.length);
    expect(new Set(pages.map((p) => p.description)).size).toBe(pages.length);
    for (const p of pages) {
      expect(p.title.length).toBeGreaterThan(3);
      expect(p.description.length).toBeGreaterThan(50);
      expect(p.description.length).toBeLessThanOrEqual(220);
    }
  });

  it('image d’aperçu : titre coupé proprement, texte échappé (aucune balise injectée)', () => {
    expect(wrapLines('Un très long titre de soirée qui doit passer sur plusieurs lignes sans déborder du cadre', 24, 3).every((l) => l.length <= 24)).toBe(true);
    expect(wrapLines('x '.repeat(200), 20, 3)).toHaveLength(3);
    expect(clip('abcdef', 4)).toBe('abc…');
    const svg = ogSvg({ title: '</text><image href="https://evil.example/x.png" /><text>', kicker: '<b>', line1: '"a" & <b>', footer: '</svg>' });
    expect(svg).not.toContain('href="https://evil');
    expect(svg).not.toContain('<b>');
    expect(svg.match(/<\/svg>/g)).toHaveLength(1);
  });
});

describe.skipIf(!DB)('SEO : pages réelles (base de test)', () => {
  let pool: pg.Pool;
  let handle: typeof import('../../api/_lib/handler.js').handle;
  let signToken: typeof import('../../api/_lib/auth.js').signToken;
  const tag = `se${Date.now()}`;
  let ipN = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Out = { status: number; body: any; headers?: Record<string, string | string[]> };
  const call = async (method: string, path: string, body?: unknown, token?: string, query: Record<string, string> = {}): Promise<Out> =>
    (await handle({ method, path, query, body, authorization: token ? `Bearer ${token}` : undefined, ip: `10.2.${Math.floor(ipN / 250) % 250}.${(ipN++ % 250) + 1}` })) as Out;
  const event = (over: Record<string, unknown> = {}) => ({
    title: `Concert ${tag}`, description: 'Une grande soirée de musique en direct.', start: '2030-06-01T20:00:00', end: '2030-06-01T23:00:00', currency: 'HTG', status: 'published', seated: false, maxPerPerson: 8,
    venue: { name: 'Salle Rex', address: '12 rue Capois', city: 'Port-au-Prince', country: 'HT' }, categories: ['music'], images: [], tags: [],
    tickets: [{ id: 't1', name: 'Standard', kind: 'paid', price: 500, quota: 50, sold: 0, salesStart: '2026-01-01T00:00:00', salesEnd: '2030-06-01T20:00:00', maxPerOrder: 4 }], ...over,
  });
  let org = { token: '', orgId: '', slug: '' };
  let empty = { token: '', orgId: '', slug: '' };
  const ids: Record<string, { id: string; slug: string }> = {};
  async function makeOrg(n: string) {
    const id = `u_${tag}${n}`;
    await pool.query(`insert into users (id, email, password_hash, role, data, auth_complete) values ($1,$2,'x','participant',$3, true)`, [id, `${id}@seo.test`, JSON.stringify({ name: `Org ${n}` })]);
    const token = signToken(id);
    const o = await call('POST', '/auth/organizer', { orgName: `Orga ${tag}${n}`, country: 'HT' }, token);
    expect(o.status, JSON.stringify(o.body)).toBe(200);
    await pool.query(`update organizers set data = data || '{"verified": true}'::jsonb where id = $1`, [o.body.organizerId]);
    const slug = (await pool.query(`select data->>'slug' as s from organizers where id = $1`, [o.body.organizerId])).rows[0].s as string;
    return { token, orgId: o.body.organizerId as string, slug };
  }
  const html = (o: Out) => String(o.body);
  const ld = (o: Out) => [...html(o).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]!.replace(/\\u003c/g, '<')));
  const loc = (o: Out) => [...String(o.body).matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]!);

  beforeAll(async () => {
    process.env.DATABASE_URL = DB;
    process.env.JWT_SECRET = 'q'.repeat(40);
    process.env.SITE_URL = 'https://exemple.test';
    delete process.env.VERCEL_ENV;
    pool = new pg.Pool({ connectionString: DB });
    ({ handle } = await import('../../api/_lib/handler.js'));
    ({ signToken } = await import('../../api/_lib/auth.js'));
    org = await makeOrg('a');
    empty = await makeOrg('b');
    const mk = async (key: string, over: Record<string, unknown>) => {
      const r = await call('PUT', '/org/events', event(over), org.token);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      ids[key] = { id: r.body.id, slug: r.body.slug };
    };
    await mk('pub', { title: `Concert <script>alert(1)</script> "${tag}" & Cie`, images: ['/api/files/f_abc123XY'] });
    await mk('online', { title: `Atelier en ligne ${tag}`, venue: null, online: { platform: 'Zoom', url: 'https://zoom.us/j/SECRETLINK' } });
    await mk('private', { title: `Soirée privée ${tag}`, private: true });
    await mk('draft', { title: `Brouillon ${tag}`, status: 'draft' });
    await mk('old', { title: `Ancien ${tag}` });
    await pool.query(`update events set start_at = now() - interval '200 days' where id = $1`, [ids.old!.id]);
  });
  afterAll(async () => {
    await pool?.query(`delete from users where email like '%@seo.test'`);
    await pool?.end();
  });

  it('page d’un événement : balises complètes, JSON-LD « Event » fidèle, texte échappé', async () => {
    const r = await call('GET', '/share', undefined, undefined, { kind: 'e', slug: ids.pub!.slug });
    expect(r.status).toBe(200);
    const h = html(r);
    expect(h).toContain(`<link rel="canonical" href="https://exemple.test/e/${ids.pub!.slug}" />`);
    expect(h).toMatch(/property="og:image" content="https:\/\/exemple\.test\/og\/e\/[^"?]+\.png\?v=[0-9a-f]{8}"/);
    expect(h).toContain('property="og:image:width" content="1200"');
    expect(h).toContain('index, follow');
    expect(h).not.toContain('<script>alert(1)</script>');
    expect(h).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(r.headers?.['X-Robots-Tag']).toBeUndefined();
    const [ev, crumbs] = ld(r);
    expect(ev['@type']).toBe('Event');
    expect(ev.startDate).toMatch(/^2030-06-01T20:00:00-0[45]:00$/);
    expect(ev.eventAttendanceMode).toBe('https://schema.org/OfflineEventAttendanceMode');
    expect(ev.location).toMatchObject({ '@type': 'Place', name: 'Salle Rex', address: { addressLocality: 'Port-au-Prince', addressCountry: 'HT' } });
    expect(ev.offers[0]).toMatchObject({ price: '500', priceCurrency: 'HTG', availability: 'https://schema.org/InStock' });
    expect(ev.organizer['@type']).toBe('Organization');
    expect(ev.image).toEqual(['https://exemple.test/api/files/f_abc123XY']);
    expect(ev.aggregateRating).toBeUndefined(); // aucune note inventée
    expect(crumbs['@type']).toBe('BreadcrumbList');
    expect(ev.name).toContain('<script>'); // le texte exact est dans les données (échappé à la sortie)
  });

  it('événement en ligne : jamais le lien privé de la réunion', async () => {
    const r = await call('GET', '/share', undefined, undefined, { kind: 'e', slug: ids.online!.slug });
    expect(html(r)).not.toContain('SECRETLINK');
    const [ev] = ld(r);
    expect(ev.eventAttendanceMode).toBe('https://schema.org/OnlineEventAttendanceMode');
    expect(ev.location).toEqual({ '@type': 'VirtualLocation', url: `https://exemple.test/e/${ids.online!.slug}` });
  });

  it('privé, brouillon, inconnu : « noindex » ou 404, jamais de données structurées ni de fuite', async () => {
    const priv = await call('GET', '/share', undefined, undefined, { kind: 'e', slug: ids.private!.slug });
    expect(priv.status).toBe(200);
    expect(html(priv)).toContain('noindex, nofollow');
    expect(html(priv)).not.toContain('application/ld+json');
    expect(priv.headers?.['X-Robots-Tag']).toContain('noindex');
    for (const slug of [ids.draft!.slug, 'inconnu-xyz', '']) {
      const r = await call('GET', '/share', undefined, undefined, { kind: 'e', slug });
      expect(r.status, slug).toBe(404);
      expect(r.headers?.['X-Robots-Tag']).toContain('noindex');
      expect(String(r.body)).not.toContain(tag);
    }
    expect((await call('GET', '/share', undefined, undefined, { kind: 'zzz', slug: 'x' })).status).toBe(404);
  });

  it('organisateur : données structurées ; sans événement public, la page n’est pas indexable', async () => {
    const r = await call('GET', '/share', undefined, undefined, { kind: 'o', slug: org.slug });
    expect(r.status).toBe(200);
    expect(ld(r)[0]['@type']).toBe('Organization');
    expect(html(r)).toContain('index, follow');
    expect(html(r)).toContain(`/e/${ids.pub!.slug}`);
    expect(html(r)).not.toContain(ids.draft!.slug);
    const e = await call('GET', '/share', undefined, undefined, { kind: 'o', slug: empty.slug });
    expect(html(e)).toContain('noindex, nofollow');
    expect(e.headers?.['X-Robots-Tag']).toContain('noindex');
  });

  it('pages fixes : accueil (site et organisation), téléchargement (application), titres tous différents', async () => {
    const titles = new Set<string>();
    for (const k of Object.keys(STATIC_PAGES)) {
      const r = await call('GET', '/share', undefined, undefined, { kind: k });
      expect(r.status, k).toBe(200);
      titles.add(/<title>([^<]*)<\/title>/.exec(html(r))![1]!);
      expect(html(r), k).toContain(`rel="canonical" href="https://exemple.test${STATIC_PAGES[k]!.path}"`);
    }
    expect(titles.size).toBe(Object.keys(STATIC_PAGES).length);
    expect(ld(await call('GET', '/share', undefined, undefined, { kind: 'home' })).map((x) => x['@type'])).toEqual(['WebSite', 'Organization']);
    const dl = ld(await call('GET', '/share', undefined, undefined, { kind: 'download' }));
    expect(dl[0]).toMatchObject({ '@type': 'SoftwareApplication', operatingSystem: 'Android 7.0+', offers: { price: '0' } });
  });

  it('plan du site : seulement les contenus publics et publiés, adresses absolues, découpé par type', async () => {
    const idx = await call('GET', '/seo/sitemap', undefined, undefined, { name: 'index' });
    expect(idx.status).toBe(200);
    expect(idx.headers?.['Content-Type']).toContain('application/xml');
    expect(loc(idx)).toEqual(expect.arrayContaining(['https://exemple.test/sitemap-pages.xml', 'https://exemple.test/sitemap-events-1.xml', 'https://exemple.test/sitemap-organizers-1.xml']));
    const pages = loc(await call('GET', '/seo/sitemap', undefined, undefined, { name: 'pages' }));
    expect(pages).toContain('https://exemple.test/');
    expect(pages).toContain('https://exemple.test/telecharger');
    expect(pages.some((u) => /connexion|admin|compte|api/.test(u))).toBe(false);
    const evs = loc(await call('GET', '/seo/sitemap', undefined, undefined, { name: 'events-1' }));
    expect(evs).toContain(`https://exemple.test/e/${ids.pub!.slug}`);
    expect(evs).toContain(`https://exemple.test/e/${ids.online!.slug}`);
    for (const k of ['private', 'draft', 'old']) expect(evs, k).not.toContain(`https://exemple.test/e/${ids[k]!.slug}`);
    expect(evs.every((u) => u.startsWith('https://'))).toBe(true);
    const orgs = loc(await call('GET', '/seo/sitemap', undefined, undefined, { name: 'organizers-1' }));
    expect(orgs).toContain(`https://exemple.test/o/${org.slug}`);
    expect(orgs).not.toContain(`https://exemple.test/o/${empty.slug}`);
    expect((await call('GET', '/seo/sitemap', undefined, undefined, { name: 'inconnu' })).status).toBe(404);
    expect((await call('GET', '/seo/sitemap', undefined, undefined, { name: 'events-abc' })).status).toBe(404);
  });

  it('image d’aperçu : PNG 1200 × 630 valide, mise en cache, repli de marque pour un contenu absent ou non publié', async () => {
    const png = (r: Out) => {
      expect(r.status).toBe(200);
      expect(r.body.mime).toBe('image/png');
      const d = r.body.data as Buffer;
      expect(d.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      return { w: d.readUInt32BE(16), h: d.readUInt32BE(20), size: d.length, cache: String(r.body.cache) };
    };
    const a = png(await call('GET', '/og', undefined, undefined, { kind: 'e', slug: ids.pub!.slug }));
    expect(a).toMatchObject({ w: 1200, h: 630 });
    expect(a.size).toBeGreaterThan(5_000);
    expect(a.cache).toContain('s-maxage');
    expect(png(await call('GET', '/og', undefined, undefined, { kind: 'o', slug: org.slug }))).toMatchObject({ w: 1200, h: 630 });
    // Brouillon, inconnu, vide : l'image par défaut de la marque (même taille), jamais une erreur dans un aperçu
    for (const slug of [ids.draft!.slug, 'inconnu-xyz', '']) expect(png(await call('GET', '/og', undefined, undefined, { kind: 'e', slug })), slug).toMatchObject({ w: 1200, h: 630 });
    // Le titre d'un événement n'apparaît jamais dans l'image d'un brouillon : même image que pour un inconnu
    const d1 = (await call('GET', '/og', undefined, undefined, { kind: 'e', slug: ids.draft!.slug })).body.data as Buffer;
    const d2 = (await call('GET', '/og', undefined, undefined, { kind: 'e', slug: 'inconnu-xyz' })).body.data as Buffer;
    expect(d1.equals(d2)).toBe(true);
  });
});
