---
phase: 20-difficult-conversation-walk-outs
status: open
found: 2026-10-08
found_by: orchestrator, auditing 20-02's amendment proof
assigned_to: 20-03
---

# The stonewalling crossing passes by one floating-point epsilon, not by a margin

## What the proof actually shows

`scripts/verify-disengagement.ts` section 14 prints:

```
sustained stonewalling disengagement value: 0.6000000000000001 (crossed 0.6: true)
```

The user's amendment (`20-CONTEXT.md`) requires that sustained pure stonewalling
cross the threshold **on its own**, and it does. Every assertion passes, and
constraint 4 held — section 14 separately proves none of the six pure-refusal
lines registers as hostile, so stonewalling was not reclassified as an attack to
make the amendment pass.

## Why it is still a defect

The margin is **1e-16**. The weights were evidently chosen to sum to exactly
0.6, and IEEE-754 addition happened to land a hair above rather than a hair
below. Reorder the same additions, change any contributing weight by a
rounding-level amount, or add a cause that participates in the sum, and the
value becomes `0.5999999999999999` — at which point `>= 0.6` is **false**, the
walk-out silently stops firing for pure stonewalling, and the user's amendment
is quietly un-implemented while section 14's assertion fails for a reason that
reads like a tuning problem rather than an arithmetic one.

A threshold crossing that depends on float representation is not a tuned
threshold. It is a coincidence that currently has the right sign.

## This is the project's recurring failure mode

Phase 12 shipped `POSTURE_DRIFT_SUSTAINED_S = 15` that was read by nothing for
three plans. Phase 18 proved its ratchet in the unit and left it unenforced at
the integration seam. Phase 18 also left `verify-pitch-types.ts` red while
reporting an all-green battery. In each case a number or a check "worked" for a
reason nobody had verified. This is the same shape.

## Required of 20-03

20-03 declares the difficult-conversation type's actual `disengagementWeights`
profile — the real numbers, where this must be settled. It must:

1. **Give the stonewalling path real headroom.** Sustained pure stonewalling
   should cross the threshold by a margin that survives reordering and
   rounding — not land on it. State the achieved margin explicitly.
2. **Or make the comparison epsilon-tolerant** if landing exactly on the
   threshold is genuinely intended — but then say so, and assert the tolerance,
   rather than depending on which way the last bit fell.
3. **Keep the profile's sum explicit and asserted**, as 20-02 already does.
4. **Not weaken section 14 or 15.** The assertion count must stay equal or
   higher, and both must still pass alongside 20-01's untouched 24-row
   `FIRM_NOT_HOSTILE` corpus.
5. Preserve hostility crossing at or before stonewalling's turn count.
6. Keep every number **PROVISIONAL UNTIL CALIBRATED** with its evidence named.

Do **not** resolve this by lowering the threshold below 0.425 — the user
explicitly rejected that.
