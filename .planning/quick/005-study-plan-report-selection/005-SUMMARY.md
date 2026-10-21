---
phase: quick/005-study-plan-report-selection
plan: 005
subsystem: api
tags: [nextjs, prisma, react, study-plan, study-plan-generation]

requires:
  - phase: 21-adaptive-mastery-path
    provides: "lib/study-plan/checks/sources.ts's ownership-in-the-WHERE-clause pattern, followed here"
provides:
  - "MAX_REPORTS_PER_PLAN = 10, exported from the generate route and read by the picker UI and the verifier"
  - "Optional ownership-scoped reportIds[] selection on POST /api/study-plans/generate"
  - "A picker on app/reports/page.tsx listing eligible interviews with type/date/score, cap-enforced"
  - "consideredReportCount / eligibleReportCount in the generate response"
affects: [study-plan-generation, reports-ui]

tech-stack:
  added: []
  patterns:
    - "selectReportsForPlan/buildAnonymousReports extracted from the route handler as plain exported async/pure functions so a verifier can exercise real DB logic with no HTTP layer and no OpenAI call"
    - "MAX_SOURCE_REPORTS's 413 guard narrowed to the no-selection path only — a caller that supplies a selection has already capped the set, so the guard no longer blocks accounts with a large total history once they select"

key-files:
  created:
    - scripts/verify-study-plan-selection.ts
  modified:
    - app/api/study-plans/generate/route.ts
    - app/reports/page.tsx

key-decisions:
  - "Cap is 10, named MAX_REPORTS_PER_PLAN, exported for the UI and verifier to share."
  - "MAX_SOURCE_REPORTS = 50 stays unchanged, with its guard narrowed to apply only on the no-explicit-selection path, keeping the 413 reachable by a direct API call while unreachable through the UI (which always sends a selection)."
  - "No selection supplied -> most recent N by completedAt desc, then reversed to oldest-first to preserve the existing reportNumber ordinal convention."
  - "Ownership enforced in the WHERE clause (id: {in: ids}, userId) exactly as lib/study-plan/checks/sources.ts established; an under-returned row count refuses the whole request with a named ineligible count rather than silently narrowing to the owned subset."
  - "Extracted selectReportsForPlan and buildAnonymousReports from POST as exported functions purely to make the verifier able to exercise real database logic directly, with no HTTP/cookie/OpenAI mocking required. Response shape and status codes are unchanged."

requirements-completed: [SPS-01, SPS-02, SPS-03, SPS-04]

duration: 45min
completed: 2026-10-21
---

# Quick Task 005: Per-Plan Interview Selection Summary

**Optional ownership-scoped `reportIds[]` selection with a 10-report cap and recent-N default on the study-plan generate route, plus a cap-enforced picker on the reports page — makes the 413 "history too large" refusal unreachable through the UI while keeping it reachable on a direct API call.**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-10-21T02:05Z (plan commit)
- **Completed:** 2026-10-21T02:18Z (last task commit) — plus verification and this summary
- **Tasks:** 3 of 4 (Task 4 is the blocking human-verify gate; stopped there per plan)
- **Files modified:** 2 (`app/api/study-plans/generate/route.ts`, `app/reports/page.tsx`); 1 created (`scripts/verify-study-plan-selection.ts`)

## Accomplishments

