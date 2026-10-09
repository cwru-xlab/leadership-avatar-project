---
phase: 20-difficult-conversation-walk-outs
plan: 02
subsystem: engine
tags: [disengagement, hostility, stonewalling, weight-profile, deterministic, ratchet]

# Dependency graph
requires:
  - phase: 20-difficult-conversation-walk-outs
    provides: "20-01's detectHostility(text) classifier (none/hostile/severe tiers), SEVERE_PLACEHOLDER_TOKENS, and the 0.425 stonewalling measurement this plan's amendment reverses the conclusion of (not the measurement)"
  - phase: 18-avatar-disengagement-walk-out
    provides: "computeDisengagement / computeDisengagementOverTranscript, the one-way ratchet mechanism, DEFAULT_DISENGAGEMENT_WEIGHTS, deriveCommonGroundAbsent, the calibration policy (18-VALIDATION.md)"
provides:
  - "lib/engine/disengagement.ts — four new observable causes (hostility, severe_content, position_unacknowledged, stonewalling) appended to DISENGAGEMENT_CAUSES, all weight-0 by default"
  - "An optional weights parameter on computeDisengagement / computeDisengagementOverTranscript, and matching optional TerminationPolicyConfig.disengagementWeights / avatarEndReasonByCause fields, so a type can declare its own profile without touching the shared default"
  - "deriveAcknowledgementAbsent — the live, in-session twin of Phase 15's empathy rubric dimension"
  - "A dedicated stonewalling cause (STONEWALLING_PATTERN + stonewallingStreak), added by the 2026-10-08 amendment so sustained pure refusal can cross a type's threshold alone"
  - "scripts/verify-disengagement.ts sections 7-15: hostility accumulation, the one-way ratchet (with a negative control), no-apology-recovery, acknowledgement-absence ratchet, severe carry-forward, unchanged-defaults, weight-profile arithmetic, and the amendment's two required facts (stonewalling crosses alone; hostility crosses at least as fast)"
