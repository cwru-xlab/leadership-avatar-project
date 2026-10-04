---
phase: 16-networking-practice
plan: 03
subsystem: engine-config
tags: [networking, InstanceConfig, InputSnapshot, avatarEndFloor, never-publishable, REQ-65]

requires:
  - phase: 13-one-on-one-conversation-engine
    provides: InstanceConfig / InputSnapshot unions, resolveSessionConfig, TerminationPolicyConfig
  - phase: 14-practice-pitches
    provides: avatarEndFloor field + resolveTermination floor enforcement (landed during parallel execution)
provides:
  - "InstanceConfig member kind:networking-persona (owner-scoped, never-publishable by absence)"
  - "InputSnapshot member kind:networking (goal evaluator-only; no raw paste)"
  - "scripts/verify-networking-engine-extensions.ts — nine-section proof including publish absence"
affects:
  - 16-07 (networking TYPE record — may trust avatarEndFloor enforcement)
  - 16-05 (attestation receipt fields on networking-persona)
  - 16-11 (phase_13_extensions_declared handoff)

tech-stack:
  added: []
  patterns:
    - "Never-publishable by structural ABSENCE (no published/visibility field), guarded by source-level verify"
    - "Phase 14/15/16 append-only union members on shared engine files"

key-files:
  created:
    - scripts/verify-networking-engine-extensions.ts
  modified:
    - lib/engine/types.ts
    - lib/report/snapshot.ts

key-decisions:
  - "avatarEndFloor INHERITED from 14-02 (da26f83); enforcement already in resolveTermination — NOT a 16-07 blocker"
  - "networking-persona never-publishable by ABSENCE (16-CONTEXT decision 7), not published:false"
  - "NetworkingInputSnapshot carries goal for evaluator/report only; raw paste never snapshotted"

patterns-established:
  - "Append-only InstanceConfig / InputSnapshot members across parallel Phases 14-16"
  - "Dedicated per-phase verify-*-engine-extensions.ts rather than editing Phase 13 verify scripts"

issues-created: []

duration: 5min
completed: 2026-10-04
---

# Phase 16 Plan 03: Networking Engine Config Extensions Summary

**Owner-scoped `networking-persona` InstanceConfig member (never-publishable by absence) plus `kind:"networking"` InputSnapshot, with singular avatarEndFloor inherited from 14-02 and enforced in resolveTermination**

## Performance

- **Duration:** 5 min
- **Started:** 2026-10-04T04:13:39Z
- **Completed:** 2026-10-04T04:18:08Z
- **Tasks:** 3/3
- **Files modified:** 3

## Accomplishments

- `InstanceConfig` carries an owner-scoped distilled persona of a real person with deliberately no `published` / `visibility` / `sharedWith` field
- `InputSnapshot` gains `NetworkingInputSnapshot` riding the existing JSON column (REQ-65) — goal for evaluator/report, never raw paste
- `avatarEndFloor` is defined exactly once (from 14-02) and enforced in `resolveTermination`; nine-section verify script exits 0

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the networking-persona instance member and reconcile the avatar-end floor** - `646b24a` (feat)
2. **Task 2: Add the networking input-snapshot member** - `29cf091` (feat)
3. **Task 3: Prove the extensions, including the never-publishable absence** - `852e666` (feat)

**Plan metadata:** (pending docs commit)

## Files Created/Modified

- `lib/engine/types.ts` — `networking-persona` InstanceConfig member + avatarEndFloor reconciliation (inherited from 14-02)
- `lib/report/snapshot.ts` — `NetworkingInputSnapshot` + `asInputSnapshot` narrowing
- `scripts/verify-networking-engine-extensions.ts` — nine assertion sections

## Phase 13 / 14 Seam Drift

Compared plan `phase_13_seams_consumed` to real exports:

| Plan expected | Real export | Drift? |
|---|---|---|
| `InteractionTypeConfig`, `InstanceConfig`, `TerminationPolicyConfig`, `VisibleContextConfig`, `OutcomeRecordConfig`, `TimeBudgetConfig`, `ResolvedSessionConfig` | Same names in `lib/engine/types.ts` | None |
| `resolveSessionConfig` | Exists; also `resolveFromTypeConfig` for stub records | Additive only — verify uses `resolveFromTypeConfig` |
| `InputSnapshot`, `asInputSnapshot` | Same in `lib/report/snapshot.ts` | None |
| Conditional `avatarEndFloor` | Present from 14-02 (`da26f83`); enforcement in `resolveTermination` (`assistantTurnCount`, `floor-not-met`) | Field inherited, NOT added by 16-03 |

