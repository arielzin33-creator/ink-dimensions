// Server-side sessions (load-bearing). The cookie carries a random 256-bit token; the database
// stores only its SHA-256, so a database leak does not reveal usable sessions.
import { createHash, randomBytes } from 'node:crypto';
import type { Queryable } from '../server/db.js';

export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function isWellFormedToken(token: string): boolean {
  return TOKEN_FORMAT.test(token);
}

export async function createSession(db: Queryable, userId: string, now = new Date()): Promise<string> {
  const token = newSessionToken();
  await db.query('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)', [
    hashSessionToken(token),
    userId,
    now,
    new Date(now.getTime() + SESSION_TTL_MS),
  ]);
  return token;
}

export interface SessionUser {
  id: string;
  email: string;
}

export async function findSessionUser(db: Queryable, token: string | undefined, now = new Date()): Promise<SessionUser | null> {
  if (!token || !isWellFormedToken(token)) return null;
  const { rows } = await db.query<SessionUser>(
    `SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > $2`,
    [hashSessionToken(token), now],
  );
  return rows[0] ?? null;
}

export async function deleteSession(db: Queryable, token: string | undefined): Promise<void> {
  if (!token || !isWellFormedToken(token)) return;
  await db.query('DELETE FROM sessions WHERE token_hash = $1', [hashSessionToken(token)]);
}

export async function deleteExpiredSessions(db: Queryable, now = new Date()): Promise<void> {
  await db.query('DELETE FROM sessions WHERE expires_at <= $1', [now]);
}
