/**
 * Crée le schéma de la base (db/schema.sql) et, avec --seed, la remplit avec le contenu de départ
 * (src/data/mock.ts : événements, organisateurs, commandes…).
 *
 *   DATABASE_URL=… node scripts/db-setup.mjs            # schéma seul (idempotent)
 *   DATABASE_URL=… node scripts/db-setup.mjs --seed     # schéma + contenu de départ
 *   DATABASE_URL=… node scripts/db-setup.mjs --seed-if-empty   # idem, seulement si la base n'a aucun événement
 *
 * Sur Vercel, `npm run build` met seulement le schéma à jour (jamais de contenu fictif).
 * Le contenu de départ ne se charge qu'à la demande, sur une base de test : `npm run db:seed`.
 *
 * Variables pour --seed :
 *   ADMIN_EMAIL     compte administrateur de la plateforme à créer
 *   ADMIN_PASSWORD  son mot de passe (sinon un mot de passe aléatoire est généré et affiché)
 *   DEMO_PASSWORD   si défini, les comptes de démonstration reçoivent ce mot de passe
 *                   (à réserver à une base de test : jamais en production)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync } from 'node:crypto';
import { transformSync } from 'esbuild';
import pg from 'pg';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
if (!process.env.DATABASE_URL) {
  // Pendant le build, l'absence de base n'est pas une erreur : le site reste en mode démo
  if (process.argv.includes('--if-configured')) process.exit(0);
  console.error('DATABASE_URL manquant');
  process.exit(1);
}
const local = /localhost|127\.0\.0\.1|host=\/tmp/.test(process.env.DATABASE_URL);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: local ? undefined : { rejectUnauthorized: true } });

const hash = (pw) => {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('base64')}$${scryptSync(pw, salt, 64).toString('base64')}`;
};

async function loadMock() {
  const ts = readFileSync(join(root, 'src/data/mock.ts'), 'utf8');
  const { code } = transformSync(ts, { loader: 'ts', format: 'esm' });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

async function upsert(c, table, row) {
  const cols = Object.keys(row);
  const values = cols.map((k) => (k === 'data' || k === 'value' ? JSON.stringify(row[k]) : row[k] ?? null));
  await c.query(
    `insert into ${table} (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')})
     on conflict (${cols[0]}) do update set ${cols.slice(1).map((k) => `${k} = excluded.${k}`).join(', ')}`,
    values,
  );
}

const c = await pool.connect();
try {
  await c.query(readFileSync(join(root, 'db/schema.sql'), 'utf8'));
  console.log('Schéma à jour.');

  const empty = Number((await c.query('select count(*) as n from events')).rows[0].n) === 0;
  if (process.argv.includes('--seed') || (process.argv.includes('--seed-if-empty') && empty)) {
    const m = await loadMock();
    await c.query('begin');
    for (const o of m.organizers) await upsert(c, 'organizers', { id: o.id, slug: o.slug, data: o });

    const orgOfUser = { u2: 'org1', u8: 'org1', u9: 'org1', u3: 'org2', u4: 'org3', u13: 'org4' };
    const demoPw = process.env.DEMO_PASSWORD ? hash(process.env.DEMO_PASSWORD) : null;
    for (const u of m.users) {
      if (u.role === 'admin') continue; // l'administrateur est créé à part
      const { id, email, role, teamRole, status, ...data } = u;
      await upsert(c, 'users', {
        id, email: email.toLowerCase(), password_hash: demoPw, role, team_role: role === 'organizer' ? teamRole ?? 'admin' : null,
        organizer_id: orgOfUser[id] ?? null, status, created_at: `${u.joinedAt}T12:00:00Z`, data,
      });
    }
    const adminEmail = (process.env.ADMIN_EMAIL ?? '').toLowerCase().trim();
    if (adminEmail) {
      const exists = (await c.query('select 1 from users where email = $1', [adminEmail])).rowCount;
      if (!exists) {
        const pw = process.env.ADMIN_PASSWORD || randomBytes(12).toString('base64url');
        await c.query(
          `insert into users (id, email, password_hash, role, team_role, organizer_id, data) values ('u7', $1, $2, 'admin', 'admin', 'org1', $3)
           on conflict (id) do update set email = excluded.email, password_hash = excluded.password_hash`,
          [adminEmail, hash(pw), JSON.stringify({ name: 'Admin Event509', avatar: 'AE', city: 'Port-au-Prince', joinedAt: new Date().toISOString().slice(0, 10) })],
        );
        if (!process.env.ADMIN_PASSWORD) console.log(`ADMIN_PASSWORD_GENERATED=${pw}`);
      }
    }

    for (const e of m.events) await upsert(c, 'events', { id: e.id, slug: e.slug, organizer_id: e.organizerId, status: e.status, start_at: e.start, data: e });

    const userByEmail = new Map(m.users.map((u) => [u.email.toLowerCase(), u.id]));
    const orderRow = (o, userId) => ({ id: o.id, event_id: o.eventId, user_id: userId ?? null, buyer_email: o.buyerEmail.toLowerCase(), status: o.status, created_at: o.createdAt, data: o });
    for (const o of m.platformOrders) await upsert(c, 'orders', orderRow(o, userByEmail.get(o.buyerEmail.toLowerCase())));
    for (const o of m.myOrders) await upsert(c, 'orders', orderRow(o, 'u1'));

    const ticketRow = (t) => ({
      id: t.id, code: t.code, event_id: t.eventId, order_id: t.orderId, owner_email: t.holderEmail.toLowerCase(), seat: t.seat ?? null,
      session_label: t.sessionLabel ?? null, status: t.status, checked_in_at: t.checkedInAt ?? null, data: t,
    });
    for (const t of m.myTickets) await upsert(c, 'tickets', ticketRow(t));
    for (const a of m.attendees) {
      const ev = m.events.find((e) => e.id === a.eventId);
      const tt = ev.tickets.find((t) => t.name === a.ticketType) ?? ev.tickets[0];
      await upsert(c, 'tickets', ticketRow({
        id: `t_${a.id}`, code: a.code, eventId: a.eventId, ticketTypeId: tt.id, holderName: a.name, holderEmail: a.email,
        status: a.checkedIn ? 'used' : 'valid', orderId: a.orderId, checkedInAt: a.checkedInAt, phone: a.phone, purchasedAt: a.purchasedAt, amount: a.amount,
      }));
    }
    for (const l of m.resaleListings) {
      await upsert(c, 'tickets', ticketRow({ ...l, id: `t_${l.id}` }));
      await upsert(c, 'resale_listings', { id: l.id, ticket_id: `t_${l.id}`, event_id: l.eventId, price: l.resalePrice, data: l });
    }

    const orgOfEvent = (id) => m.events.find((e) => e.id === id)?.organizerId ?? 'org1';
    for (const p of m.promoCodes) await upsert(c, 'promo_codes', { id: p.id, organizer_id: p.eventId === 'all' ? 'org1' : orgOfEvent(p.eventId), code: p.code, data: p });
    for (const t of m.team) await upsert(c, 'team_members', { id: t.id, organizer_id: 'org1', email: t.email.toLowerCase(), data: t });
    for (const r of m.refunds) {
      const ev = m.events.find((e) => e.title === r.eventTitle);
      await upsert(c, 'refunds', { id: r.id, organizer_id: ev?.organizerId ?? null, order_id: r.orderId, status: r.status, created_at: r.createdAt, data: r });
    }
    for (const p of m.payouts) await upsert(c, 'payouts', { id: p.id, organizer_id: p.organizerId, status: p.status, created_at: `${p.date}T12:00:00Z`, data: p });
    for (const k of m.campaigns) await upsert(c, 'campaigns', { id: k.id, organizer_id: 'org1', data: k });
    for (const a of m.ambassadors) await upsert(c, 'ambassadors', { id: a.id, organizer_id: 'org1', code: a.code, data: a });
    for (const x of m.customCommissions) await upsert(c, 'custom_commissions', { organizer_id: x.organizerId, rate: x.rate, reason: x.reason });
    for (const r of m.reports) await upsert(c, 'reports', { id: r.id, event_id: r.eventId, status: r.status, created_at: r.createdAt, data: r });
    for (const v of m.verificationRequests) await upsert(c, 'verification_requests', { id: v.id, organizer_id: v.organizerId ?? null, status: v.status, data: v });
    for (const d of m.disputes) await upsert(c, 'disputes', { id: d.id, order_id: d.orderId, status: d.status, created_at: d.createdAt, data: d });
    for (const a of m.auditLog) await upsert(c, 'audit_log', { id: a.id, at: a.at, data: a });
    for (const t of m.platformTargets) await upsert(c, 'platform_targets', { id: t.id, data: t });
    await upsert(c, 'settings', { key: 'fees', value: m.platformSettings.fees });
    await c.query('commit');
    const counts = await c.query(`select (select count(*) from events) ev, (select count(*) from orders) ord, (select count(*) from tickets) tk, (select count(*) from users) us`);
    console.log('Contenu de départ chargé :', counts.rows[0]);
  }
} catch (e) {
  await c.query('rollback').catch(() => {});
  console.error(e);
  process.exitCode = 1;
} finally {
  c.release();
  await pool.end();
}
