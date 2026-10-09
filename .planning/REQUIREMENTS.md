# Requirements

**Scope note:** Phases 1-5 shipped before this project used GSD and carry no REQ
IDs. Requirement tracking starts at Phase 6. IDs below are derived from the
decisions in `.planning/phases/06-interview-evaluation-and-report/06-CONTEXT.md`
— they restate what was decided, they do not add scope.

## Requirements

### Phase 6 — Evaluation & Student Report

- **REQ-01** — [x] `InterviewReport` exists as a Prisma model with a `User` relation,
  nullable `visualScore` / `vocalScore`, non-null-capable `contentScore` /
  `behavioralScore`, a markdown report body, and a status of
  `IN_PROGRESS | PENDING | READY | FAILED`. No `cohortId`, no assignment
  linkage, no staff-visibility field. *(Complete — 06-01)*

- **REQ-02** — [x] Migration SQL is generated for team review and applied only to a
  local/dev database. The shared database is not migrated by this phase.
  *(Complete — 06-01)*

- **REQ-03** — [x] An `InterviewReport` row is created on the first real interview
  turn (not on entering the session step), and the transcript is checkpointed
  server-side after every assistant turn without blocking the avatar stream.
  *(Endpoint complete — 06-03; client wiring complete — 06-06:
  `InterviewSessionShell.tsx`'s `ensureReport()`/`checkpoint()` call these
  endpoints from the first real assistant turn onward, fire-and-forget,
  never from an exit path)*

- **REQ-04** — [x] The canonical transcript is a purpose-built `InterviewTranscript`
  stored in S3 under a server-derived key; `InteractionLog` is not reused.
  *(Complete — 06-01)*

- **REQ-05** — [x] An authenticated finish endpoint accepts the completed transcript
  and resume context, flips the row to `PENDING`, returns a report ID
  immediately, and runs the evaluator in the background.
  *(Complete — 06-04)*

- **REQ-06** — [x] The evaluator invokes `INTERVIEW_EVALUATOR_PROMPT` in JSON mode
  against a model from `INTERVIEW_EVAL_MODEL` (default `gpt-4.1`), and stores
  four validated score fields plus the markdown report. Out-of-range or
  non-integer scores are coerced to null. Visual and Vocal remain null until a
  real metrics pipeline exists.
  *(Complete — 06-02 evaluator module; wired into the persistence lifecycle by 06-04)*

- **REQ-07** — [x] Evaluation failure retries once, then persists `FAILED` with a
  reason. The transcript survives regardless. A `FAILED` report can be re-run
  against the stored transcript under the same report ID; a `READY` report
  cannot be regenerated.
  *(Complete — 06-04)*

- **REQ-08** — [x] `/interview/[type]/report/[reportId]` renders the report, polls
  every 2s while `PENDING`, gives up at 2 minutes with a retry affordance, and
  shows a skeleton of the real layout while waiting.
  *(Complete — 06-05 delivered the owner-scoped GET endpoint the page polls,
  with `no-store` and a stable `InterviewReportDTO` shape; 06-07 delivered
  the page itself, its 2s poll loop with a 2-minute give-up, the real-layout
  pending skeleton, and the FAILED retry affordance, verified end-to-end
  against the local dev DB with a real evaluation run.)*

- **REQ-09** — [x] Report ownership is enforced from the authenticated JWT user.
  A report belonging to another user returns 404, identical to a nonexistent
  report. No staff or admin override exists.
  *(Pattern established — 06-03 session endpoints; confirmed on finish/retry — 06-04;
  confirmed on the report read endpoint — 06-05, verified end-to-end with two
  real users: owner 200, non-owner/nonexistent/malformed id all byte-identical
  404; carried into 06-07)*

- **REQ-10** — [x] The End-interview control is wired to the finish endpoint behind a
  confirm modal that names what happens next and warns on a very short
  transcript; the Leave control uses a distinct "leave without a report" confirm.
  *(06-06: `InterviewSessionShell.tsx` — shared confirm modal keyed by
  `exitIntent`, `handleEnd` calls `/api/interview/session/finish` and never
  `ensureReport()`, `handleLeave` calls `onExit()` directly; verified via
  `tsc --noEmit` and grep checks that no exit path can create a row)*

### Phase 7 — Interaction Dashboard

- **REQ-11** — [x] A `lib/interactions` registry, parallel to `lib/interview` and never
  importing its internals, lists interaction TYPES with name, description, icon,
  estimated duration, entry route, and availability state. Five types: Interviews and
  Case Studies live; Pitches, Difficult Conversations and Networking coming-soon.
  Leading a Meeting is NOT registered.
  *(07-01: `lib/interactions/types.ts` + `lib/interactions/index.ts` — five records,
  zero imports from `lib/interview`, `listInteractionTypes()` live-first,
  `getInteractionType(slug)`; `npx tsc --noEmit` clean)*

- **REQ-12** — [x] A signed-in student lands on the interaction dashboard at `/`, not on
  assigned cases. Tiles render as a responsive card grid with live types first,
  each showing icon, name, one-line description and estimated duration.
  *(07-04: `components/interactions/InteractionDashboard.tsx` renders
  `listInteractionTypes()` (live-first) in a `sm:grid-cols-2 xl:grid-cols-3` grid;
  `app/page.tsx` returns it directly for `user?.role === "student"`; `npx tsc --noEmit` clean)*

- **REQ-13** — [x] Coming-soon tiles are visibly inert: not clickable, greyed, badged.
  No modal, no dead end, no navigation.
  *(07-04: `components/interactions/InteractionTile.tsx`'s coming-soon branch is a
  non-interactive `<div>` with no `onClick`/`href`/`role="button"`, greyed palette,
  and a "Coming soon" badge)*

