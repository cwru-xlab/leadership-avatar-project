---
phase: 11-cohort-staff-teardown
plan: 04
subsystem: api
tags: [nextjs, prisma, s3, interaction-start, scenario-publishing]

requires:
  - phase: 11-cohort-staff-teardown (11-01)
    provides: All staff/assignment PAGE trees deleted, so no page sets a cohortId query param anymore
provides:
  - "/api/interaction/start no longer 400s on a missing cohortId; case-play's admin start flow works with the pages gone"
  - "Documented audit proving the scenario publishing path (add/edit/list/publish) and case-play's cohort references are already fully neutralized by Phase 9/10, needing zero edits"
affects: [11-06]

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - app/api/interaction/start/route.ts

key-decisions:
  - "cohortId stays in the request destructure and the InteractionLog object exactly as before; only the field-validation guard is relaxed. Request/response shape is unchanged."
  - "app/case-play/[caseId]/page.tsx is confirmed READ-ONLY for this plan by design — its dormant cohortId query-param read and the avatar-time-limit effect's dead /api/cohort/get gate are left in place unconditionally. Any checkpoint-driven removal is explicitly deferred to 11-06 Task 3."

patterns-established: []

requirements-completed: []

duration: 15min
completed: 2026-09-23
---

# Phase 11 Plan 04: Relax interaction/start cohortId guard + audit live student path Summary

**One-line validation relaxation in `/api/interaction/start` plus a full read-only audit confirming the scenario publish/list/case-play cohort references are already inert from Phase 9/10 work.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-09-23T18:15:00Z
- **Completed:** 2026-09-23T18:34:00Z
- **Tasks:** 2
- **Files modified:** 1 (`app/api/interaction/start/route.ts`)

## Accomplishments

