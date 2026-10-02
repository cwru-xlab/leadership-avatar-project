/**
 * EVERY numeric cutoff Phase 12 (Embodied Visual Signals) introduces lives in
 * this one file.
 *
 * ALL VALUES BELOW ARE PROVISIONAL. They were NOT derived from recorded
 * sessions — 12-CONTEXT.md is explicit that picking these up front would be
 * the wrong move, since the right cutoffs depend on how real students
 * actually move. Plan 12-08 retunes every constant here against real
 * recordings before this phase is considered calibrated. No other file in
 * this phase may define a body-signal threshold inline — if a new numeric
 * cutoff is needed, it is added here, named, and given a one-line rationale,
 * so the whole provisional set stays auditable from one place.
 *
 * SCHEDULE RATE AUDIT (12-08 Task 1 checkpoint, Defect D). `visual-capture.ts`'s
 * `SCHEDULE = ["face", "pose", "face", "hands"]` means NO model actually
 * samples at the full `METRICS_SAMPLE_HZ` (6 Hz) except face (2/4 share, 3 Hz
 * effective) — pose and hands each get 1/4 (1.5 Hz effective, confirmed
 * against two real recordings: `handSamples`/`sessionSeconds` landed at 1.49
 * and 1.50 Hz). Object detection runs on its own independent
 * `OBJECT_TICK_INTERVAL_MS` timer, achieved ~0.5 Hz. ANY constant below
 * expressed in per-second, per-sample, or sample-count terms is only
 * meaningful if checked against the REAL achieved rate of the model that
 * feeds it, not the nominal 6 Hz — two separate constants already reached
 * production assuming the wrong rate (`POSTURE_BASELINE_MIN_SAMPLES`, fixed
 * in this plan; `FIDGET_MIN_DIRECTION_CHANGES_PER_S`, fixed in this plan).
 * Audited here so the next `SCHEDULE` change surfaces every one of these
 * instead of silently killing another signal:
 *   - `POSTURE_BASELINE_MIN_SAMPLES` (pose, 1.5 Hz) — see its own comment.
 *   - `FIDGET_MIN_DIRECTION_CHANGES_PER_S` (hands, 1.5 Hz) — see its own
 *     comment.
 *   - `GESTURE_RATE_STILL_MAX`/`GESTURE_RATE_EXCESSIVE_MIN` — per SESSION
 *     MINUTE from `gestureEventCount`, not per hands-tick, so the ceiling is
 *     the hands rate times 60: ~90/min if literally every hands tick tripped
 *     a gesture. `GESTURE_RATE_EXCESSIVE_MIN` (25) sits well inside that
 *     ceiling — achievable.
 *   - `HANDS_NEAR_FACE_TRIP_PCT`, `FIDGET_EPISODE_TRIP_PCT`,
 *     `PHONE_EPISODE_TRIP_PCT` — all RATIOS of same-model counts (e.g.
 *     `handsNearFaceSamples / handsNearFaceEligibleSamples`), not raw
 *     per-second rates, so they are immune to the underlying tick rate by
 *     construction — a session can reach 0-100% on any of these regardless
 *     of how many ticks that rate produces.
 *   - `GESTURE_WINDOW_MIN_HAND_SAMPLES` (3) — compared against
 *     `handsDetected` inside a 5s episode window (`EPISODE_WINDOW_SECONDS`).
 *     At hands' 1.5 Hz, a 5s window's ceiling is ~7.5 ticks — 3 is
 *     comfortably below it — achievable.
 *   - `PHONE_MIN_VISIBLE_S` (2) — compared against cumulative VISIBLE
 *     seconds (already rate-converted via the object runner's own
 *     achieved Hz in `computeObservations`, not a raw sample count), so it
 *     is rate-independent by construction.
 *   - `POSTURE_DRIFT_SUSTAINED_S` (15) — compared against wall-clock
 *     elapsed seconds (`tS`), not a sample count, so it is rate-independent;
 *     at pose's 1.5 Hz a 15s streak still gets ~22 ticks to confirm it.
 *   - `LANDMARK_VISIBILITY_FLOOR`, `GESTURE_AMPLITUDE_MIN`,
 *     `FIDGET_MAX_AMPLITUDE`, `HANDS_NEAR_FACE_RADIUS`, `PHONE_SCORE_THRESHOLD`,
 *     all four `POSTURE_*_DRIFT_SCALE*` constants — per-SAMPLE magnitude/
 *     distance/confidence thresholds, not rates at all; unaffected by tick
 *     rate by construction.
 */

/** Minimum MediaPipe per-landmark `visibility` score (0-1) before a landmark
 * is trusted at all. Below this floor, a landmark group is treated as "not
 * in frame" rather than measured — the mechanism behind "partial bodies
 * score what is visible" (12-CONTEXT.md). */
export const LANDMARK_VISIBILITY_FLOOR = 0.5;

/** Length of the posture self-calibration window, in seconds, at the start
 * of a session. The scored posture signal is drift AWAY from whatever
 * baseline this window captures — never a fixed ideal. 20s is a guess at
 * "long enough to average out one fidget, short enough that the interview
 * proper hasn't really started." */
