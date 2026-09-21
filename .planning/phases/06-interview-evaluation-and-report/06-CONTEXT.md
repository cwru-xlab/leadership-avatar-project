# Phase 6: Interview Evaluation & Student Report - Context

**Gathered:** 2026-09-19
**Status:** Ready for planning
**Note:** This repo had no `.planning/` directory. Phase numbered 06 from the
teammate's handoff ("Step 6" / "Step 7"), not from a ROADMAP.md. Steps 6 and 7
are treated as one phase because the report page is unreachable without the
finish flow, and the finish flow is unverifiable without the page.

<domain>
## Phase Boundary

Persist the interview transcript server-side, run `INTERVIEW_EVALUATOR_PROMPT`
over it, store a validated report, and give the authenticated student an
owner-only page to read it.

**In scope:**
- `InterviewReport` Prisma model + `User` relation; migration SQL generated for
  team review (NOT applied to the shared database).
- Interview start / checkpoint / finish endpoints.
- Background evaluation with a polling report page at
  `/interview/[type]/report/[reportId]`.
- Wiring the existing End-interview control to the finish flow.
- End-to-end validation with a real authenticated LiveAvatar session and a real PDF.

**Out of scope:** video/audio metrics pipeline, `/student-cases` launcher
rewrite, new interview types, report history index, staff/admin visibility.

### What already exists (built by teammate, Steps 1-5)
- `lib/interview/types.ts` — registry (`INTERVIEW_TYPES`, one `general` record),
  `InterviewProgress`, `INTERVIEW_STAGES`, `BEHAVIORAL_CATEGORIES`.
- `lib/interview/prompts.ts` — `buildInterviewSystemPrompt` (cache-prefix-safe),
  `buildProgressBlock` (per-turn tail), `INTERVIEW_EVALUATOR_PROMPT` (the
  evaluator this phase must invoke; already specifies the exact JSON shape
  `{visual_score, vocal_score, content_score, behavioral_score, report_markdown}`
  and the null-on-missing-metrics rule).
- `app/api/interview/interviewers/route.ts` — LiveAvatar catalog, 10-min cache.
- `app/api/interview/upload-resume/route.ts` — PDF validation (magic-byte
  checked), text extraction, private S3 write via
  `s3Storage.saveInterviewResume(userId, resumeId, buffer)` →
  `resumes/{userId}/{resumeId}.pdf`. Returns `{resumeId, resumeText}` only.
- `app/interview/[type]/page.tsx` — interviewer → resume → session → complete wizard.
  The `complete` step currently says reporting is pending; this phase replaces it.
- `components/interview/InterviewSessionShell.tsx` — streamed avatar speech,
  push-to-talk + transcription, client-side `advanceProgress`, `finish()` which
  today only calls `onFinish()`. Transcript lives ONLY in `messagesRef`.

### Standing architectural constraint (stated by user during discussion)
The codebase is being refactored away from staff/admin oversight, cohorts, and
group grade tracking. This is an **individual** learning tool: users create their
own practice interviews, unassigned. **The interview schema must not grow
`cohortId`, assignment linkage, gradebook hooks, or staff-visibility fields.**
Do not model interviews on `Attempt`/`CaseAssignment`, which carry those
assumptions.

</domain>

<decisions>
## Implementation Decisions

### Storage shape

- **Dual storage.** S3 holds the canonical structured transcript; Postgres
  (`InterviewReport`) caches the scores and `report_markdown` for fast reads.
- **Transcript format:** a purpose-built `InterviewTranscript` type — turns with
  `role` / `content` / `timestamp`, plus the `InterviewProgress` snapshot,
  interviewer identity (avatarId + name), and type slug.
  **Do NOT reuse `InteractionLog`** — it is built around case `roleInteractions`,
  `caseId`, and role-scoped event types that have no meaning for a
  single-interviewer interview.
- **Row lifecycle:** the `InterviewReport` row is created **on the first real
  turn**, not on entering the session step. No row is created for sessions where
  the avatar never connected or the student bailed instantly. The `reportId`
  arrives mid-flight, so the first turn is checkpointed once it lands.
