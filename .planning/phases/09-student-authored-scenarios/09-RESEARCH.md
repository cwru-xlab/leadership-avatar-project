# Phase 9: Student-Authored Scenarios - Research

**Researched:** 2026-09-21
**Domain:** Brownfield Next.js 16 app — new authoring UI + real per-user ownership retrofit + new evaluation/report pipeline, built alongside an existing admin case-authoring/case-play system
**Confidence:** HIGH (all findings are direct codebase reads with file:line citations; no external library research was needed)

## Summary

This phase grafts real per-user ownership, a guided builder, and an evaluated-report pipeline onto a case system (`CaseStudy`/S3) that today has neither. The codebase already contains the exact patterns needed, but they live in a *different* subsystem than the one `/case-play` currently uses — this is the single most important thing for the planner to understand before task-breaking.

There are two parallel, non-integrated pipelines in this codebase today:
1. **Legacy case pipeline** (`CaseStudy` in S3, `InteractionLog` in S3, `/api/interaction/*`, cohort-required, `explore`/`assessed` modes, freeform-text evaluation via `evaluationPrompt`). This is what `/case-play/[caseId]` and `/case-management` use right now.
2. **Modern interview pipeline** (Phase 8, `InterviewReport` in Postgres/Prisma, `lib/interview/evaluation-runner.ts`, structured JSON evaluator output, owner-scoped via `userId`, no cohort). This is what `/interview/[type]` uses, and it is the pipeline CONTEXT.md explicitly says to mirror ("follow that precedent", "Not yet measured" idiom, "structurally similar to the interview prompt").

Phase 9 needs the **legacy pipeline's storage substrate** (S3 `CaseStudy`, reused player at `/case-play`) combined with the **modern pipeline's ownership/evaluation/report architecture** (Postgres row per user, snapshot-on-run, structured score cards). Neither existing pipeline is a drop-in fit; the planner must explicitly bridge them. This is the central architectural decision this research surfaces, not a known pitfall to avoid — a plan that just "hooks into the existing case-play flow" will inherit the cohort requirement and freeform evaluation that CONTEXT.md's decisions foreclose.

**Primary recommendation:** Extend the S3 `CaseStudy` record with a real `ownerId` (Postgres `User.id`) field and enforce it server-side in `app/api/case/*` routes using the exact `getCurrentUser(token)` pattern already used in `app/api/interview/session/start/route.ts`. Build a **new** Prisma model (e.g. `ScenarioReport`) that mirrors `InterviewReport` field-for-field (owner-scoped, snapshot columns, nullable visual/vocal), and a **new** evaluation runner/prompt module under `lib/scenario/` structurally mirroring `lib/interview/evaluation-runner.ts` + `lib/interview/prompts.ts`. Do not route student scenario runs through `/api/interaction/*` (`InteractionLog`) — that pipeline is cohort-required and produces unstructured evaluation text, which conflicts with REQ-32/33/34.

## User Constraints

### Locked Decisions
- A "scenario" = case-study-style roleplay (situation + one or more avatar characters), played in existing `/case-play`. NOT a saved interview preset.
- Guided step-by-step builder (situation -> characters -> criteria). Required minimum to save: situation, >=1 character, criteria.
- Avatar picker MUST mirror the interviewer card grid at `app/interview/[type]/page.tsx:285-296` (preview images), NOT the admin `<Select>` at `app/case-management/[caseId]/page.tsx:633`.
- Save is a distinct step; launch from the list; but the save must land the student where the new scenario is immediately startable.
- Real per-user ownership enforced SERVER-SIDE in route handlers (today `app/api/case/add|edit|delete` have NO auth code; only `middleware.ts:153-155` gates them).
- Private by default; publishable to all students reusing Phase 7 `published` flag pattern. No staff surface. Model must not preclude forking later.
- `/case-play` shows two separate sections (my scenarios / admin case studies).
- A scenario run is evaluated: author criteria compose ON TOP of a standard behind-the-scenes prompt (EQ + conversational adequacy), structurally similar to `lib/interview/prompts.ts`.
- Report snapshots the scenario at run time (Phase 8 precedent: resolved config persisted onto `InterviewReport` row).
- Reports survive scenario deletion. A published scenario must be unpublished before delete. No cap.
- Visual/Vocal CANNOT be scored in this phase (hardcoded null, Phase 6 decision, blocked on Phase 10) — must render "Not yet measured".

### Claude's Discretion
- The exact steps and copy of the guided builder, and what counts as sufficiently-specified for each required field.
- The shape of the standard behind-the-scenes evaluation prompt and how the author's criteria compose onto it.
- How owner scoping is actually modeled and stored (S3 key layout, a Postgres row, or a hybrid) — provided ownership is genuinely enforced server-side and not merely displayed.
- How the two `/case-play` sections are laid out, and the empty state for a student with no scenarios yet.
- Where the authoring entry point lives (a new dashboard tile via `lib/interactions`, an action on `/case-play`, or both).

