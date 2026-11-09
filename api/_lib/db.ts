import pg from 'pg';

let pool: pg.Pool | null = null;

/** Pool Postgres (Neon en production), réutilisé entre les requêtes d'une même instance. */
export function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL manquant');
  pool ??= new pg.Pool({
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 10_000,
    // Neon exige TLS ; une base locale de test n'en a pas
    ssl: /localhost|127\.0\.0\.1|host=\/tmp/.test(url) ? undefined : { rejectUnauthorized: true },
  });
  return pool;
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
