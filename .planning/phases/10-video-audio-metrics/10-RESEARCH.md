# Phase 10: Video & Audio Metrics - Research

**Researched:** 2026-09-21
**Domain:** Browser-side face/gaze analysis, Web Audio vocal analysis, OpenAI STT, TypeScript type-widening across two evaluator modules, Next.js/Prisma report pipeline
**Confidence:** MEDIUM-HIGH (codebase findings HIGH; external library/API claims MEDIUM, verified against current docs/search, dated 2026-09)

## Summary

This phase is genuinely large — it touches capture UI, a new client-side inference pipeline, two evaluator modules, two runners, two DTOs, two report pages, a shared score-card component, and a schema migration, plus a consent/permission flow with a hard block state. The codebase groundwork from Phases 6-9 is disciplined and consistent (nullable `Int?` score columns already exist; the `null`-vs-`number|null` literal-type guard is intentional and documented in both evaluators), which makes this phase's job mechanical in a lot of places but wide in surface area.

The core technical decision — how to measure visual/vocal signals in-flight without ever storing media — points at **client-side inference**: MediaPipe Face Landmarker (`@mediapipe/tasks-vision`, Apache-2.0, runs as WASM/GPU in the browser) for face presence/pose/framing, and the Web Audio API (already used in this codebase for push-to-talk peak-RMS metering) for volume-consistency and pause detection. Speech rate and filler words need actual words with timing; the app's current transcription route (`gpt-4o-transcribe`, streaming) does **not** support word timestamps — only `whisper-1` with `response_format: verbose_json` and `timestamp_granularities: ["word"]` does, non-streaming. This is a second, separate STT call the pipeline must make, distinct from the live push-to-talk transcription already in place.

**Primary recommendation:** Client-side MediaPipe Face Landmarker for visual metrics (eye-contact proxy via gaze/head-pose heuristics + face-presence ratio, camera-centering from bounding box, lighting via mean luma), Web Audio AnalyserNode for volume-consistency/pause-count, and a dedicated non-streaming `whisper-1` verbose_json call at session end for words-per-minute and filler-word detection from word timestamps + transcript text. Widen `visualScore`/`vocalScore` from literal `null` to `number | null` in exactly four evaluation-layer files plus their two DTOs (enumerated below) — every consumer already declares `number | null`, so most of the cascade is already accommodating and only the producer-side literal types must change. Extend `visual_metrics`/`vocal_metrics` in `lib/interview/prompts.ts:210-217` conservatively (only add fields you can defend as genuinely measured) rather than inventing new ones.

## User Constraints

<user_constraints>
### Locked Decisions (from CONTEXT.md — do not research alternatives)

- Camera OPTIONAL; chosen BEFORE the session and LOCKED — no mid-session switching either way.
- Video analyzed IN-FLIGHT and NEVER STORED. Only derived numbers persist. NO media in S3, no buffering to disk.
- Explicit in-app consent before the first measured session (browser permission dialog is not sufficient).
- Denied permission / undetectable camera while camera-mode is ON => BLOCK with explanation, offering the student the option to switch the setting to camera-off; a deliberate camera-off choice proceeds with notice AND the report records it was an opt-out.
- **An undetected face while camera mode is ON is POOR PERFORMANCE, not missing data** — it scores DOWN, as a real interview would dock it. NO coverage threshold gates the Visual score. This is the governing principle of the phase.
- A live NON-BLOCKING banner shows while the face is not detected and FOLDS AWAY when re-detected. Plus a live SELF-VIEW thumbnail of the student's own video. No live scoring/coaching.
- Report distinguishes unscorable categories BY CAUSE: "Not yet measured" (legacy, no pipeline), camera-off/opt-out, "Insufficient data" (attempted but genuinely impossible), and the existing "Not scored" (evaluation failed).
- Presentation: score plus QUALITATIVE BANDS (not raw percentages), INSIDE the existing Visual/Vocal rubric cards, report arrives first and metrics FILL IN via the existing polling. Coverage disclosed only when poor.
- BOTH interview reports AND scenario reports light up.
- TYPED answers leave Vocal UNMEASURED (different modality, not poor delivery) — deliberately NOT symmetric with the camera case.
- Past reports keep null scores permanently; no retroactive analysis.
- Pipeline should produce AT LEAST the contract the evaluator prompt already declares, and MAY extend it.

### Claude's Discretion (research options, recommend)

- The capture and analysis approach (in-browser vs server-side, and which models/libraries do pose/gaze and speech analysis) — provided nothing is retained and nothing blocks the conversation.
- The exact band boundaries that turn a raw metric into "strong" / "slightly fast", and the copy for each band.
- The banner's precise placement, animation and wording, and the self-view thumbnail's size and position.
- The threshold and heuristic that separates a genuine technical failure from poor performance, and what counts as "poor coverage" for the disclosure rule.
- How the pending-then-populate state is wired into the existing report polling.

### Deferred Ideas (OUT OF SCOPE — ignore)

- Live delivery coaching (real-time pace/filler-word nudges during the session).
- Session playback / retained recordings.
- Retroactive re-analysis of past sessions.
</user_constraints>

<phase_requirements>
## Phase Requirements

No requirement IDs exist yet — `REQUIREMENTS.md` ends at REQ-34 (Phase 9) and the ROADMAP's Phase 10 section has no `Requirements:` line. The planner must generate REQ-35 onward. Capabilities that will need requirement coverage, derived from the locked decisions above:

