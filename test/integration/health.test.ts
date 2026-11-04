import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp, type TestApp } from '../helpers/app.js';

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
});
afterAll(() => t.close());

describe('health endpoints', () => {
  it('reports liveness with the release', async () => {
    const r = await t.client().get('/healthz');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ status: 'ok', release: 'test-release' });
  });

  it('reports readiness while the database is reachable, and 503 when it is not', async () => {
    const ok = await t.client().get('/readyz');
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ status: 'ready', db: 'pglite' });
    const realPing = t.db.ping;
    t.db.ping = async () => {
      throw new Error('connection refused');
    };
    try {
      const down = await t.client().get('/readyz');
      expect(down.status).toBe(503);
      expect(down.body).toEqual({ status: 'unavailable' });
    } finally {
      t.db.ping = realPing;
    }
  });
});
