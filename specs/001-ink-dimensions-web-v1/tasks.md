---
artifact: tasks
id: 001-ink-dimensions-web-v1
plan: specs/001-ink-dimensions-web-v1/plan.md
status: draft            # draft | approved
approved_by: ""
approved_on: ""
---

# Tasks 001: Ink Dimensions web v1

One task is one pull request. `factory.py backlog` turns each task into a GitHub issue with a
trusted hand-off, and the deterministic classifier predicts its tier from `files`.
Load-bearing work (`src/auth/**`, `migrations/**`, toolchain configuration, `Dockerfile`) is in
tasks of its own so the rest can run unattended.

## T-001: Scaffold the TypeScript toolchain
- files: package.json, package-lock.json, tsconfig.json, tsconfig.build.json, tsconfig.web.json, eslint.config.js, vitest.config.ts, .gitignore
- done_when: `npm run typecheck`, `npm run lint` and `npm test` exit 0 on a smoke test
- depends_on: none
- requirements: NFR-003, SC-001

Scripts: typecheck, lint, test, build, start, dev, test:e2e, db:migrate. Node 22, strict mode.

## T-002: Add design tokens and generated styles
- files: design/tokens.json, src/web/styles/tokens.css, src/web/styles/tokens.ts, test/unit/design-tokens.test.ts
- done_when: `intake.py tokens` exits 0 and the test proves every text/background token pair has a WCAG contrast ratio of at least 4.5:1
- depends_on: T-001
- requirements: NFR-001, NFR-007

W3C DTCG format. Generated files are never edited by hand.

## T-003: Add configuration and structured logger
- files: src/server/config.ts, src/server/logger.ts, .env.example, test/unit/config.test.ts
- done_when: config tests show twins are the default and a selected provider with a missing setting fails with the variable's name
- depends_on: T-001
- requirements: US-12, FR-029, NFR-005

Configuration only from environment variables; the logger writes one JSON object per line and
adds `release` to error lines.

## T-004: Add the database layer and migration runner
- files: src/server/db.ts, src/server/migrate.ts, test/integration/migrate.test.ts
- done_when: the test applies migrations twice on in-memory PGlite (second run is a no-op) and a changed applied file is rejected
- depends_on: T-001
- requirements: FR-031, NFR-003

`pg` pool when `DATABASE_URL` is set, otherwise PGlite (`PGLITE_DIR`, `memory://` in tests).

## T-005: Migration 0001 users and sessions
- files: migrations/0001_users_sessions.sql
- done_when: the migration applies on PGlite and enforces case-insensitive unique emails
- depends_on: T-004
- requirements: FR-001, FR-002

## T-006: Implement password hashing, session tokens, cookies and sign-in rate limiting
- files: src/auth/password.ts, src/auth/sessions.ts, src/auth/cookies.ts, src/auth/rate-limit.ts, test/unit/auth.test.ts
- done_when: unit tests cover scrypt verify (right and wrong), per-user salts, token hashing, cookie flags in production and development, and the 10-per-15-minutes limit
- depends_on: T-005
- requirements: FR-001, FR-002, FR-003, NFR-006

Write the tests first. Only the SHA-256 of a session token is stored.

## T-007: Build the HTTP core
- files: src/server/http.ts, src/server/errors.ts, src/server/static.ts, test/unit/http.test.ts
- done_when: tests show route params, JSON-only enforcement, body-size limit (413), request id echo, one log line per request and the error envelope with release
- depends_on: T-003
- requirements: NFR-005, FR-031

## T-008: Add the storage provider and its twin
- files: src/providers/storage/types.ts, src/providers/storage/local.ts, src/providers/storage/memory.ts, test/unit/storage.test.ts
- done_when: both adapters pass the same contract test (put, get, delete, delete prefix, rejection of `..` keys)
- depends_on: T-001
- requirements: FR-011, FR-013

## T-009: Wire the application and health endpoints
- files: src/server/app.ts, src/server/main.ts, src/providers/index.ts, test/helpers/app.ts, test/integration/health.test.ts
- done_when: `/healthz` returns 200 and `/readyz` returns 200 with a reachable database and 503 when the database is closed
- depends_on: T-004, T-007, T-008
- requirements: FR-031, US-12

## T-010: Add authentication routes and the session guard
- files: src/auth/routes.ts, src/auth/guard.ts, src/server/app.ts, test/integration/auth.test.ts
- done_when: integration tests cover sign-up, duplicate email, sign-in, wrong password (generic message), rate limit (429), sign-out, `me`, and account deletion removing files
- depends_on: T-006, T-009
- requirements: US-1, FR-001, FR-002, FR-003, FR-004

## T-011: Migration 0002 projects, characters and character images
- files: migrations/0002_projects_characters.sql
- done_when: the migration applies; a photo row without `consent_at` is rejected by a check constraint
- depends_on: T-005
- requirements: FR-006, FR-008, FR-013

