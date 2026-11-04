// Session guard (load-bearing): every project route calls requireUser first.
import type { Db } from '../server/db.js';
import { unauthenticated } from '../server/errors.js';
import type { Ctx } from '../server/http.js';
import { readSessionToken } from './cookies.js';
import { findSessionUser, type SessionUser } from './sessions.js';

export interface GuardDeps {
  db: Db;
  cookieSecure: boolean;
}

export async function currentUser(ctx: Ctx, deps: GuardDeps): Promise<SessionUser | null> {
  const token = readSessionToken(ctx.req.headers.cookie, deps.cookieSecure);
  const user = await findSessionUser(deps.db, token);
  if (user) ctx.userId = user.id;
  return user;
}

export async function requireUser(ctx: Ctx, deps: GuardDeps): Promise<SessionUser> {
  const user = await currentUser(ctx, deps);
  if (!user) throw unauthenticated();
  return user;
}
