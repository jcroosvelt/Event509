import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_PACKAGE, expectedSigner, readApk, readApkSigner } from '../../api/_lib/apprelease.js';

const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url));
const mini = fx('mini.apk');

describe('lecture d’un APK', () => {
  it('lit identifiant, numéro et nom de version dans le manifeste binaire', () => {
    expect(readApk(mini)).toEqual({ packageName: APP_PACKAGE, versionCode: 80, versionName: '1.80.0' });
  });
  it('refuse tout ce qui n’est pas un APK', () => {
    expect(readApk(Buffer.from('pas un apk du tout'.repeat(20)))).toBeNull();
    expect(readApk(Buffer.alloc(500))).toBeNull();
    expect(readApk(mini.subarray(0, 4000))).toBeNull();
  });
  it('signataire : lu dans le bloc de signature v2 ; absent ou différent = refusé', () => {
    expect(readApkSigner(mini)).toBe(expectedSigner());
    expect(readApkSigner(fx('mini-unsigned.apk'))).toBeNull();
    const other = readApkSigner(fx('mini-bad-signer.apk'));
    expect(other).toMatch(/^[0-9a-f]{64}$/);
    expect(other).not.toBe(expectedSigner());
    expect(readApkSigner(Buffer.from('rien'.repeat(100)))).toBeNull();
  });
});
