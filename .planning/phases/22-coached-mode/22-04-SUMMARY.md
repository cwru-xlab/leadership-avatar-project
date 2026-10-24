---
phase: 22-coached-mode
plan: 04
subsystem: study-plan
tags: [next-step, coached, evidence, path]
requires: []
provides:
  - coachedEvidenceFromReports / loadCoachedEvidence (scored-evidence index)
  - selectPathSteps with required coachedEvidence and coachedOmitted
affects: [22-07]
key-files:
  created: [lib/study-plan/coached/evidence.ts]
  modified: [lib/study-plan/next-step.ts, app/api/study-plans/[planId]/path/route.ts, scripts/verify-next-step.ts]
requirements: [REQ-114, REQ-118]
completed: 2026-10-23
---

# Phase 22 Plan 04: Truthful coached step reason Summary

A coached step is now placed only on a competency the plan's own source reports scored AND that has a moment; its reason is written from that evidence, so "no scored evidence" can no longer sit beside "reworks a moment".

## Commits
- 977fde0: evidence.ts, selectPathSteps contract, verifier (Task 1)
- 12f1696: path route wiring (Task 2)

## Decisions
- `coachedReasonFor` never calls the NONE-tier base sentence. NONE tier reads "no mastery figure yet, but the sessions this plan was built from scored it at N%".
- If no competency qualifies, position 1 becomes a KNOWLEDGE_CHECK on the pool head and `coachedOmitted: true` is returned; the route console.warns with plan id only.
- Route guard is interim (scored evidence intersected with momentsByCompetency); 22-07 Task 3 replaces it with the isQualifyingMoment guard.
- No isolation guard amended: the route importing coached/evidence.ts is outside the guarded practice roots.

## Verification
- `scripts/verify-next-step.ts`: ALL PASS. Check count 32 -> 44 `check(` calls (64 "ok" lines incl. loops); none removed. New sections 11 (truthful reason, with bite-proof flagging the old composition) and 12 (evidence aggregation).
- `npx tsc --noEmit` filtered to this plan's files: clean.
- `scripts/verify-path-surface.ts`: non-DB section passes; DB sections could not run (see below).

## Deviations from Plan
None in code. Environment note: verify-path-surface.ts DB sections fail with P2022 "column User.coachAvatarId does not exist" -- the schema (from another wave-1 plan) is ahead of the local database, not caused by this plan. Re-run after the migration is applied.

## Notes for UAT
Reasons are stored, never recomputed, so existing paths keep their old text. UAT must use a newly generated path.

## Self-Check: PASSED
evidence.ts, next-step.ts, route.ts, verify-next-step.ts present; commit 977fde0 and the route commit exist.
