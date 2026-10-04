---
phase: 16-networking-practice
plan: 07
subsystem: engine-config
tags: [networking, registry, rubric, hidden-goal, visible-context, termination, outcome]

requires:
  - phase: 13-one-on-one-conversation-engine
    provides: InteractionTypeConfig, resolveSessionConfig, applyVisibleContext, resolveTermination, validateOutcome, buildRubricJsonSchema, <engine-end> marker
  - phase: 14-practice-pitches
    provides: avatarEndFloor field + resolveTermination enforcement
  - phase: 16-networking-practice
    provides: "16-03 networking-persona InstanceConfig + avatarEndFloor confirmed enforced; 16-06 NETWORKING_CHARACTERS"
provides:
  - "lib/networking/prompts.ts — live/evaluator prompts, NETWORKING_RUBRIC_EXTRAS, NETWORKING_OUTCOME, buildNetworkingEvaluationContext"
  - "ENGINE_TYPES entry slug:networking"
  - "scripts/verify-networking-type.ts — thirteen-section proof"
affects:
  - 16-08 (wizard steps against networking-person / networking-goal / interviewer)
  - 16-09 (live-turn goal leak test against these prompts)
  - 16-10 (report rendering of seven dimensions + outcome)
  - evaluation-runner (needs networking snapshot overlay for goal — extension handoff)

tech-stack:
  added: []
  patterns:
    - "Hidden goal via allow-list visibleChannels (goal absent) + narrow live-prompt signature"
    - "characterId gated at liveSystemPrompt / resolveNetworkingLivePersona, not resolveSessionConfig"
    - "Evaluator prompt avoids interview/STAR/candidate/resume vocabulary (P16-SC4)"

key-files:
  created:
    - lib/networking/prompts.ts
    - scripts/verify-networking-type.ts
  modified:
    - lib/engine/registry.ts

key-decisions:
  - "visibleContext uses ALLOW-LIST (not deny-list) so new channels default to hidden"
  - "avatarEndFloor.minAssistantTurns: 4 — same knob as pitch-elevator (14-02)"
  - "avatarEndReasons: disengaged | not-worth-continuing | out-of-time"
  - "authoredInWizard omitted — saved personas can exist before the wizard"
  - "Early-end evaluation follows Phase 14 convention: score all dimensions; early end is evidence not a crash"
  - "characterId passed via liveSystemPrompt extra until typed ResolveSessionConfigInput lands"

patterns-established:
  - "buildNetworkingSystemPrompt({persona, displayName}) — goal unrepresentable at the type level"
  - "buildNetworkingEvaluationContext(config, snapshot?) — goal only when snapshot supplied"
  - "Clause-array live prompt with documented Deferred Ideas setting seam"

requirements-completed: [P16-SC2, P16-SC4]

duration: 6min
completed: 2026-10-04
---

# Phase 16 Plan 07: Networking Type Registration Summary

**Networking TYPE registered with seven rubric dimensions, a live prompt that structurally cannot receive the student's goal, allow-list visible-context exclusion, floor-gated avatar walk-away, and a declared ask/outcome/common-ground record.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-10-04T04:22:47Z
- **Completed:** 2026-10-04T04:27:38Z
- **Tasks:** 3/3
- **Files modified:** 3

## Accomplishments

- Shipped `lib/networking/prompts.ts` with three rubric extras (Rapport, Self-Introduction, Goal Progress), narrow live prompt, evaluator prompt, outcome declaration, and evaluation-context builder
- Added one `ENGINE_TYPES` record (`slug: "networking"`) — only `registry.ts` changed under `lib/engine/`
- Thirteen-section verify script proves dimensions, schema, both instance paths, goal exclusion, floor, budget, setup steps, and no pre-existing-type drift

## Task Commits

Each task was committed atomically:

1. **Task 1: Write the networking prompts module** — `f7bf2b6` (feat)
2. **Task 2: Add the one networking record to the registry** — `0f69844` (feat)
3. **Task 3: Prove the type resolves and the goal is excluded** — `ba68866` (feat)

**Plan metadata:** (this docs commit)

## Files Created/Modified

- `lib/networking/prompts.ts` — live/evaluator prompts, extras, outcome, evaluation context, live-persona resolver
- `lib/engine/registry.ts` — `NETWORKING` record + imports (only engine file touched)
- `scripts/verify-networking-type.ts` — thirteen assertion sections

## Phase 13 / 14 Seam Drift

