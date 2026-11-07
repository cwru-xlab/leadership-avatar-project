# Questioned persona: validity evidence

Two registered engine types: `clinical-communication` and `motivational-interviewing`. Both are built on the difficult-conversation instance shape plus a `personaCard`. Content lives in `lib/questioned-persona/`.

## What it is

The student interviews or counsels an avatar persona who **holds facts back until asked well**. The persona is not an adversary and not a quiz; it is a person whose story comes out in proportion to the quality of the questions.

- **Clinical communication** (about 12 minutes): take a history from a standardized patient. Six cases across medicine/PA, nursing, dental, pharmacy and a parent-as-historian case.
- **Motivational interviewing** (about 15 minutes): counsel a client who is genuinely of two minds about a change. Four cases across campus health, nursing/health coaching, social work and cardiac rehab.

Each case card carries hidden facts (each with the question type that earns it), emotional cues the persona drops unprompted, and — for clinical — the patient's own ideas, concerns and expectations. MI cases add change talk, sustain talk and a reactance rule.

The report is produced by **two** model passes plus pure code:

1. a **tagger** that codes every student utterance;
2. a **judge** that returns the checklist, which hidden facts were elicited, and how each cue was handled;
3. `lib/questioned-persona/coding.ts`, which **counts** the codes and derives every ratio and band in code — no model is asked for an aggregate;
4. the normal rubric evaluator, which receives the derived counts as context and is told to cite them and never recount.

Steps 1–3 are the engine's `InteractionTypeConfig.supplementaryAnalysis` seam. The result is stored at `outcome.personaAnalysis` and a failure there never fails the report.

## Sources

Full citations live beside the content they justify (`frameworks.ts`, `coding.ts`, `types.ts`). All case content is original; no real patient or client is depicted.

| Source | Used for |
|---|---|
| Kurtz, Silverman & Draper, *Skills for Communicating with Patients*, 3rd ed. (2013) | The Calgary–Cambridge consultation checklist: the 11 graded steps, and the open-to-closed "cone" |
| Makoul, SEGUE Framework (2001), *Patient Educ Couns* 45:23–34 | Cross-check on the clinical step list |
| Kalamazoo Consensus Statement, *Acad Med* 2001;76:390–393 | Cross-check on the clinical step list |
| Miller & Rollnick, *Motivational Interviewing*, 4th ed. (2023) | The four processes (engaging, focusing, evoking, planning) and OARS; the MI process checklist |
| MITI 4.2.1 (Moyers, Manuel & Ernst, 2014) | The counselor behavior code definitions and the four global scales |
| Moyers, Rowell, Manuel, Ernst & Houck (2016), *J Subst Abuse Treat* 65:36–42 | The MITI 4 proficiency thresholds: R:Q fair 1:1, good 2:1; complex reflections fair 40%, good 50% |
| MITI 3.1.1 (Moyers, Martin, Manuel, Miller & Ernst, 2010) | The % open questions reference (50% beginning, 70% competency). **MITI 4 dropped the open/closed distinction**; the report shows this as a reference only |
| Ilgen et al. (2015); Hodges et al. (1999) | Why the rubric dimensions are scored as expert **global** judgments rather than checklist tallies |

### What is NOT validated

- The **clinical** numeric thresholds (% open questions fair 25/good 40, empathy statements, reflections) are a **practice target for this tool, not a published cut-off**. Calgary–Cambridge recommends the open-to-closed cone but publishes no numeric threshold for history-taking. `CLINICAL_TARGET_SOURCE` says so on the report itself.
- The hand coding of the golden transcripts is the author's, against the MITI 4.2.1 and Calgary–Cambridge definitions. It has **not been double-coded by a trained human rater**, so no inter-rater reliability figure is claimed.

## Frameworks (steps the report grades)

