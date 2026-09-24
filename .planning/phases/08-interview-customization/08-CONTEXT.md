# Phase 8: Interview Customization - Context

**Gathered:** 2026-09-21
**Status:** Ready for planning

<domain>
## Phase Boundary

A student picks an interview preset from the registry and optionally adjusts it
before the session starts. Delivers: a preset catalog (more than today's single
`general` record), a picker surface reachable by navigation, and an optional
customization layer covering industry, role, difficulty, session length, and
interviewer personality.

Fixed constraint from ROADMAP success criterion 3: the assembled system prompt
must stay **session-constant** so the OpenAI prefix cache keeps hitting. All
customization is resolved once, before the session begins, into an
`InterviewType`-shaped object. Nothing tuned here may be injected per-turn —
per-turn state belongs in `buildProgressBlock`'s tail block, as it does today.

Not in this phase: student-authored scenarios (Phase 9), video/audio metrics
(Phase 10), cohort teardown (Phase 11).

</domain>

<decisions>
## Implementation Decisions

### Preset catalog

- **3–4 focused presets at launch.** Enough to read as a real catalog without
  producing thin, near-identical records. Exact set is Claude's to propose
  (see Discretion), grounded in what the existing prompt structure and the five
  rubric categories actually reward.
- **Today's `general` record stays, is the default, and is listed first.** It is
  the shipped, human-validated end-to-end path (Phases 5–7); it is not to be
  rewritten as part of building the new presets.
- Presets remain **data records in the registry**, consistent with the Phase 1
  guarantee that a new variant is a record, not a page.

### Entry point and flow placement

- **A separate picker page sits before the existing wizard.** The Practice
  Interviews dashboard tile routes to a preset index; choosing a preset enters
  the existing two-step wizard (Interviewer → Resume) at that preset's slug.
  The wizard itself does NOT gain a third step.
- **Each preset card shows name, one-line description, and what it covers** —
  difficulty, rough length, and the question areas — so presets are
  distinguishable before a student commits ~20 minutes.
- **Customization lives on the preset picker page**, attached to the chosen
  preset, pre-filled from that preset's defaults.
- **Customization is hidden behind a "Customize" affordance.** The defaults
  render as read-only summary text; the controls appear only when the student
  asks for them. The fast path (pick a preset, start) stays fast.
- **Settings lock when the session begins.** No mid-session changes — this is
  what preserves the session-constant prompt guarantee.

### The knobs

- **Industry and role: dropdowns of curated options.** Fixed lists, not free
  text — predictable prompt quality, and no unsanitized student input reaches
  the system prompt.
- **Difficulty keeps its current meaning.** Beginner/Intermediate/Advanced
  drives follow-up depth and how hard the interviewer presses, exactly as
  `lib/interview/types.ts` documents and `prompts.ts` implements. It does NOT
  change question count or length.
- **Session length IS a student-facing knob** (target minutes / question count).
  See "Scope note" below — this is a deliberate addition beyond success
  criterion 2 as currently written.
- **A blank or cleared field falls back to the preset's default.** The assembled
  prompt must never receive an empty value for any placeholder.

### Interviewer personality

- **In scope, in two parts:** a simple personality dial, PLUS an optional
  free-text "who is interviewing you" input that the model distills into a
  persona. The second part is substantial enough to be its own plan within the
  phase.
- **Personality is independent of the avatar.** The avatar chosen in wizard
  step 1 supplies face and voice only. This matches the code today:
  `interviewerPersona` lives on the interview type, not on the avatar record.
- **The pasted-profile persona plays the named person directly** — the avatar
  takes the name and background and speaks as them, rather than being merely
  "styled after" them. Chosen deliberately for rehearsal realism, with the
  confabulation tradeoff understood and accepted.

### Report surface

- **The report records and displays the customization that produced it** —
  preset, industry, role, difficulty, length. Makes two reports comparable and
  explains why one session felt harder than another. Planner should check what
  the `InterviewReport` row and `InterviewReportDTO` already carry before
  adding fields.

### Claude's Discretion

