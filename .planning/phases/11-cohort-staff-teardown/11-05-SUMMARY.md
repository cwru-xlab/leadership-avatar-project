---
phase: 11-cohort-staff-teardown
plan: 05
subsystem: auth
tags: [middleware, rbac, auth, role-model]

# Dependency graph
requires:
  - phase: 11-cohort-staff-teardown
    provides: "11-02's confirmation that middleware.ts has no /api/student-history entry; 11-03's pruned PUBLIC_ROUTES/ADMIN_ROUTES/STUDENT_ROUTES arrays (last writer before this plan)"
provides:
  - "lib/auth.ts: exported toAppRole()/isAdminRole()/AppRole, the single app-layer ADMIN/USER mapping"
  - "middleware.ts: all three role gates (student, kiosk, admin) routed through the helper"
  - "Confirmation that middleware.ts's route arrays have zero dangling /api/... entries anywhere"
affects: [11-06, 11-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "toAppRole/isAdminRole as the single source of truth for ADMIN/USER role collapse, applied at the app layer only (Postgres Role enum unchanged)"

key-files:
  created: []
  modified:
    - lib/auth.ts
    - middleware.ts

key-decisions:
  - "PROFESSOR now maps to admin via toAppRole/isAdminRole in all three middleware gates — this is an intentional fix to a pre-existing lockout (PROFESSOR matched neither the student nor admin raw-string comparison before), not a regression."
  - "Task 3 (11-02's deferred /api/student-history middleware cleanup) is a confirmed no-op: grep found no such entry, matching 11-02's finding. The consolidated route-array sweep of every remaining /api/... entry found zero dangling entries — every one resolves to an existing route file or directory."

patterns-established:
  - "toAppRole/isAdminRole in lib/auth.ts as the one place app code interprets the four-value Role enum as ADMIN/USER; middleware imports it directly (no Edge-runtime bundling issue encountered)."

requirements-completed: []

# Metrics
duration: ~20min
completed: 2026-09-23
---

# Phase 11 Plan 05: Middleware Role-Mapping Helper Summary

**Added `toAppRole`/`isAdminRole` to `lib/auth.ts` as the single ADMIN/USER role-mapping source of truth and routed all three `middleware.ts` role gates through it, fixing a pre-existing bug where PROFESSOR accounts were locked out of both student and admin surfaces.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-09-23
- **Tasks:** 3 (2 committed, 1 confirmed no-op)
- **Files modified:** 2 (`lib/auth.ts`, `middleware.ts`)

## Accomplishments

- Added `AppRole` type and exported `toAppRole()`/`isAdminRole()` to `lib/auth.ts`, following the file's existing `roleToString` single-responsibility pattern. Handles both Prisma `Role` enum casing (`"ADMIN"`, `"PROFESSOR"`, `"STUDENT"`, `"KIOSK"`) and lowercase JWT strings, defaulting any unknown/null/undefined value to `"user"` (least-privilege fail-safe, matching `createToken`'s existing `role: user.role || "user"` default).
- Routed all three `middleware.ts` role-comparison points (student-route gate, kiosk-route gate, admin-route gate) through the helper, replacing every raw `userRole === "..."` string comparison.
- Confirmed the plain `import { toAppRole, isAdminRole } from "@/lib/auth"` works with no Edge-runtime/bundling error — `npx next dev` booted clean and an unauthenticated request to `/case-management` still returned the expected `307` redirect. No `lib/roles.ts` extraction was needed.
- Re-confirmed 11-02's finding first-hand: `grep -n "student-history" middleware.ts` returns no output. Task 3 is a genuine no-op.
- Performed the phase's consolidated route-array sweep: walked every remaining `/api/...` string across `PUBLIC_ROUTES`, `ADMIN_ROUTES`, `KIOSK_ROUTES`, and `STUDENT_ROUTES` (38 entries total) and confirmed each resolves to an existing `app/api/.../route.ts` file or an existing directory prefix with live subroutes. Zero dangling entries found — nothing to remove.
- `prisma/schema.prisma` confirmed byte-unchanged (`git diff --stat` empty, `PROFESSOR` still present in the enum). `app/kiosk` and `app/api/auth/kiosk-auto-login` confirmed byte-unchanged.

## Role x Surface Table (Before -> After)

