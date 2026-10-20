---
phase: 21-adaptive-mastery-path
plan: 02
subsystem: api
tags: [typescript, mastery-model, rubric-dimensions, engine-registry]

requires: []
provides:
  - "lib/mastery/competencies.ts — COMPETENCIES catalog (7 competencies), DIMENSION_TO_COMPETENCY total map, competencyForDimension(), allRubricDimensionKeys(), COMPETENCY_CATALOG_SOURCE replaceability seam"
  - "scripts/verify-competency-catalog.ts — totality verifier over the live ENGINE_TYPES registry, with a proven negative case"
affects: [adaptive-mastery-path, knowledge-checks, coached-practice, path-engine]

tech-stack:
  added: []
  patterns:
    - "Derived-not-authored catalogs: a mapping computed at module load from a live registry (ENGINE_TYPES) rather than hardcoded, so it self-maintains when the registry grows"
    - "Inverted maps built FROM the forward declaration, never hand-maintained in parallel, with a load-time throw on an invariant violation (duplicate claim)"
    - "findUnmapped()-style shared helper so a verifier's real-data assertion and its synthetic negative case run through identical logic"

key-files:
  created:
    - lib/mastery/competencies.ts
    - scripts/verify-competency-catalog.ts
  modified: []

key-decisions:
  - "The plan's prose (23 dimensions, seven groups) was proposed as the expected derivation. Running allRubricDimensionKeys() against the real registry confirmed exactly 23 unique keys and the seven-way grouping mapped all 23 with zero overlap and zero orphans — no discrepancy to report; prose and live registry agree."
  - "allRubricDimensionKeys() is computed fresh on every call (not cached at module scope) so a test that swaps the registry via registerEngineTypeForTests sees an updated result."
  - "Section 6 (cross-type spot-check) builds its own dimension-to-types map directly from ENGINE_TYPES + SHARED_RUBRIC_DIMENSION_KEYS rather than trusting the catalog's own grouping, so the assertion is a genuine check against the live registry and not circular."

requirements-completed: [REQ-103]

duration: 2min
completed: 2026-10-20
---

# Phase 21 Plan 02: Competency Catalog Summary

**Cross-type competency catalog (7 competencies) derived mechanically from all 23 rubric dimensions in the live `ENGINE_TYPES` registry, with a totality verifier proven to bite via a synthetic phantom dimension**

## Performance

- **Duration:** ~2 min (09:48:59 → 09:50:12)
- **Started:** 2026-10-20T14:48:59Z
- **Completed:** 2026-10-20T14:50:12Z
- **Tasks:** 2
- **Files modified:** 2 (both created)

## Accomplishments

- `lib/mastery/competencies.ts` derives `allRubricDimensionKeys()` from `SHARED_RUBRIC_DIMENSION_KEYS` plus every `ENGINE_TYPES` entry's `extraRubricDimensions` at module load — confirmed to return all 23 live dimension keys, not a hardcoded list.
- Grouped the 23 dimensions into 7 competencies (`delivery_presence`, `structure_and_clarity`, `concision_and_focus`, `audience_attunement`, `holding_position_under_pressure`, `credibility_of_the_case`, `outcome_achievement`), each with a documented rationale.
- `DIMENSION_TO_COMPETENCY` is inverted from `COMPETENCIES` (never hand-maintained as a parallel list) and throws at module load on a double-claimed dimension; `competencyForDimension()` returns `null` instead, so a verifier can collect every unmapped key.
- `COMPETENCY_CATALOG_SOURCE` and an accompanying block comment document the REQ-103 replaceability seam: a later faculty-authored framework replaces only this file's body, provided consumers never switch on a raw dimension key.
- `scripts/verify-competency-catalog.ts` proves totality, no-orphans, no-double-claim, every-competency-has-evidence, well-formed `order`, a cross-type spot-check (all 7 competencies, not just 3, span more than one interaction type), and a negative case built on a shared `findUnmapped()` helper.
- The totality guard was proven to bite, not merely written: temporarily dropped `"visual"` from `delivery_presence`'s `dimensionKeys`, re-ran the verifier (exit 1, reported `visual` as unmapped, section 7 also correctly failed), then restored the file and confirmed byte-identical content plus `ALL PASS` / exit 0.

## Task Commits

Each task was committed atomically:

1. **Task 1: Derive and write the competency catalog with a total dimension mapping** - `eef9c90` (feat)
2. **Task 2: Write the totality verifier with a deliberately-unmapped negative case** - `ef764bf` (test)

## Files Created/Modified

- `lib/mastery/competencies.ts` - `allRubricDimensionKeys()`, `COMPETENCIES` (7 entries), `DIMENSION_TO_COMPETENCY`, `competencyForDimension()`, `CompetencyKey`, `Competency`, `COMPETENCY_CATALOG_SOURCE`
- `scripts/verify-competency-catalog.ts` - 7-section verifier (`check()` counter pattern matching `verify-engine-config.ts`), `findUnmapped()` helper shared between the real-data and synthetic-phantom assertions

## Decisions Made

- Confirmed the plan's 23-dimension/7-group prose matches the live registry exactly (`npx tsx -e` smoke test: `7 23 23`) — documented here per the plan-specific note rather than silently trusting the number.
- Kept `allRubricDimensionKeys()` uncached (recomputed per call) to stay correct under `registerEngineTypeForTests`-based registry swaps a future test might use.
- Cross-type spot-check in the verifier independently recomputes which engine types declare each dimension from `ENGINE_TYPES`/`SHARED_RUBRIC_DIMENSION_KEYS` rather than reusing the catalog's grouping, keeping the assertion non-circular.

## Deviations from Plan

None - plan executed exactly as written. The one "discrepancy to watch for" the plan called out (23 vs. the live count) did not materialize — the real registry yields exactly 23 unique dimension keys and the seven-way grouping accounts for all of them with no duplicates and no orphans.

## Issues Encountered

One self-caught import error: `InteractionTypeConfig` is not exported from `lib/engine/registry.ts` (only `ENGINE_TYPES`/`getEngineType`/`listEngineTypes`/`registerEngineTypeForTests` are). Fixed by importing the type from `lib/engine/types.ts` instead, alongside `SHARED_RUBRIC_DIMENSION_KEYS`. Caught by `npx tsc --noEmit` before the Task 1 commit; no separate deviation commit needed since it was resolved before the task's single commit.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

`COMPETENCIES` / `competencyForDimension` / `allRubricDimensionKeys` are ready for the mastery-arithmetic and path-engine plans in this phase to consume. Only files touched were `lib/mastery/competencies.ts` and `scripts/verify-competency-catalog.ts`, confirmed by this plan's own task commits — no engine, pitch, difficult-conversation, or other type-record file was edited.

---
*Phase: 21-adaptive-mastery-path*
*Completed: 2026-10-20*

## Self-Check: PASSED

All claimed files and commits verified present on disk / in git history.
