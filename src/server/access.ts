// Per-user authorisation for project resources (FR-007). Every child resource is looked up
// through a project that belongs to the signed-in user; foreign and missing both give 404.
import type { Queryable } from './db.js';
import { photosDeleteOn } from './dto.js';
import { notFound } from './errors.js';
import type { ProjectPath } from '../shared/schemas.js';
import type { StyleId } from '../shared/styles.js';

export interface ProjectRow {
  id: string;
  user_id: string;
  title: string;
  path: ProjectPath;
  style_preset: StyleId;
  plot: string;
  created_at: Date;
  updated_at: Date;
  last_activity_at: Date;
  retention_warned_at: Date | null;
  photos_were_due_on?: string | null;
}

export interface CharacterRow {
  id: string;
  project_id: string;
  name: string;
  description: string;
  created_at: Date;
}

export interface CharacterImageRow {
  id: string;
  character_id: string;
  project_id: string;
  kind: 'photo' | 'reference';
  storage_key: string;
  content_type: string;
  byte_size: number;
  consent_at: Date | null;
  created_at: Date;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isUuid = (s: string | undefined): s is string => typeof s === 'string' && UUID.test(s);

const HOUR = 3_600_000;

/** The single route into a project, so opening, changing, rendering or exporting it is activity (spec 002 FR-119). */
export async function loadOwnedProject(db: Queryable, userId: string, projectId: string | undefined): Promise<ProjectRow> {
  if (!isUuid(projectId)) throw notFound('Project');
  const { rows } = await db.query<ProjectRow>('SELECT * FROM projects WHERE id = $1 AND user_id = $2', [projectId, userId]);
  const row = rows[0];
  if (!row) throw notFound('Project');
  // At most one write an hour, unless a warning is pending: new activity cancels it (FR-120).
  if (row.retention_warned_at || Date.now() - new Date(row.last_activity_at).getTime() > HOUR) {
    await db.query('UPDATE projects SET last_activity_at = now(), retention_warned_at = NULL WHERE id = $1', [row.id]);
    return { ...row, last_activity_at: new Date(), retention_warned_at: null, photos_were_due_on: photosDeleteOn(row) };
  }
  return row;
}

export async function loadCharacter(db: Queryable, projectId: string, characterId: string | undefined): Promise<CharacterRow> {
  if (!isUuid(characterId)) throw notFound('Character');
  const { rows } = await db.query<CharacterRow>('SELECT * FROM characters WHERE id = $1 AND project_id = $2', [characterId, projectId]);
  if (!rows[0]) throw notFound('Character');
  return rows[0];
}

export async function touchProject(db: Queryable, projectId: string): Promise<void> {
  await db.query('UPDATE projects SET updated_at = now() WHERE id = $1', [projectId]);
}
