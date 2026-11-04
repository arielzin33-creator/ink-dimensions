import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ImageProvider, PanelRenderRequest } from '../../src/providers/image/types.js';
import { ProviderError } from '../../src/providers/errors.js';
import { createRenderRunner } from '../../src/server/render-runner.js';
import { createLogger } from '../../src/server/logger.js';
import { startTestApp, type Client, type TestApp } from '../helpers/app.js';
import { pngUpload } from '../helpers/images.js';

let t: TestApp;
let c: Client;
const seen: PanelRenderRequest[] = [];
let failPanel: string | undefined;

beforeAll(async () => {
  t = await startTestApp();
  const twin = t.providers.image;
  const spy: ImageProvider = {
    name: 'spy-twin',
    acceptsPhotos: false,
    async render(req) {
      seen.push(req);
      if (req.panelId === failPanel) throw new ProviderError('hosted', 'HTTP 500: boom', 500);
      return twin.render(req);
    },
  };
  t.providers.image = spy;
  c = t.client();
  await c.signUp();
});
afterAll(() => t.close());

async function projectWithScript(path: 'invented' | 'photo' = 'invented') {
  const id = (await c.post('/api/projects', { title: 'Render me', path })).body.project.id as string;
  await c.patch(`/api/projects/${id}`, { plot: 'Mo finds a clue. Ada helps.', stylePreset: 'line-art' });
  if (path === 'photo') {
    await c.post(`/api/projects/${id}/characters`, { name: 'Mo', image: pngUpload(), consent: true });
  } else {
    await c.post(`/api/projects/${id}/characters`, { name: 'Mo', description: 'a grey cat', image: pngUpload() });
    await c.post(`/api/projects/${id}/characters`, { name: 'Ada', description: 'a curious girl' });
  }
  const script = (await c.post(`/api/projects/${id}/script/generate`, { pages: 1 })).body;
  return { id, script };
}

