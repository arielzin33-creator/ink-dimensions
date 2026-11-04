import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp, type Client, type TestApp } from '../helpers/app.js';
import { JPEG_HEAD, pngUpload, tinyPng } from '../helpers/images.js';

let t: TestApp;
let c: Client;
let photoProject: string;
let inventedProject: string;

beforeAll(async () => {
  t = await startTestApp({ env: { UPLOAD_MAX_BYTES: String(64 * 1024) } });
  c = t.client();
  await c.signUp();
  photoProject = (await c.post('/api/projects', { title: 'Family', path: 'photo' })).body.project.id;
  inventedProject = (await c.post('/api/projects', { title: 'Cats', path: 'invented' })).body.project.id;
});
afterAll(() => t.close());

describe('photo path characters', () => {
  it('refuses a photo upload without consent and stores nothing', async () => {
    const ch = (await c.post(`/api/projects/${photoProject}/characters`, { name: 'Grandma' })).body.character;
    const r = await c.post(`/api/projects/${photoProject}/characters/${ch.id}/images`, { kind: 'photo', ...pngUpload() });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('consent_required');
    const r2 = await c.post(`/api/projects/${photoProject}/characters/${ch.id}/images`, { kind: 'photo', ...pngUpload({ consent: false }) });
    expect(r2.status).toBe(400);
    expect(await t.providers.storage.list('u/')).toEqual([]);
    const { rows } = await t.db.query('SELECT 1 FROM character_images');
    expect(rows).toHaveLength(0);
  });

  it('accepts a photo with consent, records the consent time and serves it privately', async () => {
    const ch = (await c.post(`/api/projects/${photoProject}/characters`, { name: 'Dad' })).body.character;
    const r = await c.post(`/api/projects/${photoProject}/characters/${ch.id}/images`, { kind: 'photo', ...pngUpload({ consent: true }) });
    expect(r.status).toBe(201);
    expect(r.body.image.consentAt).toMatch(/^\d{4}-/);
    const img = await c.get(`/api/projects/${photoProject}/characters/${ch.id}/images/${r.body.image.id}`);
    expect(img.status).toBe(200);
    expect(img.headers.get('content-type')).toBe('image/png');
    expect(img.headers.get('cache-control')).toBe('private, no-store');
    expect((await t.client().get(`/api/projects/${photoProject}/characters/${ch.id}/images/${r.body.image.id}`)).status).toBe(401);
  });

  it('accepts a photo with consent when creating the character', async () => {
    const r = await c.post(`/api/projects/${photoProject}/characters`, { name: 'Sis', image: pngUpload(), consent: true });
    expect(r.status).toBe(201);
    expect(r.body.character.images[0].kind).toBe('photo');
    const refused = await c.post(`/api/projects/${photoProject}/characters`, { name: 'Bro', image: pngUpload() });
    expect(refused.status).toBe(400);
    expect(refused.body.error.code).toBe('consent_required');
  });

  it('refuses reference art on the photo path', async () => {
    const ch = (await c.post(`/api/projects/${photoProject}/characters`, { name: 'Aunt' })).body.character;
    const r = await c.post(`/api/projects/${photoProject}/characters/${ch.id}/images`, { kind: 'reference', ...pngUpload() });
    expect(r.status).toBe(400);
  });

  it('refuses a harmful description of a real person', async () => {
    const r = await c.post(`/api/projects/${photoProject}/characters`, { name: 'Neighbour', description: 'a known thief and liar' });
    expect(r.status).toBe(422);
  });
});

describe('invented path characters', () => {
  it('requires a description or reference art', async () => {
    const r = await c.post(`/api/projects/${inventedProject}/characters`, { name: 'Mo' });
    expect(r.status).toBe(400);
    const ok = await c.post(`/api/projects/${inventedProject}/characters`, { name: 'Mo', description: 'a grey cat detective' });
    expect(ok.status).toBe(201);
    const withArt = await c.post(`/api/projects/${inventedProject}/characters`, { name: 'Pip', image: pngUpload() });
    expect(withArt.status).toBe(201);
    expect(withArt.body.character.images[0]).toMatchObject({ kind: 'reference', consentAt: null });
    const fight = await c.patch(`/api/projects/${inventedProject}/characters/${ok.body.character.id}`, { description: 'a cat who fights a bloody duel' });
    expect(fight.status).toBe(200);
  });

  it('refuses photos on the invented path', async () => {
    const ch = (await c.post(`/api/projects/${inventedProject}/characters`, { name: 'Ada', description: 'a girl' })).body.character;
    const r = await c.post(`/api/projects/${inventedProject}/characters/${ch.id}/images`, { kind: 'photo', ...pngUpload({ consent: true }) });
    expect(r.status).toBe(400);
  });

  it('enforces type sniffing, the size limit and 5 images per character', async () => {
    const ch = (await c.post(`/api/projects/${inventedProject}/characters`, { name: 'Zed', description: 'a robot' })).body.character;
    const url = `/api/projects/${inventedProject}/characters/${ch.id}/images`;
    expect((await c.post(url, { kind: 'reference', contentType: 'image/png', dataBase64: JPEG_HEAD.toString('base64') })).status).toBe(415);
    expect((await c.post(url, { kind: 'reference', contentType: 'image/gif', dataBase64: 'R0lGODlh' })).status).toBe(400);
    const big = Buffer.concat([tinyPng(), Buffer.alloc(70 * 1024)]).toString('base64');
    expect((await c.post(url, { kind: 'reference', contentType: 'image/png', dataBase64: big })).status).toBe(413);
    for (let i = 0; i < 5; i++) expect((await c.post(url, { kind: 'reference', ...pngUpload() })).status).toBe(201);
    expect((await c.post(url, { kind: 'reference', ...pngUpload() })).status).toBe(409);
  });
});
