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
- [ ] **Phase 12: Embodied Visual Signals** - Measure arms, posture and a visible phone (7/8 plans; fidgeting retired as unmeasurable)
- [ ] **Phase 13: One-on-One Conversation Engine** - Parameterize the interview pipeline so a new interaction type is a config record
- [ ] **Phase 14: Practice Pitches** - Elevator pitch plus investor pitch-deck session with live slide gating and negotiation
- [ ] **Phase 15: Difficult Conversations** - Role-assuming avatars, seeded catalog plus student-authored publishable scenarios
- [ ] **Phase 16: Networking Practice** - Practice against a described real person or a default character

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

**Plans:** 7/8 plans executed

Plans:
- [x] 12-01-PLAN.md — Async stop() teardown + per-tick frame-budget instrumentation
- [x] 12-02-PLAN.md — Metric contract: scored body fields, structurally unscorable observations, provisional thresholds
- [ ] 12-03-PLAN.md — Web Worker migration of face inference + staggered scheduler (REQ-57 gate)
- [x] 12-04-PLAN.md — Report surfacing: Body language subheading, unscored Observations section, kind-tagged Moments, evaluator contract
- [x] 12-05-PLAN.md — Vendor pose/hand/object models and run all four staggered in the worker
- [x] 12-06-PLAN.md — Scored derivations: posture baseline + drift, gesture curve, hands near face, new episodes
- [x] 12-07-PLAN.md — Descriptive derivations: fidgeting, phone in frame, absolute posture reading
- [x] 12-08-PLAN.md — Threshold tuning from real recordings + end-to-end phase sign-off

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

### Phase 14: Practice Pitches
**Goal:** Ship the Practice Pitches interaction with its two sublayers — a strict
30-60 second elevator pitch judged on concision and on tailoring to the specific
listener, and a timed investor pitch-deck session where the student clicks
through an uploaded deck while the avatar sees only the slides shown so far and
negotiates terms.
**Depends on:** Phase 13
**Scope note (2026-10-02, user decision):** deck upload accepts PDF, PowerPoint
and Google Slides. Google Slides means a Drive OAuth scope, token storage and a
Drive API read — the largest single piece of this phase, and deliberately in
scope rather than deferred.
**Success Criteria** (what must be TRUE):
  1. The elevator pitch enforces a 30-60 second window; avatar engagement follows
     from concision and from whether the student found common ground first, and a
     tedious pitch can end the conversation early as a recorded failure rather
     than a neutral finish.
  2. A deck uploaded as PDF, PPTX or Google Slides becomes per-slide text plus
     rendered slide images stored privately, and a malformed or wrong-format deck
     is rejected with an actionable error instead of a broken session.
  3. The student advances slides live, and the avatar's context contains only
     slides at or before the current one — never content from a slide not yet
     shown.
  4. The report scores deck structure and text density alongside vocal delivery,
     and the negotiation outcome (price and equity) is recorded against the
     student's stated ask.
  5. Session length is pre-selected from slide count within a 20-30 minute
     envelope, and the remaining time is visible to the student during the
     session.

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

### Phase 16: Networking Practice
**Goal:** Ship networking practice against a person the student brings in —
pasted LinkedIn text, their own written description, or AI-generated text —
distilled into an avatar persona, or picked from a set of default characters.
**Depends on:** Phase 13 (and reuses Phase 8's one-shot persona distillation
endpoint rather than adding a second distillation path).
**Success Criteria** (what must be TRUE):
  1. A student can paste a description of a real person and practice against a
     persona distilled from it, through the existing distillation path.
  2. A curated set of default characters is playable with no input at all.
  3. Pasted third-party text is stored privately and never appears in another
     student's session.
  4. The report judges rapport-building and the clarity of the student's
     self-introduction, not interview-style answer quality.


## Progress

**Execution Order:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → (14 | 15 | 16)

Phases 14, 15 and 16 each depend only on Phase 13, not on each other — once the
engine lands they can be planned and executed in any order, or in parallel.

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
| 12. Embodied Visual Signals | 7/8 | In Progress|  |
| 13. One-on-One Conversation Engine | 0/0 | Not planned |  |
| 14. Practice Pitches | 0/0 | Not planned |  |
| 15. Difficult Conversations | 0/0 | Not planned |  |
| 16. Networking Practice | 0/0 | Not planned |  |
