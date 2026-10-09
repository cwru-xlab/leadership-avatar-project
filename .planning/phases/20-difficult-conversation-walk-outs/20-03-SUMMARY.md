---
phase: 20-difficult-conversation-walk-outs
plan: 03
subsystem: engine
tags: [difficult-conversation, disengagement, termination-policy, weight-profile, type-level-config]

# Dependency graph
requires:
  - phase: 20-difficult-conversation-walk-outs
    provides: "20-02's disengagementWeights opt-in mechanism, the nine-cause vocabulary (including the amendment's stonewalling cause), and avatarEndReasonByCause plumbing on TerminationPolicyConfig"
provides:
  - "lib/difficult-conversation/conversation-type.ts — CONVERSATION_DISENGAGEMENT_THRESHOLD (0.6), the type's own disengagementWeights profile (real stonewalling headroom), offensive_content appended to avatarEndReasons, avatarEndReasonByCause"
  - "scripts/verify-dc-surface-count.ts Section 11 — mechanical guard proving one type-level threshold, inheritance by all seven seeded conversations, absence of any per-scenario threshold surface, the weight-sum invariant, and no difficulty modulation"
  - "scripts/verify-disengagement.ts — the epsilon-margin fix (20-EPSILON-MARGIN.md): both the stonewalling and sustained-hostility fixtures now cross 0.6 by an explicit, asserted 0.05 margin instead of a float hair"
