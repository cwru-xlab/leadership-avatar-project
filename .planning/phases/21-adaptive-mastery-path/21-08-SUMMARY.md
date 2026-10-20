---
phase: 21-adaptive-mastery-path
plan: 08
subsystem: database
tags: [prisma, postgresql, study-plan, path]

# Dependency graph
requires:
  - phase: 21-adaptive-mastery-path
    provides: "StudyPlanPath/StudyPlanPathStep/CoachedSession Prisma models and the applied migration (21-03)"
provides:
  - "lib/study-plan/path.ts: createPath, readPathForStudyPlan, markStepComplete, listPathsForUser, validatePathSteps, PATH_STEP_BOUNDS, PathAlreadyExistsError"
  - "scripts/verify-path-model.ts: database-free bound/position/kind-reference battery plus a DB-gated old-paths-survive and runtime-transition battery"
affects: [21-12, 21-14, 21-19, 21-23, 21-25]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bound enforced only in application code (validatePathSteps), never in SQL, with the schema's non-enforcement called out in a comment"
    - "State-dependent reference-consistency rule: a nullable FK column whose null-ness is valid only in one named status, asserted on both the accept and reject side"
    - "Child-of-parent read model with no is-latest/active flag and no delete — every row a user has ever owned stays listed"

key-files:
  created:
    - lib/study-plan/path.ts
    - scripts/verify-path-model.ts
  modified: []

key-decisions:
  - "COACHED_SESSION reference consistency is state-dependent: coachedSessionId may be null only while status === \"PENDING\"; markStepComplete re-asserts the rule at the one moment a step actually leaves PENDING, rather than gating completion order"
  - "PathStepInput carries an optional status field (defaulting to PENDING) purely so validatePathSteps can be reused both at creation (always PENDING) and at the markStepComplete transition (the step's prospective next status) without a second validation function"
  - "A second createPath for an already-pathed plan throws a named PathAlreadyExistsError carrying the existing path's id, rather than overwriting or deleting it"

patterns-established:
  - "Pattern: validatePathSteps is pure and exported so a DB-free verifier battery can prove bound/position/kind-reference invariants without touching Postgres"

requirements-completed: [REQ-117]

# Metrics
duration: ~25min
completed: 2026-10-20
---

# Phase 21 Plan 08: Study-Plan Path Container Summary

**`lib/study-plan/path.ts` builds the path as a bounded (5-10 step), one-per-plan child of StudyPlan with a state-dependent coached-session reference rule, proven by a 36-assertion verifier spanning both DB-free and DB-gated batteries.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-10-20T15:05:00Z (approx)
- **Completed:** 2026-10-20T15:29:10Z
- **Tasks:** 2
- **Files modified:** 2 (both created)

## Accomplishments
- `createPath` enforces, in this order: ownership of the target `StudyPlan`, the locked 5-10 step bound (the only enforcement — the schema deliberately does not constrain step count), 1-based contiguous unique positions, and per-kind reference consistency including the state-dependent `COACHED_SESSION` amendment (null `coachedSessionId` permitted only while `status === "PENDING"`, required once it leaves PENDING). Path + steps are written in one `prisma.studyPlanPath.create` nested transaction so a zero-step path can never exist.
- A second `createPath` for the same study plan catches Prisma's `P2002` (the `@unique studyPlanId` constraint) and rethrows a named `PathAlreadyExistsError` carrying the existing path's id — the existing path is never overwritten or deleted.
- `markStepComplete` re-runs the coached-reference rule at the one moment a step actually transitions off `PENDING`, and explicitly permits out-of-order completion (21-CONTEXT.md rules out unlocking mechanics, so a sequential gate here would reintroduce them under a different name).
- `readPathForStudyPlan` returns `null` for a plan with no path (the REQ-120 backward-compatibility case for pre-Phase-21 `StudyPlan` rows), and `listPathsForUser` returns every path a user has ever had — including superseded ones — with no is-latest/active flag and no filtering, so an older path stays reachable only through the study plan that owns it.
- `scripts/verify-path-model.ts` proves all four invariants: the 5-10 bound (rejecting 0/4/11, accepting 5/10, with both bound numbers named in the rejection message), position contiguity (duplicate/gap/0-based rejected, shuffled-but-contiguous accepted), kind/reference consistency including BOTH halves of the coached amendment (PENDING-null accepted, COMPLETE/IN_PROGRESS-null rejected naming the status), and — against a live database — that an older path's id, `generatedAt`, step ids and statuses are untouched by a second and third plan's path creation, that a second `createPath` for the same plan throws without mutating the original, and that `markStepComplete` throws at runtime for a still-null coached step and succeeds once the id is written back.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build path creation with its invariants enforced in code** - `1c5d0eb` (feat)
2. **Task 2: Verify the four path invariants** - `d918522` (test)