- `MAX_REPORTS_PER_PLAN = 10` exported from the generate route, read by the picker UI (mirrored as a literal constant, since the route is server-only) and imported directly by the verifier.
- `POST /api/study-plans/generate` accepts an optional `{ reportIds?: string[] }` body. A malformed body (invalid JSON, missing field, non-array, non-string entries) degrades to "no selection" — never throws.
- Ownership is enforced in the Prisma `WHERE` clause (`id: { in: reportIds }, userId`), never a post-filter. If the ownership-scoped query returns fewer rows than ids supplied (a foreign id, or an ineligible one), the whole request is refused with a 400 naming how many were not eligible — never silently narrowed to a subset.
- Over-cap selections (`reportIds.length > 10`) are refused with 400, naming the cap in the message.
- No selection supplied → most recent 10 eligible reports by `completedAt desc`, reordered oldest-first to preserve the existing `reportNumber` ordinal convention.
- `MAX_SOURCE_REPORTS = 50`'s 413 guard is narrowed to apply **only** on the no-explicit-selection path. A caller that supplies a selection (which the UI always does) bypasses it entirely — this is what makes `alice.johnson@case.edu` (56 eligible reports) able to generate a plan, without raising or removing the guard itself. A direct API call with no body and >50 eligible reports still gets refused with 413.
- Success response now includes `consideredReportCount` (how many fed this plan) and `eligibleReportCount` (how many exist in total), so a student is never told "every report was considered" when it wasn't.
- `app/reports/page.tsx` gained a picker card: lists eligible interviews with type, date, and content/behavioral score, each with a checkbox; defaults to the most recent 10 selected (zero interaction needed for the primary action); disables further checkboxes at the cap with a visible "Cap reached — deselect one first" message; sends `{ reportIds }` on generate; shows "Built from N of your M completed interviews" after generation, additive to the existing "Based on N completed reports" line.
- `scripts/verify-study-plan-selection.ts`: Section 1 (no DB, no network) proves `buildAnonymousReports`'s output carries only `AnonymousBehavioralReport`'s four own keys, with an inverted assertion proving the exact-four-keys comparison actually fails on a widened object. Section 2 (DB-backed, ran against the local Postgres instance — no SKIP) proves: a foreign report id is refused rather than silently dropped; over-cap selection refused with the cap named (plus an inverted check that exactly-at-cap succeeds); an ineligible (`IN_PROGRESS`) selected id is refused; no-selection yields exactly the most recent 10 with correct `consideredReportCount`/`eligibleReportCount`; and `MAX_SOURCE_REPORTS`'s 413 is reachable with no selection but bypassed by the same account once it supplies a selection. 27 checks, 0 failures.

## Task Commits

1. **Task 1: Ownership-scoped selection and a recent-N default in the route** - `9f776f8` (feat)
2. **Task 2: The picker on the study-plan surface** - `417ba7a` (feat)
3. **Task 3: Verifier** - `a1cc130` (test) + `9705bd8` (docs — restored a guard comment lost during the extraction refactor)

**Plan metadata:** pending (this summary + STATE.md commit, below)

## Files Created/Modified

- `app/api/study-plans/generate/route.ts` — exports `MAX_REPORTS_PER_PLAN`, `selectReportsForPlan`, `buildAnonymousReports`; `POST` now parses an optional `reportIds[]` body and delegates selection to `selectReportsForPlan`.
- `app/reports/page.tsx` — additive-only (+145 lines from Task 2, +0 further net lines from the Task 3 restoration which touched only route.ts) picker card, selection state, and honest built-from messaging.
- `scripts/verify-study-plan-selection.ts` — new battery, 27 checks, DB section runs (not skipped).

## Decisions Made

See `key-decisions` in frontmatter. The one worth calling out again: the 50-report guard's scope changed from "always checked on every request" to "checked only when the caller supplies no selection." This was necessary — checking it unconditionally would have kept `alice.johnson@case.edu` permanently blocked even after choosing 10 specific interviews, which defeats the entire purpose of this plan. The guard's original intent (refuse a pathological history on a direct call, never silently truncate) is fully preserved; only its reachability through the UI changed, exactly as `21-PLAN.md`'s objective specified.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extracted `selectReportsForPlan`/`buildAnonymousReports` from `POST` as exported functions**
- **Found during:** Task 3 (writing the verifier)
- **Issue:** The plan's Task 1 left all selection logic inline inside the `POST` handler. The verifier needs to exercise ownership scoping, the cap, the default, and the anonymous-payload shape against a real database — but calling `POST` directly would require mocking cookies, `getCurrentUser`, and (worse) a real OpenAI call to `generateStudyPlan`, none of which the plan's verify steps call for.
- **Fix:** Extracted the DB-querying selection logic into an exported `selectReportsForPlan(userId, selectedReportIds)` returning a discriminated `ReportSelectionOutcome`, and the anonymous-payload mapping into an exported `buildAnonymousReports(rows)`. `POST`'s behavior, response shapes, and status codes are unchanged — it now just calls these two functions and formats their result.
- **Files modified:** `app/api/study-plans/generate/route.ts`
- **Verification:** `npx tsc --noEmit` clean; `npx next build` exits 0; `npx tsx scripts/verify-moment-boundary.ts` exits 0 (frozen path still intact); the verifier itself exercises both functions successfully against the real DB.
- **Committed in:** `a1cc130` (Task 3 commit), with a follow-up `9705bd8` restoring an explanatory comment on the 413 guard that was lost in the extraction.

