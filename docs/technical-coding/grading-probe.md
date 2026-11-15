# Technical-coding grading probe (2026-11-15)

We wanted to know how the technical-coding evaluator actually grades. The user asked three things:

1. Are the reports specific to a coding interview?
2. Do they show the correct result, so the student can learn from it?
3. Do they grade the student's process of talking through the problem step by step?

## Method

- **Problem:** `longest-unique-window`, in Python. Target: O(n) time, O(k) space. Visible tests: `"abcabcbb"→3` and `"bbbbb"→1`. Hidden tests: `""→0`, `"pwwkew"→3` and `"abcdef"→6`.
- **Sessions:** four scripted sessions in `scripts/research/technical-coding-grading-probe.ts`:
  - **(a) strong-correct:** clarifies the problem, works through examples and edge cases, explains brute force and then a sliding window, and justifies O(n)/O(k) before coding. The first checkpoint has the stale-left bug. The candidate traces `"abba"`, finds the bug and fixes it.
  - **(b) silent-correct:** "ok", "sliding window", "dict. I'll just code it", "done", "it passes the tests". The final code is the same correct code as (a).
  - **(c) strong-wrong:** the same quality of reasoning as (a). The final code keeps the stale-left bug and starts `best = 1`, so `""` returns 1 and `"abba"` returns 3. It fails a hidden test. The candidate is unsure about `"abba"` and leaves it.
  - **(d) weak-brute:** O(n³) brute force. The candidate claims "O(n), it's just loops", asks for a hint, gets the real tier-1 hint text, ignores it, and considers no edge cases.
- **Pipeline:** the real production path, as `runAndPersistEvaluation` runs it:
  - The transcript holds the server's `visibleTurns`, formatted by `formatTranscriptForEvaluator`. Every turn is stamped `Date.now()` at finish, as `lib/engine/session.ts` does.
  - The context is `{kind:"technical-coding", technicalEvidence, finalSource, finalExecution:null}`.
  - The runner calls the real `runEvaluation`: the same prompt, the strict schema and `gpt-4.1`.
  - Afterwards the runner forces `coding_correctness` to `null`.
- **Runs:** each session was graded twice.
- **Control (`--with-code`, not production):** one extra run per session. It adds the final source and the test outcome to `evaluatorBrief`, which the user message does render. This shows what grading would look like if the code reached the model.
- **Rendering:** run1 of each session was seeded as a READY report for student@case.edu, then captured with Playwright at 1440 px.
- **Raw data:** `scripts/research/out/technical-coding-probe/`. Each `*.json` file holds the full outcome. `user-message.*.txt` holds the exact text the model received.

## The root finding: the evaluator never sees the code or any test result

`buildEvaluationContextForReport` (`lib/engine/evaluation-runner.ts:375`) puts `technicalEvidence`, `finalSource` and `finalExecution` on the context. But `buildUserMessage` (`lib/engine/evaluation.ts`) renders only these keys:

- `evaluatorBrief`
- the transcript
- `resumeText`
- `customization`
- the metrics
- `problemBrief`

The three coding keys are silently dropped. We captured all 8 production requests, and none of them contains `def longest_unique_window` or any test outcome. Test runs happen only in the browser and are never sent to the server. `finalExecution` is always `null`, because no executor exists.

So the model grades **only the conversation**. It knows the problem and the O(n) target only because the interviewer's fixed opening line reads them aloud. The assignment's reference solution, hidden tests and `rubricAnchors` never reach it.

The evaluator prompt itself says "Score coding quality from the submitted source". The model has no source, so it scores `coding_quality` from what the candidate *said*.

## Scores (session × dimension)

Production pipeline. The model's own correctness value is in brackets. The runner discards it and stores `null`.

| Session | Run | content | behavioral | coding_quality | technical_communication | coding_correctness stored [model] |
|---|---|---|---|---|---|---|
| (a) strong-correct | 1 | 4 | 4 | 4 | 4 | null [4] |
| (a) strong-correct | 2 | 5 | 5 | 5 | 5 | null [5] |
| (b) silent-correct | 1 | 2 | 2 | 2 | 1 | null [5] |
| (b) silent-correct | 2 | 2 | 1 | 2 | 1 | null [5] |
| (c) strong-wrong | 1 | 4 | 4 | 4 | **5** | null [5] |
| (c) strong-wrong | 2 | 5 | 5 | 5 | 5 | null [5] |
| (d) weak-brute | 1 | 2 | 2 | 1 | 1 | null [3] |
| (d) weak-brute | 2 | 1 | 1 | 1 | 1 | null [1] |

