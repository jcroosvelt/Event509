import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_PACKAGE, readApk } from './_lib/apprelease.js';

const mini = readFileSync(new URL('./fixtures/mini.apk', import.meta.url));

describe('lecture d’un APK', () => {
  it('lit identifiant, numéro et nom de version dans le manifeste binaire', () => {
    expect(readApk(mini)).toEqual({ packageName: APP_PACKAGE, versionCode: 76, versionName: '1.76.0' });
  });
  it('refuse tout ce qui n’est pas un APK', () => {
    expect(readApk(Buffer.from('pas un apk du tout'.repeat(20)))).toBeNull();
    expect(readApk(Buffer.alloc(500))).toBeNull();
    expect(readApk(mini.subarray(0, 4000))).toBeNull();
  });
});
