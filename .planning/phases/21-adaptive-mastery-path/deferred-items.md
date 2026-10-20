# Phase 21 — Deferred / Out-of-Scope Items

Items discovered during plan execution that are pre-existing, out of scope
for the discovering plan, and logged here rather than fixed inline, per the
GSD executor's scope-boundary rule.

## From 21-06

- **REQUIREMENTS.md's Traceability table already shows `REQ-108 | Phase 21 |
  Complete` as of 21-03's commit (`d610a17`), before the requirement is
  actually satisfiable.** REQ-108's full text requires the four check
  formats to be "modelled, persisted INSIDE the study-plan surface, **and
  ANSWERABLE BY THE STUDENT**: an authenticated surface renders each of the
  four formats and submits an answer through an authenticated,
  ownership-scoped route." 21-03 shipped only the Prisma schema; 21-06
  (this plan) shipped only the payload/answer-key models and the
  no-engine-registry guard. The answering surface is 21-22
  ("Knowledge-check taking surface: attempt route, four-format card...").
  Until 21-22 lands, REQ-108 is NOT actually complete, regardless of what
  the traceability table currently says.
  - **Not fixed here** — the stale row predates this plan (21-03's commit,
    not 21-06's), and this plan's `files_modified` does not include
    `REQUIREMENTS.md`. Flipping a traceability row to `Pending` while three
    sibling executors share this git index risked a false "regression" read
    by whichever plan next inspects it.
  - **Action for 21-22 (or whichever plan closes REQ-108):** confirm
    REQ-108's checkbox (`- **REQ-108** — [ ]`) and its traceability row are
    BOTH only flipped to complete once the answering surface genuinely
    exists, not before.
  - This plan (21-06) deliberately did NOT run
    `gsd-tools.cjs requirements mark-complete REQ-108`, even though REQ-108
    appears in this plan's frontmatter `requirements:` list, for the same
    reason 21-05-SUMMARY.md left REQ-107 unchecked: it is a multi-plan
    requirement and this plan ships a necessary piece, not the whole thing.

---

## Cross-wave hazard: `PLACEHOLDER_KNOWLEDGE_CHECK_ID` is un-guarded

**Found by the orchestrator while spot-checking 21-14 (wave 5). Not a 21-14
defect — 21-14 disclosed it in its own doc comment. It is unassigned work.**

`lib/study-plan/next-step.ts:75` exports
`PLACEHOLDER_KNOWLEDGE_CHECK_ID = "__PENDING_GENERATION__"`, written into a
`KNOWLEDGE_CHECK` step's `knowledgeCheckId` at selection time (line 266). It
exists because 21-08's `validatePathSteps` is presence-only for that field, and
a knowledge check's real id does not exist until 21-19 generates and attaches
it.

The comment at lines 72-73 states 21-19 "must replace every occurrence with a
real `KnowledgeCheck.id` first". **Nothing enforces that.** `grep -rln` finds
the constant referenced in exactly one file — its own.

**Failure mode if it leaks:** a persisted path step keeps
`knowledgeCheckId = "__PENDING_GENERATION__"`, and 21-19's `PathPanel` renders
`/study-plans/{planId}/checks/__PENDING_GENERATION__` — a dead link. That is
exactly what **REQ-122** forbids ("every path step's action link reaches its
exercise"), and the failure is silent: the panel renders, the link 404s.

**Required of 21-19 (wave 7):**
1. Replace every placeholder with a real `KnowledgeCheck.id` before persisting,
   or omit the step.
2. Add a verifier assertion that **no persisted `StudyPlanPathStep` carries the
   placeholder**, proven to bite (plant one, observe failure, remove).
3. Do not render an action link for a step whose `knowledgeCheckId` is the
   placeholder, as a second line of defence.

**For 21-20 (wave 8):** if the placeholder can still reach a persisted row at
sign-off, record it as an open REQ-122 defect rather than signing it off.
