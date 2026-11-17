import { afterEach, describe, expect, it } from 'vitest';
import { ProviderError } from '../../src/providers/errors.js';
import { createHttpEmail } from '../../src/providers/email/http.js';
import { createTwinEmail } from '../../src/providers/email/twin.js';
import { sendJson, startFakeServer } from '../helpers/fake-server.js';

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

const msg = { to: 'reader@example.com', subject: 'Hello', text: 'Body text' };

describe('email providers (spec 002 FR-116)', () => {
  it('the twin records messages and is not a real service', async () => {
    const twin = createTwinEmail();
    await twin.send(msg);
    expect(twin.real).toBe(false);
    expect(twin.sent).toEqual([msg]);
  });

  it('the http adapter posts the documented JSON with the bearer key', async () => {
    const fake = await startFakeServer((_req, res) => sendJson(res, 202, { id: 'm1' }));
    close = fake.close;
    const email = createHttpEmail({ url: `${fake.url}/send`, apiKey: 'key-123', from: 'ink@example.org', timeoutMs: 5_000 });
    await email.send(msg);
    expect(email.real).toBe(true);
    expect(fake.requests[0]).toMatchObject({ method: 'POST', url: '/send' });
    expect(fake.requests[0]?.headers.authorization).toBe('Bearer key-123');
    expect(JSON.parse(fake.requests[0]?.body ?? '{}')).toEqual({ from: 'ink@example.org', ...msg });
  });

  it('turns a refusal into a ProviderError that carries no address or body', async () => {
    const fake = await startFakeServer((_req, res) => sendJson(res, 500, { error: 'bad address reader@example.com' }));
    close = fake.close;
    const email = createHttpEmail({ url: fake.url, apiKey: 'k', from: 'ink@example.org', timeoutMs: 5_000 });
    const err = await email.send(msg).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(String((err as Error).message)).not.toMatch(/@|Body text/);
  });
});
