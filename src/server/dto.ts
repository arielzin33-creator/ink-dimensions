// Row -> API shape mapping.
import type { CharacterDto, CharacterImageDto, ProjectDto, ProjectSummaryDto } from '../shared/types.js';
import type { CharacterImageRow, CharacterRow, ProjectRow } from './access.js';
import type { Queryable } from './db.js';

const iso = (d: Date | string | null) => (d === null ? null : new Date(d).toISOString());

export function projectSummary(p: ProjectRow): ProjectSummaryDto {
  return { id: p.id, title: p.title, path: p.path, stylePreset: p.style_preset, updatedAt: iso(p.updated_at) as string };
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
  return { ...projectSummary(p), plot: p.plot, createdAt: iso(p.created_at) as string, characters: await loadCharacters(db, p.id) };
}
