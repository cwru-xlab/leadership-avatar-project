---
phase: 13-one-on-one-conversation-engine
plan: 06
subsystem: engine
tags: [typescript, chat-route, prompt-assembly, prefix-cache, turn-control]

# Dependency graph
requires:
  - phase: 13-one-on-one-conversation-engine
    provides: "lib/engine/{types,registry,resolve}.ts from 13-01 — ResolvedSessionConfig and ENGINE_TYPES"
  - phase: 13-one-on-one-conversation-engine
    provides: "lib/engine/{termination,visible-context,time-budget}.ts from 13-03 — primitives wired into the live turn path"
provides:
  - "lib/engine/prompts.ts: assembleSystemPrompt / buildTailBlock / buildTurnMessages — session-constant prefix, per-turn state in the latest user message (REQ-73)"
  - "lib/engine/turn-control.ts: parseEngineTurn — interview stage markers + policy-gated termination"
  - "app/api/interaction/chat/route.ts: one engine-config-driven chat endpoint with the legacy admin-case path preserved"
  - "scripts/verify-turn-control.ts: sections 6–10 prove byte-equality and session-constant system prompts"
affects: [13-07-session-routes, 13-10-interview-client, 13-11-scenario-client, "14-16 new interaction types"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One chat endpoint resolves TYPE+INSTANCE via resolveSessionConfig (re-run every turn, pure) instead of branching on a boolean interview flag (REQ-59)"
    - "Per-avatar case-study role selection stays at request time via roleContext/systemPrompt opts — not expressible at type-resolution time"
    - "Interview types keep timing inside buildProgressBlock; engine time-budget fragment is reserved for non-interview types that declare a budget, so today's interview tail stays byte-identical"
    - "Termination is surfaced on the SSE end event's metadata.termination field; with avatarMayEnd:false it is always null and the route never ends a session"

key-files:
  created:
    - lib/engine/prompts.ts
    - lib/engine/turn-control.ts
  modified:
    - app/api/interaction/chat/route.ts
    - scripts/verify-turn-control.ts

key-decisions:
  - "assembleSystemPrompt for case-study reproduces the ACTUAL pre-Phase-13 else-branch order (style → language → role → systemPrompt), not the plan's prose order which swapped language and role — the live route was the oracle."
  - "Per-avatar role selection is solved by keeping roleContext/systemPrompt as request-time AssembleSystemPromptOpts rather than folding them into ResolvedSessionConfig or the provisional registry liveSystemPrompt."
  - "buildTailBlock skips the engine time-budget fragment for interview-shaped types even though 13-01 declared timeBudget.totalSeconds on those records — interview timing already lives in buildProgressBlock, and Task 3 requires the interview tail to stay byte-identical to buildProgressBlock alone."
  - "parseEngineTurn strips <engine-end> first, then interview markers; termination is only non-null after resolveTermination accepts it, so all five built-ins always return termination:null."
  - "Legacy admin-case path (no interview flag, no engine descriptor) still uses an inlined assembleLegacyCaseStudyPrompt identical to today's else branch — no engine type required."

requirements-completed: [REQ-73]
# REQ-59 / REQ-62 / REQ-63 remain open as split requirements: this plan wires the
# live chat/turn path and proves prefix-cache safety, but one session-start/
# checkpoint/finish/report-GET/evaluator (REQ-59) and report-recorded avatar
# termination (REQ-62) still need 13-05/13-07+. Visible-context is composed into
# the tail path here but every built-in type stays permissive (REQ-63's first
# restricting consumer is Phase 14).

# Metrics
duration: 25min
completed: 2026-10-04
---

# Phase 13 Plan 06: Chat Route / Prompt Assembly Summary

**One engine-config-driven chat endpoint with session-constant system prompts proven byte-identical to today's interview and legacy case-study builders, and per-turn state confined to the latest user message (REQ-73).**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-10-04T02:08Z
- **Completed:** 2026-10-04T02:33Z (approx)
- **Tasks:** 3 (+ eslint --fix chore)
- **Files modified:** 4 (2 new, 2 modified)

## Accomplishments
- `lib/engine/prompts.ts` wraps `buildInterviewSystemPrompt` / `buildProgressBlock` for interview types and reproduces the legacy case-study else-branch assembly with request-time per-avatar role selection.
- `app/api/interaction/chat/route.ts` resolves `ResolvedSessionConfig` from either the new optional `engine` descriptor or the legacy `interview` payload; clients with neither still take the byte-identical legacy admin-case path.
- `parseEngineTurn` + SSE `end.metadata.termination` wire REQ-62 without ending sessions; visible-context / time-budget composition is in the tail path for future types without changing today's five.
- `scripts/verify-turn-control.ts` sections 6–10 assert byte-equality and session-constant system prompts for every built-in type.

## Final request shape the route accepts

```ts
{
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  language?: string;
  // Legacy / scenario / admin-case (still required for that path):
  systemPrompt?: string;
  roleContext?: { roleName: string; additionalInfo?: string };
  // Backward-compat interview payload (13-10 will migrate clients off this):
  interview?: {
    typeSlug: string;
    resumeText?: string;
    progress?: InterviewProgress;
    startedAt?: number;
    customization?: InterviewCustomizationInput;
  };
  // New engine descriptor (13-10 / 13-11 clients send this):
  engine?: {
    typeSlug: string;
    instance?: InstanceConfig;
    customization?: InterviewCustomizationInput;
    turnState?: unknown; // reserved; progress still rides on interview for now
  };
}
```

Response remains an SSE stream. For engine-typed turns, the final `end` event's `metadata` includes `termination: { reason } | null`. With today's types it is always `null`.

## Byte-equality results

| Assertion | Result |
|---|---|
| 4 interview presets: `assembleSystemPrompt` == `buildInterviewSystemPrompt` | PASS |
| case-study: `assembleSystemPrompt` == frozen pre-Phase-13 else-branch snapshot | PASS |
| interview `buildTailBlock` == `buildProgressBlock`; case-study tail == `""` | PASS |
| `buildTurnMessages`: system prompt identical across different turn states; tail on last user only | PASS |
| `parseEngineTurn` progress == `parseInterviewTurn` + reducer; `termination: null` for all 5 types | PASS |

`npx tsx scripts/verify-turn-control.ts` exits 0 (sections 1–10). `verify-engine-config.ts` and `verify-engine-primitives.ts` still exit 0.

## Legacy request shape accommodation

Needed: yes, but as an explicit preserved fall-through — not a shim on the engine path. A request with no `interview` flag and no `engine.typeSlug` still runs `assembleLegacyCaseStudyPrompt` with the client's own `systemPrompt`/`roleContext`, byte-identical to pre-Phase-13. Scenario clients and the admin/cohort case pipeline therefore need no changes in this plan.

## Task Commits

Each task was committed atomically:

1. **Task 1: Engine prompt assembly** - `df4487d` (feat)
2. **Task 2: Generalize the chat route onto engine config** - `1053810` (feat)
3. **Task 3: Prove the prompt bytes did not move** - `6b38995` (test)
4. **eslint --fix** - `c1f8e6a` (chore)

**Plan metadata:** (this commit)

## Files Created/Modified
- `lib/engine/prompts.ts` - assembleSystemPrompt, buildTailBlock, buildTurnMessages
- `lib/engine/turn-control.ts` - parseEngineTurn (+ re-export isInterviewIntegrityRequest)
- `app/api/interaction/chat/route.ts` - engine-config resolution; legacy path preserved
- `scripts/verify-turn-control.ts` - sections 6–10 byte-equality / session-constant guards

## Decisions Made
See `key-decisions` in frontmatter — summarized: (1) case-study assembly order follows the live route, not the plan's prose; (2) per-avatar role stays request-time opts; (3) interview types skip the engine time-budget fragment so today's progress-block tail stays byte-identical; (4) termination is policy-gated to null for all built-ins; (5) legacy admin-case path is an explicit no-engine fall-through.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Interview types declare a time budget but Task 3 requires an unchanged interview tail**
- **Found during:** Task 1
- **Issue:** 13-01 set `timeBudget.totalSeconds` on interview presets; naively appending `buildTimeBudgetFragment` would break byte-identity vs `buildProgressBlock`.
- **Fix:** `buildTailBlock` only appends the engine time-budget fragment for non-interview types that declare a budget. Interview timing remains inside `buildProgressBlock`.
- **Files modified:** `lib/engine/prompts.ts`
- **Commit:** `df4487d`

**2. [Rule 1 - Bug] Plan prose listed case-study assembly order incorrectly**
- **Found during:** Task 1
- **Issue:** Plan said style → role → systemPrompt → language; the live route is style → language → role → systemPrompt.
- **Fix:** Matched the live route; Task 3 freezes that order as the oracle.
- **Files modified:** `lib/engine/prompts.ts`, `scripts/verify-turn-control.ts`
- **Commit:** `df4487d` / `6b38995`

## Issues Encountered
- Existing `npm run dev` on :3000 was broken (pre-existing tailwind resolve against parent `/projects`). Started a fresh server on :3001 for curl verification; login cookie required (middleware). All three request shapes verified: interview 200 + `termination:null`, legacy 200, bogus type 400 `Unknown interview type`.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 13-10 / 13-11 clients can send the `engine` descriptor; until then the legacy `interview` payload still resolves through `resolveSessionConfig`.
- 13-07 session routes can rely on the same config + termination parsing without redefining prompt assembly.
- `lib/interview/prompts.ts` and `lib/interview/turn-control.ts` remain byte-unchanged (wrap/delegate only).
- Stayed out of 13-05's parallel files (`lib/engine/evaluation*.ts`, rubric, report structured).

---
*Phase: 13-one-on-one-conversation-engine*
*Completed: 2026-10-04*

## Self-Check: PASSED

- FOUND: lib/engine/prompts.ts
- FOUND: lib/engine/turn-control.ts
- FOUND: app/api/interaction/chat/route.ts
- FOUND: scripts/verify-turn-control.ts
- FOUND commit: df4487d (feat(13-06): engine prompt assembly with session-constant prefix)
- FOUND commit: 1053810 (feat(13-06): generalize chat route onto engine config)
- FOUND commit: 6b38995 (test(13-06): prove engine prompt bytes match today's builders)
- FOUND commit: c1f8e6a (chore(13-06): eslint --fix)
- `npx tsc --noEmit` clean
- `npx tsx scripts/verify-turn-control.ts` exits 0 (sections 1–10)
- `npx tsx scripts/verify-engine-config.ts` and `verify-engine-primitives.ts` still exit 0
- `git diff --stat` against lib/interview/prompts.ts, lib/interview/turn-control.ts, lib/scenario/prompts.ts, and app/api/interaction/{start,finish,save,get} is empty
- Curl (auth'd): interview payload 200 + termination:null; legacy payload 200; bogus type 400 Unknown interview type
- Stayed out of 13-05 parallel files (evaluation*.ts / rubric / report structured)
