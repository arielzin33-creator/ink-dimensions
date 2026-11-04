// Forward-only migration runner. Files are migrations/NNNN_name.sql, applied in order, each
// in its own transaction under an advisory lock. An applied file must never change: its
// checksum is recorded and a mismatch stops start-up. Write expand/contract migrations
// (add nullable or defaulted columns first; drop only after the code stops using them).
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Db } from './db.js';

const FILE = /^(\d{4})_([a-z0-9_]+)\.sql$/;
const LOCK_KEY = 727001;

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

export function listMigrations(dir: string): Array<{ version: number; name: string; sql: string; checksum: string }> {
  const files = readdirSync(dir).filter((f) => FILE.test(f)).sort();
  const seen = new Set<number>();
  return files.map((f) => {
    const m = FILE.exec(f) as RegExpExecArray;
    const version = Number(m[1]);
    if (seen.has(version)) throw new Error(`duplicate migration version ${version}`);
    seen.add(version);
    const sql = readFileSync(join(dir, f), 'utf8');
    return { version, name: f, sql, checksum: createHash('sha256').update(sql).digest('hex') };
  });
}

export async function migrate(db: Db, dir: string): Promise<MigrationResult> {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version integer PRIMARY KEY,
    name text NOT NULL,
    checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const result: MigrationResult = { applied: [], skipped: [] };
  for (const m of listMigrations(dir)) {
    await db.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY]);
      const { rows } = await tx.query<{ checksum: string }>('SELECT checksum FROM schema_migrations WHERE version = $1', [m.version]);
      const existing = rows[0];
      if (existing) {
        if (existing.checksum !== m.checksum) {
          throw new Error(`migration ${m.name} was changed after it was applied; write a new migration instead`);
        }
        result.skipped.push(m.name);
        return;
      }
      await tx.exec(m.sql);
      await tx.query('INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)', [m.version, m.name, m.checksum]);
      result.applied.push(m.name);
    });
  }
  return result;
}

async function main(): Promise<void> {
  const { loadConfig } = await import('./config.js');
  const { openDb } = await import('./db.js');
  const { createLogger } = await import('./logger.js');
  const config = loadConfig();
  const log = createLogger({ level: config.logLevel, release: config.release });
  const db = await openDb(config);
  try {
    const r = await migrate(db, config.migrationsDir);
    log.info('migrations', { db: db.kind, applied: r.applied, skipped: r.skipped.length });
  } finally {
    await db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    process.stderr.write(`migration failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
