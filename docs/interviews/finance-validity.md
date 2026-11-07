# Finance interview: validity

How the `finance` preset (investment banking, private equity, equity research) compares with a real finance interview, and how well its report grades the process and the numbers. Content lives in `lib/finance-interview/`. The machinery (live prompt, markers, exhibits, report panels, derived `process_rigor`) is the problem-interview engine (`lib/problem-interview/`, branch `loop/problem-engine`, merged into this branch).

## Sources

Retrieved 2026-11-06. Code comments cite the same list (`lib/finance-interview/sources.ts`). All companies and figures in the bank are fictional and original; guide content is paraphrased.

Grading and live studies re-measured **2026-11-07 at commit `dbd25ce`** (engine outcome-first schema
order + the shared `Meets all criteria` and no-nested-quotes rules). Earlier numbers are kept and
labelled as the previous configuration.

| Source | What we took from it |
|---|---|
| Wall Street Prep, [The Paper LBO: practice exercises](https://www.wallstreetprep.com/knowledge/the-paper-lbo-practice-exercises-to-ace-the-private-equity-interview/) | Paper LBO order: purchase TEV = EBITDA × multiple, sources & uses with equity as the plug, FCF = NI + D&A − capex − ΔNWC, exit TEV − net debt, MOIC, IRR. Rule of 72 / 115. Round to easy numbers |
| Wall Street Prep, IB accounting questions ("$10 increase in depreciation") | State the tax rate first, then income statement → cash flow → balance sheet |
| Breaking Into Wall Street, IB interview guide / 400 questions | Accounting walk-throughs, EV vs. equity value, valuation methods, DCF, merger model, LBO question types |
| Mergers & Inquisitions, [How to pitch a stock](https://mergersandinquisitions.com/bank-stock-pitch) | Recommendation first; company background; 2–3 points the market misprices; hard catalysts in 6–12 months; base / upside / downside valuation; risks and mitigants. Interviewers probe the variant view, catalyst timing, valuation inputs and what would make you wrong |
| Mergers & Inquisitions, IB / PE interview guides | "Walk me through a deal", market questions, fit + technicals format |
| Rosenbaum & Pearl, *Investment Banking* (3rd ed., 2020) | Comps, precedents, DCF, LBO analysis and returns drivers, accretion / dilution |
| Vault career guides (IB / finance interviews) | Interview format: first round, Superday |
| CFA Institute Research Challenge, judge guidelines | Pitch criteria: thesis vs. peers, financial analysis, valuation, investment risks, Q&A handling |
| Internal research memo §3.7 Finance | Format, frameworks, need for numeric-band grading |

## Content

- **Frameworks** (`lib/finance-interview/frameworks.ts`), each step with evidence criteria and a neutral nudge phrased as a question:
  - `finance-technical` (5): state the assumptions, trace it in order, put numbers on each line, check it ties, explain the intuition.
  - `finance-paper-lbo` (6): confirm the inputs, entry price and funding, project cash flow and paydown, exit value and equity, MOIC and IRR, sanity-check and name the drivers.
  - `finance-stock-pitch` (6): lead with the call, company snapshot, thesis vs. the market, catalysts, valuation behind the target, risks and what would change your mind.
  - `finance-market-deal` (6): pin down the question, lay out the facts, strategic and financial rationale, run the numbers, the other side, land a view.
- **Bank** (`lib/finance-interview/questions.ts`, server-only, registered in `lib/problem-interview/banks.server.ts`) has 14 questions:
  - 5 technicals: $10 of depreciation; debt-funded equipment after one year; EV vs. equity value bridge (exhibit); walk me through a DCF + terminal value; valuation methods + comps (exhibit).
  - 3 paper LBOs, all with exhibits: five-minute LBO (Beginner, 2.5× / ≈20%); Harbor Foods with year-by-year FCF (Intermediate, ≈2.9× / ≈24%); Crestline with fees and multiple contraction (Advanced, ≈1.2× / ≈5%; the point is that the deal fails).
  - 3 stock pitches: your own long; your own short; buy-or-short a fictional tear sheet (Cobalt Trail, target ≈ $61 via an EPS bridge, or a reasoned short).
  - 3 market / deal: accretion / dilution stock vs. debt (exhibit); higher rates and the LBO market; walk me through a deal (with a hypothetical fallback).
  - Every question states a **TOLERANCE** band in `strongAnswerNotes` (e.g. Harbor: MOIC 2.8–3.0× and IRR 22–26% strong; 2.6–3.2× / 20–28% acceptable; named errors such as ignoring interest or IRR = MOIC ÷ years are outside). Candidate-choice pitches and deals are graded on internal consistency only, since the evaluator cannot verify live market data.
  - `scripts/verify-finance-interview-bank.ts` recomputes every figure (171 checks, all pass): each LBO's entry, paydown, exit equity, MOIC and IRR; that every benchmark sits inside its own strong band; that each named error lands outside the acceptable band; DCF TV and PV; EV bridge; comps; accretion; the Cobalt EPS bridge. It also checks nudge neutrality and that the registry's import graph never reaches the bank.
- **Grading:** two extra dimensions, `technical_accuracy` and `commercial_judgment`, on top of the shared four and `process_rigor` (derived in code from the steps). `FINANCE_EVALUATOR_ADDENDUM` reuses the consulting study's techniques: the two-question step test, "a nudge only rules out hit", evidence-first key order, an arithmetic audit of every intermediate figure before any score, tolerance bands, rounding vs. error, an IRR method must name an anchor, and a cap of 3 on `commercial_judgment` when the view had to be drawn out.

## Real interview vs simulation

| Real-interview element | Our implementation | Gap |
|---|---|---|
| Fit ("why banking / why us") then technicals, ~30 min (Vault, M&I) | ~4 min fit stage, then one problem, ~25 min total | One problem per session; a real first round asks several short technicals |
| Superday: 3–6 back-to-back interviews | Not simulated | Would need a station runner (several problems per session) |
| Technicals answered out loud in order | `finance-technical` framework; facts (tax rate) only when asked | — |
| Paper LBO, pen and paper, ~10–15 min (WSP, BIWS) | Deal terms on screen; secondary inputs only when asked; graded against a tolerance band | No scratchpad: the candidate's paper is not captured |
| Excel modeling test | Not simulated | Out of scope |
| Stock pitch with probing Q&A (M&I, CFA RC) | Own-choice and tear-sheet pitches; one nudge per skipped part | The evaluator cannot fact-check real companies |
| Market / deal awareness | Three discussion prompts | Interviewer has no live news |
| Interviewer pushback on a number | Engine asks to double-check slips; never corrects | — |

## Grading study

`scripts/verify-finance-interview-grading.ts` grades 9 golden transcripts with the **registered** `finance` type (`makeProblemInterviewTypeConfig`), the real `buildProblemEvaluatorBrief` (bank from `banks.server.ts`, nudges and exhibit reveals as server events), `gpt-4.1` with the app's strict schema and `validateEvaluationResult`, then `finalizeProblemOutcome` and the derived `process_rigor`, exactly as `evaluation-runner.ts` persists them. Expectations are asserted on the derived value.

Transcripts (`scripts/fixtures/finance-interview/`): Harbor Foods LBO in five variants — **strong**, **skipped** (jumps to "3x, 25%"), **mathwrong** (good process; omits interest so MOIC 3.4×, IRR as gain ÷ years = 48%), **sloppy** (final 2.9× / ≈24% inside the band, but year-2 and year-4 FCF miscomputed by ±1.5 and cancelling, IRR with no anchor), **nudged** (inputs and drivers drawn out by nudges) — plus $10 depreciation strong / skipped and Cobalt Trail pitch strong / nudged.

### Results — PREVIOUS configuration (2026-11-06: score-first schema, finance-only addendum)

Kept for comparison with the 2026-11-07 re-measurement below. Do not read these as current.

Previous configuration, 2 runs (`--runs 2`). H = hit, P = prompted, M = missed, in framework order.

| Transcript | Expectation | process_rigor (derived) | raw model rigor | technical_accuracy | commercial_judgment | Steps | Pass |
|---|---|---|---|---|---|---|---|
| lbo-strong | all hit; rigor ≥ 4; tech ≥ 4; comm ≥ 4 | 5, 5 | 5, 5 | 5, 5 | 5, 5 | HHHHHH | 2/2 |
| lbo-skipped | inputs, cash flow, drivers missed; rigor ≤ 2; comm ≤ 3 | 1, 1 | 1, 2 | 3, 3 | 3, 3 | MHMHMM / MHMPMM | 2/2 |
| lbo-mathwrong | cash flow and returns missed; tech ≤ 2 | 1, 1 | 3, 4 | 1, 3 | 5, 5 | HHMMMH | 1/2 |
| lbo-sloppy | tech 2–3 | 5, 5 | 5, 5 | 5, 5 | 5, 5 | HHHHHH | 0/2 |
| lbo-nudged | inputs and drivers prompted; rigor 3; comm ≤ 3 | 3, 3 | 3, 3 | 5, 5 | 3, 3 | PHHHHP | 2/2 |
| dep-strong | all hit; rigor ≥ 4; tech ≥ 4 | 5, 5 | 5, 5 | 5, 5 | 5, 5 | HHHHH | 2/2 |
| dep-skipped | assumptions, numbers, tie-out missed; rigor ≤ 2; tech ≤ 2 | 1, 1 | 1, 1 | 1, 1 | 1, 2 | MMMMM | 2/2 |
| pitch-strong | all hit; rigor ≥ 4; tech, comm ≥ 4 | 5, 5 | 5, 5 | 5, 5 | 5, 5 | HHHHHH | 2/2 |
| pitch-nudged | call and risks prompted; rigor 3; comm ≤ 3 | 3, 3 | 3, 3 | 5, 5 | 3, 3 | PHHHHP | 2/2 |

**Previous: 15/18 grades pass.** Derived `process_rigor` was identical across runs for every transcript. The model's own `process_rigor` disagreed with its step verdicts in 3/18 grades (all on mathwrong / skipped, all too high, e.g. raw 4 vs. derived 1); the code derivation fixes that, as in the PM study.

### Results — CURRENT configuration (2026-11-07, commit `dbd25ce`)

Configuration being measured, versus the previous block above:
1. **Engine outcome-first** — `buildRubricJsonSchema` now emits the `outcome` object BEFORE the
   `*_score` properties for all five problem interviews. OpenAI strict `json_schema` generates keys in
   schema order, so the model decides the step verdicts first and scores from them, instead of scoring
   first and rationalizing the steps to match.
2. **Two shared grading rules**, previously only in the system-design evaluator, now in the shared
   problem addendum (`lib/problem-interview/prompts.ts`) and so reaching finance for the first time:
   (a) every step `note` must START with `Meets all criteria: yes.` / `no.`, judged on the candidate's
   own words alone, and the status must agree with the note; (b) never use the double-quote character
   inside `evidenceQuote` or `note`.

Same command as the previous block (`--runs 2`, 9 transcripts, `gpt-4.1`).

| Transcript | Expectation | rigor (derived) | raw model rigor | technical_accuracy | commercial_judgment | Steps | pass | previous |
|---|---|---|---|---|---|---|---|---|
| lbo-strong | all hit; rigor ≥ 4; tech ≥ 4; comm ≥ 4 | 5, 5 | 5, 5 | 5, 5 | 5, 5 | HHHHHH | 2/2 | 2/2 |
| lbo-skipped | inputs, cash flow, drivers missed; rigor ≤ 2; comm ≤ 3 | 1, 1 | 1, 1 | 3, 3 | 2, 3 | MHMHMM | 2/2 | 2/2 |
| lbo-mathwrong | cash flow and returns missed; tech ≤ 2 | 1, 1 | 1, 2 | 1, 2 | 2, 3 | HHMMMM / HHMMMH | **2/2** | 1/2 |
| lbo-sloppy | tech 2–3 | 3, 3 | 3, 3 | 3, 3 | 5, 4 | HHMHHH | **2/2** | 0/2 |
| lbo-nudged | inputs and drivers prompted; rigor 3; comm ≤ 3 | 3, 3 | 3, 3 | 5, 5 | 3, 3 | PHHHHP / MHHHHP | **1/2** | 2/2 |
| dep-strong | all hit; rigor ≥ 4; tech ≥ 4 | 5, 5 | 5, 5 | 5, 5 | 5, 5 | HHHHH | 2/2 | 2/2 |
| dep-skipped | assumptions, numbers, tie-out missed; rigor ≤ 2; tech ≤ 2 | 1, 1 | 1, 1 | 1, 1 | 3, 1 | MMMMM | 2/2 | 2/2 |
| pitch-strong | all hit; rigor ≥ 4; tech, comm ≥ 4 | 5, 5 | 5, 5 | 5, 5 | 5, 5 | HHHHHH | 2/2 | 2/2 |
| pitch-nudged | call and risks prompted; rigor 3; comm ≤ 3 | 3, 3 | 3, 3 | 5, 5 | 3, 3 | PHHHHP | 2/2 | 2/2 |

**Current: 17/18 grades pass, versus 15/18 previously. Outcome-first HELPED.** The gain is not a
wash of noise — it lands exactly on the two math goldens the previous configuration got wrong, and it
is mechanically visible in the step verdicts, not just in the scores:

- **`lbo-sloppy`: 0/2 → 2/2.** This is the headline result; see the dedicated section below.
- **`lbo-mathwrong`: 1/2 → 2/2.** `technical_accuracy` came in at 1 and 2 (previously 1 and 3). The
  previous configuration's gap #3 — "tech was 3 once even though both math steps were `missed`,
  because the score is written before the steps" — is the exact failure mode outcome-first removes:
  the score is now written after the verdicts. Both runs put `project_cash_flow`, `exit_equity` and
  `returns_math` at `missed`, and the score followed.
- **One regression: `lbo-nudged` 2/2 → 1/2**, and it traces to the SHARED addendum, not to finance
  content. Recorded as a residual below.

Measured on the raw grading output, across all 18 grades / 104 step objects:

| Measure | Result |
|---|---|
| Step notes starting with `Meets all criteria: yes.`/`no.` | 103 / 104 |
| Notes with an out-of-vocabulary prefix | 1 (`lbo-nudged` run 2, `drivers_sanity`: `Meets all criteria: prompted.`) |
| `processSteps` that failed to parse | **0 / 18** (previously 1 malformed in 18 in round r2) |
| `processSteps` needing the tolerant repair | 0 / 18 |
| Step strings containing a double-quote character | **0 / 104** |
| Raw `process_rigor` ≠ derived | **1 / 18** (previously 3/18): `lbo-mathwrong` run 2, raw 2 vs. derived 1 |
| Non-verbatim evidence quotes | 1 (`dep-strong`, `quantify_lines`, run 1) |

The no-nested-quotes rule did its job: zero malformed `processSteps` in 18 grades, against one in 18
in round r2. Raw-vs-derived disagreement is down to 1/18 but is not zero, and it was again *too high*
on a transcript whose math steps were all `missed` — the code derivation is still load-bearing.

### Headline finding — `lbo-sloppy` now fails the sloppy math (0/6 → 4/4)

`lbo-sloppy` is the single most important known defect in this loop: sloppy-but-in-range arithmetic
scoring `technical_accuracy` 5. It had failed **0/6 across three previous prompt rounds**. Under
outcome-first plus the status-must-agree-with-the-note rule it passes **2/2 in the main study and 2/2
in a confirmation re-check (4/4 total)**.

Exact observed values, all four runs: derived `process_rigor` **3**, raw model `process_rigor` **3**,
`technical_accuracy` **3** (the expectation is 2–3), `commercial_judgment` 5, 4, 5, 5, `content` 4, 5,
5, 5. Step pattern **HHMHHH** in all four runs — `project_cash_flow` is now **`missed`**, where the
previous configuration returned HHHHHH with `technical_accuracy` 5.

**The status-must-agree-with-the-note rule bites here.** The note admits the shortfall and the status
now follows it. Verbatim, main study run 1:

> `project_cash_flow` — status `missed` — *"Meets all criteria: no. You calculated Year 1 (52 × 0.75 = 39) correctly, but for Year 2 you did 62 × 0.75 = 45 instead of 46.5, and Year 4 was 82 × 0.75 = 63 instead of 61.5. You caught the structure but had arithmetic slips not corrected. Cumulative paydown (39 + 45 + 54 + 63 + 69 = 270) lands in the strong band, but intermediate errors not corrected means missed step."*

And re-check run 1, which is the sharpest statement of the rule doing the work:

> `project_cash_flow` — status `missed` — *"Meets all criteria: no. You provided most annual FCF figures and summed them, getting the correct cumulative debt paydown ($270M). However, while most figures are in line, Year 2: 62 × 0.75 = 46.5, but you said 45. Year 4: 82 × 0.75 = 61.5, but you said 63. These are minor arithmetic slips, but they were not caught or self-corrected. Cumulative paydown is within tolerance, but intermediate errors cap this at 'missed.'"*

Note the contrast with the previously recorded behaviour: the model still describes the slips as
"minor", but it no longer uses that to award the step `hit` — it says the errors "cap this at
`missed`". Run 2 of the re-check even names the mechanism: *"The cumulative number happens to land
inside the tolerance but from offsetting errors — both mistakes left uncorrected, so this step is
missed."*

**Residual on this golden.** `technical_accuracy` is 3, at the top of the 2–3 band, and
`commercial_judgment` is 5 in three of four runs. Previous gap #2 ("wrong numbers still earn high
commercial judgment") is therefore **not** closed by this change: the candidate's final MOIC/IRR are
in band, so the view built on them still reads as sound. The study passes because the expectation is
`technicalMin: 2, technicalMax: 3`; it is not evidence that the grader is strict here, only that it
is no longer maximally lenient.

#### Integrator TODO — deterministic numeric check for candidate-stated figures (DESIGNED, NOT IMPLEMENTED)

Scope note: designed only. Nothing in this subsection has been implemented, and implementing it
requires editing shared engine files (`lib/engine/types.ts`, `lib/engine/evaluation-runner.ts`,
`lib/problem-interview/*`), which is serialized by the orchestrator across all five problem types.

**Why a code cap keyed on step status cannot catch this case.** A cap is a function of the step
statuses, e.g. "`technical_accuracy` ≤ 2 when a math-bearing step is `missed`". That shape is
structurally unable to catch sloppy-but-in-range math, for two independent reasons:

1. **In the failure mode being guarded against, the step comes back `hit`.** The whole defect was
   HHHHHH + `technical_accuracy` 5: the model awarded the step `hit`, called the slips "rounding", and
   there was no `missed` status anywhere for a cap to key on. A cap reads statuses; when every status
   is `hit` the cap is a no-op. It cannot see into the note that says "said 45" instead of 46.5.
2. **When the status *is* `missed`, the cap is redundant and mis-targeted.** In the 2026-11-07 runs
   `project_cash_flow` is `missed`, so a cap would now fire — but it would clamp
   `technical_accuracy` to ≤ 2 on a transcript whose *final answer is correct and in band*
   (2.9× / ~24%). That is the wrong grade for the wrong reason: the arithmetic slips offset, so the
   candidate is sloppy, not wrong. And the cap's firing is contingent on the model's status verdict,
   which is the very thing that flaked for three rounds. A cap keyed on status inherits all of the
   model's non-determinism; it adds no independent signal.

In short: a status cap can only amplify a verdict the model already reached. The defect is that the
model reaches the *wrong* verdict from a note that contains the right evidence. Fixing that needs a
signal computed outside the model.

**The fix: a deterministic numeric checker over candidate-stated figures.** The check is fully
determined by the transcript and the question's own benchmark arithmetic, so it returns the same
answer every run regardless of the evaluator model.

Sketch of the checker:
- Parse arithmetic claims of the form `A <op> B is/= C` out of the candidate's turns (the fixture
  says things like "62 times 0.75 is 45", "82 times 0.75 is 63"), normalising spoken operators
  ("times", "minus", "plus", "over") and magnitudes ("$1,000 million").
- Recompute each claim and compare with the candidate's stated `C` at a declared relative tolerance
  (the bank already states a `TOLERANCE:` band per question, so the convention exists).
- Emit a count of **uncorrected stated-figure errors** — "uncorrected" meaning the candidate never
  restates a corrected value for the same quantity later in the transcript.
- `lbo-sloppy` yields exactly 2 (year 2: 45 vs. 46.5; year 4: 63 vs. 61.5), independent of what the
  model says about them. `lbo-strong` and `lbo-nudged` yield 0. `lbo-mathwrong` yields a larger count
  plus a final answer outside the band.

**What the hook would need to receive to work.** `postProcessScores` today receives only
`(scores, { terminationReason, outcome })` — see `lib/engine/types.ts`. There is no
`postProcessScores` on the problem-interview factory at all, and even if one were added, that
signature is insufficient: `outcome` carries the model's `processSteps`, which is the compromised
signal. The hook would need, in addition:

1. **The transcript turns** (or a pre-computed checker result derived from them) — the hook currently
   cannot see the candidate's words, so it cannot know 45 ≠ 46.5. This is the essential addition.
2. **The question's benchmark figures and declared tolerance band**, from the server-only bank, so the
   recompute has something authoritative to compare against. The hook cannot import the bank
   (`banks.server.ts` is deliberately outside the registry's import graph), so these must be passed
   in.
3. **A structured checker result**, not raw text: `{ statedFigureErrors: number; correctedCount: number; finalAnswerInBand: boolean }`. Keeping the parse outside the hook keeps the hook pure and
   testable, which is what `postProcessScores` is documented to be.

The rule it would then apply: `technical_accuracy` ≤ 3 when `statedFigureErrors > 0`, and ≤ 2 when
the final answer is also outside the band. `commercial_judgment` ≤ 3 when `finalAnswerInBand` is
false, which is the deterministic version of previous gap #2. Both must respect the documented
`postProcessScores` contract — never introduce a score where the model returned null, and never lower
a dimension it was not asked to cap.

Cheaper partial alternative, if the transcript cannot be plumbed through: have the evaluator return
the uncorrected-error count as a declared **outcome field** (a number), then cap on that. It is
deterministic in the hook but still model-reported upstream, so it only moves the flake rather than
removing it. Recorded as a fallback, not a recommendation.

### Residual — `lbo-nudged` regression, traced to a SHARED file (NOT fixed here)

`lbo-nudged` went 2/2 → 1/2. Both failures are about a step that *fully met its criteria but only
after a nudge* — i.e. a legitimate `prompted`. The shared addendum's note prefix offers the model only
`yes` / `no`, while the step vocabulary has four statuses, so a genuine `prompted` has no truthful
prefix available. The model resolved that conflict differently in each run, and both resolutions are
wrong:

- **Main study, run 2: `confirm_inputs` = `missed`, expected `prompted`** (the only failing grade of
  18). Verbatim note: *"Meets all criteria: no. You dove into calculations before checking the key
  inputs, and only asked after the interviewer prompted it at 1:40 — so this step is missed, not
  prompted."* The model wrote `no` because the work was not unprompted, then applied
  "status must agree with the note" literally and set `missed`. That erases the distinction between
  `prompted` and `missed` for exactly the case `prompted` exists to describe.
- **Re-check run 2: `commercial_judgment` = 4, expected ≤ 3.** The comm cap keys on the nudge for the
  step holding the view; `drivers_sanity` was `prompted`, so the cap should have fired.
- **Out-of-vocabulary prefix, twice.** Main study run 2 and re-check run 1 both emitted
  `"Meets all criteria: prompted. …"`. `stripStepNoteGradingPrefix` only strips `yes`/`no`, so this
  prefix survives into the rendered report and the student sees the grading mechanism.

Re-checked twice per the stopping rule (`--only lbo-sloppy,lbo-nudged`, 2 runs): 1/2 again, failing on
a different assertion each time. The expectation has **not** been loosened — `confirm_inputs` really
should be `prompted` on this transcript.

**Diagnosis: shared file, not finance content.** The cause is the wording in
`buildProblemEvaluatorRules` in `lib/problem-interview/prompts.ts`, which (a) restricts the prefix to
`yes`/`no` while three statuses can follow a `yes`, and (b) lists "only after" among the phrases that
force `missed`, which directly contradicts the definition of `prompted` two paragraphs later
("prompted: they fully met the criteria, but only after the interviewer's nudge"). Analytics is
exposed to the same wording. **No shared file was edited.** The proposed exact wording is recorded for
the orchestrator to serialize across all five types; see the integrator note immediately below.

#### Proposed shared-addendum wording (NOT applied — orchestrator serializes this)

In `lib/problem-interview/prompts.ts`, in step 1 of "GRADING THE PROCESS", replace:

> The status must agree with the note: if the note says any required element
> was absent or thin ("did not", "no explicit", "partial", "only after",
> "stayed general"), the status is "missed", nudged or not.

with:

> The status must agree with the note: if the note says any required element was absent, thin or
> wrong ("did not", "no explicit", "partial", "stayed general"), the status is "missed", nudged or
> not. Timing alone is not a shortfall: "only after the nudge" describes WHEN the candidate met the
> criteria, not whether they met them, and is resolved in question 2 below — never write "Meets all
> criteria: no." for a step whose only defect is that it came after a nudge.

and in the `processSteps` key description, replace:

> "note": "Meets all criteria: yes. Then one sentence of coaching for this step, addressed to the candidate as you."}]

