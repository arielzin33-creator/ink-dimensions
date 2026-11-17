// Row -> API shape mapping.
import type { CharacterDto, CharacterImageDto, ProjectDto, ProjectSummaryDto } from '../shared/types.js';
import type { CharacterImageRow, CharacterRow, ProjectRow } from './access.js';
import type { Queryable } from './db.js';

const iso = (d: Date | string | null) => (d === null ? null : new Date(d).toISOString());

const DAY = 86_400_000;

/** The later of idle + 90 days and warning + 14 days, as a UTC date; null when no warning is pending. */
export function photosDeleteOn(p: Pick<ProjectRow, 'last_activity_at' | 'retention_warned_at'>): string | null {
  if (!p.retention_warned_at) return null;
  const t = Math.max(new Date(p.last_activity_at).getTime() + 90 * DAY, new Date(p.retention_warned_at).getTime() + 14 * DAY);
  return new Date(t).toISOString().slice(0, 10);
}

export function projectSummary(p: ProjectRow): ProjectSummaryDto {
  return { id: p.id, title: p.title, path: p.path, stylePreset: p.style_preset, updatedAt: iso(p.updated_at) as string, photosDeleteOn: photosDeleteOn(p) };
}

export function imageDto(i: CharacterImageRow): CharacterImageDto {
  return { id: i.id, kind: i.kind, contentType: i.content_type, byteSize: i.byte_size, consentAt: iso(i.consent_at), createdAt: iso(i.created_at) as string };
}

export function characterDto(c: CharacterRow, images: CharacterImageRow[]): CharacterDto {
  return { id: c.id, name: c.name, description: c.description, images: images.filter((i) => i.character_id === c.id).map(imageDto) };
}

export async function loadCharacters(db: Queryable, projectId: string): Promise<CharacterDto[]> {
  const [chars, images] = await Promise.all([
    db.query<CharacterRow>('SELECT * FROM characters WHERE project_id = $1 ORDER BY created_at, id', [projectId]),
    db.query<CharacterImageRow>('SELECT * FROM character_images WHERE project_id = $1 ORDER BY created_at, id', [projectId]),
  ]);
  return chars.rows.map((c) => characterDto(c, images.rows));
}

export async function projectDto(db: Queryable, p: ProjectRow): Promise<ProjectDto> {
  return { ...projectSummary(p), photosWereDueOn: p.photos_were_due_on ?? null, plot: p.plot, createdAt: iso(p.created_at) as string, characters: await loadCharacters(db, p.id) };
}
