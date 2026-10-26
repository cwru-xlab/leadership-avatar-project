---
phase: quick/003-job-description-upload
plan: 003
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/interview/document-intake.ts
  - app/api/interview/upload-job-description/route.ts
  - lib/s3-client.ts
  - scripts/verify-job-description-intake.ts
  - package.json
  - lib/interview/prompts.ts
  - lib/engine/prompts.ts
  - lib/engine/registry.ts
  - app/api/interaction/chat/route.ts
  - lib/report/snapshot.ts
  - lib/engine/session.ts
  - app/api/practice/session/start/route.ts
  - components/practice/steps/JobDescriptionStep.tsx
  - app/practice/[type]/page.tsx
autonomous: false
requirements: [JD-01, JD-02, JD-03, JD-04]

must_haves:
  truths:
    - "A student practising an interview can attach the posting they are targeting — either by pasting its text or by uploading a PDF of it — from the interview setup wizard."
    - "An uploaded job-description PDF is accepted only when its bytes actually begin %PDF- and it is under 10MB; the browser's declared MIME type is never trusted."
    - "No S3 URL for the job description ever reaches the browser — only extracted text and an opaque id."
    - "Once a posting is attached, the wizard shows a confirmation panel that states, in plain words, exactly what the posting will and will not influence in this session."
    - "The live interviewer's role/industry-specific questions draw on the attached posting; with no posting the interview behaves byte-identically to today."
    - "A report row written before this change still narrows to an interview snapshot and still evaluates — the new snapshot fields are optional, not required."
    - "The closed three-value feedback-source vocabulary (resume / conversation / both) is unchanged: no new value, no edit to lib/report/source-attribution.ts, its verifier, or the frozen schema snapshots."
  artifacts:
    - path: "lib/interview/document-intake.ts"
      provides: "The single shared PDF intake contract — size ceiling, magic-byte check, text extraction, cleaning — with no route or S3 knowledge"
      exports: ["MAX_INTERVIEW_DOCUMENT_BYTES", "PDF_MIME_TYPE", "intakePdfDocument"]
    - path: "app/api/interview/upload-job-description/route.ts"
      provides: "Authenticated POST mirroring the Phase 3 resume contract: magic-byte-checked PDF, private S3 object under a server-derived key, {jobDescriptionId, jobDescriptionText} out"
      exports: ["POST"]
    - path: "components/practice/steps/JobDescriptionStep.tsx"
      provides: "Optional wizard step: paste OR upload a posting, plus the honest confirmation panel"
    - path: "scripts/verify-job-description-intake.ts"
      provides: "Executable battery over the intake contract, the prompt shaping, the snapshot back-compatibility, and the untouched source vocabulary"
  key_links:
    - from: "app/api/interview/upload-job-description/route.ts"
      to: "lib/interview/document-intake.ts"
      via: "intakePdfDocument called before any S3 write"
      pattern: "intakePdfDocument\\("
    - from: "app/practice/[type]/page.tsx"
      to: "app/api/interaction/chat/route.ts"
      via: "extraChatBody top-level jobDescriptionText, resent byte-identically every turn"
      pattern: "jobDescriptionText"
    - from: "app/api/interaction/chat/route.ts"
      to: "lib/interview/prompts.ts"
      via: "buildTurnMessages -> assembleSystemPrompt -> buildInterviewSystemPrompt jobDescriptionText"
      pattern: "jobDescriptionText"
    - from: "lib/engine/session.ts"
      to: "lib/report/snapshot.ts"
      via: "InterviewInputSnapshot gains OPTIONAL jobDescriptionId/jobDescriptionText"
      pattern: "jobDescriptionId"
---

<objective>
Let a student attach the job posting they are practising for, and let that posting
shape the live interview — reusing the Phase 3 resume intake contract rather than
inventing a second file pipeline, and telling the student honestly what the posting
does and does not affect.

Purpose: GitHub issue #56 (Jen feedback, Oct. 9). Practising for "a technology role"
is weaker than practising for *the* posting on the student's desk.
Output: one shared PDF intake module, one new upload route, an optional wizard step
with a confirmation panel, and the posting threaded into the live interviewer prompt.
</objective>

