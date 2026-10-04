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
| `POSTURE_DRIFT_TRIP` | 0.5 | **Set from one real session (12-11), retained.** Now bounded on BOTH sides by Session A: ordinary <=0.252, slump >=0.508. Was never the defect — see the 12-11 section below. |
| `HANDS_NEAR_FACE_RADIUS` | 0.15 | **Not re-tuned.** No dump captured the raw hand-to-face distance distribution. |
| `POSTURE_DRIFT_SUSTAINED_S` | 8 | **Set from one real session (12-11), lowered from 15.** The series finally exists. Bounded from ABOVE only (Session A's 12.0s streak); nothing bounds it from below. **Was read by NOTHING until 12-11.** |

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

## POSTURE_DRIFT_TRIP has ZERO valid supporting evidence (12-10 Task 4, 2026-10-03)

**Standing instruction: do not re-tune this cutoff from anything currently in
this file. Nothing in it supports the value.**

The ledger for `POSTURE_DRIFT_TRIP` (0.5), stated completely:

| Evidence | What it was | What it is worth |
|---|---|---|
| S3 `driftMean` 0.358 | ordinary session, not deliberate slumping | sets only "ordinary movement should not trip"; predates the 12-10 gating, so may be contaminated by extrapolated landmarks |
| S4 `driftMean` 0.424 | the ordinary-behaviour PROXY, never declared normal | same |
| 12-09's one observed trip | off-camera session, face detected ~1% | a **FALSE POSITIVE** on an extrapolated skeleton — see the section above |
| 12-10 Task 4 item 3 | fully-in-frame session, user "slumped a lot" | a **FALSE NEGATIVE** — see below |

So the cutoff has two readings from sessions nobody characterised, one observed
trip that was noise, and one observed non-trip that should have tripped. **It has
never been observed to respond correctly to the behaviour it grades.** The
true-positive side is not merely unproven; it has now been tested once and
failed.

### The item-3 reading: a genuine hard slump reported "Held steady"

Run by the user on 2026-10-03 as 12-10 Task 4 item 3, the first real test of the
true-positive side. **FAIL.**

The user sat fully in frame, started upright, and in their words "slumped a lot".
The report said **"Posture drift: Held steady from the opening posture"**,
measured from "Shoulder line and Head position". Their own observation: "because
of the camera framing, it struggles to track this."

The session's framing context, which is what makes this reading usable:

- Framing **Well centred** (83% of the time), On camera **Present throughout**,
  face always in frame, Lighting Clear, Steadiness Steady, Others in frame Just
  you. Eye contact 54% ("major stretches, e.g. 1:10-1:57, spent looking away
  while responding"), Attention Attentive.

**The 12-10 frame-bounds gating is NOT what suppressed this.** Both
`shoulder_line` and `forward_head` cleared the new 0.60
`POSTURE_COVERAGE_MIN_RATIO` and were honestly reported as measured. The gating
behaved correctly. This is a false negative on signals that were correctly
observed — a different layer from everything above, and the opposite failure
direction from 12-08's and 12-09's.

**No numbers were captured.** No drift magnitude, no baseline values, no
per-signal deltas, no per-tick series — for this session or any other. The gap
this file has recorded since 12-08 ("needs a raw per-tick drift series; only
session aggregates exist") is still open and is now the blocking gap for both
`POSTURE_DRIFT_TRIP` and `POSTURE_DRIFT_SUSTAINED_S`.

### Hypothesis for the item-3 failure — UNVERIFIED, from reading the code only

Recorded so the follow-up plan has a starting point. **It is not a measurement
and nothing may be changed on its authority.** Lowering a cutoff to make this
hypothesis's symptom disappear is precisely the guess-first move that produced
the three preceding failures.

`computePostureDrift` (`lib/metrics/visual-capture.ts:556-582`) aggregates the
per-signal normalized deltas as an arithmetic **MEAN**:
`values.reduce((sum, v) => sum + v, 0) / values.length`, each delta being
`clamp(abs(current - baseline) / scale, 0, 1)` with
`POSTURE_SHOULDER_TILT_DRIFT_SCALE_DEG = 15` and
`POSTURE_FORWARD_HEAD_DRIFT_SCALE = 0.3`.

A slump is forward-head-dominant, but `shoulderTiltDeg`
(`visual-capture.worker.ts:597`, `atan2(abs(dy), abs(dx))` across the shoulders)
is the acute angle of the shoulder line to HORIZONTAL — a left-right tilt, 0 for
level shoulders, measured at 4.9 deg and 6.3 deg for upright seated users at
12-08. A vertical slump barely moves it. The item-3 session measured exactly
those two signals, so a large forward-head delta is averaged against a near-zero
shoulder-tilt delta, roughly halving the magnitude before the 0.5 trip is
consulted. Forward-head alone would need to reach ~1.0 — a 0.3 change in
normalized offset — to trip unaided.

If that holds, this is a **design issue in the aggregation** (a mean dilutes a
genuine single-signal change), **not a mis-set threshold**, and moving
`POSTURE_DRIFT_TRIP` would treat the symptom while making every other signal
twitchier.

Two further observations from the same code reading, which the follow-up must
test rather than assume:

1. **The dilution is double.** The scored row never sees a per-tick magnitude.
   `posture_drift_mean` (`visual-capture.ts:2648`) is the SESSION-WIDE mean of
   every post-baseline tick's already-averaged drift, and `bandPostureDrift`
   (`bands.ts:409`) compares that against the same 0.5. The quantity must exceed
   0.5 after averaging across signals AND across the whole session, so a slump
   developing partway through is further diluted by the upright opening — which
   the item-3 session had by design. `posture_drift_max_s`, the sustained-streak
   metric, is computed (`visual-capture.ts:1711`) but the band does not use it;
   the episode path uses a per-window mean (`visual-capture.ts:947`).
2. **The forward-head channel may not be able to see a slump at all.**
   `forwardHeadOffset` is `hypot(nose.x - shoulderMidX, nose.y - shoulderMidY) /
   shoulderWidth` — a 2D DISTANCE from the shoulder midpoint, not an anterior
   displacement. True forward-head translation runs along the camera axis and is
   largely invisible to a frontal webcam; what the metric registers in a slump is
   the head dropping TOWARD the shoulder line, which REDUCES the distance. "Forward
   head" is a misnomer for the measured quantity, and its available magnitude is
   bounded by the upright offset itself. This matches the user's own read about
   camera framing, and it means the follow-up should establish whether the signal
   is MEASURABLE from this geometry before concluding it is merely mis-aggregated.

### What the next reading must be

A deliberate-slump session, fully in frame, dumped raw: per-signal deltas per
tick, the baseline values the deltas are taken against, the session mean, and the
streak length. That single capture is the prerequisite for touching
`POSTURE_DRIFT_TRIP`, `POSTURE_DRIFT_SUSTAINED_S`, the
`POSTURE_*_DRIFT_SCALE*` constants, or the aggregation. None of them may be
changed before it exists.

## PHONE_SCORE_THRESHOLD remains undecided — the reading was never taken

Closing the loop on the section above about the removed dump. 12-10 Task 4 item 4
was the second scheduled attempt to capture it and **it did not run either**: the
dump was removed in that same plan's Task 3, as Task 3 required, so by the time
item 4 came up there was nothing to read. The item was deferred to the follow-up
plan rather than re-adding the dump mid-plan.

Net position: `PHONE_SCORE_THRESHOLD` has **no dataset of any kind** behind it,
across 12-07, 12-09 and 12-10. The only phone observation anywhere in this file
is S2's "phone ~30s visible", a behaviour note with no confidence scores attached.
The dump must be re-added before the constant is touched.

---

*Tuned 2026-10-02 against the dataset above. The 12-08 Task 3 sign-off
walkthrough was performed on 2026-10-02 and FAILED on item 7 — see
`12-08-SUMMARY.md` and `12-09-SUMMARY.md`. The 12-09 re-run also failed; the gap
was carried by `12-10-PLAN.md`, whose Task 2 readings are recorded above and
whose Task 4 re-run on 2026-10-03 PASSED item 1 at last. Items 3 (posture-drift
true positive) and 4 (phone confidence) are carried forward — see the two
sections immediately above.*

---

# 12-11: the posture-drift series, and the two dilutions that buried a slump

This section supersedes the "Hypothesis for the item-3 failure" above, which
was a code reading and is now either confirmed or corrected by measurement.
**Branch R of 12-11-PLAN.md Task 3 applies:** the signals CAN see a slump; the
aggregation was burying it.

## Session A — the deliberate slump. The reading the phase had been missing

Run by the user on 2026-10-03 with 12-11 Task 1's dump active. Fully in frame,
well centred, upright ~20s, then a hard and unmistakable held slump. Pasted from
a real browser console; nothing below is estimated or reconstructed.

```
scales: shoulder_line=15deg forward_head=0.3 torso_lean=20deg torso_openness=0.3
POSTURE_DRIFT_TRIP=0.5; POSTURE_BASELINE_WINDOW_S=20
session: sessionSeconds=108.0 poseTicks=162
         postureSignalsMeasured=[shoulder_line, forward_head]
baseline: calibrated=true anchorTS=1.1 signals=[shoulder_line, forward_head]
          sampleCount=31
baseline values: tilt=4.307 fwdHead=0.7681 lean=- open=-
MAXIMA over ALL 131 post-baseline ticks (NOT sampled):
  max per-tick driftMagnitude = 0.643 at t=107.1
  max per-signal delta        = 1.000 (forward_head) at t=55.9
    max delta shoulder_line   = 0.508 at t=53.9
    max delta forward_head    = 1.000 at t=55.9
  posture_drift_mean  = 0.373 (over 131 scored ticks)
  posture_drift_max_s = 12.0 (sustained streak above the trip;
                              computed but NOT read by the band)
```

Series rows (the full 131/131 were printed unsampled; the paste truncated around
t=35, but the MAXIMA block above is complete and authoritative):

```
t=21.4 raw[tilt=5.48 fwdHead=0.7887] delta[tilt=0.078 fwdHead=0.069] drift=0.074
t=26.1 raw[tilt=5.30 fwdHead=0.6975] delta[tilt=0.067 fwdHead=0.235] drift=0.151
t=32.7 raw[tilt=3.26 fwdHead=0.6924] delta[tilt=0.070 fwdHead=0.252] drift=0.161
t=33.4 raw[tilt=2.22 fwdHead=0.5999] delta[tilt=0.139 fwdHead=0.561] drift=0.350
t=34.0 raw[tilt=1.82 fwdHead=0.6200] delta[tilt=0.166 fwdHead=0.494] drift=0.330
t=34.7 raw[tilt=1.91 fwdHead=0.5964] delta[tilt=0.160 fwdHead=0.572] drift=0.366
```

**The report for this session said: "Posture drift: Held steady from the opening
posture", measured from "Shoulder line and Head position".**

The arithmetic was re-derived independently from the raw readings and the
baseline before anything was changed, and it reproduces the dump exactly:
at t=33.4, `|0.5999-0.7681|/0.3 = 0.561` and `|2.22-4.307|/15 = 0.139`, mean
`0.350` — the printed `drift`. **The computation was never wrong. The statistic
the band read was.**

## Sessions B and C

- **Session B (lateral lean) — NOT RUN, and NO LONGER NEEDED.** Its stated
  purpose was to separate "slump-blind" from "wholly dead", and Session A
  answered that on its own: both channels moved, `shoulder_line` reaching 0.508.
  Recorded as not-needed rather than outstanding.
- **Session C (phone held) — NOT RUN. Still outstanding.** See the phone section
  at the end.

## Which cause each reading settled

**Cause 1 — the cross-signal mean. CONFIRMED, and worse than hypothesised.**
`forward_head` saturated at the clamp ceiling (1.000) while the peak per-tick
drift was only 0.643, because the mean averaged it against `shoulder_line`'s
0.286. Beyond the hypothesis, one case decides the shape of the repair: a PURE
slump — `forward_head` saturated at 1.000 with a perfectly still shoulder line
at 0.000 — averages to **exactly 0.500**: the hard CEILING on per-tick drift for
a single-axis slump, no matter how extreme.

**Correction (orchestrator, on review):** the original wording here said 0.500
"is not `> 0.5`". That step is wrong — the pre-12-11 comparator was
`clamped >= POSTURE_DRIFT_TRIP` (`bands.ts:409` at `df02eee^`), so a value of
exactly 0.500 WOULD have satisfied it. The conclusion survives by a different
and stronger route: the band read the SESSION-WIDE mean, which also averages in
the mandatory upright opening and every non-slump tick (Session A's upright rows
run ~0.07-0.09). A real pure-slump session is therefore strictly BELOW the 0.500
per-tick ceiling, never at it. So a maximal single-axis slump was undetectable
in practice, and **lowering `POSTURE_DRIFT_TRIP` could never have fixed it** —
the ceiling is a property of the mean, not of the cutoff. The repair decision
(take the worst axis) is unaffected and correct. Session A only
reached 0.643 because its shoulders happened to move too. The mean was wrong in
KIND: the four signals are roughly orthogonal axes, not repeated measurements of
one quantity, and a student who drifts hard on one axis got half credit for the
axis they did not move. `computePostureDrift` now takes the **worst (maximum)
axis**.

**Cause 2 — the session-wide mean. CONFIRMED.** A session is required BY DESIGN
to open upright (the first 20s establishes the baseline), so averaging across it
dilutes any later slump against a mandatory upright opening: the longer a
student holds good posture before slumping, the lower the score the slump
produces. Session A peaked at 0.643 and held above the trip for 12.0s, and that
collapsed to a 0.373 session mean. `bandPostureDrift` now reads
`posture_drift_max_s` — the sustained streak, computed and persisted since 12-06
and until now **read by nothing**.

**Cause 3 — `forwardHeadOffset` is a misnomer. CONFIRMED AS LABELLING; 12-10's
STRONGER CLAIM IS WITHDRAWN.** This correction matters, because the ledger above
currently implies the channel may be blind to a slump and **it is not.**

12-10 recorded that the metric measures head-to-shoulder DISTANCE rather than
anterior displacement, and that therefore "the sign may be backwards relative to
the behaviour being graded." The first half is confirmed: `fwdHead` DECREASED
during the slump, 0.7681 -> <=0.4681. The second half does not follow.
`computePostureDrift` scores `Math.abs(current - baseline)`, so a decrease
registers exactly as strongly as an increase of the same size — the direction
cannot affect the magnitude. Far from being blind, **`forward_head` was the
STRONGEST responder to the slump in the entire session**, the only signal to
saturate. The defect is purely one of labelling, and 12-10's close (and 12-11's
own planning) overstated it. Do not carry the stronger claim forward.

The name was left alone deliberately — it is load-bearing across the worker,
`PostureReading`/`PostureBaseline` field names, the `forward_head` signal key,
the "Head position" display wording, and this file's recorded readings; renaming
risks a transcription error in a phase that has already shipped three wrong
posture verdicts. Its doc comment now states what it actually measures.
`headToShoulderDistance` is the accurate name if it is ever renamed.

## The trap in the obvious fix — demonstrated, not just argued

Switching the band onto `posture_drift_max_s` looks like the clean repair. **On
its own it would have produced a second silent false negative.**
`POSTURE_DRIFT_SUSTAINED_S` was 15, and Session A's held slump measured 12.0s.

This was verified empirically rather than reasoned about: with both aggregation
repairs in place and that constant alone left at 15,
`scripts/verify-visual-metrics.ts` still reported

```
FAIL Session A: the slump is finally reported
       expected "Shifted from the opening posture"
       actual   "Held steady from the opening posture"
```

— the original defect, intact, one layer down, with the aggregation repair
appearing to have done nothing. An assertion now pins
`POSTURE_DRIFT_SUSTAINED_S <= 12`.

Why a minute-long held slump only ever produced a 12s run is visible in the
series: at t=33.4/34.0/34.7 the mean read 0.350/0.330/0.366, all BELOW the trip,
contributing no streak at all, while the worst axis read 0.561/0.494/0.572.

## Constants decided

| Constant | Before | After | Basis |
|---|---|---|---|
| `computePostureDrift` cross-signal reduction | mean | **max (worst axis)** | Cause 1 above; the pure-slump 0.500 case |
| `bandPostureDrift` statistic | `posture_drift_mean` | **`posture_drift_max_s`** | Cause 2 above |
| `POSTURE_DRIFT_SUSTAINED_S` | 15 (**unused**) | **8** (wired up) | Session A's 12.0s streak, with margin for the observed mid-slump dip |
| `POSTURE_DRIFT_TRIP` | 0.5 | **0.5 (retained)** | Now bounded both sides: ordinary <=0.252, slump >=0.508 |
| `POSTURE_*_DRIFT_SCALE*` | 15 / 0.3 / 20 / 0.3 | **unchanged** | shoulder 15deg gets its first real support (7.62deg observed); forward-head 0.3 SATURATED — see below |
| `POSTURE_COVERAGE_MIN_RATIO` | 0.60 | **0.60 (retained)** | The ceiling reading exists and does not narrow it — see below |
| `PHONE_SCORE_THRESHOLD` | 0.5 | **still undecided** | Only the false-positive side was measured |

**EVIDENCE BASE: ONE SLUMP SESSION.** Labelled SET FROM ONE REAL SESSION, not
TUNED, matching how 12-10 labelled its own 0.60. The false-positive side of the
worst-axis change rests on a single upright stretch from that same session, and
12-11 Task 4's ordinary-session check is its first real test. **12-TUNING.md's
S1-S4 ordinary readings cannot be used for it: they predate 12-10's frame-bounds
gating and are contaminated by extrapolated skeletons.**

## A known limit: forward_head SATURATED at the clamp ceiling

`forward_head`'s peak delta was **exactly 1.000**, which is the clamp in
`computePostureDrift`, not a measurement. It says only that the offset moved at
least 0.3 (the scale) from a 0.7681 baseline. **The true magnitude is unknown
and unrecoverable from this dump, because the clamp discarded it.**

The consequence is specific: **0.3 may be too small to discriminate a moderate
slump from an extreme one** — both land at 1.000 and read identically. This does
not affect DETECTION, which is now proven, but the channel has no usable dynamic
range above the cutoff and **cannot support any future severity or
degree-of-slump wording.**

0.3 was not raised on that basis, and the restraint is the decision: raising it
to recover headroom would simultaneously desensitise detection, trading a proven
true positive for a severity gradation nothing has asked for. The reading needed
first is an **UNCLAMPED** per-signal delta series — dump
`abs(current - baseline) / scale` before the clamp, across a moderate slump and
a hard one, and set the scale from the gap between them.

## POSTURE_COVERAGE_MIN_RATIO — re-decided, and 12-10's expectation corrected

12-10 named a fully-in-frame session as "the first thing to collect before
touching the value". Session A is that session: 162 pose ticks, both signals
measured, all 162 ticks yielding at least one usable signal (>=80.9% jointly).
**It does not narrow the cutoff, and nothing should keep waiting for it.**

12-10 located 0.60 inside a band whose ends are its two DECISION boundaries: it
must REFUSE 12-10's off-camera Session A (`forward_head` 43%) and ACCEPT 12-10's
half-visible Session B (75.4%). Any value in (0.43, 0.754] gives identical
verdicts. A fully-in-frame session lands far ABOVE that band rather than inside
it, so every candidate value accepts it and it discriminates between none of
them. The reading does confirm a good session clears the gate with 20+ points of
headroom, and rules this cutoff out as a cause of the item-3 false negative —
but 12-10's expectation that a ceiling reading would locate the value was
mistaken about what such a reading can do.

**What would actually narrow it:** a session genuinely partial at BETWEEN 43%
and 75% in frame — one whose verdict DIFFERS across the band — plus the user's
judgement on whether it ought to have been scored. Still not collected. 0.60 is
still not well-characterised.

## PHONE_SCORE_THRESHOLD — still undecided, but half the dataset now exists

Session C was not run, so for the fourth plan running this constant is not set.
The position is now narrower than "no data", though: Session A held **no phone
at any point**, which makes it a clean **false-positive floor**.

```
objectTicks=53 ticksWithACellPhoneDetection=4 ticksWithNone=49
min=0.058 median=0.081 max=0.163
atOrAbove 0.5 = 0; below 0.5 (above the 0.05 dump floor) = 4
histogram: 0.0-0.1: 3   0.1-0.2: 1   rest 0
phone_visible_seconds = 0.0
```

This is genuinely useful partial evidence: the model DOES emit spurious
low-confidence "cell phone" detections on a phone-free session, and 0.5 refused
every one of them with ~3x of margin, correctly reporting 0.0 seconds. Nothing
here argues for raising it.

**The true-positive side has never been observed, in any plan.** Without it
there is no way to know whether a genuinely-held phone scores 0.9 (0.5 is fine)
or 0.3 (0.5 silently discards real phone time — a false negative in exactly the
shape posture drift just turned out to be). A one-sided reading can only justify
RAISING a cutoff, and raising it is not the direction any evidence points.
Guessing from the false-positive side alone is the move that 12-09's coverage
guess and 12-10's proposed per-tick fix were both caught making, so the constant
stays at 0.5 and stays labelled undecided.

**THE PHONE HALF OF THE DEV DUMP WAS DELIBERATELY KEPT IN PLACE**
(`NEXT_PUBLIC_PHONE_CONFIDENCE_DEV_DUMP`), unlike the posture half, which was
removed in 12-11 Task 3 once the readings above were recorded. 12-10 removed
this instrument in its Task 3 and then found at its own Task 4 item 4 that there
was nothing left to read; that is the mistake the retention avoids repeating.
**A future phone decision requires this dump, so do not remove it until a
phone-held session's distribution is recorded here.**

## 12-11 Task 4: the first BOTH-DIRECTIONS validation in the phase (2026-10-03)

Run by the user against a freshly rebuilt dev server. **All items PASS.** This is
the section to read if the question is "has the scored posture-drift row ever
been observed to work?" — the answer was no until these two sessions.

### The true positive — slump session

Fully in frame, upright, then a hard held slump.

- `Posture drift: **Shifted from the opening posture**`
- `Measured from: Shoulder line and Head position`
- Moments: `0:43-1:26 [Camera] Looking away` ·
  **`0:48-1:26 [Body language] Posture shifted from the start of the session`** ·
  `1:04-1:26 [Camera] Off centre in frame`
- ON CAMERA: Eye contact Solid · Attention Intermittent · Framing Mostly centred ·
  On camera Present throughout · Lighting Clear · Steadiness Steady
- Narrative: "Face appeared on camera 99% of the time, and the camera was
  well-centered 78% of the session. However, forward-facing attention was low at
  56%..."

### The false positive — ordinary session

Sat normally, ordinary small shifts.

- `Posture drift: **Held steady from the opening posture**`
- `Measured from: Shoulder line and Head position`
- **No Moments content at all** — no episode fired. Correct: the Moments tab only
  populates when an episode fires, and the user confirmed they "didn't do
  anything unnatural".

### Why the pair matters, and what it does NOT establish

Prior history of this row, completely: **three** "Held steady" readings on
genuine slumps (12-08, 12-09, 12-10 item 3), and **one** "Shifted" which was
12-09's FALSE POSITIVE on an extrapolated skeleton. **The false-positive side had
never been tested in any plan.** These two sessions are the first time the row
has been seen to respond correctly in both directions on the SAME build.

Unasked-for corroboration: the episode detector (`0:48-1:26`) uses a per-window
drift mean (`visual-capture.ts:1050`) while the band compares
`posture_drift_max_s >= POSTURE_DRIFT_SUSTAINED_S`. **Independent code paths**,
and they agreed in both directions.

What this does NOT establish: the ordinary session is **one** reading on the
false-positive side, and the slump session is **one** on the true-positive side.
`POSTURE_DRIFT_TRIP` (0.5) and `POSTURE_DRIFT_SUSTAINED_S` (8) stay labelled
**SET FROM ONE REAL SESSION, not TUNED**. `POSTURE_DRIFT_SUSTAINED_S` in
particular is bounded from ABOVE only (Session A's 12.0s streak); nothing bounds
it from below, so how short a genuine shift can be before it is missed is
unknown.

### The stale-server false alarm, and the second slump dataset it produced

The user's FIRST attempt at the slump item ran against the **pre-`df02eee` dev
server process**. It reported "Held steady" and still printed the posture dump
that Task 3 removed, whose text carried the pre-fix wording "computed but NOT
read by the band". Those two tells — a removed instrument still printing, and its
text describing behaviour that no longer existed — are what caught it, and the
user restarted before anything was read into the result.

**A stale dev server is a live failure mode for every `NEXT_PUBLIC_*`-gated
reading recorded in this file.** A hot reload does not pick up a build-time
inlined var or a recompiled module. Future dumps should print a build marker.

That session's readings are a valid **SECOND slump dataset under the OLD
aggregation**, and they corroborate the cross-signal dilution independently of
Session A:

```
baseline: tilt=1.324 fwdHead=0.7924
session:  sessionSeconds=95.5   112 post-baseline ticks
max per-signal delta forward_head  = 1.000 at t=43.4
max per-signal delta shoulder_line = 0.997 at t=54.7
old cross-signal mean peaked at      0.798
posture_drift_mean  = 0.330
posture_drift_max_s = 0.7
phone: 47 object ticks, ZERO cell-phone detections
```

Both axes nearly saturated — at *different moments*, which is the whole point —
and the mean still peaked at only 0.798, with a sustained streak of **0.7s**
against the 15s constant then in force. Under the repaired worst-axis reduction
this session would have produced a long streak. It is the clearest single
demonstration in the record that the mean, not the cutoff, was the defect.

### PHONE_SCORE_THRESHOLD after Task 4 — STILL UNDECIDED

Task 4 item 4 was **deliberately not run**: Task 3 set no threshold, so there was
nothing to validate. For the fourth plan running, this constant is unset by
design.

The dataset, stated completely — **both sides of it are the same side**:

| Session | Phone held? | Object ticks | Detections | Confidence | Reported |
|---|---|---|---|---|---|
| 12-11 Session A | no | 53 | 4 spurious | min 0.058 / med 0.081 / max 0.163; none >=0.5 | 0.0s (correct) |
| 12-11 stale-server slump | no | 47 | 0 | — | 0.0s (correct) |

So the **false-positive floor is now doubly confirmed** and 0.5 refuses spurious
detections with ~3x margin. **The true-positive side has never been observed in
any plan** (12-07, 12-09, 12-10, 12-11). A one-sided reading can only justify
RAISING a cutoff, and nothing points that way. There is a concrete reason to
suspect the opposite: the user earlier observed a sustained in-frame phone
reported as "about 2 seconds", which looks like **under**-detection — a false
negative in exactly the shape posture drift turned out to be.

**What is needed: one timed phone-held session with
`NEXT_PUBLIC_PHONE_CONFIDENCE_DEV_DUMP=1`.** The dump is still in place for
precisely this. **Do not remove it until that distribution is recorded here.**
This reading also blocks Phase 12 ROADMAP criterion 1 — see `12-11-SUMMARY.md`.

---

## PHONE_SCORE_THRESHOLD — RESOLVED by scope decision, 2026-10-03

The true-positive side was finally run. A phone held clearly in frame produced:

- Observations: **"A phone was visible for about 8 seconds"**
- Moments: **`0:11-0:21 [Observation] Phone visible`** — detected and timecoded

**This is the first true-positive phone observation in the phase.** Both prior
sessions were no-phone (4 spurious detections topping out at 0.163, and one with
zero), which could only ever bound the cutoff from above.

**Known limitation, accepted by the user:** the reported duration UNDER-COUNTS.
The user held the phone in frame for noticeably longer than the 8 seconds
reported, and judged it acceptable — *"as long as it's generally accurate, it's
really not the most important of things."* That is a deliberate scope decision,
recorded here as such rather than as an unexamined pass.

**Why under-counting is tolerable HERE and was not for posture drift.** The phone
is a `12-07` descriptive observation: it renders under the Observations heading
whose text reads "These do not affect any score", it is tagged `Observation`
rather than `Body language` in the Moments timeline, and no scored field may
derive from it (enforced at the type level — see `VisualDescriptiveObservations`
in `types.ts`). An imprecise duration in a descriptive line is a precision
defect. Posture drift's false negatives were a different kind of failure: a
SCORED row told a student "Held steady" as praise for behaviour they did not
exhibit.

**`PHONE_SCORE_THRESHOLD` is therefore LEFT AT 0.5, unchanged.** Not because it
was validated as optimal, but because:
  - its false-positive side is well bounded (spurious ceiling 0.163 across two
    no-phone sessions, comfortably below 0.5), and
  - its true-positive side is now demonstrated to fire at all, which was the open
    question.

**Two candidate causes of the under-count were NOT distinguished, and a future
plan should not assume it is the threshold:**
  1. **Threshold too high** — detections between the 0.163 spurious ceiling and
     0.5 would be discarded. The phone-held session's raw confidence
     distribution was never captured (the user reported from the report UI, not
     the console dump), so this is unquantified.
  2. **Object sampling too sparse** — the staggered scheduler gives the object
     model roughly 0.5 Hz (53 object ticks across a 108s session), so a 10-second
     presence is only ~5 samples. Coarse sampling alone can under-count a
     genuinely detected phone regardless of threshold.

Distinguishing these needs the raw per-tick `phoneScore` series from a
phone-held session. The dump that produces it was removed when this plan closed;
re-adding it is the first step of any future attempt.