| Role | Student routes (`/interview`, `/case-play`, etc.) | Admin routes (`/case-management`, etc.) | Kiosk routes (`/kiosk/*`) |
|---|---|---|---|
| ADMIN | Allowed -> Allowed (unchanged) | Allowed -> Allowed (unchanged) | Allowed -> Allowed (unchanged) |
| **PROFESSOR** | **Denied -> Allowed (FIXED)** | **Denied -> Allowed (FIXED)** | **Denied -> Allowed (FIXED, via admin branch)** |
| STUDENT | Allowed -> Allowed (unchanged) | Denied -> Denied (unchanged) | Denied -> Denied (unchanged) |
| KIOSK | Denied, unless route is also a kiosk route -> unchanged | Denied -> Denied (unchanged) | Allowed -> Allowed (unchanged) |

The only changed cells belong to PROFESSOR. Before this plan, `userRole === "professor"` never matched any of the three raw-string comparisons (`"student"`, `"admin"`, `"kiosk"`), so a PROFESSOR-role account was locked out of every gated surface in the app — student pages, admin pages, and kiosk pages alike. `toAppRole("professor") === "admin"` now admits PROFESSOR through every gate that admits ADMIN. This is documented in-line in `middleware.ts` at all three gate sites as an intentional fix, not a regression, per the plan's explicit instruction.

## Task Commits

1. **Task 1: Add toAppRole/isAdminRole to lib/auth.ts** — `efc546f`
2. **Task 2: Route middleware.ts's role gates through the helper** — `608b8c9`
3. **Task 3: Apply 11-02's deferred middleware route-array cleanup** — no commit (confirmed no-op; see below)

## Task 3 Detail (11-02's deferred cleanup + consolidated sweep)

Per 11-02's `## middleware.ts finding (for 11-05)` section: *"No `/api/student-history` entry exists in `middleware.ts` — no cleanup needed."* Independently re-confirmed via `grep -n "student-history" middleware.ts` (no output, exit 1) both before and after this plan's Task 2 edits. **No-op, exactly as 11-02 reported.**

The consolidated route-array sweep (walking every remaining `/api/...` entry and confirming its target file/directory exists) found:

- All 20 literal `/api/.../route.ts` file targets in `ADMIN_ROUTES`/`PUBLIC_ROUTES` exist (auth, cta, llm, avatar, chat, profile, case-add/edit/delete).
- All 4 directory-prefix targets (`/api/knowledge`, `/api/documents`, `/api/interaction`, `/api/interview`, `/api/scenario`, `/api/metrics`) exist as directories with live subroutes.
- **Zero dangling entries found anywhere in the route arrays.** No removal was performed — `git diff middleware.ts` against `HEAD~1` (this plan's own Task 2 commit) shows only the Task 2 helper-swap edits, no array changes.

## Files Created/Modified

- `lib/auth.ts` — added `AppRole` type, `toAppRole()`, `isAdminRole()` (exported); no existing export changed.
- `middleware.ts` — imported the two helpers; all three role gates (student, kiosk, admin) now call them instead of raw string comparisons; route arrays untouched (Task 3 was a no-op).

## Decisions Made

- PROFESSOR's newly-granted access via `isAdminRole` is the plan's intended, locked-in fix to a real pre-existing lockout bug — recorded in code comments at all three gate sites and here, so no future reader "fixes" it back.
- No `lib/roles.ts` extraction was needed; the plain import from `lib/auth.ts` into `middleware.ts` works with no Edge-runtime error, verified live via `npx next dev`.

## Deviations from Plan

None — plan executed exactly as written. Task 3 was correctly a no-op per the plan's own conditional instruction ("If it says no `/api/student-history` entry exists: this task is a NO-OP").

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `middleware.ts` is now fully clean of any dangling route-array entry and its role gates are centralized behind a single, auditable helper — 11-07's static sweep can assert this rather than fix it.
- PROFESSOR accounts are now correctly admitted to both student and admin surfaces; no manual follow-up needed on this file.
- `lib/auth.ts`'s `toAppRole`/`isAdminRole` are available for any other Phase 11 plan (or future phase) that needs the same ADMIN/USER mapping outside `middleware.ts`.

---
*Phase: 11-cohort-staff-teardown*
*Completed: 2026-09-23*

## Self-Check: PASSED
- FOUND: lib/auth.ts (toAppRole, isAdminRole, AppRole all present)
- FOUND: middleware.ts (imports and calls toAppRole/isAdminRole at all three gate sites)
- FOUND: efc546f (lib/auth.ts helper commit)
- FOUND: 608b8c9 (middleware.ts wiring commit)
- CONFIRMED: no student-history entry in middleware.ts (Task 3 no-op)
- CONFIRMED: git diff --stat prisma/schema.prisma empty
