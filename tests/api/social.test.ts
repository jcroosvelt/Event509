import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Réseau social : abonnements, commentaires, messages privés. */
const DB = process.env.TEST_DATABASE_URL;

describe.skipIf(!DB)('Réseau social', () => {
  let pool: pg.Pool;
  let handle: typeof import('../../api/_lib/handler.js').handle;
  let signToken: typeof import('../../api/_lib/auth.js').signToken;
  const tag = `so${Date.now()}`;
  let ipN = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Out = { status: number; body: any };
  const call = async (method: string, path: string, body?: unknown, token?: string, query: Record<string, string> = {}): Promise<Out> => {
    const o = (await handle({ method, path, query, body, authorization: token ? `Bearer ${token}` : undefined, ip: `10.5.${Math.floor(ipN / 250) % 250}.${(ipN++ % 250) + 1}` })) as Out;
    return o.status === 204 ? { ...o, status: 200 } : o;
  };
  async function account(n: string, opts: { role?: 'participant' | 'admin'; org?: boolean; name?: string } = {}) {
    const id = `u_${tag}${n}`;
    await pool.query(`insert into users (id, email, password_hash, role, data, auth_complete) values ($1,$2,'x',$3,$4, true)`, [id, `${id}@social.test`, opts.role ?? 'participant', JSON.stringify({ name: opts.name ?? `Prénom${n} Nom${n}` })]);
    const token = signToken(id);
    let orgId = '';
    if (opts.org) {
      const o = await call('POST', '/auth/organizer', { orgName: `Org ${tag}${n}`, country: 'HT' }, token);
      expect(o.status, JSON.stringify(o.body)).toBe(200);
      orgId = o.body.organizerId;
      await pool.query(`update organizers set data = data || '{"verified": true}'::jsonb where id = $1`, [orgId]);
    }
    return { id, token, orgId, email: `${id}@social.test` };
  }
  const event = (over: Record<string, unknown> = {}) => ({
    title: `Concert ${tag}`, description: 'Description assez longue', start: '2030-06-01T20:00:00', end: '2030-06-01T23:00:00', currency: 'HTG', status: 'published', seated: false, maxPerPerson: 8,
    venue: { name: 'Salle', address: 'Rue 1', city: 'Port-au-Prince', country: 'HT' }, categories: ['music'], images: [], tags: [],
    tickets: [{ id: 't1', name: 'Entrée', kind: 'free', price: 0, quota: 50, sold: 0, salesStart: '2026-01-01T00:00:00', salesEnd: '2030-06-01T20:00:00', maxPerOrder: 4 }], ...over,
  });

  beforeAll(async () => {
    process.env.DATABASE_URL = DB;
    process.env.JWT_SECRET = 'q'.repeat(40);
    delete process.env.VERCEL_ENV;
    pool = new pg.Pool({ connectionString: DB });
    ({ handle } = await import('../../api/_lib/handler.js'));
    ({ signToken } = await import('../../api/_lib/auth.js'));
  });
  afterAll(async () => {
    await pool?.query(`delete from users where email like '%@social.test'`);
    await pool?.end();
  });

  it('abonnements : compte requis, idempotent, compteur réel, pas à sa propre organisation', async () => {
    const org = await account('o1', { org: true });
    const fan = await account('f1');
    const fan2 = await account('f2');
    expect((await call('POST', `/orgs/${org.orgId}/follow`)).status).toBe(401);
    expect((await call('POST', `/orgs/${org.orgId}/follow`, {}, org.token)).status).toBe(409);
    expect((await call('POST', '/orgs/org_inconnu/follow', {}, fan.token)).status).toBe(404);
    const a = await call('POST', `/orgs/${org.orgId}/follow`, {}, fan.token);
    expect(a.body).toMatchObject({ following: true, followers: 1 });
    expect((await call('POST', `/orgs/${org.orgId}/follow`, {}, fan.token)).body.followers).toBe(1); // idempotent
    expect((await call('POST', `/orgs/${org.orgId}/follow`, {}, fan2.token)).body.followers).toBe(2);
    expect((await call('GET', '/me/follows', undefined, fan.token)).body).toEqual([org.orgId]);
    const boot = await call('GET', '/bootstrap');
    expect(boot.body.organizers.find((o: { id: string }) => o.id === org.orgId).followers).toBe(2);
    expect((await call('DELETE', `/orgs/${org.orgId}/follow`, undefined, fan.token)).body).toMatchObject({ following: false, followers: 1 });
    expect((await call('GET', '/me/follows', undefined, fan.token)).body).toEqual([]);
  });

  it('commentaires : lecture publique, compte requis, réponses, suppression par auteur / équipe / administration seulement', async () => {
    const org = await account('o2', { org: true });
    const a = await account('c1', { name: 'Marie Joseph' });
    const b = await account('c2');
    const adm = await account('ad', { role: 'admin' });
    const ev = await call('PUT', '/org/events', event(), org.token);
    expect(ev.status, JSON.stringify(ev.body)).toBe(200);
    const path = `/events/${ev.body.id}/comments`;
    expect((await call('GET', path)).body).toMatchObject({ total: 0, items: [] });
    expect((await call('POST', path, { body: 'Salut' })).status).toBe(401);
    expect((await call('POST', path, { body: '   ' }, a.token)).status).toBe(422);
    const c1 = await call('POST', path, { body: '<script>alert(1)</script> Super soirée !' }, a.token);
    expect(c1.status, JSON.stringify(c1.body)).toBe(200);
    // Texte brut conservé tel quel (l'interface l'affiche comme du texte), nom raccourci, aucun email
    expect(c1.body.body).toContain('<script>');
    expect(c1.body.author.name).toBe('Marie J.');
    expect(JSON.stringify(c1.body)).not.toContain('@social.test');
    expect((await call('POST', path, { body: '<script>alert(1)</script> Super soirée !' }, a.token)).status).toBe(409); // doublon
    expect((await call('POST', path, { body: 'x'.repeat(1001) }, b.token)).body.body.length).toBe(1000); // tronqué à 1000
    // Réponse de l'organisateur : repérée comme venant de l'équipe, avec le badge
    const r = await call('POST', path, { body: 'Merci !', parentId: c1.body.id }, org.token);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.author).toMatchObject({ isOrganizer: true, verified: true });
    // répondre à une réponse est permis (comme sur Facebook) : elle reste rangée sous le commentaire principal (un seul niveau d'affichage)
    const rr = await call('POST', path, { body: 'Répondre à une réponse', parentId: r.body.id }, b.token);
    expect(rr.status).toBe(200);
    expect(rr.body.parentId).toBe(r.body.parentId);
    const list = await call('GET', path);
    expect(list.body.total).toBe(4);
    const top = list.body.items.find((i: { id: string }) => i.id === c1.body.id);
    expect(top.replies).toHaveLength(2);
    expect(top.mine).toBe(false);
    // Suppression
    expect((await call('DELETE', `/comments/${c1.body.id}`, undefined, b.token)).status).toBe(404); // un autre membre ne peut pas
    expect((await call('DELETE', `/comments/${c1.body.id}`)).status).toBe(401);
    expect((await call('DELETE', `/comments/${r.body.id}`, undefined, a.token)).status).toBe(404);
    expect((await call('DELETE', `/comments/${r.body.id}`, undefined, adm.token)).status).toBe(200); // administration
    const mine = await call('GET', path, undefined, a.token);
    expect(mine.body.items.find((i: { id: string }) => i.id === c1.body.id).canDelete).toBe(true);
    expect((await call('DELETE', `/comments/${c1.body.id}`, undefined, a.token)).status).toBe(200); // auteur
    const b2 = (await call('GET', path)).body.items[0];
    expect((await call('DELETE', `/comments/${b2.id}`, undefined, org.token)).status).toBe(200); // équipe de l'événement
    expect((await call('GET', path)).body.total).toBe(0);
  });

  it('commentaires : limite de fréquence, événement privé ou brouillon introuvables pour les autres', async () => {
    const org = await account('o3', { org: true });
    const a = await account('r1');
    const out = await account('r2');
    const ev = await call('PUT', '/org/events', event(), org.token);
    const path = `/events/${ev.body.id}/comments`;
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await call('POST', path, { body: `Message numéro ${i}` }, a.token)).status);
    expect(codes.filter((c) => c === 200)).toHaveLength(10);
    expect(codes.slice(10)).toEqual([429, 429]);
    // Événement privé : seulement par son adresse secrète
    const priv = await call('PUT', '/org/events', event({ private: true, title: `Privé ${tag}` }), org.token);
    expect(priv.status, JSON.stringify(priv.body)).toBe(200);
    expect((await call('GET', `/events/${priv.body.id}/comments`, undefined, out.token)).status).toBe(404);
    expect((await call('POST', `/events/${priv.body.id}/comments`, { body: 'Coucou' }, out.token)).status).toBe(404);
    expect((await call('GET', `/events/${priv.body.slug}/comments`, undefined, out.token)).status).toBe(200);
    // Brouillon : invisible pour les autres
    const draft = await call('PUT', '/org/events', event({ status: 'draft', title: `Brouillon ${tag}` }), org.token);
    expect((await call('GET', `/events/${draft.body.id}/comments`, undefined, out.token)).status).toBe(404);
  });

  it('messages privés : conversation unique, équipe seulement côté organisateur, aucune donnée personnelle, non-lus', async () => {
    const org = await account('o4', { org: true });
    const other = await account('o5', { org: true });
    const buyer = await account('m1', { name: 'Jean Baptiste' });
    const intruder = await account('m2');
    const ev = await call('PUT', '/org/events', event(), org.token);
    expect((await call('POST', '/messages', { organizerId: org.orgId, body: 'Bonjour' })).status).toBe(401);
    expect((await call('POST', '/messages', { organizerId: org.orgId, body: 'Bonjour' }, org.token)).status).toBe(409); // pas à soi-même
    expect((await call('POST', '/messages', { organizerId: org.orgId, body: '  ' }, buyer.token)).status).toBe(422);
    const m1 = await call('POST', '/messages', { organizerId: org.orgId, eventId: ev.body.id, body: 'Bonjour, y a-t-il un parking ?' }, buyer.token);
    expect(m1.status, JSON.stringify(m1.body)).toBe(200);
    const m2 = await call('POST', '/messages', { organizerId: org.orgId, body: 'Merci de répondre' }, buyer.token);
    expect(m2.body.id).toBe(m1.body.id); // même conversation
    // Côté organisation : prénom et initiale seulement, jamais l'email
    const inbox = await call('GET', '/org/conversations', undefined, org.token);
    expect(inbox.status).toBe(200);
    expect(inbox.body).toHaveLength(1);
    expect(inbox.body[0]).toMatchObject({ from: 'Jean B.', unread: 2 });
    expect(JSON.stringify(inbox.body)).not.toContain('@social.test');
    expect((await call('GET', '/me/unread-messages', undefined, org.token)).body.organizer).toBe(2);
    // Une autre organisation et un autre membre ne voient rien
    expect((await call('GET', '/org/conversations', undefined, other.token)).body).toEqual([]);
    expect((await call('GET', `/org/conversations/${m1.body.id}`, undefined, other.token)).status).toBe(404);
    expect((await call('GET', `/me/conversations/${m1.body.id}`, undefined, intruder.token)).status).toBe(404);
    expect((await call('POST', `/me/conversations/${m1.body.id}/messages`, { body: 'Je me glisse' }, intruder.token)).status).toBe(404);
    expect((await call('POST', `/org/conversations/${m1.body.id}/messages`, { body: 'Je me glisse' }, other.token)).status).toBe(404);
    // L'organisation lit (non-lus remis à zéro) puis répond
    const th = await call('GET', `/org/conversations/${m1.body.id}`, undefined, org.token);
    expect(th.body.messages.map((m: { from: string }) => m.from)).toEqual(['user', 'user']);
    expect((await call('GET', '/org/conversations', undefined, org.token)).body[0].unread).toBe(0);
    expect((await call('POST', `/org/conversations/${m1.body.id}/messages`, { body: 'Oui, parking gratuit.' }, org.token)).status).toBe(200);
    // La personne voit la réponse et son non-lu
    const mine = await call('GET', '/me/conversations', undefined, buyer.token);
    expect(mine.body[0]).toMatchObject({ unread: 1, last: { from: 'org' }, organizer: { id: org.orgId } });
    expect((await call('GET', '/me/unread-messages', undefined, buyer.token)).body.inbox).toBe(1);
    const thread = await call('GET', `/me/conversations/${m1.body.id}`, undefined, buyer.token);
    expect(thread.body.messages).toHaveLength(3);
    expect((await call('GET', '/me/unread-messages', undefined, buyer.token)).body.inbox).toBe(0);
    // Visiteur : aucun accès
    expect((await call('GET', '/me/conversations')).status).toBe(401);
    expect((await call('GET', '/org/conversations')).status).toBe(401);
  });

  it('messages : limites (taille, fréquence)', async () => {
    const org = await account('o6', { org: true });
    const a = await account('m3');
    const big = await call('POST', '/messages', { organizerId: org.orgId, body: 'é'.repeat(5000) }, a.token);
    expect(big.status).toBe(200);
    const conv = await call('GET', `/me/conversations/${big.body.id}`, undefined, a.token);
    expect(conv.body.messages[0].body.length).toBe(2000);
    const codes: number[] = [];
    for (let i = 0; i < 31; i++) codes.push((await call('POST', `/me/conversations/${big.body.id}/messages`, { body: `m${i}` }, a.token)).status);
    expect(codes.includes(429)).toBe(true);
  });
});
