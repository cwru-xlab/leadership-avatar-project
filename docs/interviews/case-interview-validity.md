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

### Previous configuration — score-first schema (recorded 2026-11-06)

The numbers in this subsection, in the iteration log and in the residual-variance
list below are the earlier measurement, kept for comparison. They were taken
BEFORE `buildRubricJsonSchema` moved the `outcome` object ahead of the `*_score`
properties and before the shared problem addendum gained the
`Meets all criteria:` and no-nested-quotes rules. Nothing in them has been
edited; the re-measurement is the section after them.

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

### Re-measurement, 2026-11-07 — outcome-first schema plus the shared grading rules (commit dbd25ce)

Configuration: branch `loop/case-pm-integration` at `dbd25ce`. Three things
changed together and this run measures all three at once:

1. `buildRubricJsonSchema` (`lib/engine/rubric.ts`) emits the `outcome` object
   BEFORE the `*_score` properties for every problem interview, so the model
   writes the step verdicts first and scores from them. Non-problem types are
   unchanged (`scripts/verify-rubric-schema-order.ts`).
2. The shared problem addendum (`lib/problem-interview/prompts.ts`) now carries
   two rules that used to live only in the system-design evaluator, so they
   reach the case for the first time: every step `note` must START with
   `Meets all criteria: yes.` or `Meets all criteria: no.`, judged on the
   candidate's own words alone and with the status agreeing with it; and the
   double-quote character is banned inside `evidenceQuote` and `note`.
3. The grading prefix is stripped at RENDER time only
   (`stripStepNoteGradingPrefix` in `lib/problem-interview/outcome.ts`). The
   stored outcome keeps the raw note, which is what the counts below read.

Same script, same model (`gpt-4.1`), same goldens and the same run count as the
previous configuration: 9 transcripts x 3 runs = 27 grades, from
`npx tsx --env-file=.env.local scripts/verify-case-interview-grading.ts --runs 3`.

`process_rigor` is shown as `derived (raw)`: the value the report keeps, with
the model's own number in brackets.

| Transcript | Expectation | process_rigor run 1 / 2 / 3 | quantitative | synthesis | Step pattern(s) | Pass (previous) |
|---|---|---|---|---|---|---|
| airline-strong | rigor >= 4, all hit | 5 (5) / 5 (5) / 5 (5) | 5, 5, 5 | 5, 5, 5 | HHHHHH x3 | 3/3 (3/3) |
| airline-jump | rigor <= 2; clarify, structure, analysis missed | 1 (1) / 1 (1) / 1 (1) | 1, 1, 1 | 2, 1, 2 | MMMMMM x3 | **3/3 (2/3)** |
| airline-botch | quant <= 2; synthesize missed; structure hit | 2 (2) / 2 (3) / 2 (2) | 1, 1, 1 | 2, 2, 2 | HHHHMM x3 | 3/3 (3/3) |
| airline-nudged | structure, hypothesis, synthesize prompted; rigor <= 3; synth <= 3 | 2 (3) / 2 (3) / 2 (3) | 5, 5, 5 | 3, 3, 3 | HHPPHP x3 | 3/3 (3/3) |
| retail-strong | rigor >= 4, all hit | 5 (5) / 5 (5) / 5 (5) | 5, 5, 5 | 5, 5, 5 | HHHHHH x3 | 3/3 (3/3) |
| retail-nudged | restate, clarify prompted; rest hit | 3 (3) / 3 (4) / 3 (3) | 5, 5, 5 | 5, 5, 5 | PPHHHH x3 | 3/3 (3/3) |
| hairgel-strong | rigor >= 4, all hit | 5 (5) / 5 (5) / 5 (5) | 5, 5, 5 | 5, 5, 5 | HHHHHH x3 | 3/3 (3/3) |
| hairgel-jump | rigor <= 2; scope, structure, sanity missed | 1 (1) / 1 (1) / 1 (1) | 1, 1, 1 | 2, 2, 2 | MMMMMH x3 | 3/3 (3/3) |
| hairgel-botch | quant <= 2; calculation, sanity, answer missed | 1 (2) / 1 (2) / 1 (2) | 1, 1, 1 | 2, 1, 2 | HHHMMM x3 | 3/3 (3/3) |

**27/27 grades pass, against 26/27 in the previous configuration.** The one
recorded failure is gone: `airline-jump` returned the expected all-missed
`MMMMMM` in 3 of 3 runs, where the score-first schema had returned `MPPMMP`
once. Derived `process_rigor` again did not vary across runs for any
transcript; `quantitative` did not vary at all; `synthesis` varied by 1 point on
`airline-jump` and `hairgel-botch`.

**Verdict: outcome-first helped — 27/27 against 26/27 — and it removed the one
step-pattern flake, with no expectation loosened.**

