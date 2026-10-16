# Phase 21: Adaptive Mastery Path - Context

**Gathered:** 2026-10-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Grow study plans from a static post-session artifact into a tailored improvement
path. The system measures what a student has and has not mastered, then
generates the next step aimed at that specific gap — knowledge checks between
live sessions, and a coached practice mode where the avatar helps the student
rework moments they previously handled poorly.

Fixed from ROADMAP.md. Discussion below clarifies HOW, never WHETHER to add more.

</domain>

<decisions>
## Implementation Decisions

### Mastery model

- **A separate competency model**, sitting above the per-type rubrics, with each
  session's scored dimensions mapping up into it. Not per-interaction-type silos
  — a student gets one coherent view across interview, pitch, networking and
  difficult-conversation.
- **The competency list is DERIVED from existing rubric dimensions**, not
  authored fresh. Collect what the engine already scores across all types and
  group it. This keeps the phase unblocked on faculty input and grounded in what
  is actually measured today.
- **Displayed as a percentage plus a per-objective breakdown** — an overall
  figure and a per-competency figure, the shape fizzylemon uses.
- **Low evidence is SHOWN with the thinness flagged**, not withheld. A
  competency backed by two sessions still displays, with an explicit indication
  of how little evidence sits behind it. Do not silently present a thin number
  as if it were well-evidenced.
- **Both live sessions and knowledge checks move mastery.** Mastery is not
  live-session-only.
- **Mastery is BOTH lifetime and current.** A durable record accumulating across
  every session and study plan, alongside a current-window figure reflecting
  recent form. Two figures for the same competency — labelling must make the
  distinction obvious or it will confuse.

### Knowledge checks

- **All four formats ship:** multiple choice, fill in the blank, pick the better
  response, and rewrite a weak line.
- **They live INSIDE the study-plan surface** (`lib/study-plan/`,
  `app/api/study-plans/`) as steps in the path. They do NOT become a registered
  engine interaction type. Smallest footprint; no engine involvement.
- **Content is generated from the student's own session moments** — real
  transcript moments and the gaps their report identified. Not a generic
  authored bank. This is the "learn from specific instances" ask.
- **Weighting:** all formats move mastery, but **model-graded rewrites count
  for less** than the deterministically-graded formats.
- **Guardrails the user named as mattering most:**
  - **Never misquote the student.** A question quoting the student must
    reproduce what they actually said, verbatim, with its originating moment —
    never a model paraphrase. Mechanically checkable against the stored
    transcript, and should be.
  - **The student can contest a grading.** A way to flag a wrong mark, which
    also surfaces bad generated questions instead of letting them quietly
    damage mastery.

### Coached practice mode

- **Coaching is its own instance, nested within study plans.** In the user's
  words: *"not accessible through typical practice modes. so it's not like
  you're adding a coach to an interview, it's like a separate mode where the
  avatar is your coach and you practice improving upon situations where you
  previously didn't perform as well as you could."*
- **Normal practice sessions are untouched.** No coaching appears in them.
- **Structure: replay first, then fresh.** The coach sets up the actual moment
  from the student's transcript to rework, then presents a new situation
  exercising the same competency — learn it, then prove it transfers.
- **Tips are TECHNIQUE REMINDERS ONLY.** Name the skill; never script the
  words. The student's words stay theirs, which is what lets a coached session
  evidence anything at all.
- **Coached sessions DO move mastery, weighted below unaided practice.**

### Path progression

- **Paths are a CHILD of the study-plan object**, not a global queue. Each study
  plan has its own path; separate paths are reached through their own associated
  study plan.
- **Bounded at 5-10 steps**, chosen as the most necessary and applicable to that
  study plan, aimed at improving the student's immediate behaviour.
- **A new study plan generates a NEW path** applicable to that moment in time.
  Old paths are **not discarded and not carried forward** — they remain
  accessible through the study plan that owns them.
- **"What's next" targets the weakest competency first.** Deterministic and
  explainable.
- **Duolingo mechanics IN SCOPE: levels / progression per skill, and
  daily/weekly goals.**
- **Duolingo mechanics explicitly OUT: streaks and unlocking.** Not selected.
  Do not add them.

### REQ-85 amendment — REQUIRED, and must follow the Phase 20 precedent

Phase 18 locked REQ-85: no meter, indicator, or warning appears anywhere in the
session shell during a session, because a visible signal changes behaviour and
destroys the realism.

