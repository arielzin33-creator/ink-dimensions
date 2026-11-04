// Deletion that reaches stored files as well as rows (FR-012, FR-013, US-10).
import { storageKeys } from '../providers/storage/types.js';
import type { AppDeps } from './app.js';

/** Deletes a project's files, then its rows (cascades to characters, images, scripts, jobs). */
export async function deleteProjectData(deps: Pick<AppDeps, 'db' | 'providers'>, userId: string, projectId: string): Promise<void> {
  await deps.providers.storage.deletePrefix(storageKeys.projectPrefix(userId, projectId));
  await deps.db.query('DELETE FROM projects WHERE id = $1 AND user_id = $2', [projectId, userId]);
}
