# Phase 10: Video & Audio Metrics - Context

**Gathered:** 2026-09-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Measure the student's **actual video and audio** during a live session and populate
`visual_metrics` and `vocal_metrics` so the Visual and Vocal rubric categories
produce real scores instead of reading "Not yet measured" — the placeholder state
deliberately carried since Phase 6.

Delivers: in-flight capture and analysis of the student's camera and microphone, a
live face-detection affordance during the session, real metric values fed to the
evaluators, and Visual/Vocal scores on **both** interview reports and scenario
reports.

NOT in this phase: session playback or any retained recording, real-time delivery
coaching, retroactive analysis of past sessions, and the cohort/staff teardown
(Phase 11).

</domain>

<decisions>
## Implementation Decisions

### Capture, consent and retention

- **The camera is optional.** A student can practise with it off; Visual simply
  goes unscored for that session. Practice is never blocked by not having a camera.
- **Video is analyzed in-flight and NEVER stored.** Frames are measured as they
  arrive and discarded; only the derived numbers persist. No new media storage
  surface — do not add recordings to S3.
- **Explicit in-app consent before the first measured session.** A short
  plain-language explanation of what is measured and what is kept, accepted once
  and remembered. The browser permission dialog alone is NOT treated as informed
  consent about being *analyzed*.
- **A denied permission and a deliberate opt-out are two different states:**
  - *Permission denied / camera not detectable while camera mode is ON* →
    **blocked**, with an explanation, until either the camera works or the student
    changes the setting to camera-off.
  - *Deliberate camera-off choice* → the session proceeds, with a notice that
    Visual/Vocal will not be scored this time, **and the report records that it
    was a deliberate opt-out**.
  This is the user's own refinement of the options offered: an accident is an
  error to fix, an intentional choice is honoured and carried through to the report.

### Camera mode is locked at session start

- **The camera decision is made BEFORE the session and cannot be changed mid-run**,
  in either direction. A student who starts camera-off cannot turn it on partway;
  a student who starts camera-on cannot switch it off to escape measurement.
- Consequence: there is no "camera turned on halfway" case to score. The partial-
  coverage question the discussion opened with is resolved by removing the
  possibility rather than by picking a threshold.

### Undetected face is PERFORMANCE, not missing data

This inverts the framing the discussion started from, on the user's explicit
correction — treat it as locked:

- **While camera mode is ON, a face that cannot be picked up counts AGAINST the
  Visual score.** It is not an "insufficient data" state. Rationale, in the user's
  terms: in a real interview, if your face cannot be seen clearly, you are docked
  for it.
- Therefore **no coverage threshold gates the Visual score** for a camera-on
  session. Low detection produces a low score, not a blank category.
- **A live, non-blocking, non-distracting banner** shows in real time while the
  face is not being picked up, and **folds away** when the face is detected again.
  It must not interrupt or obscure the conversation.
- **A live self-view of the student's own video** (e.g. a small thumbnail in a
  corner) so they can see their own framing as they go. No live scoring of any kind.

### Distinct unmeasured states

- The report distinguishes unscorable categories **by cause**, extending the
  existing "Not yet measured" vs "Not scored" distinction established in 06-08:
  - **"Not yet measured"** — no pipeline existed (legacy pre-Phase-10 reports).
  - **Camera off / deliberate opt-out** — the student chose not to be measured.
  - **Insufficient data** — measurement was attempted but genuinely could not be
    performed (see the technical-failure flag below).
  - **"Not scored"** — evaluation ran but failed to produce a score (existing state).

### Presentation

- **Score plus qualitative bands**, not raw percentages: "Eye contact: strong",
  "Pace: slightly fast". The 1-5 rubric score stays as-is; the underlying numbers
  are interpreted for the student rather than shown as bare figures.
- **Metrics live INSIDE the existing Visual and Vocal rubric cards.** No new report
  section; the report's overall shape is unchanged.
- **The report arrives and metrics fill in.** Content and Behavioral render
  immediately; Visual/Vocal show a pending state and populate when ready, reusing
  the polling behavior the report page already has.
