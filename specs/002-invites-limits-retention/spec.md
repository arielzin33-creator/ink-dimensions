---
artifact: spec
id: 002-invites-limits-retention
product: Ink Dimensions
status: draft            # draft | approved
approved_by: ""
approved_on: ""
constitution: docs/product/CONSTITUTION.md
---

# Spec 002: Invites, daily limits, age checks and photo retention

What and why only. This builds what the owner decided for spec 001's FR-032, FR-033 and FR-034
on 2026-11-05. Requirement numbers start at 101 so they cannot be confused with spec 001's.

## 1. Problem and users

**The owner, as operator.** V1 is free and invite-only, and each generation costs real money and
compute. The owner needs to control who can join and to cap what one person can use.

**Storytellers.** They need clear limits, a clear refusal when they reach one, and fair notice
before their photos are deleted.

**People in the photos, including children.** They should not stay on the service indefinitely
after a project is abandoned. A photo of a child may be uploaded only by that child's parent or
legal guardian.

## 2. User stories

### US-1: Join by invitation  (priority: P1)
As a person invited by the owner, I want to create an account with my invitation, so that only
invited people can use the service.

Acceptance scenarios:
1. **Given** a valid invitation for my email, **When** I sign up with that email and confirm I am
   18 or over, **Then** I am signed in and the invitation can't be used again.
2. **Given** no invitation, or one that is expired, revoked, already used or for another email,
   **When** I try to sign up, **Then** I am refused with one message that does not say which of
   these applies, and no account is created.
3. **Given** a valid invitation, **When** I sign up without confirming I am 18 or over, **Then** I
   am refused and the invitation stays usable.

### US-2: Manage invitations  (priority: P1)
As an administrator, I want a page where I create, see and revoke invitations, so that I decide
who joins.

Acceptance scenarios:
1. **Given** I am an administrator, **When** I enter an email, **Then** I get an invitation link
   to copy, shown only that once.
2. **Given** an unused invitation, **When** I revoke it, **Then** its link stops working.
3. **Given** I am not an administrator, **When** I request the invitations page or its data,
   **Then** I am told it does not exist.
4. **Given** a new installation with no administrator, **When** the operator has set a one-time
   setup code and someone signs up with it, **Then** that account becomes the administrator and
   the code never works again.

### US-3: Daily limits  (priority: P1)
As the operator, I want each person limited per day, so that one person can't run up the cost.

Acceptance scenarios:
1. **Given** I have used 10 script generations today, **When** I generate another, **Then** I am
   refused with a message saying when the limit resets, and my existing script is unchanged.
2. **Given** I have 5 panels left today, **When** I request a job of 6 panels, **Then** the job is
   refused and the message says I have 5 left.
3. **Given** a panel fails to render, **When** the job ends, **Then** that panel does not count
   against my limit.

### US-4: Confirm who is in a photo  (priority: P1)
As a person uploading a photo, I want to state whether it shows a minor, so that a child's photo
is only ever uploaded by their parent or legal guardian.

Acceptance scenarios:
1. **Given** a real-photo project, **When** I upload a photo without stating whether it shows a
   minor, **Then** the upload is refused.
2. **Given** photos of minors are switched on, **When** I upload a photo of a minor and confirm I
   am their parent or legal guardian, **Then** it is stored with that confirmation recorded.
3. **Given** photos of minors are switched off, which is the default, **When** I upload a photo of
   a minor, **Then** the upload is refused with a clear message.

### US-5: Warning before photos are deleted  (priority: P1)
As a storyteller, I want to be warned before an idle project loses its photos, so that I can keep
them or save my comic first.

Acceptance scenarios:
1. **Given** a project with photos and no activity for 76 days, **When** the retention check runs,
   **Then** I am emailed, and the project shows the date its photos will be deleted.
2. **Given** I was warned, **When** I open the project before that date, **Then** the deletion is
   cancelled and the 90 days start again.
3. **Given** the warning email could not be sent, **When** the 90 days pass, **Then** nothing is
   deleted until a warning has been sent and at least 14 days have gone by.

### US-6: Idle photos are deleted  (priority: P1)
As a person in a photo, I want an abandoned project's copy of my photo to be deleted, so that it
does not stay on the service indefinitely.

Acceptance scenarios:
1. **Given** a project idle for 90 days and warned at least 14 days ago, **When** the retention
   check runs, **Then** its photos and every image derived from them are removed from the database
   and from storage.
2. **Given** that deletion has run, **When** the owner opens the project, **Then** the script and
   text are still there and the affected panels show as not rendered.
3. **Given** a production system with no real email service configured, **When** the retention
   check would run, **Then** it does nothing and says so in the logs.

## 3. Functional requirements

Invitations
- **FR-101**: Registration MUST require a valid invitation. An invitation is for one email, works
  once, and expires 14 days after it is created.
- **FR-102**: Every refused invitation MUST give the same message, whatever the reason.
- **FR-103**: Invitation secrets MUST NOT be stored or logged in readable form, and MUST be shown
  only when the invitation is created.
- **FR-104**: An administrator MUST be able to create, list and revoke invitations on a page in
  the app. The list shows email, status, and created and expiry dates. People who are not
  administrators MUST get the same response as for a page that does not exist.
