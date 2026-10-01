# Phase 12: Embodied Visual Signals - Research

**Researched:** 2026-10-01
**Domain:** In-browser pose/hand/object detection with MediaPipe Tasks Vision, extending an existing FaceLandmarker pipeline
**Confidence:** MEDIUM-HIGH (codebase facts HIGH; MediaPipe API surface HIGH via installed package + official docs; Web Worker/performance specifics MEDIUM — thin official guidance, cross-verified with one community source)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- Gesturing is scored on a three-band curve (too still / well-judged / excessive) — both extremes reportable, not a one-sided "distracting" detector.
- Stillness is a real finding, surfaced like monotone volume.
- Hands-near-face is its own distinct signal, separate from general gesticulation rate.
- Commentary wording is "describe the motion, then ask a question" — never assert an effect on the interviewer.
- Threshold values are NOT picked up front; they are Claude's discretion but must be tuned against real session recordings.
- Scoring table:
  | Signal | Treatment |
  |---|---|
  | Posture (drift) | Scored |
  | Posture (absolute reading) | Described |
  | Gesture rate / stillness | Scored |
  | Hands near face | Scored |
  | Fidgeting | Described, never scored |
  | Phone in frame | Described, never scored |
- Fidgeting is reported but never graded (overlaps with stimming/ADHD/anxiety presentations).
- Phone in frame is a factual observation ("visible for 40 seconds"), never an inference about attention or misconduct. Not scored.
- Descriptive signals live in a separate report section, never inline with scored rows carrying a "not scored" tag. The two must never share a list.
- Posture SCORE comes from drift against the student's own opening posture, never a fixed upright ideal. The absolute reading is still produced and shown, in the unscored Observations section, never as a grade.
- Partial bodies score what is visible — shoulder-line tilt and forward-head work from the upper body alone; lean and torso openness are skipped (not faked) when hips are out of frame.
- Every posture comment states which signals were available, unconditionally (not only when coverage is poor, unlike the existing coverage disclosure).
- No finer-grained opt-out. Camera on means all signals; the session-start camera decision stays the single consent surface.
- Scored body signals group under a "Body language" subheading within the visual bands, separate from camera/environment rows (Eye contact, Framing, On camera, Lighting).
- The unscored Observations section sits at the bottom of the Delivery tab, with the related delivery feedback.
- Moments rows are tagged by kind so body-language moments are distinguishable from camera/environment moments in one chronological timeline.

### Claude's Discretion

- Threshold values for every band (gesture rate, amplitude, drift magnitude, fidget frequency) — provisional, to be tuned from recorded sessions.
- The calibration window length for the posture baseline.
- Episode naming, band wording, and exact copy for the Observations section.
- Whether `HolisticLandmarker` replaces separate pose/hand runners.
- All performance work: staggered per-model sampling, the Web Worker migration.

### Deferred Ideas (OUT OF SCOPE)

- Identifying WHICH gesture was made (offensive-gesture detection). `GestureRecognizer`'s canned vocabulary is seven innocuous categories and will never flag an offensive gesture; a custom classifier needs labelled training data and is an IRB/consent conversation, not an implementation task.
- Background assessment beyond the factual half already deferred in Phase 10 — `background_environment` stays in `VISUAL_NOT_MEASURED` for the aesthetic half permanently.
- Per-signal opt-out — explicitly rejected; camera on means all signals.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-------------------|
| REQ-50 | Hand/arm movement measured via hand landmarks: gesticulation rate, amplitude, hands-above-shoulder, hands-near-face, three-band curve, hands-near-face is distinct. No effect-on-interviewer claims. Gesture vocabulary never used to claim offensive-gesture detection. | `HandLandmarker` API confirmed in installed `@mediapipe/tasks-vision@1.0.1`; landmark indices (wrist=0, fingertips) and `numHands` documented below. Amplitude/rate derivation pattern mirrors existing `movementSum`/`lastCenter` delta tracking in `visual-capture.ts`. Hands-above-shoulder requires joining hand landmarks (normalized coords) against pose shoulder landmarks (indices 11/12) — same normalized image space, so direct y-comparison is valid. |
| REQ-51 | Body posture from pose landmarks — shoulder tilt, forward-head, torso lean/openness. SCORE from drift against opening baseline, never fixed ideal. Partial body scores available landmarks; every comment states what was measured. | `PoseLandmarker` landmark indices confirmed (nose=0, shoulders=11/12, hips=23/24, ears=7/8). Each landmark carries a `visibility` score (0-1) in both `NormalizedLandmark` and world `Landmark` — this is the presence signal for "is this landmark group usable" gating described below. |
| REQ-52 | Fidgeting measured, reported, never scored. | Derivable from hand-landmark velocity/jitter in a band distinct from gross gesticulation (see "fidgeting vs gesticulation" discrimination below). Must flow through a field that `bands.ts`/`ReportBody.tsx` never score — see architecture pattern "Descriptive fields never enter a *_flags/*_pct scoring path." |
| REQ-53 | Descriptive-only signals in their own report section, never inline with scored rows. Scored body signals grouped under "Body language" subheading. | `ReportBody.tsx`'s existing tab/section structure (`SectionHeading`, `BandList`) is the direct extension point — see "Report surfacing" pattern below, which proposes a new `<section>` block under the Delivery tab, after the existing Vocal section, rather than a new tab. |
| REQ-54 | Phone in frame reported factually, never as inference about attention, never scored. | `ObjectDetector` + `efficientdet_lite0.tflite` confirmed to ship the COCO "cell phone" class (80-class COCO label set, verified via official docs). Confidence thresholding via `scoreThreshold`/`ClassifierOptions`. |
| REQ-55 | Every new signal joins the episode timeline with timecodes; no signal reported only as a session-wide average. | `VISUAL_EPISODE_KINDS`, `VisualEpisode`, `extractEpisodes`, `EPISODE_LABELS` in `bands.ts` are the exact extension points — new kinds added to the closed vocabulary, new `windowTrips` cases, no new data shape needed. |
| REQ-56 | `VISUAL_NOT_MEASURED` shrinks to exactly what remains unobservable; absence-of-flag-is-not-evidence rule survives. | `hand_gestures` and `body_posture` leave `VISUAL_NOT_MEASURED` once their pipelines ship; `fidgeting` and `phone_checking` do NOT leave it in the naive sense — they become measured-but-never-scored, which is a new third category this phase must introduce explicitly (see "Open Questions" — the current type only distinguishes measured+scored from not-measured; this phase needs measured+described-only too). |
| REQ-57 | Four models running does not degrade live session vs camera-off baseline (REQ-49 extended). | Staggered per-model sampling + Web Worker/OffscreenCanvas patterns researched below, with the one documented interop pitfall (`importScripts` vs ES module workers) called out. |
| REQ-58 | No frame/landmark array/media blob leaves the browser or outlives the tick. Server receives only derived scalars. | Existing `ingest.ts` media-shape rejection (`MEDIA_SHAPED_PATTERN`, `MAX_STRING_LENGTH`, `containsMediaShapedString`) already enforces this server-side; `visual-capture.ts`'s discipline of reducing every per-frame value to a scalar accumulator on the same tick is the client-side half to replicate for pose/hand/object producers. |
</phase_requirements>

