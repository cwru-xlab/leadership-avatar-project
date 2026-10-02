# Phase 14: Practice Pitches - Context

**Gathered:** 2026-10-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Two pitch sublayers running on the Phase 13 one-on-one conversation engine:

1. **Elevator pitch** — a strict 30-60 second spoken pitch with no attached
   document, judged on concision and on whether the student found common ground
   with this specific listener before pitching, followed by engagement-scaled
   follow-up questions.
2. **Investor pitch deck** — a timed session (20-30 min envelope) where the
   student clicks through a deck they uploaded in advance while the avatar sees
   only the slides shown so far, and negotiates price and equity.

Both ship as engine config records plus prompts — no new session, finish,
evaluator or report infrastructure. Difficult conversations (Phase 15) and
networking (Phase 16) are out of scope.

**Scope change made during this discussion:** Google Slides import is CUT. The
roadmap's 2026-10-02 scope note and Success Criterion 2 both record all three
formats (PDF, PPTX, Google Slides) as a deliberate user decision; the user
reversed that here and dropped Google Slides **permanently** — not deferred.
Phase 14 accepts **PDF and PPTX only**. The Drive OAuth scope, token storage and
Drive API read described in the roadmap are therefore not built. ROADMAP.md must
be amended to match.

</domain>

<decisions>
## Implementation Decisions

### Elevator pitch framing
- **What is pitched:** free text, typed by the student in the pre-session wizard
  ("what are you pitching?"). No category list, no catalog of pitch subjects —
  product, startup, or themselves all arrive as the same free-text field and are
  injected into the avatar's session-constant prompt.
- **Listener knowledge — three levels, student-selected at setup:**
  1. **Completely blind** — the avatar's persona (role, interests, priorities) is
     hidden; the student must discover it in conversation.
  2. **Name and role only** — e.g. "Dana Reyes, VP Ops at a logistics firm";
     interests still must be discovered.
  3. **Full profile shown** — the student reads the persona beforehand.
  This is a student-facing choice in the wizard, NOT derived from Phase 8's
  difficulty parameter and NOT a property of the scenario record.
- **Timing:** visible timer with a **soft** cutoff — past 60 seconds the avatar
  begins showing impatience and may interrupt in dialogue, but nothing hard-stops
  the student's turn. Behavior is the enforcement, not a cutoff.
- **Timer visibility:** the student can hide the timer **mid-session** (collapse
  it) for a more realistic experience. Visible by default; the toggle lives in the
  session, not only in the wizard.
- **Follow-up phase:** engagement-scaled and open-ended. No fixed count and no
  fixed duration — a strong pitch earns several probing follow-ups, a tedious one
  earns a polite early exit.

### Avatar disengagement and early end
- **Signalling:** in dialogue only. Shorter, flatter replies; "so what's the ask?".
  No engagement meter, no gauge, no UI indicator — the student must read the
  person. (Explicitly rejected: a visible engagement meter, and an explicit
  verbal "I've got about a minute here" warning beat.)
- **Trigger:** the avatar's own judgment, licensed in the prompt, **gated by a
  floor** — it may never end before a minimum has happened (the pitch plus at
  least one exchange) so every session yields gradeable material. Not
  engine-side behavioral thresholds.
- **Report presentation:** both of —
  - a named outcome banner ("The listener disengaged and ended the conversation")
    with the specific reasons and the timecode where interest dropped, AND
  - every rubric dimension still scored on what did happen. No zeroing, no
    rendering the report as an error or crash.
- **Scoring interaction:** an early end **caps the discovery/tailoring
  dimension** — the walk-out is direct evidence about that dimension, so it
  cannot score above a ceiling. Other dimensions are unaffected.

### Deck intake (PDF + PPTX only)
- Google Slides: cut permanently (see Phase Boundary). No Drive OAuth scope, no
  stored Drive tokens, no Drive API read. A student with a Slides deck exports to
  PDF.
- **Validation: minimum only.** Confirm it is a genuine PDF or PPTX within the
  size limit and that pages/slides extract. Do **not** reject on page shape
  (portrait vs landscape) or slide count. A portrait document that parses is
  accepted.