| Plan expected | Real export | Drift? |
|---|---|---|
| `InteractionTypeConfig`, `RubricDimension`, `VisibleContextConfig`, `OutcomeRecordConfig`, `TerminationPolicyConfig`, `TimeBudgetConfig`, `SetupStepDeclaration` | Same in `lib/engine/types.ts` | None |
| `buildEvaluationContext(resolved, snapshot)` | Engine contract is `(config: ResolvedSessionConfig) => Record` | **Yes** — exported helper takes optional `snapshot`; registry wraps `(config) => buildNetworkingEvaluationContext(config)` |
| `resolveSessionConfig` with `characterId` customization → ok:false when neither | `ResolveSessionConfigInput` has no `characterId`; `instance.required: false` → ok:true with neither | **Yes** — gate enforced at `resolveNetworkingLivePersona` / `liveSystemPrompt` throw |
| `validateOutcome` rejects enum / missing required / `commonGround: null` | `OutcomeFieldKind` has no enum; `required` is declarative hint only; string kind rejects `null` | **Yes** — closed vocabulary in `NETWORKING_ASK_OUTCOMES` + evaluator prompt; null = omit field |
| `<engine-end reason="..." />` marker | Confirmed in `lib/engine/termination.ts` | None |
| `avatarEndFloor` enforced | Confirmed by 16-03-SUMMARY — not a blocker | None |
| Live prompt cache (REQ-73) | Session-constant inputs only (`persona`, `displayName`) | None |

### Extension handoffs (do not silently edit primitives)

1. **Typed `characterId` / `goal` on resolve input** — so `resolveSessionConfig` can fail closed without a character or persona, and 16-09 can retrieve the goal from resolved session state.
2. **`evaluation-runner` networking snapshot overlay** — so `goal` reaches the evaluator when only `(config)` is called from the type record (mirror of interview `resumeText` overlay).
3. **`validateOutcome` enum / null / required enforcement** — if runtime must reject invented `askOutcome` literals and accept `commonGround: null`.

## visibleContext form

**ALLOW-LIST** of non-goal channels: `displayName`, `characterId`, `personaId`, `personaSource`, `persona`, `interviewerAvatarId`, `interviewerVoice`, `budgetSeconds`.

**Why:** a new channel added later is hidden by default rather than leaked by default. `goal` is deliberately absent.

## Floor and walk-away

- **`avatarEndFloor: { minAssistantTurns: 4 }`** — roughly two real exchanges; enough for Self-Introduction and Rapport to be gradeable (16-CONTEXT.md).
- **`avatarEndReasons`:** `disengaged`, `not-worth-continuing`, `out-of-time` (closed).
- Marker: trailing `<engine-end reason="..." />` per 13-03.

## Early-end evaluation convention

Followed Phase 14 (`14-14`): grade all seven dimensions on what happened; treat early end as evidence, not a missing session or a reason to zero scores. Stated in `NETWORKING_EVALUATOR_PROMPT`.

## Exact prompt text (16-09 / 16-10 verify against these)

### Live system prompt (`buildNetworkingSystemPrompt`)

```
You are playing the role of: ${persona}

Your name is ${displayName}. You are meeting this person for the first time in a professional context. You do not know them and have no prior relationship.

Behave like a real person being approached by a stranger: you are willing to talk, but you have your own time, your own interests and your own reasons to engage or disengage. You are not screening them for a role and you must not work through a list of questions.

Speak in short conversational turns. Inquire about them when you are genuinely curious, and say so when you are not. Volunteer something about yourself when the conversation earns it.

Do not coach, do not evaluate, do not narrate, and never break character to comment on the conversation.

If the conversation becomes genuinely unrewarding — the other person is not engaging you, is only talking about themselves, or is making you uncomfortable — you may end the conversation politely, the way a real person would. End your reply with a trailing marker exactly like: <engine-end reason="disengaged" /> using one of these reasons only: disengaged, not-worth-continuing, out-of-time. Do not invent other reasons. Do not explain that you are ending a practice session.
```

(Assembled from an ordered clause array. Deferred `setting` clause seam documented between persona and manner clauses per 16-CONTEXT.md Deferred Ideas. No goal/objective/ask clause.)

### Evaluator prompt (`NETWORKING_EVALUATOR_PROMPT`)

