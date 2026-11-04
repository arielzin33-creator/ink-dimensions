# Open items for the owner

Found while installing the factory and building the eval suite (2026-11-04), and updated with the
owner's decisions of 2026-11-05.

1. **Test gap: panel gutters.** No product test detects a missing gutter between panel rows.
   Eval task `panel-layout-002` carries a hidden test for it. Add an equivalent visible test as a
   normal Tier 1 task, so the product suite catches it too.
2. **Decided but not built** (write these up as spec 002; they change UI, the API and likely the
   database, so they are Tier 2 or above):
   - FR-032: invite-only registration, and daily caps of 10 script generations and 100 rendered
     panels per person.
   - FR-033: 18+ confirmation at registration, and a parent-or-guardian confirmation for a photo of
     a minor.
   - FR-034: delete photos and derived images after 90 idle days, with a warning at least 14 days
     before. The app sends no email today, so the warning channel needs a decision. A ComfyUI server
     keeps its own copy of uploaded images, so its input folder has to be cleaned on the same
     schedule.
3. **Conditions on the decisions.**
   - Get legal advice on photos of minors before FR-033 reaches anyone but the owner.
   - Set up the self-hosted image pipeline (FR-022, FR-030). It needs a GPU server, and real art is
     not available until it runs.
   - Replace the sole-tester pilot with a real group before relying on the percentage metrics and
     kill criteria in the PR/FAQ.
4. **Approvals.** Approve the constitution, spec, plan and tasks in that order (`status: approved`, `approved_by`, `approved_on`). Run `intake.py spec-check` after each.
5. **Dependency advisory.** `npm audit` reports a moderate minimatch advisory in the ESLint dev toolchain. Dependabot will propose the update.
