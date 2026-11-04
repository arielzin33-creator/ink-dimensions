---
artifact: plan
id: 001-ink-dimensions-web-v1
spec: specs/001-ink-dimensions-web-v1/spec.md
status: draft            # draft | approved
approved_by: ""
approved_on: ""
---

# Plan 001: Ink Dimensions web v1

How the spec will be built. Every decision cites the requirement it serves and the
constitution articles it satisfies.

## 1. Technical context

- Stack (Article 1, `PRODUCT-LINE.md`): TypeScript strict on Node.js 22, npm with a committed
  `package-lock.json`, Vitest, ESLint flat config with typescript-eslint, React with Vite,
  Playwright with `@axe-core/playwright`, PostgreSQL.
- HTTP server: **`node:http` with a ~150-line router**, not Fastify. Reasons (Article 6): the API
  is small (about 30 routes), JSON-only, and needs exact control over body-size limits for
  uploads, request-id logging and security headers. Fastify would add a dependency tree plus
  plugins for cookies, static files and body limits. Integration tests use real HTTP on an
  ephemeral port.
- Validation: `zod` schemas in `src/shared/**`, shared by the API and the UI.
- Storage: PostgreSQL through a two-method `Db` interface. `pg` (connection pool) when
  `DATABASE_URL` is set; otherwise `@electric-sql/pglite` (in-process Postgres) on a data directory
  (`PGLITE_DIR`, default `.data/pglite`) or in memory (`memory://`, used by tests and end-to-end).
  The same SQL runs on both. Files (photos, reference art, panel images) go through
  `StorageProvider`: local filesystem in production and development, in-memory in tests.
- External services and their twins (Article 3; all in `src/providers/**`):

  | Interface | Adapters | Twin (default) |
  |---|---|---|
  | `LlmProvider` | `anthropic` (Messages API over HTTPS with `fetch`), `local` (OpenAI-compatible `/v1/chat/completions`, e.g. Ollama or llama.cpp server) | deterministic script from the structured input |
  | `ImageProvider` | `hosted` (generic HTTPS JSON contract, documented in the adapter), `comfyui` (ComfyUI-style `/prompt`, `/history`, `/view` with a workflow template file) | neutral SVG placeholder: frame, shapes, labels |
  | `StorageProvider` | `local` filesystem | in-memory |
  | `ModerationProvider` | `rules` (keyword rules for real-person harm; default) | `permissive` (allows everything; tests only) |

  Selection is explicit (`LLM_PROVIDER`, `IMAGE_PROVIDER`, `MODERATION_PROVIDER`), defaulting to
  the twins (and `rules` for moderation, which needs no network). A selected adapter with missing
  settings stops start-up with the name of the missing variable (US-12). Real adapters are
  marked "untested against the live service" and unit-tested against a local fake HTTP server.
- New dependencies and why (Article 6): `zod` (validation shared by API and UI), `pg` and
  `@electric-sql/pglite` (mandated), `react`/`react-dom`/`vite`/`@vitejs/plugin-react`
  (mandated front end), `tsx` (dev-time TypeScript runner for `dev` and `db:migrate`),
  `eslint-plugin-react-hooks` (catches hook misuse), `@playwright/test` pinned to the machine's
  Playwright 1.63.0, `@axe-core/playwright`, `@openfeature/server-sdk` (+ its `@openfeature/core`
  peer) for feature flags (FR-036). The flagd provider package needs gRPC (`@grpc/grpc-js`), so a
  ~100-line in-repo OpenFeature provider reads the same flagd JSON file instead. No ORM, no router library, no CSS framework, no
  ZIP library (a 60-line store-only ZIP writer is enough for SVG export).

