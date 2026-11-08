---
artifact: spec
id: 001-ink-dimensions-web-v1
product: Ink Dimensions
status: approved         # draft | approved
approved_by: "arielzin33-creator"
approved_on: "2026-11-08"
constitution: docs/product/CONSTITUTION.md
---

# Spec 001: Ink Dimensions web v1

What and why only. No technology choices: those belong in `plan.md` (Spec Kit, LIFE-15).
Open questions carry an inline clarification marker (`NEEDS CLARIFICATION` in square brackets);
the spec cannot be approved while any marker remains.

## 1. Problem and users

**Storytellers who cannot draw.** People with a story to tell (a gift comic starring a friend,
a family adventure, a small creative project) who cannot draw. Today they pay an illustrator,
generate single images one at a time with characters that change between images and no page
layout, or give up.

**The operator.** The person who runs the service and chooses which language model and image
generator it uses: a hosted service or a self-hosted one, or the built-in deterministic
stand-ins when nothing is configured.

**People in the photos.** Not users, but affected: real people whose photos are uploaded. They
need their likeness used only with permission, only for the one project, never in harmful
scenes, and removed on request.

The owner's long-term plan includes a local desktop app; this spec covers the web app only.

## 2. User stories

### US-1: Create an account and sign in  (priority: P1)
As a storyteller, I want an account with my email and a password so that my projects are private
to me and I can come back to them.

Acceptance scenarios:
1. **Given** no account for an email, **When** I sign up with that email and a password of at
   least 10 characters, **Then** I am signed in and see my (empty) project list.
2. **Given** an account, **When** I sign in with the wrong password, **Then** I see a generic
   "email or password is incorrect" message that does not reveal whether the email exists.
3. **Given** I am signed in, **When** I sign out, **Then** my session ends and project pages ask
   me to sign in.
4. **Given** I am signed in, **When** I delete my account and confirm, **Then** my account,
   projects, photos and generated images are deleted.

### US-2: Start a project and choose a path  (priority: P1)
As a storyteller, I want to start a comic project and choose between real photos and invented
characters so that the rest of the flow matches the kind of comic I am making.

Acceptance scenarios:
1. **Given** I am signed in, **When** I create a project with a title and choose "real photos",
   **Then** the project opens on the characters step and only photo upload is offered.
2. **Given** I am signed in, **When** I create a project and choose "invented characters",
   **Then** the characters step offers a text description and optional reference art.
3. **Given** a project exists, **When** I try to change its path, **Then** the change is refused;
   the path is fixed for the life of the project.

### US-3: Real-photo characters with consent  (priority: P1)
As a storyteller on the real-photo path, I want to upload photos of a person who agreed to it so
that they appear as a character in my comic.

Acceptance scenarios:
1. **Given** a real-photo project, **When** I try to upload a photo without ticking the consent
   confirmation, **Then** the upload is refused and nothing is stored.
2. **Given** a real-photo project, **When** I tick "I confirm I have this person's permission to
   use their photo" and upload a supported image within the size limit, **Then** the photo is
   stored privately and shown as a thumbnail on the character.
3. **Given** any project, **When** I upload a file that is too large or not a supported image
   type, **Then** the upload is refused with a clear message.

### US-4: Invented characters  (priority: P1)
As a storyteller on the invented path, I want to define characters in words and optionally with
reference art so that the panels show the characters I imagine.

Acceptance scenarios:
1. **Given** an invented-characters project, **When** I add a character with a name and a
   description, **Then** the character is listed and used in script generation.
2. **Given** an invented-characters project, **When** I add a character with a name, no
   description and no reference art, **Then** I am asked for at least one of the two.

### US-5: Style and plot  (priority: P1)
As a storyteller, I want to pick a style preset and write my plot so that the script and the
pictures follow my story and look.

Acceptance scenarios:
1. **Given** a project, **When** I choose one of the presets manga, noir, western comic,
   watercolor or line-art and save a plot, **Then** both are saved and shown when I return.

### US-6: Generate and edit the script  (priority: P1)
As a storyteller, I want the app to write a script from my plot, characters and style, and to
edit it, so that I control what the comic says before any picture is made.

