import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ProviderError } from '../../src/providers/errors.js';
import { startTestApp, type TestApp } from '../helpers/app.js';

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
});
afterAll(() => t.close());

describe('GET /metrics.json', () => {
  it('reports release, uptime and counters without auth or personal data', async () => {
    const c = t.client();
    const email = 'metrics-person@example.com';
    await c.signUp(email);
    const r = await t.client().get('/metrics.json');
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(['errors_total', 'jobs', 'release', 'requests_total', 'uptime_s']);
    expect(r.body.release).toBe('test-release');
    expect(r.body.uptime_s).toBeGreaterThanOrEqual(0);
    expect(r.body.requests_total).toBeGreaterThanOrEqual(1);
    expect(r.body.jobs).toEqual({ queued: 0, running: 0, failed_total: 0 });
    expect(r.text).not.toContain(email);
    expect(r.text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  it('counts requests, 5xx errors and queued and failed jobs', async () => {
    const before = (await t.client().get('/metrics.json')).body;
    const c = t.client();
    await c.signUp();
    const id = (await c.post('/api/projects', { title: 'M', path: 'invented' })).body.project.id;
    await c.patch(`/api/projects/${id}`, { plot: 'Something happens.' });
    await c.post(`/api/projects/${id}/characters`, { name: 'Mo', description: 'cat' });
    await c.post(`/api/projects/${id}/script/generate`, { pages: 1 });
    await c.post(`/api/projects/${id}/render`, {});
    const queued = (await t.client().get('/metrics.json')).body;
    expect(queued.jobs.queued).toBe(1);
    expect(queued.requests_total).toBeGreaterThanOrEqual(before.requests_total + 7);

    const real = t.providers.image;
    t.providers.image = { name: 'broken', acceptsPhotos: true, render: async () => Promise.reject(new ProviderError('hosted', 'down')) };
    await t.app.runner.drain();
    t.providers.image = real;

    const realPing = t.db.ping;
    t.db.ping = async () => {
      throw new Error('down');
    };
    await t.client().get('/readyz'); // 503 counts as a server error
    t.db.ping = realPing;

    const after = (await t.client().get('/metrics.json')).body;
    expect(after.jobs).toEqual({ queued: 0, running: 0, failed_total: before.jobs.failed_total + 1 });
    expect(after.errors_total).toBe(before.errors_total + 1);
  });
});
