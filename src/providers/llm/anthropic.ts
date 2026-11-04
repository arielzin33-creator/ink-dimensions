// Anthropic Claude adapter: Messages API over HTTPS with fetch (no SDK).
// UNTESTED AGAINST THE LIVE SERVICE: verified only against a local fake server that mimics
// the documented request and response shapes. Verify with a real key before relying on it.
//
// Request:  POST {baseUrl}/v1/messages
//           headers x-api-key, anthropic-version: 2023-06-01, content-type: application/json
//           body { model, max_tokens, system, messages: [{ role: 'user', content }] }
// Response: { content: [{ type: 'text', text }], stop_reason, ... }
import { errorSnippet, fetchWithTimeout, ProviderError } from '../errors.js';
import type { LlmProvider } from './types.js';

export const ANTHROPIC_VERSION = '2023-06-01';

export function createAnthropicLlm(opts: { apiKey: string; model: string; baseUrl: string; timeoutMs: number; maxTokens: number }): LlmProvider {
  return {
    name: 'anthropic',
    async complete(req) {
      const res = await fetchWithTimeout(
        'anthropic',
        `${opts.baseUrl}/v1/messages`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': opts.apiKey,
            'anthropic-version': ANTHROPIC_VERSION,
          },
          body: JSON.stringify({
            model: opts.model,
            max_tokens: req.maxTokens ?? opts.maxTokens,
            system: req.system,
            messages: [{ role: 'user', content: req.prompt }],
          }),
        },
        opts.timeoutMs,
      );
      if (!res.ok) throw new ProviderError('anthropic', `HTTP ${res.status}: ${await errorSnippet(res)}`, res.status);
      const body = (await res.json().catch(() => null)) as { content?: Array<{ type?: string; text?: string }>; stop_reason?: string } | null;
      const text = (body?.content ?? [])
        .filter((b) => b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('');
      if (!text) throw new ProviderError('anthropic', 'response contained no text');
      if (body?.stop_reason === 'max_tokens') throw new ProviderError('anthropic', 'response was cut off (max_tokens); raise LLM_MAX_TOKENS');
      return text;
    },
  };
}
