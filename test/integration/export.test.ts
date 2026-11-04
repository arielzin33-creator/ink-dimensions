import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp, type Client, type TestApp } from '../helpers/app.js';
import { readZip } from '../helpers/zip.js';

let t: TestApp;
let c: Client;
let id: string;

beforeAll(async () => {
  t = await startTestApp();
  c = t.client();
  await c.signUp();
  id = (await c.post('/api/projects', { title: 'The Biscuit Case', path: 'invented' })).body.project.id;
  await c.patch(`/api/projects/${id}`, { plot: 'Mo wakes up. The biscuits are gone. Mo investigates.', stylePreset: 'noir' });
  await c.post(`/api/projects/${id}/characters`, { name: 'Mo', description: 'a grey cat detective' });
  await c.post(`/api/projects/${id}/script/generate`, { pages: 2 });
});
afterAll(() => t.close());

describe('pages and exports', () => {
  it('composes a page before rendering, with placeholder frames', async () => {
    const r = await c.get(`/api/projects/${id}/pages/1.svg`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('image/svg+xml');
    expect(r.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(r.text).toContain('Not rendered yet');
    expect(r.text).toContain('class="bubble"');
    expect((await c.get(`/api/projects/${id}/pages/3.svg`)).status).toBe(404);
    expect((await c.get(`/api/projects/${id}/pages/abc.svg`)).status).toBe(404);
  });

  it('embeds rendered panels and offers a download filename', async () => {
    await c.post(`/api/projects/${id}/render`, {});
    await t.app.runner.drain();
    const r = await c.get(`/api/projects/${id}/pages/2.svg?download=1`);
    expect(r.text).not.toContain('Not rendered yet');
    expect(r.text).toContain('href="data:image/svg+xml;base64,');
    expect(r.headers.get('content-disposition')).toBe('attachment; filename="the-biscuit-case-page-02.svg"');
  });

  it('exports all pages as a valid ZIP', async () => {
    const res = await fetch(`${t.base}/api/projects/${id}/export/comic.zip`, { headers: { cookie: c.cookie ?? '' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/zip');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="the-biscuit-case.zip"');
    const entries = readZip(Buffer.from(await res.arrayBuffer()));
    expect(entries.map((e) => e.name)).toEqual(['the-biscuit-case/page-01.svg', 'the-biscuit-case/page-02.svg']);
    expect(entries[0]?.data.toString('utf8')).toMatch(/^<svg xmlns/);
  });

  it('serves a print page with one sheet per comic page and no script', async () => {
    const r = await c.get(`/api/projects/${id}/export/print.html`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('text/html');
    expect(r.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect((r.text.match(/class="sheet"/g) ?? []).length).toBe(2);
    expect(r.text).toContain('@page { size: A4 portrait; margin: 0; }');
    expect(r.text).toContain('alt="The Biscuit Case, page 1 of 2"');
    expect(r.text).not.toMatch(/<script/i);
  });

  it('needs a script', async () => {
    const other = (await c.post('/api/projects', { title: 'Nothing yet', path: 'invented' })).body.project.id;
    expect((await c.get(`/api/projects/${other}/export/print.html`)).status).toBe(400);
  });
});
