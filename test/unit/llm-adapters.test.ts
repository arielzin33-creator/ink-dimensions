import { afterEach, describe, expect, it } from 'vitest';
import { createAnthropicLlm } from '../../src/providers/llm/anthropic.js';
import { chatCompletionsUrl, createOpenAiCompatibleLlm } from '../../src/providers/llm/openai-compatible.js';
import type { LlmRequest } from '../../src/providers/llm/types.js';
import { ProviderError } from '../../src/providers/errors.js';
import { getStyle } from '../../src/shared/styles.js';
import { sendJson, startFakeServer } from '../helpers/fake-server.js';

const req: LlmRequest = {
  system: 'You write comics.',
  prompt: 'Write it.',
  script: { title: 't', plot: 'p', style: getStyle('manga'), characters: [], pages: 1, realPeople: false },
};
let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

describe('Anthropic adapter (fake server)', () => {
  it('sends the Messages API request shape and returns the text', async () => {
    const fake = await startFakeServer((_r, res) => sendJson(res, 200, { content: [{ type: 'text', text: '{"pages":' }, { type: 'text', text: '[]}' }], stop_reason: 'end_turn' }));
    close = fake.close;
    const llm = createAnthropicLlm({ apiKey: 'sk-test', model: 'claude-test', baseUrl: fake.url, timeoutMs: 5000, maxTokens: 1000 });
    expect(await llm.complete(req)).toBe('{"pages":[]}');
    const r = fake.requests[0];
    expect(r?.method).toBe('POST');
    expect(r?.url).toBe('/v1/messages');
    expect(r?.headers['x-api-key']).toBe('sk-test');
    expect(r?.headers['anthropic-version']).toBe('2023-06-01');
    expect(JSON.parse(r?.body ?? '{}')).toEqual({
      model: 'claude-test',
      max_tokens: 1000,
      system: 'You write comics.',
      messages: [{ role: 'user', content: 'Write it.' }],
    });
  });

  it('maps HTTP errors, empty and truncated responses, and timeouts to ProviderError', async () => {
    const fake = await startFakeServer((_r, res) => sendJson(res, 429, { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } }));
    close = fake.close;
    const llm = createAnthropicLlm({ apiKey: 'k', model: 'm', baseUrl: fake.url, timeoutMs: 300, maxTokens: 10 });
    await expect(llm.complete(req)).rejects.toMatchObject({ name: 'ProviderError', status: 429 });
    fake.setHandler((_r, res) => sendJson(res, 200, { content: [] }));
    await expect(llm.complete(req)).rejects.toThrow(/no text/);
    fake.setHandler((_r, res) => sendJson(res, 200, { content: [{ type: 'text', text: 'x' }], stop_reason: 'max_tokens' }));
    await expect(llm.complete(req)).rejects.toThrow(/cut off/);
    fake.setHandler(() => new Promise(() => undefined));
    await expect(llm.complete(req)).rejects.toThrow(/timed out/);
  });
});

describe('OpenAI-compatible adapter (fake server)', () => {
  it('sends chat completions with system and user messages', async () => {
    const fake = await startFakeServer((_r, res) => sendJson(res, 200, { choices: [{ message: { role: 'assistant', content: 'hello' } }] }));
    close = fake.close;
    const llm = createOpenAiCompatibleLlm({ url: fake.url, model: 'llama3', apiKey: 'tok', timeoutMs: 5000, maxTokens: 500 });
    expect(await llm.complete(req)).toBe('hello');
    const r = fake.requests[0];
    expect(r?.url).toBe('/v1/chat/completions');
    expect(r?.headers.authorization).toBe('Bearer tok');
    const body = JSON.parse(r?.body ?? '{}');
    expect(body).toMatchObject({ model: 'llama3', max_tokens: 500, stream: false });
    expect(body.messages).toEqual([
      { role: 'system', content: 'You write comics.' },
      { role: 'user', content: 'Write it.' },
    ]);
  });

  it('omits authorization without a key and reports errors', async () => {
    const fake = await startFakeServer((_r, res) => sendJson(res, 500, { error: 'model not loaded' }));
    close = fake.close;
    const llm = createOpenAiCompatibleLlm({ url: fake.url, model: 'm', apiKey: undefined, timeoutMs: 5000, maxTokens: 10 });
    const err = await llm.complete(req).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(fake.requests[0]?.headers.authorization).toBeUndefined();
    fake.setHandler((_r, res) => sendJson(res, 200, { choices: [] }));
    await expect(llm.complete(req)).rejects.toThrow(/no message content/);
  });

  it('builds the endpoint URL with or without /v1', () => {
    expect(chatCompletionsUrl('http://h:11434')).toBe('http://h:11434/v1/chat/completions');
    expect(chatCompletionsUrl('http://h:8080/v1/')).toBe('http://h:8080/v1/chat/completions');
  });

  it('reports an unreachable server as a provider error', async () => {
    const llm = createOpenAiCompatibleLlm({ url: 'http://127.0.0.1:1', model: 'm', apiKey: undefined, timeoutMs: 2000, maxTokens: 10 });
    await expect(llm.complete(req)).rejects.toThrow(/request failed/);
  });
});
