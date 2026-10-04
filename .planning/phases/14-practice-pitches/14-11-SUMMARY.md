---
phase: 14-practice-pitches
plan: 11
subsystem: engine
tags: [typescript, pitch, deck, high-water-mark, visible-context, tail-block, REQ-73, prefix-cache]

# Dependency graph
requires:
  - phase: 13-one-on-one-conversation-engine
    provides: "buildTailBlock / assembleSystemPrompt (13-06); applyVisibleContext cursor (13-03)"
  - phase: 14-practice-pitches
    provides: "14-05 slideHighWaterMark null-means-nothing-revealed + checkpointSession; 14-09 buildSlidesChannel + pitch-deck instance.slideTexts"
provides:
  - "ratchetHighWaterMark — the one client-index reader in the repo"
  - "resolveRevealedSlides via applyVisibleContext (no local filter)"
  - "buildSlidesTailFragment (tail-only, SLIDE_TAIL_TEXT_LIMIT=1200)"
  - "Chat body fields: revealedSlideIndex (ratchet input), reportId (ownership-scoped persist)"
  - "scripts/verify-slide-gating.ts — twelve assertion sections"
affects: [14-13-deck-shell, 14-14-report-panels]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Client revealedSlideIndex is INPUT to ratchetHighWaterMark only — raw value never used downstream"
    - "Admitted slide text reaches the model ONLY via buildTailBlock → buildSlidesTailFragment (REQ-73)"
    - "Pitch-deck narrowing gate in chat route — interview/case-study byte-identical to Phase 13"

key-files:
  created:
    - lib/pitch/slide-reveal.ts
    - scripts/verify-slide-gating.ts
  modified:
    - lib/engine/session.ts
    - lib/engine/prompts.ts
    - app/api/interaction/chat/route.ts
    - scripts/verify-pitch-types.ts

key-decisions:
  - "Chat request fields: revealedSlideIndex (optional) + reportId (optional, for ownership-scoped persist)"
  - "Tail fragment wording: 'The founder has shown you slides N-M of K so far.' + Slide N: labels (1-based) + do-not-reference reminder"
  - "SLIDE_TAIL_TEXT_LIMIT = 1200 with '… [truncated]' note"
  - "14-05 inline ratchet refactored to call ratchetHighWaterMark — one ratchet in the repo"
  - "Assertion 11 checks Math.max(stored ?? -1) signature (session.ts still has unrelated Math.max + slideHighWaterMark)"

patterns-established:
  - "Reveal logic reachable only when instance.kind === 'pitch-deck'"
  - "Persist-on-advance in chat; checkpointSession remains durability backstop"
  - "verify-pitch-types exempts slide-reveal.ts as the intentional live ratchet owner"

requirements-completed: [P14-SC3]

# Metrics
duration: 25min
completed: 2026-10-04
---

# Phase 14 Plan 11: Live Slide High-Water Mark Summary

**Server-authoritative slide reveal wired into the live chat turn: ratchet → persist → applyVisibleContext slice → tail-block delivery; system prompt stays byte-identical across reveals (REQ-73).**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-10-04T15:09:49Z
- **Completed:** 2026-10-04T15:15:17Z
- **Tasks:** 3
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments

- One ratchet (`ratchetHighWaterMark`) shared by checkpointSession and the chat route.
- Admitted slides sliced only via Phase 13's `applyVisibleContext` — no local `.slice` on the channel.
- Slide text reaches the model through the per-turn tail block only; `assembleSystemPrompt` / `buildDeckSystemPrompt` stay session-constant.
- Twelve-section sentinel verification covers monotonicity, bounds, backward-nav, forward-jump, leak, and prefix-cache.

## Contract for 14-13 (deck viewer)

| Item | Value |
| --- | --- |
| Chat body field (reveal claim) | `revealedSlideIndex` (optional; loosely parsed) |
| Chat body field (persist) | `reportId` (optional; ownership-scoped `findFirst({ id, userId })`) |
| Tail fragment header | `The founder has shown you slides N-M of K so far.` (or `slide N` when one) |
| Per-slide label | `Slide N:` (1-based) |
| Reminder line | `You have not seen any later slide. Do not reference or ask about content you have not been shown.` |
| Truncation | `SLIDE_TAIL_TEXT_LIMIT = 1200` + `… [truncated]` |
| 14-05 refactor | `checkpointSession` calls `ratchetHighWaterMark` — no second inline `Math.max` ratchet |

## Task Commits

