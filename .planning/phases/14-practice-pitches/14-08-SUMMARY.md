---
phase: 14-practice-pitches
plan: 08
subsystem: engine
tags: [typescript, pitch, elevator, prompts, registry, termination, time-budget]

# Dependency graph
requires:
  - phase: 13-one-on-one-conversation-engine
    provides: "InteractionTypeConfig, resolveSessionConfig, assembleSystemPrompt, <engine-end> marker, SetupStepDeclaration"
  - phase: 14-practice-pitches
    provides: "14-02 avatarEndFloor / firstTurnWindowSeconds; 14-04 applyEarlyEndCap / EARLY_END_CAP"
provides:
  - "PITCH_ELEVATOR_TYPE registered as pitch-elevator"
  - "buildElevatorSystemPrompt / ELEVATOR_EVALUATOR_PROMPT / buildElevatorEvaluationContext"
  - "ELEVATOR_LISTENER_PERSONA (Dana Reyes) — full persona always in live prompt"
  - "scripts/verify-pitch-types.ts elevator section (deck section reserved for 14-09)"
affects: [14-10-elevator-wizard-steps, 14-14-scoring-wiring, 14-15-tuning]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Type is one registry record plus prompts — no route, evaluator module, or report page"
    - "Disclosure instruction branches on listenerKnowledge; persona content never withheld from the model"
    - "Floor enforced in resolveTermination only — prompt does not instruct the model to count turns"

key-files:
  created:
    - lib/pitch/elevator-prompts.ts
    - lib/pitch/elevator-type.ts
    - scripts/verify-pitch-types.ts
  modified:
    - lib/engine/registry.ts
    - scripts/verify-pitch-engine-extensions.ts
    - scripts/verify-report-structure.ts

key-decisions:
  - "avatarEndReasons: pitch_too_long | no_common_ground | unclear_ask | lost_interest"
  - "Termination marker syntax from 13-03: <engine-end reason=\"...\" />"
  - "setupSteps: pitch-subject → listener-knowledge (CameraConsentStep appended by SetupWizard)"
  - "ELEVATOR_LISTENER_PERSONA = Dana Reyes, VP Ops at a mid-size logistics firm (CONTEXT name-role example)"
  - "Disengagement cues: shorter/flatter replies, less elaboration, cutting to \"so what's the ask?\", closing replies; forbid meter/gauge/verbal minute warning"
  - "finishPendingFlip: request-path; supportsRetry: true; checkpointing: none (14-05)"

patterns-established:
  - "Built-in listener persona lives in elevator-prompts.ts as session-constant type data; wizard (14-10) discloses a level-filtered view of the same persona"
  - "verify-pitch-types.ts has a clearly separated elevator section; 14-09 appends deck below"

requirements-completed: [P14-SC1]

# Metrics
duration: 3min
completed: 2026-10-04
---

# Phase 14 Plan 08: Elevator Pitch Type Record Summary

**`pitch-elevator` is one config record plus prompts: six rubric dimensions including discovery/tailoring, a soft 60s opening window, and a floor-gated avatar walk-out — no engagement meter and no hard cutoff.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-10-04T04:26:42Z
- **Completed:** 2026-10-04T04:28:58Z
- **Tasks:** 3
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments
- Shipped session-constant live + evaluator prompts with full listener persona, knowledge-level disclosure branching, dialogue-only disengagement, and `<engine-end>` reason vocabulary.
- Registered `PITCH_ELEVATOR_TYPE` with six dimensions, `firstTurnWindowSeconds: 60`, `avatarEndFloor.minAssistantTurns: 2`, outcome fields, and `postProcessScores: applyEarlyEndCap`.
- Proved resolution, floor, soft window, cap wiring, and locked-decision text guards in `scripts/verify-pitch-types.ts`.

## Locked details for downstream plans

| Item | Value |
| --- | --- |
| `avatarEndReasons` | `pitch_too_long`, `no_common_ground`, `unclear_ask`, `lost_interest` |
| Termination marker | `<engine-end reason="..." />` (13-03 / `lib/engine/termination.ts`) |
| `avatarEndFloor` | `{ minAssistantTurns: 2 }` |
| `firstTurnWindowSeconds` | `60` |
| `setupSteps` | `pitch-subject` → `PitchSubjectStep`; `listener-knowledge` → `ListenerKnowledgeStep` |
| Listener persona | Dana Reyes — VP of Operations at a mid-size logistics firm (interests: last-mile cost, warehouse/driver coordination, sustainability-with-margins; priorities: real-operator proof, clear ask / 90-day pilot, founders who listen) |
| Disengagement cues | shorter/flatter replies; less elaboration; "so what's the ask?"; close the reply body; never announce time, narrate engagement, or use a meter/gauge |

## Task Commits

Each task was committed atomically:

