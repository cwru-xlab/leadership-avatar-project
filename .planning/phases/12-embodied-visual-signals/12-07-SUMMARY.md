---
phase: 12-embodied-visual-signals
plan: 07
subsystem: visual-capture-observations
tags: [fidgeting, phone-detection, absolute-posture, descriptive-not-scored, mediapipe]

requires:
  - phase: 12-embodied-visual-signals
    plan: 06
    provides: "Scored gesture/posture derivations, the VISUAL_NOT_MEASURED/VISUAL_NOT_MEASURED_VOCABULARY split, handsUsable usability pattern"
  - phase: 12-embodied-visual-signals
    plan: 05
    provides: "Raw fidget (displacement/direction-change) and phone (phoneSamples/phoneVisibleSamples) accumulators, worker-only hands/object detection with no main-thread fallback"
  - phase: 12-embodied-visual-signals
    plan: 02/04
    provides: "VisualDescriptiveObservations/VisualDescriptiveEpisode types, sanitizeObservations in ingest.ts, visualObservationRows/timelineRows consumers in bands.ts — all pre-existing contract this plan is the first real producer for"
provides:
  - "computeObservations/ObservationCounts: pure derivation turning fidget/phone/absolute-posture raw counts into VisualDescriptiveObservations' four scalar fields (pure, exported)"
  - "extractDescriptiveEpisodes: the descriptive sibling of extractEpisodes, sharing a new generic collapseRuns run-collapsing engine but structurally distinct (its own VisualDescriptiveEpisodeKind vocabulary and return type)"
  - "VISUAL_NOT_MEASURED narrowed to exactly background_environment; fidgeting/phone_checking join hand_gestures/body_posture as per-session conditional via resolveNotMeasured"
  - "Two new PROVISIONAL body-thresholds.ts constants (FIDGET_EPISODE_TRIP_PCT, PHONE_EPISODE_TRIP_PCT) for the two new descriptive episode window-trip ratios"
affects: [12-embodied-visual-signals, visual-capture, report-rendering]

tech-stack:
  added: []
  patterns:
    - "A descriptive (never-scored) derivation gets its own denominator discipline, deliberately the OPPOSITE of a scored rate's: fidget_pct divides by hand-DETECTED samples (not hand-model ticks), because there is no score to protect from the absence-reads-as-clean defect that governs gesture_rate_per_min/hands_above_shoulder_pct."
    - "A rate-gating decision (does this session's direction-change frequency clear the fidget threshold at all) is made at the stop() call site, not inside the pure computeObservations function — keeps the exported function a straight percentage/unit-conversion calculation, and keeps the gating arithmetic itself testable without duplicating it inside the pure seam."
    - "Two structurally separate public extractors (extractEpisodes, extractDescriptiveEpisodes) share one generic run-collapsing engine (collapseRuns<K extends string>) parameterized by kind vocabulary and trip predicate, so the window-grouping arithmetic has exactly one implementation while the scored/descriptive type boundary stays a compile-time guarantee, not a shared function a future edit could accidentally widen."
    - "A worker-only pipeline's usability boolean (handsUsable, phoneUsable) is reused verbatim as the usability input to a DIFFERENT not_measured entry that rides on the same underlying data (fidgetUsable = handsUsable) rather than independently re-deriving it — a session where hands never ran cannot independently decide fidgeting 'kind of' ran."

key-files:
  created: []
  modified:
    - lib/metrics/visual-capture.ts
    - lib/metrics/types.ts
    - lib/metrics/body-thresholds.ts
    - scripts/verify-visual-metrics.ts

