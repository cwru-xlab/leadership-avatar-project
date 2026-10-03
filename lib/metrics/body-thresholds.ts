/**
 * EVERY numeric cutoff Phase 12 (Embodied Visual Signals) introduces lives in
 * this one file.
 *
 * TUNED (12-08 Task 2), from five real recorded sessions — see
 * `.planning/phases/12-embodied-visual-signals/12-TUNING.md` for the full
 * dataset, which sessions were used, which rows were discarded as pre-fix
 * artifacts, and — most importantly — how well-evidenced EACH constant
 * below actually is. That file is the provenance a student may challenge a
 * grade against; this file's per-constant comments summarise it, but
 * 12-TUNING.md is the source of record.
 *
 * NOT EVERY CONSTANT BELOW CARRIES EQUAL EVIDENCE. Some (the gesture-rate
 * and hands-near-face bands, the posture-drift trip) were tuned against
 * real session readings and say so, with the honest caveat where the
 * dataset is thin. Others are per-sample magnitude/distance/confidence
 * primitives no session dump captured a usable raw distribution for — those
 * are marked NOT RE-TUNED and left at their original value rather than
 * relabelled with invented confidence. No other file in this phase may
 * define a body-signal threshold inline — if a new numeric cutoff is
 * needed, it is added here, named, and given a one-line rationale, so the
 * whole tuned set stays auditable from one place.
 *
 * SCHEDULE RATE AUDIT (12-08 Task 1 checkpoint, Defect D). `visual-capture.ts`'s
 * `SCHEDULE = ["face", "pose", "face", "hands"]` means NO model actually
 * samples at the full `METRICS_SAMPLE_HZ` (6 Hz) except face (2/4 share, 3 Hz
 * effective) — pose and hands each get 1/4 (1.5 Hz effective, confirmed
 * against FOUR real recordings: `handSamples`/`sessionSeconds` landed at
 * 1.49, 1.50, 1.48 and 1.50 Hz across all four usable sessions in
 * 12-TUNING.md). Object detection runs on its own independent
 * `OBJECT_TICK_INTERVAL_MS` timer, achieved ~0.5 Hz. ANY constant below
 * expressed in per-second, per-sample, or sample-count terms is only
 * meaningful if checked against the REAL achieved rate of the model that
 * feeds it, not the nominal 6 Hz — one constant already reached production
 * assuming the wrong rate (`POSTURE_BASELINE_MIN_SAMPLES`, fixed in this
 * plan). A SECOND, the fidget direction-change gate, turned out to be
 * unfixable this way — the hands model's achievable ~1.5 Hz cannot observe
 * a reversal rate fast enough to mean "fidgeting" at all (Nyquist-shaped,
 * not merely mistuned); fidgeting was retired to permanently not-measured
 * instead (`VISUAL_NOT_MEASURED` in `types.ts`), and both fidget constants
 * were removed entirely rather than retuned. A THIRD, the gesture-rate
 * episode window trip, was comparing a wall-clock-extrapolated rate
 * against a session-level cutoff — fixed in this plan by converting both
 * to ratios of the window's own real observed tick count (see
 * `GESTURE_WINDOW_EXCESSIVE_PCT`/`GESTURE_WINDOW_STILL_PCT` below).
 * Audited here so the next `SCHEDULE` change surfaces every remaining one
 * of these instead of silently killing or miscalibrating another signal:
 *   - `POSTURE_BASELINE_MIN_SAMPLES` (pose, 1.5 Hz) — see its own comment.
 *   - `POSTURE_COVERAGE_MIN_RATIO`/`HANDS_COVERAGE_MIN_RATIO` (12-09) — RATIOS
 *     of a signal's own SCHEDULE-aware expected sample count (pose/hands
 *     each 1.5 Hz), not raw counts, so — like the window ratios below —
 *     they stay meaningful if `SCHEDULE` ever changes either model's share.
 *   - `GESTURE_RATE_STILL_MAX`/`GESTURE_RATE_EXCESSIVE_MIN` — per SESSION
 *     MINUTE from `gestureEventCount`, not per hands-tick, so the ceiling is
 *     the hands rate times 60: ~90/min if literally every hands tick
 *     tripped a gesture. Both are well inside that ceiling — achievable.
 *   - `GESTURE_WINDOW_EXCESSIVE_PCT`/`GESTURE_WINDOW_STILL_PCT` — RATIOS of
 *     `gestureSamples` to the window's own `handsDetected`, derived from
 *     the two constants above via the confirmed ~1.5 Hz / 90-per-minute
 *     hands ceiling — see their own comments for the conversion.
 *   - `HANDS_NEAR_FACE_TRIP_PCT`, `PHONE_EPISODE_TRIP_PCT` — both RATIOS of
 *     same-model counts (e.g. `handsNearFaceSamples / handsNearFaceEligibleSamples`),
 *     not raw per-second rates, so they are immune to the underlying tick
 *     rate by construction — a session can reach 0-100% on either of these
 *     regardless of how many ticks that rate produces.
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
 *     `HANDS_NEAR_FACE_RADIUS`, `PHONE_SCORE_THRESHOLD`, all four
 *     `POSTURE_*_DRIFT_SCALE*` constants — per-SAMPLE magnitude/distance/
 *     confidence thresholds, not rates at all; unaffected by tick rate by
 *     construction, and NOT RE-TUNED (see each one's own comment).
 */

