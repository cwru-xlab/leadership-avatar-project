---
phase: 12-embodied-visual-signals
plan: 11
subsystem: posture-drift-measurement
tags: [posture-drift, measure-first, aggregation, worst-axis, sustained-streak, phone-threshold, sign-off]

requires:
  - phase: 12-embodied-visual-signals
    plan: 10
    provides: "frame-bounds landmark gating, so the posture signals this plan tuned against were genuinely observed rather than extrapolated; plus the item-3 false-negative finding this plan was created to settle"
  - phase: 12-embodied-visual-signals
    plan: 08
    provides: "the fidgeting retirement precedent that governed this plan's branch choice, and the threshold ledger in 12-TUNING.md"
provides:
  - "The per-tick posture drift series the phase had been missing since 12-08 — raw readings, baselines, per-signal deltas, per-session maxima — captured from a real deliberate-slump session and recorded in 12-TUNING.md"
  - "computePostureDrift reduces across signals by WORST AXIS instead of arithmetic mean (cause 1)"
  - "bandPostureDrift reads posture_drift_max_s (the sustained streak) instead of posture_drift_mean (cause 2)"
  - "POSTURE_DRIFT_SUSTAINED_S 15 -> 8, wired up for the first time after being read by nothing across three plans"
  - "The first demonstration in the entire phase that the scored posture-drift row responds CORRECTLY IN BOTH DIRECTIONS on the same build"
  - "A no-phone false-positive floor for PHONE_SCORE_THRESHOLD, with the constant deliberately left undecided and its dev dump deliberately retained"
  - "Withdrawal of 12-10's 'the sign may be backwards' claim about forwardHeadOffset"
  - "A recorded known limit: forward_head saturates at the clamp ceiling, so the channel cannot support severity wording"

affects:
  - "Any future re-tune of POSTURE_DRIFT_TRIP / POSTURE_DRIFT_SUSTAINED_S / POSTURE_*_DRIFT_SCALE* — the evidence base is ONE slump session plus ONE ordinary session"
  - "A future phone-threshold plan: the dump is in place and the true-positive reading is the only thing missing"
  - "Phase 12 close (orchestrator-run phase verification), and 12-03 whose ROADMAP checkbox is flagged as probably stale"

tech-stack:
  added: []
  patterns:
    - "Measure-first sequencing, third consecutive application: instrumentation task -> blocking human reading checkpoint -> constants derived only from the pasted readings"
    - "Verify a repair by REVERTING the single constant and watching the assertion fail, rather than reasoning that the repair is sufficient"
    - "Retain a dev dump whose reading has not yet been taken, instead of removing it with the plan that added it"

key-files:
  created: []
  modified:
    - lib/metrics/visual-capture.ts
    - lib/metrics/visual-capture.worker.ts
    - lib/metrics/body-thresholds.ts
    - lib/metrics/bands.ts
    - lib/metrics/types.ts
    - scripts/verify-visual-metrics.ts
    - .planning/phases/12-embodied-visual-signals/12-TUNING.md

key-decisions:
  - "Branch R, not Branch X: the signals CAN see a slump (forward_head saturated at 1.000 during the held slump), so the scored row was repaired rather than retired — 12-08's fidgeting precedent did not apply because the geometry was never the problem"
  - "Cross-signal reduction changed from mean to WORST AXIS: the four signals are roughly orthogonal axes, not repeated measurements of one quantity, so a mean gives a student half credit for the axis they did not move"
  - "bandPostureDrift reads the sustained streak, not the session mean: a session opens upright BY DESIGN, so a session-wide mean dilutes any later slump against a mandatory upright opening"
  - "POSTURE_DRIFT_SUSTAINED_S lowered 15 -> 8 and the insufficiency of the aggregation fix ALONE was proven empirically by reverting that constant and watching the assertion fail"
  - "POSTURE_DRIFT_TRIP retained at 0.5 — it was never the defect; it is now bounded on both sides (ordinary <=0.252, slump >=0.508)"
  - "POSTURE_FORWARD_HEAD_DRIFT_SCALE left at 0.3 despite saturating, because raising it to recover dynamic range would desensitise a detection that has only just been proven"
  - "PHONE_SCORE_THRESHOLD left at 0.5 and labelled still undecided; only the false-positive side has ever been observed, and a one-sided reading can only justify RAISING a cutoff"
  - "The posture half of the dev dump was removed once its readings were recorded; the PHONE half was deliberately KEPT, because 12-10 removed it before taking its reading and then had nothing to read"
  - "forwardHeadOffset was NOT renamed — the name is load-bearing across the worker, two type contracts, the signal key, display wording and this phase's recorded readings; its doc comment now states what it actually measures"