Acceptance scenarios:
1. **Given** a project with a plot and at least one character, **When** I generate a script for a
   chosen number of pages, **Then** I see pages made of panels, each with a description,
   dialogue lines with speakers, and an optional caption.
2. **Given** a script, **When** I edit a panel's description, dialogue or caption and save,
   **Then** the change is kept, and saving an out-of-date copy is refused instead of
   overwriting newer edits.

### US-7: Render panels  (priority: P1)
As a storyteller, I want to render all panels (or only some) in the background and see progress
so that I can keep working while pictures are made.

Acceptance scenarios:
1. **Given** a script, **When** I start a render, **Then** I immediately see a job with a status
   and a count of finished panels that updates until the job succeeds or fails.
2. **Given** a finished render, **When** I re-render one panel, **Then** only that panel's image
   changes.

### US-8: Read the comic  (priority: P1)
As a storyteller, I want to read the composed comic page by page so that I can see the result
with speech bubbles and captions in place.

Acceptance scenarios:
1. **Given** rendered panels, **When** I open the reader, **Then** I see page 1 with its panels
   laid out, dialogue in speech bubbles and captions in caption boxes, a text transcript of the
   page, and controls to move to the next and previous page.

### US-9: Export the comic  (priority: P1)
As a storyteller, I want to download my comic so that I can keep, print or share it myself.

Acceptance scenarios:
1. **Given** a composed comic, **When** I export, **Then** I can download each page as an SVG
   file, all pages as one archive, and open a print-ready page that prints one comic page per
   sheet through the browser's print-to-PDF.

### US-10: Delete photos and everything derived from them  (priority: P1)
As a storyteller (or on behalf of a person in a photo), I want to delete a photo so that the
photo and every image made from it are gone.

Acceptance scenarios:
1. **Given** a photo character with rendered panels, **When** I delete one of its photos,
   **Then** the photo and the rendered panel images that show that character are deleted and
   those panels are marked as needing a new render.
2. **Given** a project, **When** I delete the project, **Then** all of its photos, reference art
   and rendered images are deleted.

### US-11: Protect real people from harmful depictions  (priority: P1)
As a person whose photo was uploaded, I want the service to refuse sexual, violent-harm or
defamatory comics about me so that my likeness cannot be used to hurt me.

Acceptance scenarios:
1. **Given** a real-photo project, **When** the plot, a script edit or a panel to be rendered
   describes a sexual, violent-harm or defamatory scenario, **Then** the request is refused with
   an explanation and nothing is generated.
2. **Given** an invented-characters project, **When** the plot describes a fictional fight,
   **Then** the request is not refused by the real-person rule.

### US-12: Operator chooses providers  (priority: P2)
As the operator, I want to choose the language model and image generator by configuration so
that I can run on hosted services, on my own hardware, or fully offline with stand-ins.

Acceptance scenarios:
1. **Given** no provider configuration, **When** the service starts, **Then** it uses the
   deterministic stand-ins and the whole flow works with no network.
2. **Given** a provider is selected but its required settings are missing, **When** the service
   starts, **Then** it refuses to start and names the missing setting.

## 3. Functional requirements

Accounts and sessions
- **FR-001**: The system MUST let a person create an account with an email address and a
  password of 10 to 200 characters; email addresses are unique regardless of letter case.
- **FR-002**: The system MUST let a person sign in and sign out; sessions expire after 14 days.
- **FR-003**: The system MUST NOT reveal whether an email address has an account when sign-in
  fails, and MUST slow repeated failed sign-ins for the same email.
- **FR-004**: The system MUST let a signed-in person delete their account, which deletes all
  their data and files.

Projects and paths
- **FR-005**: The system MUST let a signed-in person create, list, open, rename and delete their
  own projects.
- **FR-006**: The system MUST require a path choice, real photos or invented characters, when a
  project is created, and MUST NOT allow the path to change afterwards.
- **FR-007**: The system MUST return "not found" for any project, character, image, script, job
  or export that belongs to another person, and MUST NOT let a person reference another
  project's characters or images.

Characters
- **FR-008**: On the real-photo path the system MUST accept character photos only when the
  upload carries an explicit consent confirmation, and MUST record the time of that confirmation.
- **FR-009**: On the invented path the system MUST require each character to have a text
  description, reference art, or both; photos are not offered on the invented path and
  reference art is not offered on the real-photo path.
