---
phase: 12-embodied-visual-signals
plan: 10
subsystem: landmark-observability
tags: [frame-bounds-gating, measure-first, coverage-ratio, sign-off, posture-drift-finding]

requires:
  - phase: 12-embodied-visual-signals
    plan: 09
    provides: "the renderer refusal, episode filter and coverage-ratio scaffolding this plan made effective, plus the failed item-1 re-run it set out to close"
provides:
  - "isVisible means observed-in-frame, not model-confident — extracted to lib/metrics/landmark-visibility.ts so it is directly assertable from Node"
  - "POSTURE_COVERAGE_MIN_RATIO 0.60, set from two real dumped sessions rather than reasoned"
  - "Out-of-frame wrists dropped in detectHands, so handCount means a hand was seen"
  - "A corrected hands coverage numerator (handsDetectedSamples) that makes 12-09's inert hands gate functional for the first time"
  - "24 replay assertions built from real Session A/B counts, both directions"
  - "Sign-off item 1 PASSING after defeating two previous attempts"
  - "A recorded, measurement-backed finding that posture drift does not fire on a genuine hard slump"

affects:
  - "lib/metrics/bands.ts posture-drift row (unchanged here, but its input is now honest)"
  - "12-11 (follow-up): posture-drift trip aggregation + phone confidence threshold"

tech-stack:
  added: []
  patterns:
    - "Measure-first sequencing: a dev dump task gated behind a blocking human checkpoint, whose readings are the sole input to the next task's constants"
    - "Predicate extraction for testability — a worker that installs self.onmessage cannot be imported from Node, so the predicate under test lives in its own module"

key-files:
  created:
    - lib/metrics/landmark-visibility.ts
  modified:
    - lib/metrics/visual-capture.worker.ts
    - lib/metrics/visual-capture.ts
    - lib/metrics/body-thresholds.ts
    - scripts/verify-visual-metrics.ts
    - .planning/phases/12-embodied-visual-signals/12-TUNING.md

decisions:
  - "isVisible requires in-frame normalized coordinates AND the visibility floor — MediaPipe's visibility is a prediction, not an observation"
  - "POSTURE_COVERAGE_MIN_RATIO moved 0.25 -> 0.60 from the Session A/B in-frame shares; explicitly recorded as not well-characterised (any cutoff 0.44-0.75 produces identical verdicts on the only two readings that exist)"
  - "HANDS_COVERAGE_MIN_RATIO re-examined against the corrected numerator and deliberately RETAINED at 0.25 — hands legitimately leave frame in normal sessions and no genuine hands-visible positive reading exists to bound it from above"
  - "Task 4 item 4 (phone confidence) deferred to the follow-up plan rather than re-adding the removed dump mid-plan"
  - "POSTURE_DRIFT_TRIP, the POSTURE_*_DRIFT_SCALE* constants and computePostureDrift's aggregation were NOT touched — the item-3 finding has no measurements behind it yet"

requirements-completed: [REQ-53]

status: DELIVERED — objective met, with one recorded finding handed forward
duration: 3 sessions across 2 days, two blocking human checkpoints
completed: 2026-10-03
---

# Phase 12 Plan 10: Frame-Bounds Landmark Gating Summary

MediaPipe's predicted `visibility` score is no longer treated as an observation:
a landmark whose coordinates fall outside the frame does not count as seen, and
the off-camera session that defeated 12-08 and 12-09 now correctly reports the
body as unreadable.

## Status: DELIVERED

The plan's objective was narrow and specific — stop the pipeline treating
predicted `visibility` as an observation. **Sign-off item 1 passed on its third
attempt**, which is the direct proof of that objective. Item 2 passed, holding
the REQ-51 side. Item 3 produced a genuine, well-framed FINDING that is a
*different* defect in a different layer, and item 4 could not be run.

This plan is complete. **Phase 12 is not** — the item-3 finding and the never-run
phone-confidence reading are carried to a follow-up plan (12-11).

## What shipped

**Task 1 (`307c96d`) — the dump nobody had ever run.**

A dev-only diagnostic behind `NEXT_PUBLIC_VISUAL_LANDMARK_DEV_DUMP`, off by
default, recording per pose tick the raw normalized `x`/`y`, the raw
`visibility` score, whether the coordinates fall inside the frame, and the
current `isVisible` verdict — for each of the four `VISUAL_POSTURE_SIGNALS`
groups and for the hands landmarks. Aggregated per session into the split that
was the whole point: how often `isVisible` said yes while the landmark was out
of frame.

