import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Photo de profil : tout compte (participant, organisateur, administrateur) peut l'ajouter, la changer et la retirer. */
const DB = process.env.TEST_DATABASE_URL;

// PNG minimal valide (signature + en-tête) : suffit au contrôle du format côté serveur
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const png = (n = 0) => Buffer.concat([PNG, Buffer.from([n])]).toString('base64');

describe.skipIf(!DB)('Photo de profil', () => {
  let pool: pg.Pool;
  let handle: typeof import('./_lib/handler.js').handle;
  let signToken: typeof import('./_lib/auth.js').signToken;
  const tag = `av${Date.now()}`;
  let ipN = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Out = { status: number; body: any };
  const call = async (method: string, path: string, body?: unknown, token?: string): Promise<Out> => {
    const o = (await handle({ method, path, query: {}, body, authorization: token ? `Bearer ${token}` : undefined, ip: `10.8.${Math.floor(ipN / 250)}.${(ipN++ % 250) + 1}` })) as Out;
    return o.status === 204 ? { ...o, status: 200 } : o;
  };
  async function account(role: 'participant' | 'admin', n: string) {
    const id = `u_${tag}${n}`;
    await pool.query(`insert into users (id, email, password_hash, role, data, auth_complete) values ($1,$2,'x',$3,'{"name":"Personne Test"}', true)`, [id, `${id}@avatar.test`, role]);
    return { id, token: signToken(id) };
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = DB;
    process.env.JWT_SECRET = 'q'.repeat(40);
    delete process.env.VERCEL_ENV;
    pool = new pg.Pool({ connectionString: DB });
    ({ handle } = await import('./_lib/handler.js'));
    ({ signToken } = await import('./_lib/auth.js'));
  });
  afterAll(async () => {
    await pool?.query(`delete from files where user_id like 'u_${tag}%'`);
    await pool?.query(`delete from users where email like '%@avatar.test'`);
    await pool?.end();
  });

  it('participant, organisateur et administrateur : ajout, remplacement (une seule photo gardée), lecture publique, retrait', async () => {
    const part = await account('participant', 'p');
    const admin = await account('admin', 'a');
    const org = await account('participant', 'o');
    const o = await call('POST', '/auth/organizer', { orgName: `Org ${tag}`, country: 'HT' }, org.token);
    expect(o.status, JSON.stringify(o.body)).toBe(200);

    for (const who of [part, admin, org]) {
      const up = await call('POST', '/files', { kind: 'avatar', name: 'moi.png', data: png(1) }, who.token);
      expect(up.status, JSON.stringify(up.body)).toBe(200);
      expect((await call('GET', '/auth/me', undefined, who.token)).body.avatarUrl).toBe(up.body.url);
      // Lecture publique (les autres personnes voient la photo), type image, jamais exécutable
      const read = await call('GET', up.body.url.replace('/api', ''), undefined, undefined);
      expect(read.status).toBe(200);
      // Remplacement : l'ancien fichier est supprimé
      const up2 = await call('POST', '/files', { kind: 'avatar', name: 'moi2.png', data: png(2) }, who.token);
      expect(up2.status).toBe(200);
      expect(up2.body.url).not.toBe(up.body.url);
      expect((await pool.query(`select count(*)::int as n from files where user_id = $1 and kind = 'avatar'`, [who.id])).rows[0].n).toBe(1);
      expect((await call('GET', up.body.url.replace('/api', ''))).status).toBe(404);
      // Retrait
      const del = await call('PATCH', '/auth/me', { avatarUrl: '' }, who.token);
      expect(del.status, JSON.stringify(del.body)).toBe(200);
      expect(del.body.avatarUrl).toBeUndefined();
      expect((await pool.query(`select count(*)::int as n from files where user_id = $1 and kind = 'avatar'`, [who.id])).rows[0].n).toBe(0);
    }
  });

  it('refusé : sans compte, mauvais format, trop lourd, photo d’une autre personne, adresse externe', async () => {
    const a = await account('participant', 'x');
    const b = await account('participant', 'y');
    expect((await call('POST', '/files', { kind: 'avatar', name: 'a.png', data: png() })).status).toBe(401);
    expect((await call('POST', '/files', { kind: 'avatar', name: 'a.png', data: Buffer.from('<svg onload=alert(1)>'.repeat(5)).toString('base64') }, a.token)).status).toBe(422);
    expect((await call('POST', '/files', { kind: 'avatar', name: 'a.pdf', data: Buffer.from('%PDF-1.4 ' + 'x'.repeat(50)).toString('base64') }, a.token)).status).toBe(422);
    expect((await call('POST', '/files', { kind: 'avatar', name: 'gros.png', data: Buffer.concat([PNG, Buffer.alloc(2.1 * 1024 * 1024)]).toString('base64') }, a.token)).status).toBe(422);
    const mine = await call('POST', '/files', { kind: 'avatar', name: 'a.png', data: png(3) }, a.token);
    expect(mine.status).toBe(200);
    // b ne peut pas s'attribuer la photo de a, ni une adresse externe ou un script
    for (const bad of [mine.body.url, 'https://exemple.com/x.png', 'javascript:alert(1)', '/api/files/../../x'])
      expect((await call('PATCH', '/auth/me', { avatarUrl: bad }, b.token)).status, bad).toBe(422);
    expect((await call('GET', '/auth/me', undefined, b.token)).body.avatarUrl).toBeUndefined();
    expect((await pool.query(`select count(*)::int as n from files where user_id = $1`, [a.id])).rows[0].n).toBe(1);
  });
});
