---
phase: 09-student-authored-scenarios
plan: 03
subsystem: api
tags: [openai, json-schema, prisma, evaluation, prompt-engineering]

# Dependency graph
requires:
  - phase: 09-student-authored-scenarios (09-01)
    provides: ScenarioReport Prisma model, InterviewReportStatus reuse, run-time snapshot columns this DTO maps
  - phase: 06-interview-evaluation-and-report
    provides: The evaluation.ts/prompts.ts/report-dto.ts structural pattern this plan copies (never imports)
provides:
  - "SCENARIO_EVALUATOR_PROMPT — fixed standard rubric (EQ + conversational adequacy), visual/vocal marked NOT MEASURABLE"
  - "buildScenarioEvaluationUserMessage — composes author criteria as fenced, labelled DATA onto the standard rubric, never replacing it"
  - "runScenarioEvaluation / validateScenarioEvaluationResult — schema-constrained evaluator call with visualScore/vocalScore hardcoded null by type and by code"
  - "toScenarioReportDTO / ScenarioReportDTO — explicit field-by-field client-safe mapping, strips userId/studentEmail/interactionLogId/evalModel and each character's hidden additionalInfo briefing"
affects: [09-04, 09-05, 09-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Scenario evaluator modules copy the interview evaluator's structure (prompt shape, JSON schema, retry/timeout budget, null-visual/vocal validator, logging discipline) rather than importing from lib/interview/*, so lib/interview/ stays independently editable and diff-empty"
    - "Author-supplied evaluation criteria are treated as untrusted DATA: fenced into a clearly-labelled section of the USER message only, with an explicit containment clause in the system prompt, never concatenated into the rubric or placed in the system prompt itself"
    - "runScenarioEvaluation throws a typed ScenarioEvaluationError on final failure instead of returning a discriminated-union failure value (unlike the interview evaluator) — 09-04's runner is expected to catch it and record a FAILED row"

key-files:
  created:
    - lib/scenario/prompts.ts
    - lib/scenario/evaluation.ts
    - lib/scenario/report-dto.ts
  modified: []

key-decisions:
  - "SCENARIO_EVALUATOR_PROMPT never contains the literal phrase 'AUTHOR-DEFINED CRITERIA' — that exact label lives only in buildScenarioEvaluationUserMessage's fenced section, so the plan's grep -c check (expects exactly 1 occurrence, only in the builder) passes; the system prompt refers to the same concept as 'the fenced author-criteria section' instead"
  - "runScenarioEvaluation throws ScenarioEvaluationError on exhausted retries rather than returning an EvaluationOutcome|EvaluationFailure union like the interview module, since 09-04's runner (not yet built) is expected to wrap it in try/catch to produce a FAILED report row"
  - "toScenarioReportDTO narrows avatarsSnapshot (Prisma Json) to {name, role}[] only, dropping id/profileId/additionalInfo — additionalInfo is each character's hidden briefing text and must never reach the report page"

requirements-completed: [REQ-32]

# Metrics
duration: 25min
completed: 2026-09-21
---

# Phase 9 Plan 03: Scenario Evaluation Brain Summary

**Fixed EQ + conversational-adequacy rubric with author-criteria composition, a JSON-schema-constrained OpenAI evaluator with code-enforced null Visual/Vocal, and a client-safe report DTO — all three as pure, unwired library modules under `lib/scenario/`.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-09-21T20:00:00Z
- **Completed:** 2026-09-21T20:25:00Z
- **Tasks:** 3
- **Files modified:** 3 created, 0 modified

## Accomplishments
- `lib/scenario/prompts.ts`: `SCENARIO_EVALUATOR_PROMPT` (237 lines total in file) is a fixed, session-independent rubric structurally mirroring `INTERVIEW_EVALUATOR_PROMPT` — same four score slots so `ReportScoreCards.tsx` renders it unchanged, Visual/Vocal explicitly marked "NOT MEASURABLE in this phase" rather than conditionally scoreable. `buildScenarioEvaluationUserMessage` fences author criteria into a clearly labelled DATA section of the user message only, tail-truncates the transcript (24000 chars, keeps the resolution), head-truncates criteria (8000 chars), and omits the criteria section entirely when empty rather than substituting a default.
- `lib/scenario/evaluation.ts`: `runScenarioEvaluation` reuses the interview evaluator's JSON-schema/retry/timeout pattern (copied, not imported) and `validateScenarioEvaluationResult` hardcodes `visualScore`/`vocalScore` to the TypeScript type `null` regardless of what the model returns, proven against a real model response that explicitly claimed non-null values.
- `lib/scenario/report-dto.ts`: `toScenarioReportDTO` maps `ScenarioReport` field by field (never spreads), excluding `userId`, `studentEmail`, `interactionLogId`, `evalModel`, `createdAt`, `updatedAt`; `avatarsSnapshot` is narrowed defensively to `{name, role}[]`, proven to strip a character's `additionalInfo` hidden briefing from the DTO's JSON output.
- `lib/interview/prompts.ts` and `lib/interview/evaluation.ts` confirmed diff-empty (`git diff --stat lib/interview/` empty) after every commit in this plan.

## Task Commits

Each task was committed atomically:

1. **Task 1: Standard scenario evaluator prompt and criteria composition** - `ee12ca2` (feat)
2. **Task 2: Schema-constrained evaluator with code-enforced null Visual/Vocal** - `f0d7570` (feat)
3. **Task 3: Client-safe scenario report DTO** - `9491caf` (feat)

**Plan metadata:** _(recorded after this commit)_

## Files Created/Modified
- `lib/scenario/prompts.ts` - Fixed rubric system prompt + `buildScenarioEvaluationUserMessage` composition helper
- `lib/scenario/evaluation.ts` - `runScenarioEvaluation` / `validateScenarioEvaluationResult`, code-enforced null visual/vocal
- `lib/scenario/report-dto.ts` - `toScenarioReportDTO` / `ScenarioReportDTO`, explicit field-by-field mapping

## Decisions Made
- Removed the literal string "AUTHOR-DEFINED CRITERIA" from the system prompt body (kept only in the builder's fenced section header) so the plan's `grep -c` verification (expects exactly one occurrence, only in `buildScenarioEvaluationUserMessage`) passes cleanly — the system prompt now refers to "the fenced author-criteria section" when explaining containment, preserving the same semantic guidance without duplicating the exact label.
- `runScenarioEvaluation` throws a typed `ScenarioEvaluationError` on exhausted retries instead of returning `EvaluationOutcome | EvaluationFailure` like the interview module — a deliberate, plan-anticipated difference ("the caller (09-04's runner) turns a throw into a FAILED row").
- `SCENARIO_EVAL_MODEL` env var (falling back to `gpt-4.1`) mirrors `INTERVIEW_EVAL_MODEL`'s pattern rather than sharing the same variable, keeping the two evaluators independently tunable.

## Deviations from Plan

None - plan executed exactly as written. The "AUTHOR-DEFINED CRITERIA" placement adjustment above was already anticipated by the plan's own verify step (`grep -c` expecting exactly 1) and required only choosing different wording in the system prompt, not a structural change.

## Issues Encountered

None. The concurrently-running 09-02 executor (same working directory, shared git index, per the standing hazard from `08-08-SUMMARY.md`) touched `lib/scenario/validation.ts` and `app/api/scenario/` during this plan's execution; every commit here staged only its own literal file path and `git show --name-only` after each commit confirmed exactly one file per commit, with 09-02's unrelated changes correctly left unstaged throughout.

## User Setup Required

None - no external service configuration required. A real `OPENAI_API_KEY` (already present in the shared `.env`) was used for Task 2's one live verification call; nothing new needs to be added.

## Next Phase Readiness

All three modules are pure libraries with zero route wiring, as the plan specifies — 09-04 owns wiring `runScenarioEvaluation` and `toScenarioReportDTO` into an actual run/report pipeline. `SCENARIO_EVALUATOR_PROMPT`, `buildScenarioEvaluationUserMessage`, `runScenarioEvaluation`, `validateScenarioEvaluationResult`, `ScenarioEvaluationError`, `toScenarioReportDTO`, `ScenarioReportDTO`, and `SCENARIO_REPORT_TERMINAL_STATUSES` are all exported and ready for 09-04 to import. No blockers.

---
*Phase: 09-student-authored-scenarios*
*Completed: 2026-09-21*

## Self-Check: PASSED

- FOUND: lib/scenario/prompts.ts
- FOUND: lib/scenario/evaluation.ts
- FOUND: lib/scenario/report-dto.ts
- FOUND: commit ee12ca2
- FOUND: commit f0d7570
- FOUND: commit 9491caf
