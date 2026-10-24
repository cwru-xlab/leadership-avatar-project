---
phase: 22-coached-mode
plan: 05
subsystem: study-plan/coached
tags: [tips, coach-speech, demonstration-gate, parroting, tdd]
requires: []
provides:
  - "assertTipSafe optional DEMONSTRATION gate (attempt-counted, once per leg)"
  - "validateCoachSpeech, validateDemonstration, isParrotOf"
affects: [coach runtime in later 22 plans]
key-files:
  modified:
    - lib/study-plan/coached/tips.ts
    - scripts/verify-coach-tips.ts
decisions:
  - "Attempt count is checked before any content rule in validateDemonstration"
  - "One findSharedSpan helper serves the 6/10/6/8-word thresholds; tip-echo semantics unchanged (raw-string includes)"
  - "Coach-speech quote detection treats single quotes as quotes only at word edges, so apostrophes (I'd) are not misread"
metrics:
  completed: 2026-10-23
---

# Phase 22 Plan 05: Gated Demonstration and Coach Speech Gate Summary

Words-to-say is now a gated carve-out in `assertTipSafe` (attempt >= 1, max 1 per leg, rail untouched), with a coach-speech validator and a parroting detector sharing one span-finder.

## Commits
- df2b4e1 test(22-05): failing demonstration/coach-speech/parroting cases (RED)
- 4d78f9d feat(22-05): gated demonstration carve-out and coach speech gate (GREEN)
- 4c78c4a test(22-05): fix near-miss fixture to a 3-word term of art

## Verification
`npx tsx scripts/verify-coach-tips.ts` prints ALL PASS (Sections 1-3 unchanged, new 5-7 pass, Section 4 SKIPs with no DATABASE_URL). Scoped tsc grep prints nothing. No lines removed referencing TECHNIQUE_LIBRARY / TIP_REJECT_REASONS. Bite-proofs (a) and (b) included in Section 5.

## Deviations from Plan

**1. [Rule 1 - Test bug]** My RED fixture used "name it, claim it" (4 words) as a "3-word near-miss"; changed to "call it out". Fixed in 4c78c4a.

**2. [Process, parallel-safety]** Commit 4d78f9d accidentally also contains another agent's already-staged file `.planning/phases/22-coached-mode/22-03-SUMMARY.md` (shared index race, before the pathspec-commit correction). Content is theirs and unmodified; I attempted a soft reset to split it but concurrent commits landed, so history was left as is. The orchestrator should be aware 22-03-SUMMARY.md first appears in 4d78f9d. Also noted: `.planning/phases/22-coached-mode/22-04-SUMMARY.md` is currently staged by another agent, not mine.

## Notes
- Thresholds (400 / 700 chars, 10/8/6 words, 70% / 1.3x) are PROVISIONAL UNTIL CALIBRATED, as flagged in code comments.
- Requirement REQ-115 not marked complete (orchestrator owns state files).

## Self-Check: PASSED
- lib/study-plan/coached/tips.ts and scripts/verify-coach-tips.ts exist and changed; commits df2b4e1, 4d78f9d, 4c78c4a exist.
