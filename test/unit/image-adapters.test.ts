import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createComfyUiImage, fillWorkflow } from '../../src/providers/image/comfyui.js';
import { createHostedImage } from '../../src/providers/image/hosted.js';
import type { PanelRenderRequest } from '../../src/providers/image/types.js';
import { getStyle } from '../../src/shared/styles.js';
import { sendJson, startFakeServer } from '../helpers/fake-server.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('rest-of-png')]);
const req: PanelRenderRequest = {
  panelId: '11111111-1111-4111-8111-111111111111',
  width: 768,
  height: 512,
  style: getStyle('noir'),
  description: 'A rainy street',
  characters: [{ name: 'Mo', description: 'cat' }],
  prompt: 'noir, a rainy street',
  negativePrompt: 'text',
  references: [
    { characterName: 'Mo', kind: 'photo', contentType: 'image/png', data: PNG },
    { characterName: 'Mo', kind: 'reference', contentType: 'image/png', data: PNG },
  ],
  seed: 7,
};
let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

describe('hosted image adapter (fake server)', () => {
  it('posts the documented JSON contract and accepts raw image bytes', async () => {
    const fake = await startFakeServer((_r, res) => {
      res.writeHead(200, { 'content-type': 'image/png' });
      res.end(PNG);
    });
    close = fake.close;
    const img = createHostedImage({ url: `${fake.url}/generate`, apiKey: 'key', timeoutMs: 5000, allowPhotos: false });
    const out = await img.render(req);
    expect(out).toEqual({ contentType: 'image/png', data: PNG });
    const r = fake.requests[0];
    expect(r?.url).toBe('/generate');
    expect(r?.headers.authorization).toBe('Bearer key');
    const body = JSON.parse(r?.body ?? '{}');
    expect(body).toMatchObject({ prompt: 'noir, a rainy street', negative_prompt: 'text', width: 768, height: 512, seed: 7, style: 'noir' });
    // Photos are withheld unless explicitly allowed (FR-022).
    expect(body.reference_images.map((x: { kind: string }) => x.kind)).toEqual(['reference']);
    expect(img.acceptsPhotos).toBe(false);
  });

  it('sends photos only when allowed and accepts a JSON response', async () => {
    const fake = await startFakeServer((_r, res) => sendJson(res, 200, { image_base64: PNG.toString('base64'), content_type: 'image/png' }));
    close = fake.close;
    const img = createHostedImage({ url: fake.url, apiKey: 'key', timeoutMs: 5000, allowPhotos: true });
    expect((await img.render(req)).contentType).toBe('image/png');
    expect(JSON.parse(fake.requests[0]?.body ?? '{}').reference_images).toHaveLength(2);
  });

  it('rejects SVG or unknown bytes and HTTP errors', async () => {
    const fake = await startFakeServer((_r, res) => {
      res.writeHead(200, { 'content-type': 'image/svg+xml' });
      res.end('<svg onload="alert(1)"/>');
    });
    close = fake.close;
    const img = createHostedImage({ url: fake.url, apiKey: 'key', timeoutMs: 5000, allowPhotos: false });
    await expect(img.render(req)).rejects.toThrow(/not a PNG/);
    fake.setHandler((_r, res) => sendJson(res, 401, { error: 'bad key' }));
    await expect(img.render(req)).rejects.toMatchObject({ status: 401 });
  });
});

describe('ComfyUI adapter (fake server)', () => {
  const workflow = {
    '3': { class_type: 'KSampler', inputs: { seed: '{{seed}}', steps: 20 } },
    '5': { class_type: 'EmptyLatentImage', inputs: { width: '{{width}}', height: '{{height}}' } },
    '6': { class_type: 'CLIPTextEncode', inputs: { text: 'masterpiece, {{prompt}}' } },
    '7': { class_type: 'CLIPTextEncode', inputs: { text: '{{negative_prompt}}' } },
  };

  it('fills placeholders with strings and numbers', () => {
    const out = fillWorkflow(workflow, { prompt: 'p', negative_prompt: 'n', width: 10, height: 20, seed: 3 }) as any;
    expect(out['3'].inputs).toEqual({ seed: 3, steps: 20 });
    expect(out['5'].inputs).toEqual({ width: 10, height: 20 });
    expect(out['6'].inputs.text).toBe('masterpiece, p');
    expect(out['7'].inputs.text).toBe('n');
  });

  it('queues the prompt, polls history and downloads the image', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wf-'));
    const wfPath = join(dir, 'wf.json');
    writeFileSync(wfPath, JSON.stringify(workflow));
    let polls = 0;
    const fake = await startFakeServer((r, res) => {
      if (r.method === 'POST' && r.url === '/prompt') return sendJson(res, 200, { prompt_id: 'abc', number: 1 });
      if (r.url === '/history/abc') {
        polls += 1;
        if (polls < 2) return sendJson(res, 200, {});
        return sendJson(res, 200, { abc: { status: { status_str: 'success' }, outputs: { '9': { images: [{ filename: 'out.png', subfolder: '', type: 'output' }] } } } });
      }
      if (r.url.startsWith('/view?')) {
        res.writeHead(200, { 'content-type': 'image/png' });
        return res.end(PNG);
      }
      res.writeHead(404);
      res.end();
    });
    close = fake.close;
    const img = createComfyUiImage({ url: fake.url, workflowPath: wfPath, timeoutMs: 5000, pollMs: 10 });
    expect(await img.render(req)).toEqual({ contentType: 'image/png', data: PNG });
    const queued = JSON.parse(fake.requests[0]?.body ?? '{}');
    expect(queued.prompt['6'].inputs.text).toBe('masterpiece, noir, a rainy street');
    expect(queued.prompt['5'].inputs).toEqual({ width: 768, height: 512 });
    expect(typeof queued.client_id).toBe('string');
    const view = fake.requests.find((x) => x.url.startsWith('/view?'));
    expect(view?.url).toBe('/view?filename=out.png&subfolder=&type=output');
    expect(fake.requests.some((x) => x.url === '/upload/image')).toBe(false);
  });

  it('uploads a reference image only when the workflow asks for one', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wf-'));
    const wfPath = join(dir, 'wf.json');
    writeFileSync(wfPath, JSON.stringify({ ...workflow, '10': { class_type: 'LoadImage', inputs: { image: '{{reference_image}}' } } }));
    const fake = await startFakeServer((r, res) => {
      if (r.url === '/upload/image') return sendJson(res, 200, { name: 'ink-ref.png', subfolder: '', type: 'input' });
      if (r.url === '/prompt') return sendJson(res, 200, { prompt_id: 'x' });
      if (r.url === '/history/x') return sendJson(res, 200, { x: { status: { status_str: 'error' }, outputs: {} } });
      res.writeHead(404);
      res.end();
    });
    close = fake.close;
    const img = createComfyUiImage({ url: fake.url, workflowPath: wfPath, timeoutMs: 5000, pollMs: 10 });
    await expect(img.render(req)).rejects.toThrow(/workflow failed/);
    expect(fake.requests[0]?.url).toBe('/upload/image');
    expect(fake.requests[0]?.headers['content-type']).toMatch(/^multipart\/form-data/);
    expect(JSON.parse(fake.requests[1]?.body ?? '{}').prompt['10'].inputs.image).toBe('ink-ref.png');
  });
});
