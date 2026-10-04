# Phase 16 — Hidden-goal leak test record

**Plan:** 16-09  
**Date:** 2026-10-04  
**Mode:** `skip_checkpoints` — human-verify blocks B–E not run interactively; automated + best-effort session evidence below.

## SENTINEL

```
SENTINEL-GOAL-7Q4Z a referral into their team
```

Any occurrence of `SENTINEL-GOAL-7Q4Z` or `7Q4Z` in an outbound live payload is a conclusive leak.

## Session under test

| Field | Value |
|---|---|
| Report id | `b9ccf6a4-92a2-4b8a-86d0-87344168fe4a` (also `c98173b9-2d7a-424c-b717-bde48e5e1690` from the first capture) |
| Type | `networking` |
| Character | `priya-malhotra` (built-in) |
| Start path | `startSession` → `buildNetworkingStartSnapshot` (`lib/networking/start-snapshot.ts`; local DB) |
| DB | `postgresql://ajabreu79@localhost:5432/leadership_avatar_dev` |
| Capture dir | `.tmp/networking-leak-dumps/` (local only, not committed) |

## Assembly functions covered

Same set as `scripts/verify-networking-goal-leak.ts` / live chat entry:

| Function | Module | Role |
|---|---|---|
| `resolveSessionConfig` | `lib/engine/resolve.ts` | Session resolve |
| `assembleSystemPrompt` | `lib/engine/prompts.ts` | Session-constant system prompt |
| `buildTailBlock` | `lib/engine/prompts.ts` | Per-turn tail |
| `buildTurnMessages` | `lib/engine/prompts.ts` | Chat-route entry → provider messages |
| `applyVisibleContext` | `lib/engine/visible-context.ts` | Allow-list slice |
| `buildNetworkingEvaluationContext` | `lib/networking/prompts.ts` | Evaluator context (must see goal) |
| `asInputSnapshot` | `lib/report/snapshot.ts` | Persisted snapshot round-trip |
| Provider body shape | `createLLMStream` in `app/api/llm/common.ts` | `{ model, messages, stream, max_tokens, stream_options }` |

**visibleContext posture (16-07):** ALLOW-LIST (not deny-list). Undeclared channels default to hidden.

## Outbound payload match counts

Captured **eight exchanges** × two body variants each (16 files):

1. `payload-turn-NN.json` — `buildTurnMessages` with `sessionState` including `goal: SENTINEL` (adversarial; proves allow-list exclusion under full state).
2. `payload-live-turn-NN.json` — `buildTurnMessages` with chat-route-exact turnState (no `sessionState`; mirrors today's `app/api/interaction/chat/route.ts` wiring).

| Payload | `SENTINEL-GOAL-7Q4Z` matches | `7Q4Z` matches |
|---|---:|---:|
| payload-turn-01 … 08 | 0 | 0 |
| payload-live-turn-01 … 08 | 0 | 0 |
| **TOTAL** | **0** | **0** |

Zero is the only passing answer. **PASS** on absence from every captured outbound body.

## Evaluator / snapshot presence

| Check | Result |
|---|---|
| `inputSnapshot.kind` | `networking` |
| `inputSnapshot.goal` | `SENTINEL-GOAL-7Q4Z a referral into their team` |
| `buildNetworkingEvaluationContext(...).goal` | same SENTINEL |
| Goal Progress scoreable | Yes — goal present in evaluation context |

**PASS** on evaluator-side presence.

## Automated verify script

`npx tsx scripts/verify-networking-goal-leak.ts` — **ALL TEN SECTIONS PASSED** (see Task 1).

## Floor-gated walk-away

Engine-level (same `resolveTermination` the live stream uses):

| `assistantTurnCount` | Result |
|---|---|
| 3 | REJECTED — `floor-not-met` (no recorded reason) |
| 4 | ADMITTED — `recordedReason: "disengaged"` |

**Real-session avatar walk-away (human block D):** not run under `skip_checkpoints`. No HeyGen/camera session was completed. 16-11 should treat walk-away as **engine-proven / human-unverified**, not as a silent pass.

## Outcome record (`never-asked`)

- Outcome declaration (`NETWORKING_OUTCOME`) includes `askMade` / `askOutcome` / `commonGround` with closed vocabulary including `never-asked`.
- Full evaluator run + report panel for a never-asked session was **not** executed interactively (depends on 16-10 report surfaces + live finish).
- Structural readiness: snapshot + evaluation context carry the SENTINEL so Goal Progress and ask outcome are scoreable once evaluation runs.

## Human blocks B–E (skipped)

| Block | Status |
|---|---|
| B — real avatar session, behavior judgment | Skipped (`skip_checkpoints`) |
| C — report Goal Progress + never-asked panel | Skipped (no finished live session) |
| D — terrible session walk-away timing | Skipped; floor proven at engine layer only |
| E — good session contrast | Skipped |

## startSession gap (Rule 3)

16-08 left networking falling through the interview `!instance.required` path, which persisted an `InterviewInputSnapshot` and dropped the goal. Minimal fix for this proof:

- `lib/networking/start-snapshot.ts` — builds `NetworkingInputSnapshot` (goal stays outside `lib/engine/`)
- `lib/engine/session.ts` — networking branch before interview fallthrough; delegates snapshot assembly

## Dev dump lifecycle

1. Installed temporary `NEXT_PUBLIC_NETWORKING_LEAK_DUMP=1` write in `app/api/interaction/chat/route.ts` (16-09 Task 2).
2. Could not exercise against the already-running `next dev` on :3000 without killing a shared server; payload capture used the identical `buildTurnMessages` → provider-body shape instead.
3. **Removed** the dump from product code before commit.
4. `grep -rn NETWORKING_LEAK_DUMP app lib scripts` → empty.

**Open item for 16-11:** confirm no dump residue remains at phase sign-off (already clean in this plan).

## Verdict

| Property | Verdict |
|---|---|
| Sentinel absent from every captured outbound live payload | **PASS** (0 / 0) |
| Sentinel present in evaluation context + persisted snapshot | **PASS** |
| Allow-list undeclared-channel posture | **PASS** (ALLOW-LIST) |
| Floor rejects before 4 assistant turns | **PASS** (engine) |
| Human-judged avatar goal-unawareness | **UNVERIFIED** (skipped) |
| Real-session walk-away firing | **UNVERIFIED** (skipped) |
| Outcome panel `never-asked` on a finished report | **UNVERIFIED** (skipped) |

**Hidden-goal property (P16-SC4 assembly / persistence):** **PASS** on automated evidence.  
**Full human real-session criterion:** deferred — not a silent pass; 16-11 must not cite B–E as approved.