<decisions_already_made>
Read these before writing any code. They are settled; do not relitigate them.

**1. Feedback-source vocabulary: OPTION (a) — the posting is interviewer context
only and is NEVER a cited feedback source.**
`FEEDBACK_SOURCES` in `lib/report/structured.ts` stays exactly
`["resume", "conversation", "both"]`. `lib/report/source-attribution.ts`,
`scripts/verify-feedback-source-attribution.ts`, `INTERVIEW_EVALUATOR_PROMPT`'s
`RULE ON SOURCE ATTRIBUTION` block, and both frozen schema snapshots in
`scripts/verify-report-structure.ts` are **not edited by this plan.**

Why (a), not (b):
- A job posting is not evidence *about the candidate*. It describes the target
  role. A finding like "your answer did not address the leadership scope the
  posting asks for" still rests on what the candidate said — `conversation` is
  the correct, already-available attribution. Option (b) would add a fourth value
  that means "the role we compared you against", which is not a source of
  observation at all.
- (b) costs five coordinated edits across two frozen snapshots plus a negative
  test, during a milestone mid-sign-off, for a label that would be semantically
  wrong.
- The vocabulary is already fail-safe against a disobedient model:
  `feedbackSource()` in `lib/report/structured.ts` coerces any value outside the
  three to `null`, so even if a future evaluator invented `"job_description"` it
  degrades to "no label", never a crash and never a new badge.

**2. The evaluator does not see the posting in this plan — deliberately.**
No new `job_description_text:` block is added to `lib/engine/evaluation.ts`'s user
message, and `buildEvaluationContextForReport` is not touched. Scoring behaviour is
therefore bit-for-bit unchanged. This keeps decision (1) trivially true and keeps
this plan inside three tasks. **The confirmation panel in Task 3 must say so in
plain words** — it may not imply the posting affects the report. A follow-up may add
the evaluator block; it will be a single additive block plus a prompt line, with
decision (1) already recorded.

**3. The resume route is NOT refactored.**
`app/api/interview/upload-resume/route.ts` carries a locked Phase 3 contract and is
left untouched. The new shared module `lib/interview/document-intake.ts` is used by
the new route only, and Task 1's verifier pins the resume route's constants against
the module's so the two contracts cannot silently drift. Migrating the resume route
onto the module is explicitly deferred until after v1.1 sign-off.

**4. The session shell is not edited.** `components/practice/PracticeSessionShell.tsx`
is on the do-not-touch list. It does not need editing: it already spreads
`extraChatBody` into the **top level** of the `/api/interaction/chat` body
(`...(extraChatBodyRef.current ?? {})`, around line 764). The page passes
`extraChatBody={{ jobDescriptionText }}` and the chat route reads a top-level
`jobDescriptionText`. No shell change, no new shell prop.
</decisions_already_made>

<scope_note>
The full issue — intake + live shaping + confirmation + evaluator use + report
surfacing — does not fit three atomic tasks. Rather than compress it, this plan
ships intake, live shaping, and the confirmation, and states plainly (decision 2)
that evaluator use and report surfacing are out of scope. Task 3 is the largest
task in the plan at six files; every one of its edits is a small, mechanical mirror
of an existing `resumeText` / `resumeId` line in the same function.
</scope_note>

<guards_to_run>
These snapshots are frozen and must be proven not to move. Run BEFORE any edit to
capture the baseline, and again after:

```
npx tsx scripts/verify-engine-surface-count.ts
npx tsx scripts/verify-report-structure.ts
npx tsx scripts/verify-feedback-source-attribution.ts
npx tsx scripts/verify-networking-type.ts
npx tsc --noEmit
```

Expected: identical results before and after (`verify-pitch-types.ts` has 1 known
pre-existing Phase-18-owned failure — do not try to fix it here).
No assertion in any existing verifier may be weakened, relaxed, deleted, or
re-scoped by this plan. If an edit trips a frozen snapshot, STOP and report it
rather than editing the snapshot.
</guards_to_run>

