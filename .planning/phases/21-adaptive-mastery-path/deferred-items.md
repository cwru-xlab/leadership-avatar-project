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