Visual and vocal were `null` in every run because no metrics were sent.

**What the student actually sees:** only the four shared cards. These are Visual & Environment and Vocal Delivery (both "Not scored — The transcript didn't support a score."), then Content & Structure and Behavioral & Mindset. `coding_quality`, `technical_communication` and `coding_correctness` are stored but appear on no card. The page text was checked for every seeded report: those labels appear only where the model happened to use them as a strength or growth-area title.

Control with code and test outcome in the request (one run each, not production):

| Session | content | behavioral | coding_quality | technical_communication | model correctness |
|---|---|---|---|---|---|
| (a) | 5 | 5 | 5 | 5 | 5 |
| (b) | 1 | 1 | **5** | 1 | 5 |
| (c) | 4 | 4 | **3** | 4 | **2** |
| (d) | 2 | 2 | 2 | 1 | 5 |

## Answers

### Does (b) silent-correct score lower than (a) on process? By how much?

Yes, by a wide margin:

- **`technical_communication`:** 1/1 against 4/5, a gap of 3–4 points.
- **content:** 2/2 against 4/5.
- **behavioral:** 2/1 against 4/5.

The feedback is specific and process-focused, for example: "Did not explain choice of data structure (dictionary), and only briefly acknowledged complexity after prompting" and "Refused walkthrough request." **So yes, it does grade the spoken step-by-step process.**

The catch is `coding_quality`. It scores (b) 2/2 against (a) 4/5 for **byte-identical code**, because it is really a second process score. With the code supplied, (b)'s `coding_quality` rises to 5.

### Does (c) get credit for its process while being told the code is wrong?

It gets full credit for its process. **It is never told the code is wrong.**

- **Scores:** (c) scores the same as or higher than (a) on every dimension in both runs. `technical_communication` was 5 against (a)'s 4 in run 1. `coding_quality` was 4/5.
- **What the summaries say:** "The candidate provided a strong technical solution to the Longest Unique Window problem… Their implementation was correct on visible test cases" (run 1). "All visible tests passed." (run 2).
- **The only hint of a problem** is a growth area about the left pointer and `"abba"`. It is drawn from the candidate's own spoken doubt ("there was some uncertainty with tricky cases (like 'abba')").
- **The `best = 1` empty-string bug** that fails a hidden test is not mentioned in either production run. Its rubric note even reads: "reasoning for hidden case uncertainty was sound."

With the code supplied, the feedback becomes what a student needs:

> "Implementation failed on the empty string and patterns where the left pointer can move backwards, notably 'abba'." — "Consider initializing the best length to 0, and enforce that left pointer only ever moves forward by comparing last seen indices to the current window boundary."

In that control run, `coding_quality` drops to 3 and the model's correctness to 2, while process credit stays at 4. That is the separation the user asked for.

### Does any report show the correct solution, failing tests, or the right complexity?

- **Correct solution:** no report shows it. The report has no Problem tab, no code, no test results and no transcript. `TECHNICAL_CODING_CHROME` declares no `extraTabs` or `extras`, so the report has only the Overview and Content tabs.
- **Failing tests:** never, because the model never receives them. Production feedback claims tests passed when it cannot know:
  - (a) run 1: "Coding met all requirements and **passed execution**", although nothing was executed.
  - (b) run 1: "achieving coding correctness within the required complexity", which it took from the candidate saying "it passes the tests".
- **Complexity:** the O(n) target appears only because the opening line states it. (d) run 1 says "did not meet the stated O(n) efficiency goal". (d) run 2 calls the brute force "O(n^2) or worse", but it is really O(n³). Only the control run states O(n³) correctly.

### Do the scores and feedback mention generic interview things (STAR, body language, resume)?

The **written text** does not. No run mentions STAR, body language, eye contact, posture or resume.

The **frame** is generic behavioral-interview:

- The only scores shown are Visual & Environment, Vocal Delivery, Content & Structure and Behavioral & Mindset. The two coding-specific dimensions are hidden.
- The category notes fill "behavioral" with things like "Polite, organized, took interviewer feedback well".
- The user message still sends `resume_text: (No resume was provided.)` and an empty `role_context`.
- (a) run 1 has a growth area, "Deeper Code Organization and Comments … in-line commenting could be enhanced", about code the model never saw.
- Every growth-area timecode is the same (`28:00` or `28:09`). The finish route stamps every turn with `Date.now()`, so the timecode chips point nowhere.

