// Hosted image API adapter: a GENERIC HTTPS JSON contract, not a specific vendor's API.
// UNTESTED AGAINST THE LIVE SERVICE. The owner has not chosen a default vendor (spec FR-030);
// put a thin shim in front of the chosen vendor, or adapt this file, to match this contract:
//
// Request:  POST {HOSTED_IMAGE_URL}
//           headers authorization: Bearer {HOSTED_IMAGE_API_KEY}, content-type: application/json
//           body { prompt, negative_prompt, width, height, seed, style,
//                  reference_images: [{ name, kind, content_type, data_base64 }] }
// Response: raw image bytes (content-type image/png | image/jpeg | image/webp), or
//           JSON { image_base64, content_type }.
// The result must be PNG, JPEG or WebP by magic bytes; SVG and anything else are rejected.
// Photos are included only when HOSTED_IMAGE_ALLOW_PHOTOS=true (spec FR-022).
import { errorSnippet, fetchWithTimeout, ProviderError } from '../errors.js';
import { sniffRaster } from './sniff.js';
import type { ImageProvider } from './types.js';

const MAX_RESULT_BYTES = 15 * 1024 * 1024;

export function createHostedImage(opts: { url: string; apiKey: string; timeoutMs: number; allowPhotos: boolean }): ImageProvider {
  return {
    name: 'hosted',
    acceptsPhotos: opts.allowPhotos,
    async render(req) {
      const refs = req.references.filter((r) => r.kind !== 'photo' || opts.allowPhotos);
      const res = await fetchWithTimeout(
        'hosted',
        opts.url,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${opts.apiKey}`,
            'content-type': 'application/json',
            accept: 'image/png, image/jpeg, image/webp, application/json',
          },
          body: JSON.stringify({
            prompt: req.prompt,
            negative_prompt: req.negativePrompt,
            width: req.width,
            height: req.height,
            seed: req.seed,
            style: req.style.id,
            reference_images: refs.map((r) => ({ name: r.characterName, kind: r.kind, content_type: r.contentType, data_base64: r.data.toString('base64') })),
          }),
        },
        opts.timeoutMs,
      );
      if (!res.ok) throw new ProviderError('hosted', `HTTP ${res.status}: ${await errorSnippet(res)}`, res.status);
      const ct = (res.headers.get('content-type') ?? '').toLowerCase();
      let data: Buffer;
      if (ct.startsWith('application/json')) {
        const body = (await res.json().catch(() => null)) as { image_base64?: unknown } | null;
        if (typeof body?.image_base64 !== 'string') throw new ProviderError('hosted', 'JSON response has no image_base64');
        data = Buffer.from(body.image_base64, 'base64');
      } else {
        data = Buffer.from(await res.arrayBuffer());
      }
      if (data.length > MAX_RESULT_BYTES) throw new ProviderError('hosted', 'image is too large');
      const type = sniffRaster(data);
      if (!type) throw new ProviderError('hosted', 'response is not a PNG, JPEG or WebP image');
      return { contentType: type, data };
    },
  };
}
