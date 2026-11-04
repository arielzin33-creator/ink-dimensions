// Characters and their images (FR-008 – FR-013). Photos exist only on the photo path and need an
// explicit consent confirmation per upload; reference art exists only on the invented path.
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireUser } from '../../auth/guard.js';
import { storageKeys } from '../../providers/storage/types.js';
import { characterSchema, imageUploadSchema, IMAGE_TYPES, LIMITS, updateCharacterSchema } from '../../shared/schemas.js';
import { isUuid, loadCharacter, loadOwnedProject, touchProject, type CharacterImageRow, type CharacterRow, type ProjectRow } from '../access.js';
import type { ResolvedDeps } from '../app.js';
import { requirePhotoPath } from '../flags.js';
import { deleteCharacterData, deleteCharacterImage } from '../deletion.js';
import { characterDto, imageDto } from '../dto.js';
import { badRequest, conflict, HttpError, notFound, refused } from '../errors.js';
import { json, type Router } from '../http.js';
import { decodeImage, uploadBodyLimit } from '../uploads.js';

const createSchema = characterSchema.extend({
  image: z.object({ contentType: z.enum(IMAGE_TYPES), dataBase64: imageUploadSchema.shape.dataBase64 }).optional(),
  consent: z.boolean().optional(),
});

const consentRequired = () =>
  new HttpError(400, 'consent_required', "Confirm that you have this person's permission to use their photo before uploading it.");

