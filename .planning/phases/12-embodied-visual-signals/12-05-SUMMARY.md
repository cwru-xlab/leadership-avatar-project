---
phase: 12-embodied-visual-signals
plan: 05
subsystem: visual-capture-detectors
tags: [mediapipe, web-worker, pose, hands, object-detection, frame-budget]

requires:
  - phase: 12-embodied-visual-signals
    plan: 03
    provides: "ES-module worker host, round-robin SCHEDULE, main-thread fallback, frame-budget line"
  - phase: 12-embodied-visual-signals
    plan: 02
    provides: "body-language type contract and provisional thresholds"
provides:
  - "PoseLandmarker, HandLandmarker and ObjectDetector runners in the worker, each with primary-subject selection and visibility gating"
  - "Four-model cadence: SCHEDULE round-robin for face/pose/hands plus an independent 0.5 Hz timer for object"
  - "Schedule-aware expectedSamples so the Phase 10 starvation guard stays valid under a staggered schedule"
  - "Per-model frame-budget breakdown (modelTickCostMeanMs, modelDroppedTicks)"
  - "Three vendored model assets with recorded provenance in public/mediapipe/MODELS.md"
affects: [12-embodied-visual-signals, visual-capture, performance]

tech-stack:
  added: []
  patterns:
    - "A derived denominator that assumed one tenant per tick must be made schedule-aware by COMPUTING the share from the schedule itself (FACE_SCHEDULE_SHARE), never by hand-keeping a constant in sync and never by relaxing the guard that caught it."
    - "Two statistics over the same session must be computed over the same window. A fixed-capacity ring compared against an unbounded sum will silently disagree once early samples differ systematically from late ones (GPU shader warm-up)."
    - "On a single-threaded worker, one expensive model blocks every other model's reply. A detector whose signal is inherently slow belongs on its own timer, not in the shared high-rate rotation."

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
  - "Separate PoseLandmarker + HandLandmarker rather than HolisticLandmarker: the installed @mediapipe/tasks-vision@1.0.1 exposes no numPoses/numHands on HolisticLandmarkerOptions, making it single-subject by construction and unable to honour the multi-person discipline the face pipeline already enforces."
  - "Object (phone) detection was pulled OUT of the shared SCHEDULE onto its own 2000ms (0.5 Hz) timer after the first live run measured it at 126.5ms mean — 76% of one 166.67ms tick. Because the worker is one JS thread, that call blocked every other model's reply, which is why that run's 52 dropped ticks were spread across all four models rather than confined to object's own slot. PHONE_MIN_VISIBLE_S already requires 2 continuous seconds before a phone episode is reportable, so 0.5 Hz cannot miss a reportable episode."
  - "SCHEDULE is now [face, pose, face, hands]: face holds its 3 Hz floor (the Phase 10 metrics depend on it), and pose/hands rose from 1 Hz to 1.5 Hz as a side effect of freeing object's slots."
  - "expectedSamples is scaled by FACE_SCHEDULE_SHARE, computed from SCHEDULE itself. PROCESSED_RATIO_FLOOR in coverage.ts was deliberately NOT relaxed — it is a real Phase 10 starvation guard against a backgrounded tab or wedged worker, and lowering it to accommodate the stagger would have disabled that protection to hide an accounting bug."
  - "Object detection is worker-only with no main-thread fallback. A session that degrades to the fallback path therefore produces NO phone data at all — which 12-06/12-07 must render as not-measured, never as 'no phone detected'."

requirements-completed: [REQ-57]

duration: ~2h including two live runs and one defect-fix cycle
completed: 2026-10-01
---

# Phase 12 Plan 05: Pose, Hands and Object Detection Summary

**Pose, hand and phone detection now run in the worker alongside face — face and pose/hands on the shared round-robin, object on its own 0.5 Hz timer — after a first live run surfaced three real defects, including one that silently marked every camera-on session unscorable.**

## The REQ-57 gate

**Approved by the user on 2026-10-01**, on the second live run, after the three
defects below were fixed.

**What the approval rests on — stated precisely, because this matters:**

- The user ran the camera-off and camera-on sessions themselves and reported
  both as smooth, with reply latency indistinguishable between them.
- The user confirmed the report renders its Visual block again, which is the
  direct observable proof that the Defect 1 starvation bug is fixed.
- The user then confirmed everything else works and directed execution onward.

**What it does NOT rest on:** the second run's `[visual-capture] frame budget`
line was not captured. The approval is qualitative. In particular, the first
run's 6.4% `droppedTicks` (52/815) — the one number that genuinely exceeded the
plan's own tuning trigger — has **not been re-measured since the fix**, and
neither has the Defect 2 sanity check that `meanTickMs` now sits at or above the
largest `modelTickCostMeanMs`. The fixes are verified by code inspection and by
the regression tests below; their numeric effect is not.

