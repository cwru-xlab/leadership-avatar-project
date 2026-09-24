---
phase: 11-cohort-staff-teardown
plan: 03
subsystem: api
tags: [nextjs, middleware, api-teardown, jwt-auth]

# Dependency graph
requires:
  - phase: 11-cohort-staff-teardown
    provides: "11-01's page-tree deletions (which made every route in this plan's caller map callerless) and the deferred /api/cohort + /api/codes + /api/student/cases middleware entries it intentionally left untouched pending this checkpoint"
provides:
  - "All 15 checkpoint-gated API routes (/api/cohort/*, /api/codes/*, /api/student/cases) deleted per explicit user decision"
  - "lib/cohort-storage.ts deleted (its only purpose was wrapping the now-deleted /api/cohort/* group)"
  - "middleware.ts PUBLIC_ROUTES, ADMIN_ROUTES, STUDENT_ROUTES pruned of every entry for a deleted route"
  - "11-CALLER-MAP.md: per-route caller verification the user's decision was based on"
affects: [11-05-middleware-role-cleanup, 11-06-case-play-followup, 11-07-schema-cleanup]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - .planning/phases/11-cohort-staff-teardown/11-CALLER-MAP.md
  modified:
    - middleware.ts

key-decisions:
  - "User chose 'delete-all' at the Task 2 checkpoint: all 15 routes, plus lib/cohort-storage.ts, plus both PUBLIC_ROUTES entries removed. types/cohort.ts explicitly kept (lib/s3-client.ts still imports Cohort from it)."

patterns-established: []

requirements-completed: []

# Metrics
duration: "~5min (Task 1+2 in prior session) + ~15min (Task 3+4 this session)"
completed: 2026-09-23
---

# Phase 11 Plan 03: Cohort/Codes/Student-Cases API Teardown Summary

