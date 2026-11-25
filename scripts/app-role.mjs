import { createHmac } from 'node:crypto';

/**
 * Rôle de base LIMITÉ du site (moindre privilège) : lecture et écriture des données, aucun droit sur la structure.
 *
 * Créé (ou resynchronisé) à chaque déploiement avec la connexion d'origine (propriétaire), sans aucun secret supplémentaire : son mot
 * de passe est dérivé (HMAC) de celui du propriétaire, avec le même calcul que api/_lib/db.ts. Le site s'en sert ensuite tout seul et
 * retombe sur la connexion d'origine si ce rôle est refusé.
 */
export const APP_ROLE = 'event509_app';

/** Même calcul que api/_lib/db.ts (appRolePassword) : un test vérifie l'égalité. */
export const appRolePassword = (ownerPassword) => createHmac('sha256', ownerPassword).update(`${APP_ROLE}:v1`).digest('base64url');

/** Crée ou met à jour le rôle limité et ses droits. Sans effet si la connexion fournie n'est pas celle du propriétaire. */
export async function ensureAppRole(pool, databaseUrl, ownerRole = process.env.DB_OWNER_ROLE ?? 'neondb_owner') {
  const u = new URL(databaseUrl);
  if (decodeURIComponent(u.username) !== ownerRole || !u.password) return { applied: false, reason: 'connexion non propriétaire' };
  const password = appRolePassword(decodeURIComponent(u.password)); // caractères [A-Za-z0-9_-] seulement : sans danger dans le SQL
  const database = decodeURIComponent(u.pathname.slice(1)) || 'neondb';
  const q = (sql) => pool.query(sql);
  const quote = (id) => `"${id.replace(/"/g, '""')}"`;
  const exists = (await pool.query(`select 1 from pg_roles where rolname = $1`, [APP_ROLE])).rowCount > 0;
  const options = `login password '${password}' nosuperuser nocreatedb nocreaterole nobypassrls noreplication`;
  await q(exists ? `alter role ${APP_ROLE} with ${options}` : `create role ${APP_ROLE} with ${options}`);
  await q(`grant connect on database ${quote(database)} to ${APP_ROLE}`);
  await q(`grant usage on schema public to ${APP_ROLE}`);
  await q(`revoke create on schema public from ${APP_ROLE}`);
  await q(`grant select, insert, update, delete on all tables in schema public to ${APP_ROLE}`);
  await q(`grant usage, select on all sequences in schema public to ${APP_ROLE}`);
  // Tables et séquences créées plus tard par le propriétaire (migrations) : mêmes droits automatiquement
  await q(`alter default privileges for role ${quote(ownerRole)} in schema public grant select, insert, update, delete on tables to ${APP_ROLE}`);
  await q(`alter default privileges for role ${quote(ownerRole)} in schema public grant usage, select on sequences to ${APP_ROLE}`);
  return { applied: true, created: !exists };
}
