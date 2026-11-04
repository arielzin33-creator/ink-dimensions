// Application wiring: dependencies in, request handler out. Tests build it with twins.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Providers } from '../providers/index.js';
import type { Config } from './config.js';
import type { Db } from './db.js';
import { createRequestHandler, json, Router, type Reply } from './http.js';
import type { Logger } from './logger.js';

export interface AppDeps {
  config: Config;
  db: Db;
  log: Logger;
  providers: Providers;
}

export type Fallback = (req: IncomingMessage, res: ServerResponse, ctx: { reqId: string }) => Promise<Reply | 'handled'>;

export interface App {
  router: Router;
  handler: (req: IncomingMessage, res: ServerResponse) => void;
  /** Stops background work. */
  stop(): Promise<void>;
}

export function createApp(deps: AppDeps, opts: { fallback?: Fallback; autoRun?: boolean } = {}): App {
  const router = new Router();

  router.get('/healthz', async () => json(200, { status: 'ok', release: deps.config.release }));
  router.get('/readyz', async (ctx) => {
    try {
      await deps.db.ping();
      return json(200, { status: 'ready', db: deps.db.kind });
    } catch (err) {
      ctx.log.warn('readiness check failed', { err: { message: (err as Error).message } });
      return json(503, { status: 'unavailable' });
    }
  });

  const handler = createRequestHandler({ router, log: deps.log, release: deps.config.release, ...(opts.fallback ? { fallback: opts.fallback } : {}) });
  return { router, handler, stop: async () => undefined };
}