/** Minimum MediaPipe per-landmark `visibility` score (0-1) before a landmark
 * is trusted at all. Below this floor, a landmark group is treated as "not
 * in frame" rather than measured — the mechanism behind "partial bodies
 * score what is visible" (12-CONTEXT.md).
 *
 * NOT RE-TUNED (12-08 Task 2): no session dump captured a raw per-landmark
 * visibility-score distribution — only aggregate counts derived AFTER this
 * floor already applied. There is nothing in the 12-TUNING.md dataset this
 * value could be checked against. Left at its original value. */
export const LANDMARK_VISIBILITY_FLOOR = 0.5;

/** Length of the posture self-calibration window, in seconds, at the start
 * of a session. The scored posture signal is drift AWAY from whatever
 * baseline this window captures — never a fixed ideal. 20s is a guess at
 * "long enough to average out one fidget, short enough that the interview
 * proper hasn't really started."
 *
 * NOT RE-TUNED (12-08 Task 2): this is a window LENGTH, not a behavioural
 * cutoff — no session reading bears on whether 20s specifically is the
 * right duration (that would need a session with a documented true
 * "opening posture" compared against several different window lengths).
 * Left at its original value. */
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
 * `posture_drift_mean` populating for real on two LATER sessions (S3: 0.358
 * over 78 samples; S4: 0.424 over 351 samples — see 12-TUNING.md) confirms
 * the fix holds.
 *
 * 15 is half of the ~30-tick ceiling pose can realistically reach in the
 * 20s window at its real 1/4 schedule share — "at least half the window's
 * worth of pose's own achievable tick rate landed," the schedule-aware
 * equivalent of the original comment's intent. This is a STRUCTURAL
 * (achievability) fix, not a behavioural cutoff tuned from recordings — it
 * must be re-derived again if `SCHEDULE` or `METRICS_SAMPLE_HZ` ever change
 * pose's share, the same discipline `FACE_SCHEDULE_SHARE` already documents
 * for `expectedSamples`. */
export const POSTURE_BASELINE_MIN_SAMPLES = 15;

