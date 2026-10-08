# Phase 19: Deck-Led Pitch Family - Context

**Gathered:** 2026-10-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Four new deck-led TYPE records — funding request, product pitch, deck-led talk,
and a general deck pitch — playable alongside the existing investor
`pitch-deck`, each sharing the one Phase 14 deck capability (upload → slide
cursor → visible-context slice → soft timer), the one generic pre-session
wizard with its single camera-consent gate, the one evaluator, and the one
report page. Plus Pass 2 keyboard UAT for the surfaces Phases 18 and 19 add.

Locked by ROADMAP.md and not re-litigated here: one TYPE record per mode (never
one widened `pitch-deck` with a mode field); negotiation inputs ABSENT rather
than disabled or hidden in modes with no terms; a mechanical surface-count guard
proving no engine module, route, evaluator or report page was touched.

</domain>

<decisions>
## Implementation Decisions

### Picker presentation

- The Practice Pitches page stays TWO top-level cards: **Elevator pitch** and
  **With a deck**. The five deck modes are a sub-choice, not six flat siblings.
- "With a deck" **expands in place** on `app/practice/pitches/page.tsx` —
  no new route, no second screen, no nav/middleware wiring. Back behaves as it
  does today.
- Each deck-mode card must carry all four of:
  1. **Who you're pitching to** — an explicit listener line ("an investor", "a
     budget committee", "a prospective customer", "a conference audience").
     This is the primary differentiator.
  2. **What gets scored** — a short line naming the mode's distinctive
     judgement ("negotiation", "use of funds", "objection handling",
     "audience takeaway").
  3. **Time envelope** — keep today's clock chip, with per-mode ranges.
  4. **Whether it negotiates** — an explicit marker that only the investor mode
     ends in terms, so the absence of ask/equity elsewhere is understood before
     the wizard, not discovered inside it.
- The **general deck pitch is framed as a neutral practice run**: a plain
  rehearsal with a generic attentive listener and **no audience input at all** —
  the zero-setup option. It is deliberately NOT the "bring your own context"
  flexible mode.

### Per-mode wizard inputs

All mode-specific fields are **REQUIRED to start**, matching Phase 16's required
networking goal and Phase 14's required ask — the field exists because the mode
cannot be judged without it.

