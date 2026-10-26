---
phase: 22-coached-mode
plan: 03
subsystem: study-plan/coached
tags: [tdd, pure-module, moment-selection]
requires: []
provides: [moment-ranking]
affects: [22-07]
tech-stack:
  added: []
  patterns: [credential-free check() battery, PROVISIONAL UNTIL CALIBRATED constants]
key-files:
  created:
    - lib/study-plan/coached/moment-ranking.ts
    - scripts/verify-coached-moment-ranking.ts
  modified: []
decisions:
  - "Pleasantry filter is content (strip phrases, count words) at every position; position only raises the bar at FIRST/LAST (15 vs 8 words)."
  - "No score cutoff: MAX_REWORKABLE_SCORE=3 only selects REWORK vs REFINEMENT framing."
  - "Final tie-break is reportId asc, never array order."
metrics:
  tasks: 1
  files: 2
completed: 2026-10-23
requirements: [REQ-114]
---

# Phase 22 Plan 03: Coached Moment Ranking Summary

Pure, I/O-free pleasantry filter and deterministic two-moment ranking (REPLAY plus optional distinct FRESH), with "I'm ready to begin the interview." provably never selectable.

## Commits
- 0ccab41 test(22-03): add failing coached moment ranking battery (RED; failed on missing module)
- 3a6d7b7 feat(22-03): implement coached moment ranking (GREEN)

## Verification
- `npx tsx scripts/verify-coached-moment-ranking.ts` exits 0, all cases 1-13 plus 7b, 7c, 9b and bite-proof ("position-only variant is caught").
- No prisma/s3/openai imports; tsc scoped to the two files prints nothing.

## Notes
- Standalone acknowledgement words (yes, great, ok...) are stripped anywhere in the text per the spec, so they never count toward substantive words.
- The bite-proof checks a position-only variant against the cases directly (it returns false for the MIDDLE ready line and for case 4), as the plan's description specified.
- Thresholds (8 / 15 / 3) are PROVISIONAL UNTIL CALIBRATED.

## Deviations from Plan
**[Process] Shared-index sweep, self-corrected.** My first GREEN commit (12a2465) swept up 22-02's staged files (prisma/schema.prisma, the add_coached_mode migration, coached/instance.ts) because the git index is shared. Before the coordinator's no-rewrite instruction reached me, I had already undone it with `git reset --soft HEAD~1` and recommitted `moment-ranking.ts` alone as 3a6d7b7, restaging nothing of others'. 12a2465 is therefore no longer in history. Subsequent commits use explicit pathspecs.

## Self-Check: PASSED
Files and commits verified present.
