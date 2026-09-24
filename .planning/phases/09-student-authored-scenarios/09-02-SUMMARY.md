---
phase: 09-student-authored-scenarios
plan: 02
subsystem: api
tags: [nextjs, s3, ownership, crud, middleware]

# Dependency graph
requires:
  - phase: 09-student-authored-scenarios
    provides: "09-01's CaseStudy.ownerId field, the sole discriminator this plan enforces ownership against"
provides:
  - "lib/scenario/validation.ts — validateScenarioInput (REQ-26 minimum bar, field-level errors, strips server-owned fields) and loadOwnedScenario (404-never-403 ownership resolver)"
  - "app/api/scenario/{add,edit,delete,publish,list,avatars}/route.ts — the full owner-scoped scenario CRUD API family"
  - "/api/scenario/* reachable by students (and admins) via STUDENT_ROUTES"
affects: [09-04, 09-05, 09-06, 09-08, 09-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "loadOwnedScenario(id, userId) collapses three distinct non-owned cases (missing, admin-authored, someone else's) into a single null return, so every caller emits the identical 404 body/status — the project's 404-never-403 rule enforced structurally, not by convention"
    - "Collision-proof server-minted ids (scn-<slug>-<uuid8>) for objects sharing a flat S3 prefix with a second, unrelated author population (admin cases)"
    - "Explicit field-by-field response projections (never object spread) for any payload crossing an ownership or role boundary — reused from lib/interview/report-dto.ts's established pattern for both the cross-student shared-list projection and the admin-catalog-to-student avatars projection"

key-files:
  created:
    - app/api/scenario/add/route.ts
    - app/api/scenario/edit/route.ts
    - app/api/scenario/delete/route.ts
    - app/api/scenario/publish/route.ts
    - app/api/scenario/list/route.ts
    - app/api/scenario/avatars/route.ts
    - lib/scenario/validation.ts
  modified:
    - middleware.ts

key-decisions:
  - "loadOwnedScenario lives in lib/scenario/validation.ts (not duplicated per route) — the plan allowed either a per-route helper or one shared function; a shared function was chosen so all five write/read routes can never drift on what counts as 404"
  - "add/edit reject on ownership (404) before validation (400) in edit, so a non-owner's malformed request never gets a 400 that could hint the body was even inspected"
  - "cohortIds is preserved as dead-weight pass-through (added as [] on create, carried over unmodified on edit) per the plan's explicit instruction — this is NOT new cohort/assignment logic, just the existing CaseStudy shape's untouched field, and is documented as such wherever it appears"

requirements-completed: [REQ-25, REQ-26, REQ-27, REQ-29, REQ-30, REQ-34]

# Metrics
duration: 25min
completed: 2026-09-21
---

# Phase 9 Plan 02: Student Scenario CRUD API Summary

**Six owner-scoped `/api/scenario/*` routes with genuine server-side ownership enforcement — the first in-route auth this codebase has ever had for case-shaped objects — routed through `STUDENT_ROUTES`.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-09-21T20:00:00Z
- **Completed:** 2026-09-21T20:23:00Z
- **Tasks:** 3
- **Files modified:** 7 created, 1 modified

## Accomplishments
- `lib/scenario/validation.ts` — `validateScenarioInput` is the single REQ-26 minimum-bar check (situation ≥80 chars, ≥1 character with name/role/profileId, criteria ≥40 chars), returning every failing field at once and stripping any server-owned key (`ownerId`, `published`, `id`, `createdBy`, `cohortIds`) from its output so a client can never smuggle them in
- `loadOwnedScenario` collapses "doesn't exist," "admin-authored (no ownerId)," and "someone else's" into one `null` return, so all five write/read routes emit byte-identical 404 bodies with no distinguishing signal — REQ-29's "enforced in the handler, not just middleware" requirement satisfied structurally
- `POST /api/scenario/add` mints a collision-proof `scn-<slug>-<uuid8>` id server-side (the shared `cases/` prefix with admin cases makes a bare name-slug unsafe), writes `ownerId` from the session only, and defaults `published: false` (REQ-30)
- `POST /api/scenario/edit` checks ownership before validation and preserves every immutable field (`id`, `ownerId`, `published`, `cohortIds`, `createdBy`, `createdAt`) explicitly
- `POST /api/scenario/publish` toggles the Phase 7 `published` discovery flag without adding any new access-control semantic to `/api/case/get`
- `POST /api/scenario/delete` returns 409 and writes nothing while `published: true` (REQ-34); does not touch `ScenarioReport` rows (bare-String `caseId`, no FK, so nothing to cascade)
- `GET /api/scenario/list` returns `{ mine, shared }`, `shared` mapped through an explicit projection dropping `ownerId`/`cohortIds`; admin-authored cases appear in neither array
- `GET /api/scenario/avatars` (REQ-27's enabler) projects `VideoAudioProfile` down to `{id, name, description, portrait, avatarName}`, giving students a picker catalog without exposing the admin-only `/api/profile/list` surface
- `middleware.ts` gained a single `"/api/scenario"` line in `STUDENT_ROUTES`; `ADMIN_ROUTES` and every other branch are byte-unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: Shared scenario validation module** - `01bc9f9` (feat)
2. **Task 2: Owner-scoped /api/scenario CRUD routes** - `3992670` (feat) — includes the `loadOwnedScenario` addition to `lib/scenario/validation.ts`
3. **Task 3: Route the new API family through STUDENT_ROUTES** - `fa1e74b` (feat)

**Plan metadata:** _(recorded after this commit)_

## Files Created/Modified
- `lib/scenario/validation.ts` - `validateScenarioInput` (REQ-26 bar) + `loadOwnedScenario` (404-never-403 ownership resolver) + `SCENARIO_LIMITS`
- `app/api/scenario/add/route.ts` - Owner-scoped create, server-minted id, private by default
- `app/api/scenario/edit/route.ts` - Owner-scoped update, immutable fields preserved
- `app/api/scenario/delete/route.ts` - Owner-scoped delete, 409 guard while published
- `app/api/scenario/publish/route.ts` - Owner-scoped publish/unpublish toggle
- `app/api/scenario/list/route.ts` - `{mine, shared}` split with an explicit shared projection
- `app/api/scenario/avatars/route.ts` - Student-safe `VideoAudioProfile` projection for the builder's picker
- `middleware.ts` - One-line `STUDENT_ROUTES` addition

## Decisions Made
- Ownership check ordered before validation in `edit`/`delete`/`publish` (404 takes priority over 400) so a non-owner's request body is never even inspected for correctness
- `loadOwnedScenario` centralized in `lib/scenario/validation.ts` rather than duplicated per route file, keeping the "what counts as 404" logic in exactly one place
- `cohortIds` pass-through kept exactly as the plan specified (`[]` on create, carried over on edit) — a deliberate exception to the "no cohort fields" constraint, since this is the existing `CaseStudy` shape's dead-weight field, not new cohort/assignment logic

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The pre-existing `next-server` on port 3000 (from a prior session, per the established policy of leaving it untouched) was returning 500 on both `/` and the pre-existing `/api/case/list` — unrelated to this plan's changes and not investigated, since a fresh dev server on port 3011 (inline local `DATABASE_URL`) served every route in this plan correctly and was used for all runtime verification instead. That temporary server was stopped cleanly after verification.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

The full owner-scoped scenario CRUD API is live and reachable by students. `lib/scenario/validation.ts`'s `SCENARIO_LIMITS` and `validateScenarioInput` are ready for the builder UI (09-05) to reuse verbatim so client and server never disagree about completeness. `/api/scenario/avatars` gives the builder's character picker a ready-made data source. No blockers for 09-03/09-04 (which ran concurrently in this same working directory — see the concurrency note below) or for 09-05 onward.

**Concurrency note:** This plan executed concurrently with 09-03 in the same working directory (no worktree isolation, shared git index — the hazard logged in `08-08-SUMMARY.md`). Every commit in this plan was staged with literal file paths (never a directory glob) and independently verified via `git show --name-only` to contain only this plan's own files; no sibling files were ever staged or committed. `.planning/STATE.md`'s in-progress modification by the sibling agent and its `09-03-SUMMARY.md` were both left untouched throughout.

---
*Phase: 09-student-authored-scenarios*
*Completed: 2026-09-21*

## Self-Check: PASSED

- FOUND: app/api/scenario/add/route.ts
- FOUND: app/api/scenario/edit/route.ts
- FOUND: app/api/scenario/delete/route.ts
- FOUND: app/api/scenario/publish/route.ts
- FOUND: app/api/scenario/list/route.ts
- FOUND: app/api/scenario/avatars/route.ts
- FOUND: lib/scenario/validation.ts
- FOUND: commit 01bc9f9
- FOUND: commit 3992670
- FOUND: commit fa1e74b
