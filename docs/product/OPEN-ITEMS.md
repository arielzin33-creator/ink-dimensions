# Open items for the owner

Found while installing the factory and building the eval suite (2026-11-04). None blocks v1.

1. **Test gap: panel gutters.** No product test detects a missing gutter between panel rows.
   Eval task `panel-layout-002` carries a hidden test for it. Add an equivalent visible test as a
   normal Tier 1 task, so the product suite catches it too.
2. **Five spec decisions** are open as `[NEEDS CLARIFICATION]` markers in
   `specs/001-ink-dimensions-web-v1/spec.md` (FR-022, FR-030, FR-032, FR-033, FR-034).
3. **PR/FAQ kill gate.**
   - Name the first customer and owners for the listed risks.
   - Then set `DECISION`, `status: approved`, `approved_by` and `approved_on`.
4. **Approvals.** Approve the constitution, spec, plan and tasks in that order (`status: approved`, `approved_by`, `approved_on`). Run `intake.py spec-check` after each.
5. **Dependency advisory.** `npm audit` reports a moderate minimatch advisory in the ESLint dev toolchain. Dependabot will propose the update.