**Deleted all 15 checkpoint-gated API routes (/api/cohort/*, /api/codes/*, /api/student/cases) plus lib/cohort-storage.ts and their middleware gate entries, per the user's explicit "delete-all" decision — types/cohort.ts kept because lib/s3-client.ts still imports it.**

## Performance

- **Duration:** Task 1+2 ~5 min (prior session, ending at checkpoint) + Task 3+4 ~15 min (this continuation session)
- **Task 1 committed:** 2026-09-23T14:32:32-04:00 (`a9fe820`)
- **Task 3 committed:** 2026-09-23T14:37:21-04:00 (`e75e1e6`)
- **Tasks:** 4 (1 auto, 1 checkpoint, 1 auto, 1 docs/state — this SUMMARY)
- **Files modified:** 17 (16 deleted route/lib files + middleware.ts)

## User's Verbatim Decision (Task 2 checkpoint)

> The user chose option 1: **delete-all**.
> 1. Delete ALL 15 routes: /api/cohort/* (7: add, edit, delete, get, join, list,
>    send-invitations), /api/codes/* (7: [codeId]/gradebook, [codeId]/learner-performance,
>    [codeId]/student/[studentEmail]/detail, .../time-usage/[caseId], .../score/[caseId],
>    .../conversations/[caseId], .../learning-curve/[caseId]), and /api/student/cases (1).
> 2. Also delete `lib/cohort-storage.ts` (zero importers; its only purpose was wrapping the
>    now-deleted /api/cohort/* group).
> 3. Remove BOTH `/api/cohort/join` and `/api/cohort/get` from `PUBLIC_ROUTES` in
>    `middleware.ts`, and remove any now-dangling middleware route-array entries for the
>    deleted routes (including the `/api/student/cases` `STUDENT_ROUTES` gate entry).
> 4. `types/cohort.ts` MUST be KEPT — `lib/s3-client.ts` imports `Cohort` from it and is out
>    of scope. Do not delete or modify it.

Every item above was applied exactly, and nothing else was touched.

## Accomplishments

- Re-verified caller map (`11-CALLER-MAP.md`) confirming all 15 routes had zero live callers
  post-11-01, with `/api/cohort/get`'s one textual (unreachable) reference precisely recorded
- Deleted all 7 `/api/cohort/*` route files, all 7 `/api/codes/*` route files (including the
  nested `[codeId]/student/[studentEmail]/*/[caseId]` tree), and `/api/student/cases/route.ts`
- Deleted `lib/cohort-storage.ts` (had zero importers after 11-01)
- Removed `/api/cohort/join` and `/api/cohort/get` from `middleware.ts` `PUBLIC_ROUTES`
- Removed the 5 dangling `ADMIN_ROUTES` entries (`/api/cohort/add`, `/edit`, `/delete`,
  `/list`, `/send-invitations`) and the `/api/codes` prefix entry
- Removed the `/api/student/cases` entry from `STUDENT_ROUTES`
- Confirmed `types/cohort.ts` survives — only remaining importer is `lib/s3-client.ts`
- `npx tsc --noEmit` clean (after clearing a stale `.next` type-validator cache that still
  referenced the just-deleted route files — not a real error, just Next.js's generated route
  manifest catching up)

## Task Commits

1. **Task 1: Re-verify caller map, write 11-CALLER-MAP.md** - `a9fe820` (docs) — from prior session
2. **Task 2: CHECKPOINT** - resolved by user decision (no code changes; decision recorded above)
3. **Task 3: Apply the user's delete-all decision** - `e75e1e6` (feat, route/file deletions) + `a09dc25` (feat, middleware.ts — see Deviations)

**Plan metadata:** this SUMMARY + STATE.md/ROADMAP.md updates (separate commit, see below)

## Files Created/Modified

- `.planning/phases/11-cohort-staff-teardown/11-CALLER-MAP.md` - per-route caller verification (Task 1, prior session)
- `app/api/cohort/{add,edit,delete,get,join,list,send-invitations}/route.ts` - deleted
- `app/api/codes/[codeId]/{gradebook,learner-performance}/route.ts` - deleted
- `app/api/codes/[codeId]/student/[studentEmail]/{detail,time-usage/[caseId],score/[caseId],conversations/[caseId],learning-curve/[caseId]}/route.ts` - deleted
- `app/api/student/cases/route.ts` - deleted
- `lib/cohort-storage.ts` - deleted
- `middleware.ts` - `PUBLIC_ROUTES`, `ADMIN_ROUTES`, `STUDENT_ROUTES` pruned of entries for the deleted routes; role-comparison logic untouched per plan constraint

## Decisions Made

- Followed the user's "delete-all" checkpoint decision exactly — no per-route deviation.
- `types/cohort.ts` kept, exactly as the plan and user decision required, verified by grep
  showing its only remaining importer is `lib/s3-client.ts`.
- `prisma/schema.prisma`, `lib/s3-client.ts`, `app/kiosk` verified byte-unchanged (`git diff
  --stat` empty) per the plan's hard constraints.

## Deviations from Plan

**1. [Rule 3 - Blocking] `middleware.ts` silently dropped from the Task 3 commit, fixed with a follow-up commit**
- **Found during:** Task 4 (final verification, this SUMMARY)
- **Issue:** The `git add app/api/cohort app/api/codes app/api/student/cases lib/cohort-storage.ts middleware.ts` command used to stage Task 3's changes hit `fatal: pathspec 'app/api/cohort' did not match any files` (those paths were already `git rm`'d, so they no longer exist as literal pathspecs) — `git add` aborted the whole command before it ever reached `middleware.ts`, but the already-`git rm`'d deletions were staged from the earlier `git rm` call and got committed anyway (`e75e1e6`), silently leaving `middleware.ts`'s edits uncommitted and undetected until the post-commit `git status --short` sanity check in Task 4.
- **Fix:** Staged and committed `middleware.ts` on its own in a new commit (`a09dc25`) with the exact same three edits described above (PUBLIC_ROUTES, ADMIN_ROUTES, STUDENT_ROUTES pruning) — no content changed, purely a corrective commit split.
- **Files modified:** `middleware.ts` (already-written content, just actually committed this time)
- **Verification:** `git diff middleware.ts` now empty against HEAD; `npx tsc --noEmit` clean.
- **Committed in:** `a09dc25`

Beyond that one process fix, the plan executed exactly as written and exactly as the user's
checkpoint decision specified. Also worth noting: `npx tsc --noEmit` initially reported 15
`TS2307` errors pointing at the just-deleted route files; these came from
`.next/dev/types/validator.ts`, a generated Next.js type-validator cache that had not yet
caught up to the deletion. Clearing `.next` (safe, purely a build artifact) and re-running
`tsc --noEmit` produced zero errors — not a Rule 1/2/3 fix, no source file was changed to
resolve it, only a stale generated cache was cleared.

---

**Total deviations:** 1 auto-fixed (1 blocking — a staging/commit process error, not a code defect)
**Impact on plan:** No functional or scope impact; the intended middleware.ts content was correct from the start and is now correctly committed.

## Issues Encountered

None beyond the stale `.next` cache noted above.

## case-play follow-up (for 11-06)

`app/case-play/[caseId]/page.tsx` was deliberately **not edited** in this plan (out of scope
per the plan's hard constraints). It still contains a `useEffect` at lines ~303-328 that calls
the now-deleted `GET /api/cohort/get`:

```ts
const res = await fetch(`/api/cohort/get?id=${encodeURIComponent(cohortId)}`);
```

This call is gated on `cohortId` (from `searchParams.get("cohortId") || ""`) being truthy.
Per `11-CALLER-MAP.md`'s Task 1 finding, no surviving code anywhere in the repo ever sets a
`cohortId` query param when linking to `/case-play/[caseId]`, so this branch was already
unreachable at runtime even before this plan's deletions. Now that `/api/cohort/get` itself
returns 404, if this branch ever did fire, `fetch` would resolve with a 404 response rather
than throwing — worth confirming the surrounding error handling degrades gracefully if that
matters, but since the branch is unreachable it has no observable effect today.

**11-06 Task 3 owns removing this dead effect** — the plan-03 constraints explicitly forbid
editing `case-play` from this plan, and 11-06 is the first wave-4 plan guaranteed (via
11-06 -> 11-05 -> 11-03) to see this SUMMARY. No user request was made to remove it during
the Task 2 checkpoint, so this is a hygiene follow-up rather than a blocking item.

## Next Phase Readiness

- The cohort/codes/student-cases API surface is now fully gone, matching the "delete UI +
  delete APIs" outcome the user chose. `types/cohort.ts` remains as the one surviving artifact,
  correctly still needed by `lib/s3-client.ts`.
- 11-05 (middleware role-check cleanup) can now proceed against a middleware.ts that has zero
  dangling route-array entries for anything this plan touched. `student-history` middleware
  entries were explicitly left alone per 11-02's deferral and are still 11-05's to handle.
- 11-06 has a clear, verbatim pointer to the one remaining dead reference
  (`app/case-play/[caseId]/page.tsx`'s `/api/cohort/get` effect) that needs removal.
- 11-07 (deferred schema cleanup) is now unblocked on the API-surface side of its
  precondition — no live route reads/writes cohort-scoped data anymore via the deleted
  endpoints.

---
*Phase: 11-cohort-staff-teardown*
*Completed: 2026-09-23*

## Self-Check: PASSED
