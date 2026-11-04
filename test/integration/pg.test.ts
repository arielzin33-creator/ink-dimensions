// Runs only when TEST_DATABASE_URL points at a PostgreSQL server where the user may create
// databases (for example postgres://postgres@127.0.0.1:5432/postgres). It creates a throwaway
// database, applies the migrations through `pg`, runs a smoke flow and drops the database.
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openPg } from '../../src/server/db.js';
import { migrate } from '../../src/server/migrate.js';
import { startTestApp } from '../helpers/app.js';

const admin = process.env.TEST_DATABASE_URL;

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
});
