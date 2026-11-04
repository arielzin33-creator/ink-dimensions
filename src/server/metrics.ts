// In-process operational counters (FR-035). They reset when the process restarts and hold no
// personal data: no user ids, emails, paths with ids, or content.

export interface Metrics {
  readonly startedAt: number;
  requestsTotal: number;
  errorsTotal: number;
  jobsFailedTotal: number;
  recordResponse(status: number): void;
  recordJobFailed(): void;
}

export function createMetrics(now: () => number = Date.now): Metrics {
  const m: Metrics = {
    startedAt: now(),
    requestsTotal: 0,
    errorsTotal: 0,
    jobsFailedTotal: 0,
    recordResponse(status) {
      m.requestsTotal += 1;
      if (status >= 500) m.errorsTotal += 1;
    },
    recordJobFailed() {
      m.jobsFailedTotal += 1;
    },
  };
  return m;
}