Each task was committed atomically:

1. **Task 1: The ratchet, the slice and the tail fragment** - `2db34d9` (feat)
2. **Task 2: Append the fragment to the tail block and ratchet in the chat route** - `90d1f7a` (feat)
3. **Task 3: Prove the gating, the leak cases and the prefix-cache stability** - `7278628` (test)

**Plan metadata:** (this commit)

## Files Created/Modified

- `lib/pitch/slide-reveal.ts` — ratchet, resolveRevealedSlides, buildSlidesTailFragment
- `lib/engine/session.ts` — checkpointSession calls the single ratchet
- `lib/engine/prompts.ts` — optional revealedSlides/slideCount on EngineTurnState; append fragment
- `app/api/interaction/chat/route.ts` — pitch-deck-only ratchet + persist before prompt build
- `scripts/verify-slide-gating.ts` — twelve sections, sentinel leak proofs
- `scripts/verify-pitch-types.ts` — exempt slide-reveal.ts from "no gating concept" scan

## Decisions Made

- **reportId on chat body** — plan assumed the route already authenticated; it did not. Added optional `reportId` + ownership-scoped load only inside the pitch-deck gate so Phase 13 paths stay untouched. Without reportId/auth, ratchet still runs in-memory; checkpoint remains the durability backstop.
- **Tail append only** — did not reorder existing progress / time-budget / visible-context / type fragments.
- **Assertion 11** — checked the `Math.max(stored ?? -1)` ratchet signature rather than "both strings in one file", because `session.ts` still contains unrelated `Math.max` and `slideHighWaterMark` identifiers.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Critical] Chat route had no auth / no reportId**
- **Found during:** Task 2
- **Issue:** Plan said "the route already authenticates" and to load InteractionReport by ownership, but `/api/interaction/chat` had neither auth nor a report id.
- **Fix:** Accept optional `reportId`; inside pitch-deck gate only, cookie-auth + `findFirst({ id, userId })`. Malformed/missing → proceed with in-memory mark; persist failure logs and continues the turn.
- **Files modified:** `app/api/interaction/chat/route.ts`
- **Commit:** `90d1f7a`

**2. [Rule 3 - Blocking] verify-pitch-types failed on new slide-reveal.ts**
- **Found during:** Task 3 verify
- **Issue:** Section 7 banned high-water/cursor wording in every `lib/pitch/*` file except slides-channel/deck-prompts.
- **Fix:** Exempt `slide-reveal.ts` as the intentional live ratchet owner (still forbids parallel filters elsewhere).
- **Files modified:** `scripts/verify-pitch-types.ts`
- **Commit:** `7278628`

**3. [Rule 3 - Blocking] applyVisibleContext call shape**
- **Found during:** Task 1
- **Issue:** Plan sketch used `{ cursor: mark }`; real 13-03/14-09 shape is `{ cursors: { [SLIDES_CHANNEL_KEY]: mark } }` with `config.visibleContext` as first arg.
- **Fix:** Used the real primitive signature from 14-09-SUMMARY.
- **Files modified:** `lib/pitch/slide-reveal.ts`
- **Commit:** `2db34d9`

---

**Total deviations:** 3 auto-fixed (1× Rule 2, 2× Rule 3)
**Impact on plan:** Necessary for correctness and green verifies; no scope creep.

## Issues Encountered

None beyond the deviations above. Pre-existing `tsc` noise in unrelated scripts/`.next` types left untouched (out of scope).

## Deferred Items

- Plan overall verify `grep slideHighWaterMark` excluding three files still hits `lib/pitch/deck-prompts.ts` and `lib/pitch/slides-channel.ts` (14-09 eval/docs) — pre-existing, not introduced here.
- Live `/practice/general` and `/practice/case-study/{id}` browser smoke not run in this agent (autonomous unit verifies cover byte-identity of interview tails).

## Self-Check: PASSED

- FOUND: `lib/pitch/slide-reveal.ts`
- FOUND: `scripts/verify-slide-gating.ts`
- FOUND: commit `2db34d9`
- FOUND: commit `90d1f7a`
- FOUND: commit `7278628`
- `npx tsx scripts/verify-slide-gating.ts` → ALL PASS (exit 0)
- `npx tsx scripts/verify-pitch-types.ts` → ALL PASS
- `npx tsx scripts/verify-pitch-engine-extensions.ts` → ALL PASS
- `npx tsx scripts/verify-engine-primitives.ts` → ALL PASS
