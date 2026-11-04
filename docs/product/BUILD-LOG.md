# Build log: spec 001 Ink Dimensions web v1

One row per task in [`specs/001-ink-dimensions-web-v1/tasks.md`](../../specs/001-ink-dimensions-web-v1/tasks.md).
All tasks were implemented by an AI agent before the intake documents were approved by the owner;
the spec, plan and tasks are still `status: draft`. Commits are on `main`; the intake documents are
in `e2cb716` (extended in `04cc3fd`).

| Task | Title | Status | Commit | Notes |
|---|---|---|---|---|
| T-001 | Scaffold the TypeScript toolchain | done | `f5fee01` |  |
| T-002 | Add design tokens and generated styles | done | `e806c5e` |  |
| T-003 | Add configuration and structured logger | done | `4417ded` |  |
| T-004 | Add the database layer and migration runner | done | `3e274ab` |  |
| T-005 | Migration 0001 users and sessions | done | `a0a3752` |  |
| T-006 | Implement password hashing, session tokens, cookies and sign-in rate limiting | done | `2b54c40` |  |
| T-007 | Build the HTTP core | done | `ff33310` |  |
| T-008 | Add the storage provider and its twin | done | `ae65133` |  |
| T-009 | Wire the application and health endpoints | done | `25f1c70` | Committed after the provider tasks (T-012, T-013, T-017, T-020, T-021, T-022) so providers/index.ts could select every adapter at once. |
| T-010 | Add authentication routes and the session guard | done | `a959462` |  |
| T-011 | Migration 0002 projects, characters and character images | done | `9a1fcf5` | Its constraint test landed with T-018 (one migration test covers 0002 and 0003). |
| T-012 | Add shared schemas and style presets | done | `52cefdc` |  |
| T-013 | Add the moderation provider (rules and permissive twin) | done | `509b3f8` |  |
| T-014 | Add the projects API | done | `3a7a916` | Also added src/server/access.ts, dto.ts and the first version of deletion.ts (project deletion). |
| T-015 | Add characters and image uploads | done | `5bd7ab8` | deletion.ts gained photo and character deletion with derived images here; T-016 added the tests. |
| T-016 | Delete photos with derived images | done | `defe3ea` |  |
| T-017 | Add the LLM provider interface and deterministic twin | done | `e1f964d` |  |
| T-018 | Migration 0003 scripts, panel images and render jobs | done | `3005ac4` |  |
| T-019 | Generate and edit scripts | done | `4b3bb8d` |  |
| T-020 | Add the Anthropic and OpenAI-compatible LLM adapters | done | `6e3b412` |  |
| T-021 | Add the image provider interface and placeholder twin | done | `c32d752` |  |
| T-022 | Add the hosted and ComfyUI-style image adapters | done | `9d7e806` |  |
| T-023 | Run render jobs in the background | done | `7b2a556` |  |
| T-024 | Compose comic pages as SVG | done | `76bfbf9` |  |
| T-025 | Serve pages and exports | done | `58bed85` |  |
| T-026 | Prove per-user authorisation across every project resource | done | `8a1d743` |  |
| T-027 | Build the web shell, router and API client | done | `82096b2` | T-027 to T-030 share one commit: the shell router imports every page. Also added auth.tsx and AccountPage.tsx. |
| T-028 | Build the sign-in, sign-up and project list pages | done | `82096b2` | Shared commit with T-027. |
| T-029 | Build the project workspace: characters, story and script | done | `82096b2` | Shared commit with T-027. |
| T-030 | Build the render, reader and export steps | done | `82096b2` | Shared commit with T-027. |
| T-031 | Add the end-to-end and accessibility suite | done | `00f4833` | Also pinned playwright-core 1.63.0 via overrides so @axe-core/playwright shares the installed Playwright. |
| T-032 | Package for deployment and document | done | `4684f4b` | No Docker daemon on the build machine: the image was not built; its production stage (npm ci --ignore-scripts, build, prune, non-root run, healthcheck) was simulated and passed. |
| T-033 | Expose in-process metrics | done | `0fd5cc6` | Added after the coordinator extended the brief (Phase D release automation). |
| T-034 | Add OpenFeature flags with a flagd-file provider | done | `ee3d9ac` | In-repo flagd-file provider instead of @openfeature/flagd-provider (needs @grpc/grpc-js). |
| T-035 | Put the real-photo path and rendering behind flags | done | `34c9811` |  |
| T-036 | Show disabled features in the UI | done | `044053a` |  |
| T-037 | Guard migrations and verify db:migrate on PostgreSQL | done | `8c65331` | Also fixed a crash risk: the pg pool now has an idle-client error listener. Verified against a local PostgreSQL 16. |

## Verification at the end of the build

| Command | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | 28 files passed, 1 skipped; 172 tests passed, 1 skipped (the PostgreSQL test needs `TEST_DATABASE_URL`) |
| `TEST_DATABASE_URL=… npx vitest run test/integration/pg.test.ts` | 1 passed against PostgreSQL 16 |
| `npm run build` | exit 0 |
| `npm run test:e2e` | 5 passed (Chromium, axe WCAG 2.2 AA) |
| `npm run db:migrate` | applied 3 migrations to PostgreSQL via `DATABASE_URL`, no-op on re-run; applied to PGlite in `.data/pglite` without it |
