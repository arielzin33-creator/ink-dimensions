// Process entry point: config -> logger -> database (+ migrations) -> providers -> HTTP.
import { createServer } from 'node:http';
import { createProviders } from '../providers/index.js';
import { createApp, type Fallback } from './app.js';
import { ConfigError, loadConfig } from './config.js';
import { openDb } from './db.js';
import { createLogger, errorFields } from './logger.js';
import { migrate } from './migrate.js';
import { createStaticHandler } from './static.js';

async function devViteFallback(): Promise<Fallback> {
  const { createServer: createVite } = await import('vite');
  const vite = await createVite({ server: { middlewareMode: true }, appType: 'spa' });
  return (req, res) =>
    new Promise((resolve) => {
      res.on('finish', () => resolve('handled'));
      vite.middlewares(req, res, () => resolve({ status: 404, headers: { 'content-type': 'text/plain' }, body: 'Not found' }));
    });
}

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`configuration error: ${err.message}\n`);
      process.exit(2);
    }
    throw err;
  }
  const log = createLogger({ level: config.logLevel, release: config.release });
  const db = await openDb(config);
  const migrations = await migrate(db, config.migrationsDir);
  const providers = createProviders(config);
  log.info('starting', {
    nodeEnv: config.nodeEnv,
    db: db.kind,
    migrationsApplied: migrations.applied,
    providers: { llm: providers.llm.name, image: providers.image.name, storage: providers.storage.name, moderation: providers.moderation.name },
  });

  let fallback: Fallback;
  if (config.devVite) {
    fallback = await devViteFallback();
  } else {
    const serveStatic = createStaticHandler(config.webDir);
    fallback = (req) => serveStatic(req.method ?? 'GET', new URL(req.url ?? '/', 'http://localhost').pathname);
  }
  const app = createApp({ config, db, log, providers }, { fallback });
  const server = createServer(app.handler);
  server.requestTimeout = 120_000;
  server.listen(config.port, config.host, () => log.info('listening', { host: config.host, port: config.port }));

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log.info('shutting down', { signal });
    server.close();
    server.closeIdleConnections();
    await app.stop();
    await db.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (err) => log.error('unhandled rejection', errorFields(err)));
}

main().catch((err: unknown) => {
  process.stderr.write(`fatal: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  process.exit(1);
});
