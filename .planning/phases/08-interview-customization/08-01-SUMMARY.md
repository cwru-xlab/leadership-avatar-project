---
phase: 08-interview-customization
plan: 01
subsystem: interview
tags: [typescript, prompt-engineering, data-layer]

# Dependency graph
requires: []
provides:
  - "4-record InterviewType registry (general/technical/consulting/early-career), general unchanged and first"
  - "Curated closed-set option lists: CURATED_INDUSTRIES, CURATED_ROLES, SESSION_LENGTH_PRESETS, PERSONALITY_DIALS"
  - "resolveInterviewType — pure, deterministic validating resolver merging customization onto a preset"
  - "resolveCustomizationRecord — the six fields session/start persists on the report row"
affects: [08-02, 08-03, 08-04, 08-05, 08-06, 08-07, 08-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CuratedOption { slug, label, promptValue } separates UI label from the exact prompt-interpolated phrase"
    - "Closed-set validation via plain array membership checks, no zod/validation library"
    - "Silent fallback to preset defaults on any unknown/empty/malicious customization field (no throw)"

key-files:
  created:
    - lib/interview/customization-options.ts
    - lib/interview/customization.ts
  modified:
    - lib/interview/types.ts

key-decisions:
  - "GENERAL_INTERVIEW edited only to add questionAreas — no other field touched, preserving the shipped human-validated path"
  - "CURATED_ROLES is a flat list, deliberately not cascading off industry, per plan spec"
  - "PERSONALITY_DIALS' neutral clause is the empty string, the no-op default"
  - "A distilled pasted persona fully replaces the preset persona and the personality dial is ignored in that branch, per 08-CONTEXT.md's named-person framing"

patterns-established:
  - "resolveInterviewType is the single call site every route should use in place of raw getInterviewType once customization is wired in (08-04+)"

requirements-completed: [REQ-17, REQ-20, REQ-21, REQ-22, REQ-23]

# Metrics
duration: 20min
completed: 2026-09-21
---

# Phase 8 Plan 01: Interview Customization Data Layer Summary

**Four-preset InterviewType registry plus a pure, deterministic `resolveInterviewType` resolver that validates every customization field against closed curated lists before it reaches the system prompt.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-09-21T14:16:15Z
- **Tasks:** 3 completed
- **Files modified:** 3 (1 modified, 2 created)

## Accomplishments
- Registered `TECHNICAL_INTERVIEW`, `CONSULTING_INTERVIEW`, `EARLY_CAREER_INTERVIEW` presets alongside the untouched `GENERAL_INTERVIEW`, with `general` first in `INTERVIEW_TYPES` insertion order
- Built four closed, typed curated option lists (industries, roles, session lengths, personality dials) that the resolver validates against
- Built `resolveInterviewType`, a pure function proven deterministic and injection-safe by direct assertion, plus `composePersona` and `resolveCustomizationRecord`

## Task Commits

Each task was committed atomically:

1. **Task 1: Add three preset records and a questionAreas display field** - `ab371a5` (feat)
2. **Task 2: Create the curated option lists** - `a2d3c2e` (feat)
3. **Task 3: Build the validating resolver** - `4d764ab` (feat)

**Plan metadata:** committed as part of this SUMMARY/STATE update.

## Files Created/Modified
- `lib/interview/types.ts` - Added `questionAreas?: string[]` to `InterviewType`; added and registered `TECHNICAL_INTERVIEW`, `CONSULTING_INTERVIEW`, `EARLY_CAREER_INTERVIEW`
- `lib/interview/customization-options.ts` - New file: `CuratedOption` shape, `CURATED_INDUSTRIES`, `CURATED_ROLES`, `SESSION_LENGTH_PRESETS`, `PERSONALITY_DIALS`, `INTERVIEW_DIFFICULTIES`, and default-slug constants
- `lib/interview/customization.ts` - New file: `InterviewCustomizationInput`, `MAX_PERSONA_LENGTH`, `composePersona`, `resolveInterviewType`, `resolveCustomizationRecord`

## Decisions Made
- Kept `GENERAL_INTERVIEW`'s six prompt-interpolated fields byte-identical; only addition was the display-only `questionAreas` array, matching the locked decision in 08-CONTEXT.md.
- `standard` session length preset (20 min / 9 questions) intentionally mirrors `GENERAL_INTERVIEW`'s existing values exactly, verified via grep in the verify step, so resolving `general` with no length override or an explicit `standard` override is indistinguishable.
- Followed the plan's explicit instruction not to introduce zod — validation is plain array `.find()`/`.includes()` membership checks.

## Deviations from Plan

None - plan executed exactly as written. All three tasks matched their `<action>` specs, and every `<verify>` command in the plan passed as specified.

## Issues Encountered

`npx tsc --noEmit` surfaced a pre-existing error in `lib/interview/report-dto.ts` ("Property 'customization' is missing") caused by uncommitted, in-flight work from a concurrently-running wave agent on a different plan (08-04+), not by this plan's files. Confirmed by stashing all uncommitted changes and re-running `tsc --noEmit` against the last commit — it was clean, isolating the error to the concurrent WIP. Verified separately that `tsc --noEmit` reports zero errors in `lib/interview/customization.ts`, `lib/interview/customization-options.ts`, and `lib/interview/types.ts` specifically (`grep`-filtered). No fix applied — out of scope for this plan and owned by whichever plan modifies `report-dto.ts`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

The data layer this plan built (`resolveInterviewType`, curated lists, four presets) is ready for 08-04+ to wire into `session/start` and the chat route as the replacement for raw `getInterviewType`. No blockers. The concurrent `report-dto.ts` WIP noted above is the responsibility of the plan that owns that file, not a blocker for this plan's own success criteria.

---
*Phase: 08-interview-customization*
*Completed: 2026-09-21*

## Self-Check: PASSED

All created files confirmed present on disk; all three task commits (`ab371a5`, `a2d3c2e`, `4d764ab`) confirmed in git history.
