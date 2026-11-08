---
artifact: plan
id: 002-invites-limits-retention
spec: specs/002-invites-limits-retention/spec.md
status: approved         # draft | approved
approved_by: "arielzin33-creator"
approved_on: "2026-11-08"
---

# Plan 002: Invites, daily limits, age checks and photo retention

How spec 002 will be built on the existing code. There are no new dependencies.

## 1. Technical context

The stack and structure are unchanged from plan 001: `node:http`, `zod` schemas in `src/shared/**`,
SQL through `Db`, and React pages. This plan reuses these existing pieces:

| Need | Existing piece |
|---|---|
| Atomic invitation use | `Db.transaction` |
| Hashed secrets | the SHA-256 pattern in `src/auth/sessions.ts` |
| Switches | `src/server/flags.ts` and `flags/flags.json` |
| Deleting a photo and what derives from it | `deleteCharacterImage` in `src/server/deletion.ts` |
| Provider and twin pattern | `src/providers/**`, selected in `createProviders` |
| Background work with start and stop | the render runner's shape in `src/server/render-runner.ts` |

## 2. Constitution check
| Article | Satisfied? | How / approved exception |
|---|---|---|
| 1 Stack | yes | No new runtime or dependency |
| 2 Tests first | yes | Each task names its test; time-dependent logic takes a clock parameter |
| 3 External services behind interfaces | yes | New `EmailProvider`, with a twin as the default and an adapter marked untested against the live service |
| 4 Data and privacy | yes | Needs the Article 4 wording added in this PR for invitee emails and the email service. Retention is the owner's decision. Emails carry no titles or content |
| 5 Security | yes | Invitations, the setup code and the administrator check live in `src/auth/**`; secrets stored hashed |
| 6 Simplicity | yes | One administrator flag, no role system, no email templates, no new dependency |
| 7 Observability | yes | The retention run writes one structured log line with counts only |
| 8 Real people protected | yes | Moderation is unchanged, and limits count only after it passes |
| 9 Neutral placeholders | yes | New UI uses design tokens only |

## 3. Architecture

**Invitations (`src/auth/invites.ts`).**
- The secret is 32 random bytes, and only its SHA-256 is stored.
- The link carries it in the URL fragment (`/signup#invite=…`), so it does not reach server logs or
  `Referer` headers.
- Sign-up first checks the invitation with a plain read, so people without one can't make the
  server do slow password hashing. It then hashes the password, and in one transaction marks the
  invitation used and inserts the user. Only one of two simultaneous sign-ups can succeed.
- The invitation API is at `/api/admin/invites`, and a new `requireAdmin` in `src/auth/guard.ts`
  answers 404 for anyone else.
- `ADMIN_BOOTSTRAP_CODE` (at least 32 characters, compared in constant time) makes the signing-up
  account an administrator while no administrator exists. It is configuration rather than a server
  command because PGlite allows one process at a time, and some hosts offer no shell.
- `REGISTRATION_OPEN=true` is for development and tests, and `loadConfig` rejects it in production.

**Age and guardians.** `signUpSchema` gains `ageConfirmed: true` and an optional `invite`. The two
photo upload paths in `src/server/routes/characters.ts` gain `subject: 'adult' | 'minor'` and
`guardianConfirmed`. There is deliberately no default, because a silent "adult" would defeat
FR-110. A new flag, `minor-photos-enabled`, is on by default (owner decision, 2026-11-08).

**Daily limits (`src/server/usage.ts`).** One conditional upsert per request, so the database
enforces the limit under concurrency:

```sql
INSERT INTO usage_daily (user_id, day, panels) VALUES ($1, $2, $3)
ON CONFLICT (user_id, day) DO UPDATE SET panels = usage_daily.panels + $3
WHERE usage_daily.panels + $3 <= $4 RETURNING panels
```

- Panels are reserved when a job is created, because counting at completion would let simultaneous
  jobs exceed the limit. Failed panels are given back when the job ends, against `render_jobs.usage_day`,
  so a job that crosses midnight credits the right day.
- A script generation is reserved after moderation passes and before the provider is called, and
  given back if the call fails.
- The limits are constants in `LIMITS`, because they are owner decisions and not per-installation
  settings.

**Email (`src/providers/email/`).** `EmailProvider.send({ to, subject, text })`, with a twin that
records messages in memory and logs only a count, and an `http` adapter posting JSON (settings:
`EMAIL_PROVIDER`, `EMAIL_HTTP_URL`, `EMAIL_HTTP_API_KEY`, `EMAIL_FROM`, `APP_URL`). As with the
hosted image adapter, the chosen vendor may need a thin shim.