key-decisions:
  - "fidget_pct's gating (whether the session's low-amplitude motion actually clears FIDGET_MIN_DIRECTION_CHANGES_PER_S) is computed SESSION-WIDE, not per-tick: fidgetDirectionChanges / sessionSeconds against the threshold decides whether ALL of the session's low-amplitude samples (fidgetDisplacementSamples) count as fidget samples, or none do. Per-tick direction-change-rate state does not exist in the current accumulator shape (only a session-wide reversal count), so this is the simplest design that does not fabricate a per-tick signal neither 12-05 nor 12-06 actually produced. A future plan could refine this to a windowed rate if per-tick granularity turns out to matter."
  - "phone_visible_seconds converts via the object runner's EFFECTIVE rate (phoneSamples / sessionSeconds — the ACHIEVED tick rate, including any dropped ticks), never the nominal 1/OBJECT_TICK_INTERVAL_MS (0.5 Hz) configured rate. A session with dropped object ticks has a real achieved rate below nominal; converting with the wrong (higher) nominal rate would UNDERSTATE visible duration. Verified in script section 20 with a deliberately-contrasted 0.5 Hz vs. 6 Hz case showing the same 30 visible samples converting to materially different durations."
  - "fidgetUsable is not an independently-derived usability signal — it is handsUsable verbatim, since fidgeting is read from the exact same worker-only hands pipeline (12-05) with no main-thread fallback. phoneUsable is its own independent signal (phoneSamples > 0), since object detection is a structurally separate worker-only model with its own independent tick schedule (OBJECT_TICK_INTERVAL_MS) that can fail to start even when hands succeeds."
  - "VISUAL_NOT_MEASURED is now a one-entry constant (background_environment). This is NOT a reduction in the absence-is-not-evidence discipline the constant's header comment establishes — it means every OTHER behaviour this pipeline ever declared unmeasurable now has a real per-session producer, and the per-session conditional path (VISUAL_NOT_MEASURED_VOCABULARY + resolveNotMeasured) is where that discipline now lives for all four conditional entries, not just the two 12-06 added."
  - "The window-level fidgeting/phone_visible episode triggers reuse the EXISTING per-window counters (fidgetCount, the new phoneProcessed) rather than re-deriving a rate-gated boolean per window — a window-level ratio trip is a different, simpler question ('was more than half this window's hand-detected samples low-amplitude') than the session-wide fidget_pct gating question, and conflating them would make the episode trip threshold implicitly depend on the scalar gating logic in a way that complicates both independently."

requirements-completed: [REQ-52, REQ-54, REQ-55, REQ-56, REQ-58]

duration: ~1h
completed: 2026-10-01
---

# Phase 12 Plan 07: Fidgeting, Phone Visibility and Absolute Posture (Observations) Summary

**Fidgeting, phone-in-frame duration, and the absolute (never baseline-relative) posture reading now populate `VisualDescriptiveObservations` — the measured-but-never-scored half of Phase 12 that 12-02/12-04 built the type contract and report-rendering seam for but left unpopulated.**

## What this plan built

**`computeObservations`/`ObservationCounts` (Task 1).** A pure, exported derivation taking pre-gated raw counts and producing the four `VisualDescriptiveObservations` scalars. `fidget_pct` divides by HAND-DETECTED samples (`handsDetectedSamples`, not the hand-model-tick count `GestureCounts.handSamples` uses) — deliberately the opposite denominator discipline from the scored gesture rate, since there is no score here for the absence-reads-as-clean defect to corrupt. `phone_visible_seconds` converts `phoneVisibleSamples` to seconds using the object runner's EFFECTIVE achieved rate (`phoneSamples / sessionSeconds`, computed at the `stop()` call site), never the nominal 6 Hz or the nominal `OBJECT_TICK_INTERVAL_MS` rate — a session with dropped object ticks would otherwise understate visible duration — and floors to 0 below `PHONE_MIN_VISIBLE_S` so a single false-positive frame cannot read as "a phone was visible." The two absolute posture fields are session means of the SAME raw angles 12-06 already collects for drift, passed straight through (not baseline-relative), `null` exactly when never measurable.

**`extractDescriptiveEpisodes` (Task 1).** The run-collapsing arithmetic previously embedded in `extractEpisodes` was factored out into a new generic `collapseRuns<K extends string>(windows, kinds, trips)` helper; `extractEpisodes` and the new `extractDescriptiveEpisodes` are both thin wrappers over it with their own kind vocabulary and trip predicate (`windowTrips` vs. the new `descriptiveWindowTrips`). The two PUBLIC functions and their return types (`VisualEpisode[]` vs. `VisualDescriptiveEpisode[]`) stay genuinely distinct — only the window-grouping arithmetic is shared — so a fidget episode entering the scored array would be a compile error, matching 12-02's structural-separation discipline. `fidgeting` trips on a window's `fidgetCount / handsDetected` ratio; `phone_visible` trips on `phoneCount / phoneProcessed` (a new per-window counter this plan added, since object detection runs on its own independent timer decoupled from the face-tick window boundaries — `phoneCount` alone, with no processed-count denominator, could not form a ratio).

