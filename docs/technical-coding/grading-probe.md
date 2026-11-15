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
