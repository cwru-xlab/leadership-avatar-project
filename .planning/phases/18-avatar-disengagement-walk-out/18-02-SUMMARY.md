---
phase: 18-avatar-disengagement-walk-out
plan: 02
status: complete
requirements: [REQ-79, REQ-83, REQ-84]
completed: 2026-10-05
---

# 18-02 Summary — Cue parsing and termination gates

## Changes

- Added trailing `<engine-cue disengagement="rising|high" />` parsing to the
  pure disengagement module. A valid cue is stripped before a trailing
  `<engine-end>` marker is parsed, so neither marker reaches the learner-facing
  turn text.
- Defined fixed cue accelerators. The `high` cue adds at most 0.20 to the
  computed value and cannot reach the elevator's 0.72 threshold from a cold
  start.
- Extended `parseEngineTurn` with a separately returned cue and an optional,
  trusted `disengagementValue`. The cue never directly accepts a termination.
- Extended `resolveTermination` after its existing permission, closed-reason,
  and floor gates. Threshold-enabled policies now fail closed for a missing,
  non-finite, or below-threshold derived value, with
  `disengagement-below-threshold`; null/omitted thresholds retain the prior
  termination behavior.
- Opted in only the two pitch types. Elevator retains its existing reason set
  and two-assistant-turn floor at threshold `0.72`. Deck now has the same
  closed reason vocabulary, an explicit four-assistant-turn floor, and
  threshold `0.75`.
- Licensed the elevator avatar to emit a cue in the live prompt while retaining
  dialogue-only disengagement behavior and no learner-facing meter or warning.
- Corrected the historical engine primitive verifier heading: it now proves
  each built-in type rejects an undeclared reason rather than claiming every
  type has `avatarMayEnd: false`.
- Added `verify-disengagement-termination.ts` for cue stripping, cold-cue
  rejection, signal/cue acceleration, threshold gate, null-threshold
  preservation, and pitch floor/opt-in assertions.

## Deliberate non-changes

No session chat route supplies the trusted derived value yet; that
server-authoritative calculation, SSE metadata, client walk-out lock, and
persistence work belong to 18-03. No Prisma schema, migration, database,
deployment environment, report UI, or learner-facing engagement indicator
changed.

## Verification

```text
npx tsx scripts/verify-disengagement-termination.ts  PASS (four sections)
npx tsx scripts/verify-disengagement.ts              PASS (five sections)
npx tsx scripts/verify-engine-primitives.ts          PASS (seven sections)
git diff --check                                     PASS
npx tsc --noEmit                                     BLOCKED by unrelated CWRU SSO work
```

The repository-wide TypeScript check reports only the existing uncommitted
CWRU SSO changes: stale generated Prisma `AuthHandoff` types for
`browserNonceHash` and one outdated verifier call signature. It reports no
Phase 18 diagnostic. No agent connected to a database, Preview, Production,
deployed app, Vercel, or any remote service.