**`stop()` assembly (Task 1).** `fidgetUsable` is `handsUsable` verbatim (fidgeting rides the identical worker-only hands pipeline with no main-thread fallback — a session where hands never ran cannot independently measure fidgeting either). `phoneUsable` is `phoneSamples > 0` — its own independent signal, since object detection is a separate worker-only model that can fail to start even when hands succeeds. The session-wide fidget rate gate (`fidgetDirectionChanges / sessionSeconds >= FIDGET_MIN_DIRECTION_CHANGES_PER_S`) decides whether the session's low-amplitude sample count counts as genuine fidgeting at all, computed at the call site rather than inside `computeObservations` so that function stays a pure percentage/unit-conversion calculation. The whole `observations` key is omitted (never emitted half-populated with flattering zeros) when nothing descriptive was measurable this session at all. `resolveNotMeasured` now receives all four REAL per-session usability booleans — no more `fidget: false, phone: false` placeholders.

**`VISUAL_NOT_MEASURED` narrowing (Task 1).** Down to exactly `["background_environment"]` — the one entry with genuinely no producer anywhere in this phase. `fidgeting`/`phone_checking` join `hand_gestures`/`body_posture` in `VISUAL_NOT_MEASURED_VOCABULARY` as per-session conditional entries. Doc comments on both constants and on `resolveNotMeasured` updated to state the three-category reality (never measured / measured-and-scored / measured-and-never-scored) explicitly, since the previous comment's framing ("fidget/phone still answer the older question until 12-07 ships theirs") was now stale.

**Verification (Task 2).** Added four new assertion sections (20–23) to `scripts/verify-visual-metrics.ts`: `computeObservations`'s denominator-independence, effective-vs-nominal phone rate, the `PHONE_MIN_VISIBLE_S` floor, and null-never-becomes-0 for absolute posture; `extractDescriptiveEpisodes` producing `fidgeting`/`phone_visible` at expected timecodes while the SAME windows through the scored `extractEpisodes` produce neither; a full Phase 12 payload (every scored field plus the whole `observations` block) round-tripping through `parseMetricsPayload` byte-identical, alongside a media-shaped string planted inside `observations` still rejecting the whole payload (REQ-58); and a genuinely Phase-10-shaped legacy payload producing byte-identical output from `parseMetricsPayload`/`visualBands`/`visualBodyLanguageBands`/`visualObservationRows`/`resolveVisualOutcome`. Section 12 (pre-existing from 12-04) was extended with the plan's own literal scenario — a 90%-fidget/300-second-phone payload — proving it moves neither `visualBands` nor `visualBodyLanguageBands` nor the `resolveVisualOutcome` scorability decision.

## Verification

