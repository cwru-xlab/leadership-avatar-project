---
phase: 11-cohort-staff-teardown
plan: 06
subsystem: auth
tags: [rbac, auth, role-model, client-components]

# Dependency graph
requires:
  - phase: 11-cohort-staff-teardown
    provides: "11-05's lib/auth.ts toAppRole/isAdminRole helper; 11-03's confirmation that /api/cohort/get and /api/student/cases were deleted"
provides:
  - "lib/roles.ts: dependency-free (no crypto/prisma/@vercel/edge-config) home for toAppRole/isAdminRole/AppRole, safe for client components"
  - "lib/auth.ts: re-exports the same helper from lib/roles.ts — still the single import path for server code"
  - "All surviving route handlers and UI role branches route through the helper; zero raw role string comparisons remain"
affects: [11-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "lib/roles.ts as the dependency-free pure-logic module; lib/auth.ts re-exports it rather than duplicating, so exactly one implementation of the ADMIN/USER mapping exists across both server and client code."

key-files:
  created:
    - lib/roles.ts
  modified:
    - app/api/interaction/finish/route.ts
    - app/api/interaction/get/route.ts
    - app/api/interaction/save/route.ts
    - app/page.tsx
    - app/login/page.tsx
    - components/auth-navbar.tsx
    - lib/auth.ts

key-decisions:
  - "lib/auth.ts imports crypto/prisma/@vercel/edge-config and cannot be safely imported into 'use client' components, so the plan's documented fallback was taken: toAppRole/isAdminRole/AppRole moved into a new dependency-free lib/roles.ts, with lib/auth.ts re-exporting them unchanged for every existing server-side caller. Exactly one implementation of the mapping exists (verified by grep: one 'function toAppRole' definition in the whole repo)."
  - "Task 3 (case-play follow-up) is a confirmed no-op: 11-03-SUMMARY.md's Task 2 checkpoint decision was 'delete-all' for the API routes only — no instruction to remove the dead /api/cohort/get useEffect in app/case-play/[caseId]/page.tsx was recorded. Per the plan's explicit default, this file received zero edits."

requirements-completed: []

# Metrics
duration: ~25min
completed: 2026-09-23
---

# Phase 11 Plan 06: Role-Comparison Sweep + Case-Play Follow-up Summary

**Swept the last 8 raw role-string comparisons (5 duplicated `isPrivileged` blocks, 3 UI `role === "student"` branches) onto `toAppRole`/`isAdminRole`, adding a new dependency-free `lib/roles.ts` so client components can import the helper safely; confirmed the case-play dead-effect cleanup was never requested and left that file untouched.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-09-23
- **Tasks:** 3 (2 committed, 1 confirmed no-op)
- **Files modified:** 7 modified, 1 created

## Accomplishments

- Confirmed via `11-03-SUMMARY.md` that `app/api/cohort/get/route.ts` and `app/api/student/cases/route.ts` no longer exist (deleted under the user's "delete-all" checkpoint decision) — grep independently re-verified only 3 of the plan's original 5 target files survive.
- Replaced the duplicated `const isPrivileged = currentUser.role === "admin" || currentUser.role === "professor"` expression in the 3 surviving route handlers (`app/api/interaction/finish/route.ts`, `app/api/interaction/get/route.ts`, `app/api/interaction/save/route.ts`) with `isAdminRole(currentUser.role)`, importing it alongside the existing `getCurrentUser` import from `@/lib/auth`. Pure refactor, zero behavior change, one line plus one import edit per file.
- Discovered `lib/auth.ts` is server-only (imports `crypto`, `prisma`, `@vercel/edge-config`) and cannot be imported into the three `"use client"` UI files targeted by Task 2. Took the plan's documented fallback: extracted the pure `toAppRole`/`isAdminRole`/`AppRole` logic into a new dependency-free `lib/roles.ts`, then rewrote `lib/auth.ts` to re-export the same three symbols instead of duplicating the mapping — so `middleware.ts` and every other existing server-side importer of `toAppRole`/`isAdminRole` from `@/lib/auth` keeps working unchanged, verified by `npx tsc --noEmit` and by grep confirming exactly one `function toAppRole` definition exists in the whole repo (`lib/roles.ts`).
- Converted all 3 raw `role === "student"` UI branches to `toAppRole(...) === "user"`, importing from `@/lib/roles` directly in each client component: `app/page.tsx`'s dashboard branch, `app/login/page.tsx`'s post-login redirect, `components/auth-navbar.tsx`'s nav-item selection.
- Confirmed Task 3's case-play follow-up is a no-op: re-read `11-03-SUMMARY.md`'s Task 2 checkpoint record — the user's verbatim decision ("delete-all") applied only to the 15 checkpoint-gated API routes, with no request to remove the dead `/api/cohort/get` `useEffect` in `app/case-play/[caseId]/page.tsx`. Per the plan's explicit default ("Leaving dead-but-inert code in place is the locked decision's default"), that file received zero edits — `git status --short app/case-play` is empty.

## Task Commits

1. **Task 1: Replace the duplicated isPrivileged blocks in route handlers** — `c746772`
2. **Task 2: Route the three UI role branches through the helper (+ new lib/roles.ts)** — `f146066`
3. **Task 3: Apply the 11-03 checkpoint's case-play follow-up** — no commit (confirmed no-op)

## Verification

- `grep -rn "role === \"admin\" || currentUser.role === \"professor\"\|=== \"professor\""` — only match is `lib/roles.ts`'s own helper definition (expected).
- `grep -rn "isPrivileged = isAdminRole" app` — 3 hits (all surviving files; the 2 deleted-in-11-03 files correctly absent).
- `grep -rn "role === \"student\"" app components` — no output.
- `grep -rln "toAppRole" app/page.tsx app/login/page.tsx components/auth-navbar.tsx` — all three.
- `grep -rn "function toAppRole" lib/` — exactly one definition (`lib/roles.ts`).
- `npx tsc --noEmit` — exit 0.
- `git status --short app/case-play` — empty (Task 3 no-op confirmed).
- `grep -n "searchParams.get(\"cohortId\")" app/case-play/[caseId]/page.tsx` — still present, unchanged.
- `git diff --stat prisma/schema.prisma` — empty; `ls prisma/migrations` unchanged (7 migrations, same as before this plan).
- `git status --short app/api/auth/kiosk-auto-login app/kiosk` — no changes.
- Kiosk logic confirmed still present and distinct from the admin/user branches (`middleware.ts` kiosk gate untouched by this plan, `app/api/auth/kiosk-auto-login/route.ts` still writes `role: "kiosk"` literally).

## Files Created/Modified

- `lib/roles.ts` (new) — dependency-free `toAppRole`/`isAdminRole`/`AppRole`.
- `lib/auth.ts` — re-exports from `lib/roles.ts` instead of defining the mapping locally.
- `app/api/interaction/finish/route.ts`, `app/api/interaction/get/route.ts`, `app/api/interaction/save/route.ts` — `isPrivileged` now calls `isAdminRole`.
- `app/page.tsx`, `app/login/page.tsx`, `components/auth-navbar.tsx` — role branch now calls `toAppRole(...) === "user"`.
- `app/case-play/[caseId]/page.tsx` — **not modified** (Task 3 no-op).

## Decisions Made

- `lib/roles.ts` extraction (see key-decisions above) — the plan explicitly anticipated this exact scenario and named the fallback module `lib/roles.ts`, which was followed verbatim.
- Task 3 no-op recorded per the plan's own instruction; no cleanup was improvised.

## Deviations from Plan

None beyond the plan's own documented conditional fallback (creating `lib/roles.ts`), which the plan text itself anticipated and named. No Rule 1-4 deviations.

## Issues Encountered

None.

## User Setup Required

None.

## Next Phase Readiness

- Every role decision in the app (route handlers, middleware, and UI) now funnels through `toAppRole`/`isAdminRole` — 11-07's static sweep can assert this as a fact rather than discover remaining gaps.
- `lib/roles.ts` is now available as the safe-for-client import path for any future component that needs the ADMIN/USER mapping; `lib/auth.ts` remains the conventional server-side import path with identical behavior.
- The case-play dead `/api/cohort/get` effect remains in place, confirmed inert and out of scope for this phase; no outstanding action item for 11-07 on this file.

---
*Phase: 11-cohort-staff-teardown*
*Completed: 2026-09-23*

## Self-Check: PASSED
- FOUND: lib/roles.ts
- FOUND: c746772 (Task 1 commit)
- FOUND: f146066 (Task 2 commit)