| Framework | Steps |
|---|---|
| `calgary-cambridge` (11) | greet_introduce → open_agenda → patient_narrative → history_detail → elicit_ice → respond_to_cues → summarize → plain_explanation → shared_plan → teach_back → close_safety_net |
| `mi-processes` (9) | engage → ask_permission → explore_ambivalence → evoke_change_talk → values_link → roll_with_sustain_talk → summarize → emphasize_autonomy → plan_if_ready |

## Behavior codes

| Style | Codes |
|---|---|
| Clinical (12) | open_question, closed_question, leading_question, stacked_question, reflection, summary, empathy_statement, jargon, information_giving, teach_back, agenda_setting, premature_reassurance |
| MI (11) | open_question, closed_question, simple_reflection, complex_reflection, affirm, seeking_collaboration, emphasizing_autonomy, giving_information, persuade, persuade_with_permission, confront |

Each code counts **at most once per utterance**. `countCodes` is pure arithmetic over the stored tags; `deriveMetrics` is a pure function of those counts. Both are re-checked against every golden by the deterministic script.

## Rubric

Both types score the shared four (Visual, Vocal, Content, Behavioral) plus four extras.

| Type | Extra dimensions |
|---|---|
| `clinical-communication` | opening_agenda, information_gathering, empathy, explanation_planning |
| `motivational-interviewing` | cultivating_change_talk, softening_sustain_talk, partnership, empathy (the four MITI 4 globals) |

Neither type declares any model-produced outcome field. The structured result is the engine-owned `personaAnalysis`.

## Deterministic contract check

`scripts/verify-questioned-persona.ts` — **1,938 assertions, no OpenAI calls, all passing.** Eight sections:

1. both types registered on the engine and routable through `lib/routes.ts`;
2. every case has a complete persona card, and every hidden fact names a probe and at least one reveal keyword;
3. framework step keys, behavior-code keys and report panel labels are the same sets;
4. the mastery competency mapping covers every rubric dimension both types declare;
5. no hidden-fact text or reveal keyword appears in the snapshot builder or the briefing field whitelist;
6. the disclaimers are present (the MI one carries a crisis line);
7. the avatar cast never cross-pairs an avatar with another's voice, across four resolve paths (catalog hit, churned cast avatar, catalog outage, non-persona id);
8. the counts are arithmetic: the schemas ask only for per-utterance codes, `assembleAnalysis` fills counts from `countCodes`, both evaluator prompts say "never recount", the counts sum to the hand codes on every golden, and the runner's seam runs before the rubric evaluator, merges after `validateOutcome`, appends to `evaluatorBrief`, and only warns on failure.

## Grading validity study

`scripts/verify-questioned-persona-grading.ts` uses the real registered types. Each grade goes through:

1. the **supplementary pass first** (real tagger + judge calls), as `evaluation-runner.ts` runs it;
2. the real evaluator prompt;
3. gpt-4.1 with the strict schema from `buildRubricJsonSchema`;
4. the engine's `buildPersonaEvaluationContext`, with `evaluatorNoteFor(analysis)` appended to the brief;
5. `validateEvaluationResult`.

Three runs of the study were paid for. Each graded run is 3 real calls.

### Golden transcripts

| id | Case | What it tests |
|---|---|---|
| cc-strong | chest tightness | agenda, open-to-closed, ICE, empathy to both cues, summary, plain language, teach-back, safety-net |
| cc-closed-heavy | chest tightness | closed-question checklist; no agenda, no ICE, ignores the work cue; jargon and premature reassurance |
| cc-leading-stacked | fatigue | leading and stacked questions supply the answers, so **no hidden fact comes out at all** |
| cc-misses-ice-cues | dental anxiety | decent opening and history, never asks ICE, ignores both cues, explains in jargon |
| mi-strong | campus drinking | complex reflections, permission, affirmations, double-sided summary, autonomy |
| mi-closed-heavy | smoking | question-and-answer intake, one simple reflection, no evocation |
| mi-righting-reflex | cardiac rehab | warnings, arguing and persuasion without permission; no reflections at all |
| mi-derived-counts | job training | **the arithmetic test.** Nine reflections of which three are complex, plus seven questions: by hand R:Q = 1.29 (fair, not good) and complex share = 33% (below the 40% fair line). Both sit *just under* a threshold, which is where a model asked for an aggregate rounds itself up |

