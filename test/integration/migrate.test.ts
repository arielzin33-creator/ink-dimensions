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

describe('0001 users and sessions', () => {
  it('enforces lower-case unique emails and cascades sessions', async () => {
    db = await openPglite('memory://');
    await migrate(db, join(import.meta.dirname, '../../migrations'));
    const id = '00000000-0000-4000-8000-000000000001';
    await db.query('INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)', [id, 'a@example.com', 'h']);
    await expect(
      db.query('INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)', ['00000000-0000-4000-8000-000000000002', 'a@example.com', 'h']),
    ).rejects.toThrow();
    await expect(
      db.query('INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)', ['00000000-0000-4000-8000-000000000003', 'B@example.com', 'h']),
    ).rejects.toThrow();
    await db.query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ('t', $1, now() + interval '1 day')", [id]);
    await db.query('DELETE FROM users WHERE id = $1', [id]);
    const { rows } = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM sessions');
    expect(rows[0]?.n).toBe(0);
  });
});

describe('0002 and 0003 project tables', () => {
  it('requires consent on photos, limits job status and cascades from users', async () => {
    db = await openPglite('memory://');
    await migrate(db, join(import.meta.dirname, '../../migrations'));
    const u = '00000000-0000-4000-8000-0000000000aa';
    const p = '00000000-0000-4000-8000-0000000000bb';
    const c = '00000000-0000-4000-8000-0000000000cc';
    await db.query("INSERT INTO users (id, email, password_hash) VALUES ($1, 'x@example.com', 'h')", [u]);
    await db.query("INSERT INTO projects (id, user_id, title, path) VALUES ($1, $2, 'T', 'photo')", [p, u]);
    await expect(db.query("INSERT INTO projects (id, user_id, title, path) VALUES (gen_random_uuid(), $1, 'T', 'video')", [u])).rejects.toThrow();
    await db.query("INSERT INTO characters (id, project_id, name) VALUES ($1, $2, 'Mo')", [c, p]);
    const img = (kind: string, consent: string | null, key: string) =>
      db!.query(
        "INSERT INTO character_images (id, character_id, project_id, kind, storage_key, content_type, byte_size, consent_at) VALUES (gen_random_uuid(), $1, $2, $3, $4, 'image/png', 10, $5)",
        [c, p, kind, key, consent],
      );
    await expect(img('photo', null, 'k1')).rejects.toThrow(/character_images_photo_consent/);
    await img('photo', new Date().toISOString(), 'k2');
    await img('reference', null, 'k3');
    await db.query("INSERT INTO scripts (project_id, content) VALUES ($1, '{\"pages\":[]}'::jsonb)", [p]);
    await expect(
      db.query("INSERT INTO render_jobs (id, project_id, user_id, status, panel_ids) VALUES (gen_random_uuid(), $1, $2, 'paused', '[]'::jsonb)", [p, u]),
    ).rejects.toThrow();
    await db.query('DELETE FROM users WHERE id = $1', [u]);
    for (const t of ['projects', 'characters', 'character_images', 'scripts', 'render_jobs']) {
      const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${t}`);
      expect(rows[0]?.n, t).toBe(0);
    }
  });
});

describe('migration hygiene (NFR-008)', () => {
  const DESTRUCTIVE = /\b(DROP\s+(TABLE|COLUMN|INDEX|CONSTRAINT|SCHEMA|TYPE|VIEW)|RENAME\s+(TO|COLUMN|CONSTRAINT)|SET\s+NOT\s+NULL|TRUNCATE)\b/i;

  it('marks every destructive migration with -- factory:contract on its first line', () => {
    const dir = join(import.meta.dirname, '../../migrations');
    for (const m of listMigrations(dir)) {
      const code = m.sql.replace(/--.*$/gm, '');
      if (DESTRUCTIVE.test(code)) expect(m.sql.split('\n')[0]?.trim(), m.name).toBe('-- factory:contract');
    }
  });

  it('v1 has no destructive migrations at all', () => {
    const dir = join(import.meta.dirname, '../../migrations');
    expect(listMigrations(dir).filter((m) => DESTRUCTIVE.test(m.sql.replace(/--.*$/gm, ''))).map((m) => m.name)).toEqual([]);
  });

  it('the guard recognises destructive statements', () => {
    expect(DESTRUCTIVE.test('ALTER TABLE a DROP COLUMN b;')).toBe(true);
    expect(DESTRUCTIVE.test('ALTER TABLE a ALTER COLUMN b SET NOT NULL;')).toBe(true);
    expect(DESTRUCTIVE.test('ALTER TABLE a RENAME TO c;')).toBe(true);
    expect(DESTRUCTIVE.test('ALTER TABLE a ADD COLUMN b text;')).toBe(false);
  });
});
