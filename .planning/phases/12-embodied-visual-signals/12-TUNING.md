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

## POSTURE_DRIFT_TRIP: its one observed trip was a FALSE POSITIVE (2026-10-02)

Recorded during 12-09's Task 3. This supersedes nothing above, but it changes
what the cutoff's evidence base means.

`POSTURE_DRIFT_TRIP` (0.5) was already the weakest-evidenced cutoff in this
file, set from two ordinary-session readings (0.358, 0.424) with its
true-positive side unverified. It has now tripped exactly once, in a real
session — and that trip was **noise, not posture**.

The session was the 12-09 item-1 re-run: the user's body was essentially
entirely off camera, the face was detected for ~1% of the session, and only a
right arm was in shot for part of it. The report produced "Shifted from the
opening posture" with two timecoded Moments rows (`0:27-2:56`, `3:07-3:49`), and
claimed all four posture signals measured.

The drift was computed from an extrapolated MediaPipe skeleton, not an observed
body — see `12-09-SUMMARY.md`'s root-cause section and `12-10-PLAN.md`. So:

- The true-positive side of `POSTURE_DRIFT_TRIP` remains **UNPROVEN**. Do not
  read this trip as evidence the cutoff works.
- A new concern is on the record: the drift computation can produce a
  confident, timecoded magnitude from landmarks that were never observed. That
  is a producer defect, not a cutoff mistuning, and tuning the cutoff against
  readings taken from extrapolated skeletons would bake the defect into the
  threshold.
- **Any future re-tune of this cutoff must use readings taken AFTER the
  frame-bounds landmark gating in 12-10 lands.** Every reading in the dataset
  above predates it, and any of them taken against a partially-visible body may
  carry the same contamination.

`POSTURE_DRIFT_SUSTAINED_S` (15) and `HANDS_NEAR_FACE_RADIUS` (0.15) were
already NOT RE-TUNED for want of raw dumps; they inherit the same instruction.

## The landmark in-frame readings (12-10 Task 2, 2026-10-03)

Run by the user with `NEXT_PUBLIC_VISUAL_LANDMARK_DEV_DUMP=1`. These are the
`landmark in-frame split (session aggregate)` outputs, transcribed. They are
the evidence base for `POSTURE_COVERAGE_MIN_RATIO` (moved 0.25 -> 0.60) and for
the in-frame half of `isVisible`, and they are recorded here because the dump
that produced them was removed in the same task.

**Session A — off camera, one arm in shot.** Face presence, eye contact and
centering all recorded at 0%. 143 pose ticks.

| signal         | visible & in frame | visible but OUT of frame | in-frame / total ticks |
| -------------- | ------------------ | ------------------------ | ---------------------- |
| forward_head   | 62                 | 78                       | **43.4%**              |
| shoulder_line  | 21                 | 74                       | 14.7%                  |
| torso_lean     | 5                  | 15                       | 3.5%                   |
| torso_openness | 5                  | 15                       | 3.5%                   |

Hands: 234 ticks, 39 detected in frame, 41 detected OUT of frame.

**Session B — half in frame**, shoulders at the frame edge, torso cut off. Face
visible 79%, eye contact 75%. 281 pose ticks.

| signal         | visible & in frame | visible but OUT of frame | in-frame / total ticks |
| -------------- | ------------------ | ------------------------ | ---------------------- |
| forward_head   | 212                | 69                       | **75.4%**              |
| shoulder_line  | 16                 | 262                      | 5.7%                   |
| torso_lean     | 1                  | 2                        | 0.4%                   |
| torso_openness | 1                  | 2                        | 0.4%                   |

Hands: 282 ticks, 1 detected in frame, 0 out of frame.

Per-tick samples recorded alongside: Session A tick 114
`{shoulderLine: true, forwardHead: true, torsoLean: false, torsoOpenness: false}`,
tick 184 `{shoulderLine: false, forwardHead: true, ...}`; Session B ticks 46 and
276 both `{shoulderLine: true, forwardHead: true, torsoLean: false, torsoOpenness: false}`.