- **REQ-14** — [x] `/student-cases` is deleted, settings moves to a top-level `/settings`,
  student nav becomes Practice · My Reports · Settings, and every existing
  `/student-cases` link is repointed to the dashboard (report page "Back to practice",
  interview wizard back link, unknown-type error card).
  *(07-06: `app/student-cases/` deleted outright; `app/settings/page.tsx` (renamed via
  `git mv`) and `app/settings/layout.tsx` reproduce the moved page; `config/site.ts`
  `studentNavItems` is Practice (`/`) / My Reports (`/reports`) / Settings (`/settings`);
  `middleware.ts` `STUDENT_ROUTES` gates `/reports` and `/settings`; a fresh grep found and
  repointed 10 real `/student-cases` call sites across 5 files; final grep for
  `student-cases` in `app/`, `components/`, `lib/`, `config/`, `middleware.ts` returns
  nothing; `npx tsc --noEmit` clean)*

- **REQ-15** — [x] Case Studies is a live interaction type routing into existing
  `/case-play`. Students browse all published cases with no cohort filter, gated by a
  new `published` flag on the S3 `CaseStudy` type (`types/index.ts`), surfaced by a new
  `/case-play` index page.
  *(CORRECTED 2026-09-21 after research: this requirement originally called for a Postgres
  migration. There are two unrelated "Case" concepts — the Prisma `Case` table already has
  `isPublished` but holds 3 seed fixtures consumed only by the staff gradebook, and is NOT
  what `/case-play` plays. The real cases are S3 JSON. **No database migration is required
  or permitted in Phase 7.** Absent `published` means unpublished. The flag gates DISCOVERY
  only, not access — `/case-play/{id}` still plays an unpublished case by direct URL.)*
  *(07-02: `types/index.ts` adds optional `published?: boolean`; `GET /api/case/list`
  accepts `?publishedOnly=true` filtering strictly on `published === true`; the case
  editor exposes a Published `Switch` wired into both `caseStorage.add`/`update` save
  branches. No Prisma changes. The `/case-play` index consuming this ships in 07-05.)*
  *(07-05: new `app/case-play/page.tsx` fetches `?publishedOnly=true` and routes into
  `/case-play/{caseId}` with no `cohortId`. Verified end-to-end on the local dev DB:
  unpublished → empty index; published → visible; unpublished direct URL still plays.)*

- **REQ-16** — [x] `/reports` lists the signed-in student's reports newest-first showing
  type, interviewer, date, status and scores, each row clickable through to its full
  report. FAILED reports remain visible so retry stays reachable; IN_PROGRESS
  (abandoned) rows are hidden entirely.
  *(07-03: `GET /api/interview/reports` filters `status: { not: "IN_PROGRESS" }` in the
  Prisma `where` clause and maps rows through `toInterviewReportDTO` verbatim;
  `app/reports/page.tsx` renders type/interviewer/date/status/scores per row, every row
  including FAILED clickable through to `/interview/{typeSlug}/report/{id}`; verified
  against the local dev DB with a real user's 2 READY + 2 IN_PROGRESS fixture rows —
  only the 2 READY rows returned, newest-first)*

### Phase 8 — Interview Customization

*IDs derived from the decisions in
`.planning/phases/08-interview-customization/08-CONTEXT.md` — they restate what
was decided, they do not add scope.*

- **REQ-17** — [x] The interview registry holds 3-4 focused preset records, with today's
  `general` record preserved unchanged as the default and listed first. Adding a preset
  remains a data record, not a page.

- **REQ-18** — [x] A preset picker page sits between the Practice Interviews dashboard
  tile and the existing setup wizard. Each preset card shows name, one-line description,
  and what it covers (difficulty, rough length, question areas). The wizard itself stays
  two steps (Interviewer -> Resume) and does not gain a third.

- **REQ-19** — [x] Customization lives on the preset picker page, pre-filled from the
  chosen preset's defaults and hidden behind a "Customize" affordance; defaults render as
  read-only summary text until the student opens the controls. Settings lock once the
  session begins.

- **REQ-20** — [x] Industry and role are curated dropdowns, not free text, so no
  unsanitized student input reaches the system prompt. Difficulty keeps its existing
  meaning (follow-up depth and interviewer pressure, NOT question count). A blank or
  cleared field falls back to the preset default so no prompt placeholder is ever empty.

- **REQ-21** — [x] Session length (target minutes / question count) is a student-facing
  knob, and the live session's progress tracking (`buildProgressBlock`) stays coherent
  with whatever length the student selects.

- **REQ-22** — [x] Interviewer personality is a dial independent of the avatar (which
  supplies face and voice only), plus an optional free-text "who is interviewing you"
  input distilled into a persona that plays the named person directly. No LinkedIn or
  other URL is fetched server-side. The UI frames the session as a rehearsal simulation;
  the pasted text persists only as long as the session needs it and is exposed on no
  surface beyond the student's own session.

- **REQ-23** — [x] The assembled system prompt stays session-constant: every customized
  value is resolved once, before the session starts, into an `InterviewType`-shaped
  object. Nothing tuned in this phase is injected per-turn.

- **REQ-24** — [x] The report records and displays the customization that produced it
  (preset, industry, role, difficulty, length), so two reports are comparable.

### Phase 9 — Student-Authored Scenarios

*IDs derived from the decisions in
`.planning/phases/09-student-authored-scenarios/09-CONTEXT.md` — they restate what
was decided, they do not add scope.*

- **REQ-25** — [x] A student can author a case-style roleplay scenario: a situation plus
  one or more avatar characters. A "scenario" is NOT a saved interview preset — that
  remains deferred.

- **REQ-26** — [x] Authoring is a guided step-by-step builder (situation -> characters ->
  criteria), not a single admin-style form and not model-drafted. A scenario cannot be
  saved without a situation, at least one character, and criteria.

- **REQ-27** — [x] The character/avatar picker mirrors the interviewer selection UI at
  `app/interview/[type]/page.tsx` (card grid with avatar preview images), NOT the admin
  case editor's `<Select>` dropdown. It also mirrors that page's SOURCE: the catalog is
  the HeyGen-backed LiveAvatar catalog served by `/api/interview/interviewers` (the same
  set shown at `/interview/general`), not the admin-curated `VideoAudioProfile` catalog.
  Admin-created avatar profiles are obsolete as the student-facing catalog (checkpoint
  fix, 2026-09-21).