<execution_context>
@/Users/ajabreu79/.claude/get-shit-done/workflows/execute-plan.md
@/Users/ajabreu79/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@app/api/interview/upload-resume/route.ts
@lib/interview/prompts.ts
@lib/report/snapshot.ts
@components/practice/steps/ResumeStep.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Shared PDF intake module + job-description upload route</name>
  <files>
    lib/interview/document-intake.ts (new)
    app/api/interview/upload-job-description/route.ts (new)
    lib/s3-client.ts
    scripts/verify-job-description-intake.ts (new)
    package.json
  </files>
  <action>
Create `lib/interview/document-intake.ts` — the one place the interview PDF
contract lives. Pure apart from the existing `documentProcessor` call; no Next,
no S3, no Prisma, no auth:

- `export const PDF_MIME_TYPE = "application/pdf"`
- `export const MAX_INTERVIEW_DOCUMENT_BYTES = 10 * 1024 * 1024`
- `export const PDF_MAGIC_BYTES = "%PDF-"`
- `export async function intakePdfDocument(file, opts: { label: string }):
  Promise<{ ok: true; buffer: Buffer; text: string } | { ok: false; status:
  number; error: string }>` performing, in this exact order, the same checks the
  resume route performs today: missing/string file -> 400; declared type !==
  `PDF_MIME_TYPE` -> 400; `size === 0` -> 400; `size > MAX_INTERVIEW_DOCUMENT_BYTES`
  -> 400; then read the bytes and reject unless
  `buffer.subarray(0, 5).toString("ascii") === PDF_MAGIC_BYTES` -> 400; then
  `documentProcessor.cleanText(await documentProcessor.extractText(buffer,
  PDF_MIME_TYPE))` with a parse throw -> 422 and empty text -> 422.
  `opts.label` is interpolated into the human error strings ("job posting") so
  the module carries no per-caller copy. The magic-byte check MUST stay after
  the cheap checks and BEFORE extraction or any persistence — the comment in the
  resume route explains why (browser MIME types are forgeable).

Add `saveInterviewJobDescription(userId, jobDescriptionId, file)` to
`lib/s3-client.ts`, copied from `saveInterviewResume` (around line 1678): same
`sanitizePathSegment` calls on BOTH segments, a new
`INTERVIEW_JOB_DESCRIPTIONS_PREFIX` beside the existing resume prefix, the same
`ContentType: "application/pdf"` and `ContentDisposition: "attachment"`, and it
returns the key. Do not touch `saveInterviewResume`.

Create `app/api/interview/upload-job-description/route.ts` mirroring the resume
route structurally (`runtime = "nodejs"`, `maxDuration = 60`, the local
`response()` helper with `Cache-Control: no-store`, cookie -> `getCurrentUser`
-> 401 when absent): it calls `intakePdfDocument(formData.get("file"),
{ label: "job posting" })`, returns `{ error }` with the module's status on the
failure branch, then `randomUUID()` -> `saveInterviewJobDescription` (502 on
throw) -> `console.info` (userId, jobDescriptionId, key, sizeBytes) ->
`response({ success: true, jobDescriptionId, jobDescriptionText }, 201)`.
**The S3 key must never appear in the response body** — it is logged only, and
later callers re-derive it from the authenticated user plus the id.

Create `scripts/verify-job-description-intake.ts` in the house style of
`scripts/verify-feedback-source-attribution.ts` (numbered sections, `check(...)`
lines, non-zero exit on failure). Sections:
1. The module's contract: a forged-MIME non-PDF buffer whose declared type IS
   `application/pdf` is rejected (this is the load-bearing case); a 10MB+1 file
   is rejected; an empty file is rejected; a zero-text PDF yields 422.
2. The route source contains no `s3Key`/`s3Url`/`Location` in any `response(`
   call and does contain `intakePdfDocument(`.
3. Drift pin: read `app/api/interview/upload-resume/route.ts` as text and assert
   it still contains `10 * 1024 * 1024` and `"%PDF-"`, with a comment naming
   decision 3 — if someone changes the resume ceiling without changing the
   module, this section fails.
Add `"verify:job-description": "tsx scripts/verify-job-description-intake.ts"` to
package.json beside `verify:feedback-source`.
  </action>
  <verify>