- **Statuses:** `IN_PROGRESS` → `PENDING` (evaluating) → `READY` | `FAILED`.
- **Checkpointing:** after **every assistant turn**, fire-and-forget POST to S3
  (~9-15 writes per interview). Must never block the avatar stream. A tab-close
  loses at most one exchange.
- **Resume context on the row:** store `resumeId` **and a snapshot of the
  extracted resume text**. The evaluator needs `resume_text` as an input anyway,
  and snapshotting makes a report reproducible without re-parsing the PDF.
- **Repeats:** unlimited, each a separate report, **no unique constraint**.
  Key by uuid; index on `(userId, createdAt)` and `(userId, typeSlug)`.
  No `attemptNumber`.
- **Migration handling:** code assumes the table exists. Run
  `prisma migrate dev` against the local/dev database only; hand the generated
  SQL to the team for the shared database. **Do not apply to the shared DB.**
  No S3 fallback path for an unmigrated database.

### Evaluation timing & failure

- **Background via `waitUntil`**, matching the existing
  `app/api/interaction/finish/route.ts` precedent. The finish endpoint validates,
  flips the row to `PENDING`, returns `{reportId}` in ~200ms, and the student
  lands on the report page immediately.
- **Model:** `INTERVIEW_EVAL_MODEL` env var, **default `gpt-4.1`** (consistent
  with interview chat at `app/api/interaction/chat/route.ts:189` and the case
  evaluator). Use structured outputs (`response_format` json_schema) so the four
  score fields and `report_markdown` are schema-validated, not hopefully parsed.
- **Polling:** 2s fixed interval, give up at **2 minutes**, then show a
  "taking longer than expected" state with manual retry. Typical evaluation is
  expected to land in 15-40s.
- **Failure handling:** one automatic retry, then persist `FAILED` with an
  operator-readable reason. Scores that are out of range or non-integer are
  **coerced to null rather than stored wrong**. The transcript is always safely
  stored regardless of evaluation outcome.
- **Re-run:** allowed **only from a `FAILED` report**, reusing the same
  `reportId` and the stored transcript. No regenerating a completed report —
  this prevents score-shopping and double LLM spend.
- **Visual/Vocal scores stay null.** No estimating them from transcript text.
  The evaluator prompt already enforces this; validation must too.

### Report page & access

- **Route:** `/interview/[type]/report/[reportId]`.
- **Type segment:** fetch by `reportId` (the only thing ownership depends on).
  If the `[type]` segment disagrees with the stored `typeSlug`, **redirect to the
  canonical URL**. Don't 404 on a mismatch.
- **Ownership:** enforced from the authenticated JWT user via
  `getCurrentUser(token)` (cookie name from `siteConfig.auth.cookie.name`), the
  same pattern as `upload-resume`. Another student's report returns **404,
  identical to a nonexistent report** — never 403. This makes the Step 3
  cross-student denial test unambiguous.
- **Staff access:** **none.** Owner only. See the standing architectural
  constraint above — staff/admin roles are being removed from the product.
- **Score display:** one card per rubric category, `N / 5` plus a short label
  (e.g. "4 / 5 · Strong"). **No computed overall score** — averaging two of four
  categories would misrepresent the rubric until the metrics pipeline exists.
- **Visual & Vocal:** render the cards, **greyed, labeled "Not yet measured"**
  with a one-line explanation ("Requires video and audio analysis"). Do not hide
  them — the markdown body's Category Breakdown table lists all four, and the
  page must not contradict it.
- **Pending state:** skeleton of the *real* report layout (score cards and
  section blocks as placeholders in their final positions) with a
  "Reviewing your interview…" status line. The page must not reflow when the
  report lands.
- **Markdown rendering:** `react-markdown` (already a dependency, ^10.1.0) **with
  `remark-gfm`** — required for the Category Breakdown table. **Raw HTML
  disabled**, since the body is model-generated. Style via explicit component
  overrides to match the CaseBridge look.
- **Navigation:** "Back to practice" → `/student-cases`; primary action
  "Practice again" → `/interview/[type]`. Both match existing exits in the
  interview flow and survive the future launcher rewrite unchanged.

### Ending & abandonment

- **End interview:** show a confirm modal naming what happens next —
  "End interview and generate your report? You can't resume after this."
