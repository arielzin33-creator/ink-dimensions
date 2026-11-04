// Minimal HTTP core on node:http: routing with path parameters, JSON-only bodies with byte
// limits, request ids, one structured log line per request, security headers and a uniform
// error envelope. See plan.md §1 for why this is not Fastify.
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ZodType } from 'zod';
import { badRequest, forbidden, HttpError, notFound, tooLarge, unsupportedMedia } from './errors.js';
import { errorFields, type Logger } from './logger.js';

export interface Reply {
  status: number;
  headers?: Record<string, string>;
  body?: string | Buffer;
}

export interface Ctx {
  req: IncomingMessage;
  method: string;
  path: string;
  query: URLSearchParams;
  params: Record<string, string>;
  reqId: string;
  log: Logger;
  /** Set by the auth guard; read by the request logger. */
  userId?: string;
  /** Reads and validates a JSON body. */
  body<T>(schema: ZodType<T>, maxBytes?: number): Promise<T>;
}

export type Handler = (ctx: Ctx) => Promise<Reply>;

interface Route {
  method: string;
  regex: RegExp;
  names: string[];
  handler: Handler;
}

export const DEFAULT_BODY_LIMIT = 64 * 1024;
const API_CSP = "default-src 'none'; frame-ancestors 'none'";

export function json(status: number, data: unknown, headers: Record<string, string> = {}): Reply {
  return { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers }, body: JSON.stringify(data) };
}

export function noContent(headers: Record<string, string> = {}): Reply {
  return { status: 204, headers };
}

export class Router {
  private routes: Route[] = [];

  add(method: string, pattern: string, handler: Handler): this {
    const names: string[] = [];
    const source = pattern
      .split('/')
      .map((seg) =>
        seg.replace(/:([A-Za-z]+)|([^:]+)/g, (_m, name: string | undefined, lit: string | undefined) => {
          if (name) {
            names.push(name);
            return '([^/]+?)';
          }
          return (lit ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }),
      )
      .join('/');
    this.routes.push({ method, regex: new RegExp(`^${source}$`), names, handler });
    return this;
  }

  get = (p: string, h: Handler) => this.add('GET', p, h);
  post = (p: string, h: Handler) => this.add('POST', p, h);
  put = (p: string, h: Handler) => this.add('PUT', p, h);
  patch = (p: string, h: Handler) => this.add('PATCH', p, h);
  delete = (p: string, h: Handler) => this.add('DELETE', p, h);

  match(method: string, path: string): { handler: Handler; params: Record<string, string> } | 'method' | null {
    let pathMatched = false;
    for (const r of this.routes) {
      const m = r.regex.exec(path);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method && !(method === 'HEAD' && r.method === 'GET')) continue;
      const params: Record<string, string> = {};
      r.names.forEach((n, i) => {
        params[n] = decodeURIComponent(m[i + 1] ?? '');
      });
      return { handler: r.handler, params };
    }
    return pathMatched ? 'method' : null;
  }
}

async function readBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const declared = Number(req.headers['content-length'] ?? '0');
  if (declared > maxBytes) throw tooLarge();
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    total += chunk.length;
    if (total > maxBytes) throw tooLarge();
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function isJson(req: IncomingMessage): boolean {
  const ct = String(req.headers['content-type'] ?? '').toLowerCase();
  return ct.split(';')[0]?.trim() === 'application/json';
}

const REQ_ID = /^[A-Za-z0-9._-]{8,64}$/;

export interface HandlerOptions {
  router: Router;
  log: Logger;
  release: string;
  /** Called once per finished response (metrics). */
  onResponse?: (status: number) => void;
  /** Called for non-API paths (static UI or the Vite dev middleware). */
  fallback?: (req: IncomingMessage, res: ServerResponse, ctx: { reqId: string }) => Promise<Reply | 'handled'>;
}

export function createRequestHandler(opts: HandlerOptions) {
  return (req: IncomingMessage, res: ServerResponse): void => {
    const started = process.hrtime.bigint();
    const incoming = String(req.headers['x-request-id'] ?? '');
    const reqId = REQ_ID.test(incoming) ? incoming : randomUUID();
    const url = new URL(req.url ?? '/', 'http://localhost');
    const method = (req.method ?? 'GET').toUpperCase();
    const log = opts.log.child({ reqId });
    const ctx: Ctx = {
      req,
      method,
      path: url.pathname,
      query: url.searchParams,
      params: {},
      reqId,
      log,
      async body<T>(schema: ZodType<T>, maxBytes = DEFAULT_BODY_LIMIT): Promise<T> {
        if (!isJson(req)) throw unsupportedMedia();
        const raw = await readBody(req, maxBytes);
        let data: unknown;
        try {
          data = raw.length ? JSON.parse(raw.toString('utf8')) : {};
        } catch {
          throw badRequest('Body is not valid JSON.');
        }
        const parsed = schema.safeParse(data);
        if (!parsed.success) {
          throw badRequest(
            'Some fields are invalid.',
            parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
          );
        }
        return parsed.data;
      },
    };

    res.on('finish', () => {
      opts.onResponse?.(res.statusCode);
      const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
      log.info('request', {
        method,
        path: url.pathname,
        status: res.statusCode,
        durationMs: Math.round(durationMs * 10) / 10,
        ...(ctx.userId ? { userId: ctx.userId } : {}),
      });
    });

    const send = (reply: Reply) => {
      if (res.headersSent) return;
      res.statusCode = reply.status;
      res.setHeader('x-request-id', reqId);
      res.setHeader('x-content-type-options', 'nosniff');
      res.setHeader('referrer-policy', 'no-referrer');
      res.setHeader('x-frame-options', 'DENY');
      res.setHeader('cross-origin-opener-policy', 'same-origin');
      for (const [k, v] of Object.entries(reply.headers ?? {})) res.setHeader(k, v);
      if (!res.hasHeader('content-security-policy')) res.setHeader('content-security-policy', API_CSP);
      if (!res.hasHeader('cache-control')) res.setHeader('cache-control', 'no-store');
      res.end(method === 'HEAD' ? undefined : reply.body);
    };

    const fail = (err: unknown) => {
      if (err instanceof HttpError) {
        if (err.status === 413) res.setHeader('connection', 'close');
        send(json(err.status, { error: { code: err.code, message: err.message, details: err.details, requestId: reqId } }));
        return;
      }
      log.error('unhandled error', { method, path: url.pathname, ...errorFields(err) });
      send(json(500, { error: { code: 'internal', message: 'Something went wrong.', requestId: reqId, release: opts.release } }));
    };

    const run = async () => {
      // Defence in depth on top of SameSite=Strict: refuse cross-origin state changes.
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        const origin = req.headers.origin;
        if (origin && origin !== 'null') {
          let originHost: string;
          try {
            originHost = new URL(origin).host;
          } catch {
            originHost = '';
          }
          if (originHost !== req.headers.host) throw forbidden('Cross-origin request refused.');
        } else if (origin === 'null') {
          throw forbidden('Cross-origin request refused.');
        }
      }
      const isApi = url.pathname.startsWith('/api/') || url.pathname === '/healthz' || url.pathname === '/readyz' || url.pathname === '/metrics.json';
      if (!isApi && opts.fallback) {
        const r = await opts.fallback(req, res, { reqId });
        if (r !== 'handled') send(r);
        return;
      }
      const m = opts.router.match(method, url.pathname);
      if (m === 'method') throw new HttpError(405, 'method_not_allowed', 'Method not allowed.');
      if (!m) throw notFound('Route');
      ctx.params = m.params;
      send(await m.handler(ctx));
    };

    run().catch(fail);
  };
}
