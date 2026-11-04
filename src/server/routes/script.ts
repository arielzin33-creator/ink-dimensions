// Script routes: generate with the LLM, read, and save edits with a version check.
import { requireUser } from '../../auth/guard.js';
import { generateScriptSchema, saveScriptSchema, type Script } from '../../shared/schemas.js';
import { getStyle } from '../../shared/styles.js';
import type { CharacterDto } from '../../shared/types.js';
import { loadOwnedProject, type ProjectRow } from '../access.js';
import type { AppDeps } from '../app.js';
import { loadCharacters } from '../dto.js';
import { badRequest, conflict, notFound, refused } from '../errors.js';
import { json, type Router } from '../http.js';
import { generateScript, normaliseScript, panelIds, scriptDto, scriptTexts, type ScriptRow } from '../script-service.js';

export function registerScriptRoutes(router: Router, deps: AppDeps): void {
  const guard = { db: deps.db, cookieSecure: deps.config.cookieSecure };

  async function moderate(project: ProjectRow, texts: string[]) {
    const verdict = await deps.providers.moderation.check({ realPeople: project.path === 'photo', texts });
    if (!verdict.allowed) throw refused(verdict.categories);
  }

  /** Saves a script as the next version and deletes images of panels that no longer exist. */
  async function save(project: ProjectRow, script: Script, expectedVersion: number | null): Promise<ScriptRow> {
    const content = JSON.stringify(script);
    let rows: ScriptRow[];
    if (expectedVersion === null) {
      ({ rows } = await deps.db.query<ScriptRow>(
        `INSERT INTO scripts (project_id, version, content) VALUES ($1, 1, $2::jsonb)
         ON CONFLICT (project_id) DO UPDATE SET version = scripts.version + 1, content = EXCLUDED.content, updated_at = now()
         RETURNING *`,
        [project.id, content],
      ));
    } else {
      ({ rows } = await deps.db.query<ScriptRow>(
        'UPDATE scripts SET version = version + 1, content = $3::jsonb, updated_at = now() WHERE project_id = $1 AND version = $2 RETURNING *',
        [project.id, expectedVersion, content],
      ));
      if (!rows[0]) throw conflict('The script was changed elsewhere. Reload it before saving.');
    }
    const keep = panelIds(script);
    const { rows: gone } = await deps.db.query<{ storage_key: string }>(
      'DELETE FROM panel_images WHERE project_id = $1 AND NOT (panel_id::text = ANY($2::text[])) RETURNING storage_key',
      [project.id, keep],
    );
    for (const g of gone) await deps.providers.storage.delete(g.storage_key);
    await deps.db.query('UPDATE projects SET updated_at = now() WHERE id = $1', [project.id]);
    return rows[0] as ScriptRow;
  }

  function checkCast(project: ProjectRow, characters: CharacterDto[]) {
    if (characters.length === 0) throw badRequest('Add at least one character first.');
    for (const c of characters) {
      if (project.path === 'photo' && !c.images.some((i) => i.kind === 'photo')) throw badRequest(`Add a photo of ${c.name} first.`);
      if (project.path === 'invented' && !c.description && c.images.length === 0) throw badRequest(`Describe ${c.name} or add reference art first.`);
    }
  }

  router.post('/api/projects/:id/script/generate', async (ctx) => {
    const user = await requireUser(ctx, guard);
    const project = await loadOwnedProject(deps.db, user.id, ctx.params.id);
    const { pages } = await ctx.body(generateScriptSchema);
    if (!project.plot.trim()) throw badRequest('Write the plot first.');
    const characters = await loadCharacters(deps.db, project.id);
    checkCast(project, characters);
    await moderate(project, [project.title, project.plot, ...characters.flatMap((c) => [c.name, c.description])]);
    const script = await generateScript(
      deps.providers.llm,
      {
        title: project.title,
        plot: project.plot,
        style: getStyle(project.style_preset),
        characters: characters.map((c) => ({ name: c.name, description: c.description })),
        pages,
        realPeople: project.path === 'photo',
      },
      ctx.log,
    );
    await moderate(project, scriptTexts(script));
    const row = await save(project, script, null);
    ctx.log.info('script generated', { provider: deps.providers.llm.name, pages: script.pages.length, version: row.version });
    return json(201, await scriptDto(deps.db, row));
  });

  router.get('/api/projects/:id/script', async (ctx) => {
    const user = await requireUser(ctx, guard);
    const project = await loadOwnedProject(deps.db, user.id, ctx.params.id);
    const { rows } = await deps.db.query<ScriptRow>('SELECT * FROM scripts WHERE project_id = $1', [project.id]);
    if (!rows[0]) throw notFound('Script');
    return json(200, await scriptDto(deps.db, rows[0]));
  });

  router.put('/api/projects/:id/script', async (ctx) => {
    const user = await requireUser(ctx, guard);
    const project = await loadOwnedProject(deps.db, user.id, ctx.params.id);
    const body = await ctx.body(saveScriptSchema, 512 * 1024);
    await moderate(project, scriptTexts(body.script));
    const row = await save(project, normaliseScript(body.script), body.version);
    return json(200, await scriptDto(deps.db, row));
  });
}
