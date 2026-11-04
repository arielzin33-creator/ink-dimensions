import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp, type Client, type TestApp } from '../helpers/app.js';

let t: TestApp;
let c: Client;
beforeAll(async () => {
  t = await startTestApp();
  c = t.client();
  await c.signUp();
});
afterAll(() => t.close());

describe('projects API', () => {
  it('requires a session', async () => {
    expect((await t.client().get('/api/projects')).status).toBe(401);
  });

  it('creates a project with a path and lists it', async () => {
    const r = await c.post('/api/projects', { title: 'Biscuit Case', path: 'invented' });
    expect(r.status).toBe(201);
    expect(r.body.project).toMatchObject({ title: 'Biscuit Case', path: 'invented', stylePreset: 'manga', plot: '', characters: [] });
    const list = await c.get('/api/projects');
    expect(list.body.projects.map((p: { id: string }) => p.id)).toContain(r.body.project.id);
  });

  it('requires a valid path choice', async () => {
    expect((await c.post('/api/projects', { title: 'No path' })).status).toBe(400);
    expect((await c.post('/api/projects', { title: 'Bad', path: 'video' })).status).toBe(400);
  });

  it('renames, sets the style and saves the plot', async () => {
    const { body } = await c.post('/api/projects', { title: 'Draft', path: 'invented' });
    const r = await c.patch(`/api/projects/${body.project.id}`, { title: 'Final', stylePreset: 'noir', plot: 'A cat solves a case.' });
    expect(r.status).toBe(200);
    expect(r.body.project).toMatchObject({ title: 'Final', stylePreset: 'noir', plot: 'A cat solves a case.' });
    expect((await c.get(`/api/projects/${body.project.id}`)).body.project.plot).toBe('A cat solves a case.');
    expect((await c.patch(`/api/projects/${body.project.id}`, { plot: 'x'.repeat(4001) })).status).toBe(400);
    expect((await c.patch(`/api/projects/${body.project.id}`, { stylePreset: 'anime-studio' })).status).toBe(400);
  });

  it('refuses to change the path', async () => {
    const { body } = await c.post('/api/projects', { title: 'Fixed', path: 'photo' });
    const r = await c.patch(`/api/projects/${body.project.id}`, { path: 'invented' });
    expect(r.status).toBe(409);
    expect((await c.get(`/api/projects/${body.project.id}`)).body.project.path).toBe('photo');
  });

  it('refuses a harmful plot about real people at save time', async () => {
    const { body } = await c.post('/api/projects', { title: 'Family', path: 'photo' });
    const r = await c.patch(`/api/projects/${body.project.id}`, { plot: 'Uncle Bob is arrested for fraud.' });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('refused_by_moderation');
    expect(r.body.error.details.reasons).toContain('defamatory');
  });

  it('deletes a project', async () => {
    const { body } = await c.post('/api/projects', { title: 'Temp', path: 'invented' });
    expect((await c.del(`/api/projects/${body.project.id}`)).status).toBe(204);
    expect((await c.get(`/api/projects/${body.project.id}`)).status).toBe(404);
    expect((await c.get('/api/projects/not-a-uuid')).status).toBe(404);
  });

  it('lists the five style presets', async () => {
    const r = await t.client().get('/api/styles');
    expect(r.body.styles.map((s: { id: string }) => s.id)).toEqual(['manga', 'noir', 'western', 'watercolor', 'line-art']);
  });
});
