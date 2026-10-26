# Quick Task 004: Growth-Area Dimension Key Summary

**Evaluator now self-declares which rubric dimension each growth area critiques (`growth_areas[].dimension`), turning growth-area-to-competency attribution from a derived inference into a recorded fact, while `lib/study-plan/checks/sources.ts` keeps 21-25's derivation as a fallback for every pre-existing report row.**

## What changed, per file

### `lib/report/structured.ts`
- Added `dimension?: string | null` to the `ReportGrowthArea` interface, with a doc comment explaining what it means, that it is optional-in-TypeScript (nullable, not omittable) to match the existing `source` field's convention and keep pre-existing literals (fixtures, scripts, every report row written before this field existed) `tsc`-clean, and that an unrecognized/missing value degrades to `null`.
- Added `dimension: STRING_OR_NULL` to `STRUCTURED_REPORT_PROPERTIES.growth_areas.items.properties`, and added `"dimension"` to that item's `required` array — following the house OpenAI-strict-schema convention documented in `lib/engine/rubric.ts` ("every property must be listed in required; optional-in-spirit fields use a nullable type instead of omission").
- Added a new `rubricDimensionKey()` coercion function, mirroring the existing `feedbackSource()` pattern: validates an incoming `dimension` value against `allRubricDimensionKeys()` (imported from `lib/mastery/competencies.ts`), degrading an unrecognized or missing value to `null` rather than passing it through uncheckable or crashing. Wired into `parseStructuredReport`'s `growth_areas` map.
- Added an "IMPORT-CYCLE CHECK" doc comment in the module header documenting the cycle analysis (see below).

### Import-cycle decision
`lib/mastery/competencies.ts`'s `allRubricDimensionKeys()` derives its catalog from `lib/engine/registry.ts`'s `ENGINE_TYPES`, which pulls in every built-in type's prompt/config module (`lib/interview/prompts.ts`, `lib/scenario/prompts.ts`, `lib/networking/prompts.ts`, the pitch `*-type.ts` files, `lib/difficult-conversation/conversation-type.ts`) plus `lib/engine/types.ts`. I inspected every one of those files' import statements directly (not just grep over comment text — `lib/networking/prompts.ts` has a comment mentioning `lib/report/structured.ts` but no actual import of it) and confirmed **none of them import `lib/report/structured.ts` or `lib/mastery/competencies.ts`**. `lib/engine/rubric.ts` and `lib/engine/evaluation.ts` DO import `lib/report/structured.ts`, but neither sits on `ENGINE_TYPES`'s import path, so that is a one-way dependency, not a cycle.

**Decision: imported `allRubricDimensionKeys` directly into `lib/report/structured.ts`** (no inversion/parameter needed) — the cycle the task anticipated does not exist in this codebase's current import graph. This was verified two ways: (1) static inspection of every file's import list on the `ENGINE_TYPES` path, and (2) a live `npx tsx scripts/verify-report-structure.ts` run after the change, which would surface a circular-require ordering bug (e.g. `STRUCTURED_REPORT_PROPERTIES` being `undefined` when `lib/engine/rubric.ts` spreads it) as a runtime failure, not just a `tsc` pass. Both checks passed clean. `npx tsc --noEmit` was also run and is clean.

