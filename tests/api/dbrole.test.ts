import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { APP_ROLE, appRolePassword, restrictedUrl } from '../../api/_lib/db.js';
import { appRolePassword as scriptPassword, ensureAppRole } from '../../scripts/app-role.mjs';

const URL_OWNER = process.env.TEST_DATABASE_URL;

describe('rôle de base limité : calcul de la connexion', () => {
  it('dérive un mot de passe stable, long et différent du propriétaire ; ne s’applique qu’au rôle propriétaire', () => {
    const a = appRolePassword('mot-de-passe-du-proprietaire');
    expect(a).toBe(appRolePassword('mot-de-passe-du-proprietaire'));
    expect(a).not.toBe(appRolePassword('autre'));
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(scriptPassword('mot-de-passe-du-proprietaire')).toBe(a); // le script de déploiement et le site calculent la même chose
    expect(a).not.toContain('mot-de-passe');
    process.env.DB_OWNER_ROLE = 'neondb_owner';
    const r = restrictedUrl('postgresql://neondb_owner:pw%40x@ep-1-pooler.neon.tech/neondb?sslmode=require')!;
    expect(new URL(r).username).toBe(APP_ROLE);
    expect(new URL(r).host).toBe('ep-1-pooler.neon.tech'); // même serveur, même base
    expect(restrictedUrl('postgresql://autre:pw@ep-1.neon.tech/neondb')).toBeNull(); // déjà un autre rôle : on ne touche à rien
    expect(restrictedUrl('postgresql://neondb_owner@ep-1.neon.tech/neondb')).toBeNull(); // pas de mot de passe
    process.env.DB_RESTRICTED = '0';
    expect(restrictedUrl('postgresql://neondb_owner:pw@ep-1.neon.tech/neondb')).toBeNull(); // interrupteur de secours
    delete process.env.DB_RESTRICTED;
  });
});

describe.skipIf(!URL_OWNER)('rôle de base limité : droits réels (base locale de test)', () => {
  let admin: pg.Pool;
  let ownerRole = '';
  let ownerPassword = '';
  let canCreateRoles = false;

  beforeAll(async () => {
    const u = new URL(URL_OWNER!);
    ownerRole = decodeURIComponent(u.username);
    ownerPassword = decodeURIComponent(u.password);
    admin = new pg.Pool({ connectionString: URL_OWNER });
    canCreateRoles = (await admin.query(`select rolcreaterole or rolsuper as ok from pg_roles where rolname = current_user`)).rows[0].ok;
    if (!canCreateRoles) return;
    await admin.query(`drop owned by ${APP_ROLE}`).catch(() => {});
    await admin.query(`drop role if exists ${APP_ROLE}`);
    // Le rôle est créé par le script de déploiement (scripts/db-setup.mjs)
    expect(await ensureAppRole(admin, URL_OWNER!, ownerRole)).toMatchObject({ applied: true, created: true });
  });

  afterAll(async () => {
    if (canCreateRoles) {
      await admin.query(`drop owned by ${APP_ROLE}`).catch(() => {});
      await admin.query(`drop role if exists ${APP_ROLE}`).catch(() => {});
    }
    await admin.end();
  });

  const load = async () => {
    vi.resetModules();
    process.env.DATABASE_URL = URL_OWNER;
    process.env.DB_OWNER_ROLE = ownerRole;
    return import('../../api/_lib/db.js');
  };

  it('le site se connecte avec le rôle limité : lit et écrit ses données, ne peut ni créer ni supprimer de table', async (ctx) => {
    if (!canCreateRoles) return ctx.skip();
    const m = await load();
    expect((await m.db().query('select current_user as u')).rows[0].u).toBe(APP_ROLE);
    expect(m.dbRestricted()).toBe(true);
    // Données : lecture, écriture, suppression (ce que fait le site)
    await m.db().query(`insert into rate_events (key) values ('test-role-limite')`);
    expect(Number((await m.db().query(`select count(*) as n from rate_events where key = 'test-role-limite'`)).rows[0].n)).toBeGreaterThanOrEqual(1);
    await m.db().query(`delete from rate_events where key = 'test-role-limite'`);
    // Transactions (connect) : mêmes droits
    const c = await m.db().connect();
    try {
      await c.query('begin');
      await c.query(`insert into rate_events (key) values ('test-role-tx')`);
      await c.query('rollback');
    } finally {
      c.release();
    }
    // Structure : refusée (création, suppression, modification, création de rôle)
    for (const sql of [
      'create table zz_interdit (id int)',
      'drop table rate_events',
      'alter table users add column zz int',
      'truncate table users',
      `create role zz_pirate login password 'x'`,
    ])
      await expect(m.db().query(sql), sql).rejects.toMatchObject({ code: '42501' });
  });

  it('rôle limité refusé (mot de passe changé) : le site retombe sur la connexion d’origine, sans panne', async (ctx) => {
    if (!canCreateRoles) return ctx.skip();
    await admin.query(`alter role ${APP_ROLE} password 'un-autre-mot-de-passe-que-le-calcul'`);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const m = await load();
      expect((await m.db().query('select current_user as u')).rows[0].u).toBe(ownerRole); // repli
      expect(m.dbRestricted()).toBe(false);
      expect(err.mock.calls.some((c) => String(c[0]).includes('repli'))).toBe(true);
      expect((await m.db().query('select 1 as ok')).rows[0].ok).toBe(1); // et les requêtes suivantes passent
    } finally {
      err.mockRestore();
      await admin.query(`alter role ${APP_ROLE} password '${appRolePassword(ownerPassword)}'`);
    }
  });

  it('le script de déploiement est répétable : rôle resynchronisé, rien d’appliqué avec une connexion non propriétaire', async (ctx) => {
    if (!canCreateRoles) return ctx.skip();
    expect(await ensureAppRole(admin, URL_OWNER!, ownerRole)).toMatchObject({ applied: true, created: false });
    expect(await ensureAppRole(admin, 'postgresql://autre:pw@h/db', ownerRole)).toMatchObject({ applied: false });
    // Nouvelle table créée plus tard par le propriétaire : le rôle limité y a accès automatiquement
    await admin.query(`create table if not exists zz_droits_auto (id int)`);
    try {
      const m = await load();
      await expect(m.db().query('select count(*) from zz_droits_auto')).resolves.toBeTruthy();
    } finally {
      await admin.query('drop table if exists zz_droits_auto');
    }
  });

  it('interrupteur de secours DB_RESTRICTED=0 : connexion d’origine', async () => {
    process.env.DB_RESTRICTED = '0';
    try {
      const m = await load();
      expect((await m.db().query('select current_user as u')).rows[0].u).toBe(ownerRole);
    } finally {
      delete process.env.DB_RESTRICTED;
    }
  });
});
