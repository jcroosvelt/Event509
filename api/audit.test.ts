import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Audit de sécurité (novembre 2026) : contrôles systématiques, route par route, à partir de la table des routes.
 * Complète security.test.ts (attaques ciblées) : ici aucune route ne peut être oubliée.
 */
const DB = process.env.TEST_DATABASE_URL;

describe.skipIf(!DB)('Audit de sécurité : matrice des rôles et isolement des organisations', () => {
  let pool: pg.Pool;
  let handle: typeof import('./_lib/handler.js').handle;
  let routes: typeof import('./_lib/routes.js').routes;
  let ipN = 0;
  let seq = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Out = { status: number; body: any };
  const call = async (method: string, path: string, body?: unknown, token?: string, query: Record<string, string> = {}): Promise<Out> => {
    const o = (await handle({ method, path, query, body, authorization: token ? `Bearer ${token}` : undefined, ip: `10.7.${Math.floor(ipN / 250)}.${(ipN++ % 250) + 1}` })) as Out;
    return o.status === 204 ? { ...o, status: 200 } : o;
  };
  async function signup(withOrg: boolean, email = `aud${++seq}-${Date.now()}@audit.test`) {
    const r = await call('POST', '/auth/signup', { name: `Audit Test${seq}`, email, password: 'Soleil2026x', acceptTerms: true, ...(withOrg ? { orgName: `Org Audit ${seq}`, country: 'HT' } : {}) });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    return { token: r.body.token as string, id: r.body.user.id as string, orgId: r.body.user.organizerId as string, email };
  }
  const fill = (p: string) => p.replace(/:\w+/g, 'x');
  const payload = { id: 'x', status: 'approved', role: 'admin', email: 'x@audit.test', name: 'X', code: 'X', amount: 1, price: 1, verified: true, note: 'xxxxxxxxxx', message: 'xxxxxxxxxx' };

  beforeAll(async () => {
    process.env.DATABASE_URL = DB;
    process.env.JWT_SECRET = 'q'.repeat(40);
    delete process.env.VERCEL_ENV;
    delete process.env.GOOGLE_CLIENT_ID;
    pool = new pg.Pool({ connectionString: DB });
    await pool.query(`delete from rate_events`);
    await pool.query(`delete from users where email like '%@audit.test'`);
    ({ handle } = await import('./_lib/handler.js'));
    ({ routes } = await import('./_lib/routes.js'));
  });
  afterAll(async () => {
    await pool?.query(`delete from users where email like '%@audit.test'`);
    await pool?.end();
  });

  async function participant() {
    const id = `u_audp${++seq}${Date.now()}`;
    await pool.query(`insert into users (id, email, password_hash, role, data, auth_complete) values ($1,$2,'x','participant','{"name":"Part"}', true)`, [id, `${id}@audit.test`]);
    const { signToken } = await import('./_lib/auth.js');
    return { id, token: signToken(id) };
  }

  /** Lignes d'une organisation dans toutes les tables qui lui appartiennent (empreinte pour détecter la moindre modification). */
  async function snapshot(orgId: string) {
    const out: Record<string, string> = {};
    for (const t of ['organizers', 'events', 'promo_codes', 'team_members', 'refunds', 'payouts', 'campaigns', 'ambassadors', 'tracking_links', 'event_templates', 'api_keys', 'webhooks', 'support_tickets', 'premium_payments', 'files']) {
      const col = t === 'organizers' ? 'id' : 'organizer_id';
      const r = await pool.query(`select md5(coalesce(string_agg(x::text, '|' order by x::text), '')) as h from ${t} x where ${col} = $1`, [orgId]);
      out[t] = r.rows[0].h as string;
    }
    const tk = await pool.query(`select md5(coalesce(string_agg(t::text, '|' order by t.id), '')) as h from tickets t join events e on e.id = t.event_id where e.organizer_id = $1`, [orgId]);
    out.tickets = tk.rows[0].h as string;
    return out;
  }

  it('A1. administration : toutes les routes /admin refusent un participant et un organisateur', async () => {
    const part = await participant();
    const orga = await signup(true);
    const bad: string[] = [];
    const admins = routes.filter(([, p]) => /^\/admin\//.test(p));
    expect(admins.length).toBeGreaterThan(40);
    for (const [method, pattern] of admins)
      for (const [who, t] of [['participant', part.token], ['organisateur', orga.token]] as const) {
        const r = await call(method, fill(pattern), payload, t);
        if (r.status !== 403) bad.push(`${who} ${method} ${pattern} → ${r.status}`);
      }
    expect(bad).toEqual([]);
  });

  it('A2. espace organisateur : un participant est refusé partout ; un membre « contrôle d’entrée » n’a accès qu’au contrôle', async () => {
    const part = await participant();
    const orga = await signup(true);
    const inv = await call('POST', '/org/team', { email: `staff${Date.now()}@audit.test`, name: 'Staff', role: 'staff' }, orga.token);
    expect(inv.status).toBe(200);
    const staff = await signup(false, inv.body.email);
    const allowed = ['GET /org/attendees', 'POST /org/checkin/lookup', 'POST /org/checkin'];
    const bad: string[] = [];
    for (const [method, pattern] of routes.filter(([, p]) => /^\/org\//.test(p))) {
      const r = await call(method, fill(pattern), payload, part.token);
      if (r.status !== 403) bad.push(`participant ${method} ${pattern} → ${r.status}`);
      const s2 = await call(method, fill(pattern), payload, staff.token);
      if (s2.status !== 403 && !allowed.includes(`${method} ${pattern}`)) bad.push(`staff ${method} ${pattern} → ${s2.status}`);
    }
    expect(bad).toEqual([]);
  });

  it('A3. IDOR systématique : une organisation n’atteint aucune ressource d’une autre, sur aucune route', async () => {
    const a = await signup(true);
    const b = await signup(true);
    await pool.query(`update organizers set data = data || '{"verified": true}'::jsonb where id = any($1)`, [[a.orgId, b.orgId]]);
    // Ressources de A, de chaque type
    const ev = await call('PUT', '/org/events', {
      title: 'SECRETA concert', description: 'SECRETA description', start: '2030-06-01T20:00:00', end: '2030-06-01T23:00:00', currency: 'HTG', status: 'draft', seated: false, maxPerPerson: 8,
      venue: { name: 'Salle', address: 'Rue 1', city: 'Jacmel' }, categories: ['music'], images: [], tags: [],
      tickets: [{ id: 't1', name: 'Standard', kind: 'paid', price: 500, quota: 20, sold: 0, salesStart: '2026-01-01T00:00:00', salesEnd: '2030-06-01T20:00:00', maxPerOrder: 5 }],
    }, a.token);
    expect(ev.status, JSON.stringify(ev.body)).toBe(200);
    const evId = ev.body.id as string;
    const n = Date.now();
    const ids = { ev: evId, promo: `pr_a${n}`, team: `m_a${n}`, camp: `c_a${n}`, amb: `am_a${n}`, link: `l_a${n}`, tpl: `tp_a${n}`, key: `k_a${n}`, hook: `w_a${n}`, sup: `s_a${n}`, ref: `rf_a${n}`, pay: `pp_a${n}`, ord: `o_a${n}`, tick: `t_a${n}`, rev: `rv_a${n}`, file: `f_a${n}` };
    const q = (sql: string, v: unknown[]) => pool.query(sql, v);
    await q(`insert into promo_codes (id, organizer_id, code, data) values ($1,$2,$3,$4)`, [ids.promo, a.orgId, `PROMOA${n % 10000}`, { id: ids.promo, code: `PROMOA${n % 10000}`, name: 'SECRETA promo', eventId: 'all', type: 'percent', value: 10, limit: 5, used: 0, active: true }]);
    await q(`insert into team_members (id, organizer_id, email, data) values ($1,$2,$3,$4)`, [ids.team, a.orgId, `secreta${n}@audit.test`, { id: ids.team, name: 'SECRETA', email: `secreta${n}@audit.test`, role: 'manager', status: 'invited' }]);
    await q(`insert into campaigns (id, organizer_id, data) values ($1,$2,$3)`, [ids.camp, a.orgId, { id: ids.camp, name: 'SECRETA camp', status: 'draft' }]);
    await q(`insert into ambassadors (id, organizer_id, code, data) values ($1,$2,$3,$4)`, [ids.amb, a.orgId, `SECRETAMB${n % 10000}`, { id: ids.amb, name: 'SECRETA amb', code: `SECRETAMB${n % 10000}`, commission: 5 }]);
    await q(`insert into tracking_links (id, organizer_id, event_id, code, label) values ($1,$2,$3,$4,$5)`, [ids.link, a.orgId, evId, `sa${n % 100000}`, 'SECRETA lien']);
    await q(`insert into event_templates (id, organizer_id, name, data) values ($1,$2,$3,$4)`, [ids.tpl, a.orgId, 'SECRETA modèle', {}]);
    await q(`insert into api_keys (id, organizer_id, name, prefix, key_hash) values ($1,$2,$3,$4,$5)`, [ids.key, a.orgId, 'SECRETA clé', 'e509_live_aa', `h${n}`]);
    await q(`insert into webhooks (id, organizer_id, url, secret) values ($1,$2,$3,$4)`, [ids.hook, a.orgId, 'https://example.com/SECRETA', 'SECRETA-secret']);
    await q(`insert into support_tickets (id, organizer_id, subject, category, priority, status) values ($1,$2,$3,'other','normal','open')`, [ids.sup, a.orgId, 'SECRETA sujet']);
    await q(`insert into orders (id, event_id, status, data) values ($1,$2,'paid',$3)`, [ids.ord, evId, { id: ids.ord, eventId: evId, buyerName: 'SECRETA acheteur', buyerEmail: 'secreta@audit.test', total: 500, currency: 'HTG', status: 'paid' }]).catch((e) => console.info('orders', (e as Error).message));
    await q(`insert into refunds (id, organizer_id, order_id, status, data) values ($1,$2,$3,'pending',$4)`, [ids.ref, a.orgId, ids.ord, { id: ids.ref, orderId: ids.ord, reason: 'SECRETA', status: 'pending', amount: 500 }]);
    await q(`insert into premium_payments (id, organizer_id, plan, amount, status, method) values ($1,$2,'yearly',100,'paid','moncash')`, [ids.pay, a.orgId]);
    await q(`insert into reviews (id, event_id, order_id, rating, data) values ($1,$2,$3,5,$4)`, [ids.rev, evId, ids.ord, { id: ids.rev, comment: 'SECRETA avis' }]).catch((e) => console.info('reviews', (e as Error).message));
    const before = await snapshot(a.orgId);
    const victimIds = Object.values(ids);
    const leaks: string[] = [];
    const changes: string[] = [];
    const orgRoutes = routes.filter(([, p]) => /^\/org\//.test(p));
    for (const [method, pattern] of orgRoutes) {
      void method;
      const variants = pattern.includes(':') ? victimIds.map((id) => pattern.replace(/:\w+/g, id!)) : [pattern];
      for (const path of variants)
        for (const id of (pattern.includes(':') ? [victimIds[0]!] : victimIds) as string[]) {
          const body = { ...payload, id, eventId: evId, orderId: ids.ord, code: `PROMOA${n % 10000}`, status: method === 'POST' ? 'approved' : 'cancelled', role: 'admin', organizerId: a.orgId, org: a.orgId };
          const r = await call(method, path, body, b.token, { org: a.orgId, eventId: evId });
          if (JSON.stringify(r.body ?? '').includes('SECRETA')) leaks.push(`${method} ${pattern} (${path}) → ${r.status}`);
        }
    }
    const after = await snapshot(a.orgId);
    for (const k of Object.keys(before)) if (before[k] !== after[k]) changes.push(k);
    console.info('A3 fuites :', leaks, 'modifications :', changes);
    expect(leaks).toEqual([]);
    expect(changes).toEqual([]);
    // Contrôle positif : le test n'est pas aveugle (A voit ses données ; une modification de A change l'empreinte)
    expect(JSON.stringify((await call('GET', '/org/campaigns', undefined, a.token)).body)).toContain('SECRETA');
    expect(JSON.stringify((await call('GET', '/org/events', undefined, a.token)).body)).toContain('SECRETA');
    expect((await call('DELETE', `/org/links/${ids.link}`, undefined, a.token)).status).toBe(200);
    expect((await snapshot(a.orgId)).tracking_links).not.toBe(after.tracking_links);
  });

  const onlineEvent = (o: Record<string, unknown> = {}) => ({
    title: 'Atelier en ligne', description: 'Description assez longue', start: '2030-06-01T20:00:00', end: '2030-06-01T23:00:00', currency: 'HTG', status: 'published', seated: false, maxPerPerson: 8,
    venue: null, online: { platform: 'Zoom', url: 'https://zoom.us/j/SECRETLINK' }, categories: ['education'], images: [], tags: [],
    tickets: [{ id: 't1', name: 'Standard', kind: 'paid', price: 500, quota: 20, sold: 0, salesStart: '2026-01-01T00:00:00', salesEnd: '2030-06-01T20:00:00', maxPerOrder: 5 }], ...o,
  });

  it('A4. lien du direct : jamais publié, réservé à l’organisation et aux détenteurs d’un billet payé', async () => {
    const a = await signup(true);
    await pool.query(`update organizers set data = data || '{"verified": true}'::jsonb where id = $1`, [a.orgId]);
    const ev = await call('PUT', '/org/events', onlineEvent(), a.token);
    expect(ev.status, JSON.stringify(ev.body)).toBe(200);
    const other = await signup(true);
    // Visiteur, autre organisation, API publique : aucun lien
    for (const [path, t] of [['/bootstrap', undefined], [`/events/${ev.body.id}`, undefined], ['/bootstrap', other.token], [`/events/${ev.body.id}`, other.token]] as const)
      expect(JSON.stringify((await call('GET', path, undefined, t)).body), `${path}`).not.toContain('SECRETLINK');
    // L'organisation le voit
    expect(JSON.stringify((await call('GET', `/events/${ev.body.id}`, undefined, a.token)).body)).toContain('SECRETLINK');
    // Commande en attente de paiement : pas de lien ; commande payée : lien
    const o = await call('POST', '/orders', { eventId: ev.body.id, items: [{ ticketTypeId: 't1', qty: 1 }], method: 'transfer', currency: 'HTG', buyer: { name: 'Acheteur', email: `b${Date.now()}@audit.test` } });
    expect(o.status, JSON.stringify(o.body)).toBe(200);
    const k = { k: o.body.accessKey as string };
    expect(JSON.stringify((await call('GET', `/orders/${o.body.order.id}`, undefined, undefined, k)).body)).not.toContain('SECRETLINK');
    await pool.query(`update orders set status = 'paid', data = data || '{"status":"paid"}'::jsonb where id = $1`, [o.body.order.id]);
    expect(JSON.stringify((await call('GET', `/orders/${o.body.order.id}`, undefined, undefined, k)).body)).toContain('SECRETLINK');
    expect((await call('GET', `/orders/${o.body.order.id}`, undefined, undefined, { k: 'mauvaise' })).status).toBe(404);
  });

  it('A5. ambassadeurs : aucune liste publique ; un code ne rapporte rien sur les ventes d’une autre organisation', async () => {
    const a = await signup(true);
    const b = await signup(true);
    await pool.query(`update organizers set data = data || '{"verified": true}'::jsonb where id = any($1)`, [[a.orgId, b.orgId]]);
    const code = `AMB${Date.now() % 100000}`;
    expect((await call('PUT', '/org/ambassadors', { id: '', name: 'Jean Ambassadeur', code, commission: 12, clicks: 0, sales: 0, revenue: 0 }, a.token)).status).toBe(200);
    const boot = JSON.stringify((await call('GET', '/bootstrap')).body);
    expect(boot).not.toContain(code);
    expect(boot).not.toContain('Ambassadeur');
    // Vérification d'un code : prénom seulement, pas de commission
    const r = await call('GET', `/referrals/${code.toLowerCase()}`);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ code, name: 'Jean' });
    expect((await call('GET', '/referrals/INCONNU999')).status).toBe(404);
    // Vente chez B avec le code de A : aucun crédit pour l'ambassadeur de A
    const evB = await call('PUT', '/org/events', { ...onlineEvent(), online: null, venue: { name: 'Salle', address: 'Rue', city: 'Jacmel' } }, b.token);
    expect(evB.status).toBe(200);
    expect((await call('POST', '/orders', { eventId: evB.body.id, items: [{ ticketTypeId: 't1', qty: 2 }], method: 'transfer', currency: 'HTG', referral: code, buyer: { name: 'Acheteur', email: `r${Date.now()}@audit.test` } })).status).toBe(200);
    const row = (await pool.query(`select data from ambassadors where code = $1`, [code])).rows[0];
    expect(Number(row.data.sales ?? 0)).toBe(0);
    // Vente chez A : crédit normal
    const evA = await call('PUT', '/org/events', { ...onlineEvent(), online: null, venue: { name: 'Salle', address: 'Rue', city: 'Jacmel' } }, a.token);
    expect((await call('POST', '/orders', { eventId: evA.body.id, items: [{ ticketTypeId: 't1', qty: 2 }], method: 'transfer', currency: 'HTG', referral: code, buyer: { name: 'Acheteur', email: `s${Date.now()}@audit.test` } })).status).toBe(200);
    expect(Number((await pool.query(`select data from ambassadors where code = $1`, [code])).rows[0].data.sales)).toBe(2);
  });

  it('A6. contrôle d’entrée seul : la liste téléchargée ne contient ni email, ni téléphone, ni montant', async () => {
    const a = await signup(true);
    await pool.query(`update organizers set data = data || '{"verified": true}'::jsonb where id = $1`, [a.orgId]);
    const ev = await call('PUT', '/org/events', { ...onlineEvent(), online: null, venue: { name: 'Salle', address: 'Rue', city: 'Jacmel' } }, a.token);
    const email = `achat${Date.now()}@audit.test`;
    const o = await call('POST', '/orders', { eventId: ev.body.id, items: [{ ticketTypeId: 't1', qty: 1 }], method: 'transfer', currency: 'HTG', buyer: { name: 'Marie Achat', email, phone: '+50937000000' } });
    expect(o.status).toBe(200);
    await pool.query(`update tickets set status = 'valid', data = data || '{"status":"valid"}'::jsonb where order_id = $1`, [o.body.order.id]);
    const inv = await call('POST', '/org/team', { email: `scan${Date.now()}@audit.test`, name: 'Scan', role: 'staff' }, a.token);
    const staff = await signup(false, inv.body.email);
    const list = (await call('GET', '/org/attendees', undefined, staff.token)).body as { name: string; email: string; phone: string; amount: number; code: string }[];
    expect(list.length).toBe(1);
    expect(list[0]!.name).toBe('Marie Achat');
    expect(list[0]!.code).toBeTruthy();
    expect(JSON.stringify(list)).not.toContain(email);
    expect(JSON.stringify(list)).not.toContain('37000000');
    expect(list[0]!.amount).toBe(0);
    // L'administrateur de l'organisation garde la liste complète
    expect(JSON.stringify((await call('GET', '/org/attendees', undefined, a.token)).body)).toContain(email);
  });

  it('A7. champs réservés au serveur : statut, vérification, avantages, ventes et organisation ne se fixent pas depuis le navigateur', async () => {
    const a = await signup(true);
    await call('PUT', '/org/profile', { name: 'Org', verified: true, perks: ['team', 'api'], followers: 99999, eventsCount: 500 }, a.token);
    const org = (await pool.query(`select data from organizers where id = $1`, [a.orgId])).rows[0].data;
    expect(org.verified).toBe(false);
    expect(org.perks).toBeUndefined();
    expect(org.followers).toBe(0);
    const ev = await call('PUT', '/org/events', { ...onlineEvent(), online: null, venue: { name: 'Salle', address: 'Rue', city: 'Jacmel' }, featured: true, views: 99999, organizerId: 'org_autre' }, a.token);
    expect(ev.status).toBe(200);
    const again = await call('PUT', '/org/events', { ...ev.body, tickets: ev.body.tickets.map((t: object) => ({ ...t, sold: 15 })) }, a.token);
    expect(again.status).toBe(200);
    const row = (await pool.query(`select organizer_id, data from events where id = $1`, [ev.body.id])).rows[0];
    expect(row.organizer_id).toBe(a.orgId);
    expect(row.data.status).toBe('pending'); // organisation non vérifiée : validation obligatoire
    expect(row.data.featured).not.toBe(true);
    expect(row.data.views ?? 0).toBe(0);
    expect(row.data.tickets[0].sold).toBe(0);
  });
});
