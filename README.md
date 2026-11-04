# Ink Dimensions (web v1)

Ink Dimensions is an AI comics generator. It makes comics from **your own characters, plot and
style**. At the start of a project you choose one of two paths and stay on it:

- **(a) Real photos**: real people are the character source. Every photo upload needs an explicit
  consent confirmation, photos stay in private storage, are used only for that project, and can be
  deleted together with every image made from them.
- **(b) Invented characters**: defined in text and/or with reference art.

Then you write a plot, pick a style preset (manga, noir, western comic, watercolor, line-art),
generate a script (pages → panels with description, dialogue and captions), edit it, render the
panels as background jobs, read the composed pages (SVG with speech bubbles and captions) and
export them as SVG files, a ZIP, or a print-ready page for the browser's "Save as PDF".

Product documents: [`docs/product/PRFAQ.md`](docs/product/PRFAQ.md),
[`docs/product/CONSTITUTION.md`](docs/product/CONSTITUTION.md),
[`specs/001-ink-dimensions-web-v1/`](specs/001-ink-dimensions-web-v1/) (spec, plan, tasks; all
drafts for the owner) and [`docs/product/BUILD-LOG.md`](docs/product/BUILD-LOG.md).

## Quick start (no network, no keys)

Requires Node.js 22 and npm.

```bash
npm ci
npm run dev          # API + UI on http://127.0.0.1:3000 (Vite middleware, hot reload)
```

With no configuration the app uses in-process PostgreSQL (PGlite, data in `.data/pglite`),
local file storage (`.data/storage`) and deterministic **twins** for every external service:
the script twin writes a script from your plot, and the image twin draws neutral placeholder
panels (labelled shapes, no generated imagery).

Production-style run:

```bash
npm run build && npm start      # serves dist/web and the API
npm run db:migrate              # optional: migrations also run at start-up
```

Checks:

```bash
npm run typecheck && npm run lint && npm test && npm run build
npm run test:e2e     # Playwright + axe in Chromium, server with twins and in-memory PGlite
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres npm test   # adds a real-PostgreSQL run
```

Docker: `docker build -t ink-dimensions . && docker run -p 3000:3000 -v ink-data:/data ink-dimensions`
(non-root, healthcheck on `/healthz`). Session cookies are `Secure` in production, so serve it
behind HTTPS.

## Configuration

