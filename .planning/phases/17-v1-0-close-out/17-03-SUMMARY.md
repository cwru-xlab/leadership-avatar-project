---
phase: 17-v1-0-close-out
plan: 03
status: complete
requirements: [REQ-63, REQ-75]
completed: 2026-10-04
---

# 17-03 Summary — Deck visible-context proof

## Result

`npx tsx scripts/verify-deck-visible-context.ts` exits 0. The proof records a
PASS for the real chat turn-assembly seam:

```text
ratchetHighWaterMark → resolveRevealedSlides → buildTurnMessages
```

The sentinel sweep verifies no deck text before a reveal; the revealed prefix
only for each mark 0–7; monotonic backward navigation; bounds handling for
hostile client values; and system-prompt byte identity with no slide sentinel.

## Correction to the initial false positive

The first version failed because it asserted that `pitch-deck` must configure
`visibleChannels: ["slides"]`. That premise was wrong. The production
`DECK_VISIBLE_CONTEXT` deliberately uses `"*"`, which suppresses the generic
visible-context renderer in `lib/engine/prompts.ts`. The deck adapter instead
creates a one-channel `{ slides }` state and gives `applyVisibleContext` the
server-owned high-water mark as its cursor.

Changing the configuration to a slides allow-list would have enabled a second,
generic deck-rendering route; no product code was changed. The revised verifier
asserts the effective boundary and negative source allow-list instead.

## Strengthened guards

- The verifier passes resolved config into its turn serializer, removing an
  ordering dependency on a captured `const` binding.
- Its source guard searches tracked and untracked `app`, `components`, and
  `lib` source for `revealedSlideIndex|ratchetHighWaterMark`, then fails if a
  reader exists outside the approved browser, practice-shell forwarding, chat
  route, checkpoint route, engine-session, and `slide-reveal` locations.
- It recognizes `checkpointSession` as a second authorized caller of the same
  ratchet primitive and the practice shell as a forwarding-only client reader;
  it does not claim a database-backed checkpoint test.
- Comments in prompt assembly and visible-context admission preserve why the
  permissive `"*"` configuration suppresses generic rendering and why the deck
  uses its dedicated cursor-gated tail path instead.
- It proves the evaluator intentionally receives the full deck and that a
  permissive type's generic `sessionState` is not rendered in its live tail.

## Evidence and boundary

- Evidence: `scripts/verify-deck-visible-context.ts` and
  `13-VISIBLE-CONTEXT-PROOF.md`.
- No database command was run for this plan. No shared, Preview, or Production
  database connection was opened.
- `npx tsc --noEmit` remains blocked by pre-existing stale `.next` route
  validators after Prisma client generation; the modified verifier has no
  reported TypeScript error.