affects: [20-03, 20-04, 20-05, 20-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-type weight override: computeDisengagement/computeDisengagementOverTranscript accept an optional `weights: Partial<DisengagementWeights>`, resolved once as `{ ...DEFAULT_DISENGAGEMENT_WEIGHTS, ...(weights ?? {}) }`, so a type opts in without the shared default ever changing for other types."
    - "Deterministic-signal-via-existing-detector: hostileTurnCount/severeContent are derived by calling detectHostility (20-01) over studentMessages inside extractDisengagementSignals, never a new parallel lexicon."
    - "Streak-from-the-end accumulation curve (stonewallingStreak, mirrors hostility's /3 curve with its own /4 divisor): the MOST RECENT consecutive matching turns count, so one substantive reply resets the going-forward count, but the ratchet (via computeDisengagementOverTranscript's priorValue threading) still prevents an earlier streak's pressure from being erased."
    - "Carry-forward boolean across the replay loop: `severe` is threaded exactly like `priorValue` (OR'd across every prefix), not recomputed from only the final prefix, so a severe turn 1 can never be erased by benign turns that follow."

key-files:
  created: []
  modified:
    - lib/engine/disengagement.ts
    - lib/engine/types.ts
    - components/practice/report/DisengagementDeclinePanel.tsx
    - scripts/verify-disengagement.ts

key-decisions:
  - "AMENDMENT (user, 2026-10-08) implemented: 20-01's 0.425 measurement stands, but its conclusion ('no new signal needed') is reversed. A new `stonewalling` cause was added to the cause vocabulary (not to detectHostility's tiers — tier:\"none\" for stonewalling text stays correct) so sustained pure refusal can cross a type's threshold on its own, which Phase 18's `repeated_response`/`short_response_streak`/`turn_count_pressure` (0.35-0.45 combined) deliberately cannot."
  - "Test-only weight profile (PHASE_20_TEST_WEIGHTS in scripts/verify-disengagement.ts) is PROVISIONAL UNTIL CALIBRATED, evidence named as this plan's own fixtures only: budgetPressure 0, turnCountPressure 0, repeatedResponse 0, shortResponseStreak 0.05, noCommonGround 0.1, positionUnacknowledged 0.15, hostility 0.4, severeContent 0, stonewalling 0.3 — sums to exactly 1.0 (asserted). This is NOT the difficult-conversation type's actual declared profile; 20-03 owns setting that on the type record and may choose different numbers, subject to the same amendment constraints (stonewalling-alone-crosses, hostility-at-least-as-fast)."
  - "HOSTILITY_ACCUMULATION_TURNS = 3 (plan-specified) and STONEWALLING_ACCUMULATION_TURNS = 4 (this plan's choice, tuned empirically against the fixtures below) are both PROVISIONAL UNTIL CALIBRATED."
  - "severeContent stays weight-0 even in the test profile: severe content's floor-override carve-out is a SEPARATE mechanism (20-04's job in resolveTermination), not folded into this weighted accumulation — CONTEXT.md's 'Severe content OVERRIDES avatarEndFloor' carve-out."
  - "DisengagementWeights widened from the plan's literal `typeof DEFAULT_DISENGAGEMENT_WEIGHTS` to `Record<keyof typeof DEFAULT_DISENGAGEMENT_WEIGHTS, number>` — the exact-literal-union type made a Partial<DisengagementWeights> override reject ordinary numbers (TS2322), which would make the whole opt-in mechanism unusable by any caller supplying a value Phase 18 did not already use."
  - "Real-caller contract satisfied via computeDisengagementOverTranscript itself (the exact function lib/engine/session.ts's deriveFinishDisengagement and app/api/interaction/chat/route.ts call), not via computeDisengagement with a manually-threaded priorValue — this plan's ratchet/negative-control sections (8, 9, 10) all replay through computeDisengagementOverTranscript, mirroring Phase 18's own Section 6 pattern, so the Phase 18 integration-seam lesson (contract proven in the unit, unenforced at the real caller) does not recur here."
  - "Did NOT wire session.ts / chat/route.ts to pass a type's disengagementWeights through yet — this plan's files_modified scope is the engine signal vocabulary and the opt-in mechanism itself; threading an actual non-default profile from a resolved type's terminationPolicy into those two real callers is 20-03's job once it declares the difficult-conversation type's own weights."
  - "'In one run' (amendment constraint 5) interpreted as one verification pass of this plan, not a shared import: scripts/verify-hostility-detector.ts's 24-row FIRM_NOT_HOSTILE corpus is run unmodified and separately from scripts/verify-disengagement.ts's new stonewalling-crosses-alone section, preserving 20-01's explicit 'do not import the corpus, so the two batteries stay independently runnable' precedent. Both exit 0 in the same verification pass (see Verification below)."

patterns-established:
  - "A type-level signal opt-in (disengagementWeights) composes with Phase 18's existing threshold opt-in (disengagementThreshold) without either one implying the other — a type could in principle set a threshold with default weights, or declare weights while threshold stays null (no-op, since computeDisengagement never crosses without an effective threshold)."

requirements-completed: [REQ-96, REQ-98, REQ-99]

# Metrics
duration: 50min
completed: 2026-10-08
---

# Phase 20 Plan 02: Hostility, Severe Content, Acknowledgement Absence and the Stonewalling Amendment Summary

**`lib/engine/disengagement.ts` gained four new observable causes (hostility, severe_content, position_unacknowledged, and the amendment-driven stonewalling) behind a per-type weight-profile opt-in, with a fixture proving sustained pure stonewalling now crosses a 0.6 threshold on its own while hostility still crosses at least as fast — reversing 20-01's "no new signal needed" conclusion without touching its 0.425 measurement.**

## Performance

- **Duration:** ~50 min
- **Tasks:** 2 (2 planned, both complete; amendment work folded into Task 1/2 rather than a separate task)
- **Files modified:** 4 (all four named in the plan's frontmatter `files_modified`)

## Accomplishments

- Extended `DISENGAGEMENT_CAUSES` with four appended (never reordered) entries — `hostility`, `severe_content`, `position_unacknowledged`, and the amendment's `stonewalling` — every one weight-0 in `DEFAULT_DISENGAGEMENT_WEIGHTS`, proven byte-identical by re-running all four Phase 18 verifiers (`verify-disengagement.ts`, `verify-disengagement-termination.ts`, `verify-disengagement-report.ts`, `verify-disengagement-walkout-shell.ts`) unmodified before adding any new section, and all four still exit 0 with their pre-existing output unchanged.
- `extractDisengagementSignals` derives `hostileTurnCount`/`severeContent` by calling 20-01's `detectHostility` over student text only (never assistant prose, never the avatar's cue), and a new `stonewallingStreak` via a narrow, self-contained refusal-to-engage pattern (`STONEWALLING_PATTERN`) modeled on `hostility.ts`'s lexicon style, deliberately excluding substantive refusals like "No. I am not taking that on" (ask-for-raise's own FIRM_NOT_HOSTILE register) that argue a position rather than refuse to engage with one.
- `deriveAcknowledgementAbsent` is `deriveCommonGroundAbsent`'s exact shape (`assistantTurnCount >= 2` and no matching user turn), documented as Phase 15's `empathy` dimension's live twin, and applied per prefix by `computeDisengagementOverTranscript` so an early absence ratchets rather than being erased by one later acknowledging turn.
- `computeDisengagement`/`computeDisengagementOverTranscript` both accept an optional `weights` parameter, resolved as `{ ...DEFAULT_DISENGAGEMENT_WEIGHTS, ...(weights ?? {}) }`; `severe` is carried forward across the replay loop exactly like `priorValue`, so a severe turn 1 cannot be erased by benign turns that follow.
- `TerminationPolicyConfig` gained `disengagementWeights?: Partial<DisengagementWeights> | null` and `avatarEndReasonByCause?: Partial<Record<DisengagementCause, string>> | null`, imported as type-only from `./disengagement` with no cycle issue (confirmed by `tsc --noEmit`).
- `DisengagementDeclinePanel.tsx`'s `CAUSE_LABELS` covers all four new causes in the plan's exact observable, non-accusatory register (plus one new label for `stonewalling`, not specified by the plan since it predates the amendment).
- **The amendment's two required facts proven in one script run** (`scripts/verify-disengagement.ts` sections 14-15): a sustained six-line pure-stonewalling transcript crosses 0.6 (value `0.6000000000000001`, `dominantCauses` includes `stonewalling`, and `hostileTurnCount === 0` confirming no misclassification), and a four-line sustained-hostility transcript crosses at the SAME turn count (turn 4) under the identical test weight profile — "at least as fast," never slower.
- 20-01's `scripts/verify-hostility-detector.ts` (24-row `FIRM_NOT_HOSTILE` corpus included) was re-run unmodified and exits 0 in the same verification pass as the stonewalling-crosses-alone proof, satisfying amendment constraint 5 without importing the corpus (preserving 20-01's "independently runnable" precedent).

