// Failed sign-in limiter (load-bearing): at most `max` failures per key in a sliding window.
// In-process only: with several server instances each keeps its own count (documented limit).

export interface RateLimiter {
  isLimited(key: string): boolean;
  recordFailure(key: string): void;
  reset(key: string): void;
}

export function createRateLimiter(opts: { max: number; windowMs: number; now?: () => number }): RateLimiter {
  const now = opts.now ?? Date.now;
  const failures = new Map<string, number[]>();
  const recent = (key: string): number[] => {
    const cutoff = now() - opts.windowMs;
    const list = (failures.get(key) ?? []).filter((t) => t > cutoff);
    if (list.length) failures.set(key, list);
    else failures.delete(key);
    return list;
  };
  return {
    isLimited: (key) => recent(key).length >= opts.max,
    recordFailure: (key) => {
      const list = recent(key);
      list.push(now());
      failures.set(key, list);
      if (failures.size > 10_000) {
        for (const k of failures.keys()) {
          recent(k);
        }
      }
    },
    reset: (key) => {
      failures.delete(key);
    },
  };
}

export const SIGN_IN_LIMIT = { max: 10, windowMs: 15 * 60 * 1000 };