### Deferred Ideas (OUT OF SCOPE)
- Saving an interview preset/customization as a reusable named variant (Phase 8's deferred idea — stays deferred).
- Link-based sharing (publishing to all students is the chosen mechanism).
- Forking a published scenario into your own copy — data model must allow it, but building the fork action is not required.
- Any staff-facing view of student-authored scenarios.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-------------------|
| REQ-25 | Student authors a case-style roleplay: situation + >=1 avatar character | `CaseStudy`/`CaseAvatar` shape already supports this (`types/index.ts:194-220`); builder just needs to produce a valid `CaseStudy` |
| REQ-26 | Guided step-by-step builder, hard-required minimum before save | No existing multi-step builder pattern in this codebase to copy verbatim; closest analog is the 2-step wizard in `app/interview/[type]/page.tsx` (`SetupStep` state machine, `ProgressItem`) — reuse that step-state/progress-bar shape |
| REQ-27 | Avatar picker mirrors interview card grid, not admin `<Select>` | Exact grid JSX at `app/interview/[type]/page.tsx:284-306`; underlying data source differs — see Open Question 1 |
| REQ-28 | Save is distinct step; launch from list; immediately startable | `app/case-play/page.tsx` list + `CaseCard` (`components/case-card.tsx`) is the launch surface; no code change needed to the list mechanics, just to what populates it |
| REQ-29 | Server-side per-user ownership enforcement | `getCurrentUser(token)` pattern at `app/api/interview/session/start/route.ts:38-46`; today's `app/api/case/add|edit|delete/route.ts` have zero auth code — this is the gap to close |
| REQ-30 | Private-by-default, publish-to-all, no staff surface, fork-safe model | `published?: boolean` already on `CaseStudy` (`types/index.ts:210-215`), filtered in `app/api/case/list/route.ts:6-12`; add `ownerId` alongside without touching `published` semantics |
| REQ-31 | Two sections on `/case-play` | `app/case-play/page.tsx` is a single flat list today (105 lines) — needs a second fetch + section split |
| REQ-32 | Evaluated run: author criteria + standard EQ/conversational prompt, Visual/Vocal "Not yet measured" | `lib/interview/prompts.ts` (session-constant discipline) + `INTERVIEW_EVALUATOR_PROMPT` structure to mirror; `UnmeasuredCard` in `components/interview/ReportScoreCards.tsx:69-84` is the exact "Not yet measured" idiom |
| REQ-33 | Snapshot scenario at run time onto report row | `prisma/schema.prisma` `InterviewReport` snapshot columns (`industry`, `roleTitle`, `difficulty`, `targetMinutes`, `targetQuestionCount`, `interviewerPersona`) written via `resolveCustomizationRecord(type)` in `app/api/interview/session/start/route.ts:96` — same pattern needed for scenario snapshot fields |
| REQ-34 | Reports survive scenario deletion; unpublish-before-delete; no cap | `InterviewReport.user` relation uses `onDelete: Cascade` on the *User* FK only, not tied to any Case row — a new `ScenarioReport` model should NOT foreign-key to the S3-backed scenario at all (there's nothing to FK to), which trivially satisfies "survives deletion" |

## Architecture Patterns

### Pattern 1: Server-side ownership check via `getCurrentUser`
**What:** Every mutating route reads the JWT cookie, resolves the current user, and checks ownership before acting — never trusting the client body.
**When to use:** `app/api/case/add`, `/edit`, `/delete` (and any new scenario-specific routes) once students can call them.
**Example (existing, HIGH confidence):**
```typescript
// Source: app/api/interview/session/start/route.ts:38-46
const token = request.cookies.get(siteConfig.auth.cookie.name)?.value;
const currentUser = await getCurrentUser(token || "");
if (!currentUser) {
  return response({ error: "Unauthorized" }, 401);
}
```
`getCurrentUser` lives in `lib/auth.ts:80-103` and returns `{ id, email, name, role, studentId, authProvider }` from the verified JWT payload — `id` is the Postgres `User.id` (uuid). This is the identity to store as `CaseStudy.ownerId`.

**Ownership-check shape to add to `edit`/`delete`:**
```typescript
// app/api/case/edit/route.ts and /delete/route.ts today (lines 1-58, 1-47) have
// NO such check at all — this is entirely new code, not a modification of
// existing logic. Pattern: load the existing case, compare ownerId, then:
if (existing.ownerId && existing.ownerId !== currentUser.id && currentUser.role !== "admin") {
  return NextResponse.json({ error: "Not found" }, { status: 404 }); // 404, not 403 — see InterviewReportDTO comment on "404-never-403 contract"
}
```
Note: `lib/interview/report-dto.ts:14` documents a deliberate "404-never-403" contract for owner-scoped resources elsewhere in this codebase (don't leak existence of other users' rows) — worth adopting for scenario routes too, though CONTEXT.md doesn't mandate it explicitly.

### Pattern 2: Middleware route classification (`STUDENT_ROUTES` vs `ADMIN_ROUTES`)
**What:** `middleware.ts` gates routes by a role list *before* any handler code runs. `STUDENT_ROUTES` matches are checked and returned first (`middleware.ts` main function, isStudentRoute branch runs before isAdminRoute branch), so a route present in both lists resolves as student-accessible.
**When to use:** Today `/api/case/add|edit|delete` are ONLY in `ADMIN_ROUTES` (`middleware.ts:153-155`). To let students author scenarios, these three routes (or new dedicated `/api/scenario/*` routes — see Open Question 2) must be added to `STUDENT_ROUTES` (`middleware.ts:~194-210`), and the route handlers themselves must then do the real per-user gating (Pattern 1), since middleware only checks role, never resource ownership.
**Also relevant:** `/api/case/list` and `/api/case/get` are currently in *neither* list, meaning they fall through to the generic "authenticated user of any role" path (need to verify exact fallback — see Open Question 3) or are effectively public-to-any-authenticated-user today. Any new scenario endpoints should be added explicitly rather than assumed to inherit case's current gating.
**Anti-pattern:** Do not rely on middleware alone for ownership ("gated purely by middleware" is explicitly called out in CONTEXT.md as the current bug to fix for REQ-29).

### Pattern 3: Snapshot-on-start, not snapshot-on-finish
**What:** The Phase 8 precedent resolves and writes the full customization snapshot onto the report row at session **start**, not at evaluation time, so the row is truthful even if the source config (interview type / customization options) changes before evaluation runs.
**Example (existing, HIGH confidence):**
```typescript
// Source: app/api/interview/session/start/route.ts:93-110
const customizationRecord = resolveCustomizationRecord(type);
const report = await prisma.interviewReport.create({
  data: {
    userId: currentUser.id,
    typeSlug: type.slug,
    ...
    ...customizationRecord,
  },
});
```
**For scenario runs:** snapshot the resolved `CaseStudy` (situation, avatars, criteria/evaluationPrompt) onto the new `ScenarioReport` row at the moment the student clicks "Start," not when the run finishes. This satisfies REQ-33 even if the student edits the scenario mid-run or afterward.

### Pattern 4: Background evaluation via `waitUntil`, terminal-status discipline
**What:** Evaluation happens after the interaction ends, in the background, and the report row is guaranteed to terminate in exactly one of two states — never left hanging.
**Two divergent existing implementations — pick the modern one:**
- Legacy (`app/api/interaction/finish/route.ts:10-76`): `waitUntil(evaluateInteraction(log))`, writes `log.evalScore`/`log.evalResult` as unstructured text back onto the S3 `InteractionLog`. No `PENDING`/`READY`/`FAILED` status machine — a failure just overwrites `evalResult` with an error string.
- Modern (`lib/interview/evaluation-runner.ts`, `runAndPersistEvaluation(userId, reportId)`): loads the Postgres row scoped to `{ id: reportId, userId }` (ownership check built into the query itself), reads the S3 transcript by key, calls `runInterviewEvaluation` (`lib/interview/evaluation.ts`), and persists into one of `READY` or `FAILED` — "never leave the row PENDING" is stated as an explicit invariant in the file's own docstring (`lib/interview/evaluation-runner.ts:1-12`).
**Recommendation:** Build `lib/scenario/evaluation-runner.ts` as a near-copy of the modern pattern. `InterviewReportStatus` enum (`IN_PROGRESS | PENDING | READY | FAILED`, `prisma/schema.prisma` near line 284) should have a scenario equivalent, or the same enum could be reused if a shared status type is introduced — planner's call.

### Pattern 5: Evaluator prompt as two structurally-separate prompts
**What:** `lib/interview/prompts.ts` deliberately splits into `buildInterviewSystemPrompt` (live, turn-by-turn, session-constant for prompt-cache prefix reuse) and `INTERVIEW_EVALUATOR_PROMPT` (one-shot, post-hoc, structured JSON output). The session-constant discipline (`lib/interview/prompts.ts:1-20`) requires the live prompt take ONLY inputs that don't change across turns of one session — no turn counter, no timestamp — those go in a separately-appended `buildProgressBlock`.
**Evaluator output contract (HIGH confidence, verbatim from `lib/interview/prompts.ts:262-268`):**
```
{
  "visual_score": null | 1-5,
  "vocal_score": null | 1-5,
  "content_score": 1-5,
  "behavioral_score": 1-5,
  "report_markdown": "..."
}
```
The "CRITICAL RULE ON MISSING DATA" section of this prompt (`lib/interview/prompts.ts:214-220`) is what makes visual/vocal legitimately come back `null` — the standard scenario evaluation prompt should carry the identical instruction, not just a hardcoded `null` in application code, so the model doesn't try to back-fill those categories from transcript text.
**For REQ-32:** compose a new evaluator prompt that (a) keeps this same missing-data discipline for visual/vocal, (b) scores conversational adequacy similarly to "Content & Structure"/"Behavioral & Mindset" here, and (c) appends the author's own criteria (today's `CaseStudy.evaluationPrompt` field, already present at `types/index.ts:206`) as an ADDITIVE section — CONTEXT.md is explicit the author's criteria sit "on top of," not instead of, the standard base.

### Pattern 6: Structured DTO with explicit field mapping (never spread Prisma row to client)
**What:** `lib/interview/report-dto.ts:47-86` (`toInterviewReportDTO`) maps a Prisma row to a client-safe shape field-by-field, with an explicit comment warning that an object spread would leak private columns (S3 transcript key, resume text, `userId`) the moment a new column is added.
**For scenario reports:** write an equivalent `toScenarioReportDTO` from day one; do not spread `ScenarioReport` rows into API responses.

### Pattern 7: "Not yet measured" render idiom
**What:** `components/interview/ReportScoreCards.tsx:69-84` (`UnmeasuredCard`) unconditionally renders "Not yet measured" / "Requires video and audio analysis" for visual/vocal regardless of any value that might arrive from the API — the comment explicitly states this is intentional even if a stray non-null value ever appeared. `app/reports/page.tsx:64` and `components/interactions/InteractionTile.tsx:36` reference the same idiom.
**For scenario reports:** reuse this exact component (it's already generic — takes a `scores` prop of `{visual, vocal, content, behavioral}`), or a near-identical copy if scenario categories differ (e.g., "Conversational Adequacy" instead of "Content & Structure").

### Recommended new/changed surface
```
app/api/scenario/                    # NEW — student-facing, session-first-class routes
  add/route.ts                       # owner=currentUser.id, no admin gate
  edit/route.ts                      # ownership check before mutate
  delete/route.ts                    # ownership check + "must be unpublished first" guard
  publish/route.ts (or fold into edit)
  list/route.ts                      # ?scope=mine | ?scope=published
  session/start/route.ts             # snapshots CaseStudy -> ScenarioReport row (mirrors app/api/interview/session/start)
  session/finish/route.ts            # triggers lib/scenario/evaluation-runner
  report/[reportId]/route.ts         # owner-scoped GET, DTO mapping

lib/scenario/
  prompts.ts                         # standard EQ/conversational base + criteria composition (mirrors lib/interview/prompts.ts)
  evaluation.ts                      # pure evaluator call (mirrors lib/interview/evaluation.ts)
  evaluation-runner.ts               # Prisma+S3 orchestration (mirrors lib/interview/evaluation-runner.ts)
  report-dto.ts                      # mirrors lib/interview/report-dto.ts

app/scenarios/ (or app/case-play/build/)   # NEW — guided builder pages
  page.tsx                           # step 1: situation
  characters/page.tsx (or single-page step machine, see app/interview/[type]/page.tsx SetupStep pattern)
  criteria/page.tsx

prisma/schema.prisma
  model ScenarioReport { ... }       # mirrors InterviewReport
  # types/index.ts: add ownerId?: string to CaseStudy (S3 JSON, not a Prisma column)
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| JWT/session identity in a route handler | A new auth helper | `getCurrentUser(token)` from `lib/auth.ts:80` + `siteConfig.auth.cookie.name` for the cookie key | Already the exact pattern used by every modern (Phase 8) route; changing auth mechanisms is out of scope |
| Multi-step wizard state | A new form library/step framework | The `SetupStep` union + conditional-render-per-step pattern already in `app/interview/[type]/page.tsx` (`type SetupStep = "interviewer" | "resume" | "session"`, `ProgressItem` component) | Same visual language (progress bar, "Step X of Y") the interview flow already trained students on |
| Evaluation background job / retry semantics | A new job queue or cron | `waitUntil` from `@vercel/functions`, exactly as `lib/interview/evaluation-runner.ts` and `app/api/interaction/finish/route.ts` both already do | Already proven in this deployment target (Vercel functions); a queue would be new infra |
| Owner-scoped report DTO shaping | Ad hoc `res.json(row)` | Explicit field-by-field DTO mapper, per `lib/interview/report-dto.ts` | Prevents accidentally leaking `userId`/internal keys as the schema evolves |
| Migration authoring | Running `prisma migrate dev` against the shared dev DB | `npx prisma migrate dev --create-only` locally to generate the SQL file, commit it, then `npm run setup` (which runs `migrate deploy`) applies it | README.md:91-96 explicitly warns `migrate dev`/`migrate reset` can offer to wipe the **shared** dev database; `migrate deploy` only applies pending migrations |

**Key insight:** Nearly every mechanical piece this phase needs (identity, snapshot timing, background eval, terminal status, DTO hygiene, "Not yet measured" rendering) already exists verbatim in the Phase 8 interview pipeline. The novel work is almost entirely (a) the guided builder UI, (b) retrofitting ownership onto the S3-backed `CaseStudy`, and (c) bridging the two into `/case-play`.

## Common Pitfalls

### Pitfall 1: Routing scenario runs through the legacy `InteractionLog`/`/api/interaction/*` pipeline
**What goes wrong:** `/api/interaction/start` hard-requires `cohortId` (`app/api/interaction/start/route.ts:11`, `if (!studentEmail || !caseId || !cohortId || !mode)`), and `app/case-play/[caseId]/page.tsx` reads `cohortId` from URL search params (`searchParams.get("cohortId")`) and uses it to look up cohort info before allowing session start. A student-authored scenario has no cohort.
**Why it happens:** `/case-play/[caseId]` is the "existing player" CONTEXT.md says to reuse, but its plumbing is entirely built around the cohort-scoped assessed/explore model, not a cohort-free student-owned model.
**How to avoid:** Either make `cohortId` optional in the start flow specifically for owner-run scenarios (bypassing the cohort lookup `useEffect` at `app/case-play/[caseId]/page.tsx:224-248` when absent), or build a scenario-specific start path that reuses the player's chat/avatar UI internals but calls new `/api/scenario/session/*` routes instead of `/api/interaction/*`. Do NOT let the cohort requirement leak into the student scenario flow.
**Warning signs:** Any plan that says "reuse `handleStart` as-is" or "pass a placeholder cohortId" — both indicate an unaddressed pitfall.

### Pitfall 2: Confusing the `evaluationPrompt` freeform-text pipeline with the "structured" requirement in REQ-32
**What goes wrong:** `app/api/interaction/finish/route.ts:10-76` (`evaluateInteraction`) already "evaluates" cases today via `caseData.evaluationPrompt`, but it returns a `SCORE: [number]` regex-parsed integer and a blob of free text (`log.evalResult`) — there is no visual/vocal/content/behavioral category structure, no "Not yet measured" idiom, and no Postgres row at all (it's stored back into the S3 `InteractionLog`).
**Why it happens:** It's tempting to treat this as "the case evaluation pipeline already exists, just reuse it" — it technically produces *a* score, so REQ-32 could look satisfied on a shallow read.
**How to avoid:** Treat this as fully legacy for the purposes of Phase 9. Build the new structured evaluator (Pattern 5) instead. Leave `app/api/interaction/finish/route.ts` untouched — it still serves admin cases.
**Warning signs:** A plan that says "add the standard prompt as a prefix to `evaluationPrompt` and let `/api/interaction/finish` handle it" — this cannot produce the JSON-structured, Postgres-row, Visual/Vocal-null-with-idiom output REQ-32/33 need.

### Pitfall 3: Mistaking the unused Prisma `Case`/`CaseAssignment`/`Attempt` models for live infrastructure
**What goes wrong:** `prisma/schema.prisma` already has a `model Case` with `createdById`/`createdBy User?` (real FK ownership!), `CaseAssignment`, and `Attempt` models (`prisma/schema.prisma:156-183` and surrounding). These look like exactly the ownership infrastructure this phase needs. They are NOT wired to `/case-management` or `/case-play` at all — the only writers are `prisma/seed.ts` and `scripts/sync-s3-to-db.ts` (a one-way batch script described in its own header as syncing "Cases from S3 → Case table" for `lib/student-history-service.ts`/teacher-dashboard reporting), and `Attempt` rows are written from `InteractionLog` data, not live during a case-play session.
**Why it happens:** The presence of `createdById: String? / createdBy User? @relation("CaseCreator", ...)` reads as if ownership was already half-built for cases.
**How to avoid:** Do not build REQ-29 ownership on top of this `Case` model without deliberately deciding to make it live (i.e., writing to it synchronously from `/api/case/add|edit|delete`, replacing S3 as source of truth, and updating `/api/case/list|get` to read from it) — that is a much larger, unscoped change to the case system's storage architecture. The lower-risk path CONTEXT.md's "same S3 storage" decision implies is to add `ownerId` directly onto the S3-stored `CaseStudy` JSON and enforce it in the route handlers, leaving the shadow Postgres `Case` table exactly as unused-by-live-paths as it is today (or explicitly deciding to modernize it as a stretch goal — but that should be a conscious call, not an accident).
**Warning signs:** A plan step that says "add `ownerId` to the `Case` Prisma model" without also auditing every one of `app/api/case/*`, `app/case-management/*`, `app/case-play/*` to confirm none of them silently still read from S3 in parallel — currently ALL of them read/write S3 exclusively, and only `sync-s3-to-db.ts` (a script, not a request path) touches `prisma.case`.

### Pitfall 4: Building the avatar/character picker against the wrong catalog
**What goes wrong:** `app/interview/[type]/page.tsx`'s card grid (REQ-27's UI reference) is populated by `/api/interview/interviewers`, which calls the live HeyGen LiveAvatar API directly (`app/api/interview/interviewers/route.ts:56-125`) — each card's `previewUrl` is `avatar.preview_url` straight from HeyGen, cached 10 minutes in-process. This is a *different* catalog from what `CaseAvatar.profileId` (`types/index.ts:199`) references, which is this app's own `VideoAudioProfile` records (`types/index.ts:60-84`, field `portrait`, not `previewUrl`), served by `/api/profile/list` (`app/api/profile/list/route.ts`, currently ADMIN-only per `middleware.ts`) and consumed today by the admin `<Select>` at `app/case-management/[caseId]/page.tsx:632-644`.
**Why it happens:** REQ-27's instruction to "mirror the interviewer selection UI" is about the CARD GRID LAYOUT (image-backed cards, hover/select affordance, `Check` badge) — it is easy to over-read this as "call the same API," which would let students pick from HeyGen's raw interviewer roster instead of the admin-curated `VideoAudioProfile` catalog that `CaseAvatar.profileId` is actually supposed to reference.
**How to avoid:** Reuse the CARD GRID JSX/layout pattern (`app/interview/[type]/page.tsx:284-306`) but source its data from `/api/profile/list` (needs adding to `STUDENT_ROUTES` in `middleware.ts`, or a new student-safe wrapper route), rendering `profile.portrait` where the interview grid renders `interviewer.previewUrl`. See Open Question 1 below — this needs an explicit decision, not an assumption.
**Warning signs:** A plan task that says "call `/api/interview/interviewers` from the scenario builder" — wrong catalog, and also would tie scenario avatars to a service (HeyGen roster) unrelated to what `CaseAvatar.profileId` is defined to mean.

### Pitfall 5: Forgetting `/api/profile/list` and `/api/profile/get` are currently admin/mixed-gated
**What goes wrong:** `middleware.ts` lists `/api/profile/get` in `STUDENT_ROUTES` (with a comment explaining it's needed for case-play's avatar mode) but `/api/profile/list` only in `ADMIN_ROUTES`. If the new avatar picker needs to list all available profiles (not fetch one by known id), the route as it stands will 403 a student.
**How to avoid:** Explicitly add `/api/profile/list` (or a new purpose-built endpoint) to `STUDENT_ROUTES` in `middleware.ts`, and audit whether `/api/profile/list/route.ts` returns any admin-only fields (a quick read shows it returns full `VideoAudioProfile[]` unfiltered — decide if that's acceptable to expose to students, e.g. does it contain a `knowledgeId` field that should stay hidden).
**Warning signs:** A plan that adds the picker UI but doesn't touch `middleware.ts`.

## Code Examples

### Ownership-scoped Prisma query (owner check baked into WHERE clause)
```typescript
// Source: lib/interview/evaluation-runner.ts:43-45 (HIGH confidence, existing code)
const report = await prisma.interviewReport.findFirst({
  where: { id: reportId, userId },
});
```
Use this exact shape for `ScenarioReport` lookups — a mismatched owner produces `null`/not-found rather than a data leak, without a separate `if (report.userId !== userId)` branch to forget.

### `published` flag filter (Phase 7 pattern to reuse verbatim for the public scenario section)
```typescript
// Source: app/api/case/list/route.ts:6-12 (HIGH confidence, existing code)
const publishedOnly =
  new URL(request.url).searchParams.get("publishedOnly") === "true";
const cases = await s3Storage.listCases();
const visible = publishedOnly
  ? cases.filter((c) => c.published === true)
  : cases;
```
For REQ-31's two sections, `/case-play` needs two fetches: one `?ownerId=me` (or equivalent — new query param/route), one `?publishedOnly=true` filtered to exclude the student's own scenarios if avoiding duplicate display (design choice, "Claude's Discretion").

### `CaseStudy`/`CaseAvatar` shape (what the builder must produce)
```typescript
// Source: types/index.ts:194-220 (HIGH confidence, existing code)
export interface CaseAvatar {
  id: string;
  name: string;
  role: string;
  additionalInfo: string;
  profileId?: string;
}
export interface CaseStudy {
  id: string;
  name: string;
  backgroundInfo: string;
  evaluationPrompt?: string;
  coverImage?: string;
  avatars: CaseAvatar[];
  cohortIds: string[];   // obsolete scoping model — CONTEXT.md says don't design around this
  published?: boolean;
  createdBy: string;     // display-only string today — NOT ownership
  lastEditedBy: string;
  createdAt: string;
  lastEditedAt: string;
}
```
The builder's "criteria" step maps onto `evaluationPrompt` (author's own criteria) — REQ-32 requires this to compose ADDITIVELY with a new standard prompt, not stand alone. A new field (e.g. `ownerId?: string`) needs adding here for REQ-29.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-------------------|---------------|--------|
| S3 `InteractionLog` + cohort-required `explore`/`assessed` modes + freeform-text evaluation | Postgres `InterviewReport` + owner-scoped, structured JSON evaluator, `READY`/`FAILED` status machine | Phase 6-8 (interview track) | Phase 9's case-study track has NOT been migrated to this — it still runs on the old pipeline. Phase 9 must decide to build scenario evaluation on the modern pattern without migrating the *admin* case pipeline (out of scope). |
| `CaseStudy.createdBy` (display string) / `cohortIds` (scoping) | N/A — no real ownership model exists yet for cases | This phase | REQ-29 is exactly closing this gap |

**Deprecated/outdated (for this phase's purposes, not literally removed from the repo):**
- `cohortIds` as an access-control concept for anything student-authored — CONTEXT.md and REQUIREMENTS.md both explicitly call this "the obsolete scoping model."
- Treating `middleware.ts` role gating as sufficient authorization for a specific resource — it never has been (admin gate = "any admin can touch any case," never resource-level).

## Open Questions

1. **Which avatar-profile catalog and route should the REQ-27 picker actually list from?**
   - What we know: `CaseAvatar.profileId` (`types/index.ts:199`) is meant to reference `VideoAudioProfile` records (`types/index.ts:60-84`), served today by `/api/profile/list` (admin-gated) and `/api/profile/get` (student-gated, single-record). The interview page's own grid pulls from a wholly separate live HeyGen catalog via `/api/interview/interviewers`.
   - What's unclear: Whether `/api/profile/list` is safe to expose to students as-is (does it leak `knowledgeId` or other fields that should stay admin-only?), and whether the visual grid should show ALL admin-created profiles or some curated subset.
   - Recommendation: Planner should add `/api/profile/list` to `STUDENT_ROUTES` in `middleware.ts`, verify/trim the fields it returns, and build the grid using `profile.portrait` as the image source (falling back to a placeholder tile when absent, since `portrait` is optional per the type).

2. **Should scenario-specific API routes live under `/api/case/*` (extended) or a new `/api/scenario/*` namespace?**
   - What we know: `/api/case/add|edit|delete` today have zero owner concept and are pure admin CRUD for the S3 `CaseStudy` object; CONTEXT.md's data model wants student scenarios to BE `CaseStudy` records ("They are cases with a real owner"), which argues for extending the same endpoints rather than forking them.
   - What's unclear: Whether extending `/api/case/add` to accept a student caller (with `ownerId = currentUser.id` forced server-side, ignoring any client-supplied value) is cleaner than a parallel `/api/scenario/add` that internally calls the same `s3Storage.saveCase`. Extending risks admin-route assumptions elsewhere (e.g. does anything assume every `CaseStudy` came from an admin?); forking risks logic duplication.
   - Recommendation: Lean toward extending `/api/case/*` with role-branching internal logic (admin can set `ownerId` to null/itself and any cohort scoping; student calls force `ownerId = self`, `cohortIds = []`), since the storage layer (`s3Storage.saveCase`) is already fully shared and CONTEXT.md's model explicitly says these are the same kind of record. This needs the planner's explicit sign-off, not just this document's inference.

3. **What exactly happens today when a student hits `/api/case/list` or `/api/case/get`?**
   - What we know: Neither appears in `STUDENT_ROUTES` nor `ADMIN_ROUTES` in the excerpts read. The `/case-play/page.tsx` index page calls `/api/case/list?publishedOnly=true` today without apparent 403s in production, implying there's a fallback tier in `middleware.ts` (an "any authenticated user" branch) not fully captured in this research's excerpts.
   - What's unclear: The exact full middleware fallback logic past `isAdminRoute` (the file continues past what was read — only the first ~260 lines were inspected in depth).
   - Recommendation: Planner/executor should read the remainder of `middleware.ts` (after the `isAdminRoute` block, likely lines 260+) before finalizing which routes need explicit additions to `STUDENT_ROUTES` vs. already falling through correctly.

4. **Where does `Attempt`/`CaseAssignment` (the shadow Postgres tables) factor into "reports"?**
   - What we know: `lib/student-history-service.ts` reads `prisma.attempt`/`prisma.case`/`prisma.caseAssignment` for what looks like a teacher/history dashboard, populated by the batch `scripts/sync-s3-to-db.ts`, not live.
   - What's unclear: Whether any existing student-facing page (e.g. `/reports`, `/student-history`) expects `Attempt` rows to exist for every case interaction going forward, which would mean a new `ScenarioReport` model needs to also produce a compatible `Attempt` row (or that reporting surface will silently miss all scenario runs).
   - Recommendation: Planner should grep `/reports/page.tsx` and `/student-history` more closely, and decide explicitly whether scenario reports need to also appear in this legacy reporting path or are fully isolated. CONTEXT.md's framing ("staff effectively obsolete", "no cap", "new self-directed model") suggests isolation is fine, but this wasn't explicitly stated as a decision.

## Sources

### Primary (HIGH confidence — direct codebase reads, this session)
- `types/index.ts:194-220` — `CaseStudy`/`CaseAvatar` interfaces
- `types/index.ts:60-84` — `VideoAudioProfile` interface
- `app/api/case/add/route.ts`, `edit/route.ts`, `delete/route.ts`, `list/route.ts`, `get/route.ts` — full file reads, no auth code present
- `middleware.ts` (lines 1-~400 read) — `PUBLIC_ROUTES`, `ADMIN_ROUTES`, `KIOSK_ROUTES`, `STUDENT_ROUTES` arrays and the request-handling flow (student branch checked before admin branch)
- `lib/auth.ts` — full file read: `getCurrentUser`, `verifyToken`, `createToken`, JWT payload shape
- `app/api/interview/session/start/route.ts` — full file read: ownership-check + snapshot-on-start pattern
- `app/api/interaction/start/route.ts`, `finish/route.ts` — full file reads: legacy cohort-required, freeform-evaluation pipeline
- `lib/interview/prompts.ts` — full file read: session-constant discipline, evaluator prompt structure and missing-data rule
- `lib/interview/evaluation-runner.ts` (partial, ~60 lines) — background-eval, terminal-status pattern
- `lib/interview/report-dto.ts` — full file read: explicit DTO mapping discipline
- `components/interview/ReportScoreCards.tsx` (~100 lines) — "Not yet measured" idiom
- `app/interview/[type]/page.tsx` (excerpts, ~330 lines read) — card grid JSX, `SetupStep` wizard pattern, `/api/interview/interviewers` fetch
- `app/api/interview/interviewers/route.ts` — full file read: live HeyGen catalog source for the card grid, distinct from `VideoAudioProfile`
- `app/case-management/[caseId]/page.tsx` (excerpts) — admin `<Select>` avatar-profile picker, `profiles` state sourced from `/api/profile/list`
- `app/api/profile/list/route.ts` — full file read
- `app/case-play/page.tsx` — full file read (105 lines): current single-list `/case-play` index
- `app/case-play/[caseId]/page.tsx` (grep + targeted reads) — cohortId requirement, `handleStart`, mode state machine
- `prisma/schema.prisma` — `InterviewReport` model (full), `User` model (full), `Case`/`CaseAssignment`/`Attempt` models (partial)
- `scripts/sync-s3-to-db.ts` (partial) — confirms `Case`/`Attempt` Postgres tables are a batch-sync shadow, not live
- `lib/student-history-service.ts` (grep) — confirms `prisma.case`/`prisma.attempt` usage is for a reporting/history surface, not case-play itself
- `lib/s3-client.ts` (`saveCase`/`getCase`/`listCases`/`deleteCase`/`caseExists`, lines ~900-1010) — flat S3 key layout (`cases/{id}.json` + a single global `cases/index.json`), confirming no owner-partitioning exists at the storage layer today
- `README.md` (lines 1-100) — migration workflow: `prisma migrate dev --create-only` locally, commit, `npm run setup` runs `migrate deploy`; explicit warning never to run `migrate dev`/`migrate reset` against the shared dev DB
- `.planning/REQUIREMENTS.md` (Phase 9 section, REQ-25..34) — full text already exists, contradicting CONTEXT.md's note that IDs needed generating; they were already generated
- `.planning/phases/09-student-authored-scenarios/09-CONTEXT.md` — full file read

### Secondary / Tertiary
None used — this research was entirely internal codebase investigation per the phase's brownfield nature; no web research was performed or needed.

## Metadata

**Confidence breakdown:**
- Standard stack / existing patterns: HIGH — every pattern cited is a direct file:line read from the current branch, not inferred or remembered from training
- Architecture (bridging legacy vs. modern pipelines): HIGH on what exists, MEDIUM on the exact bridging shape (Open Questions 1-2 need a planner/user decision, not more research)
- Pitfalls: HIGH — each is grounded in a specific code excerpt that would break if naively reused

**Research date:** 2026-09-21
**Valid until:** Should remain valid through this phase's planning and execution (no fast-moving external dependency); re-verify `middleware.ts` route lists and `prisma/schema.prisma` if other phases land first, since both are shared/contested files.