requirements-completed: [REQ-51]

status: DELIVERED
duration: 4 tasks across 2 days, two blocking human checkpoints
completed: 2026-10-03
---

# Phase 12 Plan 11: Is a Slump Measurable At All? Summary

**A frontal webcam can see a slump perfectly well — `forward_head` saturated its
clamp during a held slump — and the scored row reported "Held steady" anyway,
because the band read a session-wide mean of a cross-signal mean. Both means are
gone, and the row has now been demonstrated to respond correctly in BOTH
directions on the same build for the first time in the phase.**

## Status: DELIVERED

The plan asked one question — *can a frontal webcam see a slump at all through
the signals this pipeline computes?* — and committed in advance to either
repairing the mechanism or retiring the scored row on 12-08's fidgeting
precedent. **The readings put it on Branch R: repair.** Task 4's human sign-off
then passed in full, including the false-positive side, which had never been
tested in any plan.

## Performance

- **Tasks:** 4 of 4 (Tasks 2 and 4 were blocking human checkpoints)
- **Files modified:** 7 (6 source/script, 1 planning record)
- **Completed:** 2026-10-03

## Task Commits

1. **Task 1: Capture the drift series, the geometry behind it, and the phone distribution** — `a854519` (feat)
2. **Task 2: Record the readings that decide whether a slump is measurable** — human checkpoint, no commit; readings transcribed in `12-TUNING.md`. Checkpoint recorded in docs `39eceba`.
3. **Task 3: Decide — repair the mechanism, or retire the scored row** — `df02eee` (fix). Checkpoint recorded in docs `dbf5c5d`.
4. **Task 4: Sign off the posture outcome** — human checkpoint, no code. Outcome recorded in this SUMMARY.

**Mid-flight correction:** `c5d2d87` (docs) — the orchestrator corrected the
pure-slump argument in `12-TUNING.md`. See below; the corrected version is the
one this SUMMARY carries.

**Plan metadata:** see the final docs commit for this plan.

## Branch R, and why the data chose it

Task 2's Session A — fully in frame, well centred, upright ~20s, then a hard
unmistakable held slump; 108.0s, 162 pose ticks, baseline `tilt=4.307deg`
`fwdHead=0.7681`, 131 post-baseline scored ticks — produced the decisive numbers:

```
max per-tick driftMagnitude = 0.643 at t=107.1
max per-signal delta        = 1.000 (forward_head) at t=55.9
  max delta shoulder_line   = 0.508 at t=53.9
posture_drift_mean  = 0.373
posture_drift_max_s = 12.0   (computed, and read by nothing)
```

The plan's own branch test was explicit: *if the max per-signal delta is large
while the session mean stays below the trip, the signal CAN see the slump and the
aggregation is burying it (Branch R); if every per-signal delta stays small
through a held slump, the signals cannot represent the behaviour (Branch X).*
`forward_head` reached the clamp ceiling and `shoulder_line` reached 0.508. Both
channels moved. **Branch X was excluded by the readings, not by preference** —
which also made Session B (the lateral-lean probe, whose purpose was to separate
"slump-blind" from "wholly dead") unnecessary rather than outstanding.

The arithmetic was re-derived by hand from the raw readings before anything was
changed, and it reproduced the dump exactly (at t=33.4,
`|0.5999-0.7681|/0.3 = 0.561` and `|2.22-4.307|/15 = 0.139`, mean `0.350` — the
printed value). **The computation was never wrong. The statistic the band read
was.**

## The pure-slump ceiling — as corrected

This is the argument that decides the SHAPE of the repair, and its first written
form contained a wrong step. The corrected version:

