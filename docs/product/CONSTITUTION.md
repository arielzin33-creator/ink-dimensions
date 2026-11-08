---
artifact: constitution
product: Ink Dimensions
status: approved         # draft | approved
approved_by: "arielzin33-creator"
approved_on: "2026-11-08"
---

# Ink Dimensions constitution

The non-negotiable principles every spec, plan and change for this product must satisfy
(Spec Kit's constitution, LIFE-15). Specs cite articles by number; the spec check fails if a
plan contradicts an article without an approved exception in `DECISIONS.md`.

## Article 1 — Stack
The product uses the factory reference stack (`docs/factory/PRODUCT-LINE.md`): TypeScript in
strict mode on Node.js 22, npm with a committed lockfile, Vitest, ESLint flat config with
typescript-eslint, React with Vite, Playwright, PostgreSQL (`pg` in production, in-process
PGlite for tests and zero-setup development). No second language runtime in the product. The
desktop app is outside the product line and is not built here.

## Article 2 — Tests first
Every behaviour in a spec has an acceptance test written before or with the code. A bug fix
starts with a failing test. Unit and integration tests run with no network and no browser;
end-to-end tests run in Playwright against the server with twins.

## Article 3 — External services behind interfaces
Every external service (language models, image generators, storage, moderation) is reached
through an interface in `src/providers/**` with a deterministic dependency twin used in tests and
local development. Twins are the default when provider configuration is absent. The product
runs end to end with no network and no keys. Adapters for real services are small, documented,
unit-tested against a local fake server and marked "untested against the live service" until a
human has verified them.

## Article 4 — Data and privacy
- Personal data held: account email, a password hash, projects, plots, scripts, character
  descriptions, uploaded photos and reference art, generated panel images, and the email address
  on an invitation.
- An email service receives only the recipient's address and a message with no project content.
- Photos of real people are the most sensitive data. They are uploaded only with an explicit
  consent confirmation per upload, stored only in private storage behind the storage interface,
  used only for the project they were uploaded to, never used for training, and never shared
  across users or projects.
- Deletion is real: deleting a photo deletes it and every image derived from it; deleting a
  project or an account deletes all of its data and files.
- No retention beyond what the user keeps, unless the owner decides a retention period.
- Logs never contain passwords, session tokens, photo bytes or plot text.

## Article 5 — Security
Authentication, authorisation and payment code are load-bearing: changed only by humans,
reviewed under CODEOWNERS. All authentication and session code lives in `src/auth/**`.
Passwords are hashed with scrypt and a per-user salt; sessions use HttpOnly, SameSite=Strict
cookies that are Secure in production. Every project resource is authorised per user. The API
accepts JSON only, validates every input, and limits upload size and type.

## Article 6 — Simplicity
The smallest design that meets the spec. A new dependency, service or abstraction needs a
reason written in the plan. Configuration comes only from environment variables documented in
`.env.example`.

## Article 7 — Observability
Every request and job emits a structured JSON log line with a request id; errors carry the
release version (`RELEASE`). `/healthz` reports liveness and `/readyz` reports database
reachability.

## Article 8 — Real people are protected by default
Content that depicts a real person (the real-photo path) in sexual, violent-harm or defamatory
scenarios is refused, at script generation, on script edits and before rendering. Moderation is
an interface that can be strengthened without changing callers; weakening it for the real-photo
path needs an approved exception in `DECISIONS.md`.

## Article 9 — Neutral placeholders in the interface
User-interface mockups, placeholders and assets are structural and neutral (shapes and labels).
No image-generation service is ever used to produce UI assets. Interface styles use design
tokens only (`design/tokens.json`) and meet WCAG 2.2 AA.
