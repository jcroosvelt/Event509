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
    const c = await call('POST', `/events/${id}/comments`, { body: 'Super !', style: 'neon', media: [{ fileId: f.body.fileId }, { kind: 'sticker', sticker: '🔥' }] }, b.token);
    expect(c.status, JSON.stringify(c.body)).toBe(200);
    expect(c.body.media).toHaveLength(2);
    expect(c.body.style).toBe('plain'); // pas d'effet de texte dans les commentaires
    expect(c.body.media[0]).toMatchObject({ kind: 'image' });
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
    // réponse à un commentaire, puis à la réponse (rattachée au commentaire principal) ; j'aime sur un commentaire et sur une réponse
    const r1 = await call('POST', `/events/${id}/comments`, { body: 'Merci Prénomb', parentId: c.body.id }, o.token);
    expect(r1.status, JSON.stringify(r1.body)).toBe(200);
    const r2 = await call('POST', `/events/${id}/comments`, { body: 'Avec plaisir', parentId: r1.body.id }, b.token);
    expect(r2.body.parentId).toBe(c.body.id);
    expect((await call('POST', `/comments/${c.body.id}/like`, {}, other.token)).body).toEqual({ liked: true, likes: 1 });
    expect((await call('POST', `/comments/${c.body.id}/like`, {}, other.token)).body).toEqual({ liked: true, likes: 1 });
    expect((await call('POST', `/comments/${r1.body.id}/like`, {}, b.token)).body.likes).toBe(1);
    expect((await call('POST', `/comments/${c.body.id}/like`, {})).status).toBe(401);
    const th = await call('GET', `/events/${id}/comments`, undefined, other.token);
    const top = th.body.items.find((i: { id: string }) => i.id === c.body.id);
    expect(top).toMatchObject({ likes: 1, liked: true });
    expect(top.replies.map((r: { body: string }) => r.body)).toEqual(['Merci Prénomb', 'Avec plaisir']);
    expect((await call('DELETE', `/comments/${c.body.id}/like`, undefined, other.token)).body).toEqual({ liked: false, likes: 0 });
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

  it('publications : seules les organisations publient ; les membres aiment et commentent ; fil, modération', async () => {
    const o = await orgAccount('p');
    const m = await account('m');
    const fan = await account('f');
    const ev = await call('PUT', '/org/events', event(), o.token);
    const id = ev.body.id as string;
    await call('POST', `/orgs/${o.orgId}/follow`, {}, fan.token);
    const f = await up(o.token, MP4(100));
    const p = await call('POST', '/posts', { body: 'Nouvelle vidéo', eventId: id, media: [{ fileId: f.body.fileId, duration: 12 }] }, o.token);
    expect(p.status, JSON.stringify(p.body)).toBe(200);
    expect(p.body.author.isOrganizer).toBe(true);
    expect(p.body.media[0]).toMatchObject({ kind: 'video', duration: 12 });
    expect(p.body).toMatchObject({ likes: 0, commentCount: 0, liked: false });
    // un membre ne peut pas publier (ni en son nom, ni à propos d'un événement)
    expect((await call('POST', '/posts', { body: 'salut', eventId: id }, m.token)).status).toBeGreaterThanOrEqual(400);
    expect((await call('POST', '/posts', { body: 'salut', asOrganizer: true }, m.token)).status).toBeGreaterThanOrEqual(400);
    expect((await call('POST', '/posts', {}, o.token)).status).toBe(422);
    const t = await call('POST', '/posts', { body: 'Soirée ce samedi', style: 'sunset' }, o.token);
    expect(t.body.style).toBe('sunset');
    // fil de l'abonné
    const feed = await call('GET', '/me/feed', undefined, fan.token);
    expect(feed.status, JSON.stringify(feed.body)).toBe(200);
    expect(feed.body.items.filter((i: { type: string }) => i.type === 'post')).toHaveLength(2);
    // j'aime : une fois par personne, retirable
    expect((await call('POST', `/posts/${p.body.id}/like`, {}, fan.token)).body).toEqual({ liked: true, likes: 1 });
    expect((await call('POST', `/posts/${p.body.id}/like`, {}, fan.token)).body).toEqual({ liked: true, likes: 1 });
    expect((await call('POST', `/posts/${p.body.id}/like`, {}, m.token)).body.likes).toBe(2);
    const feedL = await call('GET', '/me/feed', undefined, fan.token);
    expect(feedL.body.items.find((i: { post?: { id: string } }) => i.post?.id === p.body.id).post).toMatchObject({ likes: 2, liked: true });
    expect((await call('DELETE', `/posts/${p.body.id}/like`, undefined, fan.token)).body).toEqual({ liked: false, likes: 1 });
    expect((await call('POST', `/posts/${p.body.id}/like`, {})).status).toBe(401);
    expect(p.body.rating).toBeUndefined(); // les notes concernent les événements, pas les publications
    // commentaires de membres : texte, autocollant, photo
    const fm = await up(m.token, PNG);
    const c1 = await call('POST', `/posts/${p.body.id}/comments`, { body: 'Hâte !', media: [{ fileId: fm.body.fileId }, { kind: 'sticker', sticker: '🔥' }] }, m.token);
    expect(c1.status, JSON.stringify(c1.body)).toBe(200);
    expect(c1.body.media).toHaveLength(2);
    expect((await call('POST', `/posts/${p.body.id}/comments`, {}, m.token)).status).toBe(422);
    const cl = await call('GET', `/posts/${p.body.id}/comments`, undefined, fan.token);
    expect(cl.body.total).toBe(1);
    expect(cl.body.items[0].author.name).toMatch(/^Prénom\w+ N\.$/);
    // page publique de l'organisation
    expect((await call('GET', `/organizers/${o.orgId}/posts`)).body.items).toHaveLength(2);
    // réponses (comme sur Facebook) : à un commentaire, puis à une réponse (rattachée au commentaire principal) ; j'aime sur chaque commentaire
    const rep = await call('POST', `/posts/${p.body.id}/comments`, { body: 'Merci !', parentId: c1.body.id }, o.token);
    expect(rep.status, JSON.stringify(rep.body)).toBe(200);
    expect(rep.body.parentId).toBe(c1.body.id);
    expect(rep.body.author.isOrganizer).toBe(true);
    const rep2 = await call('POST', `/posts/${p.body.id}/comments`, { body: 'Avec plaisir', parentId: rep.body.id }, fan.token);
    expect(rep2.body.parentId).toBe(c1.body.id);
    expect((await call('POST', `/post-comments/${c1.body.id}/like`, {}, fan.token)).body).toEqual({ liked: true, likes: 1 });
    expect((await call('POST', `/post-comments/${c1.body.id}/like`, {}, fan.token)).body).toEqual({ liked: true, likes: 1 });
    expect((await call('POST', `/post-comments/${rep.body.id}/like`, {}, m.token)).body.likes).toBe(1);
    expect((await call('POST', `/post-comments/${c1.body.id}/like`, {})).status).toBe(401);
    const thread = await call('GET', `/posts/${p.body.id}/comments`, undefined, fan.token);
    expect(thread.body.items[0]).toMatchObject({ likes: 1, liked: true });
    expect(thread.body.items[0].replies.map((r: { body: string }) => r.body)).toEqual(['Merci !', 'Avec plaisir']);
    expect((await call('DELETE', `/post-comments/${c1.body.id}/like`, undefined, fan.token)).body).toEqual({ liked: false, likes: 0 });
    // signalement du commentaire par 3 personnes : masqué ; puis suppression par l'organisation
    for (const n of ['r1', 'r2', 'r3']) {
      const r = await account(n);
      expect((await call('POST', '/reports/content', { kind: 'pcomment', targetId: c1.body.id, reason: 'spam' }, r.token)).status).toBe(200);
    }
    expect((await call('GET', `/posts/${p.body.id}/comments`, undefined, fan.token)).body.items).toHaveLength(0);
    // signalement d'une publication par 3 personnes : masquée du fil
    for (const n of ['s1', 's2', 's3']) {
      const r = await account(n);
      expect((await call('POST', '/reports/content', { kind: 'post', targetId: t.body.id, reason: 'spam' }, r.token)).status).toBe(200);
    }
    expect((await call('GET', '/me/feed', undefined, fan.token)).body.items.filter((i: { type: string }) => i.type === 'post')).toHaveLength(1);
    // suppression : seule l'organisation ; fichiers supprimés aussi
    expect((await call('DELETE', `/posts/${p.body.id}`, undefined, m.token)).status).toBe(404);
    expect((await call('DELETE', `/posts/${p.body.id}`, undefined, o.token)).status).toBe(200);
    expect((await pool.query(`select 1 from files where id = $1`, [f.body.fileId])).rowCount).toBe(0);
  });

  it('note d’un événement en étoiles (1 à 5) : à tout moment, même avant l’événement, une note par compte, moyenne publique', async () => {
    const o = await orgAccount('e');
    const b = await account('rb');
    const other = await account('rc');
    const ev = await call('PUT', '/org/events', event(), o.token);
    const id = ev.body.id as string; // événement à venir : on peut déjà le noter
    expect((await call('GET', `/events/${id}/my-rating`, undefined, b.token)).body).toMatchObject({ canRate: true, rating: 0 });
    expect((await call('PUT', `/events/${id}/rating`, { rating: 5 })).status).toBe(401);
    for (const bad of [0, 6, 2.5, 'x']) expect((await call('PUT', `/events/${id}/rating`, { rating: bad }, b.token)).status).toBe(422);
    expect((await call('PUT', `/events/${id}/rating`, { rating: 4 }, b.token)).body).toMatchObject({ average: 4, count: 1, rating: 4 });
    // nouvelle note : remplace (une seule note par compte)
    expect((await call('PUT', `/events/${id}/rating`, { rating: 5, comment: 'Superbe' }, b.token)).body).toMatchObject({ average: 5, count: 1, rating: 5 });
    expect((await call('PUT', `/events/${id}/rating`, { rating: 2 }, other.token)).body).toMatchObject({ average: 3.5, count: 2, rating: 2 });
    expect((await call('GET', `/events/${id}/my-rating`, undefined, b.token)).body).toMatchObject({ rating: 5, comment: 'Superbe' });
    const list = await call('GET', `/events/${id}/reviews`);
    expect(list.body).toMatchObject({ average: 3.5, count: 2 });
    expect(list.body.items.map((i: { author: string }) => i.author)).toContain('Prénomrb N.');
    // un acheteur qui a déjà noté avec le lien de sa commande garde une seule note
    await pool.query(`insert into orders (id, event_id, user_id, buyer_email, status, data) values ($1,$2,$3,$4,'paid',$5)`, [`or_${tag}`, id, other.id, `${other.id}@media.test`, JSON.stringify({ buyerName: 'Paul P' })]);
    await pool.query(`update reviews set order_id = $2 where event_id = $1 and (data->>'rating')::int = 2`, [id, `or_${tag}`]);
    expect((await call('PUT', `/events/${id}/rating`, { rating: 3 }, other.token)).body).toMatchObject({ count: 2, rating: 3 });
    await pool.query(`delete from orders where id = $1`, [`or_${tag}`]);
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
