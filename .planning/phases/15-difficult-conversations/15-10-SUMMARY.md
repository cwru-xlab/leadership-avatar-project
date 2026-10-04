---
phase: 15-difficult-conversations
plan: 10
subsystem: testing
tags: [difficult-conversation, drift-probe, approach-vs-result, anti-drift, evaluator, harness]

requires:
  - phase: 15-difficult-conversations
    provides: Live anti-drift prompts + evaluator approach-not-result copy (15-06); session surface (15-08); report/outcome panels (15-09)
  - phase: 13-one-on-one-conversation-engine
    provides: /api/interaction/chat turn path; runEvaluation + validateOutcome
provides:
  - scripts/dc-drift-probe.ts (11 probes × 3 bands + resistance A/B through real chat route)
  - scripts/dc-approach-vs-result.ts (4+1 cases through real evaluator; exit 0)
  - 15-DRIFT.md + 15-DRIFT-RAW.md (verbatim replies + verdicts + matrix)
  - Tuned conversation-prompts.ts (live anti-drift + evaluator outcome types)
affects:
  - 15-11 (cites this SUMMARY as primary evidence for P15-SC1 / P15-SC4)
  - /gsd/verify-work 15 (deferred human sign-off on one ambiguous probe)

tech-stack:
  added: []
  patterns:
    - "Drift judged from verbatim replies — harness exits 0; no drift metric"
    - "Approach/result proven by scripted transcripts through runEvaluation + validateOutcome"
    - "Prompt-only fixes for both live drift and evaluator outcome typing — never runtime detection"

key-files:
  created:
    - scripts/dc-drift-probe.ts
    - scripts/dc-approach-vs-result.ts
    - .planning/phases/15-difficult-conversations/15-DRIFT.md
    - .planning/phases/15-difficult-conversations/15-DRIFT-RAW.md
  modified:
    - lib/difficult-conversation/conversation-prompts.ts

key-decisions:
  - "skip_checkpoints:true — automated in-character classification; one DEFERRED probe for /gsd/verify-work 15"
  - "Evaluator unused end-turn fields must be '' / 0 — null fails validateOutcome and discards the whole outcome"
  - "Deny-the-frame (I'm not an AI / No this isn't a simulation / I'm not grading you) is a FAIL — same as acknowledging"

patterns-established:
  - "Adversarial DC probes go through POST app/api/interaction/chat — never a hand-assembled prompt"
  - "Approach/result matrix is a pass/fail harness; drift is a print-and-judge harness"

issues-created: []

duration: 8min
completed: 2026-10-04
---

# Phase 15 Plan 10: Drift Probe + Approach-vs-Result Summary

**Adversarial 11-probe × 3-band drift harness through the real chat turn, plus four-case approach/result evaluator matrix (Case1 5/not_met, Case2 1/met) — both recorded in 15-DRIFT.md after prompt tuning**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-10-04T04:37:03Z
- **Completed:** 2026-10-04T04:44:47Z
- **Tasks:** 2 auto + 1 checkpoint skipped (deferred)
- **Files modified:** 5

## Accomplishments

- `scripts/dc-drift-probe.ts` drives confront-low-performer through real `/api/interaction/chat` at receptive/guarded/hostile with 11 adversarial probes + resistance A/B; writes `15-DRIFT-RAW.md`; exits 0 always
- `scripts/dc-approach-vs-result.ts` evaluates four ask-for-raise transcripts (+ avatar walk-out) via `runEvaluation` + `validateOutcome`; exits 0 with matrix Case1 **5/not_met**, Case2 **1/met**
- Prompt tuning only in `conversation-prompts.ts` (live anti-drift + evaluator outcome field types)
- `15-DRIFT.md` records per-probe verdicts, resistance, matrix, tuning log, gaps

## Task Commits

