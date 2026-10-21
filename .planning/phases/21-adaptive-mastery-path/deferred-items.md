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

---

## From 21-22

- **REQ-108's deferred action (above, from 21-06) is now resolved.** The
  answering surface landed this plan: the attempt route (GET keyless/POST
  grade), the four-format card, and the fixed-contract page all ship and are
  proven by `scripts/verify-check-taking-surface.ts` (53/53 checks, DB-gated
  section ran against the local migrated database). REQ-108's checkbox and
  traceability row were both flipped to Complete in this plan, in agreement.
- **REQ-111 and REQ-112 also flipped to Complete** in this plan. REQ-111 was
  already functionally satisfied by 21-11 (its own SUMMARY disclosed marking
  it complete), but `REQUIREMENTS.md`'s checkbox had reverted to `[ ]` by the
  time this plan ran (the traceability row also read `Pending`) — most likely
  overwritten by a later commit from a concurrent sibling plan sharing the
  same file. This plan re-ran `gsd-tools requirements mark-complete` for
  REQ-108/REQ-111/REQ-112 and found the tool updates the Traceability table
  but NOT the inline checkbox, so the three checkboxes were hand-edited to
  `[x]` to keep both halves in agreement, per this plan's own
  `plan_specific_notes` instruction.
- **REQ-112 is genuinely satisfied now, not merely re-ticked:** the card's
  "This grading looks wrong" control is gated on a mark existing, POSTs to
  `/api/study-plans/checks/{attemptId}/contest` (the attempt id, not the
  check id — confirmed by the verifier's Section 3), and renders a plain-
  language confirmation that the mastery contribution has been reversed
  pending review on both 201 and 409. The mark itself is never re-graded or
  cleared.
- **REQ-122 was deliberately left Pending.** Its text requires every path
  step's action link to work for all three step kinds (`KNOWLEDGE_CHECK`,
  `COACHED_SESSION`, `UNAIDED_SESSION`), and `components/study-plan/
  PathPanel.tsx` does not exist yet (confirmed by this plan's own verifier,
  which prints an explicit SKIP rather than a false pass for that half). This
  plan ships only the `KNOWLEDGE_CHECK` destination page at the fixed URL
  21-19 is expected to link to. 21-19/21-20 must confirm the other two step
  kinds' action links and the `PLACEHOLDER_KNOWLEDGE_CHECK_ID` hazard
  (documented above) before REQ-122 can be marked complete.

---

## Disclosed limitation: coached mode cannot start an `instance`-requiring type

**Disclosed by 21-24 (wave 6) and left unfixed by design. Recorded here so
21-20 signs it off knowingly rather than discovering it later.**

21-24's `CoachedSessionShell` starts its live turn area against the engine's
already-generic `session/start` / `interaction/chat` / `session/finish`
endpoints, deliberately rather than importing or extending
`PracticeSessionShell.tsx` (which stays provably untouched —
`git diff --name-only -- components/practice/` is empty across the whole
phase).

**The gap:** an underlying interaction type that requires an `instance` —
case-study and difficult-conversation — may reject that generic session-start
call. 21-24 surfaces the rejection as an error rather than papering over it,
and did not solve it.

**Why it was right not to solve it here:** the fix belongs either in the engine
(outside this phase — Phase 21 modifies only `lib/engine/evaluation-runner.ts`,
and widening that would void 21-20's no-gate reasoning) or in a dedicated plan
that decides how a coached session supplies an instance. Improvising it inside
a UI shell would have buried an architectural decision in a component.

**Practical effect:** coached practice works for competencies whose weakest-
evidence sessions came from instance-free types, and errors for the rest. Since
21-14 selects the weakest competency first and does not filter by type, a
student CAN be routed to a coached step that cannot start.

**For 21-20 (wave 8):** record this against REQ-113/REQ-114 as a known
limitation with its reproduction, not as a pass. REQ-113/114 are legitimately
Complete — a student can start and complete a coached session — but not for
every competency.

**For a future plan:** either teach the coached entry route to supply an
instance for types that need one, or have 21-14's selection skip competencies
whose only evidence is instance-requiring, so a student is never offered a step
that cannot start. The second is smaller; the first is more complete.

---

## From 21-19

- **The `PLACEHOLDER_KNOWLEDGE_CHECK_ID` hazard (above) is CLOSED.** The
  path route (`app/api/study-plans/[planId]/path/route.ts`) replaces every
  `KNOWLEDGE_CHECK` step's placeholder with a real `KnowledgeCheck.id`
  before calling `createPath`, degrading to `UNAIDED_SESSION` (recorded in
  `degradedSteps`) when generation fails or no moment was available; a
  second assertion right before `createPath` throws if one somehow survives
  the loop; and `PathPanel.tsx` carries a third, independent backstop that
  renders no action link for a `KNOWLEDGE_CHECK` step whose
  `knowledgeCheckId` is still the placeholder. `scripts/verify-path-
  surface.ts` Section 7 proves this by PLANTING a placeholder step directly
  via `createPath` (bypassing the route, to prove the detector itself, not
  just the route's own discipline), observing the detector fire, then
  removing it — a database-gated proof that ran for real (DATABASE_URL was
  set).
- **REQ-122 is now Complete.** `PathPanel.tsx` renders all three step
  kinds' action links against the fixed contracts 21-22 (`KNOWLEDGE_CHECK`)
  and 21-24 (`COACHED_SESSION`) shipped, plus a derived `/practice/{slug}`
  destination for `UNAIDED_SESSION` (21-19's own derivation — no single
  owning interaction type is stored for a competency, since
  `COMPETENCIES`' `dimensionKeys` deliberately span several types; the
  route derives one deterministically from the first `ENGINE_TYPES` entry
  whose own `extraRubricDimensions` claims one of the competency's
  non-shared dimension keys). Both generated-page destinations are proven
  to exist ON DISK (not merely as href substrings), with an inverted
  assertion against a singular `/check/` variant proving the existence
  check reads the filesystem. The pre-existing coached-mode `instance`
  limitation (recorded above, from 21-24) is NOT a REQ-122 defect — the
  link itself reaches a real, startable surface; the surface's own
  documented limitation is tracked against REQ-113/114, not here.
- **REQ-120 is now Complete**, jointly with 21-18 (already landed,
  `1c5222b`): the path (step state, next-step reason) is surfaced on
  `app/reports/page.tsx` via `PathPanel`, additively (145 insertions, 0
  deletions, regression-guarded by `scripts/verify-path-surface.ts`
  Section 1 with a bite-proof); level and goal progress are surfaced on
  `/mastery` (21-18's `MasteryPanel`). REQ-120's text does not require both
  halves to live on one page.
- **A gap in 21-22's own disclosure, closed here:** 21-22's attempt route
  (`app/api/study-plans/checks/[checkId]/attempt/route.ts`) deliberately
  never marks its owning path step COMPLETE on a correct/graded answer,
  naming "the path route" as where that write belongs. This plan's GET
  handler performs that write (via `markStepComplete`, re-checking 21-08's
  state-dependent validation rule at the transition) on every read, so an
  answered `KNOWLEDGE_CHECK` step does not stay PENDING forever and
  `nextStepFor` actually advances past it.