- **FR-010**: The system MUST accept only PNG, JPEG and WebP images whose content matches the
  declared type, at most 5 MB each, and at most 5 images per character.
- **FR-011**: The system MUST store photos and reference art only in private storage, MUST serve
  them only to their owner, and MUST use them only for the project they were uploaded to.
- **FR-012**: The system MUST let the owner delete a photo; deletion MUST remove the photo and
  every rendered panel image showing that character, and mark those panels as needing a new
  render.
- **FR-013**: Deleting a character or a project MUST delete its images and every derived image.

Style and plot
- **FR-014**: The system MUST offer the style presets manga, noir, western comic, watercolor and
  line-art; presets describe genres and MUST NOT name living artists.
- **FR-015**: The system MUST let the owner save a plot of up to 4,000 characters.

Script
- **FR-016**: The system MUST generate a script from the plot, characters and style, for 1 to 6
  pages chosen by the user, with 1 to 6 panels per page; each panel has a description, the
  characters present, zero or more dialogue lines with a speaker, and an optional caption.
- **FR-017**: The system MUST validate the generated script's structure and report a clear,
  retryable error when the language model returns something unusable.
- **FR-018**: The system MUST let the owner edit, add and remove pages, panels, dialogue lines
  and captions, and MUST refuse a save based on an out-of-date version.

Rendering
- **FR-019**: The system MUST render panel images as background jobs, for all panels or a chosen
  subset, and MUST report job status (queued, running, succeeded, failed) and progress.
- **FR-020**: A render job MUST record per-panel failures without losing the panels that
  succeeded, and a failed panel MUST be renderable again.
- **FR-021**: The image request for a panel MUST include the style, the panel description and the
  descriptions of the characters present, and MAY include that project's own reference images.
- **FR-022**: Real photos MUST be sent only to the self-hosted pipeline, never to a third-party
  hosted image service (owner decision, 2026-11-05).
- **FR-023**: Jobs interrupted by a restart MUST resume rather than stay "running" forever.

Composition, reader and export
- **FR-024**: The system MUST compose each page as a vector image with the panels laid out in a
  grid, dialogue in speech bubbles labelled by speaker, and captions in caption boxes; a panel
  without an image shows a neutral "not rendered yet" frame.
- **FR-025**: The reader MUST show one page at a time with next and previous controls and a text
  transcript of the page's descriptions, dialogue and captions.
- **FR-026**: The system MUST export each page as an SVG file, all pages as one archive, and a
  print-ready page with one comic page per printed sheet.

Moderation
- **FR-027**: On the real-photo path the system MUST check the plot before script generation, the
  generated script, every script edit and every panel before rendering, and MUST refuse content
  depicting the real people in sexual, violent-harm or defamatory scenarios.
- **FR-028**: Moderation MUST be replaceable by configuration, and the check used by default MUST
  work without any network service.

Providers and operations
- **FR-029**: The operator MUST be able to choose the script provider (hosted Claude, a local
  model server, or the stand-in) and the image provider (a hosted image service, a self-hosted
  pipeline, or the stand-in) by configuration; the stand-ins are the default.
- **FR-030**: The default image service for production is the self-hosted pipeline, on both paths.
  No third-party service is the default (owner decision, 2026-11-05).
- **FR-031**: The system MUST expose a liveness check and a readiness check that reports whether
  the database is reachable.
- **FR-032**: Usage limits per person: a render job MUST NOT exceed 36 panels. V1 is free and
  invite-only: registration MUST require an invite, and a person MUST NOT exceed 10 script
  generations and 100 rendered panels per day (owner decision, 2026-11-05). Only the 36-panel cap
  is built; the rest is tracked in `docs/product/OPEN-ITEMS.md`.
- **FR-033**: Account eligibility: the minimum age is 18, confirmed at registration. On the
  real-photo path, a photo of a minor MAY be uploaded only by that minor's parent or legal
  guardian, confirmed with the upload (owner decision, 2026-11-05; on 2026-11-08 the owner chose to
  allow it without waiting for legal advice). Specified in spec 002; tracked in `docs/product/OPEN-ITEMS.md`.