What the two newly shared rules did, measured on the stored (unstripped) notes:

- **The `Meets all criteria:` prefix did appear.** The phrase opened 162 of 162
  step notes. 159 of 162 used the mandated `yes.` / `no.` verdict, 57 of them
  saying `no.`.
- **Three notes invented a third verdict word.** `airline-nudged` run 1 wrote
  `Meets all criteria: prompted.` on `structure`, `hypothesis_prioritize` and
  `synthesize`. A spot re-check of that one golden
  (`--only airline-nudged --runs 1`, a 4th run of it) reproduced it on the same
  three steps (3 of 6 notes). `stripStepNoteGradingPrefix` only strips `yes` /
  `no`, so `Meets all criteria: prompted.` reaches the student's report
  verbatim. Residual; the wording is in a shared file and was not changed here.
- **The status-must-agree-with-the-note rule changed no verdict.** 9 of 162
  notes said `no.` while the status stayed `prompted` (`airline-nudged` runs 2
  and 3, `retail-nudged` runs 1 and 3). In each one the status was right and the
  note was wrong: the model folded "only after a nudge" into question 1 instead
  of judging the candidate's words alone. Derived `process_rigor`, the step
  patterns and every expectation were unaffected.
- **No stored step carried a double-quote character: 0 of 162.** The model's raw
  `processSteps` string nonetheless failed a strict `JSON.parse` in 4 of 27
  grades and was rescued by the engine's deterministic repair
  (`parseProcessStepsValue`); nothing was unrecoverable, so 0 of 27 grades lost
  their steps. In 2 of those 4 (`hairgel-strong` run 2, `airline-nudged` run 3)
  the repair's last-resort row reader could not read the values and dropped
  every `evidenceQuote`: 12 of 162 non-missed steps came back with an empty
  quote, so the report would show those steps with a verdict and no evidence.
  The cause, captured by the PM study's parse diagnostic on the same commit, is
  the model using single quotes as the JSON string DELIMITER
  (`"evidenceQuote": 'Before I ...'`) — an over-reading of the shared rule's
  "quote the candidate with single quotes".
- **Non-verbatim evidence quotes: 0 of 162 steps** (previously 1 of 27 grades).

**Raw vs derived `process_rigor` still disagrees, and more often than before: 8
of 27 grades** (previously 5 of 27), every time with the raw score ABOVE the
band its own steps imply — `airline-nudged` 3 runs (raw 3 against 2),
`hairgel-botch` 3 runs (raw 2 against 1), `airline-botch` run 2 (raw 3 against
2), `retail-nudged` run 2 (raw 4 against 3). Putting `outcome` first did not
make the model read its score off its own verdicts, so deriving `process_rigor`
in code stays load-bearing.

### Residuals after the 2026-11-07 run

1. `Meets all criteria: prompted.` as the prefix verdict: 3 of 162 notes,
   reproduced on re-check, and not stripped before the student sees it. Needs a
   shared-file wording change (see the hand-off note); not applied here.
2. The raw `processSteps` string needed the deterministic repair in 4 of 27
   grades, and 2 of those lost all six evidence quotes. Shared-file wording
   change; not applied here.
3. Raw `process_rigor` above the derived band in 8 of 27 grades. Contained in
   code by deriving the score from the steps; recorded, not fixed.
4. `synthesis` still varies by 1 point on `airline-jump` (1-2) and
   `hairgel-botch` (1-2).

### Confirmation run, 2026-11-07, commit `f4359f6` — `retail-nudged` REGRESSED 3/3 → 0/3

`f4359f6` reworded the shared addendum's step-1 timing rule and named the only two permitted note
openings. Re-measured on the two nudged goldens only (`--only airline-nudged,retail-nudged --runs 3`,
6 grades):

| Golden | Run | Steps | rigor | quant | synth | Result | Pre-fix |
|---|---|---|---|---|---|---|---|
| `airline-nudged` | 1 | `HHPPHP` | 2 | 5 | 3 | PASS | 3/3 |
| `airline-nudged` | 2 | `HHPPHP` | 2 | 5 | 3 | PASS | — |
| `airline-nudged` | 3 | `HHPPHP` | 2 | 5 | 3 | PASS | — |
| `retail-nudged` | 1 | `MMHHHH` | 2 | 5 | 5 | FAIL `restate_prompt=missed`, `clarify_objective=missed` (want `prompted`) | 3/3 |
| `retail-nudged` | 2 | `MMHHHH` | 2 | 5 | 5 | FAIL `restate_prompt=missed`, `clarify_objective=missed` | — |
| `retail-nudged` | 3 | `HHHHHH` | **5** | 5 | 5 | FAIL `process_rigor=5 > 3`; `restate_prompt=hit`, `clarify_objective=hit` | — |

