// Runs only when TEST_DATABASE_URL points at a PostgreSQL server where the user may create
// databases (for example postgres://postgres@127.0.0.1:5432/postgres). It creates a throwaway
// database, applies the migrations through `pg`, runs a smoke flow and drops the database.
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openPg, type Db } from '../../src/server/db.js';
import { migrate } from '../../src/server/migrate.js';
import { startTestApp, type Client } from '../helpers/app.js';

const admin = process.env.TEST_DATABASE_URL;
const SETUP = 'setup-code-0123456789-0123456789-abcdef';

/** Runs `fn` against a freshly created, migrated, throwaway database, then drops it. */
async function withThrowawayDb(fn: (db: Db) => Promise<void>): Promise<void> {
  const name = `ink_test_${randomBytes(4).toString('hex')}`;
  const root = await openPg(admin as string);
  await root.exec(`CREATE DATABASE ${name}`);
  const url = new URL(admin as string);
  url.pathname = `/${name}`;
  const db = await openPg(url.toString());
  try {
    await migrate(db, join(import.meta.dirname, '../../migrations'));
    await fn(db);
  } finally {
    await root.exec(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await root.close();
  }
}

describe.skipIf(!admin)('PostgreSQL via pg (TEST_DATABASE_URL)', () => {
  it('applies the migrations twice and runs the invented path end to end', async () => {
    const name = `ink_test_${randomBytes(4).toString('hex')}`;
    const root = await openPg(admin as string);
    await root.exec(`CREATE DATABASE ${name}`);
    const url = new URL(admin as string);
    url.pathname = `/${name}`;
    const db = await openPg(url.toString());
    try {
      const dir = join(import.meta.dirname, '../../migrations');
      expect((await migrate(db, dir)).applied.length).toBeGreaterThan(0);
      expect((await migrate(db, dir)).applied).toEqual([]);
      const t = await startTestApp({ db });
      try {
        const c = t.client();
        expect((await c.signUp()).status).toBe(201);
        const id = (await c.post('/api/projects', { title: 'On Postgres', path: 'invented' })).body.project.id;
        await c.patch(`/api/projects/${id}`, { plot: 'Mo naps. Mo wakes.' });
        await c.post(`/api/projects/${id}/characters`, { name: 'Mo', description: 'a cat' });
        expect((await c.post(`/api/projects/${id}/script/generate`, { pages: 2 })).status).toBe(201);
        expect((await c.post(`/api/projects/${id}/render`, {})).status).toBe(202);
        await t.app.runner.drain();
        expect((await c.get(`/api/projects/${id}/render-jobs/latest`)).body.job.status).toBe('succeeded');
        expect((await c.get(`/api/projects/${id}/export/comic.zip`)).status).toBe(200);
        expect((await c.get('/readyz')).body).toEqual({ status: 'ready', db: 'pg' });
      } finally {
        await t.close(); // closes db
      }
    } finally {
      await root.exec(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await root.close();
    }
  });

  it('holds the concurrency guarantees on real PostgreSQL (SC-101, SC-102, single administrator)', async () => {
    await withThrowawayDb(async (db) => {
      const t = await startTestApp({ db, env: { REGISTRATION_OPEN: 'false', ADMIN_BOOTSTRAP_CODE: SETUP } });
      try {
        const pw = 'correct horse battery';
        const signUp = (c: Client, email: string, invite: string) => c.post('/api/auth/signup', { email, password: pw, ageConfirmed: true, invite });

        // Two simultaneous setup-code sign-ups: exactly one administrator.
        const race = await Promise.all(['pg1@example.com', 'pg2@example.com'].map((e) => signUp(t.client(), e, SETUP)));
        expect(race.map((r) => r.status).sort()).toEqual([201, 403]);
        expect((await db.query('SELECT 1 FROM users WHERE is_admin = true')).rows).toHaveLength(1);
        const adminClient = race.find((r) => r.status === 201) === race[0] ? 'pg1@example.com' : 'pg2@example.com';
        const owner = t.client();
        expect((await owner.post('/api/auth/login', { email: adminClient, password: pw })).status).toBe(200);

        // One invitation, two simultaneous sign-ups: exactly one account.
        const secret = (await owner.post('/api/admin/invites', { email: 'once@example.com' })).body.secret as string;
        const used = await Promise.all([signUp(t.client(), 'once@example.com', secret), signUp(t.client(), 'once@example.com', secret)]);
        expect(used.filter((r) => r.status === 201)).toHaveLength(1);

        // 12 simultaneous generations on a fresh day: exactly 10 succeed, the rest are 429 daily_limit.
        const c = t.client();
        const genSecret = (await owner.post('/api/admin/invites', { email: 'gen@example.com' })).body.secret as string;
        expect((await signUp(c, 'gen@example.com', genSecret)).status).toBe(201);
        const id = (await c.post('/api/projects', { title: 'Limits', path: 'invented' })).body.project.id as string;
        await c.patch(`/api/projects/${id}`, { plot: 'A cat finds a hat.' });
        await c.post(`/api/projects/${id}/characters`, { name: 'Cat', description: 'a grey cat' });
        const rs = await Promise.all(Array.from({ length: 12 }, () => c.post(`/api/projects/${id}/script/generate`, { pages: 1 })));
        expect(rs.filter((r) => r.status === 201)).toHaveLength(10);
        const refused = rs.filter((r) => r.status === 429);
        expect(refused).toHaveLength(2);
        expect(refused.every((r) => r.body.error.code === 'daily_limit')).toBe(true);
      } finally {
        await t.close(); // closes db
      }
    });
  });
});
