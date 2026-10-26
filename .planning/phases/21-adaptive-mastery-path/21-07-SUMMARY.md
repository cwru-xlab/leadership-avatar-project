---
phase: 21-adaptive-mastery-path
plan: 07
subsystem: study-plan
tags: [privacy, redaction, knowledge-checks, pure-function]

# Dependency graph
requires:
  - phase: 21-adaptive-mastery-path
    provides: "extractSessionMoments() / SessionMoment (21-04) — the student-turn extraction this module consumes"
provides:
  - "prepareMomentsForGeneration() — the ONLY path by which a student's own transcript text may reach a model call for knowledge-check/coached-practice generation"
  - "MOMENT_BOUNDARY_POLICY — permits/forbids/scope as asserted data, not just prose"
  - "21-PRIVACY-BOUNDARY.md — the written record of the named, scoped widening required by REQ-109"
  - "scripts/verify-moment-boundary.ts — proves lib/study-plan/generate.ts is unchanged and the new path enforces ownership/redaction/caps"
affects: [study-plan-knowledge-checks, study-plan-coached-practice, 21-10, 21-25]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Named, scoped privacy exception as data (MOMENT_BOUNDARY_POLICY) rather than a loosened shared filter — two paths, not one widened path"
    - "Drop-not-redact: a moment altered by redaction is removed entirely, never sent in a modified form, so a verbatim-quote guarantee downstream is never violated by this module"
    - "Required-not-optional sensitive parameter (selfNames) so a caller cannot silently skip a safety step by omission"
    - "Frozen-file guard with inverted self-test: the verifier proves its own marker-presence assertion would catch a regression, not just that the markers are currently present"

key-files:
  created:
    - lib/study-plan/moment-boundary.ts
    - .planning/phases/21-adaptive-mastery-path/21-PRIVACY-BOUNDARY.md
    - scripts/verify-moment-boundary.ts
  modified: []

key-decisions:
  - "Resolution was two paths, not one loosened path — lib/study-plan/generate.ts stays byte-for-byte frozen and a second, narrower, named module opens the one exception REQ-110 requires"
  - "selfNames is a REQUIRED parameter on prepareMomentsForGeneration, not optional, so redaction cannot be silently skipped by a forgetful caller"
  - "Redaction is structural only (email/URL/phone/self-name pattern match) — no NER, no model-based PII detection — and this limitation plus its accepted residual risk is stated explicitly in both the code comment and 21-PRIVACY-BOUNDARY.md, not papered over"
  - "A moment altered by redaction is DROPPED, not sent redacted, because a redacted quote can no longer satisfy REQ-110's verbatim guarantee"
  - "Caps (12 moments / 8,000 characters) are exported as named consts explicitly marked PROVISIONAL UNTIL CALIBRATED, with reasoning, for 21-20 to revisit"
  - "momentOwnerUserIds exists as a per-moment parallel array so ownership is checked on the data actually about to be sent, not via a second lookup that could disagree with the caller's query — left as a required, checkable-by-construction shape for 21-25's ownership-scoped queries to satisfy"

patterns-established:
  - "Frozen-path guard with a self-proving inverted test: strip the markers from a synthetic copy of the frozen source and assert the guard's own check correctly reports them missing, so the guard itself is proven to bite, not just asserted to exist"

requirements-completed: [REQ-109]

# Metrics
duration: ~35min
completed: 2026-10-20
---

# Phase 21 Plan 07: Moment-Generation Privacy Boundary Summary

**Opened a second, named, scoped exception (`prepareMomentsForGeneration`) to the study-plan privacy filter for knowledge-check generation, while proving `lib/study-plan/generate.ts`'s existing closed-vocabulary filter is unchanged — resolving the direct conflict between REQ-109's privacy guarantee and REQ-110's verbatim-quote requirement without loosening the original path.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-10-20T15:05:00Z
- **Completed:** 2026-10-20T15:40:00Z
- **Tasks:** 3
- **Files created:** 3

