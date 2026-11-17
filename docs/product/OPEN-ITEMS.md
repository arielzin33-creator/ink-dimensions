# Open items for the owner

Found while installing the factory and building the eval suite (2026-11-04), and updated with the
owner's decisions of 2026-11-05.

1. **Test gap: panel gutters.** Fixed by PR #6 once merged. That PR adds a visible test, which also
   makes eval `panel-layout-002` easier (see the PR).
2. **Built in spec 002.** FR-032 (invitations and daily limits), FR-033 (age and guardian
   statements) and FR-034 (retention) are built under `specs/002-invites-limits-retention/` and
   documented in the README. What remains open is item 3.
3. **Conditions on the decisions.**
   - Legal advice on photos of minors is still recommended. The owner chose on 2026-11-08 not to wait
     for it, so spec 002 allows these uploads from the start, behind a switch that can turn them off.
   - Choose an email vendor. Auto-deletion stays off in production until one is configured.
   - Set up the self-hosted image pipeline (FR-022, FR-030). It needs a GPU server, and real art is
     not available until it runs.
   - Replace the sole-tester pilot with a real group before relying on the percentage metrics and
     kill criteria in the PR/FAQ.
4. **Approvals.** Approve the constitution, spec, plan and tasks in that order (`status: approved`, `approved_by`, `approved_on`). Run `intake.py spec-check` after each.
5. **Dependency advisory.** Dependabot could not fix the moderate `minimatch` advisory, because its
   update path downgrades `@eslint/js`. PR #5 pins the patched version with an override. Remove the
   override once ESLint moves to a patched range.
6. **Release gate: real PostgreSQL. Done 2026-11-17.** `test/integration/pg.test.ts` passed 6 runs
   out of 6 against PostgreSQL 18.6 (a throwaway Docker container). It covers SC-101, SC-102 and the
   single-administrator race, which the rest of the suite proves only on PGlite (one connection at a
   time). Run it again after changes to sign-up, invitations or the daily limits:
   `TEST_DATABASE_URL=postgres://<user>:<password>@127.0.0.1:5432/postgres npx vitest run test/integration/pg.test.ts`.
