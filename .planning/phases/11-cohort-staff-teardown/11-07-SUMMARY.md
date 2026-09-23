---
phase: 11-cohort-staff-teardown
plan: 07
subsystem: full-stack
tags: [static-sweep, verification, teardown-closeout]

# Dependency graph
requires:
  - phase: 11-cohort-staff-teardown
    provides: "11-01 through 11-06's complete deletion/refactor work, closed out by this plan's static sweep"
provides:
  - "Static constraint sweep proving the whole Phase 11 diff is clean: zero dead references, zero locked-constraint violations, all deleted surfaces 404, all kept surfaces still respond normally"
  - "One trivial dangling-reference fix found and applied outside the six prior plans' scope"
  - "One checkpoint-authorized fix to a pre-existing Phase 9 nested-button/hydration defect in components/scenario/ScenarioCard.tsx, found live during the human walkthrough"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "git diff main is unreliable for phase-scoped constraint proofs when main trails the feature branch by many phases; diff against the last pre-phase commit on the working branch instead (here: 98f4577, the commit immediately preceding 11-01's first commit)."
    - "Testing 404-vs-redirect on middleware-gated routes requires an authenticated session cookie — unauthenticated requests to any non-public route short-circuit to a 307 /login redirect before Next.js route resolution ever runs, which looks identical for both a deleted route and a route that never existed. Log in first, then test."

key-files:
  created: []
  modified:
    - "app/chat/view/[session-id]/page.tsx"
    - "components/scenario/ScenarioCard.tsx"

key-decisions:
  - "Used commit 98f4577 (the commit immediately preceding 11-01's first commit, 8df5a75) as the sweep baseline instead of `main`, because `main` is 5 phases behind this working branch and diffing against it would show Phases 6-10's entire history as 'changed', making the locked-constraint proofs meaningless. Verified 98f4577 is the correct cut point via `git log --oneline ec86e4d..HEAD`."
  - "Fixed one trivial dangling reference (app/chat/view/[session-id]/page.tsx's four router.push('/users-and-usages') calls) under Rule 1/Rule 3 — a leftover pointer to a page 11-01 deleted, missed because no prior plan's file list included this page. Repointed to '/' (the dashboard), the only sensible 'back to admin' landing page left. One file, same-shape fix repeated 4 times, no architectural change."
  - "components/scenario/ScenarioCard.tsx's nested-<button> hydration bug (pre-existing Phase 9 code, found live by the user during the walkthrough) was NOT auto-fixed under Rule 1 — it was larger than the plan's own 'one-line dangling-reference only' checkpoint constraint, so it was surfaced as a finding and only fixed after the user explicitly authorized it (via the orchestrator) with specific implementation requirements. Recorded as a checkpoint-authorized deviation, not a self-directed Rule 1-3 fix."

patterns-established: []

requirements-completed: []

# Metrics
duration: "~35min (Task 1 only; Task 2 is a blocking checkpoint awaiting human sign-off)"
completed: 2026-09-23
---

# Phase 11 Plan 07: Closing Static Sweep + Human Walkthrough Summary

**Full static constraint sweep of the six-plan cohort/staff teardown came back clean except for one missed dangling reference (a chat-session admin page still linking to the deleted `/users-and-usages`), fixed in place; all locked constraints (Prisma schema, migrations, kiosk, S3 client, PROFESSOR enum value) proven byte-unchanged; every deleted route/page now 404s and every kept route still responds normally, both verified live against a real authenticated admin session. Partway through the human walkthrough, the user hit and authorized a fix for a real pre-existing (Phase 9, out-of-scope) nested-`<button>` hydration bug in `ScenarioCard.tsx` — fixed under explicit user authorization. The plan is still paused at the mandatory human end-to-end walkthrough checkpoint, awaiting confirmation of that fix and the remaining steps.**

## Performance

