---
phase: 17-v1-0-close-out
plan: 04
status: complete
requirements: [REQ-76]
completed: 2026-10-04
---

# 17-04 Summary — Canonical deck-fixture ownership

## Diagnosis

Two scripts wrote the same PPTX path with different content:

| Writer | Path | Slide 1 title |
| --- | --- | --- |
| `generate-deck-fixtures.ts` | `scripts/fixtures/spike-deck.pptx` | `Spike Deck Title` |
| `spike-deck-render.ts` | `scripts/fixtures/spike-deck.pptx` | `Spike Deck Slide 1` |

`verify-deck-intake.ts` correctly expected `Spike Deck Title`, so the last
writer could make the intake verifier fail.

## Changes

- The canonical generator now writes `scripts/fixtures/deck-two-slide.pptx`.
- The intake verifier reads that path and preserves its strict two-slide and
  `Spike Deck Title` assertions.
- The verifier checks every fixture it loads before running and reports the
  canonical regeneration command for a missing file.
- `scripts/fixtures/README.md` now records a one-writer rule, writers/readers
  for every fixture, the collision, and the deferred consolidation decision.
- `scripts/spike-deck-render.ts` and its owned `spike-deck.pptx` artifact were
  not modified.

## Verification

```text
npx tsx scripts/generate-deck-fixtures.ts  PASS
npx tsx scripts/verify-deck-intake.ts      PASS (all eleven sections)
```

The fixture generator initially could not run because local dependencies were
absent. `npm ci --ignore-scripts` installed the locked packages without
executing lifecycle scripts, then the canonical fixture was generated. No
agent connected to any database.

`npx tsc --noEmit` remains blocked by pre-existing stale `.next` route
validators; this repair introduced no reported TypeScript error.