export const POSTURE_BASELINE_WINDOW_S = 20;

/** Minimum number of PROCESSED POSE samples inside the calibration window
 * before a baseline is considered trustworthy enough to score drift
 * against.
 *
 * BUG FIX (12-08 Task 1 checkpoint, Defect A root cause): this was 60, a
 * figure that only makes sense if pose ticks at the full `METRICS_SAMPLE_HZ`
 * (6 Hz) — "60 samples is 10 real seconds of the 20s window." It does not:
 * pose is one of four tenants on `SCHEDULE` in `visual-capture.ts`
 * (`["face", "pose", "face", "hands"]`), so pose receives only 1/4 of ticks,
 * ~1.5 Hz effective. Over the 20s window that is AT MOST ~30 pose ticks
 * total — 60 was structurally unreachable, so the posture baseline could
 * never establish and `posture_drift_mean`/`posture_drift_max_s` could
 * never be emitted for ANY session, regardless of behaviour. Confirmed
 * against a real still-session recording: `handSamples` (hands shares the
 * same 1/4 schedule slot) was 209 over a 140.1s session, 1.49/s, matching
 * the 1.5 Hz derivation; that session's `postureDriftSamples` was 0 and
 * `posture_signals_measured` still listed two signals (session-wide
 * visibility, a separate count from this one), consistent with the
 * baseline-can-never-establish diagnosis, not a behavioural absence.
 *
 * 15 is half of the ~30-tick ceiling pose can realistically reach in the
 * 20s window at its real 1/4 schedule share — "at least half the window's
 * worth of pose's own achievable tick rate landed," the schedule-aware
 * equivalent of the original comment's intent. This is a STRUCTURAL
 * (achievability) fix, not a behavioural cutoff Task 2 tunes from
 * recordings — it must be re-derived again if `SCHEDULE` or
 * `METRICS_SAMPLE_HZ` ever change pose's share, the same discipline
 * `FACE_SCHEDULE_SHARE` already documents for `expectedSamples`. */
export const POSTURE_BASELINE_MIN_SAMPLES = 15;

/** Magnitude of drift (normalized units, same scale as the baseline angle
 * comparison) that counts as "tripped" for a `posture_drift` episode window.
 * Deliberately a guess pending real-session tuning — see file header. */
export const POSTURE_DRIFT_TRIP = 0.35;

/** Minimum sustained duration, in seconds, a drift run must hold before it
 * is reported as an episode rather than a momentary shift (e.g. reaching for
 * water). Mirrors the existing episode system's "a run, not a single bad
 * sample" discipline. */
export const POSTURE_DRIFT_SUSTAINED_S = 15;

/** Gesture rate (per minute) at or below which a session reads as "too
 * still" — the low end of REQ-50's three-band curve. Stillness is a real,
 * reportable finding (12-CONTEXT.md), not merely the absence of the
 * excessive-end flag. */
export const GESTURE_RATE_STILL_MAX = 2;

/** Gesture rate (per minute) at or above which a session reads as
 * "excessive" — the high end of the same curve. */
export const GESTURE_RATE_EXCESSIVE_MIN = 25;

/** Minimum normalized wrist displacement, within one sample window, that
 * counts as a gesture at all (vs. incidental micro-movement). Below this
 * amplitude, motion is not counted toward `gesture_rate_per_min`. */
export const GESTURE_AMPLITUDE_MIN = 0.08;

/** Normalized-image-space radius around the face centre within which a hand
 * landmark counts as "near the face" for the hands-near-face signal. */
export const HANDS_NEAR_FACE_RADIUS = 0.15;

/** Percentage of processed samples with a hand inside `HANDS_NEAR_FACE_RADIUS`
 * above which the hands-near-face episode/score trips. Hands-near-face is
 * its own distinct scored signal, never folded into the gesture-rate curve
 * above (REQ-50). */
export const HANDS_NEAR_FACE_TRIP_PCT = 15;

/** Upper bound on per-sample wrist-displacement amplitude for motion to
 * still count as fidgeting rather than a purposeful gesture. Fidgeting is
 * defined as a DISTINCT low-amplitude, high-frequency band — never
 * "gesticulation above an extra threshold" — specifically so this counter
 * and `gesture_rate_per_min`/`GESTURE_AMPLITUDE_MIN` above cannot correlate
 * 1:1 by construction (see 12-RESEARCH.md Pitfall 5). Deliberately LOWER
 * than `GESTURE_AMPLITUDE_MIN`. */
export const FIDGET_MAX_AMPLITUDE = 0.05;