Only environment variables; every one is optional and documented in [`.env.example`](.env.example).

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | `production` turns on Secure cookies and refuses unsafe settings |
| `HOST`, `PORT` | `127.0.0.1` (`0.0.0.0` in production), `3000` | Listen address |
| `RELEASE` | `dev` | Release version on every log line, error and `/metrics.json` |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error`, `silent` |
| `DATABASE_URL` | unset | PostgreSQL via `pg`; unset means PGlite |
| `PGLITE_DIR` | `.data/pglite` | PGlite data directory (`memory://` for a throwaway database) |
| `MIGRATIONS_DIR` | `migrations` | Migration files |
| `STORAGE_PROVIDER`, `STORAGE_DIR` | `local`, `.data/storage` | File storage (`memory` only for tests) |
| `UPLOAD_MAX_BYTES` | `5242880` | Per-image limit (PNG, JPEG, WebP only) |
| `COOKIE_SECURE` | `true` in production | Override for local HTTPS-less testing only |
| `LLM_PROVIDER` | `twin` | `twin`, `anthropic`, `local` |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_BASE_URL` | – | Claude Messages API |
| `LOCAL_LLM_URL`, `LOCAL_LLM_MODEL`, `LOCAL_LLM_API_KEY` | – | OpenAI-compatible server (Ollama, llama.cpp) |
| `LLM_TIMEOUT_MS`, `LLM_MAX_TOKENS` | `120000`, `8000` | Script generation limits |
| `IMAGE_PROVIDER` | `twin` | `twin`, `hosted`, `comfyui` |
| `HOSTED_IMAGE_URL`, `HOSTED_IMAGE_API_KEY` | – | Generic hosted image API |
| `HOSTED_IMAGE_ALLOW_PHOTOS` | `false` | Whether real photos may be sent to the hosted API. Leave it `false`: the owner decided photos stay self-hosted (FR-022) |
| `COMFYUI_URL`, `COMFYUI_WORKFLOW_PATH`, `COMFYUI_POLL_MS` | – | Self-hosted ComfyUI-style pipeline |
| `IMAGE_TIMEOUT_MS` | `180000` | Per-panel image timeout |
| `MODERATION_PROVIDER` | `rules` | `rules`, or `permissive` (tests only; refused in production) |
| `FLAGS_FILE` | `flags/flags.json` | Feature flags (OpenFeature, flagd JSON) |
| `DEV_VITE` | unset | Set by `npm run dev` |

A selected provider with a missing setting stops start-up and names the missing variable.

## Switching providers

Script generation (`src/providers/llm/`):

- **Claude**: `LLM_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (a current model id
  from Anthropic's documentation). Calls `POST /v1/messages` with `fetch`.
- **Local model**: `LLM_PROVIDER=local`, `LOCAL_LLM_URL=http://127.0.0.1:11434` (Ollama) or
  `http://127.0.0.1:8080` (llama.cpp server), `LOCAL_LLM_MODEL=<model name>`. Calls
  `/v1/chat/completions`.

Panel images (`src/providers/image/`):

- **Hosted**: `IMAGE_PROVIDER=hosted`, `HOSTED_IMAGE_URL`, `HOSTED_IMAGE_API_KEY`. This is a
  *generic* JSON contract documented at the top of `hosted.ts`; no vendor is chosen yet, so put a
  thin shim in front of the chosen vendor or adapt the file. Responses must be PNG, JPEG or WebP.
- **Self-hosted**: `IMAGE_PROVIDER=comfyui`, `COMFYUI_URL`, and `COMFYUI_WORKFLOW_PATH` pointing at
  a workflow exported from ComfyUI in API format with `{{prompt}}`, `{{negative_prompt}}`,
  `"{{width}}"`, `"{{height}}"`, `"{{seed}}"` (and optionally `{{reference_image}}`) placeholders.

**All real-provider adapters are untested against the live services.** They are unit-tested
against local fake HTTP servers that mimic the documented request and response shapes; verify
each with a real account before relying on it.

## Feature flags

Flags use the OpenFeature server SDK with a small in-repo provider for flagd's JSON format
(`src/providers/flags/flagd-file.ts`; the official flagd provider needs gRPC). Edit
`flags/flags.json` (or mount another file at `FLAGS_FILE`): the server re-reads it when it
changes, so no restart or deploy is needed. An invalid file keeps the last good flags; a missing
flag means "on". flagd `targeting` rules are not evaluated in v1.

| Flag | Default | When `off` |
|---|---|---|
| `photo-path-enabled` | `on` | New real-photo projects, photo uploads, and script generation and rendering for real-photo projects return 403 `feature_disabled`. Reading, exporting and deleting existing data keep working. The UI disables the choice. |
| `render-enabled` | `on` | New render jobs return 503 `feature_disabled` (for example to cap hosted provider costs). |

Switch with `"defaultVariant": "off"` (or `"state": "DISABLED"`, which falls back to the default: on).

## Architecture

```
src/web        React UI (Vite). Tokens only: design/tokens.json -> src/web/styles/tokens.{css,ts}
src/server     node:http server: router, JSON-only bodies, request ids and logs, routes,
               script service, render runner (background jobs), metrics, flags, exports
src/auth       load-bearing: scrypt passwords, sessions, cookies, rate limit, auth routes, guard
src/shared     zod schemas, API types, style presets, SVG page composer (pure)
src/providers  interfaces + adapters + twins: llm, image, storage, moderation, flags
migrations     numbered, forward-only SQL (expand/contract; destructive ones need -- factory:contract)
test           Vitest unit and integration tests (real HTTP server, PGlite, twins, local fakes)
e2e            Playwright specs with axe accessibility scans
```

- Requests: one JSON log line per request with a request id (`x-request-id` is echoed); errors
  carry `RELEASE`. Endpoints `/healthz` (liveness), `/readyz` (database reachable) and
  `/metrics.json` (`release`, `uptime_s`, `requests_total`, `errors_total`, `jobs`).
- Render jobs are database rows claimed with `FOR UPDATE SKIP LOCKED` by an in-process runner;
  progress is polled by the UI; jobs left running by a crash are re-queued at start-up.
- Every project resource is looked up through a project owned by the signed-in user; another
  user's resources return 404 (tested on all 19 project routes).
- Composed pages are SVG with panel images embedded as data URIs, served with a strict CSP and
  shown through `<img>`, so embedded content cannot run script.

## Privacy notes

- Photos and reference art are stored only through the `StorageProvider` (local disk, files mode
  0600, keys scoped per user and project) and served only to their owner with `no-store`.
- Each photo upload requires `consent: true`; the time of the confirmation is stored. The app
  cannot verify that consent was really given.
- Deleting a photo deletes it and every rendered panel that shows that character. Deleting a
  character, a project or the account deletes all of its files and rows.
- Photos are used only for their own project and are never sent to the hosted image provider
  (owner decision, FR-022; `HOSTED_IMAGE_ALLOW_PHOTOS` stays `false`). A ComfyUI server keeps
  any uploaded reference image in its own input folder; cleaning that folder is the operator's job.
- On the real-photo path the moderation provider refuses sexual, violent-harm and defamatory
  content in plots, character notes, generated scripts, edits and panels before rendering. The
  default `rules` provider is a keyword floor, not a classifier: it can be evaded and will refuse
  some harmless text.
- Logs contain no passwords, tokens, image bytes or plot text.

## Out of scope for v1

- The local desktop app (future work in the owner's plan; outside the factory's product line).
- Payments and plans; public sharing, collaboration.
- Training or fine-tuning on user images; face recognition or identity/consent verification.
- Interface languages other than English; generated imagery for interface assets (never).
- Owner decisions made on 2026-11-05 but **not built yet** (`docs/product/OPEN-ITEMS.md`): invites
  and daily quotas (FR-032), the 18+ and parent-or-guardian confirmations (FR-033) and automatic
  photo deletion after 90 idle days (FR-034). Until they are built, the running app has only the
  36-panel job cap, no age gate and no automatic deletion.