export function registerCharacterRoutes(router: Router, deps: ResolvedDeps): void {
  const guard = { db: deps.db, cookieSecure: deps.config.cookieSecure };
  const maxBytes = deps.config.uploadMaxBytes;

  async function moderateCharacter(project: ProjectRow, texts: string[]) {
    if (project.path !== 'photo') return;
    const verdict = await deps.providers.moderation.check({ realPeople: true, texts });
    if (!verdict.allowed) throw refused(verdict.categories);
  }

  async function storeImage(userId: string, project: ProjectRow, characterId: string, kind: 'photo' | 'reference', contentType: (typeof IMAGE_TYPES)[number], dataBase64: string, consent: boolean | undefined) {
    const expected = project.path === 'photo' ? 'photo' : 'reference';
    if (kind !== expected) {
      throw badRequest(project.path === 'photo' ? 'Projects on the real-photo path take photos, not reference art.' : 'Projects with invented characters take reference art, not photos of real people.');
    }
    if (kind === 'photo') await requirePhotoPath(deps.flags);
    if (kind === 'photo' && consent !== true) throw consentRequired();
    const { rows: countRows } = await deps.db.query<{ n: number }>('SELECT count(*)::int AS n FROM character_images WHERE character_id = $1', [characterId]);
    if ((countRows[0]?.n ?? 0) >= LIMITS.imagesPerCharacter) throw conflict(`A character can have at most ${LIMITS.imagesPerCharacter} images.`);
    const data = decodeImage(contentType, dataBase64, maxBytes);
    const id = randomUUID();
    const key = storageKeys.characterImage(userId, project.id, id);
    await deps.providers.storage.put(key, data, contentType);
    try {
      const { rows } = await deps.db.query<CharacterImageRow>(
        `INSERT INTO character_images (id, character_id, project_id, kind, storage_key, content_type, byte_size, consent_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [id, characterId, project.id, kind, key, contentType, data.length, kind === 'photo' ? new Date() : null],
      );
      return rows[0] as CharacterImageRow;
    } catch (err) {
      await deps.providers.storage.delete(key);
      throw err;
    }
  }

  router.post('/api/projects/:id/characters', async (ctx) => {
    const user = await requireUser(ctx, guard);
    const project = await loadOwnedProject(deps.db, user.id, ctx.params.id);
    const body = await ctx.body(createSchema, uploadBodyLimit(maxBytes));
    if (project.path === 'invented' && !body.description && !body.image) {
      throw badRequest('Describe the character, add reference art, or both.');
    }
    if (project.path === 'photo' && body.image) await requirePhotoPath(deps.flags);
    if (project.path === 'photo' && body.image && body.consent !== true) throw consentRequired();
    await moderateCharacter(project, [body.name, body.description]);
    const { rows: n } = await deps.db.query<{ n: number }>('SELECT count(*)::int AS n FROM characters WHERE project_id = $1', [project.id]);
    if ((n[0]?.n ?? 0) >= LIMITS.charactersPerProject) throw conflict(`A project can have at most ${LIMITS.charactersPerProject} characters.`);
    const id = randomUUID();
    const { rows } = await deps.db.query<CharacterRow>('INSERT INTO characters (id, project_id, name, description) VALUES ($1, $2, $3, $4) RETURNING *', [
      id,
      project.id,
      body.name,
      body.description,
    ]);
    const images: CharacterImageRow[] = [];
    if (body.image) {
      try {
        images.push(await storeImage(user.id, project, id, project.path === 'photo' ? 'photo' : 'reference', body.image.contentType, body.image.dataBase64, body.consent));
      } catch (err) {
        await deps.db.query('DELETE FROM characters WHERE id = $1', [id]);
        throw err;
      }
    }
    await touchProject(deps.db, project.id);
    return json(201, { character: characterDto(rows[0] as CharacterRow, images) });
  });

  router.patch('/api/projects/:id/characters/:cid', async (ctx) => {
    const user = await requireUser(ctx, guard);
    const project = await loadOwnedProject(deps.db, user.id, ctx.params.id);
    const character = await loadCharacter(deps.db, project.id, ctx.params.cid);
    const body = await ctx.body(updateCharacterSchema);
    const name = body.name ?? character.name;
    const description = body.description ?? character.description;
    if (project.path === 'invented' && !description) {
      const { rows } = await deps.db.query<{ n: number }>('SELECT count(*)::int AS n FROM character_images WHERE character_id = $1', [character.id]);
      if ((rows[0]?.n ?? 0) === 0) throw badRequest('Describe the character, add reference art, or both.');
    }
    await moderateCharacter(project, [name, description]);
    const { rows } = await deps.db.query<CharacterRow>('UPDATE characters SET name = $2, description = $3 WHERE id = $1 RETURNING *', [character.id, name, description]);
    const { rows: images } = await deps.db.query<CharacterImageRow>('SELECT * FROM character_images WHERE character_id = $1 ORDER BY created_at, id', [character.id]);
    await touchProject(deps.db, project.id);
    return json(200, { character: characterDto(rows[0] as CharacterRow, images) });
  });

  router.delete('/api/projects/:id/characters/:cid', async (ctx) => {
    const user = await requireUser(ctx, guard);
    const project = await loadOwnedProject(deps.db, user.id, ctx.params.id);
    const character = await loadCharacter(deps.db, project.id, ctx.params.cid);
    const panels = await deleteCharacterData(deps, project.id, character.id);
    await touchProject(deps.db, project.id);
    return json(200, { deleted: true, unrenderedPanels: panels });
  });

  router.post('/api/projects/:id/characters/:cid/images', async (ctx) => {
    const user = await requireUser(ctx, guard);
    const project = await loadOwnedProject(deps.db, user.id, ctx.params.id);
    const character = await loadCharacter(deps.db, project.id, ctx.params.cid);
    const body = await ctx.body(imageUploadSchema, uploadBodyLimit(maxBytes));
    const image = await storeImage(user.id, project, character.id, body.kind, body.contentType, body.dataBase64, body.consent);
    await touchProject(deps.db, project.id);
    return json(201, { image: imageDto(image) });
  });

  async function loadImage(projectId: string, characterId: string, imageId: string | undefined): Promise<CharacterImageRow> {
    if (!isUuid(imageId)) throw notFound('Image');
    const { rows } = await deps.db.query<CharacterImageRow>('SELECT * FROM character_images WHERE id = $1 AND character_id = $2 AND project_id = $3', [
      imageId,
      characterId,
      projectId,
    ]);
    if (!rows[0]) throw notFound('Image');
    return rows[0];
  }

  router.get('/api/projects/:id/characters/:cid/images/:iid', async (ctx) => {
    const user = await requireUser(ctx, guard);
    const project = await loadOwnedProject(deps.db, user.id, ctx.params.id);
    const character = await loadCharacter(deps.db, project.id, ctx.params.cid);
    const image = await loadImage(project.id, character.id, ctx.params.iid);
    const stored = await deps.providers.storage.get(image.storage_key);
    if (!stored) throw notFound('Image');
    return {
      status: 200,
      headers: { 'content-type': image.content_type, 'cache-control': 'private, no-store', 'content-disposition': 'inline' },
      body: stored.data,
    };
  });

  router.delete('/api/projects/:id/characters/:cid/images/:iid', async (ctx) => {
    const user = await requireUser(ctx, guard);
    const project = await loadOwnedProject(deps.db, user.id, ctx.params.id);
    const character = await loadCharacter(deps.db, project.id, ctx.params.cid);
    const image = await loadImage(project.id, character.id, ctx.params.iid);
    const panels = await deleteCharacterImage(deps, image);
    await touchProject(deps.db, project.id);
    ctx.log.info('character image deleted', { kind: image.kind, derivedPanelsDeleted: panels.length });
    return json(200, { deleted: true, unrenderedPanels: panels });
  });
}