`npm run verify:job-description` exits 0 with ALL PASS. Then run the negative
test and record its output in the summary: temporarily invert the magic-byte
check in `document-intake.ts` (accept anything), re-run, confirm section 1 FAILS
with a non-zero exit, then restore and confirm ALL PASS again.
`npx tsc --noEmit` clean.
  </verify>
  <done>
A forged-MIME non-PDF cannot reach S3 or the parser; a real PDF under 10MB
returns `{success, jobDescriptionId, jobDescriptionText}` and nothing else; the
verifier is proven to bite.
  </done>
</task>

<task type="auto">
  <name>Task 2: Thread the posting into the live interviewer prompt</name>
  <files>
    lib/interview/prompts.ts
    lib/engine/prompts.ts
    lib/engine/registry.ts
    app/api/interaction/chat/route.ts
    scripts/verify-job-description-intake.ts
  </files>
  <action>
Mirror the existing session-constant `resumeText` parameter at every hop. Nothing
here may become per-turn — `assertSessionConstantArgs` in `lib/engine/prompts.ts`
(line ~133) rejects Dates and per-turn numbers, and the whole point of resending
an identical string each turn is that the system prompt stays byte-stable for the
OpenAI prefix cache (REQ-23).

`lib/interview/prompts.ts`:
- `InterviewPromptInput` gains `jobDescriptionText?: string`, documented as
  "Extracted or pasted job-posting text. Empty when none was attached."
- In `buildInterviewSystemPrompt`, add a `jobDescriptionSection` beside the
  existing `resumeSection`. When non-empty, append one bullet inside the
  existing `## CONTEXT PROVIDED TO YOU` block:
  `- The actual job posting the candidate is targeting (ground your role-specific
  questions in this, and prefer its wording over the generic role/industry
  labels above when they disagree):` followed by the trimmed text.
  When empty, append **nothing** — the assembled prompt must be byte-identical to
  today's for a session with no posting. Do not add a "(No job description…)"
  sentinel to the live prompt; an absent bullet is the absence.
- In `## STAGE PLAN` step 4, append one sentence: when a posting is present,
  draw the role/industry-specific question from its stated responsibilities or
  requirements. Keep this additive; do not renumber or reword the stages.
- Do NOT edit `INTERVIEW_EVALUATOR_PROMPT` (decision 2).

`lib/engine/prompts.ts`: `AssembleSystemPromptOpts` and `BuildTurnMessagesInput`
each gain `jobDescriptionText?: string`; `assembleSystemPrompt` forwards it to
`buildInterviewSystemPrompt` and into the generic
`type.prompts.liveSystemPrompt(config, { ... })` extra object;
`buildTurnMessages` destructures and forwards it. Same shape as `resumeText`.

`lib/engine/registry.ts`: in `makeInterviewTypeConfig`'s `liveSystemPrompt`, pass
`jobDescriptionText: extra.jobDescriptionText ?? ""` beside `resumeText`. Widen
the `extra` parameter type if it is explicitly typed.

`app/api/interaction/chat/route.ts`: read a **top-level** `jobDescriptionText`
off the request body (decision 4 — this is what the shell's `extraChatBody`
spread produces), cap it with the existing `MAX_RESUME_TEXT_LENGTH` constant or a
sibling `MAX_JOB_DESCRIPTION_TEXT_LENGTH = 60_000`, default to `""` when absent
or not a string, and pass it into `buildTurnMessages`. Add the field to the
destructure at line ~455 and to the body interface. Change nothing else in this
route — not turn control, not the walk-out path, not the stage list.

Extend `scripts/verify-job-description-intake.ts` with section 4:
- `buildInterviewSystemPrompt(type, { resumeText: "", language: "en" })` is
  **string-equal** to the same call with `jobDescriptionText: ""` — proving the
  no-posting prompt did not move.
- With a posting supplied, the output contains the posting's text and the
  grounding bullet.
- `app/api/interaction/chat/route.ts` source contains `jobDescriptionText` and
  `components/practice/PracticeSessionShell.tsx` does NOT (decision 4 — the shell
  stays unedited).
  </action>
  <verify>
