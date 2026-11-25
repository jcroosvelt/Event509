import { randomBytes, scryptSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashPassword, passwordNeedsRehash, verifyPassword } from './_lib/auth.js';

/** Hachage d'avant l'audit : « scrypt$sel$hash » avec le coût par défaut de Node (N = 16384). */
function legacyHash(pw: string) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('base64')}$${scryptSync(pw, salt, 64).toString('base64')}`;
}

describe('mots de passe (scrypt, coût dans le hachage)', () => {
  it('nouveau format : coût actuel écrit dans le hachage, sel différent à chaque fois, bon mot de passe seulement', async () => {
    const a = await hashPassword('Mot2passe-solide');
    const b = await hashPassword('Mot2passe-solide');
    expect(a).toMatch(/^scrypt2\$65536\$8\$2\$/);
    expect(a).not.toBe(b);
    expect(await verifyPassword('Mot2passe-solide', a)).toBe(true);
    expect(await verifyPassword('Mot2passe-solidE', a)).toBe(false);
    expect(await verifyPassword('', a)).toBe(false);
    expect(passwordNeedsRehash(a)).toBe(false);
  });

  it('ancien format : toujours accepté, et signalé pour migration à la prochaine connexion', async () => {
    const old = legacyHash('ancien-secret1');
    expect(await verifyPassword('ancien-secret1', old)).toBe(true);
    expect(await verifyPassword('autre-secret1', old)).toBe(false);
    expect(passwordNeedsRehash(old)).toBe(true);
    expect(passwordNeedsRehash(null)).toBe(false);
  });

  it('hachage altéré ou invalide : refusé sans épuiser la mémoire du serveur', async () => {
    const good = await hashPassword('secret-solide1');
    const [, , r, p, salt, hash] = good.split('$') as [string, string, string, string, string, string];
    for (const bad of [
      `scrypt2$4294967296$${r}$${p}$${salt}$${hash}`, // coût démesuré
      `scrypt2$65537$${r}$${p}$${salt}$${hash}`, // pas une puissance de 2
      `scrypt2$65536$999$${p}$${salt}$${hash}`,
      `scrypt2$65536$${r}$999$${salt}$${hash}`,
      `scrypt2$8$${r}$${p}$${salt}$${hash}`, // coût trop faible
      'scrypt2$65536$8$2$seulement-quatre',
      'md5$abc$def',
      'texte en clair',
      '',
    ])
      expect(await verifyPassword('secret-solide1', bad), bad).toBe(false);
    expect(await verifyPassword('secret-solide1', undefined)).toBe(false);
  });
});