## Task Commits

1. **Task 1: New causes, the weight profile field, and the acknowledgement derivation** - `aca28eb` (feat)
2. **Task 2: Prove accumulation, the one-way ratchet under hostility, and unchanged defaults (+ amendment sections)** - `866a1f1` (test)

**Plan metadata:** (this commit)

## Files Created/Modified

- `lib/engine/disengagement.ts` — four new causes, `DisengagementWeights` type, `STONEWALLING_PATTERN`/`stonewallingStreak`, `deriveAcknowledgementAbsent`, `weights` parameter on both compute functions, `severe` carried across the replay.
- `lib/engine/types.ts` — `disengagementWeights` and `avatarEndReasonByCause` on `TerminationPolicyConfig`.
- `components/practice/report/DisengagementDeclinePanel.tsx` — `CAUSE_LABELS` extended to all nine causes.
- `scripts/verify-disengagement.ts` — 454 lines appended (sections 7-15); zero existing lines edited or deleted (confirmed by `git diff` showing 454 insertions, 0 deletions).

## Decisions Made

See `key-decisions` in frontmatter. In addition:

- The test-only weight profile numbers (`0.4` hostility, `0.3` stonewalling, etc.) were tuned empirically against this plan's own two fixtures (a scratch script, not committed) rather than derived analytically, matching `12-TUNING.md`'s precedent of recording evidence rather than implying calibration. They are explicitly NOT the difficult-conversation type's actual profile.
- Chose to keep `severeContent` at weight 0 even in the test profile rather than giving it a nominal non-zero value, since this plan's `computeDisengagement` contribution for severe content is a separate, additive term from the floor-override carve-out 20-04 owns, and giving it a non-zero weight here would conflate two distinct amendment-driven mechanisms without adding test value.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `DisengagementWeights` type too narrow for a Partial override**
- **Found during:** Task 2, first `tsc --noEmit` after adding the test weight profile
- **Issue:** The plan specified `export type DisengagementWeights = typeof DEFAULT_DISENGAGEMENT_WEIGHTS;` — but because `DEFAULT_DISENGAGEMENT_WEIGHTS` is declared `as const`, this makes each key an exact numeric literal type (e.g. `hostility: 0`). A `Partial<DisengagementWeights>` built this way rejects any OTHER number (`TS2322: Type '0.4' is not assignable to type '0'`), making the whole per-type override mechanism this plan exists to deliver unusable by any caller.
- **Fix:** Widened to `export type DisengagementWeights = Record<keyof typeof DEFAULT_DISENGAGEMENT_WEIGHTS, number>;` — same key set, ordinary `number` values.
- **Files modified:** `lib/engine/disengagement.ts`
- **Verification:** `npx tsc --noEmit --pretty false` clean; `scripts/verify-disengagement.ts` section 13 ("A weight profile sums as declared") exercises a non-default profile end to end.
- **Committed in:** `866a1f1` (part of Task 2 commit)

