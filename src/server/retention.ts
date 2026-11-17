// Retention (spec 002 FR-118 – FR-124): warn the owner of a project with photos after 76 idle days,
// and delete the photos and every image derived from them after 90 idle days, at least 14 days
// after a successful warning. Runs at start-up and hourly. Each photo is its own step, so an
// interrupted run can simply run again (NFR-105). Logs counts only (NFR-102).
import type { Providers } from '../providers/index.js';
import type { Config } from './config.js';
import type { Db } from './db.js';
import { deleteCharacterImage } from './deletion.js';
import type { FeatureFlags } from './flags.js';
import { errorFields, type Logger } from './logger.js';

export const RETENTION = { warnAfterDays: 76, deleteAfterDays: 90, noticeDays: 14, inviteTidyDays: 30, intervalMs: 3_600_000 } as const;
const DAY = 86_400_000;

export interface RetentionDeps {
  db: Db;
  log: Logger;
  flags: FeatureFlags;
  providers: Providers;
  config: Pick<Config, 'nodeEnv' | 'appUrl'>;
}

export interface RetentionResult {
  skipped: 'paused' | 'no_email_service' | null;
  warnedOwners: number;
  failedOwners: number;
  photosDeleted: number;
  invitesDeleted: number;
}

function warningText(appUrl: string, deleteOn: string, projects: number): string {
  return [
    `${projects === 1 ? 'One of your projects has' : `${projects} of your projects have`} had no activity for ${RETENTION.warnAfterDays} days.`,
    `Their photos, and every panel made from them, will be deleted on or after ${deleteOn} (UTC) unless you open those projects before then.`,
    'Scripts, text and invented characters are kept.',
    `Sign in to keep them: ${appUrl}/projects`,
  ].join('\n\n');
}

export async function runRetention(deps: RetentionDeps, now = new Date()): Promise<RetentionResult> {
  const log = deps.log.child({ component: 'retention' });
  const result: RetentionResult = { skipped: null, warnedOwners: 0, failedOwners: 0, photosDeleted: 0, invitesDeleted: 0 };
  if (!(await deps.flags.retentionEnabled())) {
    log.info('retention is paused by its switch');
    return { ...result, skipped: 'paused' };
  }
  if (deps.config.nodeEnv === 'production' && !deps.providers.email.real) {
    log.warn('retention is off: no email service is configured');
    return { ...result, skipped: 'no_email_service' };
  }

  // 1. Warn: one email per owner, recorded only after the service accepted it.
  const warnCutoff = new Date(now.getTime() - RETENTION.warnAfterDays * DAY);
  const { rows: owners } = await deps.db.query<{ email: string; ids: string[] }>(
    `SELECT u.email, array_agg(p.id::text) AS ids FROM projects p JOIN users u ON u.id = p.user_id
     WHERE p.retention_warned_at IS NULL AND p.last_activity_at <= $1
       AND EXISTS (SELECT 1 FROM character_images ci WHERE ci.project_id = p.id AND ci.kind = 'photo')
     GROUP BY u.id, u.email`,
    [warnCutoff],
  );
  const deleteOn = new Date(now.getTime() + RETENTION.noticeDays * DAY).toISOString().slice(0, 10);
  for (const owner of owners) {
    try {
      await deps.providers.email.send({ to: owner.email, subject: 'Photos in your Ink Dimensions projects will be deleted', text: warningText(deps.config.appUrl, deleteOn, owner.ids.length) });
    } catch (err) {
      result.failedOwners++;
      log.warn('retention warning not sent; retrying on the next run', errorFields(err));
      continue;
    }
    // last_activity_at re-checked: activity during the send keeps the project unwarned.
    await deps.db.query('UPDATE projects SET retention_warned_at = $2 WHERE id = ANY($1::uuid[]) AND retention_warned_at IS NULL AND last_activity_at <= $3', [owner.ids, now, warnCutoff]);
    result.warnedOwners++;
  }

  // 2. Delete photos (and what derives from them) of projects idle 90 days and warned 14 days ago.
  const { rows: photos } = await deps.db.query<{ id: string; project_id: string; character_id: string; storage_key: string }>(
    `SELECT ci.id, ci.project_id, ci.character_id, ci.storage_key FROM character_images ci JOIN projects p ON p.id = ci.project_id
     WHERE ci.kind = 'photo' AND p.last_activity_at <= $1 AND p.retention_warned_at <= $2
       AND NOT EXISTS (SELECT 1 FROM render_jobs j WHERE j.project_id = p.id AND j.status IN ('queued', 'running'))`,
    [new Date(now.getTime() - RETENTION.deleteAfterDays * DAY), new Date(now.getTime() - RETENTION.noticeDays * DAY)],
  );
  const cleared = new Set<string>();
  for (const photo of photos) {
    await deleteCharacterImage(deps, photo);
    result.photosDeleted++;
    cleared.add(photo.project_id);
  }
  if (cleared.size) await deps.db.query('UPDATE projects SET retention_warned_at = NULL WHERE id = ANY($1::uuid[])', [[...cleared]]);

  // 3. Tidy invitations 30 days after they stopped being usable (FR-108).
  const { rows: gone } = await deps.db.query(
    "DELETE FROM invites WHERE LEAST(COALESCE(used_at, 'infinity'), COALESCE(revoked_at, 'infinity'), expires_at) <= $1 RETURNING id",
    [new Date(now.getTime() - RETENTION.inviteTidyDays * DAY)],
  );
  result.invitesDeleted = gone.length;

  log.info('retention run', { ...result });
  return result;
}

export function startRetention(deps: RetentionDeps, intervalMs: number = RETENTION.intervalMs): { stop(): void } {
  let running = false;
  const tick = () => {
    if (running) return;
    running = true;
    void runRetention(deps)
      .catch((err: unknown) => deps.log.error('retention run failed', errorFields(err)))
      .finally(() => {
        running = false;
      });
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  return { stop: () => clearInterval(timer) };
}