### Is the variance acceptable?

It is acceptable for ordering and borderline for a student looking at one number.

- **How much scores moved:** 10 of the 16 production score pairs moved by exactly 1 between runs. None moved by more than 1.
- **What the student sees:** of the 8 visible cards (content and behavioral × 4 sessions), 7 changed by 1 between runs. For example, (a) was 4 "Strong" in one run and 5 in the other.
- **Ordering:** stable in every run. (a) and (c) are always ≥4, and (b) and (d) are always ≤2.

The problem is not noise. It is that **(c) never scored below (a)**. The grade cannot tell a wrong solution from a correct one, because the code is not an input.

## Notable quotes

- (b) run 2: "Responded \"dict. I'll just code it\" and did not provide complexity or data structure justification when prompted."
- (c) run 1 summary: "The candidate provided a strong technical solution… Their implementation was correct on visible test cases."
- (c) run 2 rubric: "Both visible tests passed, and reasoning for hidden case uncertainty was sound."
- (d) run 2: "Incorrectly identified a brute-force substring check as O(n) instead of O(n^2) or worse."
- (a) run 1: "Coding met all requirements and passed execution."
- (d) run 1: "did not meaningfully respond to hints". The evaluator prompt says issued hints must not change scores, but the hint arrives as an ordinary interviewer turn, so the model cannot tell it apart.

## Screenshots

All are in `/Users/ajabreu79/projects/leadership-avatar-wt/screenshots-2026-11-14/coding-report/probe/`. For each of `a-strong-correct`, `b-silent-correct`, `c-strong-wrong` and `d-weak-brute`, there are:

- `-top-1440.png`
- `-tab-overview-1440.png` and `-tab-overview-p2-1440.png`
- `-tab-content-1440.png` and `-tab-content-p2-1440.png`
- the page's text, saved as `-tab-*.txt`

## Seeded reports (student@case.edu, local dev DB)

| Session | InteractionReport id |
|---|---|
| (a) | `edb7e12c-ec21-402e-a859-59d16d98eef4` |
| (b) | `6f6b0a1f-5b64-48b3-91f9-cbed8ee47b79` |
| (c) | `ebf2a34d-fb0b-4acc-ba66-c890f1481230` |
| (d) | `f46a11b0-7721-4026-86c2-b466eac452a4` |

All four are titled "Grading probe — …". They have no `transcriptKey` and no S3 transcript, so do not use them to test retries.

## Reproduce

```
npx tsx --env-file=.env.local scripts/research/technical-coding-grading-probe.ts --runs 2 --with-code [--seed-report student@case.edu]
npx tsx --env-file=.env.local scripts/research/technical-coding-grading-probe.ts --dump-messages   # exact requests, no model calls
PROBE_IDS="a-strong-correct=<id>,…" E2E_BASE_URL=http://localhost:3124 npx playwright test --config scripts/research/playwright.probe.config.ts
```

## After (2026-11-15, loop/coding-grading)

Same four sessions, same problem, production path only (no `--with-code`), two runs each. What changed in the pipeline:

- **G1 — the evaluator sees the work.** `buildUserMessage` (`lib/engine/evaluation.ts`) has a `technical-coding` branch that renders `buildTechnicalCodingUserMessage` (`lib/technical-interview/grading.ts`): the problem (statement, constraints, examples), the target complexity, the language and file name, the visible tests, the final source in a fenced block, the hints actually issued (tier, `[m:ss]`, transcript turn), and the literal line `Execution: NOT RUN — no test results exist; do not claim any test passed or failed.` The generic `resume_text` / `role_context` envelope is gone for coding. The reference solution and hidden tests never enter the context.
- **Revised evaluator prompt** (`TECHNICAL_CODING_EVALUATOR_PROMPT`): `coding_quality` from the final code only (identical code, identical score), with anchors; correctness by hand-tracing the code against the examples and edge cases; complexity derived from the code, not the claim; `technical_communication` from the spoken process; hints never lower a score; `rubric_notes[].item` is the dimension key.
- **Post-parse guard** (`stripExecutionClaims`, run inside `validateEvaluationResult` for `kind: "technical-coding"`): drops any sentence claiming a test passed or failed, the code was "accepted", "passed execution" or "works on the hidden tests". Readings ("tracing … returns 1"), predictions ("would fail on"), reports of what the candidate said and advice are kept. Items whose title or whole body was a claim are dropped. `rubric_notes` items are normalized to dimension keys.
- **G4:** every visible turn is stamped with server time when the chat route stores it; finish uses that time. Legacy records without stamps fall back to the finish clock, as before.
- **G5:** optional `codingSteps` outcome (see shape below); quotes re-timed with `lib/engine/quote-timecodes.ts` and sanitized by `lib/report/quote-sanitizer.ts`; coaching notes run through the same guard.
- **G13:** the 48-turn cap keeps the first 12 and the last 36 turns and counts the dropped middle (`omittedVisibleTurns`, surfaced to the evaluator as a `transcript_note`).
- **G9:** the live interviewer gets the candidate's current editor code as a private block appended to the latest user message (after the cached prefix); the client now sends its source with each chat turn.

