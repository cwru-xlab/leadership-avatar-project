---
phase: 15-difficult-conversations
plan: 01
subsystem: engine
tags: [instance-config, input-snapshot, termination, avatarEndFloor, difficult-conversation, privacy-boundary]

requires:
  - phase: 13-one-on-one-conversation-engine
    provides: InstanceConfig union, InputSnapshot/asInputSnapshot, resolveTermination, TerminationPolicyConfig
  - phase: 14-practice-pitches
    provides: avatarEndFloor on TerminationPolicyConfig (14-02); PitchInputSnapshot member
provides:
  - DifficultConversationInstance (kind: difficult-conversation) on InstanceConfig
  - DifficultConversationInputSnapshot (kind: difficult-conversation) on InputSnapshot — omits hiddenPosition
  - Durable avatarEndFloor enforcement in resolveTermination (14-02 shape; no second floor)
  - Gap 1 decision: termination marker is NOT extended with source
  - Student reason codes student_closed_in_character and student_left_session
  - scripts/verify-dc-engine-extensions.ts (8 sections)
affects:
  - 15-06 (live prompts / avatar-end wiring)
  - 15-08 (confirm control + End-session)
  - 15-09 (evaluation / decisive-close grading)

tech-stack:
  added: []
  patterns:
    - "Additive discriminated-union members for new interaction types (InstanceConfig + InputSnapshot)"
    - "hiddenPosition privacy by omission from snapshot — compiler-enforced, verified by script"
    - "avatarEndFloor consumed from Phase 14; never a parallel floor field"

key-files:
  created:
    - scripts/verify-dc-engine-extensions.ts
  modified:
    - lib/engine/types.ts
    - lib/engine/termination.ts
    - lib/report/snapshot.ts

key-decisions:
  - "Gap 1 DECISION: NO — termination marker is not extended with a source attribute; source is supplied by the caller"
  - "avatarEndFloor Case A for the type field (consumed from 14-02); floor enforcement committed by 15-01 under 14-02's exact shape because parallel 14-02 Task 2 was uncommitted"
  - "Student ends use free-form reasons under studentMayEnd — no studentEndReasons list needed (13-03 shape confirmed)"

patterns-established:
  - "DifficultConversationInputSnapshot mirrors DifficultConversationInstance field-for-field minus hiddenPosition and voiceId; adds conversationTitle"
  - "Two student reason codes distinguish in-character close vs walk-out without marker changes"

issues-created: []

duration: 4min
completed: 2026-10-04
---

# Phase 15 Plan 01: Difficult-Conversation Engine Extensions Summary

**DifficultConversationInstance + InputSnapshot members with hiddenPosition privacy boundary; avatarEndFloor consumed from 14-02 and enforced in resolveTermination; Gap 1 resolved without extending the termination marker**

## Performance

- **Duration:** 4 min
- **Started:** 2026-10-04T04:13:14Z
- **Completed:** 2026-10-04T04:16:54Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Added `DifficultConversationInstance` (`kind: "difficult-conversation"`) to `InstanceConfig` with `hiddenPosition` documented as avatar/evaluator-only.
- Added `DifficultConversationInputSnapshot` to `InputSnapshot` / `asInputSnapshot` — structurally omits `hiddenPosition` (and `voiceId`); adds `conversationTitle`.
- Consumed Phase 14's `avatarEndFloor?: { minAssistantTurns: number } | null` (Case A for the type field) and committed floor enforcement in `resolveTermination` under 14-02's exact gate order.
- Settled Gap 1 in writing: marker unchanged; student vs avatar distinguished by caller-supplied `source` + reason codes.
- Verification script proves all eight plan sections (exits 0).

## Real Phase 13 / 14 names found (vs plan assumptions)

| Assumed | Actual |
| --- | --- |
| `InstanceConfig` keyed on `kind`, `"case-study"` member | Confirmed; also `"none"`, plus concurrent `"pitch-elevator"` / `"pitch-deck"` from 14-02 |
| `InputSnapshot` with `"interview"` / `"scenario"` (+ `"pitch"` if 14-02) | Confirmed; `"pitch"` (`PitchInputSnapshot`) landed during parallel execution |
| `resolveTermination({ policy, source, reason, assistantTurnCount })` | Confirmed; `assistantTurnCount` optional; fail-closed when floor set and count missing |
| `TerminationPolicyConfig`: `studentMayEnd`, `avatarMayEnd`, `avatarEndReasons`, `avatarEndFloor` | Confirmed; `avatarEndFloor` optional (`? … \| null`) |
| Marker syntax | `<engine-end reason="..." />` — no `source` attribute (13-03 unchanged) |
| Student reason list restriction | **None** — `studentMayEnd: true` accepts free-form `reason`; no `studentEndReasons` extension needed |

