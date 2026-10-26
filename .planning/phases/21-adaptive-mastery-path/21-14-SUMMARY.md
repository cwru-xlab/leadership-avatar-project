---
phase: 21-adaptive-mastery-path
plan: 14
subsystem: study-plan
tags: [typescript, mastery-model, ranking, tdd, deterministic]

# Dependency graph
requires:
  - phase: 21-adaptive-mastery-path (plan 09)
    provides: "computeMastery(), MasteryResult/CompetencyMastery (lifetimePercent/currentPercent, lifetimeEvidenceCount/weightSum, null-not-zero convention)"
  - phase: 21-adaptive-mastery-path (plan 13)
    provides: "evidenceTierFor(), EvidenceTier, weight-sum thresholds"
  - phase: 21-adaptive-mastery-path (plan 08)
    provides: "PATH_STEP_BOUNDS, PathStepInput, PathStepKind, PathWithSteps, validatePathSteps"
provides:
  - "lib/study-plan/next-step.ts — selectPathSteps(), nextStepFor(), TIE_BREAK_ORDER, StepSelection, PLACEHOLDER_KNOWLEDGE_CHECK_ID"
  - "scripts/verify-next-step.ts — 10-section weakest-first/determinism/tie-break/null-handling battery"
affects: [21-19]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "NONE-tier checked as its own comparator branch BEFORE any numeric comparison, so a null figure is never substituted into arithmetic — the mechanical guarantee that satisfies 21-09's null-not-zero distinction at the ranking layer"
    - "Exported, catalog-derived TIE_BREAK_ORDER (never array/insertion order, never string collation) as the single final tie-break every rule falls through to"
    - "Exclude-from-the-pool, not reassign-with-a-fallback, for unavailable competencies — a competency with no source moment is simply removed from the 1..(n-1) candidate pool, which prevents duplicate steps by construction instead of needing a separate duplicate-detection branch"
    - "A structural placeholder id (PLACEHOLDER_KNOWLEDGE_CHECK_ID) satisfies 21-08's presence-only validator for a KNOWLEDGE_CHECK step whose real check does not exist yet at selection time — generation and id-attachment happen later, in 21-19, before createPath is ever called"

key-files:
  created:
    - lib/study-plan/next-step.ts
    - scripts/verify-next-step.ts
  modified: []

key-decisions:
  - "Evidence tier for ranking purposes (NONE/THIN/EMERGING/ESTABLISHED) is computed from LIFETIME evidence (lifetimeEvidenceCount/lifetimeWeightSum), not current-window evidence. This makes NONE-tier exactly equivalent to \"this competency has never been measured, ever\" — a competency with lifetime evidence but a stale (null) current figure is measured-but-not-recent, not unmeasured, and must not be ranked as the largest unknown."
  - "When currentPercent is null but the competency is not NONE-tier (lifetime evidence exists, current window is simply empty), the primary ranking comparison falls back to lifetimePercent for THAT comparison only — not coerced to a hardcoded default. This case has no explicit RED test in this plan's battery (not one of the nine named scenarios) but the design keeps the comparator total and well-defined for it; documented inline in next-step.ts."
  - "Step-kind assignment uses an AVAILABLE-only candidate pool for positions 1..(n-1) (coached + knowledge checks), while the final UNAIDED_SESSION step always targets the TRUE overall weakest competency regardless of availability, since an unaided session reworks no specific past moment and needs no source moment. Excluding unavailable competencies from the 1..(n-1) pool means they can never collide with the final step there — this replaces the plan's literal 'assign UNAIDED_SESSION instead, or skip if duplicate' instruction with a construction that makes the duplicate structurally impossible, which was judged a cleaner implementation of the same stated outcome."
  - "PLACEHOLDER_KNOWLEDGE_CHECK_ID is exported so 21-19 (the consumer that calls generateChecksForCompetency and attaches real ids before createPath) has a recognizable sentinel to replace, rather than an undocumented magic string."

requirements-completed: [REQ-118]

# Metrics
duration: ~35min
completed: 2026-10-20
---

