---
phase: 18-avatar-disengagement-walk-out
plan: 01
status: complete
requirements: [REQ-78, REQ-80]
completed: 2026-10-05
---

# 18-01 Summary — Pure disengagement primitive

## Changes

- Extended `TerminationPolicyConfig` with nullable, opt-in
  `disengagementThreshold`. `null` or omitted preserves the existing
  marker/permission/reason/floor termination path.
- Added the dependency-free `lib/engine/disengagement.ts` primitive. It
  derives a clamped, one-way disengagement value from observable session facts:
  budget pressure, assistant-turn pressure, repeated student responses, short
  student-response streaks, and known absence of common ground.
- Exported named default weights, a closed cause vocabulary, deterministic
  session-clock rise/cross episodes, signal extraction, and result types for
  later plans to consume.
- Kept `cueAccel` forward-compatible only. No Phase 18-01 verifier fixture
  supplies a nonzero cue value; parsing and applying avatar cues remains owned
  by 18-02.
- Added the fixed-fixture `verify-disengagement.ts` verifier. It proves
  threshold opt-out, each observable pressure source, determinism, monotonic
  ratcheting, cross-episode shape, closed causes, and absence of model,
  network, or database dependency markers.

## Deliberate non-changes

No interaction type opts into a threshold yet. No termination resolver, marker
parser, prompt, route, session shell, report surface, Prisma schema, migration,
or database/deployment environment changed in this plan. The existing
termination gate will be integrated in 18-02.

## Verification

```text
npx tsx scripts/verify-disengagement.ts  PASS (five sections)
npx tsc --noEmit                         PASS
git diff --check                         PASS (Phase 18 source patch)
```

No agent connected to a database, Preview, Production, deployed app, Vercel, or
any remote service while completing this plan.