- **The specific preset set** (names, personas, role/industry defaults,
  difficulty and length per preset) — propose during research.
- **The curated industry and role lists** — contents and granularity.
- **Whether tweaks persist between sessions.** User deferred this. Decide based
  on whether suitable storage already exists and what persistence would cost;
  resetting to preset defaults each time is the acceptable simple answer.
- **The personality dial's exact options** (something like warm /
  neutral / pressure-testing) and how it composes with the preset's persona
  string.
- **How the pasted profile text is turned into a persona** — prompt design,
  distillation step, length limits.

</decisions>

<specifics>
## Specific Ideas

**The LinkedIn idea, and what it became.** The user's original framing: "if
students know who is going to interview them and can find their LinkedIn page,
it would be cool if we allowed students to paste in the LinkedIn URL and were
able to customize the interviewer's persona, personality and background
accordingly — this would create a more realistic interaction."

Fetching a pasted LinkedIn URL server-side was raised as unreliable and
ToS-problematic: LinkedIn actively blocks automated requests for profile pages
(an unauthenticated fetch generally hits an auth wall or challenge rather than
profile content), and their user agreement prohibits scraping. **Decision: do
not build URL fetching.** The student pastes or types the text instead — the
same shape as the existing resume flow, which already turns extracted text into
prompt context and cannot be blocked upstream.

**Constraints to honor when implementing the named-person persona** (these do
not reverse the decision, which the user made with the tradeoff stated):

1. The model will confabulate biographical detail beyond whatever was pasted.
   The UI should frame the session as a rehearsal simulation, not as a reliable
   portrait of that person.
2. The pasted text is a third party's personal information. It should persist
   only as long as the session needs it, and should not be exposed on any
   surface beyond the student's own session.
3. Session output should not be presented or exportable as that person's real
   words.

**Architectural grounding gathered during discussion** (for the researcher):

- `lib/interview/types.ts` — the `InterviewType` record; every field is
  session-constant by design. `difficulty` is documented as driving follow-up
  depth, not question count.
- `lib/interview/prompts.ts:54-87` — where `interviewerPersona`,
  `defaultRoleTitle`, `defaultIndustry`, `difficulty`, `targetMinutes`,
  `targetQuestionCount` and optional `caseBackground` are interpolated.
  Customization = assembling this object once at session start.
- `app/interview/[type]/page.tsx:34` — the existing `SetupStep` wizard
  (`"interviewer" | "resume" | "session"`), which stays two steps.
- `targetMinutes` / `targetQuestionCount` also feed `buildProgressBlock` and the
  live session's progress tracking — making length student-selectable touches
  that path, and the researcher must confirm it stays coherent.

</specifics>

<deferred>
## Deferred Ideas

- **Fetching a LinkedIn (or any) URL server-side to build a persona.** Rejected
  on feasibility and ToS grounds, not scope. Superseded by pasted text within
  this phase. If ever revisited, it needs a real evaluation of LinkedIn's
  blocking and terms, not a naive fetch.
- **Persisting customization presets a student authored themselves** (saving "my
  usual setup" as a reusable named variant) — this shades into Phase 9,
  Student-Authored Scenarios.

</deferred>

<scope_note>
## Scope Note for the Planner and Roadmap

ROADMAP Phase 8 success criterion 2 currently reads: "A student can adjust
industry, role and difficulty before starting." Two decisions here go beyond it,
both made deliberately by the user after the expansion was pointed out:

1. **Session length is a student-facing knob** (target minutes / question
   count). Criterion 2 should be amended to include it.
2. **Interviewer personality is in scope**, including an optional pasted-profile
   persona. This is consistent with the phase GOAL line (which names interviewer
   personality) but is absent from the criteria list.

Recommend updating Phase 8's success criteria in ROADMAP.md to match, and
generating REQ-17 onward — REQUIREMENTS.md currently stops at REQ-16 and Phase 8
has no requirement IDs, so the plan-checker has nothing to verify coverage
against.

</scope_note>

---

*Phase: 08-interview-customization*
*Context gathered: 2026-09-21*
