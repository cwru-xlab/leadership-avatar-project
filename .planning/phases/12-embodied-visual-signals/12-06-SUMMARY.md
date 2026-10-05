---
phase: 12-embodied-visual-signals
plan: 06
subsystem: visual-capture-detectors
tags: [posture-baseline, gesture-rate, body-language, mediapipe]

requires:
  - phase: 12-embodied-visual-signals
    plan: 05
    provides: "Raw per-tick pose/hand/object accumulators (poseVisibleSamples, hand wrist positions, phone samples), worker-only hands/pose/object with no main-thread fallback"
  - phase: 12-embodied-visual-signals
    plan: 02
    provides: "VisualMetrics body-language field contract, VISUAL_POSTURE_SIGNALS vocabulary, PROVISIONAL thresholds in body-thresholds.ts"
provides:
  - "computePostureBaseline/computePostureDrift: self-calibrated, per-signal, baseline-relative posture drift (pure, exported)"
  - "computeGestureRates: session-minutes-denominated gesture rate/amplitude, hands-above-shoulder and hands-near-face percentages (pure, exported)"
  - "Four new scored episode kinds (excessive_gesturing, minimal_gesturing, hands_near_face, posture_drift) extracting through the existing extractEpisodes machinery"
  - "Per-session resolveNotMeasured wiring using real hand/posture usability booleans"
  - "VISUAL_NOT_MEASURED_VOCABULARY: the full not-measured vocabulary the server-side ingest allowlist validates against, decoupled from the narrower VISUAL_NOT_MEASURED (permanent-only) constant"
affects: [12-embodied-visual-signals, visual-capture, report-rendering]

tech-stack:
  added: []
  patterns:
    - "A per-signal baseline table (POSTURE_SIGNAL_TABLE) drives both computePostureBaseline and computePostureDrift from one source, so the two functions cannot silently enumerate the four posture signals differently."
    - "A scored rate's denominator must be chosen for what it is structurally immune to, not what is convenient: gesture_rate_per_min divides by session minutes (never hand-detected samples) and hands_near_face_pct divides by hand-AND-face-eligible samples (never raw hand samples) — both decisions trace back to the camera_centered_pct denominator defect documented in this same file."
    - "When a producer graduates a field from 'permanently unmeasurable' to 'per-session conditional', the server-side allowlist that validates the vocabulary must widen too, or the capture engine's honest per-session disclosure gets silently dropped at the ingest boundary — the same failure mode relocated, not fixed, if only the capture side is updated."

key-files:
  created: []
  modified:
    - lib/metrics/visual-capture.ts
    - lib/metrics/types.ts
    - lib/metrics/ingest.ts
    - lib/metrics/body-thresholds.ts
    - scripts/verify-visual-metrics.ts

key-decisions:
  - "VISUAL_NOT_MEASURED (the exported array) now holds only the three PERMANENTLY unmeasurable entries (fidgeting/phone_checking/background_environment). hand_gestures/body_posture are no longer permanent members — real producers ship now, so whether either appears in a session's not_measured list is decided per-session by resolveNotMeasured based on real usability. A new VISUAL_NOT_MEASURED_VOCABULARY (all five entries) is what lib/metrics/ingest.ts's server-side allowlist validates against, so a genuine per-session body_posture/hand_gestures entry is not silently dropped at the ingest boundary — the same 'absence reads as clean' failure this file's header comment already documents, just relocated from the capture engine to the server if the allowlist had stayed narrow."
  - "handsUsable (gating whether any of the four gesture/hands fields are emitted) is `handSamples > 0`, not `handsDetectedSamples > 0`. Hands has no main-thread fallback (12-05), so handSamples === 0 means the pipeline never ran this session (worker failed to start) — a genuinely different condition from 'the hands model ran but never saw a hand', which should still report a true 0 gesture rate rather than omitting the fields."
  - "posture_signals_measured is computed from the SESSION-WIDE poseVisibleSamples counts against POSTURE_BASELINE_MIN_SAMPLES, not from postureBaseline.signals (the calibration-WINDOW-only set). A signal that failed to calibrate in the opening 20s but became visible later in the session is still reportable in the 'Measured from' row, even though it never got a baseline to score drift against."
  - "Four new PROVISIONAL constants added to body-thresholds.ts: four per-signal posture-drift normalisation scales (degrees/ratio units that count as a full 1.0 drift) and GESTURE_WINDOW_MIN_HAND_SAMPLES (the minimum per-window hand-detected count before minimal_gesturing is allowed to trip, so a window where nobody was in frame cannot read as 'hands visible and still'). None of plan 12-02's existing PROVISIONAL markers were touched or tuned."

