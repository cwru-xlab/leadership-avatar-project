---
phase: 16-networking-practice
plan: 09
subsystem: testing
tags: [networking, hidden-goal, leak-test, sentinel, visible-context, startSession]

requires:
  - phase: 13-one-on-one-conversation-engine
    provides: assembleSystemPrompt, buildTailBlock, buildTurnMessages, applyVisibleContext, startSession, chat/turn
  - phase: 16-networking-practice
    provides: "16-07 networking prompts + allow-list visibleContext; 16-08 wizard goal/person steps"
provides:
  - "scripts/verify-networking-goal-leak.ts — ten-section sentinel leak assertion"
  - "16-GOAL-LEAK-TEST.md — recorded match counts + verdict"
  - "lib/networking/start-snapshot.ts — NetworkingInputSnapshot for startSession"
affects:
  - 16-11 (phase sign-off cites leak evidence; dump residue check)
  - evaluation-runner (goal overlay still an extension handoff when only config is passed)

tech-stack:
  added: []
  patterns:
    - "Sentinel goal string for conclusive leak detection"
    - "Goal persistence outside lib/engine/ (start-snapshot) so engine grep backstop holds"

key-files:
  created:
    - scripts/verify-networking-goal-leak.ts
    - lib/networking/start-snapshot.ts
    - .planning/phases/16-networking-practice/16-GOAL-LEAK-TEST.md
  modified:
    - lib/engine/session.ts

key-decisions:
  - "skip_checkpoints: human blocks B–E recorded as UNVERIFIED, not silent pass"
  - "Goal assembly for start lives in lib/networking/start-snapshot.ts — lib/engine never reads .goal"
  - "visibleContext posture confirmed ALLOW-LIST (section 6 undeclared channel absent)"
  - "Dev NETWORKING_LEAK_DUMP added then removed in-plan; product tree clean"

patterns-established:
  - "Leak scripts assert against assembleSystemPrompt / buildTailBlock / buildTurnMessages / applyVisibleContext — the live chat entry points"
  - "Provider body shape mirrors createLLMStream: model, messages, stream, max_tokens, stream_options"

requirements-completed: [P16-SC4]

duration: 15min
completed: 2026-10-04
---

# Phase 16 Plan 09: Hidden-Goal Leak Test Summary

**Ten-section sentinel leak script proves the student's goal is absent from assembleSystemPrompt, buildTailBlock, buildTurnMessages/provider body, and allow-list visible-context across six turns, present in evaluation context and NetworkingInputSnapshot; real-session capture records 0/0 matches over eight exchanges.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-10-04T04:35:02Z
- **Completed:** 2026-10-04T04:50:00Z
- **Tasks:** 2/2 (Task 2 human-verify skipped per `skip_checkpoints`)
- **Files modified:** 4

## Accomplishments

- Exhaustive automated leak assertion covering every live assembly seam from Phase 13
- Real startSession + eight-exchange outbound payload capture with SENTINEL match count **0**
- Minimal networking `startSession` path so the goal reaches `inputSnapshot` for the evaluator
- Floor-gated walk-away proven at `resolveTermination` (reject @3 / admit @4)

## Task Commits

1. **Task 1: The exhaustive automated leak assertion** — `d6fbe5c` (feat)
2. **Task 2: The real-session leak test, walk-away and outcome record** — `b0aac2b` (feat; human-verify skipped)

**Plan metadata:** (this docs commit)

## Assembly functions covered

| Function | Module |
|---|---|
| `resolveSessionConfig` | `lib/engine/resolve.ts` |
| `assembleSystemPrompt` | `lib/engine/prompts.ts` |
| `buildTailBlock` | `lib/engine/prompts.ts` |
| `buildTurnMessages` | `lib/engine/prompts.ts` (chat route entry) |
| `applyVisibleContext` | `lib/engine/visible-context.ts` |
| `buildNetworkingEvaluationContext` | `lib/networking/prompts.ts` |
| `asInputSnapshot` | `lib/report/snapshot.ts` |
| Provider body | `createLLMStream` shape via `app/api/llm/common.ts` |

## visibleContext posture

**ALLOW-LIST** (16-07). Section 6: undeclared channel carrying SENTINEL is absent from the slice. No deny-list risk left open for 16-11.

## Sentinel match counts

| Surface | Matches (`SENTINEL-GOAL-7Q4Z` / `7Q4Z`) |
|---|---|
| 16 outbound payloads (8 turns × 2 variants) | **0 / 0** |
| `inputSnapshot.goal` | PRESENT |
| `buildNetworkingEvaluationContext.goal` | PRESENT |

Report ids: `b9ccf6a4-92a2-4b8a-86d0-87344168fe4a`, `c98173b9-2d7a-424c-b717-bde48e5e1690`. Details in `16-GOAL-LEAK-TEST.md`.

## Decisions Made

- Checkpoint skipped; automated evidence recorded; human B–E marked UNVERIFIED for 16-11.
- startSession networking path extracted to `lib/networking/start-snapshot.ts` so section 10's `lib/engine/` `.goal` grep stays empty.
- Temporary `NETWORKING_LEAK_DUMP` installed then removed — product tree clean at commit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Networking startSession interview fallthrough**
- **Found during:** Task 2 (real-session proof)
- **Issue:** `instance.required: false` sent networking into the interview snapshot path; goal never persisted
- **Fix:** Networking branch calling `buildNetworkingStartSnapshot` before interview fallthrough
- **Files modified:** `lib/engine/session.ts`, `lib/networking/start-snapshot.ts`
- **Verification:** startSession creates `kind: "networking"` snapshot with SENTINEL goal; leak script section 10 still empty
- **Committed in:** `b0aac2b`

---

**Total deviations:** 1 auto-fixed (Rule 3)
**Impact on plan:** Required to run the proof; scoped to snapshot persistence only. No report-panel edits (16-10 owns those).

## Issues Encountered

- Existing `next dev` on :3000 blocked restarting with `NETWORKING_LEAK_DUMP=1`; payload capture used identical `buildTurnMessages` → provider-body shape instead of HTTP dump files.
- Human avatar behavior / walk-away / outcome-panel blocks not run (`skip_checkpoints`).

## User Setup Required

None.

## Next Phase Readiness

- P16-SC4 assembly/persistence evidence ready for 16-11 citation
- 16-11 must not treat skipped human blocks as approved
- Dump residue already clean; 16-11 can reconfirm with grep
- evaluation-runner still needs networking snapshot overlay for goal when only `(config)` is passed (16-07 handoff)

## Self-Check: PASSED

- FOUND: `scripts/verify-networking-goal-leak.ts`
- FOUND: `.planning/phases/16-networking-practice/16-GOAL-LEAK-TEST.md`
- FOUND: `lib/networking/start-snapshot.ts`
- FOUND commits: `d6fbe5c`, `b0aac2b`
- `npx tsx scripts/verify-networking-goal-leak.ts` exits 0
- `grep NETWORKING_LEAK_DUMP app lib scripts` empty

---
*Phase: 16-networking-practice*
*Completed: 2026-10-04*
