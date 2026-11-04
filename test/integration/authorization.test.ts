// SC-002: one account can never read, change or delete another account's project resources.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp, type Client, type TestApp } from '../helpers/app.js';
import { pngUpload } from '../helpers/images.js';

let t: TestApp;
let alice: Client;
let bob: Client;
const a: Record<string, string> = {};

beforeAll(async () => {
  t = await startTestApp();
  alice = t.client();
  bob = t.client();
  await alice.signUp('alice@example.com');
  await bob.signUp('bob@example.com');
  a.project = (await alice.post('/api/projects', { title: 'Alice family', path: 'photo' })).body.project.id;
  await alice.patch(`/api/projects/${a.project}`, { plot: 'Alice and Gran bake bread.' });
  const ch = (await alice.post(`/api/projects/${a.project}/characters`, { name: 'Gran', image: pngUpload(), consent: true })).body.character;
  a.character = ch.id;
  a.image = ch.images[0].id;
  const script = (await alice.post(`/api/projects/${a.project}/script/generate`, { pages: 1 })).body;
  a.version = String(script.version);
  a.panel = script.script.pages[0].panels[0].id;
  a.job = (await alice.post(`/api/projects/${a.project}/render`, {})).body.job.id;
  await t.app.runner.drain();
  a.scriptJson = JSON.stringify(script.script);
});
afterAll(() => t.close());

describe('per-user authorisation', () => {
  it('lets the owner reach every resource (control)', async () => {
    expect((await alice.get(`/api/projects/${a.project}/panels/${a.panel}/image`)).status).toBe(200);
    expect((await alice.get(`/api/projects/${a.project}/characters/${a.character}/images/${a.image}`)).status).toBe(200);
  });

  it('does not list another user’s projects', async () => {
    const list = await bob.get('/api/projects');
    expect(list.body.projects).toEqual([]);
  });

  const routes = (): Array<[string, string, unknown?]> => [
    ['GET', `/api/projects/${a.project}`],
    ['PATCH', `/api/projects/${a.project}`, { title: 'pwned' }],
    ['DELETE', `/api/projects/${a.project}`],
    ['POST', `/api/projects/${a.project}/characters`, { name: 'Intruder' }],
    ['PATCH', `/api/projects/${a.project}/characters/${a.character}`, { name: 'x' }],
    ['DELETE', `/api/projects/${a.project}/characters/${a.character}`],
    ['POST', `/api/projects/${a.project}/characters/${a.character}/images`, { kind: 'photo', consent: true, ...pngUpload() }],
    ['GET', `/api/projects/${a.project}/characters/${a.character}/images/${a.image}`],
    ['DELETE', `/api/projects/${a.project}/characters/${a.character}/images/${a.image}`],
    ['POST', `/api/projects/${a.project}/script/generate`, { pages: 1 }],
    ['GET', `/api/projects/${a.project}/script`],
    ['PUT', `/api/projects/${a.project}/script`, { version: Number(a.version), script: JSON.parse(a.scriptJson ?? '{}') }],
    ['POST', `/api/projects/${a.project}/render`, {}],
    ['GET', `/api/projects/${a.project}/render-jobs/latest`],
    ['GET', `/api/projects/${a.project}/render-jobs/${a.job}`],
    ['GET', `/api/projects/${a.project}/panels/${a.panel}/image`],
    ['GET', `/api/projects/${a.project}/pages/1.svg`],
    ['GET', `/api/projects/${a.project}/export/comic.zip`],
    ['GET', `/api/projects/${a.project}/export/print.html`],
  ];

  it('returns 404 to another user for every project route', async () => {
    for (const [method, path, body] of routes()) {
      const r = await bob.req(method, path, body);
      expect(r.status, `${method} ${path}`).toBe(404);
    }
  });

  it('returns 401 without a session for every project route', async () => {
    const anon = t.client();
    for (const [method, path, body] of routes()) {
      expect((await anon.req(method, path, body)).status, `${method} ${path}`).toBe(401);
    }
  });

  it('does not let another user attach or reach the owner’s characters, images or jobs through their own project', async () => {
    const mine = (await bob.post('/api/projects', { title: 'Bob', path: 'photo' })).body.project.id;
    expect((await bob.post(`/api/projects/${mine}/characters/${a.character}/images`, { kind: 'photo', consent: true, ...pngUpload() })).status).toBe(404);
    expect((await bob.get(`/api/projects/${mine}/characters/${a.character}/images/${a.image}`)).status).toBe(404);
    expect((await bob.get(`/api/projects/${mine}/render-jobs/${a.job}`)).status).toBe(404);
    expect((await bob.get(`/api/projects/${mine}/panels/${a.panel}/image`)).status).toBe(404);
    await bob.post(`/api/projects/${mine}/characters`, { name: 'Gran', image: pngUpload(), consent: true });
    await bob.patch(`/api/projects/${mine}`, { plot: 'Bob visits.' });
    await bob.post(`/api/projects/${mine}/script/generate`, { pages: 1 });
    expect((await bob.post(`/api/projects/${mine}/render`, { panelIds: [a.panel] })).status).toBe(400);
  });

  it('left the owner’s data untouched', async () => {
    const p = (await alice.get(`/api/projects/${a.project}`)).body.project;
    expect(p.title).toBe('Alice family');
    expect(p.characters.map((c: { name: string }) => c.name)).toEqual(['Gran']);
    expect(p.characters[0].images).toHaveLength(1);
    expect((await alice.get(`/api/projects/${a.project}/script`)).body.version).toBe(Number(a.version));
  });
});
