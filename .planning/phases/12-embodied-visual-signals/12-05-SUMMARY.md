---
phase: 12-embodied-visual-signals
plan: 05
subsystem: visual-capture-threading
tags: [web-worker, mediapipe, pose-landmarker, hand-landmarker, object-detector, frame-budget]

# Dependency graph
requires:
  - phase: 12-embodied-visual-signals
    plan: 03
    provides: "ES-module Web Worker host for @mediapipe/tasks-vision, one-outstanding-request back-pressure, staggered SCHEDULE array, GPU-then-CPU fallback, frame-budget instrumentation"
provides:
  - "PoseLandmarker, HandLandmarker, and ObjectDetector runners inside the worker, each scalar-only (REQ-58) with largest-bounding-box primary-subject selection and per-metric visibility gating"
  - "Four vendored model files under public/mediapipe/ with recorded provenance (MODELS.md)"
  - "Four-tenant staggered schedule (face 3 Hz, pose/hands 1.5 Hz, object on its own independent 0.5 Hz timer) with independent per-model accumulators for gesture, fidget, posture, and phone raw material"
  - "Schedule-aware processed/expected sample accounting, proven live not to starve the visual block even when face is a minority share of the tick stream"
  - "A live-verified four-model frame budget: 99.9% capture, 1 dropped tick out of 1313, no perceptible session degradation"
affects: [12-embodied-visual-signals, visual-capture, performance]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A detection-time filter (visibility floor, score threshold, proximity radius) may live in the worker even though scoring thresholds must stay on the main thread — the distinction is whether the constant decides a SCORE or only whether a reading can be produced at all."
    - "A model whose own round-trip occupies a large fraction of the tick budget blocks every OTHER model's reply too, because the worker is a single JS thread — pulling an expensive, low-resolution-need model off the shared high-frequency schedule onto its own slower independent timer removes that blocking source entirely rather than just moving it around."
    - "Any diagnostic figure computed from a bounded ring buffer and any figure computed from an unbounded running sum must be re-examined together the moment the session stops being stationary (e.g. a warm-up cost that front-loads expense) — a bounded window and an unbounded one can silently disagree even though both are 'obviously correct' in isolation."
    - "A pure-function regression test (resolveVisualOutcome fed a schedule-shaped coverage block) can catch a schedule/accounting bug that is otherwise only reachable through a live camera session."

key-files:
  created:
    - public/mediapipe/pose_landmarker_lite.task
    - public/mediapipe/hand_landmarker.task
    - public/mediapipe/efficientdet_lite0.tflite
    - public/mediapipe/MODELS.md
  modified:
    - lib/metrics/visual-capture.worker.ts
    - lib/metrics/visual-capture.ts
    - scripts/verify-visual-metrics.ts

key-decisions:
  - "Pose and hands are separate PoseLandmarker/HandLandmarker runners, not HolisticLandmarker, because the installed @mediapipe/tasks-vision@1.0.1 exposes no numPoses/numHands on HolisticLandmarkerOptions — confirmed during planning, not re-derived here."
  - "Object (phone) detection was pulled OUT of the shared 6 Hz SCHEDULE onto its own independent 2000ms (0.5 Hz) timer after the first live checkpoint showed it was the single most expensive model (126.5ms mean, 76% of one tick) and, because the worker is one JS thread, was blocking every other model's reply while it ran — that run's 52 dropped ticks were spread across all four models, not confined to object's own slot."
  - "expectedSamples is now scaled by a computed FACE_SCHEDULE_SHARE rather than derived from the raw tick stream — processedSamples has only ever counted face ticks, and comparing it against an expectation for ALL models structurally pinned the processed/expected ratio at face's own schedule share, tripping coverage.ts's starvation floor on every real camera-on session regardless of actual health."
  - "Per-tick inference-cost tracking moved from a fixed-capacity ring buffer to a plain growable per-session array, so the overall meanTickMs/p95TickMs and the new per-model breakdown can never silently sample two different windows of the same session (a ring biased toward recent ticks disagreed with an unbounded per-model sum once GPU warm-up made early ticks disproportionately expensive)."
  - "Hands and fidget motion are tracked from two genuinely separate position-history variables over the same wrist readings, specifically so fidget cannot be derived from (and therefore correlate 1:1 with) the gesture-amplitude accumulator — both are raw material only; 12-06 owns the threshold classification."