## 2. Constitution check
| Article | Satisfied? | How / approved exception |
|---|---|---|
| 1 Stack | yes | Reference stack only; the desktop app is excluded |
| 2 Tests first | yes | Each task names the test written first; e2e covers both paths |
| 3 External services behind interfaces | yes | Four provider interfaces with twins as defaults; no network needed |
| 4 Data and privacy | yes | Consent per upload, private storage, cascade deletion, no logging of content |
| 5 Security | yes | All auth in `src/auth/**`; scrypt; HttpOnly SameSite=Strict cookies; per-user authorisation |
| 6 Simplicity | yes | `node:http`, no ORM, no router or CSS libraries; each dependency justified above |
| 7 Observability | yes | One JSON log line per request and per job with request id; errors carry `RELEASE` |
| 8 Real people protected | yes | `ModerationProvider` checks plot, script, edits and panels on the photo path |
| 9 Neutral placeholders | yes | Twin images are labelled shapes; UI uses tokens only; no image generation for UI |

## 3. Architecture

```
browser (React, src/web) ──JSON──▶ node:http server (src/server)
                                     ├─ src/auth: sessions, passwords, cookies, auth routes
                                     ├─ routes: projects, characters, images, script, render, pages, export
                                     ├─ services: script-service, render-runner, compose (src/shared)
                                     ├─ Db (pg | PGlite) ── migrations/*.sql
                                     └─ src/providers: llm, image, storage, moderation (+ twins)
```

- `src/server/http.ts`: router with path parameters, JSON body reader with a byte limit,
  request id (`x-request-id` accepted if well-formed, otherwise generated), one JSON log line per
  request, uniform error envelope `{ error: { code, message, requestId } }`, security headers
  (CSP, `nosniff`, `frame-ancestors 'none'`), static file serving for the built UI with SPA
  fallback. Mutating requests must be `application/json` (with SameSite=Strict cookies this
  blocks cross-site form posts).
- `src/auth/**` (load-bearing): `password.ts` (scrypt N=16384, r=8, p=1, 16-byte salt, 64-byte
  key, constant-time compare), `sessions.ts` (32-byte random token; only its SHA-256 is stored;
  14-day expiry), `cookies.ts` (HttpOnly, SameSite=Strict, Secure in production, Path=/),
  `rate-limit.ts` (failed sign-ins per email: 10 per 15 minutes), `routes.ts` (sign-up, sign-in,
  sign-out, me, delete account) and `guard.ts` (`requireUser`).
- `src/server/app.ts` wires dependencies (`AppDeps`: db, providers, config, logger) so tests build
  an app with twins and in-memory storage.
- Authorisation: every project route loads the project with `WHERE id = $1 AND user_id = $2`;
  child resources are always looked up through their project id. Missing or foreign resources
  return 404 alike (FR-007).
- Script generation (`src/server/script-service.ts`): builds a system prompt and a user prompt
  from the plot, style and characters, asks for JSON only, strips code fences, validates with
  the shared `zod` schema, assigns panel ids, and maps speaker and character names to the
  project's characters. Invalid output returns 502 `llm_invalid_output` (FR-017).
- Render jobs (`src/server/render-runner.ts`): `POST render` inserts a job row (`queued`) with the
  panel ids and returns 202. An in-process runner picks jobs in creation order, marks `running`,
  renders each panel (moderation → image provider → storage → `panel_images` upsert), records
  per-panel results and finishes `succeeded` or `failed` (any panel failed). On start-up
  `running` jobs return to `queued` (FR-023). Tests call `runner.drain()`.
- Composition (`src/shared/compose.ts`): pure function from a script page and panel images to an
  SVG string: grid layout by panel count, panel images embedded as data URIs, bubbles with a
  tail and speaker label, caption boxes; text wrapped by character count. Served with a strict
  CSP and as `<img>` in the reader, so embedded content cannot run script.
- Export: per-page SVG (`Content-Disposition: attachment`), ZIP of all pages (store-only writer
  with CRC-32), and a print HTML page (`@page` A4, one comic page per sheet, no script).