- **Coverage is disclosed only when it is poor** — a clean full-session run says
  nothing about coverage; it surfaces only when it would change how the student
  reads the score.

### Scope of report types

- **BOTH interview reports and scenario reports** get real Visual/Vocal scores.
  Both currently show "Not yet measured"; this phase closes the gap in both.
  Note the ROADMAP line says only "Depends on: Phase 6" because it was written
  before Phase 9 existed — including scenarios is a deliberate widening, decided here.
- **Typed answers leave Vocal UNMEASURED, not penalized.** Typing instead of
  speaking is a different modality, not weak vocal delivery. This is deliberately
  NOT symmetric with the camera case, where the student opted into camera-on and
  then failed to present a face.
- **Past reports keep null scores permanently.** No retroactive analysis. This
  follows necessarily from the analyze-and-discard retention decision — there is
  no stored media to re-analyze. Satisfies ROADMAP criterion 2.

### Metric contract

- The pipeline should produce **at least** the shape the evaluator prompt already
  declares (`lib/interview/prompts.ts:210-217`), and **may extend it** if the
  pipeline genuinely offers more signal than the declared fields.
- Extending means editing `INTERVIEW_EVALUATOR_PROMPT`. See the constraint note
  below — this is a deliberate, phase-owned relaxation, not an accident.

### Claude's Discretion

- The capture and analysis approach (in-browser vs server-side, and which
  models/libraries do pose/gaze and speech analysis) — provided nothing is
  retained and nothing blocks the conversation.
- The exact band boundaries that turn a raw metric into "strong" / "slightly fast",
  and the copy for each band.
- The banner's precise placement, animation and wording, and the self-view
  thumbnail's size and position.
- The threshold and heuristic that separates a genuine technical failure from poor
  performance (see the flag below), and what counts as "poor coverage" for the
  disclosure rule.
- How the pending-then-populate state is wired into the existing report polling.

</decisions>

<specifics>
## Specific Ideas

- **"if the face is not detected for a significant amount of the session, then it is
  an indication that the interviewee performed poorly on a visual standpoint. in a
  real interview, if your face cannot be picked up clearly, you would be docked for
  that."** — verbatim. The governing principle for this phase: undetected face is a
  score, not a gap.

- **"if possible, it would be good to have some sort of little banner notification
  (not blocking or distracting) that shows in live time when your face cannot be
  picked up and folds away when the face is picked up again"** — verbatim.

- **"if the student selects no camera at the beginning, they should not be able to
  turn their camera on mid interview"** — verbatim. Camera mode is locked at start.

- **"might be helpful if the user can see their own video in live time as well, in
  the bottom right corner or something?"** — the self-view thumbnail.

- On a denied permission: block, **but** offer the student the option to untoggle
  the camera setting, at which point the session continues with notice and the
  report indicates it.

## Architectural grounding gathered during discussion (for the researcher)

- **`lib/interview/prompts.ts:210-217`** already declares the expected contracts:
  `visual_metrics` = `{eye_contact_pct, posture_flags, camera_centered_pct,
  lighting_ok}`; `vocal_metrics` = `{words_per_minute, filler_word_count,
  filler_word_list, pause_count, volume_consistency}`. The pipeline's output shape
  is therefore largely pre-specified.
- **`lib/interview/prompts.ts:218-222`** carries the hard rule that missing metrics
  must NOT be estimated from the transcript. That rule stays; this phase changes
  whether the metrics arrive, not the rule about absent ones.
- **`prisma/schema.prisma:304-305`** (`InterviewReport`) and **`:354-355`**
  (`ScenarioReport`) already have nullable `visualScore Int?` / `vocalScore Int?`.
  No migration is needed for the scores themselves; storing the richer metric
  objects may need new columns.
- **`lib/scenario/evaluation.ts:75-76`** types `visualScore: null` / `vocalScore: null`
  as the **literal `null` type**, not `number | null`, specifically so a stray model
  number is a compile error. **This type MUST be widened in this phase** — it is the
  deliberate Phase 9 guard that now blocks Phase 10, and it will surface as a tsc
  error the moment real scores flow. Same pattern to check in `lib/interview/`.
