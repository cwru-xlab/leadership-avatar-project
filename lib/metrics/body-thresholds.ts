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
 *   - `POSTURE_DRIFT_SUSTAINED_S` (8, lowered from 15 in 12-11) — compared
 *     against wall-clock elapsed seconds (`tS`), not a sample count, so it is
 *     rate-independent; at pose's 1.5 Hz an 8s streak still gets ~12 ticks to
 *     confirm it. NOTE that this constant was exported and read by NOTHING
 *     until 12-11 Task 3 wired `bandPostureDrift` onto it — a rate audit
 *     cannot tell a miscalibrated constant from an unused one, and this file
 *     carried it as "achievable" for three plans while it did nothing at all.
 *     When auditing, check for a READER as well as a rate.
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
 * value could be checked against. Left at its original value.
 *
 * STILL NOT RE-TUNED, AND NOW KNOWN TO BE NEARLY INERT (12-10 Task 3). The
 * Task 2 readings finally captured what this floor does in practice, and the
 * answer is: almost nothing. The off-camera session cleared it for
 * `forward_head` on 140 of 143 pose ticks (98%) with the face detected 0% of
 * the session; the half-in-frame session cleared it for `shoulder_line` on
 * 278 of 281 ticks (99%) with the shoulders at the frame's edge. MediaPipe
 * asserts a confident `visibility` for extrapolated landmarks, so no value of
 * this floor could separate an observed body part from a predicted one — the
 * problem is the quantity, not the cutoff. It is left at 0.5 rather than
 * retuned or removed: it is a cheap, harmless additional condition, and
 * `isVisible` (`visual-capture.worker.ts`) now ANDs it with a real in-frame
 * test that carries the actual signal. Do not reach for this constant to fix
 * a visibility problem; see `isVisible`'s own comment first. */
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
 * SET FROM TWO REAL SESSIONS (12-10 Task 3) — and NOT "TUNED" in the sense
 * the rest of this file uses that word. Every constant here labelled TUNED
 * was placed against an observed DISTRIBUTION across five recorded sessions
 * (12-TUNING.md). This one is placed from the SEPARATION BETWEEN TWO
 * SESSIONS, which is a much weaker evidence base, and it is labelled that way
 * on purpose. 12-09 set this value to 0.25 as a REASONED BOUND with no
 * readings at all, and the bound did not hold — the honest label matters.
 *
 * WHAT THIS RATIO IS NOW A RATIO OF. `isVisible`
 * (`visual-capture.worker.ts`) was changed in the same task to require that a
 * landmark's coordinates actually fall inside the frame, so
 * `poseVisibleSamples[signal]` counts ticks the group was OBSERVED IN FRAME,
 * not ticks the model felt confident about. Without that change this gate is
 * meaningless at any value; without this gate that change does not close the
 * failure. Both halves are required — see `isVisible`'s own comment.
 *
 * THE READINGS (12-10 Task 2, recorded in 12-TUNING.md; the dump that
 * produced them was removed in Task 3). In-frame pose ticks over TOTAL pose
 * ticks, per signal group:
 *
 *   Session A — OFF CAMERA, one arm in shot, face presence 0%, 143 pose
 *   ticks. This is the session that defeated 12-08 and 12-09.
 *     forward_head   62/143 = 43.4%   <- the highest value anything reached
 *     shoulder_line  21/143 = 14.7%
 *     torso_lean     5/143  =  3.5%
 *     torso_openness 5/143  =  3.5%
 *
 *   Session B — HALF IN FRAME, shoulders at the frame's edge, torso cut off,
 *   face visible 79%, eye contact 75%, 281 pose ticks. This is the REQ-51
 *   side: a genuine partial body that must still be scored.
 *     forward_head   212/281 = 75.4%  <- the only genuinely readable signal
 *     shoulder_line  16/281  =  5.7%
 *     torso_lean     1/281   =  0.4%
 *     torso_openness 1/281   =  0.4%
 *
 * 60% sits just above the midpoint of the only gap those readings expose
 * (43.4% to 75.4%, midpoint 59.4%), rounded to a round number and placed on
 * the high side of that midpoint per 12-CONTEXT.md's calibration rule —
 * restated in 12-09's `<constraint_do_not_overcorrect>` — that where the
 * readable and unreadable sides pull against each other, the unreadable side
 * wins. A false "held steady" or a false "shifted from the opening posture"
 * credits or accuses a student over something never observed, which this
 * file's discipline treats as worse than declining to score a marginal body.
 *
 * It yields, on these two sessions: Session A measures NOTHING, and is
 * credited for nothing — the item-7 failure, closed at the layer that
 * produces it. Session B measures `forward_head` ONLY. That second outcome is
 * CORRECT, not a regression: Session B's own live report printed "Measured
 * from: Shoulder line and Head position" while the user sat at the frame's
 * edge with the torso cut off and the shoulder landmarks out of frame on 94%
 * of the ticks the model called visible. Scoring the one landmark genuinely
 * available, and naming only it, is REQ-51 satisfied rather than broken.
 *
 * HOW THIN THIS IS — read before changing it. (1) Two sessions, not a
 * distribution. (2) The separating gap is 43.4% -> 75.4%: real, but a single
 * reading on each side of it. Any cutoff from ~0.44 to ~0.75 produces
 * identical verdicts on BOTH sessions, so these readings do NOT locate 0.60
 * within that band — they only establish the band. Do not describe this
 * cutoff as well-characterised. (3) The cost of being high is a real one and
 * is accepted knowingly: a genuinely partial body visible for, say, half a
 * session will NOT be scored on that signal. Session B's 75.4% clears 0.60
 * with 15 points of headroom and is the ONLY genuine-partial reading that
 * exists. A third and fourth real session — especially a fully-in-frame one,
 * which would establish the ceiling this band has no reading for — should
 * narrow this, and is the first thing to collect before touching the value.
 *
 * Rate-independence is unchanged from 12-09 and still matters: the
 * denominator is the SCHEDULE-aware expected pose-sample count, not a raw
 * tick count, so this ratio stays meaningful if pose's schedule share ever
 * changes. (The readings above are quoted over observed total pose ticks,
 * which is the same quantity to within that session's dropped ticks.)
 *
 * RE-EXAMINED AND RETAINED AT 0.60 (12-11 Task 3) — the fully-in-frame ceiling
 * reading 12-10 asked for above now EXISTS, and the honest finding is that it
 * does NOT narrow this cutoff. Recorded because 12-10 explicitly named it "the
 * first thing to collect before touching the value", and the follow-up should
 * not keep waiting for a reading that has already been taken.
 *
 * SESSION A (12-11 Task 2, fully in frame, well centred, 108.0s): 162 pose
 * ticks, both `shoulder_line` and `forward_head` declared measured, and all
 * 162 ticks (31 baseline + 131 post-baseline, every one of the 131 scored)
 * yielded at least one usable signal. Both signals therefore cleared 0.60 by
 * construction, and the pair jointly cleared >=80.9%.
 *
 * WHY THAT CHANGES NOTHING. 12-10 located this cutoff inside a band whose ends
 * are its two DECISION boundaries: it must REFUSE 12-10's off-camera Session A
 * (`forward_head` at 43%) and ACCEPT 12-10's half-visible Session B
 * (`forward_head` at 75.4%) — so any value in (0.43, 0.754] gives identical
 * verdicts and the readings cannot locate 0.60 within it. A fully-in-frame
 * session lands far ABOVE that band, not inside it, so it cannot discriminate
 * between candidate values either: every value in the band accepts it. The
 * reading confirms a good session clears the gate with ~20+ points of
 * headroom — worth knowing, and it rules out this cutoff being the cause of
 * the 12-10 item-3 false negative (it was not; see `POSTURE_DRIFT_TRIP`) — but
 * 12-10's expectation that a ceiling reading would "establish the ceiling this
 * band has no reading for" was mistaken about what such a reading could do.
 * Correcting that expectation is the substance of this re-examination.
 *
 * WHAT WOULD ACTUALLY NARROW IT: a session that is genuinely partial at
 * BETWEEN 43% and 75% in-frame — i.e. one whose verdict DIFFERS across the
 * band — together with the user's judgement on whether it ought to have been
 * scored. Still not collected. Do not describe 0.60 as well-characterised. */
export const POSTURE_COVERAGE_MIN_RATIO = 0.6;

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
 * RE-EXAMINED AND DELIBERATELY RETAINED AT 0.25 (12-10 Task 3) — the value
 * is unchanged but the DECISION is new, and the numerator it is checked
 * against was wrong until this task. Recorded here so the retention does not
 * read as inertia; its posture sibling moved from 0.25 to 0.60 in the same
 * task, and this one was examined against the same readings and kept.
 *
 * THE DEFECT THAT MADE THIS GATE INERT (12-10 Task 3, found in the Task 2
 * readings). `computeHandsUsable` was called with `handSamples` — the count
 * of ticks the hands MODEL RAN, incremented unconditionally at the top of
 * `applyHandsResult`, detection or no detection. On any healthy session that
 * is ~100% of `expectedHandsSamples` by construction, so this gate passed
 * whatever the camera saw. Session A's reading proves it: 234 hands ticks
 * against ~234 expected = 100%, gate open, while only 39 ticks held a hand
 * genuinely in frame — which is why that off-camera session still reported
 * "Gesturing: Well judged" and "Hands near face: Frequent" after 12-09
 * supposedly closed exactly that. The numerator is now
 * `handsDetectedSamples`, counted after the worker drops out-of-frame wrists
 * (see `detectHands`). 12-09's hands fix never did anything; this is the
 * first version of it that can.
 *
 * WHY 0.25 AND NOT 0.60. Against the corrected numerator the Task 2 readings
 * give Session A 39/234 = 16.7% and Session B 1/282 = 0.4%. 0.25 refuses
 * both, which is the right outcome for both — Session B saw one hand all
 * session and must not be scored on gesturing either. But note what is
 * MISSING: neither session is a genuine hands-visible positive, so unlike its
 * posture sibling this value has NO upper reading bounding it, and the
 * readings cannot set it. It is bounded from BELOW only, by Session A's
 * 16.7%, and 0.25 clears that by 8 points — thin.
 *
 * It is therefore not raised to match posture's 0.60, and that restraint is
 * the substance of the decision. Hands differ from posture in kind: hands
 * legitimately leave frame throughout a normal session (resting in the lap,
 * below the laptop edge) while shoulders do not, so the in-frame share a
 * genuinely gesturing student produces is unknown and plausibly well under
 * 60%. Raising this blind, with no positive reading to check against, risks
 * silencing gesturing for most real sessions — overcorrection on the side
 * 12-09's `<constraint_do_not_overcorrect>` warns about. The calibration
 * rule's unreadable-side bias is already satisfied by the numerator fix,
 * which is what was actually broken.
 *
 * NEXT READING NEEDED: a fully-in-frame session where the student visibly
 * gestures, dumped for its in-frame hands share. That number, not reasoning,
 * should set this constant — and it is the same session that would bound
 * `POSTURE_COVERAGE_MIN_RATIO` from above. Revisit together. */
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
 * UNVERIFIED. Revisit the moment a genuinely slumping session is recorded.
 *
 * RE-EXAMINED AND DELIBERATELY RETAINED AT 0.5 (12-11 Task 3). The value is
 * unchanged but the DECISION is new, and for the first time this cutoff has a
 * TRUE-POSITIVE reading behind it as well as the two ordinary-session means
 * above. Recorded so the retention does not read as inertia.
 *
 * SET FROM ONE REAL SESSION — Session A of 12-11 Task 2, run by the user on
 * 2026-10-03: fully in frame, upright ~20s, then a hard held slump
 * (108.0s, 162 pose ticks, 131 post-baseline, baseline tilt=4.307deg
 * fwdHead=0.7681, signals `shoulder_line` + `forward_head`). NOT "tuned" — one
 * slump session is not a dataset, and the label is chosen to match 12-10's
 * honesty about its own 0.60. What that session bounds:
 *
 *   - TRUE-POSITIVE side (new, and the thing 12-08 could not check): during
 *     the held slump `forward_head`'s per-signal delta reached 1.000 — the
 *     CLAMP CEILING — and `shoulder_line`'s reached 0.508, itself alone above
 *     this trip. Both sit above 0.5. The slump clears this cutoff.
 *   - FALSE-POSITIVE side: the same session's upright stretch, which is the
 *     only post-12-10 clean ordinary reading that exists, produced per-signal
 *     deltas of 0.066-0.252 (worst-axis values at t=21.4/26.1/32.7). 0.5 is
 *     roughly twice the highest of those.
 *
 * So the trip now sits inside an OBSERVED band — ordinary <=0.252, slump
 * >=0.508 — rather than above two uncharacterised means with nothing on the
 * far side. That is why it does not move. It is still ONE session on the
 * positive side, and 12-11 Task 4's ordinary-session check is the first real
 * test of the false-positive side; see 12-TUNING.md.
 *
 * WHAT WAS ACTUALLY WRONG WAS NEVER THIS NUMBER. Session A's readings show the
 * slump cleared 0.5 on two separate per-signal deltas and STILL reported "Held
 * steady", because of how those deltas were aggregated before reaching here —
 * see `computePostureDrift` and `bandPostureDrift`, both repaired in this
 * task. Lowering this constant would have been the obvious move and would have
 * fixed nothing while making every other signal twitchier. Do not reach for it
 * first next time either. */
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
 * at its original value.
 *
 * LOWERED 15 -> 8 AND WIRED UP FOR THE FIRST TIME (12-11 Task 3). Two separate
 * facts about the old state, both of which matter:
 *
 * 1. **It was dead.** Until this task this constant was exported and read by
 *    NOTHING — `grep POSTURE_DRIFT_SUSTAINED_S lib scripts app` matched only
 *    its own declaration and the file header's rate audit. The "sustained
 *    duration before it is reported as an episode" its comment describes was
 *    never enforced anywhere. `bandPostureDrift` now reads
 *    `posture_drift_max_s` against it, which is this constant's first real
 *    use. The streak it gates has been computed and persisted since 12-06
 *    (`visual-capture.ts`) and was likewise never read.
 * 2. **15 would have produced a SECOND silent false negative.** This is the
 *    trap in the obvious repair and it is worth stating explicitly, because
 *    switching the band from `posture_drift_mean` onto `posture_drift_max_s`
 *    looks like the clean fix and is not, on its own. Session A — a hard,
 *    deliberately HELD slump, the strongest true positive this phase has ever
 *    captured — measured `posture_drift_max_s` = 12.0s. Against 15 it would
 *    still have reported "Held steady", from a different layer, and the
 *    aggregation repair would have appeared to do nothing.
 *
 * SET FROM ONE REAL SESSION (Session A, 12-11 Task 2) — not "tuned". The
 * derivation, and why 8 specifically:
 *
 *   - 12.0s is a proven LOWER BOUND on what that session now produces. The
 *     12.0s was measured under the OLD cross-signal mean; this task changes
 *     `computePostureDrift` to the per-tick worst axis, and max >= mean per
 *     tick by construction, so every tick that was above the trip under the
 *     mean is still above it under the max. Every old streak is therefore
 *     contained in a new one, and the new `posture_drift_max_s` for Session A
 *     is >= 12.0s. (Almost certainly much longer: at t=33.4/34.0/34.7 the
 *     mean read 0.350/0.330/0.366 — all BELOW the trip, contributing no streak
 *     at all — while the worst axis read 0.561/0.494/0.572. That is why a
 *     minute-long held slump only ever yielded a 12s run.)
 *   - 8 sits below that bound with ~4s of margin, which is deliberate: the
 *     per-tick series shows the worst axis dipping just under the trip mid
 *     slump (0.494 at t=34.0), and the streak counter resets on a single
 *     sub-trip tick, so a genuine hold can arrive here fragmented. A floor
 *     set flush against 12.0 would be brittle to exactly that.
 *   - 8s is still ~4x a momentary excursion (reaching for water, glancing at
 *     a note) and, at pose's confirmed ~1.5 Hz, demands ~12 consecutive ticks
 *     above the trip. Noise does not hold for 8 seconds; that duration
 *     requirement is what lets the worst-axis aggregation be safe, and the two
 *     changes must be read as one mechanism.
 *
 * EVIDENCE IS THIN AND ONE-SIDED. One slump session bounds this from above
 * (<=12.0s); NOTHING bounds it from below, because no ordinary session has ever
 * been dumped for its streak length under this trip and aggregation. If an
 * ordinary session turns out to produce 8s runs, this is the constant to
 * raise — but raise it on a reading, not on reasoning. See 12-TUNING.md. */
export const POSTURE_DRIFT_SUSTAINED_S = 8;

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
 * this value already gated. Left at its original value.
 *
 * STILL UNDECIDED AFTER 12-11, AND DELIBERATELY SO. This is the fourth plan
 * (12-07, 12-09, 12-10, 12-11) to leave this constant unset, and the reason is
 * now narrower than "no data": HALF the dataset exists.
 *
 * WHAT 12-11 Task 2 DID MEASURE — Session A, 2026-10-03. That session held NO
 * phone at any point, which makes it a clean FALSE-POSITIVE floor:
 *
 *   objectTicks=53, ticks with any "cell phone" detection=4, ticks with
 *   none=49. Scores min 0.058 / median 0.081 / max 0.163 (histogram
 *   0.0-0.1: 3, 0.1-0.2: 1). At or above 0.5: ZERO.
 *   Reported `phone_visible_seconds` = 0.0 — correct.
 *
 * So on the side this reading covers, 0.5 is doing its job with ~3x of margin:
 * the model does emit spurious low-confidence phone detections on a
 * phone-free session, and every one of them was refused. Nothing here argues
 * for raising it.
 *
 * WHAT IS STILL MISSING is the half that would actually SET it. Session C of
 * 12-11 Task 2 — a phone held deliberately in frame for a timed stretch — was
 * NOT RUN. The true-positive confidence distribution has therefore never been
 * observed, not once, in any plan. Without it there is no way to know whether a
 * genuinely-held phone scores 0.9 (0.5 is fine, with room to spare) or 0.3
 * (0.5 silently discards real phone-in-frame time and the signal is a false
 * negative in the same shape posture drift just turned out to be).
 *
 * It is NOT moved on the strength of the no-phone floor alone. A one-sided
 * reading can only justify raising a cutoff, never lowering it, and raising it
 * is not the direction any evidence points. Guessing from the false-positive
 * side is exactly the move 12-09's coverage-ratio guess and 12-10's proposed
 * per-tick fix were both caught making.
 *
 * NEXT READING NEEDED: the Session C that has now been scheduled three times.
 * Hold a phone clearly in frame ~30s and dump the per-detection scores. NOTE
 * FOR WHOEVER RUNS IT: the phone half of 12-11's dev dump was deliberately
 * KEPT IN PLACE for this purpose (`NEXT_PUBLIC_PHONE_CONFIDENCE_DEV_DUMP` in
 * `visual-capture.ts`) — unlike 12-10, which removed the dump and so had
 * nothing to read when the item came up. Do not remove it until the reading
 * exists. See 12-TUNING.md. */
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
// four signals are COMPARED against each other — without a shared 0-1 range,
// a 20-degree shoulder-tilt drift and a 0.2 forward-head-offset drift could
// not be weighed against each other meaningfully. (12-11 Task 3: the
// combination step is now `max`, not `mean` — see `computePostureDrift`. The
// need for a shared range is identical either way.)
//
// NOT RE-TUNED (12-08 Task 2): no session dump captured the raw PER-SIGNAL
// drift decomposition (shoulder-tilt drift vs. forward-head drift vs.
// torso-lean drift individually) — only the already-combined
// `posture_drift_mean` (S3: 0.358, S4: 0.424), which cannot be decomposed
// back into which of the four signals contributed how much. All four left
// at their original values, chosen as "roughly the drift a visibly slumped
// student would show," not derived from data.
//
// STILL NOT RE-TUNED (12-11 Task 3), BUT THE DECOMPOSITION FINALLY EXISTS AND
// IT CARRIES A WARNING. Session A (12-11 Task 2, the deliberate held slump —
// see `POSTURE_DRIFT_TRIP`) is the first reading to decompose drift per
// signal. Taken against a baseline of tilt=4.307deg / fwdHead=0.7681, over
// 131 post-baseline ticks:
//
//   - `shoulder_line` peaked at a 0.508 delta => |tilt - 4.307| = 7.62deg of
//     real movement against the 15deg scale below. A genuine mid-range
//     reading: the scale is neither saturated nor inert, and it is the first
//     evidence of any kind for the 15deg value. Left unchanged.
//   - `forward_head` peaked at EXACTLY 1.000 — the clamp ceiling in
//     `computePostureDrift`.
//
// **THE SATURATION IS A KNOWN LIMIT, RECORDED SO IT IS NOT MISTAKEN FOR A
// GOOD READING.** A clamped 1.000 says only that the offset moved AT LEAST
// `POSTURE_FORWARD_HEAD_DRIFT_SCALE` (0.3) from baseline — i.e. to <=0.4681
// from 0.7681. The TRUE magnitude is unknown and unrecoverable from this
// session's dump, because the clamp discarded it. The consequence is specific:
// 0.3 may be too SMALL to discriminate a moderate slump from an extreme one,
// since both land at 1.000 and read identically. That does not affect whether
// the slump is DETECTED (it clears any trip at or below 1.0, and the detection
// side is now proven), but it does mean this channel currently has no usable
// dynamic range above the cutoff and cannot support any future severity or
// degree-of-slump wording.
//
// It is NOT raised on that basis, and the restraint is the decision. Raising
// 0.3 to recover headroom would simultaneously desensitise detection, trading
// a proven true positive for a severity gradation nothing has asked for. The
// reading needed first is an UNCLAMPED per-signal delta series — dump
// `abs(current - baseline) / scale` before the clamp, across a moderate slump
// AND a hard one, and set this from the gap between them. Until then 0.3
// stands as the value that demonstrably detects a real slump.

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