- Dropped `!cohortId` from the required-field guard in `POST /api/interaction/start` and updated the error message; the `cohortId` destructure and the `InteractionLog.cohortId` field are untouched, so the request/response shape is byte-identical apart from the relaxed guard. This is the one real bug the 11-01 page deletions surfaced (case-play's admin Case Study start flow was hard-400ing on a missing `cohortId` that no surviving page can ever supply).
- Audited (read-only, zero edits) `app/api/scenario/add/route.ts`, `app/api/scenario/edit/route.ts`, `app/api/scenario/list/route.ts`, `app/api/scenario/publish/route.ts`, and `app/case-play/[caseId]/page.tsx`. Every expected finding from the plan was confirmed exactly as predicted — see "Audit Findings" below.
- Confirmed the self-service publishing path (`/api/scenario/publish` → `loadOwnedScenario`, `/api/scenario/list` → `{ mine, shared }` projection omitting `ownerId`/`cohortIds`, `app/case-play/page.tsx` → admin cases via `publishedOnly=true` filtered to `!c.ownerId` + student scenarios via `/api/scenario/list`) already fully satisfies "individual users create and own all of their own practice work" with zero staff/cohort involvement, entirely via pre-existing Phase 9 code.

## Task Commits

1. **Task 1: Relax the cohortId requirement in /api/interaction/start** - `d3e3345` (fix)
2. **Task 2: Audit the remaining live student files** - no commit (read-only, zero files modified — confirmed via `git status --short app/api/scenario app/case-play`)

**Plan metadata:** (this commit)

## Files Created/Modified

- `app/api/interaction/start/route.ts` - Field-validation guard no longer requires `cohortId`; destructure and `InteractionLog` field retained unchanged; added an in-code comment explaining `cohortId` is kept for shape compatibility only.

## Audit Findings (Task 2, confirmed, no edits made)

- `app/api/scenario/add/route.ts:88` — always writes `cohortIds: []`. Inert, confirmed.
- `app/api/scenario/edit/route.ts:65` — carries `cohortIds: existing.cohortIds` forward unchanged. Inert, confirmed.
- `app/api/scenario/list/route.ts` — `toSharedProjection` omits both `cohortIds` and `ownerId` from the shared projection (doc comment at line 19-20 explicitly explains why). Inert, confirmed.
- `app/case-play/[caseId]/page.tsx:108` — `const cohortId = searchParams.get("cohortId") || ""`. No surviving page sets this query param (the only ones that did lived under `/codes` and `/cohort-management`, deleted in 11-01). Permanently `""`. Confirmed, not edited.
- `app/case-play/[caseId]/page.tsx:305-328` — the `avatar-time-limit` effect gated on `if (!user?.email || !cohortId || !caseId) return;`, fetching `/api/cohort/get`. Permanently short-circuits since `cohortId` is always `""`. Left in place unconditionally, per the plan's explicit "no exception" instruction — any removal belongs to 11-06 Task 3, which is the first plan whose dependency graph guarantees the 11-03 checkpoint outcome has been recorded.
- `app/case-play/[caseId]/page.tsx:744` (line number shifted slightly from the plan's ~731 estimate due to unrelated file growth) — `cohortId` still passed into the `/api/interaction/start` body in the `!isScenario` branch. Made safe by Task 1; no edit needed here.
- `app/api/scenario/publish/route.ts` — owner-scoped via `loadOwnedScenario(body.id, currentUser.id)`, 404s for non-owners, toggles `published`. Confirmed already built, unchanged.
- `app/api/scenario/list/route.ts` — returns `{ mine, shared }` exactly as documented. Confirmed.
- `app/case-play/page.tsx` — admin cases via `/api/case/list?publishedOnly=true` filtered to `!c.ownerId`; student scenarios via `/api/scenario/list`. Confirmed; legacy admin-authored S3 cases remain a published, unowned library visible to everyone.

No finding fell short of the locked decision; nothing required deferral to a future plan beyond the already-planned 11-06 Task 3 hookup point.

## Decisions Made

- Kept `cohortId` fully present in both the request destructure and the persisted `InteractionLog` object — only the validation guard changed. This preserves the request/response shape exactly, matching the plan's locked "fields stay present but are always null/ignored" decision.
- Confirmed via audit (not asserted from memory) that the scenario publishing/discovery path needs zero changes to satisfy success criterion 2; documented the specific code paths rather than taking the plan's expected findings on faith.
- `app/case-play/[caseId]/page.tsx` was read but never written, exactly as the plan's hard constraint requires; any cleanup of the now-fully-dead `avatar-time-limit` effect is explicitly left for 11-06 Task 3.

## Deviations from Plan

### Auto-fixed Issues

None required for the two tasks themselves — both executed exactly as specified.

### Process Issue (not a plan deviation, logged for transparency)

**Shared git index race with concurrently-executing sibling plans (11-02, 11-03)**

- **Found during:** Task 1's commit step.
- **Issue:** This project runs concurrent executor agents in the same working directory with no worktree isolation — a hazard already documented in `08-08-SUMMARY.md` and `09-02-SUMMARY.md`. When `git add app/api/interaction/start/route.ts && git commit` was run, the shared git index already had plan 11-02's `app/api/student-history/**` and `lib/student-history-service.ts` deletions staged (11-02 running concurrently in wave 2). `git commit` commits the full index, not just the pathspec passed to the preceding `git add`, so those 10 file deletions were swept into commit `d3e3345` under this plan's message.
- **Compounding issue:** Attempting to correct this with `git reset --soft HEAD~1` raced against sibling plan 11-03, which committed its own `11-CALLER-MAP.md` work (`8d2a384`) in the moments between my `git add` and my `reset` command. Because `HEAD~1` is resolved at command-execution time against the then-current HEAD, my reset actually undid **11-03's** commit instead of my own.
- **Fix:** Immediately re-committed 11-03's exact content (`.planning/phases/11-cohort-staff-teardown/11-CALLER-MAP.md`) verbatim under its original commit message and author, restoring it as `a9fe820`. Left `d3e3345` (my original commit, containing both my genuine change and 11-02's swept-in deletions) as-is rather than attempting a second history rewrite while 11-02 might still be actively committing — the deletions are 11-02's real, correct, already-verified work (matches 11-02's `files_modified` frontmatter exactly); only the commit message/authorship attribution is imprecise, not the content.
- **Files affected:** No files outside the two plans' own declared scopes were touched incorrectly — the content of every file is correct; only commit boundaries got crossed.
- **Verification:** `git log --oneline -6` confirms both `d3e3345` (this plan's fix, co-mingled with 11-02's deletions) and `a9fe820` (11-03's restored commit) are present in history in the correct order relative to `11-01`; `git status --short` is clean of any residual staged/unstaged changes from either sibling's work.
- **Recommendation for orchestrator:** 11-02's own executor/summary should note that its `app/api/student-history/**` and `lib/student-history-service.ts` deletions are physically committed as part of `d3e3345` (this plan's commit), not under its own commit hash, when it writes its SUMMARY.md's Task Commits section.

---

**Total deviations:** 0 plan deviations; 1 process/tooling incident from concurrent-agent git index sharing, corrected without any data loss.
**Impact on plan:** None on this plan's own deliverable — `app/api/interaction/start/route.ts` is the only file this plan wrote, and its diff is exactly the guard relaxation described in Task 1. The incident is purely a commit-attribution artifact of the shared-repo concurrency model already logged as a known risk in earlier phases.

## Issues Encountered

See "Process Issue" above. No issues within the two tasks' own scope — both tasks completed cleanly on the first attempt with all specified verifications passing.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `/api/interaction/start` no longer blocks the admin Case Study start flow now that the cohort-linking pages are gone; request/response shape unchanged for any other caller.
- The self-service scenario publishing path is verified end-to-end in code as already satisfying success criterion 2, with no further work needed in this area.
- `app/case-play/[caseId]/page.tsx`'s dead `avatar-time-limit` effect and dormant `cohortId` query-param read remain exactly as they were, deliberately unedited; 11-06 Task 3 is the designated place to act on them once the 11-03 checkpoint outcome is known.
- Flagged for the orchestrator: 11-02's `SUMMARY.md` (present as an untracked file, `11-02-SUMMARY.md`, at the time this summary was written) should record that its file deletions landed inside commit `d3e3345`, not a commit of its own — see the Deviations section above for the full incident.

---
*Phase: 11-cohort-staff-teardown*
*Completed: 2026-09-23*

## Self-Check: PASSED

- FOUND: `app/api/interaction/start/route.ts`
- FOUND: `.planning/phases/11-cohort-staff-teardown/11-04-SUMMARY.md`
- FOUND: commit `d3e3345`
- FOUND: commit `a9fe820`
