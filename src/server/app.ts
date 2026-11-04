// Application wiring: dependencies in, request handler out. Tests build it with twins.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { registerAuthRoutes } from '../auth/routes.js';
import type { Providers } from '../providers/index.js';
import type { Config } from './config.js';
import type { Db } from './db.js';
import { createRequestHandler, json, Router, type Reply } from './http.js';
import type { Logger } from './logger.js';
import { registerCharacterRoutes } from './routes/characters.js';
import { registerPageRoutes } from './routes/pages.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerRenderRoutes } from './routes/render.js';
import { createRenderRunner, type RenderRunner } from './render-runner.js';
import { registerScriptRoutes } from './routes/script.js';

export interface AppDeps {
  config: Config;
  db: Db;
  log: Logger;
  providers: Providers;
}

export type Fallback = (req: IncomingMessage, res: ServerResponse, ctx: { reqId: string }) => Promise<Reply | 'handled'>;

export interface App {
  router: Router;
  runner: RenderRunner;
  handler: (req: IncomingMessage, res: ServerResponse) => void;
  /** Stops background work. */
  stop(): Promise<void>;
}

export function createApp(deps: AppDeps, opts: { fallback?: Fallback; autoRun?: boolean } = {}): App {
  const router = new Router();
  const runner = createRenderRunner(deps, { autoRun: opts.autoRun ?? true });

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

  registerAuthRoutes(router, { db: deps.db, storage: deps.providers.storage, cookieSecure: deps.config.cookieSecure });
  registerProjectRoutes(router, deps);
  registerCharacterRoutes(router, deps);
  registerScriptRoutes(router, deps);
  registerRenderRoutes(router, deps, runner);
  registerPageRoutes(router, deps);

  const handler = createRequestHandler({ router, log: deps.log, release: deps.config.release, ...(opts.fallback ? { fallback: opts.fallback } : {}) });
  return { router, runner, handler, stop: () => runner.stop() };
}
