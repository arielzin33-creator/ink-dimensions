// Application wiring: dependencies in, request handler out. Tests build it with twins.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { registerAuthRoutes } from '../auth/routes.js';
import type { Providers } from '../providers/index.js';
import type { Config } from './config.js';
import type { Db } from './db.js';
import { createRequestHandler, json, Router, type Reply } from './http.js';
import type { Logger } from './logger.js';
import { createMetrics, type Metrics } from './metrics.js';
import { createFeatureFlags, type FeatureFlags } from './flags.js';
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
  /** Created by createApp when absent. */
  metrics?: Metrics;
  /** Created from config.flagsFile when absent. */
  flags?: FeatureFlags;
}

export type ResolvedDeps = AppDeps & { metrics: Metrics; flags: FeatureFlags };

export type Fallback = (req: IncomingMessage, res: ServerResponse, ctx: { reqId: string }) => Promise<Reply | 'handled'>;

export interface App {
  router: Router;
  runner: RenderRunner;
  metrics: Metrics;
  handler: (req: IncomingMessage, res: ServerResponse) => void;
  /** Stops background work. */
  stop(): Promise<void>;
}

export function createApp(deps: AppDeps, opts: { fallback?: Fallback; autoRun?: boolean } = {}): App {
  const router = new Router();
  const metrics = deps.metrics ?? createMetrics();
  const flags = deps.flags ?? createFeatureFlags({ file: deps.config.flagsFile, log: deps.log });
  const full: ResolvedDeps = { ...deps, metrics, flags };
  deps = full;
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

  // Operational metrics: no auth, no personal data (FR-035).
  router.get('/metrics.json', async () => {
    let queued: number | null = null;
    let running: number | null = null;
    try {
      const { rows } = await deps.db.query<{ status: string; n: number }>(
        "SELECT status, count(*)::int AS n FROM render_jobs WHERE status IN ('queued', 'running') GROUP BY status",
      );
      queued = rows.find((r) => r.status === 'queued')?.n ?? 0;
      running = rows.find((r) => r.status === 'running')?.n ?? 0;
    } catch {
      // Database unavailable: report the in-process counters only.
    }
    return json(200, {
      release: deps.config.release,
      uptime_s: Math.floor((Date.now() - metrics.startedAt) / 1000),
      requests_total: metrics.requestsTotal,
      errors_total: metrics.errorsTotal,
      jobs: { queued, running, failed_total: metrics.jobsFailedTotal },
    });
  });

  router.get('/api/features', async () => json(200, { photoPathEnabled: await flags.photoPathEnabled(), renderEnabled: await flags.renderEnabled() }));

  registerAuthRoutes(router, { db: deps.db, storage: deps.providers.storage, cookieSecure: deps.config.cookieSecure });
  registerProjectRoutes(router, full);
  registerCharacterRoutes(router, full);
  registerScriptRoutes(router, full);
  registerRenderRoutes(router, full, runner);
  registerPageRoutes(router, deps);

  const handler = createRequestHandler({ router, log: deps.log, release: deps.config.release, onResponse: (status) => metrics.recordResponse(status), ...(opts.fallback ? { fallback: opts.fallback } : {}) });
  return { router, runner, metrics, handler, stop: () => runner.stop() };
}
