# Phase 12 Plan 08 — Threshold Tuning Record

Provenance for every tuned constant in `lib/metrics/body-thresholds.ts`:
what session produced which reading, and which cutoff decision it drove.
This file is the record a student challenging a grade can be pointed to —
it must exist outside code comments (12-08-PLAN.md's Task 2 requirement).

**Status: Task 2 has NOT started.** No four-session labelled dataset
(normal / very still / big-gesture / mixed, each ~3-4 minutes) has been
recorded yet. The entries below are two things ONLY:

1. A measurement-capability finding (fidgeting) that is now CLOSED —
   recorded here because it was discovered and resolved during Task 1's
   checkpoint sessions, not because tuning happened.
2. An early flag for Task 2, from the SAME ad-hoc sessions, about where
   `GESTURE_RATE_EXCESSIVE_MIN` likely needs to move. This is NOT a tuning
   decision — it is a note to watch for when real tuning happens.

No threshold in `body-thresholds.ts` has been changed FROM its PROVISIONAL
value based on behavioural calibration. Do not read anything below as
Task 2 having been performed.

## Sessions recorded so far (ad hoc, not the labelled four-session set)

| # | Duration | Behaviour | Status |
|---|----------|-----------|--------|
| 1 | ~140.1s | Mixed (slump, face touch, fidget attempt, phone) — pre-Defect-E-fix | Used for root-cause diagnosis only, not tuning |
| 2 | 274.7s | Mixed (real hand-near-face + gesture activity, confirmed by user) | Used for Defect D/E/H diagnosis, not tuning |
| 3 | 73.5s | Unlabelled ad hoc session | Confirmed Defect E's fix (real driftMean); too short for Task 2's 3-4 minute minimum |

None of these are the labelled normal/still/big-gesture/mixed set Task 2
requires, and #3 is well under the plan's own 3-4 minute floor. **Do not
tune from them.**

## CLOSED: Fidgeting — measurement-capability limit, not tuned

See `.planning/phases/12-embodied-visual-signals/deferred-items.md`'s
"12-08: Fidgeting retired to permanently not-measured" entry for the full
writeup (root cause, real readings, what a real fix would require). Summary
for this record specifically:

- **Readings:** `directionChangeRatePerS` measured 0.35/s (session #2,
  274.7s) and 0.15/s (session #3, 73.5s), against a gate
  (`FIDGET_MIN_DIRECTION_CHANGES_PER_S`) already lowered once from 1.5 to
  0.5/s for schedule-rate achievability.
- **Why no amount of lowering fixes it:** the hands model's achievable
  ~1.5 Hz tick rate cannot resolve a reversal frequency fast enough to mean
  "fidgeting" (small, FAST motion by definition) at all — the sampler
  aliases the behaviour rather than measuring it.
- **Decision:** retired to permanently not-measured (user decision). No
  cutoff was tuned; `FIDGET_MAX_AMPLITUDE`, `FIDGET_MIN_DIRECTION_CHANGES_PER_S`,
  and `FIDGET_EPISODE_TRIP_PCT` were all removed from `body-thresholds.ts`
  rather than retuned.
- **REQ-52 impact:** cannot be met with this pipeline's current hands
  sample rate. Marked NOT MET in `REQUIREMENTS.md`, not left checked.

## FLAG FOR TASK 2: `GESTURE_RATE_EXCESSIVE_MIN` may be set too low

Not a tuning decision — a note for whoever runs Task 2 against the real
labelled dataset.

- Session #2 (274.7s, mixed): `gestureRatePerMin` measured ~9.
- A later session: `gestureRatePerMin` measured ~12, and the session's
  `excessive_gesturing` episode TRIPPED on the Moments timeline at that
  rate.
- `GESTURE_RATE_EXCESSIVE_MIN` is currently 25 (PROVISIONAL).

12 is well below 25, yet the episode fired — meaning the per-WINDOW episode
trip condition (`windowTrips`'s own ratio-based logic inside a 5s window)
can register "excessive" at a markedly lower effective rate than the
SESSION-WIDE `gesture_rate_per_min` threshold would suggest, on real data.
This is exactly the plan's own calibration-direction warning: "prefer the
conservative edge for GESTURE_RATE_EXCESSIVE_MIN — a false 'excessive' is a
student told off for something the sensor misread." When Task 2 runs the
real four-session set:

1. Confirm the NORMAL session lands mid-band on gesturing (neither still
   nor excessive) before setting this cutoff at all.
2. Treat the big-gesture session's measured rate as the signal for where
   "excessive" should sit, not the normal/mixed sessions' rates.
3. Specifically re-check the window-level `excessive_gesturing` episode
   trip condition against whatever session-wide cutoff gets chosen — two
   real ad hoc sessions above suggest the window-level trip is firing
   easier than the session-wide number implies, and if that holds on the
   real dataset too, the window-level ratio (not just
   `GESTURE_RATE_EXCESSIVE_MIN` itself) may need its own adjustment.

## Everything else in `body-thresholds.ts`

Still PROVISIONAL. Awaiting the real four-session labelled dataset.