## Summary

This phase extends `lib/metrics/visual-capture.ts`, which today runs exactly one MediaPipe model (`FaceLandmarker`) on a `setInterval` polling loop on the main thread at 6 Hz. The codebase already has every architectural precedent this phase needs: a pure-function rate/episode-extraction seam (`computeVisualRates`, `extractEpisodes`), a closed-vocabulary episode system (`VISUAL_EPISODE_KINDS`), a liveness-vs-detection split (`VisualCoverage` vs detection fields), a frozen "never measured" list (`VISUAL_NOT_MEASURED`), a qualitative-band translation layer (`lib/metrics/bands.ts`), server-side payload sanitization with media-shape rejection (`lib/metrics/ingest.ts`), and a tabbed report body with a dedicated `BandList`/`SectionHeading` pattern (`components/report/ReportBody.tsx`) ready to host a new subsection.

The installed `@mediapipe/tasks-vision@1.0.1` ships `PoseLandmarker`, `HandLandmarker`, `ObjectDetector`, and `HolisticLandmarker` — verified directly against the package's `vision.d.ts`, not assumed from training data. `HolisticLandmarker` exists but has **no `numPoses`/`numHands` option** — its result type (`HolisticLandmarkerResult`) returns at most one face/pose/pair-of-hands per call, by design (it is a "one subject" API). The existing face pipeline's primary-subject-selection discipline (`runTick`'s largest-bounding-box selection among up to 3 tracked faces) exists specifically because multiple people can be in frame and index order is not stable between frames. HolisticLandmarker cannot replicate that discipline for pose/hands because it structurally cannot track more than one person. **Recommendation: separate `PoseLandmarker` + `HandLandmarker` runners**, each configured with multi-subject tracking (`numPoses`/`numHands` > 1) and the same largest-bounding-box primary-subject selection already proven for faces.

Running four MediaPipe models (face, pose, hands, object) on one `setInterval` at 6 Hz each is almost certainly too much main-thread work to coexist with the HeyGen WebRTC avatar stream — this is flagged explicitly in the phase context as a prerequisite, not an optimization, and the research here confirms there is no official MediaPipe guidance on multi-task concurrency or Web Worker patterns; one community write-up (`ankdev.me`) documents a real interop pitfall: the tasks-vision bundle calls `importScripts()` internally, which throws inside an ES-module (`type: "module"`) Worker and requires a classic worker + bundler workaround. `stop()` on the capture engine is currently synchronous; moving inference off-thread makes teardown inherently asynchronous (the worker must be told to close the landmarker and the message round-trip awaited), which is a breaking call-site change at both `InterviewSessionShell.tsx:854` and `app/case-play/[caseId]/page.tsx:428` — both currently call `visualCaptureRef.current?.stop()` synchronously alongside an `await`ed `vocalCaptureRef.current?.drain()`. The vocal pipeline's `drain(timeoutMs)` — a bounded `Promise.race` against a timeout — is the exact pattern to mirror for an async `stop()`.

**Primary recommendation:** Add `PoseLandmarker` and `HandLandmarker` (not `HolisticLandmarker`) as separate runners, each with multi-subject detection and primary-subject selection mirroring the existing face code; add `ObjectDetector` with `efficientdet_lite0.tflite` for phone detection; move all four models' inference into a Web Worker using `OffscreenCanvas`/`ImageBitmap` frame transfer with staggered per-model ticks (not all four every tick), and make `stop()` return a `Promise` with a bounded drain, updating both finish-path call sites. Prove the frame budget against a live HeyGen session before layering on report/scoring work.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|---------------|
| `@mediapipe/tasks-vision` | 1.0.1 (already installed, no new dependency) | `PoseLandmarker`, `HandLandmarker`, `ObjectDetector` | Already the vendored dependency for `FaceLandmarker`; confirmed via `node_modules/@mediapipe/tasks-vision/vision.d.ts` that all three additional classes exist in this exact installed version — no upgrade needed. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Web Worker (native) | n/a | Move per-tick inference off the main thread | Required once a second model is added — REQ-57's frame budget cannot be met with four synchronous `detectForVideo` calls per tick on the main thread alongside WebRTC decode/render. |
| `OffscreenCanvas` + `ImageBitmap` | native | Transfer video frames into the worker without copying the whole frame repeatedly | `createImageBitmap(videoEl)` on the main thread, `postMessage` the bitmap (transferable), `close()` after use — matches the one working community pattern found. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Separate `PoseLandmarker` + `HandLandmarker` | `HolisticLandmarker` | Holistic bundles face+pose+hands in one model call (cheaper than three separate `detectForVideo` calls) but has no multi-person option — `HolisticLandmarkerResult.poseLandmarks`/`leftHandLandmarks`/`rightHandLandmarks` are each `NormalizedLandmark[][]` but the model only ever tracks one subject. Given flag #5 in the phase context (primary-subject selection must extend to pose/hands for the same reason it exists for faces), Holistic is structurally unable to satisfy that requirement in a room with more than one person. Also, Holistic still requires its own `FaceLandmarker`-equivalent internally, so it does not even dodge the "N models" cost — it would still be a *fifth* model loaded alongside the existing separate `FaceLandmarker`, or would require retiring the existing face runner and inheriting Holistic's single-subject face tracking, which regresses the existing `multiple_faces_detected` flag's reliability. |
| `efficientdet_lite0.tflite` (COCO, 80 classes incl. "cell phone") | `efficientdet_lite2` or `ssd_mobilenetv2` | Lite2 is more accurate but slower/heavier; MobileNetV2 is faster/lighter but less accurate. Lite0 is Google's own "recommended" default and is the model already named in the phase's flags-for-planner section (~4.4MB), so no reason to deviate. |
| Classic Worker + `importScripts` | ES-module (`type: "module"`) Worker with bundled import | The tasks-vision UMD bundle (`vision_bundle.js`) is built to be loaded via `importScripts()`; a `type: "module"` worker that tries `import "@mediapipe/tasks-vision"` can fail depending on bundler config (per the one community source found — flagged LOW/MEDIUM, single source, not officially documented). Verify directly against this project's Next.js/webpack worker bundling before committing; this is the single highest-risk unknown in the whole phase. |

**Installation:**
No `npm install` needed — `@mediapipe/tasks-vision@1.0.1` is already a dependency and already exports `PoseLandmarker`, `HandLandmarker`, `ObjectDetector`. New model asset files must be vendored into `public/mediapipe/`, matching the existing `face_landmarker.task` convention:
```
public/mediapipe/hand_landmarker.task        (~8MB — per phase flags, unverified exact size from docs)
public/mediapipe/pose_landmarker_lite.task   (~6MB — per phase flags, unverified exact size from docs)
public/mediapipe/efficientdet_lite0.tflite   (~4.4MB — per phase flags, unverified exact size from docs)
```
Note: official MediaPipe docs for both `pose_landmarker` and `hand_landmarker` do not publish exact file sizes in the fetched pages — the ~8MB/~6MB/~4.4MB figures come from the phase context's own flags-for-planner section (treat as MEDIUM confidence, likely sourced from the actual Google Storage model files at task-creation time; verify by downloading and checking `ls -la` once vendored).

## Architecture Patterns

### Recommended Project Structure

No new top-level structure needed — this phase extends existing files:
```
lib/metrics/
├── visual-capture.ts     # Add pose/hand/object runners alongside the existing
│                         # FaceLandmarker runner; move shared tick-loop logic
│                         # into (or behind) a worker boundary.
├── types.ts              # Extend VisualMetrics, VISUAL_EPISODE_KINDS,
│                         # VISUAL_NOT_MEASURED, add a new "measured but
│                         # never scored" vocabulary (see Open Questions).
├── bands.ts              # Add band functions for gesture rate, hands-near-face,
│                         # posture drift; add a *separate, unscored* rendering
│                         # path for fidgeting/phone that never flows through
│                         # a scoring band function.
├── ingest.ts             # Extend sanitizers for new fields, same allowlist
│                         # pattern as sanitizePostureFlags/sanitizeEpisodes.
└── visual-capture.worker.ts   # NEW — if Web Worker migration proceeds.

components/report/ReportBody.tsx     # Add "Body language" SectionHeading
                                      # under Delivery tab; add Observations
                                      # section at the bottom of Delivery tab.
components/metrics/DeliveryTimeline.tsx  # MomentsPanel already generic over
                                      # VisualEpisode — new kinds slot in free,
                                      # but needs a "kind tag" for REQ-55's
                                      # "tagged by kind" requirement.
public/mediapipe/
├── hand_landmarker.task        # NEW
├── pose_landmarker_lite.task   # NEW
└── efficientdet_lite0.tflite   # NEW
```

### Pattern 1: Primary-subject selection extended to pose and hands

**What:** The existing `boundsOf()` + largest-bounding-box selection in `runTick` (visual-capture.ts:688-705) must be replicated independently for `PoseLandmarker` and `HandLandmarker` results, because `numPoses`/`numHands` > 1 returns an array whose index order is not guaranteed stable frame-to-frame (same reason documented in the existing face code's comment).

**When to use:** Any tick where more than one pose or more than one pair of hands is detected.

**Example (pattern to follow, not existing code):**
```typescript
// Source: pattern extrapolated from lib/metrics/visual-capture.ts:688-705
// (HIGH confidence this pattern is correct for this codebase; the specific
// pose/hand code below does not exist yet)
let primaryPoseIndex = 0;
let primaryPoseBounds = boundsOf(poseResult.landmarks[0]);
for (let i = 1; i < poseResult.landmarks.length; i++) {
  const candidate = boundsOf(poseResult.landmarks[i]);
  if (candidate.area > primaryPoseBounds.area) {
    primaryPoseIndex = i;
    primaryPoseBounds = candidate;
  }
}
```
Open question: does the "primary pose" need to be cross-referenced against the "primary face" (e.g. by spatial overlap) so a session with two people doesn't silently measure one person's face and a different person's posture? The existing face selection has no analog to coordinate against yet — flagged below under Open Questions.

### Pattern 2: Landmark `visibility` as the partial-body gate (REQ-51)

**What:** `NormalizedLandmark` and world `Landmark` both carry a `visibility: number` field (0-1) — "the likelihood of the landmark being visible within the image" — confirmed directly in `vision.d.ts`. This is the mechanism for "a partially visible body is scored on the landmarks that ARE available."

**When to use:** Before deriving any posture metric, check `visibility` on the specific landmarks that metric needs (e.g. shoulder-line tilt needs landmarks 11 and 12 above some visibility floor; torso lean/openness needs hips 23/24, which a head-and-shoulders webcam frame will usually not have visible — expect `visibility` near 0 for those, which is exactly the signal to skip that metric rather than fake it).

```typescript
// Pattern — landmark indices confirmed via official MediaPipe pose_landmarker docs:
// 0 = nose, 7/8 = ears, 11/12 = shoulders, 23/24 = hips.
const SHOULDER_VISIBILITY_FLOOR = 0.5; // provisional — tune from recordings
const leftShoulder = poseLandmarks[primaryPoseIndex][11];
const rightShoulder = poseLandmarks[primaryPoseIndex][12];
const shoulderLineMeasurable =
  leftShoulder.visibility >= SHOULDER_VISIBILITY_FLOOR &&
  rightShoulder.visibility >= SHOULDER_VISIBILITY_FLOOR;
```
This same `visibility` field is what REQ-51's "every posture comment states which signals were available" should be built on: accumulate, per session, which landmark groups ever cleared the floor, and always report that set — unconditionally, unlike the existing `isPoorVisualCoverage` disclosure which is conditional.

### Pattern 3: Posture drift against a self-calibrated baseline, not a fixed ideal

**What:** REQ-51 requires the SCORE to come from drift against the student's OWN opening posture. This has no existing precedent in the codebase (the current `high_head_movement` flag is a frame-to-frame movement-delta threshold, not a baseline-drift measurement) — it is new logic.

**Recommended shape:** During a calibration window at session start (length is Claude's discretion — the vocal pipeline has no equivalent precedent; a reasonable default is the first 10-20 seconds of session, mirroring how `eye_contact_pct`'s forward-cone thresholds were chosen as fixed constants but giving posture its own per-session zero-point), average the measurable landmark-derived angles (shoulder-line tilt angle, forward-head offset) to produce a baseline vector. Every subsequent window's reading is then a *delta* from that baseline, and the scored metric is the magnitude/duration of drift away from it — never the absolute angle.

```typescript
// Pattern — no existing code to cite; new logic needed.
interface PostureBaseline {
  shoulderTiltDeg: number | null;   // null if shoulders never visible in the window
  forwardHeadOffset: number | null; // null if nose/ear landmarks never visible
  capturedAtS: number;
}
// Baseline is computed once, from the calibration window; drift is
// abs(current - baseline) per sample, aggregated into windows exactly like
// the existing CaptureWindow/extractEpisodes machinery, with a new
// VisualEpisodeKind (e.g. "posture_drift") using baseline-relative thresholds
// instead of visual-capture.ts's existing fixed thresholds.
```
This parallels `eye_contact_pct`'s existing head-pose-proxy caveat in `prompts.ts` — the report commentary must describe this as drift from the SESSION'S OWN opening reading, not an absolute ergonomic judgment, mirroring the existing "NOT pupil tracking" discipline already enforced for eye contact.

### Pattern 4: New episode kinds and window-trip functions (REQ-55)

**What:** `VISUAL_EPISODE_KINDS`, `windowTrips()`, and `extractEpisodes()` in `visual-capture.ts`/`bands.ts` are a closed, generic system — adding a kind means (1) extending the `VISUAL_EPISODE_KINDS` tuple in `types.ts`, (2) adding a `case` to `windowTrips()`, (3) adding a label to `EPISODE_LABELS` in `bands.ts`, (4) extending `sanitizeEpisodes`'s allowlist in `ingest.ts` (it already reads `VISUAL_EPISODE_KINDS` directly, so step 1 covers it automatically).

**Candidate new kinds:** `excessive_gesturing`, `stillness` (two ends of REQ-50's curve — note these cannot both be represented by one threshold direction the way `high_movement` is a one-sided threshold today), `hands_near_face`, `posture_drift`, `phone_visible`, `fidgeting` (descriptive-only — see Pattern 5 for why this one must NOT flow through the same scoring path even though it reuses the episode *data shape*).

**Anti-pattern to avoid:** Do not give `fidgeting`/`phone_visible` episodes a `severity` field that implies gradation toward a score — `severity` in the existing type is "fraction of windows that tripped," which is fine as a *descriptive* intensity measure, but nothing downstream must ever multiply it into a scoring formula. The type system does not currently prevent this; it is a discipline to enforce in new code and call out in a comment the way `VISUAL_NOT_MEASURED`'s header comment does.

### Pattern 5: Descriptive-only fields must be structurally unreachable from scoring

**What:** REQ-52/53/54 require fidgeting and phone-in-frame to be reported but **never scored**, and never rendered inline with scored rows. The existing codebase's analogous discipline is the `VisualCoverage` sub-object — `resolveVisualOutcome` in `coverage.ts` is documented to read ONLY the liveness block, never the detection fields, specifically so "no future edit can accidentally derive scorability from a detection ratio." The same discipline needs a new instance: a `VisualDescriptiveObservations` (or similarly named) sub-object on `VisualMetrics`, structurally separate from the scored fields, that `visualBands()` (the ONLY place qualitative-band translation happens, per its own header comment) never reads, and that `ReportBody.tsx` renders from a different function than `visualBands()`/`BandList`.

**Why this matters more than usual:** the phase's own specifics note an earlier real failure mode — an absence of flags being read as "verified clean" — and the scoring/descriptive split is explicitly the mechanism preventing a new, inverted version of that failure (an unscored observation being misread as a deduction). Keeping scored and descriptive fields in genuinely separate TypeScript types (not just separate array entries in one list) makes "accidentally scored" and "accidentally rendered inline" both a compile-time impossibility rather than a discipline to remember.

### Anti-Patterns to Avoid

- **Treating `HolisticLandmarker` as a drop-in multi-model replacement:** it cannot track more than one subject; using it would silently regress the multi-person discipline the existing face code already has.
- **Giving fidgeting a numeric score "just for internal use" that later leaks into a band function:** the architecture must make this impossible by type, not by comment, given how the existing `not_measured` mechanism exists precisely because a softer discipline (just not mentioning it) already failed once in production.
- **Running all four models every tick:** the phase context explicitly flags staggering as a prerequisite. A reasonable default pattern (unverified against a live session — must be proven per REQ-57): round-robin one model per tick at the existing 6 Hz cadence, i.e. each individual model effectively samples at 1.5 Hz, rather than all four at 6 Hz. This trades temporal resolution per-model for total main-thread cost — acceptable for window/episode aggregation at `EPISODE_WINDOW_SECONDS = 5`s granularity, but must be validated empirically.
- **Synchronous `stop()` after introducing a worker:** a worker-backed landmarker cannot be torn down synchronously (the close message must round-trip). Both call sites (`InterviewSessionShell.tsx:854`, `case-play/[caseId]/page.tsx:428`) currently assume `stop()` returns `VisualMetrics | null` synchronously — this must become `Promise<VisualMetrics | null>`, following the exact bounded-timeout pattern already proven in `vocal-capture.ts`'s `drain(timeoutMs)`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Multi-person pose/hand tracking | A custom person-tracker/re-identification layer | `PoseLandmarker`/`HandLandmarker` with `numPoses`/`numHands` > 1 + the existing largest-bounding-box selection pattern | Already solved for faces in this exact codebase; replicate, don't reinvent. |
| Phone/object detection | A custom classifier trained on frames | `ObjectDetector` + `efficientdet_lite0.tflite` (COCO "cell phone" class, confirmed via official docs) | Zero training data needed; ships in the already-installed package version. |
| Cross-tab/frame transfer to a worker | Custom binary frame serialization | `createImageBitmap()` + transferable `postMessage` | Standard browser API, confirmed working pattern from the one community source found; avoids base64/data-URL encoding, which would also violate REQ-58's media-shape discipline if it ever leaked server-side. |

**Key insight:** every piece of new inference infrastructure this phase needs (multi-subject detection, visibility/presence gating, object classification) is already exposed by the installed `@mediapipe/tasks-vision@1.0.1` package — nothing here requires training a model or writing inference code from scratch. The actual hard problems are (1) the frame-budget/threading work (REQ-57), which has no official MediaPipe guidance and only one community precedent, and (2) the posture-baseline/drift logic (REQ-51), which has no precedent anywhere in this codebase or in MediaPipe's own docs (MediaPipe gives you landmarks; the self-calibration design is domain logic this phase must originate).

## Common Pitfalls

### Pitfall 1: `importScripts` incompatibility with ES-module Workers
**What goes wrong:** Loading `@mediapipe/tasks-vision` inside a `type: "module"` Worker can fail because the library's bundle calls `importScripts()` internally, which is only valid in classic (non-module) workers.
**Why it happens:** The tasks-vision JS bundle predates widespread module-worker adoption and ships a UMD-style loader path.
**How to avoid:** Prototype the worker loading path FIRST, in isolation, before building any detection logic inside it. If the ES-module worker path fails, fall back to a classic worker (`new Worker(url)` without `{ type: "module" }`) and bundle accordingly — verify against this project's actual Next.js/webpack worker-bundling setup, since behavior here is bundler-dependent and the one source found is a single blog post (MEDIUM/LOW confidence, not officially documented by Google).
**Warning signs:** `Failed to execute 'importScripts'` in the worker's console; the worker silently never resolves `createFromOptions`.

### Pitfall 2: `stop()` becoming async breaks both finish-path call sites
**What goes wrong:** If `visual-capture.ts`'s `stop()` is changed from synchronous to `Promise`-returning (required once teardown involves a worker round-trip) without updating call sites, TypeScript will catch the type mismatch, but a careless fix (e.g. a fire-and-forget `.then()`) could let the finish POST race ahead of the worker actually closing, or could silently drop the final metrics object.
**Why it happens:** Both `InterviewSessionShell.tsx:854` and `case-play/[caseId]/page.tsx:428` currently do `visual = visualCaptureRef.current?.stop() ?? null;` with no `await`, directly adjacent to an `await`ed `vocalCaptureRef.current?.drain()`.
**How to avoid:** Change the signature to `stop(timeoutMs?: number): Promise<VisualMetrics | null>`, mirroring `vocal-capture.ts`'s `drain(timeoutMs)` bounded-race pattern exactly, and add `await` at both call sites in the same change. Grep for `visualCaptureRef.current?.stop()` before considering this done — there are exactly two call sites in the current codebase (confirmed via `grep -rn "stop()\|drain()"`).
**Warning signs:** A finish POST that includes `visual: null` on sessions where the camera was clearly on and working throughout.

### Pitfall 3: Posture "fixed ideal" creeping back in through band thresholds
**What goes wrong:** `bands.ts`'s existing pattern is literal fixed-threshold bands (e.g. `bandFraming` cuts at 40/65/80/92). It would be natural, but wrong per REQ-51, to write a `bandPosture(absoluteShoulderTiltDeg)` function using the same fixed-cutoff pattern as every other band function in the file.
**Why it happens:** Every other metric in this codebase uses fixed-threshold bands; posture is the first metric whose SCORE must be baseline-relative, which is a genuinely different shape of function (two inputs — baseline and current — not one).
**How to avoid:** Write `bandPostureDrift(driftMagnitude, driftDurationS)` (baseline-relative, scored) as a clearly distinct function from `describePostureAbsolute(shoulderTiltDeg, visibilityGate)` (absolute, descriptive-only, feeding the Observations section, never the Body language score rows).
**Warning signs:** A `bandPosture` function that takes only one raw percentage/degree argument, with no baseline parameter — that is the fixed-ideal anti-pattern re-appearing.

### Pitfall 4: GPU delegate contention across four concurrent models
**What goes wrong:** The existing engine already falls back from GPU to CPU delegate per-model (`initLandmarker("GPU")` → catch → `initLandmarker("CPU")`), with an explicit comment that CPU inference "competes with the live WebRTC avatar stream for the main thread." Four models each independently attempting GPU delegate could contend with each other AND with WebRTC decode, even if each individually falls back gracefully.
**Why it happens:** `BaseOptions.delegate` is per-model-instance; there is no cross-model coordination in the MediaPipe API, and MediaPipe's own benchmark data (confirmed via official docs) shows meaningful CPU-vs-GPU latency gaps (e.g. hand landmarker: 17.12ms CPU vs 12.27ms GPU on a Pixel 6 reference device) — multiply that by four models and the cost is non-trivial regardless of delegate choice.
**How to avoid:** This is exactly why REQ-57 demands staggering rather than four simultaneous `detectForVideo` calls per tick, and why the phase context calls proving the budget against a live session a prerequisite, not an optimization. No shortcut here — measure before committing to per-model Hz.
**Warning signs:** HeyGen avatar stutter or audio dropout that only appears once a second/third/fourth model is added, even though each model independently reports successful GPU delegate init.

### Pitfall 5: `fidgeting` discrimination from gross gesticulation
**What goes wrong:** REQ-50's gesture-rate/amplitude curve and REQ-52's fidgeting are conceptually different motions (purposeful gesture vs. small repetitive self-touch/fiddling) but both derive from the same `HandLandmarker` output stream, risking one signal accidentally feeding the other's threshold logic, or risking a session simply being unable to tell them apart.
**Why it happens:** Both are "hand landmark movement over time" at the data-source level; the difference is in the pattern of movement (gross amplitude/frequency vs. small-amplitude/high-frequency jitter, often near the body or face), which is a design decision this phase must make explicitly, not something MediaPipe distinguishes for you.
**How to avoid:** Define fidgeting as a DISTINCT frequency/amplitude band from gesticulation (e.g. high-frequency, low-amplitude hand-landmark jitter, independent of whether hands are raised) rather than as "gesticulation above some additional threshold" — conflating the two risks a to-be-scored gesture rate quietly absorbing fidget motion into its average, or a fidget signal silently gating/suppressing the gesture-rate score. Keep the two counters structurally independent from the first line of accumulator code, the same way `speakingSamples`/`listeningSamples` are independent counters rather than derived from each other.
**Warning signs:** Fidgeting and gesture-rate bands that are suspiciously correlated 1:1 across test sessions — a sign the two are actually measuring the same underlying motion.

## Code Examples

### Confirming the installed package's available classes (ran directly against this repo)
```bash
# Source: direct inspection, this repo's node_modules
grep -o "export declare class [A-Za-z]*" node_modules/@mediapipe/tasks-vision/vision.d.ts | sort -u
# → DrawingUtils, FaceDetector, FaceLandmarker, FilesetResolver,
#   GestureRecognizer, HandLandmarker, HolisticLandmarker, ImageClassifier,
#   ImageEmbedder, ImageSegmenter, ImageSegmenterResult,
#   InteractiveSegmenter, InteractiveSegmenterLegacy,
#   InteractiveSegmenterLegacyResult, MPImage, MPMask, ObjectDetector,
#   PoseLandmarker, PoseLandmarkerResult
```

### `NormalizedLandmark`/`Landmark` carry a `visibility` field (the partial-body gate)
```typescript
// Source: node_modules/@mediapipe/tasks-vision/vision.d.ts:2425-2434 (normalized)
//         node_modules/@mediapipe/tasks-vision/vision.d.ts:2141-2150 (world)
export declare interface NormalizedLandmark {
    x: number;
    y: number;
    z: number;
    /** The likelihood of the landmark being visible within the image. */
    visibility: number;
}
```

### `HolisticLandmarkerOptions` has no `numPoses`/`numHands` (the disqualifying fact)
```typescript
// Source: node_modules/@mediapipe/tasks-vision/vision.d.ts:1293-1333
export declare interface HolisticLandmarkerOptions extends VisionTaskOptions {
    minFaceDetectionConfidence?: number | undefined;
    minFaceSuppressionThreshold?: number | undefined;
    minFacePresenceConfidence?: number | undefined;
    outputFaceBlendshapes?: boolean | undefined;
    minPoseDetectionConfidence?: number | undefined;
    minPoseSuppressionThreshold?: number | undefined;
    minPosePresenceConfidence?: number | undefined;
    outputPoseSegmentationMasks?: boolean | undefined;
    minHandLandmarksConfidence?: number | undefined;
    // No numPoses, no numHands, no numFaces — single-subject by construction.
}
```

### `PoseLandmarkerOptions`/`HandLandmarkerOptions` DO have multi-subject options
```typescript
// Source: node_modules/@mediapipe/tasks-vision/vision.d.ts:2696-2719, 1012-1033
export declare interface PoseLandmarkerOptions extends VisionTaskOptions {
    numPoses?: number | undefined; // Defaults to 1.
    minPoseDetectionConfidence?: number | undefined;
    minPosePresenceConfidence?: number | undefined;
    minTrackingConfidence?: number | undefined;
    outputSegmentationMasks?: boolean | undefined;
}
export declare interface HandLandmarkerOptions extends VisionTaskOptions {
    numHands?: number | undefined; // Defaults to 1.
    minHandDetectionConfidence?: number | undefined;
    minHandPresenceConfidence?: number | undefined;
    minTrackingConfidence?: number | undefined;
}
```

### Worker frame-transfer pattern (the one working community precedent)
```javascript
// Source: https://ankdev.me/blog/how-to-run-mediapipe-task-vision-in-a-web-worker
// (MEDIUM confidence — single blog source, not an official doc; verify
// against this project's bundler before relying on it)
// Main thread:
const image = await createImageBitmap(video);
worker.postMessage({ type: "detect", payload: { image } }, [image]); // transfer
// image.close() happens worker-side after use, or main-thread if not transferred.

// Inside the worker (classic, non-module, due to importScripts requirement):
importScripts("path/to/vision_bundle.js"); // NOT `import` — this is the pitfall
const vision = await FilesetResolver.forVisionTasks(wasmPath);
const poseLandmarker = await PoseLandmarker.createFromOptions(vision, { ... });
// on message: const result = poseLandmarker.detectForVideo(imageBitmap, timestamp);
// postMessage({ type: "detect", payload: { result } }) back to main thread —
// result must already be reduced to scalars before it crosses back, per
// REQ-58's "no landmark array outlives the tick" discipline.
```

### `vocal-capture.ts`'s bounded-drain pattern — the model for an async `stop()`
```typescript
// Source: lib/metrics/vocal-capture.ts:378-397 (existing, verified in this repo)
async function drain(
  timeoutMs: number = DEFAULT_DRAIN_TIMEOUT_MS
): Promise<VocalMetrics | null> {
  if (!everAttached && !everRecordedTurn) return null;
  const pendingList = Array.from(pending);
  if (pendingList.length > 0) {
    await Promise.race([
      Promise.allSettled(pendingList),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }
  // Anything not settled by now is simply not merged — never thrown, never
  // a blocked End button.
  return { /* ...scalars... */ };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---------------|-------------------|---------------|--------|
| One model (`FaceLandmarker`), synchronous main-thread `setInterval` loop | Four models, staggered, worker-backed | This phase | `stop()` signature changes from sync to async; both finish-path call sites must add `await`. |
| `VisualMetrics` fields are either scored or fully absent (`not_measured`) | A third category needed: measured-but-never-scored (fidgeting, phone) | This phase | `VISUAL_NOT_MEASURED`'s binary (measured-and-scored vs never-measured) no longer covers the full space; see Open Questions below — this is a type-contract decision, not just a UI decision. |

**Deprecated/outdated:**
- Nothing in the existing Phase 10 contract is deprecated by this phase per CONTEXT.md ("not a rewrite"); it is additive.

## Open Questions

1. **How does `VISUAL_NOT_MEASURED`'s binary model extend to "measured but never scored"?**
   - What we know: REQ-56 says `VISUAL_NOT_MEASURED` shrinks to exactly what remains unobservable, and `fidgeting`/`phone_checking` currently sit in that list. Once this phase ships, both ARE observable — so by REQ-56's own rule they must leave `VISUAL_NOT_MEASURED`. But REQ-52/54 say they are never scored.
   - What's unclear: the current type system only has `VisualPostureFlag` (scored-ish, closed vocabulary) and `VisualNotMeasured` (never touched). There is no existing third type for "measured, reported, structurally prevented from being scored." The planner needs to decide the exact shape — e.g. a new `VisualDescriptiveObservations` interface with its own fields (`fidget_pct`, `fidget_episodes`, `phone_visible_seconds`, `phone_episodes`), kept in `VisualMetrics` but never read by `visualBands()`.
   - Recommendation: design this type split before writing any plan tasks for REQ-52/54, since it is the structural guarantee REQ-53 depends on ("must never share a list" is much easier to guarantee if they are never in the same TypeScript array to begin with).

2. **Does the "primary pose/hands" selection need to agree with the "primary face" selection?**
   - What we know: the existing face selection picks the largest bounding box among up to 3 tracked faces each tick, independently per tick.
   - What's unclear: if pose and hand selection each independently pick their own "largest" candidate, a session with two people could, in principle, measure person A's face but person B's posture in the same tick (unlikely given bounding-box area correlates with camera proximity, but not structurally guaranteed). No existing code addresses cross-model subject identity.
   - Recommendation: for v1, accept this risk (it directly mirrors the acceptable-risk framing the existing face code already uses — "largest is a reasonable proxy for who's at the machine") and flag it in the final plan rather than building spatial cross-referencing, which would be new complexity for a `MULTIPLE_FACES_RATIO_THRESHOLD`-scale edge case (10% of sessions even have two people; the chance of the WRONG one being the larger candidate in only one modality is smaller still).

3. **Exact model asset file sizes and CDN/version pinning.**
   - What we know: the phase context names `hand_landmarker.task` (~8MB), `pose_landmarker_lite.task` (~6MB), `efficientdet_lite0.tflite` (~4.4MB) as approximate sizes, with the direction to vendor into `public/mediapipe/` matching the existing `face_landmarker.task` convention. Official MediaPipe docs fetched during this research did not publish exact byte sizes for pose/hand models.
   - What's unclear: exact byte sizes, and whether model version pinning (MediaPipe periodically updates `_lite`/`_full`/`_heavy` model files) needs any lockfile-equivalent beyond "download once, commit the binary."
   - Recommendation: download the three files, `ls -la` them, and commit the exact URLs used into a comment near the vendored files (matching whatever convention — if any — documents `face_landmarker.task`'s origin; this research did not find an existing provenance comment for that file, so establishing one now for all four models would be a reasonable addition).

4. **Does the ES-module-worker `importScripts` pitfall actually reproduce in THIS project's Next.js/webpack setup?**
   - What we know: one blog post describes hitting this error and working around it with a classic worker + `importScripts`.
   - What's unclear: Next.js's worker bundling (via Webpack 5's `new Worker(new URL(...))` pattern, or Turbopack, whichever this project uses) may or may not hit the same failure — this is bundler-specific and the research found no second source confirming or denying it for a Next.js context specifically.
   - Recommendation: this is explicitly flagged as the prototype-first step in Pitfall 1 above — spike the worker-loading path in isolation before any detection logic is written against it.

## Sources

### Primary (HIGH confidence)
- `node_modules/@mediapipe/tasks-vision/vision.d.ts` (installed package, version 1.0.1) — confirmed `PoseLandmarker`, `HandLandmarker`, `ObjectDetector`, `HolisticLandmarker` all exist; confirmed `HolisticLandmarkerOptions` has no `numPoses`/`numHands`; confirmed `NormalizedLandmark`/`Landmark` carry `visibility`; confirmed `BaseOptions.delegate: "CPU" | "GPU"`.
- This repo's `lib/metrics/visual-capture.ts`, `lib/metrics/types.ts`, `lib/metrics/ingest.ts`, `lib/metrics/bands.ts`, `lib/metrics/coverage.ts`, `components/report/ReportBody.tsx`, `components/metrics/DeliveryTimeline.tsx`, `lib/interview/prompts.ts`, `lib/report/structured.ts`, `lib/metrics/vocal-capture.ts`, `components/interview/InterviewSessionShell.tsx`, `app/case-play/[caseId]/page.tsx` — read directly, line numbers cited inline above.
- https://developers.google.com/edge/mediapipe/solutions/vision/object_detector — confirmed EfficientDet-Lite0/Lite2/SSD-MobileNetV2 model options, confirmed COCO 80-class label set includes "cell phone", confirmed `score_threshold` has no hardcoded default ("overrides model metadata").

### Secondary (MEDIUM confidence)
- https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker — pose landmark indices (0=nose, 7/8=ears, 11/12=shoulders, 23/24=hips) confirmed; exact model file sizes NOT found in fetched content; explicitly states no guidance on concurrent task execution/workers.
- https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker — `numHands` default of 1 confirmed; CPU/GPU latency benchmark (17.12ms/12.27ms on Pixel 6) confirmed; exact model file size NOT found in fetched content; no Web Worker guidance found.
- https://ankdev.me/blog/how-to-run-mediapipe-task-vision-in-a-web-worker — single-source, unofficial: `ImageBitmap` frame-transfer pattern, `importScripts` vs ES-module-worker incompatibility, full worker-side initialization pattern. Treat the `importScripts` claim as needing verification against this project's actual bundler before committing to a workaround.

### Tertiary (LOW confidence)
- Phase context's own stated model sizes (~8MB hand, ~6MB pose-lite, ~4.4MB efficientdet-lite0) — plausible and specific enough to suggest a real prior check, but not independently re-verified by this research pass against the actual Google Storage model files.

## Metadata

**Confidence breakdown:**
- Standard stack (which MediaPipe classes exist, in this exact installed version): HIGH — verified directly against the installed `.d.ts`, not training-data recall.
- HolisticLandmarker vs separate runners recommendation: HIGH — the disqualifying fact (no multi-subject option) is directly in the type definitions, not inferred.
- Architecture patterns extending existing codebase conventions (episodes, bands, coverage split, async stop()): HIGH — all derived from reading the actual existing source files, which are unusually well-commented about their own design rationale.
- Web Worker / OffscreenCanvas / staggered-sampling specifics: MEDIUM — official MediaPipe docs explicitly have no guidance here; one community source found and cross-checked for internal consistency, but not a second independent source.
- Posture baseline/drift calibration-window length and all provisional thresholds: LOW/not applicable — explicitly Claude's discretion per CONTEXT.md, and explicitly required to be tuned from real recordings rather than researched; this document does not invent specific numbers for gesture-rate/amplitude/drift/fidget thresholds because CONTEXT.md is explicit that picking them up front would be the wrong move.

**Research date:** 2026-10-01
**Valid until:** 30 days for the codebase-facts portions (stable unless Phase 10/11 code changes); 90 days for the MediaPipe API-surface portions (a pinned dependency version, `1.0.1`, won't change under this project without an explicit upgrade decision).