/** Minimum direction-change frequency (reversals per second) within the
 * low-amplitude band above for motion to count as fidgeting rather than
 * incidental stillness/noise — the "high-frequency" half of the fidget
 * definition.
 *
 * BUG FIX (12-08 Task 1 checkpoint, Defect D): this was 1.5, a figure that
 * only makes sense if hands ticks at the full `METRICS_SAMPLE_HZ` (6 Hz).
 * It does not: hands is one of four tenants on `SCHEDULE` in
 * `visual-capture.ts` (`["face", "pose", "face", "hands"]`), so hands
 * receives only 1/4 of ticks, ~1.5 Hz effective — confirmed against a real
 * mixed-session recording: `handSamples` was 412 over 274.7s, 1.50/s
 * exactly. A reversal is detected by comparing each tick's displacement
 * vector against the PRIOR tick's (a dot-product sign flip) — the
 * asymptotic ceiling for a long session is therefore bounded by the hands
 * tick rate itself (1.5/s), reached only if literally every consecutive
 * tick pair alternated direction, indistinguishable from noise and never
 * observed in a real recording (the same mixed session measured
 * `fidgetDirectionChangeRatePerS` at 0.35, with real hand-near-face and
 * gesture activity the user confirmed happened — the 0% `fidgetPct` this
 * produced was the sensor, not the behaviour). 1.5 demanded the
 * theoretical maximum from a session that was never going to produce it,
 * so `fidgetSamples` (`visual-capture.ts`'s `stop()`) was 0, and
 * `fidget_pct` was 0, for every session that could ever run.
 *
 * 0.5 is comfortably below the 1.5 Hz ceiling rather than at it, giving the
 * gate room to actually fire on real fidgeting. This is a STRUCTURAL
 * (achievability) fix only, not the behavioural cutoff Task 2 tunes from
 * real recordings — the exact value real fidgeting trips at still needs a
 * session where fidgeting genuinely happened, which this file's PROVISIONAL
 * banner already calls for. Must be re-derived again if `SCHEDULE` or
 * `METRICS_SAMPLE_HZ` ever change hands' share, the same discipline
 * `FACE_SCHEDULE_SHARE` documents for `expectedSamples`. */
export const FIDGET_MIN_DIRECTION_CHANGES_PER_S = 0.5;

/** `ObjectDetector` confidence score above which a "cell phone" detection
 * counts as a genuine phone-in-frame sample, rather than a false positive
 * (e.g. a dark rectangular object misclassified). */
export const PHONE_SCORE_THRESHOLD = 0.5;

/** Minimum cumulative visible seconds before a phone-in-frame episode is
 * reported at all — filters out a single-frame misdetection from becoming a
 * reportable "a phone was visible for..." observation. */
export const PHONE_MIN_VISIBLE_S = 2;

// --- 12-06: posture-drift normalisation scales and the gesture-window
// stillness guard. Per-signal drift is `abs(current - baseline)`, divided by
// one of the four scales below to land on a comparable 0-1 range before the
// four signals are averaged — without a shared 0-1 range, a 20-degree
// shoulder-tilt drift and a 0.2 forward-head-offset drift could not be
// averaged against each other meaningfully. All four are guesses pending
// real-session tuning (see file header), chosen as "roughly the drift a
// visibly slumped student would show," not derived from data.

/** Degrees of shoulder-line tilt change from baseline that counts as a full
 * (1.0) drift unit. */
export const POSTURE_SHOULDER_TILT_DRIFT_SCALE_DEG = 15;

/** Change in the (shoulder-width-normalised) forward-head offset from
 * baseline that counts as a full (1.0) drift unit. */
export const POSTURE_FORWARD_HEAD_DRIFT_SCALE = 0.3;

/** Degrees of torso-lean change from baseline that counts as a full (1.0)
 * drift unit. */
export const POSTURE_TORSO_LEAN_DRIFT_SCALE_DEG = 20;

/** Change in the shoulder/hip torso-openness ratio from baseline that counts
 * as a full (1.0) drift unit. */
export const POSTURE_TORSO_OPENNESS_DRIFT_SCALE = 0.3;

/** Minimum hand-DETECTED samples a 5-second episode window must contain
 * before `minimal_gesturing` is allowed to trip. Without this floor, a
 * window where the student was simply out of frame (zero hand samples) would
 * read identically to a window where hands were visible and genuinely still
 * — two different findings that must not collapse into one. */
export const GESTURE_WINDOW_MIN_HAND_SAMPLES = 3;

// --- 12-07: descriptive (never-scored) episode window-trip ratios. Both are
// RATIOS within a window, matching every other trip condition's discipline —
// a window with few samples cannot trip on one frame. Descriptive only: a
// `fidgeting`/`phone_visible` episode trip can never move a score (see
// `VisualDescriptiveObservations`'s header comment in `types.ts`).

/** Window ratio of fidget-band samples to hand-DETECTED samples above which a
 * `fidgeting` descriptive episode trips. Deliberately a guess pending
 * real-session tuning (see file header) — 50% means at least half of this
 * window's hand-detected samples fell inside the low-amplitude fidget band. */
export const FIDGET_EPISODE_TRIP_PCT = 50;

/** Window ratio of phone-visible samples to phone-model-processed samples
 * above which a `phone_visible` descriptive episode trips. */
export const PHONE_EPISODE_TRIP_PCT = 50;
