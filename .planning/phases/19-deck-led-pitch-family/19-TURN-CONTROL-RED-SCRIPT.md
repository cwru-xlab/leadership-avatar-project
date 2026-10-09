---
phase: 19-deck-led-pitch-family
status: open
found: 2026-10-08
found_by: 19-11 executor, while running the Task 1 automated battery
---

# `scripts/verify-turn-control.ts` is red, Phase 19 caused it, and no plan owns it

## The failures

```
FAIL resolve pitch-funding
FAIL resolve pitch-product
FAIL resolve pitch-talk
FAIL resolve pitch-general
4 check(s) FAILED.
```

Section 10 ("`parseEngineTurn == parseInterviewTurn + reducer; termination null for
all built-ins`") iterates `listEngineTypes()` and calls
`resolveSessionConfig(type.slug, syntheticInit(type.slug))` for every registered type.
`syntheticInit()` is a hand-written `switch` over specific slugs
(`case-study`, `pitch-elevator`, `pitch-deck`, `difficult-conversation`) with a
default `return {}` for anything else — so any instance-required type not named in
that switch resolves with no instance and fails.

## Why this is Phase 19's and not inherited

`scripts/verify-turn-control.ts` was last touched at commit `734ef1f`
("fix: restore clean tsc and a green verify suite"), itself a Phase 13 commit —
**before `pitch-funding`, `pitch-product`, `pitch-talk`, and `pitch-general` existed
at all.** Those four slugs were registered by 19-04/19-05, which added their own
fixtures to `verify-pitch-types.ts` and (via 19-10, under
`19-UNOWNED-RED-SCRIPT.md`) to `verify-report-structure.ts`, but no plan's
`files_modified` lists `scripts/verify-turn-control.ts`. This is the exact same
class of breakage as `19-UNOWNED-RED-SCRIPT.md`, in a third script with the same
generic-resolve-loop-missing-a-fixture shape.

## Disposition

This is found at 19-11, Phase 19's closing plan, with no later Phase-19 plan
available to absorb the fix. Per 19-11's own constraints ("Do not change product
behavior in this plan" and the scope boundary that only issues directly caused by
the current task's own changes may be auto-fixed), this plan does NOT fix it. It is
recorded here as an **open, assigned-nowhere defect** inherited into Phase 19's
closing validation, analogous to `18-PITCH-TYPES-REGRESSION.md`'s "record it,
don't absorb it" treatment within a closing plan — except that one is Phase 18's
own debt and this one is Phase 19's own debt, surfaced too late in its own
execution order to have a plan left to assign it to.

`19-VALIDATION.md`'s automated battery table records this failure as "Phase 19
tooling debt — open" rather than omitting it or folding it into the elevator's
pre-existing, differently-caused failure.

## Fix shape (for whoever picks this up)

Add one `syntheticInit()` case per new slug (`pitch-funding`, `pitch-product`,
`pitch-talk`, `pitch-general`), mirroring the `pitch-deck` case's shape but
omitting `askPriceUsd`/`askEquityPct`/`fairValueBand` (absent, not zeroed, per
19-02's "absence, not zero" rule) and including each mode's `modeInputs`. The
exact fixture shapes already exist in `scripts/verify-pitch-types.ts` and
`scripts/verify-report-structure.ts` and should be copied, not reinvented.