```
You are grading a NETWORKING conversation — a first meeting with a stranger in a professional setting. You are NOT grading how well someone answered questions on a hiring screen. Answer quality in that sense is explicitly not what is being judged.

Score EVERY dimension on the 1-5 scale. The shared four (Visual, Vocal, Content, Behavioral) use the usual delivery and substance criteria. The three networking-specific dimensions:

1. Rapport (rapport): Did a real two-way connection form. 1: a one-sided transaction — the other person stayed a stranger. 5: genuine mutual interest — the other person volunteered things they were not asked.
2. Self-Introduction (self-introduction): Was who the student is, and what they do, clear and concise. 1: rambling or so vague the listener could not place them. 5: placed themselves in a sentence or two and gave the listener something to hook onto.
3. Goal Progress (goal-progress): How far the student got toward what they actually wanted. 1: never steered the conversation there at all. 5: made the ask clearly, at a moment the conversation had earned.

The student had a GOAL that the other person in the conversation never saw. That goal text is supplied in the evaluation context under "goal". Grade Goal Progress on the student's steering toward it — a well-made ask that was declined can still score high; never having steered there scores low.

OUTCOME RECORD (factual, not a score — fill honestly after scoring):
- askMade (boolean): whether the student made a clear ask related to their goal.
- askOutcome: exactly one of "agreed" | "deflected" | "declined" | "never-asked". "never-asked" is a legitimate and common outcome and must be reported honestly rather than softened.
- commonGround (string or null): the most concrete shared interest, background, or hook that surfaced, or null if none.

If the session ended early on the other person's initiative, grade all seven dimensions anyway on what DID happen. Treat the early end as evidence about the conversation — not as a missing session, not as an error, and not as a reason to zero any dimension. (Phase 14 early-end report convention: every dimension still scored; the early end is a named outcome, never a crash.)
```

## Decisions Made

- Used allow-list visible context; omitted `authoredInWizard` (saved-persona relaunch); rephrased live/evaluator copy to avoid `interview|STAR|candidate|resume` while still stating P16-SC4 intent ("hiring screen")
- characterId flows through `liveSystemPrompt`'s `extra` bag until a typed resolve path exists
- checkpointing/finishPendingFlip/supportsRetry match interview presets (`client-driven` / `request-path` / `true`) — required fields not listed in the plan but mandatory on `InteractionTypeConfig`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] characterId / neither-path gate lives outside resolveSessionConfig**
- **Found during:** Task 2–3
- **Issue:** Plan assumed `resolveSessionConfig` accepts `characterId` and returns `ok: false` with neither character nor instance. `ResolveSessionConfigInput` has no such field; 16-03 proved `instance.required: false` → `ok: true` with no instance.
- **Fix:** `resolveNetworkingLivePersona` + `liveSystemPrompt` throw when neither resolves; verify section 5 asserts that gate. Documented extension handoff for typed resolve input.
- **Files modified:** `lib/networking/prompts.ts`, `lib/engine/registry.ts`, `scripts/verify-networking-type.ts`
- **Committed in:** `0f69844`, `ba68866`

**2. [Rule 3 - Blocking] Outcome enum/null/required not enforced by validateOutcome**
- **Found during:** Task 3
- **Issue:** Plan expected `validateOutcome` to reject invented `askOutcome` and missing `askMade`, and accept `commonGround: null`. Engine primitives do not support enums or null strings; `required` is a declarative hint only.
- **Fix:** Declared closed vocabulary in `NETWORKING_ASK_OUTCOMES` + evaluator prompt; verify asserts kind mismatch + declarative `required:true`; never-asked shape omits `commonGround`. Recorded as extension handoff — did not edit `outcome.ts` (non_negotiable).
- **Files modified:** `lib/networking/prompts.ts`, `scripts/verify-networking-type.ts`
- **Committed in:** `f7bf2b6`, `ba68866`

**3. [Rule 3 - Blocking] buildEvaluationContext arity**
- **Found during:** Task 1
- **Issue:** Plan specified `(resolved, snapshot)`; engine type is `(config) => Record`.
- **Fix:** Helper accepts optional snapshot; registry delegates one-arg form. Goal reaches eval context when snapshot is passed (verify section 6); runner overlay is an extension handoff.
- **Files modified:** `lib/networking/prompts.ts`, `lib/engine/registry.ts`
- **Committed in:** `f7bf2b6`, `0f69844`

---

**Total deviations:** 3 auto-fixed (all Rule 3 seam adaptations)
**Impact on plan:** Correctness centerpiece (goal exclusion) holds at declaration + signature level. Runtime resolve/outcome enum gaps are documented handoffs, not silent primitive edits.

## Issues Encountered

None blocking. Concurrent 16-04/16-05 files left untouched.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 16-08 can implement `NetworkingPersonStep` / `NetworkingGoalStep` against declared step ids
- 16-09 can leak-test against the recorded prompt texts and allow-list
- Evaluation-runner overlay for networking `goal` still needed before live eval sees the goal from `(config)` alone

## Self-Check: PASSED

- FOUND: `lib/networking/prompts.ts`
- FOUND: `lib/engine/registry.ts` (contains `"networking"`)
- FOUND: `scripts/verify-networking-type.ts`
- FOUND commits: `f7bf2b6`, `0f69844`, `ba68866`
- `npx tsx scripts/verify-networking-type.ts` → ALL PASS (13 sections)
- Prior verifies exit 0: engine-config, engine-primitives, networking-engine-extensions, networking-characters

---
*Phase: 16-networking-practice*
*Completed: 2026-10-04*
