---
phase: 15-difficult-conversations
plan: 08
subsystem: ui
tags: [difficult-conversation, briefing, difficulty, session-safety, end-session, never-break-character]

requires:
  - phase: 15-difficult-conversations
    provides: buildStudentBriefing, setupSteps conversation-briefing/difficulty, student end reason codes (15-06 / 15-01)
  - phase: 13-one-on-one-conversation-engine
    provides: SetupWizard step map, PracticeSessionShell, finish route with terminationReason
provides:
  - ConversationBriefingStep with hiddenPosition unreachable by type
  - ConversationDifficultyStep (three bands, session-hidden)
  - SessionSafetyPanel (End-session + static support note)
  - InCharacterClosePrompt (student_closed_in_character confirm)
  - Difficult-conversation wiring on /practice/[type]/[instanceId]
affects:
  - 15-10 (live drift harness)
  - 15-11 (Section 2 never-break-character / walk-out evidence)

tech-stack:
  added: []
  patterns:
    - "Consume single sessionPanel slot — never invent a parallel panel mechanism"
    - "Out-of-band End-session vs in-character close use distinct reason codes"
    - "Avatar ends auto-finish with neutral copy; no error toast"

key-files:
  created:
    - components/practice/steps/ConversationBriefingStep.tsx
    - components/practice/steps/ConversationDifficultyStep.tsx
    - components/practice/panels/SessionSafetyPanel.tsx
    - components/practice/panels/InCharacterClosePrompt.tsx
    - app/api/difficult-conversation/play/route.ts
  modified:
    - components/practice/PracticeSessionShell.tsx
    - app/practice/[type]/[instanceId]/page.tsx
    - lib/engine/session.ts
    - app/api/practice/session/start/route.ts

key-decisions:
  - "Shell sessionPanel slot CONSUMED (already present from Phase 14 parallel work) — Against 13-10 extension not re-declared as new"
  - "In-character close is always-available student control — no avatar-text classifier"
  - "End-session = get me out (student_left_session); I'm finished = graded close (student_closed_in_character)"
  - "skip_checkpoints:true — Task 3 human walkthrough deferred to /gsd/verify-work 15"

patterns-established:
  - "Type panels finish via sessionFinishRef with explicit reason/source"
  - "hideDefaultEndControl + SessionSafetyPanel owns End for difficult-conversation"

issues-created: []

duration: 25min
completed: 2026-10-04
---

# Phase 15 Plan 08: Live Surface — Briefing, Difficulty, Safety Summary

**Full briefing with hiddenPosition compile-blocked, three-band difficulty that vanishes in-session, always-visible End-session + support note, and explicit in-character close confirm**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-10-04T04:32:13Z
- **Completed:** 2026-10-04T04:55:00Z
- **Tasks:** 2 auto + 1 checkpoint skipped (deferred)
- **Files modified:** 9

## Accomplishments

- Briefing step renders situation / who's who / shared backstory / objective / stakes plus the discovery-acknowledgment line; `hiddenPosition` is a type error on props
- Difficulty step offers receptive / guarded / hostile only, with the product promise that the setting disappears once the session starts
- `SessionSafetyPanel` + `InCharacterClosePrompt` mount in the existing `sessionPanel` slot for difficult-conversation
- Shell finish path carries `terminationReason` / `terminationSource`; avatar ends auto-finish with "The conversation ended." (no error chrome)

## Shell panel slot (Against 13-10)

**CONSUMED.** `PracticeSessionShell` already exposed `sessionPanel?: ReactNode` (Phase 14 parallel work in the working tree). This plan did not add a second slot. Grep shows one prop definition.

## Final copy and controls

### Support note (`SUPPORT_RESOURCE_NOTE`)

> If something in this practice is affecting you for real, pause and reach out to someone you trust, or to your campus counseling / employee assistance resources. This screen will still be here when you come back.

Preceded by app chrome text: practice conversation; character stays in role; end anytime with the control above.

### End controls — distinction