requirements-completed: [REQ-57]
# REQ-50/51/54/58 stay unchecked, matching this phase's established split-requirement
# precedent: this plan ships producers and the proven budget, but no derivation/report
# surface exists yet for gestures/posture/phone (12-06/12-07), and VisualMetrics itself
# is deliberately unchanged this plan, so "every new signal reaches the server" has no
# signal to be true about yet. REQ-57's text ("running four models does not degrade the
# live session") is now FULLY proven, live, with real numbers across all four models —
# the gap 12-03 left open is closed by this plan.

# Metrics
duration: ~2h (incl. one live-checkpoint-fix cycle)
completed: 2026-10-01
---

# Phase 12 Plan 05: Pose, Hands, and Object Detection Summary

**Three new MediaPipe runners (PoseLandmarker, HandLandmarker, ObjectDetector) now share the Web Worker with face detection on a four-model staggered schedule, live-verified at 99.9% capture and 1 dropped tick out of 1313 with no perceptible session degradation — after a first live run surfaced and this plan fixed a real starvation bug, a ring-buffer/unbounded-sum disagreement, and an over-budget schedule.**

## The REQ-57 gate: human-verified numbers (second, approved run)

Camera-on session, read off `[visual-capture] frame budget` at session end:

| Field | Value | Reading |
|---|---|---|
| `thread` | `worker` | |
| `delegate` | `GPU` | |
| `tickCostKind` | `worker-roundtrip` | |
| `models` | `4` | face, pose, hands, object all registered |
| `dispatchMeanMs` / `dispatchP95Ms` | `0.6` / `2` | Main-thread cost — **~1.2% of the 166.67ms tick budget**, essentially unchanged from 12-03's single-model 0.6/2.1 |
| `meanTickMs` / `p95TickMs` | `32.8` / `50.6` | Worker round-trip, well inside budget |
| `modelTickCostMeanMs` | `{face: 33.7, pose: 34.4, hands: 22.8, object: 52.8}` | No model dominates; object's own 2000ms cadence easily absorbs its 52.8ms |
| `modelDroppedTicks` | `{face: 1, pose: 0, hands: 0, object: 0}` | |
| `droppedTicks` | `1` | **0.08%** of expected ticks |
| `processedSamples` / `expectedSamples` | `1312` / `1313` | **99.92% capture** |
| `tickIntervalMs` | `166.67` | 6 Hz |

Human verification: both camera-off and camera-on sessions were reported as running well, indistinguishable in smoothness/latency. The Visual block now renders (it did not on the first run — see Defects below), confirming the schedule-aware accounting fix actually fixed production behavior, not just the regression test.

**Verdict: approved.** This closes the gap 12-03 explicitly left open ("one model runs today; REQ-57's actual claim is only testable once 12-05 registers the other three").

## What the user correctly flagged as still missing (expected, not a defect)

The user asked where the gesture, phone, and posture feedback was in the report. **This plan deliberately ships none of that** — `12-05-PLAN.md`'s objective states it up front: "This plan produces raw per-tick readings only; the derivations (baseline, drift, bands, episodes) are plans 12-06 and 12-07, so a budget problem surfaces before any derivation work is built on top of it." Task 3 explicitly leaves `VisualMetrics`'s return value unchanged. The three new runners accumulate real raw material this session (visible pose/hand/phone sample counts, angle/displacement sums, direction-change counts) but nothing is derived into a band, a score, or an episode yet, and nothing crosses into the report. 12-06 (scored gesture/posture derivation) and 12-07 (descriptive fidget/phone/absolute-posture observations) are the next two plans in this phase and are what will make that content appear.

## Accomplishments