- `npx tsc --noEmit` clean (0 errors).
- `npx eslint lib/metrics scripts/verify-visual-metrics.ts` — 0 errors, 336/337 warnings (prettier/padding baseline plus two pre-existing unused-var warnings this plan's scope did not touch: `poseTorsoLeanSum`/`poseTorsoOpennessSum`, torso-signal raw material with no absolute-reading surface in this phase's type contract — confirmed by diffing against `git stash` that this plan's changes consumed `poseShoulderTiltSum`, `poseForwardHeadOffsetSum`, `handsDetectedSamples`, `fidgetDisplacementSamples`, `fidgetDirectionChanges`, `phoneSamples`, `phoneVisibleSamples`, clearing those from the unused-var list, while `poseSamples` and `fidgetDisplacementSum` remain genuinely unused and out of this plan's scope).
- `npx tsx scripts/verify-visual-metrics.ts` exits 0, all 23 sections / 121 checks passing, including the four new sections (20–23) and the extended section 12.
- `VISUAL_NOT_MEASURED` confirmed to hold exactly `["background_environment"]` (grepped directly from the compiled constant).
- Grep proof: the `observations` identifier appears inside `stop()` only in the self-contained 12-07 assembly block (building `observations` itself, from raw accumulators) and in the final `...(observations ? { observations } : {})` spread — never inside the scored-field computations (`eye_contact_pct` through `posture_drift_max_s`) that precede it.
- **Not verified — requires a live camera-on session:** the plan's own live-walkthrough line ("a camera-on session where you fidget and hold a phone up for ~30 seconds yields a non-zero `fidget_pct`, a `phone_visible_seconds` within a few seconds of the real duration, and descriptive episodes at roughly the right timecodes") was not run. I have no browser access and did not fabricate a session result. This is the same category of verification 12-05's and 12-06's summaries already flagged as open for 12-08, which remains the right place to capture it for real alongside the other deferred live walkthroughs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] `phone_visible` descriptive episode had no valid denominator with the plan's literal counter set**
- **Found during:** Task 1, implementing `descriptiveWindowTrips`'s `phone_visible` case.
- **Issue:** The existing `CaptureWindow.phoneCount` only tracks VISIBLE object-detection samples per window; there was no counterpart tracking total object-model ticks (visible or not) per window, so a `phoneCount / ???` ratio had no denominator that would correctly handle a window with few or zero object ticks (object detection runs on its own independent `OBJECT_TICK_INTERVAL_MS` timer, decoupled from the face-tick window boundaries `handsDetected`/`gestureSamples` are scoped to).
- **Fix:** Added `phoneProcessed` to `CaptureWindow` (total object-model ticks landed in the window, phone present or not) and `winPhoneProcessed`, incremented unconditionally inside `applyObjectResult` alongside the existing visible-only `winPhoneCount`. `descriptiveWindowTrips`'s `phone_visible` case uses `phoneCount / phoneProcessed`, matching the ratio-not-raw-count discipline every other trip condition in this file already follows.
- **Files modified:** `lib/metrics/visual-capture.ts`.
- **Verification:** `npx tsc --noEmit` clean; `scripts/verify-visual-metrics.ts` section 21 proves the `phone_visible` episode trips at the expected timecodes and that a zero-`phoneProcessed` window cannot trip it.
- **Committed in:** `0540cd7` (Task 1 commit).

