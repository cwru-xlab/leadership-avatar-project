---
phase: 12-embodied-visual-signals
verified: 2026-10-03T00:00:00Z
status: passed
score: 8/9 requirements MET (REQ-52 deliberately NOT MET, documented capability limit — not counted against the goal)
human_verification:
  - test: "12-03's ROADMAP checkbox"
    expected: "Confirm the worker-migration plan is complete and flip the checkbox from 9/11 to 10/11 executed plans"
    why_human: "This is a bookkeeping correction, not a code risk — commits 962c647/3f5e6c1/c83f6d6 and 12-03-SUMMARY.md are on disk and verified present, but the ROADMAP.md line itself still reads 9/11 pending a human sign-off per the phase's own stated policy against auto-flipping inference-based completions"
  - test: "Phone duration under-count"
    expected: "Decide whether to pursue the raw confidence-series capture that would distinguish threshold-too-high from sampling-too-sparse as the cause, now that the dev dump (NEXT_PUBLIC_PHONE_CONFIDENCE_DEV_DUMP) is confirmed still present and gated off by default"
    why_human: "User already reviewed and accepted this as a scope decision (2026-10-03); re-opening it is optional, not a blocker, and the decision to leave it is the user's to make, not mine to second-guess"
---

# Phase 12: Embodied Visual Signals Verification Report

**Phase Goal:** Make the body measurable. Phase 10's pipeline can only see a face,
so hand movement, posture, fidgeting and a phone in frame are invisible by
construction.
**Verified:** 2026-10-03
**Status:** passed
**Re-verification:** No — initial verification

## Summary

This phase has an unusually complete and self-critical paper trail (12-08
through 12-11), and I verified its claims against the actual code rather than
trusting the summaries. The record is honest: three real regressions are
documented in detail (12-08's false "Held steady" on an off-camera session,
12-09's false "Shifted" on an extrapolated skeleton, 12-10's false negative on
a genuine in-frame slump), and all three are now closed with code-level fixes
I confirmed directly, not just summary claims. I looked specifically for
another instance of the pattern that defeated this phase three times — a gate,
numerator or constant that is dead/inert while the UI prints a confident
verdict — and did not find one still live in the scored path.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Arm movement, posture and a visible phone are measured and tied to timecodes, not inferred from the transcript | ✓ VERIFIED | Gesture/posture/phone all derive from MediaPipe landmark/object-detection ticks in `visual-capture.ts`/`.worker.ts`, not transcript text. Episodes carry timecodes (`extractEpisodes`/`extractDescriptiveEpisodes`, confirmed passing in `verify-visual-metrics.ts` sections 18 & 21). Phone's true positive was run 2026-10-03 (`4ffee4d`, `12-TUNING.md`): "A phone was visible for about 8 seconds" with a `0:11-0:21 [Observation] Phone visible` Moments row. One recorded limitation: duration under-counts a longer real hold — reviewed and accepted by the user as a scope decision. This is a precision defect in a descriptive-only, unscored signal (`PHONE_SCORE_THRESHOLD` gate verified in code at `visual-capture.ts`); it does not falsify the truth. |
| 2 | A camera-on session running four models is indistinguishable from a camera-off run in avatar smoothness and response latency | ✓ VERIFIED | `meanTickMs` telemetry confirmed present in code (`visual-capture.ts:2525/2579`) and reported from three independent real sessions at 35.6 / 25.2 / 31.9ms against a 166.7ms tick interval (REQ-57/12-08/12-10/12-11). Worker migration (REQ-57/58) confirmed in code: `visual-capture.worker.ts` installs `self.onmessage`, `new Worker(..., {type:"module"})` is the live instantiation path at `visual-capture.ts:1934`, with a documented main-thread fallback. |
| 3 | Nothing the pipeline cannot observe is described as absent, and nothing reported descriptively is scored | ✓ VERIFIED | Confirmed in code: `isVisible` (`landmark-visibility.ts`) requires in-frame coordinates AND the visibility floor — not predicted `visibility` alone. `visualBodyLanguageBands`'s posture-drift row (`bands.ts:514-521`) is gated on both a defined `posture_drift_max_s` AND non-empty `posture_signals_measured`, and the gated field now matches the field the verdict is derived from (12-11 fix, confirmed in code, not just summary). Gesturing/hands-near-face rows are gated upstream by `handsUsable` (`visual-capture.ts:2616-2829`), whose numerator is `handsDetectedSamples` (detections, not ticks the model merely ran — the 12-09→12-10 fix, confirmed in code). Scored-vs-descriptive separation holds: phone, fidgeting-retirement, and absolute posture reading all render under the Observations section and are structurally barred from scored fields (`verify-report-structure.ts` wording-validator checks pass; `verify-visual-metrics.ts` section 23 legacy-payload regression passes). |

