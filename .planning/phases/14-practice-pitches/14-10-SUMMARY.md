---
phase: 14-practice-pitches
plan: 10
subsystem: ui
tags: [typescript, nextjs, pitch-elevator, SetupWizard, PitchTimerPanel, human-verify]

# Dependency graph
requires:
  - phase: 13-one-on-one-conversation-engine
    provides: "SetupWizard step map (13-09), PracticeSessionShell (13-10), getEngineType"
  - phase: 14-practice-pitches
    provides: "PITCH_ELEVATOR_TYPE + ELEVATOR_LISTENER_PERSONA (14-08); authoredInWizard startSession (14-05)"
provides:
  - "PitchSubjectStep / ListenerKnowledgeStep registered for pitch-elevator"
  - "PitchTimerPanel soft collapsible 30–60s window"
  - "PracticeSessionShell sessionPanel + onOpeningTurnTimingChange (13-10 extension)"
  - "Wizard-authored instance assembly posted at /api/practice/session/start"
affects: [14-12-deck-wizard-pattern, 14-14-scoring-wiring, 14-15-tuning]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wizard-state keys: pitchSubject (string), listenerKnowledge (blind|name-role|full-profile)"
    - "Level-matched DOM disclosure — blind renders no persona fields"
    - "PitchTimerPanel structurally has no onExpire/onTick"
    - "Opening-turn window concludes only on pitch-scale turns (≥30s voice or substantial typed text) after 516f278"

key-files:
  created:
    - components/practice/steps/PitchSubjectStep.tsx
    - components/practice/steps/ListenerKnowledgeStep.tsx
    - components/practice/panels/PitchTimerPanel.tsx
  modified:
    - app/practice/[type]/page.tsx
    - components/practice/PracticeSessionShell.tsx
    - app/api/interaction/chat/route.ts
    - lib/engine/prompts.ts
    - lib/engine/turn-control.ts

key-decisions:
  - "Wizard keys: pitchSubject + listenerKnowledge (match InstanceConfig)"
  - "13-10 extension: sessionPanel + onOpeningTurnTimingChange on PracticeSessionShell"
  - "Auto-pick first HeyGen catalog avatar for pitch (no interviewer step); display name from listener disclosure"
  - "Mid-checkpoint: short discovery turns must not freeze the 60s soft window (516f278)"

patterns-established:
  - "Wizard-authored instance types render on /practice/[type] when authoredInWizard"
  - "Type-specific in-session chrome is a shell sessionPanel slot, never a forked shell"

requirements-completed: [P14-SC1, P14-SC5]

# Metrics
duration: ~11h wall (autonomous ~25min + human verify overnight)
completed: 2026-10-04
---

# Phase 14 Plan 10: Elevator Wizard Steps & Pitch Timer Summary

**`/practice/pitch-elevator` runs end-to-end on Phase 13's wizard and shell: free-text subject, three-level listener disclosure, soft hideable 60s timer, dialogue-only disengagement — human-approved after a mid-checkpoint timer fix.**

## Performance

- **Duration:** ~11h wall (Tasks 1–2 autonomous; Task 3 human verify)
- **Started:** 2026-10-04T04:29:39Z
- **Completed:** 2026-10-04T15:34:12Z
- **Tasks:** 3/3 (Task 3 = human-verify checkpoint)
- **Files modified:** 9 code (3 created, 6 modified across task commits)

## Accomplishments

- Free-text `PitchSubjectStep` and three-card `ListenerKnowledgeStep` with DOM-level disclosure matching blind / name-role / full-profile.
- Soft `PitchTimerPanel` (no callbacks that can hard-stop a turn) registered via `PracticeSessionShell.sessionPanel`.
- `/practice/[type]` allows `instance.required && authoredInWizard`; assembles `pitch-elevator` instance at launch.
- Chat route accepts pitch instances, first-turn soft-window tail fragment, and `assistantTurnCount` for the avatar-end floor.
- Mid-checkpoint fix: short discovery turns no longer freeze the 60s window.

## Locked details for downstream plans

| Item | Value |
| --- | --- |
| Wizard state keys | `pitchSubject` (trimmed string), `listenerKnowledge` (`blind` \| `name-role` \| `full-profile`) |
| Setup step ids | `pitch-subject` → `PitchSubjectStep`; `listener-knowledge` → `ListenerKnowledgeStep` |
| 13-10 extensions | `sessionPanel?: ReactNode`; `onOpeningTurnTimingChange?: ({ turnStartedAt, phase }) => void` |
| Timer conclude rule (516f278) | Only pitch-scale turns (≥30s voice or substantial typed text) conclude the soft window; shorter turns reset it |
| Persona disclosure | Filtered in DOM only; full persona always in live prompt (14-08) |