| Control | Copy | Reason | Judgement |
| --- | --- | --- | --- |
| End session | "End session" / confirm "End this session now? You'll still get your report." | `student_left_session` | Out-of-band exit — not a graded close |
| I'm finished — close it out | "Close the conversation on your terms. How you end it is part of what gets reviewed." | `student_closed_in_character` | Graded decisive close |

### Band labels (unchanged from 15-02)

| Band | Meaning |
| --- | --- |
| Receptive | Defensive but reachable. |
| Guarded | Deflects, needs to be pinned down. |
| Hostile | Counter-attacks and has a bottom line they will state late. |

### Avatar-end floor

Unchanged: `avatarEndFloor.minAssistantTurns: 4` (from 15-06).

## Task Commits

1. **Task 1: The briefing step and the difficulty step** — `8635963` (feat)
2. **Task 2: End-session, support note, in-character close** — `f49b1e8` (feat)
3. **Task 3: Three real sessions** — SKIPPED (`skip_checkpoints:true`); deferred to `/gsd/verify-work 15`

**Plan metadata:** (docs commit follows)

## hiddenPosition type-error evidence (Task 1 verify)

Attempting to pass `hiddenPosition` into `ConversationBriefingFields`:

```
Object literal may only specify known properties, and 'hiddenPosition' does not exist in type 'ConversationBriefingFields'.
```

`grep -n "hiddenPosition" ConversationBriefingStep.tsx` returns only comments.

## Deferred human walkthrough (Task 3) — for `/gsd/verify-work 15`

Checkpoint skipped per parallel `skip_checkpoints:true`. Plan 15-11 Section 2 should re-run blocks A–E from `15-08-PLAN.md`:

- **A** — Briefing completeness; no hidden position; hostile session with no difficulty meter/indicator
- **B** — In-character close requires explicit student confirm
- **C** — Distress case: character stays in role; End-session + support note visible from first frame; mid-turn End works
- **D** — Walk-out is an outcome (neutral transition, report, floor of four)
- **E** — Calibration on bands, support note, end-control copy, floor value

Block C and D verdicts are intentionally blank here until that verify pass — do not invent PASS without human confirmation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] startSession had no difficult-conversation branch**
- **Found during:** Task 2 (session launch)
- **Issue:** `instance.required` types without `authoredInWizard` fell through to case-study S3 `getCase`, so DC launch 404'd
- **Fix:** Added seeded-first resolve + snapshot write before case-study fallthrough; wired `difficulty` through start route
- **Files modified:** `lib/engine/session.ts`, `app/api/practice/session/start/route.ts`
- **Committed in:** `f49b1e8`

**2. [Rule 3 - Blocking] No play GET for instance page load**
- **Found during:** Task 1/2 (page must load briefing fields + resolved avatar)
- **Issue:** List API omits briefing fields; no client-safe play loader
- **Fix:** Added `GET /api/difficult-conversation/play?id=`
- **Files modified:** `app/api/difficult-conversation/play/route.ts`
- **Committed in:** `f49b1e8`

### Deferred Enhancements

- Task 3 human walkthrough blocks A–E (verify-work 15)
- Authored title fallback uses situation slice when seeded title absent (acceptable; play route prefers record title)

---

**Total deviations:** 2 auto-fixed (Rule 3), 1 deferred checkpoint  
**Impact on plan:** Required for launch correctness; no scope creep into report or /conversations pages.

## Issues Encountered

None blocking completion of auto tasks. Prompt-safety verify briefly failed on a template-literal title fallback in `session.ts` and was fixed with string concat before commit.

## Next Phase Readiness

- 15-09 (report) can render termination reason lines against `student_closed_in_character` / `student_left_session` / avatar ends
- 15-11 must collect Block C/D human verdicts deferred from Task 3

## Self-Check: PASSED

- FOUND: all artifact paths listed above
- FOUND: commits `8635963`, `f49b1e8`
- FOUND: single `sessionPanel?:` definition in PracticeSessionShell

---
*Phase: 15-difficult-conversations*
*Completed: 2026-10-04*