requirements-completed: [REQ-50, REQ-51, REQ-55, REQ-56]

duration: ~1h
completed: 2026-10-01
---

# Phase 12 Plan 06: Scored Gesture and Posture Derivations Summary

**Self-calibrated posture-drift baseline, session-minutes-denominated gesture rate, and hands-near-face now populate the four scored `VisualMetrics` fields that `bands.ts`/`coverage.ts` consumers were already built against — and the four new episode kinds (`excessive_gesturing`, `minimal_gesturing`, `hands_near_face`, `posture_drift`) trip through the unmodified `extractEpisodes` machinery.**

## What this plan built

**Posture (Task 1).** `computePostureBaseline` establishes a per-signal baseline (shoulder line, forward head, torso lean, torso openness) from the opening `POSTURE_BASELINE_WINDOW_S` (20s) of capture, requiring `POSTURE_BASELINE_MIN_SAMPLES` (60) usable readings per signal before that signal calibrates at all — a signal that never clears the floor (e.g. hips out of frame the whole session) simply never enters `baseline.signals` and is never defaulted to an upright value. `computePostureDrift` scores drift away from that baseline only, per signal, normalised by a new per-signal scale constant in `body-thresholds.ts`, averaged across only the signals that have a baseline; a reading sharing no signal with the baseline returns `driftMagnitude: null`, never a defaulted 0. The caller side (`applyPoseResult`) accumulates the baseline readings while the window is open, then streams drift computation one reading at a time once it closes — no post-baseline reading is retained in memory.