- **FR-034**: Retention: a project with no activity for 90 days MUST have its photos and every
  image derived from them deleted automatically, after warning its owner at least 14 days before.
  Scripts and invented characters are kept until the owner deletes them (owner decision,
  2026-11-05; the 14-day notice is a proposed value). Not built yet; tracked in
  `docs/product/OPEN-ITEMS.md`.
- **FR-035**: The system MUST expose operational metrics without sign-in and without personal
  data: the release, uptime, total requests, total server errors, and the numbers of queued,
  running and failed render jobs. Counters start again from zero when the service restarts.
- **FR-036**: The operator MUST be able to switch risky capabilities off without a new
  release: the real-photo path and panel rendering each have a switch, both on by default. With
  the real-photo path off, new real-photo projects, photo uploads, and script generation and
  rendering for real-photo projects are refused with a clear message, while reading, exporting
  and deleting existing data keeps working. With rendering off, new render jobs are refused.

## 4. Non-functional requirements

- **NFR-001**: Accessibility: every page meets WCAG 2.2 AA; every control is reachable by
  keyboard and has an accessible name; automated accessibility scans of the main pages report
  zero violations.
- **NFR-002**: Privacy: logs contain no passwords, session secrets, image bytes or plot text;
  photos are never readable without the owner's session.
- **NFR-003**: Offline: with no provider configured, the full flow from sign-up to export works
  with no network access.
- **NFR-004**: Responsiveness: with the stand-ins, every request other than export completes in
  under 500 ms at the 95th percentile on a developer laptop; status updates for a render appear
  within 2 seconds of a panel finishing.
- **NFR-005**: Observability: every request and job writes one structured log line with a request
  id; every error records the release version.
- **NFR-006**: Security: passwords are stored only as salted slow hashes; session cookies cannot
  be read by scripts or sent on cross-site requests.
- **NFR-008**: Data changes are append-only and backward compatible (expand, then contract);
  any destructive change is explicitly marked so release automation can hold it for review.
- **NFR-007**: Visual design: interface colours, spacing and type come only from the design tokens;
  placeholders are neutral shapes and labels, never generated imagery.

## 5. Key entities

- **Account**: an email and a password secret; owns sessions and projects.
- **Session**: a signed-in period for one account, with an expiry.
- **Project**: belongs to one account; has a title, a fixed path (real photos or invented), a
  style preset, a plot, at most one script, characters, render jobs and panel images.
- **Character**: belongs to one project; has a name, an optional description and images.
- **Character image**: a photo (real-photo path, with a consent time) or reference art
  (invented path); belongs to one character.
- **Script**: belongs to one project; a version number and an ordered list of pages, each an
  ordered list of panels (description, characters present, dialogue lines, caption).
- **Render job**: belongs to one project; a status, the panels requested and per-panel results.
- **Panel image**: the latest rendered image for one panel, with the characters it shows.

## 6. Out of scope

- The local desktop app (future work in the owner's plan; not in the factory's product line).
- Payments, plans and billing.
- Public sharing, publishing, comments or collaboration on comics.
- Training or fine-tuning any model on user photos or reference art.
- Face recognition or automatic verification of consent or identity.
- Mobile apps; interface languages other than English.
- Generating interface assets with image generation services.

## 7. Success criteria

- **SC-001**: An automated end-to-end test completes the invented-characters flow from sign-up
  to an exported comic with no network.
- **SC-002**: An automated test shows that one account cannot read, change or delete another
  account's project, characters, images, script, jobs or exports.
- **SC-003**: An automated test shows that a photo upload without consent is refused and that
  deleting a photo removes the photo and its derived images from storage.
- **SC-004**: Accessibility scans of the sign-in, project list, project, reader and export pages
  report zero WCAG 2.2 AA violations.
- **SC-005**: In a pilot, at least 70% of users who start a project export a comic in their first
  session (target proposed in the PR/FAQ; the owner confirms).

## 8. Review checklist
- [x] No implementation details (languages, frameworks, APIs)
- [x] Every requirement is testable and unambiguous
- [x] Every user story has acceptance scenarios
- [x] Success criteria are measurable
- [x] No clarification markers remain (FR-022, FR-030, FR-032, FR-033, FR-034 decided 2026-11-05)