### Results — final configuration (gpt-4.1, 2 runs each, 2026-11-07, commit eb5f0d1): 16/16

Scores shown are the four **extra** dimensions in declaration order. The shared four are not asserted: a typed transcript has no visual or vocal signal, and content/behavioral are not what this study measures.

| golden | run 1 | run 2 | facts elicited | verdict |
|---|---|---|---|---|
| cc-strong | 5 / 5 / 5 / 5 | 5 / 5 / 5 / 5 | 4/4, 4/4 | PASS |
| cc-closed-heavy | 1 / 3 / 1 / 2 | 1 / 3 / 1 / 1 | 4/4, 4/4 | PASS |
| cc-leading-stacked | 1 / 1 / 1 / 2 | 1 / 2 / 1 / 2 | 0/3, 0/3 | PASS |
| cc-misses-ice-cues | 4 / 3 / 1 / 2 | 2 / 3 / 1 / 2 | 2/3, 2/3 | PASS |
| mi-strong | 5 / 5 / 5 / 5 | 5 / 5 / 5 / 5 | 2/3, 2/3 | PASS |
| mi-closed-heavy | 1 / 2 / 1 / 2 | 1 / 2 / 1 / 2 | 2/3, 2/3 | PASS |
| mi-righting-reflex | 1 / 1 / 1 / 1 | 1 / 1 / 1 / 1 | 0/3, 0/3 | PASS |
| mi-derived-counts | 4 / 5 / 5 / 5 | 4 / 5 / 5 / 5 | 3/3, 3/3 | PASS |

Aggregate measures over the 16 reports:

- **Double quotes inside a JSON string field: 0.** Both runs, every report.
- **Rubric notes missing the `Meets all criteria: yes./no.` prefix: 0.** Both runs, every note.
- **Hit steps whose evidence was not the student's own words: 0.**
- `mi-derived-counts` landed in the bands the counts imply — `reflection_to_question` **fair** and `percent_complex_reflections` **below** — on both runs. The seam does what it exists to do.

### Results — before the study's fixes (gpt-4.1, 2 runs each, 2026-11-07, commit 2937701): 10/16

Kept as the recorded comparison. The failures were **identical across both runs**, so these were defects, not flake.

| golden | failure, both runs |
|---|---|
| cc-leading-stacked | `leading_question` coded 2 where the author coded 5 |
| mi-righting-reflex | `confront` coded 2 where the author coded 5; run 2 also `persuade` 2 of 5 |
| cc-closed-heavy | step `history_detail` marked hit with evidence that was not verbatim |

An intermediate run (after the code-definition and judge-prompt fixes, before the `locateQuote` fix) measured **14/16**, with `mi-closed-heavy` failing on both runs for the same reason described below.

### What the study changed

1. **`leading_question` was under-coded 2:5.** The definition gave one example and no rule. The tagger was not recognizing tag questions appended to a statement (`…, right?`, `…, correct?`), negatively framed screens that invite agreement (`No chest pain, nothing like that?`), or questions that state the answer and ask for confirmation. The definition now enumerates those four forms with a decision rule.
2. **`confront` and `persuade` were under-coded 2:5.** Same cause. `confront` now names directly contradicting the client, and the scare question that is really a warning (`Do you want to have another heart attack?`), and says explicitly that an utterance which both contradicts the client and argues for the change gets **both** codes. `persuade` now names consequence-warnings, unsolicited suggestions, and appeals to a third party's feelings.
3. **The judge was paraphrasing evidence.** "Copy verbatim" was not enough. The instruction now says copy and paste a span of characters from one `[S#]` line, lists what not to do, and states the consequence: a quote that is not found is discarded, leaving the step with no evidence, so a step with no quotable words is `missed` rather than a hit with an approximate quote.
4. **Both JSON rules from the sibling system-design study were added to both persona evaluator prompts from the start** — no double quote inside any string field, and every rubric note opening with `Meets all criteria: yes.` or `no.` judged on the student's own words alone. Both held at **0 violations over 16 reports and 3 study runs**, first attempt. Mirrored, not shared: `lib/problem-interview/prompts.ts` is for problem interviews and was not touched.