- **REQ-28** — [x] Saving is a distinct step and practice launches from the list, but the
  save lands the student where the new scenario is immediately startable — ROADMAP
  criterion 1's "immediately" is preserved, not dropped.

- **REQ-29** — [x] Student scenarios are owned per-user with ownership enforced
  SERVER-SIDE in the route handlers, not merely displayed and not only gated by
  middleware. `CaseStudy.createdBy` (a display string) and `cohortIds` are not an
  ownership model.

- **REQ-30** — [x] A student's scenarios are private by default and can be deliberately
  published to all students, reusing the Phase 7 `published` discovery-flag pattern. No
  staff-facing view is built, and the data model does not preclude one later. The model
  permits a recipient forking their own copy, though the fork action itself need not ship.

- **REQ-31** — [x] `/case-play` presents student-authored scenarios and admin-authored
  case studies as two separate sections on one page, so provenance is always obvious.

- **REQ-32** — [x] A scenario run is evaluated: the author's own criteria compose ON TOP
  OF a standard behind-the-scenes prompt covering EQ and conversational adequacy,
  structurally similar to the interview prompt. Visual and Vocal render as
  "Not yet measured" exactly as interview reports do — no real visual or sound-oriented
  scoring is produced in this phase (blocked on Phase 10).

- **REQ-33** — [x] Scenarios are freely editable and re-runnable, and the report
  SNAPSHOTS the scenario as it was at run time so a report stays truthful after edits
  (the Phase 8 precedent of persisting resolved config onto the report row).

- **REQ-34** — [x] Reports survive deletion of their scenario, and a published scenario
  must be unpublished before it can be deleted. There is no cap on scenarios per student.

### Phase 10 — Video & Audio Metrics

*IDs derived from the decisions in
`.planning/phases/10-video-audio-metrics/10-CONTEXT.md` — they restate what
was decided, they do not add scope.*

- **REQ-35** — [x] Camera mode (on/off) is chosen BEFORE the session starts and is
  LOCKED for its duration in both directions: a student who starts camera-off cannot
  turn it on mid-run, and a student who starts camera-on cannot switch it off to escape
  measurement. The chosen mode is persisted on the report row at session start.

- **REQ-36** — [x] Explicit in-app consent — a short plain-language explanation of what
  is measured and what is kept — is required before the first measured session. The
  browser permission dialog alone is NOT treated as informed consent. Acceptance is
  remembered account-level AND snapshotted onto each report row, so a report stays
  truthful about consent later.

- **REQ-37** — [x] A denied permission or an undetectable camera while camera mode is ON
  BLOCKS the session with an explanation and offers the student the option to switch the
  setting to camera-off. A deliberate camera-off choice instead proceeds with a notice
  that Visual/Vocal will not be scored, and the report RECORDS that it was an opt-out —
  an accident and an intentional choice are two different states.

- **REQ-38** — [x] Video and audio are analyzed IN-FLIGHT and NEVER STORED. Only derived
  numbers persist on the report row. No media is written to S3, buffered to disk, or
  routed through the server as frames.

- **REQ-39** — [x] Visual metrics are MEASURED from the student's real camera stream —
  a forward-gaze/eye-contact proxy, camera framing/centering, lighting adequacy, and a
  restricted set of posture flags the capture method can actually defend — never
  estimated from transcript text. Any field the method cannot honestly measure is
  omitted rather than invented.

- **REQ-40** — [x] Vocal metrics are MEASURED from real audio — words per minute and
  filler words from word-level speech-to-text timestamps, pause count from inter-word
  gaps, and volume consistency from an RMS time series — never estimated from
  transcript text.

- **REQ-41** — [x] While camera mode is ON, a face that cannot be picked up counts
  AGAINST the Visual score. It is not an "insufficient data" state, and NO coverage
  threshold gates the Visual score: low detection produces a low score, not a blank
  category.

- **REQ-42** — [x] Genuine technical failure is distinguished from poor performance by
  pipeline-LIVENESS signals tracked independently of detection outcome (samples actually
  processed, video-track live time, and an explicit analyzer-error flag). A technical
  failure yields the "Insufficient data" state and never a fabricated score; a live
  pipeline with low detection is scored normally, however low. These two causes are
  never collapsed into one path.

- **REQ-43** — [x] During a camera-on session the student sees a live, non-blocking
  face-detection banner that FOLDS AWAY when the face is re-detected, plus a live
  self-view thumbnail of their own video. There is no live scoring and no live coaching.

- **REQ-44** — [x] Typed answers leave Vocal UNMEASURED, not penalized — typing is a
  different modality, not weak vocal delivery. This is deliberately NOT symmetric with
  the camera case.

- **REQ-45** — [x] The report distinguishes unscorable categories BY CAUSE, extending
  the 06-08 distinction: "Not yet measured" (no pipeline existed — legacy rows),
  camera-off / deliberate opt-out, "Insufficient data" (measurement attempted but
  genuinely impossible), and the existing "Not scored" (evaluation ran but produced no
  score). The cause is stored, not re-derived from a null score.

- **REQ-46** — [x] Visual and Vocal are presented as the 1-5 rubric score plus
  QUALITATIVE BANDS ("Eye contact: strong", "Pace: slightly fast"), not raw percentages,
  INSIDE the existing Visual and Vocal rubric cards — no new report section. Coverage is
  disclosed ONLY when it was poor.

- **REQ-47** — [x] BOTH interview reports and scenario reports produce real Visual/Vocal
  scores. The Phase 9 literal-`null` type guards in `lib/scenario/evaluation.ts` and
  `lib/interview/evaluation.ts` are widened, and `SCENARIO_EVALUATOR_PROMPT`'s
  "NOT MEASURABLE in this phase" clauses are rewritten while keeping its
  injection-resistance protection against transcript-sourced score injection.

- **REQ-48** — [x] Reports generated before this phase remain valid with null Visual and
  Vocal scores, rendering as "Not yet measured". No retroactive analysis is performed and
  none is possible, since no media was ever retained.