affects: [20-04, 20-05, 20-06, 20-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Type-level weight profile declared inline on TerminationPolicyConfig with its arithmetic spelled out as a comment (sum excluding maxCueAcceleration), so a reviewer can check it without running anything — mirrors 20-02's test-profile convention, now at the production type."
    - "Crossing-margin assertions (`value - threshold >= REAL_CROSSING_MARGIN`) added alongside existing boolean `crossed` checks, so a float-fragile exact-threshold landing fails loudly as a margin regression rather than reading as a silent tuning drift."

key-files:
  created: []
  modified:
    - lib/difficult-conversation/conversation-type.ts
    - scripts/verify-dc-surface-count.ts
    - scripts/verify-disengagement.ts
    - scripts/verify-dc-type.ts

key-decisions:
  - "Assigned defect fixed in scripts/verify-disengagement.ts (20-02's file, authorized for this defect): PHASE_20_TEST_WEIGHTS rebalanced from {shortResponseStreak 0.05, noCommonGround 0.1, positionUnacknowledged 0.15, hostility 0.4, stonewalling 0.3} (summed its contributing causes to EXACTLY 0.6, producing the 1e-16-margin crossing) to {shortResponseStreak 0, noCommonGround 0.15, positionUnacknowledged 0.15, hostility 0.35, stonewalling 0.35}. ACHIEVED MARGIN: 0.05 (printed value 0.6499999999999999, i.e. ~2.3e14x the ~2.2e-16 machine epsilon at this magnitude) for BOTH the stonewalling fixture and the sustained-hostility fixture, each crossing at turn 4. Explicit `>= 0.01` margin assertions added to Sections 14 and 15 (assertion count 4->5 and 2->3 respectively, both higher, both still pass)."
  - "The DC type's OWN disengagementWeights profile deviates from the plan's literally-specified 8-key object (hostility 0.5, no stonewalling override) — see Deviations below. This was necessary because the plan's exact numbers, if implemented verbatim, would leave stonewalling at the shared DEFAULT_DISENGAGEMENT_WEIGHTS value of 0 in PRODUCTION, meaning pure stonewalling could never cross the type's real threshold even though 20-02 proved the mechanism works in its own test fixture. The 2026-10-08 amendment to 20-CONTEXT.md is explicit that 20-03 owns wiring this into the type that real sessions resolve."
  - "Final DC production weights: budgetPressure 0 (timeBudget.totalSeconds is null), turnCountPressure 0, repeatedResponse 0, shortResponseStreak 0.05, noCommonGround 0.05, hostility 0.35 (the single largest weight), positionUnacknowledged 0.25, severeContent 0 (floor carve-out, not a weight), stonewalling 0.3. Sum = 1.0 (asserted mechanically in verify-dc-surface-count.ts Section 11e). Chosen by empirical search (scratch probes, not committed) against the STONEWALL_LINES / SUSTAINED_HOSTILE_LINES fixture registers at threshold 0.6: both fixtures cross at turn 4 with a 0.05 margin, and hostility crosses at or before the turn stonewalling needs (4 <= 4), matching the amendment's constraint 2. PROVISIONAL UNTIL CALIBRATED — the only evidence is this fixture arithmetic, named in the type record's own comment."
  - "avatarEndReasonByCause maps stonewalling -> \"nothing_left_to_discuss\" (not a distinct reason) — stonewalling is a disengagement CAUSE, not a severe category; only severe_content maps to the new offensive_content reason (REQ-101)."
  - "scripts/verify-dc-type.ts Section 7 (pre-existing, Phase 15's file, not in this plan's files_modified) needed a fix as a direct, unavoidable consequence of declaring a real disengagementThreshold: resolveTermination's gate 4 (lib/engine/termination.ts, read-only for this plan) now fails closed without a supplied disengagementValue. Updated the ACCEPTED fixture to supply one and added an explicit new negative case proving the fail-closed behavior — documented as a Rule 3 (blocking) deviation."
  - "verify-dc-surface-count.ts Section 11(d)'s per-scenario-surface regex was narrowed from the task's literally-specified bare /disengagement|threshold/i to a field-shaped /\\b(disengagement\\w*|threshold|walkOut|walk_out|patience)\\s*[:=]/i, because the loose version false-failed on lib/difficult-conversation/seeded.ts's flavor text (\"a scholarship threshold.\") which contains the English word with no field anywhere nearby. Rule 1 (bug) fix to the guard itself, scoped to this plan's own new section."

requirements-completed: [REQ-95, REQ-101, P20-SC1, P20-SC4]

# Metrics
duration: 70min
completed: 2026-10-08
---

# Phase 20 Plan 03: Type-Level Threshold, Weight Profile, Severe Reason, and the Epsilon-Margin Fix Summary

**The difficult-conversation type now declares one inherited disengagement threshold (0.6) and its own weight profile with real stonewalling headroom (0.05 margin, not a floating-point hair), plus the `offensive_content` severe-category avatar-end reason — guarded mechanically against any future per-scenario threshold surface.**

## Performance

- **Duration:** ~70 min
- **Tasks:** 2 planned (both complete) + 1 assigned defect fix (epsilon margin)
- **Files modified:** 4 (`lib/difficult-conversation/conversation-type.ts`, `scripts/verify-dc-surface-count.ts` — both in `files_modified`; `scripts/verify-disengagement.ts`, `scripts/verify-dc-type.ts` — both disclosed deviations)

## Accomplishments

- **Assigned defect fixed first** (20-EPSILON-MARGIN.md): `scripts/verify-disengagement.ts`'s `PHASE_20_TEST_WEIGHTS` rebalanced so the sustained-pure-stonewalling fixture and the sustained-hostility fixture both clear the 0.6 threshold by a **0.05 margin** (printed `0.6499999999999999`), not the prior 1e-16 float hair (`0.6000000000000001`). Explicit `>= 0.01` margin assertions added to Sections 14 and 15 — assertion counts went 4→5 and 2→3 respectively (both higher, both still pass). `scripts/verify-hostility-detector.ts`'s unmodified 24-row `FIRM_NOT_HOSTILE` corpus re-run in the same pass, unaffected.
- `lib/difficult-conversation/conversation-type.ts` gained `CONVERSATION_DISENGAGEMENT_THRESHOLD = 0.6` (PROVISIONAL UNTIL CALIBRATED), a `disengagementWeights` profile declared on `terminationPolicy` with its arithmetic spelled out in a comment, `offensive_content` appended to `avatarEndReasons`, and `avatarEndReasonByCause` mapping every observable cause to the closed reason vocabulary.
- `postProcessScores` stays absent with its original comment intact; `severeContent` stays weight-0 with its carve-out comment; `avatarEndFloor: { minAssistantTurns: 4 }` is unchanged except for one added clarifying line.
- `scripts/verify-dc-surface-count.ts` gained Section 11 (additive; Sections 1–10 untouched): proves exactly one declared threshold, inheritance by all seven seeded conversations through `resolveSessionConfig`, the absence of any threshold-shaped field on `DifficultConversationRecord`, the absence of any per-scenario threshold surface in `lib/difficult-conversation/` (two legitimate exceptions) or in any authoring route/component importing `DifficultConversationRecord`, the weight-sum invariant, and that none of the three `DifficultyBand` values modulates the resolved threshold.
- **Negative-tested per the plan**: temporarily added `disengagementThreshold?: number` to `DifficultConversationRecord`, re-ran the guard, confirmed Section 11(c) **FAILS** and names the exact offending line (`disengagementThreshold?: number;`), then reverted (`git diff` clean, `tsc` clean).

## Task Commits

0. **Assigned defect: give stonewalling and hostility crossings real margin** - `a9125d7` (fix)
1. **Task 1: Declare the threshold, weight profile and reason vocabulary** - `940c287` (feat)
2. **Task 2: Guard that the threshold stays type-level** - `0a52fe4` (test)

**Plan metadata:** (this commit)

## Files Created/Modified

- `lib/difficult-conversation/conversation-type.ts` — `CONVERSATION_DISENGAGEMENT_THRESHOLD`, `disengagementWeights`, `offensive_content`, `avatarEndReasonByCause`.
- `scripts/verify-dc-surface-count.ts` — Section 11 (one type-level threshold, no per-scenario surface).
- `scripts/verify-disengagement.ts` (20-02's file, authorized for this defect) — rebalanced `PHASE_20_TEST_WEIGHTS`, added margin assertions to Sections 14–15.
- `scripts/verify-dc-type.ts` (pre-existing Phase 15 file, not in `files_modified`) — Section 7 fixture updated to supply `disengagementValue`; new negative case added.

## Decisions Made

See `key-decisions` in frontmatter for the full arithmetic and rationale. In short: the DC type's production weight profile had to include a real, non-zero `stonewalling` weight — deviating from the plan's literally-specified numbers — because the amendment's core behavior (sustained pure stonewalling must end a session alone) is only real at the type a session actually resolves, not merely in 20-02's test fixture.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] DC type's weight profile omitted a stonewalling weight**
- **Found during:** Task 1, while transcribing the plan's literal 8-key `disengagementWeights` object
- **Issue:** The plan's exact numbers (`hostility: 0.5`, no `stonewalling` key) would leave `stonewalling` at the shared `DEFAULT_DISENGAGEMENT_WEIGHTS` value of 0 for the actual production type. The 2026-10-08 amendment to `20-CONTEXT.md` requires sustained pure stonewalling to cross the threshold ALONE in real sessions, and explicitly assigns that wiring to 20-03 ("20-03 ... still needs to THREAD a resolved type's disengagementWeights ... once it declares the difficult-conversation type's own weights" — 20-02-SUMMARY.md). Implementing the plan verbatim would have silently left the amendment unimplemented in production.
- **Fix:** Rebalanced the type's weights (see key-decisions) to `hostility: 0.35, stonewalling: 0.3, positionUnacknowledged: 0.25, noCommonGround: 0.05, shortResponseStreak: 0.05`, sum 1.0, chosen so both the stonewalling and sustained-hostility fixture registers cross 0.6 at turn 4 with a 0.05 margin, hostility at or before stonewalling's turn.
- **Files modified:** `lib/difficult-conversation/conversation-type.ts`
- **Verification:** Empirical probe against `STONEWALL_LINES` / `SUSTAINED_HOSTILE_LINES` registers (scratch script, not committed); `scripts/verify-dc-surface-count.ts` Section 11(e) asserts the sum; `scripts/verify-dc-type.ts` and `verify-pitch-types.ts` unaffected.
- **Committed in:** `940c287` (Task 1 commit)

**2. [Rule 3 - Blocking] verify-dc-type.ts Section 7 failed after the threshold was declared**
- **Found during:** Task 1's own verification step (`npx tsx scripts/verify-dc-type.ts`)
- **Issue:** `resolveTermination`'s gate 4 (`lib/engine/termination.ts`) fails closed when a policy has a `disengagementThreshold` but no `disengagementValue` is supplied. The pre-existing "ACCEPTED" fixture in Section 7 never supplied one, because before this plan the type had no threshold at all.
- **Fix:** Supplied `disengagementValue: policy.disengagementThreshold` to the ACCEPTED fixture; added a new negative case proving the fail-closed rejection when evidence is omitted.
- **Files modified:** `scripts/verify-dc-type.ts`
- **Verification:** `npx tsx scripts/verify-dc-type.ts` exits 0, ALL PASS.
- **Committed in:** `940c287` (Task 1 commit)

**3. [Rule 1 - Bug] Section 11(d)'s surface regex false-failed on prose**
- **Found during:** Task 2's own verification step
- **Issue:** The task's literally-specified bare `/disengagement|threshold/i` matched `lib/difficult-conversation/seeded.ts`'s flavor text ("a scholarship threshold.") — an English-word coincidence, not a surface.
- **Fix:** Narrowed to a field-shaped regex requiring a trailing `:` or `=` (`/\b(disengagement\w*|threshold|walkOut|walk_out|patience)\s*[:=]/i`).
- **Files modified:** `scripts/verify-dc-surface-count.ts`
- **Verification:** All eleven sections pass; negative test (adding a real field) still fails correctly (Section 11c, which is unaffected by this regex).
- **Committed in:** `0a52fe4` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 missing-critical / amendment-compliance, 1 blocking, 1 bug-in-own-guard). Deviation 1 touched `scripts/verify-disengagement.ts` and `scripts/verify-dc-type.ts`, both outside this plan's declared `files_modified` — the former explicitly authorized by the assigned defect for this plan, the latter an unavoidable, directly-caused consequence of Task 1's own change, disclosed here.
**Impact on plan:** All three were necessary for correctness (amendment compliance) or to keep the plan's own stated verification steps green. No scope creep into 20-04/20-06's files (neither was touched).

