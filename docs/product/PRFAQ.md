---
artifact: prfaq
product: Ink Dimensions
status: draft            # draft | approved | killed
approved_by: ""          # GitHub login of the approving human
approved_on: ""          # YYYY-MM-DD
---

# Ink Dimensions — press release and FAQ

Working backwards (spec §10.5, LIFE-10): the announcement for the finished web v1, written
first. Everything below the press release is the honest version. The owner decides the kill
gate at the end; this draft does not.

## Press release

**Headline.** Ink Dimensions turns your own characters, your plot and a style you pick into a
finished comic you can read, print and share.

**Subheading.** For people who have a story to tell but cannot draw: describe the story, bring
your characters, and get laid-out comic pages with panels, speech bubbles and captions.

**Problem.** "I have a story for my nephew's birthday, starring him and his dog, but I can't
draw and I don't want to spend a week in a design tool." Today people either pay an
illustrator, wrestle with general image generators one picture at a time (with characters that
look different in every image and no page layout), or give up.

**Solution.** Ink Dimensions is a web app that guides a comic project from start to finish. At
the start you choose one of two paths and stay on it: build the cast from **real photos** (with
the subject's permission, which you confirm explicitly) or from **invented characters** that you
describe in words and optional reference art. You write the plot and pick a style preset
(manga, noir, western comic, watercolor or line-art). An AI language model writes the script —
pages, panels, descriptions, dialogue and captions — which you can edit freely. Panels are then
rendered by an image generator, and Ink Dimensions composes the pages with speech bubbles and
captions, ready to read on screen, download as SVG files, or print to PDF from the browser.

**Quote from the team (fictional, for illustration only).** "We kept meeting people with great
stories and no way to draw them. Ink Dimensions does the parts that need a trained hand and
leaves the storytelling to you." — fictional team spokesperson

**How it works.**
1. Create a project and choose your path: real photos or invented characters.
2. Add your characters: upload photos with a consent confirmation, or describe them and add
   reference art.
3. Write the plot and pick a style preset; generate a script and edit it.
4. Render the panels and watch their progress; regenerate the ones you do not like.
5. Read the finished comic, then export SVG pages or a print-ready page for PDF.

**Customer quote (fictional, for illustration only).** "I made a six-page noir comic about our
cat's 'investigation' of the missing biscuits in an evening. My kids keep asking for sequels."
— fictional customer

**Call to action.** Sign up with an email address, start a project, and choose your path.

## External FAQ (customers)

| Question | Answer |
|---|---|
| Do I need to know how to draw? | No. You describe characters and the story; the app writes the script and renders the panels. |
| What is the difference between the two paths? | The real-photo path uses photos of real people as the character source; the invented path uses text descriptions and optional reference art. You choose once per project. |
| Can I use photos of other people? | Only with their permission. You must confirm consent for every upload. Photos are used only for that project, and some story content (sexual, violent-harm or defamatory scenes) is refused for real people. |
| Where are my photos kept and how do I delete them? | In the service's own storage, never in a public bucket. You can delete a photo at any time; deleting it also deletes the panel images derived from it. Deleting a project or your account deletes everything in it. |
| Can I edit the script? | Yes: every panel's description, dialogue and caption is editable before rendering. |
| How do I get my comic out? | Download each page as an SVG file (or all pages as a ZIP), or open the print-ready page and use the browser's "Print to PDF". |
| Which AI models are used? | Script writing uses Claude or a locally hosted open model; images come from a hosted image API or a self-hosted pipeline, as configured by the operator. |
| Is there a desktop app? | Not yet. A local desktop app is planned future work and is not part of web v1. |
| What does it cost? | Not decided yet (see the internal FAQ). |

## Internal FAQ (us)

| Question | Answer |
|---|---|
| Who exactly is the first customer? | Not yet named by the owner. Working hypothesis: hobbyist storytellers making personal, non-commercial comics (gifts, family stories, small creative projects). The owner should name a real first customer or a test group of 5 people before approval. |
| What is the smallest version worth shipping (v1)? | Web app only: email/password accounts, projects with the path choice, characters per path (consent-gated photo upload or text plus reference art), five style presets, plot input, LLM-generated editable script, asynchronous panel rendering, SVG page composition with bubbles and captions, an on-screen reader, SVG/ZIP and print-ready HTML export. |
| What is explicitly out of scope for v1? | The local desktop app; payments and plans; sharing or publishing comics publicly; collaboration; mobile apps; fine-tuning or training models on user photos; custom style training; automatic face recognition or likeness checking; languages other than English in the UI. |
| Which external services does it depend on, and what happens when they fail? | An LLM provider (Anthropic Claude over HTTPS, or a local OpenAI-compatible server) for scripts; an image generator (a hosted HTTPS API or a self-hosted ComfyUI-style pipeline) for panels; PostgreSQL. Every provider sits behind an interface with a deterministic twin, so the product runs end to end with no network and no keys. When a live provider fails, script generation returns an error the user can retry, and a render job marks the failed panels so they can be re-rendered. |
| What are the legal, privacy and safety risks? | (1) **Real-person likeness**: depicting real people can harm them (deepfake-style misuse, harassment, defamation). Mitigation: explicit per-upload consent, a moderation interface that refuses sexual, violent-harm and defamatory scenes for real people, photos used only within one project. The v1 rule-based check is a floor, not a guarantee; it is keyword-based and can be evaded. (2) **Consent**: we cannot verify that consent was really given; we record the user's confirmation and timestamp only. (3) **Photos as personal (and possibly biometric) data**: stored privately with deletion that cascades to derived images; sending photos to a third-party hosted image API is a data transfer that needs the owner's decision and a privacy notice. (4) **Copyright of styles**: presets describe generic genres, not named living artists; image models may still reproduce protected characters or a recognisable artist's style, and the legal position on model outputs is unsettled. (5) **Provider costs**: every script and every panel costs money on hosted providers; a six-page comic is roughly 30 image generations plus retries. No pricing or quota is decided yet, so cost per comic is unbounded beyond a per-job panel cap. (6) **Minors**: photos of children are the most sensitive case and no age policy is decided. Proposed risk owner for all of the above: the product owner, pending confirmation. |
| How will we know it works (success metrics, with numbers)? | Proposed, for the owner to confirm: (a) at least 70% of test users who start a project export a comic in their first session; (b) median time from new project to exported comic under 20 minutes with live providers; (c) zero confirmed incidents of a real person depicted in a refused category during the pilot; (d) 100% of photo-deletion requests remove the photo and its derived images (verified by an automated test and a monthly storage audit). |
| What would make us stop (kill criteria)? | Proposed: fewer than 30% of pilot users export a comic; provider cost per exported comic above a ceiling the owner sets; a real-person misuse incident that the consent and moderation design cannot prevent; legal advice that the real-photo path cannot be offered in the target market. |
| Does it fit the factory's product line (`docs/factory/PRODUCT-LINE.md`)? | Yes for the web v1: a TypeScript web application with a React front end, an HTTP API and PostgreSQL. The desktop app does not fit the product line and is excluded. |

## Kill gate

```
KILL_GATE:
  fits_product_line: yes
  first_customer_named: no
  v1_scope_bounded: yes
  external_dependencies_have_fallbacks: yes
  risks_have_owners: no
  success_metric_measurable: yes
DECISION: proceed | revise
```

A human sets `DECISION`. Any `no` above means `revise` or `kill`. The decision, with the date,
goes into `docs/factory/DECISIONS.md`; killed briefs are kept (the kill rate is a metric, §10.5).
Two criteria are `no` in this draft only because they need the owner: naming a first customer
and accepting ownership of the listed risks.