| Draft capability | Description | Research Support |
|---|---|---|
| Camera opt-in/opt-out at session start, locked for the session | `app/api/interview/session/start/route.ts` (interview) and the scenario-session-start equivalent must persist a `cameraMode`/consent snapshot column, mirroring the Phase 8 customization-snapshot pattern | See "Session-start snapshot precedent" below |
| Explicit in-app consent UI, remembered | New consent-copy component + a persisted "consent accepted" flag (user-level or session-level) distinct from the OS/browser permission dialog | No existing consent-tracking surface found; net-new |
| Permission-denied/undetectable-camera block flow | Block UI offering a toggle to camera-off; must not silently degrade | `getUserMedia` today requests audio only (`InterviewSessionShell.tsx:475`) — camera request path is entirely new |
| Live face-detection banner (fold-away) + self-view thumbnail | Client component wrapping a new capture/inference hook, non-blocking overlay in the avatar session UI | `components/HeyGenAvatar/InteractiveAvatar.tsx` is the existing live-video surface to extend/adjoin |
| In-browser face/pose inference, discard-per-frame | MediaPipe Face Landmarker in a Web Worker or rAF loop, aggregating stats client-side, sending only the aggregate to the server at session end | See "Visual metrics: what's measurable" below |
| Vocal metrics via word-level STT + Web Audio | A second, non-streaming `whisper-1` call for WPM/fillers; reuse the existing peak-RMS metering pattern (`InterviewSessionShell.tsx:472-508`) for volume-consistency/pauses | See "Vocal metrics" below |
| Type-widening cascade | `visualScore`/`vocalScore` literal `null` → `number \| null` in both evaluation modules and both evaluation-runners' write paths | See enumerated list below |
| Evaluator prompt contract extension (optional) | Edit `lib/interview/prompts.ts:210-245` if the pipeline offers more signal than declared; `SCENARIO_EVALUATOR_PROMPT` likely needs the same fields added since scenarios are in scope too | `lib/scenario/prompts.ts` shares the rubric shape — check it for its own `visual_metrics`/`vocal_metrics` declaration before assuming only `lib/interview/prompts.ts` needs edits |
| New DB columns for richer metric objects + cause-of-unscored | `visualMetrics Json?`, `vocalMetrics Json?`, `cameraMode` enum/string, `visualUnscoredReason`/`vocalUnscoredReason` enum on both `InterviewReport` and `ScenarioReport` | See "Schema" section below |
| Report card states (4-way distinction) + qualitative bands | Rework `ReportScoreCards.tsx`'s `UnmeasuredCard`/`ScoredCard` split, which currently unconditionally hardcodes "Not yet measured" for Visual/Vocal regardless of API data | See "ReportScoreCards.tsx is currently hardcoded" below — this is not a small edit |
| Metrics fill in after report is READY | Current polling ties `pending` 1:1 to overall report `status`; once `status === "READY"` polling stops entirely. A metrics pipeline that finishes after the text report needs its own poll-until-populated mechanism | See "Polling mechanism" section below — this is a real gap, not just reuse |
</phase_requirements>

## Codebase Findings

### 1. The evaluator contract and the missing-data rule (`lib/interview/prompts.ts:180-245`)

`INTERVIEW_EVALUATOR_PROMPT` declares:
- `visual_metrics` (optional, may be null): `{eye_contact_pct, posture_flags, camera_centered_pct, lighting_ok}`
- `vocal_metrics` (optional, may be null): `{words_per_minute, filler_word_count, filler_word_list, pause_count, volume_consistency}`
- **CRITICAL RULE ON MISSING DATA** (prompts.ts:218-222): if either is null/incomplete, the model must NOT estimate from transcript text; it marks the section "Not available" and returns null for that category score.

This rule is enforced **redundantly in code**, not just prompt text: `validateEvaluationResult` (`lib/interview/evaluation.ts:90-107`) unconditionally forces `visualScore`/`vocalScore` to `null` regardless of what the model returns, discarding any model-supplied value. Same pattern in `lib/scenario/evaluation.ts:112-132`. **This is the mechanism this phase must change** — once real metrics exist, `coerceScore(r.visual_score)` (already defined and used for content/behavioral) must be applied to visual/vocal too, gated on whether the pipeline actually supplied metrics for that session.

Both evaluators call OpenAI via `chat.completions.create` with `response_format: { type: "json_schema", json_schema: ... }` (strict schema mode) — `EVALUATION_JSON_SCHEMA` (interview) and `SCENARIO_EVALUATION_JSON_SCHEMA` (scenario), both already declaring `visual_score`/`vocal_score` as `{ type: ["integer","null"], minimum: 1, maximum: 5 }`. **No schema change is needed to let scores flow** — the schema already allows a non-null integer; only the code-level force-to-null must be removed and replaced with real coercion.

`buildUserMessage` (interview, `evaluation.ts:146-165`) currently hardcodes `visual_metrics: null\nvocal_metrics: null` in the prompt body. This must become conditional, injecting the real aggregated metrics object as JSON when the pipeline produced one.

`lib/scenario/prompts.ts` was NOT read in this pass — **flag for planner**: verify whether `SCENARIO_EVALUATOR_PROMPT` declares its own `visual_metrics`/`vocal_metrics` shape (it should, by the same Phase 6 decision the interview evaluator encodes) before assuming the contract only lives in `lib/interview/prompts.ts`. If scenario's prompt has independent field names, extending the "declared contract" means keeping both prompts in sync or accepting drift — the planner should decide explicitly rather than default to one.