### Decision: `coding_correctness` stays null ("not run")

Recommended and implemented: keep it null. Reasons:

1. The dimension is defined as the "deterministic outcome from the final test harness". An LLM estimate stored under that name is the same fabrication this work removes, just with a number.
2. It feeds mastery (`coding_correctness` → Credibility in `lib/mastery/competencies.ts`). A misread would move a long-term competency.
3. The reading-based judgement still reaches the student: `coding_quality` caps at 3 for a real edge-case bug, and the feedback names the failing input and the line. In this probe (c) drops from 4–5 to 3 on quality and both runs say "returns 1 for the empty string … initialize best to 0".
4. The UI branch can render "Not run" with no extra contract. If the user later wants an estimate, the switch is small: stop forcing null in `evaluation-runner.ts`, ask for a value in the prompt, and write the optional `codingCorrectnessBasis: "reading"` outcome field the UI branch already reads (it would need a schema-digest re-take).

The model is told to return null; in all 8 runs it did.

### Scores, before → after

Production pipeline, run1 / run2. Before = the table above (code never reached the model).

| Session | content | behavioral | coding_quality | technical_communication | coding_correctness stored |
|---|---|---|---|---|---|
| (a) strong-correct | 4/5 → **5/5** | 4/5 → **5/5** | 4/5 → **5/5** | 4/5 → **5/5** | null → null |
| (b) silent-correct | 2/2 → **2/2** | 2/1 → **2/3** | 2/2 → **5/5** | 1/1 → **1/1** | null → null |
| (c) strong-wrong | 4/5 → **4/4** | 4/5 → **4/4** | 4/5 → **3/3** | 5/5 → **4/4** | null → null |
| (d) weak-brute | 2/1 → **2/2** | 2/1 → **2/2** | 1/1 → **2/2** | 1/1 → **2/2** | null → null |

`codingSteps` verdicts (clarify, examples/edge cases, approach, complexity, narrate, test/trace, wrap-up):

| Session | run1 | run2 |
|---|---|---|
| (a) | 7 hit | 7 hit |
| (b) | 5 partly, 2 missed | 7 missed |
| (c) | 6 hit, wrap-up partly | 6 hit, test/trace partly |
| (d) | 3 partly, 4 missed | 4 partly, 3 missed |

### Acceptance

| Check | Result |
|---|---|
| (a) above (c) on coding_quality | **Pass**: 5/5 vs 3/3 (before: 4/5 vs 4/5). Correctness is null for both by decision; the correctness gap shows in quality and in (c)'s feedback. |
| (b) low technical_communication, high coding_quality | **Pass**: 1/1 and 5/5 (before: 1/1 and 2/2). |
| (c) names the empty-string bug | **Pass**, both runs: "The code as written returns 1 for an empty input rather than the required 0, due to the initial value of 'best'" (run1); "The code returns 1 for the empty string … Initialize 'best = 0'" (run2). Run1 also names the `'abba'` stale-left bug. |
| (d) complexity stated as O(n³) | **Pass**, both runs: "The solution is O(n^3), exceeding the O(n) time requirement" (run1); "The code has O(n^3) time complexity … as all substrings are checked with a set" (run2). |
| No output claims tests ran | **Pass**: no report sentence claims a test result. The only matches for "tests pass" are the candidate's own verbatim words quoted as evidence (c's "Both visible tests pass", d's "it passed the tests"), which is allowed. The guard stripped 0 sentences in the final runs; in an earlier pair of runs with the first prompt draft it stripped 1 sentence in (a) and 1 in (b). |
| codingSteps separate (a) and (b) | **Pass**: (a) 7/7 hit in both runs; (b) 0 hits in both runs (7 missed, or 5 partly + 2 missed). |
| Timestamps differ | **Pass**: every transcript stamp is distinct (16/16, 12/12, 16/16, 15/15), growth-area timecodes vary (e.g. (d) 8:59, 20:53, 24:35), and step quotes are re-timed to the turn they came from (e.g. (d) clarify 116 s, complexity 539 s). |