- **Funding request:** requested **amount** + **use of funds** (short "what it's
  for"). Equity is ABSENT as a concept, not zeroed — a grant or budget request
  gives up no ownership.
- **Product pitch:** a **buyer profile** (role, company type, what they care
  about) so the avatar objects from a real position.
- **Deck-led talk:** **audience** + the one **takeaway** they should leave with.
- **General deck pitch:** no mode-specific input. Deck upload and session length
  only.
- **Investor deck:** unchanged — the existing ask/equity step stays exactly as
  Phase 14 shipped it.

### The listener per mode

- **Fixed role per mode**, declared in each TYPE record's prompt: budget/grant
  reviewer, prospective buyer, conference attendee, attentive generic listener.
  The student picks the avatar's face and voice, not the role. No per-mode
  persona-distillation path, no personality step.
- **Pushback is mode-appropriate and fixed**, not student-adjustable: the
  funding reviewer probes feasibility and spend; the buyer raises objections and
  price; the audience asks clarifying questions; the general listener is mildly
  curious. No difficulty control on any deck mode.
- **Per-mode session-length envelopes.** A talk or product pitch is shorter than
  an investor meeting; each mode declares its own range, and Phase 14's
  slide-count proposal plus student adjustment still operate inside it. The
  investor deck keeps 20–30 minutes.

### Walk-out: OFF for every deck mode

**Decision (2026-10-08, user):** no deck mode walks out — including the existing
investor `pitch-deck`. The four new modes declare **no `disengagementThreshold`**
(explicitly permitted by Phase 18 Success Criterion 5: a type declaring no
threshold behaves exactly as it does today), and Phase 19 also turns the
investor deck's walk-out **off**.

**`pitch-elevator` KEEPS its walk-out** (confirmed by the user 2026-10-08 during
planning). The decision is scoped to DECK modes only: the elevator is not a deck,
Phase 14 Success Criterion 1 explicitly requires a tedious elevator pitch to be
able to end early as a recorded failure, and `ELEVATOR_DISENGAGEMENT_THRESHOLD`
was deliberately tuned to 0.5 in commit `524544e`. After Phase 19, the elevator
is the only type that opts in — which keeps Phase 18's pending human UAT
runnable.

This is a deliberate **amendment to Phase 18**, which named `pitch-deck`'s floor
in REQ-84 and currently ships `DECK_DISENGAGEMENT_THRESHOLD = 0.75` in
`lib/pitch/deck-type.ts`, asserted by `scripts/verify-disengagement-termination.ts`.
Planning must treat this as a scoped revision with a roadmap note, not a silent
regression:

- The Phase 18 mechanism itself stays intact and is not deleted — only the deck
  types stop opting in.
- `scripts/verify-disengagement-termination.ts` currently asserts "pitch-deck
  has a numeric disengagement threshold" and "pitch-deck has a real four-turn
  avatar floor". Those assertions must be deliberately updated to the new
  intent, not weakened or deleted silently.
- The roadmap's Phase 19 dependency line ("each inheriting the walk-out from
  Phase 18") no longer holds and needs amending.

### Rubric and outcome per mode

- **Four shared deck dimensions + one or more per mode.** `deck_structure`,
  `deck_text_density`, `deck_visual_quality` and `slide_speech_correlation` are
  shared by all five modes — they judge the deck, not the audience.
  `negotiation` stays **investor-only**.
- Distinctive scored dimensions:
  - **Funding request — TWO:** use-of-funds credibility, and feasibility of the
    amount asked.
  - **Product pitch:** objection handling.
  - **Deck-led talk — TWO:** audience-takeaway clarity, and holding the room
    (pacing and engagement across the talk, beyond the shared vocal scores).
  - **General deck pitch:** none. The four shared deck dimensions plus the
    standard rubric only.
- **A verdict per mode** as the outcome record, replacing the investor's ask vs
  settled vs fair band:
  - **Funding:** amount requested vs what the reviewer would fund, and why.
  - **Product:** the buyer's position at the close (interested / needs more /
    declined) with the blocking objection.
  - **Talk:** the takeaway the audience actually left with vs the declared one.
  - **General:** no outcome panel.
- **Every new mode's outcome is DESCRIPTIVE and UNSCORED** — rendered through
  the existing `ReportChrome` extras slot, feeding no score. This follows Phase
  15's unscored outcome record and Phase 12's scored-vs-descriptive discipline:
  a tough reviewer must not cost a well-run pitch points.

### Claude's Discretion

- Exact wording of every card line, prompt and rubric description.
- The numeric per-mode length ranges, and how the slide-count proposal maps into
  each.
- Expand/collapse mechanics and animation for the "With a deck" sub-choice.
- How the per-mode verdict components are factored inside the extras slot (one
  component with a mode discriminator vs four small ones).
- Which existing avatars are offered per mode.
- How the surface-count guard is structured, modeled on Phase 16's.

</decisions>

<specifics>
## Specific Ideas

- The general mode is the zero-setup one on purpose: "upload and go". Resist the
  urge to give it an audience field or a distinctive dimension.
- Negotiation absence must be legible on the PICKER, before the student commits
  — the user chose the "whether it negotiates" card marker specifically so the
  missing ask/equity step is never a surprise.
- Phase 18's walk-out is being switched off for decks because it does not belong
  in a pitch rehearsal, not because the mechanism is wrong — the user wants it
  applied where hostility is the point (see Deferred Ideas).

</specifics>

<deferred>
## Deferred Ideas

- **Walk-outs in Difficult Conversations (Phase 15 types), triggered by failing
  to control the avatar's emotions or hostility — e.g. the student says
  something offensive.** Raised 2026-10-08 while deciding deck walk-outs. This
  is the user's intended home for the Phase 18 mechanism and is its own phase,
  not Phase 19 work. Worth adding to the roadmap backlog explicitly.
- Student-selectable difficulty / personality for deck modes — rejected for this
  phase (fixed per-mode pushback), could return later.
- A "bring your own context" flexible deck mode with a free-text audience field
  — considered and rejected as the general mode's framing; it is a different
  mode, not this one.

</deferred>

---

*Phase: 19-deck-led-pitch-family*
*Context gathered: 2026-10-08*
