// Deletion that reaches stored files as well as rows (FR-012, FR-013, US-10).
import { storageKeys } from '../providers/storage/types.js';
import type { AppDeps } from './app.js';

/** Deletes a project's files, then its rows (cascades to characters, images, scripts, jobs). */
export async function deleteProjectData(deps: Pick<AppDeps, 'db' | 'providers'>, userId: string, projectId: string): Promise<void> {
  await deps.providers.storage.deletePrefix(storageKeys.projectPrefix(userId, projectId));
  await deps.db.query('DELETE FROM projects WHERE id = $1 AND user_id = $2', [projectId, userId]);
}

/** Deletes rendered panel images that show a character (derived images) and their files. */
async function deleteDerivedPanels(deps: Pick<AppDeps, 'db' | 'providers'>, projectId: string, characterId: string): Promise<string[]> {
  const { rows } = await deps.db.query<{ panel_id: string; storage_key: string }>(
    `DELETE FROM panel_images WHERE project_id = $1 AND character_ids @> $2::jsonb RETURNING panel_id, storage_key`,
    [projectId, JSON.stringify([characterId])],
  );
  for (const r of rows) await deps.providers.storage.delete(r.storage_key);
  return rows.map((r) => r.panel_id);
}

/**
 * Deletes one character image. For a photo, every panel image derived from that character is
 * deleted too, and those panels show as not rendered (FR-012). Returns the affected panel ids.
 */
export async function deleteCharacterImage(
  deps: Pick<AppDeps, 'db' | 'providers'>,
  image: { id: string; project_id: string; character_id: string; storage_key: string },
): Promise<string[]> {
  await deps.providers.storage.delete(image.storage_key);
  await deps.db.query('DELETE FROM character_images WHERE id = $1 AND project_id = $2', [image.id, image.project_id]);
  return deleteDerivedPanels(deps, image.project_id, image.character_id);
}

/** Deletes a character, all of its images and every panel image derived from it (FR-013). */
export async function deleteCharacterData(deps: Pick<AppDeps, 'db' | 'providers'>, projectId: string, characterId: string): Promise<string[]> {
  const { rows } = await deps.db.query<{ storage_key: string }>('SELECT storage_key FROM character_images WHERE project_id = $1 AND character_id = $2', [
    projectId,
    characterId,
  ]);
  for (const r of rows) await deps.providers.storage.delete(r.storage_key);
  const panels = await deleteDerivedPanels(deps, projectId, characterId);
  await deps.db.query('DELETE FROM characters WHERE id = $1 AND project_id = $2', [characterId, projectId]);
  return panels;
}