The user initially flagged this as a conflict, then clarified that coaching is a
separate mode never present in normal practice — which means **there is no
actual conflict**. Asked whether an amendment was still needed given that, the
user chose to **amend anyway, narrowly**, so the boundary is explicit in writing
rather than resting on an unwritten "coaching is a different mode" assumption.

**The amendment to record:** REQ-85 forbids a DISENGAGEMENT indicator in a
graded practice session specifically. It does not forbid in-session guidance in
a separate, explicitly-coached mode.

**How to record it — this is a hard constraint.** `18-VALIDATION.md` carries
`status: awaiting-human-uat` with all five Success Criteria `PENDING`, and
Phase 18's human UAT (18-05) has not run. Do **NOT** edit that file's verdicts,
frontmatter, or requirement checklist. Follow the precedent Phase 20 set when it
amended Phase 18's SC5: write the amendment as a **revision handoff section** in
this phase's own validation record, for Phase 18's closer to collect. See
`20-04-SUMMARY.md` and the Phase 18 handoff section in Phase 20's validation
plan for the exact shape.

### Claude's Discretion

- The exact derivation of the competency set from existing rubric dimensions,
  and the mapping from each type's scored dimensions up into it.
- The evidence threshold at which a mastery figure stops being "thin", and how
  thinness is presented. Phase 10's coverage handling and Phase 12's thin
  visual-data handling are the precedents.
- Relative weighting of deterministic formats vs model-graded rewrites, and of
  coached vs unaided sessions — the ordering is locked, the numbers are not.
- Level thresholds and what a daily/weekly goal defaults to.
- How the lifetime and current mastery figures are labelled and laid out.

</decisions>

<specifics>
## Specific Ideas

- **Competitor reference:** fizzylemon (`fizzylemonai.com/how-it-works`, read
  2026-10-16). What is worth borrowing is its mastery presentation — an overall
  percentage plus a per-objective breakdown ("Structure feedback effectively:
  90%") derived from cited evidence in the learner's own interactions.
- **Two findings from that research correct the brief, and planning must not
  re-derive them:**
  - Their "coaching sessions" are a **pre-recorded video**, not live speaking.
    This app's live avatar conversation is already ahead. The gap was never the
    live avatar.
  - They have **no adaptive path at all** — journeys are assembled by hand, with
    no skill tree, streaks, or levels, and no disclosed mechanism for generating
    a session from prior performance. **The path in this phase is a
    differentiator, not parity work.** Do not plan it as catch-up.
- The user's framing of coached mode, verbatim: *"you practice improving upon
  situations where you previously didn't perform as well as you could."*
- The user's framing of path scope, verbatim: *"it should highlight 5-10 steps
  that are most necessary and applicable to the associated study plan to improve
  the user's immediate behavior. then, if they do more sessions and create
  another study plan, it will generate a new path that is applicable to that
  moment in time."*

</specifics>

<deferred>
## Deferred Ideas

- **Streaks and unlocking** — considered and explicitly NOT selected. Recorded
  so a future phase does not reintroduce them assuming they were an oversight.
- **A faculty-authored competency framework.** The list ships derived from
  existing rubrics. If Weatherhead faculty later author a deliberate framework,
  replacing the derived set is a separate piece of work — worth structuring the
  derived set so that replacement does not mean rework.
- **An authored question bank.** Checks are generated from the student's own
  sessions. A curated human-written pool tagged by competency was discussed as
  an alternative and not chosen.
- **Coaching inside normal practice sessions.** Out of scope by the user's own
  design. Adding it later would be a genuine REQ-85 conflict, not the narrow
  boundary clarification this phase records — treat it as requiring its own
  decision.

</deferred>

<open_questions>
## Open — NOT decided, flag before planning

- **Milestone placement is unresolved.** `/gsd:add-phase` appended Phase 21 to
  **v1.1 — Consequence & Deck Breadth**, whose theme it does not share and which
  is mid-sign-off with three human UAT gates still open (18-05, 19-11, 20-07).
  This phase fits a **v1.2** theme far better. Settle before planning; moving it
  later costs a renumber. Recorded in STATE.md's Roadmap Evolution.
- **This phase is large.** Four substantial capabilities — a competency model, a
  knowledge-check system with four formats, a coached practice mode, and a path
  engine. Planning should expect a high plan count, or a split, rather than
  forcing it into a normal-sized phase.

</open_questions>

---

*Phase: 21-adaptive-mastery-path*
*Context gathered: 2026-10-16*
