import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { HttpError } from '../../src/server/errors.js';
import { createRequestHandler, json, Router } from '../../src/server/http.js';
import { createLogger } from '../../src/server/logger.js';
import { createStaticHandler } from '../../src/server/static.js';

const lines: Array<Record<string, unknown>> = [];
let server: Server;
let base: string;

beforeAll(async () => {
  const router = new Router()
    .get('/api/items/:id/pages/:n.svg', async (ctx) => json(200, ctx.params))
    .post('/api/echo', async (ctx) => json(200, await ctx.body(z.object({ name: z.string().min(1) }), 100)))
    .get('/api/boom', async () => {
      throw new Error('secret detail');
    })
    .get('/api/teapot', async () => {
      throw new HttpError(418, 'teapot', 'I am a teapot');
    });
  const webDir = mkdtempSync(join(tmpdir(), 'web-'));
  mkdirSync(join(webDir, 'assets'));
  writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>app</title>');
  writeFileSync(join(webDir, 'assets', 'a.js'), 'console.log(1)');
  const serveStatic = createStaticHandler(webDir);
  const log = createLogger({ level: 'info', release: 'r-test', write: (l) => lines.push(JSON.parse(l)) });
  server = createServer(
    createRequestHandler({ router, log, release: 'r-test', fallback: async (req) => serveStatic(req.method ?? 'GET', new URL(req.url ?? '/', 'http://x').pathname) }),
  );
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('http core', () => {
  it('routes with params including a suffix', async () => {
    const r = await fetch(`${base}/api/items/abc/pages/2.svg`);
    expect(await r.json()).toEqual({ id: 'abc', n: '2' });
  });

  it('enforces JSON-only bodies, validation and the body limit', async () => {
    expect((await fetch(`${base}/api/echo`, { method: 'POST', body: 'name=x', headers: { 'content-type': 'application/x-www-form-urlencoded' } })).status).toBe(415);
    const bad = await fetch(`${base}/api/echo`, { method: 'POST', body: '{"name":""}', headers: { 'content-type': 'application/json' } });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as any).error.details[0].path).toBe('name');
    expect((await fetch(`${base}/api/echo`, { method: 'POST', body: '{nope', headers: { 'content-type': 'application/json' } })).status).toBe(400);
    const big = await fetch(`${base}/api/echo`, { method: 'POST', body: JSON.stringify({ name: 'x'.repeat(500) }), headers: { 'content-type': 'application/json' } });
    expect(big.status).toBe(413);
    const ok = await fetch(`${base}/api/echo`, { method: 'POST', body: '{"name":"ink"}', headers: { 'content-type': 'application/json' } });
    expect(await ok.json()).toEqual({ name: 'ink' });
  });

  it('refuses cross-origin state changes', async () => {
    const r = await fetch(`${base}/api/echo`, { method: 'POST', body: '{"name":"x"}', headers: { 'content-type': 'application/json', origin: 'https://evil.example' } });
    expect(r.status).toBe(403);
  });

  it('echoes a well-formed request id and logs one line per request', async () => {
    lines.length = 0;
    const r = await fetch(`${base}/api/items/1/pages/1.svg`, { headers: { 'x-request-id': 'req-12345678' } });
    expect(r.headers.get('x-request-id')).toBe('req-12345678');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    await new Promise((res) => setTimeout(res, 20));
    const reqLines = lines.filter((l) => l.msg === 'request');
    expect(reqLines).toHaveLength(1);
    expect(reqLines[0]).toMatchObject({ reqId: 'req-12345678', status: 200, method: 'GET', release: 'r-test' });
    const gen = await fetch(`${base}/api/items/1/pages/1.svg`, { headers: { 'x-request-id': 'bad id!' } });
    expect(gen.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('hides internal errors behind an envelope carrying the release', async () => {
    lines.length = 0;
    const r = await fetch(`${base}/api/boom`);
    expect(r.status).toBe(500);
    const body = (await r.json()) as any;
    expect(body.error).toMatchObject({ code: 'internal', release: 'r-test' });
    expect(JSON.stringify(body)).not.toContain('secret detail');
    await new Promise((res) => setTimeout(res, 20));
    expect(lines.find((l) => l.level === 'error')).toMatchObject({ release: 'r-test', reqId: body.error.requestId });
    const tea = await fetch(`${base}/api/teapot`);
    expect(tea.status).toBe(418);
    expect((await fetch(`${base}/api/missing`)).status).toBe(404);
    expect((await fetch(`${base}/api/echo`)).status).toBe(405);
  });

  it('serves static files with an SPA fallback and no path traversal', async () => {
    const page = await fetch(`${base}/projects/123`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-security-policy')).toContain("script-src 'self'");
    expect(await page.text()).toContain('<title>app</title>');
    const asset = await fetch(`${base}/assets/a.js`);
    expect(asset.headers.get('cache-control')).toContain('immutable');
    expect((await fetch(`${base}/assets/missing.js`)).status).toBe(404);
    expect((await fetch(`${base}/..%2f..%2fetc%2fpasswd.txt`)).status).toBe(404);
  });
});
