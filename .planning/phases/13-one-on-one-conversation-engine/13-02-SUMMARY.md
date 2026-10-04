---
phase: 13-one-on-one-conversation-engine
plan: 02
subsystem: database
tags: [prisma, postgresql, typescript, report-dto]

# Dependency graph
requires:
  - phase: 12-embodied-visual-signals
    provides: "lib/metrics/types.ts shared VisualMetrics/VocalMetrics contract, reused verbatim by the unified DTO's metrics block"
provides:
  - "InteractionReport Prisma model + additive LOCAL migration (REQ-65)"
  - "lib/report/snapshot.ts: InputSnapshot union + ScoreMap type with safe narrowing"
  - "lib/report/dto.ts: toReportDto() unified report DTO"
affects: [13-04-backfill, 13-08-report-page, 13-12-report-route, 13-13-legacy-dto-removal, 13-15-drop-legacy-tables, "14-16 new interaction types"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One JSON inputSnapshot column, discriminated on kind, replaces per-type typed columns — a new interaction type adds a union member, zero columns"
    - "Dimension-keyed ScoreMap JSON replaces fixed score columns"
    - "Defensive narrowing helpers (asInputSnapshot/asScoreMap) degrade garbage JSON to null rather than throwing, matching the Phase 10 DTO precedent"

key-files:
  created:
    - prisma/migrations/20261004012908_add_interaction_report/migration.sql
    - lib/report/snapshot.ts
    - lib/report/dto.ts
  modified:
    - prisma/schema.prisma

key-decisions:
  - "transcriptKey/interactionLogId/studentEmail stay as three separate nullable columns on InteractionReport, not converged into one tagged pointer — they resolve through different S3Storage accessors with different required context."
  - "InterviewReportStatus enum kept its historical name on the new model rather than being renamed — shared by both legacy tables already, renaming touches every importer for no behavioral gain."
  - "Migration directory is 20261004012908_add_interaction_report (prisma's real generated timestamp), not the 20261003000000 name the plan's files_modified listed."

patterns-established:
  - "Unified report DTO (toReportDto) sources its metrics block exclusively from lib/metrics/types.ts — no private duplicate shape — the same discipline the two legacy per-type DTOs already followed."

requirements-completed: [REQ-65]

duration: ~25min
completed: 2026-10-04
---

# Phase 13 Plan 02: Unified InteractionReport Model, Snapshot Types & Report DTO Summary

**One `InteractionReport` Prisma table with JSON `inputSnapshot`/`scores` plus one `toReportDto()` function replace two per-type tables and two per-type DTOs, via a purely-additive LOCAL migration.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-10-03T21:05:00-04:00 (approx)
- **Completed:** 2026-10-03T21:32:00-04:00
- **Tasks:** 3
- **Files modified:** 4 (1 modified, 3 created)

## Accomplishments
- Added `model InteractionReport` to `prisma/schema.prisma` with the full column set from the plan (scalars, three S3 pointer columns, Phase 10 metrics block, `terminationReason`/`outcome` for REQ-62/REQ-64), plus the `User.interactionReports` back-relation.
- Generated and applied `prisma/migrations/20261004012908_add_interaction_report/migration.sql` against the LOCAL dev DB only — confirmed by eye and by grep to contain exactly one `CREATE TABLE`, two `CREATE INDEX`, and one `ADD CONSTRAINT` (the FK to `User`), zero `DROP`, zero `ALTER TABLE` on `InterviewReport`/`ScenarioReport`.
- Declared `lib/report/snapshot.ts`'s `InputSnapshot` discriminated union (`InterviewInputSnapshot` | `ScenarioInputSnapshot`) and `ScoreMap`, with `asInputSnapshot`/`asScoreMap` narrowing helpers that degrade garbage JSON to `null`.
- Declared `lib/report/dto.ts`'s `toReportDto()`, the single DTO function every report surface will consume, unioning both legacy DTOs' fields and preserving the `cameraMode === null` legacy null-guard exactly.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the InteractionReport model and generate the additive migration against the LOCAL DB** - `1462b89` (feat)
2. **Task 2: Declare the inputSnapshot and scores types with safe narrowing** - `6c224d5` (feat)
3. **Task 3: Write the one unified report DTO** - `fafff49` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `prisma/schema.prisma` - Added `model InteractionReport` (below `ScenarioReport`) and the `User.interactionReports` relation.
- `prisma/migrations/20261004012908_add_interaction_report/migration.sql` - Additive-only `CREATE TABLE "InteractionReport"` + two indexes + one FK to `User`.
- `lib/report/snapshot.ts` - `InterviewInputSnapshot`, `ScenarioInputSnapshot`, `InputSnapshot` union, `ScoreMap`, `asInputSnapshot`, `asScoreMap`.
- `lib/report/dto.ts` - `ReportDTO` interface, `REPORT_TERMINAL_STATUSES`, `toReportDto(row: InteractionReport): ReportDTO`.

## The exact column list (final)

`id`, `userId` (+ relation), `typeSlug`, `status` (`InterviewReportStatus`, default `IN_PROGRESS`), `inputSnapshot` (Json?), `scores` (Json?), `transcriptKey` (String?), `interactionLogId` (String?), `studentEmail` (String?), `turnCount` (Int, default 0), `cameraMode` (String?), `visualMetrics` (Json?), `vocalMetrics` (Json?), `visualUnscoredReason` (String?), `vocalUnscoredReason` (String?), `metricsConsentAt` (DateTime?), `reportStructured` (Json?), `reportMarkdown` (String? @db.Text), `failureReason` (String? @db.Text), `evalModel` (String?), `terminationReason` (String?), `outcome` (Json?), `startedAt`, `completedAt`, `createdAt`, `updatedAt`. Indexes: `@@index([userId, createdAt])`, `@@index([userId, typeSlug])`.

## `toReportDto` return shape (exact — 13-08 and 13-12 render against this)

```ts
interface ReportDTO {
  id: string;
  typeSlug: string;
  status: "IN_PROGRESS" | "PENDING" | "READY" | "FAILED";
  turnCount: number;
  scores: ScoreMap | null; // Record<string, number | null>
  metrics: {
    cameraMode: CameraMode | null;
    visual: VisualMetrics | null;
    vocal: VocalMetrics | null;
    visualUnscored: VisualUnscoredReason | null;
    vocalUnscored: VocalUnscoredReason | null;
  };
  input: InputSnapshot | null; // discriminated on `kind: "interview" | "scenario"`
  terminationReason: string | null;
  outcome: unknown | null;
  reportStructured: StructuredReport | null;
  reportMarkdown: string | null;
  failureReason: string | null;
  evalModel: string | null;
  startedAt: string; // ISO
  completedAt: string | null; // ISO
}
```

## Decisions Made

- **`transcriptKey`/`interactionLogId`/`studentEmail` stay as three separate nullable columns.** Research Open Question 3's precedent and CONTEXT.md's discretion item were both resolved the same way: the interview pointer resolves through `getInterviewTranscript(userId, reportId)` and the scenario pointer through `getInteractionLog(studentEmail, caseId, logId)` — genuinely different required context — so converging them into one tagged pointer buys a union type and costs read-path branching for no requirement.
- **`InterviewReportStatus` enum NOT renamed.** It is already shared, historically, by both `InterviewReport` and `ScenarioReport`; renaming it under the new model would touch every importer across both legacy pipelines for zero behavioral gain. A schema comment documents this as deliberate.
- **Real migration directory name differs from the plan's `files_modified`.** Prisma generated `20261004012908_add_interaction_report` (today's real timestamp), not the plan's placeholder `20261003000000_add_interaction_report`. Recorded here per the plan's own instruction to do so if this happened.

