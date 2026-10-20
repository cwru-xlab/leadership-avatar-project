# Coached Mode's Relationship to the Engine — Decision Record

**Plan:** 21-12
**Status:** DECIDED
**Authority cited by:** `scripts/verify-knowledge-check-surface.ts`'s
`ENGINE_IMPORT_CARVE_OUTS` (the single named exception permitting
`lib/study-plan/coached/` to import from `lib/engine/`)

This document exists because the planning constraint for this phase demands
that coached mode's engine relationship be **decided and justified in
writing**, not left to be inferred from whichever imports a later contributor
happens to write. A registered `coached-practice` engine type would look
"tidier" to someone skimming `lib/engine/registry.ts` in isolation — this
document is what stops that from happening without a deliberate, reviewed
reversal of the decision below.

---

## Investigation

### What `InteractionTypeConfig` requires of a registered type

(`lib/engine/types.ts`)

| Requirement | Coached mode has it? |
|---|---|
| `slug` / `name` / `description` | No — it has no identity in the type picker; see REJECTED below |
| `extraRubricDimensions` | Not its own — it inherits the underlying competency's interaction type's rubric |
| `prompts` (`liveSystemPrompt`, `evaluatorPrompt`, `buildEvaluationContext`) | Not its own — reuses the underlying type's prompts, with a coach layer composed on top by `lib/study-plan/coached/`, not by a second registered type |
| `limits` | Inherited from the underlying type |
| `terminationPolicy` | Inherited, with one deliberate difference recorded below (no disengagement threshold) |
| `visibleContext` | Inherited |
| `outcome` | Inherited |
| `timeBudget` | Inherited |
| `instance: { required, authoredInWizard }` | N/A — coached mode is never reached through `/practice/{slug}`, so "authored in wizard" has no meaning for it |
| `checkpointing` | Inherited (coached sessions are still live avatar sessions; client-driven checkpointing behaves identically) |
| `finishPendingFlip` | Inherited |
| `supportsRetry` | Inherited |
| `setupSteps` | None — coached mode has no setup wizard; it is entered from a path step, not `/practice/{slug}` |
| `postProcessScores` | Not declared for coached mode |

**Conclusion:** a coached session genuinely has the live-session primitives
(termination, visible context, outcome, time budget, checkpointing) because
it runs an actual conversation turn. It does **not** have, and does not need,
an identity in the type picker, a setup wizard, or any of the registration
machinery whose entire purpose is making a type reachable from
`/practice/{slug}`.

### What registering a type costs

