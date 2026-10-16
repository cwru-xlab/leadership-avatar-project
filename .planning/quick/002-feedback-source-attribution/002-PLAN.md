---
phase: quick/002-feedback-source-attribution
plan: 002
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/report/structured.ts
  - lib/report/source-attribution.ts
  - lib/engine/evaluation.ts
  - lib/interview/prompts.ts
  - components/report/ReportBody.tsx
  - scripts/verify-report-structure.ts
  - scripts/verify-feedback-source-attribution.ts
  - package.json
autonomous: false
requirements: [SRC-01, SRC-02, SRC-03]

must_haves:
  truths:
    - "A strength or growth area the evaluator drew from the resume renders a visible 'From your resume' label on the report."
    - "A strength or growth area drawn from the spoken conversation renders a visible 'From the conversation' label."
    - "An item drawn from both inputs renders a label naming both inputs, distinct from either single-source label."
    - "When the student uploaded no resume, no item can display a resume label — the server rewrites any such claim to conversation before the report is stored."
    - "Non-interview session types (case study, networking, courageous conversation, pitch) render exactly as they do today — no label, no new panel."
    - "A report generated before this change still renders; a missing source is absence of a label, never a crash or an 'unknown' badge."
  artifacts:
    - path: "lib/report/structured.ts"
      provides: "FEEDBACK_SOURCES closed vocabulary, optional source on ReportStrength/ReportGrowthArea, parse coercion, nullable schema property, markdown attribution prefix"
      contains: "FEEDBACK_SOURCES"
    - path: "lib/report/source-attribution.ts"
      provides: "Pure enforceSourceAttribution(report, {hasResume}) that downgrades unsupportable resume claims"
      exports: ["enforceSourceAttribution"]
    - path: "scripts/verify-feedback-source-attribution.ts"
      provides: "Executable battery over parse, enforcement, schema shape, prompt text, and component labels"
  key_links:
    - from: "lib/engine/evaluation.ts"
      to: "lib/report/source-attribution.ts"
      via: "enforceSourceAttribution called inside validateEvaluationResult, beside sanitizeBodySignalWording"
      pattern: "enforceSourceAttribution\\("
    - from: "components/report/ReportBody.tsx"
      to: "StructuredReport.strengths[].source / growth_areas[].source"
      via: "source Chip rendered on the collapsed accordion row"
      pattern: "\\.source"
    - from: "lib/interview/prompts.ts"
      to: "lib/report/structured.ts source field"
      via: "INTERVIEW_EVALUATOR_PROMPT output-format block names the field and its closed vocabulary"
      pattern: "\"source\""
---

<objective>
Make the evidence basis of each interview feedback point visible: label every
strength and growth area as coming from the resume, from the spoken
conversation, or from both. Closes GitHub issue #50 (Jen feedback, Oct. 9).

Purpose: a student reading "you did not quantify your impact" cannot act on it
without knowing whether that was read off their resume bullets or heard in their
answers. The two have different fixes.

Output: a `source` field on each feedback item, declared by the evaluator through
a closed vocabulary, deterministically constrained server-side, and rendered as a
chip beside the existing timecode chips.
</objective>

<approach_and_its_limits>
READ THIS BEFORE TOUCHING CODE. It is the reason the design is shaped this way.

**Why the evaluator declares the source rather than code inferring it.**
The evaluator's user message (`buildEvaluatorUserMessage`, `lib/engine/evaluation.ts:229-242`)
hands it two labelled inputs: `full_transcript:` and `resume_text:`. The model
therefore knows, at the moment it writes a bullet, which input the bullet rests
on. Asking it to declare that is a self-report of its own evidence basis — the
same mechanism Phase 12 and Phase 18 already use to constrain evaluators to a
closed vocabulary. It is NOT a post-hoc heuristic that re-reads a finished
sentence and guesses where it came from. Do not build such a heuristic; if the
field is missing, render nothing.

