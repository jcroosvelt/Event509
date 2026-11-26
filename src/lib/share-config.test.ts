import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface Rewrite { source: string; destination: string; has?: { type: string; key: string; value: string }[] }
const cfg = JSON.parse(readFileSync('vercel.json', 'utf8')) as { rewrites: Rewrite[] };

describe('aperçus de partage (vercel.json)', () => {
  const rule = (src: string) => cfg.rewrites.find((r) => r.source === src && r.has)!;
  const matches = (src: string, ua: string) => new RegExp(`^${rule(src).has![0]!.value}$`).test(ua);
  const bots = [
    'WhatsApp/2.23.20.0 A', 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)', 'Twitterbot/1.0', 'TelegramBot (like TwitterBot)',
    'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)', 'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient)', 'Slackbot-LinkExpanding 1.0',
    // Moteurs de recherche : ils reçoivent la même page (titre, description, canonique, données structurées) dès le premier octet de HTML
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/W.X.Y.Z Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)', 'Mozilla/5.0 (compatible; DuckDuckBot-Https/1.1; https://duckduckgo.com/duckduckbot)', 'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)',
  ];
  const humans = [
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  ];
  it('les robots de partage et les moteurs de recherche reçoivent la page d’aperçu, les visiteurs le site', () => {
    for (const src of ['/e/:slug', '/o/:slug']) {
      for (const ua of bots) expect(matches(src, ua), `${src} ${ua}`).toBe(true);
      for (const ua of humans) expect(matches(src, ua), `${src} ${ua}`).toBe(false);
    }
  });
  it('la page d’aperçu est servie par la fonction du site, avant la règle générale du site', () => {
    expect(rule('/e/:slug').destination).toBe('/api?path=share&kind=e&slug=:slug');
    expect(rule('/o/:slug').destination).toBe('/api?path=share&kind=o&slug=:slug');
    const i = cfg.rewrites.findIndex((r) => r.source === '/e/:slug');
    const spa = cfg.rewrites.findIndex((r) => r.destination === '/index.html');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(spa).toBeGreaterThan(i);
  });
  it('pages fixes : mêmes robots, même page serveur ; robots.txt, plan du site et images d’aperçu avant la règle générale', () => {
    const spa = cfg.rewrites.findIndex((r) => r.destination === '/index.html');
    for (const [src, kind] of [['/', 'home'], ['/explorer', 'explore'], ['/telecharger', 'download'], ['/organisateur-verifie', 'program'], ['/cgu', 'terms'], ['/confidentialite', 'privacy'], ['/remboursement', 'refund'], ['/ambassadeurs', 'ambassador']] as const) {
      expect(rule(src).destination, src).toBe(`/api?path=share&kind=${kind}`);
      expect(matches(src, bots[0]!)).toBe(true);
      expect(matches(src, humans[0]!)).toBe(false);
      expect(cfg.rewrites.findIndex((r) => r.source === src && r.has)).toBeLessThan(spa);
    }
    const dest = (src: string) => cfg.rewrites.find((r) => r.source === src)?.destination;
    expect(dest('/robots.txt')).toBe('/api?path=seo/robots');
    expect(dest('/sitemap.xml')).toBe('/api?path=seo/sitemap&name=index');
    expect(dest('/sitemap-:name.xml')).toBe('/api?path=seo/sitemap&name=:name');
    expect(dest('/og/:kind/:slug.png')).toBe('/api?path=og&kind=:kind&slug=:slug');
    for (const src of ['/robots.txt', '/sitemap.xml', '/sitemap-:name.xml', '/og/:kind/:slug.png']) expect(cfg.rewrites.findIndex((r) => r.source === src), src).toBeLessThan(spa);
  });
  it('espaces privés : jamais indexés (en-tête), sans fermer les pages publiques voisines', () => {
    const headers = (JSON.parse(readFileSync('vercel.json', 'utf8')) as { headers: { source: string; headers: { key: string; value: string }[] }[] }).headers;
    const priv = headers.find((h) => h.headers.some((x) => x.key === 'X-Robots-Tag'))!;
    const re = new RegExp(`^${priv.source.replace(/\(\/\.\*\)\?$/, '(?:/.*)?')}$`);
    for (const p of ['/admin', '/admin/utilisateurs', '/compte/profil', '/organisateur', '/organisateur/evenements', '/connexion', '/commande/o_1', '/billets', '/app/event509.apk', '/widget/x']) expect(re.test(p), p).toBe(true);
    for (const p of ['/', '/explorer', '/e/ma-fete', '/o/mon-orga', '/organisateur-verifie', '/telecharger', '/cgu', '/ambassadeurs']) expect(re.test(p), p).toBe(false);
  });
});
