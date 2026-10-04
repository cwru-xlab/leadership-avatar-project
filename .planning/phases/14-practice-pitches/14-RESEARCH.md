# Phase 14: Practice Pitches - Research

**Researched:** 2026-10-02
**Domain:** Deck upload/rendering pipeline + engine-config pitch types, built on the (unexecuted) Phase 13 one-on-one conversation engine
**Confidence:** MEDIUM — HIGH for everything that binds to Phase 13's plan contracts and the existing codebase; LOW/MEDIUM for the PPTX-rendering recommendation, which rests on WebSearch rather than a working local trial (Phase 13 is unexecuted, so nothing here could be verified end-to-end).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Elevator pitch framing**
- What is pitched: free text, typed by the student in the pre-session wizard ("what are you pitching?"). No category list. Injected into the avatar's session-constant prompt.
- Listener knowledge — three student-selected levels at setup: (1) completely blind — persona hidden, discovered in conversation; (2) name and role only; (3) full profile shown beforehand. This is a wizard-level student choice, NOT derived from Phase 8's difficulty parameter and NOT a scenario-record property.
- Timing: visible timer, soft cutoff at 60s — avatar shows impatience / may interrupt in dialogue past 60s, nothing hard-stops the student's turn.
- Timer visibility: hideable mid-session (collapsible), visible by default, toggle lives in the session not just the wizard.
- Follow-up phase: engagement-scaled and open-ended, no fixed count/duration.

**Avatar disengagement and early end**
- Signalling: in dialogue only (shorter/flatter replies, "so what's the ask?"). NO engagement meter, no gauge, no explicit verbal time-warning beat.
- Trigger: avatar's own judgment, licensed in the prompt, gated by a floor (pitch + at least one exchange minimum) so every session yields gradeable material. Not engine-side behavioral thresholds.
- Report presentation: BOTH a named outcome banner (reasons + timecode) AND every rubric dimension still scored on what did happen — no zeroing, no error/crash rendering.
- Scoring interaction: an early end caps the discovery/tailoring dimension (ceiling, not zero); other dimensions unaffected.

**Deck intake (PDF + PPTX only — Google Slides cut permanently)**
- No Drive OAuth scope, no stored Drive tokens, no Drive API read, ever (not deferred).
- Validation: minimum only — genuine PDF/PPTX within size limit, pages/slides extract. Do NOT reject on page shape (portrait/landscape) or slide count.
- Rejection message: specific reason + fix (e.g. "this file isn't a readable PDF — re-export and try again"). No generic failure, no "start without a deck" escape hatch, no soft per-slide warning tier.
- Slide rendering: server-rendered images, same path for PDF and PPTX. Each slide rasterized server-side to a privately stored image, served to the student's in-session viewer. Per-slide extracted text is what reaches the avatar's context.

**Live deck session**
- Context gating: HIGH-WATER MARK. Avatar's context contains every slide ever shown (not just 1..current). Backward navigation never un-shows what was already revealed.
- Controls: next/back plus a thumbnail strip for jumping. Jumping forward reveals skipped slides (advances high-water mark). Backward jumps are free.
- Negotiation target — BOTH: student declares ask (price+equity) up front, AND the scenario carries a hidden fair-value band. Report shows ask vs. settled vs. fair.
- Time envelope: SOFT. 20-30 min budget is guidance; overrun is noted in the report, no hard finish, no in-character meeting close.
- Session length: derived from slide count within the 20-30 min envelope as a proposal, student-adjustable before start.
- Deck scoring, all three: deck-only structure/text-density dimensions (from extracted text); slide/speech correlation; visual review of rendered slide images by the evaluator (appearance, not just word counts).

**Rubric dimensions declared in config**
- Elevator pitch carries "listener discovery & tailoring" as its OWN rubric dimension, separate from concision/delivery, scored at all three knowledge levels.
- Visual/vocal/body metrics arrive via the engine with no per-type wiring (Phase 13 criterion 4) — not re-decided here.

### Claude's Discretion
- Exact wording of avatar disengagement dialogue cues and the prompt language licensing an early end.
- The precise shape of the "floor" before an early end is permitted.
- Slide image format, resolution and private storage key scheme.
- PPTX → per-slide text and image conversion mechanics.
- How the ask/settled/fair triple is laid out on the report.
- Thumbnail strip layout and how the high-water mark is indicated (if at all) in the student's viewer.
- Concrete text-density and structure thresholds for deck scoring.

### Deferred Ideas (OUT OF SCOPE)
- Nothing deferred from Google Slides — cut PERMANENTLY, not deferred. If revived, it is a new phase.
- Engagement meter / visible disengagement indicator — rejected on design grounds, not deferred.
- Hard time cutoffs (turn-level 60s, session-level 30min) — rejected in favor of soft enforcement, not deferred.

</user_constraints>

<phase_requirements>
## Phase Requirements

