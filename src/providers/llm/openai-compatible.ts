// Local LLM adapter for any OpenAI-compatible chat completions server (for example Ollama or
// the llama.cpp server). UNTESTED AGAINST THE LIVE SERVICE: verified only against a local fake.
//
// Request:  POST {url}/v1/chat/completions  (if url already ends with /v1, /chat/completions)
//           body { model, messages: [{role:'system'},{role:'user'}], max_tokens, temperature, stream: false }
// Response: { choices: [{ message: { content } , finish_reason }] }
import { errorSnippet, fetchWithTimeout, ProviderError } from '../errors.js';
import type { LlmProvider } from './types.js';

export function chatCompletionsUrl(base: string): string {
  const b = base.replace(/\/+$/, '');
  return b.endsWith('/v1') ? `${b}/chat/completions` : `${b}/v1/chat/completions`;
}

export function createOpenAiCompatibleLlm(opts: { url: string; model: string; apiKey: string | undefined; timeoutMs: number; maxTokens: number }): LlmProvider {
  return {
    name: 'local',
    async complete(req) {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (opts.apiKey) headers.authorization = `Bearer ${opts.apiKey}`;
      const res = await fetchWithTimeout(
        'local',
        chatCompletionsUrl(opts.url),
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: opts.model,
            messages: [
              { role: 'system', content: req.system },
              { role: 'user', content: req.prompt },
            ],
            max_tokens: req.maxTokens ?? opts.maxTokens,
            temperature: 0.7,
            stream: false,
          }),
        },
        opts.timeoutMs,
      );
      if (!res.ok) throw new ProviderError('local', `HTTP ${res.status}: ${await errorSnippet(res)}`, res.status);
      const body = (await res.json().catch(() => null)) as { choices?: Array<{ message?: { content?: string } }> } | null;
      const text = body?.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || !text) throw new ProviderError('local', 'response contained no message content');
      return text;
    },
  };
}
