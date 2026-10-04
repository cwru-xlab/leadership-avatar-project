# Phase 16: Networking Practice - Context

**Gathered:** 2026-10-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Ship the `networking` interaction type — today a `route: null`,
`availability: "coming-soon"` tile in `lib/interactions/index.ts:65-73` — as a
Phase 13 engine TYPE record plus prompts, with a curated set of built-in
characters and a path for bringing in a described real person.

Inside the boundary:
- The `networking` TYPE record: rubric dimensions, prompts, outcome record,
  termination policy, limits.
- Four to six built-in characters as code records.
- The brought-in-person path, reusing Phase 8's
  `/api/interview/persona/distill` rather than adding a second distillation.
- An AI-generated-person path that produces editable description text feeding
  that same distiller.
- Wizard steps: character-or-bring-your-own, the required goal field, the
  avatar/voice pick, and the attestation gate.
- Networking-specific report surfaces: the three extra dimensions and the
  outcome record.

NOT in scope: engine primitives themselves (Phase 13 builds
`terminationPolicy`, the visible-context slice, the outcome record and the time
budget — Phase 16 only configures them), the networking SETTING concept (see
Deferred Ideas), publishing personas to other students, and any second
distillation endpoint.

</domain>

<decisions>
## Implementation Decisions

### Persona input modes

- **Three sources, one distiller.** LinkedIn paste, the student's own writing,
  and AI-generated text all converge on Phase 8's existing
  `/api/interview/persona/distill`. No second distillation path — this is
  explicit in the roadmap's "Depends on" line and holds.
