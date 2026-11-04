// Background render jobs (FR-019 – FR-023). Jobs live in the database; one in-process worker
// claims queued jobs in order (FOR UPDATE SKIP LOCKED, so several instances would not collide),
// renders each panel through the ImageProvider, stores the image and records per-panel results.
// On start-up, jobs left "running" by a crash return to "queued".
import { createHash } from 'node:crypto';
import { ProviderError } from '../providers/errors.js';
import { NEGATIVE_PROMPT, type ReferenceImage } from '../providers/image/types.js';
import { storageKeys } from '../providers/storage/types.js';
import type { Panel, Script } from '../shared/schemas.js';
import { getStyle } from '../shared/styles.js';
import type { JobStatus, PanelResultDto, RenderJobDto } from '../shared/types.js';
import type { CharacterImageRow, CharacterRow, ProjectRow } from './access.js';
import type { AppDeps } from './app.js';
import { errorFields } from './logger.js';

export const PANEL_WIDTH = 800;
export const PANEL_HEIGHT = 600;
const MAX_REFERENCES = 3;

export interface RenderJobRow {
  id: string;
  project_id: string;
  user_id: string;
  status: JobStatus;
  panel_ids: string[];
  results: PanelResultDto[];
  error: string | null;
  request_id: string | null;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
}

export function jobDto(j: RenderJobRow): RenderJobDto {
  const results = j.panel_ids.map((id) => j.results.find((r) => r.panelId === id) ?? { panelId: id, status: 'pending' as const });
  return {
    id: j.id,
    status: j.status,
    total: j.panel_ids.length,
    done: results.filter((r) => r.status === 'done').length,
    failed: results.filter((r) => r.status === 'failed').length,
    results,
    error: j.error,
    createdAt: new Date(j.created_at).toISOString(),
    finishedAt: j.finished_at ? new Date(j.finished_at).toISOString() : null,
  };
}

export function panelSeed(panelId: string): number {
  return createHash('sha256').update(panelId).digest().readUInt32BE(0) % 2_147_483_647;
}

export function panelPrompt(styleId: string, panel: Panel, cast: Array<{ name: string; description: string }>): string {
  const style = getStyle(styleId);
  const people = cast.map((c) => (c.description ? `${c.name} (${c.description})` : c.name)).join('; ');
  return [style.prompt, panel.description, people ? `Characters: ${people}` : ''].filter(Boolean).join('. ');
}

export function panelTexts(panel: Panel): string[] {
  return [panel.description, panel.caption, ...panel.dialogue.map((d) => d.text)];
}

export interface RenderRunner {
  /** Signals that new work may be available. */
  kick(): void;
  /** Processes queued jobs until none remain (tests call this directly). */
  drain(): Promise<void>;
  recover(): Promise<number>;
  stop(): Promise<void>;
}

