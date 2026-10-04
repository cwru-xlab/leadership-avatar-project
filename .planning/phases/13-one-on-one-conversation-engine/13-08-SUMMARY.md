---
phase: 13-one-on-one-conversation-engine
plan: 08
subsystem: api
tags: [typescript, nextjs, InteractionReport, report-dto, REQ-59, REQ-65, REQ-66, REQ-69]

# Dependency graph
requires:
  - phase: 13-one-on-one-conversation-engine
    provides: "lib/report/dto.ts toReportDto + InteractionReport from 13-02"
  - phase: 13-one-on-one-conversation-engine
    provides: "Local backfilled InteractionReport rows + seeded fixed UUIDs from 13-04"
  - phase: 13-one-on-one-conversation-engine
    provides: "runAndPersistEvaluation({ reportId }) from 13-05; type registry from 13-01/13-07"
provides:
  - "/api/practice/report/[reportId] — one GET for all types returning ReportDTO (REQ-59)"
  - "/api/practice/report/[reportId]/retry — retry gated on type.supportsRetry (interview only)"
  - "/api/practice/reports — type-filterable list excluding IN_PROGRESS"
  - "Four legacy report routes as thin delegations pending 13-13 deletion"
  - "Baseline screenshots under screenshots/13-08/ for plan 13-14"