## Accomplishments
- `prepareMomentsForGeneration()` enforces, in strict order: ownership-first (throws before any text handling on a single cross-user entry, even with an empty moments array, without echoing either user id), enumerated structural redaction with drop-not-redact semantics, and two declared-provisional caps (12 moments / 8,000 characters) that keep the most recent moments
- `MOMENT_BOUNDARY_POLICY` records permits/forbids/scope as data, asserted non-vacuous by the verifier rather than left as unchecked prose
- `.planning/phases/21-adaptive-mastery-path/21-PRIVACY-BOUNDARY.md` records what widened, why no alternative avoided it, what explicitly did NOT widen, and the accepted residual risk (structural, not semantic redaction) stated plainly rather than oversold
- `scripts/verify-moment-boundary.ts` proves `lib/study-plan/generate.ts` is byte-for-byte unchanged, imports nothing from the new module, and that `AnonymousBehavioralReport`'s field set is still exactly four fields — and proves the guard itself would catch a regression via an inverted marker-removal self-test
- 22/22 checks pass with zero environment variables and no network access; `npx tsc --noEmit` clean; `git diff --name-only` confirms no change to `generate.ts`, `types.ts`, or the study-plan generate route

## Task Commits

1. **Task 1: Build the scoped moment-generation boundary** - `8243d7e` (feat)
2. **Task 2: Write the boundary record** - `f584fb2` (docs)
3. **Task 3: Verify the widening is scoped and the old path is frozen** - `2f7cda9` (test)

**Plan metadata:** (this commit) - `docs(21-07): complete moment-generation privacy boundary plan`

## Files Created/Modified
- `lib/study-plan/moment-boundary.ts` (215 lines) - `prepareMomentsForGeneration`, `MOMENT_BOUNDARY_POLICY`, `MomentGenerationPayload`, `MAX_MOMENTS`, `MAX_TOTAL_CHARACTERS`
- `.planning/phases/21-adaptive-mastery-path/21-PRIVACY-BOUNDARY.md` - the written boundary record REQ-109 requires
- `scripts/verify-moment-boundary.ts` (315 lines) - frozen-path guard, ownership, redaction/drops, caps, and policy-shape assertions

## Decisions Made
- See `key-decisions` in frontmatter. The central one: this is two paths, never one loosened path — `generate.ts` is not touched, and every file this plan creates is new.
- Within the cap logic, once either cap binds while iterating most-recent-first, all older remaining moments are dropped too (rather than greedily back-filling with smaller older moments past a bound cap), so "most recent survives" holds without a later, smaller moment slipping back in after a larger one was excluded.

## Deviations from Plan

None — plan executed exactly as written. Two internal test-script bugs were caught and fixed before the Task 3 commit landed (not deviations from the plan's requirements, just getting the verifier itself correct):
- `missingMarkers`'s inverted self-test initially used `.replace()` (single-occurrence) against markers that appear multiple times in `generate.ts`, understating removal; switched to `.replaceAll()`.
- The policy-shape assertion on `MOMENT_BOUNDARY_POLICY.scope` initially used a regex that matched the literal substring "study-plan synthesis" regardless of the preceding "NOT", inverting the intended check; replaced with a direct substring check for `"NOT study-plan synthesis"`.

Both fixed before the final battery run that produced the committed 22/22 passing script.

## Issues Encountered
None beyond the two test-script bugs above, resolved within Task 3 before committing.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `prepareMomentsForGeneration` is ready for 21-10 (knowledge-check generation) and 21-25 (coached-practice) to call, both required to supply `selfNames`
- `momentOwnerUserIds` is left required and checkable-by-construction, for 21-25 to satisfy by building its queries ownership-scoped rather than relying on a post-filter
- `MAX_MOMENTS` / `MAX_TOTAL_CHARACTERS` are named exports explicitly marked PROVISIONAL UNTIL CALIBRATED, ready for 21-20's calibration pass to adjust with reasoning
- No blockers identified for downstream plans

---
*Phase: 21-adaptive-mastery-path*
*Completed: 2026-10-20*

## Self-Check: PASSED

All created files and task commit hashes verified present on disk / in git log.