## Deviations from Plan

None — plan executed exactly as written. The only divergence is the cosmetic migration-directory timestamp noted above, which the plan itself anticipated and asked to be recorded rather than treated as a deviation.

## Issues Encountered

None. Local dev DB (`leadership_avatar_dev`) was reachable and already at the prior migration head; the new migration applied cleanly on the first attempt. `npx tsc --noEmit` and `npx prisma validate` were clean after each task. Verification for Tasks 2 and 3 used throwaway `tsx` scripts (not committed) run against the local DB — three `InteractionReport` rows (interview-shaped, scenario-shaped, all-null legacy) were inserted, asserted against, and deleted before this summary was written.

## User Setup Required

None - no external service configuration required. The migration was applied to the LOCAL dev DB only, as required by REQ-67; it still needs a human to review and run `prisma migrate deploy` against the shared Lightsail DB before Phase 13 can close (per `13-CONTEXT.md`'s "Migration follows the existing human-run path" decision) — that review/deploy step is explicitly NOT part of this plan.

## Next Phase Readiness

- `InteractionReport`, `lib/report/snapshot.ts`, and `lib/report/dto.ts` are ready for plan 13-04 (backfill) to read from and write into.
- `InterviewReport`/`ScenarioReport` models and their report-dto.ts files are completely untouched; no caller was modified in this plan.
- No blockers. The shared Lightsail DB remains untouched, per REQ-67.

## Self-Check: PASSED

All claimed files found on disk; all three task commit hashes (`1462b89`, `6c224d5`, `fafff49`) found in `git log`.

---
*Phase: 13-one-on-one-conversation-engine*
*Completed: 2026-10-04*