affects: [13-12-report-pages, 13-13-delete-legacy-routes, 13-14-req66-acceptance, "14-16 new interaction types"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared handlers in lib/report/handlers.ts; routes own auth + NextResponse mapping"
    - "Type-declared supportsRetry on InteractionTypeConfig (REQ-69) — case-study retry is 404"
    - "Legacy adapters project ReportDTO → InterviewReportDTO / ScenarioReportDTO until 13-12"

key-files:
  created:
    - lib/report/handlers.ts
    - lib/report/legacy-adapters.ts
    - app/api/practice/report/[reportId]/route.ts
    - app/api/practice/report/[reportId]/retry/route.ts
    - app/api/practice/reports/route.ts
    - .planning/phases/13-one-on-one-conversation-engine/screenshots/13-08/
  modified:
    - lib/engine/types.ts
    - lib/engine/registry.ts
    - app/api/interview/report/[reportId]/route.ts
    - app/api/interview/report/[reportId]/retry/route.ts
    - app/api/interview/reports/route.ts
    - app/api/scenario/report/[reportId]/route.ts

key-decisions:
  - "Added supportsRetry as a declared InteractionTypeConfig field (true for interview presets, false for case-study) so REQ-69 is readable and assertable, matching checkpointing/finishPendingFlip from 13-07."
  - "Legacy interview/scenario GETs additionally 404 when input.kind mismatches the route's type scope, so a case-study id on /api/interview/report still looks nonexistent (pre-unification table scope)."
  - "Interview reports list delegates with the four preset slugs hard-coded — /reports stays interview-only until a later phase owns cross-type presentation (REQ-69)."

patterns-established:
  - "Engine routes return unified ReportDTO; legacy routes adapt via lib/report/legacy-adapters.ts so un-migrated pages keep working mid-phase."

requirements-completed: []
# REQ-59 report-read half MET here (one GET/retry/list); full REQ-59 still needs
# wizard/shell/pages + legacy tree deletion (13-09..13-13). REQ-65/66 need DROP
# (13-15) and 13-14 URL acceptance plus shared-DB backfill (REQ-67 OPEN).
# REQ-69 is the phase-wide invisibility constraint — preserved here, not closed.

# Metrics
duration: 4min
completed: 2026-10-04
---

# Phase 13 Plan 08: Unified Report Read Surface Summary

**One report GET, one retry (interview-only), and one type-filterable list collapse four per-type report routes onto `InteractionReport` + `toReportDto`, while legacy URLs keep today's response shapes via thin adapters.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-10-04T02:26:32Z
- **Completed:** 2026-10-04T02:30:04Z
- **Tasks:** 3/3
- **Files modified:** 11 created/modified (+ 4 screenshot PNGs)

## Accomplishments

- `/api/practice/report/[reportId]` serves every type from `InteractionReport` via `toReportDto` — populated interview, pre-Phase-10 legacy interview (null visual/vocal + null unscored reasons), and scenario all return 200 with scores, metrics, structured body, and typed `input` snapshot.
- Retry is gated on `supportsRetry`: interview FAILED → 202 + `waitUntil(runAndPersistEvaluation)`; case-study → 404 (REQ-69). Cross-user access is 404 through engine and legacy paths.
- `/api/practice/reports` is type-filterable; `/api/interview/reports` hard-filters the four interview presets so `/reports` stays interview-only. No `page.tsx` changes.

## Engine GET response shape (for plan 13-12)

`GET /api/practice/report/:reportId` → `{ report: ReportDTO }` where `ReportDTO` (`lib/report/dto.ts`) is:

| Field | Notes |
|---|---|
| `id`, `typeSlug`, `status`, `turnCount` | status ∈ IN_PROGRESS \| PENDING \| READY \| FAILED |
| `scores` | `ScoreMap \| null` — dimension-keyed; null when row has none |
| `metrics` | `{ cameraMode, visual, vocal, visualUnscored, vocalUnscored }` — null cameraMode = pre-Phase-10 |
| `input` | `InputSnapshot \| null` — `kind: "interview"` or `kind: "scenario"` |
| `terminationReason`, `outcome` | engine fields (REQ-62/64); null for today's types |
| `reportStructured`, `reportMarkdown`, `failureReason`, `evalModel` | body + failure |
| `startedAt`, `completedAt` | ISO strings |

Never includes `userId`, `transcriptKey`, `interactionLogId`, `studentEmail`.

## Screenshots (plan 13-14 baseline)

Saved under `.planning/phases/13-one-on-one-conversation-engine/screenshots/13-08/`:

| File | URL |
|---|---|
| `interview-ready-full.png` | `/interview/general/report/00000000-0000-4000-8000-000000000001` |
| `interview-ready-legacy.png` | `/interview/general/report/00000000-0000-4000-8000-000000000002` |
| `scenario-ready-full.png` | `/case-play/scn-phase13-seed-case-study/report/00000000-0000-4000-8000-000000000004` |
| `reports-list.png` | `/reports` |

Confirmed visually: customization strip (interview), snapshot strip (scenario), scores/metrics/body, and `/reports` showing interview rows only (no case-study).

## `/reports` unchanged

`/api/interview/reports` delegates with `types=general,technical,consulting,early-career`. Seed-user list returned 3 interview rows, zero `case-study`, zero `IN_PROGRESS`. Page screenshot matches interview-only presentation.

## Task Commits

1. **Task 1: One report GET and one retry route** - `53d8a25` (feat)
2. **Task 2: One reports-list route that preserves today's list exactly** - `fd7d282` (feat)
3. **Task 3: Reduce the four legacy report routes to thin delegations** - `b1e7db5` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified

- `lib/report/handlers.ts` — `getReportForUser` / `retryReportForUser` / `listReportsForUser`
- `lib/report/legacy-adapters.ts` — `toLegacyInterviewReportDTO` / `toLegacyScenarioReportDTO`
- `app/api/practice/report/[reportId]/route.ts` — unified GET
- `app/api/practice/report/[reportId]/retry/route.ts` — gated retry
- `app/api/practice/reports/route.ts` — type-filterable list
- `lib/engine/types.ts` / `registry.ts` — `supportsRetry` declaration
- Four legacy report routes — DEPRECATED thin delegations

## Decisions Made

- Declared `supportsRetry` on the type config rather than a slug if-chain (same discipline as 13-07's lifecycle fields).
- Legacy GETs keep pre-unification type scope via `input.kind` checks so cross-type ids stay 404 on the wrong legacy path.
- Cross-type list presentation deferred — Phase 13 exercises CONTEXT.md discretion as "preserve today's interview-only `/reports`" (REQ-69 wins).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Legacy routes must keep type-scoped 404s**
- **Found during:** Task 3
- **Issue:** After unification, `getReportForUser` finds any owned `InteractionReport`. Without a kind check, `/api/interview/report/<scenario-id>` would return 200 with an empty customization strip instead of today's 404 (row was never in `InterviewReport`).
- **Fix:** Legacy interview GET requires `input.kind === "interview"`; scenario GET requires `"scenario"`; otherwise 404.
- **Files modified:** `app/api/interview/report/[reportId]/route.ts`, `app/api/scenario/report/[reportId]/route.ts`
- **Verification:** cross-type curls returned 404
- **Committed in:** `b1e7db5`

---

**Total deviations:** 1 auto-fixed (Rule 2)
**Impact on plan:** Necessary correctness for REQ-69; no scope creep.

## Issues Encountered

- Seed FAILED interview (`…0003`) has `transcriptKey: null`, so a raw retry returns 409. Verification temporarily set a transcript pointer to prove the 202 path, then restored the seed row.
- Cursor browser MCP tabs were unavailable; screenshots taken via headless Chrome + puppeteer-core instead.

## User Setup Required

None.

## Next Phase Preview

Plan 13-09 builds the generic setup wizard. Plan 13-12 migrates report pages onto the unified DTO/`/practice` URLs using this GET shape; 13-13 deletes the legacy report routes; 13-14 compares against the screenshots above for REQ-66 acceptance.

## Self-Check: PASSED

- FOUND: `app/api/practice/report/[reportId]/route.ts`
- FOUND: `app/api/practice/report/[reportId]/retry/route.ts`
- FOUND: `app/api/practice/reports/route.ts`
- FOUND: `lib/report/handlers.ts`
- FOUND: `lib/report/legacy-adapters.ts`
- FOUND: commits `53d8a25`, `fd7d282`, `b1e7db5`
- FOUND: screenshots directory with 4 PNGs