- UI (`src/web/**`): React with a 40-line history router; pages: sign-in, sign-up, projects,
  new project (path choice), project workspace (characters, story, script, render, read, export
  steps). Styles use only CSS variables generated from `design/tokens.json`.
- Metrics (`src/server/metrics.ts`, FR-035): in-process counters updated by the request handler
  (every response; 5xx counted as errors) and the render runner (failed jobs); `GET /metrics.json`
  adds uptime and the current queued/running job counts from the database. No personal data.
- Feature flags (`src/providers/flags/**`, `src/server/flags.ts`, FR-036): OpenFeature server SDK
  with an in-repo provider for flagd's JSON format, reading `flags/flags.json` (`FLAGS_FILE`).
  The file is re-read when its modification time changes, so an operator can switch a flag by
  editing or re-mounting the file, without a deploy. Flags: `photo-path-enabled` and
  `render-enabled`, both `on`. flagd `targeting` rules are not evaluated in v1 (the default
  variant is used and a warning is logged). `GET /api/features` tells the UI which are on.
- Development: `npm run dev` runs the API with `tsx watch` and mounts Vite in middleware mode on
  the same port; `npm start` serves the built UI from `dist/web`.

## 4. Data model

Forward-only numbered migrations, each additive (expand/contract: new columns are nullable or
defaulted; removals happen in a later migration after the code stops using them). IDs are UUIDs
generated by the application. All foreign keys `ON DELETE CASCADE` from the owning account.

- `0001_users_sessions.sql`: `users(id, email UNIQUE (lower-case), password_hash, created_at)`,
  `sessions(token_hash PK, user_id → users, created_at, expires_at)`.
- `0002_projects_characters.sql`: `projects(id, user_id → users, title, path CHECK in
  ('photo','invented'), style_preset, plot, created_at, updated_at)`,
  `characters(id, project_id → projects, name, description, created_at)`,
  `character_images(id, character_id → characters, project_id → projects, kind CHECK in
  ('photo','reference'), storage_key, content_type, byte_size, consent_at, created_at)` with a
  check that photos have `consent_at`.
- `0003_scripts_renders.sql`: `scripts(project_id PK → projects, version, content jsonb,
  updated_at)`, `panel_images(project_id → projects, panel_id, storage_key, content_type,
  character_ids jsonb, provider, created_at, PK(project_id, panel_id))`,
  `render_jobs(id, project_id → projects, user_id, status CHECK, panel_ids jsonb, results jsonb,
  error, request_id, created_at, started_at, finished_at)`.
- No v1 migration is destructive. A future migration that drops, renames or tightens anything
  (`DROP`, `RENAME`, `SET NOT NULL`) must start with the line `-- factory:contract`; a unit test
  enforces the marker (NFR-008).
- `npm run db:migrate` applies migrations to `DATABASE_URL` (pg) or, when it is unset, to PGlite in
  `PGLITE_DIR` (default `.data/pglite`).
- `schema_migrations(version, name, applied_at)` tracks applied files; checksums are stored and a
  changed applied file stops start-up.

Storage keys: `u/<userId>/p/<projectId>/img/<imageId>` and `u/<userId>/p/<projectId>/panel/<panelId>`;
deleting a project removes the prefix `u/<userId>/p/<projectId>/`; deleting an account removes
`u/<userId>/`.

## 5. Interfaces

All under `/api`, JSON in and out, cookie session. Errors: `400 invalid_request`,
`401 unauthenticated`, `404 not_found`, `409 conflict`, `413 payload_too_large`,
`415 unsupported_media_type`, `422 refused_by_moderation`, `403 feature_disabled`
(real-photo path off), `503 feature_disabled` (rendering off), `429 rate_limited`,
`502 provider_error | llm_invalid_output`.