`airline-nudged` held at 3/3. `retail-nudged` went **3/3 → 0/3**. The two nudged steps there are
`restate_prompt` and `clarify_objective`, whose `evidenceCriteria` read *"**Before any analysis**, the
candidate summarizes the client situation …"* and *"… **before laying out a structure**. Questions
asked only much later, mid-analysis, **do not make this step a hit**."* The shared carve-out
("timing alone is NOT a shortfall") now contradicts those clauses, and the model resolved the
contradiction two different, both-wrong ways:

- **Runs 1-2 — criteria win, step goes `missed`.** *"Meets all criteria: no. You restated the prompt,
  but only after the interviewer asked you to do so, making this at best prompted, but the step
  requirements specify this must come before any analysis…"* and *"… per the process, this step must
  be initiated before laying out your structure, and before a nudge from the interviewer."* The model
  has written the nudge into the criteria. This is the original defect, unrepaired.
- **Run 3 — NEW failure mode: the carve-out wins, and the model back-dates the timecode to keep
  `hit`.** Both steps came back `status: hit` with notes that still say `no`: *"Meets all criteria:
  no. Your paraphrase of the case prompt happened only after the interviewer nudged you to restate
  it, so this step was prompted, not hit unprompted."* The quotes are verbatim, but the reported
  `timecodeSeconds` were **26** and **54**, while those lines actually occur at **146** and **174** —
  after the nudges at 138 and 166. `finalizeProblemOutcome` reconciles against the timecode, so a
  back-dated stamp defeats the "a nudged step can never stay hit" safety net: derived
  `process_rigor` came out **5** against an expectation of <= 3.

Run 3 is the more serious of the two. Before `f4359f6` the note/status conflict was cosmetic — the
note said `no` while the status was correctly `prompted`. Now the same conflict can arrive with the
status `hit` *and* a falsified timecode, which inflates the student's score and is invisible to the
non-verbatim check (0 non-verbatim quotes in all 6 grades, because the words were real; only the
stamps were wrong).

**Counters over the 6 grades (36 step slots):**

| Counter | This run (nudged goldens only) | 2026-11-07 pre-fix (full study) |
|---|---|---|
| `Meets all criteria:` prefix with a `yes.`/`no.` verdict | 30/36 (9 say `no.`) | 162/162 |
| Prefix verdict other than `yes.`/`no.` | **6/36** — `airline-nudged` r1 and r3, `structure` / `hypothesis_prioritize` / `synthesize`, all `=prompted` | 3/162 |
| Notes saying `no` while the status is not `missed` | **5/36** — `airline-nudged` r2 `structure`, `hypothesis_prioritize`, `synthesize` (all `prompted`); `retail-nudged` r3 `restate_prompt`, `clarify_objective` (both **`hit`**) | 9/162 |
| Steps carrying a double-quote character | 0/36 | 0 |
| `processSteps` needing the deterministic repair | **0/6** | **4/27** |
| `processSteps` unrecoverable | 0/6 | 0/27 |
| Raw `process_rigor` above the derived band | 3/6 | 8/27 |
| Raw `process_rigor` disagreeing with the band at all | 4/6 | — |

The denominators are not comparable to the pre-fix study: that study graded all nine goldens, while
this run graded only the two nudged ones, which are exactly the goldens the rules bite on. Read the
rates as "on the exposed subset", not as a study-wide rate.

What `f4359f6` **did** fix: the delimiter clarification closed the single-quote-delimiter problem
outright — **0 of 6** grades needed the deterministic repair, against 4 of 27 before, and no grade
lost an `evidenceQuote`. That half of the change should be kept.

What it did not fix: the invented `Meets all criteria: prompted.` verdict (6 of 36 notes here) and
the note/status conflict (5 of 36), and it introduced the timecode back-dating above.

**Residuals, NOT loosened expectations.** `restate_prompt` and `clarify_objective` really should be
`prompted` on `retail-nudged`; the expectation is unchanged. No shared file was edited. The proposed
follow-up wording — question 1 must treat an ordering clause in a step's criteria as question 2's
business, plus a rule forbidding a timecode earlier than the line holding the quote — is recorded in
`docs/interviews/finance-validity.md` under the `f4359f6` confirmation run.



### Hand-off to the engine owner (shared files, NOT changed on this branch)

Both residuals above come from the shared problem addendum in
`lib/problem-interview/prompts.ts`, which is serialized across all five problem
types, so the wording below is proposed and not applied.

1. After "judged on the candidate's own words ALONE, ignoring whether a nudge
   came first." add: "Those two are the ONLY permitted openings: never write any
   other word after 'Meets all criteria:' — not 'prompted', not 'partial'.
   Whether a nudge came first is decided in question 2, not here."