**Retention (`src/server/retention.ts`).** `runRetention(deps, now)` runs at start-up and hourly:

1. **Off switches.** It returns early if the `retention-enabled` flag is off, or in production when
   the email provider is the twin (FR-123, FR-124).
2. **Warn.** For projects with photos, idle at least 76 days and not yet warned, it sends one email
   per owner, and sets `retention_warned_at` only after the send succeeds. A failure is logged and
   retried on the next run.
3. **Delete.** For projects idle at least 90 days, warned at least 14 days ago and with no queued or
   running job, it calls `deleteCharacterImage` on each photo. Files go before rows, as they already
   do, and each photo is its own step, so an interrupted run can simply run again.
4. **Tidy.** It deletes invitations that stopped being usable more than 30 days ago.

`loadOwnedProject` is the single route into a project, so activity is recorded there. It updates
`last_activity_at` and clears `retention_warned_at`, at most once an hour per project unless a
warning is pending, so that reads stay cheap. The project list does not use that function, so
viewing it is not activity (FR-119).

## 4. Data model

One migration, `migrations/0004_invites_limits_retention.sql`, additive only:

- `invites`: `id`, `email`, `token_hash` (unique), `created_by`, `created_at`, `expires_at`,
  `used_at`, `used_by` (cascades on user delete), `revoked_at`. A partial unique index on
  `lower(email)` allows one live invitation per email.
- `users`: `is_admin boolean NOT NULL DEFAULT false`, `age_confirmed_at timestamptz`.
- `usage_daily`: `user_id` (cascades), `day date`, `script_generations`, `panels`; primary key
  `(user_id, day)`.
- `character_images`: `subject_minor boolean`, `guardian_confirmed_at timestamptz`, and a check
  that a photo marked as a minor has a confirmation time.
- `projects`: `last_activity_at timestamptz NOT NULL DEFAULT now()`, `retention_warned_at timestamptz`,
  and an index for the retention query.
- `render_jobs`: `usage_day date`.

Existing projects start their 90 days when the migration runs, so nothing can be deleted early.
The new age and photo columns are nullable because existing rows have no confirmation. No hosted
production database exists yet, so no real accounts are affected.

## 5. Interfaces

| Route | Change |
|---|---|
| `POST /api/auth/signup` | takes `invite` and `ageConfirmed`; 403 `invite_invalid` |
| `GET`, `POST /api/admin/invites`, `DELETE /api/admin/invites/:id` | new; 404 for non-administrators; 409 on FR-105 |
| `GET /api/auth/me` | adds `isAdmin` |
| Photo upload routes | take `subject` and `guardianConfirmed` |
| `POST /api/projects/:id/script/generate`, `POST /api/projects/:id/render` | 429 `daily_limit` with what remains |
| Project responses | add `photosDeleteOn` (a date or null) |

UI: the sign-up page reads the fragment and adds the age confirmation; a new `/admin/invites` page
linked only for administrators; the photo form asks who is in the photo; and a notice on the project
list and project page. Refusals use the error display already there.

## 6. Risk and tier

- Tier 3: `src/auth/**`, the migration, `.env.example`, `playwright.config.ts`, and edits to existing
  tests (test helper, end-to-end fixtures, upload tests). A human merges these under CODEOWNERS, and
  the factory never produces them.
- Tier 2: `.tsx` pages, public API changes and the retention runner.
- Tier 0: operator documentation.
- **Highest product risk:** retention deletes irreversibly. Mitigations: the warning must be recorded
  first, production stays off until a real email service exists, and the flag can pause it.
- **Known limits:** self-declared age and guardianship are not verification (the owner chose not to
  wait for legal advice); there is no bounce handling; and the self-hosted server's own copies need the operator's
  scheduled clean-up (FR-125). That clean-up has not been tried against a real server.

## 7. Test strategy

- Integration: invitation rules including simultaneous sign-ups (SC-101), administrator access,
  limits under concurrent requests (SC-102), upload rules (SC-103), and the retention sequence with a
  fixed clock and each no-delete case (SC-104).
- Unit: configuration rules (open registration and setup code in production), and the email twin and
  adapter against the local fake server.
- End-to-end: open registration keeps the existing flows working. A second server with invitations
  required covers setup code, invitation link and sign-up, with accessibility scans (SC-105).
- Migration: the existing guard rejects destructive changes, and the optional PostgreSQL test covers
  the conditional upsert on real PostgreSQL.
