# Quick 002 Summary — Feedback source attribution (issue #50)

**Status:** COMPLETE — Tasks 1-3 discharged, human-verify reported PASS
("all pass", 2026-10-16) on PARTIAL evidence; see the human-verify section.
**Date:** 2026-10-16 · **Plan:** `002-PLAN.md` (`8521fd6`)

## What shipped

| Task | Commit | What |
| --- | --- | --- |
| 1 | `918606a` | Closed-vocabulary `source` through the structured report; `lib/report/source-attribution.ts`; wired into `validateEvaluationResult`; both frozen schema snapshots updated |
| 2 | `f7ff736` | Interview evaluator declares the source; `SourceChip` rendered on both accordion row types |
| 3 (automated half) | `55fa287` | `scripts/verify-feedback-source-attribution.ts` + `npm run verify:feedback-source` |

Feedback items now carry a `source` the interview evaluator self-declares from a
three-value closed vocabulary (`resume` / `conversation` / `both`), rendered as a
chip on each collapsed Strengths / Growth-areas row and silent when the field is
null.

## Why this is attribution and not guesswork

`lib/engine/evaluation.ts:231-236` already hands the evaluator two **separately
labelled** blocks, `full_transcript:` and `resume_text:`. The model therefore
reports which evidence it used; nothing re-reads a finished sentence to guess
where it came from. That was the failure mode the plan was explicitly told to
avoid rather than paper over.

**What is deterministically enforced:** line 308 derives `hasResume` from the
real resume text, and `enforceSourceAttribution` downgrades any `resume` or
`both` attribution to `conversation` when no resume was uploaded — so a resume
attribution is *impossible* without a resume. It sits in one server exit,
mirroring where 20-06 placed `quote-sanitizer.ts`.

**What is NOT guaranteed, and must not be claimed in UI copy:** when a resume
*did* exist, the source is the model's own declaration. It is an attribution,
not a proof. The chip is worded as a plain attribution rather than a verdict.

## Scope and collision avoidance

`source` is **nullable** rather than universally prompted, because
`STRUCTURED_REPORT_PROPERTIES` is shared by every type and OpenAI `strict: true`
admits no optional keys. Consequence: scenario, networking and
`CONVERSATION_EVALUATOR_PROMPT` needed **zero** edits and their reports stay
byte-identical — which matters with 20-05 just landed and 20-07 still gated.

No file outside the plan's `files_modified` was touched. `termination.ts`,
`disengagement.ts`, `PracticeSessionShell.tsx` and every `*-VALIDATION.md` are
untouched. No deployed service or shared database was contacted.

## Verification (re-run independently by the orchestrator, not taken on trust)

`npx tsc --noEmit` clean. All exit 0: `verify-report-structure`,
`verify-feedback-source-attribution`, `verify-feedback-copy`,
`verify-engine-surface-count`, `verify-report-chrome-coverage`,
`verify-pitch-types`, `verify-disengagement-walkout-shell`, `verify-dc-report`.

**Guard-bite proof (Task 1).** `verify-report-structure.ts` holds two frozen
pre-Phase-13 schema snapshots. Running it *before* updating them failed the
deep-equality checks exactly as predicted; both snapshots were then updated with
amended provenance comments and it returned to ALL PASS. No assertion was
weakened.

**Negative test, re-run independently.** Forcing `const hasResume = true` in
`lib/engine/evaluation.ts` makes `verify-feedback-source-attribution.ts` produce
**4 FAIL rows and exit 1**; restoring the real derivation returns exit 0, working
tree clean. The guard genuinely bites.

*(A first attempt at this negative test used a regex that did not match the
shorthand `{ hasResume }` call and silently changed nothing — its "pass" was
meaningless. Recorded because a negative test that does not actually run looks
identical to one that does.)*

## Human-verify — PASS (2026-10-16)

**Verdict, verbatim: "all pass".** Human-performed, agent-recorded. All five
checks below were reported as passing.

**Evidence strength: PARTIAL**, recorded at the strength it actually has,
following the convention `17-KEYBOARD-PASS-1.md` and `13-CLOSE-RECORD.md` set.
`missing_evidence`:

- No report IDs supplied for either interview session.
- No item-level notes — the five checks were reported as one aggregate verdict
  rather than individually.

This does not weaken the verdict; it records what a future reader can and cannot
reconstruct from it. The automated half is separately evidenced above, including
a negative test confirmed to bite.

### The five checks reported as passing

1. Run a General Interview **with a resume**; include one answer elaborating on
   the resume and one story not on it. On the Feedback tab confirm every
   Strengths / Growth-areas row carries a visible chip, that resume-vs-conversation
   points are distinguishable at a glance, and that a "Resume + conversation" chip
   is visually distinct.
2. Confirm chips read as plain attributions, not verdicts, and that the Overall
   narrative's wording is consistent with them.
3. Run a second General Interview **skipping** the resume — confirm **zero**
   resume chips.
4. Open a pre-existing older report — confirm it still renders with no chips and
   no empty badge.
5. Open a Courageous Conversation or Networking report — confirm it is unchanged.

Task 002 is COMPLETE: Tasks 1-3 all discharged, the automated battery green and
negative-tested, the human-verify reported as passing.
