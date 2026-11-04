// Starts the real HTTP app on an ephemeral port with in-memory PGlite, in-memory storage and
// twins. No network beyond 127.0.0.1.
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { createProviders, type Providers } from '../../src/providers/index.js';
import { createApp, type App } from '../../src/server/app.js';
import { loadConfig } from '../../src/server/config.js';
import { openPglite, type Db } from '../../src/server/db.js';
import type { FeatureFlags } from '../../src/server/flags.js';
import { createLogger } from '../../src/server/logger.js';
import { migrate } from '../../src/server/migrate.js';

export interface TestApp {
  base: string;
  db: Db;
  app: App;
  providers: Providers;
  client(): Client;
  close(): Promise<void>;
}

export interface Res<T = any> {
  status: number;
  body: T;
  headers: Headers;
  text: string;
}

export interface Client {
  cookie: string | undefined;
  req<T = any>(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<Res<T>>;
  get<T = any>(path: string): Promise<Res<T>>;
  post<T = any>(path: string, body?: unknown): Promise<Res<T>>;
  put<T = any>(path: string, body?: unknown): Promise<Res<T>>;
  patch<T = any>(path: string, body?: unknown): Promise<Res<T>>;
  del<T = any>(path: string, body?: unknown): Promise<Res<T>>;
  signUp(email?: string, password?: string): Promise<Res>;
}

let counter = 0;

export async function startTestApp(opts: { env?: Record<string, string>; providers?: Partial<Providers>; flags?: FeatureFlags } = {}): Promise<TestApp> {
  const config = loadConfig({ NODE_ENV: 'test', STORAGE_PROVIDER: 'memory', LOG_LEVEL: 'silent', RELEASE: 'test-release', ...opts.env });
  const db = await openPglite('memory://');
  await migrate(db, join(import.meta.dirname, '../../migrations'));
  const providers = { ...createProviders(config), ...opts.providers };
  const log = createLogger({ level: config.logLevel, release: config.release });
  const app = createApp({ config, db, log, providers, ...(opts.flags ? { flags: opts.flags } : {}) }, { autoRun: false });
  const server = createServer(app.handler);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const client = (): Client => {
    const c: Client = {
      cookie: undefined,
      async req(method, path, body, headers = {}) {
        const h: Record<string, string> = { ...headers };
        if (c.cookie) h.cookie = c.cookie;
        if (body !== undefined) h['content-type'] ??= 'application/json';
        const res = await fetch(base + path, { method, headers: h, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
        const setCookie = res.headers.get('set-cookie');
        if (setCookie) {
          const pair = setCookie.split(';')[0] ?? '';
          c.cookie = pair.endsWith('=') ? undefined : pair;
        }
        const text = await res.text();
        let parsed: unknown = text;
        if ((res.headers.get('content-type') ?? '').includes('application/json')) parsed = JSON.parse(text);
        return { status: res.status, body: parsed as never, headers: res.headers, text };
      },
      get: (p) => c.req('GET', p),
      post: (p, b) => c.req('POST', p, b ?? {}),
      put: (p, b) => c.req('PUT', p, b ?? {}),
      patch: (p, b) => c.req('PATCH', p, b ?? {}),
      del: (p, b) => c.req('DELETE', p, b),
      signUp: (email, password = 'correct horse battery') => c.post('/api/auth/signup', { email: email ?? `user${++counter}-${Date.now()}@example.com`, password }),
    };
    return c;
  };

  return {
    base,
    db,
    app,
    providers,
    client,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
      await app.stop();
      await db.close();
    },
  };
}