**2. [Rule 3 - Blocking] eslint formatting warnings on all four touched files**
- **Found during:** Task 2, post-implementation lint pass
- **Issue:** `npx eslint` (scoped to the four touched files, never the bare `npm run lint`) reported 12 warnings (0 errors) — import-order and prettier spacing only.
- **Fix:** Ran `npx eslint --fix` scoped to the same four files.
- **Files modified:** `lib/engine/disengagement.ts`, `lib/engine/types.ts`, `components/practice/report/DisengagementDeclinePanel.tsx`
- **Verification:** Re-ran `npx eslint` on the four files — zero warnings/errors; `npx tsc --noEmit` and `npx tsx scripts/verify-disengagement.ts` both still pass after the fix.
- **Committed in:** `866a1f1` (folded into the Task 2 commit since it landed between the two task commits)

---

**Total deviations:** 2 auto-fixed (1 blocking type-widening, 1 blocking lint). Both scoped to files already in this plan's `files_modified`. No scope creep.

## Issues Encountered

None beyond the two deviations above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `lib/engine/disengagement.ts` now exposes the full observable cause vocabulary (nine causes) and the per-type `weights` opt-in that 20-03's `difficult-conversation` type record needs to declare its actual profile — subject to the same amendment constraints this plan proved satisfiable (stonewalling-alone-crosses, hostility-at-least-as-fast, explicit arithmetic).
- 20-03 (and the real callers in `lib/engine/session.ts` / `app/api/interaction/chat/route.ts`) still need to THREAD a resolved type's `disengagementWeights` into the `computeDisengagementOverTranscript` calls those files already make — this plan proved the mechanism works but deliberately did not touch either caller file (outside `files_modified`), leaving that wiring for 20-03 (or whichever plan sets the DC type's non-default weights).
- 20-04's severe-content floor-override carve-out has a clean `severe: boolean` field on `DisengagementComputeResult` to read, independent of any weight.
- 20-01's `detectHostility` tier assignments are confirmed UNCHANGED by this plan (section 14's explicit `hostileTurnCount === 0` assertion on the stonewalling fixture) — the amendment's constraint 4 ("tier: 'none' for stonewalling is still correct") holds.

## Verification

- `npx tsx scripts/verify-disengagement.ts` — exit 0, ALL PASS (15 sections, including the 9 new ones).
- `npx tsx scripts/verify-disengagement-termination.ts` — exit 0, ALL PASS, unchanged.
- `npx tsx scripts/verify-disengagement-walkout-shell.ts` — exit 0, ALL PASS, unchanged.
- `npx tsx scripts/verify-disengagement-report.ts` — exit 0, ALL PASS, unchanged.
- `npx tsx scripts/verify-hostility-detector.ts` — exit 0, ALL PASS, unmodified — run in the same verification pass as the above, satisfying amendment constraint 5.
- `npx tsc --noEmit --pretty false` — exit 0, clean.
- `npx tsx scripts/verify-pitch-types.ts` — exactly 1 pre-existing failure (Phase 18's known `18-PITCH-TYPES-REGRESSION.md` ELEVATOR issue), unchanged.
- `grep -n "hostility: 0" lib/engine/disengagement.ts` — matches (the shared default stays off).
- `git diff scripts/verify-disengagement.ts` — 454 insertions, 0 deletions.

---
*Phase: 20-difficult-conversation-walk-outs*
*Completed: 2026-10-08*

## Self-Check: PASSED

- FOUND: `lib/engine/disengagement.ts`
- FOUND: `lib/engine/types.ts`
- FOUND: `components/practice/report/DisengagementDeclinePanel.tsx`
- FOUND: `scripts/verify-disengagement.ts`
- FOUND: commit `aca28eb` (Task 1)
- FOUND: commit `866a1f1` (Task 2)
