// Composed pages and exports (FR-024 – FR-026).
import { requireUser } from '../../auth/guard.js';
import { composePage, type PanelImage } from '../../shared/compose.js';
import type { Script } from '../../shared/schemas.js';
import { loadOwnedProject, type ProjectRow } from '../access.js';
import type { AppDeps } from '../app.js';
import { badRequest, notFound } from '../errors.js';
import { type Router } from '../http.js';
import { printHtml, PRINT_CSP } from '../print.js';
import { createZip } from '../zip.js';
import { PANEL_IMAGE_CSP } from './render.js';

export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'comic'
  );
}

export function registerPageRoutes(router: Router, deps: AppDeps): void {
  const guard = { db: deps.db, cookieSecure: deps.config.cookieSecure };

  async function loadComic(project: ProjectRow): Promise<{ script: Script; images: Map<string, PanelImage> }> {
    const { rows } = await deps.db.query<{ content: Script }>('SELECT content FROM scripts WHERE project_id = $1', [project.id]);
    if (!rows[0]) throw badRequest('Generate a script first.');
    const { rows: imgs } = await deps.db.query<{ panel_id: string; storage_key: string; content_type: string }>(
      'SELECT panel_id, storage_key, content_type FROM panel_images WHERE project_id = $1',
      [project.id],
    );
    const images = new Map<string, PanelImage>();
    for (const i of imgs) {
      const stored = await deps.providers.storage.get(i.storage_key);
      if (stored) images.set(i.panel_id, { contentType: i.content_type, base64: stored.data.toString('base64') });
    }
    return { script: rows[0].content, images };
  }

  const composeAll = (project: ProjectRow, comic: { script: Script; images: Map<string, PanelImage> }) =>
    comic.script.pages.map((page, i) =>
      composePage(page, comic.images, { pageNumber: i + 1, totalPages: comic.script.pages.length, title: comic.script.title || project.title }),
    );

  router.get('/api/projects/:id/pages/:n.svg', async (ctx) => {
    const user = await requireUser(ctx, guard);
    const project = await loadOwnedProject(deps.db, user.id, ctx.params.id);
    const comic = await loadComic(project);
    const n = Number(ctx.params.n);
    const page = Number.isInteger(n) ? comic.script.pages[n - 1] : undefined;
    if (!page) throw notFound('Page');
    const svg = composePage(page, comic.images, { pageNumber: n, totalPages: comic.script.pages.length, title: comic.script.title || project.title });
    const headers: Record<string, string> = { 'content-type': 'image/svg+xml; charset=utf-8', 'content-security-policy': PANEL_IMAGE_CSP, 'cache-control': 'private, no-store' };
    if (ctx.query.get('download') === '1') headers['content-disposition'] = `attachment; filename="${slugify(project.title)}-page-${String(n).padStart(2, '0')}.svg"`;
    return { status: 200, headers, body: svg };
  });

  router.get('/api/projects/:id/export/comic.zip', async (ctx) => {
    const user = await requireUser(ctx, guard);
    const project = await loadOwnedProject(deps.db, user.id, ctx.params.id);
    const slug = slugify(project.title);
    const pages = composeAll(project, await loadComic(project));
    const zip = createZip(pages.map((svg, i) => ({ name: `${slug}/page-${String(i + 1).padStart(2, '0')}.svg`, data: Buffer.from(svg, 'utf8') })));
    return {
      status: 200,
      headers: { 'content-type': 'application/zip', 'content-disposition': `attachment; filename="${slug}.zip"`, 'cache-control': 'private, no-store' },
      body: zip,
    };
  });

  router.get('/api/projects/:id/export/print.html', async (ctx) => {
    const user = await requireUser(ctx, guard);
    const project = await loadOwnedProject(deps.db, user.id, ctx.params.id);
    const comic = await loadComic(project);
    return {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': PRINT_CSP, 'cache-control': 'private, no-store' },
      body: printHtml(comic.script.title || project.title, composeAll(project, comic)),
    };
  });
}
