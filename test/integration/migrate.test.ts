import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openPglite, type Db } from '../../src/server/db.js';
import { listMigrations, migrate } from '../../src/server/migrate.js';

let db: Db | undefined;
afterEach(async () => {
  await db?.close();
  db = undefined;
});

describe('migration runner', () => {
  it('applies migrations once; a second run is a no-op', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mig-'));
    writeFileSync(join(dir, '0001_a.sql'), 'CREATE TABLE a (id int PRIMARY KEY);');
    writeFileSync(join(dir, '0002_b.sql'), 'ALTER TABLE a ADD COLUMN note text; CREATE TABLE b (id int);');
    writeFileSync(join(dir, 'README.txt'), 'ignored');
    db = await openPglite('memory://');
    expect((await migrate(db, dir)).applied).toEqual(['0001_a.sql', '0002_b.sql']);
    expect(await migrate(db, dir)).toEqual({ applied: [], skipped: ['0001_a.sql', '0002_b.sql'] });
    await db.query('INSERT INTO a (id, note) VALUES (1, $1)', ['x']);
  });

  it('rejects a migration that changed after it was applied', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mig-'));
    writeFileSync(join(dir, '0001_a.sql'), 'CREATE TABLE a (id int);');
    db = await openPglite('memory://');
    await migrate(db, dir);
    writeFileSync(join(dir, '0001_a.sql'), 'CREATE TABLE a (id bigint);');
    await expect(migrate(db, dir)).rejects.toThrow(/changed after it was applied/);
  });

  it('rolls back a failing migration', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mig-'));
    writeFileSync(join(dir, '0001_bad.sql'), 'CREATE TABLE c (id int); SELECT * FROM missing_table;');
    db = await openPglite('memory://');
    await expect(migrate(db, dir)).rejects.toThrow();
    const { rows } = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name = 'c'");
    expect(rows[0]?.n).toBe(0);
  });

  it('applies the repository migrations in order', async () => {
    const dir = join(import.meta.dirname, '../../migrations');
    const files = listMigrations(dir).map((m) => m.version);
    expect(files).toEqual([...files].sort((x, y) => x - y));
    db = await openPglite('memory://');
    const r = await migrate(db, dir);
    expect(r.applied.length).toBe(files.length);
  });
});
