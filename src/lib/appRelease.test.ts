import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchRelease, isNewer, promptAllowed, rememberInstalled, rememberLater, sizeMo } from './appRelease';

const json = (body: unknown, type = 'application/json') => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': type } }));

describe('application Android (APK)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('lit la fiche de version publiée', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json({ versionCode: 12, versionName: '1.0.12', size: 24848818, sha256: 'ab', date: '2026-11-13', minAndroid: '7.0', file: '/app/event509.apk' })));
    expect(await fetchRelease()).toMatchObject({ versionCode: 12, versionName: '1.0.12', size: 24848818 });
  });

  it('ignore une fiche absente ou invalide : aucune invitation ne s’affiche', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('<html></html>', { status: 200, headers: { 'Content-Type': 'text/html' } }))));
    expect(await fetchRelease()).toBeNull(); // la page d'accueil renvoyée à la place du fichier
    vi.stubGlobal('fetch', vi.fn(() => json({ versionCode: 0, versionName: 'x', size: 10 })));
    expect(await fetchRelease()).toBeNull();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('réseau'))));
    expect(await fetchRelease()).toBeNull();
  });

  it('propose la mise à jour seulement si la version installée est connue et plus ancienne', () => {
    expect(isNewer({ versionCode: 20 }, 19)).toBe(true);
    expect(isNewer({ versionCode: 20 }, 20)).toBe(false);
    expect(isNewer({ versionCode: 20 }, 25)).toBe(false);
    expect(isNewer({ versionCode: 20 }, 0)).toBe(false); // ancienne application qui ne donne pas sa version
  });

  it('arrondit la taille en Mo', () => {
    expect(sizeMo(24848818)).toBe('24 Mo');
    expect(sizeMo(100)).toBe('1 Mo');
  });

  it('« Plus tard » masque l’invitation 3 jours, « Déjà installée » pour toujours', () => {
    expect(promptAllowed()).toBe(true);
    rememberLater();
    expect(promptAllowed()).toBe(false);
    localStorage.setItem('e509.apk.later', String(Date.now() - 4 * 86400000));
    expect(promptAllowed()).toBe(true);
    rememberInstalled();
    expect(promptAllowed()).toBe(false);
  });
});