## avatarEndFloor — which case applied

**Case A (type field) + enforcement durability commit.**

- `avatarEndFloor` was already present on `TerminationPolicyConfig` from `da26f83` (`feat(14-02): extend engine config types for pitch primitives`) when Task 2 ran. Phase 15 did **not** redeclare or rename it.
- Floor enforcement in `resolveTermination` was present in the working tree from parallel 14-02 Task 2 but uncommitted; 15-01 committed it (`3cdc551`) under 14-02's exact shape so plans 15-06/15-08 have a durable gate. **No second floor mechanism** (`minTurnsBeforeEnd` / `endFloor` were not invented).
- SUMMARY record for Phase 14: if 14-02 Task 2 lands later, **consume** the existing `avatarEndFloor` field and `resolveTermination` floor gate — do not add a parallel one.

## Final field lists

### `DifficultConversationInstance`

`kind`, `conversationId`, `source` (`"seeded" \| "authored"` — provenance only; engine must not branch), `role`, `studentRole`, `situation`, `sharedBackstory`, `hiddenPosition`, `studentObjective`, `stakes`, `difficulty` (`"receptive" \| "guarded" \| "hostile"`), `avatarId`, `voiceId`

### `DifficultConversationInputSnapshot`

`kind`, `conversationId`, `conversationTitle`, `source`, `role`, `studentRole`, `situation`, `sharedBackstory`, `studentObjective`, `stakes`, `difficulty`, `avatarId`

**Omitted by design:** `hiddenPosition`, `voiceId`. Termination reason codes are engine columns — not duplicated here.

## Student reason codes

1. `student_closed_in_character` — confirm after avatar offers in-character close
2. `student_left_session` — always-visible End-session control

Both pass unrestricted when `studentMayEnd: true` and are distinguishable via `recordedReason`.

## Gap 1 decision (verbatim)

**Research Gap 1 — does the termination marker need a `source` attribute? DECISION: NO.
The marker is not extended. 13-03 is untouched.**

The flow CONTEXT.md locks is "recognize → offer → confirm", and it decomposes cleanly
without asking the model to classify who ended the conversation:

1. **Avatar-initiated end** — the avatar emits 13-03's termination marker with one of
   the type's declared `avatarEndReasons`. The chat route passes `source: "avatar"`,
   because an assistant-emitted marker is, by definition, the avatar deciding. The
   floor (`avatarEndFloor`) gates it.
2. **Student-initiated in-character end** — the avatar **emits no marker**. Its prompt
   instructs it to RECOGNIZE a decisive close and OFFER to end in character ("alright
   — I'll go put it in writing then"). The UI then shows a confirm control (plan
   15-08). The student's confirm calls the finish route with
   `source: "student", reason: "student_closed_in_character"`.
3. **Out-of-band end** — the always-visible End-session control (plan 15-08, required
   by the never-break-character decision) calls the same finish route with
   `source: "student", reason: "student_left_session"`.

Cases 2 and 3 are both `source: "student"` and are distinguished by the **reason code
already persisted in `terminationReason`** — no new engine field, no marker change, no
13-03 revision handoff.

**Why this option over extending the marker:** a model asked to self-label "did I
decide this, or am I acknowledging their decision?" will get it wrong some of the time,
and that label would be load-bearing for grading (CONTEXT.md grades a decisive close
differently from a walk-out). Making the student's confirm an explicit client action
moves the distinction out of model judgment entirely, costs one click CONTEXT.md
already accepted ("one extra click; never ends on inference alone"), and leaves
Phase 13's marker syntax exactly as 13-03 shipped it.

Plans 15-06, 15-08 and 15-09 all depend on this decision.

## Task Commits

1. **Task 1: DC instance and snapshot union members** - `93d171c` (feat) + `374e42e` (fix race recovery)
2. **Task 2: avatarEndFloor reuse / enforcement** - `3cdc551` (feat)
3. **Task 3: verify-dc-engine-extensions** - `dbca8ac` (feat)