### What these readings establish, and what they do not

1. **`visibility` is near-useless as a gate.** Session A called `forward_head`
   visible on 140/143 ticks (98%) with the face detected 0% of the session;
   Session B called `shoulder_line` visible on 278/281 (99%) with the shoulders
   at the frame's edge. The per-tick visible flags are indistinguishable
   between a 0%-face session and a genuine one.

2. **12-10's own stated hypothesis was falsified in its simple form.** Adding
   an in-frame test to `isVisible` alone would NOT have fixed this: Session A's
   `forward_head` is still in frame on 43.4% of ticks, which clears 12-09's
   0.25 ratio. "Head position" would have been reported as measured a third
   time. Both the per-tick fix and the ratio change are load-bearing; each was
   confirmed to fail the replay assertions when reverted alone.

3. **The ratio AS THE DUMP PRINTED IT inverts between the sessions and must
   not be used.** The dump's `visibleAndInFrameRatio` divides by VISIBLE ticks,
   giving Session A `shoulder_line` 0.221 against Session B's 0.058 — the
   genuine body scores LOWER. The separating quantity is in-frame count over
   TOTAL pose ticks, the right-hand column above.

4. **Session B's own live report was over-claiming.** It printed "Measured
   from: Shoulder line and Head position" with the shoulders out of frame on
   262 of the 278 ticks the model called visible (94%). Session B measuring
   `forward_head` ONLY is the correct outcome and is REQ-51 satisfied — scored
   on the landmark genuinely available rather than skipped entirely.

5. **Honest limits.** Two sessions. The separating gap is 43.4% -> 75.4%: real,
   but one reading on each side, and ANY cutoff from ~0.44 to ~0.75 produces
   identical verdicts on both. These readings establish the band; they do not
   locate 0.60 within it. This cutoff is **not well-characterised**. There is
   no fully-in-frame reading at all, so the band has no upper bound — that is
   the next session to collect, and it would also set
   `HANDS_COVERAGE_MIN_RATIO`, which these two sessions bound only from below
   (Session A's 16.7% against its retained 0.25).

### The hands numerator defect these readings exposed

Session A's hands figures showed 234 ticks against ~234 expected, which is how
`computeHandsUsable` was being called — with `handSamples`, the count of ticks
the hands MODEL RAN, incremented whether or not a hand was detected. That is
~100% of expected on any live session, so **12-09's hands coverage gate was
inert** and Session A kept "Gesturing: Well judged" and "Hands near face:
Frequent" after 12-09 claimed to have closed exactly that. The numerator is now
`handsDetectedSamples`, counted after out-of-frame wrists are dropped. Found
from these numbers, not from the code.

## The phone-confidence dump (12-09) was removed UNUSED

Both dev dumps were removed in 12-10 Task 3. For the landmark dump that is a
removal after use — its readings are recorded above. For 12-09's
`NEXT_PUBLIC_PHONE_CONFIDENCE_DEV_DUMP` it is not: **its readings were never
captured.** It was added for 12-09's Task 3 item 4, that item never ran, and it
was re-listed as 12-10's Task 4 item 4, which has not run either at the time of
removal. So no phone-confidence distribution exists anywhere in this record, and
removing the dump loses nothing that was ever observed — but it also means
`PHONE_SCORE_THRESHOLD` remains deliberately untuned with no dataset behind it,
and the dump must be re-added if that reading is ever wanted. Stated explicitly
so this removal is not mistaken for "the dump was used and is finished with".

---

*Tuned 2026-10-02 against the dataset above. The 12-08 Task 3 sign-off
walkthrough was performed on 2026-10-02 and FAILED on item 7 — see
`12-08-SUMMARY.md` and `12-09-SUMMARY.md`. The 12-09 re-run also failed; the gap
is carried by `12-10-PLAN.md`, whose Task 2 readings are recorded above.*