- **Duration:** ~35 min (Task 1 static sweep) + ~20 min (checkpoint-authorized `ScenarioCard.tsx` fix), this session
- **Completed:** 2026-09-23 (Task 1 complete; Task 2 in progress)
- **Tasks:** 1 of 3 complete this session, plus one checkpoint-authorized fix mid-Task-2 (Task 2 itself is a blocking human-verify checkpoint, still open; Task 3 runs after sign-off)
- **Files modified:** 2 (`app/chat/view/[session-id]/page.tsx`, `components/scenario/ScenarioCard.tsx`)

## Task 1: Static Constraint Sweep — Results

### Build / references

| Check | Result | Status |
|---|---|---|
| `npx tsc --noEmit` | exit 0, zero errors | PASS |
| `grep -rn "cohort-management\|users-and-usages\|/student-history\|/teacher/\|join/\[accessCode\]" app lib components config middleware.ts` | 4 hits found (`app/chat/view/[session-id]/page.tsx`, all `/users-and-usages`) → **fixed in place**, re-run after fix: 0 hits | PASS (after fix) |
| `grep -rn "href=\"/codes\|href: \"/codes" app components config` | 0 hits | PASS |
| `grep -rln "cohort-card\|student-history-service" app lib components` | 0 hits | PASS |
| `grep -n "!cohortId" app/api/interaction/start/route.ts` | 0 hits | PASS |
| `grep -rn "=== \"professor\"\|=== \"student\"" app lib components middleware.ts` | 0 hits | PASS |
| `grep -rn "function toAppRole" lib` | exactly 1 definition (`lib/roles.ts:20`) | PASS |
| Every `/api/...` entry in `middleware.ts`'s route arrays resolves to an existing route file/directory | Walked all 38 entries across `PUBLIC_ROUTES`, `ADMIN_ROUTES`, `KIOSK_ROUTES`, `STUDENT_ROUTES` — all resolve | PASS |

### Locked-constraint proofs

Baseline note: `git diff main` is unusable here — `main` sits at the merge-base from long before Phase 6, so it would show the entire Phases 6-11 history as "changed." Used `98f4577` instead, the commit immediately preceding 11-01's first commit (`8df5a75`), confirmed via `git log --oneline ec86e4d..HEAD`.