No REQ IDs have been assigned to Phase 14 in `.planning/REQUIREMENTS.md` as of this research (confirmed by grep — only a forward-reference from Phase 13's REQUIREMENTS entry noting "Phase 14 is its first consumer"). The planner should derive/assign REQ IDs from ROADMAP.md's five Phase 14 success criteria and 14-CONTEXT.md's locked decisions; this document's sections below are organized so each maps cleanly to one or more of those five criteria.

| Roadmap Success Criterion | Research Support |
|----|-------------|
| 1. Elevator pitch 30-60s soft window; engagement from concision/common-ground; early end as recorded failure | "Elevator Pitch: Binding to Phase 13 Primitives" section; `terminationPolicy`, `timeBudget`, rubric sections |
| 2. PDF/PPTX → per-slide text + server-rendered images, private storage; bad file rejected with reason+fix | "Deck Intake Pipeline" section (the phase's core new infrastructure) |
| 3. Live slide navigation; avatar context = high-water-mark only | "Visible-Context Slice as the High-Water Mark" section |
| 4. Report scores deck structure/text-density/visual appearance + vocal delivery; negotiation outcome ask/settled/fair | "Rubric Dimensions and Evaluator Image Input" + "Negotiation Outcome Record" sections |
| 5. Session length proposed from slide count in 20-30min envelope, adjustable; time visible/hideable | "Time Budget and Session Length Proposal" section |

</phase_requirements>

## Summary

Phase 14 is almost entirely genuinely-new infrastructure wrapped around a thin layer of Phase-13 engine configuration. The elevator pitch sublayer is close to "config plus prompts" as promised — it binds cleanly to `terminationPolicy` (avatar-initiated end, floor-gated), `timeBudget` (soft 60s turn cutoff expressed as tail-block content, not a hard stop), and a new rubric extra dimension (`discovery_tailoring`). It needs no new routes, no new storage, and no new UI beyond a wizard step for "what are you pitching" and "listener knowledge level." The investor pitch-deck sublayer is the opposite: deck upload, server-side rasterization of both PDF and PPTX into per-slide images, private image storage AND a new authenticated image-serving route (nothing in the codebase today serves a private binary asset back to its owner — resume PDFs are stored privately but only their extracted *text* ever leaves the server), a live-navigation UI with a thumbnail strip, and a negotiation-outcome extraction step. None of that exists in any form in Phase 13's plans, and Phase 13's `visibleContext` primitive, while modeled generally enough to carry a high-water-mark cursor, has no code today that knows what a "slide" or a "cursor" actually is — Phase 14 is the first and only consumer, so the cursor semantics and the channel shape must be designed here.

The single highest-risk unknown is **PPTX → rendered slide image, server-side, on Vercel.** Pure-JS PPTX text extraction (unzip + XML) is straightforward and should NOT be hand-rolled from scratch conceptually but is simple enough to write directly (no mature, maintained npm library does this reliably — see Don't Hand-Roll). Faithful PPTX *rendering* to an image has no pure-JS answer; the only high-fidelity renderer is LibreOffice headless, and bundling that inside a Vercel Function is a real architectural decision this research could not resolve by trial (Phase 13 — the engine this deck session would run on — has not been executed, so there is no running app to test against). The second-highest risk is the prefix-cache tension: every slide advance grows the avatar's visible-context text, and Phase 13's `buildTailBlock`/tail-only discipline is exactly the mechanism that must carry it, but Phase 13's plans model the visible-context slice as a *filter over existing session state*, not as *appended per-turn text*, so Phase 14 needs to decide how slide text actually enters the conversation (most likely: appended to the tail block as new slides are revealed, which is consistent with Phase 13's rules but is not spelled out anywhere in the 13-xx plans).

**Primary recommendation:** Build the deck pipeline as two independently-swappable stages — (1) PPTX→PDF conversion via a small external conversion step (do not bundle LibreOffice inside the Next.js/Vercel function; call out to a dedicated conversion service), and (2) PDF-page→PNG rasterization in-process using `pdfjs-dist` + `@napi-rs/canvas`, which then also serves the PDF-native upload path. Extract per-slide/per-page text in parallel: PPTX text via pure-JS zip+XML (no new heavy dependency), PDF text by extending the existing `pdf2json`-based `extractTextFromPDF` to return a per-page array instead of one joined string (today it already iterates `pdfData.Pages` — this is a small, low-risk change, not new infrastructure).

## Standard Stack

### Core (already in package.json — reuse, do not replace)
| Library | Version | Purpose | Why Standard (here) |
|---------|---------|---------|--------------|
| `pdf2json` | ^4.0.2 (4.0.2 installed) | PDF text extraction | Already used by `lib/rag/document-processor.ts`'s `extractTextFromPDF`; already iterates `pdfData.Pages` per page — the per-slide text requirement is a restructuring of existing code, not a new dependency. |
| `openai` | ^6.32.0 (6.32.0 installed) | Evaluator LLM calls | Already the only LLM client in the evaluator modules (`lib/interview/evaluation.ts`, `lib/scenario/evaluation.ts`), via `openai.chat.completions.create`. Vision input is a message-content-shape change on the SAME client, not a new dependency. |
| `@aws-sdk/client-s3` | ^3.1014.0 | Private object storage | Already the only storage client (`lib/s3-client.ts`); slide images are additional private objects under a new prefix, same client. |
| `@vercel/functions` | ^3.4.3 | `waitUntil` background work | Already used by the finish/evaluation-runner pattern; no new dependency needed for deferred rasterization if it is kept inside the synchronous upload request (see Pitfalls — rasterization should NOT be deferred to `waitUntil` because the student needs images back before they can use the live viewer). |

### Supporting (new, recommended)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pdfjs-dist` | latest 4.x (legacy Node build, `pdfjs-dist/legacy/build/pdf.mjs`) | PDF page → image rasterization | For rendering a PDF page to a canvas/PNG server-side. `pdf2json` extracts text only; it cannot rasterize. This is the standard Node-side PDF renderer (Mozilla's own project) and is what most serverless PDF-to-image pipelines use. |
| `@napi-rs/canvas` | latest 0.1.x | Canvas backend for `pdfjs-dist` rendering, PNG encoding | Prebuilt native binaries per-platform (including linux-x64-gnu, which matches Vercel's Node runtime), smaller and more serverless-friendly than the legacy `canvas` package (`node-canvas`), which has historically been troublesome to install/run inside AWS-Lambda-style serverless environments. Confidence: MEDIUM — this is a WebSearch-informed recommendation, not Context7/official-doc verified; validate the actual prebuilt binary matches Vercel's Node ABI before committing, in a spike plan. |
| `jszip` | latest 3.x | Unzip a `.pptx` (which is a ZIP container) to reach `ppt/slides/slideN.xml` | PPTX is OOXML — a ZIP of XML parts. No parsing library is needed beyond unzip + a small XML text-run extractor; `jszip` is the standard pure-JS unzip and has no native deps, so it is safe in any Vercel runtime. |
| `fast-xml-parser` | latest 4.x | Parse `slideN.xml` to text runs | Pure JS, no native deps, widely used for exactly this (extracting `<a:t>` text nodes from OOXML). Alternative: hand-rolled regex extraction of `<a:t>...</a:t>` is also viable given the narrow need (plain text only, no formatting) — acceptable to avoid the dependency if the planner prefers fewer libraries; flag as a discretion item. |

### Alternatives Considered (PPTX → rendered slide IMAGE — the hard problem)
| Option | Tradeoff |
|--------|----------|
| **LibreOffice headless bundled as a Vercel "Large Function" (5GB uncompressed bundle, opt-in)** | Highest fidelity (same renderer PowerPoint-compatible tools use). Vercel Functions now support up to 5GB uncompressed bundles and up to 300s default / 800s Pro-plan max duration (MEDIUM confidence, WebSearch — see Sources), which makes this newly plausible where it wasn't a year or two ago. But: no official, maintained npm package bundles a working static LibreOffice binary for Vercel's exact Node/Linux runtime; prior art is almost all AWS Lambda custom-layer work (`shelf-io`'s LibreOffice-in-Lambda writeups) that would need porting; cold starts measured in multiple seconds are typical; font availability inside a minimal bundled environment is a known failure mode (slides render with wrong/missing fonts, which directly undermines the "judge slide appearance" requirement). This is a real spike, not a known-good path. |
| **Dedicated conversion microservice (self-hosted, e.g. Gotenberg or a LibreOffice+Node wrapper) on a long-lived host** | The project already runs a non-Vercel host for Postgres (AWS Lightsail, per `HANDOFF.md §3`). A small always-on conversion service there (or on a similarly cheap always-on VM) avoids bundling LibreOffice inside the Next.js deploy, avoids Vercel cold-start/binary-size risk entirely, and is the architecture most production PPTX-conversion pipelines actually use (Gotenberg is the most common open-source wrapper around LibreOffice specifically for this). Cost: a second deployable to operate; a network call with its own timeout/retry handling; the private deck crosses a second network hop (still within infra the team controls, unlike a third-party SaaS). **This is the recommended option** given the team already operates non-Vercel infrastructure and given LibreOffice-on-Vercel's unverified fragility. |
| **Third-party conversion API (CloudConvert, Zamzar, Aspose Cloud, etc.)** | Fastest to integrate, no infra to run, usually billed per conversion. Cost: sends a student's private pitch deck to an external vendor — acceptable for many SaaS products but worth a one-line disclosure/ToS decision; also a new per-conversion cost line and a new external dependency with its own outage risk. Reasonable FALLBACK if the self-hosted microservice proves to be more work than the phase budget allows. |
| **Pure-JS PPTX renderer (no native/binary dependency)** | Does not exist at production quality. No actively-maintained npm package renders arbitrary PPTX layouts (shapes, SmartArt, images, custom layouts, embedded fonts) to a faithful image purely in JS. Any such library found in a search should be treated as a toy/demo, not a dependency to adopt for "judge slide appearance" grading — rejected. |

**Installation (if the recommended stack is adopted):**
```bash
npm install pdfjs-dist @napi-rs/canvas jszip fast-xml-parser
```
(LibreOffice/Gotenberg is infra, not an npm install, if the microservice option is chosen.)

## Architecture Patterns

### Recommended module structure (new, under the engine's existing `lib/engine/` umbrella per Phase 13's own file-placement convention)
```
lib/
├── deck/
│   ├── intake.ts            # validate PDF/PPTX magic bytes + size, route to the right extractor
│   ├── pdf-extract.ts       # extend/wrap pdf2json: per-page TEXT array (restructure of extractTextFromPDF)
│   ├── pdf-rasterize.ts     # pdfjs-dist + @napi-rs/canvas: per-page PNG buffers
│   ├── pptx-extract.ts      # jszip + fast-xml-parser: per-slide TEXT array, pure JS, no conversion needed
│   ├── pptx-convert.ts      # calls the conversion microservice/API to get a PDF buffer from a PPTX buffer
│   └── types.ts             # DeckSlide { index, text, imageKey }, DeckValidationError, etc.
lib/engine/
│   ├── visible-context.ts   # (Phase 13, existing) — Phase 14 is its first real consumer; add a "slides" channel shape here or in a type-local adapter
│   └── outcome.ts           # (Phase 13, existing) — Phase 14 declares the ask/settled/fair OutcomeRecordConfig against it
app/api/practice/deck/
│   ├── upload/route.ts      # authenticated upload, validate, extract text+images, persist privately, return opaque deckId
│   └── [deckId]/slide/[n]/route.ts   # authenticated, owner-scoped image byte-serving route (NEW — no precedent in the codebase)
```

### Pattern 1: Deck upload — follow the resume-ingestion posture, but add an image-serving step the resume flow never needed
**What:** `app/api/interview/upload-resume/route.ts` is the direct precedent: authenticate, read `formData`, magic-byte check (`%PDF-` header check already exists verbatim), size cap, extract, save privately with a server-derived key (`INTERVIEW_RESUMES_PREFIX}${safeUserId}/${safeResumeId}.pdf`), return only an opaque ID plus extracted (text) — never an S3 URL.
**When to use:** Deck upload should mirror this almost exactly for the *document* object itself (store the original PDF/PPTX privately, same key-derivation discipline, same "never return a raw S3 URL" posture).
**Gap not covered by the resume precedent:** the resume flow never needs to show the PDF back to the student — only extracted text leaves the server. The deck flow DOES need to show rendered slide IMAGES to the student's in-session viewer. There is no existing route in the codebase that serves a private binary object back to its authenticated owner (avatar/profile/case-cover images are all `ACL: 'public-read'` — see `lib/s3-client.ts` `uploadAvatarImage`/`uploadProfileImage`/`uploadCaseCoverImage`). Phase 14 must build this serving route new: either (a) a per-slide authenticated byte-streaming route (`GetObjectCommand` → response body), ownership-checked the same way the report GET route is (`findFirst({id, userId})` → 404 on mismatch), or (b) short-lived S3 presigned GET URLs minted server-side per slide request. Recommend (a) for consistency with the existing "never expose a raw bucket URL" posture already established by the resume flow; presigned URLs are a discretion item if request volume/latency makes (a) too slow.
**Example (existing precedent to port from):**
```typescript
// Source: app/api/interview/upload-resume/route.ts (existing code, verified)
if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
  return response({ error: "The uploaded file is not a valid PDF" }, 400);
}
```
A PPTX magic-byte check is the ZIP signature `PK\x03\x04` (first 4 bytes) — PPTX files are ZIP containers; checking this is as cheap as the PDF header check and satisfies CONTEXT.md's "confirm it is a genuine PDF or PPTX" validation floor without needing to fully parse the file first.

### Pattern 2: Per-page/per-slide text as a restructuring of existing code, not new code
**What:** `lib/rag/document-processor.ts`'s `extractTextFromPDF` already parses `pdfData.Pages.forEach((page) => { page.Texts.forEach(...) })` and *joins* every page into one string. Phase 14 needs the per-page array this loop already walks — it is thrown away today, not absent.
**When to use:** Add a new function (`extractPerPageText` or similar in the new `lib/deck/pdf-extract.ts`) that returns `string[]` instead of joining; do not touch `lib/rag/document-processor.ts` itself (it is shared by the RAG pipeline and has its own callers — follow the same "non-interview modules stay diff-empty" discipline Phase 13's plans enforce elsewhere in this codebase).
**Confidence:** HIGH — verified by reading `lib/rag/document-processor.ts` directly.

### Pattern 3: Visible-context slice as a high-water-mark cursor over a "slides" channel — Phase 14 is the first consumer, must specify the channel itself
**What:** Phase 13's `lib/engine/visible-context.ts` (per plan 13-03) is designed as `applyVisibleContext(config, sessionState, turn)`, modeling session state as "an opaque keyed record of context channels" with "a 'progressively revealed' mode where a channel's entries are admitted only up to a cursor the session reports." The plan explicitly anticipates this ("Phase 14's 'the avatar must not reference slide 10 while the student is on slide 4' is this primitive with a cursor, not a new feature") but ships ZERO slide-specific code — it is validated only against a synthetic/generic test fixture in `scripts/verify-engine-primitives.ts`, not against a real slides channel.
**When to use:** Phase 14 must (a) define the actual shape of a "slides" context channel (almost certainly `{ index: number; text: string }[]`), (b) decide where the live high-water-mark cursor is tracked SERVER-SIDE per session (see Pitfalls — this cannot be client-supplied), and (c) decide how admitted slide text actually enters the live LLM call: Phase 13's `buildTailBlock`/`buildTurnMessages` pattern (plan 13-06) appends per-turn content to the LATEST USER MESSAGE only, never the system prompt — so the natural fit is to append the (growing) admitted-slides block to the tail, analogous to how `buildTimeBudgetFragment` already does for the time budget. This is architecturally consistent with Phase 13's rules but is not spelled out in any 13-xx plan; it is an integration task Phase 14's plan must do explicitly against `lib/engine/prompts.ts`'s `buildTailBlock`.
**Gap and integration risk:** `applyVisibleContext`'s cursor is described as something "the session reports" — meaning the SERVER session state object, not the engine config, must carry the current high-water mark per session, persisted across turns. Nothing in `lib/engine/session.ts` (plan 13-07) declares a field for this; `InteractionReport` (plan 13-02) has no column for it either. Phase 14's plan must either (i) add a narrow field for it (e.g. inside the existing `inputSnapshot`/a new `sessionState` JSON blob written at checkpoint time — the interview type already has a `checkpointSession` path that persists transcript + turnCount; the deck type would need the high-water mark persisted at the same checkpoint moments) or (ii) derive the high-water mark server-side from "every slide index the client has ever sent a 'reveal' event for," validated and monotonic, written at checkpoint. Recommend (ii) layered onto the SAME checkpoint call interview types already make (plan 13-07's `checkpointSession`), since deck sessions are the first instance-required, interview-cadence-of-checkpointing type and should get a checkpoint (unlike `case-study`, which deliberately has none) — this is itself a Phase-14-local decision, since Phase 13 locked "scenario has no checkpoint" as a preserved divergence but said nothing about future types.

### Pattern 4: Negotiation outcome record — binds to Phase 13's `OutcomeRecordConfig`/`validateOutcome`, needs a three-value money/equity shape
**What:** Plan 13-03's `lib/engine/outcome.ts` exports `validateOutcome(config, produced)` against a type's `OutcomeRecordConfig` field declarations (`unknown keys rejected, declared-kind mismatches rejected`). This is a generic field-kind validator, not money-specific.
**When to use:** Phase 14's pitch-deck type declares an `OutcomeRecordConfig` with fields for `askPrice`, `askEquityPct`, `settledPrice`, `settledEquityPct` (numbers), plus the scenario's hidden `fairValueBand` is NOT part of the produced/validated outcome (it is instance config, known before the session, not something the model "produces") — it should live on the `CaseStudy`-style INSTANCE record (per Phase 13's TYPE+INSTANCE split) alongside the deck's own slides, not in the outcome record itself. The report then displays `ask` (student-declared, captured at wizard time or turn one) vs `settled` (model-produced outcome, validated) vs `fair` (instance config, never model-controlled).
**Gap:** `validateOutcome`'s signature validates "a produced outcome against the type's declaration" at a single point in time (most naturally at finish). Phase 13 does not specify HOW a produced outcome gets FROM the conversation INTO that validation call — there is no "extract structured data from a transcript" primitive anywhere in Phase 13. The most consistent approach, given Phase 13's own evaluator architecture (plan 13-05's type-derived JSON schema, already extensible via `extraRubricDimensions`), is to extend the SAME evaluator JSON-schema-constrained call to also emit the negotiated outcome fields (not just rubric scores) in its one structured response, then run that through `validateOutcome` before persisting to `InteractionReport.outcome`. This reuses the evaluator's existing schema-constrained JSON mode rather than inventing a second extraction call — recommended, not mandated by any 13-xx plan.

### Anti-Patterns to Avoid
- **Trusting a client-reported "current slide" for context gating.** CONTEXT.md and the hard-constraint brief both call this out directly: the high-water mark MUST be server-authoritative. A client that can lie about which slide it's on can leak unseen slide content into evaluation or make the avatar reference content the student never revealed. Validate every "reveal slide N" event server-side (monotonic non-decreasing high-water mark, bounds-checked against the deck's actual slide count) before admitting it into the visible-context channel.
- **Rewriting the system prompt on every slide advance.** This is the single biggest OpenAI-prefix-cache risk in the phase. Phase 13's `assembleSystemPrompt` contract (plan 13-06) is explicit: the system prompt is built from SESSION-CONSTANT inputs only, with a dev-mode runtime guard that throws if a per-turn-looking value reaches it. Slide reveal state is PER-TURN by definition (it changes as the session progresses) and must go through `buildTailBlock`/the tail-appended user message, never through `assembleSystemPrompt`. See Common Pitfalls below for the deeper tension this creates.
- **Treating `deck_quality`/`negotiation` as sub-points of `content` instead of first-class rubric dimensions.** Phase 13 explicitly rejected this shape in `13-CONTEXT.md` ("Rejected: fixed four with per-type descriptions only (deck quality would be a sub-point of Content, not a score, which Phase 14's criterion 4 asks for)"). Phase 14 must declare them via `extraRubricDimensions`, not fold them into prose.
- **Deferring slide rasterization to a background job (`waitUntil`) during upload.** The student needs rendered images to actually START the live-navigation session; if rasterization is pushed to the background the wizard has nothing to show for the "click through your deck" step. Rasterize synchronously (or with a clear loading state bounded to a few seconds) during the upload request, not after.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PDF page → image | A custom PDF content-stream interpreter | `pdfjs-dist` (Mozilla's own renderer) | PDF rendering is enormously complex (fonts, embedded color spaces, vector graphics, transparency groups); this is a solved problem with one dominant, correct, actively-maintained implementation. Writing a custom one for this phase would be a multi-week project on its own. |
| PPTX → rendered image (fidelity) | A custom OOXML shape/layout renderer | LibreOffice headless (bundled or via a conversion microservice) | OOXML's shape/layout/theme model is as complex as PDF's content model, with the added burden of PowerPoint-specific layout inheritance (slide masters, layouts, placeholders). No pure-JS project renders this faithfully; LibreOffice is the dominant correct implementation across the industry. |
| PPTX → extracted TEXT | A full OOXML DOM/object model library | Plain unzip (`jszip`) + a narrow XML text-run extractor (`fast-xml-parser` or a scoped regex over `<a:t>` nodes) | Text-only extraction does NOT need layout fidelity, so this is the one place a lightweight pure-JS approach is both sufficient and appropriate — the opposite conclusion from the image-rendering row above. Don't reach for a heavy OOXML library (e.g. a full "office document model" package) when the only need is "give me every slide's plain text." |
| Magic-byte file-type validation | Trusting the browser's reported MIME type | Byte-signature check (`%PDF-` for PDF, already in code; `PK\x03\x04` for PPTX/ZIP) | Already the established pattern in `app/api/interview/upload-resume/route.ts` — MIME types are client-supplied and forgeable; this codebase already treats that as a settled question for PDF and the same logic trivially extends to PPTX. |
| Structured outcome extraction from a transcript | A second bespoke "extract negotiation terms" LLM call/pipeline | The SAME type-derived, schema-constrained evaluator call Phase 13 already builds (plan 13-05's `buildRubricJsonSchema`/`runEvaluation`), extended with outcome fields in the same JSON schema | Phase 13 already built exactly the right-shaped machinery (one schema-constrained call per session, `additionalProperties: false`, validated before persistence) — duplicating it for one type's outcome would violate the engine's whole premise. |

**Key insight:** The phase's genuinely hard problems (PDF/PPTX rendering fidelity) have one dominant, battle-tested, correct open-source answer each (`pdfjs-dist`, LibreOffice) — the engineering risk is *integration* (serverless packaging, cold starts, font availability), not *algorithm design*. Conversely, the phase's text-extraction and structured-data-extraction needs are narrow enough that lightweight, purpose-built code (or Phase 13's already-built evaluator machinery) is the right level of abstraction — reaching for a heavier library there would be over-engineering in the other direction.

## Common Pitfalls

### Pitfall 1: Prefix-cache death by slide-text growth in the wrong place
**What goes wrong:** Each slide the avatar is allowed to see adds text to "what the avatar knows." If that text is concatenated into the system prompt (even via a helper that looks like it belongs there), the system prompt stops being session-constant and the OpenAI prefix cache misses on every turn after a slide reveal — directly violating Phase 13's criterion 2 and REQ-73, which Phase 14 inherits.
**Why it happens:** It is the natural-looking place to put "what the model should know" — persona/background info for other types IS in the system prompt (session-constant). Slide content looks like persona/background at first glance but is NOT session-constant; it grows mid-session.
**How to avoid:** Route all admitted slide text through `buildTailBlock`/the latest-user-message tail append (plan 13-06's `buildTurnMessages`), the same mechanism carrying the time-budget fragment and interview progress today. The tail block is explicitly allowed to vary per turn; the system prompt is not.
**Warning signs:** If `assembleSystemPrompt`'s dev-mode per-turn-value guard (plan 13-06 task 1) ever throws during deck-session testing, this pitfall has been hit. Also watch for degraded conversational quality turn-to-turn if slide text is instead repeatedly re-sent as a growing tail block without caching benefit — some cache-hit loss on the TAIL portion is expected and acceptable; the goal is only to keep the SYSTEM PROMPT prefix stable, not to make the entire request byte-identical every turn.

### Pitfall 2: Client-trusted high-water mark is a context-leak vector
**What goes wrong:** If the browser tells the server "I'm on slide 7" and the server trusts that to decide what the avatar may reference, a student (or a bug in the thumbnail-jump UI) can reveal slide content that was never actually shown, or — worse for the investor-realism framing — the avatar could reference content the student intentionally hasn't reached yet, breaking the core "avatar must not see unshown slides" requirement from the source brief.
**Why it happens:** It's the easiest implementation — just read whatever the live-session UI's "current slide" state says.
**How to avoid:** The high-water mark must be a server-persisted, monotonically-non-decreasing value, updated only by validated "reveal" events (forward navigation and thumbnail-jump-forward both advance it; backward navigation never decreases it, matching CONTEXT.md's "backward jumps are free" / "un-shown slides never enter context" rule). This mirrors the camera-mode-locked-server-side discipline Phase 13 already enforces (`cameraMode` is resolved server-side and the shell "cannot change it" by prop-type — plan 13-07/13-10) — the same posture should extend to the high-water mark.
**Warning signs:** Any code path where the chat-turn request body contains a raw "current slide index" field that is used directly (rather than being validated/ratcheted server-side before being consulted) is this bug.

### Pitfall 3: Evaluator image payload cost/size blowup for large decks
**What goes wrong:** A 40-slide deck sent as 40 full-resolution images to the evaluator multiplies token cost substantially (vision tokens scale with image resolution/tiling) and risks exceeding reasonable per-evaluation budget/latency (today's evaluator budget is `BUDGET_MS = 50_000` total across the one evaluation call — plan 13-05 locks this and explicitly forbids re-tuning it in Phase 13; Phase 14 inherits that call and must fit within it or justify a local deviation).
**Why it happens:** "Judge slide appearance" naturally suggests "send every slide image."
**How to avoid:** Use the `detail: "low"` parameter on each `image_url` content part (bounds images to roughly 512×512-equivalent processing — MEDIUM confidence, OpenAI's vision guide, see Sources) rather than `"high"`/`"original"`, and/or cap/sample the number of slide images actually sent to the evaluator (e.g. a fixed max, or one image per N slides for very large decks) rather than sending every slide unconditionally. This is explicitly a Claude's-Discretion item in CONTEXT.md ("concrete text-density and structure thresholds for deck scoring") and should be treated as covering image-sampling thresholds too.
**Warning signs:** Evaluation latency climbing noticeably with deck size, or evaluation failures/timeouts correlating with slide count once this ships.

### Pitfall 4: Assuming a session has exactly one attached-artifact "kind"
**What goes wrong:** `InputSnapshot` (plan 13-02, `lib/report/snapshot.ts`) is a discriminated union keyed by `kind` (`"interview" | "scenario"`, with a pitch member explicitly anticipated: `{kind: "pitch", deck, ask}` per `13-CONTEXT.md`'s own example). This is already designed to be additive — a new member, no new columns — so this specific pitfall is largely AVOIDED by Phase 13's schema design. The remaining risk is in the UI/wizard layer and the camera-consent-gate-before-launch ordering (plan 13-09's `SetupWizard`): those were built assuming each type's "custom step" is something like a resume upload or a persona paste — a single small artifact collected once. A deck-upload step that ALSO needs post-upload server processing (rasterization) before the student can proceed to "intro"/launch is a heavier step than anything the wizard was designed against, and its loading/error states (a rejected file needs "specific reason plus the fix" per CONTEXT.md) are new UI, not a drop-in reuse of `ResumeStep.tsx`.
**Why it happens:** The wizard's generic step contract (plan 13-09) assumes steps are fast and mostly client-side (pick an interviewer, type a persona). Deck upload is slow (upload + server-side extract + rasterize) and can fail in ways needing specific messaging.
**How to avoid:** Build the deck-upload step as its own custom step component (which the wizard's contract explicitly allows — "a step needing custom UI... supplies its own component"), with its own loading/progress and specific-error-message UI; do not try to force it through `ResumeStep.tsx`'s pattern, which assumes a near-instant round trip.
**Warning signs:** A deck-upload step with no visible progress indicator during a multi-second rasterization, or a generic "upload failed" message instead of CONTEXT.md's required specific-reason-plus-fix message.

### Pitfall 5: Session length "proposal from slide count" has no existing derivation to copy
**What goes wrong:** Phase 8's interview `targetMinutes`/`targetQuestionCount` are STATIC per-preset values (plan 13-01 transcribes them field-for-field, unchanged). There is no existing "derive a number from an uploaded artifact" pattern anywhere in the codebase — Phase 14 is inventing this formula from scratch (e.g., some minutes-per-slide heuristic clamped to 20-30 minutes), and nothing in Phase 13 provides it.
**Why it happens:** Easy to assume "this must already exist somewhere since session length is already customizable" — but Phase 8's customization is a student *choice* among preset options, not a *derivation* from an uploaded document.
**How to avoid:** Treat the slide-count→minutes formula as new, type-local logic owned entirely by Phase 14 (likely living in the pitch-deck TYPE's config resolution or the wizard step that proposes it), explicitly a Claude's-Discretion item per CONTEXT.md, and keep it simple (e.g., linear interpolation between a floor and ceiling slide count mapped to the 20-30 minute envelope) rather than importing any false sense that this formula exists upstream.
**Warning signs:** None specific — this is a "don't assume prior art" pitfall, not a runtime failure mode.

## Code Examples

### Existing precedent: PDF magic-byte + size validation (reuse pattern for PPTX)
```typescript
// Source: app/api/interview/upload-resume/route.ts (verified in repo)
const MAX_RESUME_SIZE_BYTES = 10 * 1024 * 1024;
// ...
if (file.size > MAX_RESUME_SIZE_BYTES) {
  return response({ error: "Resume PDF exceeds the 10MB limit" }, 400);
}
const buffer = Buffer.from(await file.arrayBuffer());
if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
  return response({ error: "The uploaded file is not a valid PDF" }, 400);
}
```
A PPTX equivalent checks the ZIP local-file-header signature instead:
```typescript
// New code (not yet in repo) — PK\x03\x04 is the ZIP signature every .pptx begins with
const isZipContainer = buffer.subarray(0, 4).toString("hex") === "504b0304";
```

### Existing precedent: per-page text extraction loop (already does the hard part; just stop joining)
```typescript
// Source: lib/rag/document-processor.ts (verified in repo) — extractTextFromPDF, abbreviated
pdfParser.on("pdfParser_dataReady", (pdfData: any) => {
  let fullText = "";
  pdfData.Pages.forEach((page: any) => {           // <-- per-page already available here
    page.Texts.forEach((text: any) => {
      text.R.forEach((run: any) => {
        fullText += decodeURIComponent(run.T);
      });
    });
    fullText += "\n";
  });
  resolve(fullText);                                // <-- today: joined into one string
});
```
Phase 14's `lib/deck/pdf-extract.ts` should resolve `string[]` (one entry per page) instead, by pushing each page's accumulated text into an array rather than concatenating into `fullText`.

### Vision input shape for the evaluator (new — not yet in repo; MEDIUM confidence, see Sources)
```typescript
// Pattern verified via OpenAI community docs / vision guide, not yet present in this repo.
// Extends the EXISTING lib/interview/evaluation.ts / lib/scenario/evaluation.ts
// `openai.chat.completions.create({ messages: [...] })` call shape — same client,
// same json_schema response_format, only the user message's `content` becomes an array:
const userContent = [
  { type: "text", text: buildUserMessage(input) },
  ...slideImageUrls.map((url) => ({
    type: "image_url",
    image_url: { url, detail: "low" as const }, // "low" bounds processing cost
  })),
];
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Bundling LibreOffice in AWS Lambda custom layers (the dominant prior-art pattern, ~2019-2024) | Vercel Functions' 2025-2026 "Large Functions" opt-in (5GB uncompressed bundle, up to 800s on Pro) makes a similar approach newly plausible directly on Vercel | Recent Vercel platform change (exact date not independently confirmed beyond the brief's own note and a WebSearch-sourced limits page — MEDIUM confidence) | Changes the "LibreOffice on serverless is a Lambda-only trick" assumption, but does not change the lack of a ready-made, maintained package for Vercel specifically — still a spike, not a known-good integration. |

**Deprecated/outdated:** Nothing in this domain is deprecated per se; this is a greenfield build for this codebase. The one thing worth flagging as superseded is the ORIGINAL (now-reversed) Phase 14 scope note recording Google Slides as in-scope with Drive OAuth — ROADMAP.md itself records this scope note as SUPERSEDED on 2026-10-02; this research treats Google Slides as fully out of scope per `14-CONTEXT.md`.

## Open Questions

1. **How does the server persist the high-water-mark cursor across turns/checkpoints?**
   - What we know: Phase 13's `visible-context.ts` can express a cursor-gated channel; Phase 13's `checkpointSession` persists transcript+turnCount for checkpointing types; `case-study` deliberately has none.
   - What's unclear: whether the pitch-deck type should get Phase-13-style checkpointing (most likely yes, since it needs a durable high-water mark across a 20-30 minute session) and exactly where that integer is stored (a new `InteractionReport` column, or packed into `inputSnapshot`/a new JSON field).
   - Recommendation: add checkpointing to the pitch-deck type (reusing the engine's existing checkpoint endpoint rather than building a parallel mechanism) and persist the high-water mark as part of what gets checkpointed, likely a small addition to the engine session layer's checkpoint payload — this is a Phase 14 engine-touching change and should be flagged to the planner as exactly the kind of "Phase 13 left a gap Phase 14 must extend" case the hard-constraint brief asked to be named explicitly.

2. **Is bundling LibreOffice directly in a Vercel Large Function viable, or must Phase 14 stand up a separate conversion host?**
   - What we know: bundle-size/duration limits now technically allow it; no verified, maintained package does it for Vercel specifically; font-availability and cold-start risk are real and specifically threaten the "judge slide appearance" requirement if fonts render wrong.
   - What's unclear: actual cold-start latency and font fidelity without a hands-on spike (impossible to verify further without executing code against a live Vercel deployment, which is outside this research's scope).
   - Recommendation: treat this as a short, dedicated spike task at the start of Phase 14's plan, with the self-hosted-microservice option (leveraging the team's existing non-Vercel Lightsail infrastructure) as the fallback decided in advance, not discovered mid-implementation.

3. **Does the negotiation outcome get extracted via the evaluator's end-of-session structured call only, or does it need a live, mid-session read (so the live avatar's negotiation behavior can react to the student's declared ask)?**
   - What we know: the student declares the ask "up front" per CONTEXT.md; Phase 13's `validateOutcome` is clearly an end-of-session/finish-time primitive (plan 13-07 wires it into `finishSession`).
   - What's unclear: whether the declared ask needs to be captured as STRUCTURED data as early as the wizard (so it can be injected into the session-constant system prompt as the student's stated position) versus only extracted at the end from the transcript.
   - Recommendation: capture the declared ask explicitly at the wizard step (a plain form field, not an LLM extraction) so it can enter the session-constant prompt immediately and safely; reserve the schema-constrained evaluator extraction for the SETTLED outcome only, which genuinely isn't known until the conversation concludes. This avoids needing any new extraction mechanism for the one piece of outcome data that doesn't actually require one.

## Sources

### Primary (HIGH confidence — direct repo reads)
- `app/api/interview/upload-resume/route.ts` — magic-byte validation, private-storage posture, opaque-ID-only response
- `lib/rag/document-processor.ts` — `extractTextFromPDF` (pdf2json, per-page loop), `extractTextFromDOCX` (mammoth)
- `lib/s3-client.ts` — key-derivation prefixes (`INTERVIEW_RESUMES_PREFIX`, `INTERVIEW_TRANSCRIPTS_PREFIX`, `INTERACTIONS_PREFIX`), `saveInterviewResume`/`getInterviewTranscript`/`getInteractionLog`/`getCase`, public-ACL image upload methods (`uploadAvatarImage` etc. — confirming NO existing private-image-serving precedent)
- `lib/interview/evaluation.ts`, `lib/scenario/evaluation.ts` — `openai.chat.completions.create` call shape, `EVALUATION_JSON_SCHEMA`, retry/budget constants (`BUDGET_MS = 50_000`, `RETRIES = 1`), model env vars
- `lib/metrics/coverage.ts`, `lib/metrics/ingest.ts`, `lib/metrics/types.ts` — four-state visual/vocal resolution, shared metric contract
- `package.json` — exact installed dependency versions (no PPTX/rasterization library present today)
- `.planning/phases/13-one-on-one-conversation-engine/13-{01,02,03,05,06,07,08,09,10,11,12}-PLAN.md` — every engine contract this document binds to (`lib/engine/{types,registry,resolve,termination,visible-context,outcome,time-budget,prompts,turn-control,session,rubric,evaluation,evaluation-runner}.ts`, `InteractionReport` schema, `lib/report/{snapshot,dto}.ts`, the `/practice/[type]` wizard/shell/report surfaces)
- `.planning/phases/14-practice-pitches/14-CONTEXT.md`, `.planning/ROADMAP.md`, `.planning/one-on-one-interactions-brief.md` — locked decisions and success criteria

### Secondary (MEDIUM confidence — WebSearch, partially cross-checked)
- OpenAI vision/image-input content-array shape for chat completions (multiple `image_url` parts in one message) — cross-checked across several community/doc sources, consistent in shape across all; exact per-model token/tiling math for `gpt-4.1` specifically was NOT independently confirmed (the fetched "images-vision" guide text referenced an unfamiliar model name and should be treated with caution — see Tertiary below)
- Vercel Functions bundle-size (5GB, "Large Functions" opt-in) and duration (300s default / 800s Pro) limits — from Vercel's own limitations doc as surfaced via WebSearch; not independently re-fetched from vercel.com directly in this session
- LibreOffice-headless-in-serverless prior art (Lambda-layer pattern, `soffice --headless --convert-to pdf`) — multiple independent community sources agree on the command and general pattern; no Vercel-specific working example found

### Tertiary (LOW confidence — flagged for validation, do not treat as fact)
- The WebFetch of a vision/images guide returned text referencing a model called "gpt-6-astra," which is very likely either a documentation-mirror artifact or not a real/current model name — this cluster of claims (exact patch counts, exact pixel caps per detail level) should be re-verified directly against `platform.openai.com/docs` before being used to size the evaluator's image-token budget for real; treat ONLY the qualitative claim ("`detail: low` reduces processing/cost versus `high`/`original`") as safe to rely on.
- `@napi-rs/canvas` as the specific recommended canvas backend for `pdfjs-dist` rasterization was not verified against Context7 or an official doc in this session — recommended on general WebSearch-informed reasoning (prebuilt native binaries, smaller footprint than `node-canvas`) and should be confirmed with a quick local install+render spike before the planner locks it in as the only option.

## Metadata

**Confidence breakdown:**
- Standard stack (reuse of existing pdf2json/openai/S3 client): HIGH — verified by direct repo reads.
- Standard stack (new PPTX/rasterization libraries): MEDIUM — WebSearch-sourced, not Context7/official-doc verified, no local spike run.
- Architecture (binding to Phase 13 primitives): HIGH for WHAT Phase 13 promises (read directly from the 13-xx plan files) / MEDIUM for whether Phase 13 as PLANNED will actually behave this way once executed, since none of it has been run yet.
- Pitfalls: HIGH for the prefix-cache and client-trust pitfalls (directly derived from Phase 13's own stated non-negotiables); MEDIUM for the image-cost and session-length pitfalls (reasoned from the brief's quantities, not measured).

**Research date:** 2026-10-02
**Valid until:** Re-validate the PPTX-rendering recommendation (Standard Stack + Open Question 2) before relying on it further out than ~14 days, and definitely re-validate once Phase 13 actually executes — several of this document's "gaps" are gaps in a PLAN, not gaps in running code, and Phase 13's real implementation may close or reshape them.
