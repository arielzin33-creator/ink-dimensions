import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ProviderError } from '../../src/providers/errors.js';
import { usageDay } from '../../src/server/usage.js';
import { startTestApp, type Client, type TestApp } from '../helpers/app.js';

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
});
afterAll(() => t.close());

async function user(): Promise<{ c: Client; id: string }> {
  const c = t.client();
  return { c, id: (await c.signUp()).body.user.id };
}
async function project(c: Client): Promise<string> {
  const id = (await c.post('/api/projects', { title: 'Limits', path: 'invented' })).body.project.id as string;
  await c.patch(`/api/projects/${id}`, { plot: 'A cat finds a hat.' });
  await c.post(`/api/projects/${id}/characters`, { name: 'Cat', description: 'a grey cat' });
  return id;
}
/** A project whose script has exactly `n` panels (costs one script generation). */
async function withPanels(c: Client, n: number): Promise<{ id: string; panelIds: string[] }> {
  const id = await project(c);
  const gen = await c.post(`/api/projects/${id}/script/generate`, { pages: 1 });
  const pages = Array.from({ length: Math.ceil(n / 6) }, (_, i) => ({
    panels: Array.from({ length: Math.min(6, n - i * 6) }, (_, j) => ({ description: `Panel ${i * 6 + j + 1}` })),
  }));
  const saved = await c.put(`/api/projects/${id}/script`, { version: gen.body.version, script: { title: 'L', pages } });
  return { id, panelIds: saved.body.script.pages.flatMap((p: { panels: Array<{ id: string }> }) => p.panels.map((x) => x.id)) };
}
async function used(userId: string, day = usageDay(new Date())) {
  const { rows } = await t.db.query<{ s: number; p: number }>('SELECT script_generations AS s, panels AS p FROM usage_daily WHERE user_id = $1 AND day = $2', [userId, day]);
  return rows[0] ?? { s: 0, p: 0 };
}

describe('daily limits (spec 002 FR-112 – FR-115)', () => {
  it('refuses the 11th generation of the day, says when it resets, and keeps the script (US-3.1)', async () => {
    const { c, id: me } = await user();
    const id = await project(c);
    for (let i = 0; i < 10; i++) expect((await c.post(`/api/projects/${id}/script/generate`, { pages: 1 })).status).toBe(201);
    const before = (await c.get(`/api/projects/${id}/script`)).body.version;
    const r = await c.post(`/api/projects/${id}/script/generate`, { pages: 1 });
    expect(r.status).toBe(429);
    expect(r.body.error).toMatchObject({ code: 'daily_limit', details: { remaining: 0 } });
    expect(r.body.error.message).toContain('00:00 UTC');
    expect((await c.get(`/api/projects/${id}/script`)).body.version).toBe(before);
    expect((await used(me)).s).toBe(10);
  });

  it('holds the generation limit under simultaneous requests (SC-102)', async () => {
    const { c, id: me } = await user();
    const id = await project(c);
    const rs = await Promise.all(Array.from({ length: 15 }, () => c.post(`/api/projects/${id}/script/generate`, { pages: 1 })));
    expect(rs.filter((r) => r.status === 201)).toHaveLength(10);
    expect(rs.filter((r) => r.status === 429)).toHaveLength(5);
    expect((await used(me)).s).toBe(10);
  });

  it('refuses an oversized job whole and says how many panels are left (US-3.2, FR-113)', async () => {
    const { c, id: me } = await user();
    const { id, panelIds } = await withPanels(c, 6);
    // withPanels already created today's row (its script generation counts), so update it.
    await t.db.query('UPDATE usage_daily SET panels = 95 WHERE user_id = $1 AND day = $2', [me, usageDay(new Date())]);
    const r = await c.post(`/api/projects/${id}/render`, { panelIds });
    expect(r.status).toBe(429);
    expect(r.body.error.details.remaining).toBe(5);
    expect(r.body.error.message).toContain('5 panels left');
    expect((await t.db.query('SELECT 1 FROM render_jobs WHERE project_id = $1', [id])).rows).toHaveLength(0);
    expect((await c.post(`/api/projects/${id}/render`, { panelIds: panelIds.slice(0, 5) })).status).toBe(202);
    expect((await used(me)).p).toBe(100);
  });

  it('holds the panel limit when jobs arrive at the same time (SC-102)', async () => {
    const { c, id: me } = await user();
    const projects = [await withPanels(c, 36), await withPanels(c, 36), await withPanels(c, 36)];
    const rs = await Promise.all(projects.map((p) => c.post(`/api/projects/${p.id}/render`, { panelIds: p.panelIds })));
    expect(rs.map((r) => r.status).sort()).toEqual([202, 202, 429]);
    expect((await used(me)).p).toBe(72);
  });

  it('gives back failed panels when the job ends (US-3.3, FR-114)', async () => {
    const { c, id: me } = await user();
    const { id, panelIds } = await withPanels(c, 4);
    const original = t.providers.image;
    t.providers.image = { ...original, render: async (req) => (req.panelId === panelIds[0] ? Promise.reject(new ProviderError('test', 'boom')) : original.render(req)) };
    try {
      expect((await c.post(`/api/projects/${id}/render`, { panelIds })).status).toBe(202);
      await t.app.runner.drain();
    } finally {
      t.providers.image = original;
    }
    expect((await used(me)).p).toBe(3);
  });

  it('gives back a failed generation, and a moderation refusal never counts (FR-114)', async () => {
    const { c, id: me } = await user();
    const id = await project(c);
    const llm = t.providers.llm;
    t.providers.llm = { ...llm, complete: () => Promise.reject(new ProviderError('test', 'down')) };
    try {
      expect((await c.post(`/api/projects/${id}/script/generate`, { pages: 1 })).status).toBe(502);
    } finally {
      t.providers.llm = llm;
    }
    const moderation = t.providers.moderation;
    t.providers.moderation = { ...moderation, check: async () => ({ allowed: false, categories: ['sexual'] }) };
    try {
      expect((await c.post(`/api/projects/${id}/script/generate`, { pages: 1 })).status).toBe(422);
    } finally {
      t.providers.moderation = moderation;
    }
    expect((await used(me)).s).toBe(0);
  });

  it('credits a job that crosses midnight to its own day, and deleting a project gives nothing back (FR-115)', async () => {
    const { c, id: me } = await user();
    const { id, panelIds } = await withPanels(c, 2);
    const job = (await c.post(`/api/projects/${id}/render`, { panelIds })).body.job.id;
    await t.db.query("UPDATE usage_daily SET day = '2000-01-01' WHERE user_id = $1", [me]);
    await t.db.query("UPDATE render_jobs SET usage_day = '2000-01-01' WHERE id = $1", [job]);
    const original = t.providers.image;
    t.providers.image = { ...original, render: () => Promise.reject(new ProviderError('test', 'boom')) };
    try {
      await t.app.runner.drain();
    } finally {
      t.providers.image = original;
    }
    expect((await used(me, '2000-01-01')).p).toBe(0);
    expect((await used(me)).p).toBe(0);

    const kept = await withPanels(c, 3);
    await c.post(`/api/projects/${kept.id}/render`, { panelIds: kept.panelIds });
    await t.app.runner.drain();
    expect((await c.del(`/api/projects/${kept.id}`)).status).toBe(204);
    expect((await used(me)).p).toBe(3);
  });
});