## T-012: Add shared schemas and style presets
- files: src/shared/schemas.ts, src/shared/styles.ts, src/shared/types.ts, test/unit/schemas.test.ts
- done_when: schema tests accept a valid script and reject one with 7 panels on a page, an empty description or a plot over 4,000 characters
- depends_on: T-001
- requirements: FR-014, FR-015, FR-016, FR-018

## T-013: Add the moderation provider (rules and permissive twin)
- files: src/providers/moderation/types.ts, src/providers/moderation/rules.ts, src/providers/moderation/permissive.ts, test/unit/moderation.test.ts
- done_when: tests show sexual, violent-harm and defamatory texts are refused for real people, the same fight text is allowed for invented characters, and the twin allows everything
- depends_on: T-001
- requirements: US-11, FR-027, FR-028

## T-014: Add the projects API
- files: src/server/routes/projects.ts, src/server/app.ts, test/integration/projects.test.ts
- done_when: tests cover create with a path, list, read, rename, style and plot update, path change refused, and delete
- depends_on: T-010, T-011, T-012
- requirements: US-2, US-5, FR-005, FR-006, FR-014, FR-015

## T-015: Add characters and image uploads
- files: src/server/routes/characters.ts, src/server/uploads.ts, src/server/app.ts, test/unit/uploads.test.ts, test/integration/characters.test.ts
- done_when: tests show photo upload refused without consent, accepted with consent, type sniffing rejects a mislabelled file, 5 MB and 5-image limits, and path rules per kind
- depends_on: T-013, T-014
- requirements: US-3, US-4, FR-008, FR-009, FR-010, FR-011

## T-016: Delete photos with derived images
- files: src/server/deletion.ts, src/server/routes/characters.ts, src/server/routes/projects.ts, test/integration/deletion.test.ts
- done_when: deleting a photo removes it and the panel images showing that character from storage and marks those panels unrendered; deleting a character or project removes all its files
- depends_on: T-015, T-018
- requirements: US-10, FR-012, FR-013

## T-017: Add the LLM provider interface and deterministic twin
- files: src/providers/llm/types.ts, src/providers/llm/twin.ts, test/unit/llm-twin.test.ts
- done_when: the twin returns the same valid script JSON for the same input and respects page and character counts
- depends_on: T-012
- requirements: FR-016, FR-029

## T-018: Migration 0003 scripts, panel images and render jobs
- files: migrations/0003_scripts_renders.sql
- done_when: the migration applies after 0002 and job status is limited by a check constraint
- depends_on: T-011
- requirements: FR-016, FR-019

## T-019: Generate and edit scripts
- files: src/server/script-service.ts, src/server/routes/script.ts, src/server/app.ts, test/integration/script.test.ts
- done_when: tests cover generation with the twin, invalid LLM output (502), versioned save with a stale version (409), and moderation refusals on the photo path for plot and edits
- depends_on: T-015, T-017, T-018
- requirements: US-6, US-11, FR-016, FR-017, FR-018, FR-027

## T-020: Add the Anthropic and OpenAI-compatible LLM adapters
- files: src/providers/llm/anthropic.ts, src/providers/llm/openai-compatible.ts, test/helpers/fake-server.ts, test/unit/llm-adapters.test.ts
- done_when: against a local fake server, each adapter sends the documented request shape and headers and maps HTTP errors and timeouts to provider errors
- depends_on: T-017
- requirements: US-12, FR-029

Marked "untested against the live service".

## T-021: Add the image provider interface and placeholder twin
- files: src/providers/image/types.ts, src/providers/image/twin.ts, test/unit/image-twin.test.ts
- done_when: the twin returns deterministic, well-formed SVG with neutral shapes and labels and no external references
- depends_on: T-002
- requirements: FR-021, NFR-007

## T-022: Add the hosted and ComfyUI-style image adapters
- files: src/providers/image/hosted.ts, src/providers/image/comfyui.ts, test/unit/image-adapters.test.ts
- done_when: against a local fake server, the hosted adapter handles image and JSON responses and the ComfyUI adapter queues, polls and downloads; photo references are only sent when allowed
- depends_on: T-021, T-020
- requirements: FR-021, FR-022, FR-029, FR-030

## T-023: Run render jobs in the background
- files: src/server/render-runner.ts, src/server/routes/render.ts, src/server/app.ts, test/integration/render.test.ts
- done_when: tests show 202 with a job id, progress to succeeded, per-panel failure recorded, re-render of one panel, interrupted jobs resumed, the 36-panel cap and moderation before rendering
- depends_on: T-019, T-021
- requirements: US-7, FR-019, FR-020, FR-021, FR-023, FR-027, FR-032

## T-024: Compose comic pages as SVG
- files: src/shared/compose.ts, test/unit/compose.test.ts
- done_when: tests show grid layouts for 1 to 6 panels, escaped dialogue in bubbles with speaker labels, caption boxes, and a placeholder frame for unrendered panels
- depends_on: T-012, T-002
- requirements: FR-024

## T-025: Serve pages and exports
- files: src/server/routes/pages.ts, src/server/zip.ts, src/server/print.ts, test/unit/zip.test.ts, test/integration/export.test.ts
- done_when: tests show page SVG with a strict CSP, a ZIP whose entries and CRC-32 values are valid, and a print page with one sheet per comic page
- depends_on: T-023, T-024
- requirements: US-8, US-9, FR-024, FR-025, FR-026

