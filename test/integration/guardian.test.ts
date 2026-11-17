import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFeatureFlags, type FeatureFlags } from '../../src/server/flags.js';
import { startTestApp, type Client, type TestApp } from '../helpers/app.js';
import { pngUpload } from '../helpers/images.js';

const state = { minors: true };
const flags: FeatureFlags = { ...createFeatureFlags({}), minorPhotosEnabled: async () => state.minors };
let t: TestApp;
let c: Client;
let project: string;
let character: string;

beforeAll(async () => {
  t = await startTestApp({ flags });
  c = t.client();
  await c.signUp();
  project = (await c.post('/api/projects', { title: 'Family', path: 'photo' })).body.project.id;
  character = (await c.post(`/api/projects/${project}/characters`, { name: 'Kid' })).body.character.id;
});
afterAll(() => t.close());

const createWith = (extra: Record<string, unknown>) => c.post(`/api/projects/${project}/characters`, { name: `C${Math.random()}`, image: pngUpload(), consent: true, ...extra });
const uploadWith = (extra: Record<string, unknown>) => c.post(`/api/projects/${project}/characters/${character}/images`, { kind: 'photo', consent: true, ...pngUpload(), ...extra });
const both = async (extra: Record<string, unknown>) => [await createWith(extra), await uploadWith(extra)];
const photoRows = async () => (await t.db.query<{ subject_minor: boolean; guardian_confirmed_at: Date | null }>("SELECT subject_minor, guardian_confirmed_at FROM character_images WHERE project_id = $1 AND kind = 'photo' ORDER BY created_at", [project])).rows;

describe('who is in a photo (spec 002 FR-110, FR-111, SC-103)', () => {
  it('refuses a photo with no statement, on both upload paths, and stores nothing', async () => {
    for (const r of await both({})) {
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe('subject_required');
    }
    expect(await photoRows()).toEqual([]);
    expect((await c.get(`/api/projects/${project}`)).body.project.characters).toHaveLength(1);
  });

  it('refuses a minor without the guardian confirmation', async () => {
    for (const r of await both({ subject: 'minor' })) expect(r.body.error.code).toBe('guardian_required');
    for (const r of await both({ subject: 'minor', guardianConfirmed: false })) expect(r.body.error.code).toBe('guardian_required');
    expect(await photoRows()).toEqual([]);
  });

  it("records the guardian confirmation time for a minor's photo, and none for an adult's", async () => {
    for (const r of await both({ subject: 'minor', guardianConfirmed: true })) expect(r.status).toBe(201);
    expect((await uploadWith({ subject: 'adult' })).status).toBe(201);
    const rows = await photoRows();
    expect(rows.map((r) => r.subject_minor)).toEqual([true, true, false]);
    expect(rows.map((r) => r.guardian_confirmed_at instanceof Date)).toEqual([true, true, false]);
  });

  it('refuses photos of minors while the switch is off, even with the confirmation; adults still work', async () => {
    state.minors = false;
    try {
      for (const r of await both({ subject: 'minor', guardianConfirmed: true })) {
        expect(r.status).toBe(403);
        expect(r.body.error.code).toBe('feature_disabled');
      }
      expect((await uploadWith({ subject: 'adult' })).status).toBe(201);
    } finally {
      state.minors = true;
    }
  });
});
