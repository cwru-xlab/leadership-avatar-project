---
phase: 12-embodied-visual-signals
plan: 09
subsystem: posture-coverage-gate
tags: [coverage-gate, unreadable-band, regression-assertions, partial-delivery]

requires:
  - phase: 12-embodied-visual-signals
    plan: 08
    provides: "tuned thresholds and the failed item-7 sign-off this plan set out to close"
provides:
  - "A proportional posture/hands coverage gate layered on the old absolute floor"
  - "A renderer that refuses to print a posture verdict without a measured signal"
  - "An episode filter so an unreadable signal produces silence, not a finding"
  - "Replay assertions proven to fail behaviourally when the gate is neutralized"
  - "A reproduced-and-fixed hollow-growth-area defect in the describe-then-ask path"
  - "A phone-confidence dev dump, gated behind NEXT_PUBLIC_PHONE_CONFIDENCE_DEV_DUMP"

key-files:
  created: []
  modified:
    - lib/metrics/body-thresholds.ts
    - lib/metrics/visual-capture.ts
    - lib/metrics/bands.ts
    - lib/metrics/types.ts
    - lib/report/body-signal-validator.ts
    - scripts/verify-visual-metrics.ts
    - scripts/verify-report-structure.ts

requirements-completed: []

status: PARTIALLY DELIVERED — Tasks 1-2 shipped, Task 3 run and FAILED
duration: ~1 session plus one human checkpoint run
completed: 2026-10-02
---

## Status: PARTIALLY DELIVERED

Tasks 1 and 2 shipped and are committed. Task 3 — the human re-run of sign-off
item 7 — was performed by the user on 2026-10-02 and **FAILED**. The plan did not
achieve its objective. The remaining gap is carried by `12-10-PLAN.md`.

REQ-51 and REQ-53 remain NOT MET. This plan does not close them.

## What shipped

**Task 1** (`91c85b3`) — proportional coverage gate and unreadable posture band.

- `POSTURE_COVERAGE_MIN_RATIO` / `HANDS_COVERAGE_MIN_RATIO` = 0.25 in
  `body-thresholds.ts`, documented as a reasoned bound rather than a tuned
  cutoff, biased toward unreadable per `12-CONTEXT.md`'s calibration rule.
- `computePostureSignalsMeasured` / `computeHandsUsable` now require BOTH the
  pre-existing absolute floor AND the new ratio of the signal's schedule-aware
  expected sample count.
- `bandPostureDrift` gained an unreadable branch, and `visualBodyLanguageBands`
  gates the "Posture drift" row on `posture_signals_measured` being non-empty
  rather than on `posture_drift_mean` merely being a number. **This turned out
  to be load-bearing, not redundant**: the baseline/drift machinery can populate
  `posture_drift_mean` from a brief glimpse independently of the session-wide
  ratio gate, so the producer fix alone would not have blocked the row.
- `filterUnreadableBodyLanguageEpisodes` (pure, exported) stops a
  `posture_drift` / `excessive_gesturing` / `minimal_gesturing` /
  `hands_near_face` episode backed by an unreadable signal from reaching Moments
  or Growth Areas, even when its own window technically tripped.

**Task 2** (`a9a507f`) — regression assertions, validator fix, phone dump.

- Section "10b" in `scripts/verify-visual-metrics.ts`: the item-7 replay plus
  the REQ-51 partial-visibility counter-assertion guarding the opposite
  direction.
- **Hollow growth area — a real defect found and fixed.** The describe-then-ask
  validator DID fire on "Excessive gesturing at times" and stripped the
  offending sentence; because that sentence was the entry's entire `detail`,
  stripping left `detail` empty, and the unvalidated `title` plus the UI's
  unconditional "Try this: " line rendered alone with no question anywhere. A
  growth area reduced to an empty `detail` is now dropped entirely. The raw
  model output from the live session was not retained, so this is a
  reconstruction that reproduces the symptom exactly — not a byte-for-byte
  replay. Recorded as such.
- Phone-confidence dev dump added in `applyObjectResult`, OFF by default behind
  `NEXT_PUBLIC_PHONE_CONFIDENCE_DEV_DUMP=1`. `PHONE_SCORE_THRESHOLD` was NOT
  changed — diagnosis only, per the plan's explicit do-not-blind-tune rule.
  **The dump is deliberately left in place**; item 4 never ran and `12-10` still
  needs it.

