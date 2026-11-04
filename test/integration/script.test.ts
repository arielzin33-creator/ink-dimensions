import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LlmProvider } from '../../src/providers/llm/types.js';
import { ProviderError } from '../../src/providers/errors.js';
import { buildScriptPrompt, parseScriptOutput } from '../../src/server/script-service.js';
import { getStyle } from '../../src/shared/styles.js';
import { startTestApp, type Client, type TestApp } from '../helpers/app.js';
import { pngUpload } from '../helpers/images.js';

let t: TestApp;
let c: Client;
let llmOverride: LlmProvider['complete'] | undefined;

beforeAll(async () => {
  t = await startTestApp();
  const twin = t.providers.llm;
  t.providers.llm = { name: 'switchable', complete: (req) => (llmOverride ? llmOverride(req) : twin.complete(req)) };
  c = t.client();
  await c.signUp();
});
afterAll(() => t.close());

async function inventedProject(plot = 'The cat wakes up. The biscuits are gone. A search begins.') {
  const id = (await c.post('/api/projects', { title: 'Biscuit Case', path: 'invented' })).body.project.id as string;
  await c.patch(`/api/projects/${id}`, { plot, stylePreset: 'noir' });
  await c.post(`/api/projects/${id}/characters`, { name: 'Mo', description: 'a grey cat detective' });
  return id;
}