A PURE slump — `forward_head` saturated at 1.000 with a perfectly still shoulder
line at 0.000 — averages under the old cross-signal mean to **exactly 0.500**.
That is a hard ceiling on per-tick drift for a single-axis slump, no matter how
extreme the slump is.

**The original ledger wording concluded from this that 0.500 "is not `> 0.5`".
That step was wrong**, and the orchestrator corrected it in `c5d2d87`: the
pre-12-11 comparator was `clamped >= POSTURE_DRIFT_TRIP` (`bands.ts:409` at
`df02eee^`), so a value of exactly 0.500 *would* have satisfied it.

**The conclusion survives by a different and stronger route.** The band did not
read a per-tick value at all — it read the SESSION-WIDE mean, which also averages
in the mandatory upright opening (the first `POSTURE_BASELINE_WINDOW_S` = 20s
establishes the baseline) and every other non-slump tick. Session A's upright
rows run ~0.07-0.09. A real pure-slump session therefore sits **strictly below**
the 0.500 per-tick ceiling, never at it. So a maximal single-axis slump was
undetectable in practice, and **lowering `POSTURE_DRIFT_TRIP` could never have
fixed it: the ceiling is a property of the mean, not of the cutoff.**

The repair decision is unaffected and correct. `computePostureDrift` now takes
the **worst (maximum) axis**, because the mean was wrong in KIND — the four
posture signals are roughly orthogonal axes, not repeated measurements of one
quantity, and a student who drifts hard on one axis was getting half credit for
the axis they did not move. Session A only reached 0.643 because its shoulders
happened to move too.

## The constant that was dead for three plans

`POSTURE_DRIFT_SUSTAINED_S` has existed since 12-06. A grep across `lib`,
`scripts` and `app` matched **only its own declaration**. Nothing read it. For
three plans it sat in `body-thresholds.ts` under a file header that certified
every constant in the file as achievable, and it could not have affected any
output at all.

The same is true of the quantity it governs: `posture_drift_max_s` was computed
(`visual-capture.ts:1711`) and persisted on `VisualMetrics` since 12-06, and the
band never looked at it. The one statistic that describes what a slump actually
*is* — a stretch of real time spent away from where you started — was being
produced and discarded, while the band read the one statistic structurally
incapable of showing it.

## The trap in the obvious fix — demonstrated, not argued

Switching the band onto `posture_drift_max_s` looks like the whole repair. **On
its own it would have produced a second silent false negative.**
`POSTURE_DRIFT_SUSTAINED_S` was 15, and Session A's held slump measured 12.0s.

This was established empirically rather than reasoned about. With BOTH
aggregation repairs in place and that constant alone left at 15,
`scripts/verify-visual-metrics.ts` still reported:

```
FAIL Session A: the slump is finally reported
       expected "Shifted from the opening posture"
       actual   "Held steady from the opening posture"
```

— the original defect, fully intact, one layer down, with the aggregation repair
appearing to have accomplished nothing. An assertion now pins
`POSTURE_DRIFT_SUSTAINED_S <= 12`.

Why a minute-long held slump only ever produced a 12s run is visible in the
series: at t=33.4/34.0/34.7 the old mean read 0.350/0.330/0.366, all below the
trip and contributing no streak at all, while the worst axis read
0.561/0.494/0.572.

## Constants decided, with basis

| Constant | Before | After | Basis |
|---|---|---|---|
| `computePostureDrift` cross-signal reduction | mean | **max (worst axis)** | Cause 1; the pure-slump 0.500 ceiling, as corrected above |
| `bandPostureDrift` statistic | `posture_drift_mean` | **`posture_drift_max_s`** | Cause 2 — a session opens upright by design, so a session mean dilutes any later slump |
| `POSTURE_DRIFT_SUSTAINED_S` | 15 (**unused**) | **8** (wired up) | Session A's 12.0s streak, with margin for the observed mid-slump dip; bounded from ABOVE only |
| `POSTURE_DRIFT_TRIP` | 0.5 | **0.5 (retained)** | Never the defect. Now bounded both sides: ordinary <=0.252, slump >=0.508 |
| `POSTURE_SHOULDER_TILT_DRIFT_SCALE_DEG` | 15 | **15 (unchanged)** | First real support: 7.62deg observed swing |
| `POSTURE_FORWARD_HEAD_DRIFT_SCALE` | 0.3 | **0.3 (unchanged)** | SATURATED — deliberately not raised; see the known limit below |
| `POSTURE_*_DRIFT_SCALE*` (torso lean/openness) | 20 / 0.3 | **unchanged** | Neither signal was in frame in any session; no reading exists |
| `POSTURE_COVERAGE_MIN_RATIO` | 0.60 | **0.60 (retained)** | The fully-in-frame ceiling reading exists but lands ABOVE the decision band, so it cannot narrow it — this corrects 12-10's expectation that such a reading would locate the value |
| `PHONE_SCORE_THRESHOLD` | 0.5 | **still undecided** | Only the false-positive side has ever been measured |