**Plan metadata:** this commit (docs: complete plan)

## Files Created/Modified
- `lib/study-plan/path.ts` - `PATH_STEP_BOUNDS`, `PathStepInput`, `PathAlreadyExistsError`, `PathWithSteps`, `validatePathSteps`, `createPath`, `readPathForStudyPlan`, `markStepComplete`, `listPathsForUser`.
- `scripts/verify-path-model.ts` - Database-free sections 1/2/3/5 (bound, positions, kind/reference consistency including both coached halves, no-active-flag absence assertions) plus DB-gated section 4/4b (old-paths-survive, collision, cross-user, and the runtime reject/accept transition for `markStepComplete`).

## Decisions Made
- **`PathStepInput.status` is optional, defaulting to `"PENDING"`.** This let `validatePathSteps` (and its internal `validateSingleStep`) serve both `createPath` (which only ever supplies PENDING steps implicitly) and `markStepComplete` (which constructs a projected step at its prospective new status to re-run the reject half), without a second parallel validation function.
- **`PathStepStatus` includes `"IN_PROGRESS"`** even though `StudyPlanPathStep.status`'s schema comment names only `"PENDING" | "COMPLETE" | "SKIPPED"` — the column is a plain, unenforced `String` (21-03's established pattern), and the plan's own verifier battery requires an `IN_PROGRESS`-with-null-id reject case to exist, so the type must admit the value even though no code path writes it yet.
- **The `PathAlreadyExistsError` existing-path lookup runs without a `userId` filter** (`prisma.studyPlanPath.findUnique({ where: { studyPlanId } })`), because ownership of `studyPlanId` was already verified earlier in the same call before the create was attempted — adding a redundant `userId` filter here would only reintroduce the race it closes nothing against.

## Deviations from Plan

None - plan executed exactly as written. The `PathStepInput` interface in the plan's action text was a suggested shape; adding the optional `status` field was necessary to make `validatePathSteps` reusable for the state-dependent rule as specified (Rule 1/3: without it, `markStepComplete`'s required re-validation of the reject half would have no way to express "this step's prospective status"), and is additive, not a change to anything the plan named as fixed.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. The migration this plan depends on (21-03) is already applied to the local dev database per this plan's own setup notes; `scripts/verify-path-model.ts`'s DB-gated section ran (not SKIP) during verification.

## Next Phase Readiness
- `lib/study-plan/path.ts` is ready for 21-12 (`createCoachedSession`, the sole creator of a `CoachedSession` for a `COACHED_SESSION` step, called at step-entry time), 21-14 (selection logic deciding what goes into each step — deliberately kept out of this plan), 21-19/21-23 (the API routes that call `createPath`/`markStepComplete`/the coached step-entry flow), and 21-25 (assembling the sources a path's steps are built from).
- No blockers. `npx tsc --noEmit` is clean project-wide; `npx tsx scripts/verify-path-model.ts` exits 0 with all sections (including the DB-gated one) run, not skipped.

---
*Phase: 21-adaptive-mastery-path*
*Completed: 2026-10-20*

## Self-Check: PASSED

- FOUND: `lib/study-plan/path.ts`
- FOUND: `scripts/verify-path-model.ts`
- FOUND: `.planning/phases/21-adaptive-mastery-path/21-08-SUMMARY.md`
- FOUND: commit `1c5d0eb` (Task 1)
- FOUND: commit `d918522` (Task 2)