**Union members already present when this plan ran (append-only):**
- `pitch-elevator` / `pitch-deck` InstanceConfig + `kind:"pitch"` InputSnapshot (14-02)
- `DifficultConversationInstance` + `kind:"difficult-conversation"` InputSnapshot (15-01)

## avatarEndFloor Status (load-bearing for 16-07)

- **Declaration:** Inherited from 14-02 — exactly one `avatarEndFloor?: { minAssistantTurns: number } | null` in `TerminationPolicyConfig`
- **Enforcement:** PRESENT in `resolveTermination` (fail-closed when floor set and `assistantTurnCount` missing/below). Verified by section 7 of `verify-networking-engine-extensions.ts`
- **16-07 blocker?** NO — floor is declared AND enforced. 16-07 may configure `avatarEndFloor` on the networking TYPE record

## phase_13_extensions_declared (carry forward to 16-11 §4)

- Against 13-01: `InstanceConfig` gains `kind:'networking-persona'` (ownerId-scoped distilled persona, DELIBERATELY with no `published` field)
- Against 13-02: `InputSnapshot` gains `kind:'networking'` member
- Against 13-01 (conditional): `avatarEndFloor` was NOT added by 16-03 — inherited from 14-02

## Decisions Made

- Inherited `avatarEndFloor` from 14-02 rather than redefining; removed a stale "Added by Phase 16" doc sentence once 14-02's landing was confirmed
- Never-publishable enforced as structural absence + executable source guard (decision 7)
- Optional `instance.required: false` path proven for built-in characters (P16-SC2 at config layer)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Parallel race: networking-persona briefly landed under 15-01's commit**
- **Found during:** Task 1
- **Issue:** Concurrent Phase 15 executor committed `lib/engine/types.ts` while 16-03's networking-persona edit was unstaged, so the member first appeared in `93d171c feat(15-01): ...` rather than a 16-03 commit
- **Fix:** Kept the member (content correct); Task 1 commit `646b24a` completed reconciliation (removed incorrect "Added by Phase 16" avatarEndFloor claim once 14-02 ownership was clear)
- **Files modified:** `lib/engine/types.ts`
- **Committed in:** `646b24a`

**2. [Rule 3 - Blocking] Pre-spawn assumption outdated — 14-02 and floor enforcement landed mid-wave**
- **Found during:** Task 1 / Task 3
- **Issue:** Spawn note said avatarEndFloor did not exist and enforcement was missing; by execution time 14-02 had landed the field and 15-01 had committed floor enforcement
- **Fix:** Followed plan's runtime check — inherit field, assert enforcement in section 7 (PASS), do not redeclare
- **Files modified:** none beyond reconciliation
- **Committed in:** `646b24a`, `852e666`

### Deferred Enhancements

None.

---

**Total deviations:** 2 auto-fixed (Rule 3), 0 deferred
**Impact on plan:** Correctness preserved under parallel Phases 14/15/16; no scope creep. 16-07 is unblocked for floor use.

## Auth Gates

None.

## Issues Encountered

Parallel shared-file contention on `lib/engine/types.ts` / `lib/report/snapshot.ts` with Phases 14 and 15. Append-only discipline avoided merge damage; attribution of the first networking-persona appearance is on 15-01's commit hash (content authored for 16-03).

## Next Phase Readiness

- 16-07 can declare the `networking` TYPE record with `avatarEndFloor` and optional instance
- 16-05 may attach attestation receipt fields matching the instance shape
- Do NOT touch `lib/engine/registry.ts` until 16-07
- Phase 13 verify scripts remain unedited and green

## Self-Check: PASSED

- FOUND: `lib/engine/types.ts` (`networking-persona`, singular `avatarEndFloor`)
- FOUND: `lib/report/snapshot.ts` (`kind: "networking"`)
- FOUND: `scripts/verify-networking-engine-extensions.ts`
- FOUND: commits `646b24a`, `29cf091`, `852e666`
- VERIFY: `npx tsx scripts/verify-networking-engine-extensions.ts` exits 0 (all 9 sections)
- VERIFY: `verify-engine-config.ts` and `verify-engine-primitives.ts` exit 0 unedited

---
*Phase: 16-networking-practice*
*Completed: 2026-10-04*
