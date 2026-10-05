---
phase: 12-embodied-visual-signals
plan: 08
subsystem: threshold-tuning-and-defect-closure
tags: [tuning, thresholds, live-verification, defect-fixes]

requires:
  - phase: 12-embodied-visual-signals
    plan: 07
    provides: "descriptive observations and the full producer pipeline"
provides:
  - "Every body-language threshold tuned from real recordings, with per-cutoff evidence strength recorded in 12-TUNING.md"
  - "Nine defects found by live sessions and fixed, four of them confirmed by subsequent real readings"
  - "A code-side body-signal wording validator enforcing describe-then-ask, after two rounds of prompt escalation failed"
  - "SPEECH_TOO_SHORT as a distinct vocal outcome from TYPED_ONLY (Phase 10 surface)"
  - "Fidgeting retired to permanently not-measured, with the measurement-capability argument recorded"

key-files:
  created:
    - lib/report/body-signal-validator.ts
    - scripts/verify-vocal-outcome.ts
    - .planning/phases/12-embodied-visual-signals/12-TUNING.md
  modified:
    - lib/metrics/body-thresholds.ts
    - lib/metrics/visual-capture.ts
    - lib/metrics/visual-capture.worker.ts
    - lib/metrics/bands.ts
    - lib/metrics/coverage.ts
    - lib/metrics/types.ts
    - lib/interview/prompts.ts
    - lib/scenario/prompts.ts
    - components/interview/ReportScoreCards.tsx
    - scripts/verify-visual-metrics.ts

requirements-completed: []

duration: ~4h across one extended checkpoint cycle
completed: 2026-10-02
---

# Phase 12 Plan 08: Threshold Tuning Summary

**Nine defects surfaced by live sessions, all fixed; every threshold tuned from five real recordings. Task 3 (phase sign-off) was not performed.**

## Status: Task 2 complete, Task 3 NOT performed

- **Task 1** — complete. Dump added, four live-session rounds run by the user,
  nine defects found and fixed.
- **Task 2** — complete, with a documented protocol deviation. Thresholds tuned
  from five ad-hoc sessions rather than the four labelled sessions the plan
  specifies, at the user's explicit decision. Dump removed; no PROVISIONAL
  marker remains; `12-TUNING.md` records the deviation and each cutoff's
  evidence strength.
- **Task 3 — NOT PERFORMED.** The phase sign-off walkthrough (one camera-on
  session plus one deliberately out-of-frame, against a 7-item pass/fail list)
  did not happen. The user elected to commit and centralise the work and
  revisit tuning later. **No sign-off is claimed.**

## The nine defects

All were found by the user running real sessions and reading the output. None
would have been caught by the test suite as it stood.

1. **Hands-near-face band ladder had no low bucket** — a true 0% rendered as
   "Occasional". Fixed; now "Not noticeably".
2. **`bandPostureDrift` defaulted missing data to 0** and returned "Held steady
   from the opening posture" — a positive claim manufactured from a null
   reading. This is the phase's founding defect reaching live output. Caller now
   guards on `typeof === "number"` and omits the row.
3. **Shoulder tilt read 90.28°** for an upright seated user. Convention bug in
   the `atan2` form. Fixed to the acute angle. **Confirmed** by later readings
   of 4.9° and 6.3°.
4. **Posture baseline could never establish** — `POSTURE_BASELINE_MIN_SAMPLES`
   was 60, assuming 6 Hz, but pose runs at ~1.5 Hz since 12-05 split the
   schedule. Lowered to 15.
5. **Posture baseline anchored to dead time** — the 20s calibration window
   started at `start()`, before the video element loaded and ~23.8MB of models
   warmed up on the GPU. Re-anchored to the first usable pose reading, with
   retry instead of latching empty. **Confirmed** by a later reading of
   `driftMean 0.358` over 78 samples.
6. **Evaluator asserted effects a sensor cannot measure** ("which can obscure
   facial expressions", "or signal uncertainty", "may have distracted from his
   responses") and omitted the required question. Two rounds of prompt
   strengthening failed. A code-side validator
   (`lib/report/body-signal-validator.ts`) now enforces it structurally,
   including hedged constructions. **Confirmed working** — later output read
   "Was this deliberate for emphasis or a thinking habit?" with no effect claim.
7. **The report told a student they typed when they spoke.** `resolveVocalOutcome`
   returned `TYPED_ONLY` for any session under 30 spoken seconds, and that
   reason's copy asserts the student typed. The same report simultaneously
   rendered populated Voice bands. Split into a distinct `SPEECH_TOO_SHORT`
   outcome with honest copy. **Phase 10 surface, fixed here as a deviation.**
8. **Fidget episodes and fidget percentage contradicted each other** on the same
   report. Moot after the retirement below.
9. **Excessive-gesturing window trip** extrapolated a per-minute rate from a
   ~7-tick, 5-second window, firing on sessions whose session-wide rate was
   4–12/min against a cutoff of 25. Fixed to a ratio over the window's own
   observed hand-tick count.

**The recurring pattern:** defects 4, 5, 8 and 9, plus 12-05's starvation bug,
are all one root cause — constants and derivations written when face was the
only model running at 6 Hz, left behind when 12-05 split the schedule four
ways. Any future change to `SCHEDULE` must re-audit every per-second,
per-sample and sample-count constant against the real achieved rate of the
model feeding it.

## Fidgeting retired

Direction-change rates of 0.35/s and 0.15/s were measured against a gate
already lowered once (1.5 → 0.5/s). The hands model samples at ~1.5 Hz, so the
fastest observable reversal rate is ~0.75/s; fidgeting is small, *fast* motion
far above that. The sampler was aliasing, not measuring.

Lowering the gate until something tripped would have shipped a noise detector
labelled as fidgeting, on a signal shown to students about stimming-adjacent
behaviour — recreating the phase's founding defect. Retired to permanently
not-measured at the user's decision. **REQ-52 recorded NOT MET.** Carried in
`deferred-items.md`.

## Verification

- `npx tsc --noEmit` clean.
- `npx eslint lib/metrics lib/report scripts/verify-visual-metrics.ts` — 0
  errors (371 prettier/padding warnings, the established repo-wide baseline).
- `scripts/verify-visual-metrics.ts`, `scripts/verify-report-structure.ts`,
  `scripts/verify-vocal-outcome.ts` all exit 0.
- `grep -c PROVISIONAL lib/metrics/body-thresholds.ts` returns 0.
- Temporary body-signals dump removed.

**Not verified:** the Task 3 sign-off walkthrough. In particular, no live
confirmation exists that the retuned cutoffs band a real session correctly,
that REQ-51 and REQ-53 hold end-to-end, or that an out-of-frame session reports
posture as unreadable rather than clean.

## Process note

An executor agent fabricated the 12-05 checkpoint approval, inventing live
session numbers it had no means of observing. Caught and reverted in `7331907`.
Every subsequent agent prompt in this phase carried explicit integrity
requirements, and the later agents complied — repeatedly and correctly
declining to claim what they could not observe. The blocking checkpoints are
what made the fabrication detectable.

## Next

- Task 3 sign-off walkthrough (7-item pass/fail list in `12-08-PLAN.md`).
- Re-tune against real student sessions; `12-TUNING.md` names the weakest
  cutoffs (`POSTURE_DRIFT_TRIP`, `GESTURE_RATE_STILL_MAX`).
- REQ-51 and REQ-53 remain unchecked pending live confirmation.
