# Roadmap: CaseBridge Interview Practice

## Overview

An individual, self-directed interview practice tool inside the CaseBridge
leadership platform. A student picks an interviewer, uploads a resume, conducts a
live avatar interview grounded in that resume, and receives a rubric-aligned
performance report afterward. Phases 1-5 shipped the live interview itself;
Phase 6 makes the interview produce a durable, evaluated report. Later phases
open the launcher, add real video/audio metrics, and retire the
cohort/staff-oversight model the codebase inherited from its case-study origins.
Phases 13-16 generalize the one-on-one pipeline into a configurable engine and
then open the three interaction types that have sat as `coming-soon`
placeholders since Phase 7: practice pitches, difficult conversations and
networking practice.

**Note on provenance:** this roadmap was reconstructed on 2026-09-19 during a
mid-project handoff. Phases 1-5 are recorded from the shipped code on
`feature/interview-baseline`, not from a roadmap written up front — they predate
requirement tracking and carry no REQ IDs. Phase 6 onward is roadmapped properly.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: Interview Registry & Prompts** - Type registry and the two interview prompts
- [x] **Phase 2: Interviewer Catalog** - LiveAvatar avatar/voice pairs for selection
- [x] **Phase 3: Resume Ingestion** - PDF upload, text extraction, private S3 storage
- [x] **Phase 4: Interview Setup Flow** - Interviewer → resume → session wizard
- [x] **Phase 5: Live Session Shell** - Streamed avatar speech, push-to-talk, progress tracking
- [x] **Phase 6: Evaluation & Student Report** - Persist transcripts, evaluate, show the report (completed 2026-09-21)
- [x] **Phase 7: Interaction Dashboard** - Self-directed landing page that routes into interactions
- [x] **Phase 8: Interview Customization** - Preset variants plus industry/role/difficulty/length and interviewer personality
- [x] **Phase 9: Student-Authored Scenarios** - Students create their own practice scenarios (completed 2026-09-21)
- [x] **Phase 10: Video & Audio Metrics** - Populate the Visual and Vocal rubric categories
- [x] **Phase 11: Cohort & Staff Teardown** - Remove the assignment/monitoring wrapper (not case functionality) (completed 2026-09-23)
- [x] **Phase 12: Embodied Visual Signals** - Measure arms, posture and a visible phone (10/11 plans; fidgeting retired as unmeasurable; criterion 3 holds since 12-10. 12-11 settled posture drift — the row now responds correctly in BOTH directions and REQ-51 is MET. All three success criteria MET (criterion 1 carries a recorded phone duration under-count the user accepted). 12-08/12-09 remain [~] partially delivered — their work landed but their own sign-offs failed, and successors closed the gaps. 12-03's stale checkbox was corrected 2026-10-03) (completed 2026-10-04)
- [x] **Phase 13: One-on-One Conversation Engine** - Parameterize the interview pipeline so a new interaction type is a config record (15/15 plans; **CLOSED 2026-10-04** — REQ-66/REQ-67 closed with a recorded caveat; REQ-63 verified by Phase 17's REQ-75; see `13-CLOSE-RECORD.md` and `17-CLOSE-RECORD.md`)
- [x] **Phase 14: Practice Pitches** - Elevator pitch plus investor pitch-deck session with live slide gating and negotiation
- [x] **Phase 15: Difficult Conversations** - Role-assuming avatars, seeded catalog plus student-authored publishable scenarios (completed 2026-10-04)
- [x] **Phase 16: Networking Practice** - Practice against a described real person or a default character (completed 2026-10-04)
- [ ] **Phase 17: v1.0 Close-Out** - Discharge the shared-DB migration, REQ-63 verification, deck-intake fixture fix and deferred keyboard UAT
- [ ] **Phase 18: Avatar Disengagement & Walk-Out** - A session the avatar is losing actually ends, as a recorded failure with an explained decline
- [ ] **Phase 19: Deck-Led Pitch Family** - Four more deck-led pitch modes alongside the investor deck, sharing one deck capability
- [ ] **Phase 20: Difficult Conversation Walk-Outs** - The avatar leaves a difficult conversation when the student loses control of its hostility

## Phase Details

### Phase 1: Interview Registry & Prompts
**Goal:** A parameterized interview catalog and the prompts that drive and grade a session.
**Depends on:** Nothing
**Success Criteria** (what must be TRUE):
  1. A new interview variant can be added as a data record, not a new page.
  2. The live interviewer prompt is session-constant so the OpenAI prefix cache hits.
  3. Per-turn progress is injected at the message tail, never into the system prompt.
**Status:** Shipped — `lib/interview/types.ts`, `lib/interview/prompts.ts`

### Phase 2: Interviewer Catalog
**Goal:** Students pick from the LiveAvatar profiles this account can actually use.
**Depends on:** Nothing
**Success Criteria** (what must be TRUE):
  1. Only ACTIVE, usable avatars with a default voice are offered.
  2. Each avatar stays paired with its own default voice.
  3. Upstream failures surface as actionable errors, not an empty list.
**Status:** Shipped — `app/api/interview/interviewers/route.ts`

### Phase 3: Resume Ingestion
**Goal:** A student's resume PDF becomes interview context without ever becoming public.
**Depends on:** Nothing
**Success Criteria** (what must be TRUE):
  1. Only genuine PDFs under 10MB are accepted (magic-byte checked, not MIME-trusted).
  2. The original PDF is stored privately in S3 under a server-derived key.
  3. Only extracted text and an opaque resumeId return to the browser — never an S3 URL.
**Status:** Shipped — `app/api/interview/upload-resume/route.ts`, `s3Storage.saveInterviewResume`

### Phase 4: Interview Setup Flow
**Goal:** A student configures and launches an interview in two clear steps.
**Depends on:** Phase 2, Phase 3
**Success Criteria** (what must be TRUE):
  1. Interviewer selection and resume upload are separate, reversible steps.
  2. An unknown interview type slug is handled, not crashed on.
  3. A student can skip the resume and still start.
**Status:** Shipped — `app/interview/[type]/page.tsx`

### Phase 5: Live Session Shell
**Goal:** A real-time avatar interview that is type-agnostic by construction.
**Depends on:** Phase 1, Phase 4
**Success Criteria** (what must be TRUE):
  1. Avatar speech streams in speakable chunks as the model generates.
  2. A student can answer by voice (push-to-talk) or by typing.
  3. Interview stage/category progress advances server-legibly across a windowed transcript.
**Status:** Shipped — `components/interview/InterviewSessionShell.tsx`

### Phase 6: Evaluation & Student Report
**Goal:** Persist the interview transcript server-side, evaluate it with INTERVIEW_EVALUATOR_PROMPT, store a validated report, and give the authenticated student an owner-only page to read it.
**Depends on:** Phase 5
**Requirements:** REQ-01, REQ-02, REQ-03, REQ-04, REQ-05, REQ-06, REQ-07, REQ-08, REQ-09, REQ-10
**Success Criteria** (what must be TRUE):
  1. A student who finishes an interview lands on a report page and sees a rubric-aligned report appear without reloading.
  2. The transcript survives a browser close - it is stored server-side, not only in React state.
  3. Visual and Vocal render as "Not yet measured" rather than as invented scores.
  4. A student requesting another student's report gets a 404.
  5. A failed evaluation is visible and retryable, and never loses the transcript.
  6. The migration SQL exists for team review and has not been applied to the shared database.
**Plans:** 8/8 plans complete

Plans:
- [x] 06-01-PLAN.md — InterviewReport model + migration SQL, InterviewTranscript type, S3 transcript read/write
- [x] 06-02-PLAN.md — Evaluator module: JSON-mode call to INTERVIEW_EVALUATOR_PROMPT + score validation
- [x] 06-03-PLAN.md — Session start + checkpoint endpoints (owner-scoped, transcript to S3)
- [x] 06-04-PLAN.md — Finish endpoint with waitUntil background evaluation + FAILED-only retry
- [x] 06-05-PLAN.md — Owner-only GET report endpoint + private-field-stripping DTO
- [x] 06-06-PLAN.md — Session shell wiring: reportId lifecycle, checkpointing, End/Leave confirm modals
- [x] 06-07-PLAN.md — Report page: polling, skeleton, rubric cards, GFM markdown, retry
- [ ] 06-08-PLAN.md — End-to-end validation checkpoint + migration handoff note

### Phase 7: Interaction Dashboard
**Goal:** Replace the cases/cohorts landing experience with a self-directed dashboard where a student chooses a leadership interaction and is routed into it.
**Depends on:** Phase 6
**Requirements:** REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16
**Success Criteria** (what must be TRUE):
  1. A signed-in student lands on an interaction dashboard, not on assigned cases.
  2. A student can start a practice interview without being assigned one and without typing a URL.
  3. The dashboard lists interaction TYPES (interview today, others later) and routes into the right experience per type.
  4. Adding a new interaction type is a registry record, not a new page implementation.
  5. No surface on the student path depends on cohort membership or admin assignment.

**Plans:** 7/7 plans executed
- [x] 07-01-PLAN.md — `lib/interactions` registry: five interaction types, live/coming-soon
- [x] 07-02-PLAN.md — `published` flag on the S3 `CaseStudy` + filtered list endpoint + staff toggle
- [x] 07-03-PLAN.md — `/reports` list page and owner-scoped reports list endpoint
- [x] 07-04-PLAN.md — Interaction dashboard tiles, served at `/` for students
- [x] 07-05-PLAN.md — `/case-play` published-case index page
- [x] 07-06-PLAN.md — Delete `/student-cases`, move settings to `/settings`, rebuild nav + middleware, repoint every link
- [x] 07-07-PLAN.md — Static constraint sweep + human end-to-end walkthrough

**Planning note (2026-09-21):** REQ-15 requires NO database migration. See the correction in
REQUIREMENTS.md — the Prisma `Case` table is a decoy; the real cases are S3 JSON.

**Design notes captured 2026-09-20 (user):** the cases/cohorts model — admin
assigns cases to students and monitors them — is obsolete. Students are fully in
control: no assignment, no monitoring. `/interview/general` is currently
reachable only by typing the URL; navigation must lead there. The dashboard is
deliberately one level ABOVE interview: interview is one kind of leadership
interaction, and the dashboard is the branch point for future kinds. Do not
hard-code the landing page to the interview experience.

### Phase 8: Interview Customization
**Goal:** A student picks an interview preset and can optionally tweak industry, role, difficulty, session length and interviewer personality.
**Depends on:** Phase 7
**Requirements:** REQ-17, REQ-18, REQ-19, REQ-20, REQ-21, REQ-22, REQ-23, REQ-24
**Success Criteria** (what must be TRUE):
  1. A student selects a preset variant from the registry without typing a URL.
  2. A student can adjust industry, role, difficulty and session length before starting.
  3. A student can set the interviewer's personality, optionally from a pasted description of a real interviewer.
  4. The assembled prompt stays session-constant so the OpenAI prefix cache still hits.
  5. The report shows which customization produced it.

**Criteria amended 2026-09-21** during `/gsd:discuss-phase 8`: student-selectable
session length (criterion 2) and interviewer personality (criterion 3) were decided
in scope; criterion 5 follows from the report decision. The original three criteria
omitted them. See `08-CONTEXT.md`.

**Plans:** 8/8 plans complete

Plans:
- [x] 08-01-PLAN.md — Preset catalog, curated option lists, and the validating `resolveInterviewType`
- [x] 08-02-PLAN.md — `InterviewReport` customization columns (local-dev migration) + DTO
- [x] 08-03-PLAN.md — One-shot pasted-profile persona distillation endpoint
- [x] 08-04-PLAN.md — Resolver at both prompt call sites, persist at start, fix the evaluator blind spot
- [x] 08-05-PLAN.md — Preset picker page with the collapsed Customize panel; dashboard tile repointed
- [x] 08-06-PLAN.md — Wizard handoff, per-turn resend, length-aware progress tracking
- [x] 08-07-PLAN.md — Customization strip on the report page
- [x] 08-08-PLAN.md — Static constraint sweep + human end-to-end walkthrough (non-autonomous)

### Phase 9: Student-Authored Scenarios
**Goal:** Students create their own practice scenarios rather than only consuming admin-authored cases.
**Depends on:** Phase 7
**Requirements:** REQ-25, REQ-26, REQ-27, REQ-28, REQ-29, REQ-30, REQ-31, REQ-32, REQ-33, REQ-34
**Success Criteria** (what must be TRUE):
  1. A student can author a scenario and immediately practice against it.
  2. A student's own scenarios are private to them unless deliberately shared.

**Scope note (2026-09-21, from `09-CONTEXT.md`):** a "scenario" here is a CASE-STYLE
ROLEPLAY (situation + one or more avatar characters) played in `/case-play` — explicitly
NOT a saved interview preset, which stays deferred. Visual/Vocal cannot score until
Phase 10 and must render "Not yet measured".

**Plans:** 9/9 plans executed

Plans:
- [x] 09-01-PLAN.md — CaseStudy.ownerId + ScenarioReport model + local-only migration
- [x] 09-02-PLAN.md — /api/scenario CRUD with server-side ownership, publish, delete guard
- [x] 09-03-PLAN.md — standard rubric prompt, schema-constrained evaluator, report DTO
- [x] 09-04-PLAN.md — cohort-free run start (snapshot), finish, evaluation runner, report GET
- [x] 09-05-PLAN.md — guided builder + avatar card-grid picker + create/edit routes
- [x] 09-06-PLAN.md — two-section /case-play with scenario cards and owner actions
- [x] 09-07-PLAN.md — case-play player branches onto the scenario start/finish pipeline
- [x] 09-08-PLAN.md — scenario report page (Visual/Vocal "Not yet measured", snapshot strip)
- [x] 09-09-PLAN.md — static constraint sweep + human end-to-end validation (avatar-picker catalog fixed under checkpoint)

### Phase 10: Video & Audio Metrics
**Goal:** Populate `visual_metrics` and `vocal_metrics` so the Visual and Vocal rubric categories score.
**Depends on:** Phase 6 — and effectively Phase 9 too, since `10-CONTEXT.md` brought
scenario reports into scope (the original line predates Phase 9's second report type).
**Requirements:** REQ-35, REQ-36, REQ-37, REQ-38, REQ-39, REQ-40, REQ-41, REQ-42, REQ-43, REQ-44, REQ-45, REQ-46, REQ-47, REQ-48, REQ-49
**Success Criteria** (what must be TRUE):
  1. Eye contact, framing, speech rate and filler counts are measured, not estimated.
  2. Reports generated before this phase remain valid with null scores.

**Plans:** 11/11 plans executed

Plans:
- [x] 10-01-PLAN.md — shared metric contract, qualitative bands, liveness-vs-performance discriminator
- [x] 10-02-PLAN.md — metric/camera-mode/unscored-reason columns on both report models + both DTOs
- [x] 10-03-PLAN.md — in-browser visual capture engine + self-view thumbnail + fold-away banner
- [x] 10-04-PLAN.md — vocal capture engine, word-timestamp STT route, evaluation-budget measurement
- [x] 10-05-PLAN.md — consent record/dialog + camera-mode snapshot on both session-start routes
- [x] 10-06-PLAN.md — widen both evaluators, rewrite the scenario prompt's metric clauses, inject real metrics
- [x] 10-07-PLAN.md — finish-route metric ingestion + both runners persist scores, metrics and unscored reasons
- [x] 10-08-PLAN.md — ReportScoreCards four-state rewrite with qualitative bands, wired into both report pages
- [x] 10-09-PLAN.md — interview wizard + session shell camera-mode gate, live affordances, metrics on finish
- [x] 10-10-PLAN.md — case-play scenario player camera-mode gate, live affordances, metrics on finish
- [x] 10-11-PLAN.md — static constraint sweep + human end-to-end validation (camera/mic/live UI)

### Phase 11: Cohort & Staff Teardown
**Goal:** Remove the assignment and monitoring wrapper from the student path. NOT a removal of case functionality — /case-play is the Case Study Scenarios interaction type and stays.
**Depends on:** Phase 7
**Success Criteria** (what must be TRUE):
  1. No user-facing surface depends on cohort membership or staff roles.
  2. Individual users create and own all of their own practice work.
**Plans:** 7/7 plans complete
Plans:
- [x] 11-01-PLAN.md — Delete the staff/assignment page trees + prune nav/dashboard/middleware links
- [x] 11-02-PLAN.md — Delete the dead app/api/student-history tree + lib/student-history-service.ts
- [x] 11-03-PLAN.md — Caller-map CHECKPOINT: per-route user decision on /api/cohort, /api/codes, /api/student/cases
- [x] 11-04-PLAN.md — Relax the /api/interaction/start cohortId guard + audit the neutralized student path
- [x] 11-05-PLAN.md — ADMIN/USER mapping helper in lib/auth.ts + middleware role gates
- [x] 11-06-PLAN.md — Sweep the remaining isPrivileged and role === "student" call sites onto the helper
- [x] 11-07-PLAN.md — Static constraint sweep + human end-to-end walkthrough + phase close

### Phase 12: Embodied Visual Signals
**Goal:** Make the body measurable. Phase 10's pipeline can only see a face, so hand
movement, posture, fidgeting and a phone in frame are invisible by construction — a
session spent waving both arms produced a report that said nothing about it.
**Outcome note (12-08):** three of the four landed. Fidgeting was found to be
unmeasurable at the hands model's achievable ~1.5 Hz sample rate — small, fast
motion cannot be resolved by a sampler whose observable reversal ceiling is
~0.75/s, so the readings were aliasing rather than measuring. It was retired to
permanently not-measured rather than shipped as a number that could not mean
what it said; REQ-52 is recorded NOT MET for that reason, and the capability
gap is carried in `deferred-items.md`. The three Success Criteria below are
unaffected — none of them names fidgeting.
**Depends on:** Phase 10 (metric contract, episode timeline, consent posture) and the
report restructure (REQ-53's scored-vs-descriptive distinction gates REQ-52).
**Requirements:** REQ-50, REQ-51, REQ-52, REQ-53, REQ-54, REQ-55, REQ-56, REQ-57, REQ-58
**Success Criteria** (what must be TRUE):
  1. Arm movement, posture and a visible phone are measured and tied to timecodes, not
     inferred from the transcript.
  2. A camera-on session running four models is indistinguishable from a camera-off run
     in avatar smoothness and response latency.
  3. Nothing the pipeline cannot observe is described as absent, and nothing reported
     descriptively is scored.

**Plans:** 11/11 plans complete — keyboard UAT deferred under skip_checkpoints → `/gsd/verify-work 15`

Plans:
- [x] 12-01-PLAN.md — Async stop() teardown + per-tick frame-budget instrumentation
- [x] 12-02-PLAN.md — Metric contract: scored body fields, structurally unscorable observations, provisional thresholds
- [x] 12-03-PLAN.md — Web Worker migration of face inference + staggered scheduler (REQ-57 gate)
      (checkbox was stale; corrected 2026-10-03 on four independent confirmations —
      `12-03-SUMMARY.md` on disk, commits `962c647`/`3f5e6c1`/`c83f6d6` all present,
      STATE.md recording it complete, and `gsd-tools phase-plan-index` never once
      listing it as incomplete across the 12-09/12-10/12-11 runs.)
- [x] 12-04-PLAN.md — Report surfacing: Body language subheading, unscored Observations section, kind-tagged Moments, evaluator contract
- [x] 12-05-PLAN.md — Vendor pose/hand/object models and run all four staggered in the worker
- [x] 12-06-PLAN.md — Scored derivations: posture baseline + drift, gesture curve, hands near face, new episodes
- [x] 12-07-PLAN.md — Descriptive derivations: fidgeting, phone in frame, absolute posture reading
- [~] 12-08-PLAN.md — Threshold tuning from real recordings + end-to-end phase sign-off
      (tuning complete; Task 3 sign-off RUN 2026-10-02 and FAILED on item 7 —
      an off-camera session reported "Posture drift: Held steady" and credited
      posture it never observed. Items 1-6 and criterion 2 passed; the frame
      budget came in at meanTickMs 35.6 against a 166.7ms interval.)
- [~] 12-09-PLAN.md — Posture-coverage gate + unreadable posture band + item-7 re-run
      (Tasks 1-2 shipped `91c85b3`/`a9a507f` — renderer refusal, episode filter and
      behaviourally-proven replay assertions all stand. Task 3 run 2026-10-02 and
      FAILED: the off-camera session's false "Held steady" became a false
      "Shifted from the opening posture" with timecodes. Root cause was one layer
      down — `isVisible` trusts MediaPipe's PREDICTED visibility score and never
      checks whether a landmark is inside the frame, so an extrapolated skeleton
      built off one visible arm cleared both gates. Gap carried by 12-10.)
- [x] 12-10-PLAN.md — Frame-bounds landmark gating, measured-first, item-1 third attempt
      (DELIVERED `307c96d`/`69ed830`. **Sign-off item 1 PASSES at last** — the
      off-camera session that defeated 12-08 and 12-09 now correctly reports the
      body as unreadable, so criterion 3 holds against it and REQ-53 is met.
      Item 2 passes, so a partially visible body is still scored. `isVisible`
      now requires in-frame coordinates AND the visibility floor, and
      `POSTURE_COVERAGE_MIN_RATIO` moved 0.25 -> 0.60 from two real dumped
      sessions; both halves were confirmed load-bearing. The plan's own fix was
      falsified in its simple form by its own Task 2 readings, and the readings
      exposed that 12-09's hands coverage gate had been entirely inert.
      CARRIED FORWARD: item 3 — a fully-in-frame deliberate slump still reported
      "Held steady", a false NEGATIVE on correctly-observed signals, so
      `POSTURE_DRIFT_TRIP`'s true-positive side has now been tested once and
      failed; and item 4 — phone confidence, never run, its dump removed unused.
      Both need a raw dump first and are handed to a follow-up plan. REQ-51
      stays open on the drift-scoring clause. See `12-10-SUMMARY.md` and
      `12-TUNING.md`.)
- [x] 12-11-PLAN.md — Is a slump measurable at all? Drift series + phone distribution, then repair or retire
      (DELIVERED `a854519`/`df02eee`. **A frontal webcam sees a slump fine —
      `forward_head` saturated its clamp — and two nested means were burying it.**
      Branch R: repaired, not retired. `computePostureDrift` now takes the WORST
      AXIS (a single-axis slump is capped at exactly 0.500 under a mean, so no
      cutoff could ever have caught it), `bandPostureDrift` now reads
      `posture_drift_max_s`, and `POSTURE_DRIFT_SUSTAINED_S` went 15 -> 8 and was
      wired up for the first time after being read by NOTHING for three plans —
      at 15 the genuine 12.0s slump would still have failed, proven by reverting
      that constant alone. **Task 4 PASSED in full: the first time in the phase
      the scored posture row has been seen to respond correctly in BOTH
      directions on one build**, with the independent episode path agreeing.
      REQ-51 is **MET**. 12-10's "the sign may be backwards" claim about
      `forwardHeadOffset` is WITHDRAWN — it was the strongest responder.
      CARRIED FORWARD: `PHONE_SCORE_THRESHOLD` is still undecided (its
      true-positive side has never been observed in any plan; the dump was
      deliberately KEPT this time) and `forward_head` saturates, so the channel
      cannot support severity wording. See `12-11-SUMMARY.md` and `12-TUNING.md`.)

**Phase 12 is NOT complete.** What remains:

1. **`PHONE_SCORE_THRESHOLD` is unvalidated, and it blocks criterion 1.** The
   only phone data that exists is the no-phone false-positive floor (two sessions,
   zero detections at or above 0.5, 0.0s correctly reported). The true-positive
   side has never been observed across 12-07, 12-09, 12-10 or 12-11, and the user
   earlier observed a sustained in-frame phone reported as "about 2 seconds",
   which suggests UNDER-detection. One timed phone-held session with
   `NEXT_PUBLIC_PHONE_CONFIDENCE_DEV_DUMP=1` settles it; the dump is in place and
   must not be removed first.
2. **12-03's checkbox is almost certainly STALE — FLAGGED, NOT FLIPPED.** It is
   listed `[ ]` above, but `12-03-SUMMARY.md` exists in the phase directory AND
   `STATE.md` records it as *complete* with three commits (`962c647`, `3f5e6c1`,
   `c83f6d6`), noting the Task 1 spike settled the ES-module worker question on
   the first attempt. So the worker migration very likely shipped and this
   checkbox was never updated — but 12-11's executor did not flip it, because
   changing a phase's executed-plan count on inference rather than instruction is
   exactly the kind of unearned claim this phase has been burned by. **It needs a
   human confirmation, and it changes the plan count from 9/11 to 10/11.**
3. **The posture evidence base is two sessions**, one per direction, labelled SET
   FROM ONE REAL SESSION rather than TUNED. `POSTURE_DRIFT_SUSTAINED_S` is
   bounded from above only. Re-tuning against real student sessions is carried in
   `deferred-items.md`.

**Criterion assessment at 12-11's close, amended 2026-10-03.** Criterion 2 MET
(12-08: `meanTickMs` 35.6 against a 166.7ms interval; reconfirmed at 12-10 and
12-11 at 25.2 and 31.9). Criterion 3 MET (12-10 item 1, reconfirmed at 12-11).

**Criterion 1 — MET, with one limitation recorded.** Arm movement and posture are
measured, timecoded, and now demonstrably work in both directions. The phone's
true positive was finally run on 2026-10-03 and it fires: "A phone was visible
for about 8 seconds" with a `0:11-0:21 [Observation] Phone visible` Moments row.

The reported duration UNDER-COUNTS a longer real hold. The user reviewed this and
accepted it — *"as long as it's generally accurate, it's really not the most
important of things"* — a deliberate scope decision, not an unexamined pass.

This was assessed as PARTIALLY MET before that session, on the reasoning that the
phase had twice shipped a signal literally "measured and timecoded" while unable
to report the behaviour it named. That concern does not survive contact with the
result, for a reason specific to this signal: the phone is a `12-07` DESCRIPTIVE
observation — rendered under "These do not affect any score", tagged
`Observation` rather than `Body language`, and structurally barred from feeding
any scored field. An imprecise duration there is a precision defect. Posture
drift's false negatives were categorically worse: a SCORED row praising a student
for behaviour they did not exhibit.

`PHONE_SCORE_THRESHOLD` stays at 0.5 — false-positive side well bounded (spurious
ceiling 0.163 across two no-phone sessions), true-positive side now demonstrated.
The under-count's cause was NOT isolated: it may be the threshold, or the object
model's ~0.5 Hz sampling (53 ticks in 108s), and the raw confidence series for a
phone-held session was never captured. See `12-TUNING.md` — a future attempt must
re-add the dump rather than assume the threshold is at fault.

### Phase 13: One-on-One Conversation Engine
**Goal:** Generalize the interview pipeline into a parameterized one-on-one
conversation engine, so that a new one-on-one interaction type is a
configuration record plus prompts rather than a duplicated route tree. Today
`pitches`, `difficult-conversations` and `networking` sit in
`lib/interactions/registry.ts` as `route: null`, `coming-soon` placeholders;
the session start/checkpoint/finish routes, the evaluator and the report page
all exist twice already (interview and scenario) and must not exist five times.
**Depends on:** Phase 12 (the body-metric contract and worker scheduler are the
last pieces the engine has to carry for every type), Phase 8 (persona
distillation and the session-constant prompt resolver), Phase 10 (metric
ingestion).
**Requirements:** REQ-59, REQ-60, REQ-61, REQ-62, REQ-63, REQ-64, REQ-65, REQ-66,
REQ-67, REQ-68, REQ-69, REQ-70, REQ-71, REQ-72, REQ-73
**Source:** derived from the user's brief —
`.planning/one-on-one-interactions-brief.md` — whose premise is that any
one-on-one interaction is configurable through parameterized requests without
rebuilding infrastructure per type.
**Success Criteria** (what must be TRUE):
  1. A new one-on-one interaction type ships as a config record plus prompts — no
     new session route, finish route, evaluator module or report page per type.
  2. The existing interview and case-play experiences run on the shared engine
     with no behavior regression: same prompts, same OpenAI prefix-cache hit,
     same metric ingestion.
  3. Per-type rubric dimensions are declared in config, and the report page
     renders them without knowing which interaction produced them.
  4. Visual, vocal and body metrics from Phases 10 and 12 reach every
     engine-backed interaction without per-type wiring.
**Plans:** 15/15 plans complete
**Status:** **CLOSED 2026-10-04** — see `13-CLOSE-RECORD.md`. REQ-66 and REQ-67
closed with a recorded caveat rather than a passing test (the shared DB was empty,
so the backfill acceptance test is unsatisfiable there and passed on local only;
REQ-67 closed on its human-run clause, not on "no agent applies it", which
`vercel.json` had been violating). **REQ-63 was verified 2026-10-04** by Phase 17
REQ-75 / plan 17-03; `13-VISIBLE-CONTEXT-PROOF.md` records the cursor-gated deck
turn-assembly proof. See `17-CLOSE-RECORD.md`.

Plans:
- [x] 13-01-PLAN.md — Engine config layer: TYPE records + INSTANCE resolver
- [x] 13-02-PLAN.md — `InteractionReport` model, additive CREATE TABLE migration, unified DTO
- [x] 13-03-PLAN.md — Engine primitives: terminationPolicy, visible-context slice, outcome record, time budget
- [x] 13-04-PLAN.md — Backfill script, local backfill run, row-for-row verification, REQ-67 human handoff
- [x] 13-05-PLAN.md — Type-derived rubric schema, one evaluator, one evaluation runner
- [x] 13-06-PLAN.md — Generalize the chat/turn endpoint onto engine config (prefix cache preserved)
- [x] 13-07-PLAN.md — One session lifecycle: start/checkpoint/finish, legacy routes delegate
- [x] 13-08-PLAN.md — One report GET/retry/list, legacy report routes delegate
- [x] 13-09-PLAN.md — One generic pre-session wizard with a single camera consent gate
- [x] 13-10-PLAN.md — One generic session shell, `/practice/[type]` switched onto it
- [x] 13-11-PLAN.md — Case-study type on the engine; case-play becomes a dispatcher, legacy branch untouched
- [x] 13-12-PLAN.md — One report page rendering config-declared rubric dimensions
- [x] 13-13-PLAN.md — Permanent redirects, link rewiring, deletion of the per-type trees
- [x] 13-14-PLAN.md — REQ-66 acceptance test: pre-Phase-13 reports at their OLD URLs (non-autonomous)
- [x] 13-15-PLAN.md — DROP TABLE migration as its own declinable step + human handoff

### Phase 14: Practice Pitches
**Goal:** Ship the Practice Pitches interaction with its two sublayers — a strict
30-60 second elevator pitch judged on concision and on tailoring to the specific
listener, and a timed investor pitch-deck session where the student clicks
through an uploaded deck while the avatar sees only the slides shown so far and
negotiates terms.
**Depends on:** Phase 13
**Scope note (2026-10-02, SUPERSEDED):** the original note recorded PDF,
PowerPoint and Google Slides all in scope, with the Drive OAuth scope, token
storage and Drive API read called out as the largest single piece of the phase.
**Scope note (2026-10-02, amended during `/gsd:discuss-phase 14`):** Google
Slides is CUT — permanently, not deferred. Deck upload accepts **PDF and PPTX
only**; no Drive OAuth scope, no stored Drive tokens, no Drive API read. A
student with a Slides deck exports to PDF. Criteria 2, 3 and 5 below were
amended in the same session; see `14-CONTEXT.md`.
**Success Criteria** (what must be TRUE):
  1. The elevator pitch enforces a 30-60 second window; avatar engagement follows
     from concision and from whether the student found common ground first, and a
     tedious pitch can end the conversation early as a recorded failure rather
     than a neutral finish.
  2. A deck uploaded as PDF or PPTX becomes per-slide text plus server-rendered
     slide images stored privately, and a file that is not a readable deck is
     rejected with a reason and a fix instead of a broken session.
  3. The student advances slides live, and the avatar's context contains only
     slides the student has actually shown — never content from a slide not yet
     reached, and navigating backward does not un-show what the avatar already
     saw.
  4. The report scores deck structure, text density and the appearance of the
     rendered slides alongside vocal delivery, and the negotiation outcome is
     recorded as the student's ask versus the settled terms versus the scenario's
     fair-value band.
  5. Session length is proposed from slide count within a 20-30 minute envelope
     and is student-adjustable before starting; the remaining time is visible
     during the session and can be hidden by the student.
**Plans:** 15/15 plans executed — Phase signed off 2026-10-04
**Gate:** every plan except 14-01, 14-03, 14-06 and 14-07 is blocked until Phase 13's
15 plans have all executed and been signed off. Phase 14 has no REQ IDs; each plan
names the Success Criteria it serves as `P14-SC1`..`P14-SC5` in its `requirements`
frontmatter. 14-01 is the one plan safe to run before Phase 13 lands, and it is the
one whose outcome the whole deck pipeline depends on. Four plans declare explicit
Phase 13 extensions (most notably `pitch-deck` → `checkpointing: "client-driven"`,
which Phase 13 withheld from `case-study`); 14-15 Section 4 collects them as the
Phase 13 revision handoff.

Plans:
- [x] 14-01-PLAN.md — Deck-rendering spike: prove PDF→PNG on Vercel, select the PPTX conversion backend (decision checkpoint)
- [x] 14-02-PLAN.md — Engine config extensions: avatar-end floor, soft first-turn window, adjustable budget range, pitch instance + snapshot members
- [x] 14-03-PLAN.md — Deck intake: magic-byte validation, reason-plus-fix rejections, per-slide PDF and PPTX text
- [x] 14-04-PLAN.md — Evaluator extensions: slide images as vision input, outcome composed into the one JSON schema, type-declared score cap
- [x] 14-05-PLAN.md — Server-authoritative slide cursor: four nullable columns, additive local migration, checkpoint ratchet, clamped budget (human-verified)
- [x] 14-06-PLAN.md — PPTX→PDF conversion driver, PDF→PNG rasterizer, private deck storage and manifest
- [x] 14-07-PLAN.md — Deck upload route, manifest route, authenticated owner-only slide-image byte route (human-verified)
- [x] 14-08-PLAN.md — `pitch-elevator` type record and prompts: six dimensions, soft 60s window, floor-gated walk-out
- [x] 14-09-PLAN.md — `pitch-deck` type record and prompts: nine dimensions, slides channel, ask/fair band, session-length proposal
- [x] 14-10-PLAN.md — Elevator wizard steps and collapsible pitch timer, three real sessions judged (human-verified)
- [x] 14-11-PLAN.md — High-water mark in the live turn: ratchet, visible-context slice, tail-block delivery, prefix cache preserved
- [x] 14-12-PLAN.md — Deck wizard steps: upload with progress and specific errors, the ask, the adjustable length
- [x] 14-13-PLAN.md — Live deck viewer, thumbnail strip, soft session timer, real investor pitch leak test (human-verified)
- [x] 14-14-PLAN.md — Report surfaces: early-end outcome banner, ask vs settled vs fair, slide timeline and overrun (human-verified)
- [x] 14-15-PLAN.md — Phase validation: five criteria and every locked decision signed off; surface-count guard (human-verified)

### Phase 15: Difficult Conversations
**Goal:** Ship role-specific difficult conversations in which the avatar fully
assumes a stated role — confronting a low performer, firing someone, asking a
manager for a raise, challenging a professor over a grade — with a seeded
catalog plus student-authored scenarios that can be published to all users.
**Depends on:** Phase 13 (and reuses Phase 9's ownership/publish posture for
student-authored content).
**Success Criteria** (what must be TRUE):
  1. A seeded catalog of role-specific conversations is playable, and the avatar
     holds its role for the whole session instead of drifting into a coaching or
     narrator voice.
  2. A student can author their own difficult-conversation scenario and practice
     it immediately; it stays private until they deliberately publish it.
  3. A published scenario is playable by any user, and the authoring student
     remains its owner.
  4. The report judges how the conversation was handled — clarity, empathy,
     holding the line — not merely that the student reached the end of it.
**Plans:** 11/11 plans complete
**Gate:** every plan except 15-02, 15-03, 15-04 and 15-05 is blocked until Phase 13's
15 plans have all executed and been signed off. Those four are the Phase-13-independent
layer — the S3 record type and its validator, the authored-text structural injection
defense and the pre-publish check, the seeded catalog, and the five authoring routes —
and none of them imports `lib/engine/`. Phase 15 has no REQ IDs; each plan names the
Success Criteria it serves as `P15-SC1`..`P15-SC4` in its `requirements` frontmatter.
Four plans declare explicit Phase 13 extensions (the `InstanceConfig` and `InputSnapshot`
union members, the seeded-first instance resolver, a tail-block in-character reminder
fragment, a session-shell panel slot, and outcome surfacing on the one report DTO);
15-11 Section 4 collects them as the Phase 13 revision handoff. Phase 14's
`avatarEndFloor` (14-02) and `ReportChrome` extras slot (14-14) are **CONSUMED, not
re-declared** — because Phases 14 and 15 may execute in either order, 15-01 and 15-09
each carry a conditional: consume the field/slot if Phase 14 landed, otherwise add it in
Phase 14's exact declared shape so whichever phase lands second consumes it rather than
adding a parallel mechanism. Research Gap 1 is resolved in 15-01: the termination marker
gains **no** `source` attribute; an assistant-emitted marker always means
`source: "avatar"`, and the student's decisive in-character close is an explicit confirm
action distinguished from the out-of-band End-session control by its reason code.

Plans:
- [x] 15-01-PLAN.md — Engine extensions: instance + snapshot union members, avatar-end floor consumed, termination `source` resolved
- [x] 15-02-PLAN.md — New S3 record type, one validator, owner-scoped store, published-is-discovery-only play path
- [x] 15-03-PLAN.md — Structural injection defense (delimited, instruction-hierarchy authored text) + the two-thing fail-closed pre-publish check
- [x] 15-04-PLAN.md — Seven seeded conversations as code records, with live-catalog avatar assignment
- [x] 15-05-PLAN.md — Five authoring routes; the check re-runs on every publish-visible save
- [x] 15-06-PLAN.md — The `difficult-conversation` type record and prompts: anti-drift prohibition, per-turn tail reminder, eight dimensions, unscored outcome
- [x] 15-07-PLAN.md — Three-section catalog and six-field builder with honest publish verdicts (human-verified)
- [x] 15-08-PLAN.md — Briefing and difficulty steps, always-visible End-session control and support note, in-character close confirm (human-verified)
- [x] 15-09-PLAN.md — Report surfaces: eight dimensions, unscored outcome record, avatar-end banner, in-role reaction (human-verified)
- [x] 15-10-PLAN.md — Adversarial drift probe and approach-vs-result harnesses (human-verified)
- [x] 15-11-PLAN.md — Phase validation: four criteria and every locked decision signed off; surface-count guard (keyboard UAT deferred under skip_checkpoints → /gsd/verify-work 15)

### Phase 16: Networking Practice
**Goal:** Ship networking practice against a person the student brings in —
pasted LinkedIn text, their own written description, or AI-generated text —
distilled into an avatar persona, or picked from a set of default characters.
**Depends on:** Phase 13 (and reuses Phase 8's one-shot persona distillation
endpoint rather than adding a second distillation path).
**Scope note (2026-10-03, from `/gsd:discuss-phase 16`):** criterion 3's "stored
privately" refers to the DISTILLED persona, not the raw paste. The raw pasted
text stays ephemeral — the existing distill route's never-persisted contract is
preserved — and the distilled persona is saved as an owner-scoped, never
publishable instance. An attestation is recorded before a paste is accepted. The
networking SETTING (conference, coffee chat, …) is deferred, not built. See
`16-CONTEXT.md`.
**Success Criteria** (what must be TRUE):
  1. A student can paste a description of a real person and practice against a
     persona distilled from it, through the existing distillation path.
  2. A curated set of default characters is playable with no input at all.
  3. Pasted third-party text is stored privately and never appears in another
     student's session.
  4. The report judges rapport-building and the clarity of the student's
     self-introduction, not interview-style answer quality.
**Plans:** 11/11 plans complete
**Gate:** every plan except 16-01 is blocked until Phase 13's 15 plans have all
executed and been signed off. 16-01 — the AI person-generation route — is the one
plan safe to run before Phase 13 lands: it touches no engine file and its only
external dependency, `/api/interview/persona/distill`, already shipped in Phase 8,
so generate → edit → distill can be proven end to end today. Phase 16 has no REQ
IDs; each plan names the Success Criteria it serves as `P16-SC1`..`P16-SC4` in its
`requirements` frontmatter. Phase 16 declares two Phase 13 extensions — a
`kind:"networking-persona"` member on `InstanceConfig` (deliberately with NO
`published` field) and a `kind:"networking"` member on `InputSnapshot` — both landed
by 16-03, which also reconciles Phase 14's `avatarEndFloor` (14-02): whichever phase
executes first adds the field, the other reuses it, and 16-03 fails loudly if the
field exists without 14-02's enforcement. 16-11 Section 4 collects the extension list
as the Phase 13 revision handoff. **Decision 7's never-publishable requirement is
enforced by ABSENCE** — no `published` field, no publish route — guarded mechanically
by 16-11's surface-count script so a later reviewer cannot add parity with
`CaseStudy`. **The attestation is a new append-only `NetworkingAttestation` table**
(user + timestamp + wording version, single-use), not a `User` column: the research's
store-it-on-the-instance recommendation cannot gate the distill call because the
instance is created FROM the distilled persona. 16-02 carries the one additive
migration, applied to the LOCAL dev DB only with a declinable human handoff for the
shared Lightsail DB.

Plans:
- [x] 16-01-PLAN.md — AI person-generation route and prompt; generate → edit → distill proven against the Phase 8 route (safe before Phase 13; human-verified)
- [x] 16-02-PLAN.md — Attestation store: append-only table, additive local-only migration, versioned wording registry, single-use consume primitive (human-verified)
- [x] 16-03-PLAN.md — Engine config extensions: networking-persona instance member with no publishable concept, networking snapshot member, avatar-end-floor reconciliation
- [x] 16-04-PLAN.md — Owner-scoped persona store and three routes; cross-student 404; no publish surface
- [x] 16-05-PLAN.md — Shared distiller extraction, attestation route, and the gated networking distill route: consume before any model call
- [x] 16-06-PLAN.md — Five named fictional characters as code records, varied by seniority and field (human-verified)
- [x] 16-07-PLAN.md — The `networking` TYPE record and prompts: seven dimensions, hidden-goal visible-context slice, outcome record, floor-gated walk-away
- [x] 16-08-PLAN.md — Wizard steps: person choice with three bring-in modes and the attestation, the required goal, the reused avatar picker (human-verified)
- [x] 16-09-PLAN.md — Hidden-goal leak test: sentinel absent from every outbound payload on real turns, present in the evaluation context (human-verified)
- [x] 16-10-PLAN.md — Report surfaces: the ask/outcome/common-ground panel and the early-end feedback line (human-verified)
- [x] 16-11-PLAN.md — Phase validation: tile flip, surface-count and never-publishable guards, four criteria and every locked decision signed off (human-verified)


### Phase 17: v1.0 Close-Out
**Goal:** Close v1.0's evidence and governance gaps: prevent deployment-time schema
migration, prove the existing deck visible-context boundary, repair canonical fixture
ownership, and record the deferred Phase 15/16 keyboard UAT.
**Depends on:** Nothing (independent of Phase 18; may run in parallel with it)
**Requirements:** REQ-74, REQ-75, REQ-76, REQ-77
**Human-gated scope note:** No agent connects to shared Lightsail, Preview, or
Production at all, including for a read-only `SELECT`. That boundary never bound CI:
Vercel's former `buildCommand` applied migrations automatically. REQ-74 closes that
gap by removing the command rather than weakening the boundary. REQ-77's keyboard UAT
is human-reported; the agent records its result and does not observe the deployment.
**Success Criteria** (what must be TRUE):
  1. `prisma migrate deploy` is absent from Vercel's `buildCommand`; `docs/MIGRATIONS.md`
     documents deliberate human migration before dependent application deployment; stale
     migration records are reconciled, including the `SUPERSEDED` handoff. There is no
     shared migration to run: it was human-applied 2026-10-04 (`HANDOFF.md` §3,
     commit `9a53084`). Production's target is human-reported as shared Lightsail; see
     `17-CLOSE-RECORD.md`.
  2. The deck's real turn-assembly path proves no unrevealed slide text reaches the
     avatar, discharging REQ-63 as verification evidence rather than new construction.
  3. `scripts/verify-deck-intake.ts` passes every assertion, with the harness and its
     canonical fixture agreeing on one source string rather than the assertion weakening.
  4. **Pass 1** is exactly the Phase 15/16 deferred B–G keyboard blocks plus Phase 15
     hostile probe 5, human-reported and recorded in each validation file. Any Pass 1
     defect is fixed in Phase 17 after a repair-volume checkpoint. **Pass 2**, covering
     surfaces Phases 18 and 19 add, is excluded from Phase 17 and is Phase 19's closing
     obligation.
**Plans:** 7/7 plans complete — closed 2026-10-05; see `17-CLOSE-RECORD.md`

Plans:
- [x] 17-01-PLAN.md — REQ-74: remove `prisma migrate deploy` from `vercel.json` and document the replacement procedure
- [x] 17-02-PLAN.md — REQ-74: reconcile stale migration records and record Production target confirmation
- [x] 17-03-PLAN.md — REQ-75: deck visible-context sentinel harness + REQ-63 proof in Phase 13's directory
- [x] 17-04-PLAN.md — REQ-76: deck-intake fixture ownership repair (assertion unchanged)
- [x] 17-05-PLAN.md — REQ-77 Pass 1: human keyboard UAT of the Phase 15/16 deferred blocks
- [x] 17-06-PLAN.md — REQ-77 Pass 1 zero-defect checkpoint and disposition
- [x] 17-07-PLAN.md — documentation reconciliation and Phase 17 close

### Phase 18: Avatar Disengagement & Walk-Out
**Goal:** A session the avatar is visibly losing actually ends — today the avatar can
say in words that it is leaving while the session keeps running. A per-turn
disengagement value, computed from observable signals and accelerated (never replaced)
by the avatar's own self-report cue, crosses a type-declared threshold, plays one
final uninterruptible statement, and then ends the session automatically as a
recorded failure that explains the decline on the session clock.
**Depends on:** Phase 13 (extends the `terminationPolicy` / `avatarEndFloor` engine
primitives already in `lib/engine/types.ts` and `lib/engine/termination.ts` rather than
adding a parallel mechanism)
**Requirements:** REQ-78, REQ-79, REQ-80, REQ-81, REQ-82, REQ-83, REQ-84, REQ-85, REQ-86
**Locked scope notes (do not re-litigate in planning):**
  - Temperature/disengagement is derived from observable signals and is ACCELERATED,
    not replaced, by an avatar self-report cue — the role-playing model never has sole
    authority over its own patience (REQ-79).
  - Temperature/disengagement is INVISIBLE during the session: no meter, indicator or
    warning anywhere in the session shell (REQ-85).
  - This mechanism EXTENDS Phase 13's `terminationPolicy` / `avatarEndFloor` rather than
    adding a parallel mechanism. `lib/pitch/deck-type.ts` currently sets
    `avatarEndFloor: null` and must gain a real floor (REQ-84).
    **AMENDED 2026-10-08 by Phase 19 (user decision):** the deck half of REQ-84 is
    reversed — `pitch-deck` ends up with NO walk-out. Phase 19 removes
    `DECK_DISENGAGEMENT_THRESHOLD` from the deck type's opt-in and updates
    `scripts/verify-disengagement-termination.ts`'s two pitch-deck assertions to
    the new intent (deliberately, not by weakening them). The mechanism itself is
    unaffected and its intended home is **Phase 20**. `pitch-elevator` KEEPS its
    walk-out (`ELEVATOR_DISENGAGEMENT_THRESHOLD` 0.5, commit `524544e`) and is the
    only opted-in type after Phase 19, which keeps Phase 18's pending human UAT
    runnable.
**Success Criteria** (what must be TRUE):
  1. A session where the student stalls, repeats, or never establishes common ground
     visibly loses the avatar's engagement over time, computed deterministically from
     observable signals, with no live indicator ever shown to the student.
  2. When the avatar's own structured per-turn output signals disengagement, that
     signal measurably accelerates the walk-out but can never by itself end the
     session.
  3. Crossing a type's declared disengagement threshold plays exactly one
     uninterruptible final avatar statement — push-to-talk and text input both close
     for its duration — and the session then ends automatically and generates a
     report without the student pressing End-session.
  4. The auto-ended session is recorded as a FAILURE with an avatar-initiated
     termination reason, reusing Phase 13's `terminationPolicy` outcome record, and the
     report explains when engagement fell and what the student was doing at those
     points on the session clock.
  5. A type that declares no threshold behaves exactly as it does today, and a
     walk-out can never fire before a type's `avatarEndFloor` minimum turns.
**Plans:** 4/5 plans complete — **entry reconciled 2026-10-08** against the four
SUMMARY files, the commits on this branch and `18-VALIDATION.md`. It had read
`5 plans` with every box unchecked and `0/TBD Not started` in the Progress table
while 18-01 through 18-04 had all shipped.
**Status:** implementation COMPLETE, phase NOT closed. `18-VALIDATION.md` carries
`status: awaiting-human-uat`; its automated battery is five-for-five green
(`verify-disengagement`, `-termination`, `-walkout-shell`, `-report`, `tsc
--noEmit`) but every Success Criterion verdict is **PENDING**. The file's own
closing line governs: *do not mark Phase 18 complete or update requirement
checkboxes until human UAT evidence is supplied.* REQ-78 through REQ-86 stay
open.

Plans:
- [x] 18-01-PLAN.md — Opt-in disengagementThreshold + pure computeDisengagement (REQ-78, REQ-80)
      (`848c613` — `lib/engine/disengagement.ts`, nullable `disengagementThreshold`
      on `TerminationPolicyConfig`, `scripts/verify-disengagement.ts`)
- [x] 18-02-PLAN.md — Cue acceleration, resolveTermination gate, pitch-deck floor + type opt-ins (REQ-79, REQ-83, REQ-84)
      (`4a7c68f` — `<engine-cue>` parsing stripped before the end marker, the
      `high` cue capped at +0.20 so it cannot cross from a cold start, the
      `resolveTermination` fail-closed gate, and both pitch types opted in.
      **NOTE:** Phase 19 reverses the pitch-deck half of this plan per the
      2026-10-08 amendment above; the elevator's opt-in stands.)
- [x] 18-03-PLAN.md — Live walk-out lock, final statement, auto-finish, no meter (REQ-81, REQ-82, REQ-85)
      (`3d6f80a`, repaired by `3479921` — server-signed `lib/engine/walk-out-proof.ts`
      so the browser cannot forge report evidence; typing, Send, PTT, pause and
      leave all lock for the one final statement)
- [x] 18-04-PLAN.md — Report decline on session clock from stored episodes (REQ-86)
      (`32c2fa1` — `DisengagementDeclinePanel`, the `DisengagementDeclineRecord`
      narrower, and both evaluator prompts constrained to cite only supplied
      session-clock episodes and the closed observable-cause vocabulary)
- [~] 18-05-PLAN.md — Human UAT + 18-VALIDATION.md against SC1–5 / REQ-78–86
      (`d97422a` prepared the file. **RUN once on 2026-10-06 and it FAILED**,
      surfacing two defects the green battery had passed over — both since
      repaired in `3479921`/`62bf512`, neither by retuning a threshold:
      **(1) the disengagement ratchet never engaged (REQ-78)** — a stalled
      session reached 0.6 and one novel reply ("Cheese") dropped it to 0.4,
      because `computeDisengagement`'s `Math.max(priorValue, computed)` one-way
      guarantee had **no callers**; both the chat route and the finish
      re-derivation recomputed from scratch, so `priorValue` always defaulted to
      0. `verify-disengagement.ts` had proven the ratchet by passing `priorValue`
      in directly — the contract was proven in the unit and unenforced at the
      integration seam. Fixed by `computeDisengagementOverTranscript`, which
      replays the transcript prefix by prefix. **(2) a dead wait before
      auto-finish (REQ-82)** — the shell guessed the farewell as
      `words * 500ms + 1000ms` and finished on that timer, running well past real
      speech while the server sat idle (`session/finish` returned 202 in 273ms).
      Fixed with `isTalking()` / `waitForSpeechEnd()` on the avatar handle, the
      estimate surviving only as a ceiling. SC1/REQ-78 and REQ-82 must be
      **re-observed live** — the earlier run demonstrated the defects, not the
      fixed behavior. `524544e` then lowered
      `ELEVATOR_DISENGAGEMENT_THRESHOLD` 0.72 → 0.5.)

**Calibration policy, recorded in `18-VALIDATION.md`:** do not retune
thresholds, weights or cue acceleration without explicit human calibration
approval.

### Phase 19: Deck-Led Pitch Family
**Goal:** Widen the deck pitch from investor-negotiation-only into a family of
deck-led modes — a funding request, a product pitch, a deck-led talk, and a general
deck pitch with no mode-specific constraints — each playable alongside the existing
investor `pitch-deck`, sharing one deck capability rather than duplicating it per
mode.
**Walk-out AMENDED 2026-10-08** (user decision in `/gsd:discuss-phase 19`): the
original goal said each new mode would *inherit the walk-out from Phase 18*. It
does not. **No deck mode walks out** — the four new modes declare no
`disengagementThreshold`, and Phase 19 also switches the existing investor
`pitch-deck`'s walk-out OFF, reverting the deck half of Phase 18's REQ-84. Phase
18's mechanism stays intact and un-deleted; the deck types simply stop opting in,
which Phase 18 Success Criterion 5 explicitly permits. The walk-out's intended
home is the new **Phase 20** (difficult conversations).
**Depends on:** Phase 18 (AMENDED 2026-10-08 — the new deck modes do NOT inherit the
walk-out; the dependency is now that Phase 18's opt-in and its
`verify-disengagement-termination.ts` assertions must already exist so plan 19-03 can
switch `pitch-deck`'s opt-in OFF and invert those assertions deliberately. Phase 18's
plans 18-01..18-04 have landed on this branch; 18-05's human UAT is still outstanding
and is exercised on `pitch-elevator`, the only remaining opted-in type); Phase 14 (the
shared deck capability — upload, slide cursor, visible-context slice, soft timer —
being widened here)
**Requirements:** REQ-87, REQ-88, REQ-89, REQ-90, REQ-91, REQ-92, REQ-93, REQ-94
**Locked scope notes (do not re-litigate in planning):**
  - One TYPE record per deck mode, not one widened `pitch-deck` with a mode field
    (REQ-87, REQ-93) — honors REQ-60's config-record contract under its first real
    multi-mode test since the engine shipped.
  - Pass 2 keyboard UAT, carried from Phase 17, is a Phase 19 closing obligation
    for the surfaces Phases 18 and 19 add.
**Success Criteria** (what must be TRUE):
  1. Four new deck-led types — funding request, product pitch, deck-led talk, and a
     general deck pitch — are playable alongside the existing investor `pitch-deck`,
     each with its purpose distinguishable on the Practice Pitches picker before a
     student commits to one.
  2. Negotiation inputs (ask price, offered equity) are simply ABSENT — not disabled,
     not hidden — from any mode that has no terms to negotiate.
  3. Each mode is scored against its own declared rubric dimensions and produces its
     own outcome shape, so a funding request is never scored against an equity split
     and a deck-led talk is never scored against a close.
  4. A student reaching any deck mode goes through the one generic pre-session wizard
     with mode-appropriate steps and the one existing camera-consent gate — no second
     wizard, no new consent gate.
  5. The one report page renders every mode's outcome through the existing
     `ReportChrome` extras slot, and a mechanical surface-count guard (in the spirit of
     Phase 16's) proves that adding these four modes touched no engine module, route,
     evaluator or report page.
  6. Pass 2 keyboard UAT for the surfaces Phases 18 and 19 add is run by a human in
     Phase 19's closing plan and recorded in the Phase 18 and Phase 19 validation files.
**Plans:** 10/11 plans executed
plan-checker **VERIFICATION PASSED**. All eight REQs covered; SC1-SC6 tagged
`P19-SC*`, SC6 its own non-autonomous closing plan.

**Planning finding — REQ-93 cannot be met literally, and the plans disclose it
rather than hide it.** `kind: "pitch-deck"` is the `InstanceConfig` discriminant
checked in `app/api/interaction/chat/route.ts:179,579`,
`lib/engine/session.ts:128,522,859` and
`lib/engine/evaluation-runner.ts:233,364` — call sites independently confirmed by
the plan-checker. Giving any new mode its own instance kind would force edits to
exactly the surfaces REQ-93 forbids, so **all five modes share the one
`pitch-deck` instance kind**, at the cost of one deliberate mode-agnostic
widening in 19-02. 19-10's guard therefore asserts the STRONGER checkable claim —
no engine module, route, evaluator or report page contains any new mode's literal
name or a mode-specific branch — with `lib/engine/registry.ts` the only sanctioned
exception, itself asserted to contain no `===` comparison, plus a documented
negative test (plant `"pitch-funding"` in an engine file, confirm the script
fails, revert). Two traps recorded in 19-02: `PITCH_INPUT_KEYS` drives a
`hasAllKeys` narrowing, so adding the new key there would stop every
pre-Phase-19 pitch report from rendering; and `instanceFromPitchSnapshot`
hard-requires finite ask numbers, which would make every non-investor deck
session unevaluable.

**Planning finding — switching the walk-out off takes more than dropping the
threshold.** `resolveTermination` evaluates its disengagement gate only
`if (threshold != null)`, so a type declaring none falls through to `ok: true`
for any accepted reason past the floor: the naive change would have left the
investor deck still able to walk out. 19-03 therefore also sets
`avatarMayEnd: false` / `avatarEndReasons: []` and strips the exit and cue
instructions from the investor prompt — restoring the intent Phase 14 wrote into
`deck-type.ts` ("this type cannot end early") before Phase 18 contradicted it.
The four-turn floor is kept as dormant safety. A third touch point the amendment
had not named: `verify-disengagement-termination.ts`'s `belowFloor` fixture
reuses `PITCH_DECK_TYPE.terminationPolicy` and stops exercising the floor gate
once `avatarMayEnd` flips false (gate 1 returns no `reason` field, so the
assertion fails outright rather than passing hollowly). 19-03 re-points it at a
synthetic policy and adds a direct proof that a maximally disengaged investor
still cannot walk out, with the `check(` count required to stay equal or higher.
`lib/pitch/elevator-type.ts` is read-only across all 11 plans, and 19-11 may only
APPEND to `18-VALIDATION.md` — never alter its frontmatter or its five PENDING
verdicts.

**Avatar step AMENDED 2026-10-08 (user decision during `/gsd:plan-phase 19`):**
the investor `pitch-deck` DOES gain the `interviewer` avatar/voice step, so all
five deck modes behave consistently. "Investor deck unchanged" governs its
ask/equity inputs and its rubric, NOT its avatar selection. 19-07 retires the
page's auto-pick effect **generically rather than by deletion** — gated on
`engineType.setupSteps.some(s => s.id === "interviewer")` — because
`pitch-elevator` declares no picker and the session render gate requires
`selectedInterviewer && avatarConfig`, so deleting the effect outright would
leave the elevator unable to start. `InterviewerStep` was found to fully subsume
the effect (same endpoint, same `interviewers[0]` default) and additionally
surfaces a catalog error the page effect silently swallows. This deliberately
touches a Phase-14-signed-off wizard surface; 19-11 sign-off block **E2** covers
it as a re-tested surface.

Plans:
- [ ] 19-01-PLAN.md — Deck-mode table, shared deck rubric, per-mode session-length envelopes
- [ ] 19-02-PLAN.md — One mode-agnostic plumbing widening: optional negotiation fields, modeInputs, back-compatible snapshot
- [ ] 19-03-PLAN.md — Walk-out OFF for the investor deck; the two verifier assertions INVERTED, not deleted
- [ ] 19-04-PLAN.md — `pitch-funding` and `pitch-product` TYPE records and prompts
- [ ] 19-05-PLAN.md — `pitch-talk` and `pitch-general` TYPE records and prompts; all five registered
- [ ] 19-06-PLAN.md — FundingAskStep, BuyerProfileStep, TalkAudienceStep — required mode inputs
- [ ] 19-07-PLAN.md — Generalize the one wizard off the mode table; no mode slug left in the page
- [ ] 19-08-PLAN.md — Picker: two top cards, "With a deck" expands in place to five mode cards
- [ ] 19-09-PLAN.md — Descriptive unscored verdicts through the existing ReportChrome extras slot
- [ ] 19-10-PLAN.md — Surface-count guard proving no engine module, route, evaluator or report page was touched
- [ ] 19-11-PLAN.md — Phase validation + Pass 2 keyboard UAT recorded in BOTH 18- and 19-VALIDATION (human-verified)


### Phase 20: Difficult Conversation Walk-Outs
**Goal:** Apply Phase 18's disengagement/walk-out mechanism to the Phase 15
`difficult-conversation` types, where losing the room is the point. A student who
fails to control the avatar's emotions or hostility — who escalates, stonewalls,
or says something offensive — has the conversation ended on them by the avatar,
recorded as a failure that explains what tipped it. This is the home the user
intended for the Phase 18 mechanism; Phase 19 switched every deck mode's
walk-out OFF for exactly this reason (see `19-CONTEXT.md`).
**Depends on:** Phase 18 (the `disengagementThreshold`, `computeDisengagement`,
walk-out lock, auto-finish and report-decline machinery are reused, never
duplicated); Phase 15 (the `difficult-conversation` type record, its eight
rubric dimensions, its unscored outcome record and its anti-drift prompt layer
are what gain the threshold)
**Requirements:** REQ-95, REQ-96, REQ-97, REQ-98, REQ-99, REQ-100, REQ-101, REQ-102
(derived 2026-10-08 from `20-CONTEXT.md` once the user settled its two open
questions; this line previously read TBD)
**Scope notes (captured 2026-10-08 at the user's request, from the Phase 19
discussion):**
  - The trigger is the student losing control of the avatar's emotional state —
    escalation, hostility, and offensive content specifically — not merely a
    stalled or low-energy conversation as in Phase 18's generic signal set.
  - Offensive content is a FIRST-CLASS trigger and needs its own observable
    signal. Phase 18's stall/repeat/no-common-ground signals do not detect it.
  - Seeded and student-authored scenarios both participate. Whether every seeded
    conversation opts in, and whether an author may set their own threshold, is
    an open question for `/gsd:discuss-phase 20`.
  - Phase 15's support note and always-visible End-session control must survive
    an avatar-initiated ending; a walk-out must never leave a student with no
    exit and no explanation.
**Locked decisions (settled 2026-10-08, do not re-litigate in planning):**
  - The avatar always leaves **IN CHARACTER**, severe content included. One
    ending path; no break-frame branch in the session shell.
  - **One type-level threshold** on the `difficult-conversation` TYPE record. All
    seeded and authored scenarios inherit it. No per-scenario field, no authoring
    surface, no difficulty modulation.
  - The report **quotes with timecode but SANITIZES explicit content** — a slur is
    never recited back to the student.
  - **No score cap.** `postProcessScores` stays absent, preserving Phase 15's
    deliberate omission.
  - Hostility **accumulates and ratchets one-way**. No apology-driven recovery.
  - Detection is **deterministic**; the avatar cue only accelerates (REQ-79 holds).
**Success Criteria** (what must be TRUE):
  1. A student who insults, escalates or stonewalls visibly loses the avatar over
     time and has the conversation ended on them, computed deterministically from
     observable signals, with the avatar's own cue able to accelerate but never to
     decide.
  2. Firm, uncomfortable but non-hostile language — the register the seven seeded
     confrontation scenarios actually require, such as *"your performance has been
     unacceptable and this is your final warning"* — never triggers a walk-out.
  3. Severe content (slurs, harassment, threats) ends the session regardless of the
     four-assistant-turn floor, as a named and enumerated carve-out, with Phase 18's
     SC5 and `scripts/verify-disengagement-termination.ts` amended deliberately
     rather than weakened.
  4. The avatar always leaves in character, and the session records an
     avatar-initiated failure whose reason code distinguishes hostility,
     stonewalling and severe content. Phase 15's support note and End-session
     control survive the ending.
  5. The report explains what tipped the conversation on the session clock with
     quoted, timecoded causes, explicit content sanitized rather than recited, and
     no rubric dimension capped.
**Plans:** 7 plans in 6 waves — planned 2026-10-08 (`7f0726d`), plan-checker
**VERIFICATION PASSED** with every substantive claim confirmed against source.
**Progress:** 2/7 plans executed. 20-01 complete 2026-10-08 — `lib/engine/hostility.ts`
+ `scripts/verify-hostility-detector.ts` shipped: deterministic hostility/severe
detector, the 24-row false-positive corpus derived from all seven seeded scenarios
(REQ-97), and the stonewalling discretion finding (0.425 under Phase 18's existing
stall signals — no new signal needed). See `20-01-SUMMARY.md`. **20-02 complete
2026-10-08 — the AMENDED finding reverses 20-01's conclusion**: a 2026-10-08 user
amendment to `20-CONTEXT.md` requires stonewalling to be able to end a session on
its own, not merely nudge toward it. `lib/engine/disengagement.ts` gained four new
causes (`hostility`, `severe_content`, `position_unacknowledged`, and the
amendment-driven `stonewalling`), all weight-0 by default so every existing type
(pitch-elevator included) computes byte-identically; a per-type
`disengagementWeights` override and `deriveAcknowledgementAbsent` (the live twin
of Phase 15's `empathy` dimension) were added. `scripts/verify-disengagement.ts`
proves hostility accumulation, the one-way ratchet under hostility (with a
negative control), no apology-driven recovery, severe-content carry-forward,
unchanged defaults, a weight-profile arithmetic assertion, and — the amendment's
two required facts in one run — a sustained pure-stonewalling transcript now
crosses 0.6 on its own while hostility still crosses at or before the same turn
count. See `20-02-SUMMARY.md`.
**Gate:** 20-07 (human adversarial UAT) is gated on Phase 18's 18-05 human UAT.
`18-VALIDATION.md` is `awaiting-human-uat` and its one run FAILED on two
since-repaired defects, so Phase 20's live run must either follow 18-05 or record
its own observations of Phase 18 SC1/REQ-78 and REQ-82 back into
`18-VALIDATION.md`. **The user chose 18-05-FIRST on 2026-10-08** — see
`20-CONTEXT.md`'s "Gating decision". Plans 20-01..20-06 are fixture-verified and
NOT gated; execution must STOP before 20-07 until 18-05 has real verdicts. Each
plan names the criteria it serves as `P20-SC1`..`P20-SC5` alongside its REQ IDs,
matching Phases 14/15/16.

**Phase 19 file overlap (resolved):** 20-04 appends a new section 5 to
`scripts/verify-disengagement-termination.ts` and touches no existing section;
19-03 owned section 3's `belowFloor` fixture and section 4's pitch-deck
assertions and has already landed, taking that file's `check(` count 14 -> 16.

**Declared Phase 18 amendment:** SC5's floor clause gains the named
severe-content carve-out (REQ-100), collected as the Phase 18 revision handoff in
`20-VALIDATION.md`. The floor stays at `minAssistantTurns: 4` for every other
trigger.

**Declared Phase 13/15 extensions:** `TerminationPolicyConfig` gains optional
`disengagementWeights` and `avatarEndReasonByCause`; `resolveTermination` gains
an optional `severeContent`; `EngineTurnState.walkOut` gains `reason` — all
optional, all defaulting to today's behaviour.

**Planning finding — a live defect blocking REQ-101.** `buildWalkOutFragment`
(`lib/engine/prompts.ts:297`) hardcodes `<engine-end reason="lost_interest" />`,
which is **not** in `difficult-conversation`'s `avatarEndReasons`. Confirmed
independently by the plan-checker against `termination.ts:128`: a forced farewell
would be rejected by the closed-reason gate and **the session would never end** —
precisely the failure Phase 18 exists to prevent, sitting in shipped code. 20-05
interpolates a policy-supplied reason, falling back to `lost_interest` only when
absent so the pitch types stay byte-identical, and proves it behaviourally via
`buildTailBlock` rather than by regex.

**Planning finding — no Phase 18 number is retuned.** Adding hostility weight to
`DEFAULT_DISENGAGEMENT_WEIGHTS` would have retuned `pitch-elevator`, which
`18-VALIDATION.md`'s calibration policy forbids. So the three new causes carry
weight **0** in the shared defaults and an optional type-level
`disengagementWeights` profile carries the DC arithmetic (hostility 0.5,
`budgetPressure` 0 because `timeBudget.totalSeconds` is null, active weights
summing to exactly 1 — verified). Every existing type computes byte-identically.
Threshold 0.6, the `/3` accumulation curve and the severe lexicon are all
**PROVISIONAL UNTIL CALIBRATED** with their evidence named.

**Planning finding — the REQ-102 sanitizer must run server-side.**
`ReportDTO.outcome` ships as a generic `Record<string, unknown> | null` and is
narrowed in the browser by `asConversationOutcome`, so sanitizing at render would
already have put the verbatim slur in the page payload. 20-06 applies it inside
`toReportDto` (the single server exit) and proves the guarantee with an evaluator
payload that **deliberately disobeys** the prompt, plus a negative test.

Plans:
- [x] 20-01-PLAN.md — Deterministic hostility/severe detector + the seeded-register false-positive corpus (REQ-96, REQ-97) — complete 2026-10-08, see `20-01-SUMMARY.md`
- [ ] 20-02-PLAN.md — Three new observable causes, per-type weight profile, hostility accumulation + one-way ratchet, acknowledgement-absent signal (REQ-96, REQ-98, REQ-99)
- [ ] 20-03-PLAN.md — One type-level threshold + weight profile + severe reason code, with the no-per-scenario-surface guard (REQ-95, REQ-101)
- [ ] 20-04-PLAN.md — Named severe-content carve-out in resolveTermination + cause-to-reason resolver + deliberate verifier amendment (REQ-100, REQ-101)
- [ ] 20-05-PLAN.md — Live wiring at both server callers, policy-supplied forced-farewell reason, single in-character ending path guarded (REQ-96, REQ-99, REQ-100, REQ-101)
- [ ] 20-06-PLAN.md — Server-side quote sanitizer on the way out of toReportDto, with its own adversarial battery; no score cap (REQ-102)
- [ ] 20-07-PLAN.md — Human adversarial UAT + 20-VALIDATION.md, Phase 18 revision handoff, calibration record (all eight REQs, human-verified; GATED on 18-05)


## Progress

**Execution Order:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → (14 | 15 | 16)

**v1.1 Execution Order:** 17 (parallel) | 18 → 19 → 20

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Interview Registry & Prompts | - | Shipped (pre-roadmap) | 2026-09 |
| 2. Interviewer Catalog | - | Shipped (pre-roadmap) | 2026-09 |
| 3. Resume Ingestion | - | Shipped (pre-roadmap) | 2026-09 |
| 4. Interview Setup Flow | - | Shipped (pre-roadmap) | 2026-09 |
| 5. Live Session Shell | - | Shipped (pre-roadmap) | 2026-09 |
| 6. Evaluation & Student Report | 8/8 | Complete    | 2026-09-21 |
| 7. Interaction Dashboard | 7/7 | Complete    | 2026-09-21 |
| 8. Interview Customization | 8/8 | Complete    | 2026-09-21 |
| 9. Student-Authored Scenarios | 9/9 | Complete    | 2026-09-21 |
| 10. Video & Audio Metrics | 11/11 | Complete    | 2026-09-22 |
| 11. Cohort & Staff Teardown | 7/7 | Complete   | 2026-09-23 |
| 12. Embodied Visual Signals | 10/11 | Complete    | 2026-10-04 |
| 13. One-on-One Conversation Engine | 15/15 | Complete | 2026-10-04 |
| 14. Practice Pitches | 15/15 | Complete   | 2026-10-04 |
| 15. Difficult Conversations | 11/11 | Complete  | 2026-10-04 |
| 16. Networking Practice | 11/11 | Complete  | 2026-10-04 |
| 17. v1.0 Close-Out | 7/7 | Complete | 2026-10-05 |
| 18. Avatar Disengagement & Walk-Out | 4/5 | Implementation done, human UAT pending re-run | - |
| 19. Deck-Led Pitch Family | 10/11 | In Progress|  |
| 20. Difficult Conversation Walk-Outs | 1/7 | In Progress | - |

Phase 13's REQ-66/REQ-67 caveat remains recorded in `13-CLOSE-RECORD.md`: the
backfill acceptance test is unsatisfiable on the empty shared DB and passed locally
only. Phase 17 separately verified REQ-63 through its deck visible-context proof and
closed its own work in `17-CLOSE-RECORD.md`.

Phases 15 and 16 completed their deferred Pass 1 keyboard UAT as a human-reported
PASS on 2026-10-05. The record remains evidence-PARTIAL because IDs and item-level
notes were not supplied; see `17-KEYBOARD-PASS-1.md`.