`npm run verify:job-description` ALL PASS including section 4. `npx tsc --noEmit`
clean. Re-run every command in `<guards_to_run>` and confirm results identical to
the baseline captured in Task 1.
  </verify>
  <done>
A session with a posting puts it in the interviewer's context block and ties the
role-specific stage to it; a session without one produces a byte-identical system
prompt to today; the shell was not touched.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Wizard step, honest confirmation panel, persistence — then verify live</name>
  <files>
    components/practice/steps/JobDescriptionStep.tsx (new)
    app/practice/[type]/page.tsx
    lib/engine/registry.ts
    lib/report/snapshot.ts
    lib/engine/session.ts
    app/api/practice/session/start/route.ts
  </files>
  <what-built>
The posting's wizard step, its confirmation panel, and server-side persistence of
the posting on the interview's input snapshot.
  </what-built>
  <action>
Build all of the following, then pause for the human verification below.

**Persistence (optional fields only — this is the back-compat trap).**
`lib/report/snapshot.ts`: `InterviewInputSnapshot` gains
`jobDescriptionId?: string | null` and `jobDescriptionText?: string | null` as
**OPTIONAL** members, and they are **deliberately NOT added to
`INTERVIEW_INPUT_KEYS`** (line ~191). That array feeds `hasAllKeys` in
`asInputSnapshot` (line ~342), which requires every listed key to be present;
adding them would make every report row written before today fail to narrow,
silently breaking evaluation and the report page for existing sessions. A comment
must say exactly that, so nobody "tidies" them into the list later.
`lib/engine/session.ts`: accept `jobDescriptionId` / `jobDescriptionText` on the
interview start input, validate the id with the existing `UUID_V4_REGEX` and
truncate the text with the existing `truncate(..., MAX_RESUME_TEXT_LENGTH)`
helper, and write both onto the `inputSnapshot` literal (line ~487).
`app/api/practice/session/start/route.ts`: pass the two fields through from the
body alongside `resumeId` / `resumeText`.

**Wizard step.** `lib/engine/registry.ts`'s interview `setupSteps` gains a third
entry `{ id: "job-description", label: "Job posting", customComponent:
"JobDescriptionStep", optional: true }` after `resume` — this applies to all four
interview presets and to no other type.
`components/practice/steps/JobDescriptionStep.tsx`, modelled on `ResumeStep.tsx`
(same card chrome, same `nav` contract, same Back / "Skip for now" / Continue
footer, `addToast` for errors): a textarea for pasting the posting AND a PDF
dropzone posting to `/api/interview/upload-job-description`. Paste yields text
with a null id; upload yields both. Either path calls one
`onJobDescriptionChange({ jobDescriptionId, jobDescriptionText, jobDescriptionFileName })`.
Client-side pre-checks mirror ResumeStep (PDF only, 10MB) as a courtesy; the
server remains the authority.

**The confirmation panel (issue bullet 2).** Once a posting is attached the step
renders a panel that states, in plain language and without overclaiming:
  - that the posting will be given to the interviewer and used to ground the
    role-specific questions, preferring its wording over the generic
    role/industry pickers;
  - that an uploaded file stays private and is never shown to other students;
  - that the posting is **not** used to score the report and is **not** sent to
    the evaluator in this version (decision 2 — this sentence is required, not
    optional);
  - what happens if they skip: the interview uses the role and industry picked
    earlier.
Keep it a short list. Do not promise matching, gap analysis, keyword scoring, or
tailored feedback.

**Page wiring.** `app/practice/[type]/page.tsx`: three `useState`s beside the
resume ones (line ~170); a `renderStep` branch for `"job-description"` beside the
`"resume"` branch (line ~957); `jobDescriptionId` / `jobDescriptionText` added to
the interview start payload (line ~819); and
`extraChatBody={{ jobDescriptionText }}` on `PracticeSessionShell` for the
interview branch — note `extraChatBody` is currently `undefined` for non-pitch
types, so the existing ternary must be extended, not replaced, and pitch's
`reportId`/`revealedSlideIndex` body must be unchanged. Gate it the same way
resume props are gated (`isPitch || isNetworking` -> omit). Also add
`"job-description"` handling to the `onExit` wizard-step reset if the resume
reset is now wrong.
  </action>
  <verify>