with:

> "note": "Meets all criteria: yes. Then one sentence of coaching for this step, addressed to the candidate as you."}]
>   The note must open with exactly "Meets all criteria: yes." or "Meets all criteria: no." — those
>   two are the only permitted openings. Never write a status there ("Meets all criteria: prompted.")
>   or any other word: that answers question 1, which is about the criteria only, and the report
>   strips exactly these two forms before the student sees the note.

Rationale for each half: the first removes the contradiction that makes a legitimate `prompted`
unwritable, which is what produced `confirm_inputs = missed`; the second closes the
out-of-vocabulary prefix that `stripStepNoteGradingPrefix` cannot strip. Both are generic to every
problem interview, which is why they belong in the shared addendum and are not patched into the
finance addendum.

### Iteration log (same 9 transcripts)

| Round | Change | Pass |
|---|---|---|
| r0 (1 run) | First addendum (two-question test, evidence-first, tolerance, comm cap for "call / takeaway" nudges) | 7/9 — sloppy tech 5; nudged LBO comm 4 (view came after the drivers nudge, not covered by the cap) |
| r1 (2 runs) | Arithmetic audit before any score; cap covers the nudge for whichever step holds the view | 16/18 — only sloppy fails (tech 5) |
| r2 (2 runs) | "Rounding vs. error" rule; IRR method must name an anchor | 14/18 — sloppy 0/2; mathwrong 1/2 (note said "omitted interest" but status hit); nudged 1/2 (processSteps JSON malformed once) |
| r3 (2 runs, final before `dbd25ce`) | Status must agree with any shortfall in the note; tech 4–5 requires zero uncorrected intermediate errors; per-year FCF in the step criteria | 15/18 |
| r4 (2 runs, 2026-11-07, `dbd25ce`) | No finance-content change. Engine outcome-first schema order; the `Meets all criteria` prefix and no-nested-quotes rules moved into the SHARED addendum | **17/18** — sloppy 2/2 (was 0/2); mathwrong 2/2 (was 1/2); nudged 1/2 (regression, shared-file wording) |

