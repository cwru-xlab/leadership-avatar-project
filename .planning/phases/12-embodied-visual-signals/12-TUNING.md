# Phase 12 Plan 08 — Threshold Tuning Record

Provenance for every tuned constant in `lib/metrics/body-thresholds.ts`:
which session produced which reading, and which cutoff decision it drove.
This file is the record a student challenging a grade can be pointed to, so
it states how much evidence stands behind each number — including where that
evidence is thin.

## Read this first: the protocol was not followed

12-08-PLAN.md Task 1 specifies **four labelled sessions** (normal / very
still / big-gesture / mixed), each ~3–4 minutes, recorded against final code.
**That dataset was never recorded.** At the user's explicit decision on
2026-10-02, tuning proceeded from the ad-hoc sessions that had accumulated
while Task 1's checkpoint was being used to find and fix nine defects.

Consequences, stated plainly:

- **No session was recorded as a deliberate NORMAL baseline.** S4 is a proxy.
  The plan's governing calibration rule — the normal session must land
  mid-band on every signal — was applied against a session that was never
  declared normal.
- **Several sessions ran against pre-fix code**, so individual rows had to be
  discarded as known artifacts rather than treated as behaviour.
- **Posture drift rests on two readings**, neither from deliberately slumping
  behaviour. Its true-positive boundary is unverified.
- **No session produced a session-wide gesture rate the user called
  excessive.** The high end of the gesture curve is extrapolated, not observed.

These cutoffs are defensible and conservative. They are not as well-grounded
as the four-session protocol would have made them. Re-tuning against real
student sessions, once the feature is in front of people, is expected work —
see `deferred-items.md`.

## The dataset actually used

All readings below were pasted by the user from a real browser console. None
were estimated, inferred, or reconstructed.

| # | Duration | Behaviour | Usable rows | Discarded |
|---|----------|-----------|-------------|-----------|
| S1 | ~140.1s | "Hands in lap, minimal movement" — the stillness floor | gesture (0/min, 0% near-face) | posture: `driftMean` null and shoulder tilt 90.28° are both pre-fix artifacts |
| S2 | 274.7s | Mixed → big gesture: arm waving, face touching, slumping, phone ~30s | gesture (9/min, 32% near-face), phone (22s visible), tilt 4.91° | posture drift: null, pre-fix artifact |
| S3 | 73.5s | Ad-hoc, post-posture-fix | gesture (12.2/min, 71% near-face — the only session the user described as deliberate face-touching), drift 0.358 over 78 samples | — (but well under the 3–4 min floor; weighted accordingly) |
| S4 | 254.4s | Longest clean run; **the ordinary-behaviour proxy** | gesture (4/min, 26% near-face), drift 0.424 over 351 samples, tilt 5.02° | — (ran against stale code, but the fidget retirement does not touch gesture/posture/phone derivation) |
| S5 | — | A still session, post-fix | corroboration only (0% hand motion, 4° tilt) | no full dump captured |

## Cutoffs and their evidence

| Constant | Value | Evidence strength |
|---|---|---|
| `GESTURE_RATE_STILL_MAX` | 2 | **Weak.** Midpoint of a 0-to-4/min gap (S1 → S4). No session exists between them. |
| `GESTURE_RATE_EXCESSIVE_MIN` | 20 | **Moderate, conservative.** Above S3's 12.2 (highest observed, not described as excessive). No observed true positive. |
| `GESTURE_WINDOW_EXCESSIVE_PCT` | 22 | Derived alongside the window-trip bug fix below. |
| `HANDS_NEAR_FACE_TRIP_PCT` | 50 | **Good.** Four readings spanning 0 / 26 / 32 / 71%, with S3's 71% being the one session of deliberate face-touching. Separates ordinary (26–32%) from deliberate cleanly. |
| `POSTURE_DRIFT_TRIP` | 0.5 | **Weakest in the file.** Two readings (0.358, 0.424), both ordinary sessions. Placed above both so ordinary movement reads "held steady". True-positive side unverified. |
| `HANDS_NEAR_FACE_RADIUS` | 0.15 | **Not re-tuned.** No dump captured the raw hand-to-face distance distribution. |
| `POSTURE_DRIFT_SUSTAINED_S` | 15 | **Not re-tuned.** Needs a raw per-tick drift series; only session aggregates exist, and those were computed against the old 0.35 trip. |

## The excessive-gesturing defect (a bug, not a mistuning)

Across every recorded session the session-wide gesture rate measured 4, 9 and
12.2/min — all far below `GESTURE_RATE_EXCESSIVE_MIN`, which was 25 at the
time. Yet `excessive_gesturing` episodes still fired and surfaced to the user
as a growth area ("Excessive gesturing during explanation").

Root cause: the window-level trip was extrapolating a wall-clock gesture rate
from a ~7–8-tick, 5-second window, which is far too short a base for a
per-minute rate — a noisy statistic unrelated to the session-wide number the
band cutoff compares against. Fixed to compare gesture events against the
window's own observed `handsDetected` tick count (`GESTURE_WINDOW_EXCESSIVE_PCT`),
so the window and session conditions now derive from the same quantity.

This is the defect 12-CONTEXT.md's calibration rule exists to prevent: *a false
"excessive" is a student being told off for a sensor misread.* It reached live
output and was caught only because the user read the report.

Regression-guarded in `scripts/verify-visual-metrics.ts`: an ordinary gesture
ratio produces no episode, and an ordinary 26% hands-near-face rate (S4's real
reading) produces no episode.

## Fidgeting: retired, not tuned

`FIDGET_MAX_AMPLITUDE`, the direction-change rate gate, and the fidget episode
trip were **deleted rather than tuned**. Fidgeting is permanently
not-measured.

Two real recordings measured direction-change rates of 0.35/s and 0.15/s
against a gate already lowered once (1.5 → 0.5/s). The hands model samples at
~1.5 Hz, so the fastest reversal rate observable is ~0.75/s — and fidgeting is
by definition small, *fast* motion, far above that. The sampler was aliasing,
not measuring, which is why the readings bore no relation to what the user
actually did.

Lowering the gate until something tripped would have shipped a noise detector
labelled as fidgeting, on a signal shown to students about stimming-adjacent
behaviour. REQ-52 is recorded NOT MET for this reason. Measuring it would
require a materially higher hands sample rate, costing face/pose temporal
resolution and needing its own frame-budget gate — carried in
`deferred-items.md`.

---

*Tuned 2026-10-02 against the dataset above. Task 3 (phase sign-off
walkthrough) was not performed — see `12-08-SUMMARY.md`.*
