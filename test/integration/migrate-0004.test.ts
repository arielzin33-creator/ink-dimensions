import { copyFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openPglite, type Db } from '../../src/server/db.js';
import { migrate } from '../../src/server/migrate.js';

const MIGRATIONS = join(import.meta.dirname, '../../migrations');
const U = '00000000-0000-4000-8000-0000000000a1';
const V = '00000000-0000-4000-8000-0000000000a2';
const P = '00000000-0000-4000-8000-0000000000b1';
const C = '00000000-0000-4000-8000-0000000000c1';

let db: Db | undefined;
afterEach(async () => {
  await db?.close();
  db = undefined;
});

function upTo0003(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mig-'));
  for (const f of readdirSync(MIGRATIONS).filter((f) => /^000[1-3]_.*\.sql$/.test(f))) copyFileSync(join(MIGRATIONS, f), join(dir, f));
  return dir;
}

describe('0004 invitations, limits and retention', () => {
  it('gives projects that existed before it a current last_activity_at and no warning', async () => {
    db = await openPglite('memory://');
    await migrate(db, upTo0003());
    await db.query("INSERT INTO users (id, email, password_hash) VALUES ($1, 'a@example.com', 'h')", [U]);
    await db.query("INSERT INTO projects (id, user_id, title, path) VALUES ($1, $2, 'T', 'photo')", [P, U]);
    expect((await migrate(db, MIGRATIONS)).applied).toEqual(['0004_invites_limits_retention.sql']);
    const { rows } = await db.query<{ recent: boolean; warned: unknown }>(
      "SELECT last_activity_at > now() - interval '1 minute' AS recent, retention_warned_at AS warned FROM projects WHERE id = $1",
      [P],
    );
    expect(rows[0]).toEqual({ recent: true, warned: null });
  });

  it('enforces guardian confirmations, one live invitation per email and one administrator', async () => {
    db = await openPglite('memory://');
    await migrate(db, MIGRATIONS);
    await db.query("INSERT INTO users (id, email, password_hash, is_admin) VALUES ($1, 'a@example.com', 'h', true)", [U]);
    await expect(
      db.query("INSERT INTO users (id, email, password_hash, is_admin) VALUES (gen_random_uuid(), 'b@example.com', 'h', true)"),
    ).rejects.toThrow(/users_single_admin/);

    await db.query("INSERT INTO projects (id, user_id, title, path) VALUES ($1, $2, 'T', 'photo')", [P, U]);
    await db.query("INSERT INTO characters (id, project_id, name) VALUES ($1, $2, 'Mo')", [C, P]);
    const photo = (minor: boolean, guardian: Date | null, key: string) =>
      db!.query(
        `INSERT INTO character_images (id, character_id, project_id, kind, storage_key, content_type, byte_size, consent_at, subject_minor, guardian_confirmed_at)
         VALUES (gen_random_uuid(), $1, $2, 'photo', $3, 'image/png', 10, now(), $4, $5)`,
        [C, P, key, minor, guardian],
      );
    await expect(photo(true, null, 'k1')).rejects.toThrow(/character_images_minor_guardian/);
    await photo(true, new Date(), 'k2');
    await photo(false, null, 'k3');

    const invite = (email: string, hash: string) =>
      db!.query<{ id: string }>(
        "INSERT INTO invites (id, email, token_hash, created_by, expires_at) VALUES (gen_random_uuid(), $1, $2, $3, now() + interval '14 days') RETURNING id",
        [email, hash, U],
      );
    const first = (await invite('c@example.com', 'h1')).rows[0]!;
    await expect(invite('c@example.com', 'h2')).rejects.toThrow(/invites_live_email_key/);
    await db.query('UPDATE invites SET revoked_at = now() WHERE id = $1', [first.id]);
    await invite('c@example.com', 'h3');

    // An invitation used by an account goes with that account (FR-108); usage goes with the user (FR-115).
    await db.query("INSERT INTO users (id, email, password_hash) VALUES ($1, 'c@example.com', 'h')", [V]);
    await db.query("UPDATE invites SET used_at = now(), used_by = $1 WHERE token_hash = 'h3'", [V]);
    await db.query("INSERT INTO usage_daily (user_id, day, panels) VALUES ($1, '2026-11-17', 5)", [V]);
    await db.query('DELETE FROM users WHERE id = $1', [V]);
    expect((await db.query("SELECT 1 FROM invites WHERE token_hash = 'h3'")).rows).toHaveLength(0);
    expect((await db.query('SELECT 1 FROM usage_daily')).rows).toHaveLength(0);
    await db.query("INSERT INTO render_jobs (id, project_id, user_id, panel_ids, usage_day) VALUES (gen_random_uuid(), $1, $2, '[]'::jsonb, '2026-11-17')", [P, U]);
  });
});
