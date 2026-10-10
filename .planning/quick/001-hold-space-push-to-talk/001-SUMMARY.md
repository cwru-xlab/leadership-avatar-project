---
task: 001-hold-space-push-to-talk
date: 2026-10-09
status: complete
mode: quick-full
---

# Quick 001 — Hold-Space push-to-talk

## What shipped

Hold **Space** to talk in every engine-backed avatar session, alongside the
existing mic button. One implementation in the shared shell; no per-type wiring.

| File | Role |
|---|---|
| `lib/practice/push-to-talk-key.ts` | Pure, dependency-free eligibility predicates — `isPushToTalkKey`, `describeKeyTarget`, `isPushToTalkBlockingTarget`, `shouldAbortPendingStart`, `BLOCKING_TAG_NAMES`, `SPACE_ACTIVATED_ROLES` |
| `components/practice/PracticeSessionShell.tsx` | One window-level keydown/keyup listener + the visible `or hold <kbd>Space</kbd> to talk` hint beside the mic control |
| `scripts/verify-hold-space-push-to-talk.ts` | 10-section battery |
| `package.json` | `verify:hold-space` script |

## Design decisions that survived review

**Walk-out inertness is INHERITED, never duplicated.** The keydown handler routes
through the existing `startRecording` / `stopRecording`, which already guard on
`walkOutLockRef.current` and re-check it after `getMicrophone()` resolves. The
handler deliberately consults none of those gates itself — Section 6 asserts their
absence from the handler, so a duplicated gate fails the build.

**Focus scoping.** Space is ignored in `input` / `textarea` / `contenteditable`
(typing still types) and on `button` / `a` / Space-activated roles (buttons still
activate). This protects Phase 19's keyboard UAT item 1, where Space opens the
deck-picker disclosure — a native `<button>`, covered by the `BUTTON` entry.
`SUMMARY` is defensive coverage for a future native `<details>`; none exists
outside `app/test-pages/`.

**The tap-and-release race is fixed, not accepted.** `startRecording` claims its
in-flight flag synchronously then awaits `getMicrophone()`. A fast tap-and-release
stops nothing (the recorder is still null), and the late start would then run with
no keyup coming — leaving the microphone open. `cancelPendingStartRef` is set by
`releaseHold()` and read after the await via `shouldAbortPendingStart`. The flag is
cleared *after* the in-flight claim so a stale cancel cannot kill a later start.

## Verification

| Check | Result |
|---|---|
| `npx tsx scripts/verify-hold-space-push-to-talk.ts` | ALL PASS (10 sections) |
| `npx tsx scripts/verify-disengagement-walkout-shell.ts` | ALL PASS — the walk-out dead-end fix (`30a77b1`) is intact |
| `npx tsc --noEmit` | clean |
| `npx eslint` on all three touched files | **0 errors** (178 warnings are pre-existing formatting in the shell; the file carries 179 on its own) |

### Negative tests — both performed and observed failing

**(a) Duplicated walk-out gate.** Planted `if (walkOutLockRef.current) return;` in
the keydown handler → exit 1 on
`Section 6 (negative): the keydown handler does NOT mention walkOutLockRef`.
Reverted → exit 0.

**(b) Race mitigation removed.** Replaced `flags.startCancelled` with `false` in
`shouldAbortPendingStart` → exit 1 on
`Section 10: startCancelled alone aborts the pending start — the tap-and-release race`.
Reverted → exit 0.

## Incidents

**The executor stalled** (watchdog, no progress for 600s) after committing Tasks 1
and 2, mid-way through Task 3 — the verify script and `package.json` entry were
written but uncommitted and unverified. The orchestrator completed Task 3 rather
than re-spawning: ran the battery, diagnosed and fixed one failing assertion, ran
both negative tests, and committed. Tasks 1-2 were committed and `tsc`-clean at the
point of the stall, so nothing was lost.

**One verifier false positive, fixed in the test rather than the code.** Section 6's
absence checks used a naive `includes()` over the handler slice, which matched the
handler's own explanatory comment ("Deliberately does not consult `walkOutLockRef`
…") and failed a correct implementation. Deleting the comment to satisfy the test
would have been backwards — that comment is what stops a future editor re-adding
the gate. The slice is now comment-stripped before the negative checks, the same
approach `scripts/verify-deck-family-surface-count.ts` (plan 19-10) already uses.
Negative test (a) was then run specifically to prove the relaxed check still
catches a real duplicated gate.

## Residual — NOT discharged

1. **The live three-part browser check is unrun.** Not mechanizable without a DOM
   harness: (i) hold Space actually records and releasing stops it, (ii) Space
   inside the session's text input types a space, (iii) Space still opens the deck
   picker disclosure.
2. **Verification step 5 is a proxy.** `grep -rn "push-to-talk-key"` returning one
   consumer proves nothing else *imports* the module; it cannot detect a page
   reimplementing raw `keydown`/`" "` wiring. Not conclusive.
