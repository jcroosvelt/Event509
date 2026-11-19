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
  ];
  const humans = [
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', // Google exécute le JavaScript : il reçoit le vrai site
  ];
  it('les robots de partage reçoivent la page d’aperçu, les visiteurs et Google le site', () => {
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
});