Notes:

- **Prompt tuning between runs.** The first draft over-used `prompted`: (b)'s "ok" / "sliding window" were marked prompted because the interviewer had asked. The prompt now says `prompted` requires a full answer after the prompt, a few-word reply is `missed`, and a trace that reaches a conclusion the code does not support is `partly` at best. The numbers above are from the revised prompt.
- **Variance.** Scores are stable: across 32 score pairs only (b) behavioral moved (2 → 3). Step verdicts vary by one status on a few steps ((b) partly vs missed; (c) test/trace hit vs partly, because (c) traced `abcabcbb` correctly but said `""` "should return 0" when the code returns 1).
- **Hints.** (d)'s hint appears in the request as `Tier 1 at [15:41], transcript turn 10`. (d) was not marked down for using it; its low scores come from the brute force and the wrong complexity claim.
- **Corpus placeholders.** The problem block still shows the corpus placeholders ("Use the documented function signature", "See visible tests"). loop/coding-corpus owns that content; the evaluator message will pick up real constraints and examples when they land.

### `codingSteps` outcome shape (real example, (d) run1)

`outcome.codingSteps` is a JSON-encoded string, the same `ProcessStepResult[]` shape as `processSteps` and `conversationSteps`, with steps in `TECHNICAL_CODING_FRAMEWORK` order. Shown decoded:

```json
[
  { "key": "clarify", "status": "partly", "evidenceQuote": "yeah I'll just check all the substrings", "timecodeSeconds": 116, "note": "You should restate the problem and ask about inputs/outputs or clarify edge conditions before coding." },
  { "key": "examples_edge_cases", "status": "missed", "evidenceQuote": "", "timecodeSeconds": null, "note": "Work through a test input or ask about empty/single input before coding—just saying 'should handle them' is not enough." },
  { "key": "approach_before_code", "status": "partly", "evidenceQuote": "whether it has duplicates. I'll use a set", "timecodeSeconds": 317, "note": "Provide a full plan, including the main data structure and reasoning, before beginning code." },
  { "key": "complexity", "status": "partly", "evidenceQuote": "O(n), it's just loops", "timecodeSeconds": 539, "note": "Determine the true cost by detailing loop structure, including number of substrings and duplicate checks." },
  { "key": "narrate_implementation", "status": "missed", "evidenceQuote": "", "timecodeSeconds": null, "note": "Explain what each step of your code does as you write, rather than coding in silence." },
  { "key": "test_and_trace", "status": "missed", "evidenceQuote": "it passed the tests", "timecodeSeconds": 1253, "note": "Test your code aloud with concrete examples and reason about edge cases, rather than assuming it works." },
  { "key": "wrap_up", "status": "missed", "evidenceQuote": "", "timecodeSeconds": null, "note": "Summarize your approach, state the real complexity, and suggest improvements or limitations at the end." }
]
```

Statuses: `hit`, `prompted`, `partly`, `missed`, `not_applicable`. The field is optional: reports graded before it existed have no `codingSteps` key and still validate.

### Seeded reports (student@case.edu, local dev DB)

Graded with the final prompt (run1 of each session). Titled "Grading probe (after) — …". Each has `outcome.codingSteps`, `technicalEvidence` with per-turn server timestamps and the final source, and (d) has a real `TechnicalInterviewHint` row (tier 1). There is no `transcriptKey`, so do not use them to test retries.

| Session | InteractionReport id |
|---|---|
| (a) | `d87ce886-f985-477d-8a98-f1481d2a6812` |
| (b) | `11cdf224-a087-4933-aec8-0d38b5f40a25` |
| (c) | `e2280d20-444d-4c16-9a79-909cbbc97501` |
| (d) | `b5682dbb-84c5-4692-a1de-d74829ba7b67` |

The four "before" reports listed earlier are untouched.

### Reproduce (after)

```
npx tsx --env-file=.env.local scripts/research/technical-coding-grading-probe.ts --runs 2 --out scripts/research/out/technical-coding-probe-after [--seed-report student@case.edu]
npx tsx --env-file=.env.local scripts/research/technical-coding-grading-probe.ts --dump-messages --out scripts/research/out/technical-coding-probe-after
npx tsx scripts/verify-technical-evaluator-input.ts   # offline: message contents, guard, codingSteps, live code block
```
