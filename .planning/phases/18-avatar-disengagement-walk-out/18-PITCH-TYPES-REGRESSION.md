---
phase: 18-avatar-disengagement-walk-out
status: open
found: 2026-10-08
found_by: Phase 19 plan 19-01 executor, confirmed by orchestrator
---

# Phase 18 left `scripts/verify-pitch-types.ts` red, and its own battery did not notice

## What is failing

`npx tsx scripts/verify-pitch-types.ts` exits with **3 FAILURE(S) (elevator + deck)**:

| # | Assertion | Section | Owner |
|---|---|---|---|
| 1 | `avatarMayEnd === false` (line 519) | Deck section 4, "Avatar cannot end the meeting" — reads `PITCH_DECK_TYPE.terminationPolicy` | **Phase 19 / 19-03** |
| 2 | `PITCH_DECK_TYPE.terminationPolicy.avatarMayEnd === false` (line 679-680) | Deck locked-decision guards | **Phase 19 / 19-03** |
| 3 | `assistantTurnCount:2 + lost_interest ACCEPTED` (line 218) | **Elevator** section 6, "Avatar-end floor" | **Phase 18 — NOT Phase 19** |

## Why it matters

`scripts/verify-pitch-types.ts` was last written by Phase 14 (`7278628`, `test(14-11)`),
encoding Phase 14's intent that the investor deck **cannot end early**. Phase 18 flipped
`lib/pitch/deck-type.ts` to `avatarMayEnd: true` and opted both pitch types into the
disengagement threshold, **invalidating three assertions in a Phase 14 verifier without
updating or acknowledging them.** The script has been red ever since Phase 18 landed —
confirmed pre-existing via `git stash` by the 19-01 executor and re-confirmed
independently here.

`18-VALIDATION.md` reports an automated battery that is **five-for-five green**:
`verify-disengagement`, `-termination`, `-walkout-shell`, `-report`, and
`tsc --noEmit`. That is true as written — **but `verify-pitch-types.ts` is not in the
battery**, so the green is green on Phase 18's own new tests only, not on the suite its
change actually affected. This is the same class of unearned-green this project has
been burned by repeatedly: Phase 12's stale checkbox, and Phase 18's own
integration-seam defect where the ratchet was "proven in the unit and unenforced at the
integration seam."

## Disposition

- **Failures 1 and 2 are discharged by Phase 19 plan 19-03**, which sets
  `avatarMayEnd: false` / `avatarEndReasons: []` on `PITCH_DECK_TYPE` and thereby
  *restores* the Phase 14 intent these assertions encode. They should go green when
  19-03 lands. That is a confirming signal for 19-03, not a coincidence.
- **Failure 3 is Phase 18's own and Phase 19 cannot fix it.**
  `lib/pitch/elevator-type.ts` is read-only for all of Phase 19 by deliberate decision
  (the elevator keeps its 0.5 threshold so Phase 18's pending UAT stays runnable), and
  the elevator *should* now be able to end early — so the Phase 14 assertion is the
  thing that is stale, not the behavior. Most likely cause: with
  `disengagementThreshold` set, `resolveTermination`'s threshold gate **fails closed**
  when no trusted derived value is supplied, so a bare
  `assistantTurnCount: 2 + lost_interest` fixture is now correctly rejected.
- **Action required: 18-05 must either fix assertion 3 deliberately (inverting it to
  the new intent, not deleting it) or record it as a known-stale assertion with a
  reason.** It must also add `verify-pitch-types.ts` to Phase 18's battery, or state
  why it is excluded. Do not close Phase 18 with this script red and unmentioned.

## Verification after Phase 19

Expected: `verify-pitch-types.ts` drops from 3 failures to **1** (the elevator one).
If it drops to 0, something changed `elevator-type.ts` and that violates Phase 19's
read-only fence — investigate rather than celebrate.