- Existing capture-adjacent surfaces: `components/interview/InterviewSessionShell.tsx`,
  `components/HeyGenAvatar/InteractiveAvatar.tsx`, `app/case-play/[caseId]/page.tsx`
  (has a Text/Avatar toggle), and `/api/audio/transcribe` (push-to-talk audio exists
  transiently today).

</specifics>

<deferred>
## Deferred Ideas

- **Live delivery coaching** — real-time pace or filler-word nudges during the
  session. Considered and explicitly not selected; only the face-detection banner
  and the self-view are live. Its own phase if wanted.
- **Session playback / retained recordings** — letting a student rewatch their own
  session. Rejected here on privacy grounds (analyze-and-discard), and it is a new
  capability rather than an implementation choice.
- **Retroactive re-analysis of past sessions** — rejected; incompatible with the
  no-retention decision and contrary to ROADMAP criterion 2.

</deferred>

<dependencies>
## Flags for the Planner

1. **Phase 10 has NO requirement IDs.** `REQUIREMENTS.md` ends at REQ-34 (Phase 9)
   and the ROADMAP's Phase 10 section has no `Requirements:` line. **Generate REQ-35
   onward during planning**, or the plan-checker has nothing to verify coverage
   against. This is the third phase in a row to hit this gap (Phases 8 and 9 both did).

2. **Distinguish poor performance from technical failure.** "The student left frame
   or is badly lit" (→ score it down) and "the analyzer crashed, the stream died, or
   the camera was seized by another app" (→ do NOT fabricate a score; use the
   Insufficient-data state) can look identical in the data. Getting this wrong either
   punishes a student for a bug or silently excuses genuinely poor presentation.
   No plan may collapse these two into one path.

3. **This phase is expected to edit `lib/interview/prompts.ts`** if the metric
   contract is extended. Phases 6, 7, 8 and 9 all enforced that file as diff-empty in
   their static sweeps, but that was a **phase-scoped guard** proving those phases did
   not alter grading — not a permanent rule. Phase 10 legitimately owns the evaluator
   prompt. Two cautions:
   - The **session-constant** requirement from Phase 1 (criterion 2) applies to the
     **live interviewer prompt**, not the evaluator prompt. Evaluation is a one-shot
     call, so editing `INTERVIEW_EVALUATOR_PROMPT` does not disturb the OpenAI prefix
     cache. Do not let a static check conflate the two.
   - There is a still-open Phase 8 question about whether to reinforce the interviewer
     persona inside `prompts.ts`. That is a separate decision and is NOT authorized by
     this phase's relaxation.

4. **The scenario evaluator's literal-`null` typing must be widened** —
   `lib/scenario/evaluation.ts:75-76`. It was built deliberately to make a non-null
   visual/vocal score a compile error. It is now the thing standing in the way.

5. **No media retention anywhere.** Analyze in-flight, persist only derived numbers.
   Any design that uploads or buffers the student's video to S3 contradicts a locked
   decision.

6. **Both report types are in scope**, which means two evaluators, two report pages
   and two DTOs. Plan for the breadth: `lib/interview/` and `lib/scenario/` each have
   their own evaluation module, runner, report DTO and report page.

</dependencies>

<scope_note>
## Scope Note for the Planner and Roadmap

The two existing ROADMAP success criteria remain accurate:
1. Eye contact, framing, speech rate and filler counts are measured, not estimated.
2. Reports generated before this phase remain valid with null scores.

Criterion 1's "measured, not estimated" is reinforced by the decisions above: real
capture feeds real numbers, and the evaluator's existing prohibition on inferring
metrics from transcript text stays in force.

**One amendment worth recording:** the ROADMAP lists Phase 10 as depending only on
Phase 6, because it was written before Phase 9 shipped a second report type. This
discussion decided **scenario reports are in scope alongside interview reports**, so
Phase 10 effectively also depends on Phase 9.

</scope_note>

---

*Phase: 10-video-audio-metrics*
*Context gathered: 2026-09-21*
