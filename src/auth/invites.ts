// Invitations and the setup code (load-bearing; spec 002 FR-101 – FR-108). Only the SHA-256 of a
// secret is stored. The secret is returned once, when the invitation is created.
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { isUuid } from '../server/access.js';
import type { Db, Queryable } from '../server/db.js';
import { conflict, HttpError, notFound } from '../server/errors.js';
import { json, noContent, type Router } from '../server/http.js';
import { createInviteSchema } from '../shared/schemas.js';
import type { InviteDto } from '../shared/types.js';
import { requireAdmin } from './guard.js';
import { hashSessionToken as hashSecret } from './sessions.js';

/** One message for every refusal, whatever the reason (FR-102). */
export const inviteInvalid = () =>
  new HttpError(403, 'invite_invalid', 'This invitation or setup code is not valid. Ask the person who invited you for a new link.');

const LIVE = 'used_at IS NULL AND revoked_at IS NULL AND expires_at > now()';

/** Plain read before the slow password hash, so people without an invitation cost nothing. */
export async function hasLiveInvite(db: Queryable, secret: string, email: string): Promise<boolean> {
  const { rows } = await db.query(`SELECT 1 FROM invites WHERE token_hash = $1 AND email = $2 AND ${LIVE}`, [hashSecret(secret), email]);
  return rows.length === 1;
}

/** Claims the invitation inside the sign-up transaction; false when a simultaneous sign-up won. */
export async function claimInvite(tx: Queryable, secret: string, email: string): Promise<boolean> {
  const { rows } = await tx.query(`UPDATE invites SET used_at = now() WHERE token_hash = $1 AND email = $2 AND ${LIVE} RETURNING id`, [hashSecret(secret), email]);
  return rows.length === 1;
}

export async function recordInviteUser(tx: Queryable, secret: string, userId: string): Promise<void> {
  await tx.query('UPDATE invites SET used_by = $2 WHERE token_hash = $1', [hashSecret(secret), userId]);
}

/** True when `code` is the configured setup code and no administrator exists yet (FR-106). */
export async function isSetupCode(db: Queryable, configured: string | undefined, code: string | undefined): Promise<boolean> {
  if (!configured || !code) return false;
  const digest = (s: string) => createHash('sha256').update(s).digest();
  if (!timingSafeEqual(digest(configured), digest(code))) return false;
  const { rows } = await db.query('SELECT 1 FROM users WHERE is_admin LIMIT 1');
  return rows.length === 0;
}

interface InviteRow {
  id: string;
  email: string;
  created_at: Date;
  expires_at: Date;
  used_at: Date | null;
  revoked_at: Date | null;
}
const COLUMNS = 'id, email, created_at, expires_at, used_at, revoked_at';

function inviteDto(r: InviteRow, now = Date.now()): InviteDto {
  const status = r.used_at ? 'used' : r.revoked_at ? 'revoked' : new Date(r.expires_at).getTime() <= now ? 'expired' : 'live';
  return { id: r.id, email: r.email, status, createdAt: new Date(r.created_at).toISOString(), expiresAt: new Date(r.expires_at).toISOString() };
}

export function registerInviteRoutes(router: Router, deps: { db: Db; cookieSecure: boolean }): void {
  router.get('/api/admin/invites', async (ctx) => {
    await requireAdmin(ctx, deps);
    const { rows } = await deps.db.query<InviteRow>(`SELECT ${COLUMNS} FROM invites ORDER BY created_at DESC, id`);
    return json(200, { invites: rows.map((r) => inviteDto(r)) });
  });

  router.post('/api/admin/invites', async (ctx) => {
    const admin = await requireAdmin(ctx, deps);
    const { email } = await ctx.body(createInviteSchema);
    if ((await deps.db.query('SELECT 1 FROM users WHERE email = $1', [email])).rows.length) throw conflict('This email already has an account.');
    // The unique index can't see expiry: retire this email's expired, unused invitations first.
    await deps.db.query('UPDATE invites SET revoked_at = now() WHERE email = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at <= now()', [email]);
    const secret = randomBytes(32).toString('base64url');
    try {
      const { rows } = await deps.db.query<InviteRow>(
        `INSERT INTO invites (id, email, token_hash, created_by, expires_at) VALUES ($1, $2, $3, $4, now() + interval '14 days') RETURNING ${COLUMNS}`,
        [randomUUID(), email, hashSecret(secret), admin.id],
      );
      ctx.log.info('invitation created');
      return json(201, { invite: inviteDto(rows[0] as InviteRow), secret });
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw conflict('This email already has a live invitation. Revoke it to create a new one.');
      throw err;
    }
  });

  router.delete('/api/admin/invites/:id', async (ctx) => {
    await requireAdmin(ctx, deps);
    if (!isUuid(ctx.params.id)) throw notFound('Invitation');
    const { rows } = await deps.db.query('UPDATE invites SET revoked_at = now() WHERE id = $1 AND used_at IS NULL AND revoked_at IS NULL RETURNING id', [ctx.params.id]);
    if (!rows[0]) throw notFound('Invitation');
    ctx.log.info('invitation revoked');
    return noContent();
  });
}