r1 and r3 are within run-to-run noise of each other; the later rules are kept because they state the intended grading correctly. r4 is the first round whose gain is not noise: it moved the two math goldens that every prior round of prompt wording failed to move, and the step verdicts changed with the scores.

### Residual gaps

Recorded against the PREVIOUS configuration (2026-11-06). The 2026-11-07 status of each is noted
inline; see the current-configuration section above for the measurements behind those notes.

1. **Sloppy-but-in-band math is not caught (0/6 across r1–r3).** gpt-4.1's notes literally say "year 2: 62 × 0.75 = 46.5, said 45", then call it "rounding" and give `technical_accuracy` 5 and the step `hit`. Prompt wording did not move it. A real interviewer would mark this down. Options: a code cap (see integrator TODOs) cannot detect it either, because the step comes back `hit`; a deterministic numeric checker over candidate-stated figures, or a stronger evaluator model, would. — **2026-11-07: CLOSED on the pass count (4/4).** `project_cash_flow` now comes back `missed` and `technical_accuracy` is 3. The deterministic checker is still the right fix for the general case; see the Integrator TODO above.
2. **Wrong numbers still earn high commercial judgment.** lbo-mathwrong concludes "48% blows through the hurdle — definitely do it" and gets `commercial_judgment` 5 both runs: the view is consistent with the candidate's own (wrong) numbers. Defensible under the rubric as written, but arguably the view should be capped when the key figure it rests on is outside tolerance. — **2026-11-07: IMPROVED on mathwrong, OPEN in general.** `lbo-mathwrong` comm came in at 2 and 3 (previously 5, 5). But `lbo-sloppy` still scores comm 5 in three of four runs, so the gap persists wherever the final figure lands in band. Deterministic fix designed above.
3. **`technical_accuracy` on mathwrong was 3 once** even though both math steps were `missed` — the score is written before the steps. A code cap (tech ≤ 2 when a math-bearing step is missed) would make this deterministic. — **2026-11-07: CLOSED by outcome-first.** The score is now written after the verdicts; mathwrong tech came in at 1 and 2 across both runs, and the golden went 1/2 → 2/2. This is the clearest single piece of evidence that outcome-first works as intended.
4. **A step marked `prompted` with no nudge** (lbo-skipped, 1 run). Harmless for the derived score (counted, not missed), but the report would say "after a prompt". — **2026-11-07: not observed.** `lbo-skipped` returned MHMHMM in both runs.
5. **Malformed `processSteps` once in r2** (1/18): the report would fall back to the model's raw `process_rigor`. — **2026-11-07: not observed, 0/18.** No step string contained a double-quote character (0/104), so the shared no-nested-quotes rule appears to be doing the work it was added for.
6. **NEW (2026-11-07): a legitimate `prompted` can be graded `missed`, and an out-of-vocabulary note prefix can reach the student.** `lbo-nudged` 2/2 → 1/2. Traced to shared wording in `lib/problem-interview/prompts.ts`; not fixed here. Full evidence and the proposed exact wording are in the regression section above.