**EVIDENCE BASE: ONE SLUMP SESSION plus ONE ORDINARY SESSION.** Labelled
**SET FROM ONE REAL SESSION, not TUNED**, matching how 12-10 labelled its own
0.60. Task 4's ordinary session (below) is the first and only evidence on the
false-positive side; before it, that side rested on a single upright stretch from
the slump session itself. `12-TUNING.md`'s S1-S4 ordinary readings cannot be used
for it — they predate 12-10's frame-bounds gating and are contaminated by
extrapolated skeletons.

## A claim withdrawn: forwardHeadOffset's sign

12-10's close recorded that `forwardHeadOffset` measures head-to-shoulder
DISTANCE rather than anterior displacement, and concluded that therefore "the
sign may be backwards relative to the behaviour being graded", with the stronger
implication that the channel might be blind to a slump.

**The first half is confirmed; the stronger claim is WITHDRAWN.** `fwdHead` did
decrease during the slump (0.7681 -> <=0.4681), so the metric is indeed a
distance and "forward head" is a genuine misnomer. But `computePostureDrift`
scores `Math.abs(current - baseline)`, so a decrease registers exactly as
strongly as an increase of the same size — direction cannot affect magnitude. Far
from being blind, **`forward_head` was the strongest responder to the slump in
the entire session, and the only signal to saturate.** The defect is purely one
of labelling. 12-10's close and 12-11's own planning both overstated it; the
stronger claim must not be carried forward.

The name was left alone deliberately: it is load-bearing across the worker, the
`PostureReading`/`PostureBaseline` field names, the `forward_head` signal key,
the "Head position" display wording and every reading recorded in
`12-TUNING.md`. Renaming it risks a transcription error in a phase that has
already shipped three wrong posture verdicts. Its doc comment now states what it
actually measures. `headToShoulderDistance` is the accurate name if it is ever
renamed.

## A known limit: forward_head saturated at the clamp ceiling

`forward_head`'s peak delta was **exactly 1.000**, which is the clamp in
`computePostureDrift`, not a measurement. It establishes only that the offset
moved at least 0.3 (the scale) from a 0.7681 baseline. **The true magnitude is
unknown and unrecoverable from this dump, because the clamp discarded it.**

The consequence is specific: **0.3 may be too small to discriminate a moderate
slump from an extreme one** — both land at 1.000 and read identically. This does
not affect DETECTION, which is now proven in both directions, but the channel has
no usable dynamic range above the cutoff and **cannot support any future severity
or degree-of-slump wording.**

0.3 was not raised on that basis, and the restraint is the decision: raising it
to recover headroom would simultaneously desensitise detection, trading a proven
true positive for a severity gradation nothing has asked for. The reading needed
first is an **UNCLAMPED** per-signal delta series — dump
`abs(current - baseline) / scale` before the clamp, across a moderate slump and a
hard one, and set the scale from the gap between them.

## Task 4 — the sign-off, run by the user 2026-10-03. ALL ITEMS PASS

Items 1 and 2 of 12-10's sign-off were not re-run, per the plan.

### Item 1 — the true positive (slump session). PASS

Fully in frame, upright, then a hard held slump.

