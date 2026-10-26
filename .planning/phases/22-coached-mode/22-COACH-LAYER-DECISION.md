# Coach Layer Placement and Consequences — Decision Record

**Plan:** 22-01
**Status:** DECIDED
**Authority:** 22-CONTEXT.md (user decisions, 2026-10-23)
**Amends:** `21-COACHED-ENGINE-DECISION.md` (Half 2, CONSEQUENCES 1 and 3)

This record exists so that a contributor reading
`21-COACHED-ENGINE-DECISION.md` alone does not re-introduce two Phase 21
assumptions that 22-CONTEXT.md invalidated: that a coached session has a
scored counterpart conversation, and that the FRESH leg is a new scenario
against the underlying type.

---

## DECISION

The coach layer is built in `lib/study-plan/coached/`, composed on top of
nothing in the engine, and is not a registered type. It has no counterpart,
produces no `InteractionReport`, and is guarded mechanically against reaching
any other kind of session.

---

## 1. Placement

The coach layer lives in `lib/study-plan/coached/`:
`coach-prompt.ts`, `coach-identity.ts`, `coach.ts`, `grade-attempt.ts`,
`moment-scoring.ts`, `moment-selection.ts`, `moment-ranking.ts`,
`evidence.ts` — exactly where `21-COACHED-ENGINE-DECISION.md` already put it.

It is NOT an `ENGINE_TYPES` entry. 21-12's registry-length guard (13) and
21-20's no-gate reasoning both still hold.

ROADMAP.md's Phase 22 entry said "A real coach system prompt under
`lib/engine/`". 22-CONTEXT.md ("Build it where the decision record already put
it") overrides that wording. Phase 22 modifies NOTHING under `lib/engine/`:
`git diff --name-only 59f6166 -- lib/engine/` must be empty at phase close.
This is what keeps 21-20's `not_gated_on` (18-05) reasoning true.

## 2. No counterpart (amends 21-COACHED-ENGINE-DECISION.md Half 2, CONSEQUENCES 1 and 3)

22-CONTEXT.md: "There is no counterpart in a coached session."

- A coached session no longer calls `/api/practice/session/start`,
  `/api/interaction/chat` or `/api/practice/session/finish`, and composes NO
  underlying type's `liveSystemPrompt`. The underlying type is read from the
  registry only for read-only context (type name, rubric dimensions mapping to
  the competency); the existing `ENGINE_IMPORT_CARVE_OUTS` entry
  `lib/study-plan/coached/` still covers that.
- A coached session produces NO `InteractionReport` and is not scored by the
  evaluator. CONSEQUENCE 1 of the 21 record is superseded.
- The coached/unaided distinction at read time (CONSEQUENCE 3) now lives on the
  contribution row itself: `source: "COACHED_SESSION"` plus the new
  `MasteryContribution.sourceCoachedSessionId`. `CoachedSession.reportId` is
  retained only for pre-Phase-22 rows; `recordLiveSessionContributions`'
  coached-skip guard stays, for those legacy rows.
- CONSEQUENCE 2 (no disengagement threshold) is unchanged. A coach does not
  walk out, and coached mode has no termination policy at all now.
- The FRESH leg is a SECOND real moment of the student's own (22-CONTEXT.md
  "Session shape"), not a generated scenario. `freshScenarioPrompt` becomes
  nullable and is no longer written. Thin evidence: one leg, told plainly.

## 3. Containment guard

Hard rule (22-CONTEXT.md): a coach must never appear in any other kind of
session.

Plan 22-08 builds `scripts/verify-coach-containment.ts`, asserting:

- (a) the reverse import closure of `lib/study-plan/coached/coach-prompt.ts`
  contains only `lib/study-plan/coached/**`, the coached route, and
  `scripts/verify-*`;
- (b) no file under `lib/engine/`, `app/api/interaction/`, `app/api/practice/`,
  `app/practice/`, `components/practice/` reaches it;
- (c) every buildable registered type's live system prompt is free of
  `COACH_LAYER_MARKER`;
- (d) `ENGINE_TYPES` still has 13 entries, none named "coach".

Each assertion carries a bite-proof (a deliberate violation that the guard must
catch).

## 4. Privacy scope

This extends the named widening in `21-PRIVACY-BOUNDARY.md` to coached mode.
Per-turn moment scoring and the coach conversation send to the model: the
student's OWN transcript turns, the counterpart line immediately preceding each,
and the student's spoken rework attempts.

- Assembly goes through `loadGenerationSources` (REQ-123's single
  ownership-scoped assembler). No coached module performs its own transcript
  query outside it, except the existing `s3Storage.getInterviewTranscript` read
  already in `runtime.ts`.
- Every transcript turn bound for a model call passes
  `prepareMomentsForGeneration` (`lib/study-plan/moment-boundary.ts`, "the ONLY
  path by which transcript text may reach a model call"; its policy scope
  already names coached-session generation). Moments altered by redaction are
  dropped, never sent.
- Residual: the student's live spoken attempts and diagnosis replies are new
  speech, not transcript. They go to the coach/grader the same way a live
  practice turn goes to the interviewer model.
- `lib/study-plan/generate.ts` stays frozen.

## 5. Scoring

The coach grades the reworked line against the competency. The contribution is
written at the model-graded weight class (the same class as a rewrite knowledge
check, `CHECK_MODEL_GRADED`), never the deterministic weight, and still strictly
below `LIVE_SESSION`. Reconciled in `lib/mastery/weights.ts` (22-09); no new
weight class. REQ-116's "at the coached weight, below unaided practice" remains
true but its mechanism changed.

## 6. Words-to-say

Gated carve-out in `assertTipSafe` (22-05): a demonstration is permitted only
after at least one attempt in the leg, at most one per leg, shown as a separate
labelled channel. The tip rail's "not words to say" stays true of the rail.

## 6b. Moment qualification

A moment qualifies when it is not a pleasantry, was scored, and evidences the
competency (`isQualifyingMoment`, 22-03). There is NO score cutoff, because
22-CONTEXT.md says "lowest-scored"; the lowest qualifying turn is always
selected. `MAX_REWORKABLE_SCORE` (3) is a preference only: a best moment above it
still runs, its score is recorded on `CoachedSession`, and the brief and coach
frame it as refinement. The path route places a coached step with this same
predicate (22-07 Task 3), so entry's 409 is reserved for the genuine
no-qualifying-turn case (only reachable if data changed after placement).

## 7. Soft cap

An advisory prompt instruction (thresholds in 22-10), recorded with the same
honesty as the header of `lib/study-plan/checks/generate.ts`: worth nothing
without a mechanical gate. A hard cap is the mechanical fix if it proves
necessary. Leave-and-resume is unaffected.

---

## REJECTED

- (a) Registering a coached type: same reason as Phase 21.
- (b) Putting the coach prompt under `lib/engine/`: would widen the surface the
  18-05 no-gate reasoning depends on and put the coach layer one import away
  from every type.
- (c) Keeping the FRESH leg as a coach-invented scenario: contradicts "the whole
  session stays on the student's actual previous work".
- (d) Keeping the evaluator `InteractionReport` as the score source: there is no
  scored conversation without a counterpart.