## Live probes

`scripts/verify-finance-interview-live.ts` runs `gpt-4.1` against the real `buildProblemInterviewSystemPrompt` (finance persona) + `buildProblemProgressBlock`, parsed with `parseProblemTurn`. Two batches × 2 runs; the second batch is after adding "say only that it is on their screen; never read its figures aloud" to every exhibit's reveal condition.

| Probe | Batch 1 (before reveal wording) | Batch 2 (final) |
|---|---|---|
| P1 Harbor: no numbers volunteered while the candidate sets up | 2/2 pass; nudged `confirm_inputs` immediately 2/2 | 2/2 pass; nudged immediately 1/2 |
| P2 projections exhibit on request, not read aloud | 1/2 — read all five EBITDA figures aloud once | **2/2** — marker present, nothing read aloud |
| P3 neutral nudge on a jump to "3x, 25%" | 1/2 — marker dropped once | 0/2 on the strict word check: "step by step" (idiom) and "your key assumptions" + a second question naming the entry price and funding |
| P4 only the fact asked (tax rate) | 2/2 | 2/2 |
| P5 own-choice pitch: no facts or thesis about the candidate's company | 2/2 (once listed "call, target, horizon" — a mild structure hint) | 2/2 |

Engine-level issues (same as the consulting and PM studies): premature nudging while the candidate asks for a moment (3/4), occasional dropped nudge markers (1/4), and a nudge that is two questions and leans toward the next step (P3). The content fix for reading exhibits aloud worked.

