// Email over a GENERIC HTTPS JSON contract, not a specific vendor's API.
// UNTESTED AGAINST THE LIVE SERVICE: no vendor is chosen (spec 002, out of scope). Put a thin shim
// in front of the chosen vendor, or adapt this file, to match:
//   POST {EMAIL_HTTP_URL}  authorization: Bearer {EMAIL_HTTP_API_KEY}  content-type: application/json
//   body { from, to, subject, text }. Any 2xx means accepted; bounces are not handled.
import { fetchWithTimeout, ProviderError } from '../errors.js';
import type { EmailProvider } from './types.js';

export function createHttpEmail(opts: { url: string; apiKey: string; from: string; timeoutMs: number }): EmailProvider {
  return {
    name: 'http',
    real: true,
    async send(message) {
      const res = await fetchWithTimeout(
        'email',
        opts.url,
        { method: 'POST', headers: { authorization: `Bearer ${opts.apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: opts.from, ...message }) },
        opts.timeoutMs,
      );
      // Status only: a vendor's error body can echo the address, and errors get logged (NFR-102).
      if (!res.ok) throw new ProviderError('email', `HTTP ${res.status}`, res.status);
    },
  };
}