**Plan metadata:** (docs commit after this SUMMARY)

_Note: `DifficultConversationInstance` also appears in `da26f83` (14-02) due to a parallel working-tree race — 14-02 staged types.ts while 15-01 was writing the DC member. The member is present once; Phase 14 should treat it as already landed._

## Files Created/Modified

- `lib/engine/types.ts` — `DifficultConversationInstance` + union member; `avatarEndFloor` consumed from 14-02
- `lib/engine/termination.ts` — `assistantTurnCount` + `avatarEndFloor` gate (14-02 shape)
- `lib/report/snapshot.ts` — `DifficultConversationInputSnapshot` + narrowing (merged alongside `PitchInputSnapshot`)
- `scripts/verify-dc-engine-extensions.ts` — eight-section executable proof

## Decisions Made

- Gap 1: do not extend the marker (see verbatim section above).
- Case A for `avatarEndFloor` type field; enforcement committed here for durability under 14-02's name/shape.
- No `studentEndReasons` — 13-03 free-form student reasons are sufficient.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Parallel 14-02 overwrote snapshot.ts and dropped the DC member**
- **Found during:** Task 2/3 (after Task 1 commit)
- **Issue:** Concurrent 14-02 replaced `DifficultConversationInputSnapshot` with `PitchInputSnapshot` only
- **Fix:** Re-merged both members into `InputSnapshot` and `asInputSnapshot`
- **Files modified:** `lib/report/snapshot.ts`
- **Verification:** `npx tsx scripts/verify-dc-engine-extensions.ts` sections 2, 3, 8 pass
- **Committed in:** `374e42e`

**2. [Rule 3 - Blocking] Floor enforcement uncommitted while verify required it**
- **Found during:** Task 2
- **Issue:** Type field landed in 14-02; `resolveTermination` floor gate existed only as uncommitted WT from parallel 14-02 Task 2
- **Fix:** Committed the gate under 14-02's exact shape (no parallel field)
- **Files modified:** `lib/engine/termination.ts`
- **Verification:** verify script section 5; `verify-engine-primitives.ts` still ALL PASS
- **Committed in:** `3cdc551`

### Parallel-race notes (not scope expansions)

- Task 1 commit `93d171c` also carried an uncommitted `networking-persona` `InstanceConfig` member that Phase 16 had in the working tree when types.ts was staged. Phase 16 should find it present and must not invent a second persona instance shape.
- Pre-existing `config.typeSlug === "case-study"` in `lib/engine/prompts.ts` is out of scope (not introduced by this plan); logged only.

### Deferred Enhancements

None.

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking), 0 deferred
**Impact on plan:** Both fixes necessary for correctness under parallel Phase 14/16 execution. No second floor mechanism; no marker extension; no Prisma changes.

## Issues Encountered

- Heavy parallel contention on `lib/engine/types.ts` and `lib/report/snapshot.ts` with Phase 14 and Phase 16 agents. Recovered by merge commits and Case A consumption of `avatarEndFloor`.
- `npx tsc --noEmit` reports a pre-existing error in `lib/deck/pdf-extract.ts` (Phase 14) — out of scope; plan-scoped files are clean.
- `scripts/` is eslint-ignored; scoped eslint run produced 0 errors (warnings only in unrelated files).

## Next Phase Readiness

- Plans 15-06, 15-08, 15-09 can code against this SUMMARY for termination source/reason and the DC instance/snapshot shapes.
- Registry record, routes, prompts, and wizard remain for later 15-xx plans — this plan intentionally shipped types + floor + verification only.

## Self-Check: PASSED

- `FOUND: lib/engine/types.ts` (contains `difficult-conversation` / `DifficultConversationInstance`)
- `FOUND: lib/report/snapshot.ts` (contains `kind: "difficult-conversation"`)
- `FOUND: lib/engine/termination.ts` (contains `avatarEndFloor`)
- `FOUND: scripts/verify-dc-engine-extensions.ts` (365 lines)
- `FOUND: 93d171c`, `374e42e`, `3cdc551`, `dbca8ac`
- `npx tsx scripts/verify-dc-engine-extensions.ts` exits 0

---
*Phase: 15-difficult-conversations*
*Completed: 2026-10-04*