/** Minimum share of a signal's EXPECTED pose samples (the schedule-aware
 * denominator `visual-capture.ts`'s `stop()` already derives for pose, the
 * same `FACE_SCHEDULE_SHARE` pattern applied to pose's own share) that must
 * have come back USABLY VISIBLE for that signal before it may be reported
 * as measured for the SESSION. This is an ADDITIONAL condition on top of
 * `POSTURE_BASELINE_MIN_SAMPLES` above, not a replacement for it — a signal
 * must clear BOTH the absolute achievability floor and this proportional
 * one.
 *
 * REASONED BOUND (12-09), not TUNED — no session dump has ever captured a
 * per-signal session-wide visibility RATIO; only the raw sample counts this
 * ratio is checked against exist (`poseVisibleSamples`). This cannot be
 * checked against a real distribution yet, so it is derived from
 * first-principles reasoning instead and stated plainly as such:
 *
 * The item-7 sign-off failure (`.planning/phases/12-embodied-visual-signals/
 * 12-09-PLAN.md`'s `<observed_failure>`) was produced by a brief in-frame
 * glimpse that cleared `POSTURE_BASELINE_MIN_SAMPLES` (15 absolute samples)
 * while the body was out of frame for essentially the entire rest of a
 * ~165s session — roughly 6% of that session's own expected pose-sample
 * count. Rate-independence matters here the same way it does everywhere
 * else in this file: 6% is computed against the SCHEDULE-aware expected
 * count, not a raw tick count, so this ratio stays meaningful if pose's
 * schedule share ever changes.
 *
 * 25% is chosen well above that 6% failure case — comfortably clearing a
 * brief glimpse — while remaining low enough that a genuinely
 * PARTIALLY-visible body (e.g. shoulders readable for half the session, the
 * REQ-51 case this file's header and 12-09's `<constraint_do_not_overcorrect>`
 * both require to still score) clears it easily. Per 12-CONTEXT.md's
 * calibration rule — restated in that same constraint block — this value is
 * deliberately biased toward the UNREADABLE side when the two pull against
 * each other: a false "held steady" credits a student for something never
 * observed, which this file's own discipline treats as worse than
 * declining to score a marginal body. Revisit the moment a real
 * partially-visible session dump exists to check this ratio against. */
export const POSTURE_COVERAGE_MIN_RATIO = 0.25;

/** Hands sibling of `POSTURE_COVERAGE_MIN_RATIO` above — hands shares
 * pose's identical `SCHEDULE` slot (one tick of four, ~1.5 Hz effective —
 * see the file header's SCHEDULE RATE AUDIT), so the identical proportional
 * argument applies: an absolute `handSamples > 0` floor alone cannot tell a
 * brief in-frame glimpse apart from a genuinely usable session, which is
 * exactly the class of defect `POSTURE_COVERAGE_MIN_RATIO` closes for
 * posture (12-09's observed Session B also reported "Gesturing: Very
 * still" and "Hands near face: Frequent" from an off-camera session — the
 * identical bug on `gesture_rate_per_min`/`hands_near_face_pct`'s shared
 * `handsUsable` gate).
 *
 * REASONED BOUND (12-09), same value and same bias as `POSTURE_COVERAGE_MIN_RATIO`
 * for the same reason — no session dump has ever captured a per-session
 * hands-visibility ratio either, so this is the same conservative,
 * unreadable-biased placement, not an independently-tuned number. Revisit
 * together with its posture sibling. */
export const HANDS_COVERAGE_MIN_RATIO = 0.25;

/** Magnitude of drift (normalized units, same scale as the baseline angle
 * comparison) that counts as "tripped" for a `posture_drift` episode window,
 * and (via `bandPostureDrift`) for the scored "Posture drift" row.
 *
 * TUNED (12-08 Task 2) — THE WEAKEST-EVIDENCED CUTOFF IN THIS FILE. Only two
 * real sessions ever produced a `posture_drift_mean` at all (S3: 0.358 over
 * 78 post-baseline samples; S4: 0.424 over 351 samples — see 12-TUNING.md),
 * and NEITHER was a session the user described as deliberately slumping or
 * shifting posture; both were ordinary mixed-behaviour sessions. The
 * original 0.35 value sat BELOW both of those ordinary-session means,
 * which would read a normal, non-slumping session as "shifted from the
 * opening posture" more often than not. Raised to 0.5 — comfortably above
 * both real readings — so ordinary movement reads as "held steady" and
 * only drift clearly exceeding what two ordinary sessions produced reads
 * as "shifted." This is a conservative placement chosen specifically
 * because there is no real reading yet from a session the user described
 * as deliberately slumping — the true positive side of this boundary is
 * UNVERIFIED. Revisit the moment a genuinely slumping session is recorded. */
