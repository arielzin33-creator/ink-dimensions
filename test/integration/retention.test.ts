import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ProviderError } from '../../src/providers/errors.js';
import type { TwinEmail } from '../../src/providers/email/twin.js';
import { storageKeys } from '../../src/providers/storage/types.js';
import { createFeatureFlags, type FeatureFlags } from '../../src/server/flags.js';
import { createLogger } from '../../src/server/logger.js';
import { runRetention } from '../../src/server/retention.js';
import { startTestApp, type Client, type TestApp } from '../helpers/app.js';
import { pngUpload } from '../helpers/images.js';

const DAY = 86_400_000;
const NOW = new Date();
const at = (days: number) => new Date(NOW.getTime() + days * DAY);
const state = { retention: true };
const flags: FeatureFlags = { ...createFeatureFlags({}), retentionEnabled: async () => state.retention };
const lines: string[] = [];
let t: TestApp;
let n = 0;

beforeAll(async () => {
  t = await startTestApp({ flags });
});
afterAll(() => t.close());

function deps(nodeEnv: 'test' | 'production' = 'test') {
  const log = createLogger({ level: 'debug', release: 't', write: (l) => void lines.push(l) });
  return { db: t.db, log, flags, providers: t.providers, config: { nodeEnv, appUrl: 'http://ink.test' } };
}
const mails = (to: string) => (t.providers.email as TwinEmail).sent.filter((m) => m.to === to);

/** A photo project with a derived panel and a script, idle for `daysIdle` days at NOW. */
async function idleProject(daysIdle: number, owner?: { c: Client; uid: string; email: string }) {
  const email = owner?.email ?? `ret${++n}@example.com`;
  const c = owner?.c ?? t.client();
  const uid = owner?.uid ?? ((await c.signUp(email)).body.user.id as string);
  const p = (await c.post('/api/projects', { title: 'Secret title', path: 'photo' })).body.project.id as string;
  const ch = (await c.post(`/api/projects/${p}/characters`, { name: 'Gran', image: pngUpload(), consent: true, subject: 'adult' })).body.character.id as string;
  await c.patch(`/api/projects/${p}`, { plot: 'Gran bakes bread.' });
  expect((await c.post(`/api/projects/${p}/script/generate`, { pages: 1 })).status).toBe(201);
  const panelKey = storageKeys.panelImage(uid, p, '00000000-0000-4000-8000-000000000099');
  await t.providers.storage.put(panelKey, Buffer.from('x'), 'image/png');
  await t.db.query("INSERT INTO panel_images (project_id, panel_id, storage_key, content_type, character_ids, provider) VALUES ($1, '00000000-0000-4000-8000-000000000099', $2, 'image/png', $3::jsonb, 'twin')", [p, panelKey, JSON.stringify([ch])]);
  const photoKey = (await t.db.query<{ storage_key: string }>('SELECT storage_key FROM character_images WHERE project_id = $1', [p])).rows[0]!.storage_key;
  await t.db.query('UPDATE projects SET last_activity_at = $2 WHERE id = $1', [p, at(-daysIdle)]);
  return { c, uid, email, p, photoKey, panelKey };
}
const row = async (p: string) => (await t.db.query<{ warned: Date | null }>('SELECT retention_warned_at AS warned FROM projects WHERE id = $1', [p])).rows[0]!;

