import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FeatureFlags } from '../../src/server/flags.js';
import { startTestApp, type Client, type TestApp } from '../helpers/app.js';
import { pngUpload } from '../helpers/images.js';

const state = { photo: true, render: true };
const flags: FeatureFlags = { photoPathEnabled: async () => state.photo, renderEnabled: async () => state.render };
let t: TestApp;
let c: Client;
let photoProject: string;
let characterId: string;
let inventedProject: string;

beforeAll(async () => {
  t = await startTestApp({ flags });
  c = t.client();
  await c.signUp();
  photoProject = (await c.post('/api/projects', { title: 'Family', path: 'photo' })).body.project.id;
  await c.patch(`/api/projects/${photoProject}`, { plot: 'Gran plants tulips.' });
  characterId = (await c.post(`/api/projects/${photoProject}/characters`, { name: 'Gran', image: pngUpload(), consent: true })).body.character.id;
  await c.post(`/api/projects/${photoProject}/script/generate`, { pages: 1 });
  inventedProject = (await c.post('/api/projects', { title: 'Cats', path: 'invented' })).body.project.id;
  await c.patch(`/api/projects/${inventedProject}`, { plot: 'Mo naps.' });
  await c.post(`/api/projects/${inventedProject}/characters`, { name: 'Mo', description: 'cat' });
  await c.post(`/api/projects/${inventedProject}/script/generate`, { pages: 1 });
});
afterAll(() => t.close());

describe('feature flags', () => {
  it('reports the flags to the UI', async () => {
    state.photo = false;
    expect((await t.client().get('/api/features')).body).toEqual({ photoPathEnabled: false, renderEnabled: true });
    state.photo = true;
  });

  it('with photo-path-enabled off: refuses new photo work, keeps reads, exports and deletes', async () => {
    state.photo = false;
    try {
      const create = await c.post('/api/projects', { title: 'New family', path: 'photo' });
      expect(create.status).toBe(403);
      expect(create.body.error.code).toBe('feature_disabled');
      expect((await c.post(`/api/projects/${photoProject}/characters/${characterId}/images`, { kind: 'photo', consent: true, ...pngUpload() })).status).toBe(403);
      expect((await c.post(`/api/projects/${photoProject}/characters`, { name: 'Dad', image: pngUpload(), consent: true })).status).toBe(403);
      expect((await c.post(`/api/projects/${photoProject}/script/generate`, { pages: 1 })).status).toBe(403);
      expect((await c.post(`/api/projects/${photoProject}/render`, {})).status).toBe(403);
      // Reading, exporting and deleting still work.
      expect((await c.get(`/api/projects/${photoProject}`)).status).toBe(200);
      expect((await c.get(`/api/projects/${photoProject}/pages/1.svg`)).status).toBe(200);
      expect((await c.get(`/api/projects/${photoProject}/export/print.html`)).status).toBe(200);
      const img = (await c.get(`/api/projects/${photoProject}`)).body.project.characters[0].images[0].id;
      expect((await c.del(`/api/projects/${photoProject}/characters/${characterId}/images/${img}`)).status).toBe(200);
      // The invented path is unaffected.
      expect((await c.post('/api/projects', { title: 'More cats', path: 'invented' })).status).toBe(201);
      expect((await c.post(`/api/projects/${inventedProject}/render`, {})).status).toBe(202);
      await t.app.runner.drain();
    } finally {
      state.photo = true;
    }
  });

  it('with render-enabled off: refuses new render jobs with 503', async () => {
    state.render = false;
    try {
      const r = await c.post(`/api/projects/${inventedProject}/render`, {});
      expect(r.status).toBe(503);
      expect(r.body.error.code).toBe('feature_disabled');
    } finally {
      state.render = true;
    }
    expect((await c.post(`/api/projects/${inventedProject}/render`, {})).status).toBe(202);
    await t.app.runner.drain();
  });
});