export const POSTURE_DRIFT_TRIP = 0.5;

/** Minimum sustained duration, in seconds, a drift run must hold before it
 * is reported as an episode rather than a momentary shift (e.g. reaching for
 * water). Mirrors the existing episode system's "a run, not a single bad
 * sample" discipline.
 *
 * NOT RE-TUNED (12-08 Task 2): retuning this needs a raw per-tick drift
 * time series to see how long a real streak above `POSTURE_DRIFT_TRIP`
 * actually runs — only the session-aggregate `driftMaxS` is available (S3:
 * 2s, S4: 30.5s), and both were computed against the OLD 0.35 trip, not
 * the new 0.5 one, so neither number can be used to justify a new duration
 * floor without re-running the raw ticks through the new trip value. Left
 * at its original value. */
export const POSTURE_DRIFT_SUSTAINED_S = 15;

/** Gesture rate (per minute) at or below which a session reads as "too
 * still" — the low end of REQ-50's three-band curve, read by `bandGesturing`
 * for the scored "Gesturing" row. Stillness is a real, reportable finding
 * (12-CONTEXT.md), not merely the absence of the excessive-end flag.
 *
 * TUNED (12-08 Task 2) from a NARROW real-reading gap, stated plainly
 * rather than hidden behind a confident-looking number: S1 (a session
 * explicitly run as "hands in lap, minimal movement") measured 0/min;
 * S4 (the best real proxy for ordinary behaviour available — see
 * 12-TUNING.md) measured 4/min and must NOT read as still. 2 sits at the
 * midpoint of that 0-to-4 gap. There is no session between 0 and 4/min to
 * narrow this further. */
export const GESTURE_RATE_STILL_MAX = 2;

/** Gesture rate (per minute) at or above which a session reads as
 * "excessive" — the high end of the same curve, read by `bandGesturing`.
 *
 * TUNED (12-08 Task 2) from four real session-wide readings: S1 0/min
 * (still), S4 4/min (ordinary-behaviour proxy), S2 9/min (a session with a
 * real sustained arm-waving excursion the user confirmed), S3 12.2/min (a
 * short, 73.5s session — under the plan's 3-4 minute floor, weighted
 * accordingly). The calibration rule this file's header already states —
 * "prefer the conservative edge; a false excessive is a student told off
 * for a sensor misread" — governs here directly: 25 sat ABOVE every
 * measured session-wide rate, yet `excessive_gesturing` episodes still
 * fired on sessions whose rate was 4, 9 and 12.2/min, because the WINDOW
 * trip condition was comparing a different, far noisier statistic (see the
 * `excessive_gesturing` bug fix in `visual-capture.ts`'s `windowTrips`,
 * now fixed to derive from this same number). Lowered to 20 — conservatively
 * above S3's 12.2 (the highest real session-wide reading, from a session
 * the user did not describe as exhibiting excessive behaviour), while
 * staying well clear of S1/S4/S2. No session in this dataset measured a
 * session-wide rate the user DID describe as excessive — S2's arm-waving
 * excursion is real and localised, not a high SESSION-WIDE average (9/min
 * overall) — so this cutoff, like the episode mechanism it feeds, is
 * calibrated to catch a LOCAL excursion via the window-level condition, not
 * to flag an ordinary session-wide pace as excessive on its own. */
export const GESTURE_RATE_EXCESSIVE_MIN = 20;

