---
phase: 15-difficult-conversations
plan: 06
subsystem: engine
tags: [difficult-conversation, prompts, anti-drift, rubric, termination, authored-text, prefix-cache]

requires:
  - phase: 13-one-on-one-conversation-engine
    provides: InteractionTypeConfig, resolveSessionConfig, assembleSystemPrompt/buildTailBlock, termination marker, buildRubricJsonSchema
  - phase: 15-difficult-conversations
    provides: DifficultConversationInstance (15-01), buildAuthoredTextBlock (15-03), SEEDED_CONVERSATIONS + assignSeededAvatar (15-04)
provides:
  - DIFFICULT_CONVERSATION_TYPE registered in ENGINE_TYPES
  - buildConversationSystemPrompt / buildInCharacterReminder / CONVERSATION_EVALUATOR_PROMPT / buildConversationEvaluationContext / buildStudentBriefing
  - resolveDifficultConversationInstance (seeded-first)
  - InteractionPromptsConfig.buildTailFragment hook (Against 13-06)
  - scripts/verify-dc-type.ts + scripts/verify-dc-prompt-safety.ts
affects:
  - 15-07 (catalog UI)
  - 15-08 (briefing/difficulty wizard steps + session shell)
  - 15-09 (report / in-role reaction rendering)
  - 15-10 / 15-11 (live session verification of anti-drift)

tech-stack:
  added: []
  patterns:
    - "Anti-drift = session-constant prohibition + per-turn buildTailFragment reminder (no runtime detection)"
    - "Seeded-first instance resolver; source is provenance only"
    - "Authored text reaches privileged prompts only via buildAuthoredTextBlock"
    - "Objective-achieved scores approach not result; outcome record unscored and schema-separated"

key-files:
  created:
    - lib/difficult-conversation/conversation-prompts.ts
    - lib/difficult-conversation/conversation-type.ts
    - lib/difficult-conversation/resolve-instance.ts
    - scripts/verify-dc-type.ts
    - scripts/verify-dc-prompt-safety.ts
  modified:
    - lib/engine/registry.ts
    - lib/engine/prompts.ts
    - lib/engine/types.ts

key-decisions:
  - "Termination marker reproduced from 13-03: <engine-end reason=\"...\" /> — not reinvented"
  - "avatarEndReasons: walked_out, shut_down, escalated, nothing_left_to_discuss; avatarEndFloor.minAssistantTurns: 4"
  - "buildTailFragment added to InteractionPromptsConfig (Against 13-06) — type-driven, no slug branch"
  - "reactionCauses stored as outcome string (JSON array text) because OutcomeFieldKind has no array member"
  - "assembleSystemPrompt falls through to type.prompts.liveSystemPrompt for non-interview/non-case-study types"

patterns-established:
  - "Per-turn reinstruction must use prompts.buildTailFragment, never assembleSystemPrompt"
  - "resolveDifficultConversationInstance: findSeededConversation before loadDifficultConversationForPlay"

issues-created: []

duration: 4min
completed: 2026-10-04
---

# Phase 15 Plan 06: Difficult-Conversation Type + Prompts Summary

**Difficult-conversation ships as config+prompts: eight-dimension rubric with approach-not-result Objective achieved, session-constant anti-drift prompt plus tail-block reminder, seeded-first resolver, floor-gated avatar end**

## Performance

- **Duration:** 4 min
- **Started:** 2026-10-04T04:28:22Z
- **Completed:** 2026-10-04T04:31:30Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Session-constant in-character system prompt with six numbered absolute prohibitions and concrete WRONG/RIGHT examples
- Behavior-specific per-turn reminder delivered only through `buildTailBlock` via new `buildTailFragment` hook (prefix cache intact)
- Type record: four extras, floor `minAssistantTurns: 4`, no `postProcessScores`, no time envelope
- Seeded-first resolver producing identical member shapes for seeded and authored sources
- Two verify scripts (13 + 6 sections) exit 0

## Contracts for downstream plans (15-08 / 15-09 / 15-10 / 15-11)

### Termination marker (from 13-03 — reproduced, not reinvented)

```
<engine-end reason="REASON" />
```

### `avatarEndReasons` and floor

| Field | Value |
| --- | --- |
| `avatarEndReasons` | `walked_out`, `shut_down`, `escalated`, `nothing_left_to_discuss` |
| `avatarEndFloor` | `{ minAssistantTurns: 4 }` |

Student reason codes (from 15-01): `student_closed_in_character`, `student_left_session`.

### Four extra rubric dimensions

| key | label | Intent |
| --- | --- | --- |
| `clarity` | Clarity | Unambiguous problem / expectation / ask |
| `empathy` | Empathy | Acknowledge their stated position (not agreeing) |
| `holding_the_line` | Holding the line | Hold under pushback without hostility or caving |
| `objective_achieved` | Objective achieved | **Approach, not result** — skilful pursuit vs immovable character can score high |

Full order: `visual`, `vocal`, `content`, `behavioral`, then the four above.

### `setupSteps` declarations

1. `{ id: "conversation-briefing", label: "Briefing", customComponent: "ConversationBriefingStep" }`
2. `{ id: "conversation-difficulty", label: "Difficulty", customComponent: "ConversationDifficultyStep" }`

CameraConsentStep is appended by SetupWizard (not listed here).

### Outcome field set

| key | kind | notes |
| --- | --- | --- |
| `objectiveStatus` | string | `met` \| `partially_met` \| `not_met` \| `avatar_ended` |
| `objectiveNote` | string | one sentence of fact |
| `inRoleReaction` | string | first-person private reaction |
| `reactionCauses` | string | JSON array text of `{ timecodeSeconds, quote, effect }` |
| `endTurnReasons` | string | optional |
| `endTurnTimecodeSeconds` | number | optional |