1. **Task 1: The elevator live system prompt and evaluator prompt** - `2ac74fb` (feat)
2. **Task 2: The pitch-elevator type record, registered** - `6766f08` (feat)
3. **Task 3: Prove the type resolves correctly and cannot violate a locked decision** - `8d614c2` (test)

**Plan metadata:** (this commit)

## Files Created/Modified
- `lib/pitch/elevator-prompts.ts` — live prompt, evaluator prompt, evaluation context, `ELEVATOR_LISTENER_PERSONA`
- `lib/pitch/elevator-type.ts` — `PITCH_ELEVATOR_TYPE`
- `lib/engine/registry.ts` — one import + one `ENGINE_TYPES` entry
- `scripts/verify-pitch-types.ts` — ten elevator assertion sections
- `scripts/verify-pitch-engine-extensions.ts` — Phase 13 avatar-end regression scoped to original five slugs
- `scripts/verify-report-structure.ts` — pitch-elevator instance stub in ENGINE_TYPES schema loop

## Decisions Made
See `key-decisions` in frontmatter. Persona content is Claude's Discretion anchored on CONTEXT's Dana Reyes example; floor shape `minAssistantTurns: 2` matches 14-02 / CONTEXT.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Scoped Phase 13 avatar-end regression in verify-pitch-engine-extensions.ts**
- **Found during:** Task 3
- **Issue:** Section 5 asserted every `ENGINE_TYPES` record has `avatarMayEnd: false`. Parallel Phase 16's `networking` (and this plan's `pitch-elevator`) set `avatarMayEnd: true`, so the script could not exit 0.
- **Fix:** Filter the loop to the five Phase 13 slugs.
- **Files modified:** `scripts/verify-pitch-engine-extensions.ts`
- **Committed in:** `8d614c2`

**2. [Rule 3 - Blocking] Stub pitch-elevator instance in verify-report-structure.ts**
- **Found during:** Task 3
- **Issue:** Section 6.1 iterates all `ENGINE_TYPES` with `{ kind: "none" }` except case-study; `pitch-elevator` requires an instance and failed resolve.
- **Fix:** Supply a minimal `pitch-elevator` instance in that loop.
- **Files modified:** `scripts/verify-report-structure.ts`
- **Committed in:** `8d614c2`

### Adaptations (documented, not Rule 1–3 fixes)

**1. postProcessScores checked via getEngineType**
- **Found during:** Task 3
- **Issue:** Plan prose said `config.postProcessScores`; that hook lives on `InteractionTypeConfig` (14-04), not `ResolvedSessionConfig`.
- **Adaptation:** Verify script uses `getEngineType("pitch-elevator")?.postProcessScores`.
- **Committed in:** `8d614c2`

**2. finishPendingFlip / supportsRetry not specified in plan bullets**
- **Found during:** Task 2
- **Issue:** `InteractionTypeConfig` requires both fields; plan listed checkpointing but not finish/retry.
- **Adaptation:** `finishPendingFlip: "request-path"`, `supportsRetry: true` (practice-session precedent; not case-study runner shape).
- **Committed in:** `6766f08`

**Total deviations:** 2 auto-fixed; 2 documented adaptations

## Issues Encountered
None blocking. Pre-existing `lib/engine/prompts.ts` still has `config.typeSlug === "case-study"` (out of scope; not introduced here).

## User Setup Required
None — no external service configuration required.

## Verification results
- `npx tsx scripts/verify-pitch-types.ts` — ALL PASS
- `npx tsx scripts/verify-pitch-engine-extensions.ts` — ALL PASS
- `npx tsx scripts/verify-report-structure.ts` — ALL PASS
- `npx tsx scripts/verify-engine-config.ts` — ALL PASS (now also resolves `pitch-elevator`)
- `npx tsc --noEmit` — no errors in this plan's files
- `git diff --stat lib/engine/registry.ts` — 2 insertions (import + array entry)
- No route, component, or Prisma file in this plan's commits

## Next Phase Readiness
- 14-10 builds `PitchSubjectStep` / `ListenerKnowledgeStep` against the declared setup step ids and discloses `ELEVATOR_LISTENER_PERSONA` by knowledge level.
- 14-14 / 14-15 consume outcome fields, early-end cap, and disengagement cue wording against real sessions.

---
*Phase: 14-practice-pitches*
*Completed: 2026-10-04*

## Self-Check: PASSED

- FOUND: lib/pitch/elevator-prompts.ts
- FOUND: lib/pitch/elevator-type.ts
- FOUND: scripts/verify-pitch-types.ts
- FOUND: .planning/phases/14-practice-pitches/14-08-SUMMARY.md
- FOUND commit: 2ac74fb
- FOUND commit: 6766f08
- FOUND commit: 8d614c2
- `npx tsx scripts/verify-pitch-types.ts` exits 0
