import pg from 'pg';

import { createHmac } from 'node:crypto';

/**
 * Connexion à la base avec un rôle LIMITÉ (principe du moindre privilège).
 *
 * Le site ne fait que lire et écrire des données : il n'a pas besoin du rôle propriétaire, qui peut aussi supprimer des tables ou créer
 * d'autres comptes de base. Au démarrage, si la connexion fournie (DATABASE_URL) est celle du rôle propriétaire, le site se connecte à
 * la place avec le rôle `event509_app`, dont le mot de passe est DÉRIVÉ (HMAC) de celui du propriétaire : aucun secret de plus à
 * stocker, et rien à régler dans l'hébergeur. Le rôle est créé une fois dans la base avec ce même mot de passe dérivé.
 *
 * Sécurité de fonctionnement : si le rôle limité est refusé (mot de passe du propriétaire changé, rôle absent), le site retombe sur la
 * connexion d'origine au lieu de tomber en panne, et le signale dans les journaux. Les migrations (scripts/db-setup.mjs, au déploiement)
 * utilisent toujours la connexion d'origine.
 */
export const APP_ROLE = 'event509_app';
const OWNER_ROLE = () => process.env.DB_OWNER_ROLE ?? 'neondb_owner';

/** Mot de passe du rôle limité, dérivé de celui du propriétaire (même calcul à la création du rôle). */
export const appRolePassword = (ownerPassword: string) => createHmac('sha256', ownerPassword).update(`${APP_ROLE}:v1`).digest('base64url');

/** Adresse de connexion du rôle limité, ou null si la connexion fournie n'est pas celle du propriétaire (base locale, déjà limitée…). */
export function restrictedUrl(url: string): string | null {
  if (process.env.DB_RESTRICTED === '0') return null; // interrupteur de secours
  try {
    const u = new URL(url);
    if (decodeURIComponent(u.username) !== OWNER_ROLE() || !u.password) return null;
    const r = new URL(url);
    r.username = APP_ROLE;
    r.password = appRolePassword(decodeURIComponent(u.password));
    return r.toString();
  } catch {
    return null;
  }
}

const poolFor = (url: string) =>
  new pg.Pool({
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 10_000,
    // Neon exige TLS ; une base locale de test n'en a pas
    ssl: /localhost|127\.0\.0\.1|host=\/tmp/.test(url) ? undefined : { rejectUnauthorized: true },
  });

let owner: pg.Pool | null = null;
let limited: pg.Pool | null = null;
let facade: pg.Pool | null = null;
let useOwner = false;
export const dbRestricted = () => !!limited && !useOwner;

/** Erreurs de connexion du rôle limité : mot de passe refusé, rôle inexistant, connexion refusée. */
const isAuthError = (e: unknown) => ['28P01', '28000', '3D000'].includes(String((e as { code?: string })?.code ?? ''));

async function withRole<T>(fn: (p: pg.Pool) => Promise<T>): Promise<T> {
  if (limited && !useOwner) {
    try {
      return await fn(limited);
    } catch (e) {
      if (!isAuthError(e)) throw e;
      useOwner = true;
      console.error('[db] rôle limité refusé : repli sur la connexion d\'origine (vérifier le rôle event509_app)');
    }
  }
  return fn(owner!);
}

/** Pool Postgres (Neon en production), réutilisé entre les requêtes d'une même instance. */
export function db(): pg.Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL manquant');
  if (!facade) {
    owner = poolFor(url);
    const r = restrictedUrl(url);
    limited = r ? poolFor(r) : null;
    facade = {
      query: (...a: unknown[]) => withRole((p) => (p.query as (...x: unknown[]) => Promise<unknown>)(...a)),
      connect: () => withRole((p) => p.connect()),
    } as unknown as pg.Pool;
  }
  return facade;
}

export type Row = Record<string, unknown>;
export type Q = Pick<pg.PoolClient, 'query'>;
export type Client = pg.PoolClient;

export async function all<T = Row>(text: string, params: unknown[] = [], q: Q = db()): Promise<T[]> {
  return (await q.query(text, params)).rows as T[];
}
export async function one<T = Row>(text: string, params: unknown[] = [], q: Q = db()): Promise<T | null> {
  return ((await q.query(text, params)).rows[0] as T) ?? null;
}
/** Liste les objets `data` d'une table. */
export async function docs<T>(text: string, params: unknown[] = [], q: Q = db()): Promise<T[]> {
  return (await all<{ data: T }>(text, params, q)).map((r) => r.data);
}

/**
 * Insère ou remplace une ligne. `table` et les noms de colonnes viennent toujours du code,
 * jamais de la requête : seules les valeurs sont paramétrées.
 */
export async function upsert(table: string, row: Row, q: Q = db()) {
  const cols = Object.keys(row);
  const values = cols.map((c) => (c === 'data' || c === 'value' ? JSON.stringify(row[c]) : row[c]));
  await q.query(
    `insert into ${table} (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')})
     on conflict (${cols[0]}) do update set ${cols.slice(1).map((c) => `${c} = excluded.${c}`).join(', ')}`,
    values,
  );
}

/** Exécute `fn` dans une transaction. */
export async function tx<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = await db().connect();
  try {
    await c.query('begin');
    const out = await fn(c);
    await c.query('commit');
    return out;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
