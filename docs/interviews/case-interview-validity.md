# Consulting case interview: validity

How the upgraded `consulting` preset compares with a real case interview, and how well its report grades the process. Content lives in `lib/case-interview/`. The machinery (live prompt, markers, exhibits, report panels) is the problem-interview engine (`lib/problem-interview/`, branch `loop/problem-engine`).

## Sources

Retrieved 2026-11-06. Code comments cite the same list (`lib/case-interview/sources.ts`).

| Source | What we took from it |
|---|---|
| CWRU Career Center, [Case-Style Interviews](https://case.edu/studentlife/careercenter/career-development/career-resources/tips-job-seekers/interviewing/case-style-interviews) (primary) | Three question types (brainteasers, business scenarios, guesstimates); Vault's 8 scenario types; the 9 candidate steps; evaluation criteria (leadership, analytical ability, presentation, energy; clear logic; realistic assumptions); the Cleveland–New York airline, hair-gel-in-Ohio, CDs-sold and manhole-cover examples |
| Bain, [Case interview preparation](https://www.bain.com/careers/hiring-process/case-interview/) | Clarify the objective, use a framework, think aloud, highlight key numbers, adapt to interviewer cues; "interviewers provide all the materials"; Coffee Shop Co. and FashionCo. practice cases (premises only; figures are ours) |
| BCG, [Case Interview Preparation](https://careers.bcg.com/global/en/case-interview-preparation) | Assesses structuring, thoughtful questions, data analysis and quick math, identifying the most important factors, clear logic |
| McKinsey, [Interviewing](https://www.mckinsey.com/careers/interviewing) and its practice cases | Interviewer-led problem-solving interview; Electro-Light/SuperSoda (new product), Beautify, Diconsa. The pages time out for automated readers, so we relied on search summaries of the official pages |
| Oliver Wyman, [Interview preparation](https://www.oliverwyman.com/careers/entry-level/interview-preparation.html) | Treat the interviewer as the client; restate the problem; state assumptions; use numbers and double-check them; recommend |
| Deloitte case prep tool | Linked from the CWRU page; the URL now redirects to the Deloitte careers home, so we could not read it. Third-party summaries describe commercial and federal practice cases. Not used for content |
| [CaseInterview.com](https://www.caseinterview.com/) (Victor Cheng) | 3–4 core frameworks (profitability, business situation, M&A, capacity); hypothesis-driven approach |
| [CaseQuestions.com](https://casequestions.com/) (Marc Cosentino, *Case in Point*) | Summarize, verify the objective, clarify, then structure (from the book's well-known system; the site itself only advertises it) |

**Interviewer-led vs candidate-led.** At Bain and BCG the candidate drives the case and decides what to ask for. At McKinsey the interviewer moves the candidate through set questions. The simulation is candidate-led by default. Its one neutral nudge per skipped step works the way an interviewer-led firm moves a candidate along, so both styles show up in a session.

## Content

- **Frameworks** (`lib/case-interview/frameworks.ts`):
  - `case-business` has 6 steps: play back the problem, clarify the objective, lay out a structure, prioritize with a hypothesis, analyze the data, recommend and synthesize.
  - `case-guesstimate` has 6 steps: scope, break the estimate down, state assumptions, calculate aloud, sanity-check, commit to an answer.
  - `case-brainteaser` has 3 steps: check the setup, reason aloud, conclude and check.
  - Each step has evidence criteria for the evaluator and a neutral nudge phrased as a question. Static checks confirm that no nudge names its step or the method.
- **Bank** (`lib/case-interview/cases.ts`, server-only) has 16 cases:
  - 9 business scenarios covering all 8 Vault types: airline route (new geographic market), outdoor retailer (falling profits), sports drink (new product), heat pumps and campus coffee shop (new market), distribution-center site (facility location), car-wash chain (M&A), discount grocer (competitive response), beverage tax (regulatory change).
  - 4 guesstimates: hair gel in Ohio, pickleball paddles, US smartphones, drive-thru kiosk.
  - 3 brainteasers: manhole covers, clock hands, water jugs.
  - Difficulty runs from Beginner to Advanced.
  - Every business case has 1–2 exhibits. Every math-bearing case states a **TOLERANCE** band in `strongAnswerNotes`, for example "benchmark ≈ $40M; $20–80M strong; within 3× acceptable; more than 3× off with no sanity check is weak".
  - `scripts/verify-case-interview-bank.ts` recomputes every benchmark figure from the exhibits and facts (206 checks incl. shape and math, all pass).
- **Grading:** two extra rubric dimensions, `quantitative` and `synthesis`, on top of the shared four and `process_rigor`. `CASE_EVALUATOR_ADDENDUM` sits on top of the engine's shared rules and adds:
  - a two-question procedure for each step;
  - evidence-first key order inside `processSteps`;
  - re-checking the candidate's arithmetic;
  - grading `quantitative` against the tolerance band;
  - capping `synthesis` at 3 when the recommendation had to be asked for;
  - what content and behavioral mean in a case.

## Real interview vs simulation

| Real-interview element | Our implementation | Gap |
|---|---|---|
| Fit question (~10 min at BCG) before the case | ~3 min fit stage, one follow-up | Shorter than at a firm; fine for practice |
| Interviewer reads a case prompt | Prompt from the bank, posed close to verbatim | — |
| Candidate plays back the problem and asks clarifying questions (CWRU steps 1–2, Oliver Wyman, Cosentino) | `restate_prompt` and `clarify_objective` steps. Facts are released only when asked (P1/P4 probes: 0 volunteered numbers in 18 probe runs) | — |
| Structure / issue tree, prioritize (CWRU step 3, Bain, BCG) | `structure` and `hypothesis_prioritize` steps | No whiteboard. The candidate speaks the structure; there is no drawn tree |
| Think before speaking (CWRU step 4) | Not a graded step | **Gap:** the live interviewer nudged a candidate who asked for a moment to think in 5 of 6 runs (see Live probes) |
| Chart or write as you go (CWRU step 5) | Not captured (paper only) | No notes channel. The briefing tells candidates to have pen and paper |
| Interviewer hands over exhibits | On-screen exhibit, revealed by marker when the candidate asks (P2: right exhibit 4/6, never read aloud 6/6) | The marker was sometimes dropped (see below) |
| Mental math, no calculator (CWRU step 6, BCG) | `analyze_data` / `calculate_aloud` steps; `quantitative` graded against tolerance | — |
| Watch the clock (CWRU step 7) | Engine progress note asks for a recommendation when time runs short | Not graded |
| Summarize / recommend (CWRU step 8, Oliver Wyman, McKinsey "what would you tell the CEO") | `synthesize` step and `synthesis` score; a recommendation that had to be asked for scores at most 3 | — |
| Take feedback (CWRU step 9) | Not simulated: the interviewer never gives feedback mid-case | Intentional (user decision: never coach) |
| Interviewer's neutral push when a step is skipped | One nudge per step, recorded as a server event; a nudged step can never be `hit` | — |
| Evaluation: leadership, analysis, presentation, energy (Vault) | Analysis → `quantitative` + `process_rigor`; presentation → `content`; energy/leadership/composure → `behavioral` | Energy is only judged from the transcript, plus vocal/visual metrics when captured |
| Brainteasers | 3 in the bank, 3-step framework | Few firms still use them; kept because the CWRU page lists them |
| Group case interviews | Not simulated | Out of scope |

## Grading study

`scripts/verify-case-interview-grading.ts` uses the real model: `gpt-4.1`, with the app's strict schema and `validateEvaluationResult`. It grades 9 golden transcripts under `scripts/fixtures/case-interview/`:

- 3 cases: airline (business), retailer (business), hair gel (guesstimate).
- 4 variants: **strong** (every step, modeled on the firms' good-answer walk-throughs), **jump** (straight to an answer), **botch** (good structure, wrong math, no final answer), **nudged** (interviewer nudges recorded as server events).

The final numbers below are from **engine mode**. That means a scratch merge of this branch with `loop/problem-engine` at `c3365be`, with `consulting` registered through the real `makeProblemInterviewTypeConfig`, the real `buildProblemEvaluatorBrief` and the real `postProcessScores`. `process_rigor` is the value after the code ceiling from the step results, as the PM study recommended.

Step pattern key: H = hit, P = prompted, M = missed, in framework order.

| Transcript | Expectation | process_rigor (3 runs) | quantitative | synthesis | Step pattern(s) | Pass |
|---|---|---|---|---|---|---|
| airline-strong | rigor ≥ 4, all hit | 5, 5, 5 | 5, 5, 5 | 5, 5, 5 | HHHHHH | 3/3 |
| airline-jump | rigor ≤ 2; clarify, structure, analysis missed | 1, 1, 1 | 1, 1, 1 | 2, 2, 2 | MMMMMM ×2, MPPMMP ×1 | 2/3 |
| airline-botch | quant ≤ 2; synthesize missed; structure hit | 2, 2, 2 | 1, 1, 1 | 2–3 | HHHHMM | 3/3 |
| airline-nudged | structure, hypothesis, synthesize prompted; rigor ≤ 3; synth ≤ 3 | 2, 2, 2 | 5, 5, 5 | 3, 3, 3 | HHPPHP | 3/3 |
| retail-strong | rigor ≥ 4, all hit | 5, 5, 5 | 5, 5, 5 | 5, 5, 5 | HHHHHH | 3/3 |
| retail-nudged | restate, clarify prompted; rest hit | 3, 3, 3 | 5, 5, 5 | 5, 5, 5 | PPHHHH | 3/3 |
| hairgel-strong | rigor ≥ 4, all hit | 5, 5, 5 | 5, 5, 5 | 5, 5, 5 | HHHHHH | 3/3 |
| hairgel-jump | rigor ≤ 2; scope, structure, sanity missed | 1, 1, 1 | 1, 1, 1 | 2, 2, 2 | MMMMMH | 3/3 |
| hairgel-botch | quant ≤ 2; calculation, sanity, answer missed | 1, 1, 1 | 1–2 | 2, 2, 2 | HHHMMM | 3/3 |

**Final run: 26/27 grades pass.** The derived `process_rigor` never varied by more than 0 points across runs for any transcript. `quantitative` and `synthesis` varied by at most 1 point.

### Iteration log

- **Mirror mode, first addendum: 4/9 pass.**
  - Thin replies to a nudge were marked `prompted`.
  - Wrong arithmetic (1.2M × 6 = "72M") was marked `hit`.
  - "Lists sources of uncertainty" was counted as a sanity check.
  - A prompted recommendation scored synthesis 4–5.
  - The model's raw `process_rigor` exceeded the guide band in 3/9 grades.
- **Fixes that worked:**
  - A two-question procedure per step: does the evidence fully meet the criteria (if not, `missed`), then was it nudged first (if so, `prompted`).
  - "A nudge only rules out hit".
  - Evidence-first key order in `processSteps` (`key, evidenceQuote, note, status, …`), so the verdict follows the evidence.
  - Explicit arithmetic re-checking in the step criteria and in `quantitative`.
  - "A sanity check compares against an independent number".
  - Synthesis capped at 3 when the recommendation was asked for.
  - A code ceiling on `process_rigor`. Without it, the model's raw `process_rigor` sat above its own step verdicts in 5/27 final grades (it writes the score before the `outcome` object in schema order).
- **Fixture fix:** the retail-nudged structure turn was made explicit. The terse version was graded, defensibly, as partial.
- **Mirror mode after fixes: 26/27.** Engine mode final: 26/27.

### Residual variance

- **airline-jump, 1 in 3 runs:** a one-line reply to the structure and clarify nudges was still marked `prompted`. The derived rigor stays 1 because other steps were missed, so the score is unaffected, but the report would show "after a prompt" instead of "missed" for those two steps.
- **airline-botch synthesis:** scored 2 or 3. The candidate does conclude "very achievable" from the wrong math, so 3 is arguable.
- **Evidence quotes:** 1 of 27 grades had a quote that was not verbatim (in `state_assumptions`).

## Live probes

`scripts/verify-case-interview-live.ts` uses the real `gpt-4.1` with the engine's real `buildProblemInterviewSystemPrompt`, `buildProblemProgressBlock` and `parseProblemTurn` on bank cases. Results are 2 batches × 3 runs = 6 runs per probe.

| Probe | Result |
|---|---|
| P1 airline / hair gel: no numbers volunteered when the candidate pauses | 12/12 never volunteered a number or showed an exhibit. **But** in 5/6 airline runs the interviewer immediately nudged `restate_prompt` when the candidate said "give me a second to think". A real interviewer waits, and CWRU lists "think before speaking" as a step. It costs the candidate a `hit` |
| P2 cost exhibit on request | 6/6 put the route economics on screen in words and never read the numbers aloud. The `ex2` marker was dropped in 2/6, so the exhibit would not have appeared |
| P3 neutral nudge after jumping to an answer | 6/6 spoken nudges were neutral ("Before you dive in, what's your read of what we're being asked here?"). The nudge marker was dropped in 3/6, so the nudge would go unrecorded |
| P4 fact only when asked | 6/6 gave the objective and nothing else. Several replies tacked on "anything else you'd want to know about the client?". That is the clarify nudge, given unprompted and without a marker |

These are engine prompt issues. The PM study saw the same marker dropping, and the engine worker is making the marker wording firmer. Rerun this script after that change.

## Remaining gaps

1. **Marker reliability** (engine): nudge and exhibit markers were dropped in 5 of 12 marker-bearing probe runs. A dropped exhibit marker means the exhibit never appears on screen. A dropped nudge marker means the evaluator only catches the nudge from the transcript.
2. **Premature nudging** (engine prompt): no nudge should come while the candidate is asking for a moment to think or has just started; wait until they move on without the step.
3. **Thin-reply-after-nudge** is still marked `prompted` in about 1 in 9 grades. It does not affect `process_rigor`. It could be closed in code only with a quality signal the evaluator doesn't emit today.
4. **Not simulated:** written notes and charts (CWRU step 5), group cases, mid-case feedback (excluded on purpose).
5. **Firm sources:** McKinsey and Deloitte pages could not be read directly, so their content comes from search summaries. All figures in the bank are original.