**Gestures and hands (Task 2).** `computeGestureRates` derives `gesture_rate_per_min` from gesture-event count over session MINUTES (never hand-detected samples — the same structural-immunity-to-absence reasoning `camera_centered_pct`'s own doc comment already states), `gesture_amplitude_mean`, `hands_above_shoulder_pct` (denominator: all hand-model ticks), and `hands_near_face_pct` (denominator: hand-detected samples where a face box was ALSO available, since the signal is undefined without both — a new `handsNearFaceEligibleSamples` counter tracks this). Only wrist displacements clearing `GESTURE_AMPLITUDE_MIN` feed the gesture sums; the low-amplitude band stays fidgeting's alone, tracked from its own independent position history as before. Four new episode kinds now trip through `windowTrips`/`extractEpisodes` unchanged, each a ratio within its 5-second window: `excessive_gesturing` and `minimal_gesturing` on gesture-events-per-minute inside the window (with `minimal_gesturing` additionally gated on a minimum hand-detected-sample count, so "nobody there to judge" cannot read as "sitting still"), `hands_near_face` on near-face ratio, `posture_drift` on window mean drift.

**`not_measured` wiring.** `stop()` now calls `resolveNotMeasured({ handSignals: handsUsable, postureSignals: postureSignalsMeasured.length > 0, fidget: false, phone: false })` instead of the unconditional `[...VISUAL_NOT_MEASURED]` spread. Because `hand_gestures`/`body_posture` move from "permanently unmeasurable" to "per-session conditional" now that real producers exist, `VISUAL_NOT_MEASURED` itself narrows to the three entries with genuinely no producer in this phase (`fidgeting`, `phone_checking`, `background_environment`). A new `VISUAL_NOT_MEASURED_VOCABULARY` (all five) is what the server-side `sanitizeNotMeasured` in `lib/metrics/ingest.ts` now allowlists against — allowlisting against the narrower constant would have silently dropped a genuine per-session `body_posture`/`hand_gestures` entry, recreating this file's own "absence reads as clean" failure at the ingest boundary instead of the capture engine.

## Verification

- `npx tsc --noEmit` clean.
- `npx eslint lib/metrics scripts/verify-visual-metrics.ts` — 0 errors (the only warnings are the pre-existing prettier/padding baseline plus unused-var warnings on the raw fidget/phone/absolute-posture accumulators 12-05 already left in place for 12-07 to consume; confirmed unchanged from the pre-this-plan baseline by diffing against `git stash`).
- `npx tsx scripts/verify-visual-metrics.ts` exits 0, all 19 sections passing, including the new sections 15-19 covering baseline establishment/ignoring/floor, drift (including the fairness assertion that two very different absolute postures with identical deltas from their own baselines produce identical drift), gesture-rate denominator independence from hand-sample count, all four new episode kinds at expected timecodes, the stillness-vs-absence distinction, and `resolveNotMeasured`'s per-session conditional behavior for posture/hands.
- Grep-checked: every new numeric cutoff in the derivations (`GESTURE_RATE_EXCESSIVE_MIN`, `GESTURE_RATE_STILL_MAX`, `GESTURE_AMPLITUDE_MIN`, `GESTURE_WINDOW_MIN_HAND_SAMPLES`, `HANDS_NEAR_FACE_TRIP_PCT`, `POSTURE_DRIFT_TRIP`, `POSTURE_BASELINE_WINDOW_S`, `POSTURE_BASELINE_MIN_SAMPLES`, the four posture drift-scale constants) is imported from `body-thresholds.ts`; no body-signal threshold is inline in `visual-capture.ts`.
- `VISUAL_NOT_MEASURED` confirmed to hold exactly `["fidgeting", "phone_checking", "background_environment"]`.
- **Not verified — requires a live camera-on session:** the plan's own live-walkthrough line ("a camera-on session where you deliberately slump halfway through logs a non-zero `posture_drift_mean`...") was not run. I have no browser access and did not fabricate a session result. This is the same category of verification 12-05's summary explicitly flagged as open for 12-08, which already requires four annotated camera-on sessions for threshold tuning — that plan is the right place to capture this observation for real, alongside the frame-budget re-measurement 12-05 also deferred there.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `VISUAL_NOT_MEASURED`/`VisualNotMeasured` type and the ingest allowlist needed decoupling, not just narrowing**
- **Found during:** Task 2, while implementing "remove hand_gestures and body_posture from VISUAL_NOT_MEASURED."
- **Issue:** The plan's literal instruction ("remove from VISUAL_NOT_MEASURED") would, if applied only to the exported array, also shrink the derived `VisualNotMeasured` TypeScript type (since it was `(typeof VISUAL_NOT_MEASURED)[number]`), making `resolveNotMeasured`'s existing `out.push("hand_gestures")`/`out.push("body_posture")` a compile error — yet the plan's own must-have truths and Task 3 bullet 5 explicitly require `resolveNotMeasured` to still be able to emit both strings per session. Separately, `lib/metrics/ingest.ts`'s server-side `sanitizeNotMeasured` allowlists against `VISUAL_NOT_MEASURED` directly; narrowing that constant without a parallel widening elsewhere would have silently dropped a genuine `body_posture`/`hand_gestures` entry at the server boundary — reintroducing the exact "absence reads as clean" failure this file's header comment documents, just moved to ingest instead of capture.
- **Fix:** Split into two constants: `VISUAL_NOT_MEASURED` (narrowed to the three permanently-unmeasurable entries, matching the plan's verification bullet exactly) and a new `VISUAL_NOT_MEASURED_VOCABULARY` (all five entries, the full type source). Updated `lib/metrics/ingest.ts`'s `sanitizeNotMeasured` to allowlist against the vocabulary, not the narrower constant.
- **Files modified:** `lib/metrics/types.ts`, `lib/metrics/ingest.ts`.
- **Verification:** `npx tsc --noEmit` clean; `scripts/verify-visual-metrics.ts` section 19 and the updated section 9 confirm both the narrowed constant and the still-functional per-session conditional emission.
- **Committed in:** `901d745` (Task 1+2 commit).

---

**Total deviations:** 1 auto-fixed (Rule 1 — correctness bug in the plan's literal instruction that would have broken either the type system or the server-side allowlist).
**Impact on plan:** Necessary for correctness; no scope creep. The plan's verification bullet ("`VISUAL_NOT_MEASURED` now contains `fidgeting`, `phone_checking`, `background_environment` only") is satisfied exactly as written.

## Task Commits

Each task was committed atomically (Tasks 1 and 2 share one commit — both modify the same `CaptureWindow` interface and `stop()` return block in `visual-capture.ts`, and splitting them would have required artificially fragmenting one cohesive interface change):

1. **Tasks 1+2: Posture baseline/drift, gesture/hands derivations, episode kinds, not_measured wiring** - `901d745` (feat)
2. **Task 3: Synthetic proof of every derivation through the pure-function seam** - `7ba3ecc` (test)

## Files Created/Modified

- `lib/metrics/visual-capture.ts` - `PostureReading`/`PostureBaseline`/`computePostureBaseline`/`computePostureDrift`, `GestureCounts`/`computeGestureRates`, `CaptureWindow.driftMean`/`handsDetected` (replacing the 12-05 `driftSum` placeholder and adding the stillness-vs-absence denominator), four new `windowTrips` cases, `stop()` populates all four scored fields and calls `resolveNotMeasured` with real usability booleans.
- `lib/metrics/types.ts` - `VISUAL_NOT_MEASURED` narrowed to three entries; new `VISUAL_NOT_MEASURED_VOCABULARY` (five entries); doc comments updated to reflect the permanent-vs-conditional split.
- `lib/metrics/ingest.ts` - `sanitizeNotMeasured` allowlists against `VISUAL_NOT_MEASURED_VOCABULARY`.
- `lib/metrics/body-thresholds.ts` - four posture drift-scale PROVISIONAL constants, `GESTURE_WINDOW_MIN_HAND_SAMPLES` PROVISIONAL constant.
- `scripts/verify-visual-metrics.ts` - `win()` fixture updated for the renamed/added `CaptureWindow` fields; section 9's `resolveNotMeasured` expectation updated for the new vocabulary split; five new sections (15-19) proving baseline, drift (including the fairness property), gesture rates, the four new episode kinds, and `resolveNotMeasured` wiring.

## Decisions Made

See `key-decisions` in the frontmatter above.

## Issues Encountered

None beyond the one deviation documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Posture drift, gesture rate, hands-above-shoulder and hands-near-face are now live scored fields; `visualBodyLanguageBands` in `bands.ts` (already built in 12-04) will render real rows for any camera-on session the moment one runs. 12-07 (descriptive, never-scored observations: fidgeting, phone-in-frame, absolute posture readings) can now build on the same accumulators (`fidgetDisplacementSum`/`fidgetDirectionChanges`/`phoneVisibleSamples`/`poseShoulderTiltSum` etc.) this plan left untouched and still unused — those are 12-07's raw material, not this plan's.

12-08 remains the final blocking stop: four annotated camera-on sessions for threshold tuning (none of this plan's PROVISIONAL constants were tuned), plus re-measuring the frame-budget line 12-05's summary already flagged as open, plus now also the live posture-drift/gesture-rate walkthrough this plan's own verification section could not perform without a browser.

---
*Phase: 12-embodied-visual-signals*
*Completed: 2026-10-01*

## Self-Check: PASSED

All claimed files exist on disk; both commit hashes (`901d745`, `7ba3ecc`) found in git history. `npx tsc --noEmit` and `npx tsx scripts/verify-visual-metrics.ts` re-run clean at time of this summary.
