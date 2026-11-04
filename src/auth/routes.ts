// Authentication routes (load-bearing): sign-up, sign-in, sign-out, current user, account
// deletion. Sign-in failures are generic and rate-limited per email (FR-003).
import { randomUUID } from 'node:crypto';
import type { StorageProvider } from '../providers/storage/types.js';
import { storageKeys } from '../providers/storage/types.js';
import type { Db } from '../server/db.js';
import { conflict, HttpError, rateLimited } from '../server/errors.js';
import { json, noContent, type Router } from '../server/http.js';
import { deleteAccountSchema, signInSchema, signUpSchema } from '../shared/schemas.js';
import { clearSessionCookie, readSessionToken, serializeSessionCookie } from './cookies.js';
import { requireUser } from './guard.js';
import { dummyPasswordHash, hashPassword, verifyPassword } from './password.js';
import { createRateLimiter, SIGN_IN_LIMIT, type RateLimiter } from './rate-limit.js';
import { createSession, deleteExpiredSessions, deleteSession } from './sessions.js';

export interface AuthDeps {
  db: Db;
  storage: StorageProvider;
  cookieSecure: boolean;
  limiter?: RateLimiter;
}

const invalidCredentials = () => new HttpError(401, 'invalid_credentials', 'Email or password is incorrect.');

export function registerAuthRoutes(router: Router, deps: AuthDeps): void {
  const limiter = deps.limiter ?? createRateLimiter(SIGN_IN_LIMIT);
  const guardDeps = { db: deps.db, cookieSecure: deps.cookieSecure };

  router.post('/api/auth/signup', async (ctx) => {
    const { email, password } = await ctx.body(signUpSchema);
    const id = randomUUID();
    const hash = await hashPassword(password);
    try {
      await deps.db.query('INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)', [id, email, hash]);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw conflict('An account with this email already exists. Sign in instead.');
      throw err;
    }
    ctx.userId = id;
    const token = await createSession(deps.db, id);
    return json(201, { user: { id, email } }, { 'set-cookie': serializeSessionCookie(token, deps.cookieSecure) });
  });

  router.post('/api/auth/login', async (ctx) => {
    const { email, password } = await ctx.body(signInSchema);
    if (limiter.isLimited(email)) throw rateLimited('Too many failed sign-ins. Try again in 15 minutes.');
    const { rows } = await deps.db.query<{ id: string; email: string; password_hash: string }>(
      'SELECT id, email, password_hash FROM users WHERE lower(email) = $1',
      [email],
    );
    const user = rows[0];
    const ok = await verifyPassword(password, user?.password_hash ?? (await dummyPasswordHash()));
    if (!user || !ok) {
      limiter.recordFailure(email);
      throw invalidCredentials();
    }
    limiter.reset(email);
    ctx.userId = user.id;
    await deleteExpiredSessions(deps.db);
    const token = await createSession(deps.db, user.id);
    return json(200, { user: { id: user.id, email: user.email } }, { 'set-cookie': serializeSessionCookie(token, deps.cookieSecure) });
  });

  router.post('/api/auth/logout', async (ctx) => {
    await deleteSession(deps.db, readSessionToken(ctx.req.headers.cookie, deps.cookieSecure));
    return noContent({ 'set-cookie': clearSessionCookie(deps.cookieSecure) });
  });

  router.get('/api/auth/me', async (ctx) => {
    const user = await requireUser(ctx, guardDeps);
    return json(200, { user });
  });

  // Deletes the account, every project and every stored file (FR-004). Files go first so a
  // failure never leaves files without an owner record that could delete them later.
  router.delete('/api/auth/account', async (ctx) => {
    const user = await requireUser(ctx, guardDeps);
    const { password } = await ctx.body(deleteAccountSchema);
    const { rows } = await deps.db.query<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = $1', [user.id]);
    if (!rows[0] || !(await verifyPassword(password, rows[0].password_hash))) throw invalidCredentials();
    await deps.storage.deletePrefix(storageKeys.userPrefix(user.id));
    await deps.db.query('DELETE FROM users WHERE id = $1', [user.id]);
    ctx.log.info('account deleted', { userId: user.id });
    return noContent({ 'set-cookie': clearSessionCookie(deps.cookieSecure) });
  });
}