### Bug found and fixed in the half-built code

**`locateQuote` was discarding valid evidence.** The judge is shown a transcript of `[S8] Counselor: …` lines (`labelledTranscript`) and told to copy a span from one of them. When it complied *literally* and copied `[S8] Counselor: So you smoke a pack a day…`, `locateQuote` matched the whole string against the raw utterance text, found no match, and threw the evidence away — so `mi-closed-heavy`'s one genuine summary step rendered with no quote. That is compliant model behavior being punished by the verifier, not a hallucination.

Fix: `cleanEvidenceQuote` strips a leading `[S#]` label, a speaker label and wrapping quotation marks before matching, and the **stored** quote is cleaned too, not just the match. It still refuses a persona line and still refuses an invented quote; six deterministic assertions cover both directions.

## Live-prompt probe

`scripts/verify-questioned-persona-live.ts` — **20/20 probe runs passed at `--runs 2`, first attempt.** Real `buildPersonaSystemPrompt` plus the per-turn `buildPersonaReminder` tail fragment, gpt-4.1, as the chat route assembles them. Leak detection uses each fact's own `revealKeywords`, so a new case is covered without touching the script.

| probe | asserts |
|---|---|
| P1 cc | the canned opener earns nothing and gets one short line, not a monologue |
| P2 cc | `Anything else I should know?` earns **no** hidden fact — the prompt says a catch-all does not |
| P3 cc | `What are you usually doing when it comes on?` **does** earn the exertional trigger |
| P4 cc | a family-history question earns that fact and **not** the stopped-medication fact |
| P5 cc | asked `what should I be asking you next?`, the patient does not coach |
| P6 cc | asked `what should I do about your chest?`, the patient does not order a workup or diagnose itself |
| P7 mi | a confrontational opener produces sustain talk, not capitulation |
| P8 mi | an evocative open question earns the client's own goal |
| P9 mi | asked `how am I doing?`, the client does not counsel the counselor |
| P10 mi | pushing does not produce a commitment (the reactance rule holds) |

Representative replies are in the script's output. Every persona stayed in character; none acknowledged the simulation, used a stage direction, or opened with an assistant pleasantry.

## Privacy boundary

The persona card reaches the **live prompt** and the **evaluator**, and nothing else. Enforced at two points, both asserted:

- **Briefing:** `ConversationBriefingFields` (`components/practice/steps/ConversationBriefingStep.tsx`, line 22) has no `personaCard` and no `hiddenPosition` key at all, so passing one is a compile error. The e2e spec additionally asserts no hidden-fact text appears in the rendered briefing **or** in the serialized page payload, at 1440 and 375.
- **Snapshot:** `difficultConversationSnapshotFromInstance` (`lib/engine/session.ts`, line 340) spreads only `personaStyle` and `personaName` out of the whole card. The e2e spec asserts those are the *only* `persona*` keys on the stored snapshot, and that no hidden-fact text appears anywhere in the report DTO.

The card **does** ride the client in the play-route payload and is resent on each chat turn — that is how the live prompt receives it, the same client-held pattern `hiddenPosition` and the case-study `additionalInfo` already use. The `personaCard` doc comment in `lib/engine/types.ts` records what that does and does not guarantee.

## e2e

`e2e/questioned-persona.spec.ts` — **9/9 passing.** Screenshots at 1440 and 375 in `screenshots/questioned-persona/` (a stable directory; Playwright empties `test-results/` on every run).

Also asserts the play route **refuses** a persona case when the caller does not name the type, so a patient can never load through the courageous-conversation page.

## Known residuals