| Check | Result | Status |
|---|---|---|
| `git diff 98f4577 -- prisma/schema.prisma` | empty | PASS |
| `git diff 98f4577 --name-only -- prisma/migrations` | empty | PASS |
| `git diff 98f4577 --name-only -- app/kiosk app/api/auth/kiosk-auto-login lib/s3-client.ts prisma/seed.ts scripts/sync-s3-to-db.ts` | empty | PASS |
| `grep -c "PROFESSOR" prisma/schema.prisma` | 1 (non-zero) | PASS |
| No `deleteMany`/`deleteObject` additions in the phase diff | `git diff 98f4577 -- app lib components middleware.ts \| grep -E '^\+.*(deleteMany\|deleteObject)'` → 0 hits | PASS |
| No cleanup/export script added | `git diff 98f4577 --name-only -- app lib components middleware.ts scripts prisma` → only expected deletions/edits (route/page deletions, `middleware.ts`, `lib/auth.ts`, `lib/roles.ts`, `lib/cohort-storage.ts`/`components/cohort-card.tsx` deletions, plus this plan's `app/chat/view/[session-id]/page.tsx` fix) | PASS |
| Deferred ideas stayed out (no access-code signup, aggregate usage view, schema cleanup, export tooling) | `grep -rn "access-code signup\|aggregate usage\|export tooling" app lib components` → 0 hits | PASS |

### Deleted-surface 404 proof (live, `npx next dev`, authenticated as `admin@example.com`)

Unauthenticated requests to any non-public route are 307-redirected to `/login` by middleware *before* Next.js ever resolves the route — that redirect looks identical whether the route was deleted or never existed. Logged in via `POST /api/auth/login` to get a real session cookie, then re-tested all targets against the actual route resolver.

**Deleted pages** — all 404 when authenticated:

| Path | HTTP (authenticated) |
|---|---|
| `/codes` | 404 |
| `/cohort-management` | 404 |
| `/teacher/class/x` | 404 |
| `/student-history` | 404 |
| `/users-and-usages` | 404 |
| `/join/anything` | 404 |

**Deleted APIs (all 15 from the 11-03 checkpoint's "delete-all" decision)** — all 404 when authenticated:

| Path | HTTP | | Path | HTTP |
|---|---|---|---|---|
| `/api/cohort/add` | 404 | | `/api/codes/[id]/student/.../detail` | 404 |
| `/api/cohort/edit` | 404 | | `/api/codes/[id]/student/.../time-usage/[caseId]` | 404 |
| `/api/cohort/delete` | 404 | | `/api/codes/[id]/student/.../score/[caseId]` | 404 |
| `/api/cohort/get` | 404 | | `/api/codes/[id]/student/.../conversations/[caseId]` | 404 |
| `/api/cohort/join` | 404 | | `/api/codes/[id]/student/.../learning-curve/[caseId]` | 404 |
| `/api/cohort/list` | 404 | | `/api/student/cases` | 404 |
| `/api/cohort/send-invitations` | 404 | | | |
| `/api/codes/[id]/gradebook` | 404 | | | |
| `/api/codes/[id]/learner-performance` | 404 | | | |

**Kept API routes still respond normally (not 404)** — spot-checked `/api/avatar/get`, `/api/case/add`, `/api/chat/list`:
- Unauthenticated: all three `307` (redirect to `/login`, expected — none is public)
- Authenticated as admin: `400`, `405`, `200` respectively (normal admin-gated app responses, not `404`)

All PASS.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1/Rule 3 — dangling reference] `app/chat/view/[session-id]/page.tsx` still linked to deleted `/users-and-usages`**
- **Found during:** Task 1, the dead-reference grep sweep
- **Issue:** Four `router.push("/users-and-usages")` calls (delete-session redirect, error-state "Back to Admin" button x2, header "Back to Admin" button) pointed at the admin page 11-01 deleted. This file was never in any prior Phase 11 plan's file list, so it was missed. `/api/chat/*` (its own data source) is unaffected — only the navigation target was stale.
- **Fix:** Repointed all four to `/` (the dashboard) — the only remaining reachable "admin landing" page. No other logic changed.
- **Files modified:** `app/chat/view/[session-id]/page.tsx`
- **Verification:** `npx tsc --noEmit` clean; re-run dead-reference grep returns 0 hits.
- **Commit:** `01ebd2e`

---

**2. [Checkpoint-authorized — pre-existing Phase 9 defect] `components/scenario/ScenarioCard.tsx` nested `<button>` inside `<button>`, causing a hydration error**
- **Found during:** Task 2, the human walkthrough — the user hit this live on `/case-play` while testing step 3 (self-service scenario flow) and reported the console error mid-checkpoint.
- **Issue:** The owned-scenario card used HeroUI's `<Card isPressable onPress={handleCardClick}>`, which renders as a native `<button>`. Nested inside it (only when `owned` is true) were three owner-action `<Button>` components (Edit/Publish/Delete), each also a native `<button>`. `<button>` cannot legally contain `<button>` per the HTML spec, which produced a React hydration mismatch. This is **pre-existing Phase 9 code** — `components/scenario/ScenarioCard.tsx` was not in Phase 11's diff (confirmed against the `98f4577` baseline) — and outside this plan's stated scope (its own constraint text: "FIX IT in place only if it is a one-line dangling-reference fix. Anything larger gets recorded as a finding, not improvised"). This was more than a one-liner, so per that rule it was surfaced to the user as a finding rather than improvised, and the user explicitly authorized the fix (relayed by the orchestrator) rather than deferring it.
- **Fix:** Removed `isPressable`/`onPress` from the `Card`; wrapped it in a plain `<div role="button" tabIndex={0} onClick={handleCardClick} onKeyDown={handleCardKeyDown}>`, with a new `handleCardKeyDown` activating on Enter/Space (matching native button keyboard semantics). Hand-replicated `isPressable`'s two visual/interaction affordances that the plain `Card` no longer provides — press-scale (`active:scale-[0.97]`) and tap-highlight suppression (`tap-highlight-transparent`, a real HeroUI-plugin Tailwind utility already used elsewhere in this codebase, confirmed via `node_modules/@heroui/theme`) — plus a `focus-visible` ring on the new interactive element since keyboard focus moved from the `Card` to the wrapping `div`. `Card`'s own className, structure, and every child `Button`'s existing `e.stopPropagation()` call are unchanged, so clicking Edit/Publish/Delete still does not trigger the card's play action, and both the `owned` and non-owned rendering paths are preserved. Ran `npx prettier --write` afterward purely to re-indent the newly-nested JSX block consistently — confirmed via `git diff` that this was whitespace-only, no logic changed.
- **Files modified:** `components/scenario/ScenarioCard.tsx`
- **Verification:** `npx tsc --noEmit` clean. Server-rendered `/case-play` HTML (authenticated as `admin@example.com`) shows max `<button>` nesting depth of 1 (previously would have been 2 for an owned card). **Caveat:** `/case-play` is a `"use client"` component that fetches its scenario list via `useEffect` after mount, so the curl-captured SSR HTML only contains the loading skeleton, not the actual rendered cards — no headless browser (Playwright/Puppeteer) was available in this environment to drive a real client-side render and directly re-trigger (or confirm the absence of) the original hydration console warning. This was flagged back to the user, who is asked to confirm the warning is gone on refresh as part of resuming the walkthrough.
- **Authorization:** Explicitly authorized by the user via the orchestrator, including the specific implementation requirements (preserve visual appearance exactly, preserve keyboard accessibility, keep `stopPropagation` on child buttons, keep both card variants working) — not a Rule 1-3 auto-fix taken on this plan's own discretion.
- **Commit:** `5780ccd`

---

**Total deviations:** 2 (1 auto-fixed trivial dangling reference; 1 checkpoint-authorized fix to a pre-existing, out-of-phase-scope defect found during the human walkthrough)

## Issues Encountered

- The `git diff main` baseline issue (worked around by using `98f4577` instead — documented as a pattern for future phase-closeout sweeps).
- The nested-`<button>` hydration error in `ScenarioCard.tsx` (see deviation #2) — found by the user during their own walkthrough of step 3, not by the static sweep (a static grep/tsc pass cannot catch invalid-HTML-nesting-via-component-composition; only a real render does). Fixed under explicit user authorization; full browser-level re-verification is still pending the user's own refresh.

## User Setup Required

None yet — Task 2 (human end-to-end walkthrough) is still open and in progress. The user hit and authorized a fix for one real defect (see deviation #2 above) partway through; they still need to confirm the fix and complete/confirm the remaining walkthrough steps. See the CHECKPOINT REACHED message returned to the orchestrator for the exact script.

## Next Phase Readiness

- All static checks pass. `npx tsc --noEmit` is clean, working tree is clean apart from this plan's own commit, and every locked constraint (Prisma schema/migrations, kiosk, S3 client, PROFESSOR enum, no data-deletion code, no deferred-idea leakage) is proven unchanged.
- Task 2 (human walkthrough) is a blocking checkpoint. Task 3 (recording phase completion in STATE.md/ROADMAP.md) does not run until the user explicitly signs off.

---
*Phase: 11-cohort-staff-teardown*
*In progress — awaiting Task 2 human sign-off*

## Self-Check: PENDING (Task 1 only; full self-check runs after Task 3)
- FOUND: `app/chat/view/[session-id]/page.tsx` (fix applied, confirmed via `grep -n "router.push" `)
- FOUND: commit `01ebd2e`
