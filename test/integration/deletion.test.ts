import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { storageKeys } from '../../src/providers/storage/types.js';
import { startTestApp, type Client, type TestApp } from '../helpers/app.js';
import { pngUpload } from '../helpers/images.js';

let t: TestApp;
let c: Client;
let userId: string;

beforeAll(async () => {
  t = await startTestApp();
  c = t.client();
  userId = (await c.signUp()).body.user.id;
});
afterAll(() => t.close());

/** Simulates a rendered panel image that shows the given characters. */
async function fakeRender(projectId: string, characterIds: string[]): Promise<{ panelId: string; key: string }> {
  const panelId = randomUUID();
  const key = storageKeys.panelImage(userId, projectId, panelId);
  await t.providers.storage.put(key, Buffer.from('<svg/>'), 'image/svg+xml');
  await t.db.query("INSERT INTO panel_images (project_id, panel_id, storage_key, content_type, character_ids, provider) VALUES ($1, $2, $3, 'image/svg+xml', $4::jsonb, 'twin')", [
    projectId,
    panelId,
    key,
    JSON.stringify(characterIds),
  ]);
  return { panelId, key };
}

async function setup() {
  const project = (await c.post('/api/projects', { title: 'Family', path: 'photo' })).body.project.id as string;
  const gran = (await c.post(`/api/projects/${project}/characters`, { name: 'Gran', image: pngUpload(), consent: true })).body.character;
  const dad = (await c.post(`/api/projects/${project}/characters`, { name: 'Dad', image: pngUpload(), consent: true })).body.character;
  return { project, gran, dad };
}

describe('deleting photos and derived images', () => {
  it('deletes the photo and every panel image showing that character', async () => {
    const { project, gran, dad } = await setup();
    const both = await fakeRender(project, [gran.id, dad.id]);
    const granOnly = await fakeRender(project, [gran.id]);
    const dadOnly = await fakeRender(project, [dad.id]);
    const photoKey = storageKeys.characterImage(userId, project, gran.images[0].id);
    expect(await t.providers.storage.get(photoKey)).not.toBeNull();

    const r = await c.del(`/api/projects/${project}/characters/${gran.id}/images/${gran.images[0].id}`);
    expect(r.status).toBe(200);
    expect([...r.body.unrenderedPanels].sort()).toEqual([both.panelId, granOnly.panelId].sort());
    expect(await t.providers.storage.get(photoKey)).toBeNull();
    expect(await t.providers.storage.get(both.key)).toBeNull();
    expect(await t.providers.storage.get(granOnly.key)).toBeNull();
    expect(await t.providers.storage.get(dadOnly.key)).not.toBeNull();
    const { rows } = await t.db.query<{ panel_id: string }>('SELECT panel_id FROM panel_images WHERE project_id = $1', [project]);
    expect(rows.map((x) => x.panel_id)).toEqual([dadOnly.panelId]);
    expect((await c.get(`/api/projects/${project}/characters/${gran.id}/images/${gran.images[0].id}`)).status).toBe(404);
  });

  it('deletes a character with all its photos and derived images', async () => {
    const { project, dad } = await setup();
    const panel = await fakeRender(project, [dad.id]);
    expect((await c.del(`/api/projects/${project}/characters/${dad.id}`)).status).toBe(200);
    expect(await t.providers.storage.get(storageKeys.characterImage(userId, project, dad.images[0].id))).toBeNull();
    expect(await t.providers.storage.get(panel.key)).toBeNull();
    const { rows } = await t.db.query('SELECT 1 FROM character_images WHERE character_id = $1', [dad.id]);
    expect(rows).toHaveLength(0);
  });

  it('deletes a project with every stored file and row', async () => {
    const { project } = await setup();
    await fakeRender(project, []);
    expect((await t.providers.storage.list(storageKeys.projectPrefix(userId, project))).length).toBe(3);
    expect((await c.del(`/api/projects/${project}`)).status).toBe(204);
    expect(await t.providers.storage.list(storageKeys.projectPrefix(userId, project))).toEqual([]);
    for (const table of ['characters', 'character_images', 'panel_images']) {
      const { rows } = await t.db.query(`SELECT 1 FROM ${table} WHERE project_id = $1`, [project]);
      expect(rows, table).toHaveLength(0);
    }
  });
});
