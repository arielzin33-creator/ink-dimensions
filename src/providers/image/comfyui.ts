// Self-hosted pipeline adapter for a ComfyUI-style server.
// UNTESTED AGAINST THE LIVE SERVICE: verified only against a local fake that mimics these
// endpoints of the ComfyUI server API:
//   POST /prompt          { prompt: <API-format workflow>, client_id } -> { prompt_id }
//   GET  /history/{id}    -> { [id]: { status?: { status_str }, outputs: { [node]: { images: [{ filename, subfolder, type }] } } } }
//   GET  /view?filename=&subfolder=&type=  -> image bytes
//   POST /upload/image    multipart field "image" -> { name, subfolder, type }   (only if the workflow uses {{reference_image}})
// The workflow file (COMFYUI_WORKFLOW_PATH) is exported from ComfyUI in API format, with these
// placeholders in string values: {{prompt}}, {{negative_prompt}}, and whole-value numeric
// placeholders "{{width}}", "{{height}}", "{{seed}}"; optionally "{{reference_image}}".
// Privacy: an uploaded reference stays in that server's input folder; deleting it there is the
// operator's job (see README).
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { errorSnippet, fetchWithTimeout, ProviderError } from '../errors.js';
import { sniffRaster } from './sniff.js';
import type { ImageProvider, PanelRenderRequest } from './types.js';

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export function fillWorkflow(node: Json, values: { prompt: string; negative_prompt: string; width: number; height: number; seed: number; reference_image?: string }): Json {
  if (typeof node === 'string') {
    const whole = /^\{\{(width|height|seed)\}\}$/.exec(node);
    if (whole) return values[whole[1] as 'width' | 'height' | 'seed'];
    return node
      .replaceAll('{{prompt}}', values.prompt)
      .replaceAll('{{negative_prompt}}', values.negative_prompt)
      .replaceAll('{{reference_image}}', values.reference_image ?? '');
  }
  if (Array.isArray(node)) return node.map((n) => fillWorkflow(n, values));
  if (node && typeof node === 'object') return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, fillWorkflow(v, values)]));
  return node;
}

export function createComfyUiImage(opts: { url: string; workflowPath: string; timeoutMs: number; pollMs: number }): ImageProvider {
  let template: Promise<string> | undefined;
  const call = async (path: string, init: RequestInit = {}) => {
    const res = await fetchWithTimeout('comfyui', `${opts.url}${path}`, init, opts.timeoutMs);
    if (!res.ok) throw new ProviderError('comfyui', `HTTP ${res.status} on ${path.split('?')[0]}: ${await errorSnippet(res)}`, res.status);
    return res;
  };

  async function uploadReference(req: PanelRenderRequest): Promise<string | undefined> {
    const ref = req.references[0];
    if (!ref) return undefined;
    const ext = ref.contentType.split('/')[1] ?? 'png';
    const form = new FormData();
    form.append('image', new Blob([new Uint8Array(ref.data)], { type: ref.contentType }), `ink-${req.panelId}.${ext}`);
    form.append('overwrite', 'true');
    const body = (await (await call('/upload/image', { method: 'POST', body: form })).json()) as { name?: string; subfolder?: string };
    if (!body.name) throw new ProviderError('comfyui', 'upload returned no name');
    return body.subfolder ? `${body.subfolder}/${body.name}` : body.name;
  }

  return {
    name: 'comfyui',
    acceptsPhotos: true,
    async render(req) {
      template ??= readFile(opts.workflowPath, 'utf8');
      const raw = await template;
      const workflow = JSON.parse(raw) as Json;
      const reference_image = raw.includes('{{reference_image}}') ? await uploadReference(req) : undefined;
      const filled = fillWorkflow(workflow, {
        prompt: req.prompt,
        negative_prompt: req.negativePrompt,
        width: req.width,
        height: req.height,
        seed: req.seed,
        ...(reference_image ? { reference_image } : {}),
      });
      const queued = (await (
        await call('/prompt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: filled, client_id: randomUUID() }) })
      ).json()) as { prompt_id?: string };
      const id = queued.prompt_id;
      if (!id) throw new ProviderError('comfyui', 'no prompt_id returned');

      const deadline = Date.now() + opts.timeoutMs;
      while (Date.now() < deadline) {
        const history = (await (await call(`/history/${encodeURIComponent(id)}`)).json()) as Record<
          string,
          { status?: { status_str?: string }; outputs?: Record<string, { images?: Array<{ filename: string; subfolder?: string; type?: string }> }> }
        >;
        const entry = history[id];
        if (entry?.status?.status_str === 'error') throw new ProviderError('comfyui', 'workflow failed');
        const image = Object.values(entry?.outputs ?? {}).flatMap((o) => o.images ?? [])[0];
        if (image) {
          const q = new URLSearchParams({ filename: image.filename, subfolder: image.subfolder ?? '', type: image.type ?? 'output' });
          const data = Buffer.from(await (await call(`/view?${q.toString()}`)).arrayBuffer());
          const type = sniffRaster(data);
          if (!type) throw new ProviderError('comfyui', 'output is not a PNG, JPEG or WebP image');
          return { contentType: type, data };
        }
        await new Promise((r) => setTimeout(r, opts.pollMs));
      }
      throw new ProviderError('comfyui', `no image after ${opts.timeoutMs} ms`);
    },
  };
}