- **REQ-49** — [x] A camera-on session does not degrade the live session: inference is
  throttled well below display frame rate and kept off the conversation's critical path,
  so the HeyGen avatar stream, push-to-talk audio and interviewer response latency are
  unaffected compared with a camera-off run.

### Phase 12 — Embodied Visual Signals

- **REQ-50** — [x] Hand and arm movement is measured, not inferred. Gesticulation rate,
  motion amplitude, hands-above-shoulder and hands-near-face are derived from hand
  landmarks and reported as behaviour, on a three-band curve — too still / well-judged /
  excessive — so both extremes are reportable rather than only excess. Hands-near-face is a
  distinct signal. Commentary describes the motion and may invite reflection, but must never
  assert an effect on the interviewer, which nothing here measures. The canned gesture
  vocabulary cannot identify a specific or offensive gesture and must never be described as
  doing so.

- **REQ-51** — [x] **MET (12-11 Task 4, 2026-10-03).** Body posture is measured from body
  landmarks — shoulder-line tilt, forward-head, torso lean and openness. The SCORE comes
  from drift against the student's own opening posture, never against a fixed upright
  ideal; the absolute reading is reported but not graded. A partially visible body is
  scored on the landmarks that ARE available rather than skipped, and every posture
  comment states which were measured.

  Clause by clause: all four signals are computed and only the genuinely in-frame ones
  are scored (12-10's frame-bounds gating); the score is `abs(current - baseline)`
  against a baseline established in the first `POSTURE_BASELINE_WINDOW_S`, never an
  ideal; the absolute reading lives in the unscored Observations section (12-04/12-07)
  and nothing scored reads it; the partial-visibility clause passed at 12-10 Task 4
  item 2 and was confirmed un-regressed at 12-11 Task 4 item 3; and the "Measured from"
  row renders unconditionally (`bands.ts:524`).

  **What held this open until now was one thing only:** the drift-scoring mechanism had
  never been observed to respond correctly to the behaviour it grades — three "Held
  steady" readings on genuine slumps (12-08, 12-09, 12-10 item 3) and one "Shifted" that
  was 12-09's false positive on an extrapolated skeleton, with the false-positive side
  never tested at all. 12-11 found the cause by measurement (the band read a session-wide
  mean of a cross-signal mean, and a single-axis slump is capped at 0.500 per tick under
  that mean regardless of the cutoff), repaired both aggregations, and wired up
  `POSTURE_DRIFT_SUSTAINED_S`, which had been read by nothing for three plans. 12-11
  Task 4 then demonstrated the row responding correctly in **both** directions on the
  same build — a slump reported with a matching timecode (`0:48-1:26`), an ordinary
  session reported as steady with no episode — with the independent episode code path
  agreeing in both directions.

  **Evidence base, stated honestly: one slump session and one ordinary session.** The
  constants are labelled SET FROM ONE REAL SESSION, not TUNED. Re-tuning against real
  student sessions is expected work, carried in `deferred-items.md`. See
  `12-11-SUMMARY.md` and `12-TUNING.md`.

- **REQ-52** — [ ] **NOT MET** (12-08 Task 1 checkpoint, deliberate — this is not a gap
  pending more work, it is a measurement-capability limit this pipeline cannot clear at
  its current hands model sample rate). Fidgeting was intended to be measured and
  REPORTED BUT NEVER SCORED, surfaced as self-awareness information. Two real recordings
  measured a direction-change rate of 0.35/s and 0.15/s against a gate already lowered
  once (1.5 -> 0.5/s). The hands model's achievable ~1.5 Hz sample rate cannot resolve a
  reversal frequency fast enough to mean "fidgeting" at all (small, FAST motion by
  definition) — the sampler was aliasing the behaviour, not measuring it, and no further
  threshold lowering fixes an aliasing problem; it would only ship a noise detector
  wearing a fidget label on a signal shown to students about stimming-adjacent behaviour.
  User decision: retire `fidgeting` to permanently not-measured for this phase rather than
  continue tuning an unfixable threshold. See
  `.planning/phases/12-embodied-visual-signals/deferred-items.md` ("12-08: Fidgeting
  retired...") and `12-TUNING.md` for the full readings and what a real fix would require
  (a materially higher hands sample rate — a new, scoped piece of work with its own
  frame-budget analysis, not a threshold retune).

- **REQ-53** — [x] **MET (12-10 Task 4 item 1, 2026-10-03).** Descriptive-only signals
  live in their own report section — not inline with scored rows carrying a marker — so a
  student cannot read an unscored observation as a deduction. Scored body signals group
  under their own subheading within the visual bands. REQ-52 and REQ-54 depend on this.
  The section-separation clause shipped at 12-04. What held this open through 12-08 and
  12-09 was the honesty clause tracked under it via ROADMAP criterion 3 — "nothing the
  pipeline cannot observe is described as absent" — which failed twice on a real
  off-camera session (a false "Held steady", then a false "Shifted from the opening
  posture" with timecodes). After 12-10's frame-bounds landmark gating that session now
  reports the body as unreadable, gives no posture verdict, produces no Moments rows for
  unobserved signals, and no longer credits gesturing on an arm it could not properly
  see. 12-10 Task 4 item 3's false NEGATIVE does not bear on this requirement: in that
  session the body WAS observable and was honestly declared measured, so it is a
  sensitivity failure on an observed signal, not an unobservable signal described as
  absent. See `12-10-SUMMARY.md`.

- **REQ-54** — [x] A phone visible in frame is reported factually — "a phone was visible
  for 40 seconds" — never as an inference about attention, which the sensor cannot support.
  Descriptive only: it does not affect any score, since a phone sitting on the desk in shot
  is not misconduct.

- **REQ-55** — [x] Every new signal joins the existing episode timeline with timecodes on
  the session clock, so it can be tied to what was being discussed. No new signal is
  reported only as a session-wide average.

- **REQ-56** — [x] `VISUAL_NOT_MEASURED` shrinks to exactly what remains unobservable. An
  entry leaves that list only when a pipeline that genuinely measures it ships, and the
  rule that a flag's ABSENCE is never evidence of good behaviour survives unchanged.

- **REQ-57** — [x] Running four models does not degrade the live session (REQ-49 extended).
  Per-model sampling is staggered and inference runs off the main thread, so the HeyGen
  avatar stream, push-to-talk audio and response latency are unaffected compared with a
  camera-off run.

- **REQ-58** — [x] No frame, landmark array or media blob leaves the browser or outlives
  the tick that produced it (REQ-38 unchanged). Every new signal reaches the server as a
  derived scalar.

### Phase 13 — One-on-One Conversation Engine

**Derived 2026-10-02** from Phase 13's four ROADMAP success criteria and the
locked decisions in
`.planning/phases/13-one-on-one-conversation-engine/13-CONTEXT.md`. They restate
what was decided; they add no scope.

- **REQ-59** — [x] One engine serves every one-on-one interaction type. Exactly one
  session-start, one checkpoint, one finish, one report-GET and one evaluation runner
  exist for all types. The per-type trees that exist today —
  `app/api/interview/session/*`, `app/api/scenario/session/*`,
  `lib/interview/evaluation{,-runner}.ts`, `lib/scenario/evaluation{,-runner}.ts`,
  `lib/interview/report-dto.ts`, `lib/scenario/report-dto.ts` — are collapsed into
  the engine, not left standing beside it.

- **REQ-60** — [x] An interaction type is a TypeScript config record plus prompts.
  Adding one touches no engine module, no route, no evaluator and no report page.
  Config lives in code (type-checked, reviewable in git), not S3 or Postgres.

- **REQ-61** — [x] A session resolves from two layers: a built-in TYPE (code record —
  rubric dimensions, prompts, limits, primitives) plus an optional student-authored
  INSTANCE (S3 data — role, situation, avatar, criteria). Phase 9's `CaseStudy`
  scenarios are instances under this model, not a separate pipeline.

- **REQ-62** — [x] `terminationPolicy` is an engine primitive: a type declares who may
  end a session, including an AVATAR-INITIATED end, and the reason is recorded on the
  report. Nothing but the student can end a session today. Built in Phase 13 even
  though Phase 14 is its first consumer.

- **REQ-63** — [x] A per-turn VISIBLE-CONTEXT slice is an engine primitive: a type
  controls what the avatar may see on a given turn, as distinct from everything the
  session knows. Modelled generally, not as slide bookkeeping.

  **VERIFIED 2026-10-04.** `scripts/verify-deck-visible-context.ts` passes the
  real deck turn-assembly boundary: no deck text before reveal, only the revealed
  prefix afterward, a monotonic high-water mark, hostile-index rejection, and no
  sentinel in the byte-identical system prompt. The proof is recorded in
  `13-VISIBLE-CONTEXT-PROOF.md`; see `17-03-SUMMARY.md` for its precise scope.

- **REQ-64** — [x] A type-declared OUTCOME record (JSON) persists structured session
  results, and an explicit TIME BUDGET is an engine concept carried in the existing
  per-turn tail block, never in the system prompt.

- **REQ-65** — [x] One `InteractionReport` table replaces `InterviewReport` and
  `ScenarioReport`. Per-type input is one JSON `inputSnapshot` typed in TypeScript;
  scores are a JSON map keyed by dimension. The old tables are dropped, not kept
  beside it.

- **REQ-66** — [x] Every existing report is backfilled into `InteractionReport` and
  renders identically at its existing URL — scores, metrics, body-language section,
  Moments and snapshot strip intact. This is the acceptance test for the backfill.

  **CLOSED 2026-10-04 WITH A CAVEAT, not on a passing test.** Human decision;
  evidence and full reasoning in `13-CLOSE-RECORD.md` §3.

  **MET on local, demonstrably:** 67 `InterviewReport` + 3 `ScenarioReport` → 70
  `InteractionReport` on `leadership_avatar_dev`;
  `scripts/verify-interaction-report-backfill.ts` exited 0 with count,
  field-fidelity, null-preservation and idempotency sections passing (70 → 70 on a
  second run); commits `1eafa7b`, `981f835`; plan 13-14's human acceptance test
  nine-for-nine PASS. See `13-04-SUMMARY.md`, `13-14-SUMMARY.md`.

  **VACUOUS on shared, and unsatisfiable there by construction:** the shared
  Lightsail DB was EMPTY when all 14 migrations were applied (0 users, 0 attempts,
  0 reports of either kind), so there were no reports to backfill or re-render —
  the backfill would have copied zero rows and was never run against shared. The
  verifier *cannot* pass there: it hard-asserts at least one legacy
  `cameraMode IS NULL` row exists (lines 266, 271). Local is the only place this
  test could ever have run, and it ran. The legacy tables are now dropped, so no
  future pre-Phase-13 row can appear to re-open this.

- **REQ-67** — [x] The Phase 13 migration is applied to the LOCAL dev database only.

  **CORRECTED 2026-10-04.** No agent connects to the shared Lightsail database,
  Vercel Preview, or Production — not for a migration and not
  even for a read-only `SELECT`. A human applies migrations to those targets. That
  rule bound agents throughout and continues to bind them.

  From the day `vercel.json`'s `buildCommand` gained `prisma migrate deploy` until
  2026-10-04, however, every deployment applied pending migrations automatically
  and unreviewed to the databases behind the Preview and Production secrets. That
  included the project's first `DROP TABLE`; see `.planning/HANDOFF.md` §3 and its
  2026-10-04 preview-build incident. The rule never bound CI, and the documents did
  not say so.

  REQ-74 / Phase 17 plan 17-01 removed `prisma migrate deploy` from
  `buildCommand`, making the rule true of the pipeline as well as agents. A human
  now follows `docs/MIGRATIONS.md` to apply a schema change to its target before
  deploying code that depends on it. The Phase 13 migration was human-applied to
  shared on 2026-10-04; `prisma migrate status` reported 14 of 14 applied and
  `Database schema is up to date!`.

- **REQ-68** — [x] All engine-backed sessions live under one `/practice/[type]` tree —
  session at `/practice/[type]/[instanceId?]`, report at
  `/practice/[type]/report/[reportId]`. `/interview/*` and `/case-play/*` session and
  report paths become permanent redirects so existing deep links keep resolving.

- **REQ-69** — [x] Phase 13 is an INVISIBLE refactor. The shared session shell and
  report page reproduce today's interview and case-play appearance exactly; the changed
  URL is the only sanctioned visible difference. The two experiences' existing
  divergences (scenario has no checkpoint; report chrome differs) are PRESERVED, not
  converged. A divergence that cannot be preserved is a CHECKPOINT, not an executor
  judgment call.

- **REQ-70** — [x] One generic pre-session wizard owns step machinery, progress,
  back/forward, the camera-mode consent gate and launch. A type declares its steps; a
  step needing custom UI supplies its own component. The consent gate exists once, not
  once per type.

- **REQ-71** — [x] Rubric dimensions are four shared (Visual, Vocal, Content,
  Behavioral) plus type-declared extras. The evaluator's JSON schema becomes
  type-derived — `lib/report/structured.ts`'s hardcoded
  `required: ["visual","vocal","content","behavioral"]` keeps those four always
  present and appends the type's extras.

- **REQ-72** — [x] Visual and Vocal are never type-optional. Every engine-backed type
  carries them with the full four-state handling from Phases 10 and 12 (scored /
  `CAMERA_OFF_OPTOUT` / `TYPED_ONLY` or `SPEECH_TOO_SHORT` / `INSUFFICIENT_DATA`). A
  type never wires metrics, so it can never forget to.

- **REQ-73** — [x] The assembled system prompt stays session-constant so the OpenAI
  prefix cache still hits (REQ-20 unchanged), and per-turn state stays in the tail
  block. Unification must not move per-turn data into the system prompt.

---

# Milestone v1.1 — Consequence & Deck Breadth

**Derived 2026-10-04** from
`.planning/phases/14-practice-pitches/deferred-items.md` and the four design
decisions locked in `/gsd:new-milestone` questioning. Phases 14–16 tracked
success criteria instead of REQ IDs; v1.1 returns to REQ IDs, continuing from
REQ-73.

**Locked decisions (v1.1):**
1. Temperature is **derived from observable signals, gated by avatar self-report** — signals drive the value, the avatar's own emitted cue can accelerate it.
2. Temperature is **invisible during the session**, explained in the report afterward.
3. Deck modes are **one TYPE record per mode** — funding request, product pitch, deck-led talk, and a deliberately general deck pitch.
4. The temperature mechanism is an **engine primitive each TYPE opts into via config**, extending Phase 13's `terminationPolicy` / `avatarEndFloor` rather than adding a parallel mechanism.

## Requirements

### Phase 17 — v1.0 Close-Out

- **REQ-74** — [x] **RE-SCOPED 2026-10-04.** The migration work this requirement
  originally described is ALREADY DONE: `HANDOFF.md §3` (commit `9a53084`, "correct
  the migration record after the shared-DB run") records all 14 migrations applied
  to the shared Lightsail DB, `Database schema is up to date!`, nothing pending or
  held. `13-MIGRATION-HANDOFF.md`'s "DEFERRED by human — still OPEN" is STALE.

  What replaces it is the governance contradiction that run exposed:
  `vercel.json`'s `buildCommand` is
  `touch .env && prisma generate && prisma migrate deploy && next build`, so every
  deployment applies pending migrations automatically and unreviewed. A preview
  build on 2026-10-04 applied `add_interaction_report_title` to a database already
  holding the first `DROP TABLE` in this project's history, with no human run and no
  `pg_dump`. REQ-67's "no agent applies it; a human runs `prisma migrate deploy`"
  therefore does not describe this project's actual behavior and has not since
  `vercel.json` gained that command.

  **Decided:** `prisma migrate deploy` is REMOVED from `buildCommand`, making the
  pipeline match the documented discipline rather than amending the discipline to
  match the pipeline.

  **The removal is not sufficient on its own.** Deploys will stop self-migrating, so
  a schema change must be applied deliberately BEFORE the deploy that depends on it,
  or the app serves 500s on a missing column. This requirement is met only when the
  replacement procedure is documented and the stale documents are reconciled —
  `HANDOFF.md §3`, `13-MIGRATION-HANDOFF.md` and REQ-67 must stop contradicting each
  other and reality. Safe to do now: all 14 migrations are applied everywhere, so
  nothing is pending at the moment of removal. Phase 18 is the first consumer that
  will need the new procedure.

  Also closed under this requirement: **confirm what the Production `DATABASE_URL`
  secret actually points at.** It is write-only (Vercel "Sensitive"), the account has
  no marketplace integrations, and the `la_db_*` secrets are orphaned leftovers
  pointing at a store that no longer exists. **CONFIRMED 2026-10-04 by human report:**
  Production `DATABASE_URL` points at shared Lightsail; see `17-02-SUMMARY.md` and
  `17-CLOSE-RECORD.md`.

  **SUPERSEDED 2026-10-04 — REQ-66 and REQ-67 no longer close under this
  requirement.** They were closed directly against Phase 13 with the recorded
  caveat this paragraph specified, in `13-CLOSE-RECORD.md` §3, so that a 15/15
  phase did not stay open on bookkeeping. The caveat is unchanged: the shared DB
  was found EMPTY (0 users, 0 reports of either kind), the backfill was a no-op and
  was never run against shared, its verifier *cannot* pass there, and REQ-66's
  acceptance test passed on local (70 rows) — the only place it ever could.

  **REQ-74 is complete**: the `buildCommand` removal, replacement procedure,
  stale-document reconciliation, and human-reported Production `DATABASE_URL`
  confirmation are recorded above and in `17-CLOSE-RECORD.md`. REQ-67's earlier
  tick did not itself establish this governance work.

- **REQ-75** — [x] REQ-63's per-turn visible-context slice is verified against a real
  multi-channel session — the avatar's context provably contains only the declared
  visible channels for that turn — and REQ-63 is checked off. The primitive already
  exists (`lib/engine/types.ts` `visibleContext`, sliced in `lib/engine/prompts.ts`);
  this requirement is evidence, not construction. Evidence:
  `13-VISIBLE-CONTEXT-PROOF.md` and `scripts/verify-deck-visible-context.ts`.

- **REQ-76** — [x] `scripts/verify-deck-intake.ts` passes every assertion. The
  fixture/assertion mismatch between `scripts/generate-deck-fixtures.ts`
  (`"Spike Deck Title"`) and `scripts/spike-deck-render.ts`
  (`"Spike Deck Slide 1"`) is resolved by making the harness and its fixture agree
  on one source, not by loosening the assertion. Evidence: `17-04-SUMMARY.md`,
  `scripts/verify-deck-intake.ts`, and `scripts/fixtures/deck-two-slide.pptx`.

- **REQ-77** — [x] The keyboard UAT deferred under `skip_checkpoints` on Phases 15
  and 16 is discharged, with the result recorded in each phase's validation file.
  A failure found here is logged as a defect, not silently repaired as part of UAT.
  Pass 1's thirteen checks were human-reported PASS with no reported defects;
  `17-KEYBOARD-PASS-1.md` records the evidence limitation and no-op repair ledger.
  Pass 2 for the surfaces Phases 18 and 19 add is Phase 19's closing obligation.

### Phase 18 — Avatar Disengagement & Walk-Out

- **REQ-78** — [ ] The engine carries a per-turn DISENGAGEMENT value computed from
  observable session signals — elapsed time against the budget, turn count,
  repetition, response length, whether the student established common ground. The
  computation is deterministic and tunable without a model call.

- **REQ-79** — [ ] The live avatar can emit a disengagement cue in its per-turn
  structured output, and that cue ACCELERATES the derived value rather than
  replacing it. A self-reported cue alone cannot end a session, so the
  role-playing model never has sole authority over its own patience.

- **REQ-80** — [ ] A type declares a disengagement THRESHOLD in config. Crossing it
  is what triggers a walk-out; a type that declares no threshold behaves exactly as
  it does today. Adding the capability touches no type that does not opt in.

- **REQ-81** — [ ] Crossing the threshold plays exactly one final avatar statement
  that the student can neither interrupt nor respond to — push-to-talk and the text
  input are closed for its duration.

- **REQ-82** — [ ] After that final statement the session ends automatically and
  generates a report, without the student pressing End-session.

- **REQ-83** — [ ] The auto-ended session is recorded as a FAILURE instance with an
  avatar-initiated termination reason — not a neutral finish and not an error state.
  It reuses Phase 13's `terminationPolicy` outcome record rather than adding a
  parallel field.

- **REQ-84** — [ ] A walk-out can never fire before the type's `avatarEndFloor`
  minimum assistant turns, so no student is abandoned on the opening turn.
  `lib/pitch/deck-type.ts` gains a real floor in place of its current
  `avatarEndFloor: null`.

- **REQ-85** — [ ] No disengagement indicator, meter or warning appears in the
  session shell at any point. The student learns they were losing the room from the
  report, never from a gauge.

- **REQ-86** — [ ] The report explains the decline: when engagement fell and what
  the student was doing at those points, on the session clock, consistent with
  Phase 12's episode-timeline convention. Nothing the pipeline cannot observe is
  asserted as a cause.

### Phase 19 — Deck-Led Pitch Family

- **REQ-87** — [x] Four new deck-led TYPE records are playable alongside the
  existing investor `pitch-deck`: a funding request (an ask amount, no equity and no
  valuation band), a product pitch (outcome is interest and objections, not terms),
  a deck-led talk (a presentation with Q&A, no ask), and a general deck pitch with
  no mode-specific constraints.

- **REQ-88** — [x] All five deck types share one deck capability — upload, per-slide
  text and images, the server-authoritative slide cursor and high-water mark, the
  visible-context slice and the soft session timer. The shared behavior is reused
  from Phase 14, not duplicated per mode.

- **REQ-89** — [x] Negotiation inputs are ABSENT from the types that have no terms
  to negotiate — no ask price and no offered equity on a product pitch or a deck-led
  talk — rather than present-but-optional or hidden behind a disabled field.

- **REQ-90** — [x] Each mode declares its own rubric dimensions and its own outcome
  shape, so a funding request is not scored against an equity split and a deck-led
  talk is not scored against a close.

- **REQ-91** — [x] A student reaching a deck mode goes through the one generic
  pre-session wizard with mode-appropriate steps. No second wizard and no new
  camera-consent gate is introduced (REQ-70 unchanged).

- **REQ-92** — [x] The one report page renders every mode's outcome through the
  existing `ReportChrome` extras slot. No per-mode report page and no edit to the
  shared report page is required to add a mode.

- **REQ-93** — [x] Adding these four modes touches no engine module, no route, no
  evaluator and no report page — REQ-60 holds under its first real test since the
  engine shipped. A mechanical guard proves it, in the spirit of Phase 16's
  surface-count script.

- **REQ-94** — [ ] The Practice Pitches picker presents the deck modes alongside the
  elevator pitch and the investor deck, with each mode's purpose distinguishable
  before a student commits to one.

### Phase 20 — Difficult Conversation Walk-Outs

- **REQ-95** — [ ] The `difficult-conversation` TYPE record declares a
  `disengagementThreshold`, so all seven seeded conversations and every
  student-authored scenario inherit the walk-out from one type-level number. No
  per-scenario field, no authoring surface, nothing for an author to
  misconfigure.

- **REQ-96** — [ ] Hostility signals are added to the engine's observable cause
  vocabulary — insults and profanity directed at the avatar, escalation and
  aggression, stonewalling, and slurs/harassment as a separate severe category —
  computed DETERMINISTICALLY. The avatar's structured cue may accelerate the
  value but can never end a session on its own (REQ-79's invariant holds).

- **REQ-97** — [ ] Firm, uncomfortable, non-hostile language never trips the
  walk-out. Only language targeting the PERSON counts, never language targeting
  the position or performance. Proven against the register the seven seeded
  confrontation scenarios actually require.

- **REQ-98** — [ ] A caller-supplied, observable signal records that the student
  never acknowledged the avatar's position — the live twin of Phase 15's
  `empathy` dimension — defaulting to false so no model prose counts as live
  evidence merely by existing (REQ-80's posture).

- **REQ-99** — [ ] Ordinary hostility ACCUMULATES across turns and the value
  ratchets one-way. There is no decay and no apology-driven recovery, preserving
  Phase 18's `computeDisengagementOverTranscript` fix.

- **REQ-100** — [ ] Severe content — slurs, harassment, threats — ends the
  session regardless of `avatarEndFloor`, as a NAMED, enumerated, tested
  carve-out in `resolveTermination`. Phase 18 Success Criterion 5 and
  `scripts/verify-disengagement-termination.ts` are amended deliberately to
  record the exception, never weakened or deleted. The floor stays at
  `minAssistantTurns: 4` for every other trigger.

- **REQ-101** — [ ] The avatar always leaves IN CHARACTER, for every trigger
  including severe content — one ending path, no break-frame branch in the
  session shell. Reason codes distinguish the cause: hostility → `escalated`,
  stonewalling → `nothing_left_to_discuss`, plus one new reason for the severe
  category. Phase 15's support note and always-visible End-session control
  survive an avatar-initiated ending.

- **REQ-102** — [ ] The report explains what tipped the conversation on the
  session clock through Phase 15's existing `reactionCauses`
  `{ timecodeSeconds, quote, effect }[]` shape, with **explicit content
  sanitized rather than recited verbatim** — a slur is never reproduced back to
  the student. No rubric dimension is capped: `postProcessScores` stays absent,
  preserving Phase 15's recorded decision.

## Out of Scope (v1.1)

| Feature | Reason |
|---------|--------|
| A live engagement meter in the session shell | Locked decision 2 — it makes the student optimize a gauge instead of the conversation (REQ-85 enforces its absence) |
| Letting the avatar's self-report alone end a session | The model that is role-playing would be grading its own patience (REQ-79) |
| One widened `pitch-deck` type with a mode field | Rejected for conditional logic inside a single config record; one record per mode honors REQ-60 |
| Google Slides deck import | Permanently cut in Phase 14 — students export to PDF |
| A networking-setting selector (conference, coffee chat) | Deferred at Phase 16 and not pulled into v1.1 |
| Re-opening Phase 12 fidgeting measurement | Retired as unmeasurable, not deferred |
| Breaking character on a severe walk-out | Rejected 2026-10-08 — the avatar always leaves in character; a second ending path through the shell is not worth the clarity (REQ-101) |
| Per-scenario or author-settable disengagement thresholds | Rejected 2026-10-08 — one type-level threshold; authors do not tune a safety-adjacent number (REQ-95) |
| Capping rubric scores on an offense-triggered end | Rejected 2026-10-08 — `holding_the_line` and `empathy` already punish it on their own evidence; a cap double-counts and reverses Phase 15's deliberate `postProcessScores` omission (REQ-102) |
| Apology-driven recovery of the disengagement value | Rejected 2026-10-08 — a decaying value reverses Phase 18's ratchet fix (REQ-99) |
| Running the shared-DB migration or backfill | **Already applied** 2026-10-04 (`HANDOFF.md §3`, commit `9a53084`) — all 14 migrations on shared, nothing pending. Both Part 1 and Part 2 are done. Nothing to run. |
| Re-running the `InteractionReport` backfill verifier on shared | Unsatisfiable by construction — shared was empty (0 reports), so the backfill was a no-op and the verifier hard-asserts a legacy `cameraMode IS NULL` row that does not exist |
| Amending the docs to bless CI-applied migrations | Rejected 2026-10-04 — the opposite was chosen: `prisma migrate deploy` comes OUT of `buildCommand` so the pipeline matches the discipline (REQ-74) |

## Traceability (v1.1)

| Requirement | Phase | Status |
|-------------|-------|--------|
| REQ-74 | Phase 17 | Complete |
| REQ-75 | Phase 17 | Complete |
| REQ-76 | Phase 17 | Complete |
| REQ-77 | Phase 17 | Complete |
| REQ-78 | Phase 18 | Pending |
| REQ-79 | Phase 18 | Pending |
| REQ-80 | Phase 18 | Pending |
| REQ-81 | Phase 18 | Pending |
| REQ-82 | Phase 18 | Pending |
| REQ-83 | Phase 18 | Pending |
| REQ-84 | Phase 18 | Pending |
| REQ-85 | Phase 18 | Pending |
| REQ-86 | Phase 18 | Pending |
| REQ-87 | Phase 19 | Complete |
| REQ-88 | Phase 19 | Complete |
| REQ-89 | Phase 19 | Complete |
| REQ-90 | Phase 19 | Complete |
| REQ-91 | Phase 19 | Complete |
| REQ-92 | Phase 19 | Complete |
| REQ-93 | Phase 19 | Complete |
| REQ-94 | Phase 19 | Complete |
| REQ-95 | Phase 20 | Pending |
| REQ-96 | Phase 20 | Pending |
| REQ-97 | Phase 20 | Complete |
| REQ-98 | Phase 20 | Pending |
| REQ-99 | Phase 20 | Pending |
| REQ-100 | Phase 20 | Pending |
| REQ-101 | Phase 20 | Pending |
| REQ-102 | Phase 20 | Pending |

**Coverage:**
- v1.1 requirements: 29 total
- Mapped to phases: 29
- Unmapped: 0 ✓

REQ-95..REQ-102 were derived 2026-10-08 from `20-CONTEXT.md` after the user
settled its two open questions. Phase 20's roadmap entry had carried
`Requirements: TBD`.