`postProcessScores`: **absent** (CONTEXT.md rejects outcome-driven score caps).

### Prohibition rules (absolute)

1. No meta-commentary — WRONG: *"That was a good way to open — direct without being harsh."*
2. No advice or coaching — WRONG: *"What you could try is naming the impact first."*
3. No summarizing/assessing performance — WRONG: *"So far you've been clear but you haven't acknowledged my side."*
4. Never acknowledge simulation/AI — WRONG: *"You're right, I'm an AI playing a role — want me to break character?"*
5. No narrator voice / stage directions
6. Distress stays in character (no resources / break frame) — out-of-band UI carries real distress (15-08)

### Reminder wording (template)

```
[IN-CHARACTER REMINDER — not spoken aloud]
Remember: you are {role}. You are {difficulty-stance}. You want {first-sentence-of-hiddenPosition}. You do not coach, advise, summarize, step outside this conversation, or acknowledge anything beyond this room. Stay in it.
```

Stances: receptive → "defensive but reachable"; guarded → "wary and deflecting"; hostile → "ready to counter-attack".

### `buildTailBlock` hook

**Yes — new hook required.** `InteractionPromptsConfig.buildTailFragment?: (config) => string` added in `lib/engine/types.ts`. `buildTailBlock` composes it after the existing fragments when the type declares it. Declared as an Against 13-06 extension (same delivery mechanism; no new channel).

### Gap 1 end licences (in live prompt)

1. Avatar may emit `<engine-end reason="..." />` with a declared reason when genuinely done
2. On student's decisive close: recognize + offer in character; **do not** emit the marker (student confirms via UI)

## Task Commits

1. **Task 1: Live system prompt, reminder, student briefing** - `b446a41` (feat)
2. **Task 2: Evaluator prompt, type record, seeded-first resolver** - `144e074` (feat)
3. **Task 3: Prove type resolves and authored text is contained** - `9789e15` (feat)

**Plan metadata:** (docs commit after this file)

## Files Created/Modified

- `lib/difficult-conversation/conversation-prompts.ts` — live + evaluator prompts, reminder, briefing, evaluation context
- `lib/difficult-conversation/conversation-type.ts` — `DIFFICULT_CONVERSATION_TYPE`
- `lib/difficult-conversation/resolve-instance.ts` — seeded-first resolver + `mapRecordToInstance`
- `lib/engine/registry.ts` — one import + one `ENGINE_TYPES` entry
- `lib/engine/prompts.ts` — `buildTailFragment` composition + liveSystemPrompt fallthrough
- `lib/engine/types.ts` — optional `buildTailFragment` on `InteractionPromptsConfig`
- `scripts/verify-dc-type.ts` — 13 sections
- `scripts/verify-dc-prompt-safety.ts` — 6 sections

## Decisions Made

- Floor value 4 (Claude's Discretion) so clarity + empathy + holding_the_line all have gradeable material before a walk-out
- `reactionCauses` as string in the outcome schema (engine `OutcomeFieldKind` has no array); prompt instructs JSON array shape
- `assembleSystemPrompt` fallthrough to `type.prompts.liveSystemPrompt` so DC (and other future types) share one path without slug branches

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added `buildTailFragment` on `InteractionPromptsConfig`**
- **Found during:** Task 1
- **Issue:** 13-06's `buildTailBlock` had no type-declared hook; plan forbids slug branching
- **Fix:** Optional `buildTailFragment` on prompts config; compose in `buildTailBlock`
- **Files modified:** `lib/engine/types.ts`, `lib/engine/prompts.ts`
- **Verification:** verify-dc-type §6 — reminder in tail, absent from system prompt
- **Committed in:** `b446a41` (Task 1)

**2. [Rule 2 - Missing Critical] `assembleSystemPrompt` fallthrough to type builder**
- **Found during:** Task 1
- **Issue:** Fallthrough threw for non-interview/non-case-study types; verify §6 requires `assembleSystemPrompt` for DC
- **Fix:** Delegate to `getEngineType(...).prompts.liveSystemPrompt` after the case-study branch
- **Files modified:** `lib/engine/prompts.ts`
- **Verification:** assembleSystemPrompt byte-identical and matches `buildConversationSystemPrompt`
- **Committed in:** `b446a41` (Task 1)

### Deferred Enhancements

None.

---

**Total deviations:** 2 auto-fixed (both Missing Critical for Against-13-06 / REQ-73 contracts), 0 deferred
**Impact on plan:** Required to ship type-driven reminder and prefix-cache verification without slug branches. No scope creep.

## Issues Encountered

None — both verify scripts exit 0; `verify-engine-config.ts` and `verify-dc-engine-extensions.ts` still pass.

## Next Phase Readiness

- 15-08 can build `ConversationBriefingStep` / `ConversationDifficultyStep` against `setupSteps` and `buildStudentBriefing`
- 15-09 can render eight score cards + unscored outcome + in-role reaction
- 15-10 / 15-11 verify anti-drift in real sessions (prompt-level only — no runtime detector)

## Self-Check: PASSED

- FOUND: `lib/difficult-conversation/conversation-prompts.ts`
- FOUND: `lib/difficult-conversation/conversation-type.ts`
- FOUND: `lib/difficult-conversation/resolve-instance.ts`
- FOUND: `scripts/verify-dc-type.ts`
- FOUND: `scripts/verify-dc-prompt-safety.ts`
- FOUND commits: `b446a41`, `144e074`, `9789e15`

---
*Phase: 15-difficult-conversations*
*Completed: 2026-10-04*