describe('script generation', () => {
  it('generates a script with the twin: pages, panels, dialogue, captions', async () => {
    const id = await inventedProject();
    const r = await c.post(`/api/projects/${id}/script/generate`, { pages: 2 });
    expect(r.status).toBe(201);
    expect(r.body.version).toBe(1);
    expect(r.body.script.pages).toHaveLength(2);
    const panel = r.body.script.pages[0].panels[0];
    expect(panel.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(panel.description).toContain('Noir');
    expect(panel.dialogue[0]).toMatchObject({ speaker: 'Mo' });
    expect(panel.caption).toBe('Biscuit Case');
    expect(r.body.panels.every((p: { rendered: boolean }) => !p.rendered)).toBe(true);
    expect((await c.get(`/api/projects/${id}/script`)).body.version).toBe(1);
  });

  it('needs a plot and a character first', async () => {
    const id = (await c.post('/api/projects', { title: 'Empty', path: 'invented' })).body.project.id;
    expect((await c.post(`/api/projects/${id}/script/generate`, { pages: 1 })).status).toBe(400);
    await c.patch(`/api/projects/${id}`, { plot: 'Something happens.' });
    expect((await c.post(`/api/projects/${id}/script/generate`, { pages: 1 })).status).toBe(400);
    expect((await c.post(`/api/projects/${id}/script/generate`, { pages: 7 })).status).toBe(400);
  });

  it('returns 502 llm_invalid_output for unusable model output and 502 for provider failures', async () => {
    const id = await inventedProject();
    llmOverride = async () => 'Sure! Here is your comic: once upon a time...';
    const bad = await c.post(`/api/projects/${id}/script/generate`, { pages: 1 });
    expect(bad.status).toBe(502);
    expect(bad.body.error.code).toBe('llm_invalid_output');
    llmOverride = async () => {
      throw new ProviderError('anthropic', 'HTTP 529: overloaded', 529);
    };
    const down = await c.post(`/api/projects/${id}/script/generate`, { pages: 1 });
    expect(down.status).toBe(502);
    expect(down.body.error.code).toBe('provider_error');
    expect(JSON.stringify(down.body)).not.toContain('overloaded');
    llmOverride = undefined;
    expect((await c.get(`/api/projects/${id}/script`)).status).toBe(404);
  });

  it('accepts fenced JSON and trims extra pages', () => {
    const s = parseScriptOutput('```json\n{"pages":[{"panels":[{"description":"a"}]},{"panels":[{"description":"b"}]}]}\n```', 1);
    expect(s.pages).toHaveLength(1);
  });

  it('builds a prompt that names the cast, style and real-person rule', () => {
    const p = buildScriptPrompt({ title: 'T', plot: 'P', style: getStyle('watercolor'), characters: [{ name: 'Gran', description: 'kind' }], pages: 2, realPeople: true });
    expect(p.system).toContain('exactly 2 page(s)');
    expect(p.system).toContain('real people');
    expect(p.prompt).toContain('- Gran: kind');
    expect(p.prompt).toContain('Watercolor');
  });
});

describe('script editing', () => {
  it('saves edits as a new version and refuses a stale version', async () => {
    const id = await inventedProject();
    const gen = (await c.post(`/api/projects/${id}/script/generate`, { pages: 1 })).body;
    const script = gen.script;
    script.pages[0].panels[0].description = 'Mo inspects the empty tin under a lamp.';
    script.pages[0].panels[0].dialogue = [{ speaker: 'Mo', text: 'Someone was here.' }];
    script.pages[0].panels[0].caption = 'Midnight.';
    script.pages[0].panels.push({ description: 'A new panel added by hand.', characters: ['Mo'], dialogue: [] });
    const saved = await c.put(`/api/projects/${id}/script`, { version: gen.version, script });
    expect(saved.status).toBe(200);
    expect(saved.body.version).toBe(2);
    const first = saved.body.script.pages[0].panels[0];
    expect(first).toMatchObject({ id: script.pages[0].panels[0].id, caption: 'Midnight.' });
    expect(saved.body.script.pages[0].panels.at(-1).id).toMatch(/^[0-9a-f-]{36}$/);
    const stale = await c.put(`/api/projects/${id}/script`, { version: gen.version, script });
    expect(stale.status).toBe(409);
    const invalid = await c.put(`/api/projects/${id}/script`, { version: 2, script: { pages: [] } });
    expect(invalid.status).toBe(400);
  });
});

describe('moderation on the photo path', () => {
  async function photoProject() {
    const id = (await c.post('/api/projects', { title: 'Family', path: 'photo' })).body.project.id as string;
    await c.patch(`/api/projects/${id}`, { plot: 'Grandma bakes a cake for the whole street.' });
    await c.post(`/api/projects/${id}/characters`, { name: 'Gran', image: pngUpload(), consent: true });
    return id;
  }

  it('requires a photo for every character', async () => {
    const id = await photoProject();
    await c.post(`/api/projects/${id}/characters`, { name: 'Grandpa' });
    const r = await c.post(`/api/projects/${id}/script/generate`, { pages: 1 });
    expect(r.status).toBe(400);
    expect(r.body.error.message).toContain('Grandpa');
  });

  it('refuses a harmful plot before calling the LLM, and harmful generated output', async () => {
    const id = await photoProject();
    let called = 0;
    llmOverride = async () => {
      called++;
      return JSON.stringify({ pages: [{ panels: [{ description: 'Gran is arrested by police for fraud.' }] }] });
    };
    const out = await c.post(`/api/projects/${id}/script/generate`, { pages: 1 });
    expect(out.status).toBe(422);
    expect(called).toBe(1);
    llmOverride = undefined;
    await t.db.query("UPDATE projects SET plot = 'Gran gets naked at the party' WHERE id = $1", [id]);
    const plot = await c.post(`/api/projects/${id}/script/generate`, { pages: 1 });
    expect(plot.status).toBe(422);
  });

  it('refuses harmful script edits', async () => {
    const id = await photoProject();
    const gen = (await c.post(`/api/projects/${id}/script/generate`, { pages: 1 })).body;
    gen.script.pages[0].panels[0].dialogue = [{ speaker: 'Gran', text: 'I will kill you all.' }];
    const r = await c.put(`/api/projects/${id}/script`, { version: gen.version, script: gen.script });
    expect(r.status).toBe(422);
    expect(r.body.error.details.reasons).toEqual(['violent_harm']);
  });
});
