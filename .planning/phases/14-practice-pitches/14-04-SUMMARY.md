---
phase: 14-practice-pitches
plan: 04
subsystem: engine
tags: [typescript, evaluation, rubric, outcome, vision, score-cap, pitch]

# Dependency graph
requires:
  - phase: 13-one-on-one-conversation-engine
    provides: "lib/engine/{rubric,evaluation,evaluation-runner,outcome,types}.ts from 13-05 — one evaluator, BUDGET_MS=50000, RETRIES=1"
  - phase: 14-practice-pitches
    provides: "14-02 InteractionTypeConfig / ResolvedSessionConfig seams (prompts stay on type record)"
provides:
  - "buildRubricJsonSchema composes OutcomeRecordConfig into the same schema-constrained call"
  - "runEvaluation accepts optional EvaluatorImage[] (detail:low, MAX_EVALUATOR_IMAGES=12) and returns producedOutcome"
  - "runAndPersistEvaluation validates outcome via validateOutcome and applies type-declared postProcessScores"
  - "applyEarlyEndCap / EARLY_END_CAP for discovery_tailoring ceiling of 2"
  - "sampleEvaluatorImages + buildImageAttachmentNote for greppable image sampling"
affects: [14-08-pitch-elevator-registry, 14-09-pitch-deck-registry, 14-14-scoring-wiring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Outcome fields composed into one evaluator schema; no second LLM extraction call"
    - "Images and score caps are type-declared hooks (buildEvaluationImages / postProcessScores), never typeSlug branches"
    - "Image-fetch failure degrades to text-only evaluation; invalid outcome persists as null"

key-files:
  created:
    - lib/pitch/score-caps.ts
  modified:
    - lib/engine/types.ts
    - lib/engine/rubric.ts
    - lib/engine/evaluation.ts
    - lib/engine/evaluation-runner.ts
    - scripts/verify-report-structure.ts

key-decisions:
  - "MAX_EVALUATOR_IMAGES = 12 with evenly-spaced sample always including first and last; detail: 'low' (14-RESEARCH Pitfall 3 / CONTEXT Claude's-Discretion)"
  - "EARLY_END_CAP = { dimension: 'discovery_tailoring', maxScore: 2 } — ceiling only, never invents a score; tunable in 14-15"
  - "buildEvaluationImages / postProcessScores live on InteractionTypeConfig (looked up via getEngineType); ResolvedSessionConfig still does not carry prompts (13-05 adaptation preserved)"
  - "sampleEvaluatorImages is the exported sampling helper name; buildImageAttachmentNote builds the label list text"

patterns-established:
  - "OpenAI strict outcome object: every field nullable and listed in required[]; validateOutcome remains the sole validator"
  - "Finish-route outcome is not overwritten when the evaluator produces nothing"

requirements-completed: [P14-SC1, P14-SC4]

# Metrics
duration: 7min
completed: 2026-10-04
---

# Phase 14 Plan 04: Evaluator Images, Outcome Composition, Score Cap Summary

**One evaluator call now optionally carries slide images and emits a validated outcome record, with a type-declared early-end ceiling on discovery_tailoring — Phase 13 schemas and request shape unchanged.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-10-04T04:18:28Z
- **Completed:** 2026-10-04T04:25:11Z
- **Tasks:** 3
- **Files modified:** 6 (1 created, 5 modified)

## Accomplishments
- Composed type-declared `outcome.fields` into `buildRubricJsonSchema` with `parseOutcomeFields` (no second validator).
- Extended `runEvaluation` for multimodal `image_url` parts (`detail: "low"`, `MAX_EVALUATOR_IMAGES = 12`) and `producedOutcome`.
- Wired `runAndPersistEvaluation` to fetch type-declared images (degrade on failure), `validateOutcome` before persist, and `postProcessScores`.
- Added `applyEarlyEndCap` / `EARLY_END_CAP` and proved all contracts in `verify-report-structure.ts` section 7.

## Signatures for downstream plans (14-08 / 14-09 / 14-14)

```ts
// lib/engine/types.ts
export interface EvaluatorImage { dataUrl: string; label: string }

prompts.buildEvaluationImages?: (ctx: {
  config: ResolvedSessionConfig;
}) => Promise<EvaluatorImage[]>

postProcessScores?: (
  scores: ScoreMap,
  ctx: {
    terminationReason: string | null;
    outcome: Record<string, unknown> | null;
  },
) => ScoreMap

// lib/engine/evaluation.ts
export const MAX_EVALUATOR_IMAGES = 12
export function sampleEvaluatorImages(
  images: EvaluatorImage[],
  max?: number,
): { sampled: EvaluatorImage[]; sampledFromTotal: number | null }
export function buildImageAttachmentNote(
  sampled: EvaluatorImage[],
  sampledFromTotal: number | null,
): string

// lib/pitch/score-caps.ts
export const EARLY_END_CAP = {
  dimension: "discovery_tailoring",
  maxScore: 2,
} as const
export function applyEarlyEndCap(
  scores: ScoreMap,
  ctx: { terminationReason: string | null; outcome?: Record<string, unknown> | null },
): ScoreMap
```

## Task Commits

Each task was committed atomically:

1. **Task 1: Compose the type's outcome record into the one evaluator JSON schema** - `d44560e` (feat; see parallel-race note below)
2. **Task 2: Pass images to the evaluator, validate the produced outcome, and apply the score cap** - `39d4e6f` (feat)
3. **Task 3: Extend the existing report-structure verification with the outcome, image and cap assertions** - `9f82e3f` (test)

**Plan metadata:** (this commit)

**Parallel-race note (Task 1):** `d44560e` exists and is byte-identical to HEAD for `lib/engine/{types,rubric}.ts`, but a concurrent Phase 15 docs commit (`3c73c51`) also landed those same file edits onto the main line, so `d44560e` is not an ancestor of HEAD. Content on HEAD is complete (`git diff d44560e HEAD -- lib/engine/types.ts lib/engine/rubric.ts` is empty).

## Files Created/Modified
- `lib/engine/types.ts` — `EvaluatorImage`, `OutcomeFieldKind`, `buildEvaluationImages?`, `postProcessScores?`, optional `required` on outcome fields
- `lib/engine/rubric.ts` — outcome composition in `buildRubricJsonSchema`; `parseOutcomeFields`; collision guard
- `lib/engine/evaluation.ts` — images, `MAX_EVALUATOR_IMAGES`, `sampleEvaluatorImages`, `producedOutcome`
- `lib/engine/evaluation-runner.ts` — image hook, validateOutcome, postProcessScores before READY
- `lib/pitch/score-caps.ts` — `EARLY_END_CAP`, `applyEarlyEndCap`
- `scripts/verify-report-structure.ts` — section 7 (eight assertion groups)

## Phase 13 / 14-02 seam reconciliation

| Plan name | Real export / location | Drift |
| --- | --- | --- |
| `buildRubricJsonSchema`, `parseRubricScores` | same (+ `parseOutcomeFields`) | none |
| `runEvaluation`, `BUDGET_MS = 50_000`, `RETRIES = 1` | same | none |
| `runAndPersistEvaluation` | same | none |
| `validateOutcome` | `lib/engine/outcome.ts` | none |
| `config.prompts.buildEvaluationImages` (plan prose) | prompts on type record via `getEngineType` | **documented** — ResolvedSessionConfig still has no prompts (13-05) |
| `config.postProcessScores` (plan prose) | on `InteractionTypeConfig`, looked up via `getEngineType` | **documented** — same adaptation |
| 14-02 name drift | none affecting this plan | — |

## Decisions Made
See `key-decisions` in frontmatter. Sampling helper name is `sampleEvaluatorImages`; attachment label text via `buildImageAttachmentNote`.

## Deviations from Plan

### Auto-fixed Issues

None.

### Adaptations (documented, not Rule 1–3 fixes)

**1. Prompts / postProcessScores not on ResolvedSessionConfig**
- **Found during:** Task 2
- **Issue:** Plan prose called `config.prompts.buildEvaluationImages` and `config.postProcessScores`, but prompts and hooks live on the type record (13-05 / 14-02).
- **Adaptation:** Runner uses `getEngineType(resolved.config.typeSlug)` for both hooks.
- **Files modified:** `lib/engine/evaluation-runner.ts`
- **Committed in:** `39d4e6f`

**2. Live `runAndPersistEvaluation` LLM driver skipped**
- **Found during:** Task 2 verify
- **Issue:** Seeded interview row exists (`0990bba3-…`, outcome null) but a full re-eval would hit the paid OpenAI API.
- **Adaptation:** Verified Phase 13 types declare neither hook (so `images` stays undefined → plain string content) plus sampling/cap unit checks; did not spend an API call.
- **Impact:** None on shipped code.

**Total deviations:** 0 auto-fixed; 2 documented adaptations

## Issues Encountered
None blocking. Unrelated `tsc` error in `scripts/verify-dc-prepublish.ts` (parallel Phase 15) left untouched.

## User Setup Required
None — no external service configuration required.

## Verification results
- `npx tsc --noEmit` — no errors in this plan's files
- `npx tsx scripts/verify-report-structure.ts` — ALL PASS (sections 1–7)
- `grep -n "BUDGET_MS" lib/engine/evaluation.ts` — still `50_000`
- `grep -n "MAX_EVALUATOR_IMAGES" lib/engine/evaluation.ts` — `12`
- `grep -rn "chat.completions.create" lib/engine/ lib/pitch/` — exactly one call site
- No `if (typeSlug === ...)` branches in engine evaluation path (comment-only mention remains)

## Next Phase Readiness
- 14-08 / 14-09 can declare `buildEvaluationImages`, outcome fields, and `postProcessScores: applyEarlyEndCap` on the pitch registry records.
- 14-14 can wire rendered slide URLs into `buildEvaluationImages` knowing the 12-image sample + label-note contract.

---
*Phase: 14-practice-pitches*
*Completed: 2026-10-04*

## Self-Check: PASSED

- FOUND: lib/engine/types.ts
- FOUND: lib/engine/rubric.ts
- FOUND: lib/engine/evaluation.ts
- FOUND: lib/engine/evaluation-runner.ts
- FOUND: lib/pitch/score-caps.ts
- FOUND: scripts/verify-report-structure.ts
- FOUND: .planning/phases/14-practice-pitches/14-04-SUMMARY.md
- FOUND commit object: d44560e (feat(14-04) Task 1; orphaned from HEAD by parallel race — content present)
- FOUND commit on HEAD: 39d4e6f (feat(14-04): pass images to evaluator, validate outcome, apply score cap)
- FOUND commit on HEAD: 9f82e3f (test(14-04): prove outcome composition, image cap, and early-end score cap)
- `git diff d44560e HEAD -- lib/engine/types.ts lib/engine/rubric.ts` empty
- `npx tsx scripts/verify-report-structure.ts` exits 0
