# Phase 13: One-on-One Conversation Engine - Research

**Researched:** 2026-10-02
**Domain:** Code archaeology / refactor-unification of two existing Next.js API +
Prisma + S3 pipelines (interview, scenario) into one engine
**Confidence:** HIGH for everything below "A" through "H" (all claims are
file/line citations against the working tree on `feature/visual-analysis-expansion`).
LOW/flagged explicitly wherever something could not be verified (shared DB
state, runtime behavior not exercised).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Report storage**
- One unified table. Create `InteractionReport` carrying `typeSlug` plus every
  shared column, backfill the existing `InterviewReport` and `ScenarioReport`
  rows into it, then drop the old tables. Rejected: unified-table-for-new-rows-
  only with old tables kept read-only, and per-type tables behind a repository
  layer.
- Per-type input is one JSON `inputSnapshot` column, typed in TypeScript and
  shaped per type. A new interaction type adds NO columns.
- Scores are a JSON map keyed by dimension, not fixed columns.
- Migration follows the existing human-run path: write it, apply to LOCAL dev
  DB only, hand the SQL to a human to review and run `prisma migrate deploy`
  against the shared Lightsail DB (HANDOFF.md §3 precedent). An agent must NOT
  apply it to the shared DB. Phase 13 does not close until a human has run it.
- Legacy reports must render identically at their existing URLs — this is the
  acceptance test for the backfill.

**Config surface**
- Phase 13 builds the primitives Phases 14-16 need, before anything uses them:
  `terminationPolicy` (including AVATAR-INITIATED end with a recorded reason),
  a per-turn visible-context slice, a type-declared outcome record (JSON), an
  explicit time budget in the per-turn tail block.
- Config lives as TypeScript records in code, following `lib/interview/types.ts`
  and `lib/interactions/registry.ts` (actual file: `lib/interactions/index.ts` —
  see Section H). Rejected: S3 JSON, Postgres rows.
- Two layers: built-in TYPE (code) + authored INSTANCE (S3 data, the `CaseStudy`
  precedent). A session resolves `type + instance` into one session config.

**Routes and student-visible change**
- One `/practice/[type]` tree: sessions at `/practice/[type]/[instanceId?]`,
  reports at `/practice/[type]/report/[reportId]`. `/interview/*` and
  `/case-play/*` become permanent redirects.
- Phase 13 is an INVISIBLE REFACTOR. Shared session shell and report page
  reproduce today's appearance exactly. Known exception: the URL changes.
  Corollary: today's divergences (scenario has no checkpoint; report chrome
  differs) are PRESERVED, not converged. An unpreservable divergence is a
  CHECKPOINT, not an executor judgment call.
- Pre-session setup is one generic wizard with per-type step components; one
  camera-mode consent gate.

**Rubric shape**
- Four shared dimensions (Visual, Vocal, Content, Behavioral) plus type-declared
  extras. Visual and Vocal are never type-optional — full four-state handling
  from Phases 10/12 on every engine-backed type.
- `lib/report/structured.ts:109`'s hardcoded
  `required: ["visual","vocal","content","behavioral"]` must become type-derived.

### Claude's Discretion
- Where engine modules live and naming (`lib/engine/`, `lib/interaction/`, …)
  and how `lib/interview`/`lib/scenario` decompose into shared vs type-local.
- Prompt assembly mechanics, as long as the system prompt stays session-constant
  and per-turn state stays in the tail block.
- Whether scenario gains a checkpoint endpoint, or the engine's checkpoint is
  simply unused by it — subject to no-visible-convergence.
- `/reports` list page's cross-type presentation and `lib/interactions/index.ts`
  dashboard tile wiring.
- Status enum naming (`InterviewReportStatus` shared today) and whether it is
  renamed.
- Whether `transcriptKey` and `interactionLogId` converge on one transcript
  pointer or stay two fields.

