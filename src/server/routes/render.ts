// Render routes: start a job (202), poll it, and fetch panel images.
import { randomUUID } from 'node:crypto';
import { requireUser } from '../../auth/guard.js';
import { renderSchema, type Script } from '../../shared/schemas.js';
import { isUuid, loadOwnedProject } from '../access.js';
import type { AppDeps } from '../app.js';
import { badRequest, HttpError, notFound, refused } from '../errors.js';
import { json, type Router } from '../http.js';
import { jobDto, panelTexts, type RenderJobRow, type RenderRunner } from '../render-runner.js';

export const PANEL_IMAGE_CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; frame-ancestors 'none'";

export function registerRenderRoutes(router: Router, deps: AppDeps, runner: RenderRunner): void {
  const guard = { db: deps.db, cookieSecure: deps.config.cookieSecure };

  router.post('/api/projects/:id/render', async (ctx) => {
    const user = await requireUser(ctx, guard);
    const project = await loadOwnedProject(deps.db, user.id, ctx.params.id);
    const body = await ctx.body(renderSchema);
    const { rows } = await deps.db.query<{ content: Script }>('SELECT content FROM scripts WHERE project_id = $1', [project.id]);
    if (!rows[0]) throw badRequest('Generate a script first.');
    const panels = rows[0].content.pages.flatMap((p) => p.panels);
    const byId = new Map(panels.map((p) => [p.id, p]));
    const ids = body.panelIds ? [...new Set(body.panelIds)] : panels.map((p) => p.id);
    const unknown = ids.filter((id) => !byId.has(id));
    if (unknown.length) throw badRequest('Some panels are not in the script.', { unknown });
    if (ids.length === 0 || ids.length > 36) throw badRequest('A render job takes 1 to 36 panels.');
    if (project.path === 'photo') {
      const verdict = await deps.providers.moderation.check({ realPeople: true, texts: ids.flatMap((id) => panelTexts(byId.get(id)!)) });
      if (!verdict.allowed) throw refused(verdict.categories);
    }
    const { rows: activeJobs } = await deps.db.query<RenderJobRow>(
      "SELECT * FROM render_jobs WHERE project_id = $1 AND status IN ('queued', 'running') ORDER BY created_at DESC LIMIT 1",
      [project.id],
    );
    if (activeJobs[0]) throw new HttpError(409, 'render_in_progress', 'A render is already in progress for this project.', { jobId: activeJobs[0].id });
    const { rows: created } = await deps.db.query<RenderJobRow>(
      'INSERT INTO render_jobs (id, project_id, user_id, panel_ids, request_id) VALUES ($1, $2, $3, $4::jsonb, $5) RETURNING *',
      [randomUUID(), project.id, user.id, JSON.stringify(ids), ctx.reqId],
    );
    runner.kick();
    return json(202, { job: jobDto(created[0] as RenderJobRow) });
  });

  router.get('/api/projects/:id/render-jobs/latest', async (ctx) => {
    const user = await requireUser(ctx, guard);
    const project = await loadOwnedProject(deps.db, user.id, ctx.params.id);
    const { rows } = await deps.db.query<RenderJobRow>('SELECT * FROM render_jobs WHERE project_id = $1 ORDER BY created_at DESC, id LIMIT 1', [project.id]);
    return json(200, { job: rows[0] ? jobDto(rows[0]) : null });
  });

  router.get('/api/projects/:id/render-jobs/:jobId', async (ctx) => {
    const user = await requireUser(ctx, guard);
    const project = await loadOwnedProject(deps.db, user.id, ctx.params.id);
    if (!isUuid(ctx.params.jobId)) throw notFound('Render job');
    const { rows } = await deps.db.query<RenderJobRow>('SELECT * FROM render_jobs WHERE id = $1 AND project_id = $2', [ctx.params.jobId, project.id]);
    if (!rows[0]) throw notFound('Render job');
    return json(200, { job: jobDto(rows[0]) });
  });

  router.get('/api/projects/:id/panels/:panelId/image', async (ctx) => {
    const user = await requireUser(ctx, guard);
    const project = await loadOwnedProject(deps.db, user.id, ctx.params.id);
    if (!isUuid(ctx.params.panelId)) throw notFound('Panel image');
    const { rows } = await deps.db.query<{ storage_key: string; content_type: string }>(
      'SELECT storage_key, content_type FROM panel_images WHERE project_id = $1 AND panel_id = $2',
      [project.id, ctx.params.panelId],
    );
    const stored = rows[0] ? await deps.providers.storage.get(rows[0].storage_key) : null;
    if (!rows[0] || !stored) throw notFound('Panel image');
    return {
      status: 200,
      headers: { 'content-type': rows[0].content_type, 'cache-control': 'private, no-store', 'content-security-policy': PANEL_IMAGE_CSP },
      body: stored.data,
    };
  });
}
