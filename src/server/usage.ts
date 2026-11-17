// Daily limits per person (spec 002 FR-112 – FR-115). A day is a UTC calendar day. Each request
// reserves its amount with one conditional upsert, so the database holds the limit under
// concurrency; failed work and moderation refusals are given back.
import { LIMITS } from '../shared/schemas.js';
import type { Queryable } from './db.js';
import { HttpError } from './errors.js';

export type UsageKind = 'script' | 'panels';
const COLUMN = { script: 'script_generations', panels: 'panels' } as const;
const MAX = { script: LIMITS.dailyScriptGenerations, panels: LIMITS.dailyPanels } as const;
const NOUN = { script: 'script generations', panels: 'panels' } as const;

export const usageDay = (now: Date): string => now.toISOString().slice(0, 10);

/** Reserves `amount` for today (UTC) or refuses the whole request. Returns the day charged. */
export async function reserveUsage(db: Queryable, userId: string, kind: UsageKind, amount: number, now = new Date()): Promise<string> {
  const day = usageDay(now);
  const col = COLUMN[kind];
  // The INSERT branch of an upsert skips the WHERE, so an amount above the limit is refused first.
  if (amount <= MAX[kind]) {
    const { rows } = await db.query(
      `INSERT INTO usage_daily (user_id, day, ${col}) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, day) DO UPDATE SET ${col} = usage_daily.${col} + EXCLUDED.${col}
       WHERE usage_daily.${col} + EXCLUDED.${col} <= $4 RETURNING 1`,
      [userId, day, amount, MAX[kind]],
    );
    if (rows.length) return day;
  }
  const { rows } = await db.query<{ used: number }>(`SELECT ${col} AS used FROM usage_daily WHERE user_id = $1 AND day = $2`, [userId, day]);
  const remaining = Math.max(0, MAX[kind] - (rows[0]?.used ?? 0));
  const resetsAt = new Date(Date.parse(day) + 86_400_000).toISOString();
  throw new HttpError(429, 'daily_limit', `You have ${remaining} ${NOUN[kind]} left today and this needs ${amount}. The limit resets at 00:00 UTC.`, { remaining, resetsAt });
}

export async function releaseUsage(db: Queryable, userId: string, kind: UsageKind, amount: number, day: string): Promise<void> {
  if (amount <= 0) return;
  const col = COLUMN[kind];
  await db.query(`UPDATE usage_daily SET ${col} = greatest(${col} - $3, 0) WHERE user_id = $1 AND day = $2`, [userId, day, amount]);
}

/** Gives back a job's unrendered panels to the day the job was charged to (in SQL, so no date conversion). */
export async function releaseJobPanels(db: Queryable, jobId: string, amount: number): Promise<void> {
  if (amount <= 0) return;
  await db.query(
    'UPDATE usage_daily u SET panels = greatest(u.panels - $2, 0) FROM render_jobs j WHERE j.id = $1 AND u.user_id = j.user_id AND u.day = j.usage_day',
    [jobId, amount],
  );
}