`npx tsc --noEmit` clean; `npm run verify:job-description` ALL PASS including the
new legacy-snapshot section; every command in `<guards_to_run>` matching the
Task 1 baseline. Then the human steps in `<how-to-verify>`.
  </verify>
  <done>
A posting can be attached by paste or PDF, the confirmation panel states exactly
what it does and does not influence, the posting is persisted on the input
snapshot without breaking any pre-existing report row, and a human has confirmed
the live interviewer actually used it.
  </done>
  <how-to-verify>
Before pausing, Claude must have run and reported: `npx tsc --noEmit` clean,
`npm run verify:job-description` ALL PASS (extended with a section asserting that
a legacy interview snapshot object *lacking* both job-description keys still
narrows via `asInputSnapshot`, and that `INTERVIEW_INPUT_KEYS` still has exactly
its original 11 entries), plus every command in `<guards_to_run>` matching the
Task 1 baseline.

Then verify by hand:
1. `npm run dev`, start a General interview, advance to the new "Job posting" step.
2. Paste a real posting's text. Confirm the confirmation panel appears and that
   every sentence in it is true of what shipped — in particular that it does NOT
   claim the posting affects your score.
3. Go back, clear it, and upload a job posting as a PDF. Confirm it parses and
   the same panel appears with the file name.
4. Try uploading a non-PDF renamed to `.pdf`. Confirm it is rejected with a clear
   message and that nothing advances.
5. Launch the interview. Ask the interviewer something generic and let it reach a
   role-specific question. Confirm at least one question clearly reflects the
   posting (its title, a named responsibility, or a stated requirement).
6. Exit, start a second interview, and SKIP the posting step. Confirm the
   interview still runs normally and the interviewer invents no posting details.
7. Open a report generated BEFORE today (any existing one) and confirm it still
   renders — this is the `INTERVIEW_INPUT_KEYS` back-compat check from the user's
   side.
Report the report IDs you opened in step 7 and the actual question text from
step 5, so the evidence is not bare.
  </how-to-verify>
  <resume-signal>Type "approved", or describe what the interviewer ignored / what the panel overclaimed.</resume-signal>
</task>

</tasks>

<verification>
- `npm run verify:job-description` ALL PASS, with the Task 1 negative test run and recorded.
- Every command in `<guards_to_run>` returns results identical to the pre-edit baseline.
- `git diff` touches none of: `lib/report/source-attribution.ts`,
  `scripts/verify-feedback-source-attribution.ts`,
  `scripts/verify-report-structure.ts`, `lib/report/structured.ts`,
  `lib/engine/evaluation.ts`, `lib/engine/termination.ts`,
  `lib/engine/disengagement.ts`, `components/practice/PracticeSessionShell.tsx`,
  `app/api/interview/upload-resume/route.ts`, or any `*-VALIDATION.md`.
- `INTERVIEW_INPUT_KEYS` is unchanged at 11 entries.
</verification>

<success_criteria>
1. A posting can be attached by paste or by PDF from the interview wizard, and a
   forged-MIME non-PDF is rejected before the parser or S3 sees it.
2. No S3 URL or key for a job description is ever returned to the browser.
3. The attached posting reaches the live interviewer prompt and demonstrably
   shapes at least one role-specific question (human-verified, with the question
   text recorded).
4. With no posting attached, the assembled system prompt is string-identical to
   today's and the interview is unchanged.
5. The wizard shows a confirmation panel whose every claim is true of what
   shipped, including the explicit statement that the posting does not affect
   scoring.
6. The three-value feedback-source vocabulary and both frozen schema snapshots
   are untouched, and no existing assertion anywhere was weakened.
7. Reports written before this change still narrow and still render.
</success_criteria>

<output>
After completion, create
`.planning/quick/003-job-description-upload/003-SUMMARY.md`, recording: the
Task 1 negative-test output verbatim, the step-5 question text and step-7 report
IDs from the human verification, and a restatement of decisions 1-3 so the
deferred evaluator work starts from a written record rather than a re-derivation.
</output>