- `Posture drift: **Shifted from the opening posture**`
- `Measured from: Shoulder line and Head position`
- Moments tab: `0:43-1:26 [Camera] Looking away` · **`0:48-1:26 [Body language] Posture shifted from the start of the session`** · `1:04-1:26 [Camera] Off centre in frame`
- ON CAMERA: Eye contact Solid · Attention Intermittent · Framing Mostly centred · On camera Present throughout · Lighting Clear · Steadiness Steady
- Narrative: "Face appeared on camera 99% of the time, and the camera was well-centered 78% of the session. However, forward-facing attention was low at 56%..."

### Item 2 — the false positive (ordinary session). PASS

Sat normally, ordinary small shifts.

- `Posture drift: **Held steady from the opening posture**`
- `Measured from: Shoulder line and Head position`
- **No Moments tab content** — no episode fired at all.

The user noted the empty Moments tab and judged it correct, since they "didn't do
anything unnatural". That is right: the Moments tab only populates when an
episode fires, and an ordinary session should fire none.

### Item 3 — "Measured from" names the genuinely-in-frame signals. PASS

REQ-51's partial-visibility clause, which passed at 12-10 item 2, has not
regressed.

### Item 4 — phone. NOT RUN, deliberately

Task 3 set no phone threshold, so there was nothing to validate.
`PHONE_SCORE_THRESHOLD` remains unset by design. See below.

### Why item 1 and item 2 together matter more than either alone

**This is the first time in the entire phase that the scored posture-drift row
has been demonstrated to respond correctly in BOTH directions on the same
build.** The prior history of that row, completely:

- three "Held steady" readings on genuine slumps (12-08, 12-09, 12-10 item 3),
- one "Shifted" — 12-09's FALSE POSITIVE, on an extrapolated skeleton,
- and **the false-positive side had never been tested in any plan at all.**

One further corroboration, which neither the plan nor the orchestrator asked
for: the episode detector that produced `0:48-1:26` uses a per-window drift mean
(`visual-capture.ts:1050`), while the band's verdict compares
`posture_drift_max_s >= POSTURE_DRIFT_SUSTAINED_S`. These are **independent code
paths**, and they agreed in both directions — both fired on the slump session,
both stayed silent on the ordinary one. The timecode also matches when the user
slumped.

### One earlier false alarm, for the record

The user's first attempt at item 1 ran against a **stale dev server** — the
pre-`df02eee` process. `NEXT_PUBLIC_*` vars and compiled module changes are not
picked up by a hot reload of an already-running build. It reported "Held steady"
and still printed the removed posture dump, whose text carried the pre-fix
wording "computed but NOT read by the band". The orchestrator caught it from
those two tells — a removed instrument still printing, and its text describing
behaviour that no longer existed — and had the user restart before reading
anything into the result.

**That session's readings are not wasted.** They are a valid SECOND slump
dataset under the OLD aggregation, and they corroborate the cross-signal
dilution independently of Session A: both axes nearly saturated, at different
moments (`forward_head` delta 1.000 at t=43.4; `shoulder_line` delta 0.997 at
t=54.7), yet the old mean peaked at only 0.798 and `posture_drift_max_s` was just
0.7s. Baseline `tilt=1.324`, `fwdHead=0.7924`, `sessionSeconds=95.5`, 112
post-baseline ticks, `posture_drift_mean=0.330`. Its phone block showed 47 object
ticks and zero detections. Recorded in `12-TUNING.md`.

Procedurally this is worth keeping: **a stale dev server is a live failure mode
for every `NEXT_PUBLIC_*`-gated reading this phase has taken**, and the only
thing that caught it was a removed dump still printing. Future dumps should carry
a build marker.

## Phone: still undecided, with half the dataset now in hand

Session C (phone held) was not run in Task 2, and Task 4 item 4 was therefore not
run either. For the fourth plan running, `PHONE_SCORE_THRESHOLD` is not set.

The position is narrower than "no data", though. Two sessions held no phone at
any point, giving a clean **false-positive floor**: Session A (53 object ticks, 4
spurious "cell phone" detections, min 0.058 / median 0.081 / max 0.163, zero at
or above 0.5, `phone_visible_seconds = 0.0`) and the stale-server session (47
object ticks, zero detections). The model does emit spurious low-confidence
detections, and 0.5 refused every one with ~3x of margin.