- **Short interviews:** evaluate anyway (the evaluator prompt explicitly handles
  a too-short or disengaged transcript), **but warn in the confirm modal when
  below a light threshold** — e.g. "You've only answered 2 questions — your
  report will be limited." The student decides; no hard block.
- **Leave interview** (back arrow, top-left): same confirm modal, different
  copy — "leave without a report". The two exits must be clearly distinguishable
  so a student never thinks they ended properly when they didn't.
- **Tab close mid-interview:** the row stays `IN_PROGRESS` forever. No report is
  generated and it is invisible to the student. The checkpointed S3 transcript is
  preserved so nothing is lost. **No `beforeunload`/`sendBeacon` best-effort
  finish** — unreliable, and it would generate reports from interviews the
  student walked away from. No inactivity sweeper in this phase (it can be added
  later without a migration).

### Claude's Discretion

- Exact `InterviewReport` column names, types, and index definitions.
- Exact `InterviewTranscript` TypeScript shape and S3 key layout (follow the
  existing `s3-client.ts` sanitize-path-segment pattern; keys must be derived
  server-side from the authenticated user, never from client input).
- Endpoint naming and request/response shapes for start / checkpoint / finish.
- The "light threshold" number for the short-interview warning.
- Skeleton, card, and typography specifics within the existing CaseBridge palette.
- How `reportId` is threaded through `InterviewSessionShell` → `page.tsx`.
- Retry/backoff details inside the evaluator call.

</decisions>

<specifics>
## Specific Ideas

- The evaluator prompt is already written and is the contract — don't rewrite it.
  Its JSON shape and its CRITICAL RULE ON MISSING DATA are what validation should
  be built against.
- The case-study flow (`app/api/interaction/finish/route.ts`) is a **precedent to
  borrow the `waitUntil` shape from, not code to reuse**. Its regex `SCORE:`
  scrape is explicitly what the interview evaluator's JSON mode replaces.
- Resume privacy language already shown to students ("PDFs stay private and are
  never shown to other students", "Your resume is used only to personalize this
  practice interview") must remain true — the report must not expose the PDF or
  an S3 URL.
- "A thin report is honest feedback" — prefer telling a student their transcript
  was too short over silently giving them nothing.

</specifics>

<deferred>
## Deferred Ideas

- **Video/audio metrics pipeline** — pose/gaze tracking and timestamped STT to
  populate `visual_metrics` / `vocal_metrics`. The evaluator prompt and the
  nullable score columns are already designed for it. Its own phase.
- **`/student-cases` rewrite into the real interview launcher**, linking
  `/interview/general` (teammate's Step 4). This phase only links *to*
  `/student-cases` as it exists.
- **New interview-type records (e.g. coding)** — added to `INTERVIEW_TYPES` in
  the registry, not as new page implementations. The registry seam already
  supports this; adding a record is not part of this phase.
- **Report history index** (e.g. `/interview/reports`) — a list of a student's
  past reports. New surface, own phase.
- **Staff/admin removal and cohort teardown** — the refactor direction the user
  described. Large, cross-cutting, and its own effort. This phase's only
  obligation is to not add new schema that depends on those concepts.
- **Abandoned-row cleanup** — sweeping stale `IN_PROGRESS` rows, or an
  `ABANDONED` terminal state. Addable later without a migration.

</deferred>

<validation>
## Step 3 — Integration & Validation Checklist

A real authenticated LiveAvatar interview with a real PDF must confirm:

1. Interviewer selection loads from the live LiveAvatar catalog.
2. Resume extraction succeeds and the PDF lands privately in S3.
3. Avatar speech streams (`extractSpeakable` chunking intact).
4. Transcript checkpoints appear in S3 during the session.
5. End interview → confirm modal → finish endpoint → `reportId` returned.
6. Report page polls and resolves to `READY`.
7. Visual and Vocal render as "Not yet measured"; Content and Behavioral show scores.
8. A second authenticated student requesting that `reportId` gets **404**.

**Known unrelated blocker:** the full production build still needs `EDGE_CONFIG`
configured to finish prerendering `/about`. Not caused by this phase and not in
scope to fix here — but it will block a clean `next build`, so plan validation
around `next dev` or expect that failure.

</validation>

---

*Phase: 06-interview-evaluation-and-report*
*Context gathered: 2026-09-19*