## Issues Encountered

None beyond the three deviations above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 20-04 (`lib/engine/termination.ts`'s `resolveTermination` severe-content floor-override carve-out) can read `severeContent: 0` on the DC type's weight profile and the new `offensive_content` reason / `avatarEndReasonByCause.severe_content` mapping directly.
- 20-05/20-06 can rely on `avatarEndReasonByCause` being fully populated for every `DisengagementCause` (including `stonewalling` → `nothing_left_to_discuss`), so no magic string needs to cross the report layering.
- The weight profile, threshold, and `STONEWALLING_ACCUMULATION_TURNS`/`HOSTILITY_ACCUMULATION_TURNS` constants (20-02's file, unchanged) all remain PROVISIONAL UNTIL CALIBRATED — 20-07's human adversarial UAT (gated behind Phase 18's 18-05 per the locked gating decision) is the next point real evidence could inform recalibration, which Phase 18's policy requires explicit human approval for.
- `scripts/verify-dc-type.ts`'s Section 7 now documents the real `resolveTermination` contract for this type (evidence required once a threshold exists) — any future plan wiring the chat route / finish re-derivation to this type's `disengagementWeights` (per 20-02-SUMMARY.md's "Next Phase Readiness") should supply the real computed `disengagementValue`, not omit it.

## Verification

- `npx tsc --noEmit --pretty false` — exit 0, clean.
- `npx tsx scripts/verify-disengagement.ts` — exit 0, ALL PASS (15 sections; Sections 14-15 now carry explicit margin assertions).
- `npx tsx scripts/verify-hostility-detector.ts` — exit 0, ALL PASS, unmodified, 24-row corpus intact.
- `npx tsx scripts/verify-dc-type.ts` — exit 0, ALL PASS.
- `npx tsx scripts/verify-dc-surface-count.ts` — exit 0, ALL ELEVEN SECTIONS PASSED.
- `npx tsx scripts/verify-dc-report.ts` — exit 0, all eight sections passed.
- `npx tsx scripts/verify-dc-seeded.ts`, `verify-dc-prepublish.ts`, `verify-dc-routes.ts`, `verify-dc-store.ts`, `verify-dc-engine-extensions.ts`, `verify-dc-prompt-safety.ts` — all exit 0, unaffected.
- `npx tsx scripts/verify-pitch-types.ts` — exactly 1 pre-existing failure (Phase 18's known elevator+deck regression), unchanged.
- `grep -rn "disengagementThreshold" lib/difficult-conversation/` — matches `conversation-type.ts` only.
- Negative test: adding `disengagementThreshold?: number` to `DifficultConversationRecord` makes Section 11(c) FAIL by name; reverted, confirmed clean diff.

---
*Phase: 20-difficult-conversation-walk-outs*
*Completed: 2026-10-08*

## Self-Check: PASSED

- FOUND: `lib/difficult-conversation/conversation-type.ts`
- FOUND: `scripts/verify-dc-surface-count.ts`
- FOUND: `scripts/verify-disengagement.ts`
- FOUND: `scripts/verify-dc-type.ts`
- FOUND: commit `a9125d7` (assigned-defect fix)
- FOUND: commit `940c287` (Task 1)
- FOUND: commit `0a52fe4` (Task 2)
