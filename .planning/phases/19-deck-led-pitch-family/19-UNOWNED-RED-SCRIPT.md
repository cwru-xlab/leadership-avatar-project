---
phase: 19-deck-led-pitch-family
status: open
found: 2026-10-08
found_by: orchestrator, while auditing 19-09's "pre-existing" claim
---

# `scripts/verify-report-structure.ts` is red, Phase 19 caused it, and no plan owns it

## The failures

```
FAIL resolve pitch-funding:  interaction type "pitch-funding" requires an instance
FAIL resolve pitch-product:  interaction type "pitch-product" requires an instance
FAIL resolve pitch-talk:     interaction type "pitch-talk" requires an instance
FAIL resolve pitch-general:  interaction type "pitch-general" requires an instance
4 check(s) FAILED.
```

## Why this is Phase 19's and not inherited

Plan 19-09's SUMMARY records these as "pre-existing failures ... confirmed via a
disposable git worktree ... that these pre-date plan 19-09 entirely." That is
**true of 19-09 and misleading as a disposition.** The four failing checks name
`pitch-funding`, `pitch-product`, `pitch-talk` and `pitch-general` — four
interaction types that **did not exist before this phase.** They were introduced
by 19-04 and 19-05 when those types were registered in
`lib/engine/registry.ts`. They predate 19-09 by one and two waves; they do not
predate Phase 19.

`verify-report-structure.ts` iterates `ENGINE_TYPES` and resolves each without an
instance. All four new modes declare `instance: { required: true }`, so each
correctly refuses to resolve — the script's loop, not the type records, is what
needs updating.

## There is an established precedent for the fix

This is the **same class of breakage 19-04 and 19-05 already fixed elsewhere**:
both extended `scripts/verify-pitch-types.ts`'s generic resolve-loop with
instance fixtures for the newly-registered slugs, disclosed as Rule 3 blocking
deviations. Nobody did the equivalent for `verify-report-structure.ts`, because
no plan's `files_modified` lists it:

- 19-10 owns only `scripts/verify-deck-family-surface-count.ts`
- 19-11 owns only the three validation markdown files

So the phase as planned ends with a red script it made red.

## Disposition

**Assigned to 19-10 as a Rule 3 blocking deviation**, following 19-04/19-05's
precedent exactly: add instance fixtures for the four new instance-required
slugs to the generic resolve-loop. Do **not** weaken or skip the assertions, and
do **not** change any type record's `instance.required` to make the script pass —
the requirement is correct and the loop is what is incomplete.

If 19-10 cannot absorb it, it must be stated as an open defect in
`19-VALIDATION.md` rather than left silently red.

## Note on claim hygiene

Recorded because the project has a repeated history of this failure mode:
Phase 12's stale checkbox, Phase 18's green battery that excluded the suite its
change broke (`18-PITCH-TYPES-REGRESSION.md`), and now a Phase-19-introduced red
script labelled "pre-existing". The label was not dishonest — the executor did
verify something real with a worktree — but "predates my plan" and "not caused
by this phase" are different claims, and only the second one justifies leaving
it alone.
