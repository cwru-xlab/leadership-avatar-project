# Phase 22: Coached Mode - Context

**Gathered:** 2026-10-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Make a coached session recognizably coaching. Phase 21 shipped everything
around the coach — the path step, the runtime, the tip rail, the contribution
weight — and then `3893c39` reverted REQ-113/114/115 when browser UAT found
`CoachedSessionShell` starting an ordinary interview session with no coach
system prompt, because no coach prompt exists anywhere in `lib/`. This phase
builds the coach: its persona, its avatar, the moment it works on, and the frame
around the session.

Out of scope and already captured in ROADMAP.md's Phase 22 entry: knowledge-check
option generation, rewrite conversational context, plan-scoped practice entry,
back-link scroll restoration, mastery backfill, sidebar tabs for study plans and
paths.

</domain>

<decisions>
## Implementation Decisions

### Containment — the coach exists ONLY in coached sessions

**This is the user's strongest statement in the discussion and it is a hard
rule, not a preference:** a coach must never appear in any other kind of
session. Coaches exist only inside coached sessions inside learning paths, so
students can learn from their own previous work.

Much of this is already structurally defended and must stay that way:
- REQ-113 — a coached session can only be created from a path step.
- `lib/study-plan/coached/instance.ts` throws `NotReachableOutsideAPathError`
  on any other entry.
- `21-COACHED-ENGINE-DECISION.md` deliberately refuses coached mode a registry
  slug so no `/practice/{slug}` URL can reach it.

**What this phase ADDS to the containment surface:** a coach prompt. The
containment guarantee must extend to prompt composition — the coach layer must
be unreachable from any registered engine type's `liveSystemPrompt`, and that
needs its own mechanical guard, not an assumption that nobody will compose it
in. Treat "no engine type can acquire the coach layer" as an assertion to
write, in the spirit of the existing surface-count verifiers.

**The engine-registry decision does NOT need reversing.**
`21-COACHED-ENGINE-DECISION.md` already specifies the intended design: coached
mode "reuses the underlying type's prompts, with a coach layer composed on top
by `lib/study-plan/coached/`, not by a second registered type." That coach layer
was simply never built. Build it where the decision record already put it. Do
not add a `coached-practice` entry to `ENGINE_TYPES`; 21-12's registry-length
guard and 21-20's no-gate reasoning both still hold.

### What the coach is — the coach is the ONLY presence

There is no counterpart in a coached session. No interviewer, no investor, no
colleague. One person is in the room and they are a coach, working through the
student's recorded moment with them. The other party exists only as replayed
transcript text on screen — never as a live speaker, and never voiced by the
coach.

This is the single most structurally consequential decision in this phase. It
invalidates two assumptions baked into the Phase 21 runtime, both of which
assumed a counterpart:
1. The FRESH leg practiced a *new scenario against the underlying interaction
   type* — see "Session shape" below for its replacement.
2. Mastery contribution came from a real `InteractionReport` scored by the
   existing evaluator — see "Scoring" below for its replacement.

A planner must not quietly preserve either assumption to avoid rework.

### Coach behavior

