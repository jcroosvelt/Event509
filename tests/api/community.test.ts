import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Vie de la communauté : fil d'actualité, photos, « Je participe », liste d'attente, signalements, blocages. */
const DB = process.env.TEST_DATABASE_URL;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const png = (n = 0) => Buffer.concat([PNG, Buffer.from([n])]).toString('base64');

describe.skipIf(!DB)('Communauté', () => {
  let pool: pg.Pool;
  let handle: typeof import('../../api/_lib/handler.js').handle;
  let signToken: typeof import('../../api/_lib/auth.js').signToken;
  let community: typeof import('../../api/_lib/community.js');
  const tag = `cm${Date.now()}`;
  let ipN = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Out = { status: number; body: any };
  const call = async (method: string, path: string, body?: unknown, token?: string, query: Record<string, string> = {}): Promise<Out> => {
    const o = (await handle({ method, path, query, body, authorization: token ? `Bearer ${token}` : undefined, ip: `10.3.${Math.floor(ipN / 250) % 250}.${(ipN++ % 250) + 1}` })) as Out;
    return o.status === 204 ? { ...o, status: 200 } : o;
  };
  async function account(n: string, opts: { role?: 'participant' | 'admin'; org?: boolean; name?: string } = {}) {
    const id = `u_${tag}${n}`;
    const email = `${id}@comm.test`;
    await pool.query(`insert into users (id, email, password_hash, role, data, auth_complete) values ($1,$2,'x',$3,$4, true)`, [id, email, opts.role ?? 'participant', JSON.stringify({ name: opts.name ?? `Prénom${n} Nom${n}` })]);
    const token = signToken(id);
    let orgId = '';
    if (opts.org) {
      const o = await call('POST', '/auth/organizer', { orgName: `Org ${tag}${n}`, country: 'HT' }, token);
      expect(o.status, JSON.stringify(o.body)).toBe(200);
      orgId = o.body.organizerId;
      await pool.query(`update organizers set data = data || '{"verified": true}'::jsonb where id = $1`, [orgId]);
    }
    return { id, token, orgId, email };
  }
  const event = (over: Record<string, unknown> = {}, quota = 50) => ({
    title: `Fête ${tag}`, description: 'Description assez longue', start: '2030-06-01T20:00:00', end: '2030-06-01T23:00:00', currency: 'HTG', status: 'published', seated: false, maxPerPerson: 8,
    venue: { name: 'Salle', address: 'Rue 1', city: 'Port-au-Prince', country: 'HT' }, categories: ['music'], images: [], tags: [],
    tickets: [{ id: 't1', name: 'Entrée', kind: 'free', price: 0, quota, sold: 0, salesStart: '2026-01-01T00:00:00', salesEnd: '2030-06-01T20:00:00', maxPerOrder: 4 }], ...over,
  });
  const makePast = (eventId: string) => pool.query(`update events set start_at = '2020-01-01', data = jsonb_set(jsonb_set(data, '{start}', '"2020-01-01T10:00:00"'), '{end}', '"2020-01-01T12:00:00"') where id = $1`, [eventId]);
  const giveTicket = (eventId: string, email: string, n: string) =>
    pool.query(`insert into tickets (id, code, event_id, order_id, owner_email, status, data) values ($1,$2,$3,null,$4,'valid', jsonb_build_object('amount', 0))`, [`it_${tag}${n}`, `C${tag}${n}`, eventId, email]);
  const setSold = (eventId: string, sold: number) => pool.query(`update events set data = jsonb_set(data, '{tickets,0,sold}', to_jsonb($2::int)) where id = $1`, [eventId, sold]);

  beforeAll(async () => {
    process.env.DATABASE_URL = DB;
    process.env.JWT_SECRET = 'q'.repeat(40);
    delete process.env.VERCEL_ENV;
    pool = new pg.Pool({ connectionString: DB });
    ({ handle } = await import('../../api/_lib/handler.js'));
    ({ signToken } = await import('../../api/_lib/auth.js'));
    community = await import('../../api/_lib/community.js');
  });
  afterAll(async () => {
    await pool?.query(`delete from files where user_id like 'u_${tag}%'`);
    await pool?.query(`delete from tickets where owner_email like '%@comm.test'`);
    await pool?.query(`delete from users where email like '%@comm.test'`);
    await pool?.end();
  });

  it('« Je participe » : compte requis, nom court et photo seulement, compteur, retrait, événement terminé refusé', async () => {
    const org = await account('o1', { org: true });
    const a = await account('g1', { name: 'Marie Joseph' });
    const b = await account('g2', { name: 'Jean Baptiste' });
    await pool.query(`update users set data = data || '{"avatarUrl": "/api/files/f_photo123"}' where id = $1`, [a.id]);
    const ev = await call('PUT', '/org/events', event(), org.token);
    expect(ev.status, JSON.stringify(ev.body)).toBe(200);
    const p = `/events/${ev.body.id}/going`;
    expect((await call('GET', p)).body).toMatchObject({ count: 0, me: false, people: [] });
    expect((await call('POST', p)).status).toBe(401);
    expect((await call('POST', p, {}, a.token)).body).toMatchObject({ count: 1, me: true });
    expect((await call('POST', p, {}, a.token)).body.count).toBe(1); // idempotent
    await call('POST', p, {}, b.token);
    const state = await call('GET', p, undefined, a.token);
    expect(state.body.count).toBe(2);
    expect(state.body.people.map((x: { name: string }) => x.name).sort()).toEqual(['Jean B.', 'Marie J.']);
    expect(state.body.people.find((x: { name: string }) => x.name === 'Marie J.').avatarUrl).toBe('/api/files/f_photo123');
    expect(JSON.stringify(state.body)).not.toContain('@comm.test');
    expect((await call('DELETE', p, undefined, b.token)).body).toMatchObject({ count: 1, me: false });
    await makePast(ev.body.id);
    expect((await call('POST', p, {}, b.token)).status).toBe(409); // terminé
  });

  it('photos : seulement après l’événement et pour les détenteurs d’un billet ; liste publique ; suppression par auteur, équipe, administration', async () => {
    const org = await account('o2', { org: true });
    const holder = await account('h1', { name: 'Paul Pierre' });
    const other = await account('h2');
    const adm = await account('ad', { role: 'admin' });
    const ev = await call('PUT', '/org/events', event(), org.token);
    const p = `/events/${ev.body.id}/photos`;
    await giveTicket(ev.body.id, holder.email, 'a');
    // Avant la fin : refusé
    expect((await call('POST', p, { data: png(1), name: 'a.png' }, holder.token)).status).toBe(409);
    await makePast(ev.body.id);
    expect((await call('POST', p, { data: png(1), name: 'a.png' })).status).toBe(401);
    expect((await call('POST', p, { data: png(1), name: 'a.png' }, other.token)).status).toBe(403); // pas de billet
    expect((await call('POST', p, { data: Buffer.from('<svg onload=alert(1)/>' + 'x'.repeat(40)).toString('base64'), name: 'a.svg' }, holder.token)).status).toBe(422);
    const up = await call('POST', p, { data: png(1), name: 'fete.png', caption: 'Quelle soirée <b>!</b>' }, holder.token);
    expect(up.status, JSON.stringify(up.body)).toBe(200);
    expect(up.body.author.name).toBe('Paul P.');
    expect(up.body.url).toMatch(/^\/api\/files\/f_/);
    // Liste publique : tout le monde voit, seuls les détenteurs peuvent ajouter
    const pub = await call('GET', p);
    expect(pub.body).toMatchObject({ total: 1, ended: true, canAdd: false });
    expect((await call('GET', p, undefined, holder.token)).body.canAdd).toBe(true);
    expect((await call('GET', p, undefined, other.token)).body.canAdd).toBe(false);
    expect((await call('GET', p, undefined, org.token)).body.canAdd).toBe(true); // l'équipe aussi
    expect((await call('GET', up.body.url.replace('/api', ''))).status).toBe(200); // l'image est lisible
    expect(JSON.stringify(pub.body)).not.toContain('@comm.test');
    // Suppression : un autre membre ne peut pas
    expect((await call('DELETE', `/photos/${up.body.id}`, undefined, other.token)).status).toBe(404);
    expect((await call('DELETE', `/photos/${up.body.id}`, undefined, holder.token)).status).toBe(200);
    expect((await call('GET', up.body.url.replace('/api', ''))).status).toBe(404); // fichier supprimé aussi
    const again = await call('POST', p, { data: png(2), name: 'b.png' }, holder.token);
    expect((await call('DELETE', `/photos/${again.body.id}`, undefined, org.token)).status).toBe(200); // équipe
    const third = await call('POST', p, { data: png(3), name: 'c.png' }, holder.token);
    expect((await call('DELETE', `/photos/${third.body.id}`, undefined, adm.token)).status).toBe(200); // administration
    // Limite par personne
    for (let i = 0; i < 12; i++) expect((await call('POST', p, { data: png(10 + i), name: 'x.png' }, holder.token)).status, String(i)).toBe(200);
    expect((await call('POST', p, { data: png(99), name: 'x.png' }, holder.token)).status).toBe(429);
  });

  it('signalements : 3 personnes différentes masquent un commentaire ou une photo ; l’administration tranche ; message : contexte limité', async () => {
    const org = await account('o3', { org: true });
    const author = await account('r0', { name: 'Auteur Test' });
    const r = await Promise.all([1, 2, 3].map((i) => account(`r${i}`)));
    const adm = await account('ad3', { role: 'admin' });
    const ev = await call('PUT', '/org/events', event(), org.token);
    await giveTicket(ev.body.id, author.email, 'r');
    const cm = await call('POST', `/events/${ev.body.id}/comments`, { body: 'Contenu douteux' }, author.token);
    expect(cm.status, JSON.stringify(cm.body)).toBe(200);
    // Validation
    expect((await call('POST', '/reports/content', { kind: 'comment', targetId: cm.body.id, reason: 'spam' })).status).toBe(401);
    expect((await call('POST', '/reports/content', { kind: 'comment', targetId: cm.body.id, reason: 'xx' }, r[0]!.token)).status).toBe(422);
    expect((await call('POST', '/reports/content', { kind: 'comment', targetId: 'cm_inconnu', reason: 'spam' }, r[0]!.token)).status).toBe(404);
    expect((await call('POST', '/reports/content', { kind: 'comment', targetId: cm.body.id, reason: 'spam' }, author.token)).status).toBe(409); // le sien
    // Doublon : sans effet de plus
    await call('POST', '/reports/content', { kind: 'comment', targetId: cm.body.id, reason: 'spam' }, r[0]!.token);
    await call('POST', '/reports/content', { kind: 'comment', targetId: cm.body.id, reason: 'spam' }, r[0]!.token);
    await call('POST', '/reports/content', { kind: 'comment', targetId: cm.body.id, reason: 'abuse', note: 'insultes' }, r[1]!.token);
    expect((await call('GET', `/events/${ev.body.id}/comments`)).body.total).toBe(1); // 2 signalements : toujours visible
    await call('POST', '/reports/content', { kind: 'comment', targetId: cm.body.id, reason: 'abuse' }, r[2]!.token);
    expect((await call('GET', `/events/${ev.body.id}/comments`)).body.total).toBe(0); // 3 : masqué
    // Administration : liste réservée, décision
    expect((await call('GET', '/admin/content-reports', undefined, r[0]!.token)).status).toBe(403);
    const list = await call('GET', '/admin/content-reports', undefined, adm.token);
    expect(list.status).toBe(200);
    const mine = list.body.filter((x: { targetId: string }) => x.targetId === cm.body.id);
    expect(mine.length).toBe(3);
    expect(mine[0]).toMatchObject({ kind: 'comment', reports: 3, snapshot: { text: 'Contenu douteux' } });
    expect((await call('POST', `/admin/content-reports/${mine[0].id}`, { action: 'dismiss' }, r[0]!.token)).status).toBe(403);
    expect((await call('POST', `/admin/content-reports/${mine[0].id}`, { action: 'dismiss' }, adm.token)).status).toBe(200);
    expect((await call('GET', `/events/${ev.body.id}/comments`)).body.total).toBe(1); // rétabli
    // Photo : suppression décidée par l'administration
    await makePast(ev.body.id);
    const ph = await call('POST', `/events/${ev.body.id}/photos`, { data: png(5), name: 'p.png' }, author.token);
    expect(ph.status, JSON.stringify(ph.body)).toBe(200);
    await call('POST', '/reports/content', { kind: 'photo', targetId: ph.body.id, reason: 'inappropriate' }, r[0]!.token);
    const l2 = (await call('GET', '/admin/content-reports', undefined, adm.token)).body.find((x: { targetId: string }) => x.targetId === ph.body.id);
    expect(l2.snapshot.url).toBe(ph.body.url);
    expect((await call('POST', `/admin/content-reports/${l2.id}`, { action: 'remove' }, adm.token)).status).toBe(200);
    expect((await call('GET', ph.body.url.replace('/api', ''))).status).toBe(404);
    expect((await call('GET', '/admin/content-reports', undefined, adm.token, { status: 'removed' })).body.some((x: { id: string }) => x.id === l2.id)).toBe(true);
    // Message : seules les deux parties signalent ; le contexte transmis est limité
    const buyer = await account('m1', { name: 'Jean Baptiste' });
    const stranger = await account('m2');
    const m = await call('POST', '/messages', { organizerId: org.orgId, body: 'Message insultant' }, buyer.token);
    const th = await call('GET', `/me/conversations/${m.body.id}`, undefined, buyer.token);
    await call('POST', `/org/conversations/${m.body.id}/messages`, { body: 'Réponse' }, org.token);
    const orgTh = await call('GET', `/org/conversations/${m.body.id}`, undefined, org.token);
    const bad = orgTh.body.messages[0];
    expect((await call('POST', '/reports/content', { kind: 'message', targetId: bad.id, reason: 'abuse' }, stranger.token)).status).toBe(404);
    expect((await call('POST', '/reports/content', { kind: 'message', targetId: bad.id, reason: 'abuse' }, buyer.token)).status).toBe(409); // le sien
    expect((await call('POST', '/reports/content', { kind: 'message', targetId: bad.id, reason: 'abuse' }, org.token)).status).toBe(200); // l'équipe
    void th;
    const rep = (await call('GET', '/admin/content-reports', undefined, adm.token)).body.find((x: { targetId: string }) => x.targetId === bad.id);
    expect(rep.snapshot.messages.map((x: { text: string }) => x.text)).toEqual(['Message insultant']);
    expect(JSON.stringify(rep)).not.toContain('@comm.test');
  });

  it('blocages : un membre bloqué disparaît de la vue du bloqueur ; l’organisation peut fermer sa messagerie à quelqu’un', async () => {
    const org = await account('o4', { org: true });
    const a = await account('b1', { name: 'Alice Durand' });
    const bad = await account('b2', { name: 'Boris Mauvais' });
    const ev = await call('PUT', '/org/events', event(), org.token);
    const path = `/events/${ev.body.id}/comments`;
    const c1 = await call('POST', path, { body: 'Texte de Boris' }, bad.token);
    expect((await call('GET', path, undefined, a.token)).body.total).toBe(1);
    expect((await call('POST', `/comments/${c1.body.id}/block`)).status).toBe(401);
    expect((await call('POST', `/comments/${c1.body.id}/block`, {}, bad.token)).status).toBe(409); // soi-même
    const blk = await call('POST', `/comments/${c1.body.id}/block`, {}, a.token);
    expect(blk.body).toMatchObject({ blocked: true, name: 'Boris M.' });
    expect((await call('GET', path, undefined, a.token)).body.items).toHaveLength(0); // invisible pour Alice
    expect((await call('GET', path, undefined, org.token)).body.items).toHaveLength(1); // visible pour les autres
    const list = await call('GET', '/me/blocks', undefined, a.token);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].name).toBe('Boris M.');
    expect(JSON.stringify(list.body)).not.toContain('u_'); // jamais d'identifiant de compte
    expect((await call('DELETE', `/me/blocks/${list.body[0].id}`, undefined, bad.token)).status).toBe(200); // sans effet pour un autre compte
    expect((await call('GET', '/me/blocks', undefined, a.token)).body).toHaveLength(1);
    await call('DELETE', `/me/blocks/${list.body[0].id}`, undefined, a.token);
    expect((await call('GET', path, undefined, a.token)).body.items).toHaveLength(1); // rétabli
    // « Je participe » : un bloqué n'apparaît plus dans la liste du bloqueur
    await call('POST', `/events/${ev.body.id}/going`, {}, bad.token);
    expect((await call('GET', `/events/${ev.body.id}/going`, undefined, a.token)).body.people).toHaveLength(1);
    await call('POST', `/comments/${c1.body.id}/block`, {}, a.token);
    expect((await call('GET', `/events/${ev.body.id}/going`, undefined, a.token)).body.people).toHaveLength(0);
    // Organisation : fermer la messagerie à une personne
    const m = await call('POST', '/messages', { organizerId: org.orgId, body: 'Bonjour' }, bad.token);
    expect(m.status, JSON.stringify(m.body)).toBe(200);
    expect((await call('POST', `/org/conversations/${m.body.id}/block`, { on: true }, a.token)).status).toBe(403); // pas de l'équipe
    expect((await call('POST', `/org/conversations/${m.body.id}/block`, { on: true }, org.token)).body.blocked).toBe(true);
    expect((await call('GET', '/org/conversations', undefined, org.token)).body[0].blocked).toBe(true);
    expect((await call('POST', '/messages', { organizerId: org.orgId, body: 'Encore' }, bad.token)).status).toBe(403);
    expect((await call('POST', `/me/conversations/${m.body.id}/messages`, { body: 'Encore' }, bad.token)).status).toBe(403);
    await call('POST', `/org/conversations/${m.body.id}/block`, { on: false }, org.token);
    expect((await call('POST', `/me/conversations/${m.body.id}/messages`, { body: 'Merci' }, bad.token)).status).toBe(200);
  });

  it('liste d’attente : seulement quand c’est complet, prévenue dans l’ordre quand des places se libèrent, retirée à l’achat', async () => {
    const org = await account('o5', { org: true });
    const a = await account('w1');
    const b = await account('w2');
    const c3 = await account('w3');
    const ev = await call('PUT', '/org/events', event({}, 2), org.token);
    const p = `/events/${ev.body.id}/waitlist`;
    expect((await call('POST', p, { ticketTypeId: 't1', qty: 1 })).status).toBe(401);
    expect((await call('POST', p, { ticketTypeId: 't1', qty: 1 }, a.token)).status).toBe(409); // des places restent
    await setSold(ev.body.id, 2);
    expect((await call('POST', p, { ticketTypeId: 'zz', qty: 1 }, a.token)).status).toBe(422);
    const ja = await call('POST', p, { ticketTypeId: 't1', qty: 1 }, a.token);
    expect(ja.body).toMatchObject({ ticketTypeId: 't1', qty: 1, position: 1 });
    expect((await call('POST', p, { ticketTypeId: 't1', qty: 2 }, b.token)).body.position).toBe(2);
    expect((await call('POST', p, { ticketTypeId: 't1', qty: 1 }, c3.token)).body.position).toBe(3);
    expect((await call('POST', p, { ticketTypeId: 't1', qty: 1 }, a.token)).body.position).toBe(1); // idempotent
    expect((await call('GET', p, undefined, a.token)).body).toEqual([{ ticketTypeId: 't1', qty: 1 }]);
    // Rien de libre : personne n'est prévenu
    expect(await community.notifyWaitlist(ev.body.id)).toBe(0);
    // 2 places se libèrent : a (1 place) puis b (2 places ne tient plus) puis c (1 place)
    await setSold(ev.body.id, 0);
    expect(await community.notifyWaitlist(ev.body.id)).toBe(2);
    const notified = (await pool.query(`select user_id from waitlist where event_id = $1 and notified_at is not null order by created_at`, [ev.body.id])).rows.map((r) => r.user_id);
    expect(notified).toEqual([a.id, c3.id]); // a (1 place), b (2) ne tient plus, c (1 place) : jamais plus de personnes que de places
    expect(await community.notifyWaitlist(ev.body.id)).toBe(0); // pas deux fois en 24 h
    // b quitte la liste ; c achète son billet : il sort de la liste
    expect((await call('DELETE', p, undefined, b.token, { ticketTypeId: 't1' })).status).toBe(200);
    expect((await call('GET', p, undefined, b.token)).body).toEqual([]);
    const order = await call('POST', '/orders', { eventId: ev.body.id, items: [{ ticketTypeId: 't1', qty: 1 }], method: 'card', currency: 'HTG', buyer: { name: 'Carl Test', email: c3.email } }, c3.token);
    expect(order.status, JSON.stringify(order.body)).toBe(200);
    expect((await call('GET', p, undefined, c3.token)).body).toEqual([]);
    expect((await call('GET', p, undefined, a.token)).body).toHaveLength(1);
    // Le balayage quotidien reprend les listes encore en attente (a a déjà été prévenue < 24 h : rien de plus)
    expect(await community.sweepWaitlists()).toBe(0);
  });

  it('fil d’actualité : événements et photos des seuls organisateurs suivis, jamais les événements privés', async () => {
    const orgA = await account('o6', { org: true });
    const orgB = await account('o7', { org: true });
    const fan = await account('f9', { name: 'Fan Test' });
    const evA = await call('PUT', '/org/events', event({ title: `Concert A ${tag}` }), orgA.token);
    const evB = await call('PUT', '/org/events', event({ title: `Concert B ${tag}` }), orgB.token);
    const priv = await call('PUT', '/org/events', event({ title: `Privé A ${tag}`, private: true }), orgA.token);
    expect([evA.status, evB.status, priv.status]).toEqual([200, 200, 200]);
    expect((await call('GET', '/me/feed')).status).toBe(401);
    expect((await call('GET', '/me/feed', undefined, fan.token)).body.items).toEqual([]); // personne suivi : rien
    await call('POST', `/orgs/${orgA.orgId}/follow`, {}, fan.token);
    const feed = await call('GET', '/me/feed', undefined, fan.token);
    expect(feed.status, JSON.stringify(feed.body)).toBe(200);
    const titles = feed.body.items.filter((i: { type: string }) => i.type === 'event').map((i: { event: { title: string } }) => i.event.title);
    expect(titles).toEqual([`Concert A ${tag}`]); // ni B (non suivi) ni l'événement privé
    // Photos d'un événement passé de l'organisation suivie
    await giveTicket(evA.body.id, fan.email, 'f');
    await makePast(evA.body.id);
    await call('POST', `/events/${evA.body.id}/photos`, { data: png(7), name: 'f.png' }, fan.token);
    const f2 = await call('GET', '/me/feed', undefined, fan.token);
    const ph = f2.body.items.find((i: { type: string }) => i.type === 'photos');
    expect(ph).toMatchObject({ count: 1, event: { id: evA.body.id } });
    expect(ph.thumbs[0]).toMatch(/^\/api\/files\/f_/);
    // Une personne bloquée n'apparaît plus dans le fil du bloqueur
    const viewer = await account('f10');
    await call('POST', `/orgs/${orgA.orgId}/follow`, {}, viewer.token);
    expect((await call('GET', '/me/feed', undefined, viewer.token)).body.items.some((i: { type: string }) => i.type === 'photos')).toBe(true);
    const cm = await call('POST', `/events/${evA.body.id}/comments`, { body: 'x' }, fan.token);
    await call('POST', `/comments/${cm.body.id}/block`, {}, viewer.token);
    expect((await call('GET', '/me/feed', undefined, viewer.token)).body.items.some((i: { type: string }) => i.type === 'photos')).toBe(false);
    // Les événements retirés de la publication ne sont plus montrés
    await pool.query(`update events set status = 'cancelled', data = jsonb_set(data, '{status}', '"cancelled"') where id = $1`, [evA.body.id]);
    expect((await call('GET', '/me/feed', undefined, fan.token)).body.items.some((i: { type: string }) => i.type === 'event')).toBe(false);
  });
});