- **Task 1:** Vendored `pose_landmarker_lite.task` (5,777,746 bytes), `hand_landmarker.task` (7,819,105 bytes), and `efficientdet_lite0.tflite` (7,254,339 bytes), all pinned to exact `storage.googleapis.com` version-1 URLs (no `@latest`). Created `public/mediapipe/MODELS.md` recording provenance for all four models, including `face_landmarker.task`'s previously-undocumented origin. Confirmed none are gitignored and all are real binaries, not HTML error pages.
- **Task 2:** Added `PoseLandmarker` (`numPoses: 2`), `HandLandmarker` (`numHands: 4`), and `ObjectDetector` (`efficientdet_lite0`, `scoreThreshold: PHONE_SCORE_THRESHOLD`) to the worker, each behind the same GPU-then-CPU fallback, now shared across whichever models a session requests. Pose uses largest-bounding-box primary-subject selection (same discipline as face) with per-metric visibility gating against `LANDMARK_VISIBILITY_FLOOR` for shoulder-line/forward-head/torso-lean/torso-openness, shoulder-width-normalised forward-head offset, and a shoulder-to-hip-width torso-openness ratio. Hands selects at most two entries by nearest-wrist-to-shoulder-midpoint (falling back to largest bounding box), with `aboveShoulder`/`nearFace` returning `null` rather than a substituted `false` when no pose/face reading is currently available. Object reduces to a single highest-scoring "cell phone" reading; every other COCO category is discarded before the reply leaves the worker. Grep-verified: no landmark array or `ImageBitmap` crosses any `postMessage` boundary for any of the four models.
- **Task 3:** Extended the scheduler and added independent accumulators for pose (per-signal visible counts + angle sums), hands (detected/above-shoulder/near-face counts + a gesture-amplitude displacement sum), fidget (a SEPARATE displacement/direction-change counter pair, not derived from the gesture accumulator — see key-decisions), and object (phone sample/visible counts). Extended `CaptureWindow` with the new per-window totals `windowTrips` will read starting in 12-06; `driftSum` is a deliberate placeholder left at 0 until a baseline exists. `VisualMetrics`'s return value is unchanged this plan, as scoped.
- **Checkpoint fix (after the first live run, three defects):**
  1. **Schedule-aware coverage accounting** — `processedSamples` only ever counted face ticks, but `expectedSamples` was derived from the whole tick stream, structurally pinning the ratio at face's own schedule share and tripping `coverage.ts`'s starvation floor on every real camera-on session (the actual cause of the user's first, empty-looking report). Fixed by scaling `expectedSamples` with a computed `FACE_SCHEDULE_SHARE`; the floor itself was left untouched. Added a `resolveVisualOutcome` regression pair to `scripts/verify-visual-metrics.ts` that reproduces and catches this via the pure-function surface alone.
  2. **Ring-buffer vs. unbounded-sum disagreement** — the overall `meanTickMs`/`p95TickMs` used a fixed 600-sample ring (overwrite-oldest) while the new per-model sums were unbounded; once GPU shader-compile warm-up made early pose/hands/object ticks disproportionately expensive, the ring's recency bias produced a session-wide mean LOWER than every per-model mean, which is numerically impossible for a true average. Fixed by replacing both ring buffers with plain growable per-session arrays.
  3. **Object off the hot path** — `efficientdet_lite0` measured at 126.5ms mean (76% of one tick) on the first run and, being on a single-threaded worker, blocked every other model's reply while it ran; that run's 52 dropped ticks were spread across all four models. Moved object onto its own independent 2000ms (0.5 Hz) timer, well inside `PHONE_MIN_VISIBLE_S`'s resolution needs, freeing the shared schedule for face (held at its original 3 Hz) and pose/hands (raised to 1.5 Hz as a bonus). Confirmed by code inspection (no change needed) that the self-view thumbnail binds directly to the raw camera stream, independent of this engine's worker/model init, so the user's reported brief startup lag is unrelated to this pipeline.

## Task Commits

1. **Task 1: Vendor the three model assets** - `ac3bb84` (chore)
2. **Task 2: Add pose, hand, and object runners to the worker** - `e121370` (feat)
3. **Task 3: Stagger four models and accumulate per-tick scalars** - `10bdd24` (feat)
4. **Checkpoint fix: schedule-aware accounting, unbounded cost stats, object off the hot path** - `1952b70` (fix)

**Plan metadata:** (this commit)

## Files Created/Modified

- `public/mediapipe/pose_landmarker_lite.task` - vendored pose model
- `public/mediapipe/hand_landmarker.task` - vendored hand model
- `public/mediapipe/efficientdet_lite0.tflite` - vendored object-detection model
- `public/mediapipe/MODELS.md` - provenance for all four vendored models
- `lib/metrics/visual-capture.worker.ts` - three new scalar-only runners
- `lib/metrics/visual-capture.ts` - four-model schedule, per-model accumulators, schedule-aware coverage, unbounded cost stats, object's independent timer
- `scripts/verify-visual-metrics.ts` - regression pair for the schedule-aware starvation bug, plus a `CaptureWindow` fixture update for the extended interface

## Decisions Made

See `key-decisions` in frontmatter. In short: object detection runs on its own slow independent timer rather than the shared high-frequency schedule; expected-sample accounting is schedule-aware; inference-cost diagnostics are unbounded per-session arrays, not a fixed ring; and fidget tracking is structurally independent from gesture tracking even though both read the same wrist positions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Schedule-aware `expectedSamples`, found via live checkpoint**
- **Found during:** Task 4 (first live run)
- **Issue:** `expectedSamples` assumed every tick belonged to the face count it was being compared against; once face held less than 100% of `SCHEDULE`, every real camera-on session was misclassified as `INSUFFICIENT_DATA` and the Visual block went unscored.
- **Fix:** Scale `expectedSamples` by `FACE_SCHEDULE_SHARE`, derived from `SCHEDULE` itself.
- **Files modified:** `lib/metrics/visual-capture.ts`, `scripts/verify-visual-metrics.ts`
- **Verification:** New regression pair in `scripts/verify-visual-metrics.ts`; re-confirmed live (Visual block rendered on the second run).
- **Committed in:** `1952b70`

**2. [Rule 1 - Bug] Ring-buffer recency bias disagreeing with unbounded per-model sums**
- **Found during:** Task 4 (first live run)
- **Issue:** `meanTickMs`/`p95TickMs` read from a fixed 600-sample ring, biased toward the session's most recent (post-warm-up, cheaper) ticks, while the new per-model sums were unbounded and included expensive early warm-up ticks — producing a numerically impossible "overall mean below every per-model mean."
- **Fix:** Replaced both ring buffers with plain growable per-session arrays.
- **Files modified:** `lib/metrics/visual-capture.ts`
- **Verification:** `npx tsc --noEmit` clean; re-confirmed live (second run's `meanTickMs` sits above `modelTickCostMeanMs`'s minimum, consistent with a true weighted average).
- **Committed in:** `1952b70`

**3. [Rule 1 - Bug / Rule 3 - Blocking] Object detection starving the whole schedule**
- **Found during:** Task 4 (first live run)
- **Issue:** `efficientdet_lite0`'s 126.5ms mean round-trip (76% of one tick) blocked the single-threaded worker from answering any other model while it ran, spreading drops across all four models (6.4% total, over the plan's own "more than a few percent" tuning trigger).
- **Fix:** Moved object detection to its own independent 2000ms timer, off the shared 6 Hz `SCHEDULE`.
- **Files modified:** `lib/metrics/visual-capture.ts`
- **Verification:** Re-confirmed live — second run's `droppedTicks` fell from 52/815 (6.4%) to 1/1313 (0.08%).
- **Committed in:** `1952b70`