**2. [Rule 1 - Bug caught before commit] 413 guard would have blocked a valid selection**
- **Found during:** Task 1, before the first commit
- **Issue:** My first draft of the route checked `eligibleReportCount > MAX_SOURCE_REPORTS` unconditionally, after computing the full eligible count. That would have kept `alice.johnson@case.edu` blocked even when she explicitly selected 10 reports, since her total eligible count (56) always exceeds 50 regardless of what she selects — directly contradicting this plan's stated purpose.
- **Fix:** Moved the `MAX_SOURCE_REPORTS` check inside the no-selection branch only, before that branch's recent-N query.
- **Files modified:** `app/api/study-plans/generate/route.ts`
- **Verification:** Verifier's Section 2e proves both halves: no-selection with 51 eligible reports is refused with 413, and the same account with an explicit selection of 10 succeeds.
- **Committed in:** `9f776f8` (caught and fixed before Task 1's commit — not a separate commit)

**3. [Rule 1 - Bug caught before commit] `app/reports/page.tsx` diff initially contained 8 deletions**
- **Found during:** Task 2, during the required `git diff --numstat` verification step
- **Issue:** My first draft replaced the existing `eligibleReportCount` `useMemo` and the "Based on N completed reports" paragraph rather than adding alongside them, violating the plan's additive-only constraint for this file.
- **Fix:** Restored both original blocks verbatim and added the new `eligibleReports` memo and the "Built from N of your M..." line as separate, additional code rather than replacements.
- **Files modified:** `app/reports/page.tsx`
- **Verification:** `git diff --numstat -- app/reports/page.tsx` shows 145 insertions, 0 deletions.
- **Committed in:** `417ba7a` (caught and fixed before Task 2's commit — not a separate commit)

---

**Total deviations:** 1 committed structural deviation (the route extraction, Rule 3) + 2 caught-before-commit bugs (Rule 1, never reached a commit in their broken form).
**Impact on plan:** The extraction is additive to the route's exports and does not change `POST`'s behavior, response shape, or status codes — verified by `tsc`, `next build`, and the moment-boundary guard all passing unchanged. No scope creep; both caught-before-commit bugs were exactly the bugs that would have defeated this plan's stated purpose (alice's history being large, and the reports page staying additive-only).

## Issues Encountered

None beyond the deviations above, all resolved before their respective task commits.

## Bite-Proof (Task 3 requirement)

To prove the verifier's ownership assertion actually bites, the `userId` clause was temporarily removed from `selectReportsForPlan`'s ownership-scoped query, the verifier was re-run, and the failure was captured verbatim before restoring the line:

```
EXIT:1
  FAIL A requesting A's + B's report ids is REFUSED (not silently narrowed to just A's) {
  ok: true,
  eligibleRows: [
    {
      id: '322a15f2-9e96-40c2-a36d-c864fd05af5e',
      scores: [Object],
      reportMarkdown: '**Ownership:** Strong.'
    },
    ... (B's report, id omitted here, was present too)
  ]
}
25 checks run, 1 failed.
```

After restoring the `userId` clause, the full battery passed again: `27 checks run, 0 failed.`

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Tasks 1-3 are complete, committed, and independently verified (`tsc`, `next build`, `verify-moment-boundary.ts`, `verify-study-plan-selection.ts` all green; `app/reports/page.tsx`'s diff has zero deletions). Task 4 is the blocking human-verify gate and has NOT been run — per the plan, it requires a human to confirm `alice.johnson@case.edu` (previously blocked at 56 eligible reports) can now generate a plan through the live UI. See the checkpoint returned alongside this summary for the exact steps.

---
*Phase: quick/005-study-plan-report-selection*
*Completed: 2026-10-21 (Tasks 1-3; Task 4 pending human verification)*

## Self-Check: PASSED

All referenced files (`app/api/study-plans/generate/route.ts`, `app/reports/page.tsx`, `scripts/verify-study-plan-selection.ts`, `005-PLAN.md`) exist, and all four referenced commit hashes (`9f776f8`, `417ba7a`, `a1cc130`, `9705bd8`) are present in git history.