**What is deterministically guaranteed, and what is not.**
- GUARANTEED: a resume claim is impossible when no resume exists. `resume_text`
  degrades to the literal string `(No resume was provided.)` (`lib/engine/evaluation.ts:221`),
  and `validateEvaluationResult` receives `evaluationContext`, so the server can
  and must rewrite any `resume`/`both` claim to `conversation` in that case.
  Task 1 implements exactly this.
- NOT GUARANTEED: that a model's self-declared source is truthful in the case
  where a resume DID exist. Nothing in the inputs lets code adjudicate that.
  The prompt constrains it; the vocabulary bounds it; the no-resume case is
  enforced. Beyond that it is a model claim, and the UI wording ("From your
  resume") must stay a plain attribution, never an assertion of proof.

**Why the field is nullable rather than universally required in prose.**
`STRUCTURED_REPORT_PROPERTIES` is shared by every session type through
`buildRubricJsonSchema` (`lib/engine/rubric.ts:115-119`), and OpenAI `strict: true`
has no optional keys. A nullable `source` means the four non-interview evaluator
prompts (scenario, networking, courageous conversation) need NO edit: they emit
`null` and their reports are byte-identical to today. This matters because
Phase 20 plan 20-05 is concurrent and 20-07 is gated — `CONVERSATION_EVALUATOR_PROMPT`
must not be touched by this work.

**Surface-count discipline: checked, clear.**
`scripts/verify-engine-surface-count.ts` asserts file existence and the absence
of per-type forks (`assertExactlyOneFile` / `assertAbsent`); it does not content-lock
`lib/report/structured.ts`, `lib/interview/prompts.ts`, or `components/report/ReportBody.tsx`.
The DC / pitch / networking / deck surface-count guards do not mention these
files at all. Editing them in place trips nothing. The new module goes in
`lib/report/` — alongside `quote-sanitizer.ts`, which 20-06 placed there
deliberately so `lib/report/` never imports a type-specific module. Follow that.

**The one guard this DOES trip, by construction.**
`scripts/verify-report-structure.ts` holds two frozen pre-Phase-13 schema copies,
`EVALUATION_JSON_SCHEMA` (line 56) and `SCENARIO_EVALUATION_JSON_SCHEMA` (line 140),
and deep-equals the derived schema against them in sections 7 and 8 (lines ~755,
~776, ~877, ~898). Adding a property to the shared item schemas will fail those
four checks until the two snapshots are updated. That is expected and is Task 1's
job — update both snapshots and amend their header comments to record the one
deliberate post-Phase-13 addition. Do not delete or weaken the deep-equality
checks to make them pass.

**Do not touch:** `lib/engine/termination.ts`, `lib/engine/disengagement.ts`,
`components/practice/PracticeSessionShell.tsx`, any `*-VALIDATION.md`,
`app/practice/[type]/report/[reportId]/page.tsx` (the shared report page —
`ReportBody` is the correct seam and needs no page edit).
</approach_and_its_limits>

<execution_context>
@/Users/ajabreu79/.claude/get-shit-done/workflows/execute-plan.md
@/Users/ajabreu79/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@lib/report/structured.ts
@lib/engine/evaluation.ts
@lib/interview/prompts.ts
@components/report/ReportBody.tsx
@lib/report/quote-sanitizer.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Carry a closed-vocabulary source through the structured report and enforce the no-resume case server-side</name>
  <files>lib/report/structured.ts, lib/report/source-attribution.ts, lib/engine/evaluation.ts, scripts/verify-report-structure.ts</files>
  <action>
In `lib/report/structured.ts`:

1. Export the closed vocabulary and its type:
   `export const FEEDBACK_SOURCES = ["resume", "conversation", "both"] as const;`
   `export type FeedbackSource = (typeof FEEDBACK_SOURCES)[number];`

2. Add `source?: FeedbackSource | null;` to BOTH `ReportStrength` and
   `ReportGrowthArea`. Make it OPTIONAL in TypeScript (`?`), not merely
   nullable. Reason: `scripts/verify-report-structure.ts` and
   `scripts/dc-approach-vs-result.ts` build these literals without the field;
   an optional field keeps `npx tsc --noEmit` clean with zero edits to their
   fixtures. Document on the field that `null`/absent means "the evaluator did
   not declare a source" and that consumers must render nothing in that case —
   never an "unknown" badge.

3. Add a `source` property to the `strengths` and `growth_areas` item objects
   inside `STRUCTURED_REPORT_PROPERTIES`, as `{ type: ["string", "null"] }`
   (reuse the existing `STRING_OR_NULL` const), and add `"source"` to each item's
   `required` array. Do NOT put a JSON-schema `enum` on it — the closed
   vocabulary is enforced in the parser below, where an out-of-vocabulary value
   degrades instead of failing the whole response. Leave
   `STRUCTURED_REPORT_REQUIRED` untouched: `source` is nested inside the item
   objects, not a top-level property, and that const feeds
   `buildRubricJsonSchema`'s `reservedPropertyNames` collision check.

4. In `parseStructuredReport`, add a private `feedbackSource(value: unknown)`
   helper returning `FeedbackSource | null`: trim and lowercase a string, return
   it only if it is in `FEEDBACK_SOURCES`, else `null`. Apply it when mapping
   both `strengths` and `growth_areas`. An unrecognised value, a number, an
   object, or an absent key all become `null`.

5. In `composeReportMarkdown`, prefix the attribution onto the strength and
   growth-area bullets so `reportMarkdown` cannot drift from the structured data
   (the module's own single-source-of-truth rule). Use a small local
   `sourcePrefix(source)` returning `"From your resume: "`, `"From the
   conversation: "`, `"From your resume and the conversation: "`, or `""` for
   null. Insert it immediately after the bold title, e.g.
   `- **${s.title}:** ${sourcePrefix(s.source)}${s.detail}`. Do NOT touch the
   `rubric_notes` section's `- ${item}: ${note}` shape — `extractBehavioralFeedback`
   in `lib/study-plan/generate.ts` regex-scans exactly that form and section 4 of
   `verify-report-structure.ts` asserts it.

Create `lib/report/source-attribution.ts` — a pure module: no Prisma, no network,
no React, no imports outside `./structured`. Mirror the header-comment style of
`lib/report/quote-sanitizer.ts`. Export:

```
export function enforceSourceAttribution(
  report: StructuredReport,
  opts: { hasResume: boolean },
): { report: StructuredReport; downgradedCount: number }
```

Behaviour: when `opts.hasResume` is true, return the report unchanged and
`downgradedCount: 0`. When false, rewrite every `source` of `"resume"` or
`"both"` to `"conversation"` on both lists and count each rewrite. `null` and
`"conversation"` are left exactly as they are — a null must never become
`"conversation"`, because absence of a declaration is not a declaration. Return
a new object; do not mutate the input.

In `lib/engine/evaluation.ts`, inside `validateEvaluationResult`, immediately
after the existing `sanitizeBodySignalWording` block, derive
`hasResume` from the already-available `evaluationContext`
(`typeof evaluationContext.resumeText === "string" && evaluationContext.resumeText.trim().length > 0`)
and pipe the report through `enforceSourceAttribution` before it reaches
`composeReportMarkdown` and the returned `reportStructured`. Log a
`console.warn` with `{ downgradedCount, typeSlug: config.typeSlug }` when
`downgradedCount > 0`, matching the shape of the wording-violation warn right
above it. This is the one server exit for a report body — the enforcement goes
here and never in a component.

Finally, in `scripts/verify-report-structure.ts`, add the `source` property and
its `required` entry to the `strengths` and `growth_areas` item objects of BOTH
`EVALUATION_JSON_SCHEMA` (line ~56) and `SCENARIO_EVALUATION_JSON_SCHEMA`
(line ~140), so the four deep-equality checks pass again. Amend each snapshot's
header comment to say that it is the pre-Phase-13 schema plus one deliberate
addition — the nested `source` attribution field from quick task 002 — so the
provenance note stays honest. Change nothing else in that file.
  </action>
  <verify>
`npx tsc --noEmit` is clean.
`npx tsx scripts/verify-report-structure.ts` — ALL PASS, including sections 3, 4,
7 and 8. Run it BEFORE editing the two snapshots as well, and record in the
summary that the four deep-equality checks failed first and passed after: that is
the proof the guard still bites.
  </verify>
  <done>
`source` round-trips through parse with an out-of-vocabulary value degrading to
null; `enforceSourceAttribution` is called inside `validateEvaluationResult`;
with `resumeText` empty, no stored report can carry a `resume` or `both` source;
`verify-report-structure.ts` is ALL PASS.
  </done>
</task>

<task type="auto">
  <name>Task 2: Teach the interview evaluator to declare the source, and render it on the report</name>
  <files>lib/interview/prompts.ts, components/report/ReportBody.tsx</files>
  <action>
In `lib/interview/prompts.ts`, edit `INTERVIEW_EVALUATOR_PROMPT` only. Leave
`buildInterviewSystemPrompt` and `buildProgressBlock` alone — the cache-prefix
contract documented atop the file is unrelated to the evaluator and must not be
disturbed.

1. In the OUTPUT FORMAT JSON skeleton, add `"source"` to the `strengths` and
   `growth_areas` item shapes, e.g.
   `"source": "resume" | "conversation" | "both"`.

2. Add a rule block near the other closed-vocabulary rules, titled in the
   prompt's existing register (e.g. `RULE ON SOURCE ATTRIBUTION`), stating:
   - Every strength and growth area MUST carry `source`, drawn from exactly
     three values: `resume`, `conversation`, `both`. No other value, no prose.
   - `resume` means the finding rests on `resume_text` — what the document said,
     how it was written, what it claimed or omitted.
   - `conversation` means it rests on `full_transcript`, `visual_metrics`, or
     `vocal_metrics` — what the candidate said or how they delivered it.
   - `both` is for a genuine comparison between the two inputs and nothing else:
     a resume claim the spoken answers did not support, or a strong spoken story
     that never appears on the resume. Do not reach for `both` because a finding
     feels broad.
   - When `resume_text` reads `(No resume was provided.)`, every item is
     `conversation`. There is no resume to attribute anything to.
   - Delivery findings (anything from `visual_metrics` or `vocal_metrics`) are
     always `conversation`. A camera and a microphone cannot observe a document.

3. Add one sentence to the TONE section (or alongside the first-person-voice
   rule) directing narrative fields to name the input in words where it is
   natural — "From your resume, I saw…", "In how you answered…" — so
   `overall_summary` and `category_notes` read consistently with the labels. Keep
   it a stylistic instruction; the machine-readable guarantee is the `source`
   field, not the prose.

In `components/report/ReportBody.tsx`:

4. Add a small local `SourceChip({ source }: { source?: FeedbackSource | null })`
   component (import the type from `@/lib/report/structured`). It returns `null`
   for a null/absent source — the legacy path documented at the top of this file
   must stay silent, not render an "unknown" badge. Otherwise it renders a
   `Chip` with `size="sm" variant="flat"`, labelled:
   `resume` → "From your resume", `conversation` → "From the conversation",
   `both` → "Resume + conversation". Give `both` a visually distinct `color`
   from the other two so a mixed-source item is distinguishable at a glance, and
   put the full phrase "From your resume and the conversation" in its `title`
   attribute so the distinction survives for a screen reader and a narrow
   viewport.

5. Render `<SourceChip source={s.source} />` on the collapsed row of each
   Strengths `AccordionItem`, next to the title. Strengths currently pass a bare
   `<span>` as `title`; wrap it in the same
   `<div className="flex flex-wrap items-center gap-2">` the growth-area rows
   already use, so the two sections look alike.

6. Render `<SourceChip source={g.source} />` on the collapsed row of each Growth
   areas `AccordionItem`, in the existing flex wrapper, BEFORE the timecode
   chips — the source answers "where did this come from", the timecodes answer
   "when", and source-then-when reads in that order.

Do not edit `app/practice/[type]/report/[reportId]/page.tsx`,
`components/interview/ReportScoreCards.tsx`, or `ReportMarkdown.tsx`.
`ReportBody` already receives the full `structured` object.
  </action>
  <verify>
`npx tsc --noEmit` clean. `npm run lint` clean on the two edited files.
`npx tsx scripts/verify-report-structure.ts` still ALL PASS (section 6 asserts
evaluator voice/collaborative-suggestion phrases — confirm the prompt edit did
not disturb the exact strings `first person as the\nevaluator`, `as “you.”`, and
`options to consider, not instructions to obey`).
`npx tsx scripts/verify-feedback-copy.ts` still passes.
  </verify>
  <done>
The interview evaluator prompt names `source` and its three-value vocabulary and
forbids a resume attribution when no resume was supplied; `ReportBody` renders a
distinct chip for each of the three values on both Strengths and Growth areas,
and renders nothing when the field is null.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Ship the regression battery, then confirm the labels on a real report</name>
  <files>scripts/verify-feedback-source-attribution.ts, package.json</files>
  <action>
First, write `scripts/verify-feedback-source-attribution.ts`, following the
established shape of `scripts/verify-feedback-copy.ts` and
`scripts/verify-dc-walkout-report.ts`: a `check(name, actual, expected)` helper,
numbered console sections, a failure counter, and `process.exit(1)` on any
failure. Sections:

1. Parse and vocabulary — `parseStructuredReport` keeps `resume`,
   `conversation`, `both`; coerces `"RESUME "` to `resume`; degrades `"inferred"`,
   `42`, `{}` and an absent key to `null`.
2. Enforcement — with `hasResume: false`, `resume` and `both` both become
   `conversation`, `null` stays `null`, `conversation` stays `conversation`, and
   `downgradedCount` equals the number of rewrites; with `hasResume: true`
   nothing changes and `downgradedCount` is 0. Assert the input object was not
   mutated.
3. The real server exit — call `validateEvaluationResult` (as
   `verify-report-structure.ts` does via its `validateInterviewLike` wrapper) with
   an adversarial payload whose every item claims `source: "resume"` and an
   `evaluationContext` carrying `resumeText: ""`. Assert no `resume`/`both`
   survives in `reportStructured`, and that `reportMarkdown` contains no
   "From your resume" string. Then repeat with a non-empty `resumeText` and
   assert the resume attribution DOES survive — proving the guard is narrow and
   has not simply erased the feature.
4. Schema shape — `buildRubricJsonSchema` for the `general` type lists `source`
   in both `strengths.items.required` and `growth_areas.items.required`, typed
   `["string", "null"]`.
5. Prompt text — `INTERVIEW_EVALUATOR_PROMPT` contains `"source"`, all three
   vocabulary words, and the no-resume rule; and the three non-interview
   evaluator prompts were NOT taught the field (assert `SCENARIO_EVALUATOR_PROMPT`
   does not mention a source attribution rule), which is what keeps their output
   unchanged.
6. Component labels — read `components/report/ReportBody.tsx` as source text and
   assert all three display strings and `.source` references are present on both
   the strengths and growth-area rows.

Then run the negative test and record it: temporarily revert the
`enforceSourceAttribution` call in `lib/engine/evaluation.ts`, confirm section 3
FAILS and the script exits 1, restore it, confirm ALL PASS. A battery that has
never been seen to fail is not evidence.

Add `"verify:feedback-source": "tsx scripts/verify-feedback-source-attribution.ts"`
to `package.json` scripts, next to the existing `verify:hold-space` entry.

Then run the full affected battery:
`npx tsc --noEmit`, `npx tsx scripts/verify-report-structure.ts`,
`npx tsx scripts/verify-feedback-copy.ts`,
`npx tsx scripts/verify-engine-surface-count.ts`,
`npx tsx scripts/verify-report-chrome-coverage.ts`,
`npm run verify:feedback-source`. Note any pre-existing failure explicitly as
pre-existing (STATE.md records one known Phase-18-owned `verify-pitch-types.ts`
elevator failure) rather than silently absorbing it.
  </action>
  <what-built>
Feedback items now carry a `source` declared by the interview evaluator from a
three-value closed vocabulary, constrained server-side so a resume attribution
is impossible when no resume was uploaded, and rendered as a chip on each
collapsed Strengths / Growth-areas row. A new verify battery covers parse,
enforcement, the real server exit, schema shape, prompt text and component
labels, with its negative test run.
  </what-built>
  <how-to-verify>
1. `npm run dev`, start a General Interview and UPLOAD a resume. Answer a few
   questions — include at least one answer that elaborates on something the
   resume states, and one story that is nowhere on the resume. Finish the
   session and open the report.
2. On the Feedback tab, expand nothing yet. Every Strengths and Growth-areas row
   should carry one visible source chip. Confirm you can tell at a glance which
   points came from the document and which from how you spoke, and that at least
   one "Resume + conversation" chip looks clearly different from the other two.
3. Confirm the chips read as plain attributions, not verdicts, and that the
   narrative under "Overall" names its inputs in words consistently with the
   chips.
4. Start a second General Interview and SKIP the resume upload. Finish and open
   that report. There must be ZERO resume chips anywhere — every item reads
   "From the conversation".
5. Open any existing older report from `/reports` (one generated before today).
   It must still render normally with no chips and no empty badge.
6. Open one Courageous Conversation or Networking report. It must look exactly
   as it did before — no chips, no new panel.
  </how-to-verify>
  <resume-signal>Type "approved", or describe what the labels got wrong</resume-signal>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` clean.
- `npm run verify:feedback-source` ALL PASS, with its negative test run and
  reported.
- `npx tsx scripts/verify-report-structure.ts` ALL PASS — in particular the four
  deep-equality checks against the two updated frozen snapshots.
- `npx tsx scripts/verify-engine-surface-count.ts` ALL PASS (no new per-type fork).
- `npx tsx scripts/verify-feedback-copy.ts` and
  `npx tsx scripts/verify-report-chrome-coverage.ts` unchanged.
- No file under Phase 18/20 active validation was touched: confirm via
  `git diff --name-only` that `lib/engine/termination.ts`,
  `lib/engine/disengagement.ts`, `components/practice/PracticeSessionShell.tsx`,
  `lib/difficult-conversation/*`, and every `*-VALIDATION.md` are absent from the
  diff.
</verification>

<success_criteria>
1. SRC-01 — A feedback point the evaluator drew from the resume renders a visible
   "From your resume" chip on the interview report.
2. SRC-02 — A feedback point drawn from the spoken conversation renders a visible
   "From the conversation" chip.
3. SRC-03 — A mixed-source point renders a label naming both inputs and visually
   distinct from either single-source label.
4. A session with no resume upload cannot produce a resume-attributed point: the
   rewrite happens in `validateEvaluationResult`, before storage, and is proven
   by a negative-tested assertion against the real function.
5. Non-interview session types and pre-existing reports render byte-identically
   to today — no prompt outside `lib/interview/prompts.ts` was edited, and a null
   source renders nothing.
6. Human verification of the four report cases in Task 3 returns "approved".
</success_criteria>

<output>
After completion, create
`.planning/quick/002-feedback-source-attribution/002-SUMMARY.md`.

Record explicitly: the four `verify-report-structure.ts` deep-equality failures
seen before the frozen snapshots were updated and their state after; the
negative-test result for the new battery; and any pre-existing failure in the
wider battery, named as pre-existing.
</output>