1. **Task 1: Adversarial drift probe harness** — `0c86a04` (feat)
2. **Task 2: Approach-versus-result harness** — `2bcf62a` (feat)
3. **Prompt tune (evaluator outcome types)** — `cadcaf7` (fix)
4. **Prompt tune (live anti-drift)** — `86b567f` (fix)
5. **Plan metadata** — (docs commit with this SUMMARY)

## Files Created/Modified

- `scripts/dc-drift-probe.ts` — real chat-route probe harness
- `scripts/dc-approach-vs-result.ts` — real evaluator approach/result harness
- `lib/difficult-conversation/conversation-prompts.ts` — live + evaluator prompt hardening
- `.planning/phases/15-difficult-conversations/15-DRIFT-RAW.md` — verbatim final-run transcripts
- `.planning/phases/15-difficult-conversations/15-DRIFT.md` — verdicts + matrix + tuning log

## Decisions Made

- Checkpoint human-verify skipped under `skip_checkpoints:true`; automated classification against plan rules; hostile probe 5 deferred to `/gsd/verify-work 15`
- No runtime detection added (grep clean for detectCoachVoice / isOutOfCharacter / regenerateTurn / driftScore)

## Final matrix (approach vs result)

| Case | objective_achieved | objectiveStatus |
| --- | --- | --- |
| 1 skilful / NOT met | 5 | not_met |
| 2 clumsy / MET | 1 | met |
| 3 skilful / MET | 5 | met |
| 4 poor / NOT met | 1 | not_met |

## Criteria status

- **P15-SC1:** provisionally **MET** (32/33 PASS automated; 1 DEFERRED human sign-off)
- **P15-SC4:** **MET** (`dc-approach-vs-result` exit 0)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Evaluator null end-turn fields failed validateOutcome**
- **Found during:** Task 2
- **Issue:** Model returned null for unused `endTurnReasons` / `endTurnTimecodeSeconds`; `typeof null === "object"` → whole outcome discarded → status/reaction missing
- **Fix:** Prompt: use `""` / `0` when not avatar-ended; re-run harness → exit 0
- **Files modified:** `lib/difficult-conversation/conversation-prompts.ts`
- **Committed in:** `cadcaf7`

**2. [Rule 1 - Bug] Drift attempt 1 failed narrator / advice / deny-frame probes**
- **Found during:** Task 3 (automated classification of first run)
- **Issue:** Face self-description; "you should say…"; "No" to simulation; "I'm not grading you"
- **Fix:** Hardened live absolute rules 2/4/5 + tail reminder; re-run → 32/33 PASS
- **Files modified:** `lib/difficult-conversation/conversation-prompts.ts`
- **Committed in:** `86b567f`

### Deferred Enhancements

- Hostile probe 5 (rubric) DEFERRED human sign-off — `/gsd/verify-work 15`
- Interactive Task 3 human-verify skipped (`skip_checkpoints:true`)

---

**Total deviations:** 2 auto-fixed (prompt), 2 deferred
**Impact on plan:** Prompt-only fixes; criteria not loosened

## Issues Encountered

- First approach-vs-result run failed validateOutcome on null end fields (fixed by prompt)
- First drift run failed several probes (fixed by live prompt harden + re-run)

## Next Phase Readiness

- 15-11 can cite this SUMMARY for P15-SC1 / P15-SC4 evidence
- Human confirm hostile probe 5 during verify-work

## Self-Check: PASSED

- FOUND: `scripts/dc-drift-probe.ts`
- FOUND: `scripts/dc-approach-vs-result.ts`
- FOUND: `.planning/phases/15-difficult-conversations/15-DRIFT.md` (contains PASS)
- FOUND: `.planning/phases/15-difficult-conversations/15-DRIFT-RAW.md`
- FOUND: commits `0c86a04`, `2bcf62a`, `cadcaf7`, `86b567f`
- VERIFIED: `npx tsx scripts/dc-approach-vs-result.ts` exit 0
- VERIFIED: `npx tsx scripts/dc-drift-probe.ts` completed + RAW written
- VERIFIED: no runtime drift detection added

---
*Phase: 15-difficult-conversations*
*Completed: 2026-10-04*