### Deferred Ideas (OUT OF SCOPE)
None raised during Phase 13's discussion — it stayed inside the engine
boundary. (Several open questions from the source brief are explicitly deferred
to Phases 14/15/16 — see CONTEXT.md's `<deferred>` block — and are irrelevant to
planning Phase 13 itself.)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-------------------|
| REQ-59 | One engine: one start/checkpoint/finish/report-GET/evaluator for every type | Section A/B enumerate every existing route and module to collapse; Section D confirms `lib/report/structured.ts` + `ReportScoreCards`/`ReportBody` are ALREADY the one shared layer to build the rest around |
| REQ-60 | A type is a TS config record + prompts; adding one touches no engine code | Section C (`lib/interview/types.ts` precedent) and Section J (sequencing so config stays data) |
| REQ-61 | TYPE (code) + optional INSTANCE (S3) resolve into one session config | Section G (CaseStudy/ScenarioReport snapshot precedent) and Section C |
| REQ-62 | `terminationPolicy` incl. avatar-initiated end, recorded reason | Section C: no such primitive exists today — `turn-control.ts`'s "closing" stage is model-initiated-but-student-paced, never abrupt; must be built net-new |
| REQ-63 | Per-turn visible-context slice | Section C: nothing today restricts what the model "sees" per turn beyond the sliding window; net-new primitive |
| REQ-64 | Outcome record (JSON) + explicit time budget in tail block | Section C: `buildProgressBlock`'s tail-block precedent is exactly the mechanism to extend; no outcome record exists today |
| REQ-65 | One `InteractionReport` table, `inputSnapshot` JSON, scores JSON map | Section G: full column-by-column mapping |
| REQ-66 | Backfill renders identically at existing URLs | Section G risk analysis; Section D (report page divergences that must survive) |
| REQ-67 | Migration local-only, human-run handoff | Section G and HANDOFF.md §3 precedent (Section I) |
| REQ-68 | `/practice/[type]` tree, old paths permanently redirect | Section H |
| REQ-69 | Invisible refactor; divergences preserved | Section A (session-route divergences) and Section D (report-page divergences), both enumerated exhaustively |
| REQ-70 | One generic wizard, per-type steps, one consent gate | Section D (today's two entirely separate wizards/shells) |
| REQ-71 | Rubric type-derived, four shared + extras | Section B (`structured.ts`, both evaluators' identical hardcoded schema) |
| REQ-72 | Visual/Vocal never optional, full four-state handling | Section F (`lib/metrics/coverage.ts`, already fully shared) |
| REQ-73 | System prompt session-constant; tail block carries state | Section C (prefix-cache contract already documented in `lib/interview/prompts.ts`) |
</phase_requirements>

## Summary

The interview and scenario pipelines are NOT two parallel forks that drifted —
they are two *generations* of the same idea, written at different times, that
already share a surprising amount at the bottom of the stack and diverge almost
completely at the top. `lib/report/structured.ts` (the JSON schema fragment,
parser, and markdown composer), `lib/report/body-signal-validator.ts`, all of
`lib/metrics/*` (types, coverage, ingest), and the two leaf report components
(`ReportScoreCards.tsx`, `ReportBody.tsx`) are ALREADY one shared layer, byte-
identical in contract, imported by both sides. Everything above that — the
session routes, the evaluator *modules* (not the shared schema they both
import), the prompt-assembly files, the client session shells, and the report
*pages* (not the leaf components they render) — are two independent,
hand-copied implementations that have each evolved their own bugs, fixes, and
idioms (see the extensive "copies this file's structure... rather than
importing from it, so the two can evolve independently" doctrine stated
verbatim in `lib/scenario/evaluation.ts`'s own header comment).

The two pipelines diverge in ways that are NOT decorative and must be preserved
per REQ-69: scenario has no checkpoint route (a scenario's transcript is
reconstructed by `/api/interaction/finish`-style event-walking only at finish
time, never mid-session); the interview evaluator never throws (returns a
discriminated union) while the scenario evaluator throws a typed error and
pushes failure handling to the caller; the report pages poll at different
intervals with different give-up windows and have entirely different 404
semantics (interview distinguishes 401-needs-login from 404; scenario does
not); only interview has a retry route; only interview has a `/reports` list
page (scenario reports are not listed anywhere in the UI today). The client
session shells are the furthest apart: `InterviewSessionShell.tsx` (1,172
lines) is a dedicated, reusable component; the scenario/case-play experience
lives entirely inline in `app/case-play/[caseId]/page.tsx` (2,319 lines), which
ALSO still carries the pre-Phase-9 admin/cohort "legacy case" pipeline branched
on `isScenario = Boolean(caseData?.ownerId)`. Unifying these into one generic
shell is the single largest risk in this phase, both technically (HeyGen
session lifecycle, camera/vocal capture wiring, two different state machines)
and procedurally (one shared component touched by every later wave).

None of REQ-62/63/64's primitives (termination policy, visible-context slice,
outcome record) exist in any form today — they are genuinely new engine
concepts, not generalizations of something already there. The closest existing
precedent for a type-declared config record is `lib/interview/types.ts`
(`InterviewType` + `getInterviewType()`), and the closest precedent for a
student-authored instance layered on a type is `CaseStudy` + `ScenarioReport`'s
run-time snapshot discipline (REQ-33 from Phase 9, still enforced in
`lib/scenario/evaluation-runner.ts`'s "re-fetching would grade against an
edited or deleted scenario" comment).

The migration (REQ-65/66/67) is qualitatively different from every migration
this project has shipped so far. HANDOFF.md §3 records that all seven prior
migrations were purely additive (`ADD COLUMN`, `CREATE TABLE`, zero `NOT NULL`
on a pre-existing table, zero `DROP`) — that is explicitly why they were safe
to hold locally and apply later. Phase 13's migration is additive (new table)
PLUS a data backfill PLUS two `DROP TABLE`s. That is a new risk category this
project has not exercised, and it should be planned as such: create-new-table
→ backfill (script, not raw migration SQL — see Section G) → verify row-for-
row → drop-old-tables, with the drop as its own reviewable step a human can
decline to run.

**Primary recommendation:** Treat this phase as three largely independent
tracks that converge only at the very end: (1) a pure-library engine core
(config records, termination/visible-context/outcome/time-budget primitives,
prompt assembly, evaluator) that touches no existing file; (2) the Prisma
migration + backfill script + DTO, built and tested against the local DB only;
(3) the client unification (one wizard, one shell, one report page) which is
the only track that touches the large pre-existing files
(`InterviewSessionShell.tsx`, `app/case-play/[caseId]/page.tsx`, both report
pages) and therefore must run with minimal fan-out and real file-level
exclusivity between plans in the same wave.

## Architecture Patterns

### A. The two session pipelines, side by side

**Interview** (`app/api/interview/session/{start,checkpoint,finish}/route.ts`):
- `start` (lines 39-163): auth → validates `typeSlug`+`customization` through
  `resolveInterviewType`/`resolveCustomizationRecord` (the ONLY place that
  validates) → resolves `cameraMode` server-side, force-OFF if no consent →
  creates `InterviewReport` row `status: IN_PROGRESS` with the *resolved*
  customization spread onto it → returns `{reportId, cameraMode}`. No S3 write
  at all at start.
- `checkpoint` (fires ~9-15x per session, fire-and-forget from the client):
  loads the row (ownership via `findFirst({id, userId})`), rejects if not
  `IN_PROGRESS`, rebuilds the FULL transcript from client-sent turns via
  `buildInterviewTranscript`, writes it to S3 (`s3Storage.saveInterviewTranscript`),
  updates `turnCount`+`transcriptKey`. No LLM calls.
- `finish`: same shape as checkpoint but additionally: parses the metrics
  payload (`parseMetricsPayload`), flips `status: PENDING`, writes
  `visualMetrics`/`vocalMetrics`, then `waitUntil(runAndPersistEvaluation(...))`
  and returns 202 immediately (~200ms target). A double-submit returns 409
  WITH the reportId/status so the client can still navigate to the report.

**Scenario** (`app/api/scenario/session/{start,finish}/route.ts` — **no
checkpoint route exists**):
- `start`: auth → reads the scenario from **S3** (`s3Storage.getCase`, not
  Prisma) → enforces its own playability check inline (`ownerId` present AND
  (own OR published)) → resolves cameraMode identically to interview → creates
  `ScenarioReport` with a REQ-33 run-time SNAPSHOT of the scenario's name/
  background/avatars/criteria → separately creates an `InteractionLog` in S3
  (reusing the SAME `InteractionLog` type and `s3Storage.saveInteractionLog`
  the legacy `/api/interaction/*` path uses) → if the S3 log write fails,
  explicitly deletes the just-created Prisma row (no-orphan-row discipline,
  commented as a "Phase 6" precedent) → THEN updates the report row with
  `interactionLogId`+`studentEmail` in a second write. **Two Prisma writes at
  start, not one** (interview has exactly one).
- Session turns are accumulated into the S3 `InteractionLog.roleInteractions`
  via `/api/interaction/save` (see Section E) throughout the session — this is
  scenario's substitute for a checkpoint route; it is NOT session-scoped to
  Phase 13's report row, it is the pre-existing generic interaction-log save
  path, called from inside `app/case-play/[caseId]/page.tsx` directly.
- `finish`: loads the row, rejects if not `IN_PROGRESS`, mutates the CLIENT-
  SENT `log` object (forces `studentEmail` to the authenticated identity,
  pushes an `end_session` event, computes `totalMessages`/`totalTimeSeconds`),
  saves it to S3, THEN validates+persists metrics in **its own separate
  `prisma.scenarioReport.update`** (the finish-route comment explicitly notes
  this metrics write is awaited BEFORE `waitUntil`, unlike interview, "so the
  runner's own row read always sees them" — interview's finish writes metrics
  in the SAME update as the `status: PENDING` flip, scenario's finish does
  not flip status at all here; see evaluation-runner divergence below), then
  `waitUntil(runAndPersistScenarioEvaluation(...))`.

**Divergence list (every one is a REQ-69 "preserve, don't converge" item):**
1. Scenario has no checkpoint route at all — a long scenario that crashes
   mid-session loses nothing to Postgres (no `transcriptKey` ever written
   until finish) but DOES retain whatever `/api/interaction/save` already
   wrote to S3, because that save path is independent of the Prisma report row.
2. Scenario's `start` does two Prisma writes + one S3 write with an explicit
   compensating delete; interview's `start` does one Prisma write, zero S3.
3. Scenario's `finish` does NOT flip `status` to `PENDING` in the request path
   — that flip happens inside `runAndPersistScenarioEvaluation` itself (see
   Section B). Interview's `finish` flips to `PENDING` in the request path.
4. Interview's `finish`/checkpoint rebuild the transcript from turns the
   CLIENT sends every time (`buildInterviewTranscript`); scenario's transcript
   is derived at evaluation time from the S3 `InteractionLog`'s
   `roleInteractions` (preferred) or `events` (fallback) — two entirely
   different transcript-construction code paths (`lib/interview/transcript.ts`
   vs. inline functions in `lib/scenario/evaluation-runner.ts`).
5. Interview's `report/[reportId]` GET has a **retry** sibling route;
   scenario has none.
6. Interview has a reports-LIST route (`app/api/interview/reports/route.ts`,
   excludes `IN_PROGRESS`); scenario has no equivalent route anywhere, and
   `app/reports/page.tsx` only ever fetches `/api/interview/reports` — scenario
   runs are invisible in the cross-type reports list today.
7. Scenario's `caseId` is a bare, non-FK string (by design — "a report must
   survive deletion of the S3 scenario it came from," HANDOFF.md §3) with no
   interview analogue (interview has no comparable foreign scenario).

### B. The evaluation layer

`lib/report/structured.ts` (348 lines) is fully shared, zero divergence: the
`StructuredReport` type, `STRUCTURED_REPORT_PROPERTIES`/`_REQUIRED` JSON-schema
fragments, `parseStructuredReport`, and `composeReportMarkdown` are imported
verbatim by both `lib/interview/evaluation.ts` and `lib/scenario/evaluation.ts`.
`lib/report/body-signal-validator.ts` (`sanitizeBodySignalWording`) is likewise
imported verbatim by both. **This is the existing proof that a shared,
type-agnostic evaluator contract already works in this codebase** — REQ-71's
"evaluator's JSON schema becomes type-derived" is extending a pattern already
proven here, not inventing one.

What differs in substance between `lib/interview/evaluation.ts` (327 lines) and
`lib/scenario/evaluation.ts` (328 lines):
- **Error-handling contract.** Interview's `runInterviewEvaluation` NEVER
  throws — it returns `EvaluationOutcome | EvaluationFailure` (a discriminated
  union) and retries once internally. Scenario's `runScenarioEvaluation`
  THROWS a typed `ScenarioEvaluationError` on final failure; its own header
  comment states this is deliberate ("Unlike the interview evaluator, this
  THROWS..."). Both still retry once with the same budget math
  (`BUDGET_MS=50_000`, `RETRIES=1`).
- Both JSON schemas (`EVALUATION_JSON_SCHEMA` / `SCENARIO_EVALUATION_JSON_SCHEMA`)
  are byte-for-byte identical in shape (hardcode `visual_score`/`vocal_score`/
  `content_score`/`behavioral_score` plus the shared `STRUCTURED_REPORT_*`
  spread) — this is the literal hardcoding REQ-71 targets, duplicated in TWO
  files, not one.
- Interview's user-message builder (`buildUserMessage`) inlines
  `role_context` (roleTitle/industry/difficulty); scenario's
  (`buildScenarioEvaluationUserMessage`, in `lib/scenario/prompts.ts`) sends
  `caseName`/`background`/`characters`/`authorCriteria` instead — genuinely
  different per-type grading inputs, which is exactly what a type-declared
  rubric-context shape should parameterize.
- Model env vars differ: `INTERVIEW_EVAL_MODEL` vs `SCENARIO_EVAL_MODEL`
  (both default `"gpt-4.1"`).

The runners (`lib/interview/evaluation-runner.ts` 209 lines,
`lib/scenario/evaluation-runner.ts` 352 lines) share the exact same shape
(load row → build/derive transcript → resolve visual/vocal outcome via the
SAME `lib/metrics/coverage.ts` functions → call the evaluator → persist READY
or FAILED, never leave PENDING, legacy-row `cameraMode === null` guard on the
unscored-reason columns) but differ in:
- **Status-flip ownership.** Scenario's runner does `status: "PENDING"` itself
  as its FIRST write (line 197-200) — a status transition the interview
  finish-route already did before calling its runner. This means scenario's
  runner is reentrant-safe in a way interview's is not (interview's retry
  route independently flips to PENDING before calling the same runner,
  matching scenario's pattern there — so the inconsistency is really "the
  scenario finish-route defers the PENDING flip to the runner; the interview
  finish-route does it inline, but the interview RETRY route defers it too").
- Transcript sourcing is completely different code (Section A, divergence 4).
- Scenario's runner narrows `avatarsSnapshot` through its own
  `toEvaluationCharacters`, stripping `additionalInfo`; interview has no
  analogous narrowing step (resume text has no hidden sibling field).

**For REQ-71:** the type-derived JSON schema needs to generate
`required: [...fourAlwaysPresent, ...typeExtras]` and a matching
`properties` object per type, then merge that with
`STRUCTURED_REPORT_PROPERTIES`/`_REQUIRED` exactly as today's two hardcoded
schemas already do — this is a mechanical generalization of an existing
pattern, not new design.

### C. The prompt layer and turn control

`lib/interview/prompts.ts` documents its own cache-prefix contract explicitly
in its header comment (lines 1-21): `buildInterviewSystemPrompt` takes ONLY
session-constant inputs (type, resume text, language) and must never receive a
turn counter or timestamp; `buildProgressBlock` is appended to the LATEST USER
MESSAGE, never the system prompt, specifically so OpenAI's prefix cache
survives. This is the exact mechanism REQ-73 requires generalizing — it already
exists and already works; the engine's job is to make the system-prompt
assembly function take a `type + instance` config instead of an
`InterviewType`, and to make the tail-block builder generic over
termination-policy/visible-context/outcome/time-budget instead of only
interview progress.

`lib/interview/turn-control.ts` is where the live assembly ACTUALLY happens —
not inside `prompts.ts` but in `app/api/interaction/chat/route.ts` (see Section
E), which calls `buildInterviewSystemPrompt`+`buildProgressBlock` per request.
`turn-control.ts`'s `parseInterviewTurn` strips a trailing
`<interview-turn kind="..." />` marker the model is instructed to emit (defined
in the system prompt, Section C's `## TURN CONTROL MARKER`), and
`reduceInterviewProgress`/`nextPlannedProgress` is a hand-rolled state machine
over five hardcoded stages (`opening|resume|behavioral|role_specific|closing`).
**There is no existing "avatar ends the session" concept anywhere in this
state machine** — the only way a session ends today is the model reaching
`closing` stage on its own pacing, or the student clicking End. REQ-62's
avatar-initiated termination with a recorded reason is net-new: it most
naturally extends the SAME marker-and-tail-block machinery (a new marker
value, e.g. `kind="terminate"` with a `reason` attribute, parsed the same way
`category` is today) rather than a different mechanism.

`lib/interview/customization.ts` (`resolveInterviewType`,
`resolveCustomizationRecord`) is the ONLY place field validation happens for
interview's picker inputs, and is explicitly re-run on every chat turn (not
cached) because it is pure and the client resends the identical payload every
turn — this is what the chat-route comment calls out as what keeps the prefix
cache safe "under customization."

`lib/scenario/prompts.ts` (not fully read in depth here, 498 lines per
CONTEXT.md's own count) builds `SCENARIO_EVALUATOR_PROMPT` and
`buildScenarioEvaluationUserMessage` for the evaluator side; the LIVE scenario
system prompt is NOT assembled in `lib/scenario/prompts.ts` at all — it is
assembled per-turn directly in `app/api/interaction/chat/route.ts`'s `else`
branch (Section E) from `systemPrompt`/`roleContext` sent by the CLIENT on
every request, with a generic reply-style guide and language rule prepended.
This is a materially different and much thinner mechanism than interview's,
and is the ACTUAL thing REQ-73 must be careful not to regress: scenario's
prefix-cache contract today depends on the client re-sending byte-identical
`systemPrompt`/`roleContext` every turn, which is a weaker guarantee than
interview's server-side `resolveInterviewType` purity argument.

### D. Client surfaces

`InterviewSessionShell.tsx` (1,172 lines) is a dedicated, props-driven,
reusable component (`interviewType`, `customization`, `interviewerName`,
`interviewerAvatarId`, `avatarConfig`, `cameraMode` — the last one typed so
the component cannot change it, enforcing REQ-35's lock at the type level, not
just by convention). It owns: HeyGen avatar lifecycle via
`InteractiveAvatarWrapper`, visual/vocal capture via
`createVisualCapture`/`createVocalCapture`, the chat loop, turn-marker parsing
and progress reduction, and calls `/api/interview/session/{start,checkpoint,finish}`
directly by literal string path.

`app/case-play/[caseId]/page.tsx` (2,319 lines) is NOT a comparable shell — it
is the entire page, and it STILL carries the pre-Phase-9 "legacy admin case"
pipeline (cohort-based, multi-role, text/avatar toggle, 0-100 `evalScore`
stored only in S3) branched throughout on `isScenario = Boolean(caseData?.ownerId)`
(line 119). Every scenario-only effect/handler is individually gated
(`if (!isScenario) return;` appears at least 4 times; camera gating is
explicitly `isScenario && cameraMode === "ON"`). This means the "shell to
unify" is not a clean 1,172-line component vs. a clean scenario-equivalent —
it is 1,172 lines vs. roughly half of a 2,319-line page that was never
factored out of its legacy sibling. **Any Phase 13 plan that touches this file
must not disturb the `isScenario === false` (legacy admin case) branch at
all** — that pipeline is explicitly out of scope (CONTEXT.md's domain section:
"the scenario AUTHORING routes... are also not part of the session pipeline
and are not this phase's target," and the legacy admin-case runtime path is
adjacent to, not part of, what Phase 13 generalizes).

The pre-session wizards are two unrelated implementations:
`app/interview/[type]/page.tsx` (540 lines) is a dedicated 3-step wizard
(`SetupStep = "interviewer" | "resume" | "camera" | "session"`) with its own
`CAMERA_BLOCK_COPY`, consent-dialog wiring (`MetricsConsentDialog`), and
`ProgressItem` chrome. `app/case-play/[caseId]/page.tsx` has its OWN,
independent intro/setup UI inline (`PageState = "intro" | "playing"`, lines
63-84 show a SEPARATE, textually-identical `CameraBlockReason`/
`CAMERA_BLOCK_COPY` pair hand-copied into this file — confirmed by the
`CameraBlockReason` type and copy block both appearing verbatim in both files).
**This hand-copied camera-block copy is itself evidence for REQ-70**: the
consent gate already had to be duplicated once because there was no shared
wizard, and that duplication is precisely the thing the generic wizard exists
to stop from happening a third and fourth time in Phases 14-16.

Report pages diverge in ways that are REQ-69-protected, confirmed by direct
diff of `app/interview/[type]/report/[reportId]/page.tsx` (302 lines) against
`app/case-play/[caseId]/report/[reportId]/page.tsx` (291 lines):
- Poll cadence: interview polls every 2000ms, gives up at 120,000ms with a
  manual retry; scenario polls every 3000ms, gives up at 180,000ms with a
  manual "check again" (no retry endpoint to call, since none exists).
- 404 handling: interview's `load()` distinguishes a 401 (`setNeedsLogin(true)`)
  from a 404 (`setError(...)`); scenario's has no 401-specific branch, only
  `setNotFound(true)`, and additionally guards against re-polling after a 404
  via a `hasLoadedOnceRef` the interview page does not have.
- Chrome: only the interview report page imports
  `ReportCustomizationStrip` (customization/preset display) — scenario reports
  have no equivalent strip (there is no customization concept on a scenario
  run beyond its snapshot).
- Both pages import the SAME `ReportScoreCards`/`ReportBody` leaf components
  and pass them the same `{scores, pending, metrics}`/body-structured-report
  props — **this is the part that is already unified** and should be left
  completely alone.

`components/interview/CustomizePanel.tsx` (329 lines) and
`components/interview/ReportCustomizationStrip.tsx` (91 lines) are interview-
only; there is no scenario analogue because a scenario has no "customization"
concept distinct from its snapshot — these two components are exactly the
kind of "step needing custom UI supplies its own component" (REQ-70) artifact
and should likely become the interview TYPE's own step component(s) under the
unified wizard, not generalized into the wizard itself.

### E. The chat/turn endpoint — already a shared layer, with a buried branch

`app/api/interaction/chat/route.ts` is the SINGLE existing chat endpoint for
BOTH pipelines today: it branches on `if (interview && interviewType && ...)`
to run the interview-specific system-prompt/progress-block assembly
(Section C), and falls through to an `else` branch that assembles a generic
case-study-style prompt from CLIENT-SUPPLIED `systemPrompt`/`roleContext` —
this `else` branch is what the scenario pipeline (and the still-live legacy
admin-case pipeline) actually calls. **This route is therefore already the
closest thing to a unified engine entry point in the codebase today** — the
natural evolution for REQ-59 is to make this route resolve a TYPE+INSTANCE
config and call one generic prompt-assembly function instead of branching on
a boolean `interview` flag, rather than inventing a brand new chat endpoint.

`app/api/interaction/{start,finish,save,get}/route.ts` are a DIFFERENT, OLDER
layer: `start`/`finish` implement the pre-Phase-9 admin/cohort case pipeline
(0-100 `evalScore` stored only in the S3 `InteractionLog`, no Prisma report row
at all, admin-only `studentEmail` override via `isAdminRole`). `save`/`get` are
genuinely shared infrastructure UNDER both the legacy pipeline AND the
scenario pipeline — `app/case-play/[caseId]/page.tsx` calls
`/api/interaction/save` throughout a scenario session to persist
`roleInteractions` to the SAME `InteractionLog` S3 shape scenario's own
`session/start`/`session/finish` routes read and write. **This is scenario's
substitute checkpoint mechanism** (Section A, divergence 1) — it is NOT part
of the Prisma report-row lifecycle, and CONTEXT.md's domain section
confirms `/api/interaction/*`'s cohort-based evaluation path is explicitly
NOT this phase's target. Do not delete or restructure `/api/interaction/
{start,finish,save,get}` as part of Phase 13 — they must keep serving the
legacy admin-case path exactly as today, and scenario's reliance on `save`/
`get` must be preserved even if the Prisma-side session lifecycle moves into
the engine.

### F. Metrics ingestion — already fully unified, zero changes needed structurally

`lib/metrics/ingest.ts` (`parseMetricsPayload`, `asVisualMetrics`/
`asVocalMetrics`, `toMetricsJsonInput`) and `lib/metrics/coverage.ts`
(`resolveVisualOutcome`/`resolveVocalOutcome`) are imported VERBATIM and
IDENTICALLY by both finish routes and both evaluation runners today — there is
no duplication to collapse here at all. `resolveVisualOutcome`'s own header
comment states the governing principle explicitly and is already proven
type-agnostic (it takes `CameraMode`+`VisualMetrics`, nothing interview- or
scenario-specific). **REQ-72 ("a type never wires metrics, so it can never
forget to") is satisfiable purely by having the engine's one finish-route and
one evaluation-runner call these same two already-shared functions
unconditionally for every type** — the primitive to guarantee is structural:
the engine's finish handler must always call `parseMetricsPayload`, and the
engine's runner must always call `resolveVisualOutcome`/`resolveVocalOutcome`
and always include `visual`+`vocal` in the rubric-dimension set (never let a
type's config omit them), rather than something that needs new code in
`lib/metrics/`.

`app/api/metrics/consent/route.ts` is a single, already-shared consent
GET/POST against `User.videoAnalysisConsentAt`; both session-start routes read
this via an identical `prisma.user.findUnique` + null-coalesce pattern
(Section A) — this is a THIRD place the exact same six-line snippet is
duplicated (start/interview, start/scenario) and is a candidate for extraction
into the engine's session-start handler, though it is pure code hygiene, not a
new requirement.

### G. The Prisma + data migration problem

**Column-by-column mapping, `InterviewReport` + `ScenarioReport` →
`InteractionReport`:**

| Destination | Source(s) | Notes |
|---|---|---|
| `id` | both `id` | same type (uuid), collision-free to carry forward as-is |
| `userId` | both `userId` | unchanged, same FK to `User` |
| `typeSlug` | `InterviewReport.typeSlug` (already named this); `ScenarioReport` has no `typeSlug` today — must be synthesized, e.g. a literal `"scenario"` or `"case-study"` constant for every backfilled scenario row | **Risk:** Phase 13 doesn't define the scenario type's final slug; the backfill script must pick one and it becomes permanent/queryable history |
| `status` | both `status` (`InterviewReportStatus`) | identical enum values on both tables today (`IN_PROGRESS\|PENDING\|READY\|FAILED`) — safe to carry forward verbatim regardless of whether the enum is renamed (discretion item) |
| `inputSnapshot` (new JSON) | Interview: `interviewerAvatarId`, `interviewerName`, `resumeId`, `resumeText`, `industry`, `roleTitle`, `difficulty`, `targetMinutes`, `targetQuestionCount`, `interviewerPersona`. Scenario: `caseId`, `caseName`, `backgroundSnapshot`, `avatarsSnapshot`, `criteriaSnapshot` | CONTEXT.md already specifies the two shapes (`{kind:"interview",...}` / `{kind:"scenario",...}`) verbatim — this is a locked decision, not a discretion area |
| `transcriptKey` / `interactionLogId` | kept as-is OR converged (discretion) | If converged into one field, the backfill must pick a tagged-union shape (`{kind:"s3-transcript", key}` vs `{kind:"interaction-log", logId, studentEmail}`) since the two pointers resolve through DIFFERENT `s3Storage` read functions (`getInterviewTranscript` vs `getInteractionLog(studentEmail, caseId, logId)`) — not interchangeable without carrying enough context to call the right one |
| `scores` (new JSON map) | `visualScore`/`vocalScore`/`contentScore`/`behavioralScore` on both | Straightforward `{visual, vocal, content, behavioral}` map; a type's extra dimensions (Phase 14+) add keys, no migration — but THIS phase's backfill only ever populates the four known keys |
| `cameraMode`, `visualMetrics`, `vocalMetrics`, `visualUnscoredReason`, `vocalUnscoredReason`, `metricsConsentAt` | identical columns on both tables (Phase 10, `20260922134512_add_video_audio_metrics`) | Byte-identical shape and semantics on both sides already — zero transformation needed beyond a straight copy |
| `reportStructured`, `reportMarkdown`, `failureReason`, `evalModel` | identical columns on both tables | Straight copy |
| `turnCount` | both `turnCount` | Straight copy |
| `startedAt`, `completedAt`, `createdAt`, `updatedAt` | both, identical | Straight copy |
| — (dropped, no destination) | `ScenarioReport.studentEmail` | Only needed to resolve `interactionLogId` at evaluation time; if the backfill keeps `interactionLogId` as a column it must also keep `studentEmail` (or fold the student's email into the transcript pointer's JSON shape) — **do not drop `studentEmail` without first confirming the new transcript-read path can resolve an S3 scenario log without it** |

**Real risks in the backfill, beyond "write correct SQL":**
1. **The shared DB has live rows NOW** (seven migrations already applied,
   per HANDOFF.md §3, including `add_interview_report`/`add_scenario_report`/
   `add_video_audio_metrics` — all applied 2026-09-23). This means the
   backfill is not a greenfield operation: it must be idempotent/safe to
   re-run against local, and the human-run step against the shared DB is
   backfilling real student report rows, not test fixtures. **Unverified by
   this research: the actual row counts, date range, or whether any
   `IN_PROGRESS` rows currently sit abandoned in the shared DB** — these can
   only be checked by a human with shared-DB access; flag this as an open
   question for whoever reviews the handoff SQL.
2. **`InterviewReportStatus` is shared by both models today** (one Prisma
   enum, two tables). If Phase 13 renames it, both the new table's `status`
   column type AND any code path that imports the enum type name need
   updating together — this is a single mechanical rename, not a data risk,
   but it is the kind of two-line change a bracketed-pathspec git-index race
   (Section I) could silently lose half of if run in the same wave as
   something else touching `prisma/schema.prisma`.
3. **`ScenarioReport.caseId` has no FK by design** (HANDOFF.md §3: "a report
   must survive deletion of the S3 scenario it came from"). The new
   `InteractionReport` table must preserve this — `inputSnapshot`'s
   `{kind:"scenario", ...}` shape should carry `caseId` as a bare string
   inside the JSON blob, with NO foreign-key constraint, exactly replicating
   today's deliberate non-FK choice. Getting this wrong (e.g. adding an FK
   "for cleanliness") would silently break REQ-34's prior guarantee.
4. **`transcriptKey` vs `interactionLogId` are not just differently-named
   pointers to the same thing — they are read through two different S3
   accessor functions with different required context** (`getInterviewTranscript
   (userId, reportId)` vs `getInteractionLog(studentEmail, caseId, logId)`).
   Converging them into one field (a discretion item) means the read path
   must still dispatch on `typeSlug`/`inputSnapshot.kind` to call the right
   accessor — this is a real design decision, not a rename, and should be
   flagged as a plan-level decision point rather than assumed free.
5. **Legacy-row null-guard logic is pervasive and must survive the move.**
   Both current runners/report pages special-case `cameraMode === null` to
   mean "pre-Phase-10 row, do not synthesize an unscored-reason" (seen
   identically in both evaluation-runners' comments: "A legacy row
   (report.cameraMode === null) keeps both reason columns null... REQ-48").
   The backfill must preserve `cameraMode === null` exactly (not coerce it to
   `"OFF"`) for any row that had it null before — a backfill script that
   defaults nulls to `"OFF"` "to be safe" would violate REQ-48's "legacy
   reports never change" guarantee and silently alter 06-08/10-era rows'
   rendered unscored-reason text.

**What a safe migration+backfill sequence looks like, given Prisma's migration
model:** Prisma migrations are forward-only SQL files checked into
`prisma/migrations/`; they are not naturally "scriptable with conditional
logic" the way a one-off TypeScript backfill script is. Given REQ-67 requires
a human to review the SQL before running it against the shared DB, and given
the legacy-row null-preservation risk above, **the backfill itself should be a
separate TypeScript script (e.g. `scripts/backfill-interaction-reports.ts`,
following the `scripts/sync-s3-to-db.ts` / `scripts/verify-visual-metrics.ts`
precedent already in this repo's `scripts/` directory), not inline `INSERT...
SELECT` SQL inside the Prisma migration file.** The migration itself should be
exactly three reviewable units, each a separate migration or a separate,
clearly-delimited step the human can stop between: (a) `CREATE TABLE
InteractionReport` (purely additive, matching every prior migration's safety
profile), (b) the backfill script run against local, with its output
diffed/row-counted against the two source tables before anything is dropped,
(c) a SEPARATE migration that drops `InterviewReport`/`ScenarioReport` only
after (b) is independently confirmed — and per REQ-67, step (c) is plausibly
the one a human might choose to defer independently of (a)/(b), since dropping
tables is irreversible in a way creating one is not. This project's own prior
precedent (HANDOFF.md §3) never shipped a `DROP TABLE` in any migration so
far — this phase would be the first — and should be called out explicitly to
whoever reviews the handoff SQL.

### H. Routing and redirects

`middleware.ts` (reviewed) contains ONLY auth/role-based access control — no
rewrites or redirects for `/interview`/`/case-play` exist there today, and no
redirect infrastructure of any kind currently exists in this codebase (grep
confirmed `/interview`/`/case-play` string references are limited to: the
route trees themselves, their own API routes, `app/reports/page.tsx` (builds
a `/interview/{typeSlug}/report/{id}` link), `components/interactions/
InteractionTile.tsx` + `lib/interactions/index.ts` (dashboard tile `route`
fields, literally `"/interview"` and `"/case-play"`), and the scenario-authoring
components (`ScenarioBuilder.tsx`, `ScenarioCard.tsx`, `AvatarPickerGrid.tsx`)
which link to `/case-play/...` for editing/launching). **Note: CONTEXT.md
refers to `lib/interactions/registry.ts` but the actual file is
`lib/interactions/index.ts`** (with a sibling `types.ts`) — this is a minor
naming drift in CONTEXT.md's domain section the planner should be aware of
when writing task file paths.

For Next.js App Router permanent redirects, two mechanisms exist: (1)
`redirects()` in `next.config.js` — static, config-driven, matched before any
route rendering, supports path params and `permanent: true` (308); (2) a
route handler / `page.tsx` that calls `redirect()` from `next/navigation`.
Given REQ-68 needs `/interview/[type]/...` → `/practice/[type]/...` and
`/interview/[type]/report/[reportId]` → `/practice/[type]/report/[reportId]`
(simple 1:1 path-segment remapping with no new logic), `next.config.js`'s
`redirects()` is the better fit — it is declarative, does not require keeping
the old page files around as redirect shims, and is the standard Next.js
mechanism for "old path always goes to new path." The one thing to verify at
plan time (not resolvable by static research) is whether `next.config.js`
`redirects()` supports the exact dynamic-segment pattern needed for both
`/interview/[type]` → `/practice/[type]` and `/interview/[type]/report/
[reportId]` → `/practice/[type]/report/[reportId]`, and `/case-play/[caseId]`
→ `/practice/{scenarioTypeSlug}/[caseId]` — this last one is NOT a 1:1 segment
rename (the destination needs a literal type-slug segment `/case-play` never
had), so it likely needs a redirect FUNCTION (`source`/`destination` with
params) rather than a static rewrite rule, or a thin route-handler redirect if
`next.config.js` can't express the literal-slug injection. Flag this as a
plan-level implementation decision, not a research gap — it is answerable by
reading Next.js's own redirects() docs at plan time, which is squarely a
planning/execution concern, not an archaeology one.

`next.config.js` itself was not read in this pass (REQUIRED reading at plan
time, since any redirects added here are plan content) — flagging as an open
item rather than asserting its current contents.

### I. Pitfalls specific to this refactor

1. **The git-index race, extensively documented and recurring every single
   phase since Phase 8** (STATE.md, HANDOFF.md §"One hard-won lesson about
   parallel agents"): plans running concurrently in one working directory
   with no worktree isolation share one git index; a bracketed pathspec
   (`app/interview/[type]/...`) glob-matches a sibling's staged file, and even
   literal-path commits have been absorbed into a sibling's commit when a
   `git add` landed in the narrow window before `git commit`. This has
   happened in EVERY phase from 8 through 12. Given Phase 13's single
   must-touch files (`prisma/schema.prisma`, `app/case-play/[caseId]/page.tsx`,
   both report pages, `middleware.ts`/`next.config.js`) are each touched by
   at most one plan at a time by design (see Section J), the main exposure is
   any two plans in the SAME wave that both need to touch `prisma/
   schema.prisma` (migration + enum rename, e.g.) or both touch
   `lib/interactions/index.ts` (registry wiring) — these should be serialized,
   not parallelized, regardless of file-list non-overlap elsewhere.
2. **Scenario has no checkpoint route, so a long scenario loses its
   Postgres-side transcript pointer differently than an interview does** — an
   interview that crashes mid-session has its last checkpoint's
   `transcriptKey` on the row; a scenario that crashes mid-session has
   NOTHING on the `ScenarioReport` row (no `interactionLogId` was ever
   written until finish succeeds) but the S3 `InteractionLog` itself may
   still have partial `roleInteractions` from `/api/interaction/save` calls
   that happened during the session. If Phase 13's unified engine adds a
   checkpoint call for scenario-type sessions "for free" (because the generic
   shell issues it unconditionally), that is an observable BEHAVIOR CHANGE a
   student could notice (a resumable scenario where today there is none) —
   REQ-69 requires this to be either explicitly preserved as "scenario simply
   never calls checkpoint" (the CONTEXT.md discretion item already
   anticipates this exact fork) or raised as a checkpoint if preserving it
   turns out to be impossible in a truly generic shell.
3. **HeyGen avatar session lifecycle is coupled into `InterviewSessionShell.tsx`
   directly** (`InteractiveAvatarWrapper`/`StreamingAvatarSessionState`) with
   its own `avatarReady`/`isPaused` state and, per STATE.md's Phase 10 carried-
   forward notes, a documented past defect class around camera-stream-start
   needing a SYNCHRONOUS in-flight guard "whenever an external event (an
   avatar reconnect) can re-invoke the start path while the first request is
   still pending." Any unification of the two shells must treat HeyGen
   session start/reconnect as a single, carefully-guarded code path — this is
   exactly the kind of logic that is easy to almost-duplicate-correctly when
   merging two independently-evolved implementations and get subtly wrong.
4. **`app/case-play/[caseId]/page.tsx` is not a scenario-only file** — it is
   two pipelines in one file (Section D). Any plan touching this file for
   Phase 13 purposes must be scoped narrowly enough that a reviewer can
   confirm the `isScenario === false` branch is byte-unchanged, the same
   discipline multiple past Phase 9/11 plans already explicitly verified
   ("`app/case-play/[caseId]/page.tsx` deliberately received zero edits by
   design" — 11-04's STATE.md entry — is the closest precedent for "touch
   this file surgically or not at all").
5. **No `CLAUDE.md` exists in this repository** — the only repo-wide
   agent-instructions file is `AGENTS.md`, which is generic Cursor-Cloud
   boilerplate (stale: it describes the pre-GSD `Attempt`/`CaseAssignment`
   schema, not the current `InterviewReport`/`ScenarioReport` one) and
   contains no constraints specific to this refactor. The real constraints
   live in `HANDOFF.md` and `STATE.md`, both of which are cited throughout
   this document.
6. **`HANDOFF.md` §3's entire precedent is "every migration so far is purely
   additive."** Phase 13 breaks that pattern (Section G) — this is worth
   flagging explicitly to whoever reviews the handoff SQL, since the review
   process that worked for seven additive migrations (read the SQL, confirm
   no `NOT NULL`/`DROP`, apply) is not sufficient scrutiny for a migration
   that also drops two tables full of live student data.
7. **The report pages' different 404/401 handling (Section D) is easy to
   "fix" as a bug while unifying** — scenario's report page has no
   `needsLogin` state at all. A unified report page that adds 401-detection
   to scenario reports (even as a strict improv8ment) would be an unsanctioned
   visible-behavior change under REQ-69's "the two experiences diverge today
   ... do NOT converge them" rule, unless the divergence is judged impossible
   to preserve and raised as a checkpoint instead.

### J. Sequencing recommendation

**Three tracks, largely parallel, converging late:**

**Track 1 — Engine core (pure library, touches no existing route/component).**
New modules under wherever the planner names the engine (discretion item) for:
the TYPE+INSTANCE config resolver, `terminationPolicy`, visible-context slice,
outcome record, time-budget tail-block extension, and the type-derived JSON
schema (extending `lib/report/structured.ts`'s existing pattern — this file
IS touched, but additively, since it already exports the shared pieces both
evaluators import). This track can run as its own wave with no file conflicts
against Tracks 2/3, because none of today's existing routes/components need to
exist differently for this track's new files to compile and be unit-tested.

**Track 2 — Data: migration + backfill + DTO.** `prisma/schema.prisma`
(new `InteractionReport` model, additive migration), the backfill script
(new file under `scripts/`), and the new unified DTO (likely
`lib/report-dto.ts` or similar, replacing `lib/interview/report-dto.ts`+
`lib/scenario/report-dto.ts`). This track should be its OWN wave, serialized
ahead of Track 3's report-page work (the report page needs the final DTO
shape to render against) but can run concurrently with Track 1. The
DROP-TABLE step (Section G) should be its own plan/checkpoint, gated on human
confirmation per REQ-67, and should not be bundled into the same plan as the
`CREATE TABLE`+backfill — so that a human can apply the create+backfill to
the shared DB (if/when ready) without being forced to also drop the old
tables in the same action.

**Track 3 — Routes + client surfaces.** This is where file-overlap risk is
real and must be planned explicitly:
- The new unified session routes (`start`/`checkpoint`/`finish`/report-GET)
  are NEW files (under `/practice/[type]` or an API-only engine path) — no
  overlap with existing interview/scenario routes, which can be deleted or
  left as thin pass-throughs in the SAME plan that creates the new ones (to
  avoid two plans both needing to touch the old routes).
- The chat route (`app/api/interaction/chat/route.ts`) is touched by exactly
  one plan — it already has the branch point (Section E) and should be
  generalized by ONE plan, not split across two.
- The client unification (generic wizard, generic session shell, generic
  report page) is the highest-risk, highest-fan-out work: it touches
  `app/case-play/[caseId]/page.tsx` (2,319 lines, dual-pipeline),
  `components/interview/InterviewSessionShell.tsx` (1,172 lines), both
  report pages, and `middleware.ts`/`next.config.js` for the redirects. These
  should be ONE plan per surface (wizard, shell, report page, redirects) run
  SERIALLY, not in parallel within the same wave, specifically because
  `app/case-play/[caseId]/page.tsx` is large enough and dual-purpose enough
  that even non-overlapping line ranges risk the documented git-index
  bracketed-pathspec hazard (the path itself contains `[caseId]`) if two
  plans touch it in the same wave.
- `lib/interactions/index.ts`/`types.ts` (dashboard tile wiring, a discretion
  item) should be its own small, late plan — it only needs to change once the
  new `/practice/[type]` routes exist to point at.

**Which plan carries the human-run migration handoff (REQ-67):** the Track 2
plan that performs the `CREATE TABLE` + backfill should explicitly end with
"hand this SQL + backfill script output to a human" as its OWN final task,
matching the HANDOFF.md §3 precedent's framing — this should not be silently
folded into a later plan's checkpoint, since REQ-67 states Phase 13 does not
close until a human has run it, meaning the phase's own completion criteria
depend on an out-of-band action this plan must surface explicitly, not just
perform the local half of.

**Which plan is the non-autonomous end-to-end validation:** given REQ-66's
acceptance test is "every existing report renders identically at its existing
URL," the final Phase 13 plan (after Track 3's client work lands) should be a
dedicated, explicitly non-autonomous verification pass: load N known
pre-Phase-13 interview reports and N known scenario reports (by URL, through
the new redirect layer) and manually confirm scores/metrics/body-language/
Moments/snapshot strip are pixel-identical to their pre-refactor rendering —
this cannot be scripted against the shared DB (no agent has access) and must
be done against the LOCAL backfilled DB with real pre-existing local rows,
which means Track 2's backfill script must be run locally well before this
final validation plan, not right before hand-off.

## Open Questions

1. **Does `next.config.js`'s `redirects()` support literal-segment injection
   for `/case-play/[caseId]` → `/practice/{scenarioTypeSlug}/[caseId]`?**
   - What we know: Next.js `redirects()` supports dynamic path params and
     `permanent: true`; the interview-side remap (`/interview/[type]/...` →
     `/practice/[type]/...`) is a trivial 1:1 segment rename.
   - What's unclear: the scenario side needs to inject a type-slug segment
     that never existed in the old path (`/case-play/[caseId]` has no type
     segment at all) — whether a static `redirects()` entry can express
     "always insert the literal string X here" vs. needing a function-based
     redirect or a thin route-handler shim was not resolved by static reading
     and should be confirmed against current Next.js docs at plan time.
   - Recommendation: treat as a plan-time implementation detail, not a
     phase-blocking unknown.

2. **What is the actual current state of the shared Lightsail DB's
   `InterviewReport`/`ScenarioReport` tables (row counts, any stuck
   `IN_PROGRESS` rows, date range)?**
   - What we know: all seven prior migrations are applied there
     (HANDOFF.md §3); this research has no access to query it.
   - What's unclear: whether the backfill script needs to handle any
     known-bad data shape beyond what the local dev DB's seed/test rows
     exercise.
   - Recommendation: the human who reviews/runs the Phase 13 migration SQL
     should also be asked to run a read-only row-count/status-distribution
     query against the shared DB before the backfill script is finalized, so
     the script's edge-case handling is informed by real data, not just the
     code-level null-guards already documented in Section G.

3. **Should `transcriptKey`/`interactionLogId` converge into one pointer
   field, per the CONTEXT.md discretion item?**
   - What we know: they are read through two incompatible accessor
     functions requiring different context (Section G, risk 4).
   - What's unclear: whether a tagged-union JSON column is worth the added
     read-path branching versus simply keeping two nullable columns
     (`transcriptKey: string | null`, `interactionLogId: string | null`) on
     the unified table, which is simpler and arguably more in keeping with
     "per-type input is one JSON column" applying to `inputSnapshot`, not
     necessarily to every pointer field.
   - Recommendation: default to keeping them as two separate nullable
     columns unless the planner has a concrete reason to converge — this is
     explicitly left to discretion in CONTEXT.md and this research found no
     evidence that convergence is necessary for any Phase 13 requirement.

## Conflicts with a locked decision

None found. Every locked decision in CONTEXT.md was checked against what
actually exists in the code (the two Prisma models, both DTOs, both session
route trees, both evaluators, both report pages, the chat route, the metrics
layer) and nothing contradicts a technical constraint discovered during this
research. The one item worth the planner's explicit attention (not a
conflict, a clarification) is that CONTEXT.md's domain table cites
`lib/interactions/registry.ts`, which does not exist by that name — the actual
file is `lib/interactions/index.ts` (plus `types.ts`) — functionally identical
to what CONTEXT.md describes, just a different filename.

## Sources

### Primary (HIGH confidence — direct file reads against the working tree)
- `app/api/interview/session/{start,checkpoint,finish}/route.ts`
- `app/api/scenario/session/{start,finish}/route.ts`
- `app/api/interview/report/[reportId]/route.ts`,
  `app/api/interview/report/[reportId]/retry/route.ts`
- `app/api/scenario/report/[reportId]/route.ts`
- `app/api/interview/reports/route.ts`
- `app/api/interaction/{chat,start,finish,save,get}/route.ts`
- `lib/interview/evaluation.ts`, `lib/scenario/evaluation.ts`
- `lib/interview/evaluation-runner.ts`, `lib/scenario/evaluation-runner.ts`
- `lib/report/structured.ts`, `lib/report/body-signal-validator.ts`
- `lib/interview/types.ts`, `lib/interview/turn-control.ts`,
  `lib/interview/prompts.ts` (partial — header, system-prompt builder,
  progress-block builder)
- `lib/interview/report-dto.ts`, `lib/scenario/report-dto.ts`
- `lib/metrics/ingest.ts` (partial), `lib/metrics/coverage.ts` (full)
- `lib/interactions/types.ts`, `lib/interactions/index.ts`
- `components/interview/InterviewSessionShell.tsx` (header/imports/state,
  targeted greps for route calls)
- `app/case-play/[caseId]/page.tsx` (header/imports, targeted greps for
  `isScenario`/cameraMode/route calls)
- `app/interview/[type]/page.tsx` (header, wizard-step greps)
- `app/interview/[type]/report/[reportId]/page.tsx` vs.
  `app/case-play/[caseId]/report/[reportId]/page.tsx` (direct diff)
- `prisma/schema.prisma` (`InterviewReport`, `ScenarioReport`,
  `InterviewReportStatus`)
- `middleware.ts` (full read)
- `.planning/REQUIREMENTS.md` (Phase 13 section, REQ-59..73)
- `.planning/ROADMAP.md` (Phase 13 section)
- `.planning/one-on-one-interactions-brief.md` (full)
- `.planning/phases/13-one-on-one-conversation-engine/13-CONTEXT.md` (full)
- `.planning/HANDOFF.md` (§1, §3, §"parallel agents" lesson)
- `.planning/STATE.md` (git-index race citations across Phases 8-12;
  Phase 9/10/12 carried-forward decisions)
- `AGENTS.md` (confirmed generic/stale, no repo-specific CLAUDE.md exists)

### Secondary (MEDIUM confidence)
- None — this research used no web search; it is entirely code archaeology
  per the task's explicit instruction.

### Tertiary (LOW confidence / unverified)
- The actual current contents of `next.config.js` were not read in this pass
  (flagged as Open Question 1 / Section H).
- The actual state of the shared Lightsail DB (row counts, stuck rows) is
  unverifiable by this research (flagged as Open Question 2).
- `lib/scenario/prompts.ts` and the full body of `lib/interview/prompts.ts`
  (evaluator prompt text, full live-system-prompt text beyond what's quoted)
  were read in part, not in full — the quoted excerpts are HIGH confidence
  (direct reads) but claims about the FULL file contents beyond what is
  quoted should be treated as representative, not exhaustive.

## Metadata

**Confidence breakdown:**
- Session-route/evaluator/runner divergence (Sections A, B): HIGH — every
  claim is a direct line-cited read of the actual route/module file.
- Prompt/turn-control layer (Section C): HIGH for what was read; the full
  live scenario system-prompt text in `lib/scenario/prompts.ts` was not
  exhaustively read, so claims about it are scoped to what the chat route
  (Section E) does with it, which WAS fully read.
- Client surfaces (Section D): HIGH for structural claims (file sizes,
  branch points, import lists, poll intervals — all grepped/diffed directly);
  MEDIUM for "this is the full extent of the divergence" since the two large
  files (2,319 and 1,172 lines) were not read end-to-end, only targeted.
- Migration/backfill risk analysis (Section G): HIGH for the schema mapping
  (both full models read); LOW/flagged for anything about the shared DB's
  actual data state, which is unverifiable.
- Pitfalls (Section I): HIGH — all sourced from direct STATE.md/HANDOFF.md
  citations, several with specific commit hashes.

**Research date:** 2026-10-02
**Valid until:** This is a refactor-planning document against a specific git
commit range on `feature/visual-analysis-expansion`; it should be treated as
valid only until the next commit touches any of the files cited above. Given
this phase is about to execute plans against these exact files, re-verify any
specific line numbers cited here if more than a few plans land before this
document is consumed.
