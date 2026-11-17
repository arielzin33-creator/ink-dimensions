import { afterAll, beforeAll, expect, it } from 'vitest';
import { createLogger } from '../../src/server/logger.js';
import { createFeatureFlags } from '../../src/server/flags.js';
import { runRetention } from '../../src/server/retention.js';
import { startTestApp, type TestApp } from '../helpers/app.js';
import { pngUpload } from '../helpers/images.js';

const DAY = 86_400_000;
let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
});
afterAll(() => t.close());

it('shows the deletion date on the list once warned, and the cancelled date when the project is opened (FR-117)', async () => {
  const now = new Date();
  const c = t.client();
  await c.signUp();
  const p = (await c.post('/api/projects', { title: 'T', path: 'photo' })).body.project.id;
  await c.post(`/api/projects/${p}/characters`, { name: 'Gran', image: pngUpload(), consent: true, subject: 'adult' });
  const listed = async () => (await c.get('/api/projects')).body.projects.find((x: { id: string }) => x.id === p);
  expect((await listed()).photosDeleteOn).toBeNull();

  await t.db.query('UPDATE projects SET last_activity_at = $2 WHERE id = $1', [p, new Date(now.getTime() - 80 * DAY)]);
  const log = createLogger({ level: 'silent', release: 't' });
  await runRetention({ db: t.db, log, flags: createFeatureFlags({}), providers: t.providers, config: { nodeEnv: 'test', appUrl: 'http://ink.test' } }, now);
  const due = new Date(now.getTime() + 14 * DAY).toISOString().slice(0, 10); // later of idle+90 (now+10) and warned+14
  expect((await listed()).photosDeleteOn).toBe(due);

  const opened = (await c.get(`/api/projects/${p}`)).body.project;
  expect(opened).toMatchObject({ photosDeleteOn: null, photosWereDueOn: due });
  expect((await listed()).photosDeleteOn).toBeNull();
  expect((await c.get(`/api/projects/${p}`)).body.project.photosWereDueOn).toBeNull();
});
