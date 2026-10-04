---
phase: 13-one-on-one-conversation-engine
plan: 01
subsystem: engine
tags: [typescript, config, interview, scenario]

# Dependency graph
requires: []
provides:
  - "lib/engine/types.ts: InteractionTypeConfig / InstanceConfig / ResolvedSessionConfig and the four primitive config shapes (TerminationPolicyConfig, VisibleContextConfig, OutcomeRecordConfig, TimeBudgetConfig)"
  - "lib/engine/registry.ts: ENGINE_TYPES (4 interview presets + case-study), getEngineType(), listEngineTypes()"
  - "lib/engine/resolve.ts: resolveSessionConfig(typeSlug, input), pure and deterministic, plus resolveFromTypeConfig() for testing synthetic records"
  - "scripts/verify-engine-config.ts: executable proof the layer behaves per REQ-60/61/72"
affects: [13-02-report-dto, 13-03-primitives-runtime, 13-06-prompt-assembly, 13-09-setup-wizard, "14-16 new interaction types"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A new interaction type is one record added to ENGINE_TYPES in lib/engine/registry.ts — no route, evaluator, or page per type (REQ-60)"
    - "Shared rubric dimensions (visual/vocal/content/behavioral) are NOT declarable by a type record; resolve.ts structurally rejects any extra that reuses a shared key (REQ-72)"
    - "TYPE (code) + INSTANCE (data) resolve into one ResolvedSessionConfig via a pure, throw-free resolver (REQ-61)"

key-files:
  created:
    - lib/engine/types.ts
    - lib/engine/registry.ts
    - lib/engine/resolve.ts
    - scripts/verify-engine-config.ts
  modified: []

key-decisions:
  - "liveSystemPrompt is typed as (config: ResolvedSessionConfig, extra: LiveSystemPromptExtra) => string — resumeText/language travel as a sibling 'extra' input rather than folding into ResolvedSessionConfig, because lib/interview/customization.ts already treats them as outside the TYPE/INSTANCE layer this plan resolves. Still strictly session-constant."
  - "Interview-shaped detection in resolve.ts is implicit: resolveFromTypeConfig calls getInterviewType(type.slug) from the LEGACY lib/interview/types.ts registry — if it returns a record, customization is resolved via the existing resolveInterviewType/resolveCustomizationRecord. This avoids adding a new 'supportsCustomization' flag to InteractionTypeConfig while keeping the legacy module the single validator of picker fields."
  - "resolveFromTypeConfig(type, input) is exported alongside resolveSessionConfig(slug, input) so the verify script can exercise the duplicate-rubric-key rejection path against a synthetic record — none of the five built-in records declare a colliding extra, so the by-slug entry point alone could not test it."
  - "case-study's liveSystemPrompt is a provisional, best-effort assembly (style guide + case background + avatar list) mirroring app/api/interaction/chat/route.ts's existing inline case-study branch. It is NOT wired into any route by this plan — the plan's case-study section only specified evaluatorPrompt/buildEvaluationContext — and is flagged for plan 13-06, which must also solve per-avatar role selection (today chosen per-scene at request time, not at type-resolution time)."
  - "Added a module-scope sanity check in registry.ts: at import time it throws if any slug in the legacy INTERVIEW_TYPES map is missing from ENGINE_TYPES, so a future edit that drops a preset from either registry fails loudly instead of silently diverging."

requirements-completed: [REQ-60, REQ-61]

# Metrics
duration: 64min
completed: 2026-10-04
---

# Phase 13 Plan 01: Engine Config Layer Summary

**TypeScript config layer (`lib/engine/{types,registry,resolve}.ts`) resolving TYPE + INSTANCE into one `ResolvedSessionConfig`, with the four interview presets and the case-study type as its first two real consumers.**

## Performance

- **Duration:** 64 min
- **Started:** 2026-10-03T21:30 (approx, by first commit)
- **Completed:** 2026-10-04T01:35
- **Tasks:** 3
- **Files modified:** 4 (all new)

## Accomplishments
- Declared `InteractionTypeConfig`, `InstanceConfig`, `ResolvedSessionConfig`, and the four primitive config shapes (`TerminationPolicyConfig`, `VisibleContextConfig`, `OutcomeRecordConfig`, `TimeBudgetConfig`) with visual/vocal/content/behavioral structurally un-removable.
- Transcribed the four interview presets from `lib/interview/types.ts` field-for-field into `ENGINE_TYPES`, plus a fifth `case-study` record wired to the existing `SCENARIO_EVALUATOR_PROMPT`.
- Wrote a pure, throw-free `resolveSessionConfig` that composes TYPE + INSTANCE, rejects duplicate rubric keys, and resolves interview customization through the existing `lib/interview/customization.ts` validator.
- Proved all of the above with `scripts/verify-engine-config.ts` (7 sections, all passing), including a by-hand confirmation that deleting the shared "visual" dimension breaks the script.

## Task Commits

Each task was committed atomically:

1. **Task 1: Declare the engine's config types** - `cd44e16` (feat)
2. **Task 2: Built-in TYPE records and the resolver** - `92727f5` (feat)
3. **Task 3: Executable verification script** - `e1a1236` (test)

**Plan metadata:** (this commit)

## Files Created/Modified
- `lib/engine/types.ts` - Config type declarations (no runtime logic)
- `lib/engine/registry.ts` - `ENGINE_TYPES`, `getEngineType`, `listEngineTypes`
- `lib/engine/resolve.ts` - `resolveSessionConfig`, `resolveFromTypeConfig`
- `scripts/verify-engine-config.ts` - 7-section executable proof

## Decisions Made
See `key-decisions` in frontmatter above — summarized: (1) prompt-building extra inputs (resumeText/language) travel as a sibling parameter rather than inside `ResolvedSessionConfig`; (2) "is this an interview-shaped type" is answered by probing the legacy `lib/interview/types.ts` registry by slug rather than adding a new flag; (3) a lower-level `resolveFromTypeConfig` export exists specifically so the verify script can test the duplicate-dimension rejection path, which no built-in record exercises; (4) case-study's live prompt assembly is explicitly provisional and unwired, deferred to plan 13-06.

## Deviations from Plan

None — plan executed exactly as written. One eslint `--fix` pass reformatted `lib/engine/types.ts`'s already-committed task-1 code (purely whitespace/line-wrapping) as part of task 2's lint pass; folded into the task 2 commit rather than a separate commit, since it touched no behavior.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `lib/engine/{types,registry,resolve}.ts` are ready for plan 13-03 (primitives runtime) and 13-06 (prompt assembly generalization) to build on without redefining these shapes.
- Zero behavior change confirmed: `git diff --stat` against `lib/interview/prompts.ts`, `lib/interview/types.ts`, `lib/scenario/prompts.ts`, and `lib/interactions/index.ts` is empty.
- Known open item for 13-06: case-study's `liveSystemPrompt` needs per-avatar role selection, which the type-level record cannot express alone.

---
*Phase: 13-one-on-one-conversation-engine*
*Completed: 2026-10-04*

## Self-Check: PASSED

- FOUND: lib/engine/types.ts
- FOUND: lib/engine/registry.ts
- FOUND: lib/engine/resolve.ts
- FOUND: scripts/verify-engine-config.ts
- FOUND commit: cd44e16 (feat(13-01): declare engine config types including the four primitives)
- FOUND commit: 92727f5 (feat(13-01): built-in TYPE records and the TYPE+INSTANCE resolver)
- FOUND commit: e1a1236 (test(13-01): executable verification for the engine config layer)
- `npx tsc --noEmit` clean
- `npx eslint lib/engine` clean (0 errors, 0 warnings)
- `npx tsx scripts/verify-engine-config.ts` exits 0, all 7 sections PASS
- `git diff --stat` against lib/interview/prompts.ts, lib/interview/types.ts, lib/scenario/prompts.ts, lib/interactions/index.ts is empty — zero behavior change confirmed
- All three must_haves truths hold: (1) a type is one record with no route/evaluator/page per type, (2) a session config resolves from TYPE + optional INSTANCE through resolveSessionConfig, (3) visual/vocal are present in every resolved type's rubric and structurally un-removable (verified by the rejected-duplicate-"visual" assertion)
