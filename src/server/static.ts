// Serves the built UI (dist/web) with an SPA fallback to index.html.
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import type { Reply } from './http.js';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

export const APP_CSP = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  "style-src 'self'",
  "script-src 'self'",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

async function fileReply(path: string, immutable: boolean): Promise<Reply | null> {
  try {
    const s = await stat(path);
    if (!s.isFile()) return null;
  } catch {
    return null;
  }
  const type = TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';
  return {
    status: 200,
    headers: {
      'content-type': type,
      'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      'content-security-policy': APP_CSP,
    },
    body: await readFile(path),
  };
}

export function createStaticHandler(webDir: string) {
  const root = resolve(webDir);
  return async (method: string, pathname: string): Promise<Reply> => {
    if (method !== 'GET' && method !== 'HEAD') {
      return { status: 405, headers: { 'content-type': 'text/plain; charset=utf-8' }, body: 'Method not allowed' };
    }
    let decoded: string;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      return { status: 400, headers: { 'content-type': 'text/plain; charset=utf-8' }, body: 'Bad path' };
    }
    const target = normalize(join(root, decoded));
    if (target !== root && !target.startsWith(root + sep)) {
      return { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' }, body: 'Not found' };
    }
    if (decoded !== '/' && extname(decoded)) {
      const r = await fileReply(target, decoded.startsWith('/assets/'));
      return r ?? { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' }, body: 'Not found' };
    }
    const index = await fileReply(join(root, 'index.html'), false);
    return (
      index ?? {
        status: 503,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
        body: 'The web UI is not built. Run `npm run build`, or `npm run dev` for development.',
      }
    );
  };
}
