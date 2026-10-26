---
phase: 20-difficult-conversation-walk-outs
plan: 04
subsystem: engine
tags: [difficult-conversation, disengagement, termination-policy, severe-content, phase-18-amendment]

# Dependency graph
requires:
  - phase: 20-difficult-conversation-walk-outs
    provides: "20-03's CONVERSATION_DISENGAGEMENT_THRESHOLD, disengagementWeights profile, offensive_content reason, and avatarEndReasonByCause map on DIFFICULT_CONVERSATION_TYPE"
provides:
  - "lib/engine/termination.ts — resolveTermination's optional severeContent carve-out (skips ONLY gate 3, the avatarEndFloor) and the new resolveWalkOutReason function"
  - "scripts/verify-disengagement-termination.ts Section 5 — the carve-out, its narrowness, the floor's survival for every other trigger, and the reason mapping, proved against the real DIFFICULT_CONVERSATION_TYPE and PITCH_ELEVATOR_TYPE records"
  - "The explicit Phase 18 Success Criterion 5 amendment wording, for 20-07 to collect as the Phase 18 revision handoff"
affects: [20-05, 20-06, 20-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Gate-level carve-out, not a type-level opt-in: severeContent is a parameter on resolveTermination itself, defaulting to false, that skips exactly one gate (the floor). It is global to the function, not scoped by slug — narrowness comes from caller discipline (only the difficult-conversation signal path ever sets it true), not from a per-type declaration. Documented explicitly in the verifier because it changes what a naive 'other types are unaffected' deep-equal test can honestly assert."
    - "Reason resolution as a pure, order-independent lookup (resolveWalkOutReason): severe content takes precedence over dominantCauses, every returned value is validated against avatarEndReasons before being returned, and an unmapped/undeclared result is null rather than thrown — mirrors the resolveTermination fail-closed convention."

key-files:
  created: []
  modified:
    - lib/engine/termination.ts
    - scripts/verify-disengagement-termination.ts

key-decisions:
  - "The severe-content carve-out is implemented as a gate-level skip inside resolveTermination (floor != null && !severeContent), exactly as the plan's literal code sample specified. This means the carve-out is NOT type-gated — any caller that passes severeContent: true skips the floor for ANY policy, not only difficult-conversation's. The narrowness guarantee is behavioral (only 20-05/20-06's difficult-conversation signal path will ever construct a severeContent: true call), not structural. This is disclosed as a deviation below because the plan's Task 2(d) literally asked for a floor-level deep-equal between an elevator call with and without severeContent at a sub-floor turn count, which is NOT true under this design (the elevator's floor would also be skipped) — the test was adapted to assert two things that ARE true instead: severeContent cannot rescue a reason the elevator never declared (gate 2 is unaffected), and severeContent is a no-op once the elevator's own floor and threshold already pass on their own."
  - "resolveWalkOutReason's dominantCauses parameter is typed `readonly DisengagementCause[]` rather than the plan's literal `readonly string[]` — tighter than specified, still structurally compatible with every real caller (computeDisengagement's dominantCauses field), and catches a typo'd cause name at compile time rather than silently returning null at runtime."

requirements-completed: [REQ-100, REQ-101, P20-SC3, P20-SC4]

# Metrics
duration: 45min
completed: 2026-10-09
---

# Phase 20 Plan 04: Severe-Content Floor Carve-Out and Reason Resolver Summary

**`resolveTermination` gains a named, enumerated severe-content carve-out that skips only Phase 18's avatar-end floor (never the reason-vocabulary, avatarMayEnd, or disengagement-threshold gates), plus `resolveWalkOutReason` to derive a walk-out's recorded reason deterministically from the dominant observable cause — both proved against the real `DIFFICULT_CONVERSATION_TYPE` and `PITCH_ELEVATOR_TYPE` records in a new, purely-additive verifier section (check( count 16 → 32).**

## Performance

- **Duration:** ~45 min
- **Tasks:** 2 planned, both complete
- **Files modified:** 2 (`lib/engine/termination.ts`, `scripts/verify-disengagement-termination.ts`), both declared in `files_modified`

## Accomplishments

- `resolveTermination` gained an optional `severeContent?: boolean` parameter (default `false`), with gate (3) amended to `if (floor != null && !severeContent)` — the ONLY gate touched. Gates (1) `avatarMayEnd`, (2) the closed reason vocabulary, and (4) the disengagement-threshold check are all unchanged and still apply in full when `severeContent` is true. The carve-out and its rationale are documented in a named block comment at gate (3) referencing Phase 18 Success Criterion 5 and REQ-100.
- `resolveWalkOutReason` added below `resolveTermination`: looks up `policy.avatarEndReasonByCause`, prefers `severe_content` when `severe` is true, otherwise walks `dominantCauses` in contribution order, and returns a value only if it is a declared member of `policy.avatarEndReasons` — otherwise `null`. Pure, no I/O.
- `scripts/verify-disengagement-termination.ts` gained a new, final Section 5 ("Difficult-conversation floor, severe carve-out and reason mapping") — purely additive; the only change to Sections 1-4 is the import statement growing to add `resolveWalkOutReason` and the `DIFFICULT_CONVERSATION_TYPE` / `CONVERSATION_DISENGAGEMENT_THRESHOLD` imports. `check(` call count: **16 → 32** (16 new assertions, zero removed).
- Section 5 opens with a block comment recording the Phase 18 SC5 amendment in the file's own text (see "Phase 18 SC5 Amendment" below), then proves: the floor still rejects an ordinary trigger at turn counts 0-3 and accepts at turn 4 (the unchanged half of SC5, re-proven against difficult-conversation); the carve-out fires only when `severeContent: true` (the INVERTED assertion); the carve-out skips the floor and nothing else (three negative rows: undeclared reason, below-threshold value, `avatarMayEnd: false`, all still rejected with `severeContent: true`); pitch-elevator's gate 2 and ordinary-pass path are unaffected by the new argument; and `resolveWalkOutReason`'s full mapping (severe → `offensive_content`, hostility → `escalated`, `repeated_response`/`short_response_streak` → `nothing_left_to_discuss`, no map → `null`, uncovered cause → `null`), plus a guard that every `avatarEndReasonByCause` value in the real type stays a member of `avatarEndReasons`.

## Task Commits

1. **Task 1: The named severe-content carve-out and the cause→reason resolver** - `709f2dc` (feat)
2. **Task 2: Amend the termination verifier deliberately, additively, and against the real type** - `1b21b31` (test)

**Plan metadata:** (this commit)

## Files Created/Modified

- `lib/engine/termination.ts` — `severeContent` carve-out on `resolveTermination` (gate 3 only), `resolveWalkOutReason` function.
- `scripts/verify-disengagement-termination.ts` — Section 5 (16 new assertions), import additions for `resolveWalkOutReason`, `DIFFICULT_CONVERSATION_TYPE`, `CONVERSATION_DISENGAGEMENT_THRESHOLD`.

## Phase 18 SC5 Amendment (for 20-07's handoff)

**Exact wording, recorded in `lib/engine/termination.ts`'s gate-3 comment and `scripts/verify-disengagement-termination.ts`'s Section 5 header:**

> Phase 18 Success Criterion 5 read: "a walk-out can never fire before a type's `avatarEndFloor` minimum turns." It now reads: "...except for the named severe-content carve-out in `resolveTermination`." Severe content — slurs, harassment, and threats aimed at the person — ends the session regardless of `avatarEndFloor`. This is a deliberate, enumerated exception (REQ-100), not an incidental bypass. The floor is NOT lowered — it still governs every other trigger (ordinary hostility, stalling, stonewalling) at its declared `minAssistantTurns: 4` value for `difficult-conversation`, and unchanged for every other type.

This was declared in `20-CONTEXT.md`'s "Gating decision" block and in this plan's own frontmatter (`phase_18_amendments_declared`) before execution began, per Phases 14/15/16's precedent for Phase 13 extensions.

**Did Phase 19 edit `scripts/verify-disengagement-termination.ts` before this plan ran?** Yes. On read, Section 3's `belowFloor` fixture was already re-pointed at a locally-declared `syntheticFloorPolicy` (not `PITCH_DECK_TYPE.terminationPolicy`), Section 4's two deck assertions were already inverted to assert `avatarMayEnd: false` / no disengagement opt-in for every registered deck mode, and the import list no longer referenced `DECK_DISENGAGEMENT_THRESHOLD`. This plan's Section 5 was appended on top of that version, touching none of it, and references only `DIFFICULT_CONVERSATION_TYPE` and `PITCH_ELEVATOR_TYPE` — never `PITCH_DECK_TYPE` — per the plan's own collision-avoidance instruction.

## Decisions Made

See `key-decisions` in frontmatter. In short: the carve-out is a gate-level skip inside `resolveTermination`, not a per-type opt-in — it is global to the function and narrow only because no real call site other than difficult-conversation's signal path (20-05/20-06) will ever pass `severeContent: true`. This made the plan's literally-specified Task 2(d) elevator deep-equal assertion untrue as written (a sub-floor elevator call WITH `severeContent: true` genuinely does skip the elevator's own floor too, under this design) — the test was adapted to assert the two things about the elevator that ARE true under this design instead of a floor-level deep-equal that the design itself makes false.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug, caught before commit] Task 2(d)'s literal elevator deep-equal assertion was false under the gate-3 design the plan's own Task 1 code sample specified**
- **Found during:** Task 2, first verification run of the new Section 5 (`npx tsx scripts/verify-disengagement-termination.ts` reported 1 FAILURE on the originally-written elevator assertion)
- **Issue:** The plan's Task 2(d) asked to call `resolveTermination` on `PITCH_ELEVATOR_TYPE.terminationPolicy` with and without `severeContent: true` at a sub-floor turn count and assert the two results deep-equal. Under the gate-3 implementation Task 1 itself specifies (`if (floor != null && !severeContent)`), the carve-out is NOT scoped to any type — `severeContent: true` skips the elevator's own floor exactly as it skips difficult-conversation's. With a declared reason (`lost_interest`) and a disengagement value at or above the elevator's threshold, the un-severe call legitimately rejects on `floor-not-met` while the severe call legitimately accepts — the two results are provably NOT deep-equal, by design, for any type with a floor.
- **Fix:** Replaced the single deep-equal assertion with two narrower, true assertions that still prove "other types are unaffected by the new argument" in the senses that actually hold: (a) `severeContent` cannot rescue a reason the elevator never declared (gate 2, which the carve-out does not touch, still rejects `offensive_content` for the elevator identically with or without `severeContent`); (b) `severeContent` is a no-op once the elevator's own floor and threshold already pass without it (both calls accept identically). Documented the gate-level-vs-type-level distinction in a block comment at the assertion site so a future reader does not reintroduce the false deep-equal.
- **Files modified:** `scripts/verify-disengagement-termination.ts` (within this plan's own new Section 5, before it was ever committed)
- **Verification:** `npx tsx scripts/verify-disengagement-termination.ts` exits 0, ALL PASS, 32 `check(` calls.
- **Committed in:** `1b21b31` (Task 2 commit — the fix was made before the first and only commit of this file in this plan; no separate fix commit exists)

---

**Total deviations:** 1 auto-fixed (a bug in this plan's own in-progress test, caught by its own verification step before any commit). No scope creep — only `scripts/verify-disengagement-termination.ts` was touched, and only within the new Section 5.
**Impact on plan:** The carve-out's actual behavior (global gate-level skip, narrow by caller discipline) is unchanged from the plan's own Task 1 code sample. Only the test's framing of "elevator unaffected" was corrected to match that design honestly.

## Issues Encountered

None beyond the one deviation above.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- 20-05/20-06 can call `resolveTermination({ ..., severeContent: detectHostility(...).tier === "severe" })` for the difficult-conversation signal path and rely on the floor being skipped only for that explicit flag, with every other gate (including the disengagement threshold) still enforced.
- 20-05/20-06 can call `resolveWalkOutReason({ policy, dominantCauses, severe })` to get the queryable reason a walk-out should record, with a guaranteed fallback to `null` (today's model-marker-reason behavior) rather than a thrown error or an invented string.
- 20-07's human adversarial UAT (gated behind Phase 18's 18-05, per the locked gating decision — 18-05 is running concurrently and has already re-run this plan's file mid-flight with its own fresh results recorded in `18-VALIDATION.md`) can collect this plan's Phase 18 SC5 amendment wording verbatim as the Phase 18 revision handoff.
- The gate-level (not type-level) nature of the `severeContent` carve-out should be kept in mind by any future type that opts into `disengagementThreshold` + a floor: passing `severeContent: true` for that type will also skip ITS floor. This is intentional per the plan's own Task 1 code sample, not a Phase 20-specific hazard, but is worth naming for whichever plan adds the next threshold-enabled type.

## Verification

- `npx tsc --noEmit --pretty false` — exit 0, clean.
- `npx tsx scripts/verify-disengagement-termination.ts` — exit 0, ALL PASS, 5 sections, 32 `check(` calls (up from 16; zero removed).
- `npx tsx scripts/verify-disengagement.ts` — exit 0, ALL PASS, 15 sections, unaffected.
- `npx tsx scripts/verify-disengagement-walkout-shell.ts` — exit 0, ALL PASS, 23/23 checks, unaffected.
- `npx tsx scripts/verify-pitch-types.ts` — exit 1, exactly the same 1 pre-existing Phase 18 ELEVATOR failure (`18-PITCH-TYPES-REGRESSION.md`), unchanged by this plan.
- `git diff scripts/verify-disengagement-termination.ts` — confirms Sections 1-4 untouched except the import block; Section 5 is a pure append (277 insertions, 1 deletion — the deletion is the single-line import replaced by the three-line import block).

---
*Phase: 20-difficult-conversation-walk-outs*
*Completed: 2026-10-09*

## Self-Check: PASSED

- FOUND: `lib/engine/termination.ts`
- FOUND: `scripts/verify-disengagement-termination.ts`
- FOUND: `.planning/phases/20-difficult-conversation-walk-outs/20-04-SUMMARY.md`
- FOUND: commit `709f2dc` (Task 1)
- FOUND: commit `1b21b31` (Task 2)