### 2. The literal-`null` type cascade — enumerated

Confirmed via `grep -n "visualScore\|vocalScore"` across `lib/interview/` and `lib/scenario/`:

**Producer-side (literal `null`, MUST widen to `number | null`):**
- `lib/interview/evaluation.ts:57-58` — `ValidatedEvaluation.visualScore: null; vocalScore: null;` (interface declaration)
- `lib/interview/evaluation.ts:101-102` — `validateEvaluationResult` return object, hardcoded `null` values
- `lib/scenario/evaluation.ts:75-76` — `ScenarioEvaluationResult.visualScore: null; vocalScore: null;` (interface declaration, explicitly commented "so a regression... is a compile error, not a runtime surprise")
- `lib/scenario/evaluation.ts:126-127` — `validateScenarioEvaluationResult` return object, hardcoded `null` values

**Runner-side (currently just pass-through of the literal `null`, will accept whatever the widened type provides — no signature change needed, but verify):**
- `lib/interview/evaluation-runner.ts:93-94` — writes `visualScore: null, vocalScore: null` directly in the `prisma.interviewReport.update` call (NOT sourced from `outcome.result` — the runner **itself** hardcodes null here, independent of the evaluation module's type). This is a THIRD place forcing null on the interview side that must change to `outcome.result.visualScore` / `outcome.result.vocalScore`.
- `lib/scenario/evaluation-runner.ts:238-239` — already writes `visualScore: result.visualScore, vocalScore: result.vocalScore` (sourced correctly from the evaluation result) — this file needs NO change once `ScenarioEvaluationResult`'s type is widened; it will just start carrying real values through.

**Already `number | null` (no change needed — these are downstream consumers, not guards):**
- `lib/interview/report-dto.ts:28-29` (`InterviewReportDTO.scores.visual/vocal: number | null`) and `:68-69` (mapping) — already correctly typed, will accept real Prisma `Int?` values unchanged.
- `lib/scenario/report-dto.ts:32-33` and `:99-100` — same, already correct.
- `components/interview/ReportScoreCards.tsx:3-7` (`ReportScores` interface) — already `number | null`.
- `app/interview/[type]/report/[reportId]/page.tsx:22` and `app/case-play/[caseId]/report/[reportId]/page.tsx:20` — `nullScores` fallback objects, already typed loosely enough.

**Net finding:** the cascade is narrower than the CONTEXT.md flag implied — it is exactly **3 producer-side edits** (2 interface declarations + 2 return-object literals, one of which — evaluation-runner.ts:93-94 — is a runner bug/gap not just a type) plus verifying `lib/scenario/prompts.ts`'s own contract. Everything downstream (DTOs, report pages, ReportScoreCards data shape) was already built `number | null`-clean by the Phase 8/9 authors anticipating this phase. **This is good news for scope, but do not skip verifying it with `tsc --noEmit` after the edit** — a literal-type removal can surface distant errors if anything else narrowed on it via inference.

### 3. Schema — new columns needed

`prisma/schema.prisma:285-331` (`InterviewReport`) and `:333-380` (`ScenarioReport`) both already have nullable `visualScore Int?` / `vocalScore Int?` — **no migration needed for the scores themselves.**

However, neither model has an existing generic `Json?` column to reuse for the richer metric objects (`eye_contact_pct`, `camera_centered_pct`, etc.) or for the cause-of-unscored state. `ScenarioReport.avatarsSnapshot` is a `Json` column but it is semantically the character roster snapshot — reusing it for metrics would conflate two concerns and break the "explicit field-by-field DTO mapping, never spread" discipline both DTOs document in their own comments. **New columns are needed**, minimally:

- `visualMetrics Json?` / `vocalMetrics Json?` — the raw aggregated numeric payload (eye_contact_pct, camera_centered_pct, lighting_ok, posture_flags; words_per_minute, filler_word_count, filler_word_list, pause_count, volume_consistency), stored so the report page can render qualitative bands without recomputing, and so a support engineer can inspect what was actually measured.
- `cameraMode String?` (or a Prisma enum: `ON` / `OFF`) — captured at session start, locked for the session, needed both to gate the pipeline and to render "camera off" vs "not yet measured" correctly on legacy rows (legacy = column is null).
- `visualUnscoredReason` / `vocalUnscoredReason` — a small enum or string column distinguishing `CAMERA_OFF_OPTOUT` / `INSUFFICIENT_DATA` / `NOT_YET_MEASURED` (implicit: column absent/legacy) / null (scored or "not scored" via existing `contentScore`-style null handling). This is the mechanism the report page needs to implement the CONTEXT.md's 4-way distinction — without a stored reason, the report page cannot tell "insufficient data" apart from "camera off" after the fact, since both currently collapse to `visualScore: null`.
- Consent: a boolean or timestamp (`visualConsentAcceptedAt`) — either on the report row (session-scoped) or on the `User` model (account-scoped, "accepted once and remembered" per CONTEXT.md). CONTEXT.md's wording ("accepted once and remembered") leans toward a **User-level** column so it doesn't need re-accepting every session — flag this as an explicit planner decision, not something this research should decide unilaterally.

Both models need the same four-ish columns since both report types are in scope — this doubles every schema/DTO/report-page edit. Per STATE.md environment rules, migrations here are **local-dev only** (`prisma migrate dev`, never `npm run setup`, never applied to the shared DB in this workflow) — the planner should call this out explicitly in the plan's task list so an executor doesn't reach for the wrong migration command.

### 4. Live session capture surfaces

- `components/interview/InterviewSessionShell.tsx:472-476` — `getMicrophone()` calls `navigator.mediaDevices.getUserMedia({ audio: true })`. **No video constraint is requested anywhere in the codebase today** (confirmed via `grep -rn "getUserMedia" components/` — this is the only call site). Camera capture is entirely new code, not an extension of an existing constraint object.
- `components/interview/InterviewSessionShell.tsx:472-508` — `startMetering(stream)` already builds a Web Audio `AnalyserNode` (fftSize 2048) and polls `getFloatTimeDomainData` every 50ms via `setInterval`, tracking a running `peakRmsRef` used today only to reject silent/too-quiet push-to-talk recordings. **This is a directly reusable pattern for vocal volume-consistency** — the existing peak-RMS scaffolding can be extended to accumulate a full-session RMS time series (or bucketed variance) rather than just a single peak, and to detect pause gaps (stretches of near-silence between speech).
- `components/HeyGenAvatar/InteractiveAvatar.tsx:111,130-133,204-226` — this component owns the `<video>` element that renders the **HeyGen avatar's own outgoing stream** (the AI interviewer's video), not the student's camera. It also has a `MediaRecorder`/`captureStream()` path (`:168-176`) that records the avatar's video to a Blob — this is unrelated to student capture and must not be confused with it; do not reuse this recording pathway for student video, since the locked decision explicitly forbids buffering/storing any of the student's video. The self-view thumbnail and face-inference hook are new UI/logic to add alongside this component, not inside it.
- `app/case-play/[caseId]/page.tsx:113,663-694` — the Text/Avatar toggle is `interactionMode: "text" | "avatar"`, persisted per-session (not locked at start the way camera mode will be — students can switch text/avatar mid-run today per `:663`, `handleModeSwitch`-type logic). This confirms the "typed answers leave Vocal unmeasured" decision has a clean state to key off: `interactionMode === "text"` at the time of a given turn (or at session end, if the whole session was ever typed) should suppress vocal metrics for that content, independent of camera mode. **Flag for planner:** because interaction mode CAN switch mid-session (unlike camera mode), the "vocal unmeasured for typed answers" rule needs to be tracked at a finer grain than session-level if a student mixes typed and spoken turns — or the phase needs to decide session-level typed/spoken is the unit of measurement (simpler, likely the intended scope, but not explicitly stated in CONTEXT.md — confirm with user or default to session-level and document the assumption).