## Human checkpoint verdict (Task 3)

User ran the three elevator sessions and replied:

> **approved**

Evidence / notes recorded **verbatim**:

> seems like 14-10 works decently well.

> Session A worked (after mid-checkpoint timer fix: short discovery turns no longer freeze the 60s window — committed as 516f278).

> One future-phase wish (NOT a 14-10 defect / do NOT implement now): when the avatar gets uninterested they verbally say they are going to leave but the session doesn't close. They want a future "temperature" variable that, after going below a threshold, plays one last statement from the avatar (user cannot cut off or respond) and then automatically ends the session to generate the report — framed as a failure instance.

Deferred to `deferred-items.md` under Phase 14 — not implemented in this plan.

## Task Commits

Each task was committed atomically:

1. **Task 1: The two elevator setup steps** - `4791e32` (feat)
2. **Task 2: Collapsible pitch timer and wizard-authored registration** - `0f14cbe` (feat)
3. **Task 3: Human verify** — no code commit; verdict recorded above
4. **Mid-checkpoint timer fix** - `516f278` (fix) — keep pitch timer open through short discovery turns

**Plan metadata:** (this commit)

## Files Created/Modified

- `components/practice/steps/PitchSubjectStep.tsx` — free-text subject step
- `components/practice/steps/ListenerKnowledgeStep.tsx` — three knowledge levels + level-matched disclosure
- `components/practice/panels/PitchTimerPanel.tsx` — soft collapsible pitch window
- `app/practice/[type]/page.tsx` — step registration + authoredInWizard allowance + timer wiring
- `components/practice/PracticeSessionShell.tsx` — `sessionPanel`, opening-turn timing, pitch-scale conclude rule
- `app/api/interaction/chat/route.ts` — pitch instance kinds, firstTurn, assistantTurnCount
- `lib/engine/prompts.ts` — first-turn soft window in tail block when `firstTurnWindowSeconds` set
- `lib/engine/turn-control.ts` — pass `assistantTurnCount` into `resolveTermination`

## Decisions Made

See `key-decisions` in frontmatter. Wizard keys and shell panel slot are the contract for 14-12 / 14-14.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Chat must accept pitch instances and first-turn / floor plumbing**
- **Found during:** Task 2
- **Issue:** `isInstanceConfig` only allowed `none` \| `case-study`; `buildTailBlock` skipped types with `totalSeconds: null` even when `firstTurnWindowSeconds` was set; `parseEngineTurn` omitted `assistantTurnCount` so floors fail-closed forever.
- **Fix:** Extended instance kind guard; emit time-budget fragment for first-turn window; pass assistant turn count (including current reply) into `resolveTermination`.
- **Files modified:** `app/api/interaction/chat/route.ts`, `lib/engine/prompts.ts`, `lib/engine/turn-control.ts`
- **Committed in:** `0f14cbe`

**2. [Rule 1 - Bug] Soft window froze on short discovery turns**
- **Found during:** Task 3 human verify (Session A)
- **Issue:** First student utterance concluded the 60s window, so brief intros froze the timer at a few seconds.
- **Fix:** Only pitch-scale turns (≥30s voice or substantial typed text) conclude the window; shorter turns reset it.
- **Files modified:** `PracticeSessionShell.tsx`, `PitchTimerPanel.tsx`
- **Committed in:** `516f278`

### Adaptations

**1. Auto-select HeyGen avatar for pitch**
- **Found during:** Task 2
- **Issue:** Elevator setupSteps have no interviewer step; shell requires `avatarConfig`.
- **Adaptation:** Page fetches `/api/interview/interviewers` once and uses the first catalog entry; display name follows listener disclosure.
- **Committed in:** `0f14cbe`

**Total deviations:** 2 auto-fixed; 1 adaptation

## Issues Encountered

None blocking after `516f278`. Future walk-out auto-end / temperature wish deferred (not a defect).

## User Setup Required

None beyond existing HeyGen / OpenAI keys for live sessions.

## Verification results

- Human Task 3: **approved** (verbatim notes above)
- Timer mid-session collapse + soft cutoff verified in live Session A/B path
- No engagement meter/gauge; no hard cutoff of student turn

## Next Phase Readiness

- 14-12 may follow the same wizard-state key + authoredInWizard registration pattern.
- 14-14 / 14-15 consume elevator sessions and may revisit disengagement cue wording; the deferred temperature/auto-end wish is a later-phase enhancement, not 14-10 scope.

---
*Phase: 14-practice-pitches*
*Completed: 2026-10-04*

## Self-Check: PASSED

- FOUND: PitchSubjectStep / ListenerKnowledgeStep / PitchTimerPanel
- FOUND: 14-10-SUMMARY.md
- FOUND commits: 4791e32, 0f14cbe, 516f278