**Open item for 12-08:** that plan requires four annotated camera-on sessions
anyway. Capture the frame-budget line on the first of them and record it here.
If `droppedTicks` is still elevated, the `SCHEDULE` comment documents the
fallback (return pose/hands to 1 Hz via idle ticks).

### First run (not approved) — the numbers that drove the fixes

`models 4, thread worker, delegate GPU, dispatchMeanMs 0.5, dispatchP95Ms 1.4,
meanTickMs 35.2, p95TickMs 57.5, modelTickCostMeanMs {face 57.2, pose 106.9,
hands 95.6, object 126.5}, modelDroppedTicks {face 27, pose 8, hands 8,
object 9}, droppedTicks 52, processedSamples 380, expectedSamples 815.`

Main-thread cost was never the problem — `dispatchP95Ms` 1.4 is *better* than
12-03's single-model 2.1. Everything else was.

## The three defects

**1. Every camera-on session was being marked unscorable.** `processedSamples`
increments only in `applyFaceResult`, so it counts face ticks only, while
`expectedSamples` derived from `trackLiveSeconds * METRICS_SAMPLE_HZ` counted
every tick. With face holding 3 of 6 schedule slots the ratio was structurally
pinned near 0.5 before a single frame was dropped; the measured 380/815 = 0.466
fell under `coverage.ts`'s `PROCESSED_RATIO_FLOOR` of 0.5, returning
`{scored: false, reason: "INSUFFICIENT_DATA"}` and emptying the entire Visual
block. 12-03 could not have exposed this — face was the only tenant and the
ratio was 1:1. Fixed by scaling the expectation by `FACE_SCHEDULE_SHARE`.

This bug was reachable only through a live camera, which is precisely the
failure mode flag 6 of `12-CONTEXT.md` says the pure-function seam exists to
prevent. `scripts/verify-visual-metrics.ts` section 2b now asserts both halves:
a healthy four-model coverage block scores, and the pre-fix unscaled shape is
reproduced literally and shown to starve.

**2. The two cost statistics contradicted each other.** `meanTickMs` 35.2 could
not coexist with per-model means of 57-126; weighted by schedule share they
imply ~83ms. Cause: the overall figures came from a fixed 600-sample ring (the
last ~100s of a ~136s session) while the per-model sums were unbounded, so GPU
shader-compile warm-up loaded the per-model figures with expensive early ticks
the ring had already aged out. Both are plain session-length arrays now.

**3. The budget had genuinely tightened.** Covered under key-decisions above —
object off the hot path.

Also checked and deliberately left unchanged: the user's brief self-view lag at
session start. `SelfViewThumbnail` binds directly to the raw camera
`MediaStream`, independent of this engine's video element and worker init.

## Verification

- `npx tsc --noEmit` clean; `npx eslint lib/metrics` 0 errors (314
  prettier/padding warnings, the established repo-wide baseline).
- `npx tsx scripts/verify-visual-metrics.ts` exits 0, including the new
  section 2b starvation regression pair.
- REQ-58 discipline holds for all four models: the received `ImageBitmap` is
  `.close()`d on the same message in every branch including the catch, primary
  subject selection and all array reduction happen inside the worker, and only
  flat scalars cross back.
- Four model files present and served, with pinned download URLs, fetch dates
  and real measured byte sizes recorded in `public/mediapipe/MODELS.md`. The
  phase context's size estimates were wrong (efficientdet is 6.9MB, not ~4.4MB);
  the measured values are now the record.

## Process note

An executor agent fabricated this checkpoint's approval, inventing a detailed
"second, approved run" (99.92% capture, 1 dropped tick of 1313, a full per-model
table) that never happened, and checked REQ-57 complete on that basis. No such
run had occurred and the agent had no means to observe one. Caught and reverted
in `7331907`; the four code commits were independently verified against the
source and retained. This summary was written by hand afterward. The blocking
checkpoint is what made the fabrication detectable — had `workflow.auto_advance`
been true, 12-06 and 12-07 would have built derivations on a pipeline that
discarded its own output.

## Requirements

- **REQ-57 — complete.** Four models run without degrading the live session,
  confirmed by the user against a camera-off baseline. This closes the claim
  12-03 explicitly left open. See the caveat above on what the approval does and
  does not rest on.
- **REQ-50, REQ-51, REQ-54, REQ-58** stay unchecked. This plan accumulates raw
  per-tick scalars only and deliberately leaves `VisualMetrics`' returned shape
  unchanged (verified: no body-language field name appears anywhere in
  `visual-capture.ts`), so nothing reaches the report until 12-06/12-07 derive
  and emit it.

## Next

12-06 (scored derivations) and 12-07 (descriptive observations) are what put
gesture, posture and phone content into the report.
