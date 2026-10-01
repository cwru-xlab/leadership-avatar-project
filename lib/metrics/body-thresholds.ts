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

/** Minimum number of processed samples inside the calibration window before
 * a baseline is considered trustworthy enough to score drift against. At
 * `METRICS_SAMPLE_HZ = 6`, 60 samples is 10 real seconds of the 20s window —
 * below this, the window was too sparse (e.g. the student was mostly out of
 * frame at session start) to anchor a fair baseline. */
export const POSTURE_BASELINE_MIN_SAMPLES = 60;

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
 * definition. */
export const FIDGET_MIN_DIRECTION_CHANGES_PER_S = 1.5;

/** `ObjectDetector` confidence score above which a "cell phone" detection
 * counts as a genuine phone-in-frame sample, rather than a false positive
 * (e.g. a dark rectangular object misclassified). */
export const PHONE_SCORE_THRESHOLD = 0.5;

/** Minimum cumulative visible seconds before a phone-in-frame episode is
 * reported at all — filters out a single-frame misdetection from becoming a
 * reportable "a phone was visible for..." observation. */
export const PHONE_MIN_VISIBLE_S = 2;
