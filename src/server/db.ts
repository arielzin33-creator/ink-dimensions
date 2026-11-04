// Database access: one small interface over `pg` (production) and PGlite (tests and
// zero-setup development). Both speak the same PostgreSQL SQL.
import { mkdirSync } from 'node:fs';

export type Row = Record<string, unknown>;

export interface Queryable {
  query<T = Row>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<void>;
}

export interface Db extends Queryable {
  readonly kind: 'pg' | 'pglite';
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  ping(): Promise<void>;
  close(): Promise<void>;
}

export async function openPglite(dataDir: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  const memory = dataDir === 'memory://' || dataDir === '';
  if (!memory) mkdirSync(dataDir, { recursive: true });
  const pg = memory ? new PGlite() : new PGlite(dataDir);
  await pg.waitReady;
  let closed = false;
  const guard = () => {
    if (closed) throw new Error('database is closed');
  };
  return {
    kind: 'pglite',
    async query<T>(sql: string, params: unknown[] = []) {
      guard();
      const r = await pg.query<T>(sql, params);
      return { rows: r.rows };
    },
    async exec(sql: string) {
      guard();
      await pg.exec(sql);
    },
    async transaction<T>(fn: (tx: Queryable) => Promise<T>) {
      guard();
      return pg.transaction(async (tx) =>
        fn({
          query: async <R>(sql: string, params: unknown[] = []) => ({ rows: (await tx.query<R>(sql, params)).rows }),
          exec: async (sql: string) => {
            await tx.exec(sql);
          },
        }),
      );
    },
    async ping() {
      guard();
      await pg.query('SELECT 1');
    },
    async close() {
      if (closed) return;
      closed = true;
      await pg.close();
    },
  };
}

export async function openPg(connectionString: string, onIdleError?: (err: Error) => void): Promise<Db> {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000 });
  // An idle client can be terminated by the server (restart, failover). Without a listener the
  // pool's 'error' event would crash the process; the pool replaces the client on next use.
  pool.on('error', (err) => onIdleError?.(err));
  return {
    kind: 'pg',
    async query<T>(sql: string, params: unknown[] = []) {
      const r = await pool.query(sql, params);
      return { rows: r.rows as T[] };
    },
    async exec(sql: string) {
      await pool.query(sql);
    },
    async transaction<T>(fn: (tx: Queryable) => Promise<T>) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({
          query: async <R>(sql: string, params: unknown[] = []) => ({ rows: (await client.query(sql, params)).rows as R[] }),
          exec: async (sql: string) => {
            await client.query(sql);
          },
        });
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
    async ping() {
      await pool.query('SELECT 1');
    },
    async close() {
      await pool.end();
    },
  };
}

export function openDb(opts: { databaseUrl: string | undefined; pgliteDir: string }, onIdleError?: (err: Error) => void): Promise<Db> {
  return opts.databaseUrl ? openPg(opts.databaseUrl, onIdleError) : openPglite(opts.pgliteDir);
}