**The true-positive side has never been observed, in any plan.** Without it there
is no way to know whether a genuinely-held phone scores 0.9 (0.5 is fine) or 0.3
(0.5 silently discards real phone time — a false negative in exactly the shape
posture drift just turned out to be). A one-sided reading can only justify
RAISING a cutoff, and raising it is not the direction any evidence points. So the
constant stays at 0.5, labelled undecided.

**The phone half of the dev dump was deliberately KEPT in place**
(`NEXT_PUBLIC_PHONE_CONFIDENCE_DEV_DUMP`), unlike the posture half, which was
removed in Task 3 once its readings were recorded. 12-10 removed this instrument
in its own Task 3 and then found at its own Task 4 item 4 that there was nothing
left to read; the retention exists to avoid repeating that. **Do not remove it
until a phone-held session's distribution is recorded in `12-TUNING.md`.**

## Decisions Made

Recorded in the frontmatter `key-decisions` field. The three that carry furthest:

1. **Repair, not retirement** — and the branch was chosen by a reading, with
   Branch X genuinely on the table under 12-08's fidgeting precedent.
2. **The worst axis, not the mean** — because the signals are orthogonal axes and
   no cutoff could have rescued a mean whose single-axis ceiling is 0.500.
3. **Both the phone threshold and the forward-head scale left alone**, each with
   the specific reading that would be needed to move it written down.

## Deviations from Plan

None requiring a deviation rule. Three plan expectations were corrected by the
readings rather than deviated from:

- **Session B was not run and is recorded as not-needed**, not outstanding.
  Session A answered its question (both channels moved) on its own.
- **Session C was not run**, so the phone threshold is carried forward again —
  recorded, as the plan's own must-haves permitted, as "still undecided with the
  reason".
- **12-10's expectation that a fully-in-frame reading would locate
  `POSTURE_COVERAGE_MIN_RATIO`** was mistaken about what such a reading can do; a
  fully-in-frame session lands above the decision band rather than inside it.

## Issues Encountered

- **The pure-slump argument's first written form had a wrong step** (treating
  0.500 as failing a `>=` comparator). Caught on orchestrator review and
  corrected in `c5d2d87`. The conclusion holds by the session-wide-dilution
  route; this SUMMARY carries the corrected version.
- **A stale dev server produced a false item-1 failure.** Caught from two tells
  (a removed dump still printing, its text describing pre-fix behaviour), and the
  session restarted before anything was concluded. Its readings were retained as
  corroborating data.

## Requirements

**REQ-51 — MET.** Every clause is now satisfied and observed:

| Clause | Status |
|---|---|
| Measured from body landmarks (shoulder-line tilt, forward-head, torso lean, openness) | All four computed; only genuinely in-frame ones scored, since 12-10 |
| The SCORE comes from drift against the student's OWN opening posture, never a fixed upright ideal | `POSTURE_BASELINE_WINDOW_S` baseline; `abs(current - baseline)` |
| The absolute reading is reported but NOT graded | Unscored Observations section (12-04 / 12-07); nothing scored reads it |
| A partially visible body is scored on the landmarks that ARE available rather than skipped | 12-10 Task 4 item 2 PASS, confirmed not regressed at 12-11 item 3 |
| Every posture comment states which signals were measured | "Measured from" row, rendered unconditionally (`bands.ts:524`) |

12-10 left REQ-51 open on **one** ground: the drift-scoring mechanism had never
been observed to respond correctly to the behaviour it grades. Task 4 resolves
exactly that, in both directions, on one build, with the episode path
independently agreeing. **The requirement is marked met, with its evidence base
labelled honestly as one slump session and one ordinary session.**

**REQ-52 — NOT MET, unchanged.** Fidgeting remains permanently not-measured by
the deliberate 12-08 decision (an aliasing limit at the hands model's ~1.5 Hz
sample rate, not a threshold problem). Nothing in this plan touches the hands
sample rate or the fidget path.

**REQ-53 — MET, undisturbed.** This plan made the posture row MORE sensitive, not
less honest. The renderer refusal, episode filter and frame-bounds gating were
not touched; the unconditional "Measured from" row and the scored/descriptive
section separation are unchanged; `posture_drift_mean` survives only as a
descriptive aggregate that nothing scored reads. Item 2's ordinary session
produced no episode rows, which is the honest outcome, and item 3 confirmed
"Measured from" still names only in-frame signals.

