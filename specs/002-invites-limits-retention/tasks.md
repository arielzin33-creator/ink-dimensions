---
artifact: tasks
id: 002-invites-limits-retention
plan: specs/002-invites-limits-retention/plan.md
status: approved         # draft | approved
approved_by: "arielzin33-creator"
approved_on: "2026-11-08"
---

# Tasks 002: Invites, daily limits, age checks and photo retention

One task is one pull request. T-001, T-002, T-003, T-005 and T-006 are Tier 3, so they are made in
an interactive session at the owner's request and merged by the owner. Do not publish them with
`factory-backlog`.

## T-001: Add migration 0004
- files: migrations/0004_invites_limits_retention.sql, test/integration/migrate-0004.test.ts
- done_when: a new test applies the migrations on PGlite, shows a photo marked as a minor needs a confirmation time, shows a second live invitation for one email is rejected, and shows existing projects get a current `last_activity_at`
- depends_on: none
- requirements: FR-101, FR-108, FR-110, FR-112, FR-120, NFR-104

Additive only. Listed in plan section 4.

## T-002: Require invitations and age confirmation at sign-up
- files: src/auth/invites.ts, src/auth/routes.ts, src/auth/guard.ts, src/shared/schemas.ts, src/shared/types.ts, src/server/config.ts, src/server/app.ts, .env.example, test/helpers/app.ts, test/integration/auth.test.ts, test/integration/invites.test.ts, test/unit/config.test.ts
- done_when: integration tests cover each refusal with one message, two simultaneous sign-ups on one invitation creating one account (SC-101), the setup code working once, non-administrators getting 404, create, list and revoke, FR-105, and account deletion removing the invitation; config tests show `REGISTRATION_OPEN=true` fails in production
- depends_on: T-001
- requirements: US-1, US-2, FR-101, FR-102, FR-103, FR-104, FR-105, FR-106, FR-107, FR-108, FR-109, NFR-102, SC-101

The test helper's `signUp` starts sending the new fields. Every existing integration test depends on it.

## T-003: Build the sign-up changes and the invitations page
- files: src/web/pages/AuthPage.tsx, src/web/pages/InvitesPage.tsx, src/web/App.tsx, src/web/auth.tsx, playwright.config.ts, e2e/fixtures.ts, e2e/invites.spec.ts, e2e/a11y.spec.ts
- done_when: Playwright completes setup code, invitation, copied link and sign-up against a server with invitations required, existing flows still pass, and scans of the sign-up and invitations pages report zero violations
- depends_on: T-002
- requirements: US-1, US-2, FR-104, NFR-101, NFR-103, SC-105

## T-004: Enforce the daily limits
- files: src/server/usage.ts, src/server/routes/script.ts, src/server/routes/render.ts, src/server/render-runner.ts, src/shared/schemas.ts, test/integration/usage.test.ts
- done_when: integration tests show both limits hold under concurrent requests (SC-102), an oversized job is refused whole with the amount left, failed panels and failed generations are given back, moderation refusals don't count, and a job crossing midnight credits its own day
- depends_on: T-001
- requirements: US-3, FR-112, FR-113, FR-114, FR-115, SC-102

## T-005: Require the minor and guardian confirmation on photos
- files: src/server/routes/characters.ts, src/server/flags.ts, flags/flags.json, src/web/project/CharactersStep.tsx, test/integration/guardian.test.ts, test/integration/characters.test.ts, test/integration/authorization.test.ts, test/integration/deletion.test.ts, test/integration/flags.test.ts, test/integration/metrics.test.ts, e2e/fixtures.ts, e2e/photo-path.spec.ts, e2e/a11y.spec.ts
- done_when: integration tests show an upload with no statement is refused, a minor without the guardian confirmation is refused, a minor is refused while the switch is off even with the confirmation, and confirmations are recorded; both upload paths are covered (SC-103)
- depends_on: T-001
- requirements: US-4, FR-110, FR-111, SC-103

Existing tests that upload photos must state who is in the photo. Their other assertions stay unchanged.

## T-006: Add the email provider
- files: src/providers/email/types.ts, src/providers/email/twin.ts, src/providers/email/http.ts, src/providers/index.ts, src/server/config.ts, .env.example, test/unit/email.test.ts, test/unit/config.test.ts
- done_when: the adapter is tested against the local fake server for request shape and errors, the twin is the default, a selected adapter with a missing setting stops start-up naming the variable, and no test logs an address or body
- depends_on: none
- requirements: FR-116, NFR-102, NFR-103

The adapter is marked untested against the live service.

## T-007: Run the retention check
- files: src/server/retention.ts, src/server/access.ts, src/server/app.ts, src/server/flags.ts, flags/flags.json, test/integration/retention.test.ts
- done_when: tests with a fixed clock show warning at 76 days, deletion at 90 with photo and derived files gone and the script kept, no deletion after a failed send, after new activity, with a running job, with the flag off, or in production on the twin, and one email per owner containing no project titles (SC-104)
- depends_on: T-001, T-006
- requirements: US-5, US-6, FR-108, FR-118, FR-119, FR-120, FR-121, FR-122, FR-123, FR-124, NFR-105, SC-104

## T-008: Show the deletion date
- files: src/server/dto.ts, src/shared/types.ts, src/web/pages/ProjectsPage.tsx, src/web/pages/ProjectPage.tsx, test/integration/retention-notice.test.ts
- done_when: the project responses carry `photosDeleteOn` once a warning is recorded and null after new activity, and both pages show the date in text
- depends_on: T-007
- requirements: US-5, FR-117

## T-009: Document the operator's part and close the open items
- files: README.md, docs/product/SELF-HOSTED-IMAGE.md, docs/product/OPEN-ITEMS.md, docs/factory/DECISIONS.md
- done_when: the docs explain the setup code, the email settings and that retention stays off without them, the two switches, and a scheduled clean-up of the self-hosted server's input and output folders marked as not yet tried on a real server
- depends_on: T-003, T-004, T-005, T-008
- requirements: FR-125