/** Window-level equivalent of `GESTURE_RATE_EXCESSIVE_MIN`, as a PERCENTAGE
 * of the window's own real observed `handsDetected` tick count (never wall-
 * clock time) — see the `excessive_gesturing` bug fix comment in
 * `visual-capture.ts`'s `windowTrips` for why wall-clock extrapolation from
 * a ~7-8-tick, 5-second window was the actual defect, not merely a mistuned
 * number.
 *
 * DERIVED (12-08 Task 2), not independently tuned: `GESTURE_RATE_EXCESSIVE_MIN`
 * (20/min) converted via the confirmed ~1.5 Hz / 90-per-minute hands
 * achievable ceiling (`20 / 90 * 100 ≈ 22.2`, rounded to 22) — so the
 * window-level trip and the session-level band represent the IDENTICAL
 * underlying gesture intensity, expressed in compatible units, rather than
 * two independently-guessed numbers that can silently disagree (the exact
 * failure this plan's Task 2 was asked to fix). Re-derive if
 * `GESTURE_RATE_EXCESSIVE_MIN` or the hands schedule share ever changes. */
export const GESTURE_WINDOW_EXCESSIVE_PCT = 22;

/** Window-level equivalent of `GESTURE_RATE_STILL_MAX`, same derivation and
 * same caveats as `GESTURE_WINDOW_EXCESSIVE_PCT` above.
 *
 * DERIVED (12-08 Task 2): `GESTURE_RATE_STILL_MAX` (2/min) converted via the
 * same ~1.5 Hz / 90-per-minute ceiling (`2 / 90 * 100 ≈ 2.2`, rounded to 2). */
export const GESTURE_WINDOW_STILL_PCT = 2;

/** Minimum normalized wrist displacement, within one sample window, that
 * counts as a gesture at all (vs. incidental micro-movement). Below this
 * amplitude, motion is not counted toward `gesture_rate_per_min`.
 *
 * NOT RE-TUNED (12-08 Task 2): every session dump reports `gestureAmplitudeMean`
 * — the mean amplitude of events that ALREADY cleared this floor — never the
 * raw sub-threshold displacement distribution the floor itself would need to
 * be checked against. Using the post-filter mean to retune the filter would
 * be circular. Left at its original value. */
export const GESTURE_AMPLITUDE_MIN = 0.08;

/** Normalized-image-space radius around the face centre within which a hand
 * landmark counts as "near the face" for the hands-near-face signal.
 *
 * NOT RE-TUNED (12-08 Task 2): no session dump captured the raw
 * hand-to-face distance distribution this radius would need to be checked
 * against — only the downstream `hands_near_face_pct` aggregate (which
 * `HANDS_NEAR_FACE_TRIP_PCT` below WAS tuned from). Left at its original
 * value. */
export const HANDS_NEAR_FACE_RADIUS = 0.15;

/** Percentage of processed samples with a hand inside `HANDS_NEAR_FACE_RADIUS`
 * above which the hands-near-face episode/score trips. Hands-near-face is
 * its own distinct scored signal, never folded into the gesture-rate curve
 * above (REQ-50).
 *
 * TUNED (12-08 Task 2) from four real `hands_near_face_pct` readings: S1 0%
 * (still session), S4 26% (ordinary-behaviour proxy), S2 32% (a mixed
 * session), S3 71% (the ONLY session the user explicitly described as
 * deliberate face-touching — see 12-TUNING.md). The original 15 would have
 * read S4's ordinary 26% as "Frequent," which is not defensible without a
 * session the user actually called frequent at that level. Raised to 50 —
 * comfortably above S2's 32% (so an ordinary/mixed session reads
 * "Occasional," not "Frequent") and comfortably below S3's 71% (so the one
 * session with real deliberate face-touching still reads "Frequent"). */
export const HANDS_NEAR_FACE_TRIP_PCT = 50;

// Fidgeting (FIDGET_MAX_AMPLITUDE, the fidget direction-change rate gate,
// and the fidget episode window-trip ratio) was retired to permanently
// not-measured in 12-08 Task 1 and all three constants were deleted rather
// than retuned — see `VISUAL_NOT_MEASURED`'s own comment in `types.ts` and
// `.planning/phases/12-embodied-visual-signals/deferred-items.md` for the
// full measurement-capability finding (Nyquist-shaped, not a mistuned
// threshold). They have no remaining reader.