1. **The open/closed question split is not reliable, and the study does not pretend it is.** On `mi-derived-counts` the tagger and the author agreed exactly on reflections (6 simple, 3 complex) but split 5/1 where the author split 3/4 on open vs closed. This is the one distinction **MITI 4.2.1 itself dropped** as the least reliable judgment in MITI 3. The golden therefore asserts the question **load** as a sum (`expectCountSums`), which is reliable, instead of asserting a split that is not. The report still shows `percent_open_questions` for MI, labelled as a MITI 3 reference only. For clinical, where the open-to-closed cone is the teaching point, the split is asserted per-code and held on both runs.
2. **Hidden-fact elicitation is strict in a way worth watching.** `mi-strong` scores 5/5/5/5 but elicits only 2 of 3 facts, and `mi-closed-heavy` elicits 2 of 3 — the goldens stop before the third fact could plausibly come out. The judge is right in both cases; the asymmetry is in the transcripts, not the grader. A longer golden would be needed to exercise 3/3 on a strong MI run.
3. **No inter-rater reliability figure.** The hand coding is single-coded by the author. A trained human second coder on the same eight transcripts would give a kappa; none is claimed.
4. **The clinical numeric thresholds are unvalidated practice targets**, as stated above and on the report itself.
5. **The e2e report test renders a pending report, not a graded one.** It asserts the report route accepts a questioned-persona attempt and records its style. The persona panels are exercised against real analyses by the grading study and for key agreement by the deterministic script, but no e2e test renders a finished `personaAnalysis` in the browser — that would need a graded attempt fixture.
6. **The e2e spec needs `next start`, not `next dev`.** Under the sandbox the dev server's HMR websocket cannot upgrade, hydration never completes and the login form never submits. Against a production build on the same port the whole spec passes in about 6 seconds. Not a product defect.
7. **Two neighbouring verify scripts fail, and both fail identically at the branch point `df4fd2c` with none of this work applied** — confirmed by running them in a clean worktree at that commit. Neither is caused by the questioned-persona engine and neither was fixed here:
   - `verify-dc-surface-count`: 1 failure. `components/practice/routes/PracticeInstancePage.tsx` branches on `difficult-conversation` but is not on the script's permitted-file list. Pre-existing.
   - `verify-competency-catalog`: 3 failures, all from the same cause — `coding_correctness`, `coding_quality` and `technical_communication` (the technical-interview type's dimensions) have no competency mapping. Pre-existing, and unrelated to these two types, whose eight dimensions all map (asserted in section 4 of the deterministic script).

   These are in addition to the two the orchestrator already flagged as known (`verify-job-description-intake`, 3; `verify-uat-polish`, 2).

## Integrator TODOs

1. **The two JSON rules are now duplicated in three places** — `lib/problem-interview/prompts.ts` (a sibling worker's change), `CLINICAL_EVALUATOR_PROMPT` and `MI_EVALUATOR_PROMPT` (here, via `SHARED_WORDING`). All three state the same two rules in their own words. Worth promoting to one shared constant in `lib/report/structured.ts` beside `REPORT_SPELLING_RULE`, which the engine already appends to every evaluator prompt. Not done here: it is a cross-type change and would need re-measuring on every type that already has a study. The system-design validity doc's TODO 2 argues the same point for the `processSteps` schema and reaches the same conclusion — do it once, after the remaining studies land.
2. **`supplementaryAnalysis` has no retry.** `runEvaluation` retries once; the supplementary pass does not. A transient tagger failure silently costs the whole behavior-coding section of one report (it warns and the report still renders, as designed). One retry would match the rubric evaluator's durability. Open.
3. **The behavior counts are not surfaced to mastery.** The competency mapping covers every rubric dimension, but the derived metrics (R:Q ratio, complex-reflection share, unexplained jargon) are report-only. If these should feed a mastery signal, that is a design decision, not a wiring gap.
4. **`PERSONA_CAST` pins one avatar per case and the roster has 10 cases.** Section 7 of the deterministic script asserts no two cases share a face or a voice. Adding an eleventh case needs an eleventh seated public avatar, or that assertion has to be relaxed to allow reuse across styles.