Observation only. `isVisible`, `computePostureSignalsMeasured` and
`computeHandsUsable` were byte-unchanged, confirmed by byte-identical
`verify-visual-metrics.ts` output (137 ok checks) with the env var unset.

**Task 2 — the user's two sessions.** Readings transcribed in full in
`12-TUNING.md`. Not reproduced here.

**Task 3 (`69ed830`) — gating set from those readings.**

- `isVisible` now requires in-frame coordinates **and** the visibility floor.
  Extracted to a new `lib/metrics/landmark-visibility.ts` so the verify script
  can assert the predicate directly — the worker installs `self.onmessage` and
  cannot be imported from Node, which is why 12-09's equivalent check failed on
  missing exports and proved only that the test was new.
- Its doc comment rewritten to say what the flag means. The old comment
  ("a missing/undefined `visibility` is treated as not visible, never as
  visible-by-default") read as a guarantee of honesty it did not provide, and
  had already misled one reader.
- `POSTURE_COVERAGE_MIN_RATIO` 0.25 -> **0.60**, from the Session A/B in-frame
  shares over total pose ticks. Documented in `body-thresholds.ts` as **not
  well-characterised** rather than as tuned: the separating gap is one reading
  on each side (43.4% vs 75.4%), any cutoff from ~0.44 to ~0.75 produces
  identical verdicts on both, and there is no fully-in-frame session at all, so
  the band has no upper bound.
- Hands get the same treatment — `detectHands` drops out-of-frame wrists, so
  `handCount` means a hand was actually seen (Session A had 41 of 80 detections
  extrapolated).
- `HANDS_COVERAGE_MIN_RATIO` **re-examined and deliberately retained at 0.25**,
  per the plan's instruction not to silently keep it. Against the corrected
  numerator the readings give Session A 16.7% and Session B 0.4%; 0.25 refuses
  both, which is right for both. It was *not* raised to match posture's 0.60
  because hands differ from posture in kind — hands legitimately leave frame all
  session (lap, below the laptop edge) while shoulders do not, so the in-frame
  share a genuinely gesturing student produces is unknown and plausibly well
  under 60%. Raising it blind, with no positive reading to check against, would
  risk silencing gesturing for most real sessions. The value is bounded from
  below only, by 8 points. The restraint is the substance of the decision.
- 24 replay assertions from the real counts: Session A measures nothing, Session
  B still measures `forward_head` only. Every 12-09 section-10b assertion still
  passes.
- Both dev dumps removed, readings recorded in `12-TUNING.md` first.

## Two defects found in the readings that were not in the plan

Neither was anticipated by `12-10-PLAN.md`. Both were found by reading the Task 2
numbers, not by reading the code.

**1. 12-09's hands coverage gate was completely inert.** `computeHandsUsable`
was being fed `handSamples` — the count of ticks the hands model **ran**,
incremented unconditionally at the top of `applyHandsResult` whether or not a
hand was detected. On any healthy session that is ~100% of
`expectedHandsSamples` by construction, so the gate passed whatever the camera
saw. Session A proves it: 234 hands ticks against ~234 expected = 100%, gate
wide open, while only 39 ticks held a hand genuinely in frame.

This is why the off-camera session kept reporting "Gesturing: Well judged" and
"Hands near face: Frequent" *after* 12-09 claimed to have closed exactly that
path. 12-09's hands fix never did anything. The numerator is now
`handsDetectedSamples`, counted after out-of-frame wrists are dropped; this is
the first version of that fix that can do anything at all.

**2. `LANDMARK_VISIBILITY_FLOOR` is near-inert, now documented.** Session A
called `forward_head` visible on 140 of 143 ticks (98%) with the face detected
0% of the session; Session B called `shoulder_line` visible on 278 of 281 (99%)
with the shoulders at the frame's edge. The per-tick visible flags are
indistinguishable between a 0%-face session and a genuine one. The floor is not
removed — it still rejects the undefined/missing case — but it should not be
read as doing any discriminating work, and that is now on the record.

## The plan's own hypothesis was falsified in its simple form

`12-10-PLAN.md` diagnosed the cause correctly but proposed an insufficient fix.
Adding an in-frame test to `isVisible` **alone** would not have closed item 1:
Session A's `forward_head` is still in frame on 62 of 143 ticks = **43.4%**,
which clears 12-09's 0.25 ratio. "Head position" would have been reported as
measured a third time and item 1 would have failed a third time.

Both halves — the per-tick predicate and the ratio move to 0.60 — are
load-bearing, and each was confirmed to fail the replay assertions when reverted
alone.

The plan's `<sequencing_rule>` is what caught this. Had Task 3 been written
first and Task 1's dump skipped, the plan would have shipped a confident,
well-reasoned, wrong fix for the third time in a row. The readings also exposed
a trap in the dump's own output: `visibleAndInFrameRatio` divides by VISIBLE
ticks, which **inverts** between the two sessions (Session A `shoulder_line`
0.221 vs Session B's 0.058 — the genuine body scoring lower). The separating
quantity is in-frame count over TOTAL pose ticks.

## Task 4 — sign-off results

Run by the user on 2026-10-03. Recorded exactly as reported.

| Item | Subject | Result |
| ---- | ------- | ------ |
| 1 | Off camera, one arm in shot — the blocker | **PASS** |
| 2 | Partial visibility still scores | **PASS** |
| 3 | Posture-drift true positive | **FAIL — recorded as a FINDING** |
| 4 | Phone confidence | **NOT RUN — deferred** |

**Item 1 — PASS, first time in three attempts.** 12-08 produced a false "Held
steady"; 12-09 produced a false "Shifted from the opening posture" with
timecodes; 12-10 correctly reports the body as unreadable. This is the item that
has gated the phase since 12-08 and the direct evidence for this plan's
objective.

**Item 2 — PASS.** The user's words: "task 2 is fine". A partially visible body
is still scored on what was genuinely in frame, so the 0.60 ratio did not
overcorrect into a second absolute floor.

**Item 3 — FAIL, recorded as a finding.** The user ran a fully-in-frame session
and, in their words, "slumped a lot". The report still said **"Posture drift:
Held steady from the opening posture"**, measured from "Shoulder line and Head
position". Their own observation: "because of the camera framing, it struggles to
track this."

That session's report:

- ON CAMERA — Eye contact Solid, Attention Attentive, Framing **Well centred**,
  On camera **Present throughout**, Lighting Clear, Steadiness Steady, Others in
  frame Just you.
- Narrative — "Camera centering was strong (83% of the time) and your face was
  always in frame, but eye contact was lower than optimal at 54%, with major
  stretches (e.g., 1:10-1:57) spent looking away while responding."
- BODY LANGUAGE — Posture drift "Held steady from the opening posture", Measured
  from "Shoulder line and Head position".

**This is a genuine, well-framed session, and the new gating behaved correctly
in it.** Both signals cleared the 0.60 coverage ratio and were honestly reported
as measured. Frame-bounds gating is *not* what suppressed the reading. The
defect is downstream, in how the drift magnitude is computed from signals that
were correctly observed — a different layer from the one this plan fixed, and a
false NEGATIVE where items 1-3 of the previous attempts were false positives.

No drift magnitude, baseline value or per-tick series was captured for this
session. **No numbers for item 3 exist anywhere in this record**, and none are
invented below.

**Item 4 — NOT RUN.** Task 3 step 6 required removing 12-09's phone-confidence
dump, which it did; the dump's readings were never captured at any point before
removal. Item 4 therefore could not be run as written. Deferred to the follow-up
plan rather than re-adding the dump mid-plan, because items 3 and 4 are both
"needs a raw dump before anything can be decided" problems and belong in one
measure-first plan together. `PHONE_SCORE_THRESHOLD` remains undecided with no
dataset behind it.

## The item-3 hypothesis — UNVERIFIED

**This is a hypothesis from reading the code. It is not a measured conclusion.
No per-tick drift series has ever been captured, for this session or any other.**
It is recorded so the follow-up plan has somewhere to start, and it must be
confirmed by measurement before anything is changed.

`computePostureDrift` (`lib/metrics/visual-capture.ts:556-582`) returns
`driftMagnitude` as the arithmetic **MEAN** of the per-signal normalized deltas:

```ts
values.reduce((sum, v) => sum + v, 0) / values.length
```

Each delta is `clamp(abs(current - baseline) / scale, 0, 1)` with
`POSTURE_SHOULDER_TILT_DRIFT_SCALE_DEG = 15` and
`POSTURE_FORWARD_HEAD_DRIFT_SCALE = 0.3`, against `POSTURE_DRIFT_TRIP = 0.5`.

A slump is forward-head-dominant. `shoulderTiltDeg`
(`visual-capture.worker.ts:597`) is
`atan2(abs(dy), abs(dx))` across the two shoulders — the acute angle of the
shoulder line to horizontal, i.e. a **left-right tilt**, 0 for level shoulders.
A vertical slump keeps the shoulders level and barely moves it; 12-08 measured
4.9 and 6.3 degrees for upright seated users. The item-3 session measured exactly
`shoulder_line` and `forward_head`. So a large forward-head delta is averaged
against a near-zero shoulder-tilt delta, roughly halving the magnitude before the
0.5 trip is consulted. To trip on a pure slump, forward-head alone would have to
reach ~1.0 — a 0.3 change in normalized offset, which is very large.

If that holds, this is a **design issue in the aggregation** — a mean dilutes a
genuine single-signal change — **not merely a mis-set threshold**, and lowering
`POSTURE_DRIFT_TRIP` would treat the symptom while making every other signal
twitchier.

**Two additions from verifying the code directly, both of which make the
hypothesis stronger than stated:**

1. **The dilution is double, not single.** The scored row does not see a per-tick
   magnitude at all. `posture_drift_mean` (`visual-capture.ts:2648`) is the
   **session-wide mean** of every post-baseline tick's already-averaged drift,
   and `bandPostureDrift` (`bands.ts:409`) compares *that* against the same 0.5
   trip. So the quantity must exceed 0.5 after averaging across signals **and**
   across the whole session. A slump that develops partway through is further
   diluted by the upright early portion — and the user's session began upright by
   design. Notably `posture_drift_max_s`, the sustained-streak metric, is
   computed (`visual-capture.ts:1711`) but the band does **not** use it; the
   episode path uses a per-window mean (`visual-capture.ts:947`).
2. **The forward-head channel may not be able to see a slump at all.**
   `forwardHeadOffset` is `hypot(nose.x - shoulderMidX, nose.y - shoulderMidY) /
   shoulderWidth` — a 2D **distance** from the shoulder midpoint, not an anterior
   displacement. True forward-head translation is along the camera axis and is
   largely invisible to a frontal webcam. What the metric actually registers in a
   slump is the head dropping toward the shoulder line (which *reduces* the
   distance) plus some foreshortening. "Forward head" is a misnomer for what is
   measured, and the magnitude available to it is bounded by the upright offset
   itself. This is consistent with the user's own read — "because of the camera
   framing, it struggles to track this" — and it means the follow-up plan should
   test whether the signal is *measurable* from this camera geometry before
   assuming it is merely mis-aggregated.

Per this plan's integrity constraint, `POSTURE_DRIFT_TRIP`, the
`POSTURE_*_DRIFT_SCALE*` constants and `computePostureDrift`'s aggregation were
**not changed**. Fixing this from a code-reading hypothesis with zero
measurements is exactly the guess-first pattern that has defeated this phase
three times.

## Requirements

**REQ-53 — MET.**

Two clauses have been tracked under REQ-53 in this phase. Its literal text
(descriptive-only signals in their own report section, so an unscored observation
cannot be read as a deduction; scored body signals under their own subheading)
was delivered at 12-04 and has not regressed. The clause that kept it open
through 12-08 and 12-09 is the honesty half carried by ROADMAP criterion 3 —
"nothing the pipeline cannot observe is described as absent" — which is what
sign-off items 1 and 7 tested, and what failed twice.

**Item 1 now passes, and that was REQ-53's sole outstanding blocker.** An
off-camera session with one arm in shot reports the body as unreadable, gives no
posture verdict in either previous wording, produces no body-language Moments
rows for signals that were not observed, and no longer credits gesturing on an
arm the pipeline could not properly see. ROADMAP criterion 3 holds against the
exact real session that defeated two attempts.

**Item 3 does not bear on REQ-53**, and the distinction matters. In the item-3
session the body **was** observable — both signals cleared the coverage gate and
were honestly declared measured. "Held steady" there is a sensitivity failure on
an observed signal, not an unobservable signal being described as absent. REQ-53
is about the second thing. Marking it met is reversible if a later session shows
otherwise.

**REQ-51 — NOT MET. Do not mark it complete.**

Its partial-visibility and transparency clauses are now satisfied: item 2 passed,
a half-visible body is scored on the landmarks genuinely available rather than
skipped, and "Measured from" names exactly those signals. 12-TUNING.md's reading
4 shows the pre-fix pipeline was over-claiming that row (Session B printed
"Shoulder line and Head position" with the shoulders out of frame on 94% of the
ticks the model called visible); that is fixed.

But REQ-51 also requires that **the score comes from drift against the student's
own opening posture**. The drift mechanism exists and is baseline-relative — its
fairness property is assertion-guarded — yet item 3 shows it does not fire on a
genuine hard slump, and it has now never produced a true positive:

- Its only observed trip was 12-09's **false positive** on an extrapolated
  skeleton.
- It has now produced a **false negative** on a real, well-framed slump.

A score that has never been observed to respond correctly to the behaviour it
grades does not satisfy "posture is measured... the score comes from drift". That
is the honest reading, so REQ-51 stays open and is carried by the follow-up plan.

REQ-52 remains NOT MET by deliberate decision (fidgeting retired as unmeasurable
at the hands model's ~1.5 Hz sample rate — unchanged by this plan).

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 1 - Bug] 12-09's hands coverage gate was inert**

- **Found during:** Task 3, from the Task 2 readings
- **Issue:** `computeHandsUsable` was fed `handSamples` (ticks the model ran,
  ~100% of expected on any live session) rather than detections, so the gate
  passed whatever the camera saw
- **Fix:** numerator changed to `handsDetectedSamples`, counted after `detectHands`
  drops out-of-frame wrists
- **Files modified:** `lib/metrics/visual-capture.ts`,
  `lib/metrics/visual-capture.worker.ts`, `lib/metrics/body-thresholds.ts`
- **Commit:** `69ed830`

**2. [Rule 1 - Bug] The ratio move to 0.60 was not in the plan's fix**

- **Found during:** Task 2 readings analysis
- **Issue:** the plan's stated fix (in-frame test on `isVisible`) was
  insufficient — Session A's `forward_head` clears 0.25 at 43.4%
- **Fix:** `POSTURE_COVERAGE_MIN_RATIO` 0.25 -> 0.60, both halves confirmed
  load-bearing by reverting each alone
- **Commit:** `69ed830`

### Scope deviations

**Task 4 item 4 deferred.** The plan scheduled it against a dump its own Task 3
step 6 required removing. Resolved by deferring the item rather than re-adding
the dump; recorded in `12-TUNING.md`.

**No production code was changed by this closing continuation.** Items 3 and 4
are handed forward as recorded findings.

## Checkpoints

Two blocking human checkpoints, both run by the user, both honoured as written.

Worth stating explicitly given this phase's history: an executor agent
**fabricated** the 12-05 checkpoint approval (reverted in `7331907`, recorded in
`12-08-SUMMARY.md`). Both of this plan's checkpoints stopped for real, returned
structured state, and were resumed only from the user's own pasted readings and
pass/fail list. Everything in the Task 4 section above is the user's report.

## Follow-up work (12-11)

1. **Posture-drift true positive.** Capture a raw per-tick drift series on a
   deliberate-slump session — per-signal deltas, the baseline, the session mean,
   and the streak — before changing anything. Then decide between the
   aggregation, the forward-head geometry, and the trip. `POSTURE_DRIFT_TRIP`
   must not be lowered to make a symptom go away.
2. **Phone confidence.** Re-add the removed dump and take the ~30s reading that
   decides `PHONE_SCORE_THRESHOLD`.
3. **A fully-in-frame session dump.** The single missing reading that would bound
   `POSTURE_COVERAGE_MIN_RATIO` from above and set `HANDS_COVERAGE_MIN_RATIO`
   from a positive rather than from reasoning. Same session as item 1's capture.

## Self-Check: PASSED

Verified at close, 2026-10-03.

- **Files claimed, all present:** `lib/metrics/landmark-visibility.ts` (created),
  `lib/metrics/visual-capture.ts`, `lib/metrics/visual-capture.worker.ts`,
  `lib/metrics/body-thresholds.ts`, `scripts/verify-visual-metrics.ts`.
- **Commits claimed, all present:** `307c96d`, `69ed830`, docs `9595ba2`,
  `9994209`. Prior-art references `91c85b3`, `a9a507f` (12-09) and `7331907`
  (the reverted fabrication) also verified to exist.
- **Every code line cited in the item-3 hypothesis was re-read and confirmed**
  rather than quoted from the plan: `visual-capture.ts:579` is the mean
  `reduce`, `:947` the episode trip on `w.driftMean`, `:1711` the streak test,
  `:2648` the session-wide `posture_drift_mean`; `bands.ts:409` is the
  "Held steady"/"Shifted" branch on `POSTURE_DRIFT_TRIP`; and
  `visual-capture.worker.ts:597` is the `atan2(abs(dy), abs(dx))` acute-angle
  shoulder tilt.
- **No production code was changed by this closing continuation** —
  `git status` showed only `.planning/` files modified.
- **Nothing was invented for item 3.** No drift magnitude, baseline or per-tick
  reading appears anywhere in this summary, because none was captured.