- **Rejection message:** specific reason plus the fix, naming what failed and the
  next action (e.g. "this file isn't a readable PDF — re-export and try again").
  Not a generic failure. No "start without a deck" escape hatch and no soft
  per-slide warning tier.
- **Slide rendering:** **server-rendered images.** Each slide is rasterized
  server-side to a privately stored image and served to the student's in-session
  viewer. Same path for PDF and PPTX. Per-slide extracted text is what reaches
  the avatar's context.

### Live deck session
- **Context gating — high-water mark.** The avatar's context contains every slide
  the student has ever shown, not just slides 1..current. Navigating back to
  slide 3 after reaching slide 7 does not un-show 4-7 — the investor already saw
  them. Un-shown slides (beyond the high-water mark) never enter context.
- **Controls:** next/back plus a thumbnail strip for jumping. Jumping forward
  reveals the skipped slides to the avatar as shown (they advance the high-water
  mark). Backward jumps are free.
- **Negotiation target — both:** the student declares their ask (price and
  equity) up front per the brief's "be clear about what you want from the
  investor", AND the configured scenario carries a hidden fair-value band. The
  report shows **ask vs. settled vs. fair**.
- **Time envelope — soft.** The 20-30 minute budget is guidance. If it runs out
  mid-pitch the student may continue; the overrun is noted in the report. No hard
  finish, no in-character meeting close that ends the session.
- **Session length:** derived from slide count within the 20-30 minute envelope as
  a **proposal**, which the student can adjust before starting.
- **Deck scoring:** all three of —
  - deck-only dimensions for structure and slide text density, scored from the
    extracted deck;
  - slide/speech correlation — whether the spoken content tracked the slide on
    screen (the brief's "topical discussion should correlate with the slides");
  - **visual review of the rendered slide images** by the evaluator, so
    "unstructured/poor-looking slides" is judged on appearance, not only on word
    counts. This makes the rendered images an evaluator input, not just a
    student-facing asset.

### Rubric dimensions declared in config
- Elevator pitch carries **"listener discovery & tailoring" as its own rubric
  dimension**, separate from concision and delivery, so a student can see which
  half they failed. It is scored at all three knowledge levels (including full
  profile).
- Visual, vocal and body metrics from Phases 10 and 12 arrive through the engine
  with no per-type wiring (Phase 13 criterion 4) — not re-decided here.

### Claude's Discretion
- Exact wording of the avatar's disengagement dialogue cues and the prompt
  language that licenses an early end.
- The precise shape of the "floor" before an early end is permitted.
- Slide image format, resolution and private storage key scheme.
- PPTX → per-slide text and image conversion mechanics.
- How the ask/settled/fair triple is laid out on the report.
- Thumbnail strip layout and how the high-water mark is indicated (if at all) in
  the student's viewer.
- Concrete text-density and structure thresholds for deck scoring.

</decisions>

<specifics>
## Specific Ideas

- The elevator pitch's reward model is the brief's, verbatim in intent: the
  student is rewarded for *quickly getting to know the other person*, finding
  common ground, and then relating the pitch to that person's specific interests
  — selling to that person, not selling the product in general.
- Disengagement must feel like reading a room, not reading a gauge. The decision
  against any engagement meter was explicit.
- An early end is a *recorded failure with reasons*, never a crash and never a
  neutral finish.
- The investor "already saw" slides it has seen — the high-water mark choice was
  made on realism grounds, not implementation convenience.
- Deck quality is judged on how the slides *look*, which is why slide images go to
  the evaluator and not only to the student.

</specifics>

<deferred>
## Deferred Ideas

- **Nothing deferred from Google Slides.** The user cut it permanently rather than
  deferring it. If it is ever revived it is a new phase, not a backlog item from
  here. ROADMAP.md's Phase 14 scope note and Success Criterion 2 need amending to
  drop Google Slides and the Drive OAuth work.
- Engagement meter / visible disengagement indicator — rejected on design
  grounds, not deferred.
- Hard time cutoffs (turn-level at 60s, session-level at 30min) — rejected in
  favor of soft enforcement, not deferred.

</deferred>

---

*Phase: 14-practice-pitches*
*Context gathered: 2026-10-02*