- **Can the coach give words to say — YES, but only after the student has
  tried.** The student attempts the rework first. If they are still off, the
  coach may demonstrate one version, and the student then tries again in their
  own words.
  - This is a **gated carve-out in `lib/study-plan/coached/tips.ts`'s
    `assertTipSafe`, NOT its removal.** The no-parroting guarantee stands for
    the first attempt — that is the whole reason the rule exists. A
    demonstration before the student has produced anything is the failure mode
    the gate was written against.
  - The existing tip-rail copy ("These name a technique to apply — they are not
    words to say") is still true of the RAIL. If the coach's spoken
    demonstration is a different channel from the rail, say so in the UI rather
    than letting the rail's promise silently become false.

- **Directness — asks before telling.** When something is weak the coach asks
  the student to diagnose it first ("What were you trying to land there?"), then
  confirms or corrects. The user chose the most pedagogically effective and
  longest option knowingly; see the soft cap under "Session shape."

### Session shape

- **REPLAY leg:** rework one real recorded moment of the student's own.
- **FRESH leg:** a SECOND real moment of the student's own, showing the same
  competency. The whole session stays on the student's actual previous work —
  this is what "learn from their previous work" means concretely. The fresh leg
  is NOT a coach-invented scenario and NOT a role-played counterpart.
- **Thin evidence:** if a second qualifying moment does not exist, run the
  session with one and **tell the student plainly** that there was not a second
  moment worth using. Do not pad, do not invent one, do not silently run a
  one-leg session as though that were the design. This matches how 21-13 already
  tiers thin evidence elsewhere.
- **Ending — the coach decides it is done,** when both moments have been
  reworked acceptably. Session length therefore varies with how fast the student
  gets there.
- **Soft cap.** Past a threshold the coach is instructed to move toward closing
  rather than cutting off mid-sentence. **Recorded honestly: this is a prompt
  instruction, therefore advisory, not a guarantee** — the same class of thing
  as the advisory prompt in `lib/study-plan/checks/generate.ts`, which that
  module's header is careful to say is worth nothing without its mechanical
  gate. If unbounded sessions prove to be a real cost or UX problem, a hard cap
  is the fix, and it is a mechanical one. The existing "leave at any point,
  resume where you left it" escape is unaffected and stays.

### Scoring — the coach grades the rework

With no scored conversation, mastery moves on the coach's judgment of the
reworked line against the competency, recorded at the **lower model-graded
weight — the same class as a rewrite knowledge check**, never the
deterministic weight. Reconcile with `lib/mastery/weights.ts` and
`lib/study-plan/coached/contribution.ts` rather than inventing a new weight
class.

### Moment selection

The defect being fixed: `lib/study-plan/coached/runtime.ts` selects turn index
0, observed replaying "I'm ready to begin the interview."

- **Who picks: the system, with no student override.** The path is adaptive;
  letting a student route around their worst moment defeats it. Entry stays one
  click from the path step.
- **Ranking: lowest-scored on the competency — and the per-turn scores are to
  be BUILT.** This is new measurement work the user chose knowingly after being
  told the data does not exist. `SessionMoment` (`lib/study-plan/moments.ts:24`)
  carries `reportId`, `turnIndex`, `studentText`, `precedingAvatarText`,
  `timecode`, `linkedGrowthAreaTitles` and a caller-populated `competencyKeys` —
  **no score.** Scores today are session-level (`asScoreMap`). Expect this to be
  the largest and least-understood piece of the phase; it likely wants its own
  plan, and it is the first thing research should attack.
  - `linkedGrowthAreaTitles` (already computed, already timecode-matched to the
    evaluator's own flags) is the nearest existing signal and the obvious
    fallback if per-turn scoring proves unaffordable — but it is a fallback to
    be taken deliberately and recorded, not a quiet substitution.
- **Never select session-opening pleasantries.** "I'm ready to begin the
  interview", "Hi, nice to meet you" — the exact observed failure. Filter by
  position AND by content; position alone is not enough, because a student can
  open with something substantive and pleasantries can appear later.
- **Also fix at the source:** `lib/study-plan/next-step.ts` composes "has no
  scored evidence yet" (`:168`) with "This coached session reworks a moment
  where it showed" (`:185`) — self-contradictory, observed verbatim in the
  browser. The availability guard tests whether MOMENTS exist, not whether
  SCORED EVIDENCE does; they come from different sources.

### Presentation

- **The coach has a real video avatar.** A talking head consistent with the rest
  of the product, not the nameless text box that exists today — that text box is
  precisely what the user found incomprehensible.
  - 21-24 built text-only specifically to avoid touching `components/practice/`
    (21-12's isolation guard). That cost is now disclosed and rejected. The
    planner must choose, in writing, between editing `components/practice/` (and
    amending the guard deliberately) or building a second avatar mount. Do not
    pick one by accident.
- **The student picks their coach, once, from Settings,** with a sensible
  default so a student who never opens Settings still gets a coach. Coached
  mode has `setupSteps: None` by design and the path step must remain one click
  — a coach picker must never become a setup wizard in front of the session.
- **The student speaks their response** (push-to-talk, as in a real session).
  Delivery & presence is a competency that cannot be practiced by typing — a
  well-typed line does not prove the student can say it. This also means the
  coached session needs the vocal capture path, which bears on the
  avatar-mount decision above.
- **The replayed moment is shown as text on screen** while the coach discusses
  it, so the student can re-read it and compare their rework against the
  original verbatim. Not audio playback.
- **The student gets both a brief and a spoken objective:** a short card before
  entry naming the competency, the moment being reworked, what the session will
  ask of them and what it is worth — and the coach restates the objective in its
  own words when the session opens. The student consents to the work before the
  avatar starts talking.
- **The page must scroll.** Listed in the roadmap entry as defect 4 and trivially
  true; stated here so it is not dropped as too small to plan.

### Claude's Discretion

- Exact coach prompt wording, within the behavioral decisions above.
- The default coach avatar/voice choice.
- The brief card's layout and copy.
- The soft cap's threshold value.
- How the coach's reason for picking a moment is surfaced, if at all.

</decisions>

<specifics>
## Specific Ideas

- The user's framing of the whole phase: coached sessions exist "within the
  learning paths to allow students to learn from their previous work." Every
  decision above bends toward the student's own recorded work and away from
  invented content — the fresh leg, the moment selection, the on-screen verbatim
  replay all follow from it.
- The failure this phase answers was found by opening the product and reading
  the screen, not by a failing test. All 23 Phase 21 verifiers passed and remain
  correct — "the avatar behaves like a coach" is not a static assertion. Phase 22
  should expect its own gate to be human UAT, and should not mistake a green
  verifier suite for a working coach.

</specifics>

<deferred>
## Deferred Ideas

Already recorded in ROADMAP.md's Phase 22 entry and in STATE.md's Roadmap
Evolution note; repeated here so a planner reading only this file does not pull
them in:

- Four generated options for `PICK_BETTER_RESPONSE` — today
  `lib/study-plan/checks/types.ts:56` hard-codes exactly two candidates, and
  `generate.ts` requires `candidates[0]` to BE the student's verbatim line, so
  one option is always an obvious giveaway (capitalization included).
- Conversational context in `REWRITE_WEAK_LINE` prompts. **Note for whoever
  takes this:** `SessionMoment.precedingAvatarText` already exists and is
  already populated — the context is on the struct, just unused.
- A plan-scoped practice entry. `components/study-plan/PathPanel.tsx:104` links
  to a bare `/practice/{slug}` wizard with no plan context, tailoring, or brief.
- Back-link destinations and scroll restoration —
  `CoachedSessionShell.tsx:784` sends the student to `/mastery` and `/reports`
  from inside a coached session; study-plan children should return to
  `/study-plans/{planId}` at the prior scroll offset.
- Backfilling `MasteryContribution` from existing READY reports — 0 rows against
  72, recorded in `3893c39`, and the reason every competency currently reads
  NONE. **Until this is done, a ranking bug is indistinguishable from an
  empty-data artifact**, which is worth knowing while verifying Phase 22.
- Sidebar tabs and breakout views for study plans and paths. `config/site.ts:24`
  has four student nav entries; plans are reachable only via `/reports` and a
  path exists only as a panel nested inside one plan page.

</deferred>

---

*Phase: 22-coached-mode*
*Context gathered: 2026-10-23*