### `scripts/verify-report-structure.ts`
- Added `dimension` to both frozen `EVALUATION_JSON_SCHEMA` and `SCENARIO_EVALUATION_JSON_SCHEMA`'s `growth_areas` item (`properties` AND `required`), in BOTH frozen copies.
- Updated both doc comments above the frozen schemas to record this as the SECOND deliberate post-Phase-13 addition (the first being quick-002's `source` field), naming what was added, why, and by which task — the frozen-bytes provenance record the comment exists to preserve.
- Added import of `STRUCTURED_REPORT_PROPERTIES` (previously unused by this script).
- Added a new Section 9 ("growth_areas[].dimension (quick-004)") with 5 new assertions: schema carries `dimension` in `required[]`; schema types it `[string, null]`; a recognized key narrows through; an unrecognized key degrades to `null`; a missing key degrades to `null`.
- All `deepEqual` assertions against the frozen snapshots pass after the change (the live schema and the snapshot now agree — no loosening of `deepEqual` was needed or done).

### `lib/interview/prompts.ts`
Added a short "RULE ON GROWTH-AREA DIMENSION" paragraph (same voice/register as the existing "RULE ON SOURCE ATTRIBUTION" paragraph immediately above it) instructing the evaluator to set `dimension` to the one rubric category (visual/vocal/content/behavioral — the only dimensions this type ever scores, confirmed via `lib/engine/registry.ts`: interview types declare `extraRubricDimensions: []`) the growth area critiques, or `null` if it spans several or maps to none. Added `"dimension": "visual" | "vocal" | "content" | "behavioral" | null` to the `growth_areas` JSON example.

### `lib/scenario/prompts.ts`
Same "RULE ON GROWTH-AREA DIMENSION" paragraph added (case-study also declares `extraRubricDimensions: []`, so the same four-value vocabulary applies) and the same JSON-example line added to its `growth_areas` entry. Note: this prompt's `growth_areas` example did not previously include a `source` field either (confirmed via grep — `lib/scenario/prompts.ts` names no source-attribution rule at all); that is a pre-existing gap unrelated to this task's scope and was left untouched.

### `lib/difficult-conversation/conversation-prompts.ts`
Checked per the task instructions (this file's `CONVERSATION_EVALUATOR_PROMPT` is imported by `verify-report-structure.ts`). Confirmed via grep that this prompt **never describes `growth_areas` or `strengths` at all** — its post-session grader section covers the 8 rubric dimensions, the outcome record, and the in-role reaction, with no growth-area JSON instructions. No change made to this file; nothing to add the instruction to.

### `lib/study-plan/checks/sources.ts` (the consumer)
- Added `growthAreaDimensionsByReportId: Map<string, Map<string, string>>`, built in the same per-report loop as `momentsByReportId`/`usedTranscriptsByReportId` (title -> declared dimension, skipping growth areas with no declared dimension — `SessionMoment.linkedGrowthAreaTitles` is title-based with no growth-area id to join on instead, per `lib/study-plan/moments.ts`).
- Rewrote STEP 6's grouping loop: for each moment linked to at least one growth area, it now first computes `statedCompetencies` by resolving each linked growth area's declared `dimension` (if any) through `competencyForDimension`. **If `statedCompetencies` is non-empty, it is used exclusively** (the stated dimension WINS). Only when no linked growth area declared a recognized dimension does the moment fall back to `reportCompetencies` — 21-25's original report-level derivation, computed exactly as before from the report's non-null scored dimensions.
- **The 21-25 fallback is retained in full** and exercised explicitly by a new test (`2f3`) proving a report whose growth area has no `dimension` still produces the same attribution as before this change — every report row written before this change has no `dimension` on any growth area and must keep producing checks unchanged.
- Each step is commented explaining which path (`stated` vs `derivation`) a given moment took and why.

## Verification

### New/extended assertions
- `scripts/verify-report-structure.ts` Section 9 (5 new checks): schema shape, valid-key narrowing, unrecognized-key degradation, missing-key degradation.
- `scripts/verify-generation-sources.ts`: extended the `growthArea()` fixture builder to accept an optional `dimension` argument; added two new sub-sections:
  - **2f2** — a stated dimension (`"concision"`) wins over a conflicting report-level derivation (`content: 5` would derive `structure_and_clarity`); the moment lands under `concision_and_focus` and `structure_and_clarity` is absent.
  - **2f3** — a `null`/absent dimension falls back to the report-level derivation exactly as 21-25 originally produced it.

### Proof of bite
Temporarily replaced the "stated wins" line in `sources.ts`'s STEP 6 (`const competenciesForMoment = statedCompetencies.size > 0 ? statedCompetencies : reportCompetencies;`) with `const competenciesForMoment = reportCompetencies; // BROKEN FOR BITE PROOF`, re-ran `scripts/verify-generation-sources.ts`, observed the expected failure, then restored the file and re-ran to confirm all 39 checks pass again. Verbatim failure output:

```
2f2. A STATED dimension wins over the report-level derivation (quick-004)
  FAIL the moment lands under concision_and_focus (the STATED dimension), not structure_and_clarity
  FAIL structure_and_clarity (the derivation) is ABSENT — the stated dimension fully overrides it

2f3. A null/absent dimension falls back to the report-level derivation (quick-004)
  ok   a null-dimension growth area still falls back to the derivation (structure_and_clarity)
```

(2f3 correctly stayed green under the break, since it only exercises the fallback path — confirming the break was isolated to the "stated wins" behavior, not a broader regression.)

### Full guard set — all exit 0

| Guard | Exit code |
| --- | --- |
| `npx tsc --noEmit` | 0 |
| `scripts/verify-report-structure.ts` | 0 (all checks passed, including new Section 9) |
| `scripts/verify-feedback-source-attribution.ts` | 0 (unaffected — `source` vocabulary untouched) |
| `scripts/verify-generation-sources.ts` | 0 (39 checks run, 0 failed, including new 2f2/2f3) |
| `scripts/verify-check-generation.ts` | 0 (45 checks run, 0 failed) |
| `scripts/verify-verbatim-quote.ts` | 0 (22 checks run, 0 failed) |

## Hard constraints respected

- No file under `lib/engine/` was modified (confirmed via `git status --short`: only `lib/interview/prompts.ts`, `lib/report/structured.ts`, `lib/scenario/prompts.ts`, `lib/study-plan/checks/sources.ts`, `scripts/verify-generation-sources.ts`, `scripts/verify-report-structure.ts` changed).
- The closed three-value `source` feedback vocabulary and `lib/report/source-attribution.ts` were not touched.
- `.planning/phases/18-avatar-disengagement-walk-out/18-VALIDATION.md` was not touched.
- Additive and back-compatible only: `dimension` is optional/nullable everywhere, pre-existing report rows have no `dimension` on any growth area and keep working via the retained fallback — no migration needed, `growth_areas` remains a `Json?` column.
- No Phase 21 REQ ID was marked complete — this task is scoped outside the phase's requirement set.
- No sibling executors' files (`lib/study-plan/next-step.ts`, the checks attempt route/page/card, `lib/study-plan/coached/runtime.ts`, the coached route, or their verifiers) were touched.

## Self-Check: PASSED

- `lib/report/structured.ts` — FOUND
- `scripts/verify-report-structure.ts` — FOUND
- `lib/interview/prompts.ts` — FOUND
- `lib/scenario/prompts.ts` — FOUND
- `lib/study-plan/checks/sources.ts` — FOUND
- `scripts/verify-generation-sources.ts` — FOUND
- `.planning/quick/004-growth-area-dimension/004-SUMMARY.md` — FOUND