**2. [Rule 3 - Blocking] Two new descriptive window-trip ratios needed PROVISIONAL threshold constants not listed in the plan's `files_modified`**
- **Found during:** Task 1, implementing `descriptiveWindowTrips`.
- **Issue:** The plan's `files_modified` for this task lists only `lib/metrics/visual-capture.ts`, but `body-thresholds.ts`'s own file header is explicit that "no other file in this phase may define a body-signal threshold inline — if a new numeric cutoff is needed, it is added here." The two new window-trip ratios genuinely needed named cutoffs.
- **Fix:** Added `FIDGET_EPISODE_TRIP_PCT`/`PHONE_EPISODE_TRIP_PCT` (both 50%, PROVISIONAL, matching the file's existing style and pending-12-08-tuning banner) to `body-thresholds.ts` rather than inlining them in `visual-capture.ts`, consistent with every prior plan's practice (12-06 added its four drift-scale constants there the same way despite a similarly narrow `files_modified` list).
- **Files modified:** `lib/metrics/body-thresholds.ts`.
- **Verification:** `npx tsc --noEmit` clean; the file's PROVISIONAL banner (line 5) is untouched; `scripts/verify-visual-metrics.ts` section 21 exercises both constants through the trip logic.
- **Committed in:** `0540cd7` (Task 1 commit).

**3. [Rule 1 - Bug] `resolveNotMeasured`'s existing "all-false" test fixture broke when `VISUAL_NOT_MEASURED` narrowed**
- **Found during:** Task 1, after narrowing `VISUAL_NOT_MEASURED` to one entry.
- **Issue:** `scripts/verify-visual-metrics.ts` section 9's pre-existing "all-false input returns the full not-measured vocabulary" check built its expected value as `["hand_gestures", "body_posture", ...VISUAL_NOT_MEASURED]`. Before this plan that correctly expanded to all five entries in `resolveNotMeasured`'s actual push order; after narrowing `VISUAL_NOT_MEASURED` to one entry, the same expression silently dropped `fidgeting`/`phone_checking` from the expectation, since they are no longer part of the spread.
- **Fix:** Updated the expected value to `["hand_gestures", "body_posture", "fidgeting", "phone_checking", ...VISUAL_NOT_MEASURED]`, matching `resolveNotMeasured`'s actual push order explicitly rather than relying on a spread whose meaning had just changed under it.
- **Files modified:** `scripts/verify-visual-metrics.ts`.
- **Verification:** `npx tsx scripts/verify-visual-metrics.ts` section 9 passes.
- **Committed in:** `0540cd7` (Task 1 commit, alongside the `CaptureWindow.phoneProcessed` fixture-field fix required for the file to compile at all).

---

**Total deviations:** 3 auto-fixed (one Rule 1 test-fixture correctness bug, two Rule 2/3 additions necessary for the plan's own described behaviour to be implementable). No scope creep — all three are mechanically required by the plan's literal instructions and must-have truths, not independent additions.

## Task Commits

1. **Task 1: Derive fidgeting, phone visibility and the absolute posture reading into the observations block** - `0540cd7` (feat)
2. **Task 2: Assert descriptive values cannot move a score or cross a boundary they shouldn't** - `52c9eca` (test)

## Files Created/Modified

- `lib/metrics/visual-capture.ts` - `ObservationCounts`/`computeObservations`, `collapseRuns` (generic run-collapsing engine factored out of `extractEpisodes`), `descriptiveWindowTrips`/`extractDescriptiveEpisodes`, `CaptureWindow.phoneProcessed` (+ `winPhoneProcessed` tracking in `applyObjectResult`/`closeWindow`), `stop()`'s new 12-07 observations-assembly block and real `fidgetUsable`/`phoneUsable` wiring into `resolveNotMeasured`.
- `lib/metrics/types.ts` - `VISUAL_NOT_MEASURED` narrowed to `["background_environment"]`; `VISUAL_NOT_MEASURED_VOCABULARY` widened to explicitly include `fidgeting`/`phone_checking` alongside `hand_gestures`/`body_posture`; doc comments on both constants and `resolveNotMeasured` updated for the three-category reality.
- `lib/metrics/body-thresholds.ts` - `FIDGET_EPISODE_TRIP_PCT`/`PHONE_EPISODE_TRIP_PCT` PROVISIONAL constants (PROVISIONAL banner on line 5 untouched).
- `scripts/verify-visual-metrics.ts` - `win()` fixture updated for the new `phoneProcessed` field; section 9's `resolveNotMeasured` expectation corrected for the narrower `VISUAL_NOT_MEASURED`; section 12 extended with the plan's own 90%-fidget/300s-phone non-scoring scenario plus a `resolveVisualOutcome` equality check; four new sections (20–23) covering `computeObservations`, `extractDescriptiveEpisodes`, the full-payload ingest round-trip, and the legacy Phase-10-shaped regression.

## Decisions Made

See `key-decisions` in the frontmatter above.

## Issues Encountered

None beyond the three deviations documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Both halves of Phase 12's measurement surface are now live: 12-06 shipped the scored half (gesture rate, posture drift, hands-near-face), and this plan ships the descriptive half (fidgeting, phone-in-frame duration, absolute posture) — `visualObservationRows`/`timelineRows` in `bands.ts` (already built in 12-04) will render real rows for any camera-on session the moment one runs, and `not_measured` now reflects genuine per-session usability across all five vocabulary entries rather than any standing placeholder.

12-08 remains the final blocking stop: four annotated camera-on sessions for threshold tuning (none of this plan's two new PROVISIONAL constants, nor any inherited from 12-05/12-06, have been tuned against real recordings), plus the live walkthroughs this plan's own verification section could not perform without a browser (fidget/phone/absolute-posture values from a real session), plus the frame-budget re-measurement and live posture-drift/gesture-rate walkthrough 12-05's and 12-06's summaries already flagged as open.

---
*Phase: 12-embodied-visual-signals*
*Completed: 2026-10-01*

## Self-Check: PASSED

All claimed files exist on disk; both commit hashes (`0540cd7`, `52c9eca`) found in git history. `npx tsc --noEmit` and `npx tsx scripts/verify-visual-metrics.ts` re-run clean at time of this summary.
