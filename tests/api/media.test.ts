import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Médias des commentaires et du fil : envoi en morceaux, filtres, autocollants, réglage des commentaires, publications. */
const DB = process.env.TEST_DATABASE_URL;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const MP4 = (n: number) => Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypmp42'), Buffer.alloc(n, 7)]);

describe.skipIf(!DB)('Médias et publications', () => {
  let pool: pg.Pool;
  let handle: typeof import('../../api/_lib/handler.js').handle;
  let signToken: typeof import('../../api/_lib/auth.js').signToken;
  const tag = `md${Date.now()}`;
  let ipN = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Out = { status: number; body: any };
  const call = async (method: string, path: string, body?: unknown, token?: string, query: Record<string, string> = {}): Promise<Out> => {
    const o = (await handle({ method, path, query, body, authorization: token ? `Bearer ${token}` : undefined, ip: `10.4.${Math.floor(ipN / 250) % 250}.${(ipN++ % 250) + 1}` })) as Out;
    return o.status === 204 ? { ...o, status: 200 } : o;
  };
  async function account(n: string) {
    const id = `u_${tag}${n}`;
    await pool.query(`insert into users (id, email, password_hash, role, data, auth_complete) values ($1,$2,'x','participant',$3, true)`, [id, `${id}@media.test`, JSON.stringify({ name: `Prénom${n} Nom${n}` })]);
    return { id, token: signToken(id) };
  }
  async function orgAccount(n: string) {
    const a = await account(n);
    const o = await call('POST', '/auth/organizer', { orgName: `Org ${tag}${n}`, country: 'HT' }, a.token);
    expect(o.status, JSON.stringify(o.body)).toBe(200);
    await pool.query(`update organizers set data = data || '{"verified": true}'::jsonb where id = $1`, [o.body.organizerId]);
    return { ...a, orgId: o.body.organizerId as string };
  }
  const event = (over: Record<string, unknown> = {}) => ({
    title: `Fête ${tag}`, description: 'Description assez longue', start: '2030-06-01T20:00:00', end: '2030-06-01T23:00:00', currency: 'HTG', status: 'published', seated: false, maxPerPerson: 8,
    venue: { name: 'Salle', address: 'Rue 1', city: 'Port-au-Prince', country: 'HT' }, categories: ['music'], images: [], tags: [],
    tickets: [{ id: 't1', name: 'Entrée', kind: 'free', price: 0, quota: 50, sold: 0, salesStart: '2026-01-01T00:00:00', salesEnd: '2030-06-01T20:00:00', maxPerOrder: 4 }], ...over,
  });
  const up = async (token: string, data: Buffer, name = 'a.bin') => {
    const id = `up${Math.random().toString(36).slice(2, 12)}`;
    const size = 3 * 1024 * 1024;
    const total = Math.max(1, Math.ceil(data.length / size));
    let last: Out | null = null;
    for (let i = 0; i < total; i++) last = await call('POST', '/media/upload', { uploadId: id, index: i, total, data: data.subarray(i * size, (i + 1) * size).toString('base64'), name }, token);
    return last!;
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = DB;
    process.env.JWT_SECRET = 'q'.repeat(40);
    delete process.env.VERCEL_ENV;
    pool = new pg.Pool({ connectionString: DB });
    ({ handle } = await import('../../api/_lib/handler.js'));
    ({ signToken } = await import('../../api/_lib/auth.js'));
  });
  afterAll(async () => {
    await pool?.query(`delete from files where user_id like 'u_${tag}%'`);
    await pool?.query(`delete from users where email like '%@media.test'`);
    await pool?.end();
  });

  it('envoi en morceaux : photo, vidéo de plus de 3 Mo ; type lu dans les octets ; refus des autres formats', async () => {
    const a = await account('a');
    const img = await up(a.token, PNG);
    expect(img.status, JSON.stringify(img.body)).toBe(200);
    expect(img.body).toMatchObject({ done: true, kind: 'image', mime: 'image/png' });
    const vid = await up(a.token, MP4(7 * 1024 * 1024));
    expect(vid.body).toMatchObject({ done: true, kind: 'video', mime: 'video/mp4' });
    expect((await up(a.token, Buffer.from('MZ' + 'x'.repeat(100)))).status).toBe(422);
    expect((await up(a.token, MP4(23 * 1024 * 1024))).status).toBe(413);
    expect((await call('POST', '/media/upload', { uploadId: 'abcdefgh1', index: 0, total: 1, data: PNG.toString('base64') })).status).toBe(401);
  });

  it('commentaire avec photo filtrée et autocollant ; réglage de l’organisateur ; plus de commentaire une fois désactivé', async () => {
    const o = await orgAccount('o');
    const b = await account('b');
    const ev = await call('PUT', '/org/events', event(), o.token);
    expect(ev.status, JSON.stringify(ev.body)).toBe(200);
    const id = ev.body.id as string;
    const f = await up(b.token, PNG);
    const c = await call('POST', `/events/${id}/comments`, { body: 'Super !', style: 'neon', media: [{ fileId: f.body.fileId, filter: 'sepia' }, { kind: 'sticker', sticker: '🔥' }] }, b.token);
    expect(c.status, JSON.stringify(c.body)).toBe(200);
    expect(c.body.media).toHaveLength(2);
    expect(c.body.media[0]).toMatchObject({ kind: 'image', filter: 'sepia' });
    expect(c.body.media[1]).toMatchObject({ kind: 'sticker', sticker: '🔥' });
    // même fichier réutilisé : refusé ; fichier d'un autre : introuvable
    expect((await call('POST', `/events/${id}/comments`, { body: 'x2', media: [{ fileId: f.body.fileId }] }, b.token)).status).toBe(409);
    const other = await account('c');
    const f2 = await up(other.token, PNG);
    expect((await call('POST', `/events/${id}/comments`, { body: 'x3', media: [{ fileId: f2.body.fileId }] }, b.token)).status).toBe(404);
    expect((await call('POST', `/events/${id}/comments`, { body: 'x4', media: [{ kind: 'sticker', sticker: '<script>' }] }, b.token)).status).toBe(422);
    // photo seule, sans texte
    const f3 = await up(b.token, Buffer.concat([PNG, Buffer.from([9])]));
    expect((await call('POST', `/events/${id}/comments`, { media: [{ fileId: f3.body.fileId }] }, b.token)).status).toBe(200);
    const list = await call('GET', `/events/${id}/comments`, undefined, b.token);
    expect(list.body.enabled).toBe(true);
    expect(list.body.items[1].media[0].url).toMatch(/^\/api\/files\//);
    // désactivation par l'organisateur
    const off = await call('PUT', '/org/events', { ...ev.body, commentsEnabled: false }, o.token);
    expect(off.status, JSON.stringify(off.body)).toBe(200);
    const list2 = await call('GET', `/events/${id}/comments`, undefined, b.token);
    expect(list2.body.enabled).toBe(false);
    expect((await call('POST', `/events/${id}/comments`, { body: 'encore' }, b.token)).status).toBe(409);
    // suppression : le fichier disparaît aussi
    const del = await call('DELETE', `/comments/${c.body.id}`, undefined, b.token);
    expect(del.status).toBe(200);
    expect((await pool.query(`select 1 from files where id = $1`, [f.body.fileId])).rowCount).toBe(0);
  });

  it('publications : organisation (abonnés), membre (événement obligatoire), fil, modération', async () => {
    const o = await orgAccount('p');
    const m = await account('m');
    const fan = await account('f');
    const ev = await call('PUT', '/org/events', event(), o.token);
    const id = ev.body.id as string;
    await call('POST', `/orgs/${o.orgId}/follow`, {}, fan.token);
    const f = await up(o.token, MP4(100));
    const p = await call('POST', '/posts', { asOrganizer: true, body: 'Nouvelle vidéo', media: [{ fileId: f.body.fileId, duration: 12 }] }, o.token);
    expect(p.status, JSON.stringify(p.body)).toBe(200);
    expect(p.body.author.isOrganizer).toBe(true);
    expect(p.body.media[0]).toMatchObject({ kind: 'video', duration: 12 });
    // un membre sans événement : refusé ; membre qui publie au nom d'une organisation : refusé
    expect((await call('POST', '/posts', { body: 'salut' }, m.token)).status).toBe(422);
    expect((await call('POST', '/posts', { body: 'salut', asOrganizer: true }, m.token)).status).toBeGreaterThanOrEqual(400);
    const mp = await call('POST', '/posts', { body: 'Belle soirée', style: 'sunset', eventId: id }, m.token);
    expect(mp.status, JSON.stringify(mp.body)).toBe(200);
    expect(mp.body.style).toBe('sunset');
    expect((await call('POST', '/posts', {}, m.token)).status).toBe(422);
    // fil de l'abonné : voit les deux publications
    const feed = await call('GET', '/me/feed', undefined, fan.token);
    expect(feed.status, JSON.stringify(feed.body)).toBe(200);
    const posts = feed.body.items.filter((i: { type: string }) => i.type === 'post');
    expect(posts).toHaveLength(2);
    // page publique de l'organisation
    const pub = await call('GET', `/organizers/${o.orgId}/posts`);
    expect(pub.body.items).toHaveLength(1);
    // signalement par 3 personnes : masqué ; l'administration peut supprimer
    for (const n of ['r1', 'r2', 'r3']) {
      const r = await account(n);
      expect((await call('POST', '/reports/content', { kind: 'post', targetId: mp.body.id, reason: 'spam' }, r.token)).status).toBe(200);
    }
    const feed2 = await call('GET', '/me/feed', undefined, fan.token);
    expect(feed2.body.items.filter((i: { type: string }) => i.type === 'post')).toHaveLength(1);
    // suppression par l'auteur
    expect((await call('DELETE', `/posts/${p.body.id}`, undefined, m.token)).status).toBe(404);
    expect((await call('DELETE', `/posts/${p.body.id}`, undefined, o.token)).status).toBe(200);
    expect((await pool.query(`select 1 from files where id = $1`, [f.body.fileId])).rowCount).toBe(0);
  });

  it('vidéo servie par morceaux (Range) sans dépasser la limite d’une réponse', async () => {
    const { streamPublicFile } = await import('../../api/_lib/filestream.js');
    const a = await account('v');
    const vid = await up(a.token, MP4(7 * 1024 * 1024));
    const headers: Record<string, string> = {};
    let status = 0;
    let sent: Buffer | null = null;
    const res = { setHeader: (k: string, v: string) => (headers[k] = v), status(s: number) { status = s; return this; }, send(b: Buffer) { sent = b; }, end() {} };
    const handled = await streamPublicFile({ headers: { range: 'bytes=100-' }, method: 'GET' } as never, res as never, vid.body.fileId);
    expect(handled).toBe(true);
    expect(status).toBe(206);
    expect(sent!.length).toBe(3 * 1024 * 1024);
    expect(headers['Content-Range']).toBe(`bytes 100-3145827/${MP4(7 * 1024 * 1024).length}`);
    // image ordinaire sans Range : route habituelle
    expect(await streamPublicFile({ headers: {}, method: 'GET' } as never, res as never, (await up(a.token, PNG)).body.fileId)).toBe(false);
  });
});