# Phase 21 Plan 14: Deterministic Weakest-First Step Selection Summary

**`selectPathSteps()` ranks every competency weakest-first through a five-rule ordered comparator (NONE-tier always ahead of any measured competency, never coerced to zero), assigns COACHED_SESSION/KNOWLEDGE_CHECK/UNAIDED_SESSION deterministically, and records a human-readable reason on every step; `nextStepFor()` returns the lowest-position PENDING step's stored (never recomputed) reason.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-10-20T21:55:00Z (approx)
- **Completed:** 2026-10-20T22:30:00Z (approx)
- **Tasks:** 1 (TDD: RED then GREEN)
- **Files modified:** 2 (both created)

## Accomplishments

- `lib/study-plan/next-step.ts` exports `selectPathSteps({ mastery, desiredCount, unavailableCompetencies? })` returning `StepSelection` (`steps: PathStepInput[]`, `ranking: Array<{competencyKey, rank, currentPercent, lifetimePercent, tier, reason}>`), `nextStepFor(path)`, and `TIE_BREAK_ORDER` (derived from `COMPETENCIES`' own `order` field, never hand-maintained).
- `compareCompetencies()` is an explicit five-rule ordered comparator: (1) NONE-tier always outranks any measured competency, checked as its own branch before any numeric comparison so null is never coerced into arithmetic; (2) `currentPercent` ascending, falling back to `lifetimePercent` only when current is null on a non-NONE (stale-but-measured) competency; (3) `lifetimePercent` ascending; (4) evidence tier ascending; (5) `TIE_BREAK_ORDER`. Every tie resolves through a declared rule, never array/insertion order or string collation.
- Step kind assignment: position 1 (weakest AVAILABLE competency) gets `COACHED_SESSION`; positions 2..(n-1) cycle through the available-competency ranking as `KNOWLEDGE_CHECK`, repeating the weakest ones when the catalog is smaller than `PATH_STEP_BOUNDS.min`; the final step is always `UNAIDED_SESSION` on the TRUE overall weakest competency (even if unavailable), since an unaided session needs no source moment. Unavailable competencies are excluded from the 1..(n-1) pool entirely, which prevents any duplicate step by construction.
- Every reason string names the competency's label (never its key) and, for a measured competency, the figure and evidence tier that drove the ranking; a `NONE`-tier reason explicitly says "has no scored evidence yet" and never contains a coerced percent.
- `desiredCount` is clamped into `PATH_STEP_BOUNDS` (2→5, 40→10, 7→7) rather than throwing.
- `nextStepFor(path)` scans all steps (not gated by earlier statuses) and returns the lowest-position `PENDING` step with its STORED `selectionReason`, verbatim — proven with a seeded sentinel reason string.
- `scripts/verify-next-step.ts` runs 10 sections (single-weakest, all-null-follows-TIE_BREAK_ORDER, null-beats-measured with differing reason kinds, exact-tie-plus-shuffle-determinism, same-input determinism, bounds-clamping proven against the real `validatePathSteps`, unavailable-competency handling, small-catalog repeats, reason-quality, and `nextStepFor`'s four position/status combinations). All sections call the REAL `validatePathSteps` (21-08) and `evidenceTierFor` (21-13) rather than reimplementing their logic.

## Task Commits

1. **Task 1 RED: Write the failing selection battery** - `a4ef9bb` (test) — `scripts/verify-next-step.ts`, run and confirmed to fail with `MODULE_NOT_FOUND` before `next-step.ts` existed
2. **Task 1 GREEN: Implement selectPathSteps()/nextStepFor()** - `001729d` (feat) — `lib/study-plan/next-step.ts`

## Files Created/Modified

- `lib/study-plan/next-step.ts` - `selectPathSteps()`, `nextStepFor()`, `TIE_BREAK_ORDER`, `StepSelection`, `PLACEHOLDER_KNOWLEDGE_CHECK_ID`, `compareCompetencies()`, `baseReasonFor()`, `stepReasonFor()`, `clampDesiredCount()`
- `scripts/verify-next-step.ts` - 10-section verifier, no database, no model call

## Decisions Made

See `key-decisions` in frontmatter: lifetime (not current-window) evidence drives the NONE/THIN/EMERGING/ESTABLISHED tier used for ranking; a stale-but-measured competency (null current, non-null lifetime) falls back to its lifetime figure for the primary comparison rather than a hardcoded default; the unavailable-competency handling excludes rather than reassigns-with-a-fallback, which makes the plan's "skip if duplicate" clause unnecessary by construction; `PLACEHOLDER_KNOWLEDGE_CHECK_ID` is exported as the documented sentinel 21-19 must replace before calling `createPath`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reworded a doc comment that accidentally matched the plan's own grep check**
- **Found during:** Running the plan's `<verify>` grep check after the GREEN commit was staged (caught before committing)
- **Issue:** A comment explaining the final tie-break rule ("never falls through to array order or `localeCompare` on the key") contained the literal substring `localeCompare`, which is exactly what `grep -c 'Math.random\|new Date()\|localeCompare' lib/study-plan/next-step.ts` checks for (required: 0; actual: 1). Same class of self-referential grep issue 21-09 and 21-13 both documented.
- **Fix:** Reworded to "string collation on the key" — same meaning, no checked substring. No behavior change.
- **Files modified:** `lib/study-plan/next-step.ts`
- **Verification:** Re-ran the grep check (0), re-ran `npx tsx scripts/verify-next-step.ts` (ALL PASS), re-ran `npx tsc --noEmit` (clean).
- **Committed in:** `001729d` (part of the single GREEN commit — caught before committing, not a separate fix commit)

---

**Total deviations:** 1 auto-fixed (Rule 1, comment-text-only, caught before the GREEN commit)
**Impact on plan:** No scope creep; no behavior changed.

## Issues Encountered

None beyond the one auto-fixed item above. The RED gate was genuine: `npx tsx scripts/verify-next-step.ts` failed with `Cannot find module '../lib/study-plan/next-step'` (`MODULE_NOT_FOUND`, exit 1) before any implementation file existed, confirmed and committed separately from GREEN. All 10 battery sections passed on the first real GREEN attempt (after the one comment reword).

## User Setup Required

None - no external service configuration required. This plan is pure TypeScript ranking/string logic with no database read and no model call. `scripts/verify-next-step.ts` was run with no `DATABASE_URL`/`OPENAI_API_KEY` set and still proves its claims against the real `validatePathSteps` (21-08, a database-free pure function) and `evidenceTierFor` (21-13, also database-free). `npx tsx scripts/verify-path-model.ts` was additionally run (with the local dev `DATABASE_URL`) to confirm this plan introduced no regression in 21-08's own DB-gated battery — ALL PASS, unchanged.

## Next Phase Readiness

`selectPathSteps`, `nextStepFor`, `TIE_BREAK_ORDER`, `StepSelection`, and `PLACEHOLDER_KNOWLEDGE_CHECK_ID` are ready for 21-19 (the route that calls `selectPathSteps` with mastery + `unavailableCompetencies` from `loadGenerationSources`' `momentsByCompetency` index, then calls `generateChecksForCompetency` per `KNOWLEDGE_CHECK` step to replace the placeholder id, then calls `createPath`). `nextStepFor` is ready for 21-19's `GET` handler. Only `lib/study-plan/next-step.ts` and `scripts/verify-next-step.ts` were touched, both committed with explicit pathspecs per the shared-working-tree protocol; `.planning/phases/18-avatar-disengagement-walk-out/18-VALIDATION.md` was not touched. No blockers. `npx tsc --noEmit` is clean project-wide.

---
*Phase: 21-adaptive-mastery-path*
*Completed: 2026-10-20*

## Self-Check: PASSED

- FOUND: `lib/study-plan/next-step.ts`
- FOUND: `scripts/verify-next-step.ts`
- FOUND: `.planning/phases/21-adaptive-mastery-path/21-14-SUMMARY.md`
- FOUND: commit `a4ef9bb` (Task 1 RED)
- FOUND: commit `001729d` (Task 1 GREEN)