**Score:** 3/3 truths verified.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/metrics/visual-capture.worker.ts` | Worker-side model host (pose/hands/object/face) | ✓ VERIFIED | 953 lines; `self.onmessage` installed; four models (`VISUAL_POSTURE_SIGNALS` groups + hands + object) |
| `lib/metrics/visual-capture.ts` | Scheduler, episode/band derivations, posture drift, gesture rates, phone | ✓ VERIFIED | 2854 lines; `computePostureDrift`, `computeGestureRates`, `computeHandsUsable`, `computePostureSignalsMeasured`, phone dev-dump machinery all present and exercised by `verify-visual-metrics.ts` |
| `lib/metrics/landmark-visibility.ts` | Extracted `isVisible` predicate, Node-assertable | ✓ VERIFIED | 101 lines; created at 12-10 specifically so the predicate could be tested outside the worker |
| `lib/metrics/body-thresholds.ts` | All tuned constants, 0 unresolved PROVISIONAL markers | ✓ VERIFIED | `grep -c PROVISIONAL` = 0. All 22 exported constants have ≥2 live references outside their own declaration file (none dead — `POSTURE_DRIFT_SUSTAINED_S`, the one constant proven dead across three plans, now has 12) |
| `lib/metrics/bands.ts` | Scored body-language rendering, descriptive/scored separation | ✓ VERIFIED | 624 lines; posture-drift gate confirmed field-consistent (12-11 fix) |
| `scripts/verify-visual-metrics.ts` / `verify-report-structure.ts` / `verify-vocal-outcome.ts` | Executable verification suites | ✓ VERIFIED | All three run clean: "All checks passed." (confirmed by me, not taken from a summary) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `visual-capture.ts` | `visual-capture.worker.ts` | `new Worker(...) + createImageBitmap` | ✓ WIRED | Confirmed at `visual-capture.ts:1934`; worker file begins with matching usage comment |
| `computeHandsUsable` | gesturing/hands-near-face scored fields | `handsUsable` conditional spread | ✓ WIRED | `visual-capture.ts:2616` computes `handsUsable` from `handsDetectedSamples`; `2824-2829` only emits `gesture_rate_per_min`/`hands_near_face_pct` inside `...(handsUsable ? {...} : {})` |
| `isVisible` (frame-bounds + floor) | `computePostureSignalsMeasured` → `POSTURE_COVERAGE_MIN_RATIO` gate → `bandPostureDrift` | predicate → ratio → band | ✓ WIRED | Each stage confirmed by direct code read, not summary quote; this is the exact chain that failed three times and is now consistent end to end |
| `computePostureDrift` (worst-axis) | `posture_drift_max_s` | `bandPostureDrift` reads `posture_drift_max_s`, not `posture_drift_mean` | ✓ WIRED | Confirmed at `bands.ts:519` and cross-checked against `visual-capture.ts`'s producer, which the 12-11 summary states "emits both together or neither" |

### Requirements Coverage

| Requirement | Source Plan(s) | Status | Evidence |
|---|---|---|---|
| REQ-50 (hand/arm movement measured) | 12-04/05/06/08 | ✓ SATISFIED | Gesture rate, amplitude, hands-above-shoulder, hands-near-face all derive from hand landmarks; three-band curve confirmed in `bandGesturing` |
| REQ-51 (posture drift scored from own baseline) | 12-04/05/06/08/09/10/11 | ✓ SATISFIED | 12-11's worst-axis + sustained-streak repair confirmed in code (not just claimed); both directions (slump → "Shifted", ordinary → "Held steady") demonstrated on one build per 12-11-SUMMARY.md Task 4, with an independent episode code path agreeing. Evidence base is explicitly and honestly labelled thin ("SET FROM ONE REAL SESSION, not TUNED") — this is a disclosed limitation, not a hidden one. |
| REQ-52 (fidgeting reported, never scored) | 12-02/07/08 | ✗ NOT MET — deliberate, documented | Retired as unmeasurable at ~1.5Hz hands sampling (Nyquist-shaped aliasing, not a tuning gap). `deferred-items.md` carries the capability gap. ROADMAP success criteria do not name fidgeting, so this does not block phase-goal achievement. |
| REQ-53 (descriptive/scored separation + honesty) | 12-02/04/07/08/09/10 | ✓ SATISFIED | Section separation shipped at 12-04; the honesty clause (nothing unobservable described as absent) was the exact thing that failed at 12-08/12-09 and is now fixed at 12-10, confirmed in code |
| REQ-54 (phone reported factually, never scored) | 12-05/07/08 | ✓ SATISFIED, with disclosed limitation | True positive fires and timecodes (`4ffee4d`); duration under-counts, reviewed/accepted by user; structurally barred from scoring (type-level, `VisualDescriptiveObservations`) |
| REQ-55 (every new signal joins episode timeline) | all | ✓ SATISFIED | `verify-visual-metrics.ts` section 18/21 confirm episode extraction for every new kind |
| REQ-56 (`VISUAL_NOT_MEASURED` shrinks to exactly what's unobservable) | 12-02/08 | ✓ SATISFIED | Fidgeting moved to permanent not-measured; section 19 of verify script confirms conditional body_posture/hands listing |
| REQ-57 (four models, no live-session degradation) | 12-01/03/05/08 | ✓ SATISFIED | Worker migration confirmed in code; frame-budget telemetry (`meanTickMs`) confirmed instrumented and reported from three real sessions |
| REQ-58 (no frame/landmark/blob leaves browser) | 12-01/02/05 | ✓ SATISFIED | Worker posts scalar-only results (`postMessage`); `verify-visual-metrics.ts` section 22 confirms a media-shaped string in observations rejects the whole ingest payload |

No orphaned requirements found — REQ-50 through REQ-58 all appear in at least one plan's `requirements:` frontmatter field, and REQUIREMENTS.md's own status markers match the summaries' claims for every ID I checked against code.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `lib/metrics/visual-capture.ts` / `.worker.ts` | `PHONE_CONFIDENCE_DEV_DUMP` (multiple lines) | Dev-dump code still live in committed source, gated behind `NEXT_PUBLIC_PHONE_CONFIDENCE_DEV_DUMP` (default off) | ℹ️ Info | This is NOT an accidental leftover — it is explicitly, repeatedly documented as a deliberate retention (12-10 removed its own dump prematurely and then had nothing to read at sign-off; 12-11 and the 4ffee4d addendum both state the phone half was kept on purpose, pending a possible future distinguishing reading between threshold-too-high and sampling-too-sparse). It has zero runtime effect with the flag off. Flagging per the literal instruction to check for `DEV_DUMP`, but this does not read as the "confident verdict it cannot support" failure mode the phase was burned by three times — it is inert by default and its presence is the honest opposite of overclaiming. |
| ROADMAP.md | Phase 12 plan checklist | 12-03's checkbox likely stale (`[ ]` vs. three merged commits + SUMMARY on disk) | ℹ️ Info | Confirmed: commits `962c647`/`3f5e6c1`/`c83f6d6` exist in git log, `12-03-SUMMARY.md` is on disk with matching content, worker file shows the exact implementation described. This is a bookkeeping gap, not a functional one — the code it describes is real and working. Listed as human-verification item below per the phase's own stated policy of not auto-flipping an inference-based completion. |

No other dead gates, inert numerators, or never-read constants were found in the scored body-language path. I specifically checked every exported constant in `body-thresholds.ts` for live references outside its own file (all ≥2; previously-dead `POSTURE_DRIFT_SUSTAINED_S` now has 12), and traced the full gate chain for posture drift, gesturing, and hands-near-face from raw detection through to the rendered band row.

### Human Verification Required

See frontmatter `human_verification`. Both items are low-stakes bookkeeping/scope decisions already substantively resolved by the user, not functional gaps:

1. Confirm and flip 12-03's stale ROADMAP checkbox (code is verified present and correct).
2. Optionally decide whether to pursue a further phone-duration diagnostic (already reviewed and accepted as "generally accurate" by the user).

### Gaps Summary

No gaps block goal achievement. REQ-52 (fidgeting) is the one requirement marked NOT MET, and it is a deliberate, well-documented measurement-capability retirement explicitly outside the ROADMAP's three success criteria (none of which names fidgeting) — not an unexamined failure.

I specifically hunted for a fourth instance of this phase's recurring failure mode (a signal that renders a confident verdict it cannot support) by tracing every gate/numerator/constant in the scored body-language path against the live code, not the summaries. I did not find one. The three real regressions this phase actually shipped (12-08's false "Held steady" off-camera, 12-09's false "Shifted" on an extrapolated skeleton, 12-10's false negative on a genuine slump) are each traceable to a specific, now-fixed code location, and I confirmed each fix is present and wired as described:

- `isVisible` now requires in-frame coordinates, not just predicted `visibility` (`landmark-visibility.ts`).
- `computeHandsUsable`'s numerator is `handsDetectedSamples` (detections), not `handSamples` (ticks the model merely ran).
- `bandPostureDrift` reads `posture_drift_max_s` (sustained streak), and `computePostureDrift` reduces by worst-axis, not mean; `POSTURE_DRIFT_SUSTAINED_S` moved from a dead 15 to a wired, tested 8.

The evidence bases behind `POSTURE_COVERAGE_MIN_RATIO`, `POSTURE_DRIFT_SUSTAINED_S`, and `PHONE_SCORE_THRESHOLD` are explicitly and correctly labelled thin in the project's own records (one or two real sessions each) rather than overclaimed as "tuned." That honesty is itself evidence the phase achieved its goal: the body is now measurable, with disclosed limits rather than hidden ones.

---

_Verified: 2026-10-03_
_Verifier: Claude (gsd-verifier)_