2. Replace "That value is a JSON string INSIDE JSON, so never use the
   double-quote character inside "evidenceQuote" or "note" — quote the
   candidate with single quotes ('like this'), and shorten the quote rather than
   nesting one." with: "That value is a JSON string INSIDE JSON. Every key and
   every value in it must be delimited by the double-quote character, exactly as
   in the shape above, and no double-quote character may appear INSIDE a value:
   when you quote the candidate, put single quotes ('like this') around their
   words inside the value, and shorten the quote rather than nesting a double
   quote. A value delimited by single quotes, or a single nested double quote,
   invalidates the whole array and the report loses the step evidence."

## Live probes

`scripts/verify-case-interview-live.ts` uses the real `gpt-4.1` with the engine's real `buildProblemInterviewSystemPrompt`, `buildProblemProgressBlock` and `parseProblemTurn` on bank cases. Results are 2 batches × 3 runs = 6 runs per probe.

| Probe | Result |
|---|---|
| P1 airline / hair gel: no numbers volunteered when the candidate pauses | 12/12 never volunteered a number or showed an exhibit. **But** in 5/6 airline runs the interviewer immediately nudged `restate_prompt` when the candidate said "give me a second to think". A real interviewer waits, and CWRU lists "think before speaking" as a step. It costs the candidate a `hit` |
| P2 cost exhibit on request | 6/6 put the route economics on screen in words and never read the numbers aloud. The `ex2` marker was dropped in 2/6, so the exhibit would not have appeared |
| P3 neutral nudge after jumping to an answer | 6/6 spoken nudges were neutral ("Before you dive in, what's your read of what we're being asked here?"). The nudge marker was dropped in 3/6, so the nudge would go unrecorded |
| P4 fact only when asked | 6/6 gave the objective and nothing else. Several replies tacked on "anything else you'd want to know about the client?". That is the clarify nudge, given unprompted and without a marker |

These are engine prompt issues. The PM study saw the same marker dropping, and the engine worker is making the marker wording firmer. Rerun this script after that change.

### Live probes re-run, 2026-11-07 (commit dbd25ce, after the fac1cff persona hardening)

`npx tsx --env-file=.env.local scripts/verify-case-interview-live.ts --runs 3`,
run as 2 batches x 3 runs = 6 runs per probe, the same shape as the recorded
measurement above. The table above is NOT edited; this is the new reading.

| Probe | 2026-11-07 result | Previously recorded |
|---|---|---|
| P1 airline / hair gel: no numbers volunteered when the candidate pauses | 12/12 volunteered no number and revealed no exhibit. The premature nudge is unchanged: 6/6 airline runs nudged `restate_prompt` the moment the candidate said "give me a second to think", and 6/6 hair-gel runs nudged `clarify_scope` the same way. The spoken line now opens with "Take your time." first, but the nudge marker is still emitted, so the candidate still loses the `hit` | 12/12 never volunteered a number; premature `restate_prompt` nudge in 5/6 airline runs |
| P2 cost exhibit on request | 6/6 put the route economics on screen in words and read no value aloud. The `ex2` marker was dropped in 1/6 (batch 2, run 2) | marker dropped in 2/6 |
| P3 neutral nudge after jumping to an answer | 6/6 neutral wording, and the nudge marker was present in 6/6 | marker dropped in 3/6 |
| P4 fact only when asked | 6/6 gave the objective and nothing else; no run tacked on an unmarked clarify nudge | 6/6; several tacked on "anything else you'd want to know about the client?" |

29 of 30 probe runs passed; the single failure is the dropped `ex2` marker.
Marker reliability improved — 1 dropped marker in 12 marker-bearing runs,
against 5 of 12 before. Premature nudging did not improve and is now visible on
the guesstimate framework too. Both live-prompt behaviours belong to the shared
`lib/problem-interview/prompts.ts`, which this branch does not change.

## Remaining gaps

1. **Marker reliability** (engine): nudge and exhibit markers were dropped in 5 of 12 marker-bearing probe runs. A dropped exhibit marker means the exhibit never appears on screen. A dropped nudge marker means the evaluator only catches the nudge from the transcript.
2. **Premature nudging** (engine prompt): no nudge should come while the candidate is asking for a moment to think or has just started; wait until they move on without the step.
3. **Thin-reply-after-nudge** is still marked `prompted` in about 1 in 9 grades. It does not affect `process_rigor`. It could be closed in code only with a quality signal the evaluator doesn't emit today.
4. **Not simulated:** written notes and charts (CWRU step 5), group cases, mid-case feedback (excluded on purpose).
5. **Firm sources:** McKinsey and Deloitte pages could not be read directly, so their content comes from search summaries. All figures in the bank are original.