describe('render jobs', () => {
  it('returns 202 with a job and progresses to succeeded', async () => {
    const { id, script } = await projectWithScript();
    const r = await c.post(`/api/projects/${id}/render`, {});
    expect(r.status).toBe(202);
    expect(r.body.job).toMatchObject({ status: 'queued', total: 3, done: 0 });
    const again = await c.post(`/api/projects/${id}/render`, {});
    expect(again.status).toBe(409);
    expect(again.body.error.details.jobId).toBe(r.body.job.id);
    await t.app.runner.drain();
    const job = (await c.get(`/api/projects/${id}/render-jobs/${r.body.job.id}`)).body.job;
    expect(job).toMatchObject({ status: 'succeeded', total: 3, done: 3, failed: 0, error: null });
    expect((await c.get(`/api/projects/${id}/render-jobs/latest`)).body.job.id).toBe(job.id);
    const panelId = script.script.pages[0].panels[0].id;
    const img = await c.get(`/api/projects/${id}/panels/${panelId}/image`);
    expect(img.status).toBe(200);
    expect(img.headers.get('content-type')).toBe('image/svg+xml');
    expect(img.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(img.text).toContain('Placeholder · Line-art');
    const status = (await c.get(`/api/projects/${id}/script`)).body.panels;
    expect(status.every((p: { rendered: boolean }) => p.rendered)).toBe(true);
  });

  it('builds the image request from the style, description and characters, with the project references', async () => {
    seen.length = 0;
    const { id } = await projectWithScript();
    await c.post(`/api/projects/${id}/render`, {});
    await t.app.runner.drain();
    const first = seen[0] as PanelRenderRequest;
    expect(first.prompt).toContain('line art');
    expect(first.prompt).toContain('Mo (a grey cat)');
    expect(first.characters.map((x) => x.name).sort()).toEqual(['Ada', 'Mo']);
    expect(first.references).toHaveLength(1);
    expect(first.references[0]).toMatchObject({ characterName: 'Mo', kind: 'reference' });
    expect(first.width).toBe(800);
  });

  it('never sends photos to a provider that does not accept them (FR-022)', async () => {
    seen.length = 0;
    const { id } = await projectWithScript('photo');
    await c.post(`/api/projects/${id}/render`, {});
    await t.app.runner.drain();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((s) => s.references.length === 0)).toBe(true);
  });

  it('records per-panel failure without losing successes, then re-renders one panel', async () => {
    const { id, script } = await projectWithScript();
    const panels = script.script.pages[0].panels;
    failPanel = panels[1].id;
    const r = await c.post(`/api/projects/${id}/render`, {});
    await t.app.runner.drain();
    const job = (await c.get(`/api/projects/${id}/render-jobs/${r.body.job.id}`)).body.job;
    expect(job).toMatchObject({ status: 'failed', done: 2, failed: 1 });
    expect(job.results[1]).toMatchObject({ status: 'failed', error: 'The image generator failed for this panel. Try again.' });
    expect((await c.get(`/api/projects/${id}/panels/${panels[1].id}/image`)).status).toBe(404);
    failPanel = undefined;
    const before = (await c.get(`/api/projects/${id}/script`)).body.panels;
    const one = await c.post(`/api/projects/${id}/render`, { panelIds: [panels[1].id] });
    expect(one.body.job.total).toBe(1);
    await t.app.runner.drain();
    const after = (await c.get(`/api/projects/${id}/script`)).body.panels;
    expect(after.every((p: { rendered: boolean }) => p.rendered)).toBe(true);
    expect(after[0].renderedAt).toBe(before[0].renderedAt);
  });

  it('rejects unknown panels, a missing script and too many panels', async () => {
    const id = (await c.post('/api/projects', { title: 'No script', path: 'invented' })).body.project.id;
    expect((await c.post(`/api/projects/${id}/render`, {})).status).toBe(400);
    const { id: withScript } = await projectWithScript();
    expect((await c.post(`/api/projects/${withScript}/render`, { panelIds: ['11111111-1111-4111-8111-111111111111'] })).status).toBe(400);
    const tooMany = Array.from({ length: 37 }, (_x, i) => `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`);
    expect((await c.post(`/api/projects/${withScript}/render`, { panelIds: tooMany })).status).toBe(400);
  });

  it('moderates panels before rendering on the photo path', async () => {
    const { id, script } = await projectWithScript('photo');
    // Bypass the edit-time check to prove the render-time check on its own.
    script.script.pages[0].panels[0].description = 'Mo is stabbed in the alley.';
    await t.db.query('UPDATE scripts SET content = $2::jsonb WHERE project_id = $1', [id, JSON.stringify(script.script)]);
    const r = await c.post(`/api/projects/${id}/render`, {});
    expect(r.status).toBe(422);
  });

  it('resumes jobs interrupted by a restart', async () => {
    const { id } = await projectWithScript();
    const r = await c.post(`/api/projects/${id}/render`, {});
    await t.db.query("UPDATE render_jobs SET status = 'running' WHERE id = $1", [r.body.job.id]);
    const restarted = createRenderRunner(
      { config: {} as never, db: t.db, log: createLogger({ level: 'silent', release: 't' }), providers: t.providers },
      { autoRun: false },
    );
    expect(await restarted.recover()).toBe(1);
    await restarted.drain();
    expect((await c.get(`/api/projects/${id}/render-jobs/${r.body.job.id}`)).body.job.status).toBe('succeeded');
  });

  it('fails the job cleanly if the project is deleted before it runs', async () => {
    const { id } = await projectWithScript();
    const r = await c.post(`/api/projects/${id}/render`, {});
    const userId = (await c.get('/api/auth/me')).body.user.id;
    await c.del(`/api/projects/${id}`);
    await t.app.runner.drain();
    expect(await t.providers.storage.list(`u/${userId}/p/${id}/`)).toEqual([]);
    const { rows } = await t.db.query('SELECT 1 FROM render_jobs WHERE id = $1', [r.body.job.id]);
    expect(rows).toHaveLength(0);
  });
});