---

**Total deviations:** 3 auto-fixed (all Rule 1 — bugs surfaced by the live checkpoint itself, which is exactly what this plan's Task 4 gate exists to catch before 12-06/12-07 build derivations on top of it).
**Impact on plan:** All three were necessary corrections to the plan's own stated goal (a proven, non-degrading four-model budget). No scope creep — gesture/posture/phone derivation and report surfacing remain correctly out of scope for 12-06/12-07.

## Issues Encountered

The first live checkpoint run exposed all three defects above simultaneously; none were caught by `tsc`/`eslint`/the pre-existing verification script, since the first two are specifically the class of bug "only reachable through a live camera" that 12-CONTEXT.md's flag 6 warns about. A new regression test was added for the schedule/accounting defect so it cannot silently reappear if `SCHEDULE` is edited again without this plan's context.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

12-06 (scored gesture/posture derivation against baselines and thresholds) and 12-07 (descriptive fidget/phone/absolute-posture observations) can now proceed: the raw per-tick accumulators they need (`poseVisibleSamples` + angle sums, `gestureDisplacementSum`, the separate fidget displacement/direction-change pair, `phoneSamples`/`phoneVisibleSamples`, and the extended `CaptureWindow` fields) all exist and are live-verified as cheap enough to run continuously. 12-08 (real-recording threshold tuning) now has a concrete, documented tunable fallback already written into `SCHEDULE`'s own comment (reverting pose/hands to 1 Hz) if a future change needs more headroom. No blockers.

---
*Phase: 12-embodied-visual-signals*
*Completed: 2026-10-01*

## Self-Check: PASSED
All claimed files found on disk; all four claimed commit hashes found in git log.