| Method and path | Purpose | Requirement |
|---|---|---|
| `POST /api/auth/signup` `{email,password}` | create account and session | FR-001 |
| `POST /api/auth/login` `{email,password}` | session | FR-002, FR-003 |
| `POST /api/auth/logout` | end session | FR-002 |
| `GET /api/auth/me` | current user | FR-002 |
| `DELETE /api/auth/account` `{password}` | delete account and files | FR-004 |
| `GET/POST /api/projects` | list / create `{title,path}` | FR-005, FR-006 |
| `GET/PATCH/DELETE /api/projects/:id` | read / update `{title?,stylePreset?,plot?}` / delete | FR-005, FR-013–FR-015 |
| `POST /api/projects/:id/characters` | add `{name,description?}` | FR-009 |
| `PATCH/DELETE /api/projects/:id/characters/:cid` | edit / delete | FR-013 |
| `POST /api/projects/:id/characters/:cid/images` `{kind,contentType,dataBase64,consent?}` | upload | FR-008, FR-010, FR-011 |
| `GET/DELETE /api/projects/:id/characters/:cid/images/:iid` | view / delete (+derived) | FR-011, FR-012 |
| `POST /api/projects/:id/script/generate` `{pages}` | generate script | FR-016, FR-017, FR-027 |
| `GET/PUT /api/projects/:id/script` `{version,script}` | read / save with version check | FR-018, FR-027 |
| `POST /api/projects/:id/render` `{panelIds?}` | start job (202) | FR-019, FR-032 |
| `GET /api/projects/:id/render-jobs/:jobId` | job status | FR-019, FR-020 |
| `GET /api/projects/:id/panels/:panelId/image` | panel image | FR-011 |
| `GET /api/projects/:id/pages/:n.svg` | composed page | FR-024, FR-025 |
| `GET /api/projects/:id/export/comic.zip` | all pages | FR-026 |
| `GET /api/projects/:id/export/print.html` | print page | FR-026 |
| `GET /api/styles` | presets | FR-014 |
| `GET /healthz`, `GET /readyz` | liveness, database readiness | FR-031 |
| `GET /metrics.json` | `{release, uptime_s, requests_total, errors_total, jobs: {queued, running, failed_total}}` | FR-035 |
| `GET /api/features` | `{photoPathEnabled, renderEnabled}` | FR-036 |

## 6. Risk and tier

- Tier 3 (load-bearing, human only): `src/auth/**`, `migrations/**`, `package.json` scripts,
  `tsconfig*.json`, `eslint.config.*`, `vitest.config.*`, `playwright.config.*`, `vite.config.*`,
  `Dockerfile`, `.env.example`.
- Tier 2: `src/web/**/*.tsx`, CSS, and the public API routes.
- Tier 1: providers, shared schemas, composition, services and their tests.
- Product risk concentrated in: authorisation of project resources (tested across two users),
  consent and deletion on the photo path (tested end to end), moderation (rule-based floor;
  documented limits).

## 7. Test strategy

- Unit (Vitest, `test/unit/**`): password hashing, session tokens, cookie flags, rate limiter,
  zod schemas, moderation rules, twins (determinism), compose (bubbles, captions, placeholders),
  ZIP writer (CRC and structure), image-type sniffing, config parsing, design-token hygiene
  (no literal colours or pixel sizes in component styles).
- Adapter tests: each real adapter runs against a local fake HTTP server on `127.0.0.1` and
  checks the request shape, headers and error handling.
- Integration (Vitest, `test/integration/**`): the real HTTP server on an ephemeral port with
  in-memory PGlite, in-memory storage and twins: auth flows, cross-user authorisation (SC-002),
  consent and deletion (SC-003), script generation and versioned edits, render jobs, pages and
  exports, moderation refusals, health checks.
- End-to-end (Playwright, Chromium, `e2e/**`): server built and started with twins and in-memory
  PGlite: sign-up and sign-in; the full invented path to an exported comic (SC-001); the photo
  path with consent required and a photo upload; axe scans of the main pages (SC-004).