## Phase 12 ROADMAP success criteria — honest assessment

**Criterion 2** ("a camera-on session running four models is indistinguishable
from a camera-off run") — **MET**, at 12-08's sign-off: `meanTickMs` 35.6 against
a 166.7ms interval.

**Criterion 3** ("nothing the pipeline cannot observe is described as absent, and
nothing reported descriptively is scored") — **MET**, at 12-10 item 1 and
reconfirmed here.

**Criterion 1** ("arm movement, posture and a visible phone are measured and tied
to timecodes, not inferred from the transcript") — **PARTIALLY MET.**

- **Arm movement: qualifies.** Measured from hand landmarks, timecoded episodes,
  tuned at 12-08 with the coverage numerator defect fixed at 12-10.
- **Posture: qualifies as of this plan.** Measured, timecoded (`0:48-1:26`), and
  now demonstrated correct in both directions.
- **The phone: does NOT yet qualify.** It is measured and it is timecoded, so the
  criterion's literal wording is arguably satisfied — but
  `PHONE_SCORE_THRESHOLD` has never been validated against a true-positive
  session, and there is a concrete reason to doubt it: the user earlier observed
  a sustained in-frame phone reported as "about 2 seconds", which points at
  under-detection. The only evidence that exists is the no-phone floor, which can
  only ever justify raising the cutoff.

**I do not consider criterion 1 met.** This phase has now twice shipped a signal
that was "measured and timecoded" in the literal sense while being silently
unable to report the behaviour it named — posture drift's three false negatives,
and before them 12-09's hands coverage gate, which was entirely inert while
reporting "Gesturing: Well judged". A phone threshold whose only dataset is its
false-positive side, with a user observation already suggesting under-detection,
is the same shape of claim. Calling criterion 1 met would be asserting for the
phone precisely what Task 4 had to be run to establish for posture. It needs one
timed phone-held session.

## Next Phase Readiness

**Phase 12 is NOT closed by this plan**, and should not be marked complete.
Outstanding:

1. **`PHONE_SCORE_THRESHOLD` is unvalidated** — one timed phone-held session with
   `NEXT_PUBLIC_PHONE_CONFIDENCE_DEV_DUMP=1` would settle it, and it blocks
   criterion 1. The dump is in place and must not be removed first.
2. **12-03's ROADMAP checkbox is almost certainly stale — FLAGGED, NOT FLIPPED.**
   The ROADMAP lists `12-03-PLAN.md` as `[ ]`, but `12-03-SUMMARY.md` exists on
   disk and `STATE.md` records "12-03 (worker migration + frame budget):
   **complete**. Commits `962c647`, `3f5e6c1`, `c83f6d6`". The migration very
   likely shipped and the box was never ticked. This executor did not tick it:
   changing a phase's executed-plan count on inference rather than instruction is
   the kind of unearned claim this phase has already been burned by. It needs a
   human confirmation and would move the count 9/11 -> 10/11.
3. **The posture evidence base is two sessions**, one per direction. Re-tuning
   against real student sessions is expected work and is carried in
   `deferred-items.md`.
4. **Open readings, none blocking:** an unclamped `forward_head` delta series (to
   give the channel dynamic range above the cutoff), a 43-75%-in-frame session
   (the only thing that can narrow `POSTURE_COVERAGE_MIN_RATIO`), a positive
   hands-visible reading (to bound `HANDS_COVERAGE_MIN_RATIO` from above), and
   a lower bound for `POSTURE_DRIFT_SUSTAINED_S`, which is bounded from above
   only.

Phase verification is the orchestrator's to run.

---
*Phase: 12-embodied-visual-signals*
*Completed: 2026-10-03*

## Self-Check: PASSED

- All referenced commits verified present in `git log --all`: `a854519`,
  `df02eee`, `39eceba`, `dbf5c5d`, `c5d2d87`, and 12-03's `962c647`, `3f5e6c1`,
  `c83f6d6`.
- All referenced planning files verified present on disk.
- **No production code was changed in this continuation.** `git status` shows only
  planning-document modifications. The source files listed in `key-files` were
  modified by Tasks 1 and 3, already committed.
