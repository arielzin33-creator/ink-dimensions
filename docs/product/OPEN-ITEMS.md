# Open items for the owner

Found while installing the factory and building the eval suite (2026-11-04), and updated with the
owner's decisions of 2026-11-05.

1. **Test gap: panel gutters.** Fixed by PR #6 once merged. That PR adds a visible test, which also
   makes eval `panel-layout-002` easier (see the PR).
2. **Decided but not built.** FR-032, FR-033 and FR-034 are now drafted as
   `specs/002-invites-limits-retention/`, waiting for approval. Building starts after that.
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