## Verification

All of the following were run and passed after Task 2:
`npx tsc --noEmit`; `npx eslint lib/metrics lib/report` (0 errors);
`npx tsx scripts/verify-visual-metrics.ts`;
`npx tsx scripts/verify-report-structure.ts`;
`npx tsx scripts/verify-vocal-outcome.ts`;
`grep -c PROVISIONAL lib/metrics/body-thresholds.ts` → 0.

**On the pre-fix failure check.** The executor confirmed the new assertions fail
against pre-fix code, but they failed at `tsc` (`TS2305`) and with
`computePostureSignalsMeasured is not a function` — i.e. because the exports are
new, which proves the test is new rather than that it would catch a behavioural
regression. The orchestrator then ran the stronger check: setting
`POSTURE_COVERAGE_MIN_RATIO` and `HANDS_COVERAGE_MIN_RATIO` to `0` (simulating
the old absolute-only gate) fails 7 assertions in section 10b, including the
REQ-51 counter-assertion in the opposite direction. Files restored, suite green.
**The guard is behaviourally real.**

## Task 3: FAILED

Run by the user on 2026-10-02 against a live session.

**Item 1 (the blocker) — FAIL, and regressed in character.** The user ran an
out-of-frame session: body essentially entirely off camera, face detected for
~1% of the session, right arm in shot for part of it. The report nonetheless
produced:

- Posture drift: **"Shifted from the opening posture"**
- Measured from: **Shoulder line and Head position and Torso lean and Torso openness**
- Moments: `0:01-4:20 [Camera] Off camera`, plus eight body-language rows
  including "Posture shifted from the start of the session" at `0:27-2:56` and
  `3:07-3:49`, "A lot of hand movement" x3, "Very still delivery" x3
- Gesturing: Well judged; Hands near face: Frequent

At 12-08 the same test produced a false CLEAN BILL ("Held steady"). It now
produces a false FINDING. That is worse: the student is told their posture
shifted, with timecodes, during a session the pipeline could not see.

**Items 2 and 4 — NOT RUN.** No partial-visibility session, no phone-confidence
readings.

**Item 3 — NOT PASSED, and now worse than unproven.** The "Shifted" reading came
from this same blind session, so the one time `POSTURE_DRIFT_TRIP` has ever
tripped, it tripped on an invented skeleton. See `12-TUNING.md`.

**Criterion 2 — unaffected and improved.** `meanTickMs 25.2` against a 166.7ms
interval, `droppedTicks: 1` of `775`, four models on GPU in the worker.

## Why the fix did not work — root cause of the remaining gap

The report's own numbers are internally contradictory in a way that identifies
the cause. `forward_head` visibility requires `NOSE` AND an ear
(`visual-capture.worker.ts:543-546`), and the new gate requires that to hold for
>=25% of expected pose samples. The face was detected ~1% of the session. Both
cannot be true of a real body.

They were not. `isVisible` (`visual-capture.worker.ts:271`) tests exactly one
thing:

```ts
return (landmarks[index]?.visibility ?? 0) >= LANDMARK_VISIBILITY_FLOOR;
```

MediaPipe's `visibility` is a MODEL-PREDICTED probability, not an observation.
Having locked onto a partial body — the right arm — the model emits a full
33-landmark skeleton and assigns confident visibility to shoulders, nose and
ears that are outside the frame entirely. Nothing checks whether a landmark's
coordinates fall within the image at all. The extrapolated skeleton cleared the
visibility floor on most ticks and therefore sailed through the new ratio gate.

**This plan fixed the wrong layer.** It addressed HOW MUCH of the session a
signal was visible for. The actual defect is that the pipeline was never
measuring visibility — it was reading the model's confidence in its own
extrapolation. A proportional gate over a fabricated signal is still a gate over
a fabricated signal.

The Task 1 and Task 2 work remains correct and necessary. It sits downstream of
a producer that lies, and becomes effective once the producer is fixed.

## Next

`12-10-PLAN.md` — frame-bounds landmark gating, the diagnostic dump that should
have preceded any gate tuning, a replay assertion built from real extrapolated-
skeleton readings, and a re-run of items 1, 2 and 3.
