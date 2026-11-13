import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('publication de l’APK sur le site', () => {
  const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as { headers: { source: string; headers: { key: string; value: string }[] }[] };
  const headersOf = (source: string) => Object.fromEntries((vercel.headers.find((h) => h.source === source)?.headers ?? []).map((h) => [h.key, h.value]));

  it('l’APK est servi comme une application Android, à télécharger, toujours revalidé', () => {
    const h = headersOf('/app/event509.apk');
    expect(h['Content-Type']).toBe('application/vnd.android.package-archive');
    expect(h['Content-Disposition']).toContain('attachment');
    expect(h['Cache-Control']).toContain('must-revalidate');
  });

  it('la fiche de version n’est jamais gardée en cache (la mise à jour doit être vue tout de suite)', () => {
    expect(headersOf('/app/version.json')['Cache-Control']).toBe('no-cache');
  });

  it('le service worker laisse passer /app/ et /.well-known/ : le téléchargement ne renvoie pas la page d’accueil', () => {
    const cfg = readFileSync('vite.config.ts', 'utf8');
    expect(cfg).toMatch(/navigateFallbackDenylist:[^\n]*\\\/app\\\//);
    expect(cfg).toMatch(/navigateFallbackDenylist:[^\n]*well-known/);
    expect(cfg).not.toMatch(/globPatterns:[^\n]*apk/);
  });

  it('la fiche de version correspond exactement au fichier APK publié (taille et empreinte)', () => {
    if (!existsSync('public/app/event509.apk')) return; // aucun APK publié pour l'instant
    const info = JSON.parse(readFileSync('public/app/version.json', 'utf8')) as { versionCode: number; versionName: string; size: number; sha256: string };
    expect(info.versionCode).toBeGreaterThan(1);
    expect(info.versionName).toBe(`1.0.${info.versionCode}`);
    expect(statSync('public/app/event509.apk').size).toBe(info.size);
    expect(createHash('sha256').update(readFileSync('public/app/event509.apk')).digest('hex')).toBe(info.sha256);
  });
});