Registering `coached-practice` (or any slug) in `ENGINE_TYPES` would, by
construction of `lib/engine/registry.ts` and REQ-60 ("adding a sixth
interaction type means adding one more entry to `ENGINE_TYPES` — nothing else
in the repo changes"):

- Appear in the type picker at `app/practice/[type]/page.tsx`.
- Become reachable at `app/practice/[type]/[instanceId]/page.tsx` by anyone
  who constructs the URL, regardless of whether they hold a coached path
  step.
- Gain `avatarMayEnd` / `avatarEndFloor` / disengagement semantics by default
  (every registered type carries a `TerminationPolicyConfig`).
- Show up in `scripts/verify-engine-surface-count.ts`'s and
  `scripts/verify-knowledge-check-surface.ts`'s `ENGINE_TYPES.length`
  assertions, which exist specifically to make a silent widening of the
  registry visible.

**Appearing in the picker ALONE would violate REQ-113** ("A coached session
can only be created from a path step — there is no code path from any normal
practice entry point that reaches it"). A registered-but-hidden type (e.g. one
excluded from the picker's rendered list by a client-side filter) is not a
fix — it is a surface that one routing change, one filter bug, or one direct
URL hit exposes. The only structural guarantee REQ-113 accepts is: the type is
never registered at all, so there is no slug for a URL to name.

---

## DECISION

**Coached mode reuses the engine's live session machinery but is NOT a
registered `ENGINE_TYPES` entry.**

It runs as a session over the competency's underlying interaction type — the
same type the original moment (being replayed) came from — with a coach layer
supplied entirely by `lib/study-plan/coached/`. The two halves, justified
separately:

### Half 1 — NOT registered

Registration is precisely the mechanism that makes a type reachable from the
practice picker (`app/practice/[type]/page.tsx`) and from
`app/practice/[type]/[instanceId]/page.tsx`. REQ-113 requires coached mode be
reachable **only** through a path step. The only way to make "only through a
path step" a structural guarantee rather than a convention is for there to be
no slug in `ENGINE_TYPES` a URL or a picker could ever point at. This is
exactly why `createCoachedSession` (Task 2) takes `pathStepId` as a required,
non-optional parameter with no standalone overload: the *function signature*
is the other half of this same guarantee, at the call-site level instead of
the registry level.

### Half 2 — REUSES the engine's live session machinery

A coached session **IS a live avatar conversation** — the student speaks
turns, the avatar responds, a transcript accumulates, and (per the
Consequences below) a normal `InteractionReport` is produced and scored by
the existing evaluator. Reimplementing session transport, transcript capture,
and evaluation for coached mode would fork the exact plumbing Phase 13 built
specifically to be shared across interaction types — the opposite of what
Phase 13 unified.

**Addressing the apparent contradiction with 21-06 head-on:** 21-06 decided
that knowledge checks "do NOT become a registered engine interaction type...
They live INSIDE the study-plan surface... This module therefore imports
NOTHING from the engine module tree." Read next to this plan's decision to
reuse engine machinery, the two can look like they disagree. They do not,
because **21-06's "no engine involvement" was written about knowledge
checks specifically** — a multiple-choice question, a fill-in-the-blank, a
pick-the-better-response, or a rewrite prompt has nothing in common with a
live avatar session. There is no transcript, no turn-taking, no termination
policy, no rubric to reuse; routing a static graded question through the
engine would drag in a session shell, a rubric schema, and a termination
policy that a knowledge check has no use for. A coached session is the
opposite case: it has every one of those things, because it is a session.
**Generalizing 21-06's "no engine involvement" into a phase-wide rule would
be a misreading of that decision's own stated scope**, and this document
exists in part to make sure a later reader does not make that generalization.
The two decisions are consistent: each module reuses exactly as much of the
engine as the thing it is actually building requires — none, for a
multiple-choice question; the live session machinery (not the registry), for
a coached conversation.

---

## CONSEQUENCES

1. **A coached session produces a normal `InteractionReport`, scored by the
   existing evaluator.** Nothing about coached mode's evaluation path is
   forked — the same evaluator that scores an unaided session scores a
   coached one. Its contribution to mastery is recorded at the
   `COACHED_SESSION` weight (`lib/mastery/weights.ts`'s
   `CONTRIBUTION_SOURCES`, read by 21-16), which is the mechanism that keeps
   a coached session from counting as unaided practice. The report itself
   carries no coached-specific flag; the distinction lives in the join
   described in point 3.

2. **Coached sessions enable NO disengagement threshold.** Decided: **NO** —
   a coach does not walk out. `lib/engine/disengagement.ts`'s threshold
   machinery exists to let an avatar end a session early when the model
   judges the student has disengaged from a graded scenario; a coached
   session is not that scenario. The coach's technique reminders are not a
   disengagement indicator, and the coached session's resolved termination
   policy does not carry one either (no `disengagementThreshold` is set for
   a coached run, regardless of what the underlying type declares for its
   own unaided sessions). This is why REQ-85's amendment — "REQ-85 forbids a
   DISENGAGEMENT indicator in a graded practice session specifically; it
   does not forbid in-session guidance in a separate, explicitly-coached
   mode" — is a **boundary clarification**, not a behaviour change: coached
   mode was never going to carry the thing REQ-85 forbids, because it
   carries no disengagement threshold at all. 21-20's no-gate reasoning for
   coached sessions depends on this record.

3. **A coached session's report must be distinguishable from an unaided one
   at read time, or mastery cannot weight them differently.** The mechanism:
   `CoachedSession.reportId` (written by `finishCoachedSession`, Task 2) is
   the join. 21-16 reads `CoachedSession` by `reportId` (or the inverse) to
   decide which `CONTRIBUTION_SOURCES` weight — `LIVE_SESSION` or
   `COACHED_SESSION` — applies to a given `InteractionReport`, rather than
   inferring it from anything on the report row itself.

---

## REJECTED

Three alternatives were considered and rejected, each because it would
undermine Half 1 or Half 2 above:

1. **Registering a `coached-practice` type in `ENGINE_TYPES`.** Rejected
   because registration is exactly the mechanism REQ-113 forbids being
   reachable through — see "Half 1" above. A registered-but-hidden type is a
   surface waiting for one routing change to expose it; the only durable
   guarantee is that no such slug exists.

2. **Adding a coach flag to `ResolvedSessionConfig`.** Rejected because it
   would make every consumer of `ResolvedSessionConfig` — the evaluator, the
   system-prompt builder, the termination policy, the report renderer — need
   to branch on it, turning one config shape into two silently-diverging
   ones. The coach layer composes on top of an unmodified resolved config
   from `lib/study-plan/coached/`, not inside the engine's own resolution
   step.

3. **Adding coaching to normal practice sessions.** This is the
   21-CONTEXT.md Deferred-list item ("Coaching inside normal practice
   sessions. Out of scope by the user's own design.") Rejected for this
   plan, and explicitly noted here: **adding it later is a GENUINE REQ-85
   conflict**, not the narrow boundary clarification this phase's amendment
   records, because a coaching affordance inside a graded session is
   exactly the kind of in-session signal REQ-85 was written to forbid. Doing
   so would require its own decision, not a reading of this one.