describe('retention (spec 002 FR-117 – FR-124)', () => {
  it('warns at 76 days, deletes at 90 after 14 days notice, and keeps the script (SC-104)', async () => {
    const x = await idleProject(77);
    await runRetention(deps(), NOW);
    expect(mails(x.email)).toHaveLength(1);
    const mail = mails(x.email)[0]!;
    expect(mail.text).toContain('http://ink.test/projects');
    expect(mail.subject + mail.text).not.toMatch(/Secret title|Gran|bread/);
    expect((await row(x.p)).warned).toBeInstanceOf(Date);

    await runRetention(deps(), at(13)); // idle 90 days, but warned only 13 days ago
    expect(await t.providers.storage.get(x.photoKey)).not.toBeNull();
    expect(mails(x.email)).toHaveLength(1);

    await runRetention(deps(), at(14));
    expect(await t.providers.storage.get(x.photoKey)).toBeNull();
    expect(await t.providers.storage.get(x.panelKey)).toBeNull();
    expect((await t.db.query('SELECT 1 FROM panel_images WHERE project_id = $1', [x.p])).rows).toHaveLength(0);
    expect((await x.c.get(`/api/projects/${x.p}/script`)).status).toBe(200);
    expect((await x.c.get(`/api/projects/${x.p}`)).body.project.characters[0].images).toEqual([]);
  });

  it('deletes nothing after a failed warning, and retries the warning (US-5.3, NFR-105)', async () => {
    const x = await idleProject(95);
    const email = t.providers.email;
    t.providers.email = { name: 'down', real: true, send: () => Promise.reject(new ProviderError('email', 'HTTP 503')) };
    try {
      await runRetention(deps(), NOW);
    } finally {
      t.providers.email = email;
    }
    expect((await row(x.p)).warned).toBeNull();
    await runRetention(deps(), at(1));
    expect(mails(x.email)).toHaveLength(1);
    expect(await t.providers.storage.get(x.photoKey)).not.toBeNull();
  });

  it('opening the project cancels the warning; the project list alone does not (FR-119, FR-120)', async () => {
    const opened = await idleProject(80);
    const listed = await idleProject(80);
    await runRetention(deps(), NOW);
    await opened.c.get(`/api/projects/${opened.p}`);
    await listed.c.get('/api/projects');
    expect((await row(opened.p)).warned).toBeNull();
    expect((await row(listed.p)).warned).toBeInstanceOf(Date);
    await runRetention(deps(), at(15));
    expect(await t.providers.storage.get(opened.photoKey)).not.toBeNull();
    expect(await t.providers.storage.get(listed.photoKey)).toBeNull();
  });

  it('skips a project with a queued render job (FR-121)', async () => {
    const x = await idleProject(77);
    await runRetention(deps(), NOW);
    await t.db.query("INSERT INTO render_jobs (id, project_id, user_id, panel_ids) VALUES (gen_random_uuid(), $1, $2, '[]'::jsonb)", [x.p, x.uid]);
    await runRetention(deps(), at(14));
    expect(await t.providers.storage.get(x.photoKey)).not.toBeNull();
    await t.db.query('DELETE FROM render_jobs WHERE project_id = $1', [x.p]);
  });

  it('sends one email per owner however many projects are idle (FR-118)', async () => {
    const first = await idleProject(77);
    await idleProject(78, first);
    await runRetention(deps(), NOW);
    expect(mails(first.email)).toHaveLength(1);
  });

  it('does nothing when paused, or in production on the twin, and says so (FR-123, FR-124)', async () => {
    const x = await idleProject(77);
    state.retention = false;
    try {
      expect((await runRetention(deps(), NOW)).skipped).toBe('paused');
    } finally {
      state.retention = true;
    }
    expect((await runRetention(deps('production'), NOW)).skipped).toBe('no_email_service');
    expect(lines.join('\n')).toContain('retention is off: no email service is configured');
    expect(mails(x.email)).toHaveLength(0);
  });

  it('tidies invitations 30 days after they stop being usable (FR-108)', async () => {
    const insert = (email: string, revokedDaysAgo: number) =>
      t.db.query("INSERT INTO invites (id, email, token_hash, expires_at, revoked_at) VALUES (gen_random_uuid(), $1, $2, $3, $4)", [email, `h-${email}`, at(14), at(-revokedDaysAgo)]);
    await insert('old@example.com', 31);
    await insert('recent@example.com', 29);
    await runRetention(deps(), NOW);
    const left = (await t.db.query<{ email: string }>("SELECT email FROM invites WHERE email IN ('old@example.com', 'recent@example.com')")).rows.map((r) => r.email);
    expect(left).toEqual(['recent@example.com']);
  });

  it('logs counts only, never addresses (NFR-102)', () => {
    expect(lines.join('\n')).not.toContain('@example.com');
  });
});
