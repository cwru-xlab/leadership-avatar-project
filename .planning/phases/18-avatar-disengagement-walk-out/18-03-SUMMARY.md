---
phase: 18-avatar-disengagement-walk-out
plan: 03
status: complete
requirements:
  - REQ-81
  - REQ-82
  - REQ-85
---

# Plan 18-03 Summary — Live Walk-Out Flow

## Delivered

- The chat route computes observable disengagement after an assistant turn and
  emits server metadata containing the derived result, model cue, accepted
  termination, and `walkOutFinal` state.
- The server issues a short-lived signed walk-out proof only after a
  threshold-crossing, floor-compliant turn. The browser can coordinate the
  final response but cannot forge the protected report evidence at finish.
- Private near-threshold and forced-farewell guidance is appended only through
  `buildTailBlock()`, preserving the session-constant system-prompt prefix.
- A qualifying pitch walk-out locks typing, Send, PTT/microphone startup,
  pause, leave, and ordinary End controls before one final avatar statement.
- A crossing response without an accepted marker triggers exactly one signed,
  server-authorized forced farewell request. It creates no fabricated student
  turn and never loops.
- The shell waits for a bounded final-speech window before auto-finishing with
  `terminationSource: "avatar"`; the finish path does not interrupt that
  protected final statement.
- Pitch elevator and pitch deck both opt into auto-finish and send their
  report ID on chat requests. Deck's existing four-assistant-turn policy floor
  remains server enforced.
- `finishSession` verifies the signed proof, rechecks the current type's
  allowed reason, assistant-turn floor, and threshold, then writes the
  engine-owned `outcome.disengagementDecline` envelope without allowing a
  client to forge it. Ordinary declared outcome fields remain valid.

## Automated evidence

```text
npx tsc --noEmit
# passed

npx tsx scripts/verify-disengagement.ts
# ALL PASS

npx tsx scripts/verify-disengagement-termination.ts
# ALL PASS

npx tsx scripts/verify-engine-primitives.ts
# ALL PASS

npx tsx scripts/verify-disengagement-walkout-shell.ts
# ALL PASS
```

The static verifier checks lock wiring, no learner-facing engagement meter or
warning, signed finish metadata, pitch auto-finish wiring, and tail-only
private guidance.

## Operational boundary

No agent connected to any shared database, Lightsail database, Preview,
Production, Vercel configuration, or deployed application while completing
this plan.

## Follow-on

Plan 18-04 owns evaluator preservation and factual report rendering of the
protected decline envelope. Human UAT remains mandatory in Plan 18-05.
