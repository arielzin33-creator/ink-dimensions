// Projects API (FR-005, FR-006, FR-014, FR-015).
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireUser } from '../../auth/guard.js';
import { createProjectSchema, updateProjectSchema } from '../../shared/schemas.js';
import { STYLE_PRESETS } from '../../shared/styles.js';
import { loadOwnedProject, type ProjectRow } from '../access.js';
import type { AppDeps } from '../app.js';
import { deleteProjectData } from '../deletion.js';
import { projectDto, projectSummary } from '../dto.js';
import { conflict, refused } from '../errors.js';
import { json, noContent, type Router } from '../http.js';

const patchSchema = z.object({ ...updateProjectSchema.shape, path: z.unknown().optional() }).strict();

export function registerProjectRoutes(router: Router, deps: AppDeps): void {
  const guard = { db: deps.db, cookieSecure: deps.config.cookieSecure };

  router.get('/api/styles', async () => json(200, { styles: STYLE_PRESETS.map(({ id, label, description }) => ({ id, label, description })) }));

  router.get('/api/projects', async (ctx) => {
    const user = await requireUser(ctx, guard);
    const { rows } = await deps.db.query<ProjectRow>('SELECT * FROM projects WHERE user_id = $1 ORDER BY updated_at DESC, id', [user.id]);
    return json(200, { projects: rows.map(projectSummary) });
  });

  router.post('/api/projects', async (ctx) => {
    const user = await requireUser(ctx, guard);
    const body = await ctx.body(createProjectSchema);
    const { rows } = await deps.db.query<ProjectRow>('INSERT INTO projects (id, user_id, title, path) VALUES ($1, $2, $3, $4) RETURNING *', [
      randomUUID(),
      user.id,
      body.title,
      body.path,
    ]);
    return json(201, { project: await projectDto(deps.db, rows[0] as ProjectRow) });
  });

  router.get('/api/projects/:id', async (ctx) => {
    const user = await requireUser(ctx, guard);
    const project = await loadOwnedProject(deps.db, user.id, ctx.params.id);
    return json(200, { project: await projectDto(deps.db, project) });
  });

  router.patch('/api/projects/:id', async (ctx) => {
    const user = await requireUser(ctx, guard);
    const project = await loadOwnedProject(deps.db, user.id, ctx.params.id);
    const body = await ctx.body(patchSchema);
    if (body.path !== undefined && body.path !== project.path) throw conflict('The path (real photos or invented characters) is fixed when a project is created.');
    if (project.path === 'photo' && (body.plot !== undefined || body.title !== undefined)) {
      const verdict = await deps.providers.moderation.check({ realPeople: true, texts: [body.title ?? '', body.plot ?? ''] });
      if (!verdict.allowed) throw refused(verdict.categories);
    }
    const { rows } = await deps.db.query<ProjectRow>(
      `UPDATE projects SET title = COALESCE($3, title), style_preset = COALESCE($4, style_preset), plot = COALESCE($5, plot), updated_at = now()
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [project.id, user.id, body.title ?? null, body.stylePreset ?? null, body.plot ?? null],
    );
    return json(200, { project: await projectDto(deps.db, rows[0] as ProjectRow) });
  });

  router.delete('/api/projects/:id', async (ctx) => {
    const user = await requireUser(ctx, guard);
    const project = await loadOwnedProject(deps.db, user.id, ctx.params.id);
    await deleteProjectData(deps, user.id, project.id);
    return noContent();
  });
}