### 5. STT and audio format

`app/api/audio/transcribe/route.ts` — the existing push-to-talk transcription:
- Uses `openai.audio.transcriptions.create({ model: "gpt-4o-transcribe", stream: true, language: ... })`, no `timestamp_granularities`, no `response_format` override (defaults to plain text under streaming).
- Confirmed via web research (OpenAI docs, 2026-09): **`gpt-4o-transcribe` does not support `timestamp_granularities`.** Only `whisper-1` supports `timestamp_granularities: ["word", "segment"]`, and only when `response_format: "verbose_json"` — which is incompatible with `stream: true`.
- **Conclusion (MEDIUM-HIGH confidence, verified via WebSearch against OpenAI's current API reference):** vocal metrics needing word-level timing (words-per-minute, pause_count if derived from word gaps, filler-word positions) require a **second, non-streaming `whisper-1` call** with `response_format: "verbose_json"` and `timestamp_granularities: ["word"]`, run once at session end (or per-turn) against the accumulated audio — separate from the existing live push-to-talk `gpt-4o-transcribe` stream, which stays as-is for the live conversational UX. This is a new code path, not an extension of the existing route.
- Audio format in flight: push-to-talk records `audio/webm` Blobs (`InterviewSessionShell.tsx` `chunksRef`/`MediaRecorder`). The same MediaRecorder output can likely be fed to the new `whisper-1` call, but note per-turn blobs vs a full-session concatenated blob is a design choice the planner needs to make (per-turn is simpler and matches existing plumbing; concatenation risks extra complexity for marginal benefit, since WPM/fillers can be aggregated across per-turn results additively).

### 6. Report score cards — currently hardcoded, not data-driven

`components/interview/ReportScoreCards.tsx:68-91` — **`UnmeasuredCard` unconditionally renders "Not yet measured"** for Visual and Vocal, regardless of what `scores.visual`/`scores.vocal` actually contain (the component doesn't even read those props — see line 36-37, it renders `<UnmeasuredCard title="Visual & Environment" ...>` and `<UnmeasuredCard title="Vocal Delivery" ...>` with no score argument at all, only `pending`). This is a **larger rewrite than a data plumbing change**: the component must be restructured to:
1. Accept real score + qualitative-band data for Visual/Vocal (mirroring how `ScoredCard` already handles Content/Behavioral).
2. Branch on (at minimum) four states per category: scored (show score + band), camera-off/opt-out (distinct copy), insufficient-data (distinct copy), legacy-not-yet-measured (today's copy, kept for pre-Phase-10 rows).
3. Only reveal coverage/disclosure text when coverage was poor (per CONTEXT.md) — meaning the component needs a coverage/quality signal passed down, not just a final score.

This is reused by BOTH report pages already (`ReportScoreCards` imported in both `app/interview/.../report/.../page.tsx` and `app/case-play/.../report/.../page.tsx`), so one rewrite serves both report types — consistent with the "both report types light up" decision, and this is the one place where sharing the fix genuinely halves the work.

### 7. Polling mechanism — a real gap, not pure reuse

Both report pages (`app/interview/[type]/report/[reportId]/page.tsx:91-105` and `app/case-play/[caseId]/report/[reportId]/page.tsx:88-104`) tie `isPending` (passed to `ReportScoreCards` as the `pending` prop, which drives the shimmer/skeleton state) **directly to the overall report `status`** (`PENDING`/`IN_PROGRESS` = polling; `READY`/`FAILED` = stopped). Once `status` flips to `READY`, polling stops entirely and `pending={isPending && !timedOut}` becomes `false` — the score cards immediately render their final state.

CONTEXT.md's decision — "report arrives first and metrics FILL IN via the existing polling" — implies the text report (`reportMarkdown`, content/behavioral scores) can be `READY` while visual/vocal metrics are still being computed (e.g., the face-landmark aggregation or the second `whisper-1` call hasn't finished). **The existing polling mechanism cannot express this today**: there is one status field gating one boolean. To honor the decision, either:
(a) add a second status field (e.g., `metricsStatus: "PENDING" | "READY" | "FAILED" | "SKIPPED"`) that the report pages poll independently of the main `status`, continuing to poll only the metrics field after the main report is `READY`, or
(b) keep visual/vocal metrics computation synchronous and fast enough to finish before or alongside the main evaluator call, so by the time `status` flips to `READY`, metrics are already attached — avoiding a second polling axis entirely.

(b) is simpler if achievable: face-landmark aggregation is a client-side computation that can finish the instant the session ends (no network round trip beyond sending the small aggregate), and a `whisper-1` verbose_json call is a single bounded request, likely completable within the same ~15-40s window the interview evaluator already takes. **Recommendation: attempt (b) first** — compute/attach visual+vocal metrics before calling the evaluator, so they arrive in the SAME `runAndPersistEvaluation` write as content/behavioral, keeping today's single-status polling model intact and requiring zero report-page polling changes. Only fall back to (a) if the metrics pipeline proves too slow to sit in the existing evaluation budget (currently a hard 50s budget with one retry, per `evaluation.ts:213` `BUDGET_MS`). This should be validated during planning/execution, not assumed — flag it as an open question.

### 8. Session-start snapshot precedent

`app/api/interview/session/start/route.ts:96-110` is where the Phase 8 customization snapshot (`resolveCustomizationRecord(type)`) gets written onto the newly-created `IN_PROGRESS` `InterviewReport` row, alongside `resumeId`/`resumeText`. This is the correct, established place to also persist `cameraMode` and the consent-acceptance signal for the interview flow — same pattern: resolve/validate on the server, write once at creation, never mutate later. The scenario equivalent (case-play's session-start API — not read in this pass, but referenced by `runAndPersistScenarioEvaluation`'s snapshot columns like `avatarsSnapshot`/`criteriaSnapshot`) will need the analogous treatment; **flag for planner** to locate and confirm the scenario session-start route mirrors this shape before assuming symmetry.

## Architecture Patterns

### Recommended pipeline shape

```
Session start (both interview + scenario):
  → Client asks for consent (if not previously accepted) — new UI, gates nothing else
  → Client reads camera-mode toggle (locked once session starts)
  → If camera mode ON: getUserMedia({ video: {...} }) requested
      → denied/undetectable → BLOCK screen, offer camera-off switch
      → granted → proceed, camera mode + consent snapshot written to report row at creation
  → If camera mode OFF (deliberate): proceed, snapshot records opt-out

During session (camera ON only):
  → MediaPipe Face Landmarker runs client-side on the local camera MediaStream
    (NOT the HeyGen avatar stream) via detectForVideo() in a rAF loop or Worker
  → Per-frame results (face-detected bool, gaze/pose approximation, bbox center)
    are aggregated into running counters/histograms — NEVER buffered as frames,
    only as scalars (running sum, count, etc.)
  → Face-not-detected streak drives the fold-away banner (client-only UI state,
    no server round trip needed for the banner itself)
  → Self-view thumbnail: same local MediaStream piped to a small <video> element,
    muted, no recording

During session (audio, always — camera-independent):
  → Existing peak-RMS AnalyserNode metering extended to accumulate a running
    volume time-series / variance and silence-gap detection (pause_count proxy)
  → Existing per-turn gpt-4o-transcribe streaming STT stays for the live UX,
    UNCHANGED
  → A parallel per-turn (or session-end) whisper-1 verbose_json call with
    timestamp_granularities:["word"] supplies word timings for WPM and filler
    detection — new code path, does not touch the existing route

Session end:
  → Client sends the small aggregated visual/vocal metrics object (not raw
    frames/audio) to the finish/evaluation-trigger endpoint
  → Server-side runner attaches metrics to the evaluator's user message
    (replacing the hardcoded "visual_metrics: null" string) and to the
    coerced visualScore/vocalScore write, gated by cameraMode/interactionMode
  → Unscored-reason columns are set explicitly (camera off, insufficient data,
    or left null for "not yet measured" on legacy rows / not applicable)
```

### Anti-Patterns to Avoid

- **Do not route student video through the server at all**, even transiently (e.g., a signed upload URL "just for analysis, then delete"). The locked decision is in-flight, client-side analysis with only derived numbers crossing the network — any server-touches-frames design reopens exactly the retention risk the decision closes.
- **Do not conflate the HeyGen avatar's outgoing video (`InteractiveAvatar.tsx`) with the student's own camera feed.** They are different `MediaStream`s with different owners and different privacy implications; the existing `captureStream()`/`MediaRecorder` code on the avatar side is unrelated infrastructure that happens to look reusable but analyzes the wrong stream.
- **Do not let a coverage/quality signal quietly become a second scoring channel that fights the rubric's 1-5 integer.** CONTEXT.md is explicit: no coverage threshold gates the score; poor coverage IS the low score. Keep "disclosure" (telling the student their coverage was poor) separate from "scoring" (the down-weighted number) — two different pieces of information rendered together, not one computed from a hidden second formula that overrides the rubric.
- **Do not widen the literal-`null` types by weakening them to `any`/`unknown` or by deleting the coercion helper.** `coerceScore` already exists and is unit-clean; reuse it for visual/vocal exactly as it's used for content/behavioral, preserving the "never trust the raw model output" discipline both evaluators document.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Face/gaze/pose detection in-browser | A custom canvas-diffing or Haar-cascade heuristic | MediaPipe Face Landmarker (`@mediapipe/tasks-vision`) | Battle-tested, Apache-2.0, ships a WASM+GPU-delegate runtime built for exactly this (live-stream face landmarks + blendshapes), avoids reinventing detection robustness (lighting, angle, partial occlusion) |
| Word-level speech timing | Parsing/guessing word boundaries from plain transcript text or audio energy alone | `whisper-1` with `timestamp_granularities:["word"]` | OpenAI's hosted models only expose word timestamps through this one endpoint/format combination; anything hand-rolled from `gpt-4o-transcribe` text output has no timing signal to work with at all |
| Silence/pause detection | A bespoke VAD (voice activity detection) model | The existing `AnalyserNode`/RMS approach already in `InterviewSessionShell.tsx`, extended to detect sustained low-RMS gaps | The codebase already has this exact primitive working reliably for a related purpose (rejecting silent recordings); extending it is far cheaper and more consistent than adding a new dependency for a coarse pause signal |

**Key insight:** Every "don't hand-roll" item above already has either an existing in-repo pattern (RMS metering) or a dominant, purpose-built library (MediaPipe, whisper-1 timestamps) — this phase's temptation to hand-roll a lighter-weight face detector or a text-based pause heuristic should be resisted specifically because the "measured, not estimated" bar the user set is easy to violate with something that merely looks plausible.

## Common Pitfalls

### Pitfall 1: CPU/GPU contention with the live HeyGen avatar stream
**What goes wrong:** Running a face-landmark model in the same tab as a live HeyGen WebRTC video stream and push-to-talk audio pipeline can degrade avatar video smoothness or audio processing, defeating the "must not degrade the session" requirement.
**Why it happens:** Browser tabs share a single GPU/CPU budget; MediaPipe's default is CPU unless GPU delegate is explicitly requested, and even GPU delegate contends with WebRTC decode.
**How to avoid:** Request the GPU delegate explicitly, run inference in a Web Worker where possible (offscreen canvas + `detectForVideo`), throttle inference to well below display frame rate (e.g., 5-10 detections/sec is plenty for a coverage aggregate — this is not a real-time coaching feature), and validate on a mid-tier laptop, not just a dev machine.
**Warning signs:** Avatar video stutter, audio glitches during push-to-talk, or increased time-to-first-token on the interviewer's responses when camera mode is on vs off.

### Pitfall 2: Collapsing "technical failure" and "poor performance" into one signal
**What goes wrong:** If the only data the pipeline captures is "face detected: yes/no per sample," then a MediaPipe worker that silently stopped running (crashed, threw, got starved of frames) looks byte-for-byte identical to a student who left the frame — both show 0% face-detected. This is the exact trap CONTEXT.md names as a hard constraint no plan may collapse.
**Why it happens:** The two failure modes have overlapping symptoms (no positive detections) but different responsibilities (score the student vs don't score the student) and different UX (banner shown vs no banner ever shown).
**How to avoid:** Track pipeline **liveness** separately from **detection outcome** — e.g., a heartbeat counter of "frames the model actually processed" alongside "frames where a face was found." If total-processed-frames is far below the expected count for the session duration (model never initialized, camera track ended early, worker threw), that is `INSUFFICIENT_DATA` regardless of the detection ratio. If total-processed-frames is roughly what's expected for the session length but the detection ratio is low, that is a real, scoreable low Visual score. A concrete discriminator: define an expected minimum sample count from `sessionDurationSeconds × targetSampleRate`; if actual samples collected fall below some floor (e.g., 50% of expected) → `INSUFFICIENT_DATA`; otherwise score on the detection ratio actually observed, however low.
**Warning signs:** A report showing Visual score = 1 for a session where the camera track ended 30 seconds in (browser tab backgrounded, camera physically unplugged, permission revoked mid-session) — if these can't be distinguished from a student staring at their phone the whole time, the discriminator hasn't been implemented, only asserted.

### Pitfall 3: `coerceScore` reuse trap
**What goes wrong:** Copy-pasting `coerceScore` for visual/vocal but forgetting it's currently invoked unconditionally for content/behavioral — visual/vocal scoring must additionally be **gated** on whether the pipeline supplied metrics at all (camera-off/typed-answer cases), which content/behavioral never had to consider.
**Why it happens:** The existing function signature `(value: unknown) => number | null` looks directly reusable, and it is for the "did the model return a valid 1-5 integer" check — but the missing-data rule requires checking gate conditions BEFORE even asking the model to score, by omitting `visual_metrics`/`vocal_metrics` from the prompt input in the camera-off/typed-only case, exactly as it does today unconditionally.
**How to avoid:** Preserve the existing pattern precisely: only include `visual_metrics`/`vocal_metrics` in the evaluator's user message when the pipeline actually produced them; when they're omitted, the model is instructed (already, by the existing unmodified prompt text) to return null — and `coerceScore` on a null model response correctly yields null. Don't add a second, separate app-side override layer that duplicates what the prompt+schema already handle.

## Code Examples

### MediaPipe Face Landmarker — video-stream detection (verified pattern from official docs)
```javascript
// Source: https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

const filesetResolver = await FilesetResolver.forVisionTasks(
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
);
const faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
  baseOptions: {
    modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task",
    delegate: "GPU",
  },
  runningMode: "VIDEO",
  numFaces: 1,
});

// In a rAF loop against the student's own <video> element (local getUserMedia stream):
const results = faceLandmarker.detectForVideo(videoElement, performance.now());
// results.faceLandmarks[0] present => face detected this frame; absent => not detected.
// Aggregate scalars only (counts/sums) — never store results or frames.
```
Note: **serve the WASM/model assets from your own origin or a pinned CDN version**, not `@latest`, for production stability — the snippet above uses `@latest` only because that's how the official doc example shows it; pin a specific version once selected.

### OpenAI word-timestamp transcription (verified against current API reference)
```javascript
// Source: OpenAI API docs (audio/transcriptions), confirmed via 2026-09 WebSearch
const transcription = await openai.audio.transcriptions.create({
  file: audioFile,
  model: "whisper-1",           // NOT gpt-4o-transcribe — no word timestamps there
  response_format: "verbose_json", // required for timestamp_granularities
  timestamp_granularities: ["word"],
});
// transcription.words: [{ word, start, end }, ...]
// words_per_minute = words.length / (sessionDurationSeconds / 60)
// pause_count = gaps between consecutive word.end/word.start beyond a threshold
```

## State of the Art

| Old Approach (this codebase, pre-Phase-10) | Current Approach (this phase) | When Changed | Impact |
|---|---|---|---|
| `visualScore`/`vocalScore` unconditionally forced to `null` in code (3 call sites) | Coerced from real model output, gated on pipeline-supplied metrics | Phase 10 | Unblocks the literal-`null` compile-time guard by design — this is the guard doing its job, not a bug to route around |
| `getUserMedia({ audio: true })` only | Camera-mode-gated `getUserMedia({ video: {...}, audio: true })` | Phase 10 | New permission surface, new block/opt-out UX |
| Single `gpt-4o-transcribe` streaming call per push-to-talk turn | Same call retained for live UX + a new non-streaming `whisper-1` verbose_json call for timing | Phase 10 | Two STT calls per turn/session instead of one; cost and latency budget must account for the second call |
| `ReportScoreCards` hardcodes "Not yet measured" for Visual/Vocal | Data-driven 4-state rendering (scored / camera-off / insufficient-data / not-yet-measured) | Phase 10 | Component becomes stateful on real data, not a static placeholder — meaningfully larger component |

**Deprecated/outdated:** the "Visual/Vocal always show Not yet measured" behavior in `ReportScoreCards.tsx` was an explicit, temporary placeholder (comment: "deferred to Phase 8" — now stale, since Phase 8 shipped without it and it rolled to Phase 10) — this phase is its intended replacement, not a regression risk to preserve compatibility with.

## Open Questions

1. **Does `lib/scenario/prompts.ts` independently declare a `visual_metrics`/`vocal_metrics` contract, or does it defer to the same shape as the interview prompt?**
   - What we know: `lib/scenario/evaluation.ts`'s schema and validator mirror the interview evaluator's structure closely (same four score fields, same coerce logic, same "Phase 10" comments).
   - What's unclear: this pass did not read `lib/scenario/prompts.ts`'s actual text, so whether it has its own declared field names for visual/vocal metrics (which could differ from the interview prompt's) is unverified.
   - Recommendation: planner should read `lib/scenario/prompts.ts` in full before finalizing the metric-contract task, and decide once whether one shared metrics-shape type is introduced (e.g., in a new `lib/metrics/` module) that both prompts/evaluators import, versus two independently-declared-but-identical shapes. A shared type is almost certainly better given both evaluators are meant to receive the same kind of pipeline output.

2. **Where does consent-acceptance live: per-user (account-level, "accepted once") or per-report-row (session-level snapshot)?**
   - What we know: CONTEXT.md says "accepted once and remembered," which reads as account-level.
   - What's unclear: whether the report row should ALSO snapshot "consent was in effect for this session" (for audit/legal purposes, similar to how customization is snapshotted) even if the acceptance itself lives on the User model.
   - Recommendation: add a `User.videoAnalysisConsentAcceptedAt DateTime?` column for the "remembered" behavior, AND a lightweight boolean/timestamp on each report row copied from it at session start, so a report is self-describing about consent status even if the user's account-level flag later changes (e.g., consent copy is updated and re-required). This follows the same snapshot discipline already used for customization and scenario data.

3. **Can visual+vocal metric computation reliably finish inside the existing 50s evaluation budget, avoiding a second polling axis?**
   - What we know: face-landmark aggregation is a client-side computation that can complete instantly at session end (no network call); the new `whisper-1` call is one bounded HTTP request.
   - What's unclear: actual latency of a `whisper-1` verbose_json call at realistic audio lengths (a 15-30 minute interview's full audio, or many small per-turn calls) — this needs to be measured, not assumed, during planning/early execution.
   - Recommendation: default to the "attach before evaluator call, single status field" design (see Architecture Patterns #7), but have the planner flag a fallback task (add `metricsStatus` column + second poll) as a contingency if early testing shows the whisper-1 call doesn't reliably fit the budget.

4. **Is "typed answers leave Vocal unmeasured" a session-level or turn-level rule, given `interactionMode` can switch mid-scenario-session?**
   - What we know: `app/case-play/[caseId]/page.tsx` allows switching `interactionMode` between "text" and "avatar" during a single session (confirmed at `:663` `handleModeSwitch`-style logic); the interview flow (`InterviewSessionShell.tsx`) was not confirmed to have the same mid-session toggle in this pass.
   - What's unclear: CONTEXT.md's decision text discusses "typed answers" generally, without addressing a session that mixes both modes.
   - Recommendation: default to session-level (if ANY portion of the session was voice/avatar mode, vocal metrics apply to that portion's audio only, and if the whole session was ever typed at all treat Vocal as unmeasured for simplicity) — but this is a genuine design gap CONTEXT.md didn't anticipate; the planner should either confirm this default with the user or explicitly document the simplification.

5. **What band boundaries and copy for qualitative labels?**
   - What we know: CONTEXT.md leaves this to Claude's discretion; examples given are "Eye contact: strong," "Pace: slightly fast."
   - What's unclear: no existing precedent in the codebase for banding a raw percentage into qualitative labels (the rubric's `SCORE_LABELS` map in `ReportScoreCards.tsx:15-21` is the closest analog — 1-5 integer → Excellent/Strong/Solid/Developing/Needs work).
   - Recommendation: mirror that existing five-tier structure conceptually for each raw metric (e.g., eye_contact_pct: <30% "Limited", 30-50% "Developing", 50-70% "Solid", 70-85% "Strong", >85% "Excellent" — loosely centered on the prompt's own stated target of 70-80%), and have the planner treat exact cutoffs as a task-level decision documented in the plan rather than something requiring further research.

## Sources

### Primary (HIGH confidence — direct codebase reads)
- `lib/interview/prompts.ts:180-317` — evaluator prompt contract and missing-data rule
- `lib/interview/evaluation.ts` (full file) — schema, validator, coerceScore, buildUserMessage
- `lib/scenario/evaluation.ts` (full file) — parallel scenario validator
- `lib/interview/evaluation-runner.ts` (full file) — runner hardcoding null at `:93-94`
- `lib/scenario/evaluation-runner.ts` (full file) — runner correctly passing through `result.visualScore`
- `lib/interview/report-dto.ts`, `lib/scenario/report-dto.ts` (full files)
- `prisma/schema.prisma:283-380` — `InterviewReport`/`ScenarioReport` models
- `components/interview/ReportScoreCards.tsx` (full file)
- `app/interview/[type]/report/[reportId]/page.tsx`, `app/case-play/[caseId]/report/[reportId]/page.tsx` (full files) — polling mechanism
- `components/interview/InterviewSessionShell.tsx:440-540` — getUserMedia, RMS metering
- `components/HeyGenAvatar/InteractiveAvatar.tsx` (grep + partial read) — avatar video vs student video distinction
- `app/case-play/[caseId]/page.tsx` (grep) — interactionMode toggle
- `app/api/audio/transcribe/route.ts` (full file) — current STT call shape
- `app/api/interview/session/start/route.ts` (full file) — snapshot-at-creation precedent

### Secondary (MEDIUM confidence — WebSearch, cross-checked against official doc titles/URLs)
- MediaPipe Face Landmarker for Web: https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js — API shape, GPU delegate, Apache-2.0 license via npm package page (https://www.npmjs.com/package/@mediapipe/tasks-vision)
- OpenAI speech-to-text guide / API reference: https://developers.openai.com/api/docs/guides/speech-to-text and https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create — `timestamp_granularities` requires `whisper-1` + `verbose_json`; not available for `gpt-4o-transcribe`

### Tertiary (LOW confidence — flagged, not relied on for recommendations)
- None used as load-bearing claims; MediaPipe gaze-specific documentation was inconclusive in search results (official docs emphasize landmarks/blendshapes, not a dedicated "gaze" API) — see Open Question about eye-contact proxy design, addressed via head-pose/landmark heuristics rather than a claimed first-class gaze feature.

## Metadata

**Confidence breakdown:**
- Standard stack (MediaPipe, whisper-1 timestamps): MEDIUM-HIGH — verified via official docs/API reference pages found through WebSearch, not fetched in full detail nor Context7-checked (Context7 was not queried in this pass; recommend the planner do a targeted Context7/official-doc pass on `@mediapipe/tasks-vision` specifics — model asset URLs, exact `FaceLandmarker` option names — before writing code-level tasks)
- Architecture/codebase findings: HIGH — direct file reads and greps, line numbers cited
- Pitfalls: MEDIUM-HIGH — the technical-failure-vs-poor-performance discriminator is original synthesis grounded in the user's own stated rationale, not sourced from an external pattern; flagged as a proposal, not a verified best practice
- Type-cascade enumeration: HIGH — exhaustive grep across both `lib/interview/` and `lib/scenario/`, each hit read in context

**Research date:** 2026-09-21
**Valid until:** ~30 days for the codebase findings (stable unless another phase touches these files first); ~14 days for the OpenAI API capability claims (STT model capabilities have moved before and should be re-verified at plan time if this research goes stale)