- **FR-105**: An invitation MUST NOT be created for an email that already has an account or a live
  invitation.
- **FR-106**: The operator MUST be able to set a setup code, by configuration, that creates the
  first administrator. It MUST stop working as soon as any administrator exists.
- **FR-107**: Open registration MAY be switched on for local development and tests. Start-up MUST
  fail if it is switched on in production.
- **FR-108**: Used, expired and revoked invitations MUST be deleted 30 days after they stop being
  usable. An invitation used by an account MUST be deleted when that account is deleted.

Age and guardians
- **FR-109**: Registration MUST require a confirmation that the person is 18 or over, and MUST
  record when it was given.
- **FR-110**: Every photo upload MUST state whether the photo shows a minor. A photo of a minor
  MUST also carry a confirmation that the uploader is the minor's parent or legal guardian, and
  the system MUST record when it was given.
- **FR-111**: Photos of minors MUST be refused unless the operator has switched them on. They are
  off by default, because legal advice is required before this reaches anyone but the owner.

Daily limits
- **FR-112**: A person MUST NOT exceed 10 script generations and 100 rendered panels per day. A
  day is a calendar day in UTC.
- **FR-113**: A request that would exceed a limit MUST be refused whole, with a message that says
  what remains and when the limit resets. Limits MUST hold when requests arrive at the same time.
- **FR-114**: A script generation or panel that fails MUST NOT count. A request refused by
  moderation MUST NOT count.
- **FR-115**: Deleting a project MUST NOT give back used allowance. Usage records MUST be deleted
  with the account.

Warnings
- **FR-116**: The system MUST be able to send email through a replaceable service, and MUST work
  with no network and no email service in local development and tests.
- **FR-117**: A project MUST show the date its photos will be deleted from the time its owner is
  warned, on the project list and on the project page.
- **FR-118**: A warning email MUST go to the account's email and link to the service. It MUST NOT
  contain project titles, plots, character names or images. An owner gets at most one email per
  retention check.

Retention
- **FR-119**: Activity on a project means its owner opening, changing, rendering or exporting it.
  Signing in or viewing the project list alone is not activity.
- **FR-120**: A project with photos and no activity for 76 days MUST trigger a warning. New
  activity MUST cancel the warning and restart the 90 days.
- **FR-121**: A project MUST lose its photos and every image derived from them only when it has
  been idle for 90 days and a warning was sent at least 14 days earlier. A project with a queued or
  running render job MUST be skipped.
- **FR-122**: Scripts, text, invented characters, reference art and images not derived from a photo
  MUST be kept until their owner deletes them.
- **FR-123**: In production, the retention check MUST do nothing unless a real email service is
  configured, and MUST log that it is off.
- **FR-124**: The operator MUST be able to pause the retention check without a new release, as a
  switch that is on by default.
- **FR-125**: The operator documentation MUST explain how to clear the self-hosted image server's
  own copies of images, because the app can't delete those itself.

## 4. Non-functional requirements

- **NFR-101**: Accessibility: the new and changed pages meet WCAG 2.2 AA, and automated scans
  report zero violations.
- **NFR-102**: Privacy: logs contain no invitation secrets, setup code, email addresses or email
  bodies.
- **NFR-103**: Offline: with no provider configured, the full flow still works with no network.
- **NFR-104**: Data changes are backward compatible, as in spec 001's NFR-008.
- **NFR-105**: Safety: a failed or interrupted retention check never deletes anything unwarned, and
  is safe to run again.

## 5. Key entities

- **Invitation**: one email, a hidden secret, who created it, its expiry, and when it was used or
  revoked.
- **Administrator**: an account allowed to manage invitations. It gives no access to anyone's
  projects.
- **Daily usage**: for one account and one UTC day, the script generations and panels used.
- **Age confirmation**: when an account confirmed it is 18 or over.
- **Guardian confirmation**: on a photo, whether it shows a minor and when the uploader confirmed
  being a parent or legal guardian.
- **Project activity**: when a project was last active and when its owner was last warned.

## 6. Out of scope

- Choosing an email vendor. Until one is configured, auto-deletion stays off in production.
- Sending invitations by email. The administrator copies the link and shares it themselves.
- Bounce handling. A warning counts as sent when the email service accepts it.
- Verifying age or identity, or detecting minors in photos. These rest on self-declaration.
- More than one administrator role, or any administrator access to user content.
- Paid plans or limits that vary per person.

## 7. Success criteria

- **SC-101**: Automated tests show that sign-up without a valid invitation creates no account, and
  that one invitation used by two simultaneous sign-ups creates one account.
- **SC-102**: Automated tests show that simultaneous requests can't exceed either daily limit.
- **SC-103**: Automated tests show that a photo of a minor is refused without the guardian
  confirmation, and refused while the switch is off.
- **SC-104**: An automated test with a fixed clock shows the sequence warning, then deletion, with
  the photo and derived images gone from storage and the script kept. Other tests show no deletion
  when the warning failed, when activity intervened, or in production with no email service.
- **SC-105**: Accessibility scans of the sign-up and invitations pages report zero violations.

## 8. Review checklist
- [x] No implementation details (languages, frameworks, APIs)
- [x] Every requirement is testable and unambiguous
- [x] Every user story has acceptance scenarios
- [x] Success criteria are measurable
- [x] No clarification markers remain
