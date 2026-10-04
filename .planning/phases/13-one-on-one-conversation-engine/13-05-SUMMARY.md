---
phase: 13-one-on-one-conversation-engine
plan: 05
subsystem: engine
tags: [typescript, evaluation, rubric, InteractionReport, openai, REQ-59, REQ-71, REQ-72]

# Dependency graph
requires:
  - phase: 13-one-on-one-conversation-engine
    provides: "lib/engine/{types,registry,resolve}.ts from 13-01 — ResolvedSessionConfig and ENGINE_TYPES"
  - phase: 13-one-on-one-conversation-engine
    provides: "InteractionReport model + InputSnapshot/ScoreMap from 13-02"
  - phase: 13-one-on-one-conversation-engine
    provides: "Local InteractionReport backfill (70 rows) from 13-04 for runner verification copies"
provides:
  - "lib/engine/rubric.ts: buildRubricJsonSchema(config) / parseRubricScores — type-derived evaluator JSON schema (REQ-71/72)"
  - "lib/engine/evaluation.ts: runEvaluation({ config, transcript, evaluationContext, metricsOutcome }) — never throws; returns EvaluationOutcome | EvaluationFailure"
  - "lib/engine/evaluation-runner.ts: runAndPersistEvaluation({ reportId }) — writes InteractionReport READY/FAILED, never PENDING"
  - "scripts/verify-report-structure.ts section 6: deep-equality vs legacy schemas + extras/null preservation"