/** `ObjectDetector` confidence score above which a "cell phone" detection
 * counts as a genuine phone-in-frame sample, rather than a false positive
 * (e.g. a dark rectangular object misclassified).
 *
 * NOT RE-TUNED (12-08 Task 2): no session dump captured the model's raw
 * per-detection confidence scores — only the post-threshold sample counts
 * this value already gated. Left at its original value. */
export const PHONE_SCORE_THRESHOLD = 0.5;

/** Minimum cumulative visible seconds before a phone-in-frame episode is
 * reported at all — filters out a single-frame misdetection from becoming a
 * reportable "a phone was visible for..." observation.
 *
 * NOT RE-TUNED (12-08 Task 2): S2's real 22-second visible phone reading
 * sits well above this floor, which confirms the floor does not block a
 * genuine ~30-second phone-in-frame excursion, but no session in this
 * dataset exercised a BRIEF, few-second phone appearance that would
 * actually test where this floor should sit. Left at its original value. */
export const PHONE_MIN_VISIBLE_S = 2;

// --- 12-06: posture-drift normalisation scales and the gesture-window
// stillness guard. Per-signal drift is `abs(current - baseline)`, divided by
// one of the four scales below to land on a comparable 0-1 range before the
// four signals are averaged — without a shared 0-1 range, a 20-degree
// shoulder-tilt drift and a 0.2 forward-head-offset drift could not be
// averaged against each other meaningfully.
//
// NOT RE-TUNED (12-08 Task 2): no session dump captured the raw PER-SIGNAL
// drift decomposition (shoulder-tilt drift vs. forward-head drift vs.
// torso-lean drift individually) — only the already-combined
// `posture_drift_mean` (S3: 0.358, S4: 0.424), which cannot be decomposed
// back into which of the four signals contributed how much. All four left
// at their original values, chosen as "roughly the drift a visibly slumped
// student would show," not derived from data.

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
 * before `excessive_gesturing`/`minimal_gesturing` is allowed to trip.
 * Without this floor, a window where the student was simply out of frame
 * (zero hand samples) would read identically to a window where hands were
 * visible and genuinely still — two different findings that must not
 * collapse into one. (12-08 Task 2: now shared by BOTH gesture-rate episode
 * kinds — `excessive_gesturing` previously had no such floor at all, a
 * second asymmetry the window-vs-band fix also closed.)
 *
 * NOT RE-TUNED (12-08 Task 2): this is an achievability floor (see the file
 * header's SCHEDULE RATE AUDIT — 3 is comfortably below the ~7.5-tick
 * ceiling a 5s window achieves at hands' 1.5 Hz), not a behavioural cutoff
 * session readings would inform. Left at its original value. */
export const GESTURE_WINDOW_MIN_HAND_SAMPLES = 3;

// --- 12-07: descriptive (never-scored) episode window-trip ratio. A RATIO
// within a window, matching every other trip condition's discipline — a
// window with few samples cannot trip on one frame. Descriptive only: a
// `phone_visible` episode trip can never move a score (see
// `VisualDescriptiveObservations`'s header comment in `types.ts`).
//
// The fidget episode window-trip ratio was RETIRED (12-08 Task 1
// checkpoint) alongside the other fidget constants above — see that
// comment for why.

/** Window ratio of phone-visible samples to phone-model-processed samples
 * above which a `phone_visible` descriptive episode trips.
 *
 * NOT RE-TUNED (12-08 Task 2): no session dump captured a WINDOW-level
 * phone-visibility fraction during S2's real ~22-second phone excursion —
 * only the session-wide `phoneVisibleSamples`/`phoneSamples` counts, which
 * `PHONE_MIN_VISIBLE_S` was checked against, not this per-window ratio.
 * Left at its original value. */
export const PHONE_EPISODE_TRIP_PCT = 50;