## T-026: Prove per-user authorisation across every project resource
- files: test/integration/authorization.test.ts
- done_when: a second user gets 404 for every project, character, image, script, job, page and export route of the first user, and cannot attach the first user's characters
- depends_on: T-025, T-016
- requirements: FR-007, SC-002

## T-027: Build the web shell, router and API client
- files: index.html, vite.config.ts, src/web/main.tsx, src/web/App.tsx, src/web/router.tsx, src/web/api.ts, src/web/styles/app.css
- done_when: `npm run build` produces `dist/web` and the server serves it with SPA fallback
- depends_on: T-002, T-009
- requirements: NFR-001, NFR-007

## T-028: Build the sign-in, sign-up and project list pages
- files: src/web/pages/AuthPage.tsx, src/web/pages/ProjectsPage.tsx, src/web/pages/NewProjectPage.tsx, src/web/components/Field.tsx
- done_when: a user can sign up, sign in, sign out, see projects and create a project with a path choice using only the keyboard
- depends_on: T-027, T-014
- requirements: US-1, US-2

## T-029: Build the project workspace: characters, story and script
- files: src/web/pages/ProjectPage.tsx, src/web/project/CharactersStep.tsx, src/web/project/StoryStep.tsx, src/web/project/ScriptStep.tsx
- done_when: the characters step shows the consent checkbox on the photo path, the story step saves style and plot, and the script step generates and saves edits
- depends_on: T-028, T-019, T-016
- requirements: US-3, US-4, US-5, US-6, US-10

## T-030: Build the render, reader and export steps
- files: src/web/project/RenderStep.tsx, src/web/project/ReaderStep.tsx, src/web/project/ExportStep.tsx
- done_when: a user starts a render, sees progress until done, reads pages with a transcript and finds the SVG, ZIP and print links
- depends_on: T-029, T-025
- requirements: US-7, US-8, US-9, FR-025

## T-031: Add the end-to-end and accessibility suite
- files: playwright.config.ts, e2e/auth.spec.ts, e2e/invented-path.spec.ts, e2e/photo-path.spec.ts, e2e/a11y.spec.ts
- done_when: `npm run test:e2e` passes in Chromium with twins: sign-up and sign-in, invented path to export, photo path with consent and upload, and axe scans with zero violations
- depends_on: T-030
- requirements: SC-001, SC-003, SC-004, NFR-001, NFR-003

## T-032: Package for deployment and document
- files: Dockerfile, .dockerignore, README.md
- done_when: the Dockerfile builds a non-root image with a `/healthz` healthcheck and the README covers quick start, env vars, providers, privacy and scope
- depends_on: T-031
- requirements: US-12, FR-031, NFR-002, FR-033, FR-034

The README records the owner decisions on FR-030, FR-033 and FR-034 (made 2026-11-05) and what is
not built yet: the age confirmation, the guardian confirmation and automatic photo deletion.

## T-033: Expose in-process metrics
- files: src/server/metrics.ts, src/server/http.ts, src/server/app.ts, src/server/render-runner.ts, test/integration/metrics.test.ts
- done_when: `GET /metrics.json` returns release, uptime, request and 5xx counts and queued/running/failed job counts, with no personal data, and the test sees the counters move
- depends_on: T-023
- requirements: FR-035, NFR-005

## T-034: Add OpenFeature flags with a flagd-file provider
- files: flags/flags.json, src/providers/flags/flagd-file.ts, src/server/flags.ts, src/server/config.ts, test/unit/flags.test.ts
- done_when: unit tests show the provider resolves flagd JSON (enabled, disabled, missing flag, type mismatch, file changes picked up without restart) through the OpenFeature client
- depends_on: T-009
- requirements: FR-036, US-12

## T-035: Put the real-photo path and rendering behind flags
- files: src/server/routes/projects.ts, src/server/routes/characters.ts, src/server/routes/script.ts, src/server/routes/render.ts, test/integration/flags.test.ts
- done_when: with `photo-path-enabled` off, new photo projects, photo uploads, generation and rendering for photo projects are refused (403) while reads, exports and deletes still work; with `render-enabled` off new jobs get 503
- depends_on: T-034, T-026
- requirements: FR-036, US-2, US-3, US-7

## T-036: Show disabled features in the UI
- files: src/web/pages/NewProjectPage.tsx, src/web/features.ts
- done_when: the new-project page disables the real-photo choice with an explanation when the flag is off
- depends_on: T-035, T-028
- requirements: FR-036, US-2

## T-037: Guard migrations and verify db:migrate on PostgreSQL
- files: test/integration/migrate.test.ts, test/integration/pg.test.ts
- done_when: a test fails any migration with DROP, RENAME or SET NOT NULL that lacks `-- factory:contract` on its first line, and with `TEST_DATABASE_URL` set the migrations and a smoke flow run on real PostgreSQL through `pg`
- depends_on: T-018
- requirements: NFR-008, FR-031