export function createRenderRunner(deps: AppDeps, opts: { autoRun: boolean; pollMs?: number }): RenderRunner {
  const log = deps.log.child({ component: 'render-runner' });
  let stopped = false;
  let active: Promise<void> | null = null;
  let timer: NodeJS.Timeout | undefined;

  async function claimNext(): Promise<RenderJobRow | null> {
    const { rows } = await deps.db.query<RenderJobRow>(
      `UPDATE render_jobs SET status = 'running', started_at = now()
       WHERE id = (SELECT id FROM render_jobs WHERE status = 'queued' ORDER BY created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED)
       RETURNING *`,
    );
    return rows[0] ?? null;
  }

  async function saveResults(jobId: string, results: PanelResultDto[]) {
    await deps.db.query('UPDATE render_jobs SET results = $2::jsonb WHERE id = $1', [jobId, JSON.stringify(results)]);
  }

  async function references(project: ProjectRow, cast: CharacterRow[], images: CharacterImageRow[]): Promise<ReferenceImage[]> {
    const nameById = new Map(cast.map((c) => [c.id, c.name]));
    const out: ReferenceImage[] = [];
    for (const img of images) {
      if (out.length >= MAX_REFERENCES) break;
      const name = nameById.get(img.character_id);
      if (name === undefined || img.project_id !== project.id) continue;
      if (img.kind === 'photo' && !deps.providers.image.acceptsPhotos) continue;
      const stored = await deps.providers.storage.get(img.storage_key);
      if (stored) out.push({ characterName: name, kind: img.kind, contentType: stored.contentType, data: stored.data });
    }
    return out;
  }

  async function runJob(job: RenderJobRow): Promise<void> {
    const started = Date.now();
    const jlog = log.child({ jobId: job.id, reqId: job.request_id ?? undefined });
    const results: PanelResultDto[] = job.panel_ids.map((panelId) => ({ panelId, status: 'pending' }));
    const finish = async (status: JobStatus, error: string | null) => {
      await deps.db.query("UPDATE render_jobs SET status = $2, error = $3, results = $4::jsonb, finished_at = now() WHERE id = $1", [
        job.id,
        status,
        error,
        JSON.stringify(results),
      ]);
      jlog.info('render job', { status, total: results.length, failed: results.filter((r) => r.status === 'failed').length, durationMs: Date.now() - started });
    };

    const { rows: projects } = await deps.db.query<ProjectRow>('SELECT * FROM projects WHERE id = $1 AND user_id = $2', [job.project_id, job.user_id]);
    const project = projects[0];
    const { rows: scripts } = await deps.db.query<{ content: Script }>('SELECT content FROM scripts WHERE project_id = $1', [job.project_id]);
    if (!project || !scripts[0]) {
      for (const r of results) Object.assign(r, { status: 'failed', error: 'The project or its script no longer exists.' });
      return finish('failed', 'The project or its script no longer exists.');
    }
    const script = scripts[0].content;
    const { rows: characters } = await deps.db.query<CharacterRow>('SELECT * FROM characters WHERE project_id = $1 ORDER BY created_at, id', [project.id]);
    const { rows: images } = await deps.db.query<CharacterImageRow>('SELECT * FROM character_images WHERE project_id = $1 ORDER BY created_at, id', [project.id]);
    const panels = new Map(script.pages.flatMap((p) => p.panels).map((p) => [p.id, p]));

    for (const result of results) {
      if (stopped) break;
      const panel = panels.get(result.panelId);
      try {
        if (!panel) throw new Error('This panel no longer exists in the script.');
        const cast = characters.filter((c) => panel.characters.some((n) => n.toLowerCase() === c.name.toLowerCase()));
        if (project.path === 'photo') {
          const verdict = await deps.providers.moderation.check({ realPeople: true, texts: panelTexts(panel) });
          if (!verdict.allowed) throw new Error(`Refused by moderation (${verdict.categories.join(', ')}).`);
        }
        const characterIds = cast.map((c) => c.id);
        const refs = await references(project, cast, images);
        const image = await deps.providers.image.render({
          panelId: panel.id,
          width: PANEL_WIDTH,
          height: PANEL_HEIGHT,
          style: getStyle(project.style_preset),
          description: panel.description,
          characters: cast.map((c) => ({ name: c.name, description: c.description })),
          prompt: panelPrompt(project.style_preset, panel, cast),
          negativePrompt: NEGATIVE_PROMPT,
          references: refs,
          seed: panelSeed(panel.id),
        });
        const key = storageKeys.panelImage(project.user_id, project.id, panel.id);
        await deps.providers.storage.put(key, image.data, image.contentType);
        try {
          await deps.db.query(
            `INSERT INTO panel_images (project_id, panel_id, storage_key, content_type, character_ids, provider, created_at)
             VALUES ($1, $2, $3, $4, $5::jsonb, $6, now())
             ON CONFLICT (project_id, panel_id) DO UPDATE SET storage_key = EXCLUDED.storage_key, content_type = EXCLUDED.content_type,
               character_ids = EXCLUDED.character_ids, provider = EXCLUDED.provider, created_at = now()`,
            [project.id, panel.id, key, image.contentType, JSON.stringify(characterIds), deps.providers.image.name],
          );
        } catch (err) {
          // The project was deleted while rendering: never leave an orphaned file behind.
          await deps.providers.storage.delete(key);
          throw err;
        }
        result.status = 'done';
      } catch (err) {
        result.status = 'failed';
        result.error = err instanceof ProviderError ? 'The image generator failed for this panel. Try again.' : (err as Error).message.slice(0, 200);
        jlog.warn('panel render failed', { panelId: result.panelId, ...errorFields(err) });
      }
      await saveResults(job.id, results);
    }
    const failed = results.filter((r) => r.status !== 'done').length;
    await finish(failed ? 'failed' : 'succeeded', failed ? `${failed} of ${results.length} panel(s) failed.` : null);
  }

  async function loop(): Promise<void> {
    for (;;) {
      if (stopped) return;
      const job = await claimNext();
      if (!job) return;
      try {
        await runJob(job);
      } catch (err) {
        log.error('render job crashed', { jobId: job.id, ...errorFields(err) });
        await deps.db.query("UPDATE render_jobs SET status = 'failed', error = 'Internal error.', finished_at = now() WHERE id = $1", [job.id]).catch(() => undefined);
      }
    }
  }

  function drain(): Promise<void> {
    if (!active) {
      active = loop().finally(() => {
        active = null;
      });
    }
    return active;
  }

  const runner: RenderRunner = {
    kick() {
      if (opts.autoRun && !stopped) void drain().catch((err: unknown) => log.error('render loop failed', errorFields(err)));
    },
    async drain() {
      // Run until nothing is queued, including jobs queued while a previous drain was running.
      for (;;) {
        await drain();
        const { rows } = await deps.db.query<{ n: number }>("SELECT count(*)::int AS n FROM render_jobs WHERE status = 'queued'");
        if (!rows[0]?.n || stopped) return;
      }
    },
    async recover() {
      const { rows } = await deps.db.query<{ id: string }>("UPDATE render_jobs SET status = 'queued', started_at = NULL WHERE status = 'running' RETURNING id");
      if (rows.length) log.info('resumed interrupted render jobs', { count: rows.length });
      return rows.length;
    },
    async stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      await active?.catch(() => undefined);
    },
  };

  if (opts.autoRun) {
    void runner
      .recover()
      .then(() => runner.kick())
      .catch((err: unknown) => log.error('render recovery failed', errorFields(err)));
    timer = setInterval(() => runner.kick(), opts.pollMs ?? 2000);
    timer.unref();
  }
  return runner;
}