### Batch 3 — 2026-11-07, commit `dbd25ce` (2 runs)

`dbd25ce` does not touch the live prompt (it changes the evaluator schema order and the shared
evaluator addendum), so this batch is a no-regression confirmation. The live persona under test is the
one hardened in `fac1cff`.

**10 of 10 probe runs passed** (previous batch 2: 7 of 10 on the strict checks, with P3 failing 0/2).

| Probe | Batch 2 (previous) | Batch 3 (2026-11-07) |
|---|---|---|
| P1 Harbor: no numbers volunteered while the candidate sets up | 2/2 pass; nudged immediately 1/2 | 2/2 pass; **nudged `confirm_inputs` immediately 2/2** |
| P2 projections exhibit on request, not read aloud | 2/2 — marker present, nothing read aloud | **2/2** — `ex2` marker present both runs, nothing read aloud |
| P3 neutral nudge on a jump to "3x, 25%" | 0/2 on the strict word check | **2/2** |
| P4 only the fact asked (tax rate) | 2/2 | 2/2 |
| P5 own-choice pitch: no facts or thesis about the candidate's company | 2/2 | 2/2 |

Against the two recorded observations specifically:
- **P1 ("no numbers volunteered while the candidate sets up") — still 2/2 pass, and the premature
  nudge is now 2/2 rather than 1/2.** Both runs replied "Take your time. Before you start, is there
  anything you'd want to know?" with a `confirm_inputs` nudge marker attached. It volunteers no
  numbers, so the probe passes, but it burns the `confirm_inputs` nudge while the candidate is still
  setting up — which is the engine-level premature-nudging issue, now observed in 2 of 2 rather than
  1 of 2. Recorded as a worsened residual, not a failure.