- **AI generation is generate → show → edit → distill.** The student supplies
  rough hints ("a VP of marketing at a mid-size CPG company, friendly but
  busy"); the app generates a full person description; the generated text is
  shown in an **editable** box the student can tweak; the edited text is what
  gets distilled. Rejected: a paste box that merely accepts text generated
  elsewhere (no in-app generation), and generate-then-distill with no
  visibility (the student cannot correct an invented detail they dislike).
  - Consequence: the generation step is a new, separate model call from the
    distiller. Its output is description text, NOT a persona sentence — the
    distiller still does the persona shaping.
- **No networking setting in this phase.** The avatar's persona is the only
  variable; the type does not model a conference reception vs. a scheduled
  coffee chat. Deliberately deferred, not written off — see Deferred Ideas.
- **The student's own side is one short typed goal.** No resume upload on this
  type. One text field: what the student wants out of the conversation ("a
  referral into their team", "advice on breaking into consulting"). Rejected:
  reusing the interview resume step (handing the avatar a resume up front
  defeats the self-introduction, which is the point), and no student input at
  all (the rapport rubric needs something to measure against).
- **The goal is REQUIRED to start.** No goal, no session. Every networking
  report therefore carries all seven dimensions with no conditional
  not-measured state for Goal Progress. Rejected: optional with a
  not-measured state, and optional with the dimension dropped per session.

### Goal visibility

- **The goal is HIDDEN from the avatar.** It is evaluator-only, withheld via
  Phase 13's per-turn visible-context slice. The student must actually steer
  the conversation toward the ask; the report judges whether they got there.
  Rejected: visible to the avatar (simpler prompt assembly, but the avatar
  pre-empts the student's work and Goal Progress becomes unmeasurable), and
  telling the avatar that *a* goal exists without saying what.
- This is the second concrete use of the visible-context slice primitive after
  Phase 14's slide high-water mark — worth noting for Phase 13's planner as
  evidence the primitive is general, not slide bookkeeping.

### Third-party text retention

- **The raw paste stays EPHEMERAL.** The existing contract at
  `app/api/interview/persona/distill/route.ts:62-70` — the pasted text is used
  for exactly one non-streaming model call, never written to Prisma, S3 or any
  cache, never logged beyond lengths — is PRESERVED unchanged. Phase 16 adds no
  raw-paste storage surface. Rejected: persisting the raw paste privately, and
  opt-in "save this person" raw retention.
  - **Roadmap criterion 3 is therefore read as being about the DISTILLED
    persona, not the raw paste.** Its "Pasted third-party text is stored
    privately and never appears in another student's session" is satisfied by:
    the raw text is stored nowhere at all, and the distilled persona is
    owner-scoped and never publishable. Planner should treat the criterion this
    way rather than as a mandate to store the paste.
- **The distilled persona becomes a saved private INSTANCE.** The ~600-char
  distilled sentence (`MAX_PERSONA_LENGTH = 600`) plus its `displayName` is
  saved as a Phase 13 INSTANCE record, owner-scoped, on the `CaseStudy`
  precedent — so a student can relaunch against the same person without
  re-pasting. **Never publishable**, unlike Phase 9/15 scenarios: it describes a
  real person. The publish affordance must be absent, not merely defaulted off.
  Rejected: no reuse at all, and reuse only via a "practice again" link on the
  report page.
- **An explicit attestation checkbox gates the paste.** The student must tick an
  attestation before pasted third-party text is accepted.
- **The attestation is RECORDED, following the Phase 10 camera-consent
  pattern** — persisted with user, timestamp and the version of the wording
  shown — and **enforced server-side** before distillation runs. Rejected: a
  per-request flag with nothing persisted, a client-only gate, and a
  once-per-student acknowledgement that later sessions skip.
  - The attestation gate applies to the brought-in-person path only. Built-in
    characters are fictional and need no attestation.

### Default characters

- **Named fictional people with backstories.** Each is a concrete invented
  person — name, employer, seniority, manner, years in ("Maria Chen, VP of
  Engineering at a mid-size fintech, warm but time-pressed, twelve years in").
  Rejected: unnamed role archetypes, and archetypes that invent a name at
  runtime (the name would differ run to run).
- **Four to six of them, varied by SENIORITY AND FIELD** — e.g. a VC, a
  recruiter, a peer, an executive. Breadth of situation is the organizing axis,
  not a difficulty ladder. Rejected: four to six spanning difficulty, and a
  deliberately minimal three.
- **They live as TypeScript code records**, declared in the Phase 13 config
  layer alongside the `networking` TYPE record — type-checked, reviewable in a
  PR, no migration and no seed script. This follows 13-CONTEXT's "config lives
  as TypeScript records in code" decision. A student's brought-in person is the
  only INSTANCE data on this type. Rejected: seeding them as S3 INSTANCE
  records.
- **The student picks the avatar/voice, as in the interview wizard.** Characters
  supply the persona; the existing Phase 2 catalog card-grid picker supplies the
  face and voice. No avatar id is pinned in a character record, so no
  pinned-id-went-INACTIVE fallback is needed. Rejected: each character pinning
  its own avatar, and pinned-with-override.
- Playable with no input at all beyond the required goal and the avatar pick —
  criterion 2's "no input" means no persona authoring, not a zero-step wizard.

### Rubric and outcome

- **Seven dimensions: the shared four plus three type-declared extras.**
  Phase 13's spine (Visual, Vocal, Content, Behavioral — never type-optional,
  full four-state handling) plus:
  - **Rapport** — did a real two-way connection form.
  - **Self-Introduction** — was who the student is, and what they want, clear
    and concise.
  - **Goal Progress** — how far the student got toward the goal the avatar
    never saw.
  Rejected: Rapport alone with self-introduction folded into Content, and
  Rapport + Self-Introduction without Goal Progress.
- **A type-declared outcome record is persisted**, using Phase 13's outcome
  primitive, carrying:
  - whether the student actually **made the ask**, and how it landed —
    agreed / deflected / declined / never asked;
  - what **common ground** was found.
  This is concrete, pointable feedback distinct from the 1-5 scores. Rejected: a
  minimal ask-outcome-only record, and no outcome record.
- **The avatar MAY end the session early.** Networking uses Phase 13's
  `terminationPolicy` with avatar-initiated termination and a recorded reason: a
  conversation handled badly ends with the character disengaging, surfaced on
  the report as feedback rather than as a crash. Rejected: student-only
  termination, and making walk-away a per-character flag.
  - **A floor is required** so disengagement cannot fire in the opening seconds.
    Phase 14's `pitch-elevator` declares an avatar-end floor (14-02); networking
    should use the same engine knob rather than inventing a second mechanism.

### Claude's Discretion

- Prompt wording for all of: the `networking` TYPE's live avatar prompt, the
  evaluator prompt's three extra dimensions, and the new person-generation
  prompt.
- The specific four-to-six characters — their names, employers, fields and
  manner — subject to the seniority-and-field spread above.
- Wizard step ORDER and how the character-vs-bring-your-own branch is presented
  (two cards, a toggle, a tabbed step).
- Hint-field shape for AI generation (one free-text box vs. a few structured
  fields) and the generated description's length.
- Where the networking type's modules live, and whether the generation call is
  its own route or an option on an existing one — provided the distillation
  itself stays the Phase 8 route.
- Exact attestation wording, and where the recorded attestation lives relative
  to the Phase 10 consent record (same table/shape vs. a sibling).
- How the outcome record renders on the report page.
- Session length / time budget default for the type.

</decisions>

<specifics>
## Specific Ideas

- **The hidden goal is the design centerpiece.** Everything else follows from
  it: the goal is required so Goal Progress always scores, the avatar never sees
  it so the student has to earn it, and the outcome record says plainly whether
  the ask was ever made. A networking report that shows a strong Rapport score
  next to "never asked" is exactly the feedback this type exists to give.
- **The raw paste must stay unstored.** The user chose the ephemeral posture
  deliberately over two storage options. The distill route's existing
  retention comment is a contract, not a note — do not relax it to enable
  persona reuse, because reuse is served by saving the DISTILLED sentence.
- **A saved persona of a real person is private forever.** It is not a Phase 9
  scenario with publishing defaulted off; the publish affordance should not
  exist on this instance kind at all.
- Networking is the second type to need the visible-context slice (after the
  pitch deck's high-water mark) and the second to need avatar-initiated
  termination (after the tedious elevator pitch). Both are Phase 13 primitives
  being configured, not extended — if either needs engine code changed, that is
  a signal worth raising, per 13-CONTEXT's own success test.
- Reusing the interview avatar picker rather than pinning avatars keeps this
  type free of the "pinned avatar went INACTIVE upstream" failure mode that
  Phase 2's catalog filtering exists to prevent.

</specifics>

<deferred>
## Deferred Ideas

- **Networking SETTING as a wizard step** — conference reception, alumni mixer,
  scheduled coffee chat, cold approach at a career fair, each with its own
  prompt clause for interruptions, time pressure and formality. The user
  explicitly deferred this as "a possible step for the future" rather than
  rejecting it, so the TYPE record and prompt assembly should be written so a
  setting clause could be composed in later without restructuring. Not built
  now.
- **Difficulty as a character axis** — the four-to-six characters span seniority
  and field, not difficulty. A difficulty ladder (eager alum who carries the
  conversation → guarded executive who gives you two sentences) was considered
  and not chosen; it remains available as a later expansion of the character
  set, which is additive since characters are code records.
- **Publishing a brought-in persona to other students** — ruled out on purpose
  for real-person personas. If a future phase wants shareable *fictional*
  networking characters beyond the built-in set, that is its own phase and would
  need the real-vs-fictional distinction enforced, not assumed.

</deferred>

---

*Phase: 16-networking-practice*
*Context gathered: 2026-10-03*
