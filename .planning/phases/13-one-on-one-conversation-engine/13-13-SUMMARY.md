---
phase: 13-one-on-one-conversation-engine
plan: 13
subsystem: routing
tags: [typescript, nextjs, redirects, REQ-59, REQ-68, REQ-69, legacy-deletion]

# Dependency graph
requires:
  - phase: 13-one-on-one-conversation-engine
    provides: "/practice session + report pages from 13-10..13-12"
  - phase: 13-one-on-one-conversation-engine
    provides: "/api/practice/* engine routes from 13-07/13-08"
  - phase: 13-one-on-one-conversation-engine
    provides: "case-play runtime dispatcher (ownerId) from 13-11"
provides:
  - "next.config.js permanent redirects for legacy interview/case-play session+report URLs"
  - "Per-type trees deleted — one of each engine surface remains"
  - "Frozen pre-Phase-13 evaluation schema snapshots in verify-report-structure.ts"
affects: [13-14-req66-acceptance, 13-15-cleanup, "14-16 new interaction types"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "next.config redirects() with ((?!new(?:/|$))[^/]+) segment constraint — (?!new$) fails under path-to-regexp"
    - "Frozen inline schema snapshots replace deleted EVALUATION_JSON_SCHEMA / SCENARIO_EVALUATION_JSON_SCHEMA imports"

key-files:
  created: []
  modified:
    - next.config.js
    - app/interview/page.tsx
    - app/reports/page.tsx
    - app/case-play/page.tsx
    - components/scenario/ScenarioCard.tsx
    - components/interview/ReportCustomizationStrip.tsx
    - scripts/verify-report-structure.ts
  deleted:
    - app/interview/[type]/page.tsx
    - app/interview/[type]/report/[reportId]/page.tsx
    - app/case-play/[caseId]/report/[reportId]/page.tsx
    - components/interview/InterviewSessionShell.tsx
    - app/api/interview/session/{start,checkpoint,finish}/route.ts
    - app/api/scenario/session/{start,finish}/route.ts
    - app/api/interview/report/[reportId]/{route,retry/route}.ts
    - app/api/interview/reports/route.ts
    - app/api/scenario/report/[reportId]/route.ts
    - lib/interview/{evaluation,evaluation-runner,report-dto}.ts
    - lib/scenario/{evaluation,evaluation-runner,report-dto}.ts
    - lib/report/legacy-adapters.ts

key-decisions:
  - "Segment constraint is ((?!new(?:/|$))[^/]+) — verified: /case-play/new/report/x does not 308; /case-play/newer/report/x does."
  - "Dashboard tiles in lib/interactions/index.ts left pointing at /interview and /case-play indexes (still live; REQ-68 scopes redirects to session/report paths only)."
  - "ScenarioCard launches directly to /practice/case-study/{id}; admin CaseCard stays on /case-play/{id}."
  - "Deleted lib/report/legacy-adapters.ts with the routes that were its only consumers (Rule 3)."

patterns-established:
  - "Legacy deep links → permanent 308 into /practice; authoring and index paths untouched"
  - "Exactly one of each engine surface — prove with find listings after deletion"

requirements-completed: [REQ-59, REQ-68, REQ-69]
# Honesty: REQ-69 /reports list still interview-only via ?types= filter.
# Shared-DB migrate still deferred (REQ-67).

# Metrics
duration: 7min
completed: 2026-10-04
---

# Phase 13 Plan 13: Legacy Redirects + Per-Type Tree Deletion Summary

**Permanent redirects land old `/interview` and `/case-play` session/report deep links on `/practice`, and every per-type session route, evaluator, DTO, report page, and InterviewSessionShell is gone — exactly one of each engine surface remains.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-10-04T03:30:49Z
- **Completed:** 2026-10-04T03:37:33Z
- **Tasks:** 2
- **Files modified:** 7 modified + 20 deleted (+ 1 extra link file)

## Accomplishments

- Added `redirects()` to `next.config.js` with permanent 308s for legacy session/report URLs.
- Repointed preset picker, `/reports` list, and scenario launch links at engine surfaces.
- Deleted the per-type trees the engine replaced (REQ-59); frozen schema snapshots keep the deep-equality regression guard green.

## Task Commits

1. **Task 1: Add permanent redirects and rewire internal links** - `5775fa9` (feat)
2. **Task 2a: Delete legacy session and report pages** - `f1dea9d` (refactor)
3. **Task 2b: Delete per-type evaluators, DTOs, and delegation routes** - `d099f00` (refactor)

**Plan metadata:** (docs commit follows)

## redirects() entries (verbatim)

```js
async redirects() {
  const seg = "((?!new(?:/|$))[^/]+)";
  return [
    {
      source: `/interview/:type${seg}/report/:reportId${seg}`,
      destination: "/practice/:type/report/:reportId",
      permanent: true,
    },
    {
      source: `/case-play/:caseId${seg}/report/:reportId${seg}`,
      destination: "/practice/case-study/report/:reportId",
      permanent: true,
    },
    {
      source: `/interview/:type${seg}`,
      destination: "/practice/:type",
      permanent: true,
    },
  ];
}
```

**Regex constraint:** `((?!new(?:/|$))[^/]+)`

**How tested:**
| Path | Result |
|---|---|
| `/interview/general/report/{id}` | 308 → `/practice/general/report/{id}` |
| `/interview/general` | 308 → `/practice/general` |
| `/case-play/{caseId}/report/{id}` | 308 → `/practice/case-study/report/{id}` |
| `/case-play/new` | NOT 308 (307 → login when unauthenticated) |
| `/case-play/new/report/x` | NOT 308 (constraint rejects `new`) |
| `/case-play/newer/report/x` | 308 → `/practice/case-study/report/x` |
| `/case-play`, `/interview`, `/case-play/{id}`, `/case-play/{id}/edit` | NOT 308 |

Plain `(?!new$)` was tried first and **failed** under path-to-regexp (matched `new` because `$` never sits at the segment boundary in the compiled pattern).

## Grep proof — no live importers before deletion

Live importers found (all owned by files being deleted, or fixed first):

- Pages/shell being deleted: `app/interview/[type]/*`, `app/case-play/[caseId]/report/*`, `InterviewSessionShell`
- Routes being deleted: `app/api/interview/{session,report,reports}`, `app/api/scenario/{session,report}`
- `scripts/verify-report-structure.ts` — converted to frozen schema snapshots + engine `validateEvaluationResult`
- `components/interview/ReportCustomizationStrip.tsx` — dropped `InterviewReportDTO` import for a local fields type
- `lib/report/legacy-adapters.ts` — only consumers were the deleted report routes → deleted with them

Comment-only mentions of deleted paths remain in docs/comments (metrics, engine types) — not live imports.

Surviving `app/api/interview/`: `interviewers`, `persona`, `upload-resume`.

## One-of-each proof (find)

```
session-start:      1  app/api/practice/session/start/route.ts
checkpoint:         1  app/api/practice/session/checkpoint/route.ts
finish:             1  app/api/practice/session/finish/route.ts
report-GET:         1  app/api/practice/report/[reportId]/route.ts
retry:              1  app/api/practice/report/[reportId]/retry/route.ts
reports-list:       1  app/api/practice/reports/route.ts
evaluation-runner:  1  lib/engine/evaluation-runner.ts
evaluation:         1  lib/engine/evaluation.ts
report page:        1  app/practice/[type]/report/[reportId]/page.tsx
SessionShell:       1  components/practice/PracticeSessionShell.tsx
```

## Extra file touched (not in plan `files_modified`)

- `app/case-play/page.tsx` — split admin vs scenario launch handlers so ScenarioCard can own `/practice/case-study/{id}` while CaseCard stays on `/case-play/{id}`
- `lib/report/legacy-adapters.ts` — deleted (Rule 3; only consumers were deleted routes)
- `components/interview/ReportCustomizationStrip.tsx` — type import fix so report-dto deletion compiles

## Decisions Made

- Left `lib/interactions/index.ts` tile routes at `/interview` and `/case-play` (indexes still exist and are not redirected).
- `/reports` fetches `/api/practice/reports?types=general,technical,consulting,early-career` so the list stays interview-only (REQ-69).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Deleted `lib/report/legacy-adapters.ts`**
- **Found during:** Task 2
- **Issue:** Adapters imported deleted `InterviewReportDTO` / `ScenarioReportDTO`; only consumers were the deprecated report routes.
- **Fix:** Deleted the adapters file with those routes.
- **Files modified:** `lib/report/legacy-adapters.ts`
- **Committed in:** `d099f00`

**2. [Rule 3 - Blocking] Fixed ReportCustomizationStrip + verify script before evaluator/DTO deletion**
- **Found during:** Task 2
- **Issue:** Live imports of modules being deleted would break `tsc`.
- **Fix:** Local customization fields type; frozen schema snapshots; engine validator in verify script.
- **Files modified:** `components/interview/ReportCustomizationStrip.tsx`, `scripts/verify-report-structure.ts`
- **Committed in:** `d099f00`

**3. [Rule 1 - Bug] Redirect segment regex**
- **Found during:** Task 1 verification
- **Issue:** `((?!new$)[^/]+)` still matched `caseId=new` under path-to-regexp.
- **Fix:** `((?!new(?:/|$))[^/]+)` — confirmed by curl.
- **Files modified:** `next.config.js`
- **Committed in:** `5775fa9`

---

**Total deviations:** 3 auto-fixed (1× Rule 1, 2× Rule 3)
**Impact on plan:** Necessary for correctness; no scope creep.

## Issues Encountered

- Stale `.next` type stubs referenced deleted routes after deletion; cleared `.next` and `tsc --noEmit` went clean.
- Pre-existing ESLint errors (login/settings/HeyGen/interview apostrophes) unchanged — not introduced by this plan.

## User Setup Required

None.

## Next Phase Readiness

- 13-14 can run REQ-66 acceptance against redirects + unified report page.
- Shared-DB migrate still deferred (REQ-67) — LOCAL only.

## Self-Check: PASSED

- [x] `next.config.js` FOUND with redirects
- [x] Commits `5775fa9`, `f1dea9d`, `d099f00` FOUND
- [x] Deleted pages/routes/libs absent on disk
- [x] One-of-each find counts all = 1
- [x] `npx tsc --noEmit` clean; four verify scripts exit 0