- **P2 ("projections exhibit on request, not read aloud") — holds at 2/2.** The marker was present in
  both runs and none of the five EBITDA figures (110/120/130/140/150) was read aloud. The batch-1
  defect (reading all five aloud once) did not recur.
- **P3 improved from 0/2 to 2/2.** Run 1 nudged with "How's the deal paid for?" and run 2 with
  "Before you start, is there anything you'd want to know?" — both short, single-question, and free of
  the banned words that failed batch 2.

Residual: **dropped nudge markers, 3 of 10 probe runs** (run 1 P3, run 1 P5, run 2 P5). The
`inferUnmarkedActions` verbatim fallback rescued all three, which is why they are observations rather
than failures, but in production the marker is the thing the server records. Unchanged in kind from
the earlier batches.


## Remaining gaps

1. Sloppy in-band arithmetic: **the pass count is fixed (4/4 on 2026-11-07)**, but the fix is prompt-mediated, so a deterministic numeric check over candidate-stated figures is still wanted for the general case. Designed, not implemented — see the Integrator TODO above. `commercial_judgment` on in-band-but-sloppy work is still 5 in three of four runs.
2. A legitimate `prompted` can be graded `missed`, and `Meets all criteria: prompted.` can reach the student's report. Shared-file wording in `lib/problem-interview/prompts.ts`; proposed wording recorded above, not applied.
3. Engine live prompt: premature nudges (2/2 on P1 as of 2026-11-07); occasional dropped markers (3/10 probe runs, all rescued by the verbatim fallback). Nudges that hint at structure were not observed in batch 3.
4. No scratchpad: paper-LBO working is only what the candidate says aloud.
5. One problem per session: a real first round or Superday asks several technicals; a station runner would cover that.
6. Candidate-choice pitches and deals cannot be fact-checked; graded on internal consistency only.

## How to re-run

```
npx tsx scripts/verify-finance-interview-bank.ts
npx tsx --env-file=.env.local scripts/verify-finance-interview-grading.ts --runs 2
npx tsx --env-file=.env.local scripts/verify-finance-interview-live.ts --runs 2
```