affects: [13-07-session-routes, 13-08-report-routes, 13-13-delete-per-type-trees, "14-16 new interaction types"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One evaluator + one runner for every type; type-specific grading inputs stay in the type's buildEvaluationContext / evaluatorPrompt (no if (typeSlug === ...) in the engine)"
    - "Evaluator JSON schema is derived from config.rubricDimensions; visual/vocal always required and coverage resolution always runs (REQ-71/72)"
    - "Error contract collapsed to the non-throwing discriminated union; runner persists FAILED with failureReason (REQ-69 permitted invisible collapse)"

key-files:
  created:
    - lib/engine/rubric.ts
    - lib/engine/evaluation.ts
    - lib/engine/evaluation-runner.ts
  modified:
    - lib/report/structured.ts
    - scripts/verify-report-structure.ts

key-decisions:
  - "ResolvedSessionConfig still does not carry prompts (13-01); runEvaluation looks up evaluatorPrompt via getEngineType(config.typeSlug) so the type record remains the single source."
  - "User-message assembly dispatches on evaluationContext.kind (interview vs scenario), not on a hardcoded typeSlug list — preserves byte-compatible model-facing input for both origins."
  - "Schema name is interview_evaluation vs scenario_evaluation derived from config.instance.kind === 'case-study', so deep equality with both legacy constants holds until 13-13 deletes them."
  - "Task 4 human checkpoint verdict: identical (user wording: \"found them, looks like they match\"). Accepted non-student-visible delta: FAILED scenario rows now carry evalModel."

requirements-completed: [REQ-71, REQ-72]
# REQ-59 remains open as a split requirement: this plan delivers one evaluator
# and one evaluation runner, but one session-start/checkpoint/finish/report-GET
# still needs 13-07/13-08+. REQ-69 is not checked off — it is the invisibility
# constraint for the whole phase; Task 4 only confirmed the evaluator failure
# contract collapse has no student-visible delta.

# Metrics
duration: 75min
completed: 2026-10-04
---

# Phase 13 Plan 05: Unified Evaluator / Type-Derived Rubric Summary

**One `runEvaluation` / `runAndPersistEvaluation` pair grades every interaction type from a config-derived rubric JSON schema, with visual/vocal structurally un-skippable and deep-equality to today's hardcoded schemas proven for all five built-ins.**

## Performance

- **Duration:** ~75 min (includes Task 4 human-verify pause)
- **Started:** 2026-10-04T02:08Z
- **Completed:** 2026-10-04T02:20Z (approx closeout)
- **Tasks:** 4 (3 auto + 1 human-verify)
- **Files modified:** 5 (3 new, 2 modified)

## Accomplishments
- Additive `rubricDimensionProperty` helper on `lib/report/structured.ts`; `buildRubricJsonSchema` / `parseRubricScores` in `lib/engine/rubric.ts`.
- Schema for all five built-in types deeply equals today's `EVALUATION_JSON_SCHEMA` / `SCENARIO_EVALUATION_JSON_SCHEMA` (empty deep-diff).
- Unified non-throwing evaluator + InteractionReport runner; unconditional `resolveVisualOutcome` / `resolveVocalOutcome`; `cameraMode === null` leaves both unscored-reason columns null (REQ-48).
- `scripts/verify-report-structure.ts` section 6 proves visual/vocal always required, extras append in order, colliding `visual` extra rejected, null scores preserved.
- Task 4 human checkpoint: forced-failure interview and scenario copies compared in local PostgreSQL — verdict **identical**.

## Signatures for 13-07 callers

```ts
// lib/engine/evaluation.ts
runEvaluation({
  config,              // ResolvedSessionConfig
  transcript,          // string
  evaluationContext,   // Record from type.prompts.buildEvaluationContext (+ resumeText overlay)
  metricsOutcome,      // { visualMetrics, vocalMetrics } — null when unscored
}): Promise<EvaluationOutcome | EvaluationFailure>  // never throws

// lib/engine/evaluation-runner.ts
runAndPersistEvaluation({ reportId }): Promise<void>  // never throws; never leaves PENDING
```

## Task 4 checkpoint verdict (verbatim)

**identical**

User wording: "found them, looks like they match".

Forced-failure copies on local `leadership_avatar_dev` only (seeded originals untouched):

| Field | Interview `3c0890ee-…` | Scenario `baedd7d4-…` |
| --- | --- | --- |
| status | FAILED | FAILED |
| stuckPending | false | false |
| failureReason | non-empty (model 404 after 2 attempts) | identical |
| evalModel | `definitely-not-a-real-model-13-05` | `definitely-not-a-real-model-13-05` |
| scores / report body | null | null |
| unscored-reason columns | null | null |

**Accepted delta (plan non_negotiables):** FAILED scenario rows now carry `evalModel` where the old scenario catch-all left it null. Column is not rendered on any report page. No other student-visible difference reported.

**13-13 follow-up:** section 6's deep-equality imports of `EVALUATION_JSON_SCHEMA` / `SCENARIO_EVALUATION_JSON_SCHEMA` must convert to frozen inline snapshots when plan 13-13 deletes the legacy evaluator modules.

## Task Commits

Each task was committed atomically:

1. **Task 1: Type-derived evaluator JSON schema** - `894eec9` (feat)
2. **Task 2: One evaluator and one evaluation runner** - `2c48ed2` (feat)
3. **Task 3: Extend report-structure verification** - `39dfa5a` (test)
4. **Task 4: Human-verify failure contract** - (no code commit; verdict recorded in this SUMMARY)

**Plan metadata:** (this commit)

## Files Created/Modified
- `lib/engine/rubric.ts` — `buildRubricJsonSchema`, `parseRubricScores`, `scorePropertyName`
- `lib/engine/evaluation.ts` — `runEvaluation`, `validateEvaluationResult`, outcome types
- `lib/engine/evaluation-runner.ts` — `runAndPersistEvaluation` for InteractionReport
- `lib/report/structured.ts` — additive `rubricDimensionProperty` export only
- `scripts/verify-report-structure.ts` — new section 6

## Decisions Made
See `key-decisions` in frontmatter. Prompts stay on the type record (looked up via `getEngineType`); user-message format dispatches on `evaluationContext.kind`; schema name keyed off `instance.kind`; human confirmed failure-contract collapse is identical aside from accepted `evalModel` on FAILED scenario rows.

## Deviations from Plan

### Auto-fixed Issues

None that required code fixes beyond plan scope.

### Adaptations (documented, not Rule 1–3 fixes)

**1. Prompts not on ResolvedSessionConfig**
- **Found during:** Task 2
- **Issue:** Plan prose said `config.prompts.evaluatorPrompt`, but 13-01's `ResolvedSessionConfig` does not carry `prompts` (and 13-06 owns `lib/engine/prompts.ts` for live assembly, not evaluation).
- **Adaptation:** `runEvaluation` / the runner resolve prompts via `getEngineType(config.typeSlug).prompts`.
- **Files modified:** `lib/engine/evaluation.ts`, `lib/engine/evaluation-runner.ts`
- **Commit:** `2c48ed2`

**Total deviations:** 0 auto-fixed; 1 documented adaptation  
**Impact on plan:** No student-visible or model-facing change; keeps 13-01 resolve contract intact while 13-06 runs in parallel.

## Issues Encountered
- OpenAI Module stub in the throwaway Task 2 driver did not intercept the dynamic `import("openai")`; the interview READY path ran against the real API successfully. Scenario copy without an S3 log ended FAILED (never PENDING) — still satisfied the Task 2 verify criteria.
- `InteractionReport` report UI is not wired yet, so Task 4 browser check used Prisma/local DB field comparison (human confirmed).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `runAndPersistEvaluation({ reportId })` is ready for 13-07 finish / 13-08 retry to call.
- Legacy `lib/interview/evaluation{,-runner}.ts` and `lib/scenario/evaluation{,-runner}.ts` remain until 13-13 (callers still exist).
- REQ-71 and REQ-72 MET; REQ-59 evaluator/runner half delivered, remainder deferred to 13-07/13-08.

---
*Phase: 13-one-on-one-conversation-engine*
*Completed: 2026-10-04*

## Self-Check: PASSED

- FOUND: `lib/engine/rubric.ts`
- FOUND: `lib/engine/evaluation.ts`
- FOUND: `lib/engine/evaluation-runner.ts`
- FOUND: `lib/report/structured.ts` (additive `rubricDimensionProperty`)
- FOUND: `scripts/verify-report-structure.ts` (section 6)
- FOUND: commit `894eec9`
- FOUND: commit `2c48ed2`
- FOUND: commit `39dfa5a`
- FOUND: Task 4 verdict recorded as **identical**
